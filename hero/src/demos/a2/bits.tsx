// Text helpers shared by the HUD and the panels.

import type { LogRow } from '../../feed'

export const ACTOR: Record<LogRow['actor'], string> = {
  purchasing: 'Purchasing agent',
  bookkeeping: 'Bookkeeping agent',
  payment_report: 'Payment & report agent',
  grant_manager: 'Grant manager',
  scientist: 'Researcher',
  system: 'System',
}

export const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function LedgerRows({ rows }: { rows: LogRow[] }) {
  return (
    <ol className="a-ledger-rows">
      {rows.map(r => (
        <li key={r.id}>
          <span className="a-ledger-who">{ACTOR[r.actor]}</span>
          <span className="a-ledger-what">{r.action.replace(/_/g, ' ')}</span>
          <span className="a-ledger-why">{r.reason}</span>
        </li>
      ))}
    </ol>
  )
}
