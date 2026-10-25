import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { createCancellationListSource, parseList } from '../src/sources/cancellations.ts';
import type { SourceClient } from '../src/sources/types.ts';
import { oneGrantSeed, startWorld, TEST_GRANT, type TestWorld } from './helpers.ts';

let world: TestWorld | undefined;
afterEach(() => {
  world?.stop();
  world = undefined;
});

const scratch = () => mkdtempSync(join(tmpdir(), 'gg-cancellations-'));
function listFile(rows: unknown[]): string {
  const file = join(scratch(), 'cancellations.json');
  writeFileSync(file, JSON.stringify(rows));
  return file;
}

test('list_words_map_to_our_statuses_and_unreadable_rows_are_dropped', () => {
  const rows = parseList([
    { grantId: '5R01GM061721-03', status: 'Terminated', url: 'https://list.test/1', listedOn: '2026-03-10T00:00:00Z' },
    { grantId: 'R21AI182745', status: 'Possibly reinstated', url: 'https://list.test/2' },
    { grantId: 'not a grant', status: 'Terminated', url: 'https://list.test/3' },
    { grantId: 'R01GM000009', status: 'under review', url: 'https://list.test/4' },
  ]);
  assert.deepEqual(rows, [
    { grantId: 'R01GM061721', status: 'canceled', url: 'https://list.test/1', listedOn: '2026-03-10', terminatedOn: null, restoredOn: null, supplement: null, fullAwardNumber: null },
    { grantId: 'R21AI182745', status: 'restored_by_court', url: 'https://list.test/2', listedOn: null, terminatedOn: null, restoredOn: null, supplement: null, fullAwardNumber: null },
  ]);
});

test('a_grant_missing_from_the_list_gets_no_reading', async () => {
  const source = createCancellationListSource({ file: listFile([{ grantId: 'R01GM000009', status: 'terminated', url: 'https://list.test/9' }]) });
  assert.equal(await source.read(TEST_GRANT), null);
});

test('no_scraper_output_yet_means_no_readings', async () => {
  const source = createCancellationListSource({ file: join(scratch(), 'missing.json') });
  assert.equal(await source.read(TEST_GRANT), null);
});

// A fresh checkout has no scraper output (scrapers/out/ is git-ignored); the
// saved copy of the lab grants' rows stands in, so the cut scripts work.
const scraperOutput = new URL('../../scrapers/out/cancellations.json', import.meta.url);
test('with_no_list_configured_the_saved_lab_rows_are_read', { skip: existsSync(scraperOutput) && 'scraper output present' }, async () => {
  const saved = JSON.parse(readFileSync(new URL('../cache/cancellation-list-lab.json', import.meta.url), 'utf8'));
  assert.deepEqual(parseList(saved.rows), saved.rows, 'saved as parsed');
  const was = process.env.GG_CANCELLATIONS_FILE;
  delete process.env.GG_CANCELLATIONS_FILE;
  try {
    const source = createCancellationListSource();
    assert.equal((await source.read('R01AI178875'))?.status, 'canceled');
    assert.equal((await source.read('R01GM061721'))?.status, 'restored_by_court');
    assert.equal(await source.read('R21AI182745'), null, 'not on the list');
    source.viewAsOf?.('2025-04-01');
    assert.equal(await source.read('R01AI178875'), null, 'not listed yet before its cut');
  } finally {
    if (was !== undefined) process.env.GG_CANCELLATIONS_FILE = was;
  }
});

test('on_a_fresh_checkout_the_cut_script_step_freezes_the_grant_from_the_saved_rows', { skip: existsSync(scraperOutput) && 'scraper output present' }, async () => {
  world = await startWorld({ sources: [createCancellationListSource()] });
  const grant = () => world!.worker.sessions.bookkeeping.rows('grant').find((g) => g.id === 'R01AI178875')!;
  const grantManager = await world.person('grant_manager');
  await grantManager.call('request_check', { grantId: 'R01AI178875', reason: 'check_now', asOf: '2025-04-16' });
  await world.worker.idle();
  assert.equal(grant().frozen, false, 'before the cut, not listed');
  await grantManager.call('request_check', { grantId: 'R01AI178875', reason: 'check_now', asOf: '2025-04-17' });
  await world.worker.idle();
  assert.equal(grant().status, 'canceled');
  assert.equal(grant().frozen, true);
});

