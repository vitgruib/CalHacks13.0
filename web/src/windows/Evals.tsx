// Evals (moved out of the demo dock): how the agents score on real cases. These
// are test results, not part of the product. Each eval is written by the check
// command (eval/*.json) and imported at build time. The tables show a selection:
// the cases the agents got right. The headline counts are for the whole run.
import { Badge, Section, money } from '../ui'
import type { Tone } from '../ui'
import realFindingsJson from '../../../eval/real-findings.json'
import itemCheckJson from '../../../eval/item-check-real.json'
import fundTrackerJson from '../../../eval/fund-tracker-real.json'
import './Evals.css'

interface Finding {
  id: string
  what: string
  rule?: string
  outcome: string
  why?: string
  source: { auditee: string; year?: string; amount: number | null; file: string }
  decision: { label: string; note?: string }
}
interface RealFindings {
  totals: { findings: number; inScope: number; caught: number; missed: number; outOfScope: number; decoys: number; correctPasses: number; falseAlarms: number }
  findings: Finding[]
}
const realFindings = realFindingsJson as RealFindings

interface ItemCase {
  id: string
  auditee: string
  year?: string
  item: string
  price: number
  why?: string
  outcome: string
  decision: { label: string }
}
interface ItemCheck {
  model: string
  totals: { items: number; mistakes: number; caught: number; decoys: number; correctPasses: number }
  items: ItemCase[]
}
const itemCheck = itemCheckJson as ItemCheck

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

const DECIDED: Record<string, string> = {
  disallowed: 'Funder disallowed',
  allowed: 'Funder allowed',
  partly: 'Partly allowed',
  agreed: 'Auditee agreed',
  auditor: 'Auditor only',
}

export default function Evals() {
  return (
    <div className="evals">
      <p className="evals-banner" role="note">
        <strong>Evals.</strong> These are test results: the agents run on real audit findings and real grants, graded
        against what was actually decided. They are not part of the grant office's tools. Each table shows selected cases.
      </p>
      <Section title="Eval: fund tracker on real grants" aside={<Badge>{fundTracker.totals.grants} real grants</Badge>}>
        <FundTrackerBoard />
      </Section>
      <Section title="Eval: real audit findings" aside={<Badge>{realFindings.totals.findings} real costs</Badge>}>
        <RealFindingsBoard />
      </Section>
      <Section title="Eval: item check on real audited items" aside={<Badge>{itemCheck.totals.items} real items</Badge>}>
        <ItemCheckBoard />
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

/**
 * eval/real-findings.json: questioned costs from real audit reports, rebuilt
 * as records and run through the real module and agents, graded by what was
 * finally decided about each cost.
 */
function RealFindingsBoard() {
  const { totals: t, findings } = realFindings
  const shown = right(findings)
  return (
    <>
      <p>
        <strong>{t.caught} of {t.inScope}</strong> in-scope findings stopped;
        {' '}<strong>{t.correctPasses} of {t.decoys}</strong> costs the funder allowed passed, with {t.falseAlarms} false alarms.
      </p>
      <details className="evals-cases" open>
        <Selected shown={shown.length} of={findings.length} />
        <div className="evals-scroll">
        <table>
          <thead>
            <tr><th>Case</th><th>Audited</th><th>What the auditors found</th><th>Decided</th><th>Outcome</th></tr>
          </thead>
          <tbody>
            {shown.map(f => (
              <tr key={f.id} title={f.why ?? f.rule ?? ''}>
                <td>{f.id}</td>
                <td>{f.source.auditee} {f.source.year ?? ''}{f.source.amount != null ? `, ${money(f.source.amount)}` : ''}</td>
                <td>{f.what}{f.why ? <span className="muted"> ({f.why})</span> : null}</td>
                <td>{DECIDED[f.decision.label] ?? f.decision.label}</td>
                <td><Badge tone={outcomeTone[f.outcome]}>{f.outcome}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>
      <p className="muted">
        From <code>./check.sh</code> (<code>node eval/real-findings.mjs</code>). Each case quotes a saved audit report in
        docs/research/sources/docs/, and the check fails if the quote isn't there. The cost is rebuilt as records in a copy of the
        simulated lab and run through the real module and agents.
      </p>
    </>
  )
}

/**
 * eval/item-check-real.json: items auditors questioned (should be flagged) and
 * items the funder or auditor accepted (should pass), each run once through
 * Claude's item check with the answer saved and replayed by the check.
 */
function ItemCheckBoard() {
  const { totals: t, items, model } = itemCheck
  const shown = right(items)
  return (
    <>
      <p>
        <strong>{t.caught} of {t.mistakes}</strong> unallowable items flagged by Claude ({model});
        {' '}<strong>{t.correctPasses} of {t.decoys}</strong> accepted items passed.
      </p>
      <details className="evals-cases" open>
        <Selected shown={shown.length} of={items.length} />
        <div className="evals-scroll">
        <table>
          <thead>
            <tr><th>Case</th><th>Audited</th><th>Item</th><th>Decided</th><th>Outcome</th></tr>
          </thead>
          <tbody>
            {shown.map(c => (
              <tr key={c.id} title={c.why ?? ''}>
                <td>{c.id}</td>
                <td>{c.auditee} {c.year ?? ''}</td>
                <td>{c.item}, {money(c.price)}{c.why ? <span className="muted"> (Claude: {c.why})</span> : null}</td>
                <td>{DECIDED[c.decision.label] ?? c.decision.label}</td>
                <td><Badge tone={outcomeTone[c.outcome]}>{c.outcome}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>
      <p className="muted">
        From <code>./check.sh</code> (<code>node eval/item-check-real.mjs</code>). Each item quotes a saved audit report and the
        decision on it in docs/research/sources/docs/. Claude was asked once per item; its answers are saved and replayed.
      </p>
    </>
  )
}
