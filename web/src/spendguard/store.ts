// Experiment plans saved in this browser (localStorage), so a researcher's
// draft survives a reload and a submitted plan shows up in the grant office
// portal of the same browser. Not shared between computers: that needs a plan
// table in the database module (Track A).
//
// A plan's lines become ordinary purchase requests once the plan is cleared
// (all three checks pass) or the grant office approves it. Each request's
// purpose starts with "[Plan <id>, line <n> of <N>]", which is how the Requests
// window links it back to its plan until requests get a plan column.
import { useSyncExternalStore } from 'react'
import type { PurchaseRequest } from '../data/types'
import type { Category, Item, Plan, Report } from './assess'

export type PlanStatus = 'draft' | 'submitted' | 'sent' | 'returned'

export interface SavedPlan {
  id: string
  researcher: string // name, as on purchase requests
  status: PlanStatus
  savedOn: string // simulated day
  submittedOn?: string
  /** The grant office's call on a plan that didn't clear on its own. */
  decision?: { choice: 'approve' | 'return'; reason: string; day: string }
  sentOn?: string // its lines went to the purchasing agent
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

// ── Plan lines as purchase requests ─────────────────────────────────────────

/** The purchase-request category the module's rules know, per plan category. */
const REQUEST_CATEGORY: Record<Category, string | null> = {
  'Lab supplies & reagents': 'lab supplies',
  'External services': 'other',
  Equipment: 'equipment',
  Travel: 'travel',
  Personnel: null, // paid through payroll, not bought
}

const amount = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}

/** Why a line is not sent to the purchasing agent; undefined if it is. */
export function notBought(it: Item): string | undefined {
  if (REQUEST_CATEGORY[it.category] === null) return 'Paid through payroll, not bought'
  if (amount(it.cost) === 0) return 'No cost entered'
  return undefined
}

type NewRequest = Pick<PurchaseRequest, 'item' | 'category' | 'price' | 'grantId' | 'purpose' | 'sharedWith'>

/** One purchase request per line that can be bought. */
export function planRequests(p: SavedPlan): NewRequest[] {
  const { items, experiment, grantId } = p.plan
  const what = experiment.trim().length > 160 ? `${experiment.trim().slice(0, 157)}…` : experiment.trim()
  return items.flatMap((it, n) => {
    if (notBought(it)) return []
    const label = it.description.trim() || `${it.category} (item ${n + 1})`
    const why = it.category === 'Travel' && it.purpose.trim() ? `${it.purpose.trim()}${it.destination.trim() ? ` in ${it.destination.trim()}` : ''}. ` : ''
    return [{
      item: label,
      category: REQUEST_CATEGORY[it.category]!,
      price: amount(it.cost),
      grantId,
      purpose: `[Plan ${p.id}, line ${n + 1} of ${items.length}] ${why}For: ${what}`,
      sharedWith: [],
    }]
  })
}

const REF = /^\[Plan (\S+), line (\d+) of (\d+)\]\s*/

/** The plan a request came from, read off its purpose. */
export function planRef(r: Pick<PurchaseRequest, 'purpose'>): { planId: string; line: number; of: number; rest: string } | undefined {
  const m = REF.exec(r.purpose)
  return m ? { planId: m[1], line: Number(m[2]), of: Number(m[3]), rest: r.purpose.slice(m[0].length) } : undefined
}
