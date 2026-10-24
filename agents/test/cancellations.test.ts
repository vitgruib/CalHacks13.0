import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    { grantId: 'R01GM061721', status: 'canceled', url: 'https://list.test/1', listedOn: '2026-03-10' },
    { grantId: 'R21AI182745', status: 'restored_by_court', url: 'https://list.test/2', listedOn: null },
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
  assert.equal(url.searchParams.get('fields'), 'grantId,status,url,listedOn');
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
  const conn = world.worker.sessions.bookkeeping;
  const flags = conn.rows('flag').filter((flag) => flag.kind === 'sources_disagree');
  assert.equal(flags.length, 1);
  assert.match(flags[0].summary, /NIH RePORTER says active; Cancellation list \(Apify\) says canceled/);
  assert.deepEqual(conn.rows('statusEvent').map((event) => event.kind), ['canceled']);
  assert.equal(conn.rows('grant')[0].frozen, true);
});
