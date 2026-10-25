// Approved requests that still need their invoice: purchase requests the
// purchasing agent or grant office approved (from Ask / Requests), whose order
// has no invoice yet. Real ones come first; a short list is topped up with
// sample approved orders for the researcher's own grant so the tab always has
// something to open.
import type { Db } from '../data/types'
import { RESEARCHERS } from '../people'
import { DEMO_POS, sampleDraft, type Draft, type Submission } from './model'

export interface ApprovedRequest {
  id: string // the request, or the sample order
  item: string
  vendor: string
  amount: number // what was approved
  grantId: string
  orderId: string
  approvedOn: string
  by: string
  demo?: boolean
}

const MIN = 2
const MAX = 3

export function approvedRequests(db: Db, name: string, stored: Submission[]): ApprovedRequest[] {
  const invoiced = (orderId: string) => db.invoices.some(i => i.orderId === orderId) || stored.some(s => s.poId === orderId && s.status !== 'rejected')
  const real: ApprovedRequest[] = db.requests
    .filter(r => r.requesterName === name && r.state === 'bought')
    .flatMap(r => {
      const o = db.orders.find(x => x.requestId === r.id)
      if (!o || o.state !== 'open' || invoiced(o.id)) return []
      return [{ id: r.id, item: r.item, vendor: o.vendor, amount: o.changedAmount ?? o.amount, grantId: r.chargedGrantId ?? r.grantId, orderId: o.id, approvedOn: o.placed, by: 'the purchasing agent' }]
    })
  const mine = RESEARCHERS.find(r => r.name === name)?.grantId
  const samples: ApprovedRequest[] = DEMO_POS
    .filter(p => p.by === name && (!mine || p.grantId === mine) && !invoiced(p.id))
    .map(p => ({ id: p.id, item: p.item, vendor: p.vendor, amount: p.amount, grantId: p.grantId, orderId: p.id, approvedOn: p.approvedOn, by: 'the grant manager', demo: true }))
  return [...real, ...samples.slice(0, Math.max(0, MIN - real.length))].slice(0, MAX)
}

/** The invoice form for an approved request: the vendor, grant and item are filled in; the sequencing sample brings its $4,800 bill. */
export function draftForRequest(db: Db, r: ApprovedRequest): Draft {
  if (r.orderId === 'PO-4417') return { ...sampleDraft(), poId: r.orderId, note: `Invoice for approved request ${r.id}.` }
  return {
    vendor: r.vendor, invoiceNo: '', invoiceDate: db.today, amount: String(r.amount),
    lines: [{ description: r.item, amount: String(r.amount) }],
    files: [`${r.vendor.replace(/\W+/g, '-')}-invoice.pdf`], receiptFiles: [`${r.vendor.replace(/\W+/g, '-')}-receipt.pdf`], receipt: true,
    grantId: r.grantId, poId: r.orderId, note: `Invoice for approved request ${r.id}.`,
  }
}
