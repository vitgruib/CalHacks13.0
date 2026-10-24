// T8's full fake-university seed (sim/seed.json) loads through load_seed.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { ConnectionId } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import spacetimedb from '../src/schema';
import * as mod from '../src/index';

test('the sim seed loads with every row it ships', () => {
  const json = readFileSync(new URL('../../sim/seed.json', import.meta.url), 'utf8');
  const seed = JSON.parse(json);
  const h = createModuleTestHarness(spacetimedb, mod as Record<string, unknown>);
  const gm = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'http://test', sub: 'gm', aud: ['spacetimedb'], iat: 0 }), ConnectionId.random());
  h.withReducerTx(TestAuth.internal(), ctx => (mod.init as any)(ctx, {}));
  h.withReducerTx(gm, ctx => (mod.register_person as any)(ctx, { role: 'grant_manager', name: 'GM' }));
  h.withReducerTx(gm, ctx => (mod.load_seed as any)(ctx, { json }));
  const db = h.db as any;
  expect([...db.request.iter()].length).toBe(seed.requests.length);
  expect([...db.invoice.iter()].length).toBe(seed.invoices.length);
  expect([...db.payroll.iter()].length).toBe(seed.payroll.length);
  expect([...db.reportPaper.iter()].length).toBe(seed.papers.length);
  expect(db.clock.id.find(0).today).toBe(seed.today);
});
