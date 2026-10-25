// Case file (T53): every problem on a grant, built from what the agents and
// the module already recorded. Nothing here decides anything; it joins records
// from different places (status events, sources, orders, approvals, invoices,
// requests, papers, holds) so one card shows which records conflict.
import type { Db, Decision, Grant, Hold, Invoice, Order, PurchaseRequest, ReportPaper, StatusEvent } from '../data/types'
import { money, type Tone } from '../ui'
import { requesterLabel } from '../people'

export type CaseKind = 'funding' | 'spend' | 'invoice' | 'purchase' | 'report' | 'payment_request' | 'other'
/** needs_you: waiting for the grant manager; stopped: an agent refused or held it under a rule
 *  with nothing to decide; noted: worth knowing, not held; decided: closed, with the decision. */
export type CaseStatus = 'needs_you' | 'stopped' | 'noted' | 'decided'

export interface CaseRecord { label: string; value: string; tone?: Tone; href?: string }

export interface Case {
  id: string
  grantId: string
  kind: CaseKind
  status: CaseStatus
  day: string
  title: string
  /** What doesn't add up, in one or two sentences. */
  conflict: string
  /** The records involved, each from the place it lives. */
  records: CaseRecord[]
  timeline: { day: string; what: string }[]
  /** What would make the records agree. */
  missing?: string
  rules: { rule: string; detail: string; auditCase?: string }[]
  next: { text: string; href: string }
  decision?: Decision
}

const byDay = <T extends { day: string }>(a: T, b: T) => a.day.localeCompare(b.day)
const INBOX = { text: 'Decide it in the Inbox', href: '#inbox' }

const statusOfHold = (h: Hold | undefined, fallback: CaseStatus): CaseStatus =>
  h ? (h.decision ? 'decided' : 'needs_you') : fallback

function latestApproval(db: Db, orderId: string) {
  return db.approvals.filter(a => a.orderId === orderId).sort(byDay).at(-1)
}

function orderRecord(o: Order): CaseRecord {
  const state = o.state === 'canceled' ? `canceled on ${o.canceledOn ?? '?'}`
    : o.state === 'changed' ? `changed to ${money(o.changedAmount ?? o.amount)}`
    : o.state
  return { label: `Order ${o.id}`, value: `${money(o.amount)} from ${o.vendor}, placed ${o.placed}, ${state}`, tone: o.state === 'canceled' ? 'bad' : o.state === 'changed' ? 'warn' : undefined, href: '#invoices' }
}

const requestGrant = (r: PurchaseRequest) => r.chargedGrantId ?? r.grantId

// ── Funding: frozen grants, reopened grants, open flags ──────────────────────

