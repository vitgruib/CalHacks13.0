import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { checkPrice, findPrice, readCatalog, type PriceEntry } from '../src/agents/price-check.ts';
import { oneGrantSeed, startWorld, TEST_GRANT, type TestWorld } from './helpers.ts';

// The saved list for these tests (test/fixtures/prices.json, set in the test
// script) has nitrile exam gloves, box of 100, at $18.

let world: TestWorld | undefined;
let dir: string;
let savedKey: string | undefined;
beforeEach(() => {
  // Only the fake clients below are ever asked.
  savedKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  dir = mkdtempSync(join(tmpdir(), 'gg-prices-'));
});
afterEach(() => {
  world?.stop();
  world = undefined;
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedKey;
  rmSync(dir, { recursive: true, force: true });
});

const GLOVES = { item: 'Nitrile exam gloves, medium, box of 100', category: 'lab supplies', grantId: TEST_GRANT, purpose: 'Bench work', sharedWith: [] };

async function submit(price: number) {
  world = await startWorld({ seedJson: oneGrantSeed() });
  const scientist = await world.person('scientist');
  await scientist.call('submit_request', { ...GLOVES, price });
  await world.worker.idle();
  const conn = world.worker.sessions.purchasing;
  const row = conn.rows('request').at(-1)!;
  return { row, holds: conn.rows('hold').filter((h) => h.refId === row.id && h.open), orders: conn.rows('order').filter((o) => o.requestId === row.id) };
}

test('a_request_far_above_its_saved_list_price_goes_to_the_grant_manager', async () => {
  const { row, holds, orders } = await submit(240);
  assert.equal(row.state, 'waiting_on_manager');
  assert.equal(holds.length, 1);
  assert.match(row.explanation, /more than twice the list price found for it: \$18 for "Nitrile exam gloves, medium, 100\/box" at Example Lab Supply \(https:\/\/example\.test\/gloves-100/);
  assert.equal(orders.length, 0);
});

test('a_request_near_its_saved_list_price_is_bought', async () => {
  const { row, orders } = await submit(30);
  assert.equal(row.state, 'bought');
  assert.equal(orders.length, 1);
});

test('the_saved_list_matches_reworded_items_but_not_other_quantities', () => {
  const entries = readCatalog('test/fixtures/prices.json');
  assert.ok(findPrice('nitrile exam gloves (medium) - box of 100', 'lab supplies', entries));
  assert.equal(findPrice('Nitrile exam gloves, medium, box of 200', 'lab supplies', entries), undefined);
  assert.equal(findPrice('Nitrile exam gloves, medium, box of 100', 'reagents', entries), undefined);
});

const searchReply = (answer: object, urls: string[]) => ({
  model: 'claude-haiku-5-5',
  stop_reason: 'end_turn',
  parsed_output: answer,
  content: [{ type: 'web_search_tool_result', content: urls.map((url) => ({ type: 'web_search_result', url, title: '' })) }],
});
function fake(reply: unknown) {
  const client = { calls: 0, messages: { parse: async () => (client.calls++, reply) } };
  return client;
}
const PIPETTE = { item: 'Pipette tips, 200 uL, 10 racks', category: 'lab supplies', price: 900 };
const FOUND = { found: true, vendor: 'Example Supply', product: 'Pipette tips 200 uL, rack of 96', listPrice: 95, sameQuantity: true, url: 'https://example.test/tips' };

test('a_found_price_is_saved_and_the_next_lookup_asks_no_one', async () => {
  const catalog = join(dir, 'prices.json');
  const client = fake(searchReply(FOUND, ['https://example.test/tips']));
  const options = { catalog, cacheDir: dir, mode: 'live' as const };
  const first = await checkPrice(PIPETTE, { ...options, client: client as never });
  assert.equal(first?.from, 'claude');
  assert.equal(first?.tooHigh, true);
  const second = await checkPrice({ ...PIPETTE, item: 'pipette tips 200 uL 10 racks' }, { ...options, client: client as never });
  assert.equal(second?.from, 'list');
  assert.equal(client.calls, 1);
  assert.equal((readCatalog(catalog)[0] as PriceEntry).url, 'https://example.test/tips');
});

test('a_link_that_is_not_in_the_search_results_is_not_trusted', async () => {
  const catalog = join(dir, 'prices.json');
  const client = fake(searchReply(FOUND, ['https://example.test/other-page']));
  const result = await checkPrice(PIPETTE, { catalog, client: client as never, cacheDir: dir, mode: 'live' });
  assert.equal(result, undefined);
  assert.deepEqual(readCatalog(catalog), []);
});
