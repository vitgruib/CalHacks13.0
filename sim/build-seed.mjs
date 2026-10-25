// Builds sim/seed.json: the fake university world for GrantGuard (T8).
// Run: node sim/build-seed.mjs   (then: node sim/validate.mjs)
//
// The world is in its RAW, pre-agent state where it matters: every planted
// mistake and decoy from docs/MASTER-PLAN.md §3 is a real record that the
// agents and rules must still find. Settled history (past purchases, paid
// invoices, paid payment requests, past log rows) is filled in.
// Grant totals (spent, promised, received) are computed from the records.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const TODAY = '2026-06-15'
const A = 'R01GM061721' // canceled 2026-03-10, court order 2026-04-20, no payment since: frozen
const B = 'R21AI182745' // active, ends 2026-08-31 (77 days after today)

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const money = n => `$${n.toLocaleString('en-US')}`
// The two researchers with their own portal (T39): each asks for their own grant's work.
const researcherFor = grantId => (grantId === B ? 'Sofia Alvarez' : 'Dr. Priya Nair')
const pad = (n, w = 3) => String(n).padStart(w, '0')

const grantMeta = {
  [A]: {
    id: A, title: 'Biogenesis of the mitochondrial inner membrane', pi: 'Dr. Lena Ortiz', agency: 'NIH / NIGMS',
    awarded: 420_000, start: '2025-01-01', end: '2027-07-31', status: 'restored_by_court', frozen: true,
    frozenReason: 'Canceled 2026-03-10 (cancellation list; NIH RePORTER on 2026-03-11). Spending stays frozen until a payment arrives after the cancellation.',
  },
  [B]: {
    id: B, title: 'Investigating ploidy modulation as a strategy to improve antibiotic activity', pi: 'Dr. Lena Ortiz', agency: 'NIH / NIAID',
    awarded: 275_000, start: '2024-08-01', end: '2026-08-31', status: 'active', frozen: false,
  },
}

// ---------------------------------------------------------------------------
// Ordinary (background) purchases: settled history, every rule passed.
// Trimmed for the demo to the purchases the planted cases need, plus the past
// orders today's requests take their vendor from (rq-011, rq-012); ids keep their original numbers so the answer key and tests hold.
// B's supplies all fall before 2026-06-02 (its last 90 days start then).
// A has nothing between its cancellation (2026-03-10) and today except the
// planted card charge rq-050.
// ---------------------------------------------------------------------------
const background = [
  // n (keeps the record ids rq-0n, o-0n, inv-0n stable), grant, day, item, vendor, category, price, purpose
  [11, A, '2025-09-09', 'Proteomics core: 10 hours of mass spec', 'Campus Proteomics Core', 'core facility services', 1_800, 'Membrane folding samples, aim 1'],
  [12, A, '2025-10-14', 'Nitrile gloves, 10 cases', 'LabSource', 'lab supplies', 640, 'Membrane prep, aim 2'],
  [17, A, '2026-02-17', 'Detergent screening kit, 2 plates', 'MembraneChem', 'reagents', 2_300, 'BamA detergent screen'],
  [30, B, '2026-02-20', 'Ceftazidime-avibactam reference powder', 'BioReagents Inc', 'reagents', 2_400, 'Resistance panel'], // canceled order: planted invoice
  [33, B, '2026-04-14', 'Agar plates, 40 packs', 'MicroMedia', 'lab supplies', 1_180, 'Assay validation runs'],
  [34, B, '2026-04-20', 'Orbital plate shaker', 'SpinWorks', 'equipment', 5_800, 'Shaking incubation of assay plates'], // approval for a different amount: planted invoice
  [35, B, '2026-04-24', 'Open-access publication fee, J. Appl. Microb. Methods', 'J. Appl. Microb. Methods', 'publication costs', 2_100, 'Publishing the beta-lactam assay paper'], // paper p-10's cost
  [36, B, '2026-05-01', 'Ultra-low freezer service contract', 'CoolChain', 'equipment service', 1_150, 'Keeping isolate stocks at -80 C'], // approved change: decoy invoice
  [37, B, '2026-05-01', 'Mueller-Hinton broth, 12 bottles', 'MicroMedia', 'reagents', 1_460, 'Broth microdilution controls'], // held invoice: payment request planted case
  [38, B, '2026-05-20', 'Genomics core: sequencing run for 24 isolates', 'Campus Genomics Core', 'core facility services', 640, 'Confirming resistance genes'],
]

const db = {
  today: TODAY, grants: [], statusEvents: [], sourceReadings: [], flags: [],
  requests: [], orders: [], approvals: [], invoices: [], payroll: [],
  paymentRequests: [], papers: [], holds: [], log: [],
}
let logSeq = 0
const log = (day, actor, action, reason, refId, rule) =>
  db.log.push({ id: `l-${pad(++logSeq, 4)}`, day, actor, action, ...(rule ? { rule } : {}), reason, ...(refId ? { refId } : {}) })

