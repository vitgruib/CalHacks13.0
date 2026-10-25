// Demo controls (was "Test lab"): demo only, for us and the judges. Every demo
// action lives here: start over from the demo seed, the real failure cases (T65),
// drop events into the raw world (T18); the agents react to what lands here.
// Demos change grants directly (cancel, restore, pay); nothing moves the clock. The
// results shown are real cases only (T113): eval/real-findings.json, written by
// the check command and imported at build time. The seed's made-up cases
// (eval/scorecard.json) are a regression test in check.sh and aren't shown.
import { useEffect, useState } from 'react'
import FailureCases from '../FailureCases'
import { useStore } from '../data/store'
import type { Db } from '../data/types'
import { nextStep, paymentNote } from '../frozen'
import { Badge, Section, grantStatus, money } from '../ui'
import type { Tone } from '../ui'
import realFindingsJson from '../../../eval/real-findings.json'
import { edgeCaseOf, isEdgeGrant } from '../people'
import { openHolds } from './Inbox'
import { GRANT_HOLDS, fundsHref } from './Funds'
import './TestLab.css'
import { grantHeading } from '../plain'

interface Finding {
  id: string
  what: string
  rule?: string
  outcome: string
  why?: string
  source: { auditee: string; year?: string; amount: number | null; file: string }
  decision: { label: string; note?: string }
}
interface Tally { findings: number; outOfScope: number; mistakes: number; caught: number; decoys: number; passed: number }
interface RealFindings {
  byDecision: Record<'disallowed' | 'allowed' | 'partly' | 'agreed' | 'auditor', Tally>
  totals: { findings: number; inScope: number; caught: number; missed: number; outOfScope: number; decoys: number; correctPasses: number; falseAlarms: number }
  findings: Finding[]
}
const realFindings = realFindingsJson as RealFindings

const outcomeTone: Record<string, Tone> = { caught: 'good', 'correct pass': 'good', missed: 'bad', 'false alarm': 'bad', 'no case': 'bad', 'out of scope': 'neutral' }


// Remember the picked grant while switching windows (the window remounts).
let lastGrantId: string | undefined

interface Note { id: number; tone: 'good' | 'bad'; text: string; link?: { href: string; label: string } }

/** Open Inbox items about the grant itself; they are decided on its Funds card. */
const waitingOn = (db: Db, grantId: string) => openHolds(db, ...GRANT_HOLDS).some(h => h.grantId === grantId)

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
  const { db, injectStatusEvent, injectInvoice, loadDemoSeed } = useStore()
  const [confirmReset, setConfirmReset] = useState(false)
  const [grantId, setGrantIdState] = useState(lastGrantId ?? db.grants[0]?.id ?? '')
  const setGrantId = (id: string) => { lastGrantId = id; setGrantIdState(id) }
  const [payment, setPayment] = useState('25000')
  const presets = badInvoicePresets(db)
  const [presetKey, setPresetKey] = useState(presets[0]?.key ?? 'custom')
  const [orderId, setOrderId] = useState(db.orders[0]?.id ?? '')
  const [invAmount, setInvAmount] = useState('')
  const [notes, setNotes] = useState<Note[]>([])
  // A payment sent but not seen yet. Live, its rows arrive later over the
  // websocket, so the note is written once the new payment event shows up.
  const [pendingPay, setPendingPay] = useState<{ grantId: string; amount: number; wasFrozen: boolean; seen: number } | null>(null)

  const grant = db.grants.find(g => g.id === grantId)

  const note = (tone: Note['tone'], text: string, link?: Note['link']) => setNotes(n => [{ id: Date.now() + Math.random(), tone, text, link }, ...n].slice(0, 6))
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
    const id = pendingPay.grantId
    note('good', paymentNote(db, id, pendingPay.amount, pendingPay.wasFrozen), waitingOn(db, id) ? { href: fundsHref(id), label: 'Decide it in Funds' } : undefined)
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

  return (
    <div className="testlab">
      <p className="demo-banner" role="note">
        <strong>Demo only.</strong> This window is for us and the judges to drive the simulation. A real grant office
        would not have it. Nothing here is a decision; the grant office decides on Funds, Requests and Invoice.
      </p>

      {notes.length > 0 && (
        <ul className="tl-notes" aria-live="polite" aria-label="What just happened">
          {notes.map((n, i) => <li key={n.id} className={`${n.tone}${i === 0 ? ' latest' : ''}`}>{n.text}{n.link && <> <a href={n.link.href}>{n.link.label}</a></>}</li>)}
        </ul>
      )}

      <Section title="Start over">
        <p className="muted">Replace the whole world with the demo seed: grant A frozen by a court order with no payment yet, the planted mistakes, and each real failure case back at its first step. Live, this resets the shared world for everyone, and nothing done since can be brought back.</p>
        {confirmReset
          ? <div className="tl-row">
              <button type="button" className="tl-danger" onClick={() => { setConfirmReset(false); run(() => { loadDemoSeed(); return 'Loaded the demo seed.' }) }}>Yes, reset everything</button>
              <button type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          : <button type="button" onClick={() => setConfirmReset(true)}>Reset to the demo seed…</button>}
      </Section>

      <Section title="Real failure cases">
        <FailureCases />
      </Section>

      <Section title="Grant status events">
        <div className="tl-row">
          <label className="tl-field">Grant
            <select value={grantId} onChange={e => setGrantId(e.target.value)}>
              {db.grants.filter(g => !isEdgeGrant(g)).map(g => <option key={g.id} value={g.id}>{grantHeading(g)} ({g.id})</option>)}
              <optgroup label="Edge cases">
                {db.grants.filter(isEdgeGrant).map(g => <option key={g.id} value={g.id}>{edgeCaseOf(g)}: {grantHeading(g)} ({g.id})</option>)}
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
            <p className="tl-next">{nextStep(db, grant)} <a href={fundsHref(grant.id)}>{waitingOn(db, grant.id) ? 'Decide it in Funds' : 'See it in Funds'}</a></p>
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

      <Section title="Real audit findings" aside={<Badge>{realFindings.totals.findings} real costs</Badge>}>
        <RealFindingsBoard />
      </Section>
    </div>
  )
}