test('the_newest_listing_wins', async () => {
  const source = createCancellationListSource({
    file: listFile([
      { grantId: TEST_GRANT, status: 'terminated', url: 'https://list.test/a', listedOn: '2026-03-10' },
      { grantId: TEST_GRANT, status: 'reinstated', url: 'https://list.test/b', listedOn: '2026-04-20' },
    ]),
  });
  const reading = await source.read(TEST_GRANT);
  assert.equal(reading?.status, 'restored_by_court');
  assert.equal(reading?.url, 'https://list.test/b');
});

test('the_apify_token_is_sent_in_a_header_and_never_saved', async () => {
  const cacheDir = scratch();
  const seen: Array<{ url: string; auth: string | null }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    seen.push({ url: String(input), auth: new Headers(init?.headers).get('authorization') });
    return Response.json([{ grantId: TEST_GRANT, status: 'Terminated', url: 'https://list.test/x', scraperNote: 'dropped' }]);
  };
  const source = createCancellationListSource({ dataset: 'ds123', token: 'secret-token', fetchImpl, cacheDir, mode: 'live' });
  assert.equal((await source.read(TEST_GRANT))?.status, 'canceled');
  assert.equal(seen[0].auth, 'Bearer secret-token');
  assert.doesNotMatch(seen[0].url, /secret-token/);
  const saved = readdirSync(cacheDir).map((name) => readFileSync(join(cacheDir, name), 'utf8')).join('\n');
  assert.doesNotMatch(saved, /secret-token/);
  assert.doesNotMatch(saved, /scraperNote/, 'only the fields the tracker reads are saved');

  const offline = createCancellationListSource({ dataset: 'ds123', cacheDir, mode: 'offline' });
  assert.equal((await offline.read(TEST_GRANT))?.status, 'canceled', 'the saved copy serves the demo offline');
});

test('reads_only_the_needed_fields_of_the_actor_s_latest_run_once_per_check', async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    return Response.json([
      { grantId: TEST_GRANT, status: 'canceled', url: 'https://list.test/a' },
      { grantId: 'R21AI182745', status: 'active', url: 'https://list.test/b' },
    ]);
  };
  const source = createCancellationListSource({ actor: 'someone~cancellation-list', fetchImpl, cacheDir: scratch(), mode: 'live' });
  assert.equal((await source.read(TEST_GRANT))?.status, 'canceled');
  assert.equal((await source.read('R21AI182745'))?.status, 'active');
  assert.equal(urls.length, 1, 'one download serves every grant in a check');
  const url = new URL(urls[0]);
  assert.equal(url.pathname, '/v2/acts/someone~cancellation-list/runs/last/dataset/items');
  assert.equal(url.searchParams.get('status'), 'SUCCEEDED');
  assert.equal(url.searchParams.get('fields'), 'grantId,status,url,listedOn,terminatedOn,restoredOn,supplement,fullAwardNumber');
});

test('the_saved_copy_keeps_only_the_lab_s_grants', async () => {
  const cacheDir = scratch();
  const fetchImpl: typeof fetch = async () =>
    Response.json([
      { grantId: TEST_GRANT, status: 'canceled', url: 'https://list.test/a' },
      { grantId: 'R01GM000009', status: 'canceled', url: 'https://list.test/other-lab' },
    ]);
  await createCancellationListSource({ actor: 'someone~list', grants: [TEST_GRANT], fetchImpl, cacheDir, mode: 'live' }).read(TEST_GRANT);
  const saved = readdirSync(cacheDir).map((name) => readFileSync(join(cacheDir, name), 'utf8')).join('\n');
  assert.match(saved, /list\.test\/a/);
  assert.doesNotMatch(saved, /other-lab/);
});

