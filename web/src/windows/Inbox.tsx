// Inbox: the grant manager's window, and the ONLY window with decision buttons.
// Everything waiting for a human decision, with its evidence. A reason is
// always required (MASTER-PLAN §2).
import { useId, useState } from 'react'
import { useStore } from '../data/store'
import type { AgentId, Decision, Hold, HoldKind } from '../data/types'
import { Badge, Empty, Section } from '../ui'
import { requesterLabel } from '../people'
import './Inbox.css'

const choiceLabel: Record<Decision['choice'], string> = {
  approve: 'Approve',
  reject: 'Reject',
  override: 'Override',
  ask_vendor: 'Ask vendor',
  pick_source: 'Pick this source',
}

const decidedLabel: Record<Decision['choice'], string> = {
  approve: 'Approved',
  reject: 'Rejected',
  override: 'Overrode',
  ask_vendor: 'Asked vendor',
  pick_source: 'Picked a source',
}

const kindLabel: Record<HoldKind, string> = {
  purchase: 'Purchase',
  invoice: 'Invoice',
  payment_request: 'Payment request',
  follow_up: 'Follow-up question',
  report: 'Progress report',
  source_disagreement: 'Sources disagree',
  paid_while_canceled: 'Paid while canceled',
}

const agentLabel: Record<AgentId, string> = {
  purchasing: 'Purchasing agent',
  bookkeeping: 'Bookkeeping agent',
  payment_report: 'Payment and report agent',
}

const personLabel: Record<string, string> = {
  grant_manager: 'Grant manager',
  scientist: 'Researcher',
  funder: 'Government funder',
}

/** Where the referenced item lives. */
const kindLink: Record<HoldKind, { href: string; label: string }> = {
  purchase: { href: '#requests', label: 'Requests' },
  invoice: { href: '#invoices', label: 'Invoices' },
  payment_request: { href: '#payment-requests', label: 'Payment requests' },
  follow_up: { href: '#payment-requests', label: 'Payment requests' },
  report: { href: '#reports', label: 'Reports' },
  source_disagreement: { href: '#funds', label: 'Funds' },
  paid_while_canceled: { href: '#funds', label: 'Funds' },
}

/** Each source once, its newest reading ("canceled (2026-06-15)"); later rows win a tie. */
function latestPerSource(evidence: Hold['evidence']): Hold['evidence'] {
  const dayOf = (v: string) => v.match(/\((\d{4}-\d{2}-\d{2})\)\s*$/)?.[1] ?? ''
  const best = new Map<string, Hold['evidence'][number]>()
  for (const e of evidence) {
    const had = best.get(e.label)
    if (!had || dayOf(e.value) >= dayOf(had.value)) best.set(e.label, e)
  }
  return [...best.values()]
}

const byDayThenId = (a: Hold, b: Hold) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id)

export default function Inbox() {
  const { db } = useStore()
  const open = db.holds.filter(h => !h.decision).sort(byDayThenId)
  const decided = db.holds
    .filter(h => h.decision)
    .sort((a, b) => b.decision!.day.localeCompare(a.decision!.day) || a.id.localeCompare(b.id))

  return (
    <div className="inbox">
      <Section title="Waiting for you" aside={<Badge tone={open.length ? 'warn' : 'good'}>{open.length} open</Badge>}>
        {open.length === 0 ? (
          <Empty>Nothing waiting. The agents will put anything that needs you here.</Empty>
        ) : (
          <ol className="hold-list">
            {open.map(h => (
              <li key={h.id}>
                <HoldCard hold={h} />
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Decided" aside={<Badge>{decided.length}</Badge>}>
        {decided.length === 0 ? (
          <Empty>No decisions yet.</Empty>
        ) : (
          <details className="decided">
            <summary>Show {decided.length} decided {decided.length === 1 ? 'item' : 'items'}</summary>
            <table>
              <thead>
                <tr><th>Item</th><th>Choice</th><th>Reason</th><th>Who</th><th>When</th></tr>
              </thead>
              <tbody>
                {decided.map(h => (
                  <tr key={h.id}>
                    <td>
                      {h.title}
                      <div className="muted">{kindLabel[h.kind]} · {h.grantId} · <a href={kindLink[h.kind].href}>{kindLink[h.kind].label}</a></div>
                    </td>
                    <td><Badge tone={h.decision!.choice === 'reject' ? 'bad' : 'neutral'}>{decidedLabel[h.decision!.choice]}</Badge></td>
                    <td>{h.decision!.reason}</td>
                    <td>{personLabel[h.decision!.by] ?? h.decision!.by}</td>
                    <td>{h.decision!.day}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </Section>
    </div>
  )
}

function HoldCard({ hold }: { hold: Hold }) {
  const { db, decide } = useStore()
  // A purchase hold says which researcher asked, so the grant office knows who to answer.
  const request = hold.kind === 'purchase' ? db.requests.find(r => r.id === hold.refId) : undefined
  const [reason, setReason] = useState('')
  const [source, setSource] = useState('')
  const reasonId = useId()
  const sourceId = useId()
  const hasReason = reason.trim() !== ''
  const picksSource = hold.options.includes('pick_source')
  const link = kindLink[hold.kind]
  // Source readings: show each source once, as it reads now.
  const evidence = hold.kind === 'source_disagreement' ? latestPerSource(hold.evidence) : hold.evidence

  const onDecide = (choice: Decision['choice']) => {
    const text = choice === 'pick_source' ? `Source picked: ${source}. ${reason.trim()}` : reason.trim()
    decide(hold.id, choice, text)
  }

  return (
    <article className="hold" aria-labelledby={`${reasonId}-title`}>
      <header>
        <h3 id={`${reasonId}-title`}>{hold.title}</h3>
        <Badge tone="warn">{kindLabel[hold.kind]}</Badge>
      </header>
      <p className="meta">
        Grant {hold.grantId} · raised by {agentLabel[hold.raisedBy]} · {hold.day} · <a href={link.href}>Open in {link.label}</a>
      </p>
      {request && <p className="requested-by">Requested by <strong>{requesterLabel(request.requesterName)}</strong> on {request.day}</p>}
      <p className="why"><strong>Why it's waiting:</strong> {hold.why}</p>

      {evidence.length > 0 && (
        <dl className="evidence">
          {evidence.map((e, i) => (
            <div key={`${i}-${e.label}`}>
              <dt>{e.label}</dt>
              <dd>{e.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {picksSource && (
        <div className="field">
          <label htmlFor={sourceId}>Which source is right?</label>
          <select id={sourceId} value={source} onChange={e => setSource(e.target.value)}>
            <option value="">Choose a source…</option>
            {[...new Set(evidence.map(e => e.label))].map(label => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor={reasonId}>Your reason (required, goes in the log)</label>
        <textarea
          id={reasonId}
          rows={2}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Why are you deciding this way?"
        />
      </div>

      <div className="actions">
        {hold.options.map(choice => {
          const disabled = !hasReason || (choice === 'pick_source' && !source)
          return (
            <button
              key={choice}
              type="button"
              className={choice === 'approve' || choice === 'pick_source' ? 'primary' : choice === 'reject' ? 'danger' : ''}
              disabled={disabled}
              onClick={() => onDecide(choice)}
            >
              {choiceLabel[choice]}
            </button>
          )
        })}
        {!hasReason && <span className="hint">Type a reason to enable the buttons.</span>}
        {hasReason && picksSource && !source && <span className="hint">Choose a source to pick it.</span>}
      </div>
    </article>
  )
}
