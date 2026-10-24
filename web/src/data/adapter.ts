// Module rows (SpacetimeDB client cache) → the windows' `Db` shape. The one
// place the two contracts meet; windows never see module rows directly.
//
// Mapping gaps (module ↔ Db), kept deliberately small:
// - u64 ids (status events, readings, flags, holds, log) become decimal strings.
// - Hold: module keeps `open` + a separate `decision` table; Db nests
//   `decision`. A hold closed with no decision row (replaced by a newer hold
//   for the same item) is dropped, so it can't show as open or decided.
// - Optional grant ids (hold.grantId, request.grantId) become '' when absent.
// - payroll from/to → period {from, to}; follow_up rows nest under their
//   payment request; reportPaper → papers.
// - Module-only columns are not shown: grant.available (windows compute it),
//   request.sharedWith/requestedBy, order.grantId, sourceReading
//   awarded/paid/endDate/url, flag.raisedBy, all `at` timestamps, plus the
//   agent, person and counter tables. checkRequest + the check log rows'
//   `at` become SourceCheck (toSourceCheck), not part of Db.
// - Court restorations: once money arrives after a cancellation the module
//   sets status back to 'active' and logs no 'unfrozen' event. If a court
//   order came before that payment, the adapter shows status
//   'restored_by_court' (frozen false → "Active (Restored by court)") and adds
//   an 'unfrozen' event right after the payment, as the local store does, so
//   Funds and the restoration notices read the same either way.
// - Strings are cast to the Db unions (kinds, states, roles) unchecked; e.g.
//   follow-up state 'asked' exists only on the module side.
import type { DbConnection } from '../module_bindings'
import type * as M from '../module_bindings/types'
import type * as T from './types'

/** Every table the windows read (the client subscribes to all of them). */
export const WORLD_TABLES = [
  'clock', 'grant', 'statusEvent', 'sourceReading', 'flag', 'request', 'order', 'approval',
  'invoice', 'payroll', 'paymentRequest', 'followUp', 'reportPaper', 'hold', 'decision', 'log', 'checkRequest',
] as const

const rows = <R>(t: { iter(): Iterable<R> }): R[] => [...t.iter()]

/** Natural order for ids like rq2 < rq10, and numeric strings. */
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, undefined, { numeric: true })
const sorted = <X extends { id: string }>(xs: X[]) => xs.sort(byId)

/** Copy an optional value only when present, so absent fields stay absent. */
function opt<O extends object, K extends string, V>(o: O, k: K, v: V | undefined): O & Partial<Record<K, V>> {
  if (v !== undefined) (o as Record<string, unknown>)[k] = v
  return o
}

export function toDb(db: DbConnection['db']): T.Db {
  const decisions = new Map<string, M.Decision>()
  for (const d of [...rows(db.decision)].sort((a, b) => Number(a.id - b.id))) decisions.set(d.holdId.toString(), d)

  const followUps = new Map<string, T.FollowUp[]>()
  for (const f of sorted(rows(db.followUp).map(f => ({ ...f })))) {
    const list = followUps.get(f.paymentRequestId) ?? []
    list.push(opt({ id: f.id, question: f.question, state: f.state as T.FollowUp['state'] }, 'answerDraft', f.answerDraft))
    followUps.set(f.paymentRequestId, list)
  }

  const holds: T.Hold[] = []
  for (const h of rows(db.hold)) {
    const id = h.id.toString()
    const d = decisions.get(id)
    if (!h.open && !d) continue
    const hold: T.Hold = {
      id, kind: h.kind as T.HoldKind, refId: h.refId, grantId: h.grantId ?? '', raisedBy: h.raisedBy as T.AgentId,
      day: h.day, title: h.title, why: h.why, evidence: h.evidence, options: h.options as T.Decision['choice'][],
    }
    if (d) hold.decision = { choice: d.choice as T.Decision['choice'], reason: d.reason, by: d.by as T.PersonId, day: d.day }
    holds.push(hold)
  }

  const out: T.Db = {
    today: db.clock.id.find(0)?.today ?? '',
    grants: sorted(rows(db.grant).map(g => opt({
      id: g.id, title: g.title, pi: g.pi, agency: g.agency, awarded: g.awarded, received: g.received,
      spent: g.spent, promised: g.promised, start: g.start, end: g.end,
      status: g.status as T.GrantStatus, frozen: g.frozen,
    }, 'frozenReason', g.frozenReason))),
    statusEvents: sorted(rows(db.statusEvent).map(e => opt({
      id: e.id.toString(), grantId: e.grantId, day: e.day, kind: e.kind as T.StatusEvent['kind'],
      source: e.source as T.Source, summary: e.summary,
    }, 'amount', e.amount))),
    // Db requires a status; a reading that only changed amounts keeps 'active'.
    sourceReadings: sorted(rows(db.sourceReading).map(r => ({
      id: r.id.toString(), grantId: r.grantId, day: r.day, source: r.source as T.Source,
      status: (r.status ?? 'active') as T.GrantStatus,
    }))),
    flags: sorted(rows(db.flag).map(f => ({
      id: f.id.toString(), grantId: f.grantId, day: f.day, kind: f.kind as T.Flag['kind'], summary: f.summary, open: f.open,
    }))),
    requests: sorted(rows(db.request).map(r => {
      const out: T.PurchaseRequest = {
        id: r.id, day: r.day, requester: r.requester as T.PersonId, item: r.item, category: r.category,
        price: r.price, grantId: r.grantId ?? '', purpose: r.purpose, state: r.state as T.RequestState,
        verdicts: r.verdicts.map(v => opt({ rule: v.rule, pass: v.pass, detail: v.detail }, 'auditCase', v.auditCase)),
        explanation: r.explanation,
      }
      if (r.chargedGrantId !== undefined) out.chargedGrantId = r.chargedGrantId
      if (r.split.length) out.split = r.split
      if (r.sharedWith.length) out.sharedWith = r.sharedWith
      if (r.requestedBy) out.requestedBy = r.requestedBy.toHexString()
      return out
    })),
    orders: sorted(rows(db.order).map(o => {
      const out: T.Order = { id: o.id, requestId: o.requestId, vendor: o.vendor, amount: o.amount, placed: o.placed, state: o.state as T.Order['state'] }
      return opt(opt(out, 'canceledOn', o.canceledOn), 'changedAmount', o.changedAmount)
    })),
    approvals: sorted(rows(db.approval).map(a => ({ id: a.id, orderId: a.orderId, amount: a.amount, by: a.by as T.PersonId, day: a.day }))),
    invoices: sorted(rows(db.invoice).map(i => opt({
      id: i.id, orderId: i.orderId, vendor: i.vendor, amount: i.amount, received: i.received,
      state: i.state as T.Invoice['state'], timeline: i.timeline, checked: i.checked,
    }, 'mismatch', i.mismatch))),
    payroll: sorted(rows(db.payroll).map(p => ({
      id: p.id, grantId: p.grantId, person: p.person, role: p.role, period: { from: p.from, to: p.to },
      effortPct: p.effortPct, amount: p.amount,
    }))),
    paymentRequests: sorted(rows(db.paymentRequest).map(pr => ({
      id: pr.id, grantId: pr.grantId, from: pr.from, to: pr.to, amount: pr.amount, explanation: pr.explanation,
      includedRequestIds: pr.includedRequestIds, includedPayrollIds: pr.includedPayrollIds, excluded: pr.excluded,
      state: pr.state as T.PaymentRequest['state'], followUps: followUps.get(pr.id) ?? [],
    }))),
    papers: sorted(rows(db.reportPaper).map(p => {
      const out: T.ReportPaper = {
        id: p.id, grantId: p.grantId, title: p.title, doi: p.doi, creditsGrantId: p.creditsGrantId,
        checks: p.checks, result: p.result as T.ReportPaper['result'], checked: p.checked, costRequestIds: p.costRequestIds,
      }
      if (p.pmcid !== undefined) out.pmcid = p.pmcid
      if (p.correction) out.correction = { ...p.correction, kind: p.correction.kind as NonNullable<T.ReportPaper['correction']>['kind'] }
      return out
    })),
    holds: sorted(holds),
    log: sorted(rows(db.log).map(l => opt(opt({
      id: l.id.toString(), day: l.day, actor: l.actor as T.Actor, action: l.action, reason: l.reason,
    }, 'rule', l.rule), 'refId', l.refId))),
  }
  return withCourtRestorations(out)
}

