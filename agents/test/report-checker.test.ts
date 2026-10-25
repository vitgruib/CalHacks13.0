import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';

import { correctionFrom, creditedGrant, NO_GRANT_ON_RECORD, startReportChecker } from '../src/agents/report-checker.ts';
import type { Tracker } from '../src/agents/bookkeeping.ts';
import type { Connection, HoldRow, ReportPaperRow } from '../src/db/contract.ts';
import { createLocalDb, SIM_SEED } from '../src/db/local.ts';
import { fallbackCorrection } from '../src/prompts/report-checker.ts';
import { createPaperLookup, type PaperLookup } from '../src/sources/papers.ts';
import { createSimPaperLookup, isSimPaperLookup, simPapersFromSeed } from '../src/sources/sim-papers.ts';
import { oneGrantSeed, startWorld, TEST_GRANT, type TestWorld } from './helpers.ts';

let world: TestWorld | undefined;
afterEach(() => {
  world?.stop();
  world = undefined;
});

const simSeedJson = readFileSync(SIM_SEED, 'utf8');
const simSeedWith = (change: Record<string, unknown>) => JSON.stringify({ ...JSON.parse(simSeedJson), ...change });

const conn = () => world!.worker.sessions.payment_report;
const paper = (id: string): ReportPaperRow => {
  const row = conn().rows('reportPaper').find((p) => p.id === id);
  assert.ok(row, `no paper ${id}`);
  return row;
};
const reportHolds = (id: string): HoldRow[] => conn().rows('hold').filter((h) => h.kind === 'report' && h.refId === id);
const openHold = (id: string): HoldRow => {
  const open = reportHolds(id).filter((h) => h.open);
  assert.equal(open.length, 1, `one open Inbox item for ${id}`);
  return open[0];
};
const failedChecks = (row: ReportPaperRow) => row.checks.filter((c) => !c.pass).map((c) => c.check);
const said = (hold: HoldRow) => [hold.title, hold.why, ...hold.evidence.map((e) => `${e.label}: ${e.value}`)].join('\n');

// Saved Crossref/PubMed answers only (agents/cache/). A fetch would fail the test.
const noNetwork: typeof fetch = async (input) => {
  throw new Error(`test reached the network: ${String(input)}`);
};
const offlinePapers = () => createPaperLookup({ mode: 'offline', throttle: false, fetchImpl: noNetwork });

// ── The planted cases (sim/answer-key.json) ────────────────────────────────

