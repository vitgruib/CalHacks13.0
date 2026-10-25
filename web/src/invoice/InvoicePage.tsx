// One invoice in full: the financial detail page the arrow on each card opens
// (`#invoices/<id>`). Shows the invoice beside its purchase order, the grant and
// budget checks, the evidence and the audit trail. The grant office also gets
// the decision form here; a researcher sees it read-only.
import { useContext } from 'react'
import type { Db } from '../data/types'
import { ResearcherContext } from '../people'
import { Badge, money } from '../ui'
import { demoSubmissions } from './demo'
import { AuditTrail, StatusBadge } from './Findings'
import { parseAmount } from './model'
import { Review } from './Office'
import { useSubmissions } from './store'

const people: Record<string, string> = { grant_manager: 'the grant manager', scientist: 'the scientist', funder: 'the funder' }

export default function InvoicePage({ db, id }: { db: Db; id: string }) {
  const researcher = useContext(ResearcherContext)
  const subs = useSubmissions()
  const samples = demoSubmissions(db, researcher?.name ?? 'Sofia Alvarez')
  const sub = subs.find(s => s.id === id) ?? [...samples.action, ...samples.approved, ...samples.escalated, ...samples.denied].find(s => s.id === id)
  const bill = db.invoices.find(i => i.id === id)
  const back = <a className="iv-back" href="#invoices"><span aria-hidden="true">←</span> All invoices</a>

  if (sub) {
    return (
      <div className="iv iv-page">
        {back}
        <header className="iv-page-head">
          <h1>{sub.vendor}</h1><span className="iv-amt">{money(parseAmount(sub.amount))}</span><StatusBadge status={sub.status} />
        </header>
        <p className="iv-note">Submitted by {sub.researcher} on {sub.submittedOn}</p>
        <Review db={db} s={sub} decide={!researcher} />
      </div>
    )
  }
  if (bill) {
    const order = db.orders.find(o => o.id === bill.orderId)
    const approval = db.approvals.find(a => a.orderId === bill.orderId)
    return (
      <div className="iv iv-page">
        {back}
        <header className="iv-page-head">
          <h1>{bill.vendor}</h1><span className="iv-amt">{money(bill.amount)}</span>
          <Badge tone={bill.state === 'held' ? 'bad' : 'good'}>{bill.state === 'held' ? 'Held for review' : bill.state === 'paid' ? 'Paid' : bill.state === 'matched' ? 'Matched, ready to pay' : 'Rejected'}</Badge>
        </header>
        <p className="iv-note">Invoice {bill.id}, received {bill.received}, checked by the bookkeeping agent</p>
        {bill.mismatch && <p className="iv-warnbox"><strong>Mismatch:</strong> {bill.mismatch}</p>}
        <div className="iv-sbs">
          <div className="iv-panel">
            <h3 className="iv-h3">Invoice</h3>
            <dl className="iv-facts"><dt>Vendor</dt><dd>{bill.vendor}</dd><dt>Total</dt><dd><strong>{money(bill.amount)}</strong></dd><dt>Received</dt><dd>{bill.received}</dd></dl>
          </div>
          <div className="iv-panel">
            <h3 className="iv-h3">Order and approval</h3>
            {order ? (
              <dl className="iv-facts">
                <dt>Order</dt><dd>{order.id}</dd><dt>Placed</dt><dd>{order.placed}</dd>
                <dt>Amount</dt><dd><strong>{money(order.changedAmount ?? order.amount)}</strong> ({order.state})</dd>
                <dt>Approval</dt><dd>{approval ? `${money(approval.amount)} by ${people[approval.by] ?? approval.by} on ${approval.day}` : 'Original order amount; no separate approval'}</dd>
              </dl>
            ) : <p className="iv-note">No order found ({bill.orderId}).</p>}
          </div>
        </div>
        <h3 className="iv-h3">What happened</h3>
        <AuditTrail audit={bill.timeline.map(t => ({ day: t.day, who: '', what: t.what }))} />
      </div>
    )
  }
  return <div className="iv iv-page">{back}<p className="iv-note">That invoice is not available.</p></div>
}
