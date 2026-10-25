// T80: real questioned costs, each rebuilt as records in a fresh copy of
// sim/seed.json (today 2026-06-15). Every case quotes the saved audit report
// it comes from; eval/real-findings.mjs checks the quote is really there.
//
// A finding's plant(seed) adds `rf-` records and returns the answer-key cases
// that score them, in sim/answer-key.json's shape. Rebuilding keeps what the
// auditors objected to (the pattern, the category, the order of dates) and
// moves it onto the sim's grants and calendar. Two things are scaled, and
// each case says so: dollar limits (the sim's card limit is $5,000, so a
// split under another school's limit is scaled to it), and dates (an award
// "ending in 16 days" ends 16 days after the sim's today). Findings with no
// GrantGuard rule to test are listed with `outOfScope` instead of left out.
//
// Every finding also carries `decision`: what was finally decided about the
// cost, which is the ground truth the eval grades against (T88). An audit
// only questions a cost; the funder then decides in a resolution letter, and
// often allows much of what was questioned. Labels:
//   disallowed  the funder's letter disallowed it: GrantGuard should stop it
//   allowed     the funder's letter allowed it: a decoy GrantGuard should pass
//   partly      the funder allowed part of the finding without naming items
//   agreed      no funder decision saved, but the auditee agreed in the report
//   auditor     the auditor's finding only
// Each label but `auditor` quotes its saved source, checked like `quote`.

export const SOURCES_DIR = '../docs/research/sources/docs';

const TODAY = '2026-06-15';
const CLEAN = 'R01AI178875'; // active, ends 2028-07-31, $394,729 available
const OTHER = 'R01HL176691'; // active, ends 2028-11-30
const ENDING = 'R21AI182745'; // active, ends 2026-08-31: 77 days left

let n = 0;

function request(seed, r) {
  const row = {
    id: r.id, day: r.day ?? TODAY, requester: 'scientist', requesterName: r.requesterName ?? `Dr. Rf Requester ${++n}`,
    item: r.item, category: r.category, price: r.price, grantId: r.grantId ?? CLEAN, purpose: r.purpose,
    state: 'submitted', verdicts: [], explanation: 'Waiting for the purchasing agent.',
  };
  if (r.sharedWith) row.sharedWith = r.sharedWith;
  if (r.split) row.split = r.split;
  seed.requests.push(row);
  return row;
}

/** An earlier bought request and its order, for invoices to bill against. */
function order(seed, { id, vendor, amount, placed, item, grantId = CLEAN, state = 'open', category = 'equipment service' }) {
  seed.requests.push({
    id: `${id}-rq`, day: placed, requester: 'scientist', requesterName: 'Dr. Rf Requester', item, category, price: amount,
    grantId, purpose: item, state: 'bought', verdicts: [], explanation: 'Every rule passed, so I bought it.',
  });
  seed.orders.push({ id, requestId: `${id}-rq`, vendor, amount, placed, state });
}

function invoice(seed, { id, orderId, vendor, amount, received, state = 'matched', checked = false }) {
  const row = { id, orderId, vendor, amount, received, state, timeline: [{ day: received, what: `Invoice arrived ($${amount.toLocaleString('en-US')})` }] };
  if (state === 'matched') row.checked = checked;
  seed.invoices.push(row);
}

/** A grant whose period of performance ended on `end`, before the sim's today. */
function endedGrant(seed, id, end) {
  seed.grants.push({
    id, title: 'Rebuilt expired award (real-findings eval)', pi: 'Dr. Rf Investigator', agency: 'NIH / NIAID',
    awarded: 400000, received: 250000, spent: 250000, promised: 0, start: '2022-06-01', end, status: 'active', frozen: false,
  });
}

const purchase = (id, refId, grantId, expected, rule, why, extra = {}) =>
  ({ id, feature: 'purchases', kind: 'mistake', refId, grantId, expected, rule, why, check: `${refId} ${expected}; "${rule}" fails`, ...extra });
const purchaseDecoy = (id, refId, grantId, rule, why) =>
  ({ id, feature: 'purchases', kind: 'decoy', refId, grantId, expected: 'pass', rule, why, check: `"${rule}" passes on ${refId}` });
const invoiceCase = (id, refId, kind, rule, why, extra = {}) =>
  ({ id, feature: 'invoices', kind, refId, grantId: CLEAN, expected: kind === 'decoy' ? 'pass' : 'hold', rule, why, check: `${refId} ${kind === 'decoy' ? 'matched' : 'held'}`, ...extra });

const STOP = ['hold', 'block', 'reroute'];
const FREEZE = 'Grant is active and not frozen';
const END = "Not in the grant's last 90 days";
const SAME_DAY = 'Under the card limit, counting same-day purchases';
const SHARED = 'Shared cost split across the grants it serves';
const CATEGORY = 'Category allowed';
const BILLED = "An invoice is payable only if its order hasn't been billed already";
const AMOUNT = 'An invoice is payable only if its amount matches the approval';
const PLACED = 'An invoice is payable only if its order was placed before it';