test('rp_1_a_paper_crediting_the_wrong_grant_is_held_with_the_cost_move_and_the_days_left', async () => {
  world = await startWorld();
  const p10 = paper('p-10');
  assert.equal(p10.result, 'held');
  assert.equal(p10.creditsGrantId, 'R01GM061721');
  assert.deepEqual(failedChecks(p10), ['Credits this grant']);

  const hold = openHold('p-10');
  assert.equal(hold.grantId, 'R21AI182745');
  assert.match(hold.why, /move rq-035's \$2,100 from R21AI182745 to R01GM061721; 38 days left on the 90-day limit \(fix by 2026-07-23\)/);
  assert.match(hold.why, /"Credits this grant" failed: Listed in R21AI182745's report, but its acknowledgments name R01GM061721\./);
  const evidence = new Map(hold.evidence.map((e) => [e.label, e.value]));
  assert.equal(evidence.get('Proposed cost move'), "move rq-035's $2,100 from R21AI182745 to R01GM061721 (o-035, charged 2026-04-24)");
  assert.equal(evidence.get('90-day limit'), 'Charged 2026-04-24: 38 days left on the 90-day limit (fix by 2026-07-23)');
  // Approve moves no money, so the To do says who moves the charge.
  assert.equal(
    evidence.get('What to do'),
    "Move rq-035's $2,100 from R21AI182745 to R01GM061721 in the ledger by 2026-07-23 (GrantGuard doesn't move charges), list the paper in R01GM061721's report, then approve.",
  );
  // The grant the cost would move to is frozen; the Inbox says so, in the module's words.
  assert.match(evidence.get('R01GM061721 now') ?? '', /spending frozen/);
  // The module's own evidence is kept.
  assert.equal(evidence.get('Credits this grant'), "Listed in R21AI182745's report, but its acknowledgments name R01GM061721.");
  assert.deepEqual(hold.options, ['approve', 'reject']);
});

test('rp_2_a_paper_missing_its_pmcid_is_held', async () => {
  world = await startWorld();
  const p03 = paper('p-03');
  assert.equal(p03.result, 'held');
  assert.equal(p03.pmcid, undefined);
  assert.deepEqual(failedChecks(p03), ['Has a PubMed Central ID']);
  assert.match(said(openHold('p-03')), /PubMed Central/);
  assert.match(openHold('p-03').why, /NIH public access policy requires one/);
});

test('rp_3_an_undisclosed_material_correction_is_held_and_asks_to_disclose_it', async () => {
  world = await startWorld();
  const p04 = paper('p-04');
  assert.equal(p04.result, 'held');
  assert.deepEqual(failedChecks(p04), ['No undisclosed correction']);
  assert.equal(p04.correction?.kind, 'material');
  assert.equal(p04.correction?.disclosed, false, "the report's own disclosure is kept");
  assert.match(p04.correction?.note ?? '', /^Correction \(2026-03-02\): the Figure 3 rate constants were re-measured/);
  const hold = openHold('p-04');
  assert.match(hold.why, /Disclose the correction in the report/);
  assert.match(hold.why, /Only a material correction holds the report, and this one is material/);
});

test('rp_d1_an_affiliation_correction_is_a_note_never_a_hold', async () => {
  world = await startWorld();
  const p05 = paper('p-05');
  assert.ok(p05.result === 'note' || p05.result === 'ok', p05.result);
  assert.equal(p05.correction?.kind, 'minor');
  assert.deepEqual(reportHolds('p-05'), []);
});

test('rp_d2_a_disclosed_retraction_is_ok_never_a_hold', async () => {
  world = await startWorld();
  const p07 = paper('p-07');
  assert.ok(p07.result === 'ok' || p07.result === 'note', p07.result);
  assert.equal(p07.correction?.kind, 'retraction');
  assert.equal(p07.correction?.disclosed, true);
  assert.deepEqual(reportHolds('p-07'), []);
});

test('every_sim_paper_is_checked_and_only_the_three_planted_ones_are_held', async () => {
  world = await startWorld();
  const rows = conn().rows('reportPaper');
  assert.equal(rows.length, 12);
  assert.ok(rows.every((row) => row.checked));
  assert.deepEqual(rows.filter((row) => row.result === 'held').map((row) => row.id), ['p-03', 'p-04', 'p-10']);
  const open = conn().rows('hold').filter((h) => h.kind === 'report' && h.open);
  assert.deepEqual(open.map((h) => h.refId).sort(), ['p-03', 'p-04', 'p-10']);
  for (const row of rows.filter((r) => !['p-03', 'p-04', 'p-05', 'p-10'].includes(r.id))) assert.equal(row.result, 'ok', row.id);
});

// ── Loop safety ────────────────────────────────────────────────────────────

test('a_second_idle_and_a_restarted_checker_record_nothing_new', async () => {
  world = await startWorld();
  const before = world.db.version();
  await world.worker.idle();
  assert.equal(world.db.version(), before, 'a second round finds nothing to do');

  const again = startReportChecker({ conn: conn(), tracker: world.worker.tracker, papers: offlinePapers() });
  await again.idle();
  await world.worker.idle();
  again.stop();
  assert.equal(world.db.version(), before, 'a restart redoes nothing');
});

test('reloading_the_seed_checks_every_paper_again_once', async () => {
  world = await startWorld();
  const lab = await world.person('grant_manager');
  await lab.call('load_seed', { json: simSeedJson });
  await world.worker.idle();
  assert.ok(conn().rows('reportPaper').every((row) => row.checked));
  for (const id of ['p-03', 'p-04', 'p-10']) openHold(id);
  assert.equal(conn().rows('hold').filter((h) => h.kind === 'report').length, 6, 'the module raised three, the agent replaced each once');
});

test('a_decided_report_hold_is_not_raised_again', async () => {
  world = await startWorld();
  const manager = await world.person('grant_manager');
  await manager.call('decide_hold', { holdId: openHold('p-10').id, choice: 'approve', reason: 'Moving the fee to the grant the paper credits.' });
  await world.worker.idle();
  assert.equal(paper('p-10').result, 'note');
  assert.deepEqual(reportHolds('p-10').filter((h) => h.open), []);
  const before = world.db.version();
  await world.worker.idle();
  assert.equal(world.db.version(), before);
});

test('past_the_90_day_limit_the_inbox_says_how_many_days_late', async () => {
  world = await startWorld({ seedJson: simSeedWith({ today: '2026-07-30' }) });
  const hold = openHold('p-10');
  assert.match(hold.why, /7 days past the 90-day limit, which ended 2026-07-23/);
});

// ── Real papers, through the saved Crossref and PubMed answers ─────────────

const realGrant = (id: string) => ({
  id, title: 'Test grant', pi: 'Test PI', agency: 'NIH', awarded: 300_000, received: 100_000, spent: 50_000, promised: 0,
  start: '2025-01-01', end: '2028-06-30', status: 'active',
});
const realPaper = (id: string, grantId: string, doi: string, extra: Record<string, unknown> = {}) => ({
  id, grantId, title: `Listed paper ${id}`, doi, creditsGrantId: grantId, checks: [], result: 'ok', checked: false, ...extra,
});
const realWorld = (papers: unknown[]) =>
  startWorld({ seedJson: oneGrantSeed({ grants: [realGrant('R01AI181732'), realGrant('R01CA197422')], papers }), papers: offlinePapers() });

test('a_real_doi_is_checked_end_to_end_from_the_saved_answers', async () => {
  world = await realWorld([
    realPaper('r-1', 'R01AI181732', 'https://doi.org/10.3201/EID3208.260433'),
    realPaper('r-2', 'R01AI181732', '10.1097/OLQ.0000000000002380'),
  ]);
  const clean = paper('r-1');
  assert.equal(clean.result, 'ok');
  assert.equal(clean.pmcid, 'PMC13426860');
  assert.equal(clean.creditsGrantId, 'R01AI181732');

  const notInPmc = paper('r-2');
  assert.equal(notInPmc.result, 'held');
  assert.deepEqual(failedChecks(notInPmc), ['Has a PubMed Central ID']);
  assert.match(said(openHold('r-2')), /api\.crossref\.org/, 'the Inbox links the public record');
});

test('a_real_paper_crediting_a_grant_outside_the_lab_is_recorded_and_held_without_a_cost_move', async () => {
  // The module takes any grant number as the credit; nothing to refuse.
  world = await realWorld([realPaper('r-3', 'R01AI181732', '10.1001/jamanetworkopen.2023.2937')]);
  const row = paper('r-3');
  assert.equal(row.creditsGrantId, 'P30MH062246');
  assert.equal(row.result, 'held');
  assert.deepEqual(failedChecks(row), ['Credits this grant'], 'the affiliation erratum is only a note');
  assert.equal(row.correction?.kind, 'minor');
  const hold = openHold('r-3');
  assert.match(hold.why, /P30MH062246 is not one of the lab's grants, so there is no cost to move/);
  assert.ok(!hold.evidence.some((e) => e.label === 'Proposed cost move'));
});

test('a_real_correction_whose_notice_title_says_nothing_is_held_for_a_person', async () => {
  world = await realWorld([realPaper('r-4', 'R01CA197422', '10.1136/bmj-2022-072924')]);
  const row = paper('r-4');
  assert.equal(row.creditsGrantId, 'R01CA197422');
  assert.equal(row.pmcid, 'PMC10535030');
  assert.equal(row.correction?.kind, 'material');
  assert.match(row.correction?.note ?? '', /^Correction \(2025-12-12\): Correction: Ionising radiation/);
  assert.deepEqual(failedChecks(row), ['No undisclosed correction']);
  // Crossref and PubMed report the same notice: it is listed once.
  assert.equal(row.correction?.note.match(/Correction \(/g)?.length, 1);
});

test('every_saved_real_paper_is_checked_offline', async () => {
  // The demo papers in agents/src/sources/papers.md (their notices are saved too: 20 DOIs in all).
  const expected: Array<[string, string, string]> = [
    ['10.3201/eid3208.260433', 'R01AI181732', 'ok'],
    ['10.1097/OLQ.0000000000002380', 'R01AI181732', 'held'], // not in PMC
    ['10.1001/jamaophthalmol.2023.6830', 'R01EY028739', 'ok'],
    ['10.1016/j.ophtha.2022.05.008', 'R01EY028739', 'ok'], // the grant is only in Crossref
    ['10.1001/jamanetworkopen.2022.42240', 'R01EY028739', 'held'], // neither index lists the grant
    ['10.1093/cid/ciab121', 'R01EY028739', 'ok'],
    ['10.1136/bmj-2022-072924', 'R01CA197422', 'held'], // material correction
    ['10.1001/jamanetworkopen.2024.34707', 'R01CA197422', 'held'], // "Error in Data and Analyses."
    ['10.1016/S0140-6736(20)31180-6', 'R01AI181732', 'held'], // retracted
    ['10.1001/jamanetworkopen.2023.2937', 'R01AI181732', 'held'], // credits other grants; the erratum is minor
    ['10.1371/journal.pone.0330427', 'R01AI181732', 'held'],
    ['10.1038/s41598-025-22661-4', 'R01AI181732', 'held'],
  ];
  world = await startWorld({
    seedJson: oneGrantSeed({
      grants: ['R01AI181732', 'R01EY028739', 'R01CA197422'].map(realGrant),
      papers: expected.map(([doi, grantId], i) => realPaper(`r-${i + 1}`, grantId, doi)),
    }),
    papers: offlinePapers(),
  });
  const results = conn().rows('reportPaper').map((row) => [row.doi, row.grantId, row.checked ? row.result : 'unchecked']);
  assert.deepEqual(results.sort(), expected.map(([doi, grantId, result]) => [doi, grantId, result]).sort());
  const lancet = conn().rows('reportPaper').find((row) => row.doi.startsWith('10.1016/S0140'))!;
  assert.equal(lancet.correction?.kind, 'retraction');
  assert.equal(lancet.creditsGrantId, NO_GRANT_ON_RECORD);
  assert.equal(conn().rows('hold').filter((h) => h.kind === 'report' && h.open).length, 8);
});

test('a_doi_crossref_does_not_know_goes_to_the_grant_manager_unchecked', async () => {
  world = await realWorld([realPaper('r-5', 'R01AI181732', '10.5555/grantguard-not-a-real-doi')]);
  assert.equal(paper('r-5').checked, false);
  assert.match(openHold('r-5').title, /has no public record/);
  const before = world.db.version();
  await world.worker.idle();
  assert.equal(world.db.version(), before);
});

test('approving_a_no_public_record_hold_does_not_bring_it_back', async () => {
  world = await realWorld([realPaper('r-5', 'R01AI181732', '10.5555/grantguard-not-a-real-doi')]);
  const manager = await world.person('grant_manager');
  await manager.call('decide_hold', { holdId: openHold('r-5').id, choice: 'approve', reason: 'The DOI is a preprint; fine as listed.' });
  await world.worker.idle();
  // The approval marks the paper a note, which reaches the checker as an update.
  assert.equal(paper('r-5').result, 'note');
  assert.deepEqual(reportHolds('r-5').filter((h) => h.open), [], "the grant manager's decision stands");
  assert.equal(reportHolds('r-5').length, 1);
});

test('a_correction_notice_with_a_long_title_is_still_recorded', async () => {
  // A real "Correction to: <paper title>" can run past 250 characters.
  const title =
    'Correction to: Association of long-term exposure to fine particulate matter and nitrogen dioxide with cardiovascular, ' +
    'respiratory and all-cause mortality in a nationwide cohort of older adults enrolled in Medicare fee-for-service between 2000 and 2016';
  const notice = { kind: 'correction' as const, noticeDoi: null, noticePmid: null, title, date: '2024-01-01', source: 'Crossref' as const, via: 'test' };
  const { correction, assessment } = await correctionFrom({ correction: undefined }, { doi: '10.1/long', title: 'x', updates: [notice] });
  assert.equal(correction?.kind, 'material');
  assert.ok(assessment && assessment.length <= 300, `reason too long: ${assessment}`);
  const affiliation = await correctionFrom({ correction: undefined }, { doi: '10.1/long', title: 'x', updates: [{ ...notice, title: `Error in author affiliations. ${title}` }] });
  assert.equal(affiliation.correction?.kind, 'minor');
});

test('a_lookup_that_fails_asks_the_grant_manager_once_and_the_rest_go_on', async (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  world = await realWorld([
    realPaper('r-6', 'R01AI181732', '10.1234/not-in-the-saved-answers'),
    realPaper('r-7', 'R01AI181732', '10.3201/eid3208.260433'),
  ]);
  assert.equal(paper('r-6').checked, false);
  const [hold, ...more] = reportHolds('r-6');
  assert.deepEqual(more, [], 'asked once');
  assert.equal(hold.open, true);
  assert.match(hold.title, /public record couldn't be read/);
  assert.match(said(hold), /10\.1234\/not-in-the-saved-answers/);
  assert.equal(paper('r-7').result, 'ok');
  assert.ok(errors.mock.calls.some((call) => String(call.arguments[0]).includes('report checker: paper r-6')));
  const before = world.db.version();
  await world.worker.idle();
  assert.equal(world.db.version(), before, 'a second idle asks nothing new');
});

test('approving_a_failed_lookup_looks_the_paper_up_again_and_asks_once', async (t) => {
  t.mock.method(console, 'error', () => {});
  world = await realWorld([realPaper('r-6', 'R01AI181732', '10.1234/not-in-the-saved-answers')]);
  const manager = await world.person('grant_manager');
  await manager.call('decide_hold', { holdId: openHold('r-6').id, choice: 'approve', reason: 'Fixed the DOI typo in the report.' });
  await world.worker.idle();
  // Still unreachable offline: looked up again, but the same DOI isn't asked about twice.
  assert.equal(paper('r-6').checked, false);
  assert.deepEqual(reportHolds('r-6').filter((h) => h.open), []);
  assert.equal(reportHolds('r-6').length, 1);
});

// ── The module refuses, and the agent copes ────────────────────────────────

test('the_module_refuses_paper_facts_from_another_agent_and_the_checker_keeps_going', async (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const db = await createLocalDb({ world: 'sim' });
  const purchasing: Connection = await db.connect();
  await purchasing.call('register_agent', { role: 'purchasing' });
  const tracker: Tracker = { refresh: async () => {}, idle: async () => {}, stop() {} };
  const checker = startReportChecker({ conn: purchasing, tracker, papers: offlinePapers() });
  await checker.idle();
  await db.settled();
  checker.stop();

  assert.ok(purchasing.rows('reportPaper').every((row) => !row.checked), 'nothing was recorded');
  assert.deepEqual(purchasing.rows('hold').filter((h) => h.kind === 'report'), []);
  const refusals = errors.mock.calls.filter((call) => /Only the payment_report agent can do this/.test(String(call.arguments[1])));
  assert.equal(refusals.length, 12, 'every paper was tried; one refusal did not stop the others');
  db.close();
});

// ── The pieces ─────────────────────────────────────────────────────────────

test('the_correction_reader_tells_a_cosmetic_fix_from_a_material_one', () => {
  const notice = (title: string | null, kind: 'correction' | 'expression_of_concern' = 'correction') => ({ kind, date: null, title, source: 'PubMed' });
  assert.equal(fallbackCorrection([notice('Error in Affiliation.')]).kind, 'minor');
  assert.equal(fallbackCorrection([notice("one author's affiliation was corrected.")]).kind, 'minor');
  assert.equal(fallbackCorrection([notice('Error in Author Name.')]).kind, 'minor');
  assert.equal(fallbackCorrection([notice('Error in Data and Analyses.')]).kind, 'material');
  assert.equal(fallbackCorrection([notice('Error in Affiliation and Results.')]).kind, 'material');
  assert.equal(fallbackCorrection([notice('Correction: Disparities in spatial access to primary care')]).kind, 'material', 'a title that says nothing goes to a person');
  assert.equal(fallbackCorrection([notice(null)]).kind, 'material');
  assert.equal(fallbackCorrection([notice('Expression of concern: a registry analysis', 'expression_of_concern')]).kind, 'material');
});

test('every_seed_correction_reads_as_the_seed_classifies_it', async () => {
  const sim = createSimPaperLookup({ real: offlinePapers() });
  const seed = JSON.parse(simSeedJson) as { papers: Array<{ id: string; doi: string; correction?: { kind: string; disclosed: boolean } }> };
  const corrected = seed.papers.filter((p) => p.correction);
  assert.ok(corrected.length >= 3);
  for (const p of corrected) {
    const record = await sim.lookup(p.doi);
    assert.ok(record);
    const { correction } = await correctionFrom({ correction: undefined }, record);
    assert.equal(correction?.kind, p.correction!.kind, p.id);
    assert.equal(correction?.disclosed, false, 'disclosure comes from the report, not the public record');
  }
});

test('the_credited_grant_is_the_report_s_own_then_another_lab_grant_then_whatever_is_listed', () => {
  assert.equal(creditedGrant({ grantsCredited: ['R01AI143439', 'R01AI181732'] }, '5R01AI181732-02', []), '5R01AI181732-02');
  assert.equal(creditedGrant({ grantsCredited: ['R01GM061721'] }, 'R21AI182745', ['R01GM061721', 'R21AI182745']), 'R01GM061721');
  assert.equal(creditedGrant({ grantsCredited: ['AI182745'] }, 'R21AI182745', []), 'R21AI182745', 'institute and serial only still match');
  assert.equal(creditedGrant({ grantsCredited: ['P30MH062246', 'P30AG024409'] }, 'R01AI181732', ['R01AI181732']), 'P30MH062246');
  assert.equal(creditedGrant({ grantsCredited: [] }, 'R01AI181732', ['R01AI181732']), NO_GRANT_ON_RECORD);
  assert.equal(creditedGrant({ grantsCredited: [TEST_GRANT] }, TEST_GRANT, [TEST_GRANT]), TEST_GRANT, 'a made-up id matches itself');
});

test('the_sim_registry_answers_seed_dois_and_passes_every_other_doi_to_the_real_client', async () => {
  const asked: string[] = [];
  const real: PaperLookup = {
    async lookup(doi) {
      asked.push(doi);
      return null;
    },
    grantPublications: async () => [],
  };
  const sim = createSimPaperLookup({ real, papers: simPapersFromSeed(simSeedJson) });
  assert.ok(isSimPaperLookup(sim));
  assert.ok(!isSimPaperLookup(real));

  const p10 = await sim.lookup('https://doi.org/10.5555/GG.2026.0010');
  assert.deepEqual(p10?.grantsCredited, ['R01GM061721']);
  assert.equal(p10?.pmcid, 'PMC11000010');
  assert.equal((await sim.lookup('10.5555/gg.2026.0003'))?.pmcid, null);
  const p07 = await sim.lookup('10.5555/gg.2024.0007');
  assert.equal(p07?.updates[0].kind, 'retraction');
  assert.equal(p07?.updates[0].date, '2025-11-18');
  assert.ok(!JSON.stringify(p07).includes('disclosed'));

  assert.equal(await sim.lookup('10.3201/eid3208.260433'), null);
  assert.equal(await sim.lookup('10.5555/grantguard-not-a-real-doi'), null);
  assert.deepEqual(asked, ['10.3201/eid3208.260433', '10.5555/grantguard-not-a-real-doi']);
});