const passVerdicts = (price, cat) => [
  { rule: 'Grant is active and not frozen', pass: true, detail: 'Active.' },
  { rule: 'Category allowed', pass: true, detail: `${cat[0].toUpperCase()}${cat.slice(1)} are allowed on this grant.` },
  { rule: "Not in the grant's last 90 days", pass: true, detail: 'More than 90 days left.' },
  { rule: 'Under the card limit ($5,000)', pass: price <= 5_000, detail: price <= 5_000 ? `${money(price)}.` : `${money(price)} is over the limit; approved by the grant manager.` },
  { rule: 'Enough truly available money', pass: true, detail: 'Enough money left.' },
]

let holdSeq = 1 // h-001 was on a purchase trimmed for the demo; later holds keep their ids
const newHoldId = () => `h-${pad(++holdSeq)}`

for (const [n, grantId, day, item, vendor, category, price, purpose] of background) {
  const id = `rq-${pad(n)}`, oid = `o-${pad(n)}`, iid = `inv-${pad(n)}`
  const overLimit = price > 5_000
  db.requests.push({
    id, day, requester: 'scientist', requesterName: researcherFor(grantId), item, category, price, grantId, purpose,
    state: 'bought', verdicts: passVerdicts(price, category),
    explanation: overLimit
      ? `Over the $5,000 card limit, so it was flagged for the grant office, which approved it at ${money(price)}. The researcher bought it and sent the invoice.`
      : 'Every rule passed and the grant office approved it. The researcher bought it and sent the invoice.',
  })
  log(day, 'scientist', `${researcherFor(grantId)} asked to buy ${item} (${money(price)})`, purpose, id)

  let placed = day
  if (overLimit) {
    const hid = newHoldId(), decided = addDays(day, 1)
    placed = addDays(day, 2)
    db.holds.push({
      id: hid, kind: 'purchase', refId: id, grantId, raisedBy: 'system', day,
      title: `Flagged: approve ${item.toLowerCase()} (${money(price)})?`,
      why: 'Over the $5,000 card limit, so the grant manager has to approve it.',
      evidence: [{ label: 'Price', value: money(price) }, { label: 'Card limit', value: '$5,000' }],
      options: ['approve', 'reject'],
      decision: { choice: 'approve', reason: 'Needed for the aims; quote checked against two vendors.', by: 'grant_manager', day: decided },
    })
    db.approvals.push({ id: `ap-${pad(n)}`, orderId: oid, amount: price, by: 'grant_manager', day: decided })
    log(day, 'system', `Sent to the Inbox: flagged ${item.toLowerCase()}`, `${money(price)} is over the card limit.`, hid, 'Under the card limit ($5,000)')
    log(decided, 'grant_manager', `Decided ${hid}: approve`, 'Needed for the aims; quote checked against two vendors.', hid)
  }
  if (!overLimit) log(day, 'grant_manager', `Approved ${item.toLowerCase()} (${money(price)}) on ${grantId}`, 'Every rule passed.', id, 'All rules pass, under card limit')
  log(placed, 'scientist', `Bought ${item.toLowerCase()} (${money(price)}) on ${grantId}`, 'Approved by the grant office.', id)

  const order = { id: oid, requestId: id, vendor, amount: price, placed, state: 'paid' }
  const invoice = {
    id: iid, orderId: oid, vendor, amount: price, received: addDays(placed, 6), state: 'paid',
    timeline: [
      { day: placed, what: `Order placed (${money(price)})` },
      { day: addDays(placed, 6), what: 'Invoice arrived; matches the order and its approval' },
      { day: addDays(placed, 12), what: 'Paid' },
    ],
  }
  db.orders.push(order)
  db.invoices.push(invoice)
  const settled = () => log(addDays(placed, 6), 'bookkeeping', `Matched invoice ${iid} to order ${oid}`, 'Order open; amount matches.', iid, 'Invoice needs an open order and a matching amount')

  if (vendor === 'BioReagents Inc' && day === '2026-02-20') {
    // PLANTED (invoices): an invoice for a canceled order. Raw: not yet checked.
    order.state = 'canceled'; order.canceledOn = '2026-03-02'
    Object.assign(invoice, { received: '2026-06-11', state: 'matched', checked: false, timeline: [{ day: '2026-06-11', what: `Invoice arrived (${money(price)})` }] })
    db.requests.at(-1).explanation = 'Every rule passed and the grant office approved it. The lab canceled the order on 2026-03-02 (back-ordered for 10 weeks).'
    log('2026-03-02', 'scientist', `Canceled order ${oid}`, 'Vendor back-ordered it for 10 weeks; we used a colleague\'s stock instead.', oid)
  } else if (item === 'Orbital plate shaker') {
    // PLANTED (invoices): the approval is for a different amount than the invoice.
    order.amount = 6_200; order.state = 'open'
    db.requests.at(-1).explanation = 'Over the $5,000 card limit, so it was flagged for the grant office, which approved the $5,800 quote. The department purchasing office placed the order on 2026-04-22.'
    db.log.at(-1).action = `Order for ${item.toLowerCase()} placed by the department purchasing office`
    Object.assign(invoice, { amount: 6_200, received: '2026-06-09', state: 'matched', checked: false, timeline: [{ day: '2026-06-09', what: 'Invoice arrived ($6,200)' }] })
  } else if (item === 'Ultra-low freezer service contract') {
    // DECOY (invoices): invoice matches an approved change to the order.
    order.state = 'changed'; order.changedAmount = 1_290
    const hid = newHoldId()
    db.holds.push({
      id: hid, kind: 'purchase', refId: id, grantId, raisedBy: 'scientist', day: '2026-05-03',
      title: 'Approve a change to the CoolChain order: $1,150 to $1,290?',
      why: 'The vendor added a required compressor check; changes to an order need the grant manager.',
      evidence: [{ label: 'Original order', value: '$1,150 (2026-05-01)' }, { label: 'Changed to', value: '$1,290' }],
      options: ['approve', 'reject'],
      decision: { choice: 'approve', reason: 'The compressor check is required by the service contract.', by: 'grant_manager', day: '2026-05-04' },
    })
    db.approvals.push({ id: `ap-${pad(n)}`, orderId: oid, amount: 1_290, by: 'grant_manager', day: '2026-05-04' })
    log('2026-05-03', 'scientist', 'Sent a change to order o-036 to the grant office', 'Order changed from $1,150 to $1,290.', hid, 'Order changes need the grant manager')
    log('2026-05-04', 'grant_manager', `Decided ${hid}: approve`, 'The compressor check is required by the service contract.', hid)
    Object.assign(invoice, { amount: 1_290, received: '2026-06-08', state: 'matched', checked: false, timeline: [{ day: '2026-06-08', what: 'Invoice arrived ($1,290)' }] })
  } else if (item === 'Mueller-Hinton broth, 12 bottles' && day === '2026-05-01') {
    // Premise of the PLANTED payment-request case: this purchase is on hold.
    order.state = 'open'
    Object.assign(invoice, {
      amount: 2_920, received: '2026-05-27', state: 'held',
      mismatch: 'Billed for 24 bottles ($2,920); the order was for 12 bottles ($1,460).',
      timeline: [
        { day: '2026-05-01', what: 'Order placed: 12 bottles ($1,460)' },
        { day: '2026-05-27', what: 'Invoice arrived for 24 bottles ($2,920)' },
        { day: '2026-05-27', what: 'Held: amount does not match the order' },
      ],
    })
    const hid = newHoldId()
    db.holds.push({
      id: hid, kind: 'invoice', refId: iid, grantId, raisedBy: 'bookkeeping', day: '2026-05-27',
      title: 'Pay MicroMedia $2,920 for an order of $1,460?',
      why: 'The invoice bills 24 bottles; the order was for 12.',
      evidence: [{ label: 'Order', value: `${oid}: 12 bottles, $1,460, 2026-05-01` }, { label: 'Invoice', value: `${iid}: 24 bottles, $2,920, 2026-05-27` }],
      options: ['approve', 'reject', 'ask_vendor'],
    })
    log('2026-05-27', 'bookkeeping', `Held invoice ${iid}`, 'Invoice is $2,920; the order is $1,460.', iid, 'Invoice needs an open order and a matching amount')
  } else if (item.startsWith('Genomics core')) {
    // Ordinary recent invoice, not yet checked (should simply pass).
    order.state = 'open'
    Object.assign(invoice, { received: '2026-06-05', state: 'matched', checked: false, timeline: [{ day: '2026-06-05', what: `Invoice arrived (${money(price)})` }] })
  } else {
    settled()
  }
}

