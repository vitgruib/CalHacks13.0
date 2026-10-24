// Test lab: demo only, for us and the judges. Drops events into the raw world
// and moves the clock (T18); the agents react to what lands here. The
// scorecard fills from the check command in T19.
import { useState } from 'react'
import { useStore } from '../data/store'
import type { Db, Grant } from '../data/types'
import { Badge, Section, grantStatus, money } from '../ui'
import './TestLab.css'


// Remember the picked grant while switching windows (the window remounts).
let lastGrantId: string | undefined

interface Note { id: number; tone: 'good' | 'bad'; text: string }

/** The next step of the demo story for this grant (MASTER-PLAN §5). */
function nextStep(g: Grant): string {
  if (!g.frozen) return 'Spending is open. Cancel the grant to freeze it.'
  if (g.status === 'canceled') return 'Frozen after a cancellation. A court order will restore the status but not the money.'
  if (g.status === 'restored_by_court') return 'Restored by court but still frozen: a court order is not cash. A payment unfreezes it.'
  return 'Frozen. A payment unfreezes it.'
}

/** Ready-made bad invoices built from real seed orders, when those orders exist. */
function badInvoicePresets(db: Db) {
  const out: { key: string; label: string; orderId: string; amount: number; expect: string }[] = []
  const canceled = db.orders.find(o => o.state === 'canceled')
  if (canceled) {
    out.push({
      key: 'canceled', orderId: canceled.id, amount: canceled.amount,
      label: `Bills a canceled order: ${canceled.id}, ${canceled.vendor}, ${money(canceled.amount)}`,
      expect: `order ${canceled.id} was canceled on ${canceled.canceledOn ?? 'an earlier day'}`,
    })
  }
  const approved = db.approvals
    .map(a => ({ a, o: db.orders.find(o => o.id === a.orderId) }))
    .find(({ o }) => o && o.state !== 'paid' && o.state !== 'canceled')
  if (approved?.o) {
    const amount = Math.round(approved.a.amount * 1.15)
    out.push({
      key: 'over', orderId: approved.o.id, amount,
      label: `Bills more than approved: ${approved.o.id}, ${approved.o.vendor}, approved ${money(approved.a.amount)}, billed ${money(amount)}`,
      expect: `only ${money(approved.a.amount)} was approved`,
    })
  }
  return out
}

