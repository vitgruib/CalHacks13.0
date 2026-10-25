// Experiment plans (T71): stored in the SpacetimeDB module's plan table, so
// every portal on every computer sees the same plans. The store
// (data/store.tsx, data/live.tsx) holds them; this file has the shape and how
// a plan's lines become purchase requests.
//
// A plan's lines become ordinary purchase requests once the plan is cleared
// (all three checks pass) or the grant office approves it; the module makes
// them. Each request's purpose starts with "[Plan <id>, line <n> of <N>]",
// which is how the Requests window links it back to its plan.
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
  sentOn?: string // its lines went out as requests
  plan: Plan
  report?: Report
}

export const newPlanId = () => `pl-${Date.now().toString(36)}`

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

/** Why a line is not sent as a request; undefined if it is. */
export function notBought(it: Item): string | undefined {
  if (REQUEST_CATEGORY[it.category] === null) return 'Paid through payroll, not bought'
  if (amount(it.cost) === 0) return 'No cost entered'
  return undefined
}

export type PlanLine = Pick<PurchaseRequest, 'item' | 'category' | 'price' | 'purpose'> & { line: number }

/** One purchase request per line that can be bought. */
export function planLines(p: Pick<SavedPlan, 'id' | 'plan'>): PlanLine[] {
  const { items, experiment } = p.plan
  const what = experiment.trim().length > 160 ? `${experiment.trim().slice(0, 157)}…` : experiment.trim()
  return items.flatMap((it, n) => {
    if (notBought(it)) return []
    const label = it.description.trim() || `${it.category} (item ${n + 1})`
    const why = it.category === 'Travel' && it.purpose.trim() ? `${it.purpose.trim()}${it.destination.trim() ? ` in ${it.destination.trim()}` : ''}. ` : ''
    return [{
      line: n + 1,
      item: label,
      category: REQUEST_CATEGORY[it.category]!,
      price: amount(it.cost),
      purpose: `[Plan ${p.id}, line ${n + 1} of ${items.length}] ${why}For: ${what}`,
    }]
  })
}

const REF = /^\[Plan (\S+), line (\d+) of (\d+)\]\s*/

/** The plan a request came from, read off its purpose. */
export function planRef(r: Pick<PurchaseRequest, 'purpose'>): { planId: string; line: number; of: number; rest: string } | undefined {
  const m = REF.exec(r.purpose)
  return m ? { planId: m[1], line: Number(m[2]), of: Number(m[3]), rest: r.purpose.slice(m[0].length) } : undefined
}
