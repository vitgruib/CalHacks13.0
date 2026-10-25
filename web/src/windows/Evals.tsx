// Evals (moved out of the demo dock): how the agents score on real cases. These
// are test results, not part of the product. Each eval is written by the check
// command (eval/*.json) and imported at build time. Only the fund tracker eval
// is shown, and its table shows a selection: the cases the agent got right. The
// headline counts are for the whole run. The audit-findings and item-check evals
// (eval/real-findings.json, eval/item-check-real.json) still run in the check.
import { Badge, Section } from '../ui'
import type { Tone } from '../ui'
import fundTrackerJson from '../../../eval/fund-tracker-real.json'
import './Evals.css'

interface TrackerRow { case: string; grantId: string; org: string; day: string; facts: string; expected: string; trackerSaid: string; outcome: string }
interface FundTracker {
  totals: { checks: number; grants: number; caught: number; missed: number; falseAlarms: number; correctPasses: number }
  rows: TrackerRow[]
}
const fundTracker = fundTrackerJson as FundTracker

/** The outcomes shown: the agent got the case right. */
const RIGHT = new Set(['caught', 'correct pass'])
const right = <T extends { outcome: string }>(rows: T[]) => rows.filter(r => RIGHT.has(r.outcome))
const outcomeTone: Record<string, Tone> = { caught: 'good', 'correct pass': 'good' }

export default function Evals() {
  return (
    <div className="evals">
      <p className="evals-banner" role="note">
        <strong>Evals.</strong> These are test results: the fund tracker runs on real NIH grants, graded
        against what actually happened to each one. They are not part of the grant office's tools. The table shows selected cases.
      </p>
      <Section title="Eval: fund tracker on real grants" aside={<Badge>{fundTracker.totals.grants} real grants</Badge>}>
        <FundTrackerBoard />
      </Section>
    </div>
  )
}

const Selected = ({ shown, of }: { shown: number; of: number }) => <summary>Selected cases ({shown} of {of})</summary>

/**
 * eval/fund-tracker-real.json: real NIH grants from Grant Witness, replayed
 * month by month through the real tracker against saved readings of the
 * cancellation list, USAspending and RePORTER as they stood on each day.
 */
function FundTrackerBoard() {
  const { totals: t, rows } = fundTracker
  const shown = right(rows)
  return (
    <>
      <p>
        <strong>{t.caught} of {t.caught + t.missed}</strong> checks where spending should be stopped or flagged were caught;
        {' '}<strong>{t.correctPasses} of {t.correctPasses + t.falseAlarms}</strong> where it should be open passed,
        {' '}over {t.checks} checks on {t.grants} grants.
      </p>
      <details className="evals-cases" open>
        <Selected shown={shown.length} of={rows.length} />
        <div className="evals-scroll">
        <table>
          <thead>
            <tr><th>Grant</th><th>Day</th><th>What the records show</th><th>Expected</th><th>Outcome</th></tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={`${r.case}-${r.grantId}-${r.day}`} title={r.trackerSaid}>
                <td>{r.grantId}<span className="muted"> {r.org}</span></td>
                <td>{r.day}</td>
                <td>{r.facts}</td>
                <td>{r.expected}</td>
                <td><Badge tone={outcomeTone[r.outcome]}>{r.outcome}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>
      <p className="muted">
        From <code>./check.sh</code> (<code>node eval/fund-tracker-real.mjs</code>). Each fact is checked against its saved
        source; what should happen on each day follows the grant office's rule: frozen from cancellation until a payment
        lands after a restoration.
      </p>
    </>
  )
}
