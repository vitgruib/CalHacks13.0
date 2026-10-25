// SpendGuard plans saved in this browser (localStorage), so a researcher's
// draft survives a reload and a submitted plan shows up in the grant office
// portal of the same browser. Not shared between computers: that needs a table
// in the database module (Track A).
import { useSyncExternalStore } from 'react'
import type { Plan, Report } from './assess'

export interface SavedPlan {
  id: string
  researcher: string // name, as on purchase requests
  status: 'draft' | 'submitted'
  savedOn: string // simulated day
  submittedOn?: string
  plan: Plan
  report?: Report
}

const KEY = 'spendguard.plans'
const listeners = new Set<() => void>()
let cache: SavedPlan[] | null = null

function read(): SavedPlan[] {
  if (cache) return cache
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedPlan[] } catch { cache = [] }
  return cache
}
function write(next: SavedPlan[]) {
  cache = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* kept in memory for this tab only */ }
  listeners.forEach(l => l())
}
addEventListener('storage', e => { if (e.key === KEY) { cache = null; listeners.forEach(l => l()) } })

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export const usePlans = () => useSyncExternalStore(subscribe, read)

export function savePlan(p: SavedPlan) {
  const all = read()
  write(all.some(x => x.id === p.id) ? all.map(x => (x.id === p.id ? p : x)) : [p, ...all])
}
export const deletePlan = (id: string) => write(read().filter(x => x.id !== id))
export const newPlanId = () => `sg-${Date.now().toString(36)}`
