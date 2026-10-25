// The funding-readiness report, in two forms of the same findings: a written
// summary to read, and one table of the plan's lines to scan (cost, the
// checks, what's missing, and once sent, what happened to each line's
// request). The award passages and every note sit below, folded.
import type { ReactNode } from 'react'
import { Badge, money, type Tone } from '../ui'
import { OVERALL_LABEL, type Check, type Cited, type Report, type Who } from './assess'

const checkTone: Record<Check, Tone> = { yes: 'good', clarify: 'warn', no: 'bad' }
const checkWord: Record<Check, string> = { yes: 'Yes', clarify: 'Needs clarification', no: 'Concern' }
const overallTone: Record<Report['overall'], Tone> = { aligned: 'good', clarify: 'warn', outside: 'bad' }
const reasonable: Record<Report['lines'][number]['reasonable'], [Tone, string]> = {
  ok: ['good', 'OK'], needs_quote: ['warn', 'Quote needed'], mismatch: ['warn', 'Off the quote'],
}

const WHO: Who[] = ['Principal investigator', 'Grants administrator', 'Sponsor (funding agency)']
const whoShort: Record<Who, string> = {
  'Principal investigator': 'the principal investigator',
  'Grants administrator': 'the grants administrator',
  'Sponsor (funding agency)': 'the funding agency',
}

/** The report as prose: what the verdict means, then each check in a sentence or two. */
export function summaryParagraphs(r: Report): string[] {
  const verdict = {
    aligned: 'All three checks pass for the plan as entered, so its lines can go out as requests. The grant office still approves each one.',
    clarify: 'Do not charge or approve this plan yet: the questions below need answers first.',
    outside: 'As entered, part of this plan may fall outside what the award funds. Revise it or ask the grant office.',
  }[r.overall]
  const counts = WHO.map(w => [w, r.followUps.filter(f => f.to === w).length] as const).filter(([, n]) => n > 0)
  const asks = counts.length === 0
    ? 'No questions are open.'
    : `${r.followUps.length} question${r.followUps.length > 1 ? 's are' : ' is'} open: ${counts.map(([w, n]) => `${n} for ${whoShort[w]}`).join(', ')}.`
  return [
    verdict,
    `Scope: ${r.aligned.summary}`,
    `Allowability: ${r.allowable.summary}${r.timing.length ? ` ${r.timing.join(' ')}` : ''}`,
    `Budget: ${r.affordable.summary}`,
    asks,
  ]
}

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

export default function ReportView({ report, heading, lineStatus }: {
  report: Report
  heading?: string
  /** What happened to each line once sent, by item id (e.g. its request's state). */
  lineStatus?: (itemId: string) => ReactNode
}) {
  const r = report
  // Running total against the balance, so the table shows which line goes over.
  let run = 0
  const fits = r.lines.map(l => { run += l.cost; return run <= r.budget.available })

  return (
    <div className="sg-report">
      {heading && <h3 className="sg-h3">{heading}</h3>}
      <div className={`sg-overall sg-${overallTone[r.overall]}`}>
        <span className="sg-overall-label">{OVERALL_LABEL[r.overall]}</span>
        <span className="sg-checkline">
          Scope <Badge tone={checkTone[r.aligned.check]}>{checkWord[r.aligned.check]}</Badge>
          Allowable <Badge tone={checkTone[r.allowable.check]}>{checkWord[r.allowable.check]}</Badge>
          Affordable <Badge tone={checkTone[r.affordable.check]}>{checkWord[r.affordable.check]}</Badge>
        </span>
      </div>

      <div className="sg-summary">
        {summaryParagraphs(r).map(p => {
          const [, label, text] = /^(Scope|Allowability|Budget): (.*)$/s.exec(p) ?? [, '', p]
          return <p key={p}>{label && <strong>{label}. </strong>}{text}</p>
        })}
      </div>

      <div className="sg-scroll">
        <table className="sg-table">
          <caption className="sg-sr-only">Each planned cost and its checks</caption>
          <thead>
            <tr>
              <th scope="col">Item</th><th scope="col" className="sg-num">Cost</th><th scope="col">Allowable</th>
              <th scope="col">Price</th><th scope="col">Budget</th><th scope="col">Needs</th>
              {lineStatus && <th scope="col">Request</th>}
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l, i) => (
              <tr key={l.itemId}>
                <td>{l.label}</td>
                <td className="sg-num">{money(l.cost)}</td>
                <td><Badge tone={checkTone[l.allowable]}>{checkWord[l.allowable]}</Badge></td>
                <td><Badge tone={reasonable[l.reasonable][0]}>{reasonable[l.reasonable][1]}</Badge></td>
                <td>{!r.budget.verified ? <Badge tone="warn">Not confirmed</Badge> : fits[i] ? <Badge tone="good">Fits</Badge> : <Badge tone="bad">Over</Badge>}</td>
                <td className="sg-needs">{l.missing.length ? l.missing.join(' ') : l.allowable === 'yes' ? '—' : 'Answer the follow-ups below.'}</td>
                {lineStatus && <td>{lineStatus(l.itemId)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="sg-num"><strong>{money(r.budget.total)}</strong></td>
              <td colSpan={lineStatus ? 5 : 4}>
                {money(r.budget.available)} available{r.budget.verified ? '' : ' (not confirmed)'}, leaving{' '}
                <span className={r.budget.remaining < 0 ? 'sg-neg' : ''}>{money(r.budget.remaining)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

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

      <details className="sg-details">
        <summary>Award text and line-by-line notes</summary>
        <h4>Scope</h4>
        <Evidence items={r.aligned.evidence} />
        {r.lines.map(l => (
          <div key={l.itemId}>
            <h4>{l.label}</h4>
            {l.notes.map(n => <p key={n}>{n}</p>)}
            <Evidence items={l.evidence} />
          </div>
        ))}
        <p className="sg-note">{r.budget.note}</p>
      </details>
      <p className="sg-note">Assessed on {r.today} from the information provided and the award text on file. This is a planning aid; the grant office makes the call.</p>
    </div>
  )
}