/** Last checked = the newest 'Finished a source check' log row (complete_check
 *  writes it); pending = the newest check_now request, while not done, timed
 *  from its 'Asked for a source check' log row (request_check writes it). */
export function toSourceCheck(db: DbConnection['db']): T.SourceCheck {
  let last: T.SourceCheck['last'] = null
  const asked = new Map<string, Date>()
  for (const l of rows(db.log)) {
    if (l.action === 'Finished a source check') {
      const at = l.at.toDate()
      if (!last || at > last.at) last = { at, what: l.reason }
    } else if (l.action.startsWith('Asked for a source check') && l.refId) {
      asked.set(l.refId, l.at.toDate())
    }
  }
  const newest = rows(db.checkRequest).filter(c => c.reason === 'check_now').sort((a, b) => Number(b.id - a.id))[0]
  const pendingSince = newest && !newest.done ? asked.get(newest.id.toString()) ?? new Date() : null
  return { last, pendingSince }
}

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** See the header: replay each grant's events the way the module's freeze rule does. */
function withCourtRestorations(d: T.Db): T.Db {
  const extra: T.StatusEvent[] = []
  const restored = new Set<string>()
  for (const g of d.grants) {
    const events = d.statusEvents.filter(e => e.grantId === g.id) // already in id (= arrival) order
      .map((e, i) => ({ e, i })).sort((a, b) => a.e.day.localeCompare(b.e.day) || a.i - b.i).map(x => x.e)
    let canceled = false
    let court = false
    let restoredNow = false
    events.forEach((e, i) => {
      if (e.kind === 'canceled') { canceled = true; court = false; restoredNow = false }
      else if (e.kind === 'court_order' && canceled) court = true
      else if (e.kind === 'payment_received' && canceled) {
        if (court) {
          restoredNow = true
          if (events[i + 1]?.kind !== 'unfrozen') {
            extra.push({ id: `${e.id}-unfrozen`, grantId: g.id, day: e.day, kind: 'unfrozen', source: e.source, summary: `Spending unfrozen: a payment of ${usd(e.amount ?? 0)} arrived.` })
          }
        }
        canceled = false
        court = false
      }
    })
    if (restoredNow && g.status === 'active' && !g.frozen) restored.add(g.id)
  }
  if (!extra.length && !restored.size) return d
  const order = new Map(d.statusEvents.map((e, i) => [e.id, i]))
  const rank = (e: T.StatusEvent) => order.get(e.id) ?? order.get(e.id.replace(/-unfrozen$/, ''))! + 0.5
  return {
    ...d,
    grants: d.grants.map(g => (restored.has(g.id) ? { ...g, status: 'restored_by_court' as const } : g)),
    statusEvents: [...d.statusEvents, ...extra].sort((a, b) => rank(a) - rank(b)),
  }
}
