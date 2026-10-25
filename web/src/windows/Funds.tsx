// Funds window (MASTER-PLAN §3.1, §4): how much money each grant really has,
// its status timeline, and any flags. Information only; decisions live in the Inbox.
import SourceCheck from '../SourceCheck'
import MoneyCharts from '../charts/MoneyCharts'
import { useStore } from '../data/store'
import { type Db, type Grant, type GrantStatus, type SourceReading, type StatusEvent } from '../data/types'
import { Badge, Empty, Section, grantStatus, money, type Tone } from '../ui'
import { SIM_NOTE, grantHeading } from '../plain'
import EdgeGroup from '../EdgeGroup'
import { isEdgeGrant } from '../people'
import './Funds.css'

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
  unfrozen: 'Unfrozen',
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
  if (db.grants.length === 0) return <Empty>No grants yet.</Empty>
  return (
    <>
      <SourceCheck />
      <div className="funds-grid">{db.grants.filter(g => !isEdgeGrant(g)).map(g => <GrantCard key={g.id} g={g} db={db} />)}</div>
      <EdgeGroup count={db.grants.filter(isEdgeGrant).length}>
        <div className="funds-grid">{db.grants.filter(isEdgeGrant).map(g => <GrantCard key={g.id} g={g} db={db} />)}</div>
      </EdgeGroup>
      <p className="funds-sim-note">{SIM_NOTE}</p>
    </>
  )
}

function GrantCard({ g, db }: { g: Grant; db: Db }) {
  const openHolds = db.holds.filter(h => h.grantId === g.id && !h.decision)
  const daysLeft = daysBetween(db.today, g.end)

  return (
    <Section
      title={grantHeading(g)}
      aside={
        <span className="funds-badges">
          <Badge tone={grantStatus(g).tone}>{grantStatus(g).label}</Badge>
        </span>
      }
    >
      <p className="funds-meta">
        {g.id} · {g.pi} · {g.agency} · {g.start} to {g.end}
        {daysLeft >= 0 && daysLeft <= 90 && <> <Badge tone="warn">last 90 days</Badge></>}
      </p>

      <MoneyCharts db={db} g={g} details />

      {openHolds.length > 0 && (
        <p className="funds-inbox">
          {openHolds.length} {openHolds.length === 1 ? 'item is' : 'items are'} waiting for the grant manager on this grant.{' '}
          <a href="#inbox">Open the Inbox</a>
        </p>
      )}
    </Section>
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
