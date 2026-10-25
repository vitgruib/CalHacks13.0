// Requests: every purchase request, and the experiment plans they come from
// (SpendGuard, merged in T67). A researcher asks for one item or plans an
// experiment with a line-item budget; a plan's lines become requests once it
// clears its checks or the grant office approves it, and from there each line
// is an ordinary request: the purchasing agent, the spending rules, the Inbox.
import { useContext, useState, type FormEvent } from 'react'
import { useStore } from '../data/store'
import type { Grant, PurchaseRequest, RequestState } from '../data/types'
import { Badge, Empty, Section, money, type Tone } from '../ui'
import { RoleContext } from './registry'
import { RESEARCHERS, requesterLabel, useResearcher } from '../people'
import { grantHeading } from '../plain'
import { OVERALL_LABEL, planTotal, type Overall } from '../spendguard/assess'
import PlanEditor from '../spendguard/PlanEditor'
import ReportView from '../spendguard/ReportView'
import { notBought, planRef, type PlanStatus, type SavedPlan } from '../spendguard/store'
import '../spendguard/SpendGuard.css'
import './Requests.css'

const stateLabel: Record<RequestState, string> = {
  submitted: 'Submitted',
  bought: 'Bought',
  blocked: 'Blocked',
  rerouted: 'Rerouted',
  waiting_on_manager: 'Waiting for the grant manager',
  rejected: 'Rejected',
  canceled: 'Order canceled',
}

const stateTone: Record<RequestState, Tone> = {
  submitted: 'neutral',
  bought: 'good',
  blocked: 'bad',
  rejected: 'bad',
  waiting_on_manager: 'warn',
  rerouted: 'warn',
  canceled: 'neutral',
}

const CATEGORIES = ['lab supplies', 'equipment', 'equipment service', 'reagents', 'software', 'travel', 'general office', 'other']

const empty = { item: '', category: CATEGORIES[0], price: '', grantId: '', purpose: '', sharedWith: '', splitBy: 'use', share: '50', basis: '' }

/** Requests the researcher asked for in the app (seed ones have no asker), in a
 *  state worth pushing back on (the module refuses bought and rerouted). */
const canPushBack = (r: PurchaseRequest) => !!r.requestedBy && (r.state === 'blocked' || r.state === 'waiting_on_manager' || r.state === 'rejected')

