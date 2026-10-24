// Fixture world for the windows (T16), shaped like the demo path in
// docs/MASTER-PLAN.md §5. Grant IDs are made up until Track B picks the two
// real NIH grants. Track C's full seed with every planted mistake is T8.
import type { Db } from './types'

const A = 'R01GM000001' // canceled, restored by court, money not yet arrived
const B = 'R21AI000002' // active, ends within 90 days

export const fixtures: Db = {
  today: '2026-06-15',

  grants: [
    {
      id: A,
      title: 'Protein folding dynamics in bacterial membranes',
      pi: 'Dr. Lena Ortiz',
      agency: 'NIH / NIGMS',
      awarded: 420_000,
      received: 180_000,
      spent: 171_400,
      promised: 12_350,
      start: '2025-01-01',
      end: '2027-12-31',
      status: 'restored_by_court',
      frozen: true,
      frozenReason: 'Canceled 2026-03-10. A court restored it on 2026-04-20, but no payment has arrived since, so spending stays frozen.',
    },
    {
      id: B,
      title: 'Rapid antimicrobial susceptibility assay',
      pi: 'Dr. Lena Ortiz',
      agency: 'NIH / NIAID',
      awarded: 275_000,
      received: 240_000,
      spent: 228_900,
      promised: 6_120,
      start: '2024-08-01',
      end: '2026-08-01',
      status: 'active',
      frozen: false,
    },
  ],

  statusEvents: [
    { id: 'se1', grantId: A, day: '2026-03-10', kind: 'canceled', source: 'Cancellation list (Apify)', summary: 'Grant appears on the terminated-grants list.' },
    { id: 'se2', grantId: A, day: '2026-03-11', kind: 'canceled', source: 'NIH RePORTER', summary: 'RePORTER shows the project as terminated.' },
    { id: 'se3', grantId: A, day: '2026-04-20', kind: 'court_order', source: 'Court notice', summary: 'Preliminary injunction restores the terminated grants in this class, including this one.' },
    { id: 'se4', grantId: B, day: '2026-05-02', kind: 'payment_received', source: 'Payment system', summary: 'Drawdown of $18,000 received.', amount: 18_000 },
  ],

  sourceReadings: [
    { id: 'sr1', grantId: A, day: '2026-06-15', source: 'NIH RePORTER', status: 'active' },
    { id: 'sr2', grantId: A, day: '2026-06-15', source: 'USAspending', status: 'canceled' },
    { id: 'sr3', grantId: A, day: '2026-06-15', source: 'Cancellation list (Apify)', status: 'canceled' },
    { id: 'sr4', grantId: B, day: '2026-06-15', source: 'NIH RePORTER', status: 'active' },
    { id: 'sr5', grantId: B, day: '2026-06-15', source: 'USAspending', status: 'active' },
  ],

  flags: [
    { id: 'f1', grantId: A, day: '2026-06-15', kind: 'sources_disagree', summary: 'RePORTER says active; USAspending and the cancellation list say canceled.', open: true },
    { id: 'f2', grantId: A, day: '2026-04-20', kind: 'court_order_no_payment', summary: 'Court order received, but no payment has landed since the cancellation.', open: true },
  ],

  requests: [
    {
      id: 'rq1', day: '2026-06-14', requester: 'scientist', item: 'Nitrile gloves, 10 cases', category: 'lab supplies', price: 640,
      grantId: A, purpose: 'Membrane prep for aim 2', state: 'waiting_on_manager',
      verdicts: [
        { rule: 'Grant is active and not frozen', pass: false, detail: 'Frozen: court order but no payment since the cancellation.' },
        { rule: 'Category allowed', pass: true, detail: 'Lab supplies are allowed on this grant.' },
        { rule: 'Under the card limit ($5,000)', pass: true, detail: '$640.' },
      ],
      explanation: 'Held. The court restored this grant, but a court order is not cash: no payment has arrived since it was canceled. The scientist says the money is coming; I will buy as soon as a payment lands, or the grant manager can decide now.',
    },
    {
      id: 'rq2', day: '2026-06-12', requester: 'scientist', item: 'Agar plates, 40 packs', category: 'lab supplies', price: 1_180,
      grantId: B, chargedGrantId: A, purpose: 'Assay validation runs', state: 'rerouted',
      verdicts: [
        { rule: "Not in the grant's last 90 days", pass: false, detail: 'R21AI000002 ends 2026-08-01, 47 days away.', auditCase: 'NSF OIG 22-1-010 (WVU): supplies bought near the end were disallowed' },
        { rule: 'Another grant has time and money', pass: true, detail: 'R01GM000001 fits the purpose, once it unfreezes.' },
      ],
      explanation: 'Supplies bought in the last 90 days of a grant are a classic audit finding. Rerouted to R01GM000001, which covers the same work; it goes through when that grant unfreezes.',
    },
    {
      id: 'rq3', day: '2026-06-10', requester: 'scientist', item: 'Pipette tips, 20 racks', category: 'lab supplies', price: 380,
      grantId: B, purpose: 'Assay plates', state: 'bought',
      verdicts: [
        { rule: 'Grant is active and not frozen', pass: true, detail: 'Active.' },
        { rule: 'Under the card limit ($5,000)', pass: true, detail: '$380.' },
        { rule: 'Enough truly available money', pass: true, detail: '$39,980 available.' },
      ],
      explanation: 'Every rule passed and it is under the card limit, so I bought it.',
    },
    {
      id: 'rq4', day: '2026-06-13', requester: 'scientist', item: 'Espresso machine for the lab', category: 'general office', price: 890,
      grantId: B, purpose: 'Lab morale', state: 'blocked',
      verdicts: [
        { rule: 'Category allowed', pass: false, detail: 'General office items are not allowable direct costs.', auditCase: 'NSF OIG 17-1-002 (UC Davis): unallowable items charged to awards' },
      ],
      explanation: 'Blocked: not an allowable cost on a federal grant.',
    },
  ],

  orders: [
    { id: 'o1', requestId: 'rq3', vendor: 'LabSource', amount: 380, placed: '2026-06-10', state: 'open' },
    { id: 'o2', requestId: 'rqx', vendor: 'BioReagents Inc', amount: 2_400, placed: '2026-02-20', state: 'canceled', canceledOn: '2026-03-02' },
    { id: 'o3', requestId: 'rqy', vendor: 'CoolChain', amount: 1_150, placed: '2026-05-01', state: 'changed', changedAmount: 1_290 },
  ],

  approvals: [
    { id: 'ap1', orderId: 'o3', amount: 1_290, by: 'grant_manager', day: '2026-05-04' },
  ],

  invoices: [
    {
      id: 'inv1', orderId: 'o2', vendor: 'BioReagents Inc', amount: 2_400, received: '2026-06-11', state: 'held',
      mismatch: 'The order was canceled on 2026-03-02, before this invoice arrived.',
      timeline: [
        { day: '2026-02-20', what: 'Order placed ($2,400)' },
        { day: '2026-03-02', what: 'Order canceled by the lab' },
        { day: '2026-06-11', what: 'Invoice arrived for the full amount' },
      ],
    },
    {
      id: 'inv2', orderId: 'o3', vendor: 'CoolChain', amount: 1_290, received: '2026-06-08', state: 'matched',
      timeline: [
        { day: '2026-05-01', what: 'Order placed ($1,150)' },
        { day: '2026-05-04', what: 'Change to $1,290 approved by the grant manager' },
        { day: '2026-06-08', what: 'Invoice arrived for $1,290: matches the approved change' },
      ],
    },
    {
      id: 'inv3', orderId: 'o1', vendor: 'LabSource', amount: 380, received: '2026-06-14', state: 'matched',
      timeline: [
        { day: '2026-06-10', what: 'Order placed ($380)' },
        { day: '2026-06-14', what: 'Invoice arrived, matches order and approval' },
      ],
    },
  ],

  paymentRequests: [
    {
      id: 'pr1', grantId: B, from: '2026-05-01', to: '2026-05-31', amount: 9_460,
      explanation: 'Reimbursement for May 2026 direct costs on R21AI000002: lab supplies $3,170 (pipette tips, assay plates, reagents, 6 orders), equipment service $1,290 (CoolChain freezer service, approved change), personnel $5,000 (graduate researcher, 50% effort). All purchases were matched to approved orders and invoices. One $2,400 invoice from BioReagents Inc is on hold and is not included.',
      includedRequestIds: ['rq3'],
      excluded: [{ requestId: 'rqx', why: 'Invoice inv1 is on hold (order was canceled).' }],
      state: 'waiting_on_manager',
      followUps: [
        {
          id: 'fu1', question: 'Please itemize the $3,170 in lab supplies and confirm none was purchased after the project end date.',
          answerDraft: 'The $3,170 is six orders placed 2026-05-03 to 2026-05-29: LabSource pipette tips $380 (5/03), ... All were placed before the end date of 2026-08-01.',
          state: 'waiting_on_manager',
        },
      ],
    },
  ],

  papers: [
    {
      id: 'p1', grantId: A, title: 'Lipid-dependent folding intermediates of OmpA', doi: '10.0000/fixture.0001', pmcid: 'PMC0000001', creditsGrantId: A,
      checks: [
        { check: 'Credits this grant', pass: true, detail: 'Acknowledgments name R01GM000001.' },
        { check: 'Has a PubMed Central ID', pass: true, detail: 'PMC0000001' },
        { check: 'No undisclosed correction', pass: true, detail: 'No corrections on record.' },
      ],
      result: 'ok',
    },
    {
      id: 'p2', grantId: A, title: 'A microfluidic assay for beta-lactam resistance', doi: '10.0000/fixture.0002', pmcid: 'PMC0000002', creditsGrantId: B,
      checks: [
        { check: 'Credits this grant', pass: false, detail: 'Listed in R01GM000001\'s report, but its acknowledgments name R21AI000002. Its $2,100 in costs were charged to R01GM000001; 38 days left to move them.' },
        { check: 'Has a PubMed Central ID', pass: true, detail: 'PMC0000002' },
      ],
      result: 'held',
    },
    {
      id: 'p3', grantId: A, title: 'Cryo-EM of a membrane chaperone complex', doi: '10.0000/fixture.0003', creditsGrantId: A,
      checks: [
        { check: 'Credits this grant', pass: true, detail: 'Acknowledgments name R01GM000001.' },
        { check: 'Has a PubMed Central ID', pass: false, detail: 'No PMCID found; NIH public access policy requires one.' },
      ],
      result: 'held',
    },
    {
      id: 'p4', grantId: A, title: 'Folding kinetics under osmotic stress', doi: '10.0000/fixture.0004', pmcid: 'PMC0000004', creditsGrantId: A,
      correction: { kind: 'minor', disclosed: false, note: 'Author affiliation corrected.' },
      checks: [
        { check: 'Credits this grant', pass: true, detail: 'Acknowledgments name R01GM000001.' },
        { check: 'No undisclosed correction', pass: true, detail: 'Affiliation-only correction: a note, not a hold.' },
      ],
      result: 'note',
    },
  ],

  holds: [
    {
      id: 'h1', kind: 'purchase', refId: 'rq1', grantId: A, raisedBy: 'purchasing', day: '2026-06-14',
      title: 'Buy nitrile gloves ($640) on a frozen grant?',
      why: 'A court order restored the grant, but no payment has arrived since the cancellation.',
      evidence: [
        { label: 'Canceled', value: '2026-03-10 (cancellation list, RePORTER)' },
        { label: 'Court order', value: '2026-04-20' },
        { label: 'Payments since', value: 'none' },
        { label: 'Truly available', value: '$236,250 on paper' },
      ],
      options: ['approve', 'reject', 'override'],
    },
    {
      id: 'h2', kind: 'invoice', refId: 'inv1', grantId: B, raisedBy: 'bookkeeping', day: '2026-06-11',
      title: 'Pay BioReagents Inc $2,400 for a canceled order?',
      why: 'The order was canceled on 2026-03-02, before the invoice arrived.',
      evidence: [
        { label: 'Order', value: 'o2, placed 2026-02-20, canceled 2026-03-02' },
        { label: 'Invoice', value: 'inv1, $2,400, received 2026-06-11' },
      ],
      options: ['approve', 'reject', 'ask_vendor'],
    },
    {
      id: 'h3', kind: 'payment_request', refId: 'pr1', grantId: B, raisedBy: 'payment_report', day: '2026-06-15',
      title: 'Send May payment request ($9,460)?',
      why: 'Payment requests always need the grant manager. The held invoice is left out.',
      evidence: [
        { label: 'Period', value: '2026-05-01 to 2026-05-31' },
        { label: 'Left out', value: 'inv1 ($2,400, on hold)' },
      ],
      options: ['approve', 'reject'],
    },
    {
      id: 'h4', kind: 'source_disagreement', refId: 'f1', grantId: A, raisedBy: 'bookkeeping', day: '2026-06-15',
      title: 'Which source is right about R01GM000001?',
      why: 'RePORTER says active; USAspending and the cancellation list say canceled. Spending stays frozen until you decide.',
      evidence: [
        { label: 'NIH RePORTER', value: 'active (2026-06-15)' },
        { label: 'USAspending', value: 'canceled (2026-06-15)' },
        { label: 'Cancellation list', value: 'canceled (2026-06-15)' },
      ],
      options: ['pick_source', 'override'],
    },
    {
      id: 'h5', kind: 'report', refId: 'p2', grantId: A, raisedBy: 'payment_report', day: '2026-06-15',
      title: 'Paper credits the wrong grant: move $2,100?',
      why: 'The paper credits R21AI000002, but its costs were charged to R01GM000001. 38 days left on the 90-day fix window.',
      evidence: [
        { label: 'Paper', value: 'A microfluidic assay for beta-lactam resistance' },
        { label: 'Acknowledges', value: 'R21AI000002' },
        { label: 'Charged to', value: 'R01GM000001' },
      ],
      options: ['approve', 'reject'],
    },
    {
      id: 'h6', kind: 'report', refId: 'p3', grantId: A, raisedBy: 'payment_report', day: '2026-06-15',
      title: 'Paper has no PubMed Central ID: fix before the report goes out?',
      why: 'NIH public access policy requires a PMCID for every paper listed in a progress report.',
      evidence: [
        { label: 'Paper', value: 'Cryo-EM of a membrane chaperone complex' },
        { label: 'DOI', value: '10.0000/fixture.0003' },
        { label: 'PMCID', value: 'none found' },
      ],
      options: ['approve', 'reject'],
    },
  ],

  log: [
    { id: 'l1', day: '2026-03-10', actor: 'bookkeeping', action: 'Froze R01GM000001', rule: 'Canceled grants freeze', reason: 'Grant appeared on the cancellation list.', refId: 'se1' },
    { id: 'l2', day: '2026-04-20', actor: 'bookkeeping', action: 'Kept R01GM000001 frozen', rule: 'Only a payment unfreezes', reason: 'Court order received, but a court order is not cash.', refId: 'se3' },
    { id: 'l3', day: '2026-06-10', actor: 'purchasing', action: 'Bought pipette tips ($380) on R21AI000002', rule: 'All rules pass, under card limit', reason: 'Every rule passed.', refId: 'rq3' },
    { id: 'l4', day: '2026-06-11', actor: 'bookkeeping', action: 'Held invoice inv1', rule: 'Invoice needs an open order', reason: 'Order o2 was canceled on 2026-03-02.', refId: 'inv1' },
    { id: 'l5', day: '2026-06-12', actor: 'purchasing', action: 'Rerouted agar plates to R01GM000001', rule: "Not in the grant's last 90 days", reason: 'R21AI000002 ends in 47 days.', refId: 'rq2' },
    { id: 'l6', day: '2026-06-13', actor: 'purchasing', action: 'Blocked espresso machine', rule: 'Category allowed', reason: 'General office items are unallowable.', refId: 'rq4' },
    { id: 'l7', day: '2026-06-14', actor: 'purchasing', action: 'Paused gloves for the grant manager', rule: 'Grant is active and not frozen', reason: 'R01GM000001 is frozen.', refId: 'rq1' },
  ],
}
