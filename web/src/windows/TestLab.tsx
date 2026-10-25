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
import itemCheckJson from '../../../eval/item-check-real.json'
import fundTrackerJson from '../../../eval/fund-tracker-real.json'
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

interface ItemCase {
  id: string
  auditee: string
  year?: string
  item: string
  price: number
  expect: 'flag' | 'pass'
  why?: string
  outcome: string
  decision: { label: string }
}
interface ItemTally { items: number; mistakes: number; caught: number; missed: number; decoys: number; correctPasses: number; falseAlarms: number; notRun: number }
interface ItemCheck {
  model: string
  totals: ItemTally & { categoryAgrees: number; categoryChecked: number }
  byDecision: Record<string, ItemTally>
  items: ItemCase[]
}
const itemCheck = itemCheckJson as ItemCheck

interface TrackerRow { case: string; grantId: string; kind: string; org: string; day: string; facts: string; expected: string; got: string; trackerSaid: string; outcome: string }
interface FundTracker {
  totals: { checks: number; grants: number; caught: number; missed: number; falseAlarms: number; correctPasses: number }
  rows: TrackerRow[]
}
const fundTracker = fundTrackerJson as FundTracker

const outcomeTone: Record<string, Tone> = { caught: 'good', 'correct pass': 'good', missed: 'bad', 'false alarm': 'bad', 'no case': 'bad', 'out of scope': 'neutral', 'not run': 'neutral' }


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
  // The award is the budget (T117): a payment means the funder pays again, so
  // it sends the rest of the award; there is no amount to type.
  const pay = () => run(() => {
    if (!grant) return undefined
    const amount = Math.max(1, Math.round(grant.awarded - grant.received))
    const seen = paymentsOn(db, grantId)
    injectStatusEvent({ grantId, kind: 'payment_received', source: 'Payment system', summary: `The funder pays again: ${money(amount)}, the rest of the award (simulated).`, amount })
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
              <optgroup label="Failure cases">
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
              <span className="muted">Budget: the award, {money(grant.awarded)}</span>
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
            <span className="muted">The funder pays again, so the whole award is the budget. Spending unfreezes, unless something else still holds it.</span>
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

      <Section title="Fund tracker on real grants" aside={<Badge>{fundTracker.totals.grants} real grants</Badge>}>
        <FundTrackerBoard />
      </Section>
      <Section title="Real audit findings" aside={<Badge>{realFindings.totals.findings} real costs</Badge>}>
        <RealFindingsBoard />
      </Section>
      <Section title="Item check on real audited items" aside={<Badge>{itemCheck.totals.items} real items</Badge>}>
        <ItemCheckBoard />
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

/**
 * eval/item-check-real.json: items auditors questioned (should be flagged) and
 * items the funder or auditor accepted (should pass), each run once through
 * Claude's item check with the answer saved and replayed by the check.
 */
function ItemCheckBoard() {
  const { totals: t, byDecision: b, items, model } = itemCheck
  const ratio = (n: number, of: number) => (of ? `${n}/${of}` : '—')
  return (
    <>
      <p>
        <strong>{t.caught} of {t.mistakes}</strong> unallowable items flagged, {t.missed} missed;
        {' '}<strong>{t.correctPasses} of {t.decoys}</strong> accepted items passed, {t.falseAlarms} false alarms.
        {' '}Claude ({model}) leans toward flagging: food, clothing and items with no stated purpose get flagged even when the funder allowed them.
      </p>
      <div className="tl-scroll">
      <table className="tl-score">
        <thead>
          <tr><th>Decided by</th><th>Flagged</th><th>Accepted items passed</th></tr>
        </thead>
        <tbody>
          {Object.entries(b).map(([label, x]) => (
            <tr key={label}>
              <th scope="row">{DECIDED[label] ?? label}</th>
              <td>{ratio(x.caught, x.mistakes)}</td>
              <td>{ratio(x.correctPasses, x.decoys)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <details className="tl-cases">
        <summary>Every item ({items.length})</summary>
        <div className="tl-scroll">
        <table>
          <thead>
            <tr><th>Case</th><th>Audited</th><th>Item</th><th>Decided</th><th>Outcome</th></tr>
          </thead>
          <tbody>
            {items.map(c => (
              <tr key={c.id} title={c.why ?? ''}>
                <td>{c.id}</td>
                <td>{c.auditee} {c.year ?? ''}</td>
                <td>{c.item}, {money(c.price)}{c.why ? <span className="muted"> (Claude: {c.why})</span> : null}</td>
                <td>{DECIDED[c.decision.label] ?? c.decision.label}</td>
                <td><Badge tone={outcomeTone[c.outcome] ?? 'neutral'}>{c.outcome}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>
      <p className="muted">
        From <code>./check.sh</code> (<code>node eval/item-check-real.mjs</code>). Each item quotes a saved audit report and the
        decision on it in docs/research/sources/docs/. Claude was asked once per item; its answers are saved and replayed.
      </p>
    </>
  )
}

/**
 * eval/fund-tracker-real.json: real NIH grants from Grant Witness, replayed
 * month by month through the real tracker against saved readings of the
 * cancellation list, USAspending and RePORTER as they stood on each day.
 */
function FundTrackerBoard() {
  const { totals: t, rows } = fundTracker
  return (
    <>
      <p>
        <strong>{t.caught} of {t.caught + t.missed}</strong> checks where spending should be stopped or flagged were caught, {t.missed} missed;
        {' '}<strong>{t.correctPasses} of {t.correctPasses + t.falseAlarms}</strong> where it should be open passed, {t.falseAlarms} false alarms,
        {' '}over {t.checks} checks on {t.grants} grants. All {t.falseAlarms} false alarms are grants whose freeze was lifted: the tracker
        keeps them frozen after the lift.
      </p>
      <details className="tl-cases">
        <summary>Every check ({rows.length})</summary>
        <div className="tl-scroll">
        <table>
          <thead>
            <tr><th>Grant</th><th>Day</th><th>What the records show</th><th>Expected</th><th>Outcome</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.case}-${r.grantId}-${r.day}`} title={r.trackerSaid}>
                <td>{r.grantId}<span className="muted"> {r.org}</span></td>
                <td>{r.day}</td>
                <td>{r.facts}</td>
                <td>{r.expected}</td>
                <td><Badge tone={outcomeTone[r.outcome] ?? 'neutral'}>{r.outcome}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>
      <p className="muted">
        From <code>./check.sh</code> (<code>node eval/fund-tracker-real.mjs</code>). Each fact is checked against its saved
        source; what should happen on each day follows the grant office's rule: frozen from cancellation until a payment
        lands after a restoration.
      </p>
    </>
  )
}
