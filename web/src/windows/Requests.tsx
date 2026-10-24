import { useState, type FormEvent } from 'react'
import { useStore } from '../data/store'
import type { Grant, PurchaseRequest, RequestState } from '../data/types'
import { Badge, Empty, Section, money, type Tone } from '../ui'
import './Requests.css'

const stateLabel: Record<RequestState, string> = {
  submitted: 'Submitted',
  bought: 'Bought',
  blocked: 'Blocked',
  rerouted: 'Rerouted',
  waiting_on_manager: 'Waiting for the grant manager',
  rejected: 'Rejected',
}

const stateTone: Record<RequestState, Tone> = {
  submitted: 'neutral',
  bought: 'good',
  blocked: 'bad',
  rejected: 'bad',
  waiting_on_manager: 'warn',
  rerouted: 'warn',
}

const CATEGORIES = ['lab supplies', 'equipment', 'equipment service', 'reagents', 'software', 'travel', 'general office', 'other']

const empty = { item: '', category: CATEGORIES[0], price: '', grantId: '', purpose: '' }

function RequestForm({ grants }: { grants: Grant[] }) {
  const { submitRequest } = useStore()
  const [form, setForm] = useState({ ...empty, grantId: grants[0]?.id ?? '' })
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
    submitRequest({ item, category: form.category, price: Math.round(price), grantId: form.grantId, purpose })
    setForm({ ...empty, grantId: form.grantId })
    setSent(`Sent "${item}" to the purchasing agent.`)
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
    </dl>
  )
}

function RequestCard({ r }: { r: PurchaseRequest }) {
  return (
    <article className="rq-card" aria-labelledby={`rq-${r.id}`}>
      <header>
        <h3 id={`rq-${r.id}`}>{r.item}</h3>
        <span className="rq-price">{money(r.price)}</span>
        <Badge tone={stateTone[r.state]}>{stateLabel[r.state]}</Badge>
      </header>
      <p className="rq-muted rq-meta">{r.day} · {r.category} · {r.purpose}</p>
      <GrantLine r={r} />
      <p className="rq-explain"><span className="rq-muted">Purchasing agent: </span>{r.explanation}</p>
      {r.state === 'waiting_on_manager' && (
        <p className="rq-wait">Waiting for the grant manager. See it in the <a href="#inbox">Inbox</a>.</p>
      )}
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

export default function Requests() {
  const { db } = useStore()
  // Newest first; for the same day, later-added requests come first.
  const list = db.requests
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.day.localeCompare(a.r.day) || b.i - a.i)
    .map(x => x.r)

  return (
    <>
      <Section title="Ask to buy something">
        <RequestForm grants={db.grants} />
      </Section>
      <Section title="Your requests" aside={<span className="rq-muted">{list.length} total</span>}>
        {list.length === 0 ? <Empty>No requests yet.</Empty> : (
          <div className="rq-list">{list.map(r => <RequestCard key={r.id} r={r} />)}</div>
        )}
      </Section>
    </>
  )
}
