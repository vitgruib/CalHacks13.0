// The plan builder: an experiment, one funding source and a line-item budget,
// with the report below it. Propose → assess → revise → assess again → save or
// submit. Changing anything after an assessment marks the report out of date.
// A submitted plan that clears all three checks goes straight to the
// grant office, one request per line; any other waits for the grant office.
import { useMemo, useState, type ChangeEvent } from 'react'
import { useStore } from '../data/store'
import type { Db } from '../data/types'
import type { Researcher } from '../people'
import { grantHeading } from '../plain'
import { Badge, money } from '../ui'
import { assess, blankItem, CATEGORIES, planTotal, type Category, type Item, type Plan, type Report } from './assess'
import ReportView from './ReportView'
import { newPlanId, type SavedPlan } from './store'

/** The brief's demo plan: relevant science, an unapproved model, $8,400 of spending. */
export function examplePlan(grantId: string): Plan {
  const it = (category: Category, description: string, cost: string, extra: Partial<Item> = {}): Item => ({ ...blankItem(category), description, cost, ...extra })
  return {
    experiment: 'Test a new compound using patient-derived organoids and single-cell RNA sequencing to study treatment response.',
    grantId, completion: '',
    items: [
      it('Lab supplies & reagents', 'Organoid culture media and matrix', '2600'),
      it('External services', 'Single-cell RNA sequencing core service', '4000'),
      it('Equipment', 'Cryogenic storage unit', '1600'),
      it('Travel', 'Conference registration and train', '200', { destination: 'Berkeley, CA', purpose: 'Present preliminary results' }),
    ],
    uploaded: [],
  }
}

