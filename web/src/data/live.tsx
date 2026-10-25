// Live backend (T17): the windows' store, filled from Track A's SpacetimeDB
// module. Subscribes to every table, rebuilds `Db` (adapter.ts) on any
// insert/update/delete, so every open window and tab updates live. Actions
// call the module's reducers; failures come back as notices.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import seed from '../../../sim/seed.json'
import { DbConnection } from '../module_bindings'
import { toDb, toSourceCheck, WORLD_TABLES } from './adapter'
import { applyAdvanceDays, applyInvoice, applyStatusEvent, Ctx, type Store } from './store'
import type { Researcher } from '../people'
import type { Db, PersonId, SourceCheck } from './types'

export const STDB_URI: string = import.meta.env.VITE_STDB_URI || 'ws://localhost:3000'
export const STDB_DB: string = import.meta.env.VITE_STDB_DB || 'grantguard'
const CONNECT_TIMEOUT_MS = 5000

export interface LiveInfo {
  status: 'live' | 'disconnected'
  notices: { id: number; text: string }[]
  dismiss: (id: number) => void
  loadDemoSeed: () => void
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

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function LiveStoreProvider({ children, onFail, renderStatus }: {
  children: ReactNode
  /** Connection failed before the first sync: the caller falls back to local data. */
  onFail: (why: string) => void
  renderStatus: (info: LiveInfo) => ReactNode
}) {
  const [db, setDb] = useState<Db | null>(null)
  const [sourceCheck, setSourceCheck] = useState<SourceCheck>({ last: null, pendingSince: null, asOf: null })
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
          queueMicrotask(() => { queued = false; if (!stopped) { setDb(toDb(c.db)); setSourceCheck(toSourceCheck(c.db)) } })
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

  if (!db) return <div className="backend-connecting">Connecting to SpacetimeDB at {STDB_URI} ({STDB_DB})…</div>

  /** Run a reducer call; its failure (e.g. a rule the module enforces) becomes a notice. */
  const call = (what: string, p: () => Promise<void>) => {
    const c = manager.current
    if (!c || status !== 'live') { notify(`${what} failed: not connected to the server. Reload to reconnect.`); return }
    p().catch(e => notify(`${what} failed: ${msg(e)}`))
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
    decide: (holdId, choice, reason) => {
      if (!reason.trim()) throw new Error('A reason is required')
      call('Decision', () => conn().reducers.decideHold({ holdId: BigInt(holdId), choice, reason }))
    },
    submitRequest: (r, by) => {
      call('Request', async () => {
        const c = await asResearcher(by)
        await c.reducers.submitRequest({ item: r.item, category: r.category, price: r.price, grantId: r.grantId || undefined, purpose: r.purpose, sharedWith: r.sharedWith ?? [], oneGrantBasis: r.oneGrantBasis || undefined })
      })
    },
    pushBack: (requestId, message, by) => {
      if (!message.trim()) throw new Error('Say what changed.')
      call('Push back', async () => {
        const c = await asResearcher(by)
        await c.reducers.pushBack({ requestId, message })
      })
    },
    // The local rules run first only to catch bad input synchronously (the
    // Test lab shows those inline); the module decides what really happens.
    injectStatusEvent: a => {
      applyStatusEvent(db, a)
      call('Status event', () => conn().reducers.injectStatusEvent({ grantId: a.grantId, kind: a.kind, source: a.source, summary: a.summary, amount: a.amount }))
    },
    injectInvoice: a => {
      applyInvoice(db, a)
      call('Invoice', () => conn().reducers.injectInvoice({ orderId: a.orderId, amount: a.amount }))
    },
    advanceDays: a => {
      applyAdvanceDays(db, a)
      call('Fast-forward', () => conn().reducers.advanceDays({ days: a.days }))
    },
    sourceCheck,
    // The worker's bookkeeping agent picks the request up and calls complete_check.
    checkNow: async asOf => {
      if (!manager.current || status !== 'live') throw new Error('not connected to the server; reload to reconnect')
      await conn().reducers.requestCheck({ grantId: undefined, reason: 'check_now', asOf })
    },
  }

  const info: LiveInfo = {
    status,
    notices,
    dismiss: id => setNotices(n => n.filter(x => x.id !== id)),
    loadDemoSeed: () => call('Loading the demo seed', () => conn().reducers.loadSeed({ json: JSON.stringify(seed) })),
  }

  return (
    <Ctx.Provider value={store}>
      {children}
      {renderStatus(info)}
    </Ctx.Provider>
  )
}
