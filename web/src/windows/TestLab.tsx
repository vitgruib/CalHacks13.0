// Demo controls (was "Test lab"): demo only, for us and the judges. Every demo
// action lives here: the run sheet (T79), start over from the demo seed, the cut scripts (T65),
// drop events into the raw world and move the clock (T18); the agents react
// to what lands here. The
// scorecard is eval/scorecard.json, written by the check command (T19) and
// imported at build time: it scores the seed run, not the live database.
import { useEffect, useState } from 'react'
import DemoRunSheet from '../DemoRunSheet'
import DemoScripts from '../DemoScripts'
import { useStore } from '../data/store'
import type { Db } from '../data/types'
import { nextStep, paymentNote } from '../frozen'
import { Badge, Section, grantStatus, money } from '../ui'
import type { Tone } from '../ui'
import scorecardJson from '../../../eval/scorecard.json'
import { isEdgeGrant } from '../people'
import './TestLab.css'
import { grantHeading } from '../plain'

interface Score { caught: number; missed: number; falseAlarms: number; correctPasses: number; notRun: number; mistakes: number; decoys: number }
interface Scorecard {
  today: string
  runner: string
  totals: Score
  features: (Score & { feature: string; label: string })[]
  cases: { id: string; feature: string; kind: string; refId: string; expected: string; got: string; outcome: string; notRun: boolean; detail: string }[]
  unlistedFalseAlarms: { feature: string; refId: string; what: string }[]
  unimplemented: { feature: string; label: string; notRun: number }[]
  withStandIns: { about: string; totals: Score; features: (Score & { feature: string })[]; cases: Record<string, { outcome: string }> }
}
const scorecard = scorecardJson as Scorecard

const outcomeTone: Record<string, Tone> = { caught: 'good', 'correct pass': 'good', missed: 'bad', 'false alarm': 'bad', 'not run': 'neutral' }


// Remember the picked grant while switching windows (the window remounts).
let lastGrantId: string | undefined

interface Note { id: number; tone: 'good' | 'bad'; text: string }

const paymentsOn = (db: Db, grantId: string) => db.statusEvents.filter(e => e.grantId === grantId && e.kind === 'payment_received').length

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
  const { db, injectStatusEvent, injectInvoice, advanceDays, loadDemoSeed } = useStore()
  const [confirmReset, setConfirmReset] = useState(false)
  const [grantId, setGrantIdState] = useState(lastGrantId ?? db.grants[0]?.id ?? '')
  const setGrantId = (id: string) => { lastGrantId = id; setGrantIdState(id) }
  const [payment, setPayment] = useState('25000')
  const presets = badInvoicePresets(db)
  const [presetKey, setPresetKey] = useState(presets[0]?.key ?? 'custom')
  const [orderId, setOrderId] = useState(db.orders[0]?.id ?? '')
  const [invAmount, setInvAmount] = useState('')
  const [days, setDays] = useState('7')
  const [notes, setNotes] = useState<Note[]>([])
  // A payment sent but not seen yet. Live, its rows arrive later over the
  // websocket, so the note is written once the new payment event shows up.
  const [pendingPay, setPendingPay] = useState<{ grantId: string; amount: number; wasFrozen: boolean; seen: number } | null>(null)

  const grant = db.grants.find(g => g.id === grantId)

  const note = (tone: Note['tone'], text: string) => setNotes(n => [{ id: Date.now() + Math.random(), tone, text }, ...n].slice(0, 6))
  /** Run an action; a returned string becomes a note now (undefined: the action writes its own later). */
  const run = (fn: () => string | undefined) => {
    try {
      const text = fn()
      if (text) note('good', text)
    } catch (e) {
      note('bad', (e as Error).message)
    }
  }

  useEffect(() => {
    if (!pendingPay || paymentsOn(db, pendingPay.grantId) <= pendingPay.seen) return
    setPendingPay(null)
    note('good', paymentNote(db, pendingPay.grantId, pendingPay.amount, pendingPay.wasFrozen))
  }, [db, pendingPay])

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
    const seen = paymentsOn(db, grantId)
    injectStatusEvent({ grantId, kind: 'payment_received', source: 'Payment system', summary: `Payment of ${money(amount)} received.`, amount })
    setPendingPay({ grantId, amount, wasFrozen: !!grant?.frozen, seen })
    return undefined
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

      <Section title="Demo script (3 min)">
        <DemoRunSheet />
      </Section>

      <Section title="Start over">
        <p className="muted">Replace the whole world with the demo seed: grant A frozen by a court order with no payment yet, the planted mistakes, and each cut script back at its first step. Live, this resets the shared world for everyone, and nothing done since can be brought back.</p>
        {confirmReset
          ? <div className="tl-row">
              <button type="button" className="tl-danger" onClick={() => { setConfirmReset(false); run(() => { loadDemoSeed(); return 'Loaded the demo seed.' }) }}>Yes, reset everything</button>
              <button type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          : <button type="button" onClick={() => setConfirmReset(true)}>Reset to the demo seed…</button>}
      </Section>

      <Section title="Cut scripts">
        <DemoScripts />
      </Section>

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
              {db.grants.filter(g => !isEdgeGrant(g)).map(g => <option key={g.id} value={g.id}>{grantHeading(g)} ({g.id})</option>)}
              <optgroup label="Edge cases">
                {db.grants.filter(isEdgeGrant).map(g => <option key={g.id} value={g.id}>{grantHeading(g)} ({g.id})</option>)}
              </optgroup>
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
            <p className="tl-next">{nextStep(db, grant)} <a href="#funds">See it in Funds</a></p>
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
            <span className="muted">Money actually lands. Spending unfreezes, unless something else still holds it.</span>
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

      <Section title="Planted mistakes scorecard" aside={<Badge>seed run, {scorecard.today}</Badge>}>
        <Scoreboard />
      </Section>
    </div>
  )
}