export const FINDINGS = [
  // ---- Shared costs charged to one award ----
  {
    id: 'rf-01', file: 'nsf-oig-15-1-014-uwm.txt', auditee: 'Univ. of Wisconsin-Madison', year: '2015', amount: 70189,
    what: 'An underwater vehicle serving two NSF awards and a NOAA project was charged 68% to one award and 0% to NOAA.',
    quote: 'The total cost of this equipment was $71,015. Of this amount, $48,301 (68 percent) was',
    plant(seed) {
      request(seed, { id: 'rf-01', item: 'Autonomous underwater vehicle', category: 'equipment', price: 71015, grantId: CLEAN,
        purpose: 'Field surveys for both projects', sharedWith: [CLEAN, OTHER] });
      return [purchase('rf-01-c', 'rf-01', CLEAN, 'hold', SHARED, 'Serves two grants, charged to one with no split.', { alsoAccept: ['block'] })];
    },
  },
  {
    id: 'rf-02', file: 'nsf-oig-20-1-008-duke.txt', auditee: 'Duke University', year: '2020 (resolved 2023)', amount: 28719,
    what: 'Expenses benefiting several NSF awards were not allocated by benefit.',
    quote: 'NSF sustains the finding. The auditor questioned $28,719 on eight (8) NSF awards in Recommendations',
    plant(seed) {
      request(seed, { id: 'rf-02', item: 'Shared cluster service contract', category: 'equipment service', price: 4200, grantId: CLEAN,
        purpose: 'Compute for three projects', sharedWith: [CLEAN, OTHER, 'R01GM155497'] });
      return [purchase('rf-02-c', 'rf-02', CLEAN, 'hold', SHARED, 'Serves three grants, charged to one. Scaled: one $4,200 cost stands in for the $28,719 across eight awards.', { alsoAccept: ['block'] })];
    },
  },
  {
    id: 'rf-03', file: 'nsf-oig-22-6-002-promising-practices.txt', auditee: 'NSF OIG compendium (6 audits)', year: '2022', amount: null,
    what: 'Publication costs were charged 100% to one award when the paper credited several.',
    quote: 'Common Findings: Award recipients charged a single NSF award for 100',
    plant(seed) {
      request(seed, { id: 'rf-03', item: 'Open-access publication fee', category: 'publication', price: 3200, grantId: CLEAN,
        purpose: 'Paper acknowledging both projects', sharedWith: [CLEAN, OTHER] });
      request(seed, { id: 'rf-03-d', item: 'Open-access publication fee', category: 'publication', price: 3200, grantId: CLEAN,
        purpose: 'Paper acknowledging both projects', sharedWith: [CLEAN, OTHER], split: [{ grantId: CLEAN, share: 0.5 }, { grantId: OTHER, share: 0.5 }] });
      return [
        purchase('rf-03-c', 'rf-03', CLEAN, 'hold', SHARED, 'A two-grant paper\'s fee charged 100% to one.', { alsoAccept: ['block'] }),
        purchaseDecoy('rf-03-d', 'rf-03-d', CLEAN, SHARED, 'The same fee split between the two grants the paper credits.'),
      ];
    },
  },
  {
    id: 'rf-04', file: 'nsf-oig-21-1-016-southcarolina.txt', auditee: 'Univ. of South Carolina', year: '2021', amount: 4271,
    what: '70% of digestion bombs shipped 7 days before award end was charged to it, with no support for the split.',
    quote: '1,460 days). UofSC could not provide support for the allocation methodology, and given',
    plant(seed) {
      request(seed, { id: 'rf-04', item: 'Six acid digestion bombs', category: 'lab equipment', price: 6101, grantId: ENDING,
        purpose: 'Sample digestion for both projects', sharedWith: [ENDING, CLEAN], split: [{ grantId: ENDING, share: 0.7 }, { grantId: CLEAN, share: 0.3 }] });
      return [purchase('rf-04-c', 'rf-04', ENDING, 'hold', SHARED, 'A 70/30 split with nothing behind it, on a grant near its end. GrantGuard takes a stated split at its word.', { alsoAccept: ['block', 'reroute'] })];
    },
  },
  {
    id: 'rf-05', file: 'nsf-oig-17-1-009-usc.txt', auditee: 'Univ. of Southern California', year: '2017', amount: 6434,
    what: 'Lab supplies ordered the month before expiration were charged to it while used on two other awards.',
    quote: 'Lab supplies, totaling $6,434, were ordered in August 2013, and',
    plant(seed) {
      request(seed, { id: 'rf-05', item: 'Lab supplies', category: 'lab supplies', price: 6434, grantId: ENDING,
        purpose: 'Stock for the lab', sharedWith: [ENDING, CLEAN] });
      return [purchase('rf-05-c', 'rf-05', ENDING, 'reroute', END, 'Supplies on a grant 77 days from its end, also serving another grant.', { alsoAccept: ['hold', 'block'] })];
    },
  },

  // ---- Supplies near the end of an award ----
  {
    id: 'rf-06', file: 'nsf-oig-21-1-016-southcarolina.txt', auditee: 'Univ. of South Carolina', year: '2021', amount: 4620,
    what: 'A tablet and phone ordered 43 days before award end were charged 100% to it.',
    quote: 'The tablet and phone were available for 3 percent of the award period (43 out of 1,245',
    plant(seed) {
      request(seed, { id: 'rf-06', item: 'Tablet and phone', category: 'computing equipment', price: 4620, grantId: ENDING, purpose: 'Field data entry' });
      return [purchase('rf-06-c', 'rf-06', ENDING, 'hold', END, 'Devices bought 77 days before the grant ends, used for a few percent of it.', { alsoAccept: STOP })];
    },
  },
  {
    id: 'rf-07', file: 'nsf-oig-17-1-009-usc.txt', auditee: 'Univ. of Southern California', year: '2017', amount: 2466,
    what: 'Cell phones bought in the last month of a 4-year award were charged 100% to it.',
    quote: 'Cell phones from Amazon were purchased for $2,466 in the last',
    plant(seed) {
      request(seed, { id: 'rf-07', item: 'Cell phones from Amazon', category: 'computing equipment', price: 2466, grantId: ENDING, purpose: 'Lab phones' });
      return [purchase('rf-07-c', 'rf-07', ENDING, 'hold', END, 'Phones bought 77 days before the grant ends.', { alsoAccept: STOP })];
    },
  },
  {
    id: 'rf-08', file: 'nsf-oig-17-1-009-usc.txt', auditee: 'Univ. of Southern California', year: '2017', amount: 31375,
    what: 'A computer installed 15 days before award end was charged in full.',
    quote: 'A computer, totaling $31,375, was installed 15 days prior to the',
    plant(seed) {
      request(seed, { id: 'rf-08', item: 'Workstation computer', category: 'computing equipment', price: 31375, grantId: ENDING, purpose: 'Data analysis' });
      return [purchase('rf-08-c', 'rf-08', ENDING, 'hold', END, 'A computer bought 77 days before the grant ends.', { alsoAccept: STOP })];
    },
  },

  // ---- Bought after the award ended ----
  {
    id: 'rf-09', file: 'nsf-oig-15-1-014-uwm.txt', auditee: 'Univ. of Wisconsin-Madison', year: '2015', amount: 20816,
    what: 'Equipment was ordered, invoiced and posted after the award ended.',
    quote: '$20,816 of expenses incurred to purchase equipment that would provide measurements in',
    plant(seed) {
      endedGrant(seed, 'R21AI000901', '2026-06-07');
      request(seed, { id: 'rf-09', item: 'Measurement equipment', category: 'equipment', price: 20816, grantId: 'R21AI000901', purpose: 'Measurements for the project' });
      return [purchase('rf-09-c', 'rf-09', 'R21AI000901', 'hold', FREEZE, 'Ordered 8 days after the grant ended.', { alsoAccept: STOP })];
    },
  },
  {
    id: 'rf-10', file: 'nsf-oig-15-1-014-uwm.txt', auditee: 'Univ. of Wisconsin-Madison', year: '2015', amount: 17017,
    what: 'Computers were charged to an expired award; a requisition dated before the end did not count as a commitment.',
    quote: '$17,017 of expenses incurred to purchase computer equipment. The invoice supporting this',
    plant(seed) {
      endedGrant(seed, 'R21AI000902', '2026-06-13');
      request(seed, { id: 'rf-10', day: '2026-06-09', item: 'Computer equipment', category: 'computing equipment', price: 17017, grantId: 'R21AI000902', purpose: 'Analysis computers' });
      return [purchase('rf-10-c', 'rf-10', 'R21AI000902', 'hold', FREEZE, 'Requested 4 days before the end, still unbought 2 days after.', { alsoAccept: STOP })];
    },
  },
  {
    id: 'rf-11', file: 'nsf-oig-19-1-006-minnesota.txt', auditee: 'Univ. of Minnesota', year: '2019', amount: 56397,
    what: 'A motion capture system bought the day after the award expired was charged to it.',
    quote: 'we questioned $56,397 of costs associated with the capital equipment purchase.',
    plant(seed) {
      endedGrant(seed, 'R21AI000903', '2026-06-14');
      request(seed, { id: 'rf-11', item: 'Motion capture system', category: 'equipment', price: 56397, grantId: 'R21AI000903', purpose: 'Gait studies' });
      return [purchase('rf-11-c', 'rf-11', 'R21AI000903', 'hold', FREEZE, 'Bought the day after the grant ended.', { alsoAccept: STOP })];
    },
  },
  {
    id: 'rf-12', file: 'nsf-oig-21-1-016-southcarolina.txt', auditee: 'Univ. of South Carolina', year: '2021', amount: 13680,
    what: 'Tube assemblies were bought and received 1.5 months after the award expired.',
    quote: 'The equipment was purchased and received 1.5 months after the award expiration',
    plant(seed) {
      endedGrant(seed, 'R21AI000904', '2026-05-01');
      request(seed, { id: 'rf-12', item: 'Tube assemblies', category: 'equipment', price: 13680, grantId: 'R21AI000904', purpose: 'Instrument upgrade' });
      return [purchase('rf-12-c', 'rf-12', 'R21AI000904', 'hold', FREEZE, 'Bought 45 days after the grant ended.', { alsoAccept: STOP })];
    },
  },
  {
    id: 'rf-13', file: 'nsf-oig-17-1-009-usc.txt', auditee: 'Univ. of Southern California', year: '2017', amount: 106069,
    what: 'Equipment for an instrumentation award was received after it expired and charged to it.',
    quote: 'Equipment, totaling $106,069, was unreasonably charged to the',
    plant(seed) {
      endedGrant(seed, 'R21AI000905', '2026-06-10');
      request(seed, { id: 'rf-13', item: 'Instrumentation equipment', category: 'equipment', price: 106069, grantId: 'R21AI000905', purpose: 'Instrument build' });
      return [purchase('rf-13-c', 'rf-13', 'R21AI000905', 'hold', FREEZE, 'Bought after the grant ended.', { alsoAccept: STOP })];
    },
  },

  // ---- Spending on canceled funds ----
  {
    id: 'rf-14', file: 'nsf-oig-20-1-008-duke.txt', auditee: 'Duke University', year: '2020 (resolved 2023)', amount: 29892,
    what: "Costs were charged after the award's funds were canceled, though the project end date was later.",
    quote: 'NSF sustains the finding. The auditors questioned costs of $29,892 on two (2) awards related to',
    plant(seed) {
      request(seed, { id: 'rf-14', item: 'Sequencing service', category: 'core facility services', price: 2900, grantId: 'R01GM061721',
        purpose: 'Membrane protein work', requesterName: 'Dr. Rf Duke' });
      return [purchase('rf-14-c', 'rf-14', 'R01GM061721', 'hold', FREEZE, 'R01GM061721 was canceled and has had no payment since the court restored it; its end date is 2027.', { alsoAccept: ['block', 'reroute'] })];
    },
  },

  // ---- Unallowable items ----
  {
    id: 'rf-15', file: 'nsf-oig-17-1-009-usc.txt', auditee: 'Univ. of Southern California', year: '2017', amount: 46,
    what: "Alcohol in an employee's conference reimbursement was charged to an NSF award.",
    quote: 'Of the $517 expenses in question, $46 related to unallowable alcohol expenses charged to',
    plant(seed) {
      request(seed, { id: 'rf-15', item: 'Conference dinner drinks', category: 'alcohol', price: 46, purpose: 'Conference travel' });
      return [purchase('rf-15-c', 'rf-15', CLEAN, 'block', CATEGORY, 'Alcohol is unallowable on a federal award.')];
    },
  },
  {
    id: 'rf-16', file: 'nsf-oig-19-1-006-minnesota.txt', auditee: 'Univ. of Minnesota', year: '2019', amount: 257,
    what: 'Alcohol at a workshop was charged to an NSF award.',
    quote: '$257, related to a workshop under NSF Award No.',
    plant(seed) {
      request(seed, { id: 'rf-16', item: 'Workshop reception wine', category: 'alcohol', price: 257, purpose: 'Project workshop' });
      return [purchase('rf-16-c', 'rf-16', CLEAN, 'block', CATEGORY, 'Alcohol is unallowable on a federal award.')];
    },
  },
  {
    id: 'rf-17', file: 'wa-auditor-2013-pcard.txt', auditee: 'Univ. of Washington', year: '2013', amount: 118146,
    what: 'University cards were used for alcohol and liquor licenses (state funds).',
    quote: 'found UW spent $118,146 for purchases that included alcohol or liquor licenses.',
    plant(seed) {
      request(seed, { id: 'rf-17', item: 'Wine for a donor event', category: 'alcohol', price: 1200, purpose: 'Lab open house' });
      return [purchase('rf-17-c', 'rf-17', CLEAN, 'block', CATEGORY, 'Alcohol on a grant. Scaled: one $1,200 purchase.')];
    },
  },
  {
    id: 'rf-18', file: 'nsf-oig-21-1-016-southcarolina.txt', auditee: 'Univ. of South Carolina', year: '2021', amount: 180,
    what: 'General cleaning supplies were charged to an NSF award.',
    quote: 'for the purchase of general purpose cleaning supplies.',
    plant(seed) {
      request(seed, { id: 'rf-18', item: 'General purpose cleaning supplies', category: 'general office', price: 123, purpose: 'Office cleaning' });
      return [purchase('rf-18-c', 'rf-18', CLEAN, 'block', CATEGORY, 'General-purpose costs belong in overhead. The requester picks the category; filed as lab supplies, this would pass.')];
    },
  },

  // ---- Split purchases (scaled to the $5,000 card limit) ----
  {
    id: 'rf-19', file: 'ct-apa-2025-scsu-fy2021-2022.txt', auditee: 'Southern Connecticut State Univ.', year: '2025 (FY21-22)', amount: 3792,
    what: 'Four same-day orders with one vendor, split to stay under the $2,500 limit.',
    quote: 'orders for $1,038, $910, $1,377, and $467 (totaling $3,792)',
    plant(seed) {
      const who = 'Dr. Rf Scsu';
      [2076, 1820, 2754, 934].forEach((price, i) => request(seed, { id: `rf-19${'abcd'[i]}`, item: `Lab equipment order ${i + 1}`, category: 'lab equipment', price, purpose: 'Lab setup', requesterName: who }));
      request(seed, { id: 'rf-19-d1', day: '2026-06-15', item: 'Instrument part', category: 'lab equipment', price: 2500, purpose: 'Repair', requesterName: 'Dr. Rf Near Miss' });
      request(seed, { id: 'rf-19-d2', day: '2026-06-15', item: 'Instrument part', category: 'lab equipment', price: 2500, purpose: 'Repair', requesterName: 'Dr. Rf Near Miss' });
      return [
        purchase('rf-19-c', 'rf-19c', CLEAN, 'hold', SAME_DAY, 'Scaled 2x to the $5,000 limit: $2,076 + $1,820 + $2,754 + $934 = $7,584, each under the limit.', { relatedIds: ['rf-19a', 'rf-19b', 'rf-19d'] }),
        purchaseDecoy('rf-19-d', 'rf-19-d2', CLEAN, SAME_DAY, 'Two same-day parts totaling exactly $5,000, which the limit allows.'),
      ];
    },
  },
  {
    id: 'rf-20', file: 'ma-osa-2018-umass-amherst-procard-dovetail.txt', auditee: 'UMass Amherst', year: '2018', amount: 6204,
    what: 'Same-vendor, same-day Procard purchases went over the $1,000 single-purchase limit.',
    quote: 'These transactions totaled $19,204, $6,204 of which was over the cardholders’',
    plant(seed) {
      const who = 'Dr. Rf Umass';
      [3100, 2900].forEach((price, i) => request(seed, { id: `rf-20${'ab'[i]}`, item: `Invoice ${i + 1}, same vendor`, category: 'equipment service', price, purpose: 'Freezer repair', requesterName: who }));
      return [purchase('rf-20-c', 'rf-20b', CLEAN, 'hold', SAME_DAY, 'Scaled 5x to the $5,000 limit: one repair billed as $3,100 + $2,900 the same day.', { relatedIds: ['rf-20a'] })];
    },
  },
  {
    id: 'rf-21', file: 'nsf-oig-25-06-001-pcard-risk.txt', auditee: 'NSF (agency card program)', year: '2025', amount: 30000,
    what: 'Tested card transactions were improper split purchases (a federal agency, not a university).',
    quote: 'high-risk transactions we tested were improper split purchases totaling $30,000.',
    plant(seed) {
      const who = 'Dr. Rf Agency';
      [4000, 3500].forEach((price, i) => request(seed, { id: `rf-21${'ab'[i]}`, item: `Software licenses, part ${i + 1}`, category: 'software', price, purpose: 'Analysis software', requesterName: who }));
      return [purchase('rf-21-c', 'rf-21b', CLEAN, 'hold', SAME_DAY, 'Scaled to the $5,000 limit (from $10,000): one purchase split into $4,000 + $3,500.', { relatedIds: ['rf-21a'] })];
    },
  },

  // ---- Invoices ----
  {
    id: 'rf-22', file: 'tx-cpa-2021-multi-agency-duplicate-payments.txt', auditee: 'Texas agencies incl. UNT', year: '2020', amount: 56542.24,
    what: 'Auditors found 61 duplicate purchase and travel payments.',
    quote: 'purchase and travel payments totaling $56,542.24. See Table 3.',
    plant(seed) {
      order(seed, { id: 'rf-22-o', vendor: 'Fisher Scientific', amount: 431, placed: '2026-05-20', item: 'Centrifuge tubes', state: 'paid' });
      invoice(seed, { id: 'rf-22-i1', orderId: 'rf-22-o', vendor: 'Fisher Scientific', amount: 431, received: '2026-05-26', state: 'paid' });
      invoice(seed, { id: 'rf-22', orderId: 'rf-22-o', vendor: 'Fisher Scientific', amount: 431, received: '2026-06-12' });
      return [invoiceCase('rf-22-c', 'rf-22', 'mistake', BILLED, "UNT's $431 duplicate: a second bill for an order already paid.", { relatedIds: ['rf-22-i1', 'rf-22-o'] })];
    },
  },
  {
    id: 'rf-23', file: 'fac-single-audit-findings.txt', auditee: 'Saint Louis University', year: 'FY2021', amount: 1045,
    what: 'A subrecipient invoice and its indirect costs were charged to the grant twice.',
    quote: 'Workday. Additionally, this subrecipient invoice was erroneously paid twice and indirect costs in',
    plant(seed) {
      order(seed, { id: 'rf-23-o', vendor: 'Partner University', amount: 690, placed: '2026-04-01', item: 'Subaward services, Q1', state: 'paid', category: 'subaward' });
      invoice(seed, { id: 'rf-23-i1', orderId: 'rf-23-o', vendor: 'Partner University', amount: 690, received: '2026-04-30', state: 'paid' });
      invoice(seed, { id: 'rf-23', orderId: 'rf-23-o', vendor: 'Partner University', amount: 690, received: '2026-06-10' });
      return [invoiceCase('rf-23-c', 'rf-23', 'mistake', BILLED, 'The same $690 subrecipient invoice, billed again.', { relatedIds: ['rf-23-i1', 'rf-23-o'] })];
    },
  },
  {
    id: 'rf-24', file: 'tx-cpa-2023-uhv-post-payment-audit.txt', auditee: 'Univ. of Houston-Victoria', year: '2023', amount: 46600,
    what: 'A $46,600 payment was made against a $14,000 contract with no amendment.',
    quote: 'established contract; however, the existing contract’s value of $14,000 did not support',
    plant(seed) {
      order(seed, { id: 'rf-24-o', vendor: 'Facilities Contractor', amount: 14000, placed: '2026-03-02', item: 'Instrument room renovation' });
      seed.approvals.push({ id: 'rf-24-ap', orderId: 'rf-24-o', amount: 14000, by: 'grant_manager', day: '2026-03-02' });
      invoice(seed, { id: 'rf-24', orderId: 'rf-24-o', vendor: 'Facilities Contractor', amount: 46600, received: '2026-06-11' });
      order(seed, { id: 'rf-24-od', vendor: 'Facilities Contractor', amount: 14000, placed: '2026-03-02', item: 'Second room renovation' });
      seed.approvals.push({ id: 'rf-24-apd', orderId: 'rf-24-od', amount: 14000, by: 'grant_manager', day: '2026-03-02' });
      invoice(seed, { id: 'rf-24-d', orderId: 'rf-24-od', vendor: 'Facilities Contractor', amount: 14000, received: '2026-06-11' });
      return [
        invoiceCase('rf-24-c', 'rf-24', 'mistake', AMOUNT, 'Billed $46,600 against a $14,000 approval.', { relatedIds: ['rf-24-ap'] }),
        invoiceCase('rf-24-dc', 'rf-24-d', 'decoy', AMOUNT, 'The same contract billed at its approved $14,000.'),
      ];
    },
  },
  {
    id: 'rf-25', file: 'ct-apa-2025-scsu-fy2021-2022.txt', auditee: 'Southern Connecticut State Univ.', year: '2025 (FY21-22)', amount: 7400,
    what: 'A $7,400 purchase requisition and order were approved 31 days after the invoice.',
    quote: 'The university approved one $7,400 purchase requisition and order 31 days after the invoice.',
    plant(seed) {
      order(seed, { id: 'rf-25-o', vendor: 'Event Services', amount: 7400, placed: '2026-06-12', item: 'Symposium services' });
      seed.approvals.push({ id: 'rf-25-ap', orderId: 'rf-25-o', amount: 7400, by: 'grant_manager', day: '2026-06-12' });
      invoice(seed, { id: 'rf-25', orderId: 'rf-25-o', vendor: 'Event Services', amount: 7400, received: '2026-05-12' });
      return [invoiceCase('rf-25-c', 'rf-25', 'mistake', PLACED, 'The order was placed 31 days after its invoice.', { relatedIds: ['rf-25-o'] })];
    },
  },
  {
    id: 'rf-26', file: 'nsf-oig-21-1-016-southcarolina.txt', auditee: 'Univ. of South Carolina', year: '2021', amount: 1222,
    what: 'A ticket booked under the wrong name was replaced, and both flights were charged to the award.',
    quote: 'another ticket. Both flights were inappropriately charged to the NSF award.',
    plant(seed) {
      order(seed, { id: 'rf-26-o1', vendor: 'Airline', amount: 611, placed: '2026-06-01', item: 'Flight to field site', category: 'travel' });
      order(seed, { id: 'rf-26-o2', vendor: 'Airline', amount: 611, placed: '2026-06-02', item: 'Flight to field site (rebooked)', category: 'travel' });
      invoice(seed, { id: 'rf-26-i1', orderId: 'rf-26-o1', vendor: 'Airline', amount: 611, received: '2026-06-03' });
      invoice(seed, { id: 'rf-26', orderId: 'rf-26-o2', vendor: 'Airline', amount: 611, received: '2026-06-04' });
      return [invoiceCase('rf-26-c', 'rf-26', 'mistake', BILLED, 'The same trip bought twice as two orders. Each invoice matches its own order.', { relatedIds: ['rf-26-i1'] })];
    },
  },

  // ---- Progress reports ----
  {
    id: 'rf-27', file: 'nsf-oig-22-6-002-promising-practices.txt', auditee: 'NSF OIG compendium', year: '2022', amount: null,
    what: 'Awardees charged NSF to publish papers that did not credit the award charged.',
    quote: 'Common Findings: Award recipients charged NSF for costs incurred to publish',
    // Already planted in the seed: p-10 is listed on R21AI182745, whose
    // publication fee it paid, but credits R01GM061721.
    plant: () => [{
      id: 'rf-27-c', feature: 'reports', kind: 'mistake', refId: 'p-10', grantId: 'R21AI182745', expected: 'hold',
      rule: 'A listed paper must credit the grant whose report lists it', check: 'p-10 held',
      why: "The seed's p-10: its fee was charged to R21AI182745, its acknowledgments credit R01GM061721.",
    }],
  },

  // ---- Out of scope: no GrantGuard rule tests these ----
  {
    id: 'rf-28', file: 'nsf-oig-17-1-009-usc.txt', auditee: 'Univ. of Southern California', year: '2017', amount: 1863,
    what: 'Conference travel was posted 15 months after the trip and 8 months after the award expired.',
    quote: 'were posted 15 months after the travel end date and eight months after award expiration,',
    outOfScope: 'Travel reimbursements and their posting dates are not modeled.',
  },
  {
    id: 'rf-29', file: 'nsf-oig-19-1-006-minnesota.txt', auditee: 'Univ. of Minnesota', year: '2019', amount: 5675,
    what: 'Estimated future publication costs were charged to an expired award with no invoice.',
    quote: 'the grant was charged based on an estimate and not based on',
    outOfScope: 'GrantGuard charges a grant only through request, order and invoice; it has no journal entries to test.',
  },
  {
    id: 'rf-30', file: 'nsf-oig-21-1-016-southcarolina.txt', auditee: 'Univ. of South Carolina', year: '2021', amount: 3685,
    what: 'A drone bought on the wrong account was moved onto the award 165 days after it expired.',
    quote: 'until 165 days after expiration.',
    outOfScope: 'Cost transfers between accounts are not modeled (the report checker only proposes moves).',
  },
  {
    id: 'rf-31', file: 'nsf-oig-17-1-002-ucdavis.txt', auditee: 'UC Davis', year: '2018 (resolved)', amount: 69545,
    what: 'Cost transfers onto NSF awards were not allocable.',
    quote: 'The University concurred that $69,545 was not allocable to the',
    outOfScope: 'Cost transfers between accounts are not modeled.',
  },
  {
    id: 'rf-32', file: 'fac-single-audit-findings.txt', auditee: 'Saint Louis University', year: 'FY2023', amount: 246869,
    what: '75 of 119 cost transfers were made 91 to 1,002 days after the original charge.',
    quote: 'transactions sampled cost transfers (totaling $246,869 positive and $66,004 negative) where the',
    outOfScope: 'Cost transfers are not modeled; the report checker counts the 90 days only for the moves it proposes.',
  },
  {
    id: 'rf-33', file: 'usao-ct-2008-yale-grants-settlement.txt', auditee: 'Yale University', year: '2008', amount: 7600000,
    what: 'Charges were allegedly moved onto grants near expiration to spend down remaining funds.',
    quote: 'wrongful transfers when the federal grant was near its expiration date and they needed to spend',
    outOfScope: 'Cost transfers are not modeled. New supply purchases in a grant\'s last 90 days are (rf-05).',
  },
  {
    id: 'rf-34', file: 'nsf-oig-21-1-016-southcarolina.txt', auditee: 'Univ. of South Carolina', year: '2021', amount: 7276,
    what: 'Materials charged to the wrong award stayed in claimed costs until the audit.',
    quote: 'award, 803 days after the final reimbursement was requested through ACM$.',
    outOfScope: 'Nothing in the records says which award the materials served; only a person could tell.',
  },
  {
    id: 'rf-35', file: 'fac-single-audit-findings.txt', auditee: 'Pomona College', year: 'FY2022', amount: 16588,
    what: 'Stipends for summer work not yet done were charged before year-end.',
    quote: 'Management charged nonpayroll expenses that had not been incurred as of year-end',
    outOfScope: 'Untested: payment requests claim only bought purchases and past payroll, but no case here plants future stipends.',
  },
  {
    id: 'rf-36', file: 'nc-auditor-2024-fayetteville-state-pcard.txt', auditee: 'Fayetteville State Univ.', year: '2024', amount: 13650,
    what: 'P-cards were used for item types the university prohibits on the card.',
    quote: '17 purchases totaling $13,650 were for various items which were unallowable per',
    outOfScope: 'The report does not say which items, so there is nothing specific to rebuild.',
  },
  {
    id: 'rf-37', file: 'doj-university-grant-settlements.txt', auditee: 'Yale School of Medicine', year: '2021-2022', amount: 40504200,
    what: 'A finance director split fraudulent orders to stay below the $10,000 approval threshold.',
    quote: 'broke up the fraudulent purchases into orders below the $10,000 threshold that would require',
    outOfScope: 'Insider fraud by the person who approves. The same-day split rule only sees one person\'s orders on one day (rf-19).',
  },
  {
    id: 'rf-38', file: 'doj-university-grant-settlements.txt', auditee: 'Stony Brook Univ.', year: '2020', amount: 200000,
    what: 'A PI paid sham companies, partly from NIH funds, for goods never received.',
    quote: 'payment to the sham companies for equipment, goods and services that were never received or',
    outOfScope: 'GrantGuard does not check receipt of goods or who owns a vendor.',
  },
  {
    id: 'rf-39', file: 'nsf-oig-15-1-014-uwm.txt', auditee: 'Univ. of Wisconsin-Madison', year: '2015', amount: 1276668,
    what: "Senior salary above NSF's two-month limit.",
    quote: 'the auditors questioned $1,276,668 in senior personnel salary that exceeded NSF’s two-month',
    outOfScope: 'NSF\'s two-month salary rule is not modeled; GrantGuard checks only effort above 100%.',
  },
  {
    id: 'rf-40', file: 'hhs-oig-2024-a-04-20-03583-nymc-summary.txt', auditee: 'New York Medical College', year: '2024', amount: 7469306,
    what: 'Salaries were claimed from budget estimates rather than actual effort.',
    quote: 'instead of actual activity to claim $7.5 million in salaries, fringe benefits, and indirect costs.',
    outOfScope: 'Payroll rows are taken as given; nothing compares claimed effort with actual work.',
  },

  // ---- Costs the funder allowed: decoys GrantGuard should pass ----
  {
    id: 'rf-41', file: 'nsf-oig-17-1-002-ucdavis-report.txt', auditee: 'UC Davis', year: '2017 (resolved 2018)', amount: 53719,
    what: 'Equipment bought two to four months before the award ended, questioned by the auditors and allowed by NSF.',
    quote: 'We also questioned $53,719 for three equipment purchases in March and May 2008.',
    plant(seed) {
      request(seed, { id: 'rf-41', item: 'Imaging test facility components', category: 'equipment', price: 4800, grantId: ENDING, purpose: 'Assemble the imaging test facility' });
      return [purchaseDecoy('rf-41-dc', 'rf-41', ENDING, END, 'Equipment 77 days before the grant ends, which NSF allowed. Scaled: one $4,800 purchase stands in for three totaling $53,719, under the sim\'s $5,000 card limit.')];
    },
  },
  {
    id: 'rf-42', file: 'nsf-oig-17-1-002-ucdavis-report.txt', auditee: 'UC Davis', year: '2017 (resolved 2018)', amount: 131789,
    what: 'Equipment ordered during the award and accepted after it expired, questioned by the auditors and allowed by NSF.',
    quote: 'We found that the university charged $131,789 for equipment that had final acceptance on May 1,',
    plant(seed) {
      endedGrant(seed, 'R21AI000906', '2026-04-30');
      order(seed, { id: 'rf-42-o', vendor: 'Imaging Systems Vendor', amount: 131789, placed: '2026-03-20', item: 'Imaging test equipment', grantId: 'R21AI000906', category: 'equipment' });
      seed.approvals.push({ id: 'rf-42-ap', orderId: 'rf-42-o', amount: 131789, by: 'grant_manager', day: '2026-03-20' });
      invoice(seed, { id: 'rf-42', orderId: 'rf-42-o', vendor: 'Imaging Systems Vendor', amount: 131789, received: '2026-06-10' });
      return [invoiceCase('rf-42-dc', 'rf-42', 'decoy', AMOUNT, 'Ordered and approved before the grant ended, billed after; NSF allowed it.', { grantId: 'R21AI000906' })];
    },
  },
];

