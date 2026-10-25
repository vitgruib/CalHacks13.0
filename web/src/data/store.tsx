// The store every window reads (useStore). Two backends fill it: this local
// in-memory one (sim/demo-seed.json, no server) and the live SpacetimeDB one in
// live.tsx; backend.tsx picks between them (T17).
import { createContext, useContext, useState, type ReactNode } from 'react'
import seed from '../../../sim/demo-seed.json'
import { clearLocalSubmissions, saveLocalSubmission, useLocalSubmissions } from '../invoice/local'
import type { Submission } from '../invoice/model'
import { isEdgeGrant, type Researcher } from '../people'
import { planLines, type SavedPlan } from '../spendguard/store'
import type { Db, Decision, Invoice, PurchaseRequest, SettableStatus, SourceCheck, StatusEvent } from './types'

/** The item check's look at an item, before any grant (T103). category: the kind of thing it is ('' = not read). */
export interface ItemCheck { verdict: 'fine' | 'flag' | 'unchecked'; why: string; category: string }

// Every action returns a Promise that rejects with the reason (the module's
// refusal, or the local check) when nothing changed.
export interface Store {
  db: Db
  /** Grant manager decides a hold. Reason is required (MASTER-PLAN §2). */
  decide: (holdId: string, choice: Decision['choice'], reason: string) => Promise<void>
  /** A researcher submits a purchase request as themselves; it goes to the grant office (submit_request). */
  submitRequest: (r: Pick<PurchaseRequest, 'item' | 'category' | 'price' | 'grantId' | 'purpose'>, by: Researcher) => Promise<void>
  /** Ask's item check (T103): is it a research cost at all, before any grant?
   *  Resolves with the bookkeeping agent's answer (Haiku), or 'unchecked' when
   *  none comes in time (offline: no agents, always). */
  checkItem: (a: { item: string; purpose: string; price: number }, by: Researcher) => Promise<ItemCheck>
  /** The researcher who asked pushes back with new information; the grant office looks again (push_back). */
  pushBack: (requestId: string, message: string, by: Researcher) => Promise<void>
  // Test lab only (T18). Same argument shapes as Track A's reducers
  // inject_status_event, inject_invoice and advance_days, so T17 can swap them.
  /** Drop a status event into the world; applies the freeze rule (MASTER-PLAN §3.1). */
  injectStatusEvent: (e: InjectStatusEventArgs) => Promise<void>
  /** A vendor invoice arrives for an order, unchecked. */
  injectInvoice: (a: { orderId: string; amount: number }) => Promise<void>
  /** Move the simulated clock forward. */
  advanceDays: (a: { days: number }) => Promise<void>
  /** When the sources were last checked, and whether a check now is running (T31). */
  sourceCheck: SourceCheck
  /** Ask the bookkeeping agent to check every source now (request_check
   *  'check_now'), with the cancellation list read as of `asOf` (a real day,
   *  YYYY-MM-DD; none = today), for one grant or every grant. Rejects if the
   *  request couldn't be sent. */
  checkNow: (asOf?: string, grantId?: string) => Promise<void>
  /** Every researcher's experiment plans (T71), from the module's plan table. */
  plans: SavedPlan[]
  /** A researcher saves a draft, submits for review, or sends a plan whose
   *  report cleared every check; a sent plan's lines become their requests. */
  savePlan: (p: SavedPlan, by: Researcher) => Promise<void>
  /** The researcher deletes a plan whose lines aren't requests yet. */
  deletePlan: (id: string, by: Researcher) => Promise<void>
  /** Grant manager: approve a submitted plan (its lines become requests in the
   *  researcher's name) or return it, always with a reason. */
  decidePlan: (id: string, choice: 'approve' | 'return', reason: string) => Promise<void>
  /** Grant manager: set a grant's status (active, reinstated by a court with no
   *  money yet, or inactive), with a reason for the log (set_grant_status).
   *  Spending follows the status in every portal. */
  setGrantStatus: (grantId: string, status: SettableStatus, reason: string) => Promise<void>
  /** Invoice submissions (T112): what researchers sent and the grant office's decisions on them. */
  submissions: Submission[]
  /** A researcher submits or resubmits an invoice, or the grant office records a decision on one. */
  saveSubmission: (s: Submission) => Promise<void>
  /** Testing events: replace the whole world with the demo seed (sim/demo-seed.json). Live, every open window sees it. */
  loadDemoSeed: () => Promise<void>
}

