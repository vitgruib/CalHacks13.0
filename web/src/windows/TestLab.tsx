// Testing events (was "Demo controls"): demo only, for us and the judges. Start
// over from the demo seed, or drop grant status events into the raw world (T18);
// the agents react to what lands here. Events change grants directly (cancel,
// restore, pay); nothing moves the clock. The evals are on their own page (Evals.tsx).
import { useEffect, useState } from 'react'
import { useStore } from '../data/store'
import type { Db } from '../data/types'
import { nextStep, paymentNote } from '../frozen'
import { Badge, Section, grantStatus, money } from '../ui'
import { openHolds } from './Inbox'
import { GRANT_HOLDS, fundsHref } from './Funds'
import './TestLab.css'
import { grantHeading } from '../plain'

// Remember the picked grant while switching windows (the window remounts).
let lastGrantId: string | undefined

interface Note { id: number; tone: 'good' | 'bad'; text: string; link?: { href: string; label: string } }

/** Open Inbox items about the grant itself; they are decided on its Funds card. */
const waitingOn = (db: Db, grantId: string) => openHolds(db, ...GRANT_HOLDS).some(h => h.grantId === grantId)

const paymentsOn = (db: Db, grantId: string) => db.statusEvents.filter(e => e.grantId === grantId && e.kind === 'payment_received').length

export default function TestLab() {
  const { db, injectStatusEvent, loadDemoSeed } = useStore()
  const [confirmReset, setConfirmReset] = useState(false)
  const [grantId, setGrantIdState] = useState(lastGrantId ?? db.grants[0]?.id ?? '')
  const setGrantId = (id: string) => { lastGrantId = id; setGrantIdState(id) }
  const [notes, setNotes] = useState<Note[]>([])
  // A payment sent but not seen yet. Live, its rows arrive later over the
  // websocket, so the note is written once the new payment event shows up.
  const [pendingPay, setPendingPay] = useState<{ grantId: string; amount: number; wasFrozen: boolean; seen: number } | null>(null)

  const grant = db.grants.find(g => g.id === grantId)

  const note = (tone: Note['tone'], text: string, link?: Note['link']) => setNotes(n => [{ id: Date.now() + Math.random(), tone, text, link }, ...n].slice(0, 6))
  /** Run an action; once it lands, `text` becomes a note (none: the action writes its own later). A refusal becomes a bad note. */
  const run = async (act: () => Promise<void>, text?: string) => {
    try {
      await act()
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

  const cancel = () => run(
    () => injectStatusEvent({ grantId, kind: 'canceled', source: 'Cancellation list (Apify)', summary: 'Grant appears on the terminated-grants list.' }),
    `${grantId} canceled on ${db.today}. Spending is frozen.`,
  )
  const courtOrder = () => run(
    () => injectStatusEvent({ grantId, kind: 'court_order', source: 'Court notice', summary: `Court order restores ${grantId}. No payment schedule is set.` }),
    `Court order restores ${grantId}. Spending stays frozen: a court order is not cash.`,
  )
  // The award is the budget (T119): a payment means the funder pays again, so
  // it sends the rest of the award; there is no amount to type.
  const pay = () => run(async () => {
    if (!grant) return
    const amount = Math.max(1, Math.round(grant.awarded - grant.received))
    const seen = paymentsOn(db, grantId)
    setPendingPay({ grantId, amount, wasFrozen: !!grant.frozen, seen })
    try {
      await injectStatusEvent({ grantId, kind: 'payment_received', source: 'Payment system', summary: `The funder pays again: ${money(amount)}, the rest of the award (simulated).`, amount })
    } catch (e) {
      setPendingPay(null)
      throw e
    }
  })

  return (
    <div className="testlab">
      <p className="demo-banner" role="note">
        <strong>Testing events, demo only.</strong> This panel is for us and the judges to drive the simulation. A real grant office
        would not have it. Nothing here is a decision; the grant office decides on Funds, Requests and Invoice.
      </p>

      {notes.length > 0 && (
        <ul className="tl-notes" aria-live="polite" aria-label="What just happened">
          {notes.map((n, i) => <li key={n.id} className={`${n.tone}${i === 0 ? ' latest' : ''}`}>{n.text}{n.link && <> <a href={n.link.href}>{n.link.label}</a></>}</li>)}
        </ul>
      )}

      <Section title="Start over">
        <p className="muted">Replace the whole world with the demo seed. Its grants are real NIH awards (real grant IDs, institutes and end dates); the lab around them is simulated. It holds grant A frozen by a court order with no payment yet and the planted mistakes. Live, this resets the shared world for everyone, and nothing done since can be brought back.</p>
        {confirmReset
          ? <div className="tl-row">
              <button type="button" className="tl-danger" onClick={() => { setConfirmReset(false); run(loadDemoSeed, 'Loaded the demo seed.') }}>Yes, reset everything</button>
              <button type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          : <button type="button" onClick={() => setConfirmReset(true)}>Reset to the demo seed…</button>}
      </Section>

      <Section title="Grant status events">
        <div className="tl-row">
          <label className="tl-field">Grant
            <select value={grantId} onChange={e => setGrantId(e.target.value)}>
              {db.grants.map(g => <option key={g.id} value={g.id}>{grantHeading(g)} ({g.id})</option>)}
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
    </div>
  )
}
