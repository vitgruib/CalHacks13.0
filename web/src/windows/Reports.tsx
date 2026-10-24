// Reports (MASTER-PLAN §3.5, §4). Each paper in a grant's progress report and
// what the public records say about it. No decision buttons: held papers link
// to the Inbox. Wording sticks to public records and never implies misconduct.
import type { ReportPaper } from '../data/types'
import { useStore } from '../data/store'
import { Badge, Empty, Section, type Tone } from '../ui'
import './Reports.css'

const resultBadge: Record<ReportPaper['result'], { label: string; tone: Tone }> = {
  ok: { label: 'OK', tone: 'good' },
  note: { label: 'Note', tone: 'warn' },
  held: { label: 'Held for review', tone: 'bad' },
}

const correctionLabel: Record<NonNullable<ReportPaper['correction']>['kind'], string> = {
  material: 'Material correction',
  minor: 'Minor correction',
  retraction: 'Retraction notice',
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function Paper({ p }: { p: ReportPaper }) {
  const r = p.checked === false ? { label: 'Not checked yet', tone: 'neutral' as Tone } : resultBadge[p.result]
  const mismatch = p.creditsGrantId !== p.grantId
  return (
    <article className={`rp-paper ${p.checked === false ? '' : `rp-${p.result}`}`}>
      <header>
        <h3>{p.title}</h3>
        <Badge tone={r.tone}>{r.label}</Badge>
      </header>

      <dl className="rp-facts">
        <div><dt>DOI</dt><dd><a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer">{p.doi}</a></dd></div>
        <div><dt>PubMed Central ID</dt><dd>{p.pmcid ?? <Badge tone="bad">Missing</Badge>}</dd></div>
        <div><dt>Listed in report for</dt><dd>{p.grantId}</dd></div>
        <div>
          <dt>Acknowledgments credit</dt>
          <dd>{p.creditsGrantId} {mismatch ? <Badge tone="bad">Does not match the report</Badge> : <Badge tone="good">Matches</Badge>}</dd>
        </div>
        <div>
          <dt>Correction on record</dt>
          <dd>
            {p.correction ? (
              <>
                {correctionLabel[p.correction.kind]}: {p.correction.note}{' '}
                {p.correction.disclosed ? <Badge tone="good">Disclosed in report</Badge> : <Badge tone="warn">Not disclosed in report</Badge>}
              </>
            ) : 'None found'}
          </dd>
        </div>
      </dl>

      <ul className="rp-checks" aria-label="Checks">
        {p.checks.map(c => (
          <li key={c.check}>
            <Badge tone={c.pass ? 'good' : 'bad'}>{c.pass ? 'Pass' : 'Fail'}</Badge>
            <span><strong>{c.check}.</strong> {c.detail}</span>
          </li>
        ))}
      </ul>

      {p.checked !== false && p.result === 'held' && <a className="rp-inbox" href="#inbox">Review in the Inbox →</a>}
    </article>
  )
}

export default function Reports() {
  const { db } = useStore()
  if (db.papers.length === 0) return <Empty>No progress report papers to check yet.</Empty>

  const grantIds = [...new Set(db.papers.map(p => p.grantId))]
  return (
    <>
      <p className="rp-note">Checks use public records only (NIH RePORTER, PubMed Central, Crossref). A flag means a record needs a look, not that anyone did anything wrong.</p>
      {grantIds.map(id => {
        const papers = db.papers.filter(p => p.grantId === id)
        const checked = papers.filter(p => p.checked !== false)
        const held = checked.filter(p => p.result === 'held').length
        const notes = checked.filter(p => p.result === 'note').length
        const grant = db.grants.find(g => g.id === id)
        return (
          <Section
            key={id}
            title={`Progress report: ${id}`}
            aside={<span className="rp-summary">{plural(papers.length, 'paper')} · {held} held · {plural(notes, 'note')}{checked.length < papers.length && ` · ${papers.length - checked.length} not checked yet`}</span>}
          >
            {grant && <p className="rp-sub">{grant.title}</p>}
            {papers.map(p => <Paper key={p.id} p={p} />)}
          </Section>
        )
      })}
    </>
  )
}
