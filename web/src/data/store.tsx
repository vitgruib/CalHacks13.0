// The store every window reads (useStore). Two backends fill it: this local
// in-memory one (sim/demo-seed.json, no server) and the live SpacetimeDB one in
// live.tsx; backend.tsx picks between them (T17).
import { createContext, useContext, useState, type ReactNode } from 'react'
import seed from '../../../sim/demo-seed.json'
import type { Researcher } from '../people'
import { planLines, type SavedPlan } from '../spendguard/store'
import type { Db, Decision, Invoice, PurchaseRequest, SourceCheck, StatusEvent } from './types'

export interface Store {
  db: Db
  /** Grant manager decides a hold. Reason is required (MASTER-PLAN §2). */
  decide: (holdId: string, choice: Decision['choice'], reason: string) => void
  /** A researcher submits a purchase request as themselves; the purchasing agent picks it up. */
  submitRequest: (r: Pick<PurchaseRequest, 'item' | 'category' | 'price' | 'grantId' | 'purpose'>, by: Researcher) => void
  /** The researcher who asked pushes back with new information; the agent looks again (push_back). */
  pushBack: (requestId: string, message: string, by: Researcher) => void
  // Test lab only (T18). Same argument shapes as Track A's reducers
  // inject_status_event, inject_invoice and advance_days, so T17 can swap them.
  /** Drop a status event into the world; applies the freeze rule (MASTER-PLAN §3.1). */
  injectStatusEvent: (e: InjectStatusEventArgs) => void
  /** A vendor invoice arrives for an order, unchecked. */
  injectInvoice: (a: { orderId: string; amount: number }) => void
  /** Move the simulated clock forward. */
  advanceDays: (a: { days: number }) => void
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
  savePlan: (p: SavedPlan, by: Researcher) => void
  /** The researcher deletes a plan whose lines aren't requests yet. */
  deletePlan: (id: string, by: Researcher) => void
  /** Grant manager: approve a submitted plan (its lines become requests in the
   *  researcher's name) or return it, always with a reason. */
  decidePlan: (id: string, choice: 'approve' | 'return', reason: string) => void
  /** Demo controls: replace the whole world with the demo seed (sim/demo-seed.json). Live, every open window sees it. */
  loadDemoSeed: () => void
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

  const decide: Store['decide'] = (holdId, choice, reason) => {
    if (!reason.trim()) throw new Error('A reason is required')
    setDb(d => ({
      ...d,
      holds: d.holds.map(h => (h.id === holdId ? { ...h, decision: { choice, reason, by: 'grant_manager', day: d.today } } : h)),
      log: [...d.log, { id: nextId('l'), day: d.today, actor: 'grant_manager', action: `Decided ${holdId}: ${choice}`, reason, refId: holdId }],
    }))
  }

  const submitRequest: Store['submitRequest'] = (r, by) => {
    setDb(d => {
      const id = nextId('rq')
      return {
        ...d,
        requests: [...d.requests, { ...r, id, day: d.today, requester: 'scientist', requestedBy: by.id, requesterName: by.name, state: 'submitted', verdicts: [], explanation: 'Waiting for the purchasing agent.' }],
        log: [...d.log, { id: nextId('l'), day: d.today, actor: 'scientist', action: `${by.name} asked to buy ${r.item} (${usd(r.price)})`, reason: r.purpose, refId: id }],
      }
    })
  }

  // Same refusals as the module's push_back.
  const pushBack: Store['pushBack'] = (requestId, message, by) => {
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
  const injectStatusEvent: Store['injectStatusEvent'] = a => { applyStatusEvent(db, a); setDb(d => applyStatusEvent(d, a)) }
  const injectInvoice: Store['injectInvoice'] = a => { applyInvoice(db, a); setDb(d => applyInvoice(d, a)) }
  const advanceDays: Store['advanceDays'] = a => { applyAdvanceDays(db, a); setDb(d => applyAdvanceDays(d, a)) }

  // Offline demo data has no agents, so Check now here is SIMULATED: a short
  // pause, then "finished". Nothing outside this tab is read.
  // The seed's finished check requests set each failure case's starting day (T65).
  const seedCheck = (): SourceCheck => ({
    last: null, pendingSince: null, asOf: null,
    grantAsOf: Object.fromEntries(((seed as { checkRequests?: { grantId?: string; asOf?: string }[] }).checkRequests ?? []).filter(c => c.grantId && c.asOf).map(c => [c.grantId!, c.asOf!])),
  })
  const [sourceCheck, setSourceCheck] = useState<SourceCheck>(seedCheck)
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
    for (const l of planLines(p)) submitRequest({ item: l.item, category: l.category, price: l.price, grantId: p.plan.grantId, purpose: l.purpose }, by)
  }
  const ownPlan = (id: string, by: Researcher) => {
    const old = plans.find(x => x.id === id)
    if (old && old.by.id !== by.id) throw new Error('Only the researcher who wrote a plan can change it.')
    if (old?.status === 'sent') throw new Error("This plan's lines are already requests; push back on those instead.")
    return old
  }
  const savePlan: Store['savePlan'] = (p, by) => {
    const old = ownPlan(p.id, by)
    if (p.status !== 'draft' && !p.report) throw new Error('Assess the plan before submitting it.')
    if (p.status === 'sent' && p.report?.overall !== 'aligned') throw new Error('Only a plan that clears every check goes straight to purchasing; submit it for review instead.')
    const row = {
      ...p, by, researcher: by.name, savedOn: db.today, decision: undefined,
      submittedOn: p.status === 'draft' ? undefined : db.today, sentOn: p.status === 'sent' ? db.today : undefined,
    }
    setPlans(ps => (old ? ps.map(x => (x.id === p.id ? row : x)) : [row, ...ps]))
    if (row.status === 'sent') sendLines(row, by)
  }
  const deletePlan: Store['deletePlan'] = (id, by) => {
    if (!ownPlan(id, by)) throw new Error(`No plan ${id}.`)
    setPlans(ps => ps.filter(x => x.id !== id))
  }
  const decidePlan: Store['decidePlan'] = (id, choice, reason) => {
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

  const loadDemoSeed: Store['loadDemoSeed'] = () => {
    setDb(structuredClone(seed) as unknown as Db)
    setPlans([])
    setSourceCheck(seedCheck())
  }

  return <Ctx.Provider value={{ db, decide, submitRequest, pushBack, injectStatusEvent, injectInvoice, advanceDays, sourceCheck, checkNow, plans, savePlan, deletePlan, decidePlan, loadDemoSeed }}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
