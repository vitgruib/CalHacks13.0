#!/usr/bin/env node
// T19 scorecard. Replays the seed through the real module and agents, scores
// the result against the answer key, prints it, and writes eval/scorecard.json
// (the Test lab imports it at build time).
//
//   node eval/score.mjs [--strict] [--seed path] [--key path] [--out path | --no-write] [--json]
//
// Exit codes: 0 = scored (misses and false alarms are reported, not fatal);
// 1 = --strict and something was missed or falsely flagged;
// 2 = the key or seed is malformed, or the replay crashed.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadScorer } from './load.mjs';
import { judge, FEATURES } from './judge.mjs';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const ROOT = here('..');

/**
 * Runs `seed` through the agents (runSim) and scores it against `key`. Also
 * scores a second run where plain action calls stand in for the agents not
 * built yet, so the card shows how far the module's rules alone get.
 */
export async function scoreSeed(seed, key) {
  const { replay, STAND_INS } = await loadScorer();
  const agents = await replay(seed);
  const card = judge({ tables: agents.tables, key, seed });
  const alone = await replay(seed, { standIns: true });
  const rules = judge({ tables: alone.tables, key, seed });
  return {
    ...card,
    // Features whose agent hasn't touched any of its cases.
    unimplemented: card.features.filter(f => f.notRun > 0 && f.notRun === f.mistakes + f.decoys).map(f => ({ feature: f.feature, label: f.label, notRun: f.notRun })),
    runner: 'agents/src/sim.ts runSim()',
    replayErrors: agents.errors,
    withStandIns: {
      about: 'The same run, then plain action calls stand in for agents not built yet. The module still decides.',
      standIns: STAND_INS,
      totals: rules.totals,
      features: rules.features.map(({ feature, caught, missed, falseAlarms, correctPasses, notRun, mistakes, decoys }) =>
        ({ feature, caught, missed, falseAlarms, correctPasses, notRun, mistakes, decoys })),
      cases: Object.fromEntries(rules.cases.map(c => [c.id, { got: c.got, outcome: c.outcome, detail: c.detail }])),
      unlistedFalseAlarms: rules.unlistedFalseAlarms,
      replayErrors: alone.errors,
    },
  };
}

const pad = (s, n) => String(s).padEnd(n);

export function formatScorecard(card) {
  const lines = [];
  lines.push(`Scorecard: ${card.key} on ${card.seed} (today ${card.today}), run by ${card.runner}`);
  lines.push('');
  const s = card.withStandIns;
  lines.push(`${pad('case', 7)}${pad('feature', 18)}${pad('kind', 9)}${pad('ref', 18)}${pad('expected', 18)}${pad('got', 20)}${pad('outcome', 26)}with stand-ins`);
  for (const c of card.cases) {
    const o = c.notRun && c.outcome !== 'not run' ? `${c.outcome} (not run)` : c.outcome;
    lines.push(`${pad(c.id, 7)}${pad(c.feature, 18)}${pad(c.kind, 9)}${pad(c.refId, 18)}${pad(c.expected, 18)}${pad(c.got, 20)}${pad(o, 26)}${s.cases[c.id].outcome}`);
  }
  if (card.unlistedFalseAlarms.length) {
    lines.push('');
    lines.push('False alarms on records the key does not list:');
    for (const x of card.unlistedFalseAlarms) lines.push(`  ${pad(x.feature, 18)}${pad(x.refId, 18)}${x.what}`);
  }
  lines.push('');
  lines.push(`${pad('feature', 20)}${pad('caught', 8)}${pad('missed', 8)}${pad('false alarms', 14)}${pad('correct passes', 16)}not run`);
  const row = (label, n) => `${pad(label, 20)}${pad(`${n.caught}/${n.mistakes}`, 8)}${pad(n.missed, 8)}${pad(n.falseAlarms, 14)}${pad(`${n.correctPasses}/${n.decoys}`, 16)}${n.notRun}`;
  for (const f of card.features) lines.push(row(f.label, f));
  lines.push(row('Overall', card.totals));
  lines.push(row('With stand-ins', s.totals));
  if (card.unimplemented.length) {
    lines.push('', `Not run (no agent acts on these yet): ${card.unimplemented.map(f => `${f.label} (${f.notRun} ${f.notRun === 1 ? "case" : "cases"})`).join(', ')}.`);
  }
  for (const [label, errs] of [['agents', card.replayErrors], ['stand-in', s.replayErrors]]) {
    if (errs.length) lines.push('', `Actions the module refused in the ${label} run: ${errs.join('; ')}`);
  }
  if (s.unlistedFalseAlarms.length) {
    lines.push('', `With stand-ins, false alarms on unlisted records: ${s.unlistedFalseAlarms.map(x => `${x.refId} (${x.what})`).join('; ')}`);
  }
  return lines.join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: {
      strict: { type: 'boolean', default: false },
      seed: { type: 'string', default: here('../sim/seed.json') },
      key: { type: 'string', default: here('../sim/answer-key.json') },
      out: { type: 'string', default: here('./scorecard.json') },
      'no-write': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });
  let card;
  try {
    const seed = JSON.parse(readFileSync(values.seed, 'utf8'));
    const key = JSON.parse(readFileSync(values.key, 'utf8'));
    card = await scoreSeed(seed, key);
    card.seed = relative(ROOT, resolve(values.seed));
    card.key = relative(ROOT, resolve(values.key));
  } catch (e) {
    console.error(`eval: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  if (!values['no-write']) writeFileSync(values.out, `${JSON.stringify(card, null, 2)}\n`);
  console.log(values.json ? JSON.stringify(card, null, 2) : formatScorecard(card));
  const bad = card.totals.missed + card.totals.falseAlarms;
  if (values.strict && bad > 0) {
    console.error(`eval --strict: ${card.totals.missed} missed, ${card.totals.falseAlarms} false alarms`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { FEATURES };
