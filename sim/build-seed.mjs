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
// B's supplies all fall before 2026-06-02 (its last 90 days start then).
// A has nothing between its cancellation (2026-03-10) and today except the
// planted card charge rq-050.
// ---------------------------------------------------------------------------
const background = [
  // grant, day, item, vendor, category, price, purpose
  [A, '2025-01-14', 'Nitrile gloves, 10 cases', 'LabSource', 'lab supplies', 640, 'Membrane prep, aim 1'],
  [A, '2025-01-22', 'BL21(DE3) competent cells, 10 vials', 'BioReagents Inc', 'reagents', 485, 'Expression of OmpA mutants'],
  [A, '2025-02-10', 'DDM detergent, 5 g', 'MembraneChem', 'reagents', 890, 'Solubilizing outer membrane proteins'],
  [A, '2025-03-05', 'Pipette tips, 20 racks', 'LabSource', 'lab supplies', 380, 'Folding assays'],
  [A, '2025-03-27', 'Size-exclusion column', 'ChromaTech', 'lab supplies', 2_950, 'Purifying folded OmpA'],
  [A, '2025-04-16', 'HEPES buffer, 1 kg', 'BioReagents Inc', 'reagents', 310, 'Buffers for folding kinetics'],
  [A, '2025-05-08', 'Liposome extrusion kit', 'MembraneChem', 'lab supplies', 1_240, 'Making liposomes for aim 2'],
  [A, '2025-06-10', 'Benchtop refrigerated centrifuge', 'SpinWorks', 'equipment', 7_400, 'Membrane fractionation, aims 1 and 2'], // over the limit: approved
  [A, '2025-07-02', 'Ni-NTA resin, 100 mL', 'ChromaTech', 'reagents', 1_620, 'His-tag purification'],
  [A, '2025-08-19', 'Cryo-EM grids, 2 boxes', 'GridLab', 'lab supplies', 1_180, 'Chaperone complex imaging'],
  [A, '2025-09-09', 'Proteomics core: 10 hours of mass spec', 'Campus Proteomics Core', 'core facility services', 1_800, `Samples from both projects: 5 hours for ${A}, 5 hours for ${B}`], // correct split
  [A, '2025-10-14', 'Nitrile gloves, 10 cases', 'LabSource', 'lab supplies', 640, 'Membrane prep, aim 2'],
  [A, '2025-11-04', 'POPC lipid, 1 g', 'MembraneChem', 'reagents', 1_460, 'Liposome folding assays'],
  [A, '2025-12-02', 'Dry ice shipping to the cryo-EM center', 'CoolChain', 'shipping', 220, 'Shipping grids for imaging'],
  [A, '2026-01-13', 'Pipette tips, 20 racks', 'LabSource', 'lab supplies', 380, 'Folding assays'],
  [A, '2026-02-03', 'Ni-NTA resin, 100 mL', 'ChromaTech', 'reagents', 1_620, 'His-tag purification'],
  [A, '2026-02-17', 'Detergent screening kit, 2 plates', 'MembraneChem', 'reagents', 2_300, 'BamA detergent screen'],

  [B, '2024-08-20', 'Mueller-Hinton agar, 20 packs', 'MicroMedia', 'lab supplies', 590, 'Reference susceptibility plates'],
  [B, '2024-09-17', 'Microfluidic chips, 50', 'FlowChip Co', 'lab supplies', 2_400, 'Assay prototype runs'],
  [B, '2024-10-22', 'Pipette tips, 20 racks', 'LabSource', 'lab supplies', 380, 'Assay plates'],
  [B, '2024-12-03', 'Antibiotic reference panel', 'BioReagents Inc', 'reagents', 1_350, 'MIC calibration'],
  [B, '2025-01-28', 'PDMS casting kit', 'FlowChip Co', 'lab supplies', 760, 'Chip fabrication'],
  [B, '2025-03-11', 'Syringe pump tubing set', 'FlowChip Co', 'lab supplies', 340, 'Chip perfusion'],
  [B, '2025-04-29', 'Incubator shaker service visit', 'CoolChain', 'equipment service', 980, 'Annual service of the assay incubator'],
  [B, '2025-06-24', 'Mueller-Hinton broth, 12 bottles', 'MicroMedia', 'reagents', 1_460, 'Broth microdilution controls'],
  [B, '2025-08-12', 'Agar plates, 40 packs', 'MicroMedia', 'lab supplies', 1_180, 'Assay validation runs'],
  [B, '2025-10-07', 'Microfluidic chips, 50', 'FlowChip Co', 'lab supplies', 2_400, 'Clinical isolate runs'],
  [B, '2025-12-09', 'Pipette tips, 20 racks', 'LabSource', 'lab supplies', 380, 'Assay plates'],
  [B, '2026-01-20', 'Antibiotic disks, 10 cartridges', 'BioReagents Inc', 'reagents', 690, 'Disk diffusion comparison'],
  [B, '2026-02-20', 'Ceftazidime-avibactam reference powder', 'BioReagents Inc', 'reagents', 2_400, 'Resistance panel'], // canceled order: planted invoice
  [B, '2026-03-10', 'Glass slides and coverslips', 'LabSource', 'lab supplies', 260, 'Imaging controls'],
  [B, '2026-03-24', 'Microfluidic chips, 50', 'FlowChip Co', 'lab supplies', 2_400, 'Clinical isolate runs'],
  [B, '2026-04-14', 'Agar plates, 40 packs', 'MicroMedia', 'lab supplies', 1_180, 'Assay validation runs'],
  [B, '2026-04-20', 'Orbital plate shaker', 'SpinWorks', 'equipment', 5_800, 'Shaking incubation of assay plates'], // approval for a different amount: planted invoice
  [B, '2026-04-24', 'Open-access publication fee, J. Appl. Microb. Methods', 'J. Appl. Microb. Methods', 'publication costs', 2_100, 'Publishing the beta-lactam assay paper'], // paper p-10's cost
  [B, '2026-05-01', 'Ultra-low freezer service contract', 'CoolChain', 'equipment service', 1_150, 'Keeping isolate stocks at -80 C'], // approved change: decoy invoice
  [B, '2026-05-01', 'Mueller-Hinton broth, 12 bottles', 'MicroMedia', 'reagents', 1_460, 'Broth microdilution controls'], // held invoice: payment request planted case
  [B, '2026-05-20', 'Genomics core: sequencing run for 24 isolates', 'Campus Genomics Core', 'core facility services', 640, 'Confirming resistance genes'],
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

let holdSeq = 0
const newHoldId = () => `h-${pad(++holdSeq)}`

background.forEach(([grantId, day, item, vendor, category, price, purpose], i) => {
  const n = i + 1
  const id = `rq-${pad(n)}`, oid = `o-${pad(n)}`, iid = `inv-${pad(n)}`
  const overLimit = price > 5_000
  const split = n === 11 ? [{ grantId: A, share: 0.5 }, { grantId: B, share: 0.5 }] : undefined
  db.requests.push({
    id, day, requester: 'scientist', requesterName: researcherFor(grantId), item, category, price, grantId, ...(split ? { split } : {}), purpose,
    state: 'bought', verdicts: passVerdicts(price, category),
    explanation: overLimit
      ? `Over the $5,000 card limit, so I paused it for the grant manager, who approved it at ${money(price)}. Then I ordered it.`
      : split ? 'Every rule passed. A shared cost, so I split it 50/50 by the hours each project used.'
        : 'Every rule passed and it is under the card limit, so I bought it.',
  })
  log(day, 'scientist', `${researcherFor(grantId)} asked to buy ${item} (${money(price)})`, purpose, id)

  let placed = day
  if (overLimit) {
    const hid = newHoldId(), decided = addDays(day, 1)
    placed = addDays(day, 2)
    db.holds.push({
      id: hid, kind: 'purchase', refId: id, grantId, raisedBy: 'purchasing', day,
      title: `Buy ${item.toLowerCase()} (${money(price)}), over the card limit?`,
      why: 'Over the $5,000 card limit, so the grant manager has to approve it.',
      evidence: [{ label: 'Price', value: money(price) }, { label: 'Card limit', value: '$5,000' }],
      options: ['approve', 'reject'],
      decision: { choice: 'approve', reason: 'Needed for the aims; quote checked against two vendors.', by: 'grant_manager', day: decided },
    })
    db.approvals.push({ id: `ap-${pad(n)}`, orderId: oid, amount: price, by: 'grant_manager', day: decided })
    log(day, 'purchasing', `Paused ${item.toLowerCase()} for the grant manager`, `${money(price)} is over the card limit.`, hid, 'Under the card limit ($5,000)')
    log(decided, 'grant_manager', `Decided ${hid}: approve`, 'Needed for the aims; quote checked against two vendors.', hid)
  }
  log(placed, 'purchasing', `Bought ${item.toLowerCase()} (${money(price)}) on ${split ? `${A} and ${B}` : grantId}`, 'Every rule passed.', id, overLimit ? 'Approved by the grant manager' : 'All rules pass, under card limit')

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
    db.requests.at(-1).explanation = 'Every rule passed, so I bought it. The lab canceled the order on 2026-03-02 (back-ordered for 10 weeks).'
    log('2026-03-02', 'scientist', `Canceled order ${oid}`, 'Vendor back-ordered it for 10 weeks; we used a colleague\'s stock instead.', oid)
  } else if (item === 'Orbital plate shaker') {
    // PLANTED (invoices): the approval is for a different amount than the invoice.
    order.amount = 6_200; order.state = 'open'
    db.requests.at(-1).explanation = 'Over the $5,000 card limit, so I paused it for the grant manager, who approved the $5,800 quote. The department purchasing office placed the order on 2026-04-22.'
    db.log.at(-1).action = `Order for ${item.toLowerCase()} placed by the department purchasing office`
    Object.assign(invoice, { amount: 6_200, received: '2026-06-09', state: 'matched', checked: false, timeline: [{ day: '2026-06-09', what: 'Invoice arrived ($6,200)' }] })
  } else if (item === 'Ultra-low freezer service contract') {
    // DECOY (invoices): invoice matches an approved change to the order.
    order.state = 'changed'; order.changedAmount = 1_290
    const hid = newHoldId()
    db.holds.push({
      id: hid, kind: 'purchase', refId: id, grantId, raisedBy: 'purchasing', day: '2026-05-03',
      title: 'Approve a change to the CoolChain order: $1,150 to $1,290?',
      why: 'The vendor added a required compressor check; changes to an order need the grant manager.',
      evidence: [{ label: 'Original order', value: '$1,150 (2026-05-01)' }, { label: 'Changed to', value: '$1,290' }],
      options: ['approve', 'reject'],
      decision: { choice: 'approve', reason: 'The compressor check is required by the service contract.', by: 'grant_manager', day: '2026-05-04' },
    })
    db.approvals.push({ id: `ap-${pad(n)}`, orderId: oid, amount: 1_290, by: 'grant_manager', day: '2026-05-04' })
    log('2026-05-03', 'purchasing', 'Paused a change to order o-036 for the grant manager', 'Order changed from $1,150 to $1,290.', hid, 'Order changes need the grant manager')
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
})

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
    state: 'bought', verdicts: passVerdicts(price, category), explanation: 'Every rule passed and it is under the card limit, so I bought it.',
  })
  log(day, 'scientist', `${researcherFor(B)} asked to buy ${item} (${money(price)})`, purpose, id)
  log(day, 'purchasing', `Bought ${item.toLowerCase()} (${money(price)}) on ${B}`, 'Every rule passed.', id, 'All rules pass, under card limit')
  db.orders.push({ id: oid, requestId: id, vendor, amount: price, placed: day, state: 'open' })
  db.invoices.push({ id: `inv-${n}`, orderId: oid, vendor, amount: price, received, state: 'matched', checked: false, timeline: [{ day: received, what: `Invoice arrived (${money(price)})` }] })
}