// PLANTED (fund tracker): a purchase while the grant was canceled. Charged on
// the department card outside GrantGuard; arrives through the university ledger.
db.requests.push({
  id: 'rq-050', day: '2026-03-18', requester: 'scientist', requesterName: 'Dr. Priya Nair', item: 'DDM detergent, 5 g', category: 'reagents', price: 890, grantId: A,
  purpose: 'Solubilizing outer membrane proteins', state: 'bought', verdicts: [],
  explanation: 'Charged directly on the department purchasing card on 2026-03-18, outside GrantGuard. Imported from the university ledger.',
})
db.orders.push({ id: 'o-050', requestId: 'rq-050', vendor: 'MembraneChem', amount: 890, placed: '2026-03-18', state: 'paid' })
log('2026-03-20', 'system', 'Imported a card charge from the university ledger', 'MembraneChem $890 on R01GM061721, charged 2026-03-18.', 'rq-050')

// PLANTED (invoices, T57): MicroMedia bills the agar-plate order o-033 a second
// time. o-033 was paid in April (inv-033). Raw: not yet checked.
db.invoices.push({ id: 'inv-201', orderId: 'o-033', vendor: 'MicroMedia', amount: 1_180, received: '2026-06-10', state: 'matched', checked: false, timeline: [{ day: '2026-06-10', what: 'Invoice arrived ($1,180)' }] })

