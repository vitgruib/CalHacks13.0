// GrantGuard Invoice: what a researcher submits, the checks the invoice agent
// runs (document, duplicate, purchase order, grant allocation, budget, research
// fit, authorization) and the audit trail. Plain rules over the app's own
// records, so the same invoice always gets the same findings. Reading an
// uploaded file is a stand-in (text files only); everything else is real data.
import { trulyAvailable, type Db, type Grant, type PurchaseRequest } from '../data/types'
import { awardFor } from '../spendguard/awards'

export const CARD_LIMIT = 5000

export interface LineItem { description: string; amount: string }

export type Status = 'ready' | 'exception' | 'clarification' | 'escalated' | 'approved' | 'rejected'

export type Area = 'Documents' | 'Duplicate' | 'Purchase order' | 'Grant allocation' | 'Budget' | 'Research fit' | 'Authorization'
export interface Finding {
  area: Area
  level: 'ok' | 'warn' | 'block'
  title: string
  detail: string
  /** The records behind it, one per line. */
  evidence?: string[]
}

export interface AuditEntry { day: string; who: string; what: string; why?: string }

export interface BudgetEffect { available: number; committedForPo: number; extra: number; after: number }

export interface Submission {
  id: string
  researcher: string
  submittedOn: string
  vendor: string
  invoiceNo: string
  invoiceDate: string
  amount: string
  lines: LineItem[]
  files: string[]
  receiptFiles: string[] // the receipt or proof of purchase, required
  receipt: boolean
  grantId: string
  poId: string // '' = no purchase order
  note: string
  status: Status
  findings: Finding[]
  effect?: BudgetEffect
  audit: AuditEntry[]
}

export type Draft = Pick<Submission, 'vendor' | 'invoiceNo' | 'invoiceDate' | 'amount' | 'lines' | 'files' | 'receiptFiles' | 'receipt' | 'grantId' | 'poId' | 'note'>

export const blankDraft = (grantId = ''): Draft => ({
  vendor: '', invoiceNo: '', invoiceDate: '', amount: '', lines: [{ description: '', amount: '' }], files: [], receiptFiles: [], receipt: false, grantId, poId: '', note: '',
})

export const STATUS_LABEL: Record<Status, string> = {
  ready: 'Ready for review', exception: 'Exception: payment paused', clarification: 'Waiting for the researcher',
  escalated: 'Escalated', approved: 'Approved', rejected: 'Rejected',
}

// ── Purchase orders ──────────────────────────────────────────────────────

export interface PurchaseOrder {
  id: string
  vendor: string
  item: string
  amount: number // what was approved
  grantId: string
  by: string // who asked
  approvedOn: string
  state: 'open' | 'canceled' | 'paid'
  category: string
  demo?: boolean
}

/** A simulated purchase order for the sequencing scenario; the rest are the app's real orders. */
export const DEMO_PO: PurchaseOrder = {
  id: 'PO-4417', vendor: 'Campus Genomics Core', item: 'Single-cell RNA sequencing service', amount: 4000, grantId: 'R21AI182745',
  by: 'Sofia Alvarez', approvedOn: '2026-05-20', state: 'open', category: 'external services', demo: true,
}

const reqFor = (db: Db, requestId: string): PurchaseRequest | undefined => db.requests.find(r => r.id === requestId)

export function purchaseOrders(db: Db): PurchaseOrder[] {
  const real = db.orders.map(o => {
    const r = reqFor(db, o.requestId)
    const approval = db.approvals.find(a => a.orderId === o.id)
    return {
      id: o.id, vendor: o.vendor, item: r?.item ?? 'Order', amount: approval?.amount ?? o.amount, grantId: r?.chargedGrantId ?? r?.grantId ?? '',
      by: r?.requesterName ?? 'A researcher', approvedOn: approval?.day ?? o.placed, state: o.state === 'canceled' ? 'canceled' : o.state === 'paid' ? 'paid' : 'open',
      category: r?.category ?? '',
    } satisfies PurchaseOrder
  })
  return [DEMO_PO, ...real]
}