function fundingCases(db: Db, g: Grant, holds: Hold[]): Case[] {
  const out: Case[] = []
  const events = db.statusEvents.filter(e => e.grantId === g.id).sort(byDay)
  const flags = db.flags.filter(f => f.grantId === g.id && f.open)
  const latest = new Map<string, { status: string; day: string }>()
  for (const r of db.sourceReadings.filter(r => r.grantId === g.id).sort(byDay)) latest.set(r.source, r)
  const disagree = new Set([...latest.values()].map(r => r.status)).size > 1

  const lastUnfreeze = events.filter(e => e.kind === 'unfrozen').at(-1)
  const cancels = events.filter(e => e.kind === 'canceled')
  const lastCancel = g.frozen ? cancels.find(e => !lastUnfreeze || e.day >= lastUnfreeze.day) : cancels.filter(e => !lastUnfreeze || e.day <= lastUnfreeze.day).at(-1)
  const after = (e?: StatusEvent) => (x: StatusEvent) => !!e && x.day >= e.day
  const courtOrder = events.find(e => e.kind === 'court_order' && after(lastCancel)(e))
  const paymentSince = events.find(e => e.kind === 'payment_received' && after(lastCancel)(e))

  const committed = g.spent + g.promised
  const money_: CaseRecord[] = [
    { label: 'Awarded on paper', value: money(g.awarded) },
    { label: 'Paid by the funder so far', value: money(g.received) },
    { label: 'Spent plus promised on open orders', value: money(committed), tone: committed > g.received ? 'bad' : undefined },
  ]
  if (committed > g.received) money_.push({ label: 'Spent or promised beyond what the funder has paid', value: money(committed - g.received), tone: 'bad' })
  const sources: CaseRecord[] = [...latest.entries()].map(([source, r]) => ({
    label: source, value: `says ${r.status.replace(/_/g, ' ')} (${r.day})`, tone: r.status === 'canceled' ? 'bad' : r.status === 'active' ? 'good' : 'warn', href: '#funds',
  }))
  const sourceHold = holds.find(h => h.kind === 'source_disagreement' && h.grantId === g.id)

  if (g.frozen) {
    const restoredNoCash = !!courtOrder && !paymentSince
    out.push({
      id: `funding-${g.id}`, grantId: g.id, kind: 'funding',
      status: sourceHold && !sourceHold.decision ? 'needs_you' : 'stopped',
      day: (lastCancel ?? events.at(-1))?.day ?? db.today,
      title: restoredNoCash ? 'Restored by a court, but no money has arrived' : disagree ? 'Sources disagree about whether this grant is active' : 'Spending is frozen',
      conflict: restoredNoCash
        ? `The grant's status says restored, and ${money(g.awarded - g.spent - g.promised)} looks available on paper, but the funder hasn't paid anything since it was canceled on ${lastCancel!.day}. Buying now would spend money that may never come.`
        : disagree ? 'One source says the grant is active and another says it is canceled. Spending on it now could be spending on a canceled grant.'
        : g.frozenReason ?? 'Spending on this grant is frozen.',
      records: [...sources, ...money_],
      timeline: events.filter(e => !lastCancel || e.day >= lastCancel.day).map(e => ({ day: e.day, what: `${e.summary} (${e.source})` })),
      missing: disagree && !restoredNoCash ? 'Sources that agree, or your pick of which one is right.'
        : `A payment from the funder dated after ${lastCancel?.day ?? 'the cancellation'}. A court order is not cash.`,
      rules: [{ rule: 'Grant is active and not frozen', detail: g.frozenReason ?? 'Frozen.', auditCase: AFTER_END }],
      next: sourceHold && !sourceHold.decision ? INBOX : { text: 'See the grant in Funds', href: '#funds' },
      decision: sourceHold?.decision,
    })
  } else if (lastUnfreeze && lastCancel) {
    out.push({
      id: `funding-${g.id}`, grantId: g.id, kind: 'funding', status: 'decided', day: lastUnfreeze.day,
      title: 'Spending reopened once money arrived',
      conflict: `Canceled on ${lastCancel.day}. Spending stayed frozen until a payment actually arrived, not when the status changed.`,
      records: money_,
      timeline: events.filter(e => e.day >= lastCancel.day && e.day <= lastUnfreeze.day).map(e => ({ day: e.day, what: `${e.summary} (${e.source})` })),
      rules: [], next: { text: 'See the grant in Funds', href: '#funds' },
    })
  }

  for (const f of flags) {
    if (g.frozen && f.kind !== 'spend_while_canceled') continue // the funding case above covers it
    const orderIds = [...new Set(f.summary.match(/\bo-\d+\b/g) ?? [])]
    const orders = orderIds.map(id => db.orders.find(o => o.id === id)).filter((o): o is Order => !!o)
    out.push({
      id: `flag-${f.id}`, grantId: g.id, kind: f.kind === 'spend_while_canceled' ? 'spend' : 'funding', status: 'needs_you', day: f.day,
      title: f.kind === 'spend_while_canceled' ? 'Money spent while the grant was canceled' : f.kind === 'sources_disagree' ? 'Sources disagree about this grant' : 'Court order, but no payment yet',
      conflict: f.summary,
      records: [...orders.map(orderRecord), ...sources],
      timeline: [...events.filter(e => e.kind === 'canceled' || e.kind === 'court_order' || e.kind === 'payment_received').map(e => ({ day: e.day, what: `${e.summary} (${e.source})` })),
        ...orders.map(o => ({ day: o.placed, what: `Order ${o.id} placed with ${o.vendor} for ${money(o.amount)}` }))].sort(byDay),
      missing: f.kind === 'spend_while_canceled' ? 'A reason the cost belongs on this grant even though it was canceled, or a move of the cost to another grant.' : undefined,
      rules: f.kind === 'spend_while_canceled' ? [{ rule: 'No new costs while a grant is canceled', detail: '', auditCase: AFTER_END }] : [], next: { text: 'See the flag in Funds', href: '#funds' },
    })
  }
  return out
}

// ── Invoices: the bill against its order and its approval ────────────────────

