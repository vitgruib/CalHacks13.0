// Live backend (T17): the windows' store, filled from Track A's SpacetimeDB
// module. Subscribes to every table, rebuilds `Db` (adapter.ts) on any
// insert/update/delete, so every open window and tab updates live. Actions
// call the module's reducers; failures come back as notices.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import seed from '../../../sim/seed.json'
import { DbConnection } from '../module_bindings'
import { toDb, WORLD_TABLES } from './adapter'
import { applyAdvanceDays, applyInvoice, applyStatusEvent, Ctx, type Store } from './store'
import type { Db, PersonId } from './types'

export const STDB_URI: string = import.meta.env.VITE_STDB_URI || 'ws://localhost:3000'
export const STDB_DB: string = import.meta.env.VITE_STDB_DB || 'grantguard'
const CONNECT_TIMEOUT_MS = 5000

export interface LiveInfo {
  status: 'live' | 'disconnected'
  notices: { id: number; text: string }[]
  dismiss: (id: number) => void
  loadDemoSeed: () => void
}

// Each person role is its own identity (the module binds one role per
// identity, and nobody may approve their own request), so the browser keeps
// one token per role. Storage can be unavailable; then each load is a new identity.
const tokenKey = (role: PersonId) => `grantguard.token.${role}.${STDB_URI}.${STDB_DB}`
const readToken = (role: PersonId) => { try { return localStorage.getItem(tokenKey(role)) ?? undefined } catch { return undefined } }
const writeToken = (role: PersonId, t: string | null) => {
  try { if (t) localStorage.setItem(tokenKey(role), t); else localStorage.removeItem(tokenKey(role)) } catch { /* storage blocked */ }
}

const roleName: Record<PersonId, string> = { grant_manager: 'Grant manager', scientist: 'Scientist', funder: 'Funder' }

/** Connect as `role` and register it. Retries once without a stale stored token. */
function connectAs(
  role: PersonId,
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
        writeToken(role, newToken)
        c.reducers.registerPerson({ role, name: roleName[role] })
          .then(() => on.connected(c))
          .catch(e => on.failed(`Could not register as ${roleName[role]}: ${msg(e)}`))
      })
      .onConnectError((_ctx, e) => {
        if (stopped) return
        if (token) { writeToken(role, null); open(undefined); return }
        on.failed(`Could not reach ${STDB_URI} (${STDB_DB}): ${msg(e)}`)
      })
      .onDisconnect(() => { if (!stopped) on.disconnected?.() })
      .build()
  }
  open(readToken(role))
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
  const [status, setStatus] = useState<LiveInfo['status']>('live')
  const [notices, setNotices] = useState<LiveInfo['notices']>([])
  const manager = useRef<DbConnection | null>(null)
  const scientist = useRef<Promise<DbConnection> | null>(null)
  const stops = useRef<(() => void)[]>([])
  const onFailRef = useRef(onFail)
  onFailRef.current = onFail

  const notify = (text: string) => setNotices(n => [...n.slice(-3), { id: Date.now() + Math.random(), text }])

  useEffect(() => {
    let synced = false
    let stopped = false
    const fail = (why: string) => { if (!stopped && !synced) { stopped = true; onFailRef.current(why) } }
    const timer = setTimeout(() => fail(`No answer from ${STDB_URI} within ${CONNECT_TIMEOUT_MS / 1000}s`), CONNECT_TIMEOUT_MS)

    const link = connectAs('grant_manager', {
      connected: c => {
        manager.current = c
        // One rebuild per batch of row changes (a reducer touches many rows).
        let queued = false
        const rebuild = () => {
          if (!synced || queued) return
          queued = true
          queueMicrotask(() => { queued = false; if (!stopped) setDb(toDb(c.db)) })
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
      scientist.current = null
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

  // Requests come from a scientist: a second identity, so the grant manager
  // may approve them (nobody approves their own request).
  const asScientist = () => {
    scientist.current ??= new Promise<DbConnection>((resolve, reject) => {
      const link = connectAs('scientist', { connected: resolve, failed: why => reject(new Error(why)) })
      stops.current.push(link.stop)
    }).catch(e => { scientist.current = null; throw e })
    return scientist.current
  }

  const store: Store = {
    db,
    decide: (holdId, choice, reason) => {
      if (!reason.trim()) throw new Error('A reason is required')
      call('Decision', () => conn().reducers.decideHold({ holdId: BigInt(holdId), choice, reason }))
    },
    submitRequest: r => {
      call('Request', async () => {
        const c = await asScientist()
        await c.reducers.submitRequest({ item: r.item, category: r.category, price: r.price, grantId: r.grantId || undefined, purpose: r.purpose, sharedWith: [] })
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