export default function PlanEditor({ db, researcher, saved, onDone }: { db: Db; researcher: Researcher; saved?: SavedPlan; onDone: () => void }) {
  const { savePlan } = useStore()
  const firstGrant = db.grants[0]?.id ?? ''
  const [id] = useState(saved?.id ?? newPlanId())
  const [plan, setPlan] = useState<Plan>(saved?.plan ?? { experiment: '', grantId: firstGrant, completion: '', items: [blankItem()], uploaded: [] })
  const [report, setReport] = useState<Report | undefined>(saved?.report)
  const [assessedKey, setAssessedKey] = useState(saved?.report ? JSON.stringify(saved.plan) : '')
  const [message, setMessage] = useState('')
  const grant = db.grants.find(g => g.id === plan.grantId)
  const stale = report !== undefined && assessedKey !== JSON.stringify(plan)
  const total = useMemo(() => planTotal(plan.items), [plan.items])

  const edit = (patch: Partial<Plan>) => { setPlan(p => ({ ...p, ...patch })); setMessage('') }
  const editItem = (itemId: string, patch: Partial<Item>) => edit({ items: plan.items.map(i => (i.id === itemId ? { ...i, ...patch } : i)) })

  const run = () => {
    if (!grant) return undefined
    const r = assess(plan, grant, db.today)
    setReport(r); setAssessedKey(JSON.stringify(plan)); setMessage('')
    return r
  }
  // The store (the module, when live) dates the plan and, once sent, makes its requests.
  const persist = (status: SavedPlan['status'], r: Report | undefined) => {
    try {
      savePlan({ id, researcher: researcher.name, status, savedOn: db.today, plan, report: r }, researcher)
      return true
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
      return false
    }
  }
  const saveDraft = () => { if (persist('draft', report)) setMessage('Saved as a draft.') }
  const submit = () => {
    const r = stale || !report ? run() : report
    if (!r) return
    if (persist(r.overall === 'aligned' ? 'sent' : 'submitted', r)) onDone()
  }

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    // Plans are text: a big or binary file would bloat the plan every client receives, so only its name is kept.
    const files = [...(e.target.files ?? [])]
    const read = await Promise.all(files.map(async f => ({
      name: f.name,
      text: f.size > 200_000 ? `(${f.name} is over 200 KB, so it was not read.)` : (await f.text()).replace(/\u0000/g, ''),
    })))
    edit({ uploaded: [...plan.uploaded, ...read] })
    e.target.value = ''
  }

  const canAssess = plan.experiment.trim().length > 0 && grant !== undefined && total > 0

  return (
    <div className="sg-editor">
      <div className="sg-bar">
        <h2>{saved ? 'Revise plan' : 'New experiment plan'}</h2>
        <button type="button" onClick={onDone}>Back to my requests</button>
      </div>

      <label className="sg-field">
        <span>Experiment or research activity</span>
        <textarea rows={3} value={plan.experiment} onChange={e => edit({ experiment: e.target.value })}
          placeholder="e.g. Test a new compound using patient-derived organoids and single-cell RNA sequencing to study treatment response." />
      </label>

      <div className="sg-row">
        <label className="sg-field">
          <span>Funding source</span>
          <select value={plan.grantId} onChange={e => edit({ grantId: e.target.value })}>
            {db.grants.map(g => <option key={g.id} value={g.id}>{grantHeading(g)} ({g.id})</option>)}
          </select>
        </label>
        <label className="sg-field">
          <span>Planned completion (optional)</span>
          <input type="date" value={plan.completion} onChange={e => edit({ completion: e.target.value })} />
        </label>
      </div>
      {grant && <p className="sg-note">{grant.agency} · ends {grant.end} · {money(grant.awarded - grant.spent - grant.promised)} unspent and not yet committed.</p>}

      <div className="sg-field">
        <span>Award documents (optional)</span>
        <input type="file" accept=".txt,.md,.csv,text/plain" multiple onChange={upload} />
        <small className="sg-note">Add the approved research plan or award terms as text; the assessment will quote them. {plan.uploaded.length === 0 ? 'Without them it uses the award text already on file.' : ''}</small>
        {plan.uploaded.map(u => (
          <span key={u.name} className="sg-chip">{u.name}
            <button type="button" aria-label={`Remove ${u.name}`} onClick={() => edit({ uploaded: plan.uploaded.filter(x => x !== u) })}>×</button>
          </span>
        ))}
      </div>

      <h3 className="sg-h3">Planned spending</h3>
      {plan.items.map((it, n) => (
        <fieldset key={it.id} className="sg-item">
          <legend>Budget item {n + 1}</legend>
          <div className="sg-row sg-row3">
            <label className="sg-field">
              <span>Category</span>
              <select value={it.category} onChange={e => editItem(it.id, { category: e.target.value as Category })}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="sg-field sg-grow">
              <span>Description</span>
              <input value={it.description} onChange={e => editItem(it.id, { description: e.target.value })} />
            </label>
            <label className="sg-field">
              <span>Estimated cost (USD)</span>
              <input inputMode="decimal" value={it.cost} onChange={e => editItem(it.id, { cost: e.target.value })} />
            </label>
          </div>
          <div className="sg-row sg-row3">
            {(it.category === 'Equipment' || it.category === 'External services' || it.category === 'Lab supplies & reagents') && (
              <>
                <label className="sg-field">
                  <span>Vendor (optional)</span>
                  <input value={it.vendor} onChange={e => editItem(it.id, { vendor: e.target.value })} />
                </label>
                <label className="sg-field">
                  <span>Vendor quote (optional, USD)</span>
                  <input inputMode="decimal" value={it.quote} onChange={e => editItem(it.id, { quote: e.target.value })} />
                </label>
              </>
            )}
            {it.category === 'Travel' && (
              <>
                <label className="sg-field">
                  <span>Trip</span>
                  <select value={it.tripType} onChange={e => editItem(it.id, { tripType: e.target.value as Item['tripType'] })}>
                    <option value="domestic">Domestic</option><option value="international">International</option>
                  </select>
                </label>
                <label className="sg-field">
                  <span>Destination</span>
                  <input value={it.destination} onChange={e => editItem(it.id, { destination: e.target.value })} />
                </label>
                <label className="sg-field sg-grow">
                  <span>Purpose</span>
                  <input value={it.purpose} onChange={e => editItem(it.id, { purpose: e.target.value })} />
                </label>
              </>
            )}
            {it.category === 'Personnel' && (
              <>
                <label className="sg-field sg-grow">
                  <span>Role and responsibilities</span>
                  <input value={it.role} onChange={e => editItem(it.id, { role: e.target.value })} />
                </label>
                <label className="sg-field">
                  <span>Effort on this award (%)</span>
                  <input inputMode="numeric" value={it.effort} onChange={e => editItem(it.id, { effort: e.target.value })} />
                </label>
              </>
            )}
            {plan.items.length > 1 && <button type="button" className="sg-remove" onClick={() => edit({ items: plan.items.filter(x => x.id !== it.id) })}>Remove item</button>}
          </div>
        </fieldset>
      ))}
      <div className="sg-bar">
        <button type="button" onClick={() => edit({ items: [...plan.items, blankItem()] })}>+ Add budget item</button>
        <span className="sg-total">Estimated total <strong>{money(total)}</strong></span>
      </div>

      <div className="sg-actions">
        <button type="button" className="primary" disabled={!canAssess} onClick={run}>{report ? 'Assess again' : 'Assess plan'}</button>
        <button type="button" onClick={() => setPlan(examplePlan(plan.grantId || firstGrant))}>Load the organoid example</button>
        {!canAssess && <span className="sg-note">Add the experiment and at least one cost.</span>}
      </div>

      {report && (
        <>
          {stale && <p className="sg-stale" role="status">You changed the plan after this assessment. <button type="button" onClick={run}>Assess again</button></p>}
          <div className={stale ? 'sg-old' : undefined}>
            <ReportView report={report} heading="Funding-readiness report" />
          </div>
          <h3 className="sg-h3">What next?</h3>
          <div className="sg-actions">
            <button type="button" onClick={saveDraft}>Save as draft</button>
            <button type="button" className="primary" onClick={submit}>Submit for review</button>
            <a href="#requests" onClick={e => { e.preventDefault(); document.querySelector('.sg-editor')?.scrollIntoView({ behavior: 'smooth' }) }}>Revise the plan above</a>
            {message && <Badge tone="good">{message}</Badge>}
          </div>
          <p className="sg-note">
            {report.overall === 'aligned'
              ? 'All three checks pass, so submitting sends each line to the grant office as its own request. The spending rules still check every one.'
              : 'Submitting sends the plan and this report to the grant office. Nothing is bought until they approve it.'}
          </p>
        </>
      )}
    </div>
  )
}
