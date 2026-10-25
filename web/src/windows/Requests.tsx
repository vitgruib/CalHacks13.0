// Requests: every purchase request, and the experiment plans they come from
// (SpendGuard, merged in T67). A researcher asks for one item on Ask or plans an
// experiment here with a line-item budget; a plan's lines become requests once it
// clears its checks or the grant office approves it, and from there each line
// is an ordinary request: the spending rules, then the grant office's approval.
// The grant office decides a held request right on its card (the Inbox's card).
import { useContext, useState, type FormEvent } from 'react'
import { useStore } from '../data/store'
import type { Decision, PurchaseRequest, RequestState } from '../data/types'
import { Badge, Empty, Section, money, type Tone } from '../ui'
import { RoleContext } from './registry'
import { RESEARCHERS, forResearcher, requesterLabel, useResearcher } from '../people'
import { grantHeading } from '../plain'
import { OVERALL_LABEL, planTotal, type Overall } from '../spendguard/assess'
import PlanEditor from '../spendguard/PlanEditor'
import ReportView from '../spendguard/ReportView'
import { notBought, planRef, type PlanStatus, type SavedPlan } from '../spendguard/store'
import { HoldCard, openHolds } from './Inbox'
import '../spendguard/SpendGuard.css'
import './Requests.css'

const stateLabel: Record<RequestState, string> = {
  submitted: 'Submitted',
  bought: 'Approved',
  blocked: 'Flagged',
  rerouted: 'Rerouted',
  waiting_on_manager: 'Waiting for the grant office',
  rejected: 'Rejected',
  canceled: 'Order canceled',
}

const stateTone: Record<RequestState, Tone> = {
  submitted: 'neutral',
  bought: 'good',
  blocked: 'warn',
  rejected: 'bad',
  waiting_on_manager: 'warn',
  rerouted: 'warn',
  canceled: 'neutral',
}

const decisionLabel: Record<Decision['choice'], string> = {
  approve: 'Approved', reject: 'Rejected', ask_vendor: 'Asked the vendor', pick_source: 'Picked a source', set_status: 'Set the status',
}

/** Requests the researcher asked for in the app (seed ones have no asker), in a
 *  state worth pushing back on (the module refuses bought and rerouted). */
const canPushBack = (r: PurchaseRequest) => !!r.requestedBy && (r.state === 'blocked' || r.state === 'waiting_on_manager' || r.state === 'rejected')

