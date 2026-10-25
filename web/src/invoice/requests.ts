// Every approved request of a researcher: purchase requests the grant office
// approved (from Requests), each with the invoice sent
// for it, if any. A list with few left to invoice is topped up with sample
// approved orders for the researcher's own grant so there is always something
// to invoice.
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
  invoice?: string // the invoice already sent for it (a submission or a bill), which `#invoices/<id>` opens
}

const MIN = 2

export function approvedRequests(db: Db, name: string, stored: Submission[]): ApprovedRequest[] {
  // A rejected submission doesn't count: the request needs a new invoice.
  const invoiceFor = (orderId: string) => stored.find(s => s.poId === orderId && s.status !== 'rejected')?.id ?? db.invoices.find(i => i.orderId === orderId)?.id
  const real: ApprovedRequest[] = db.requests
    .filter(r => r.requesterName === name && r.state === 'bought')
    .flatMap(r => {
      const o = db.orders.find(x => x.requestId === r.id)
      if (!o || o.state === 'canceled') return []
      return [{ id: r.id, item: r.item, vendor: o.vendor, amount: o.changedAmount ?? o.amount, grantId: r.chargedGrantId ?? r.grantId, orderId: o.id, approvedOn: o.placed, by: 'the grant office', invoice: invoiceFor(o.id) }]
    })
  // Waiting for an invoice first: that's what the researcher came to do.
  const sorted = (list: ApprovedRequest[]) => [...list.filter(r => !r.invoice), ...list.filter(r => r.invoice)]
  if (real.filter(r => !r.invoice).length >= MIN) return sorted(real)
  const mine = RESEARCHERS.find(r => r.name === name)?.grantId
  const samples: ApprovedRequest[] = DEMO_POS
    .filter(p => p.by === name && (!mine || p.grantId === mine))
    .map(p => ({ id: p.id, item: p.item, vendor: p.vendor, amount: p.amount, grantId: p.grantId, orderId: p.id, approvedOn: p.approvedOn, by: 'the grant manager', demo: true, invoice: invoiceFor(p.id) }))
  return sorted([...real, ...samples])
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