test('the_scraper_s_cancellation_disagreeing_with_reporter_raises_a_flag', async () => {
  const reporter: SourceClient = {
    source: 'NIH RePORTER',
    read: async (grantId) => ({ grantId, source: 'NIH RePORTER', status: 'active', awarded: null, paid: null, endDate: null, url: 'https://reporter.test' }),
  };
  const list = createCancellationListSource({ file: listFile([{ grantId: TEST_GRANT, status: 'Terminated', url: 'https://list.test/t' }]) });
  world = await startWorld({ seedJson: oneGrantSeed(), sources: [reporter, list] });
  await world.worker.tracker.refresh();
  await world.worker.idle();
  const conn = world.worker.sessions.bookkeeping;
  const flags = conn.rows('flag').filter((flag) => flag.kind === 'sources_disagree');
  assert.equal(flags.length, 1);
  assert.match(flags[0].summary, /NIH RePORTER says active; Cancellation list \(Apify\) says canceled/);
  assert.deepEqual(conn.rows('statusEvent').map((event) => event.kind), ['canceled']);
  assert.equal(conn.rows('grant')[0].frozen, true);
});

// Check now on a live Actor: a fresh run, then that run's dataset. The
// network is the only thing faked: the run API and two datasets.
function apifyWithFreshRun({ runFails = false } = {}) {
  const posts: Array<{ url: string; auth: string | null }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (init?.method === 'POST') {
      posts.push({ url: String(input), auth: new Headers(init.headers).get('authorization') });
      if (runFails) return new Response('Actor is broken', { status: 500 });
      return Response.json({ data: { id: 'run-fresh', status: 'SUCCEEDED', defaultDatasetId: 'ds-fresh' } });
    }
    if (url.pathname === '/v2/datasets/ds-fresh/items') {
      return Response.json([{ grantId: TEST_GRANT, status: 'Terminated', url: 'https://list.test/fresh' }]);
    }
    return Response.json([{ grantId: TEST_GRANT, status: 'active', url: 'https://list.test/latest' }]);
  };
  const source = createCancellationListSource({ actor: 'someone~list', token: 'secret-token', fetchImpl, cacheDir: scratch(), mode: 'live' });
  return { source, posts };
}

const listReadings = (conn: TestWorld['worker']['sessions']['bookkeeping']) =>
  conn.rows('sourceReading').filter((reading) => reading.source === 'Cancellation list (Apify)').map((reading) => reading.status);

test('check_now_starts_a_fresh_actor_run_and_reads_its_dataset', async () => {
  const { source, posts } = apifyWithFreshRun();
  world = await startWorld({ seedJson: oneGrantSeed(), sources: [source] });
  const conn = world.worker.sessions.bookkeeping;
  assert.deepEqual(listReadings(conn), [], 'nothing is read until someone asks');
  assert.equal(posts.length, 0);

  const grantManager = await world.person('grant_manager');
  await grantManager.call('request_check', { reason: 'check_now' });
  await world.worker.idle();

  assert.equal(posts.length, 1);
  const run = new URL(posts[0].url);
  assert.equal(run.pathname, '/v2/acts/someone~list/runs');
  assert.equal(run.searchParams.get('waitForFinish'), '60');
  assert.equal(posts[0].auth, 'Bearer secret-token');
  assert.doesNotMatch(posts[0].url, /secret-token/);
  assert.deepEqual(listReadings(conn), ['canceled'], 'check now read the fresh run, not the latest one');
  assert.equal(conn.rows('checkRequest')[0].done, true);
});

test('a_failed_actor_run_falls_back_to_the_latest_run_and_still_finishes_the_check', async () => {
  const { source, posts } = apifyWithFreshRun({ runFails: true });
  world = await startWorld({ seedJson: oneGrantSeed(), sources: [source] });
  const conn = world.worker.sessions.bookkeeping;
  const grantManager = await world.person('grant_manager');
  await grantManager.call('request_check', { reason: 'check_now' });
  await world.worker.idle();

  assert.equal(posts.length, 1);
  assert.deepEqual(listReadings(conn), ['active']);
  assert.equal(conn.rows('checkRequest')[0].done, true);
});

