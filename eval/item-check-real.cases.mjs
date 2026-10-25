// T115: real items for the item-check eval (eval/item-check-real.mjs). Each
// item is one purchase from a saved audit report or funder letter in
// docs/research/sources/docs/, asked the way a scientist would ask Ask: the
// item as the report describes it, its price, and the stated purpose when the
// report gives one (blank otherwise). Nothing is invented: `quote` is the
// report's own text about the item, and the eval checks it is in `file`.
//
// expect: 'flag' for an item a grant couldn't pay for; 'fine' for a real
// research cost (a decoy) that should pass.
// decision.label, the ground truth, says who decided:
//   disallowed  the funder's letter disallowed it            (expect flag)
//   allowed     the funder's letter allowed it               (expect fine)
//   agreed      the auditee agreed in the report             (either)
//   auditor     the auditor alone: questioned it (flag), or withdrew the
//               question after seeing the documents (fine)
// Each label but a bare `auditor` quotes its saved source (decision.file, or
// the item's own file).
//
// category: the kind of thing the item is, from CHECK_CATEGORIES
// (agents/src/prompts/purchasing.ts); a list when more than one fits.
//
// Only items the check is meant to judge are here: is this kind of thing a
// research cost at all? Findings about timing, splits, documentation or
// amounts are in OUT_OF_SCOPE.

export const SOURCES_DIR = '../docs/research/sources/docs';

const LETTER = {
  usc: 'nsf-resolution-17-1-009-usc.txt',
  umn: 'nsf-resolution-19-1-006-minnesota.txt',
  ucd: 'nsf-oig-17-1-002-ucdavis.txt',
  nyu: 'nsf-resolution-14-1-001-nyu.txt',
  umich: 'nsf-resolution-16-1-023-michigan.txt',
  wyo: 'nsf-resolution-21-1-003-wyoming.txt',
  ucb: 'nsf-resolution-15-1-012-ucberkeley.txt',
  osu: 'nsf-resolution-19-1-016-ohiostate.txt',
  utaustin: 'nsf-resolution-19-1-012-utaustin.txt',
  uf: 'nsf-resolution-15-1-004-uflorida.txt',
  nas: 'nsf-resolution-18-1-005-nas.txt',
  kucr18: 'nsf-resolution-18-1-001-kucr.txt',
  kucr21: 'nsf-resolution-21-1-001-kucr-epscor.txt',
  asu: 'nsf-resolution-19-1-007-asu.txt',
};

const UOFSC_AGREED = { label: 'agreed', quote: 'UofSC concurred with all $20,883 of the questioned costs' };
const UCD_WORKSHOPS_ALLOWED = {
  label: 'allowed', file: LETTER.ucd,
  quote: 'NSF determined that $33,083 was allowable because invoices confirmed the allowability of total costs for the workshops and conferences',
};

