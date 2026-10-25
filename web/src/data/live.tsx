// Live backend (T17): the windows' store, filled from Track A's SpacetimeDB
// module. Subscribes to every table, rebuilds `Db` (adapter.ts) on any
// insert/update/delete, so every open window and tab updates live. Actions
// call the module's reducers; a refusal rejects with the module's reason.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import seed from '../../../sim/demo-seed.json'
import { DbConnection } from '../module_bindings'
import { toDb, toSourceCheck, WORLD_TABLES } from './adapter'
import { applyAdvanceDays, applyInvoice, applyStatusEvent, Ctx, type ItemCheck, type Store } from './store'
import type { Submission } from '../invoice/model'
import type { Researcher } from '../people'
import { planTotal, type Plan, type Report } from '../spendguard/assess'
import { planLines, type PlanStatus, type SavedPlan } from '../spendguard/store'
import type { Db, PersonId, SourceCheck } from './types'

export const STDB_URI: string = import.meta.env.VITE_STDB_URI || 'ws://localhost:3000'
export const STDB_DB: string = import.meta.env.VITE_STDB_DB || 'grantguard'
// Covers the token, the WebSocket, registering and the first sync: a slow venue
// network takes several seconds, and giving up means this tab stops syncing.
const CONNECT_TIMEOUT_MS = 20_000
// Haiku usually answers in a few seconds; past this Ask goes on to the grants unchecked.
const ITEM_CHECK_TIMEOUT_MS = 10_000

/** The loading screen (styles in index.html, which shows the same markup before the bundle loads). */
function Connecting() {
  const [slow, setSlow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setSlow(true), 1500); return () => clearTimeout(t) }, [])
  return (
    <div className="boot" role="status" title={`${STDB_URI} (${STDB_DB})`}>
      <div className="boot-mark">Grant Test Auto</div>
      <div className="boot-bar" aria-hidden="true" />
      <p className="boot-note">{slow ? 'Still connecting. If the server doesn\'t answer, it opens on offline demo data.' : 'Loading the grant office…'}</p>
    </div>
  )
}

export interface LiveInfo {
  status: 'live' | 'disconnected'
  notices: { id: number; text: string }[]
  dismiss: (id: number) => void
}

// Each person is their own identity (the module binds one role per identity,
// a request names who asked, and nobody may approve their own request), so the
// browser keeps one token per person: the grant manager and each researcher.
// Storage can be unavailable; then each load is a new identity.
const tokenKey = (who: string) => `grantguard.token.${who}.${STDB_URI}.${STDB_DB}`
const readToken = (who: string) => { try { return localStorage.getItem(tokenKey(who)) ?? undefined } catch { return undefined } }
const writeToken = (who: string, t: string | null) => {
  try { if (t) localStorage.setItem(tokenKey(who), t); else localStorage.removeItem(tokenKey(who)) } catch { /* storage blocked */ }
}

interface Person { key: string; role: PersonId; name: string }
const GRANT_MANAGER: Person = { key: 'grant_manager', role: 'grant_manager', name: 'Grant manager' }
const asPerson = (r: Researcher): Person => ({ key: `researcher.${r.id}`, role: 'scientist', name: r.name })

/** Connect as `who` and register them. Retries once without a stale stored token. */
function connectAs(
  who: Person,
  on: { connected: (c: DbConnection) => void; failed: (why: string) => void; disconnected?: () => void },
): { get: () => DbConnection; stop: () => void } {
  let conn: DbConnection
  let stopped = false
  const open = (token: string | undefined) => {
    conn = DbConnection.builder()
      .withUri(STDB_URI)
      .withDatabaseName(STDB_DB)
      .withToken(token)
      .onConnect((c, _identity, newToken) => {
        if (stopped) return
        writeToken(who.key, newToken)
        c.reducers.registerPerson({ role: who.role, name: who.name })
          .then(() => on.connected(c))
          .catch(e => on.failed(`Could not register as ${who.name}: ${msg(e)}`))
      })
      .onConnectError((_ctx, e) => {
        if (stopped) return
        if (token) { writeToken(who.key, null); open(undefined); return }
        on.failed(`Could not reach ${STDB_URI} (${STDB_DB}): ${msg(e)}`)
      })
      .onDisconnect(() => { if (!stopped) on.disconnected?.() })
      .build()
  }
  open(readToken(who.key))
  return { get: () => conn, stop: () => { stopped = true; conn.disconnect() } }
}

/** The module's plan rows (T71) in the windows' shape; newest first. */
function toPlans(db: DbConnection['db']): SavedPlan[] {
  return [...db.plan.iter()].map(p => ({
    id: p.id, researcher: p.researcher, status: p.status as PlanStatus, savedOn: p.savedOn,
    submittedOn: p.submittedOn || undefined, sentOn: p.sentOn || undefined,
    decision: p.decisionChoice ? { choice: p.decisionChoice as 'approve' | 'return', reason: p.decisionReason, day: p.decisionDay } : undefined,
    plan: JSON.parse(p.body) as Plan,
    report: p.report ? JSON.parse(p.report) as Report : undefined,
  })).sort((a, b) => b.savedOn.localeCompare(a.savedOn) || b.id.localeCompare(a.id))
}