function invoiceCase(db: Db, inv: Invoice, hold: Hold | undefined): Case | undefined {
  const order = db.orders.find(o => o.id === inv.orderId)
  const request = order && db.requests.find(r => r.id === order.requestId)
  const grantId = hold?.grantId ?? (request && requestGrant(request))
  if (!grantId) return undefined
  const approval = latestApproval(db, inv.orderId)
  const approved = approval?.amount ?? order?.changedAmount ?? order?.amount
  const records: CaseRecord[] = [{ label: `Invoice ${inv.id}`, value: `${money(inv.amount)} from ${inv.vendor}, received ${inv.received}`, tone: 'bad', href: '#invoices' }]
  if (order) records.push(orderRecord(order))
  else records.push({ label: 'Order', value: `No order ${inv.orderId} on file`, tone: 'bad' })
  records.push(approval
    ? { label: `Approval ${approval.id}`, value: `${money(approval.amount)} by the ${approval.by.replace('_', ' ')} on ${approval.day}`, tone: approval.amount === inv.amount ? 'good' : 'bad' }
    : { label: 'Approval', value: order ? `Only the original order amount (${money(order.amount)})` : 'None found', tone: order && order.amount === inv.amount ? undefined : 'bad' })
  if (request) records.push({ label: `Request ${request.id}`, value: `${request.item}, asked for by ${requesterLabel(request.requesterName)}`, href: '#requests' })

  let missing: string | undefined
  if (!order) missing = 'An order this invoice belongs to.'
  else if (order.state === 'canceled') missing = `An open order. ${order.id} was canceled on ${order.canceledOn ?? 'an earlier date'}, so nothing on it should be billed. A credit note or proof the goods shipped before the cancellation would settle it.`
  else if (approved !== undefined && Math.abs(approved - inv.amount) >= 0.005) missing = `An approval for ${money(inv.amount)}. The most anyone approved for ${order.id} is ${money(approved)}.`

  return {
    id: `invoice-${inv.id}`, grantId, kind: 'invoice',
    status: inv.state === 'rejected' ? 'decided' : statusOfHold(hold, 'stopped'),
    day: inv.received,
    title: `${inv.vendor} bill for ${money(inv.amount)} doesn't match its order`,
    conflict: inv.mismatch ?? hold?.why ?? 'The invoice does not match its order and approval.',
    records, timeline: inv.timeline, missing,
    rules: [{ rule: 'Invoice needs an open order and the approved amount', detail: '',
      auditCase: order?.state !== 'canceled' && approved !== undefined ? ABOVE_APPROVAL : undefined }],
    next: hold && !hold.decision ? INBOX : { text: 'See it in Invoices', href: '#invoices' },
    decision: hold?.decision,
  }
}

// ── Purchases: a request against the grant's rules ──────────────────────────

function purchaseCase(db: Db, r: PurchaseRequest, hold: Hold | undefined): Case {
  const failing = r.verdicts.filter(v => !v.pass)
  const g = db.grants.find(x => x.id === r.grantId)
  const records: CaseRecord[] = [
    { label: `Request ${r.id}`, value: `${r.item}, ${money(r.price)} (${r.category}), asked for by ${requesterLabel(r.requesterName)} on ${r.day}`, href: '#requests' },
  ]
  if (g) records.push({ label: `Grant ${g.id}`, value: `${g.frozen ? 'frozen' : g.status.replace(/_/g, ' ')}, ${money(g.awarded - g.spent - g.promised)} truly available, ends ${g.end}`, tone: g.frozen ? 'bad' : undefined, href: '#funds' })
  for (const e of hold?.evidence ?? []) records.push({ label: e.label, value: e.value })
  return {
    id: `purchase-${r.id}`, grantId: r.grantId, kind: 'purchase',
    status: r.state === 'blocked' ? 'stopped' : statusOfHold(hold, r.state === 'waiting_on_manager' ? 'needs_you' : 'stopped'),
    day: r.day,
    title: hold?.title ?? `${r.item} (${money(r.price)}) ${r.state === 'blocked' ? 'was refused' : 'is on hold'}`,
    conflict: hold?.why ?? r.explanation,
    records,
    timeline: db.log.filter(l => l.refId === r.id).sort(byDay).map(l => ({ day: l.day, what: `${l.action}${l.reason ? `: ${l.reason}` : ''}` })),
    rules: failing.map(v => ({ rule: v.rule, detail: v.detail, auditCase: v.auditCase })),
    next: hold && !hold.decision ? INBOX : { text: 'See it in Requests', href: '#requests' },
    decision: hold?.decision,
  }
}

// ── Progress report papers ───────────────────────────────────────────────────

