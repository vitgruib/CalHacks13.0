// The vocabulary shared by the HUD and the plates: four shapes for four
// answers (the same bodies that roll back to the bench), and plain words.

import type { LogRow, Outcome, Request } from '../../feed'

export const outcomeWord: Record<Outcome, string> = {
  accept: 'Bought',
  refine: 'Rerouted or sent back',
  reject: 'Blocked',
  hold: 'Held',
}

export const previewWord: Record<Outcome, string> = {
  accept: 'Likely bought',
  refine: 'Likely rerouted or sent back',
  reject: 'Likely blocked',
  hold: 'Likely held',
}

/** Yellow ball, cobalt hoop, red cube, black triangle. */
export function Shape({ o, size = 14 }: { o: Outcome; size?: number }) {
  return (
    <svg className="e-shape" width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      {o === 'accept' && <circle cx="7" cy="7" r="5.6" fill="#f2bd0c" stroke="#14171a" strokeWidth="1" />}
      {o === 'refine' && <circle cx="7" cy="7" r="4.6" fill="none" stroke="#1f47b4" strokeWidth="2.8" />}
      {o === 'reject' && <rect x="1.6" y="1.6" width="10.8" height="10.8" fill="#c2331b" />}
      {o === 'hold' && <path d="M7 1.4 13 12.4H1Z" fill="#14171a" />}
    </svg>
  )
}

export function stateWord(r: Request): string {
  if (r.state === 'bought') return 'Bought'
  if (r.state === 'rerouted') return `Rerouted to ${r.chargedGrantId ?? 'the other grant'}`
  if (r.state === 'rejected') return 'Rejected by the grant manager'
  if (r.state === 'waiting_on_manager') return 'Waiting on the grant manager'
  if (r.state === 'blocked') return r.outcome === 'refine' ? 'Sent back: split the cost' : 'Blocked'
  if (r.outcome === 'hold') return 'Held until money lands'
  return 'At the gates'
}

export const actorName: Record<LogRow['actor'], string> = {
  purchasing: 'Purchasing agent',
  bookkeeping: 'Bookkeeping agent',
  payment_report: 'Payment & report agent',
  grant_manager: 'Grant manager',
  scientist: 'Researcher',
  system: 'System',
}

export const niceDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export const niceAction = (a: string) => {
  const s = a.replace(/_/g, ' ').replace(/:\s*/, ': ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
