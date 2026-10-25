// T114: real NIH grants, each checked on real past days, with what the
// public records say the fund tracker should have shown that day.
//
// The facts are real and each one names its saved source:
//   gw          Grant Witness NIH dl-table.csv (fetched 2026-10-25), the row
//               for `award` (default: the grant's own row), column `field`.
//               docs/research/sources/docs/grantwitness-nih-fund-tracker-cases-2026-10-25.csv
//   usaspending USAspending /api/v2/awards/funding/ monthly outlays: `paid` is
//               the total paid out by the end of month `through` (dollars,
//               rounded). Saved in eval/fund-tracker-real.cache/.
//   reporter    NIH RePORTER today (2026-10-25): `status` is what its
//               termination flag and project end date say.
//   obligations USAspending obligations vs RePORTER award notices for fiscal
//               year `fy` (both saved): `reporter` and `usaspending` totals.
//
// The expectations are OUR policy applied to those facts by hand, not the
// output of our code:
//   - A grant is frozen from the day it is canceled (terminated or funds
//     frozen) until a payment lands after a restoration (a court order, or
//     the agency lifting the freeze). A court order alone doesn't unfreeze.
//   - Money that lands while the grant is still canceled (closeout costs,
//     2 CFR 200.343) leaves it frozen, for the grant manager to decide.
//   - Sources that disagree raise a flag, which freezes spending until the
//     grant manager decides.
//   - A cut to a supplement only (an S1/S2 award under the parent number) is
//     a notice; the parent grant is not frozen.
//   - Grants never cut stay unfrozen.
//
// Expect: frozen (true/false); `flag`: a flag kind that must be open;
// `decide`: the grant manager must have a paid-while-canceled hold.
// Payments are dated by month (USAspending's resolution), so no check falls
// in a month where a payment and a status change can't be ordered.

const gw = (field, value, award) => ({ source: 'gw', field, value, ...(award ? { award } : {}) });
const paid = (through, amount) => ({ source: 'usaspending', through, paid: amount });
const reporter = status => ({ source: 'reporter', status });