/** eval/scorecard.json: what the agents caught on the seed's planted mistakes and decoys. */
function Scoreboard() {
  const { totals, features, withStandIns: alone } = scorecard
  const ratio = (n: number, of: number) => (of ? `${n}/${of}` : '—')
  const row = (label: string, n: Score, rules?: Score) => (
    <tr key={label}>
      <th scope="row">{label}</th>
      <td>{ratio(n.caught, n.mistakes)}</td>
      <td>{n.missed}</td>
      <td>{n.falseAlarms}</td>
      <td>{ratio(n.correctPasses, n.decoys)}</td>
      <td>{n.notRun || ''}</td>
      <td className="tl-alone">{rules ? `${ratio(rules.caught, rules.mistakes)} caught, ${rules.falseAlarms} false` : ''}</td>
    </tr>
  )
  return (
    <>
      <div className="tl-scroll">
      <table className="tl-score">
        <thead>
          <tr><th>Feature</th><th>Caught</th><th>Missed</th><th>False alarms</th><th>Correct passes</th><th>Not run</th><th>Rules alone</th></tr>
        </thead>
        <tbody>
          {features.map(f => row(f.label, f, alone.features.find(a => a.feature === f.feature)))}
          {row('Overall', totals, alone.totals)}
        </tbody>
      </table>
      </div>
      {scorecard.unimplemented.length > 0 && (
        <p className="muted">
          Not run yet (no agent acts on these): {scorecard.unimplemented.map(f => f.label).join(', ')}. They count as missed.
          "Rules alone" calls the module's checks directly in place of those agents.
        </p>
      )}
      {scorecard.unlistedFalseAlarms.length > 0 && (
        <p className="muted">False alarms on records the key doesn't list: {scorecard.unlistedFalseAlarms.map(x => `${x.refId} (${x.what})`).join('; ')}</p>
      )}
      <details className="tl-cases">
        <summary>Every case ({scorecard.cases.length})</summary>
        <div className="tl-scroll">
        <table>
          <thead>
            <tr><th>Case</th><th>Record</th><th>Expected</th><th>Got</th><th>Outcome</th><th>Rules alone</th></tr>
          </thead>
          <tbody>
            {scorecard.cases.map(c => (
              <tr key={c.id} title={c.detail}>
                <td>{c.id}</td>
                <td>{c.refId}</td>
                <td>{c.expected}</td>
                <td>{c.got}</td>
                <td><Badge tone={outcomeTone[c.outcome] ?? 'neutral'}>{c.outcome}{c.notRun && c.outcome !== 'not run' ? ' (not run)' : ''}</Badge></td>
                <td><Badge tone={outcomeTone[alone.cases[c.id]?.outcome] ?? 'neutral'}>{alone.cases[c.id]?.outcome ?? '—'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>
      <p className="muted">
        From <code>./check.sh</code> (<code>node eval/score.mjs</code>), which runs sim/seed.json through {scorecard.runner} and
        compares the result with sim/answer-key.json. Imported when the app is built, so it shows the seed run, not live changes.
      </p>
    </>
  )
}