// PLANTED (invoices, T57): an after-the-fact order. CertiFlow certified the
// biosafety cabinet and billed on 2026-06-03; the lab entered the order a week
// later, after the bill arrived. Raw: not yet checked.
// DECOY (invoices, T57): a second genomics-core batch: same vendor and amount
// as o-038, but its own order, placed before its invoice. Should pass.
for (const [n, day, item, vendor, category, price, purpose, received] of [
  [202, '2026-06-10', 'Biosafety cabinet annual certification', 'CertiFlow', 'equipment service', 1_240, 'Required yearly certification of the BSL-2 cabinet', '2026-06-03'],
  [203, '2026-06-02', 'Genomics core: sequencing run for 24 isolates, second batch', 'Campus Genomics Core', 'core facility services', 640, 'Whole-genome sequencing of the second clinical isolate batch', '2026-06-09'],
]) {
  const id = `rq-${n}`, oid = `o-${n}`
  db.requests.push({
    id, day, requester: 'scientist', requesterName: researcherFor(B), item, category, price, grantId: B, purpose,
    state: 'bought', verdicts: passVerdicts(price, category), explanation: 'Every rule passed and the grant office approved it. The researcher bought it and sent the invoice.',
  })
  log(day, 'scientist', `${researcherFor(B)} asked to buy ${item} (${money(price)})`, purpose, id)
  log(day, 'grant_manager', `Approved ${item.toLowerCase()} (${money(price)}) on ${B}`, 'Every rule passed.', id, 'All rules pass, under card limit')
  log(day, 'scientist', `Bought ${item.toLowerCase()} (${money(price)}) on ${B}`, 'Approved by the grant office.', id)
  db.orders.push({ id: oid, requestId: id, vendor, amount: price, placed: day, state: 'open' })
  db.invoices.push({ id: `inv-${n}`, orderId: oid, vendor, amount: price, received, state: 'matched', checked: false, timeline: [{ day: received, what: `Invoice arrived (${money(price)})` }] })
}

// ---------------------------------------------------------------------------
// Today's raw requests: submitted, no verdicts yet. Planted mistakes and decoys.
// ---------------------------------------------------------------------------
const raw = [
  ['rq-101', '2026-06-14', 'Nitrile gloves, 10 cases', 'lab supplies', 640, A, 'Membrane prep for aim 2. The court restored the grant, so the money is coming.'],
  ['rq-102', '2026-06-12', 'Agar plates, 40 packs', 'lab supplies', 1_180, B, 'Assay validation runs before the grant ends'],
  ['rq-103', '2026-06-13', 'Espresso machine for the lab', 'general office', 890, B, 'Lab morale during the final push'],
  ['rq-105', '2026-06-15', 'Peristaltic pump with controller', 'equipment', 6_850, A, 'Continuous-flow folding experiments, aim 3'],
  ['rq-106', '2026-06-15', 'Membrane protein detergent screening kit, 4 plates', 'reagents', 5_000, A, 'BamA detergent screen, round 2'],
  // PLANTED (purchases, T57): two sequencing runs on the same day, each under
  // the card limit, $5,500 together: a split purchase.
  ['rq-108', '2026-06-15', 'Sequencing core: 48 isolates, run 1 of 2', 'core facility services', 2_900, B, 'Resistance-gene survey of the clinical isolate panel'],
  ['rq-109', '2026-06-15', 'Sequencing core: 48 isolates, run 2 of 2', 'core facility services', 2_600, B, 'Resistance-gene survey of the clinical isolate panel'],
  // DECOY (purchases, T57): same person and day, but another category.
  ['rq-110', '2026-06-15', 'Biosafety cabinet filter replacement', 'equipment service', 2_400, B, 'HEPA filter replacement found at certification'],
]
for (const [id, day, item, category, price, grantId, purpose] of raw) {
  db.requests.push({ id, day, requester: 'scientist', requesterName: researcherFor(grantId), item, category, price, grantId, purpose, state: 'submitted', verdicts: [], explanation: 'Waiting for the grant office.' })
  log(day, 'scientist', `${researcherFor(grantId)} asked to buy ${item} (${money(price)})`, purpose, id)
}

// ---------------------------------------------------------------------------
// Payroll: monthly rows, only for the payment requests kept below. A stops
// after Feb 2026 (staff moved to bridge funds when it was canceled); B runs
// through May 2026.
// ---------------------------------------------------------------------------
const staff = {
  [A]: [['Dr. Priya Nair', 'Postdoctoral researcher', 50, 3_450], ['Marcus Webb', 'Graduate researcher', 50, 2_250]],
  [B]: [['Jordan Kim', 'Research technician', 60, 2_880], ['Sofia Alvarez', 'Graduate researcher', 50, 2_250]],
}
const months = (from, to) => {
  const out = []
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const start = d.toISOString().slice(0, 10)
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
    out.push([start, end])
  }
  return out
}
for (const [grantId, from, to] of [[A, '2026-01-01', '2026-02-01'], [B, '2026-03-01', '2026-05-01']]) {
  for (const [start, end] of months(from, to)) {
    staff[grantId].forEach(([person, role, effortPct, amount], k) => {
      db.payroll.push({ id: `pay-${grantId.slice(0, 3)}-${start.slice(0, 7)}-${k + 1}`, grantId, person, role, period: { from: start, to: end }, effortPct, amount })
    })
  }
}

