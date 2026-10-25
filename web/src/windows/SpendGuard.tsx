// SpendGuard window: plan an experiment and its spending, get a funding
// readiness report before any money is committed. Researchers build and submit
// plans; the grant office sees the submitted ones with their reports.
import { useContext, useState } from 'react'
import { useStore } from '../data/store'
import { ResearcherContext } from '../people'
import { grantHeading } from '../plain'
import { Badge, Empty, money, type Tone } from '../ui'
import { OVERALL_LABEL, planTotal, type Overall } from '../spendguard/assess'
import PlanEditor from '../spendguard/PlanEditor'
import ReportView from '../spendguard/ReportView'
import { deletePlan, savePlan, usePlans, type SavedPlan } from '../spendguard/store'
import '../spendguard/SpendGuard.css'

const tone: Record<Overall, Tone> = { aligned: 'good', clarify: 'warn', outside: 'bad' }

export default function SpendGuard() {
  const researcher = useContext(ResearcherContext)
  return researcher ? <Researcher name={researcher.name} /> : <GrantOffice />
}

function Researcher({ name }: { name: string }) {
  const { db } = useStore()
  const all = usePlans()
  const mine = all.filter(p => p.researcher === name)
  const [editing, setEditing] = useState<SavedPlan | 'new' | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  if (editing) {
    return <PlanEditor key={editing === 'new' ? 'new' : editing.id} db={db} researcher={name} saved={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
  }
  return (
    <div className="sg">
      <p className="sg-lede">Plan it before you spend it. Describe the experiment, add what it will cost, and get a funding-readiness report from the award's own terms and your grant's real balance.</p>
      <div className="sg-actions"><button type="button" className="primary" onClick={() => setEditing('new')}>New experiment plan</button></div>
      <h2 className="sg-h2">Your plans</h2>
      {mine.length === 0 ? <Empty>No plans yet. Start one, or load the organoid example inside the form.</Empty> : (
        <ul className="sg-list">
          {mine.map(p => {
            const g = db.grants.find(x => x.id === p.plan.grantId)
            return (
              <li key={p.id} className="sg-card">
                <header>
                  <strong>{p.plan.experiment.slice(0, 90) || 'Untitled plan'}{p.plan.experiment.length > 90 ? '…' : ''}</strong>
                  {p.report && <Badge tone={tone[p.report.overall]}>{OVERALL_LABEL[p.report.overall]}</Badge>}
                  <Badge tone={p.status === 'submitted' ? 'good' : 'neutral'}>{p.status === 'submitted' ? 'Submitted' : 'Draft'}</Badge>
                </header>
                <p className="sg-note">{g ? grantHeading(g) : p.plan.grantId} · {money(planTotal(p.plan.items))} · {p.status === 'submitted' ? `submitted ${p.submittedOn}` : `saved ${p.savedOn}`}</p>
                <div className="sg-actions">
                  {p.report && <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Hide report' : 'View report'}</button>}
                  <button type="button" onClick={() => { if (p.status === 'submitted') savePlan({ ...p, status: 'draft', submittedOn: undefined }); setEditing(p) }}>
                    {p.status === 'submitted' ? 'Withdraw and revise' : 'Revise'}
                  </button>
                  <button type="button" onClick={() => deletePlan(p.id)}>Delete</button>
                </div>
                {open === p.id && p.report && <ReportView report={p.report} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function GrantOffice() {
  const { db } = useStore()
  const submitted = usePlans().filter(p => p.status === 'submitted')
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="sg">
      <p className="sg-lede">Experiment plans researchers submitted for review, each with its funding-readiness report. Plans live in this browser for now.</p>
      {submitted.length === 0 ? <Empty>Nothing submitted yet. A researcher's submitted plan appears here.</Empty> : (
        <ul className="sg-list">
          {submitted.map(p => {
            const g = db.grants.find(x => x.id === p.plan.grantId)
            return (
              <li key={p.id} className="sg-card">
                <header>
                  <strong>{p.plan.experiment.slice(0, 90)}{p.plan.experiment.length > 90 ? '…' : ''}</strong>
                  {p.report && <Badge tone={tone[p.report.overall]}>{OVERALL_LABEL[p.report.overall]}</Badge>}
                </header>
                <p className="sg-note">{p.researcher} · {g ? grantHeading(g) : p.plan.grantId} · {money(planTotal(p.plan.items))} · submitted {p.submittedOn}</p>
                {p.report && p.report.followUps.length > 0 && <p className="sg-note">{p.report.followUps.length} open questions</p>}
                <div className="sg-actions">
                  <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Hide report' : 'Open report'}</button>
                </div>
                {open === p.id && p.report && <ReportView report={p.report} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