const DECIDED: Record<string, string> = {
  disallowed: 'Funder disallowed',
  allowed: 'Funder allowed',
  partly: 'Partly allowed',
  agreed: 'Auditee agreed',
  auditor: 'Auditor only',
}

/**
 * eval/real-findings.json: questioned costs from real audit reports, rebuilt
 * as records and run through the real module and agents, graded by what was
 * finally decided about each cost.
 */
function RealFindingsBoard() {
  const { totals: t, byDecision: b, findings } = realFindings
  const ratio = (n: number, of: number) => (of ? `${n}/${of}` : '—')
  const row = (label: string, x: Tally, graded: string) => (
    <tr key={label}>
      <th scope="row">{label}</th>
      <td>{ratio(x.caught, x.mistakes)}</td>
      <td>{ratio(x.passed, x.decoys)}</td>
      <td>{x.outOfScope || ''}</td>
      <td className="muted">{graded}</td>
    </tr>
  )
  return (
    <>
      <p>
        <strong>{t.caught} of {t.inScope}</strong> in-scope findings stopped, {t.missed} missed;
        {' '}<strong>{t.correctPasses} of {t.decoys}</strong> costs the funder allowed passed; {t.falseAlarms} false alarms.
        {' '}{t.outOfScope} more are listed as out of scope, with the reason.
      </p>
      <div className="tl-scroll">
      <table className="tl-score">
        <thead>
          <tr><th>Decided by</th><th>Stopped</th><th>Allowed costs passed</th><th>Out of scope</th><th>Ground truth</th></tr>
        </thead>
        <tbody>
          {row(DECIDED.disallowed, b.disallowed, "the funder's resolution letter")}
          {row(DECIDED.allowed, b.allowed, "the funder's resolution letter")}
          {row(DECIDED.agreed, b.agreed, 'the auditee agreed in the report')}
          {row(DECIDED.auditor, b.auditor, "the auditor's finding")}
          {row(DECIDED.partly, b.partly, 'part allowed, items not named')}
        </tbody>
      </table>
      </div>
      <details className="tl-cases">
        <summary>Every finding ({findings.length})</summary>
        <div className="tl-scroll">
        <table>
          <thead>
            <tr><th>Case</th><th>Audited</th><th>What the auditors found</th><th>Decided</th><th>Outcome</th></tr>
          </thead>
          <tbody>
            {findings.map(f => (
              <tr key={f.id} title={f.why ?? f.rule ?? ''}>
                <td>{f.id}</td>
                <td>{f.source.auditee} {f.source.year ?? ''}{f.source.amount != null ? `, ${money(f.source.amount)}` : ''}</td>
                <td>{f.what}{f.why ? <span className="muted"> ({f.why})</span> : null}</td>
                <td>{DECIDED[f.decision.label] ?? f.decision.label}</td>
                <td><Badge tone={outcomeTone[f.outcome] ?? 'neutral'}>{f.outcome}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>
      <p className="muted">
        From <code>./check.sh</code> (<code>node eval/real-findings.mjs</code>). Each case quotes a saved audit report in
        docs/research/sources/docs/, and the check fails if the quote isn't there. The cost is rebuilt as records in a copy of the
        simulated lab and run through the real module and agents. Imported when the app is built.
      </p>
    </>
  )
}