// ---------------------------------------------------------------------------
// Today's raw requests: submitted, no verdicts yet. Planted mistakes and decoys.
// ---------------------------------------------------------------------------
const raw = [
  ['rq-101', '2026-06-14', 'Nitrile gloves, 10 cases', 'lab supplies', 640, A, undefined, 'Membrane prep for aim 2. The court restored the grant, so the money is coming.'],
  ['rq-102', '2026-06-12', 'Agar plates, 40 packs', 'lab supplies', 1_180, B, undefined, 'Assay validation runs before the grant ends'],
  ['rq-103', '2026-06-13', 'Espresso machine for the lab', 'general office', 890, B, undefined, 'Lab morale during the final push'],
  ['rq-104', '2026-06-13', 'Confocal microscope service contract, 12 months', 'equipment service', 3_600, A, undefined, `Annual service of the shared confocal microscope; imaging for both ${A} (membrane folding) and ${B} (assay imaging)`],
  ['rq-105', '2026-06-15', 'Peristaltic pump with controller', 'equipment', 6_850, A, undefined, 'Continuous-flow folding experiments, aim 3'],
  ['rq-106', '2026-06-15', 'Membrane protein detergent screening kit, 4 plates', 'reagents', 5_000, A, undefined, 'BamA detergent screen, round 2'],
  // PLANTED (purchases, T57): two sequencing runs on the same day, each under
  // the card limit, $5,500 together: a split purchase.
  ['rq-108', '2026-06-15', 'Sequencing core: 48 isolates, run 1 of 2', 'core facility services', 2_900, B, undefined, 'Resistance-gene survey of the clinical isolate panel'],
  ['rq-109', '2026-06-15', 'Sequencing core: 48 isolates, run 2 of 2', 'core facility services', 2_600, B, undefined, 'Resistance-gene survey of the clinical isolate panel'],
  // DECOY (purchases, T57): same person and day, but another category.
  ['rq-110', '2026-06-15', 'Biosafety cabinet filter replacement', 'equipment service', 2_400, B, undefined, 'HEPA filter replacement found at certification'],
  ['rq-107', '2026-06-12', 'Proteomics core: 10 hours of mass spec', 'core facility services', 1_800, A, [{ grantId: A, share: 0.6 }, { grantId: B, share: 0.4 }], `Samples from both projects: 6 hours for ${A}, 4 hours for ${B}`],
]
for (const [id, day, item, category, price, grantId, split, purpose] of raw) {
  db.requests.push({ id, day, requester: 'scientist', requesterName: researcherFor(grantId), item, category, price, grantId, ...(split ? { split } : {}), purpose, state: 'submitted', verdicts: [], explanation: 'Waiting for the purchasing agent.' })
  log(day, 'scientist', `${researcherFor(grantId)} asked to buy ${item} (${money(price)})`, purpose, id)
}

