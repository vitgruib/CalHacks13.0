// The price check (T69, T117): Claude reads one listing's price and counts
// from a page it searched; code works out the price for the requested
// quantity. Claude is faked at the network edge with answers like the live
// ones that went wrong.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { checkPrice } from '../src/agents/price-check.ts';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function lookup(answer: Record<string, unknown>) {
  const key = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const dir = mkdtempSync(join(tmpdir(), 'gg-price-'));
  const catalog = join(dir, 'prices.json');
  writeFileSync(catalog, '[]');
  cleanup = () => {
    rmSync(dir, { recursive: true, force: true });
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = key;
  };
  const client = {
    messages: {
      parse: async () => ({
        model: 'claude-haiku-5-5',
        stop_reason: 'end_turn',
        content: [{ type: 'web_search_tool_result', content: [{ url: answer.url }] }],
        parsed_output: answer,
      }),
    },
  };
  return (item: string, category: string, price: number) =>
    checkPrice({ item, category, price }, { catalog, client, mode: 'live', cacheDir: dir });
}

test('the_list_price_is_one_listings_price_times_the_listings_needed', async () => {
  // Fisher sells these 5 racks to a pack, so 10 racks is 2 packs: $713.20.
  const check = lookup({
    found: true, vendor: 'Fisher Scientific', product: 'epT.I.P.S. Racks, 2-200 uL, Pack of 480 (5 racks x 96)',
    condition: 'new', packPrice: 356.6, unit: 'rack', perPack: 5, requested: 10, url: 'https://www.fishersci.com/tips',
  });
  const result = await check('Eppendorf pipette tips 200 uL, 10 racks', 'lab supplies', 1500);
  assert.deepEqual({ listPrice: result?.entry.listPrice, tooHigh: result?.tooHigh }, { listPrice: 713.2, tooHigh: true });
});

const notListPrices: [string, Record<string, unknown>][] = [
  ['a used listing', { vendor: 'Marshall Scientific', condition: 'used', url: 'https://www.marshallscientific.com/5424' }],
  ['a reseller that does not say it is used', { vendor: 'Express Lab Werks', condition: 'new', url: 'https://www.expresslabwerks.com/5424' }],
];
for (const [name, seller] of notListPrices) {
  test(`a_price_from_${name.replaceAll(' ', '_')}_is_never_compared`, async () => {
    const check = lookup({
      found: true, product: 'Eppendorf 5424 Centrifuge', packPrice: 1800, unit: 'unit', perPack: 1, requested: 1, ...seller,
    });
    const result = await check('Eppendorf 5424 microcentrifuge', 'equipment', 4200);
    assert.deepEqual({ found: result?.entry.found, tooHigh: result?.tooHigh }, { found: false, tooHigh: false });
  });
}