const LETTER = {
  uwm: 'nsf-resolution-15-1-014-uwm.txt',
  usc: 'nsf-resolution-17-1-009-usc.txt',
  umn: 'nsf-resolution-19-1-006-minnesota.txt',
  ucd: 'nsf-oig-17-1-002-ucdavis.txt',
  duke: 'nsf-oig-20-1-008-duke.txt',
};
const USC_1 = { label: 'partly', file: LETTER.usc, quote: 'It is NSF’s management decision to disallow $13,284 and to allow $291,006.' };
const UMN = { label: 'disallowed', file: LETTER.umn, quote: 'NSF’s management decision is to disallow all questioned costs in the amount of $73,260.' };
const UWM_4 = { label: 'disallowed', file: LETTER.uwm, quote: 'NSF determined that expenses for purchase orders placed after the award expiration date are unallowable and disallowed the entire $56,965.' };
const UCD_1 = {
  label: 'allowed', file: LETTER.ucd,
  quote: 'equipment purchases were necessary and reasonable for the completion of the corresponding awards. It is NSF’s management decision to disallow $4,393 and to allow $378,253.',
  note: 'NSF disallowed $4,393 of the finding in all, less than either purchase; the letter ties it to an item whose cost could not be documented, which matches the report\'s $8,786 valve.',
};
const SC = {
  label: 'agreed', quote: 'UofSC agreed with the findings in the report.',
  note: 'No NSF resolution letter for 21-1-016 is listed on nsf.gov/awards/audit-responses (checked 2026-10-24).',
};

