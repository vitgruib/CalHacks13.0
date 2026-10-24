import { expect, test } from 'vitest';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import spacetimedb, * as mod from '../src/index';
test('smoke', () => {
  const h = createModuleTestHarness(spacetimedb, mod);
  h.withReducerTx(TestAuth.internal(), ctx => mod.add_thing(ctx as any, { name: 'x' } as any));
  expect([...h.db.thing.iter()].length).toBe(1);
});
