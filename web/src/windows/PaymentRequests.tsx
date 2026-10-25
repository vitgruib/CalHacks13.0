// Payment requests (MASTER-PLAN §3.4, §4). Grant manager reads drafted
// requests and follow-ups here. No decision buttons: those live in the Inbox.
import type { Db, FollowUp, PaymentRequest } from '../data/types'
import { useStore } from '../data/store'
import { Badge, Empty, Section, money, type Tone } from '../ui'
import './PaymentRequests.css'

const LIMIT = 1_000

const requestState: Record<PaymentRequest['state'], { label: string; tone: Tone }> = {
  drafted: { label: 'Drafted', tone: 'neutral' },
  waiting_on_manager: { label: 'Waiting on you', tone: 'warn' },
  sent: { label: 'Sent to the agency', tone: 'neutral' },
  paid: { label: 'Paid', tone: 'good' },
}

const followUpState: Record<FollowUp['state'], { label: string; tone: Tone }> = {
  drafted: { label: 'Answer drafted', tone: 'neutral' },
  waiting_on_manager: { label: 'Waiting on you', tone: 'warn' },
  sent: { label: 'Answer sent', tone: 'good' },
}

/** Plain description of a purchase, from the request if we have it, else from its order and invoice. */
function describe(db: Db, requestId: string, grantId: string): { name: string; amount?: number; held: string | null } {
  const rq = db.requests.find(r => r.id === requestId)
  const orders = db.orders.filter(o => o.requestId === requestId)
  const invoices = db.invoices.filter(i => orders.some(o => o.id === i.orderId))
  const heldInvoice = invoices.find(i => i.state === 'held')
  const openHold = db.holds.find(h => !h.decision && (h.refId === requestId || invoices.some(i => i.id === h.refId)))

  let held: string | null = null
  if (rq && (rq.state === 'waiting_on_manager' || rq.state === 'blocked' || rq.state === 'rejected')) held = `request is ${rq.state.replace(/_/g, ' ')}`
  else if (heldInvoice) held = `invoice ${heldInvoice.id} is on hold`
  else if (openHold) held = `open hold ${openHold.id}`

  const share = rq?.split?.find(s => s.grantId === grantId)?.share ?? 1
  // What was bought: the order's approved change if any, as the module claims it.
  const bought = orders.filter(o => o.state !== 'canceled').reduce((s, o) => s + (o.changedAmount ?? o.amount), 0)
  if (rq) return { name: rq.item, amount: Math.round((bought || rq.price) * share), held }
  // A salary row left out (for example, effort over 100% across grants).
  const pay = db.payroll.find(p => p.id === requestId)
  if (pay) return { name: `${pay.person}'s salary (${pay.role}, ${pay.effortPct}% effort, ${pay.period.from} to ${pay.period.to})`, amount: pay.amount, held }
  const o = orders[0]
  if (o) return { name: `${o.vendor} order ${o.id}${invoices[0] ? `, invoice ${invoices[0].id}` : ''}`, amount: invoices[0]?.amount ?? o.amount, held }
  return { name: `Request ${requestId} (no record found)`, held }
}

function CharCount({ text }: { text: string }) {
  const n = text.length
  const over = n > LIMIT
  return (
    <p className={`pr-count ${over ? 'over' : ''}`} aria-live="polite">
      <Badge tone={over ? 'bad' : 'good'}>{over ? 'Over the limit' : 'Within limit'}</Badge>{' '}
      {n.toLocaleString('en-US')} / {LIMIT.toLocaleString('en-US')} characters
      {over && <> ({(n - LIMIT).toLocaleString('en-US')} too many)</>}
    </p>
  )
}

function InboxLink({ waiting }: { waiting: boolean }) {
  return waiting ? <a className="pr-inbox" href="#inbox">Decide in the Inbox →</a> : null
}