// PLANTED (payment requests, T57): Daniel Okafor's May salary is charged 40% to B
// and 70% to A: 110% effort. B's May request must leave his B row out (its
// total stays the same); A is frozen in May, so no request is drafted there.
db.payroll.push(
  { id: 'pay-R21-2026-05-3', grantId: B, person: 'Daniel Okafor', role: 'Research associate', period: { from: '2026-05-01', to: '2026-05-31' }, effortPct: 40, amount: 2_600 },
  { id: 'pay-R01-2026-05-1', grantId: A, person: 'Daniel Okafor', role: 'Research associate', period: { from: '2026-05-01', to: '2026-05-31' }, effortPct: 70, amount: 4_550 },
)

// ---------------------------------------------------------------------------
// Payment requests (history). Included purchases: orders placed in the period
// and paid. Amount = included purchase charges + included payroll.
// ---------------------------------------------------------------------------
const finalAmount = o => o.changedAmount ?? o.amount
const shareOf = (r, g) => ((r.chargedGrantId ?? r.grantId) === g ? 1 : 0)
const charged = (r, g) => db.orders.filter(o => o.requestId === r.id && o.state !== 'canceled').reduce((s, o) => s + finalAmount(o) * shareOf(r, g), 0)

// Trimmed for the demo to the last request on A and B's last two; ids keep
// their original numbers (pr-015 is April's, with the funder follow-up).
const prPlan = [
  ['pr-005', A, '2026-01-01', '2026-02-28', '2026-03-03', 'paid'],
  ['pr-014', B, '2026-03-01', '2026-03-31', '2026-04-07', 'paid'],
  ['pr-015', B, '2026-04-01', '2026-04-30', '2026-05-08', 'sent'],
]
let seSeq = 0
const newSe = () => `se-${pad(++seSeq)}`
for (const [id, g, from, to, submitted, state] of prPlan) {
  const inPeriod = db.requests.filter(r => shareOf(r, g) > 0 && db.orders.some(o => o.requestId === r.id && o.placed >= from && o.placed <= to && o.state !== 'canceled'))
  const included = inPeriod.filter(r => db.orders.filter(o => o.requestId === r.id).every(o => o.state === 'paid'))
  const excludedRq = inPeriod.filter(r => !included.includes(r))
  const pay = db.payroll.filter(p => p.grantId === g && p.period.from >= from && p.period.to <= to)
  const personnel = pay.reduce((s, p) => s + p.amount, 0)
  const byCat = new Map()
  for (const r of included) byCat.set(r.category, (byCat.get(r.category) ?? [0, 0]).map((v, k) => v + (k ? 1 : charged(r, g))))
  const amount = personnel + [...byCat.values()].reduce((s, [v]) => s + v, 0)
  const people = [...new Set(pay.map(p => `${p.role.toLowerCase()}, ${p.effortPct}% effort`))].join('; ')
  const cats = [...byCat].map(([c, [v, k]]) => `${c} ${money(v)} (${k} order${k > 1 ? 's' : ''})`).join(', ')
  let explanation = `Reimbursement of direct costs on ${g} for ${from} to ${to}, ${money(amount)} in total: personnel ${money(personnel)} (${people})${cats ? `; ${cats}` : ''}. Every purchase matches an approved order and a paid invoice, and was placed in this period.`
  if (excludedRq.length) explanation += ` Left out: ${excludedRq.map(r => `${r.item.toLowerCase()} (not invoiced yet)`).join(', ')}.`
  db.paymentRequests.push({
    id, grantId: g, from, to, amount, explanation,
    includedRequestIds: included.map(r => r.id), includedPayrollIds: pay.map(p => p.id),
    excluded: excludedRq.map(r => ({ requestId: r.id, why: 'Ordered in this period but not invoiced yet, so not spent.' })),
    state, followUps: [],
  })
  log(addDays(submitted, -1), 'payment_report', `Drafted payment request ${id} (${money(amount)})`, `Direct costs on ${g}, ${from} to ${to}.`, id)
  log(submitted, 'grant_manager', `Approved and sent payment request ${id}`, 'Checked against the purchase records.', id)
  if (state === 'paid') {
    const day = addDays(submitted, 4), seId = newSe()
    db.statusEvents.push({ id: seId, grantId: g, day, kind: 'payment_received', source: 'Payment system', summary: `Payment of ${money(amount)} received for ${id}.`, amount })
    log(day, 'bookkeeping', `Recorded payment of ${money(amount)} on ${g}`, `Payment for ${id} landed.`, seId)
  }
}
// The funder's follow-up on the April request (raw: question only, no answer yet).
const april = db.paymentRequests.at(-1)
april.followUps.push({
  id: 'fu-001', state: 'drafted',
  question: `Defend the Spend review of ${april.id}: please itemize the lab supplies and publication costs in this request with vendors and dates, and confirm each was allocable to ${B} and placed before the project end date.`,
})
log('2026-05-28', 'funder', `Asked a follow-up on ${april.id}`, 'Defend the Spend review.', 'fu-001')