export const ITEMS = [
  // ── Unallowable items (expect flag) ──────────────────────────────────────
  {
    id: 'ic-01', file: 'nsf-oig-17-1-009-usc.txt', auditee: 'Univ. of Southern California', year: '2017',
    item: 'Alcohol on a conference trip reimbursement', price: 46, purpose: 'Employee attending a conference in California',
    category: 'alcohol', expect: 'flag',
    quote: 'Of the $517 expenses in question, $46 related to unallowable alcohol expenses charged to the award.',
    decision: { label: 'disallowed', file: LETTER.usc, quote: 'NSF determined that all questioned costs, with the exception of alcohol, were allowable costs upon reclassification to the correct accounts. It is NSF’s management decision to disallow $46' },
  },
  {
    id: 'ic-02', file: 'nsf-oig-19-1-006-minnesota.txt', auditee: 'Univ. of Minnesota', year: '2019',
    item: 'Alcohol for a project workshop', price: 257, purpose: 'Workshop under the NSF award',
    category: 'alcohol', expect: 'flag',
    quote: '$257, related to a workshop under NSF Award No.',
    decision: { label: 'disallowed', file: LETTER.umn, quote: 'NSF’s management decision is to disallow all questioned costs in the amount of $73,260.' },
  },
  {
    id: 'ic-03', file: 'nsf-oig-21-1-016-southcarolina.txt', auditee: 'Univ. of South Carolina', year: '2021',
    item: 'General purpose cleaning supplies', price: 180, purpose: '',
    category: 'general office', expect: 'flag',
    quote: '$180 in NSF Award No. for the purchase of general purpose cleaning supplies.',
    decision: UOFSC_AGREED,
  },
  {
    id: 'ic-04', file: 'nsf-oig-17-1-002-ucdavis-report.txt', auditee: 'UC Davis', year: '2017',
    item: 'Alcoholic beverages for two workshops and an annual conference', price: 4881, purpose: 'Workshops and annual conference of the Institute for Complex Adaptive Matter (ICAM)',
    category: 'alcohol', expect: 'flag',
    quote: 'invoices for the three events included a total of $4,881 for purchases of alcoholic beverages, which are prohibited by Federal cost principles.',
    decision: { label: 'auditor' },
    note: 'UC Davis said the alcohol was paid from the non-NSF share; NSF allowed the workshop totals without ruling on the alcohol itself.',
  },

  {
    id: 'ic-05', file: LETTER.nyu, auditee: 'New York Univ.', year: '2013',
    item: 'Alcohol and meal charges', price: 1125, purpose: 'Meetings and conferences under the award',
    category: ['alcohol', 'food'], expect: 'flag',
    quote: 'the audit report identified $1,125 in unallowable alcohol and meal charges',
    decision: { label: 'disallowed', file: LETTER.nyu, quote: 'NSF has decided to sustain and disallow the entire amount of $75,494.' },
  },
  {
    id: 'ic-06', file: LETTER.nyu, auditee: 'New York Univ.', year: '2013',
    item: 'Conference-planning dinner', price: 252.22, purpose: 'Planning a conference funded by the award',
    category: 'food', expect: 'flag',
    quote: 'costs for an additional conference-planning dinner that was not identified in the audit report and totaled $252.22.',
    decision: { label: 'disallowed', file: LETTER.nyu, quote: 'NSF also disallows the $252.22.' },
  },
  {
    id: 'ic-07', file: 'nsf-oig-16-1-023-michigan.txt', auditee: 'Univ. of Michigan', year: '2016',
    item: 'Horseback-riding clinic for 20 eighth-grade students', price: 1000, purpose: 'Students in the FUEL workshops sponsored by the award',
    category: 'entertainment', expect: 'flag',
    quote: 'to enable 20 eighth- grade students to attend a horseback-riding clinic.',
    decision: { label: 'disallowed', file: LETTER.umich, quote: 'NSF has disallowed the entire $8,905 in questioned costs.' },
  },
  {
    id: 'ic-08', file: 'nsf-oig-16-1-023-michigan.txt', auditee: 'Univ. of Michigan', year: '2016',
    item: '21 amusement park tickets', price: 851, purpose: 'Students in the REU summer program sponsored by the award',
    category: 'entertainment', expect: 'flag',
    quote: 'Amusement Park for the students participating in the Research Experiences for Undergraduates (REU) summer program.',
    decision: { label: 'disallowed', file: LETTER.umich, quote: 'NSF has disallowed the entire $8,905 in questioned costs.' },
  },
  {
    id: 'ic-09', file: 'nsf-oig-16-1-023-michigan.txt', auditee: 'Univ. of Michigan', year: '2016',
    item: 'Football stadium tour for 108 students', price: 432, purpose: 'Students in a summer program sponsored by the award (MI-LSAMP)',
    category: 'entertainment', expect: 'flag',
    quote: 'to participate in a tour of the UM football stadium.',
    decision: { label: 'disallowed', file: LETTER.umich, quote: 'NSF has disallowed the entire $8,905 in questioned costs.' },
  },
  {
    id: 'ic-10', file: 'nsf-oig-21-1-003-wyoming.txt', auditee: 'Univ. of Wyoming', year: '2021',
    item: 'Embroidered briefcases and engraved pens with the institute and EPSCoR logos', price: 1930, purpose: '',
    category: ['other', 'personal'], expect: 'flag',
    quote: 'UW provided detailed receipts for the remaining $1,930 showing that the items were for promotional items including embroidered briefcases and engraved pens.',
    decision: { label: 'disallowed', file: LETTER.wyo, quote: 'UW concurred with NSF’s management decision to disallow questioned costs of $7,908.' },
  },
  {
    id: 'ic-11', file: 'nsf-oig-21-1-003-wyoming.txt', auditee: 'Univ. of Wyoming', year: '2021',
    item: 'Museum and zoo admission, yoga and gym access, theater and movie tickets', price: 15207, purpose: 'Group weekend activities for students in the summer research apprentice program',
    category: 'entertainment', expect: 'flag',
    quote: 'We consider these SRAP activities — including museum and zoo admission, yoga and gym access, and theater and movie tickets — to be entertainment',
    decision: { label: 'disallowed', file: LETTER.wyo, quote: 'It is therefore NSF’s management decision to disallow questioned costs of $15,027.' },
    note: 'The letter says $15,027 against the report’s $15,207.',
  },
  {
    id: 'ic-12', file: 'nsf-oig-21-1-017-tennessee-state.txt', auditee: 'Tennessee State Univ.', year: '2021',
    item: 'Meals', price: 1119, purpose: '',
    category: 'food', expect: 'flag',
    quote: '$1,119 in meals that were not allowable on NSF awards;',
    decision: { label: 'auditor' },
  },
  {
    id: 'ic-13', file: 'nsf-oig-21-1-017-tennessee-state.txt', auditee: 'Tennessee State Univ.', year: '2021',
    item: 'Gift cards and lanyards', price: 245, purpose: 'Paid from the award’s participant support funds',
    category: ['personal', 'other'], expect: 'flag',
    quote: 'to purchase gift cards and lanyards. However, TSU did not justify these gifts and promotional materials in its proposal',
    decision: { label: 'auditor' },
    note: 'TSU said it discussed the cost with the program director in advance.',
  },
  {
    id: 'ic-14', file: 'nsf-oig-15-1-012-ucberkeley.txt', auditee: 'UC Berkeley', year: '2015',
    item: 'Alcohol-related charges', price: 10418, purpose: '',
    category: 'alcohol', expect: 'flag',
    quote: '$10,418 charged to two awards for various unallowable alcohol related charges.',
    decision: { label: 'disallowed', file: LETTER.ucb, quote: 'NSF partially sustains the finding based on University concurrence with the majority of the costs questioned and has disallowed $13,247' },
  },
  {
    id: 'ic-15', file: 'nsf-oig-15-1-012-ucberkeley.txt', auditee: 'UC Berkeley', year: '2015',
    item: 'Meals at a conference that were not an integral part of it', price: 741, purpose: 'Conference under the award',
    category: 'food', expect: 'flag',
    quote: '$741 charged to one award for meals that were not an integral or necessary part of a conference.',
    decision: { label: 'disallowed', file: LETTER.ucb, quote: 'NSF partially sustains the finding based on University concurrence with the majority of the costs questioned and has disallowed $13,247' },
  },
  {
    id: 'ic-16', file: 'nsf-oig-15-1-012-ucberkeley.txt', auditee: 'UC Berkeley', year: '2015',
    item: 'Holiday dinner', price: 2088, purpose: '',
    category: ['food', 'entertainment'], expect: 'flag',
    quote: '$2,088 charged to one award to host a holiday dinner.',
    decision: { label: 'disallowed', file: LETTER.ucb, quote: 'NSF partially sustains the finding based on University concurrence with the majority of the costs questioned and has disallowed $13,247' },
  },
  {
    id: 'ic-17', file: 'nsf-oig-19-1-016-ohiostate.txt', auditee: 'Ohio State Univ.', year: '2019',
    item: '190 program-branded water bottles', price: 1782, purpose: 'To hand out to students at a community development event, to help them build a connection with each other and the community',
    category: ['other', 'personal'], expect: 'flag',
    quote: 'water bottles to hand out to students during a community development event.',
    decision: { label: 'disallowed', file: LETTER.osu, quote: '(8) promotional items/memorabilia/gifts;' },
  },
  {
    id: 'ic-18', file: 'nsf-oig-19-1-012-utaustin.txt', auditee: 'Univ. of Texas at Austin', year: '2019',
    item: 'Plaques for participants who completed the program', price: 1139, purpose: 'Given to participants who completed the award’s program',
    category: ['other', 'personal'], expect: 'flag',
    quote: 'plaques provided to participants who successfully completed the',
    decision: { label: 'disallowed', file: LETTER.utaustin, quote: 'NSF’s management decision is to disallow all questioned costs in the amount of $283,613.' },
  },
  {
    id: 'ic-19', file: 'nsf-oig-19-1-012-utaustin.txt', auditee: 'Univ. of Texas at Austin', year: '2019',
    item: 'An iMac and an iPad', price: 4860, purpose: 'The iMac was used for this project and others and the iPad was used for lab management as well as this project',
    category: 'equipment', expect: 'flag',
    quote: '“the iMac was used for this project and others and the iPad was used for lab management as well as this project.”',
    decision: { label: 'disallowed', file: LETTER.utaustin, quote: 'NSF’s management decision is to disallow all questioned costs in the amount of $283,613.' },
    note: 'General-purpose equipment not used only for the research; the report also notes it was bought 79 days before the award ended.',
  },
  {
    id: 'ic-20', file: 'nsf-oig-15-1-004-uflorida.txt', auditee: 'Univ. of Florida', year: '2015',
    item: 'Meal at a restaurant for students', price: 207, purpose: '',
    category: 'food', expect: 'flag',
    quote: '$207 charged for a meal at a restaurant for students was not necessary for the administration and performance of the award;',
    decision: { label: 'disallowed', file: LETTER.uf, quote: 'The University has agreed to repay the entire sustained amount.' },
  },
  {
    id: 'ic-21', file: 'nsf-oig-18-1-005-nas.txt', auditee: 'National Academy of Sciences', year: '2018',
    item: '2-hour evening reception for conference guests and significant others', price: 10987, purpose: 'Part of a grant-related conference',
    category: ['entertainment', 'food'], expect: 'flag',
    quote: 'The event invitation stated that the reception was for guests and significant others, and the participant list indicated that both conference participants and their family members attended the event;',
    decision: { label: 'disallowed', file: LETTER.nas, quote: 'NSF’s management decision is to disallow all questioned costs in the amount of $90,902.' },
  },
  {
    id: 'ic-22', file: 'nsf-oig-21-1-001-kucr-epscor.txt', auditee: 'Univ. of Kansas Center for Research', year: '2021',
    item: 'Wine, and bar set-up and corkage fees', price: 642, purpose: '',
    category: 'alcohol', expect: 'flag',
    quote: 'KUCR charged its EPSCoR awards a total of $642 for wine and bar set up and corkage fees',
    decision: { label: 'disallowed', file: LETTER.kucr21, quote: 'NSF sustains the questioned costs of $10,697.' },
  },
  {
    id: 'ic-23', file: 'nsf-oig-21-1-001-kucr-epscor.txt', auditee: 'Univ. of Kansas Center for Research', year: '2021',
    item: 'Drinking water for the office staff', price: 4186, purpose: '',
    category: ['general office', 'food'], expect: 'flag',
    quote: 'KUCR charged $4,186 to two EPSCoR awards for water for its office staff.',
    decision: { label: 'disallowed', file: LETTER.kucr21, quote: 'NSF sustains the questioned costs of $10,697.' },
  },
  {
    id: 'ic-24', file: 'nsf-oig-21-1-001-kucr-epscor.txt', auditee: 'Haskell (KUCR subrecipient)', year: '2021',
    item: 'Reusable tote bags imprinted with the name of the summer internship program', price: 1562, purpose: 'Recruitment material at conferences',
    category: ['other', 'personal'], expect: 'flag',
    quote: 'purchased reusable tote bags imprinted with the name of its EPSCoR-funded summer internship program at a cost of $1,562',
    decision: { label: 'disallowed', file: LETTER.kucr21, quote: 'NSF sustains the questioned costs of $10,697.' },
  },
  {
    id: 'ic-25', file: 'nsf-oig-19-1-013-upenn.txt', auditee: 'Univ. of Pennsylvania', year: '2019',
    item: 'Recruitment/End of Year Dinner', price: 2190, purpose: 'An important contributor to creating a sociable and welcoming atmosphere',
    category: ['food', 'entertainment'], expect: 'flag',
    quote: 'this dinner appears to have been entertainment-related, based on the PI’s statement that the dinner was “an important contributor to creating a sociable and welcoming atmosphere.”',
    decision: { label: 'agreed', quote: 'agreed to refund NSF for all questioned costs and to enhance its procedures' },
  },
  {
    id: 'ic-26', file: 'nsf-oig-19-1-013-upenn.txt', auditee: 'Univ. of Pennsylvania', year: '2019',
    item: 'Alcohol for a grant-supported event', price: 90, purpose: 'Grant-supported event',
    category: 'alcohol', expect: 'flag',
    quote: 'for $90 in unallowable alcohol-related expenses incurred for a grant-supported event.',
    decision: { label: 'agreed', quote: 'agreed to refund NSF for all questioned costs and to enhance its procedures' },
  },
  {
    id: 'ic-27', file: 'nsf-oig-19-1-007-asu.txt', auditee: 'Arizona State Univ.', year: '2019',
    item: 'Aprons for industry members, faculty and students', price: 2107, purpose: 'A teambuilding activity that revolved around cooking',
    category: ['entertainment', 'other'], expect: 'flag',
    quote: 'incurred to purchase aprons for industry members, faculty, and students to use in a teambuilding activity that revolved around cooking.',
    decision: { label: 'disallowed', file: LETTER.asu, quote: 'Based upon ASU’s concurrence, it is NSF’s management decision to disallow $22,418.' },
  },
  {
    id: 'ic-28', file: 'nsf-oig-19-1-007-asu.txt', auditee: 'Arizona State Univ.', year: '2019',
    item: 'Bartending services for a cash bar', price: 250, purpose: 'A grant-related conference',
    category: ['alcohol', 'entertainment'], expect: 'flag',
    quote: 'incurred to obtain bartending services for a grant-related conference. Because this cost related to a cash bar that served alcohol',
    decision: { label: 'disallowed', file: LETTER.asu, quote: 'Based upon ASU’s concurrence, it is NSF’s management decision to disallow $22,418.' },
  },

  // ── Real research costs (expect fine) ────────────────────────────────────
  {
    id: 'ic-d01', file: 'nsf-oig-17-1-002-ucdavis-report.txt', auditee: 'UC Davis', year: '2017 (resolved 2018)',
    item: 'Heavy Fermion Workshop costs (half the total)', price: 13026, purpose: 'ICAM workshop; the proposal budget asked NSF for half the cost of each ICAM workshop',
    category: ['other', 'travel'], expect: 'fine',
    quote: 'Heavy Fermion Workshop: We questioned the $13,026 UC-Davis charged NSF.',
    decision: UCD_WORKSHOPS_ALLOWED,
    note: 'Booked under the university object code "entertainment"; NSF allowed it.',
  },
  {
    id: 'ic-d02', file: 'nsf-oig-17-1-002-ucdavis-report.txt', auditee: 'UC Davis', year: '2017 (resolved 2018)',
    item: 'ICAM Annual Conference costs', price: 23633, purpose: 'Annual conference of the Institute for Complex Adaptive Matter, an ongoing program of the NSF award',
    category: ['other', 'travel'], expect: 'fine',
    quote: 'ICAM Annual Conference: Total cost for the January 2008 conference was $43,633; UC-Davis charged $23,633 to NSF and $20,000 to another university account.',
    decision: UCD_WORKSHOPS_ALLOWED,
  },
  {
    id: 'ic-d03', file: 'nsf-oig-17-1-002-ucdavis-report.txt', auditee: 'UC Davis', year: '2017',
    item: 'Lunches for a summer training program (11 lunches)', price: 123, purpose: 'Summer training program; included in the grant proposal budget',
    category: 'food', expect: 'fine',
    quote: 'OIG had questioned $123 of entertainment costs claimed for 11 lunches in July 2010. UC- Davis stated the lunches were provided in connection with a summer training program and were included in the grant proposal budget. After reviewing the documents, we removed these questioned costs from the final audit report.',
    decision: { label: 'auditor', quote: 'After reviewing the documents, we removed these questioned costs from the final audit report.' },
    note: 'Food is allowable here because the training program budgeted it; a hard case for a rule that flags all food.',
  },
  {
    id: 'ic-d04', file: 'nsf-oig-17-1-002-ucdavis-report.txt', auditee: 'UC Davis', year: '2017',
    item: 'Supplies for DNA extractions', price: 3662, purpose: 'DNA extractions for the project; results were published',
    category: ['lab supplies', 'reagents'], expect: 'fine',
    quote: 'UC-Davis provided a listing of all DNA extractions performed as well as the publication that resulted from the research. We removed these questioned costs from the final audit report.',
    decision: { label: 'auditor', quote: 'UC-Davis provided a listing of all DNA extractions performed as well as the publication that resulted from the research. We removed these questioned costs from the final audit report.' },
  },
  {
    id: 'ic-d05', file: 'nsf-oig-17-1-002-ucdavis-report.txt', auditee: 'UC Davis', year: '2017',
    item: 'Server', price: 3543, purpose: "The PI's justification for charging the full cost of the server to the NSF award",
    category: 'equipment', expect: 'fine',
    quote: 'UC-Davis disagreed with $3,543 and provided the PI’s justification for charging the full cost of the server to the NSF award. We removed these questioned costs from the final report.',
    decision: { label: 'auditor', quote: 'We removed these questioned costs from the final report.' },
  },
  {
    id: 'ic-d06', file: 'nsf-oig-17-1-002-ucdavis-report.txt', auditee: 'UC Davis', year: '2017',
    item: 'Laptop computer', price: 3268, purpose: 'Needed for the award, per the award proposal',
    category: 'equipment', expect: 'fine',
    quote: 'UC-Davis referred to the award proposal as evidence that a $3,268 laptop computer was needed for the award. We removed these questioned costs from the final report.',
    decision: { label: 'auditor', quote: 'UC-Davis referred to the award proposal as evidence that a $3,268 laptop computer was needed for the award. We removed these questioned costs from the final report.' },
  },
  {
    id: 'ic-d07', file: 'nsf-oig-17-1-002-ucdavis-report.txt', auditee: 'UC Davis', year: '2017',
    item: 'Nonrefundable deposit for an annual business meeting', price: 1000, purpose: 'Annual business meeting held later in the year',
    category: 'other', expect: 'fine',
    quote: 'OIG’s draft audit report had questioned $1,000 of entertainment costs claimed for a nonrefundable deposit paid in October 2010 for an annual business meeting to be held later in the year. UC-Davis provided an invoice showing that the meeting did take place as scheduled. We removed these questioned costs from the final audit report.',
    decision: { label: 'auditor', quote: 'UC-Davis provided an invoice showing that the meeting did take place as scheduled. We removed these questioned costs from the final audit report.' },
  },
  {
    id: 'ic-d08', file: 'nsf-oig-15-1-014-uwm.txt', auditee: 'Univ. of Wisconsin-Madison', year: '2015 (resolved)',
    item: "Relocation expenses for a new hire, including moving the employee's personal possessions, insurance, storage and delivery", price: 30107,
    purpose: 'Employee hired to fill a position on the NSF award',
    category: ['other', 'personal'], expect: 'fine',
    quote: 'The university reimbursed more than $20,000 in relocation expenses, including costs to move the employee’s personal possessions, as well as all insurance, storage, and delivery expenses associated with the move.',
    decision: { label: 'allowed', file: 'nsf-resolution-15-1-014-uwm.txt', quote: 'Therefore, NSF’s management decision is to allow the entire $30,107 of questioned costs.' },
    note: 'Relocation of a new hire is an allowable cost (2 CFR 200.464) even though it moves personal possessions.',
  },
  {
    id: 'ic-d09', file: 'nsf-oig-15-1-012-ucberkeley.txt', auditee: 'UC Berkeley', year: '2015 (resolved)',
    item: 'Four catered meals', price: 2204, purpose: '',
    category: 'food', expect: 'fine',
    quote: '$2,204 charged to one award for four catered meals that were not included in the budget;',
    decision: { label: 'allowed', file: LETTER.ucb, quote: 'NSF does not sustain the basis for questioning meals in the amount of $2,204 that were not included in the budget.' },
  },
  {
    id: 'ic-d10', file: 'nsf-oig-18-1-001-kucr.txt', auditee: 'Univ. of Kansas Center for Research', year: '2018 (resolved)',
    item: 'Polo shirts for the research team', price: 1377, purpose: 'Worn by the research team while doing fieldwork on the project',
    category: ['other', 'personal'], expect: 'fine',
    quote: 'Per KUCR, the shirts were purchased for the',
    decision: { label: 'allowed', file: LETTER.kucr18, quote: 'NSF determined that the remaining $1,377 were allowable costs' },
    note: 'The auditor called the shirts promotional; NSF allowed them on KUCR’s documentation.',
  },
  {
    id: 'ic-d11', file: LETTER.umich, auditee: 'Univ. of Michigan', year: '2016 (resolved)',
    item: 'Purchase and transfer of a research vessel', price: 24000, purpose: '',
    category: 'equipment', expect: 'fine',
    quote: 'remaining $24,000 in questioned costs for purchase and transfer of a research vessel will be allowed',
    decision: { label: 'allowed', file: LETTER.umich, quote: 'evidence provided demonstrated the purchase was reasonable, necessary, allocable, and adhered to established University policies and procedures.' },
  },
];