function RequestForm({ grants }: { grants: Grant[] }) {
  const { submitRequest } = useStore()
  const me = useResearcher()
  const [form, setForm] = useState({ ...empty, grantId: grants.find(g => g.id === me.grantId)?.id ?? grants[0]?.id ?? '' })
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    setError('')
    setSent('')
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const price = Number(form.price)
    const item = form.item.trim()
    const purpose = form.purpose.trim()
    if (!item || !purpose || !form.grantId || !form.category) return setError('Fill in every field.')
    if (!Number.isFinite(price) || price <= 0) return setError('The price must be more than $0.')
    const other = form.sharedWith && form.sharedWith !== form.grantId ? form.sharedWith : ''
    const share = Number(form.share)
    const oneGrant = other && form.splitBy === 'one'
    const basis = form.basis.trim()
    if (other && !oneGrant && !(Number.isInteger(share) && share > 0 && share < 100)) return setError('The share on the grant to charge must be a whole percent between 1 and 99.')
    if (oneGrant && !basis) return setError(`Say why each grant's use can't be measured.`)
    // submit_request takes the grants a shared cost serves but not the split,
    // so the split the scientist states goes in the purpose for the agent to read.
    // Charging it all to one grant instead needs a reason the grant manager confirms.
    submitRequest({
      item, category: form.category, price: Math.round(price), grantId: form.grantId,
      purpose: other && !oneGrant ? `${purpose} Shared cost: ${share}% ${form.grantId}, ${100 - share}% ${other}.` : purpose,
      sharedWith: other ? [form.grantId, other] : [],
      ...(oneGrant ? { oneGrantBasis: basis } : {}),
    }, me)
    setForm({ ...empty, grantId: form.grantId })
    setSent(`Sent "${item}" to the purchasing agent as ${me.name}.`)
  }

  return (
    <form className="rq-form" onSubmit={onSubmit} noValidate>
      <label>
        What do you want to buy?
        <input value={form.item} onChange={set('item')} required placeholder="e.g. Pipette tips, 20 racks" />
      </label>
      <label>
        Category
        <select value={form.category} onChange={set('category')} required>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>
        Price (US dollars)
        <input type="number" inputMode="numeric" min={1} step={1} value={form.price} onChange={set('price')} required placeholder="380" />
      </label>
      <label>
        Grant to charge
        <select value={form.grantId} onChange={set('grantId')} required>
          {grants.map(g => <option key={g.id} value={g.id}>{g.id}: {g.title}</option>)}
        </select>
      </label>
      {grants.length > 1 && (
        <label>
          Shared with another grant?
          <select value={form.sharedWith} onChange={set('sharedWith')}>
            <option value="">No, only the grant to charge</option>
            {grants.filter(g => g.id !== form.grantId).map(g => <option key={g.id} value={g.id}>Yes, with {g.id}</option>)}
          </select>
        </label>
      )}
      {form.sharedWith && form.sharedWith !== form.grantId && (
        <label>
          How should it be charged?
          <select value={form.splitBy} onChange={set('splitBy')}>
            <option value="use">Split by how much each grant uses it</option>
            <option value="one">All to {form.grantId}: each grant's use can't be measured</option>
          </select>
        </label>
      )}
      {form.sharedWith && form.sharedWith !== form.grantId && form.splitBy === 'use' && (
        <label>
          Share on {form.grantId} (%)
          <input type="number" inputMode="numeric" min={1} max={99} step={1} value={form.share} onChange={set('share')} />
        </label>
      )}
      {form.sharedWith && form.sharedWith !== form.grantId && form.splitBy === 'one' && (
        <label className="wide">
          Why can't each grant's use be measured? (the grant manager confirms it)
          <textarea value={form.basis} onChange={set('basis')} required rows={2} placeholder="e.g. Both aims image the same slides in one session" />
        </label>
      )}
      <label className="wide">
        What is it for?
        <textarea value={form.purpose} onChange={set('purpose')} required rows={2} placeholder="e.g. Assay validation runs for aim 2" />
      </label>
      <div className="wide rq-actions">
        <button type="submit" className="primary">Send request</button>
        <span role="status" aria-live="polite" className={error ? 'rq-error' : 'rq-sent'}>{error || sent}</span>
      </div>
    </form>
  )
}

function GrantLine({ r }: { r: PurchaseRequest }) {
  const rerouted = r.chargedGrantId && r.chargedGrantId !== r.grantId
  return (
    <dl className="rq-grants">
      <dt>Asked for</dt>
      <dd>{r.grantId}</dd>
      <dt>Charged to</dt>
      <dd>
        {r.split?.length
          ? r.split.map(s => `${s.grantId} (${Math.round(s.share * 100)}%)`).join(', ')
          : rerouted
            ? <><strong>{r.chargedGrantId}</strong> <Badge tone="warn">moved from {r.grantId}</Badge></>
            : r.state === 'bought' ? r.grantId : <span className="rq-muted">not charged yet</span>}
      </dd>
      {r.sharedWith && r.sharedWith.length > 1 && <><dt>Shared by</dt><dd>{r.sharedWith.join(', ')}</dd></>}
      {r.oneGrantBasis && <><dt>All to one grant</dt><dd>{r.oneGrantBasis}</dd></>}
    </dl>
  )
}