// ---------------------------------------------------------------------------
// Grant status: cancellation and court order on A (inputs), source readings.
// Raw: no flags yet. The new 2026-06-15 readings disagree about A.
// ---------------------------------------------------------------------------
const seCancel1 = 'se-a-canceled-list', seCancel2 = 'se-a-canceled-reporter', seCourt = 'se-a-court-order'
db.statusEvents.push(
  { id: seCancel1, grantId: A, day: '2026-03-10', kind: 'canceled', source: 'Cancellation list (Apify)', summary: 'Grant appears on the terminated-grants list.' },
  { id: seCancel2, grantId: A, day: '2026-03-11', kind: 'canceled', source: 'NIH RePORTER', summary: 'RePORTER shows the project as terminated.' },
  { id: seCourt, grantId: A, day: '2026-04-20', kind: 'court_order', source: 'Court notice', summary: 'Preliminary injunction restores the terminated grants in this class, including R01GM061721. No payment schedule is set.' },
)
db.statusEvents.sort((x, y) => x.day.localeCompare(y.day) || x.id.localeCompare(y.id))
log('2026-03-10', 'bookkeeping', `Froze ${A}`, 'Grant appeared on the cancellation list.', seCancel1, 'Canceled grants freeze')

db.sourceReadings.push(
  { id: 'sr-001', grantId: A, day: '2026-01-05', source: 'NIH RePORTER', status: 'active' },
  { id: 'sr-002', grantId: A, day: '2026-01-05', source: 'USAspending', status: 'active' },
  { id: 'sr-003', grantId: A, day: '2026-03-10', source: 'Cancellation list (Apify)', status: 'canceled' },
  { id: 'sr-004', grantId: A, day: '2026-03-11', source: 'NIH RePORTER', status: 'canceled' },
  { id: 'sr-005', grantId: A, day: '2026-03-12', source: 'USAspending', status: 'canceled' },
  { id: 'sr-006', grantId: B, day: '2026-01-05', source: 'NIH RePORTER', status: 'active' },
  { id: 'sr-007', grantId: B, day: '2026-01-05', source: 'USAspending', status: 'active' },
  // Today's readings. PLANTED: RePORTER now says A is active, USAspending still says canceled, the list says restored by a court.
  { id: 'sr-008', grantId: A, day: TODAY, source: 'NIH RePORTER', status: 'active' },
  { id: 'sr-009', grantId: A, day: TODAY, source: 'USAspending', status: 'canceled' },
  // The list shows A reinstated, as the court ordered (se-a-court-order), so a check today posts no second court order.
  { id: 'sr-010', grantId: A, day: TODAY, source: 'Cancellation list (Apify)', status: 'restored_by_court' },
  { id: 'sr-011', grantId: B, day: TODAY, source: 'NIH RePORTER', status: 'active' },
  { id: 'sr-012', grantId: B, day: TODAY, source: 'USAspending', status: 'active' },
)

// ---------------------------------------------------------------------------
// Progress report papers. Raw: not checked yet (checks empty, checked false).
// Corrections, PMCIDs and acknowledgments are the public records the checker
// will find (cached here so the demo works offline). Trimmed for the demo to
// the planted cases and decoys plus one clean paper per grant.
// ---------------------------------------------------------------------------
const paper = (n, grantId, title, year, extra = {}) => ({
  id: `p-${pad(n, 2)}`, grantId, title, doi: `10.5555/gg.${year}.${pad(n, 4)}`, pmcid: `PMC1100${pad(n, 4)}`, creditsGrantId: grantId,
  checks: [], result: 'ok', checked: false, ...extra,
})
db.papers.push(
  paper(1, A, 'Lipid-dependent folding intermediates of OmpA', 2025),
  paper(3, A, 'Cryo-EM of a membrane chaperone complex', 2026, { pmcid: undefined }), // PLANTED: no PMCID
  paper(4, A, 'Folding kinetics of OmpF under osmotic stress', 2025, {
    correction: { kind: 'material', disclosed: false, note: 'Correction (2026-03-02): the Figure 3 rate constants were re-measured; the folding rate changes by about 40% and one conclusion in the abstract is revised.' },
  }), // PLANTED: material correction, not disclosed
  paper(5, A, 'Periplasmic chaperone binding seen by single-molecule FRET', 2025, {
    correction: { kind: 'minor', disclosed: false, note: "Correction (2026-01-15): one author's affiliation was corrected." },
  }), // DECOY: affiliation-only correction
  paper(7, A, 'SurA accelerates folding of outer membrane proteins in vitro', 2024, {
    correction: { kind: 'retraction', disclosed: true, note: 'Retracted 2025-11-18 at the authors\' request (contaminated SurA preparation). The report cites it only to explain the retraction and the repeat experiments in aim 1.' },
  }), // DECOY: retracted paper cited to discuss the retraction
  paper(8, B, 'A microfluidic gradient chip for MIC determination', 2025),
  paper(10, B, 'Membrane permeability limits beta-lactam uptake in a microfluidic assay', 2026, { creditsGrantId: A, costRequestIds: ['rq-035'] }), // PLANTED: credits the wrong grant
)
for (const p of db.papers) if (p.pmcid === undefined) delete p.pmcid