function RequestCard({ pr }: { pr: PaymentRequest }) {
  const { db } = useStore()
  const grant = db.grants.find(g => g.id === pr.grantId)
  const st = requestState[pr.state]
  const included = pr.includedRequestIds.map(id => ({ id, ...describe(db, id, pr.grantId) }))
  const excluded = pr.excluded.map(x => ({ ...x, ...describe(db, x.requestId, pr.grantId) }))
  const heldIncluded = included.filter(i => i.held)
  const prHold = db.holds.find(h => h.kind === 'payment_request' && h.refId === pr.id && !h.decision)
  const waiting = pr.state === 'waiting_on_manager' || !!prHold

  return (
    <Section
      title={`${pr.grantId}: ${pr.from} to ${pr.to}`}
      aside={<span className="pr-head"><strong>{money(pr.amount)}</strong> <Badge tone={st.tone}>{st.label}</Badge></span>}
    >
      <div className="pr">
      {grant && <p className="pr-sub">{grant.title}{grant.frozen && <> · <Badge tone="bad">Grant frozen</Badge></>}</p>}
      <InboxLink waiting={waiting} />

      <h3>Explanation</h3>
      <blockquote className="pr-text">{pr.explanation}</blockquote>
      <CharCount text={pr.explanation} />

      <h3>Held items check</h3>
      {heldIncluded.length === 0 ? (
        <p><Badge tone="good">Pass</Badge> Nothing on hold is included.{excluded.length > 0 && ` ${excluded.length} item${excluded.length > 1 ? 's' : ''} left out, listed below with the reason.`}</p>
      ) : (
        <p><Badge tone="bad">Fail</Badge> This request includes {heldIncluded.length} item{heldIncluded.length > 1 ? 's' : ''} still on hold: {heldIncluded.map(i => `${i.name} (${i.held})`).join('; ')}.</p>
      )}

      <div className="pr-cols">
        <div>
          <h3>Included ({included.length})</h3>
          {included.length === 0 ? <Empty>No purchases listed.</Empty> : (
            <ul className="pr-list">
              {included.map(i => (
                <li key={i.id}>
                  <span>{i.name}</span>
                  {i.amount !== undefined && <span className="pr-amt">{money(i.amount)}</span>}
                  {i.held && <Badge tone="bad">On hold: {i.held}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Left out ({excluded.length})</h3>
          {excluded.length === 0 ? <Empty>Nothing left out.</Empty> : (
            <ul className="pr-list">
              {excluded.map(x => (
                <li key={x.requestId}>
                  <span>{x.name}</span>
                  {x.amount !== undefined && <span className="pr-amt">{money(x.amount)}</span>}
                  <span className="pr-why">Why: {x.why}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <h3>Follow-up questions ({pr.followUps.length})</h3>
      {pr.followUps.length === 0 ? <Empty>The agency has not asked anything yet.</Empty> : pr.followUps.map(fu => {
        const fs = fu.state === 'drafted' && !fu.answerDraft ? { label: 'Not answered yet', tone: 'warn' as Tone } : followUpState[fu.state]
        const fuHold = db.holds.find(h => h.kind === 'follow_up' && h.refId === fu.id && !h.decision)
        return (
          <article key={fu.id} className="pr-fu">
            <header><Badge tone={fs.tone}>{fs.label}</Badge><InboxLink waiting={fu.state === 'waiting_on_manager' || !!fuHold} /></header>
            <p><span className="pr-label">Agency asked</span>{fu.question}</p>
            <p><span className="pr-label">Drafted answer</span>{fu.answerDraft ?? <em className="pr-muted">Not drafted yet.</em>}</p>
          </article>
        )
      })}
      </div>
    </Section>
  )
}

export default function PaymentRequests() {
  const { db } = useStore()
  if (db.paymentRequests.length === 0) return <Empty>No payment requests drafted yet.</Empty>
  return <>{db.paymentRequests.map(pr => <RequestCard key={pr.id} pr={pr} />)}</>
}