// ── Reading an uploaded file (stand-in) ──────────────────────────────────

const num = (s: string) => {
  const n = Number(String(s).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
export const planAmount = (lines: LineItem[]) => lines.reduce((s, l) => s + num(l.amount), 0)

/** Pull the fields out of a plain-text invoice: "Vendor: …", "Invoice #: …", "Total: …" and "item - $amount" lines. */
export function readInvoiceText(text: string): Partial<Draft> {
  const out: Partial<Draft> = {}
  const get = (re: RegExp) => text.match(re)?.[1]?.trim()
  const vendor = get(/^\s*(?:vendor|from|supplier)\s*[:\-]\s*(.+)$/im)
  const no = get(/^\s*(?:invoice\s*(?:no\.?|number|#)|inv\s*#?)\s*[:\-]?\s*([\w\-./]+)\s*$/im)
  const date = get(/^\s*(?:invoice\s*)?date\s*[:\-]\s*(\d{4}-\d{2}-\d{2})/im)
  const total = get(/^\s*(?:total|amount due|balance due)\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d+)?)/im)
  if (vendor) out.vendor = vendor
  if (no) out.invoiceNo = no
  if (date) out.invoiceDate = date
  if (total) out.amount = total.replace(/,/g, '')
  const lines: LineItem[] = []
  for (const l of text.split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z][^:$]{3,80}?)\s+[-–:]\s+\$?\s*([\d,]+(?:\.\d+)?)\s*$/)
    if (m && !/^(total|amount due|balance due|subtotal)/i.test(m[1])) lines.push({ description: m[1].trim(), amount: m[2].replace(/,/g, '') })
  }
  if (lines.length) out.lines = lines
  return out
}

/** The brief's scenario: a $4,800 sequencing invoice against a $4,000 purchase order. */
export const sampleDraft = (): Draft => ({
  vendor: 'Campus Genomics Core', invoiceNo: '', invoiceDate: '2026-06-12', amount: '4800',
  lines: [
    { description: 'Single-cell RNA sequencing library preparation', amount: '3200' },
    { description: 'Sequencing run, one lane', amount: '1600' },
  ],
  files: ['CGC-2291-invoice.pdf'], receiptFiles: ['CGC-2291-receipt.pdf'], receipt: true, grantId: DEMO_PO.grantId, poId: '', note: '',
})

// ── The invoice agent's checks ───────────────────────────────────────────

