// Cases window (T53): one page per grant with every problem on it. Each case
// shows the records that conflict, what happened, what's missing and the rule
// it breaks. Information only; decisions live in the Inbox.
import { useStore } from '../data/store'
import type { Grant } from '../data/types'
import { Badge, Empty, Section, type Tone } from '../ui'
import { shortName } from '../plain'
import { buildCases, type Case, type CaseKind, type CaseStatus } from './Cases.model'
import './Cases.css'

const kindLabel: Record<CaseKind, string> = {
  funding: 'Funding', spend: 'Spending', invoice: 'Invoice', purchase: 'Purchase',
  report: 'Progress report', payment_request: 'Payment request', other: 'Other',
}
const statusLabel: Record<CaseStatus, string> = { needs_you: 'Needs you', stopped: 'Stopped by an agent', noted: 'Note', decided: 'Decided' }
const statusTone: Record<CaseStatus, Tone> = { needs_you: 'bad', stopped: 'warn', noted: 'neutral', decided: 'good' }
const groups: { status: CaseStatus; heading: string }[] = [
  { status: 'needs_you', heading: 'Needs your decision' },
  { status: 'stopped', heading: 'Caught and stopped by the agents' },
  { status: 'noted', heading: 'Notes' },
  { status: 'decided', heading: 'Decided' },
]
const choiceLabel: Record<string, string> = { approve: 'Approved', reject: 'Rejected', override: 'Overrode', ask_vendor: 'Asked the vendor', pick_source: 'Picked a source' }

function CaseCard({ c }: { c: Case }) {
  return (
    <article className={`case-card case-${c.status}`} aria-labelledby={`case-${c.id}`}>
      <header>
        <Badge>{kindLabel[c.kind]}</Badge>
        <h4 id={`case-${c.id}`}>{c.title}</h4>
        <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>
      </header>

      <p className="case-conflict"><strong>{c.kind === 'payment_request' ? 'Why it is here:' : "What doesn't add up:"}</strong> {c.conflict}</p>

      {c.records.length > 0 && (
        <>
          <h5 className="case-sub">Records involved</h5>
          <dl className="case-records">
            {c.records.map((r, i) => (
              <div key={i} className={r.tone ? `tone-${r.tone}` : undefined}>
                <dt>{r.href ? <a href={r.href}>{r.label}</a> : r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {c.timeline.length > 0 && (
        <>
          <h5 className="case-sub">What happened</h5>
          <ol className="case-timeline">
            {c.timeline.map((t, i) => <li key={i}><time dateTime={t.day}>{t.day}</time> {t.what}</li>)}
          </ol>
        </>
      )}

      {c.missing && <p className="case-missing"><strong>What's missing:</strong> {c.missing}</p>}

      {c.rules.length > 0 && (
        <ul className="case-rules">
          {c.rules.map((r, i) => (
            <li key={i}>
              <strong>Rule: {r.rule}.</strong> {r.detail}
              {r.auditCase && <span className="case-audit"> Precedent: {r.auditCase}</span>}
            </li>
          ))}
        </ul>
      )}

      <footer>
        {c.decision && (
          <span className="case-decision">
            {choiceLabel[c.decision.choice] ?? c.decision.choice} by the {c.decision.by.replace('_', ' ')} on {c.decision.day}: {c.decision.reason}
          </span>
        )}
        <a href={c.next.href}>{c.next.text}</a>
      </footer>
    </article>
  )
}

function GrantCases({ g, cases }: { g: Grant; cases: Case[] }) {
  const open = cases.filter(c => c.status === 'needs_you').length
  return (
    <Section
      title={`${g.id} · ${shortName(g)}`}
      aside={
        <span className="case-counts">
          {open > 0 ? <Badge tone="bad">{open} {open === 1 ? 'needs' : 'need'} you</Badge> : <Badge tone="good">Nothing waiting</Badge>}
          <span className="case-muted">{cases.length} {cases.length === 1 ? 'case' : 'cases'}</span>
        </span>
      }
    >
      {cases.length === 0 ? <Empty>No problems found on this grant.</Empty> : groups.map(({ status, heading }) => {
        const list = cases.filter(c => c.status === status)
        if (list.length === 0) return null
        return (
          <div key={status} className="case-group">
            <h3 className="case-group-h">{heading} <span className="case-muted">({list.length})</span></h3>
            {list.map(c => <CaseCard key={c.id} c={c} />)}
          </div>
        )
      })}
    </Section>
  )
}

export default function Cases() {
  const { db } = useStore()
  if (db.grants.length === 0) return <Empty>No grants yet.</Empty>
  const all = buildCases(db)
  return (
    <>
      <p className="case-intro">
        Each case puts the records that disagree side by side: a bill and the order it claims to be for,
        a grant's status and the money actually paid, a paper and the grant it credits.
        Every record here looks fine on its own; the problem only shows when they're read together.
      </p>
      {db.grants.map(g => <GrantCases key={g.id} g={g} cases={all.filter(c => c.grantId === g.id)} />)}
    </>
  )
}
