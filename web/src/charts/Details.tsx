// What's behind each color of the donut, opened from its button under the charts:
// committed = who in the lab ordered what, spent = the receipts and payroll,
// available = how the award adds up. Shown on the details page (DetailPage),
// opened in a new tab from either window.
import type { Db, Grant, Invoice, Order, PurchaseRequest } from '../data/types'
import { requesterLabel } from '../people'
import { longDate } from '../plain'
import { money } from '../ui'
import './charts.css'

export type Segment = 'spent' | 'committed' | 'available'

/** The part of a request's price charged to `g`: all of it, or none. */
function share(r: PurchaseRequest, g: Grant, amount: number): number {
  return (r.chargedGrantId ?? r.grantId) === g.id ? amount : 0
}

const who = (r: PurchaseRequest) => requesterLabel(r.requesterName)

interface Row { key: string; day: string; who: string; what: string; note: string; amount: number }

/** Open orders on this grant: money promised, not yet paid. */
export function committedRows(db: Db, g: Grant): Row[] {
  const rows: Row[] = []
  for (const o of db.orders) {
    if (o.state !== 'open' && o.state !== 'changed') continue
    const r = db.requests.find(x => x.id === o.requestId)
    if (!r) continue
    const amount = share(r, g, o.changedAmount ?? o.amount)
    if (amount <= 0) continue
    rows.push({ key: o.id, day: o.placed, who: who(r), what: r.item, note: o.vendor, amount })
  }
  return rows.sort((a, b) => b.day.localeCompare(a.day))
}

const invoiceNote = (inv: Invoice | undefined) =>
  !inv ? 'Receipt: not in yet'
    : inv.state === 'paid' ? `Receipt ${inv.id}: paid`
    : inv.state === 'matched' ? `Receipt ${inv.id}: matched, ready to pay`
    : inv.state === 'held' ? `Receipt ${inv.id}: on hold`
    : `Receipt ${inv.id}: ${inv.state}`

/** Bought purchases (with their receipt) and payroll charged to this grant. */
export function spentRows(db: Db, g: Grant): Row[] {
  const rows: Row[] = []
  for (const r of db.requests) {
    if (r.state !== 'bought') continue
    const amount = share(r, g, r.price)
    if (amount <= 0) continue
    const order: Order | undefined = db.orders.find(o => o.requestId === r.id)
    if (order && order.state !== 'paid') continue // still on order (committed), or canceled
    const inv = order && db.invoices.find(i => i.orderId === order.id)
    rows.push({ key: r.id, day: r.day, who: who(r), what: r.item, note: `${order?.vendor ?? 'Purchase'} · ${invoiceNote(inv)}`, amount })
  }
  for (const p of db.payroll) {
    if (p.grantId !== g.id) continue
    rows.push({ key: p.id, day: p.period.to, who: p.person, what: `Payroll, ${p.role}`, note: `${p.effortPct}% of their time · ${p.period.from} to ${p.period.to}`, amount: p.amount })
  }
  return rows.filter(r => r.day <= db.today).sort((a, b) => b.day.localeCompare(a.day))
}

function List({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <p className="sd-empty">{empty}</p>
  return (
    <table className="sd-table">
      <thead><tr><th>Date</th><th>Who</th><th>What</th><th className="sd-num">Amount</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key}>
            <td className="sd-day">{longDate(r.day)}</td>
            <td>{r.who}</td>
            <td>{r.what}<small>{r.note}</small></td>
            <td className="sd-num">{money(r.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const SEGMENT_TITLES: Record<Segment, string> = {
  committed: 'Committed: ordered, not yet paid',
  spent: 'Spent: receipts and payroll',
  available: 'Available: how the award adds up',
}

export default function SegmentDetails({ db, g, segment }: { db: Db; g: Grant; segment: Segment }) {
  let body
  if (segment === 'committed') {
    const rows = committedRows(db, g)
    const sum = rows.reduce((s, r) => s + r.amount, 0)
    body = <>
      <List rows={rows} empty="Nothing is on order right now." />
      {rows.length > 0 && <p className="sd-total">{rows.length} {rows.length === 1 ? 'order' : 'orders'} · {money(sum)}</p>}
    </>
  } else if (segment === 'spent') {
    const rows = spentRows(db, g)
    const sum = rows.reduce((s, r) => s + r.amount, 0)
    body = <>
      <List rows={rows} empty="Nothing has been spent yet." />
      <p className="sd-total">
        {rows.length} {rows.length === 1 ? 'line' : 'lines'} · {money(sum)} listed
        {Math.abs(sum - g.spent) > 1 && <> · {money(g.spent)} spent in total (these records don't add up to it exactly)</>}
      </p>
    </>
  } else {
    body = (
      <dl className="sd-sum">
        <div><dt>Total award</dt><dd>{money(g.awarded)}</dd></div>
        <div><dt>− Spent</dt><dd>{money(g.spent)}</dd></div>
        <div><dt>− Committed</dt><dd>{money(g.promised)}</dd></div>
        <div className="sd-eq"><dt>= Available</dt><dd>{money(g.awarded - g.spent - g.promised)}</dd></div>
        <div className="sd-aside"><dt>Grant ends</dt><dd>{longDate(g.end)}</dd></div>
      </dl>
    )
  }
  return <div className="sd">{body}</div>
}