/** The module's invoice submissions (T112) in the windows' shape; newest first. */
function toSubmissions(db: DbConnection['db']): Submission[] {
  return [...db.invoiceSubmission.iter()]
    .map(r => JSON.parse(r.body) as Submission)
    .sort((a, b) => b.submittedOn.localeCompare(a.submittedOn) || b.id.localeCompare(a.id))
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function LiveStoreProvider({ children, onFail, renderStatus }: {
  children: ReactNode
  /** Connection failed before the first sync: the caller falls back to local data. */
  onFail: (why: string) => void
  renderStatus: (info: LiveInfo) => ReactNode
}) {
  const [db, setDb] = useState<Db | null>(null)
  const [plans, setPlans] = useState<SavedPlan[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [sourceCheck, setSourceCheck] = useState<SourceCheck>({ last: null, pendingSince: null, asOf: null, grantAsOf: {} })
  const [status, setStatus] = useState<LiveInfo['status']>('live')
  const [notices, setNotices] = useState<LiveInfo['notices']>([])
  const manager = useRef<DbConnection | null>(null)
  const researchers = useRef(new Map<string, Promise<DbConnection>>())
  const stops = useRef<(() => void)[]>([])
  const onFailRef = useRef(onFail)
  onFailRef.current = onFail

  const notify = (text: string) => setNotices(n => [...n.slice(-3), { id: Date.now() + Math.random(), text }])

  useEffect(() => {
    let synced = false
    let stopped = false
    const fail = (why: string) => { if (!stopped && !synced) { stopped = true; onFailRef.current(why) } }
    const timer = setTimeout(() => fail(`No answer from ${STDB_URI} within ${CONNECT_TIMEOUT_MS / 1000}s`), CONNECT_TIMEOUT_MS)

    const link = connectAs(GRANT_MANAGER, {
      connected: c => {
        manager.current = c
        // One rebuild per batch of row changes (a reducer touches many rows).
        let queued = false
        const rebuild = () => {
          if (!synced || queued) return
          queued = true
          queueMicrotask(() => { queued = false; if (!stopped) { setDb(toDb(c.db)); setSourceCheck(toSourceCheck(c.db)); setPlans(toPlans(c.db)); setSubmissions(toSubmissions(c.db)) } })
        }
        for (const name of WORLD_TABLES) {
          const t = c.db[name] as unknown as { onInsert(cb: () => void): void; onUpdate(cb: () => void): void; onDelete(cb: () => void): void }
          t.onInsert(rebuild); t.onUpdate(rebuild); t.onDelete(rebuild)
        }
        c.subscriptionBuilder()
          .onApplied(() => {
            synced = true
            clearTimeout(timer)
            const next = toDb(c.db)
            setDb(next)
            setSourceCheck(toSourceCheck(c.db))
            setPlans(toPlans(c.db))
            setSubmissions(toSubmissions(c.db))
            setStatus('live')
            // A wiped world: load the demo world so the windows have something.
            if (next.grants.length === 0) c.reducers.loadSeed({ json: JSON.stringify(seed) }).catch(e => notify(`Loading the demo seed failed: ${msg(e)}`))
          })
          .onError(ctx => fail(`Subscription failed: ${msg((ctx as { event?: unknown }).event)}`))
          .subscribeToAllTables()
      },
      failed: why => { if (synced) notify(why); else fail(why) },
      disconnected: () => { if (synced) setStatus('disconnected') },
    })
    stops.current.push(link.stop)

    return () => {
      stopped = true
      clearTimeout(timer)
      for (const s of stops.current) s()
      stops.current = []
      manager.current = null
      researchers.current.clear()
    }
  }, [])

  if (!db) return <Connecting />

  /** Run a reducer call. It rejects with the module's refusal (or no
   *  connection); `notice` also puts that in a corner notice, for callers that
   *  don't show it themselves. */
  const call = async (what: string, p: () => Promise<void>, notice = false) => {
    try {
      if (!manager.current || status !== 'live') throw new Error('not connected to the server. Reload to reconnect.')
      await p()
    } catch (e) {
      if (notice) notify(`${what} failed: ${msg(e)}`)
      throw e
    }
  }
  const conn = () => manager.current!

  // Requests come from a researcher: their own identity, so the request names
  // them and the grant manager may approve it (nobody approves their own request).
  const asResearcher = (r: Researcher) => {
    const open = researchers.current.get(r.id)
    if (open) return open
    const p = new Promise<DbConnection>((resolve, reject) => {
      const link = connectAs(asPerson(r), { connected: resolve, failed: why => reject(new Error(why)) })
      stops.current.push(link.stop)
    }).catch(e => { researchers.current.delete(r.id); throw e })
    researchers.current.set(r.id, p)
    return p
  }

  const store: Store = {
    db,
    decide: async (holdId, choice, reason) => {
      if (!reason.trim()) throw new Error('A reason is required')
      return call('Decision', () => conn().reducers.decideHold({ holdId: BigInt(holdId), choice, reason }))
    },
    submitRequest: (r, by) =>
      call('Request', async () => {
        const c = await asResearcher(by)
        await c.reducers.submitRequest({ item: r.item, category: r.category, price: r.price, grantId: r.grantId || undefined, purpose: r.purpose, sharedWith: [] })
      }),
    // The worker's bookkeeping agent answers with Haiku (answer_item_check);
    // the answer is read from the grant manager's subscription.
    checkItem: async (a, by) => {
      const unchecked: ItemCheck = { verdict: 'unchecked', why: '', category: '' }
      if (!manager.current || status !== 'live') return unchecked
      const checks = () => [...conn().db.itemCheck.iter()]
      const before = checks().reduce((max, c) => (c.id > max ? c.id : max), 0n)
      // A refusal rejects (Ask shows it); only no answer in time is 'unchecked'.
      const c = await asResearcher(by)
      await c.reducers.askItemCheck({ item: a.item, purpose: a.purpose, price: a.price })
      const deadline = Date.now() + ITEM_CHECK_TIMEOUT_MS
      while (Date.now() < deadline) {
        const mine = checks().find(c => c.id > before && c.answered && c.item === a.item.trim() && c.price === a.price)
        if (mine) return { verdict: mine.verdict as ItemCheck['verdict'], why: mine.why, category: mine.category }
        await new Promise(r => setTimeout(r, 250))
      }
      return unchecked
    },
    pushBack: async (requestId, message, by) => {
      if (!message.trim()) throw new Error('Say what changed.')
      return call('Push back', async () => {
        const c = await asResearcher(by)
        await c.reducers.pushBack({ requestId, message })
      })
    },
    // The local rules run first only to catch bad input synchronously (the
    // Test lab shows those inline); the module decides what really happens.
    injectStatusEvent: async a => {
      applyStatusEvent(db, a)
      return call('Status event', () => conn().reducers.injectStatusEvent({ grantId: a.grantId, kind: a.kind, source: a.source, summary: a.summary, amount: a.amount, day: a.day }))
    },
    injectInvoice: async a => {
      applyInvoice(db, a)
      return call('Invoice', () => conn().reducers.injectInvoice({ orderId: a.orderId, amount: a.amount }), true)
    },
    advanceDays: async a => {
      applyAdvanceDays(db, a)
      return call('Fast-forward', () => conn().reducers.advanceDays({ days: a.days }), true)
    },
    sourceCheck,
    // The worker's bookkeeping agent picks the request up and calls complete_check.
    checkNow: async (asOf, grantId) => {
      if (!manager.current || status !== 'live') throw new Error('not connected to the server; reload to reconnect')
      await conn().reducers.requestCheck({ grantId, reason: 'check_now', asOf })
    },
    plans,
    savePlan: (p, by) =>
      call('Plan', async () => {
        const c = await asResearcher(by)
        await c.reducers.savePlan({
          id: p.id, status: p.status, grantId: p.plan.grantId, experiment: p.plan.experiment, total: planTotal(p.plan.items),
          overall: p.report?.overall ?? '', lines: planLines(p), body: JSON.stringify(p.plan), report: p.report ? JSON.stringify(p.report) : '',
        })
      }),
    deletePlan: (id, by) =>
      call('Deleting the plan', async () => {
        const c = await asResearcher(by)
        await c.reducers.deletePlan({ id })
      }),
    decidePlan: async (id, choice, reason) => {
      if (!reason.trim()) throw new Error('A reason is required.')
      return call('Plan decision', () => conn().reducers.decidePlan({ id, choice, reason }))
    },
    setGrantStatus: async (grantId, status, reason) => {
      if (!reason.trim()) throw new Error('A reason is required.')
      return call('Setting the grant status', () => conn().reducers.setGrantStatus({ grantId, status, reason }))
    },
    submissions,
    saveSubmission: s => call('Saving the invoice', () => conn().reducers.saveInvoiceSubmission({ id: s.id, body: JSON.stringify(s) })),
    loadDemoSeed: () => call('Loading the demo seed', () => conn().reducers.loadSeed({ json: JSON.stringify(seed) })),
  }

  const info: LiveInfo = {
    status,
    notices,
    dismiss: id => setNotices(n => n.filter(x => x.id !== id)),
  }

  return (
    <Ctx.Provider value={store}>
      {children}
      {renderStatus(info)}
    </Ctx.Provider>
  )
}
