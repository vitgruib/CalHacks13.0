import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { fetchJson } from '../src/sources/http.ts';

let cacheDir: string;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'gg-cache-'));
});

afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

const answering = (json: unknown): typeof fetch => async () => Response.json(json);
const failing: typeof fetch = async () => {
  throw new Error('network down');
};

const URL_ = 'https://api.example.test/v2/projects/search';

test('a_live_answer_is_returned_and_saved', async () => {
  const json = await fetchJson(URL_, { body: { id: 1 }, cacheDir, fetchImpl: answering({ ok: 1 }) });
  assert.deepEqual(json, { ok: 1 });
  assert.equal(readdirSync(cacheDir).length, 1);
});

test('a_failed_site_falls_back_to_the_saved_copy', async () => {
  await fetchJson(URL_, { body: { id: 1 }, cacheDir, fetchImpl: answering({ ok: 1 }) });
  const json = await fetchJson(URL_, { body: { id: 1 }, cacheDir, fetchImpl: failing });
  assert.deepEqual(json, { ok: 1 });
});

test('a_failed_site_with_no_saved_copy_throws', async () => {
  await assert.rejects(fetchJson(URL_, { body: { id: 2 }, cacheDir, fetchImpl: failing }), /network down/);
});

test('an_error_status_is_a_failure_not_an_answer', async () => {
  const notFound: typeof fetch = async () => new Response('nope', { status: 503 });
  await assert.rejects(fetchJson(URL_, { body: { id: 3 }, cacheDir, fetchImpl: notFound }), /503/);
});

test('offline_mode_uses_only_saved_copies', async () => {
  await fetchJson(URL_, { body: { id: 1 }, cacheDir, fetchImpl: answering({ ok: 1 }) });
  const json = await fetchJson(URL_, { body: { id: 1 }, cacheDir, mode: 'offline', fetchImpl: failing });
  assert.deepEqual(json, { ok: 1 });
  await assert.rejects(fetchJson(URL_, { body: { id: 9 }, cacheDir, mode: 'offline' }), /no saved copy/);
});

test('select_trims_the_answer_before_it_is_saved', async () => {
  const json = await fetchJson(URL_, {
    body: { id: 4 },
    cacheDir,
    fetchImpl: answering({ keep: 1, pi_name: 'Someone' }),
    select: (raw) => ({ keep: (raw as { keep: number }).keep }),
  });
  assert.deepEqual(json, { keep: 1 });
  const saved = await fetchJson(URL_, { body: { id: 4 }, cacheDir, mode: 'offline' });
  assert.deepEqual(saved, { keep: 1 });
});

test('different_request_bodies_are_saved_separately', async () => {
  await fetchJson(URL_, { body: { id: 1 }, cacheDir, fetchImpl: answering({ n: 1 }) });
  await fetchJson(URL_, { body: { id: 2 }, cacheDir, fetchImpl: answering({ n: 2 }) });
  assert.deepEqual(await fetchJson(URL_, { body: { id: 1 }, cacheDir, mode: 'offline' }), { n: 1 });
});

test('an_unchanged_answer_does_not_rewrite_its_saved_copy', async () => {
  await fetchJson(URL_, { body: { id: 5 }, cacheDir, fetchImpl: answering({ n: 1 }) });
  const [file] = readdirSync(cacheDir);
  const before = readFileSync(join(cacheDir, file), 'utf8');
  await new Promise((resolve) => setTimeout(resolve, 5));
  await fetchJson(URL_, { body: { id: 5 }, cacheDir, fetchImpl: answering({ n: 1 }) });
  assert.equal(readFileSync(join(cacheDir, file), 'utf8'), before);
});