const DAY_MS = 86_400_000
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function check(d: Draft, db: Db, others: Submission[], selfId = ''): { findings: Finding[]; effect?: BudgetEffect; status: Status; poId: string } {
  const f: Finding[] = []
  const add = (x: Finding) => f.push(x)
  const amount = num(d.amount)
  const g: Grant | undefined = db.grants.find(x => x.id === d.grantId)
  // The agent finds the purchase order itself: the open order with the same vendor, on this grant if possible.
  const orders = purchaseOrders(db)
  const vendorKey = norm(d.vendor)
  const po = orders.find(p => p.id === d.poId) ?? (vendorKey ? orders.filter(p => p.state === 'open' && norm(p.vendor) === vendorKey).sort((a, b) => Number(b.grantId === d.grantId) - Number(a.grantId === d.grantId))[0] : undefined)
  const lineSum = planAmount(d.lines)

  // 1. Documents
  const missing = [!d.vendor.trim() && 'vendor', !d.invoiceDate && 'date', amount === 0 && 'amount', !d.grantId && 'grant'].filter(Boolean) as string[]
  if (missing.length) add({ area: 'Documents', level: 'block', title: 'Required fields are missing', detail: `Add the ${missing.join(', ')} before this can be checked.` })
  else add({ area: 'Documents', level: 'ok', title: 'Required fields are complete', detail: `${d.vendor}, ${d.invoiceDate}, ${money(amount)}.` })
  if (d.lines.some(l => l.description.trim() || num(l.amount)) && lineSum > 0 && Math.abs(lineSum - amount) > 0.5) {
    add({ area: 'Documents', level: 'warn', title: 'Line items do not add up to the total', detail: `The lines add to ${money(lineSum)} but the invoice total is ${money(amount)}.`, evidence: d.lines.filter(l => num(l.amount)).map(l => `${l.description || 'Line'}: ${money(num(l.amount))}`) })
  }
  if (!d.receipt) add({ area: 'Documents', level: 'warn', title: 'No receipt or proof of purchase attached', detail: 'Attach the receipt so the grants office can confirm the goods or service were received.' })

  // 2. Duplicates
  const dup: string[] = []
  const v = norm(d.vendor)
  for (const i of db.invoices) {
    if (v && norm(i.vendor) === v && Math.abs(i.amount - amount) < 0.5 && amount > 0) dup.push(`Invoice ${i.id} from ${i.vendor}, ${money(i.amount)}, received ${i.received} (${i.state})`)
  }
  for (const s of others) {
    if (s.id === selfId || s.status === 'rejected') continue
    const sameNo = d.invoiceNo.trim() && norm(s.invoiceNo) === norm(d.invoiceNo) && norm(s.vendor) === v
    const sameAmt = v && norm(s.vendor) === v && Math.abs(num(s.amount) - amount) < 0.5 && amount > 0
    if (sameNo || sameAmt) dup.push(`Submission ${s.id}: ${s.vendor} ${s.invoiceNo}, ${money(num(s.amount))}, submitted ${s.submittedOn}`)
  }
  if (dup.length) add({ area: 'Duplicate', level: 'block', title: 'Possible duplicate invoice', detail: 'An invoice with the same vendor and amount (or number) already exists.', evidence: dup })
  else if (amount > 0) add({ area: 'Duplicate', level: 'ok', title: 'No duplicate found', detail: 'No other invoice from this vendor matches the number or amount.' })

  // 3. Purchase order
  let committedForPo = 0
  if (!po) {
    add({ area: 'Purchase order', level: 'warn', title: 'No purchase order found for this vendor', detail: 'No open order matches this vendor, so the grant manager has to confirm the purchase was authorized.' })
  } else {
    const ev = [`Invoice: ${money(amount)} from ${d.vendor || '(no vendor)'}`, `${po.id}: ${money(po.amount)} approved to ${po.vendor} on ${po.approvedOn} (${po.item})`]
    if (po.state === 'canceled') add({ area: 'Purchase order', level: 'block', title: 'The purchase order was canceled', detail: `${po.id} was canceled, so this bill has nothing to match.`, evidence: ev })
    else if (po.state === 'paid') add({ area: 'Purchase order', level: 'block', title: 'The purchase order is already paid', detail: `${po.id} was paid in full; a second bill may be a double charge.`, evidence: ev })
    else if (amount > po.amount + 0.5) add({ area: 'Purchase order', level: 'block', title: `The invoice is ${money(amount - po.amount)} higher than the approved purchase order`, detail: `Approved ${money(po.amount)}, billed ${money(amount)}. Payment is paused until a corrected invoice or an approved revision is on file.`, evidence: ev })
    else add({ area: 'Purchase order', level: 'ok', title: 'Matches the approved purchase order', detail: `${money(amount)} is within the ${money(po.amount)} approved on ${po.id}.`, evidence: ev })
    if (v && norm(po.vendor) !== v) add({ area: 'Purchase order', level: 'warn', title: 'The vendor differs from the purchase order', detail: `The invoice is from "${d.vendor}" but ${po.id} was placed with "${po.vendor}".` })
    committedForPo = po.state === 'open' ? po.amount : 0
  }

  // 4. Grant allocation + 5. Budget
  let effect: BudgetEffect | undefined
  if (g) {
    if (po && po.grantId && po.grantId !== g.id) add({ area: 'Grant allocation', level: 'block', title: 'The grant and the purchase order disagree', detail: `The invoice is allocated to ${g.id} but ${po.id} is charged to ${po.grantId}.`, evidence: [`Invoice allocation: ${g.id}`, `${po.id} grant: ${po.grantId}`] })
    else add({ area: 'Grant allocation', level: 'ok', title: `Allocated to ${g.id}`, detail: po ? `Same grant as ${po.id}.` : 'Chosen by the researcher; no purchase order to confirm it.' })
    if (g.frozen && g.status !== 'ended') add({ area: 'Grant allocation', level: 'block', title: 'This grant is paused until its money arrives', detail: 'No payment can be released on a grant that is paused, even if the invoice is correct.' })
    const left = Math.round((Date.parse(g.end) - Date.parse(db.today)) / DAY_MS)
    if (left < 0) add({ area: 'Grant allocation', level: 'block', title: 'The grant has ended', detail: `${g.id} ended on ${g.end}.` })
    else if (left <= 90 && po && /suppl|reagent/.test(po.category)) add({ area: 'Grant allocation', level: 'warn', title: 'Supplies in the last 90 days of the award', detail: `${g.id} ends in ${left} days; auditors often refuse supplies bought this close to the end.` })

    // The simulated purchase order isn't in the grant's real committed total, so count it here.
    const available = trulyAvailable(g) - (po?.demo && po.state === 'open' ? po.amount : 0)
    const extra = Math.max(0, amount - committedForPo)
    effect = { available, committedForPo, extra, after: available - extra }
    if (amount > 0) {
      if (extra > available) add({ area: 'Budget', level: 'block', title: 'Not enough budget', detail: `Paying this adds ${money(extra)} beyond what is already committed, but only ${money(available)} is available.` })
      else add({ area: 'Budget', level: 'ok', title: extra > 0 ? `Adds ${money(extra)} beyond the order, still within budget` : 'Within what is already committed', detail: `${money(available)} available before; ${money(available - extra)} after this is paid.` })
    }

    // 6. Research fit: never declares a cost allowable, only whether it connects.
    const text = `${d.lines.map(l => l.description).join(' ')} ${po?.item ?? ''}`.toLowerCase()
    const hits = awardFor(g).aimTerms.filter(t => text.includes(t))
    if (po) add({ area: 'Research fit', level: 'ok', title: 'Linked to a reviewed purchase', detail: `${po.id} was approved as "${po.item}". Whether it is allowable is still the grants office's decision.` })
    else if (hits.length) add({ area: 'Research fit', level: 'warn', title: 'Related to the funded research, not confirmed', detail: `The items mention ${hits.slice(0, 3).join(', ')}, which appear in the award's aims. A person has to confirm it is allowable.` })
    else add({ area: 'Research fit', level: 'warn', title: 'Could not connect this to the funded research', detail: 'Nothing in the line items matches the award\'s aims. Explain how it supports the work, or the grant manager will ask.' })
  }

  // 7. Authorization
  add({ area: 'Authorization', level: 'ok', title: 'Approval is required before payment', detail: `Only the grant office can approve, never the person who submitted it${amount > CARD_LIMIT ? `; ${money(amount)} is also over the ${money(CARD_LIMIT)} card limit` : ''}. Payment stays paused until a decision is recorded.` })

  const status: Status = f.some(x => x.level !== 'ok' && x.area !== 'Authorization') ? 'exception' : 'ready'
  return { findings: f, effect, status, poId: po?.id ?? '' }
}

/** The posting the grant office would review (nothing is posted). */
export function ledgerEntry(s: Submission) {
  const amt = num(s.amount)
  return [
    { account: `Grant expense, ${s.grantId}`, debit: amt, credit: 0 },
    { account: `Accounts payable, ${s.vendor}`, debit: 0, credit: amt },
  ]
}

export const parseAmount = num
export const fmt = money