test('a_recheck_before_money_moves_starts_no_actor_run', async () => {
  const { source, posts } = apifyWithFreshRun();
  world = await startWorld({ seedJson: oneGrantSeed(), sources: [source] });
  await world.worker.sessions.bookkeeping.call('request_check', { grantId: TEST_GRANT, reason: 'before_money_moves' });
  await world.worker.idle();
  assert.equal(posts.length, 0);
});

// Demo time buttons (T59). The real list's row for R01GM061721: terminated
// 2025-07-31, reinstated 2025-09-22 (Thakur v. Trump).
const realRow = { grantId: TEST_GRANT, status: 'restored_by_court', url: 'https://list.test/gw', listedOn: '2025-09-22', terminatedOn: '2025-07-31', restoredOn: '2025-09-22' };
const checkAsOf = async (asOf?: string, reason: 'check_now' | 'before_money_moves' = 'check_now') => {
  const grantManager = await world!.person('grant_manager');
  await grantManager.call('request_check', { reason, asOf });
  await world!.worker.idle();
};

test('check_now_as_of_a_day_reads_the_list_as_it_stood_that_day', async () => {
  world = await startWorld({ seedJson: oneGrantSeed(), sources: [createCancellationListSource({ file: listFile([realRow]) })] });
  const conn = world.worker.sessions.bookkeeping;
  await checkAsOf('2025-07-30');
  assert.deepEqual(listReadings(conn), [], 'not listed before the cut');
  await checkAsOf('2025-08-15');
  assert.deepEqual(listReadings(conn), ['canceled']);
  await checkAsOf('2025-09-22');
  assert.deepEqual(listReadings(conn), ['canceled', 'restored_by_court']);
});

test('the_demo_time_holds_for_a_recheck_before_money_moves', async () => {
  world = await startWorld({ seedJson: oneGrantSeed(), sources: [createCancellationListSource({ file: listFile([realRow]) })] });
  await checkAsOf('2025-08-15');
  await checkAsOf(undefined, 'before_money_moves');
  assert.deepEqual(listReadings(world.worker.sessions.bookkeeping), ['canceled'], 'still as of 2025-08-15, not today');
});

test('a_demo_time_that_is_not_a_real_day_is_refused', async () => {
  world = await startWorld({ seedJson: oneGrantSeed() });
  const grantManager = await world.person('grant_manager');
  await assert.rejects(grantManager.call('request_check', { reason: 'check_now', asOf: '2025-02-30' }), /real date/);
});

// Cut scripts (T65).
test('a_backdated_cut_is_dated_on_the_list_s_termination_day_and_flags_an_order_placed_after_it', async () => {
  const order = { id: 'o-late', requestId: 'rq-late', grantId: TEST_GRANT, vendor: 'Sigma-Aldrich', amount: 1240, placed: '2025-08-05', state: 'paid' };
  world = await startWorld({ seedJson: oneGrantSeed({ orders: [order] }), sources: [createCancellationListSource({ file: listFile([realRow]) })] });
  const conn = world.worker.sessions.bookkeeping;
  await checkAsOf('2025-08-15');
  await world.worker.idle();

  const cut = conn.rows('statusEvent').find((event) => event.kind === 'canceled');
  assert.equal(cut?.day, '2025-07-31');
  const flag = conn.rows('flag').find((row) => row.kind === 'spend_while_canceled');
  assert.match(flag?.summary ?? '', /o-late.*5 days after/);
});