/** What was finally decided about each finding; anything not listed is `auditor`. */
const DECISIONS = {
  'rf-01': { label: 'disallowed', file: LETTER.uwm, quote: 'Therefore, NSF has disallowed the entire $70,189 in questioned costs.' },
  'rf-02': { label: 'disallowed', file: LETTER.duke, quote: 'Corrective Action: NSF requires Duke to repay disallowed questioned costs of $28,719.' },
  'rf-04': SC,
  'rf-05': { ...USC_1, note: 'NSF allowed 96% of this finding as necessary and reasonable; whether these $6,434 of supplies were in the $13,284 it disallowed is not stated.' },
  'rf-06': SC,
  'rf-07': { ...USC_1, note: 'NSF allowed 96% of this finding as necessary and reasonable; whether these $2,466 of phones were in the $13,284 it disallowed is not stated.' },
  'rf-08': { ...USC_1, note: 'NSF disallowed $13,284 of the finding in all, so at least $18,091 of this $31,375 computer was allowed.' },
  'rf-09': UWM_4,
  'rf-10': UWM_4,
  'rf-11': UMN,
  'rf-12': SC,
  'rf-13': { ...USC_1, note: 'NSF disallowed $13,284 of the finding in all, so at least $92,785 of this $106,069 of equipment was allowed.' },
  'rf-14': { label: 'disallowed', file: LETTER.duke, quote: 'NSF’s management decision is to sustain and disallow $29,892.' },
  'rf-15': { label: 'disallowed', file: LETTER.usc, quote: 'NSF determined that all questioned costs, with the exception of alcohol, were allowable costs upon reclassification to the correct accounts. It is NSF’s management decision to disallow $46' },
  'rf-16': UMN,
  'rf-18': SC,
  'rf-26': SC,
  'rf-28': { label: 'allowed', file: LETTER.usc, quote: 'NSF does not sustain the finding. NSF determined that the posting of the travel expenses did not violate USC’s travel policy.' },
  'rf-29': UMN,
  'rf-30': SC,
  'rf-31': { label: 'disallowed', file: LETTER.ucd, quote: 'It is NSF’s management decision to disallow $69,545' },
  'rf-34': SC,
  'rf-39': { label: 'allowed', file: LETTER.uwm, quote: 'it is the NSF management decision that the $1,276,668 questioned as excess senior salaries are allowable costs' },
  'rf-41': UCD_1,
  'rf-42': UCD_1,
};
for (const f of FINDINGS) f.decision = DECISIONS[f.id] ?? { label: 'auditor' };
