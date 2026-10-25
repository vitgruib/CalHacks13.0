// The store every window reads (useStore). Two backends fill it: this local
// in-memory one (sim/seed.json, no server) and the live SpacetimeDB one in
// live.tsx; backend.tsx picks between them (T17).
import { createContext, useContext, useState, type ReactNode } from 'react'
import seed from '../../../sim/seed.json'
import type { Researcher } from '../people'
import type { Db, Decision, Invoice, PurchaseRequest, SourceCheck, StatusEvent } from './types'

export interface Store {
  db: Db
  /** Grant manager decides a hold. Reason is required (MASTER-PLAN §2). */
  decide: (holdId: string, choice: Decision['choice'], reason: string) => void
  /** A researcher submits a purchase request as themselves; the purchasing agent picks it up. */
  submitRequest: (r: Pick<PurchaseRequest, 'item' | 'category' | 'price' | 'grantId' | 'purpose' | 'sharedWith' | 'oneGrantBasis'>, by: Researcher) => void
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
   *  YYYY-MM-DD; none = today). Rejects if the request couldn't be sent. */
  checkNow: (asOf?: string) => Promise<void>
}

export type InjectStatusEventArgs = Pick<StatusEvent, 'grantId' | 'kind' | 'source' | 'summary'> & { amount?: number }

export const Ctx = createContext<Store | null>(null)

let seq = 0
const nextId = (p: string) => `${p}-local-${++seq}`

const DAY_MS = 86_400_000
const SIMULATED_CHECK_MS = 2500
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10)
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** The raw world's consequence of a status event (no agents run here):
 *  canceled freezes; a court order restores the status but stays frozen
 *  (a court order isn't cash); a payment adds to received and unfreezes. */
export function applyStatusEvent(d: Db, a: InjectStatusEventArgs): Db {
  const g = d.grants.find(x => x.id === a.grantId)
  if (!g) throw new Error(`No grant ${a.grantId}`)
  if (a.kind === 'payment_received' && !(a.amount && a.amount > 0)) throw new Error('A payment needs an amount above zero')
  const ev: StatusEvent = { id: nextId('se'), grantId: a.grantId, day: d.today, kind: a.kind, source: a.source, summary: a.summary }
  if (a.amount != null) ev.amount = a.amount
  const events = [ev]
  const log = [{ id: nextId('l'), day: d.today, actor: 'system' as const, action: `Injected ${a.kind} on ${a.grantId}`, reason: a.summary, refId: ev.id }]
  let next = { ...g }
  if (a.kind === 'canceled') {
    next = { ...next, status: 'canceled', frozen: true, frozenReason: `Canceled ${d.today} (${a.source}). Spending stays frozen until a payment arrives after the cancellation.` }
  } else if (a.kind === 'court_order') {
    next = { ...next, status: 'restored_by_court' }
  } else if (a.kind === 'payment_received') {
    next = { ...next, received: g.received + a.amount! }
    // An open sources-disagree flag keeps it frozen until the grant manager
    // decides, as in the module (rules.ts freezeState).
    const disagree = d.flags.some(f => f.grantId === g.id && f.open && f.kind === 'sources_disagree')
    if (g.frozen && disagree) {
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
  const [sourceCheck, setSourceCheck] = useState<SourceCheck>({ last: null, pendingSince: null, asOf: null })
  const checkNow: Store['checkNow'] = async asOf => {
    const id = nextId('check')
    setSourceCheck(c => ({ ...c, pendingSince: new Date(), asOf: asOf ?? null }))
    setDb(d => ({ ...d, log: [...d.log, { id: nextId('l'), day: d.today, actor: 'grant_manager', action: 'Asked for a source check', reason: `check now${asOf ? `, cancellation list as of ${asOf}` : ''}`, refId: id }] }))
    setTimeout(() => {
      setSourceCheck({ last: { at: new Date(), what: 'all grants (simulated: offline demo data, no sources read)' }, pendingSince: null, asOf: asOf ?? null })
      setDb(d => ({ ...d, log: [...d.log, { id: nextId('l'), day: d.today, actor: 'bookkeeping', action: 'Finished a source check', reason: 'all grants (simulated offline)', refId: id }] }))
    }, SIMULATED_CHECK_MS)
  }

  return <Ctx.Provider value={{ db, decide, submitRequest, pushBack, injectStatusEvent, injectInvoice, advanceDays, sourceCheck, checkNow }}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
