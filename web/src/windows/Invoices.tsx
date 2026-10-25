import { useStore } from '../data/store'
import type { Approval, Hold, Invoice, Order } from '../data/types'
import { Badge, Empty, Section, money, type Tone } from '../ui'
import { HoldCard, openHolds } from './Inbox'
import './Invoices.css'

const stateLabel: Record<Invoice['state'], string> = { matched: 'Matched', held: 'Held', paid: 'Paid', rejected: 'Rejected' }
const stateTone: Record<Invoice['state'], Tone> = { matched: 'good', held: 'bad', paid: 'good', rejected: 'neutral' }
const orderLabel: Record<Order['state'], string> = { open: 'Open', canceled: 'Canceled', changed: 'Changed', paid: 'Paid' }
const people: Record<string, string> = { grant_manager: 'the grant manager', scientist: 'the scientist', funder: 'the funder' }

function InvoiceCard({ inv, order, approval, hold }: { inv: Invoice; order?: Order; approval?: Approval; hold?: Hold }) {
  const unchecked = inv.checked === false
  const held = !unchecked && inv.state === 'held'
  return (
    <article className={`inv-card ${held ? 'inv-held' : unchecked || inv.state === 'rejected' ? '' : 'inv-ok'}`} aria-labelledby={`inv-${inv.id}`}>
      <header>
        <h3 id={`inv-${inv.id}`}>{inv.vendor}</h3>
        <span className="inv-amount">{money(inv.amount)}</span>
        {unchecked ? <Badge>Not checked yet</Badge> : <Badge tone={stateTone[inv.state]}>{stateLabel[inv.state]}</Badge>}
        <span className="inv-muted">Invoice {inv.id}, received {inv.received}</span>
      </header>

      {unchecked ? <p className="inv-muted">Arrived; the bookkeeping agent hasn't matched it to its order yet.</p> : inv.mismatch
        ? <p className="inv-mismatch"><strong>Mismatch:</strong> {inv.mismatch}</p>
        : inv.state === 'matched' && <p className="inv-match">Matches its order and its approval, so it is ready to pay.</p>}

      {hold && !hold.decision
        ? <HoldCard key={hold.id} hold={hold} embedded />
        : held && hold?.decision && <p className="inv-muted">Decided by {people[hold.decision.by] ?? hold.decision.by} on {hold.decision.day}: {hold.decision.choice.replace('_', ' ')}. Reason: {hold.decision.reason}</p>}

      <dl className="inv-facts">
        <dt>Order</dt>
        <dd>
          {order ? (
            <>
              {order.id}: {money(order.amount)}, placed {order.placed}, {' '}
              <Badge tone={order.state === 'canceled' ? 'bad' : order.state === 'changed' ? 'warn' : 'neutral'}>{orderLabel[order.state]}</Badge>
              {order.canceledOn && <> on {order.canceledOn}</>}
              {order.changedAmount !== undefined && <> to {money(order.changedAmount)}</>}
            </>
          ) : <span className="inv-bad">No order found ({inv.orderId})</span>}
        </dd>
        <dt>Approval</dt>
        <dd>
          {approval
            ? <>{money(approval.amount)} by {people[approval.by] ?? approval.by} on {approval.day}</>
            : order ? <>Original order amount ({money(order.amount)}); no separate approval</> : <span className="inv-bad">None found</span>}
        </dd>
      </dl>

      <h4 className="inv-sub">What happened</h4>
      <ol className="inv-timeline">
        {inv.timeline.map((t, i) => (
          <li key={i}><time dateTime={t.day}>{t.day}</time> {t.what}</li>
        ))}
      </ol>
    </article>
  )
}

export default function Invoices() {
  const { db } = useStore()
  const holds = openHolds(db, 'invoice')
  const waiting = (i: Invoice) => holds.some(h => h.refId === i.id)
  // Waiting for a decision first, then held, then newest received first.
  const list = [...db.invoices].sort((a, b) => Number(waiting(b)) - Number(waiting(a)) || Number(b.state === 'held') - Number(a.state === 'held') || b.received.localeCompare(a.received))
  const heldCount = list.filter(i => i.state === 'held').length
  const waitingCount = list.filter(waiting).length

  return (
    <Section
      title="Bills"
      aside={<span className="inv-muted">{list.length} invoices, {heldCount} held{waitingCount > 0 && <>, <Badge tone="warn">{waitingCount} waiting for you</Badge></>}</span>}
    >
      {list.length === 0 ? <Empty>No invoices yet.</Empty> : (
        <div className="inv-list">
          {list.map(inv => (
            <InvoiceCard
              key={inv.id}
              inv={inv}
              order={db.orders.find(o => o.id === inv.orderId)}
              approval={db.approvals.find(a => a.orderId === inv.orderId)}
              hold={holds.find(h => h.refId === inv.id) ?? db.holds.find(h => h.kind === 'invoice' && h.refId === inv.id)}
            />
          ))}
        </div>
      )}
    </Section>
  )
}