// ---------------------------------------------------------------------------
// Real failure cases (T65; were "cut scripts"): four more grants, each cut on the real cancellation list
// (Grant Witness via Apify) on a real day. They start clean: no events or
// readings, so the live list, read as of the script's demo times, drives them.
// Real numbers, titles and dates from the list; the PIs and researchers are
// made up. Two are financial headaches the agent manages, two are mistakes
// it marks.
// ---------------------------------------------------------------------------
const scriptGrants = [
  // Headache: terminated 2025-04-17 and never restored. $394,729 of the
  // award will never arrive.
  { id: 'R01AI178875', title: 'Susceptibility and resistance of multidrug-resistant gram-negative bacteria', pi: 'Dr. Hannah Brooks', agency: 'NIH / NIAID',
    awarded: 950_647, received: 555_918, spent: 555_918, start: '2023-08-01', end: '2028-07-31', before: '2025-04-16' },
  // Marked error: terminated 2025-06-04; a card charge on 2025-06-09 spent
  // money the grant no longer had (rq-060 below).
  { id: 'R01GM155497', title: 'PP2A/B55alpha substrate specificity and function in cell cycle progression', pi: 'Dr. Samuel Reyes', agency: 'NIH / NIGMS',
    awarded: 661_956, received: 144_216, spent: 144_216, start: '2024-07-01', end: '2029-06-30', before: '2025-06-03' },
  // Headache: terminated 2025-07-31, reinstated by a court 2026-02-23
  // (Thakur v. Trump), but no money has come since.
  { id: 'R01HL176691', title: 'Role of macrophages in regulating cardiac muscle metabolism', pi: 'Dr. Grace Liu', agency: 'NIH / NHLBI',
    awarded: 771_750, received: 131_667, spent: 131_667, start: '2024-12-01', end: '2028-11-30', before: '2025-07-30' },
  // Marked error: the list's row is supplement 3R01GM105672-12S1 ($47,738),
  // filed under the award's number. Only the supplement was cut; freezing
  // the whole award would be the mistake. Award amounts are made up.
  { id: 'R01GM105672', title: 'The mechanism of ESCRT-mediated surveillance of the nuclear envelope', pi: 'Dr. Tomas Varga', agency: 'NIH / NIGMS',
    awarded: 1_412_000, received: 1_180_000, spent: 1_165_400, start: '2013-09-01', end: '2026-08-31', before: '2025-06-16' },
  // Headache (T74): terminated 2025-06-30 and still listed terminated, yet
  // USAspending shows NIH paid $34,026 by 2025-11 (and obligated $152,388 in
  // 2025-07). Money with nothing restoring the grant may be closeout money,
  // so the grant manager decides. Amounts are USAspending's: $839,040
  // obligated, $359,886 paid before the cut. End is the original 2027-04-30.
  { id: 'K01DK133670', title: 'Microbial drivers of metabolically unhealthy obese phenotype', pi: 'Dr. Leila Haddad', agency: 'NIH / NIDDK',
    awarded: 839_040, received: 359_886, spent: 359_886, start: '2022-07-01', end: '2027-04-30', before: '2025-06-29' },
  // Headache (T74): terminated 2025-05-06, restored 2025-09-18 (Harvard v.
  // HHS), paid $5,116 by 2025-12, then listed terminated again; USAspending
  // moved its end to 2025-12-31 and took back $7,739 in 2026-01. Amounts are
  // USAspending's ($37,547 obligated, $22,068 paid in fiscal 2025); end is
  // the original 2027-01-31.
  { id: 'F31DC022138', title: 'Cellular and functional heterogeneity of interhemispheric connections in the anterior olfactory nucleus', pi: 'Dr. Ruth Okafor', agency: 'NIH / NIDCD',
    awarded: 37_547, received: 22_068, spent: 22_068, start: '2025-02-01', end: '2027-01-31', before: '2025-05-05' },
]

// Each script grant starts at the day before its cut (a finished check for
// just that grant), so a plain Check now for every grant reads it as of then
// and doesn't run the script ahead (T65).
db.checkRequests = scriptGrants.map(g => ({ grantId: g.id, reason: 'check_now', requestedBy: 'grant_manager', day: TODAY, asOf: g.before }))

// PLANTED (failure case 2): a card charge five days after R01GM155497 was cut.
// Raises spend_while_canceled once the list's cut (dated 2025-06-04) lands.
db.requests.push({
  id: 'rq-060', day: '2025-06-09', requester: 'scientist', requesterName: 'Kenji Watanabe', item: 'Okadaic acid, 25 µg', category: 'reagents', price: 1_240, grantId: 'R01GM155497',
  purpose: 'Inhibiting PP2A in the B55alpha knockdown time course', state: 'bought', verdicts: [],
  explanation: 'Charged directly on the department purchasing card on 2025-06-09, outside GrantGuard. Imported from the university ledger.',
})
db.orders.push({ id: 'o-060', requestId: 'rq-060', vendor: 'Cayman Chemical', amount: 1_240, placed: '2025-06-09', state: 'paid' })
log('2025-06-11', 'system', 'Imported a card charge from the university ledger', 'Cayman Chemical $1,240 on R01GM155497, charged 2025-06-09.', 'rq-060')

