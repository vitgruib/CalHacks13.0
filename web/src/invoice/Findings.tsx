// What the invoice agent found, the budget effect and the audit trail; used by
// the researcher's form and by both persona views.
import { Badge, money, type Tone } from '../ui'
import type { AuditEntry, BudgetEffect, Finding, Status } from './model'
import { STATUS_LABEL } from './model'

const levelTone: Record<Finding['level'], Tone> = { ok: 'good', warn: 'warn', block: 'bad' }
const levelWord: Record<Finding['level'], string> = { ok: 'OK', warn: 'Check', block: 'Problem' }
export const statusTone: Record<Status, Tone> = { ready: 'good', exception: 'bad', clarification: 'warn', escalated: 'warn', approved: 'good', rejected: 'neutral' }

export function StatusBadge({ status }: { status: Status }) {
  return <Badge tone={statusTone[status]}>{STATUS_LABEL[status]}</Badge>
}

export function FindingList({ findings, hideOk = false }: { findings: Finding[]; hideOk?: boolean }) {
  const shown = hideOk ? findings.filter(f => f.level !== 'ok') : findings
  if (shown.length === 0) return <p className="iv-note">Nothing to flag.</p>
  return (
    <ul className="iv-findings">
      {shown.map((f, i) => (
        <li key={i} className={`iv-f iv-f-${f.level}`}>
          <div className="iv-f-head">
            <Badge tone={levelTone[f.level]}>{levelWord[f.level]}</Badge>
            <span className="iv-area">{f.area}</span>
            <strong>{f.title}</strong>
          </div>
          <p>{f.detail}</p>
          {f.evidence && <ul className="iv-evidence">{f.evidence.map(e => <li key={e}>{e}</li>)}</ul>}
        </li>
      ))}
    </ul>
  )
}

export function BudgetCard({ effect, grantLabel }: { effect: BudgetEffect; grantLabel: string }) {
  return (
    <dl className="iv-budget" aria-label={`Budget effect on ${grantLabel}`}>
      <div><dt>Available on {grantLabel}</dt><dd>{money(effect.available)}</dd></div>
      {effect.committedForPo > 0 && <div><dt>Already committed for the purchase order</dt><dd>{money(effect.committedForPo)}</dd></div>}
      <div><dt>Added by this invoice</dt><dd>{effect.extra > 0 ? `+ ${money(effect.extra)}` : money(0)}</dd></div>
      <div className="iv-eq"><dt>Available after payment</dt><dd className={effect.after < 0 ? 'iv-neg' : ''}>{money(effect.after)}</dd></div>
    </dl>
  )
}

export function AuditTrail({ audit }: { audit: AuditEntry[] }) {
  return (
    <ol className="iv-audit">
      {audit.map((a, i) => (
        <li key={i}>
          <time>{a.day}</time> <strong>{a.who}</strong> {a.what}
          {a.why && <span className="iv-why">“{a.why}”</span>}
        </li>
      ))}
    </ol>
  )
}

/** The big arrow on each invoice card: opens the full invoice page. */
export function OpenInvoice({ id, vendor }: { id: string; vendor: string }) {
  return (
    <a className="iv-go" href={`#invoices/${id}`} aria-label={`Open the full invoice from ${vendor}`} title="Open the full invoice">
      <svg viewBox="0 0 40 24" width="40" height="24" aria-hidden="true"><path d="M3 12h31M24 3l11 9-11 9" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </a>
  )
}