// Findings looked at and left out: they are about when, how much, or how it
// was split or documented, not what the item is.
export const OUT_OF_SCOPE = [
  { file: 'nsf-oig-17-1-009-usc.txt', what: 'Employee travel, a conference meal and speaker fees charged to participant support', why: 'Wrong account (participant support), not an unallowable kind of cost; NSF allowed them once reclassified.' },
  { file: 'nsf-oig-21-1-016-southcarolina.txt', what: 'Meals on travel days 3 days before a meeting ($83), a rebooked flight, rental car gas', why: 'Travel timing and duplication, not the kind of item.' },
  { file: 'nsf-oig-21-1-016-southcarolina.txt', what: 'A postdoc job advertisement billed as publication costs ($856)', why: 'Mislabeled cost; recruiting ads are their own cost item, not judged by the kind of thing bought.' },
  { file: 'nsf-oig-17-1-002-ucdavis-report.txt', what: 'Two servers and technology items charged 100% to one award ($6,693); a laptop moved onto another award ($3,210)', why: 'Allocation between awards, not the kind of item.' },
  { file: 'nsf-oig-17-1-002-ucdavis-report.txt', what: 'Purchase card items with no justification ($2,230, $2,031)', why: 'Documentation; the report does not say what the items were.' },
  { file: 'nsf-oig-21-1-003-wyoming.txt', what: 'A “welcome lunch” ($738) where 26 of 50 attendees were staff or family', why: 'The auditor questioned only the non-participant share ($384): a split, not the kind of item.' },
  { file: 'nsf-oig-21-1-017-tennessee-state.txt', what: 'Food and utensils for a STEM faculty luncheon ($681) and other items paid from participant support', why: 'Wrong budget line (participant support); TSU said they were valid operations costs.' },
  { file: 'nsf-oig-15-1-004-uflorida.txt', what: 'Meals for lunch receptions and field trips ($1,400)', why: 'Unallowable because the proposal said the center would pay for food: depends on the budget, not the item.' },
  { file: 'nsf-oig-18-1-001-kucr.txt', what: 'Facebook advertising fees ($473)', why: 'Posted to the award by a data-entry error: allocation, not the kind of item.' },
  { file: 'nsf-oig-15-1-012-ucberkeley.txt', what: 'Toner cartridges and gift cards (“recognition payments”)', why: 'The report redacts the amounts, so there is no real price to ask with.' },
  { file: 'nsf-oig-13-1-004-cornell.txt', what: 'A magazine subscription; laptops, monitors and toner (allowed by NSF in aggregate)', why: 'The report gives no per-item amount.' },
];