// ---------------------------------------------------------------------------
// Grant totals from the records.
// ---------------------------------------------------------------------------
for (const g of [A, B]) {
  const purchases = db.requests.reduce((s, r) => s + db.orders.filter(o => o.requestId === r.id && o.state === 'paid').reduce((t, o) => t + finalAmount(o) * shareOf(r, g), 0), 0)
  const promised = db.requests.reduce((s, r) => s + db.orders.filter(o => o.requestId === r.id && (o.state === 'open' || o.state === 'changed')).reduce((t, o) => t + finalAmount(o) * shareOf(r, g), 0), 0)
  const payroll = db.payroll.filter(p => p.grantId === g && p.period.to <= TODAY).reduce((s, p) => s + p.amount, 0)
  const received = db.statusEvents.filter(e => e.grantId === g && e.kind === 'payment_received').reduce((s, e) => s + e.amount, 0)
  const { id, title, pi, agency, awarded, start, end, status, frozen, frozenReason } = grantMeta[g]
  db.grants.push({ id, title, pi, agency, awarded, received, spent: purchases + payroll, promised, start, end, status, frozen, ...(frozenReason ? { frozenReason } : {}) })
}
for (const { before, ...g } of scriptGrants) {
  const card = db.orders.filter(o => o.state === 'paid' && db.requests.find(r => r.id === o.requestId)?.grantId === g.id).reduce((t, o) => t + o.amount, 0)
  db.grants.push({ ...g, spent: g.spent + card, promised: 0, status: 'active', frozen: false })
}

db.log.sort((x, y) => x.day.localeCompare(y.day) || x.id.localeCompare(y.id))
db.log.forEach((row, i) => { row.id = `l-${pad(i + 1, 4)}` })

// ---------------------------------------------------------------------------
// The demo world (sim/demo-seed.json): what the web app loads. The full world
// above stays as the archive the scorecard, eval and tests run on. The demo
// keeps a few ordinary examples and the cases the 3-minute demo shows; every
// record keeps its id, and anything that points at an archived record goes too.
// ---------------------------------------------------------------------------
const DEMO_REQUESTS = new Set([
  'rq-101', // demo path: buy on the restored, unpaid grant
  'rq-102', // supplies in the last 90 days: rerouted
  'rq-103', // an unallowable item: blocked
  'rq-012', 'rq-033', // ordinary past orders, and the vendors rq-101 and rq-102 reuse
  'rq-017', // ordinary past order, in A's paid payment request pr-005
  'rq-030', // an invoice for a canceled order
  'rq-034', // in April's request pr-015 (and its invoice bills a different amount)
  'rq-035', // the fee behind the paper crediting the wrong grant (p-10)
  'rq-037', // the held invoice left out of May's payment request
  'rq-060', // the "Bought after the cut" edge case
])
const DEMO_PAPERS = new Set(['p-01', 'p-10'])
const DEMO_DROP = new Set(['inv-201']) // a second bill for o-033: archive only

const writeWorld = (file, w) => {
  writeFileSync(join(HERE, file), JSON.stringify(w, null, 2) + '\n')
  console.log(`wrote sim/${file}: ${w.requests.length} requests, ${w.orders.length} orders, ${w.invoices.length} invoices, ${w.payroll.length} payroll rows, ${w.paymentRequests.length} payment requests, ${w.papers.length} papers, ${w.log.length} log rows`)
}

const demoWorld = full => {
  const w = structuredClone(full)
  w.requests = w.requests.filter(r => DEMO_REQUESTS.has(r.id))
  w.orders = w.orders.filter(o => DEMO_REQUESTS.has(o.requestId))
  const orders = new Set(w.orders.map(o => o.id))
  w.approvals = w.approvals.filter(a => orders.has(a.orderId))
  w.invoices = w.invoices.filter(i => orders.has(i.orderId) && !DEMO_DROP.has(i.id))
  w.papers = w.papers.filter(p => DEMO_PAPERS.has(p.id))
  const kept = new Set([...DEMO_REQUESTS, ...orders, ...w.invoices.map(i => i.id), ...w.papers.map(p => p.id)])
  w.holds = w.holds.filter(h => kept.has(h.refId))
  // Every payment request's purchases are kept, so its amount and payment stand.
  const prIds = pr => [...pr.includedRequestIds, ...pr.excluded.map(x => x.requestId)]
  if (!w.paymentRequests.every(pr => prIds(pr).every(id => DEMO_REQUESTS.has(id)))) throw new Error('demo world: keep every purchase a payment request lists')
  for (const h of w.holds) kept.add(h.id)
  const archived = new Set([...full.requests, ...full.orders, ...full.invoices, ...full.papers, ...full.holds].map(x => x.id).filter(id => !kept.has(id)))
  w.log = w.log.filter(row => !archived.has(row.refId))
  w.log.forEach((row, i) => { row.id = `l-${pad(i + 1, 4)}` })
  // Totals less what the archived records added (payroll and payments all stay).
  const archivedOrders = full.orders.filter(o => !orders.has(o.id))
  const less = (g, state) => archivedOrders.filter(o => state(o.state)).reduce((t, o) => t + finalAmount(o) * shareOf(full.requests.find(r => r.id === o.requestId), g), 0)
  w.grants = w.grants.map(g => ({ ...g, spent: g.spent - less(g.id, s => s === 'paid'), promised: g.promised - less(g.id, s => s === 'open' || s === 'changed') }))
  return w
}

writeWorld('seed.json', db)
writeWorld('demo-seed.json', demoWorld(db))
