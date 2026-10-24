// Test lab: demo only, for us and the judges. For T16 it just renders.
// Injecting events and moving the clock is T18; the scorecard fills from the
// check command in T19. No numbers are shown until those exist.
import { useStore } from '../data/store'
import { Badge, Section } from '../ui'
import './TestLab.css'

const scenarios: { name: string; what: string }[] = [
  { name: 'Cancellation', what: 'A grant shows up on the cancellation list. Spending should freeze.' },
  { name: 'Court order', what: 'A court restores the grant. Spending should stay frozen: a court order is not cash.' },
  { name: 'Payment arrives', what: 'The government pays. Spending should unfreeze and held purchases go through.' },
  { name: 'Bad invoice', what: 'A vendor bills for an order that was canceled. The invoice should be held.' },
]

export default function TestLab() {
  const { db } = useStore()

  return (
    <div className="testlab">
      <p className="demo-banner" role="note">
        <strong>Demo only.</strong> This window is for us and the judges to drive the simulation. A real grant office
        would not have it. Nothing here is a decision; decisions happen only in the Inbox.
      </p>

      <Section title="Simulated clock" aside={<Badge>coming in T18</Badge>}>
        <p className="today-big">Today is <strong>{db.today}</strong></p>
        <button type="button" disabled>Fast-forward the clock (coming in T18)</button>
      </Section>

      <Section title="Drop in an event" aside={<Badge>coming in T18</Badge>}>
        <ul className="scenarios">
          {scenarios.map(s => (
            <li key={s.name}>
              <button type="button" disabled aria-describedby={`sc-${s.name.replace(/\s+/g, "-")}`}>
                {s.name} (coming in T18)
              </button>
              <span id={`sc-${s.name.replace(/\s+/g, "-")}`} className="muted">{s.what}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Planted mistakes scorecard" aside={<Badge>coming in T19</Badge>}>
        <table>
          <thead>
            <tr><th>Caught</th><th>Missed</th><th>False alarms</th></tr>
          </thead>
          <tbody>
            <tr><td>—</td><td>—</td><td>—</td></tr>
          </tbody>
        </table>
        <p className="muted">
          This fills in from the check command (T19), which compares the agents' decisions with the answer key of
          planted mistakes and decoys. No results yet.
        </p>
      </Section>
    </div>
  )
}
