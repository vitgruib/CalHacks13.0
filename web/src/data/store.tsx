// Local stand-in for Track A's actions and live subscriptions. T17 swaps
// this for the SpacetimeDB client; windows only use useDb() and the actions.
import { createContext, useContext, useState, type ReactNode } from 'react'
import seed from '../../../sim/seed.json'
import type { Db, Decision, PurchaseRequest } from './types'

interface Store {
  db: Db
  /** Grant manager decides a hold. Reason is required (MASTER-PLAN §2). */
  decide: (holdId: string, choice: Decision['choice'], reason: string) => void
  /** Scientist submits a purchase request; the purchasing agent picks it up. */
  submitRequest: (r: Pick<PurchaseRequest, 'item' | 'category' | 'price' | 'grantId' | 'purpose'>) => void
}

const Ctx = createContext<Store | null>(null)

let seq = 0
const nextId = (p: string) => `${p}-local-${++seq}`

export function StoreProvider({ children }: { children: ReactNode }) {
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

  const submitRequest: Store['submitRequest'] = r => {
    setDb(d => {
      const id = nextId('rq')
      return {
        ...d,
        requests: [...d.requests, { ...r, id, day: d.today, requester: 'scientist', state: 'submitted', verdicts: [], explanation: 'Waiting for the purchasing agent.' }],
        log: [...d.log, { id: nextId('l'), day: d.today, actor: 'scientist', action: `Submitted request: ${r.item}`, reason: r.purpose, refId: id }],
      }
    })
  }

  return <Ctx.Provider value={{ db, decide, submitRequest }}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