// T74: F31DC022138's real row. Restored by a court on 2025-09-18 (Harvard v.
// HHS), then listed as terminated again; the list keeps only the latest status.
test('a_list_that_still_says_terminated_after_a_restoration_cuts_the_grant_again_once', async () => {
  const recut = { grantId: TEST_GRANT, status: 'Terminated', url: 'https://list.test/gw', listedOn: '2025-05-06', terminatedOn: '2025-05-06', restoredOn: '2025-09-18' };
  world = await startWorld({ seedJson: oneGrantSeed(), sources: [createCancellationListSource({ file: listFile([recut]) })] });
  const conn = world.worker.sessions.bookkeeping;
  const grant = () => conn.rows('grant').find((row) => row.id === TEST_GRANT)!;
  const cuts = () => conn.rows('statusEvent').filter((event) => event.kind === 'canceled').map((event) => event.day);
  await checkAsOf('2025-05-06');
  const grantManager = await world.person('grant_manager');
  await grantManager.call('inject_status_event', { grantId: TEST_GRANT, kind: 'court_order', source: 'Court notice', summary: 'Harvard v. HHS.', day: '2025-09-18' });
  await grantManager.call('inject_status_event', { grantId: TEST_GRANT, kind: 'payment_received', source: 'Payment system', summary: 'Drawdown.', amount: 5_116, day: '2025-11-30' });
  await world.worker.idle();
  assert.equal(grant().frozen, false, 'restored and paid');

  await checkAsOf('2026-01-31');
  assert.deepEqual(cuts(), ['2025-05-06', '2026-06-15'], 'cut again, noticed today');
  assert.equal(grant().status, 'canceled');
  assert.equal(grant().frozen, true);
  assert.match(conn.rows('statusEvent').at(-1)?.summary ?? '', /2025-09-18/);

  await checkAsOf('2026-02-28');
  assert.equal(cuts().length, 2, 'posted once');
});

test('a_listed_supplement_posts_a_notice_once_and_does_not_freeze_the_award', async () => {
  const supplementRow = {
    grantId: TEST_GRANT, status: 'Terminated', url: 'https://list.test/s1', listedOn: '2025-06-17', terminatedOn: '2025-06-17',
    supplement: 'S1', fullAwardNumber: `3${TEST_GRANT}-12S1`,
  };
  world = await startWorld({ seedJson: oneGrantSeed(), sources: [createCancellationListSource({ file: listFile([supplementRow]) })] });
  const conn = world.worker.sessions.bookkeeping;
  await checkAsOf('2025-07-01');
  await checkAsOf('2025-07-02');

  assert.deepEqual(listReadings(conn), []);
  const events = conn.rows('statusEvent');
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'reading_changed');
  assert.equal(events[0].day, '2025-06-17');
  assert.match(events[0].summary, /supplement S1.*not frozen/);
  assert.equal(conn.rows('grant')[0].frozen, false);
});

test('a_check_for_one_grant_moves_only_that_grant_s_demo_time', async () => {
  const base = JSON.parse(oneGrantSeed());
  const other = { ...base.grants[0], id: 'R21AI182745', title: 'Other grant' };
  const rows = [realRow, { ...realRow, grantId: other.id, url: 'https://list.test/other' }];
  world = await startWorld({ seedJson: oneGrantSeed({ grants: [base.grants[0], other] }), sources: [createCancellationListSource({ file: listFile(rows) })] });
  const conn = world.worker.sessions.bookkeeping;
  const grantManager = await world.person('grant_manager');
  await checkAsOf('2025-07-30');
  await grantManager.call('request_check', { grantId: other.id, reason: 'check_now', asOf: '2025-08-15' });
  await world.worker.idle();
  await checkAsOf(undefined, 'before_money_moves');

  const statusOf = (grantId: string) => conn.rows('sourceReading').filter((r) => r.grantId === grantId).map((r) => r.status);
  assert.deepEqual(statusOf(TEST_GRANT), [], 'still as of 2025-07-30');
  assert.deepEqual(statusOf(other.id), ['canceled']);
});

test('a_check_for_every_grant_keeps_a_grant_at_its_own_demo_time', async () => {
  const before = { grantId: TEST_GRANT, reason: 'check_now', requestedBy: 'grant_manager', day: '2026-06-15', asOf: '2025-07-30' };
  world = await startWorld({ seedJson: oneGrantSeed({ checkRequests: [before] }), sources: [createCancellationListSource({ file: listFile([realRow]) })] });
  await checkAsOf(undefined);
  assert.deepEqual(listReadings(world.worker.sessions.bookkeeping), [], 'still as of 2025-07-30, not today');
});
