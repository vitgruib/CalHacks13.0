// The item-check eval on real items: a case must quote its saved source, and
// one saved answer is scored against what was decided about the item.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSources, scoreAnswers, scoreItems } from '../item-check-real.mjs';
import { ITEMS } from '../item-check-real.cases.mjs';

const item = id => ITEMS.find(c => c.id === id);

test('a quote that is not in its source is rejected', () => {
  const madeUp = { ...item('ic-01'), quote: 'USC charged a case of champagne to the award.' };

  assert.throws(() => checkSources([madeUp]), /ic-01: quote not found in nsf-oig-17-1-009-usc.txt/);
});

test('a funder decision that is not in its letter is rejected', () => {
  const madeUp = { ...item('ic-01'), decision: { ...item('ic-01').decision, quote: 'NSF allowed the alcohol.' } };

  assert.throws(() => checkSources([madeUp]), /ic-01: decision quote not found/);
});

test('a flag on a disallowed item is caught and a flag on an allowed one is a false alarm', () => {
  const flag = { verdict: 'flag', why: 'Alcohol is unallowable (2 CFR 200.423).', category: 'alcohol' };
  const answers = new Map([['ic-01', flag], ['ic-d01', { ...flag, category: 'entertainment' }]]);

  const card = scoreAnswers([item('ic-01'), item('ic-d01')], answers);

  assert.deepEqual(card.items.map(r => r.outcome), ['caught', 'false alarm']);
  assert.equal(card.items[0].categoryAgrees, true);
});

test('an item with no saved answer is not run, not caught', async () => {
  const card = await scoreItems([item('ic-01')], { mode: 'off' });

  assert.equal(card.items[0].outcome, 'not run');
  assert.equal(card.totals.caught, 0);
});

test('a saved answer replays offline and a disallowed alcohol charge is caught', async () => {
  const card = await scoreItems([item('ic-01')], { mode: 'offline' });

  assert.equal(card.items[0].outcome, 'caught');
});