export default function TestLab() {
  const { db, injectStatusEvent, injectInvoice, advanceDays } = useStore()
  const [grantId, setGrantIdState] = useState(lastGrantId ?? db.grants[0]?.id ?? '')
  const setGrantId = (id: string) => { lastGrantId = id; setGrantIdState(id) }
  const [payment, setPayment] = useState('25000')
  const presets = badInvoicePresets(db)
  const [presetKey, setPresetKey] = useState(presets[0]?.key ?? 'custom')
  const [orderId, setOrderId] = useState(db.orders[0]?.id ?? '')
  const [invAmount, setInvAmount] = useState('')
  const [days, setDays] = useState('7')
  const [notes, setNotes] = useState<Note[]>([])

  const grant = db.grants.find(g => g.id === grantId)

  const run = (fn: () => string) => {
    try {
      const text = fn()
      setNotes(n => [{ id: Date.now() + Math.random(), tone: 'good' as const, text }, ...n].slice(0, 6))
    } catch (e) {
      setNotes(n => [{ id: Date.now() + Math.random(), tone: 'bad' as const, text: (e as Error).message }, ...n].slice(0, 6))
    }
  }

  const cancel = () => run(() => {
    injectStatusEvent({ grantId, kind: 'canceled', source: 'Cancellation list (Apify)', summary: 'Grant appears on the terminated-grants list.' })
    return `${grantId} canceled on ${db.today}. Spending is frozen.`
  })
  const courtOrder = () => run(() => {
    injectStatusEvent({ grantId, kind: 'court_order', source: 'Court notice', summary: `Court order restores ${grantId}. No payment schedule is set.` })
    return `Court order restores ${grantId}. Spending stays frozen: a court order is not cash.`
  })
  const pay = () => run(() => {
    const amount = Number(payment)
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Enter a payment in whole dollars above zero.')
    const wasFrozen = grant?.frozen
    injectStatusEvent({ grantId, kind: 'payment_received', source: 'Payment system', summary: `Payment of ${money(amount)} received.`, amount })
    return `${money(amount)} arrived for ${grantId}.` + (wasFrozen ? ' Spending is unfrozen.' : ' Spending was already open.')
  })
  const badInvoice = () => run(() => {
    const p = presets.find(x => x.key === presetKey)
    const oid = p ? p.orderId : orderId
    const amount = p ? p.amount : Number(invAmount)
    if (!p && (!Number.isInteger(amount) || amount <= 0)) throw new Error('Enter an invoice amount in whole dollars above zero.')
    injectInvoice({ orderId: oid, amount })
    return `Invoice for ${oid} (${money(amount)}) arrived, not checked yet.` + (p ? ` It should be held: ${p.expect}.` : '')
  })
  const fastForward = () => run(() => {
    const n = Number(days)
    if (!Number.isInteger(n) || n < 1) throw new Error('Enter a whole number of days, at least 1.')
    const from = db.today
    advanceDays({ days: n })
    return `Clock moved forward ${n} day${n === 1 ? '' : 's'} from ${from}.`
  })

  return (
    <div className="testlab">
      <p className="demo-banner" role="note">
        <strong>Demo only.</strong> This window is for us and the judges to drive the simulation. A real grant office
        would not have it. Nothing here is a decision; decisions happen only in the Inbox.
      </p>

      {notes.length > 0 && (
        <ul className="tl-notes" aria-live="polite" aria-label="What just happened">
          {notes.map((n, i) => <li key={n.id} className={`${n.tone}${i === 0 ? ' latest' : ''}`}>{n.text}</li>)}
        </ul>
      )}

      <Section title="Simulated clock">
        <p className="today-big">Today is <strong>{db.today}</strong></p>
        <div className="tl-row">
          <label className="tl-field">Days
            <input type="number" min={1} step={1} value={days} onChange={e => setDays(e.target.value)} />
          </label>
          <button type="button" onClick={fastForward}>Fast-forward {days || 'N'} days</button>
        </div>
      </Section>

      <Section title="Grant status events">
        <div className="tl-row">
          <label className="tl-field">Grant
            <select value={grantId} onChange={e => setGrantId(e.target.value)}>
              {db.grants.map(g => <option key={g.id} value={g.id}>{g.id} · {g.title}</option>)}
            </select>
          </label>
        </div>
        {grant && (
          <div className="tl-grant">
            <span className="tl-badges">
              <Badge tone={grantStatus(grant).tone}>{grantStatus(grant).label}</Badge>
              {grant.frozen ? <Badge tone="bad">Frozen</Badge> : <Badge tone="good">Spending open</Badge>}
              <span className="muted">Received {money(grant.received)} of {money(grant.awarded)}</span>
            </span>
            <p className="tl-next">{nextStep(grant)} <a href="#funds">See it in Funds</a></p>
          </div>
        )}
        <ol className="scenarios">
          <li>
            <button type="button" onClick={cancel} disabled={!grant}>Cancel grant</button>
            <span className="muted">Shows up on the cancellation list. Spending freezes.</span>
          </li>
          <li>
            <button type="button" onClick={courtOrder} disabled={!grant}>Court order restores it</button>
            <span className="muted">Status is restored, but spending stays frozen: a court order is not cash.</span>
          </li>
          <li>
            <button type="button" onClick={pay} disabled={!grant}>Payment arrives</button>
            <label className="tl-inline">Amount ($)
              <input type="number" min={1} step={1} value={payment} onChange={e => setPayment(e.target.value)} />
            </label>
            <span className="muted">Money actually lands. Spending unfreezes.</span>
          </li>
        </ol>
      </Section>

      <Section title="Bad invoice">
        <div className="tl-row">
          <label className="tl-field tl-wide">Invoice
            <select value={presetKey} onChange={e => setPresetKey(e.target.value)}>
              {presets.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              <option value="custom">Custom: pick an order and an amount</option>
            </select>
          </label>
        </div>
        {presetKey === 'custom' && (
          <div className="tl-row">
            <label className="tl-field">Order
              <select value={orderId} onChange={e => setOrderId(e.target.value)}>
                {db.orders.map(o => <option key={o.id} value={o.id}>{o.id} · {o.vendor} · {money(o.amount)} · {o.state}</option>)}
              </select>
            </label>
            <label className="tl-field">Amount ($)
              <input type="number" min={1} step={1} value={invAmount} onChange={e => setInvAmount(e.target.value)} />
            </label>
          </div>
        )}
        <div className="tl-row">
          <button type="button" onClick={badInvoice}>Send invoice</button>
          <span className="muted">Arrives unchecked; the bookkeeping agent should hold it. <a href="#invoices">See it in Invoices</a></span>
        </div>
      </Section>

      <Section title="Planted mistakes scorecard" aside={<Badge>coming in T19</Badge>}>
        <table>
          <thead>
            <tr><th>Caught</th><th>Missed</th><th>False alarms</th></tr>
          </thead>
          <tbody>
            <tr><td>—</td><td>—</td><td>—</td></tr>
          </tbody>
        </table>
        <p className="muted">
          This fills in from the check command (T19), which compares the agents' decisions with the answer key of
          planted mistakes and decoys. No results yet.
        </p>
      </Section>
    </div>
  )
}
