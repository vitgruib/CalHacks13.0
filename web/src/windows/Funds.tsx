// Funds window (MASTER-PLAN §3.1, §4): how much money each grant really has,
// how much of the award the funder has actually paid (T116), its status
// timeline, and any flags. The Inbox items about a grant itself (sources
// disagree, money on a canceled grant) are decided on its card with
// the Inbox's own card (`HoldCard`), as Requests and Invoices do for theirs:
// the Inbox's menu button is hidden (T110). `#funds/<grant id>` opens Funds on
// that grant's card.
import { useEffect, useId, useState } from 'react'
import SourceCheck from '../SourceCheck'
import MoneyCharts from '../charts/MoneyCharts'
import Received from '../charts/Received'
import { useStore } from '../data/store'
import { type Db, type Decision, type Grant, type GrantStatus, type HoldKind, type SourceReading, type StatusEvent } from '../data/types'
import { Badge, Empty, Section, grantStatus, money, type Tone } from '../ui'
import { SIM_NOTE, grantHeading } from '../plain'
import EdgeGroup from '../EdgeGroup'
import { edgeCaseOf, isEdgeGrant } from '../people'
import { whyFrozen } from '../frozen'
import { HoldCard, openHolds } from './Inbox'
import './Funds.css'

/** Inbox items about a grant itself, not one request or invoice: decided on the grant's Funds card. */
export const GRANT_HOLDS: HoldKind[] = ['source_disagreement', 'paid_while_canceled']

/** The link that opens Funds on one grant's card. */
export const fundsHref = (grantId: string) => `#funds/${encodeURIComponent(grantId)}`

const cardId = (grantId: string) => `funds-${grantId}`

/** Scroll to a grant's card, unfolding the Edge cases group when the card is in it. */
function showGrant(grantId: string) {
  const el = document.getElementById(cardId(grantId))
  if (!el) return
  const group = el.closest('details')
  if (group) group.open = true
  el.closest('.section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const decidedLabel: Record<Decision['choice'], string> = {
  approve: 'Approved.',
  reject: 'Rejected.',
  ask_vendor: 'Asked the vendor.',
  pick_source: '', // its reason already starts "Source picked: …"
}
const personLabel: Record<string, string> = { grant_manager: 'Grant manager', scientist: 'Researcher', funder: 'Government funder' }

const statusLabel: Record<GrantStatus, string> = {
  active: 'Active',
  canceled: 'Canceled',
  restored_by_court: 'Restored by court',
  ended: 'Ended',
}
const statusTone: Record<GrantStatus, Tone> = { active: 'good', canceled: 'bad', restored_by_court: 'warn', ended: 'neutral' }

const eventLabel: Record<StatusEvent['kind'], string> = {
  canceled: 'Canceled',
  court_order: 'Court order',
  payment_received: 'Payment received',
  reading_changed: 'Source changed',
  unfrozen: 'Active again',
}
const eventTone: Record<StatusEvent['kind'], Tone> = {
  canceled: 'bad', court_order: 'warn', payment_received: 'good', reading_changed: 'neutral', unfrozen: 'good',
}

const DAY_MS = 86_400_000
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)
const byDay = <T extends { day: string }>(a: T, b: T) => a.day.localeCompare(b.day)

/** Latest reading per source for one grant. */
function latestReadings(readings: SourceReading[]): SourceReading[] {
  const latest = new Map<string, SourceReading>()
  for (const r of [...readings].sort(byDay)) latest.set(r.source, r)
  return [...latest.values()]
}

export default function Funds() {
  const { db } = useStore()
  const ready = db.grants.length > 0
  // Live, the grants arrive after the first render: scroll once they're in.
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(location.hash.split('/')[1] ?? '')
      if (id) showGrant(id)
    }
    go()
    addEventListener('hashchange', go)
    return () => removeEventListener('hashchange', go)
  }, [ready])

  if (!ready) return <Empty>No grants yet.</Empty>
  const waiting = openHolds(db, ...GRANT_HOLDS)
  return (
    <>
      <SourceCheck />
      {waiting.length > 0 && (
        <p className="funds-waiting">
          <Badge tone="warn">{waiting.length} waiting for you</Badge>
          {waiting.map(h => (
            <a key={h.id} href={fundsHref(h.grantId)} onClick={() => showGrant(h.grantId)}>{h.title}</a>
          ))}
        </p>
      )}
      <div className="funds-grid">{db.grants.filter(g => !isEdgeGrant(g)).map(g => <GrantCard key={g.id} g={g} db={db} />)}</div>
      <EdgeGroup count={db.grants.filter(isEdgeGrant).length}>
        <div className="funds-grid">{db.grants.filter(isEdgeGrant).map(g => <GrantCard key={g.id} g={g} db={db} />)}</div>
      </EdgeGroup>
      <p className="funds-sim-note">{SIM_NOTE}</p>
    </>
  )
}

