// Funds window (MASTER-PLAN §3.1, §4): how much money each grant really has,
// its status timeline, and any flags. Information only; decisions live in the Inbox.
import { useStore } from '../data/store'
import { trulyAvailable, type Db, type Grant, type GrantStatus, type SourceReading, type StatusEvent } from '../data/types'
import { Badge, Empty, Section, grantStatus, money, type Tone } from '../ui'
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
      {db.grants.map(g => <GrantCard key={g.id} g={g} db={db} />)}
    </>
  )
}

function GrantCard({ g, db }: { g: Grant; db: Db }) {
  const events = db.statusEvents.filter(e => e.grantId === g.id).sort(byDay)
  const readings = latestReadings(db.sourceReadings.filter(r => r.grantId === g.id))
  const flags = db.flags.filter(f => f.grantId === g.id).sort(byDay)
  const openFlags = flags.filter(f => f.open)
  const closedFlags = flags.filter(f => !f.open)
  const openHolds = db.holds.filter(h => h.grantId === g.id && !h.decision)
  const disagree = new Set(readings.map(r => r.status)).size > 1
  const daysLeft = daysBetween(db.today, g.end)
  const available = trulyAvailable(g)

  // "Court order isn't cash": the first cancellation since the grant was last
  // unfrozen, plus any court order and payment after it.
  const lastUnfreeze = [...events].reverse().find(e => e.kind === 'unfrozen')
  const lastCancel = events.find(e => e.kind === 'canceled' && (!lastUnfreeze || e.day >= lastUnfreeze.day))
  const courtOrder = lastCancel && events.find(e => e.kind === 'court_order' && e.day >= lastCancel.day)
  const paymentSince = lastCancel && events.find(e => e.kind === 'payment_received' && e.day >= lastCancel.day)

  return (
    <Section
      title={`${g.id} · ${g.title}`}
      aside={
        <span className="funds-badges">
          <Badge tone={grantStatus(g).tone}>{grantStatus(g).label}</Badge>
          {g.frozen ? <Badge tone="bad">Frozen</Badge> : <Badge tone="good">Spending open</Badge>}
        </span>
      }
    >
      <p className="funds-meta">{g.pi} · {g.agency} · {g.start} to {g.end}</p>

      {g.frozen && (
        <div className="funds-frozen" role="note">
          <strong>Spending is frozen.</strong> {g.frozenReason}
          {lastCancel && (
            <ol className="funds-chain" aria-label="Why it is still frozen">
              <li className="bad">Canceled <span>{lastCancel.day}</span></li>
              <li className={courtOrder ? 'warn' : 'muted'}>
                Court order <span>{courtOrder ? courtOrder.day : 'none'}</span>
              </li>
              <li className={paymentSince ? 'good' : 'bad'}>
                Payment since <span>{paymentSince ? `${paymentSince.day} (${money(paymentSince.amount ?? 0)})` : 'none'}</span>
              </li>
            </ol>
          )}
          {courtOrder && !paymentSince && (
            <p className="funds-frozen-note">A court order is not cash. Spending reopens when a payment actually arrives.</p>
          )}
        </div>
      )}

      <div className="funds-money">
        <div className={`funds-available ${g.frozen ? 'frozen' : available < 0 ? 'negative' : ''}`}>
          <div className="label">Truly available</div>
          <div className="value">{money(available)}</div>
          <div className="hint">
            {g.frozen ? 'On paper only: frozen, so none of it can be spent.' : 'Awarded − spent − promised'}
          </div>
        </div>
        <dl className="funds-figures">
          <div><dt>Awarded</dt><dd>{money(g.awarded)}</dd></div>
          <div><dt>Received</dt><dd>{money(g.received)}</dd></div>
          <div><dt>Spent</dt><dd>{money(g.spent)}</dd></div>
          <div><dt>Promised</dt><dd>{money(g.promised)}</dd><small>orders not yet paid</small></div>
          <div>
            <dt>Ends</dt>
            <dd>{g.end}</dd>
            <small>
              {daysLeft < 0 ? 'ended' : `${daysLeft} days left`}
              {daysLeft >= 0 && daysLeft <= 90 && <> · <Badge tone="warn">last 90 days</Badge></>}
            </small>
          </div>
        </dl>
      </div>

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
      {openHolds.length > 0 && (
        <p className="funds-inbox">
          {openHolds.length} {openHolds.length === 1 ? 'item is' : 'items are'} waiting for the grant manager on this grant.{' '}
          <a href="#inbox">Open the Inbox</a>
        </p>
      )}
    </Section>
  )
}
