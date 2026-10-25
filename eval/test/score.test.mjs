// The scorer on changed copies of the seed: its counts must move with the
// world, not with the key. The real seed is never edited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreSeed } from '../score.mjs';

const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const seed = () => load('../../sim/seed.json');
const key = load('../../sim/answer-key.json');
const outcome = (card, id) => card.cases.find(c => c.id === id).outcome;
// Purchases and invoices have no agent yet (T11, T12); their rules run in the stand-in pass.
const standInOutcome = (card, id) => card.withStandIns.cases[id].outcome;

test('sources that agree raise no disagreement, so the planted one is missed', async () => {
  const s = seed();
  s.sourceReadings.find(r => r.id === 'sr-008').status = 'canceled'; // RePORTER now agrees with USAspending
  s.sourceReadings.find(r => r.id === 'sr-010').status = 'canceled'; // and so does the list

  const card = await scoreSeed(s, key);

  assert.equal(outcome(card, 'ft-1'), 'missed');
  assert.equal(outcome(card, 'ft-2'), 'caught');
});

test('a decoy pushed over the card limit becomes a false alarm', async () => {
  const s = seed();
  s.requests.find(r => r.id === 'rq-106').price = 5001; // the decoy sits exactly at $5,000

  const card = await scoreSeed(s, key);

  assert.equal(standInOutcome(card, 'pu-d1'), 'false alarm');
  assert.equal(card.withStandIns.features.find(f => f.feature === 'purchases').falseAlarms, 1);
});

test('fixing a planted mistake turns its catch into a miss', async () => {
  const s = seed();
  s.invoices.find(i => i.id === 'inv-034').amount = 5800; // now matches approval ap-034

  const card = await scoreSeed(s, key);

  assert.equal(standInOutcome(card, 'in-2'), 'missed');
  assert.equal(standInOutcome(card, 'in-1'), 'caught');
});

test('a malformed key is rejected', async () => {
  const bad = { ...key, cases: [...key.cases, { ...key.cases[0] }] }; // duplicate id

  await assert.rejects(scoreSeed(seed(), bad), /duplicate id/);
});