export const CASES = [
  // --- Terminated, still terminated, no restoration ---
  {
    id: 'still-cut-no-money', grantId: 'R01GM155497', kind: 'still terminated',
    org: 'Temple University (NIGMS)', start: '2024-08-01', end: '2029-06-30',
    facts: [gw('Detailed Status', 'Terminated'), gw('Earliest Disruption', '2025-06-04'), gw('Latest Restoration', 'N/A'), paid('2025-05', 144216), paid('2025-08', 144216), paid('2025-09', 544703)],
    checks: [
      { day: '2025-08-31', expect: { frozen: true }, why: 'Terminated 2025-06-04, no restoration, nothing paid since May.' },
      { day: '2025-09-30', expect: { frozen: true, decide: true }, why: '$400,487 paid out in September while still terminated (closeout): stays frozen, grant manager decides.' },
    ],
  },
  {
    id: 'still-cut-closeout-paid', grantId: 'R01AI178875', kind: 'still terminated, paid after',
    org: 'Beth Israel Deaconess (NIAID)', start: '2023-08-07', end: '2028-07-31',
    facts: [gw('Detailed Status', 'Terminated'), gw('Earliest Disruption', '2025-04-17'), gw('Latest Restoration', 'N/A'), paid('2025-05', 597194), paid('2025-06', 646195), reporter('canceled')],
    checks: [
      { day: '2025-05-31', expect: { frozen: true }, why: 'Terminated 2025-04-17; nothing paid in May.' },
      { day: '2025-06-30', expect: { frozen: true, decide: true }, why: '$49,001 paid in June while still terminated: frozen, grant manager decides.' },
      { day: '2026-10-25', expect: { frozen: true }, why: 'Still terminated on every source today.' },
    ],
  },
  {
    id: 'still-cut-k01', grantId: 'K01HL161026', kind: 'still terminated',
    org: 'Washington University (NHLBI)', start: '2022-01-01', end: '2025-12-31',
    facts: [gw('Detailed Status', 'Terminated'), gw('Earliest Disruption', '2025-06-13'), gw('Latest Restoration', 'N/A'), paid('2025-02', 488276), paid('2025-09', 488276)],
    checks: [{ day: '2025-09-30', expect: { frozen: true }, why: 'Terminated 2025-06-13; nothing paid since February; project runs to 2025-12-31.' }],
  },
  {
    id: 'still-cut-f31', grantId: 'F31AI176739', kind: 'still terminated',
    org: 'Harvard Medical School (NIAID)', start: '2023-09-01', end: '2026-08-31',
    facts: [gw('Detailed Status', 'Terminated'), gw('Earliest Disruption', '2025-05-06'), gw('Latest Restoration', 'N/A'), paid('2025-04', 48792), paid('2025-09', 48792)],
    checks: [{ day: '2025-09-30', expect: { frozen: true }, why: 'Terminated 2025-05-06 (Harvard list); nothing paid since.' }],
  },
  {
    id: 'still-cut-paid-vt', grantId: 'R01AI165656', kind: 'still terminated, paid after',
    org: 'Virginia Tech (NIAID)', start: '2024-07-17', end: '2029-06-30',
    facts: [gw('Detailed Status', 'Terminated'), gw('Earliest Disruption', '2025-04-17'), gw('Latest Restoration', 'N/A'), paid('2025-04', 75655), paid('2025-08', 224094)],
    checks: [{ day: '2025-08-31', expect: { frozen: true, decide: true }, why: '$148,439 paid May to August while terminated (closeout): frozen, grant manager decides.' }],
  },
  {
    id: 'still-cut-paid-psu', grantId: 'R01AI168169', kind: 'still terminated, paid after',
    org: 'Penn State (NIAID)', start: '2023-08-10', end: '2028-07-31',
    facts: [gw('Detailed Status', 'Terminated'), gw('Earliest Disruption', '2025-04-17'), gw('Latest Restoration', 'N/A'), paid('2025-05', 357512), paid('2025-08', 611616)],
    checks: [{ day: '2025-08-31', expect: { frozen: true, decide: true }, why: '$254,104 paid June to August while terminated: frozen, grant manager decides.' }],
  },
  {
    id: 'still-cut-nu', grantId: 'R01HG013773', kind: 'still terminated',
    org: 'Northwestern University (NHGRI)', start: '2024-09-20', end: '2025-06-30',
    facts: [gw('Detailed Status', 'Terminated'), gw('Earliest Disruption', '2025-04-08'), paid('2025-03', 125690), paid('2025-05', 125690)],
    checks: [{ day: '2025-05-31', expect: { frozen: true }, why: 'Terminated (and frozen) 2025-04-08; nothing paid since March.' }],
  },
  {
    id: 'frozen-duke-1', grantId: 'R01GM118786', kind: 'funds frozen',
    org: 'Duke University (NIGMS)', start: '2017-01-05', end: '2025-08-31',
    facts: [gw('Detailed Status', 'Frozen'), gw('Earliest Disruption', '2025-07-29'), gw('Latest Restoration', 'N/A'), paid('2025-06', 1518633), paid('2025-07', 1518633)],
    checks: [{ day: '2025-07-31', expect: { frozen: true }, why: 'Funds frozen 2025-07-29 (File C); never lifted; nothing paid in July.' }],
  },
  {
    id: 'frozen-duke-2', grantId: 'R01CA242593', kind: 'funds frozen',
    org: 'Duke University (NCI)', start: '2019-09-01', end: '2025-08-31',
    facts: [gw('Detailed Status', 'Frozen'), gw('Earliest Disruption', '2025-07-29'), gw('Latest Restoration', 'N/A'), paid('2025-06', 1325619), paid('2025-07', 1325619)],
    checks: [{ day: '2025-07-31', expect: { frozen: true }, why: 'Funds frozen 2025-07-29 (File C); never lifted; nothing paid in July.' }],
  },
  {
    id: 'paid-while-cut-k01', grantId: 'K01DK133670', kind: 'paid while terminated',
    org: 'UCLA (NIDDK)', start: '2025-01-01', end: '2027-04-30',
    facts: [gw('Detailed Status', 'Terminated'), gw('Earliest Disruption', '2025-06-30'), gw('Latest Restoration', '2026-04-07'), paid('2025-09', 359936), paid('2025-11', 393962), reporter('canceled')],
    checks: [{ day: '2025-11-30', expect: { frozen: true, decide: true }, why: 'Terminated 2025-06-30; $34,026 paid by November with no restoration yet (that came 2026-04-07): frozen, grant manager decides.' }],
  },

  // --- Restored by a court, then paid ---
  ...['R01AT010001', 'R01AG068667', 'R35GM147114', 'R01AI173214'].map((grantId, i) => ({
    id: `thakur-paid-${i + 1}`, grantId, kind: 'restored, paid after',
    org: ['UCLA (NCCIH)', 'UCLA (NIA)', 'UCLA (NIGMS)', 'UCLA (NIAID)'][i],
    start: ['2018-07-01', '2021-04-01', '2022-09-01', '2023-06-01'][i],
    end: ['2028-03-31', '2026-12-31', '2027-07-31', '2028-05-31'][i],
    facts: [
      gw('Detailed Status', 'Reinstated (confirmed)'), gw('Earliest Disruption', '2025-07-31'), gw('Latest Restoration', '2025-09-22'),
      paid('2025-09', [1701874, 1827052, 868715, 1367675][i]), paid('2025-11', [1772438, 1909728, 944851, 1493468][i]), reporter('active'),
    ],
    checks: [
      { day: '2025-08-31', expect: { frozen: true }, why: 'Terminated 2025-07-31 (UCLA list).' },
      { day: '2025-10-31', expect: { frozen: true, flag: 'court_order_no_payment' }, why: 'Restored by Thakur v. Trump 2025-09-22, but nothing paid since: stays frozen, flagged.' },
      { day: '2025-11-30', expect: { frozen: false }, why: 'Money paid out after the restoration (Oct to Nov): unfrozen.' },
      { day: '2026-10-25', expect: { frozen: false }, why: 'Reinstated (confirmed), RePORTER active, payments continuing, award notices match obligations.' },
    ],
  })),
  {
    id: 'thakur-paid-late', grantId: 'R01AG075909', kind: 'restored, paid months later',
    org: 'UCLA (NIA)', start: '2022-04-01', end: '2027-01-31',
    facts: [gw('Detailed Status', 'Reinstated (confirmed)', '5R01AG075909-05'), gw('Earliest Disruption', '2025-07-31', '5R01AG075909-05'), gw('Latest Restoration', '2025-09-22', '5R01AG075909-05'), paid('2025-09', 1417150), paid('2026-02', 1417150), paid('2026-03', 1533298)],
    checks: [
      { day: '2026-01-31', expect: { frozen: true, flag: 'court_order_no_payment' }, why: 'Restored 2025-09-22 but USAspending shows nothing paid from September to February.' },
      { day: '2026-03-31', expect: { frozen: false }, why: '$116,148 paid in March, after the restoration: unfrozen.' },
    ],
  },
  {
    id: 'thakur-paid-r21', grantId: 'R21NS139078', kind: 'restored, paid months later',
    org: 'UCLA (NINDS)', start: '2024-07-15', end: '2027-06-30',
    facts: [gw('Detailed Status', 'Reinstated (confirmed)'), gw('Earliest Disruption', '2025-07-31'), gw('Latest Restoration', '2025-09-22'), paid('2025-09', 63647), paid('2026-01', 63647), paid('2026-02', 63883)],
    checks: [
      { day: '2026-01-31', expect: { frozen: true, flag: 'court_order_no_payment' }, why: 'Restored 2025-09-22, nothing paid through January.' },
      { day: '2026-02-28', expect: { frozen: false }, why: 'First payment after the restoration lands in February: unfrozen.' },
    ],
  },
  {
    id: 'harvard-paid-1', grantId: 'R01DK137993', kind: 'restored, paid after',
    org: 'Harvard Medical School (NIDDK)', start: '2024-07-22', end: '2029-06-30',
    facts: [gw('Detailed Status', 'Reinstated (confirmed)'), gw('Earliest Disruption', '2025-04-14'), gw('Latest Restoration', '2025-09-18'), paid('2025-08', 308984), paid('2025-11', 770309)],
    checks: [
      { day: '2025-08-31', expect: { frozen: true }, why: 'Harvard funds frozen 2025-04-14; nothing paid since April.' },
      { day: '2025-11-30', expect: { frozen: false }, why: 'Restored 2025-09-18 (Harvard v HHS) and paid out since: unfrozen.' },
    ],
  },
  {
    id: 'harvard-paid-2', grantId: 'R01MH134800', kind: 'restored, paid after',
    org: 'Harvard University (NIMH)', start: '2024-02-22', end: '2026-12-31',
    facts: [gw('Detailed Status', 'Reinstated (confirmed)'), gw('Earliest Disruption', '2025-04-14'), gw('Latest Restoration', '2025-09-18'), paid('2025-08', 1034654), paid('2025-11', 1396577)],
    checks: [
      { day: '2025-08-31', expect: { frozen: true }, why: 'Harvard funds frozen 2025-04-14; nothing paid since April.' },
      { day: '2025-11-30', expect: { frozen: false }, why: 'Restored 2025-09-18 and paid out since: unfrozen.' },
    ],
  },
  {
    id: 'paid-then-restored-t32', grantId: 'T32GM148391', kind: 'paid while terminated, then restored',
    org: 'Emory University (NIGMS)', start: '2023-02-01', end: '2028-01-31',
    facts: [gw('Detailed Status', 'Reinstated (confirmed)'), gw('Earliest Disruption', '2025-04-02'), gw('Latest Restoration', '2026-01-30'), paid('2025-08', 670185), paid('2025-09', 788596), paid('2026-01', 1018531), paid('2026-02', 1108177)],
    checks: [
      { day: '2025-09-30', expect: { frozen: true, decide: true }, why: 'Terminated 2025-04-02; $118,411 paid in September with no restoration yet: frozen, grant manager decides.' },
      { day: '2026-02-28', expect: { frozen: false }, why: 'Restored 2026-01-30 (APHA v. NIH) and paid in February: unfrozen.' },
    ],
  },
  {
    id: 'paid-then-restored-r01', grantId: 'R01HL176691', kind: 'paid while terminated, then restored',
    org: 'UCLA (NHLBI)', start: '2025-01-01', end: '2028-11-30',
    facts: [gw('Detailed Status', 'Reinstated (confirmed)'), gw('Earliest Disruption', '2025-07-31'), gw('Latest Restoration', '2026-02-23'), paid('2025-09', 155468), paid('2025-11', 353823), paid('2026-03', 864013)],
    checks: [
      { day: '2025-11-30', expect: { frozen: true, decide: true }, why: 'Terminated 2025-07-31; $198,355 paid by November, restoration only came 2026-02-23: frozen, grant manager decides.' },
      { day: '2026-03-31', expect: { frozen: false }, why: 'Restored 2026-02-23 and paid in March: unfrozen.' },
    ],
  },
  {
    id: 'paid-then-restored-k23', grantId: 'K23MH130250', kind: 'paid while terminated, then restored',
    org: 'UCSF (NIMH)', start: '2022-03-01', end: '2027-02-28',
    facts: [gw('Detailed Status', 'Reinstated (confirmed)'), gw('Earliest Disruption', '2025-04-30'), gw('Latest Restoration', '2026-03-24'), paid('2025-04', 480730), paid('2025-05', 498055), paid('2026-04', 633501)],
    checks: [
      { day: '2025-05-31', expect: { frozen: true, decide: true }, why: 'Terminated 2025-04-30; $17,325 paid in May while terminated: frozen, grant manager decides.' },
      { day: '2026-04-30', expect: { frozen: false }, why: 'Restored 2026-03-24 (MA v. RFK) and paid in April: unfrozen.' },
    ],
  },

  // --- Restored by a court, no money since ---
  {
    id: 'restored-no-money', grantId: 'F31DA059982', kind: 'restored, no payment',
    org: 'UC Irvine (NIDA)', start: '2024-04-01', end: '2026-03-31',
    facts: [gw('Detailed Status', 'Reinstated (unconfirmed)'), gw('Earliest Disruption', '2025-05-05'), gw('Latest Restoration', '2025-07-14'), paid('2025-04', 43570), paid('2025-09', 43570)],
    checks: [{ day: '2025-12-31', expect: { frozen: true, flag: 'court_order_no_payment' }, why: 'Restored 2025-07-14 (MA v. RFK), but no outlay recorded since April: stays frozen, flagged.' }],
  },

  // --- Cut again after a restoration ---
  {
    id: 'cut-again', grantId: 'R01DC021339', kind: 'restored then cut again',
    org: 'Indiana University (NIDCD)', start: '2024-02-01', end: '2029-01-31',
    facts: [gw('Detailed Status', 'Terminated'), gw('Earliest Disruption', '2025-05-22'), gw('Latest Restoration', '2025-06-24'), paid('2025-03', 520884), paid('2025-09', 520884), reporter('canceled')],
    checks: [
      { day: '2025-05-31', expect: { frozen: true }, why: 'Terminated 2025-05-22.' },
      { day: '2025-07-31', expect: { frozen: true }, why: 'RePORTER dropped the termination 2025-06-24, but Grant Witness lists it terminated again and nothing has been paid since March.' },
      { day: '2026-10-25', expect: { frozen: true }, why: 'Terminated on Grant Witness and RePORTER today.' },
    ],
  },

  // --- A supplement cut, the parent untouched ---
  {
    id: 'supplement-yale', grantId: 'R01GM105672', kind: 'supplement only',
    org: 'Yale University (NIGMS)', start: '2013-08-01', end: '2026-08-31',
    facts: [gw('Subaward ID', '12S1', '3R01GM105672-12S1'), gw('Detailed Status', 'Terminated', '3R01GM105672-12S1'), gw('Earliest Disruption', '2025-06-17', '3R01GM105672-12S1'), paid('2025-09', 1359751)],
    checks: [{ day: '2025-09-30', expect: { frozen: false, notice: true }, why: 'Only supplement 3R01GM105672-12S1 was terminated (2025-06-17); the parent kept being paid.' }],
  },
  {
    id: 'supplement-musc', grantId: 'R01HD094731', kind: 'supplement only',
    org: 'Medical University of South Carolina (NICHD)', start: '2020-08-01', end: '2026-07-31',
    facts: [gw('Subaward ID', '05S1', '3R01HD094731-05S1'), gw('Detailed Status', 'Terminated', '3R01HD094731-05S3'), gw('Earliest Disruption', '2025-06-09', '3R01HD094731-05S2'), paid('2025-08', 2554193)],
    checks: [{ day: '2025-08-31', expect: { frozen: false, notice: true }, why: 'Supplements 05S1-05S3 terminated 2025-06-09; the parent kept being paid.' }],
  },
  {
    id: 'supplement-umich', grantId: 'R01AG075818', kind: 'supplement only',
    org: 'University of Michigan (NIA)', start: '2021-09-30', end: '2027-05-31',
    facts: [gw('Subaward ID', '04S1', '3R01AG075818-04S1'), gw('Earliest Disruption', '2025-04-29', '3R01AG075818-04S1'), reporter('active'), { source: 'obligations', fy: 2025, reporter: 1284306, usaspending: 1284306 }],
    checks: [
      { day: '2025-06-30', expect: { frozen: false, notice: true }, why: 'Only supplement 04S1 was cut (2025-04-29).' },
      { day: '2026-10-25', expect: { frozen: false, notice: true }, why: 'Parent active on RePORTER; award notices match obligations every year.' },
    ],
  },
  {
    id: 'supplement-uchicago', grantId: 'R35GM145374', kind: 'supplement only',
    org: 'University of Chicago (NIGMS)', start: '2022-07-01', end: '2027-06-30',
    facts: [gw('Subaward ID', '03S2', '3R35GM145374-03S2'), gw('Earliest Disruption', '2025-06-01', '3R35GM145374-03S2'), reporter('active'), { source: 'obligations', fy: 2026, reporter: 683292, usaspending: 683292 }],
    checks: [
      { day: '2025-08-31', expect: { frozen: false, notice: true }, why: 'Only supplement 03S2 was cut (2025-06-01).' },
      { day: '2026-10-25', expect: { frozen: false, notice: true }, why: 'Parent active on RePORTER; award notices match obligations every year.' },
    ],
  },
  {
    id: 'supplement-then-disagree', grantId: 'R01MH126481', kind: 'supplement only, then sources disagree',
    org: 'UT Southwestern (NIMH)', start: '2021-06-15', end: '2027-06-30',
    facts: [gw('Subaward ID', '04S1', '3R01MH126481-04S1'), gw('Earliest Disruption', '2025-04-29', '3R01MH126481-04S1'), reporter('active'), { source: 'obligations', fy: 2026, reporter: 624765, usaspending: -209234.11 }],
    checks: [
      { day: '2025-06-30', expect: { frozen: false, notice: true }, why: 'Only supplement 04S1 was cut (2025-04-29).' },
      { day: '2026-10-25', expect: { frozen: true, flag: 'sources_disagree' }, why: 'FY2026: RePORTER lists a $624,765 award, USAspending nets -$209,234 (a -$833,999 deobligation on 2026-04-30): sources disagree.' },
    ],
  },

  // --- Funds frozen, then the freeze lifted ---
  ...[
    ['R01HL160929', 'Columbia (NHLBI)', '2022-02-15', '2027-01-31', '2025-06-30', ['2025-05', 4496746], ['2025-07', 4674522], '2025-05-31', '2025-07-31'],
    ['DP2HD118273', 'Columbia (NICHD)', '2024-09-01', '2027-08-31', '2025-06-30', ['2025-05', 200665], ['2025-07', 247276], '2025-05-31', '2025-07-31'],
    ['R35GM150778', 'Columbia (NIGMS)', '2023-07-15', '2028-05-31', '2025-06-30', ['2025-08', 713455], ['2025-09', 923879], '2025-05-31', '2025-09-30'],
    ['R01EY034867', 'Cornell (NEI)', '2023-06-01', '2027-05-31', '2025-11-30', ['2025-09', 643363], ['2025-12', 883917], '2025-10-31', '2025-12-31'],
    ['R01GM124354', 'Northwestern (NIGMS)', '2018-02-01', '2027-07-31', '2025-11-30', ['2025-09', 974674], ['2025-12', 1277157], '2025-10-31', '2025-12-31'],
  ].map(([grantId, org, start, end, lifted, before, after, frozenDay, liveDay]) => ({
    id: `freeze-lifted-${grantId}`, grantId, kind: 'freeze lifted, paid after', org, start, end,
    facts: [gw('Detailed Status', 'Unfrozen (confirmed)'), gw('Earliest Disruption', '2025-04-08'), gw('Latest Restoration', lifted), paid(...before), paid(...after), reporter('active')],
    checks: [
      { day: frozenDay, expect: { frozen: true }, why: 'Funds frozen 2025-04-08 (File C); not lifted yet; nothing paid since March.' },
      { day: liveDay, expect: { frozen: false }, why: `Freeze lifted ${lifted} and money paid out since: unfrozen.` },
    ],
  })),

  // --- Never cut (UCLA grants not on Grant Witness) ---
  ...[
    ['R01HL160993', '2022-09-01', '2028-01-31', ['2025-06', 896381]],
    ['R01DC021174', '2024-08-23', '2029-07-31', ['2025-06', 264289]],
    ['R01AG082868', '2023-09-01', '2028-05-31', ['2025-06', 786217]],
    ['R01EY034488', '2023-09-01', '2027-06-30', ['2025-06', 638475]],
  ].map(([grantId, start, end, through]) => ({
    id: `never-cut-${grantId}`, grantId, kind: 'never cut', org: 'UCLA', start, end,
    facts: [{ source: 'gw', unlisted: true }, reporter('active'), paid(...through)],
    checks: [
      { day: '2025-08-31', expect: { frozen: false }, why: 'Never on Grant Witness; paid every month.' },
      { day: '2026-10-25', expect: { frozen: false }, why: 'RePORTER active; award notices match obligations every year.' },
    ],
  })),
];

export const GRANT_IDS = CASES.map(c => c.grantId);