function PushBack({ r }: { r: PurchaseRequest }) {
  const { pushBack } = useStore()
  const me = useResearcher()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const send = (e: FormEvent) => {
    e.preventDefault()
    try {
      pushBack(r.id, text.trim(), me)
      setOpen(false); setText(''); setError(''); setSent(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }
  if (!open) {
    return (
      <div className="rq-actions rq-push-row">
        <button type="button" onClick={() => { setOpen(true); setSent(false) }}>Push back</button>
        <span role="status" className="rq-sent">{sent && 'Sent. The purchasing agent will look at it again.'}</span>
      </div>
    )
  }
  return (
    <form className="rq-push" onSubmit={send}>
      <label>
        What should the purchasing agent know? (e.g. a grant it serves, a split, why it's needed)
        <textarea rows={2} value={text} onChange={e => { setText(e.target.value); setError('') }} />
      </label>
      <div className="rq-actions">
        <button type="submit" className="primary" disabled={!text.trim()}>Send push back</button>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        <span role="status" className="rq-error">{error}</span>
      </div>
    </form>
  )
}

function RequestCard({ r }: { r: PurchaseRequest }) {
  const role = useContext(RoleContext)
  const ref = planRef(r)
  const plan = useStore().plans.find(p => p.id === ref?.planId)
  return (
    <article className="rq-card" aria-labelledby={`rq-${r.id}`}>
      <header>
        <h3 id={`rq-${r.id}`}>{r.item}</h3>
        <span className="rq-price">{money(r.price)}</span>
        <Badge tone={stateTone[r.state]}>{stateLabel[r.state]}</Badge>
      </header>
      {role === 'grant_manager' && <p className="rq-who">Requested by <strong>{requesterLabel(r.requesterName)}</strong></p>}
      {ref && <p className="rq-plan">Line {ref.line} of {ref.of} in the plan <a href="#requests" onClick={e => { e.preventDefault(); document.getElementById(`plan-${ref.planId}`)?.scrollIntoView({ behavior: 'smooth' }) }}>{plan ? short(plan.plan.experiment, 70) : ref.planId}</a></p>}
      <p className="rq-muted rq-meta">{r.day} · {r.category} · {ref ? ref.rest : r.purpose}</p>
      <GrantLine r={r} />
      <p className="rq-explain"><span className="rq-muted">Purchasing agent: </span>{r.explanation}</p>
      {r.state === 'waiting_on_manager' && (
        <p className="rq-wait">Waiting for the grant manager. See it in the <a href="#inbox">Inbox</a>.</p>
      )}
      {role === 'scientist' && canPushBack(r) && <PushBack r={r} />}
      {r.verdicts.length > 0 && (
        <table className="rq-verdicts">
          <caption className="rq-sr-only">Rule checks for {r.item}</caption>
          <thead>
            <tr><th scope="col">Rule</th><th scope="col">Result</th><th scope="col">Why</th></tr>
          </thead>
          <tbody>
            {r.verdicts.map(v => (
              <tr key={v.rule}>
                <td>{v.rule}</td>
                <td><Badge tone={v.pass ? 'good' : 'bad'}>{v.pass ? 'Pass' : 'Fail'}</Badge></td>
                <td>
                  {v.detail}
                  {v.auditCase && <div className="rq-audit">Real audit: {v.auditCase}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  )
}

// ── Experiment plans ───────────────────────────────────────────────────────

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s) || 'Untitled plan'
const overallTone: Record<Overall, Tone> = { aligned: 'good', clarify: 'warn', outside: 'bad' }
const planLabel: Record<PlanStatus, [Tone, string]> = {
  draft: ['neutral', 'Draft'],
  submitted: ['warn', 'Waiting for the grant office'],
  sent: ['good', 'Sent to the purchasing agent'],
  returned: ['bad', 'Returned to the researcher'],
}

/** Each line's request once the plan is sent, or why the line isn't one. */
function useLineStatus(p: SavedPlan) {
  const { db } = useStore()
  if (p.status !== 'sent') return undefined
  const sent = db.requests.filter(r => planRef(r)?.planId === p.id)
  return (itemId: string) => {
    const n = p.plan.items.findIndex(i => i.id === itemId)
    const why = n < 0 ? 'Removed' : notBought(p.plan.items[n])
    if (why) return <span className="rq-muted">{why}</span>
    const rq = sent.find(r => planRef(r)?.line === n + 1)
    return rq ? <Badge tone={stateTone[rq.state]}>{stateLabel[rq.state]}</Badge> : <span className="rq-muted">Sending…</span>
  }
}

/** The grant office's call on a plan that didn't clear: approve sends its lines. */
function PlanDecision({ p }: { p: SavedPlan }) {
  const { decidePlan } = useStore()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const decide = (choice: 'approve' | 'return') => {
    if (!reason.trim()) return setError('Give a reason; the researcher sees it.')
    try { decidePlan(p.id, choice, reason.trim()) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <div className="rq-push">
      <label>
        Your decision and why (the researcher sees it)
        <textarea rows={2} value={reason} onChange={e => { setReason(e.target.value); setError('') }} placeholder="e.g. Organoids are covered by aim 2 per the PI's note; quote on file" />
      </label>
      <div className="rq-actions">
        <button type="button" className="primary" onClick={() => decide('approve')}>Approve: send lines to purchasing</button>
        <button type="button" onClick={() => decide('return')}>Return to the researcher</button>
        <span role="status" className="rq-error">{error}</span>
      </div>
      <p className="rq-muted rq-small">Approving clears the plan's scope questions. Each line is still checked by the spending rules, and anything they hold comes to the Inbox.</p>
    </div>
  )
}

function PlanCard({ p, onRevise, onDelete }: { p: SavedPlan; onRevise?: () => void; onDelete?: () => void }) {
  const { db } = useStore()
  const role = useContext(RoleContext)
  const [open, setOpen] = useState(role === 'grant_manager' && p.status === 'submitted')
  const lineStatus = useLineStatus(p)
  const g = db.grants.find(x => x.id === p.plan.grantId)
  const [tone, label] = planLabel[p.status]
  return (
    <article className="rq-card" id={`plan-${p.id}`} aria-labelledby={`plan-h-${p.id}`}>
      <header>
        <h3 id={`plan-h-${p.id}`}>{short(p.plan.experiment)}</h3>
        <span className="rq-price">{money(planTotal(p.plan.items))}</span>
        {p.report && <Badge tone={overallTone[p.report.overall]}>{OVERALL_LABEL[p.report.overall]}</Badge>}
        <Badge tone={tone}>{label}</Badge>
      </header>
      {role === 'grant_manager' && <p className="rq-who">Planned by <strong>{requesterLabel(p.researcher)}</strong></p>}
      <p className="rq-muted rq-meta">
        Experiment plan · {p.plan.items.length} line{p.plan.items.length === 1 ? '' : 's'} · {g ? grantHeading(g) : p.plan.grantId} ·{' '}
        {p.sentOn ? `sent ${p.sentOn}` : p.submittedOn ? `submitted ${p.submittedOn}` : `saved ${p.savedOn}`}
      </p>
      {p.decision && (
        <p className={p.decision.choice === 'approve' ? 'rq-explain' : 'rq-wait'}>
          <span className="rq-muted">Grant office, {p.decision.day}: </span>{p.decision.choice === 'approve' ? 'Approved' : 'Returned'}. {p.decision.reason}
        </p>
      )}
      {role === 'scientist' && p.status === 'submitted' && <p className="rq-wait">Waiting for the grant office to review the report. Nothing is bought until they approve it.</p>}
      <div className="rq-actions rq-push-row">
        {p.report && <button type="button" onClick={() => setOpen(!open)}>{open ? 'Hide report' : 'Open report'}</button>}
        {onRevise && p.status !== 'sent' && (
          <button type="button" onClick={onRevise}>
            {p.status === 'submitted' ? 'Withdraw and revise' : 'Revise'}
          </button>
        )}
        {onDelete && p.status !== 'sent' && <button type="button" onClick={onDelete}>Delete</button>}
      </div>
      {open && p.report && <ReportView report={p.report} lineStatus={lineStatus} />}
      {role === 'grant_manager' && p.status === 'submitted' && <PlanDecision p={p} />}
    </article>
  )
}

// Newest first; for the same day, later-added requests come first.
const newestFirst = (requests: PurchaseRequest[]) => requests
  .map((r, i) => ({ r, i }))
  .sort((a, b) => b.r.day.localeCompare(a.r.day) || b.i - a.i)
  .map(x => x.r)

/** A researcher's portal: ask for one item or plan an experiment, and only
 *  their own plans and requests. */
function MyRequests() {
  const { db, plans: all, deletePlan } = useStore()
  const me = useResearcher()
  const plans = all.filter(p => p.researcher === me.name)
  const [editing, setEditing] = useState<SavedPlan | 'new' | null>(null)
  const list = newestFirst(db.requests.filter(r => r.requesterName === me.name))
  if (editing) {
    return <PlanEditor key={editing === 'new' ? 'new' : editing.id} db={db} researcher={me} saved={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
  }
  return (
    <>
      <Section title="Ask to buy something">
        <RequestForm grants={db.grants} />
        <p className="rq-muted rq-plan-cta">
          Buying for a whole experiment?{' '}
          <button type="button" onClick={() => setEditing('new')}>Plan an experiment</button>{' '}
          Add every cost, get a funding-readiness report from the award's terms and your grant's real balance, then send it.
        </p>
      </Section>
      {plans.length > 0 && (
        <Section title="Your experiment plans" aside={<span className="rq-muted">{plans.length} total</span>}>
          <div className="rq-list">{plans.map(p => <PlanCard key={p.id} p={p} onRevise={() => setEditing(p)} onDelete={() => deletePlan(p.id, me)} />)}</div>
        </Section>
      )}
      <Section title="Your requests" aside={<span className="rq-muted">{list.length} total</span>}>
        {list.length === 0 ? <Empty>No requests yet.</Empty> : (
          <div className="rq-list">{list.map(r => <RequestCard key={r.id} r={r} />)}</div>
        )}
      </Section>
    </>
  )
}

/** The grant office: every researcher's requests, each naming who asked. */
function AllRequests() {
  const { db } = useStore()
  const [who, setWho] = useState('all')
  const list = newestFirst(db.requests.filter(r => who === 'all' || r.requesterName === who))
  const count = (name: string) => db.requests.filter(r => r.requesterName === name).length
  const order: PlanStatus[] = ['submitted', 'returned', 'sent']
  const plans = [...useStore().plans]
    .filter(p => p.status !== 'draft' && (who === 'all' || p.researcher === who))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
  const waiting = plans.filter(p => p.status === 'submitted').length
  return (
    <>
    <Section title="Experiment plans" aside={<span className="rq-muted">{waiting} waiting for you</span>}>
      {plans.length === 0 ? <Empty>No submitted plans. A researcher's plan that doesn't clear its checks waits here for your decision.</Empty> : (
        <div className="rq-list">{plans.map(p => <PlanCard key={p.id} p={p} />)}</div>
      )}
    </Section>
    <Section
      title="Requests from researchers"
      aside={(
        <label className="rq-filter">
          Researcher{' '}
          <select value={who} onChange={e => setWho(e.target.value)}>
            <option value="all">Everyone ({db.requests.length})</option>
            {RESEARCHERS.map(r => <option key={r.id} value={r.name}>{r.name} ({count(r.name)})</option>)}
          </select>
        </label>
      )}
    >
      {list.length === 0 ? <Empty>No requests from this researcher.</Empty> : (
        <div className="rq-list">{list.map(r => <RequestCard key={r.id} r={r} />)}</div>
      )}
    </Section>
    </>
  )
}

export default function Requests() {
  return useContext(RoleContext) === 'scientist' ? <MyRequests /> : <AllRequests />
}
