// The real-findings eval: a case must quote its source and the decision it is
// graded by, and a finding is caught only for the auditors' reason, not for
// some other hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSources, scoreFindings } from '../real-findings.mjs';
import { FINDINGS } from '../real-findings.cases.mjs';

const finding = id => FINDINGS.find(f => f.id === id);

test('a quote that is not in its source is rejected', () => {
  const made_up = { ...finding('rf-15'), quote: 'USC charged $46,000 of alcohol to the award.' };

  assert.throws(() => checkSources([made_up]), /rf-15: quote not found/);
});

test('a funder decision that is not in its letter is rejected', () => {
  const made_up = { ...finding('rf-01'), decision: { ...finding('rf-01').decision, quote: 'NSF allowed the entire $70,189.' } };

  assert.throws(() => checkSources([made_up]), /rf-01: decision quote not found in nsf-resolution-15-1-014-uwm.txt/);
});

test('equipment the funder allowed after the grant ended is paid, not held', async () => {
  const card = await scoreFindings([finding('rf-42')]);

  assert.equal(card.findings[0].outcome, 'correct pass');
});

test('alcohol charged to a grant is caught by the category rule', async () => {
  const card = await scoreFindings([finding('rf-15')]);

  assert.equal(card.findings[0].outcome, 'caught');
});

test('a purchase stopped by another rule is not counted as caught', async () => {
  // A $31,375 computer 77 days before the grant ends: held for the card
  // limit, but the last-90-days rule covers only supplies.
  const card = await scoreFindings([finding('rf-08')]);

  assert.equal(card.findings[0].cases[0].got, 'hold');
  assert.equal(card.findings[0].outcome, 'missed');
});