export type InjectStatusEventArgs = Pick<StatusEvent, 'grantId' | 'kind' | 'source' | 'summary'> & { amount?: number; day?: string }

export const Ctx = createContext<Store | null>(null)

let seq = 0
const nextId = (p: string) => `${p}-local-${++seq}`

const DAY_MS = 86_400_000
const SIMULATED_CHECK_MS = 2500
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10)
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** The raw world's consequence of a status event (no agents run here):
 *  canceled freezes; a court order restores the status but stays frozen
 *  (a court order isn't cash); a payment adds to received and unfreezes
 *  only after a court order (otherwise it may be closeout money). */
export function applyStatusEvent(d: Db, a: InjectStatusEventArgs): Db {
  const g = d.grants.find(x => x.id === a.grantId)
  if (!g) throw new Error(`No grant ${a.grantId}`)
  if (a.kind === 'payment_received' && !(a.amount && a.amount > 0)) throw new Error('A payment needs an amount above zero')
  const ev: StatusEvent = { id: nextId('se'), grantId: a.grantId, day: a.day ?? d.today, kind: a.kind, source: a.source, summary: a.summary }
  if (a.amount != null) ev.amount = a.amount
  const events = [ev]
  const log = [{ id: nextId('l'), day: d.today, actor: 'system' as const, action: `Injected ${a.kind} on ${a.grantId}`, reason: a.summary, refId: ev.id }]
  let next = { ...g }
  if (a.kind === 'canceled') {
    next = { ...next, status: 'canceled', frozen: true, frozenReason: `Canceled ${ev.day} (${a.source}). Spending stays frozen until a payment arrives after the cancellation.` }
  } else if (a.kind === 'court_order') {
    next = { ...next, status: 'restored_by_court' }
  } else if (a.kind === 'payment_received') {
    next = { ...next, received: g.received + a.amount! }
    // An open sources-disagree flag keeps it frozen until the grant manager
    // decides, as in the module (rules.ts freezeState).
    const disagree = d.flags.some(f => f.grantId === g.id && f.open && f.kind === 'sources_disagree')
    if (g.frozen && g.status === 'canceled') {
      next = { ...next, frozenReason: `Money arrived, but nothing has restored ${g.id}: it may be closeout money (2 CFR 200.343). Spending stays frozen until the grant manager decides.` }
    } else if (g.frozen && disagree) {
      next = { ...next, frozenReason: 'Sources disagree about this grant. Spending stays frozen until the grant manager decides.' }
    } else if (g.frozen) {
      next = { ...next, frozen: false, frozenReason: undefined }
      const un: StatusEvent = { id: nextId('se'), grantId: a.grantId, day: d.today, kind: 'unfrozen', source: a.source, summary: `Spending unfrozen: a payment of ${usd(a.amount!)} arrived.` }
      events.push(un)
      log.push({ id: nextId('l'), day: d.today, actor: 'system', action: `Unfroze ${a.grantId}`, reason: `Payment of ${usd(a.amount!)} arrived after the freeze`, refId: un.id })
    }
  }
  return {
    ...d,
    grants: d.grants.map(x => (x.id === g.id ? next : x)),
    statusEvents: [...d.statusEvents, ...events],
    log: [...d.log, ...log],
  }
}

export const STATUS_WORDS: Record<SettableStatus, string> = {
  active: 'Active',
  restored_by_court: 'Reinstated by a court, money not sent yet',
  canceled: 'Inactive (canceled)',
}

/** The grant manager sets a grant's status (as the module's set_grant_status):
 *  recorded as the matching status event; it settles the grant's open items. */
export function applySetStatus(d: Db, grantId: string, status: SettableStatus, reason: string): Db {
  const g = d.grants.find(x => x.id === grantId)
  if (!g) throw new Error(`No grant ${grantId}`)
  if (!reason.trim()) throw new Error('A reason is required.')
  if (g.status === 'ended') throw new Error(`${grantId} has ended.`)
  const holds = d.holds.filter(h => !h.decision && h.grantId === grantId && (h.kind === 'source_disagreement' || h.kind === 'paid_while_canceled'))
  const disputed = d.flags.some(f => f.grantId === grantId && f.open && f.kind === 'sources_disagree')
  const kinds: StatusEvent['kind'][] =
    status === 'active' ? (g.frozen || g.status !== 'active' ? ['unfrozen'] : [])
    : status === 'restored_by_court' ? (g.status === 'restored_by_court' ? [] : g.status === 'canceled' ? ['court_order'] : ['canceled', 'court_order'])
    : g.status !== 'canceled' || holds.some(h => h.kind === 'paid_while_canceled') ? ['canceled'] : []
  if (kinds.length === 0 && holds.length === 0 && !disputed) throw new Error(`${grantId} is already ${STATUS_WORDS[status].toLowerCase()}.`)
  const summary = `Set by the grant manager: ${STATUS_WORDS[status]}. ${reason.trim()}`
  const events: StatusEvent[] = kinds.map(kind => ({ id: nextId('se'), grantId, day: d.today, kind, source: 'Grant office', summary }))
  const frozenReason = status === 'active' ? undefined : status === 'canceled' ? 'Inactive: the grant office set it canceled.' : 'A court reinstated it, but no money has been sent yet.'
  const settles = (f: Db['flags'][number]) => f.grantId === grantId && f.open && (f.kind === 'sources_disagree' || (f.kind === 'court_order_no_payment' && status !== 'restored_by_court'))
  const decision: Decision = { choice: 'set_status', reason: `Status set: ${STATUS_WORDS[status]}. ${reason.trim()}`, by: 'grant_manager', day: d.today }
  return {
    ...d,
    grants: d.grants.map(x => (x.id === grantId ? { ...x, status, frozen: status !== 'active', frozenReason } : x)),
    flags: d.flags.map(f => (settles(f) ? { ...f, open: false } : f)),
    holds: d.holds.map(h => (holds.includes(h) ? { ...h, decision } : h)),
    statusEvents: [...d.statusEvents, ...events],
    log: [...d.log, { id: nextId('l'), day: d.today, actor: 'grant_manager', action: `Set ${grantId} to ${STATUS_WORDS[status]}`, reason, refId: grantId }],
  }
}

export function applyInvoice(d: Db, { orderId, amount }: { orderId: string; amount: number }): Db {
  const o = d.orders.find(x => x.id === orderId)
  if (!o) throw new Error(`No order ${orderId}`)
  if (!(amount > 0)) throw new Error('An invoice needs an amount above zero')
  const inv: Invoice = {
    id: nextId('inv'), orderId, vendor: o.vendor, amount, received: d.today,
    state: 'matched', // placeholder until the bookkeeping agent checks it
    timeline: [{ day: d.today, what: `Invoice arrived (${usd(amount)})` }],
    checked: false,
  }
  return {
    ...d,
    invoices: [...d.invoices, inv],
    log: [...d.log, { id: nextId('l'), day: d.today, actor: 'system', action: `Injected invoice ${inv.id} for ${orderId}`, reason: `${o.vendor} bills ${usd(amount)}`, refId: inv.id }],
  }
}

export function applyAdvanceDays(d: Db, { days }: { days: number }): Db {
  if (!Number.isInteger(days) || days < 1) throw new Error('Days must be a whole number of at least 1')
  const today = addDays(d.today, days)
  return {
    ...d,
    today,
    log: [...d.log, { id: nextId('l'), day: today, actor: 'system', action: `Clock moved forward ${days} day${days === 1 ? '' : 's'}`, reason: `${d.today} to ${today}` }],
  }
}

export function LocalStoreProvider({ children }: { children: ReactNode }) {
  // The full fake world from sim/ (T8), raw: agents still have to find the planted mistakes.
  const [db, setDb] = useState<Db>(() => structuredClone(seed) as unknown as Db)

  const decide: Store['decide'] = async (holdId, choice, reason) => {
    if (!reason.trim()) throw new Error('A reason is required')
    setDb(d => {
      const held = d.holds.find(h => h.id === holdId)
      return {
        ...d,
        holds: d.holds.map(h => (h.id === holdId ? { ...h, decision: { choice, reason, by: 'grant_manager', day: d.today } } : h)),
        // Logged against the request or invoice, as the module does.
        log: [...d.log, { id: nextId('l'), day: d.today, actor: 'grant_manager', action: `Decided "${held?.title ?? holdId}": ${choice}`, reason, refId: held?.refId ?? holdId }],
      }
    })
  }

  const submitRequest: Store['submitRequest'] = async (r, by) => {
    if (!(r.price > 0)) throw new Error('The price must be more than $0.')
    setDb(d => {
      const id = nextId('rq')
      return {
        ...d,
        requests: [...d.requests, { ...r, id, day: d.today, requester: 'scientist', requestedBy: by.id, requesterName: by.name, state: 'submitted', verdicts: [], explanation: 'Waiting for the grant office.' }],
        log: [...d.log, { id: nextId('l'), day: d.today, actor: 'scientist', action: `${by.name} asked to buy ${r.item} (${usd(r.price)})`, reason: r.purpose, refId: id }],
      }
    })
  }

  // Same refusals as the module's push_back.
  const pushBack: Store['pushBack'] = async (requestId, message, by) => {
    const r = db.requests.find(x => x.id === requestId)
    if (!r) throw new Error(`No request ${requestId}.`)
    if (r.requestedBy !== by.id) throw new Error('Only the person who asked can push back.')
    if (!message.trim()) throw new Error('Say what changed.')
    if (r.state === 'bought' || r.state === 'rerouted') throw new Error(`Already ${r.state}.`)
    setDb(d => ({
      ...d,
      requests: d.requests.map(x => (x.id === requestId ? { ...x, state: 'submitted' } : x)),
      log: [...d.log, { id: nextId('l'), day: d.today, actor: 'scientist', action: `Pushed back on ${r.item} (${by.name})`, reason: message, refId: requestId }],
    }))
  }

  // Validate against the current state up front so callers can show the error;
  // the updater then re-applies against the latest state.
  const injectStatusEvent: Store['injectStatusEvent'] = async a => { applyStatusEvent(db, a); setDb(d => applyStatusEvent(d, a)) }
  const injectInvoice: Store['injectInvoice'] = async a => { applyInvoice(db, a); setDb(d => applyInvoice(d, a)) }
  const advanceDays: Store['advanceDays'] = async a => { applyAdvanceDays(db, a); setDb(d => applyAdvanceDays(d, a)) }

  // Offline demo data has no agents, so Check now here is SIMULATED: a short
  // pause, then "finished". Nothing outside this tab is read.
  // The seed's finished check requests set each failure case's starting day (T65).
  const seedCheck = (): SourceCheck => ({
    last: null, pendingSince: null, asOf: null,
    grantAsOf: Object.fromEntries(((seed as { checkRequests?: { grantId?: string; asOf?: string }[] }).checkRequests ?? []).filter(c => c.grantId && c.asOf).map(c => [c.grantId!, c.asOf!])),
  })
  const [sourceCheck, setSourceCheck] = useState<SourceCheck>(seedCheck)
  // No agents offline: the item goes straight on to the grants.
  const checkItem: Store['checkItem'] = async () => ({ verdict: 'unchecked', why: '', category: '' })
  const checkNow: Store['checkNow'] = async (asOf, grantId) => {
    const id = nextId('check')
    const days = (c: SourceCheck) => (grantId ? { asOf: c.asOf, grantAsOf: { ...c.grantAsOf, [grantId]: asOf ?? null } } : { asOf: asOf ?? null, grantAsOf: c.grantAsOf })
    const what = grantId ?? 'all grants'
    setSourceCheck(c => ({ ...c, pendingSince: new Date(), ...days(c) }))
    setDb(d => ({ ...d, log: [...d.log, { id: nextId('l'), day: d.today, actor: 'grant_manager', action: 'Asked for a source check', reason: `check now for ${what}${asOf ? `, cancellation list as of ${asOf}` : ''}`, refId: id }] }))
    setTimeout(() => {
      setSourceCheck(c => ({ ...c, last: { at: new Date(), what: `${what} (simulated: offline demo data, no sources read)` }, pendingSince: null }))
      setDb(d => ({ ...d, log: [...d.log, { id: nextId('l'), day: d.today, actor: 'bookkeeping', action: 'Finished a source check', reason: `${what} (simulated offline)`, refId: id }] }))
    }, SIMULATED_CHECK_MS)
  }

  // Plans, with the same refusals as the module's save_plan, delete_plan and decide_plan.
  const [plans, setPlans] = useState<(SavedPlan & { by: Researcher })[]>([])
  const sendLines = (p: SavedPlan, by: Researcher) => {
    for (const l of planLines(p)) submitRequest({ item: l.item, category: l.category, price: l.price, grantId: p.plan.grantId, purpose: l.purpose }, by).catch(() => {})
  }
  const ownPlan = (id: string, by: Researcher) => {
    const old = plans.find(x => x.id === id)
    if (old && old.by.id !== by.id) throw new Error('Only the researcher who wrote a plan can change it.')
    if (old?.status === 'sent') throw new Error("This plan's lines are already requests; push back on those instead.")
    return old
  }
  const savePlan: Store['savePlan'] = async (p, by) => {
    const old = ownPlan(p.id, by)
    if (p.status !== 'draft' && !p.report) throw new Error('Assess the plan before submitting it.')
    if (p.status === 'sent' && p.report?.overall !== 'aligned') throw new Error('Only a plan that clears every check goes straight out as requests; submit it for review instead.')
    const row = {
      ...p, by, researcher: by.name, savedOn: db.today, decision: undefined,
      submittedOn: p.status === 'draft' ? undefined : db.today, sentOn: p.status === 'sent' ? db.today : undefined,
    }
    setPlans(ps => (old ? ps.map(x => (x.id === p.id ? row : x)) : [row, ...ps]))
    if (row.status === 'sent') sendLines(row, by)
  }
  const deletePlan: Store['deletePlan'] = async (id, by) => {
    if (!ownPlan(id, by)) throw new Error(`No plan ${id}.`)
    setPlans(ps => ps.filter(x => x.id !== id))
  }
  const decidePlan: Store['decidePlan'] = async (id, choice, reason) => {
    if (!reason.trim()) throw new Error('A reason is required.')
    const p = plans.find(x => x.id === id)
    if (!p) throw new Error(`No plan ${id}.`)
    if (p.status !== 'submitted') throw new Error(`Plan ${id} is ${p.status}, not waiting for a decision.`)
    const row = {
      ...p, status: choice === 'approve' ? 'sent' as const : 'returned' as const, sentOn: choice === 'approve' ? db.today : undefined,
      decision: { choice, reason: reason.trim(), day: db.today },
    }
    setPlans(ps => ps.map(x => (x.id === id ? row : x)))
    if (choice === 'approve') sendLines(row, p.by)
  }

  const setGrantStatus: Store['setGrantStatus'] = async (grantId, status, reason) => { applySetStatus(db, grantId, status, reason); setDb(d => applySetStatus(d, grantId, status, reason)) }
  const submissions = useLocalSubmissions()

  const loadDemoSeed: Store['loadDemoSeed'] = async () => {
    setDb(structuredClone(seed) as unknown as Db)
    setPlans([])
    clearLocalSubmissions()
    setSourceCheck(seedCheck())
  }

  return <Ctx.Provider value={{ db, decide, submitRequest, checkItem, pushBack, injectStatusEvent, injectInvoice, advanceDays, sourceCheck, checkNow, plans, savePlan, deletePlan, decidePlan, setGrantStatus, submissions, saveSubmission: async s => saveLocalSubmission(s), loadDemoSeed }}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return { ...s, db: withoutEdgeGrants(s.db) }
}

// The edge-case samples' grants stay in the seed and the live world but never
// show: drop them and every row on them. Cached per db so the result keeps its
// identity while db does (windows use db as an effect dependency).
const shown = new WeakMap<Db, Db>()
function withoutEdgeGrants(db: Db): Db {
  let out = shown.get(db)
  if (out) return out
  const keep = <T,>(rows: T[]) => rows.filter(r => !isEdgeGrant({ id: (r as { grantId?: string }).grantId ?? '' }))
  const requests = keep(db.requests)
  const hiddenRequests = new Set(db.requests.filter(r => !requests.includes(r)).map(r => r.id))
  const orders = db.orders.filter(o => !hiddenRequests.has(o.requestId))
  const gone = new Set(db.orders.filter(o => hiddenRequests.has(o.requestId)).map(o => o.id))
  const onOrder = <T extends { orderId: string },>(rows: T[]) => rows.filter(r => !gone.has(r.orderId))
  out = {
    ...db,
    grants: db.grants.filter(g => !isEdgeGrant(g)),
    statusEvents: keep(db.statusEvents), sourceReadings: keep(db.sourceReadings), flags: keep(db.flags),
    requests, orders, approvals: onOrder(keep(db.approvals)), invoices: onOrder(keep(db.invoices)),
    payroll: keep(db.payroll), paymentRequests: keep(db.paymentRequests), papers: keep(db.papers), holds: keep(db.holds), log: keep(db.log),
  }
  shown.set(db, out)
  return out
}
