// The scene's vocabulary: rule names, outcome words, colours per answer.

import type { LogRow, Outcome, Request } from '../../feed'

export const RULES = [
  { key: 'Grant is active and not frozen', name: 'Grant active and not frozen' },
  { key: "Not in the grant's last 90 days", name: 'Not in the last 90 days (supplies)' },
  { key: 'Enough truly available money', name: 'Enough truly available money' },
  { key: 'Category allowed', name: 'Category allowed' },
  { key: 'Under the card limit', name: 'Under the $5,000 card limit' },
  { key: 'Shared cost split', name: 'Shared cost split across grants' },
]

export const ruleIndex = (rule: string) => (rule.startsWith('Grant exists') ? 0 : RULES.findIndex(r => rule.startsWith(r.key)))

/** Linear RGB, above 1 where the thing gives off light. */
export const TONE: Record<Outcome | 'request' | 'signal' | 'water' | 'paper' | 'coin' | 'cold', [number, number, number]> = {
  request: [1.5, 0.95, 0.42],
  accept: [2.4, 1.65, 0.45],
  refine: [0.62, 1.55, 1.05],
  reject: [2.2, 0.42, 0.24],
  hold: [1.35, 1.2, 2.2],
  signal: [0.55, 0.72, 1.25],
  water: [0.5, 1.15, 1.6],
  paper: [1.5, 1.38, 1.1],
  coin: [2.2, 1.5, 0.5],
  cold: [0.75, 1.25, 1.8],
}

export function answerWord(r: Request) {
  if (!r.outcome) return r.state === 'submitted' ? 'Checking the rules' : r.state
  if (r.outcome === 'accept') return 'Bought'
  if (r.outcome === 'refine') return r.state === 'rerouted' || r.chargedGrantId ? `Rerouted to ${r.chargedGrantId ?? 'another grant'}` : 'Sent back to split the cost'
  if (r.outcome === 'reject') return r.state === 'rejected' ? 'Rejected by the grant manager' : 'Blocked'
  return r.holdFor === 'grant_manager' ? 'Held for the grant manager' : 'Held until money lands'
}

export const OUTCOME_SHORT: Record<Outcome, string> = { accept: 'Bought', refine: 'Rerouted', reject: 'Blocked', hold: 'Held' }

export const ACTOR: Record<LogRow['actor'], string> = {
  purchasing: 'Purchasing',
  bookkeeping: 'Bookkeeping',
  payment_report: 'Payment & report',
  grant_manager: 'Grant manager',
  scientist: 'Researcher',
  system: 'System',
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const longDay = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return `${day} ${MONTHS[m - 1] ?? ''} ${y}`
}
export const shortDay = (d: string) => {
  const [, m, day] = d.split('-').map(Number)
  return `${day} ${(MONTHS[m - 1] ?? '').slice(0, 3)}`
}