// ---------------------------------------------------------------------------
// Payroll: monthly rows. A stops after Feb 2026 (staff moved to bridge funds
// when it was canceled); B runs through May 2026.
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
for (const [grantId, from, to] of [[A, '2025-01-01', '2026-02-01'], [B, '2024-08-01', '2026-05-01']]) {
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
const shareOf = (r, g) => (r.split ? (r.split.find(s => s.grantId === g)?.share ?? 0) : (r.chargedGrantId ?? r.grantId) === g ? 1 : 0)
const charged = (r, g) => db.orders.filter(o => o.requestId === r.id && o.state !== 'canceled').reduce((s, o) => s + finalAmount(o) * shareOf(r, g), 0)

const prPlan = [
  [A, '2025-01-01', '2025-03-31', '2025-04-08', 'paid'],
  [A, '2025-04-01', '2025-06-30', '2025-07-08', 'paid'],
  [A, '2025-07-01', '2025-09-30', '2025-10-08', 'paid'],
  [A, '2025-10-01', '2025-12-31', '2026-01-08', 'paid'],
  [A, '2026-01-01', '2026-02-28', '2026-03-03', 'paid'],
  [B, '2024-08-01', '2024-09-30', '2024-10-08', 'paid'],
  [B, '2024-10-01', '2024-12-31', '2025-01-08', 'paid'],
  [B, '2025-01-01', '2025-03-31', '2025-04-08', 'paid'],
  [B, '2025-04-01', '2025-06-30', '2025-07-08', 'paid'],
  [B, '2025-07-01', '2025-09-30', '2025-10-08', 'paid'],
  [B, '2025-10-01', '2025-12-31', '2026-01-08', 'paid'],
  [B, '2026-01-01', '2026-01-31', '2026-02-06', 'paid'],
  [B, '2026-02-01', '2026-02-28', '2026-03-06', 'paid'],
  [B, '2026-03-01', '2026-03-31', '2026-04-07', 'paid'],
  [B, '2026-04-01', '2026-04-30', '2026-05-08', 'sent'],
]
let seSeq = 0
const newSe = () => `se-${pad(++seSeq)}`
prPlan.forEach(([g, from, to, submitted, state], i) => {
  const id = `pr-${pad(i + 1)}`
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
})
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
  // Today's readings. PLANTED: RePORTER now says A is active; USAspending and the list still say canceled.
  { id: 'sr-008', grantId: A, day: TODAY, source: 'NIH RePORTER', status: 'active' },
  { id: 'sr-009', grantId: A, day: TODAY, source: 'USAspending', status: 'canceled' },
  { id: 'sr-010', grantId: A, day: TODAY, source: 'Cancellation list (Apify)', status: 'canceled' },
  { id: 'sr-011', grantId: B, day: TODAY, source: 'NIH RePORTER', status: 'active' },
  { id: 'sr-012', grantId: B, day: TODAY, source: 'USAspending', status: 'active' },
)

