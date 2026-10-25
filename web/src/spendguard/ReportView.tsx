// The funding-readiness report: overall assessment, the three separate checks,
// line-item feedback with the award passages behind it, the budget summary and
// the follow-ups, grouped by who has to answer.
import { Badge, money, type Tone } from '../ui'
import { OVERALL_LABEL, type Check, type Cited, type Report, type Who } from './assess'

const checkTone: Record<Check, Tone> = { yes: 'good', clarify: 'warn', no: 'bad' }
const checkWord: Record<Check, string> = { yes: 'Yes', clarify: 'Needs clarification', no: 'Concern' }
const overallTone: Record<Report['overall'], Tone> = { aligned: 'good', clarify: 'warn', outside: 'bad' }

function Evidence({ items }: { items: Cited[] }) {
  if (items.length === 0) return null
  return (
    <ul className="sg-evidence">
      {items.map(({ passage, note }) => (
        <li key={passage.id}>
          <span className="sg-ref">{passage.ref}</span> “{passage.text}”{note && <em> {note}</em>}
        </li>
      ))}
    </ul>
  )
}

const WHO: Who[] = ['Principal investigator', 'Grants administrator', 'Sponsor (funding agency)']

export default function ReportView({ report, heading }: { report: Report; heading?: string }) {
  const r = report
  return (
    <div className="sg-report">
      {heading && <h3 className="sg-h3">{heading}</h3>}
      <div className={`sg-overall sg-${overallTone[r.overall]}`}>
        <span className="sg-overall-label">{OVERALL_LABEL[r.overall]}</span>
        <span className="sg-overall-note">
          {r.overall === 'aligned' && 'All three checks pass for the plan as entered. Grants office review still applies.'}
          {r.overall === 'clarify' && 'Do not charge or approve this plan yet. Resolve the questions below first.'}
          {r.overall === 'outside' && 'As entered, part of this plan may fall outside what the award funds. Revise it or ask the grants office.'}
        </span>
      </div>

      <div className="sg-checks" role="list">
        <div role="listitem" className="sg-check">
          <h4>Scientifically aligned? <Badge tone={checkTone[r.aligned.check]}>{checkWord[r.aligned.check]}</Badge></h4>
          <p>{r.aligned.summary}</p>
          <Evidence items={r.aligned.evidence} />
        </div>
        <div role="listitem" className="sg-check">
          <h4>Potentially allowable? <Badge tone={checkTone[r.allowable.check]}>{checkWord[r.allowable.check]}</Badge></h4>
          <p>{r.allowable.summary}</p>
          {r.timing.map(t => <p key={t} className="sg-timing">{t}</p>)}
        </div>
        <div role="listitem" className="sg-check">
          <h4>Affordable? <Badge tone={checkTone[r.affordable.check]}>{checkWord[r.affordable.check]}</Badge></h4>
          <p>{r.affordable.summary}</p>
        </div>
      </div>
      <p className="sg-note">These are three separate checks: passing one does not mean the others pass.</p>

      <h3 className="sg-h3">Line-item feedback</h3>
      <table className="sg-table">
        <thead><tr><th>Item</th><th className="sg-num">Cost</th><th>Allowable</th><th>Feedback</th></tr></thead>
        <tbody>
          {r.lines.map(l => (
            <tr key={l.itemId}>
              <td>{l.label}</td>
              <td className="sg-num">{money(l.cost)}</td>
              <td><Badge tone={checkTone[l.allowable]}>{checkWord[l.allowable]}</Badge></td>
              <td>
                {l.notes.map(n => <p key={n}>{n}</p>)}
                {l.missing.length > 0 && <p className="sg-missing"><strong>Missing:</strong> {l.missing.join(' ')}</p>}
                <Evidence items={l.evidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="sg-h3">Budget summary</h3>
      <dl className="sg-budget">
        <div><dt>Total planned cost</dt><dd>{money(r.budget.total)}</dd></div>
        <div><dt>Available funding{r.budget.verified ? '' : ' (not confirmed)'}</dt><dd>{money(r.budget.available)}</dd></div>
        <div className="sg-eq"><dt>Remaining if approved</dt><dd className={r.budget.remaining < 0 ? 'sg-neg' : ''}>{money(r.budget.remaining)}</dd></div>
      </dl>
      <p className="sg-note">{r.budget.note}</p>

      <h3 className="sg-h3">Follow-ups</h3>
      {r.followUps.length === 0 ? <p className="sg-note">No open questions.</p> : WHO.map(w => {
        const qs = r.followUps.filter(f => f.to === w)
        return qs.length === 0 ? null : (
          <div key={w} className="sg-who">
            <h4>{w}</h4>
            <ul>{qs.map(q => <li key={q.question}>{q.question}</li>)}</ul>
          </div>
        )
      })}
      <p className="sg-note">Assessed on {r.today} from the information provided and the award text on file. This is a planning aid; the grants office makes the call.</p>
    </div>
  )
}
