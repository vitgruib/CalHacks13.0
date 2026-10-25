import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { createUsaspendingSource } from '../src/sources/usaspending.ts';

let cacheDir: string;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'gg-usaspending-'));
});

afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/usaspending/${name}`, import.meta.url), 'utf8'));

const AWARD_URL = (grantId: string) => `https://api.usaspending.gov/api/v2/awards/ASST_NON_${grantId}_075/`;

// Serves trimmed real answers by award URL; anything else is the real 404.
// Records every URL asked for, so tests can see what was requested.
const TRANSACTIONS_URL = 'https://api.usaspending.gov/api/v2/transactions/';

function fakeUsaspending(awards: Record<string, unknown>, status = 200, transactions: Record<string, unknown> = {}) {
  const asked: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    asked.push(url);
    if (status !== 200) return new Response('upstream error', { status });
    if (url === TRANSACTIONS_URL) {
      const awardId: string = JSON.parse(String(init?.body)).award_id;
      const found = Object.entries(transactions).find(([grantId]) => awardId === `ASST_NON_${grantId}_075`)?.[1];
      return Response.json(found ?? { results: [], page_metadata: { hasNext: false } });
    }
    const award = Object.entries(awards).find(([grantId]) => AWARD_URL(grantId) === url)?.[1];
    if (award === undefined) return Response.json(fixture('not_found_5R01HD115985-03.json'), { status: 404 });
    return Response.json(award);
  };
  return { fetchImpl, asked };
}

const failing: typeof fetch = async () => {
  throw new Error('network down');
};

test('award_with_obligation_and_outlay_reads_awarded_and_paid', async () => {
  const { fetchImpl, asked } = fakeUsaspending({ R01HD115985: fixture('award_R01HD115985.json') }, 200, {
    R01HD115985: fixture('transactions_R01HD115985.json'),
  });
  const reading = await createUsaspendingSource({ fetchImpl, cacheDir }).read('R01HD115985');

  assert.deepEqual(reading, {
    grantId: 'R01HD115985',
    source: 'USAspending',
    status: null,
    awarded: 2151108,
    paid: 1217475.21,
    endDate: '2029-05-31',
    url: 'https://www.usaspending.gov/award/ASST_NON_R01HD115985_075',
    // The four obligations add up to the $2,151,108 above; $0 rows are left out.
    awards: [
      { date: '2024-09-05', amount: 697555, label: '000' },
      { date: '2025-07-20', amount: 705616, label: '002' },
      { date: '2026-06-23', amount: 647937, label: '000' },
      { date: '2026-08-11', amount: 100000, label: '001' },
    ],
  });
  assert.deepEqual(asked, [AWARD_URL('R01HD115985'), TRANSACTIONS_URL]);
});

test('missing_outlay_reads_as_paid_unknown', async () => {
  const { fetchImpl } = fakeUsaspending({ UM1AI068641: fixture('award_UM1AI068641_no_outlay.json') });
  const reading = await createUsaspendingSource({ fetchImpl, cacheDir }).read('UM1AI068641');

  assert.equal(reading?.paid, null);
  assert.equal(reading?.awarded, 83450773);
  assert.equal(reading?.endDate, '2016-05-31');
});

test('unknown_award_reads_as_null', async () => {
  const { fetchImpl, asked } = fakeUsaspending({});
  const reading = await createUsaspendingSource({ fetchImpl, cacheDir }).read('5R01HD115985-03');

  assert.equal(reading, null);
  assert.deepEqual(asked, [AWARD_URL('5R01HD115985-03')]);
});

test('a_404_is_saved_so_offline_also_reads_null', async () => {
  await createUsaspendingSource({ fetchImpl: fakeUsaspending({}).fetchImpl, cacheDir }).read('R01HD115985');
  const offline = await createUsaspendingSource({ fetchImpl: failing, cacheDir, mode: 'offline' }).read('R01HD115985');

  assert.equal(offline, null);
});

test('a_404_wins_over_an_older_saved_copy', async () => {
  const award = { R01HD115985: fixture('award_R01HD115985.json') };
  await createUsaspendingSource({ fetchImpl: fakeUsaspending(award).fetchImpl, cacheDir }).read('R01HD115985');
  const reading = await createUsaspendingSource({ fetchImpl: fakeUsaspending({}).fetchImpl, cacheDir }).read(
    'R01HD115985',
  );

  assert.equal(reading, null, 'a real "no such award" must not be papered over by the saved copy');
});

test('server_error_with_no_saved_copy_throws_naming_the_grant_and_url', async () => {
  const { fetchImpl } = fakeUsaspending({}, 500);

  await assert.rejects(
    createUsaspendingSource({ fetchImpl, cacheDir }).read('R01HD115985'),
    (error: Error) =>
      error.message.includes('R01HD115985') && error.message.includes(AWARD_URL('R01HD115985')) && /500/.test(error.message),
  );
});

test('server_error_falls_back_to_the_saved_copy', async () => {
  const award = { R01HD115985: fixture('award_R01HD115985.json') };
  const live = await createUsaspendingSource({ fetchImpl: fakeUsaspending(award).fetchImpl, cacheDir }).read(
    'R01HD115985',
  );
  const fallback = await createUsaspendingSource({ fetchImpl: fakeUsaspending(award, 503).fetchImpl, cacheDir }).read(
    'R01HD115985',
  );

  assert.deepEqual(fallback, live);
});

test('offline_mode_returns_the_same_reading_as_the_live_run', async () => {
  const { fetchImpl } = fakeUsaspending({ R01HD115985: fixture('award_R01HD115985.json') });
  const live = await createUsaspendingSource({ fetchImpl, cacheDir }).read('R01HD115985');
  const offline = await createUsaspendingSource({ fetchImpl: failing, cacheDir, mode: 'offline' }).read('R01HD115985');

  assert.deepEqual(offline, live);
});

test('offline_with_no_saved_copy_throws_naming_the_grant', async () => {
  await assert.rejects(
    createUsaspendingSource({ fetchImpl: failing, cacheDir, mode: 'offline' }).read('R01AI181732'),
    /R01AI181732.*no saved copy/,
  );
});

test('the_saved_copy_keeps_only_the_fields_the_reading_uses', async () => {
  const { fetchImpl } = fakeUsaspending({ R01HD115985: fixture('award_R01HD115985.json') }, 200, {
    R01HD115985: fixture('transactions_R01HD115985.json'),
  });
  await createUsaspendingSource({ fetchImpl, cacheDir }).read('R01HD115985');

  const saved = readdirSync(cacheDir).map((file) => JSON.parse(readFileSync(join(cacheDir, file), 'utf8')));
  const savedFor = (url: string) => saved.find((copy) => copy.request.url === url).response;
  assert.deepEqual(savedFor(AWARD_URL('R01HD115985')), {
    total_obligation: 2151108,
    total_outlay: 1217475.21,
    period_of_performance: { end_date: '2029-05-31' },
  });
  assert.deepEqual(savedFor(TRANSACTIONS_URL).results[0], {
    action_date: '2024-09-05',
    federal_action_obligation: 697555,
    modification_number: '000',
  });
});
