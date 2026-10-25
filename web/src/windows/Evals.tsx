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

interface TrackerRow { case: string; grantId: string; org: string; day: string; facts: string; expected: string; trackerSaid: string | null; outcome: string }
interface FundTracker {
  totals: { checks: number; grants: number; caught: number; missed: number; falseAlarms: number; correctPasses: number }
  rows: TrackerRow[]
}
const fundTracker = fundTrackerJson as FundTracker

/** The outcomes shown: the agent got the case right. */
const RIGHT = new Set(['caught', 'correct pass'])
const right = <T extends { outcome: string }>(rows: T[]) => rows.filter(r => RIGHT.has(r.outcome))

/** "frozen + decide" → what spending should be, and the flag that comes with it. */
const FLAG: Record<string, string> = {
  decide: 'Grant manager decides',
  court_order_no_payment: 'Court restored it, no payment yet',
  sources_disagree: 'Sources disagree',
  notice: 'Grant manager notified',
}
function expectedOf(expected: string): { label: string; tone: Tone; flag?: string } {
  const [state, flag] = expected.split(' + ')
  const open = state === 'unfrozen'
  return { label: open ? 'Spending open' : 'Spending frozen', tone: open ? 'good' : 'warn', flag: flag && (FLAG[flag] ?? flag.replace(/_/g, ' ')) }
}
const OUTCOME: Record<string, string> = { caught: 'Caught', 'correct pass': 'Passed' }
/** The facts without their closing verdict (": stays frozen, flagged."): the Expected column says it. */
const factsOf = (facts: string) => facts.replace(/:\s*(stays )?(frozen|unfrozen)\b[^:]*\.$/, '.')

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
      <div className="evals-stats">
        <div className="evals-stat">
          <span className="evals-stat-value">{t.caught}<small> / {t.caught + t.missed}</small></span>
          <span className="evals-stat-label">checks where spending should stop or be flagged: caught</span>
        </div>
        <div className="evals-stat">
          <span className="evals-stat-value">{t.correctPasses}<small> / {t.correctPasses + t.falseAlarms}</small></span>
          <span className="evals-stat-label">checks where spending should stay open: passed</span>
        </div>
        <div className="evals-stat">
          <span className="evals-stat-value">{t.checks}</span>
          <span className="evals-stat-label">checks on {t.grants} real NIH grants</span>
        </div>
      </div>
      <details className="evals-cases" open>
        <Selected shown={shown.length} of={rows.length} />
        <div className="evals-scroll">
        <table className="evals-table">
          <thead>
            <tr><th>Grant</th><th>Day</th><th>What the records show</th><th>Expected</th><th>Outcome</th></tr>
          </thead>
          <tbody>
            {shown.map(r => {
              const e = expectedOf(r.expected)
              return (
                <tr key={`${r.case}-${r.grantId}-${r.day}`} title={r.trackerSaid ?? undefined}>
                  <td><span className="evals-grant">{r.grantId}</span><span className="evals-org">{r.org}</span></td>
                  <td className="evals-day">{r.day}</td>
                  <td>{factsOf(r.facts)}</td>
                  <td className="evals-expected"><Badge tone={e.tone}>{e.label}</Badge>{e.flag && <span className="evals-flag">{e.flag}</span>}</td>
                  <td className="evals-outcome"><span aria-hidden="true">✓</span> {OUTCOME[r.outcome] ?? r.outcome}</td>
                </tr>
              )
            })}
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
