// The real-grants fund tracker eval (T114): a case's facts must match the
// saved public records, and a real grant replayed month by month is graded
// on what the tracker showed on each check day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFacts, score } from '../fund-tracker-real.mjs';
import { CASES } from '../fund-tracker-real.cases.mjs';

const byId = id => CASES.find(c => c.id === id);

test('a fact that is not in its saved source is rejected', async () => {
  const real = byId('thakur-paid-r21');
  const madeUp = { ...real, facts: [...real.facts, { source: 'usaspending', through: '2025-12', paid: 90000 }] };

  await assert.rejects(checkFacts([madeUp]), /thakur-paid-r21 \(R21NS139078\).*"paid":90000.*63647/);
});

test('a court-restored grant stays frozen until money lands, then unfreezes', async () => {
  // R21NS139078: terminated 2025-07-31, restored 2025-09-22, nothing paid
  // until February 2026 (USAspending outlays).
  const { rows } = await score([byId('thakur-paid-r21')]);

  assert.deepEqual(rows.map(r => [r.day, r.outcome]), [['2026-01-31', 'caught'], ['2026-02-28', 'correct pass']]);
});