function GrantLine({ r }: { r: PurchaseRequest }) {
  const rerouted = r.chargedGrantId && r.chargedGrantId !== r.grantId
  return (
    <dl className="rq-grants">
      <dt>Asked for</dt>
      <dd>{r.grantId}</dd>
      <dt>Charged to</dt>
      <dd>
        {rerouted
          ? <><strong>{r.chargedGrantId}</strong> <Badge tone="warn">moved from {r.grantId}</Badge></>
          : r.state === 'bought' ? r.grantId : <span className="rq-muted">not charged yet</span>}
      </dd>
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
  const [sending, setSending] = useState(false)
  // The form closes only once the grant office has it; a refusal keeps the text.
  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (sending) return
    setSending(true); setError('')
    try {
      await pushBack(r.id, text.trim(), me)
      setOpen(false); setText(''); setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }
  if (!open) {
    return (
      <div className="rq-actions rq-push-row">
        <button type="button" onClick={() => { setOpen(true); setSent(false) }}>Push back</button>
        <span role="status" className="rq-sent">{sent && 'Sent. The grant office will look at it again.'}</span>
      </div>
    )
  }
  return (
    <form className="rq-push" onSubmit={send}>
      <label>
        What should the grant office know? (e.g. a grant it serves, a split, why it's needed)
        <textarea rows={2} value={text} onChange={e => { setText(e.target.value); setError('') }} />
      </label>
      <div className="rq-actions">
        <button type="submit" className="primary" disabled={!text.trim() || sending}>{sending ? 'Sending…' : 'Send push back'}</button>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        <span role="status" className="rq-error">{error}</span>
      </div>
    </form>
  )
}

function RequestCard({ r }: { r: PurchaseRequest }) {
  const role = useContext(RoleContext)
  const ref = planRef(r)
  const { db, plans } = useStore()
  const plan = plans.find(p => p.id === ref?.planId)
  const hold = role === 'grant_manager' ? openHolds(db, 'purchase').find(h => h.refId === r.id) : undefined
  const decided = db.holds.filter(h => h.kind === 'purchase' && h.refId === r.id && h.decision)
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
      <p className="rq-explain"><span className="rq-muted">Status: </span>{r.explanation}</p>
      {decided.map(h => (
        <p key={h.id} className={h.decision!.choice === 'reject' ? 'rq-wait' : 'rq-explain'}>
          <span className="rq-muted">Grant manager, {h.decision!.day}: </span>{decisionLabel[h.decision!.choice]}. {h.decision!.reason}
        </p>
      ))}
      {hold
        ? <HoldCard key={hold.id} hold={hold} embedded />
        : r.state === 'waiting_on_manager' && role === 'scientist' && <p className="rq-wait">Waiting for the grant manager to decide. Their answer will show up here.</p>}
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
  sent: ['good', 'Lines sent as requests'],
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
  const [pending, setPending] = useState(false)
  // On success the card leaves the queue, so the buttons stay disabled until then.
  const decide = async (choice: 'approve' | 'return') => {
    if (pending) return
    if (!reason.trim()) return setError('Give a reason; the researcher sees it.')
    setPending(true); setError('')
    try { await decidePlan(p.id, choice, reason.trim()) } catch (e) { setError(e instanceof Error ? e.message : String(e)); setPending(false) }
  }
  return (
    <div className="rq-push">
      <label>
        Your decision and why (the researcher sees it)
        <textarea rows={2} value={reason} onChange={e => { setReason(e.target.value); setError('') }} placeholder="e.g. Organoids are covered by aim 2 per the PI's note; quote on file" />
      </label>
      <div className="rq-actions">
        <button type="button" className="primary" disabled={pending} onClick={() => decide('approve')}>Approve: send its lines as requests</button>
        <button type="button" disabled={pending} onClick={() => decide('return')}>Return to the researcher</button>
        <span role="status" className="rq-error">{error}</span>
      </div>
      <p className="rq-muted rq-small">Approving clears the plan's scope questions. Each line becomes its own request, checked by the spending rules, and waits for your approval in the Inbox.</p>
    </div>
  )
}

function PlanCard({ p, onRevise, onDelete }: { p: SavedPlan; onRevise?: () => void; onDelete?: () => Promise<void> }) {
  const { db } = useStore()
  const role = useContext(RoleContext)
  const [open, setOpen] = useState(role === 'grant_manager' && p.status === 'submitted')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  // On success the card goes away; a refusal shows here.
  const remove = async () => {
    if (!onDelete || deleting) return
    setDeleting(true); setError('')
    try { await onDelete() } catch (e) { setError(e instanceof Error ? e.message : String(e)); setDeleting(false); setConfirmDelete(false) }
  }
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
        {onDelete && p.status !== 'sent' && (confirmDelete
          ? <>
              <button type="button" className="primary" disabled={deleting} onClick={remove}>{deleting ? 'Deleting…' : 'Yes, delete this plan'}</button>
              <button type="button" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          : <button type="button" onClick={() => { setConfirmDelete(true); setError('') }}>Delete</button>)}
        <span role="status" className="rq-error">{error}</span>
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

/** A researcher's own plans and requests, tracked. Shown on Ask, under the
 *  form that asks for one item. */
export function MyRequests() {
  const { db, plans: all, deletePlan } = useStore()
  const me = useResearcher()
  const plans = all.filter(p => p.researcher === me.name)
  const [editing, setEditing] = useState<SavedPlan | 'new' | null>(null)
  const list = newestFirst(db.requests.filter(r => r.requesterName === me.name))
  if (editing) {
    return <PlanEditor key={editing === 'new' ? 'new' : editing.id} db={forResearcher(db, me)} researcher={me} saved={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
  }
  return (
    <>
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
  const mine = db.requests.filter(r => who === 'all' || r.requesterName === who)
  // Requests with an open purchase hold come first, oldest first, each with its decision card.
  const held = openHolds(db, 'purchase').map(h => mine.find(r => r.id === h.refId)).filter((r): r is PurchaseRequest => !!r)
  const list = newestFirst(mine.filter(r => !held.includes(r)))
  const count = (name: string) => db.requests.filter(r => r.requesterName === name).length
  const order: PlanStatus[] = ['submitted', 'returned', 'sent']
  const plans = [...useStore().plans]
    .filter(p => p.status !== 'draft' && (who === 'all' || p.researcher === who))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
  const waiting = plans.filter(p => p.status === 'submitted').length
  return (
    <>
    {held.length > 0 && (
      <Section title="Waiting for you" aside={<Badge tone="warn">{held.length} open</Badge>}>
        <div className="rq-list">{held.map(r => <RequestCard key={r.id} r={r} />)}</div>
      </Section>
    )}
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
      {list.length === 0 ? <Empty>{held.length ? 'Nothing else from this researcher.' : 'No requests from this researcher.'}</Empty> : (
        <div className="rq-list">{list.map(r => <RequestCard key={r.id} r={r} />)}</div>
      )}
    </Section>
    </>
  )
}

export default function Requests() {
  return useContext(RoleContext) === 'scientist' ? <MyRequests /> : <AllRequests />
}