function GrantCard({ g, db }: { g: Grant; db: Db }) {
  const daysLeft = daysBetween(db.today, g.end)
  const edgeCase = edgeCaseOf(g)
  const holds = openHolds(db, ...GRANT_HOLDS).filter(h => h.grantId === g.id)
  const decided = db.holds
    .filter(h => h.grantId === g.id && GRANT_HOLDS.includes(h.kind) && h.decision)
    .sort((a, b) => b.decision!.day.localeCompare(a.decision!.day) || a.id.localeCompare(b.id))

  return (
    <Section
      title={grantHeading(g)}
      aside={
        <span className="funds-badges">
          {edgeCase && <Badge tone="neutral">Edge case: {edgeCase}</Badge>}
          <Badge tone={grantStatus(g).tone}>{grantStatus(g).label}</Badge>
          {g.frozen && g.status !== 'ended' && <Badge tone="bad">Spending paused</Badge>}
        </span>
      }
    >
      <p className="funds-meta" id={cardId(g.id)}>
        {g.id} · {g.pi} · {g.agency} · {g.start} to {g.end}
        {daysLeft >= 0 && daysLeft <= 90 && <> <Badge tone="warn">last 90 days</Badge></>}
      </p>

      {(g.status === 'canceled' || g.status === 'restored_by_court') && <MarkActive db={db} g={g} />}
      {holds.map(h => <HoldCard key={h.id} hold={h} embedded />)}
      {decided.map(h => (
        <p key={h.id} className="funds-decided">
          <span className="funds-muted">{personLabel[h.decision!.by] ?? h.decision!.by}, {h.decision!.day}, on “{h.title}”: </span>
          {decidedLabel[h.decision!.choice]} {h.decision!.reason}
        </p>
      ))}

      <Received g={g} />
      <MoneyCharts db={db} g={g} details />
    </Section>
  )
}

/** A canceled or court-restored grant: why spending is paused, and the grant
 *  manager confirming it is live (unfreeze_grant). Its status becomes active,
 *  which is what opens spending in every portal (T112). */
function MarkActive({ db, g }: { db: Db; g: Grant }) {
  const { markGrantActive } = useStore()
  const [reason, setReason] = useState('')
  const id = useId()
  const ok = reason.trim() !== ''
  return (
    <div className="hold hold-embedded">
      <header>
        <h3 id={`${id}-title`}>Spending is paused for researchers</h3>
      </header>
      <p className="why"><strong>Why:</strong> {whyFrozen(db, g).map(c => c.text).join('; ')}.</p>
      <div className="field">
        <label htmlFor={id}>Confirmed it's live? Mark it active. Your reason (required, goes in the log)</label>
        <textarea id={id} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. NIH confirmed the award is live and payments resume this month" />
      </div>
      <div className="actions">
        <button type="button" className="primary" disabled={!ok} onClick={() => { markGrantActive(g.id, reason); setReason('') }}>Mark grant active</button>
        {!ok && <span className="hint">Type a reason to enable the button.</span>}
      </div>
    </div>
  )
}

/** A grant's status timeline, what each source says, and its flags (the forecast's details page). */
export function StatusHistory({ g, db }: { g: Grant; db: Db }) {
  const events = db.statusEvents.filter(e => e.grantId === g.id).sort(byDay)
  const readings = latestReadings(db.sourceReadings.filter(r => r.grantId === g.id))
  const flags = db.flags.filter(f => f.grantId === g.id).sort(byDay)
  const openFlags = flags.filter(f => f.open)
  const closedFlags = flags.filter(f => !f.open)
  const disagree = new Set(readings.map(r => r.status)).size > 1

  return (
    <>
      <div className="funds-cols">
        <div>
          <h3 className="funds-h3">Status timeline</h3>
          {events.length === 0 ? <Empty>No status changes recorded.</Empty> : (
            <ol className="funds-timeline">
              {events.map(e => (
                <li key={e.id}>
                  <div className="when">{e.day}</div>
                  <div>
                    <Badge tone={eventTone[e.kind]}>{eventLabel[e.kind]}</Badge>{' '}
                    {e.summary}
                    {e.amount != null && <> ({money(e.amount)})</>}
                    <div className="source">Source: {e.source}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div>
          <h3 className="funds-h3">
            What each source says{' '}
            {readings.length > 1 && (disagree ? <Badge tone="bad">Sources disagree</Badge> : <Badge tone="good">Sources agree</Badge>)}
          </h3>
          {readings.length === 0 ? <Empty>No source readings yet.</Empty> : (
            <table className={disagree ? 'funds-readings disagree' : 'funds-readings'}>
              <caption className="sr-only">Latest status reading from each source for {g.id}</caption>
              <thead><tr><th scope="col">Source</th><th scope="col">Says</th><th scope="col">Read on</th></tr></thead>
              <tbody>
                {readings.map(r => (
                  <tr key={r.id}>
                    <th scope="row">{r.source}</th>
                    <td><Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge></td>
                    <td>{r.day}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <h3 className="funds-h3">Flags</h3>
      {openFlags.length === 0 ? <Empty>No open flags.</Empty> : (
        <ul className="funds-flags">
          {openFlags.map(f => (
            <li key={f.id}>
              <Badge tone="bad">Open</Badge> <span className="day">{f.day}</span> {f.summary}
            </li>
          ))}
        </ul>
      )}
      {closedFlags.length > 0 && (
        <ul className="funds-flags closed">
          {closedFlags.map(f => (
            <li key={f.id}><Badge>Closed</Badge> <span className="day">{f.day}</span> {f.summary}</li>
          ))}
        </ul>
      )}
    </>
  )
}