// ---------------------------------------------------------------------------
// Progress report papers. Raw: not checked yet (checks empty, checked false).
// Corrections, PMCIDs and acknowledgments are the public records the checker
// will find (cached here so the demo works offline).
// ---------------------------------------------------------------------------
const paper = (n, grantId, title, year, extra = {}) => ({
  id: `p-${pad(n, 2)}`, grantId, title, doi: `10.5555/gg.${year}.${pad(n, 4)}`, pmcid: `PMC1100${pad(n, 4)}`, creditsGrantId: grantId,
  checks: [], result: 'ok', checked: false, ...extra,
})
db.papers.push(
  paper(1, A, 'Lipid-dependent folding intermediates of OmpA', 2025),
  paper(2, A, 'Detergent selection shapes the folding landscape of BamA', 2025),
  paper(3, A, 'Cryo-EM of a membrane chaperone complex', 2026, { pmcid: undefined }), // PLANTED: no PMCID
  paper(4, A, 'Folding kinetics of OmpF under osmotic stress', 2025, {
    correction: { kind: 'material', disclosed: false, note: 'Correction (2026-03-02): the Figure 3 rate constants were re-measured; the folding rate changes by about 40% and one conclusion in the abstract is revised.' },
  }), // PLANTED: material correction, not disclosed
  paper(5, A, 'Periplasmic chaperone binding seen by single-molecule FRET', 2025, {
    correction: { kind: 'minor', disclosed: false, note: "Correction (2026-01-15): one author's affiliation was corrected." },
  }), // DECOY: affiliation-only correction
  paper(6, A, 'Membrane thickness tunes insertion of beta-barrel proteins', 2026),
  paper(7, A, 'SurA accelerates folding of outer membrane proteins in vitro', 2024, {
    correction: { kind: 'retraction', disclosed: true, note: 'Retracted 2025-11-18 at the authors\' request (contaminated SurA preparation). The report cites it only to explain the retraction and the repeat experiments in aim 1.' },
  }), // DECOY: retracted paper cited to discuss the retraction
  paper(8, B, 'A microfluidic gradient chip for MIC determination', 2025),
  paper(9, B, 'Four-hour susceptibility calls for Enterobacterales', 2025),
  paper(10, B, 'Membrane permeability limits beta-lactam uptake in a microfluidic assay', 2026, { creditsGrantId: A, costRequestIds: ['rq-035'] }), // PLANTED: credits the wrong grant
  paper(11, B, 'Benchmarking rapid susceptibility testing against broth microdilution', 2026),
  paper(12, B, 'Single-cell growth imaging in antibiotic gradients', 2026),
)
for (const p of db.papers) if (p.pmcid === undefined) delete p.pmcid

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

db.log.sort((x, y) => x.day.localeCompare(y.day) || x.id.localeCompare(y.id))
db.log.forEach((row, i) => { row.id = `l-${pad(i + 1, 4)}` })

writeFileSync(join(HERE, 'seed.json'), JSON.stringify(db, null, 2) + '\n')
console.log(`wrote sim/seed.json: ${db.requests.length} requests, ${db.orders.length} orders, ${db.invoices.length} invoices, ${db.payroll.length} payroll rows, ${db.paymentRequests.length} payment requests, ${db.papers.length} papers, ${db.log.length} log rows`)