function reportCase(p: ReportPaper, hold: Hold | undefined): Case {
  const wrongGrant = p.creditsGrantId !== p.grantId
  const records: CaseRecord[] = [
    { label: 'Paper', value: `${p.title} (doi ${p.doi})`, href: '#reports' },
    { label: 'Listed in the progress report for', value: p.grantId },
    { label: "The paper's acknowledgments credit", value: p.creditsGrantId, tone: wrongGrant ? 'bad' : 'good' },
  ]
  if (p.correction) records.push({ label: `Correction (${p.correction.kind})`, value: `${p.correction.note}${p.correction.disclosed ? '' : ' Not disclosed in the report.'}`, tone: p.correction.disclosed ? 'warn' : 'bad' })
  const failing = p.checks.filter(c => !c.pass)
  return {
    id: `report-${p.id}`, grantId: p.grantId, kind: 'report',
    status: p.result === 'note' && !hold ? 'noted' : statusOfHold(hold, 'stopped'),
    day: hold?.day ?? '',
    title: wrongGrant ? `Paper credits ${p.creditsGrantId}, but it's reported under ${p.grantId}` : hold?.title ?? `Report check on "${p.title}"`,
    conflict: hold?.why ?? (failing.map(c => c.detail).join(' ')
      || (p.correction ? `The paper has a ${p.correction.kind} correction (${p.correction.note.replace(/\.$/, '')})${p.correction.disclosed ? ', disclosed in the report.' : " that the report doesn't mention."}` : 'A check on this paper needs a look.')),
    records, timeline: [],
    missing: wrongGrant ? `An acknowledgment of ${p.grantId} in the paper. Otherwise it belongs in ${p.creditsGrantId}'s report, not this one.` : undefined,
    rules: failing.map(c => ({ rule: c.check, detail: c.detail })),
    next: hold && !hold.decision ? INBOX : { text: 'See it in Reports', href: '#reports' },
    decision: hold?.decision,
  }
}

// ── Anything else waiting on (or decided by) the grant manager ───────────────

function holdCase(h: Hold): Case {
  return {
    id: `hold-${h.id}`, grantId: h.grantId, kind: h.kind === 'payment_request' || h.kind === 'follow_up' ? 'payment_request' : 'other',
    status: statusOfHold(h, 'needs_you'), day: h.day, title: h.title, conflict: h.why,
    records: h.evidence.map(e => ({ label: e.label, value: e.value })), timeline: [], rules: [],
    next: h.decision ? { text: 'See it in the Log', href: '#log' } : INBOX, decision: h.decision,
  }
}

const statusOrder: Record<CaseStatus, number> = { needs_you: 0, stopped: 1, noted: 2, decided: 3 }
// Money problems first: they decide whether anything else on the grant can move.
const kindOrder: Record<CaseKind, number> = { funding: 0, spend: 1, invoice: 2, purchase: 3, payment_request: 4, report: 5, other: 6 }

/** Every case on every grant: needs-you first, then by kind, newest first. */
// Closest real audit for each failure mode, from
// docs/research/pain-points/15-impossible-spend.md (all [verified]). No audit
// covers spending during a 2025 suspension, so the frozen-grant cases cite
// charges after an award ended. Nothing found for billing a canceled order.
const AFTER_END = 'NSF OIG 15-1-014 (UW-Madison, 2015): $56,965 questioned for expenses incurred after the award period expired; one order was placed 8 days after the end date.'
const ABOVE_APPROVAL = 'Texas Comptroller post-payment audit of UT Tyler (2024): the vendor\'s invoice added freight the purchase order didn\'t include, and the order was changed to add it only after the invoice arrived.'

export function buildCases(db: Db): Case[] {
  const holds = db.holds
  const used = new Set<string>()
  const holdFor = (kind: Hold['kind'], refId: string) => {
    const h = holds.filter(x => x.kind === kind && x.refId === refId).sort(byDay).at(-1)
    for (const x of holds) if (x.kind === kind && x.refId === refId) used.add(x.id)
    return h
  }
  const out: Case[] = []

  for (const g of db.grants) {
    const fc = fundingCases(db, g, holds)
    if (g.frozen) for (const h of holds) if (h.kind === 'source_disagreement' && h.grantId === g.id) used.add(h.id)
    out.push(...fc)
  }

  for (const inv of db.invoices) {
    if (inv.checked === false) continue
    const hold = holdFor('invoice', inv.id)
    if (inv.state !== 'held' && inv.state !== 'rejected' && !hold) continue
    const c = invoiceCase(db, inv, hold)
    if (c) out.push(c)
  }

  for (const r of db.requests) {
    const hold = holdFor('purchase', r.id)
    if (r.state !== 'blocked' && r.state !== 'waiting_on_manager' && !hold) continue
    out.push(purchaseCase(db, r, hold))
  }

  for (const p of db.papers) {
    if (p.checked === false) continue
    const hold = holdFor('report', p.id)
    if (p.result === 'ok' && !hold) continue
    out.push(reportCase(p, hold))
  }

  for (const h of holds) if (!used.has(h.id)) out.push(holdCase(h))

  return out.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || kindOrder[a.kind] - kindOrder[b.kind] || b.day.localeCompare(a.day))
}
