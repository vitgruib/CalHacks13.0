#!/usr/bin/env node
// T80 real-findings eval. Each case is one questioned cost from a real audit
// report saved in docs/research/sources/docs/, rebuilt as records planted in
// a fresh copy of sim/seed.json. The copy runs through the real module and
// agents (the same replay as the scorecard), and the case is scored with the
// scorecard's judge. Findings GrantGuard has no rule for are listed as out of
// scope rather than left out.
//
//   node eval/real-findings.mjs [--out path | --no-write] [--json]
//
// Exit codes: 0 = scored (misses are reported, not fatal); 2 = a case is
// malformed, its quote isn't in its source, or the replay crashed.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadScorer } from './load.mjs';
import { judge } from './judge.mjs';
import { FINDINGS, SOURCES_DIR } from './real-findings.cases.mjs';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const load = p => JSON.parse(readFileSync(here(p), 'utf8'));

/** Whitespace-insensitive: the saved sources wrap lines where the PDFs did. */
const squash = s => s.replace(/\s+/g, ' ').trim();

/** Throws unless every case cites a saved source that contains its quote. */
export function checkSources(findings = FINDINGS) {
  const problems = [];
  const ids = new Set();
  for (const f of findings) {
    if (ids.has(f.id)) problems.push(`${f.id}: duplicate id`);
    ids.add(f.id);
    for (const k of ['id', 'file', 'auditee', 'what', 'quote']) if (!f[k]) problems.push(`${f.id ?? '?'}: missing ${k}`);
    if (!f.plant && !f.outOfScope) problems.push(`${f.id}: needs plant() or outOfScope`);
    let text;
    try {
      text = readFileSync(here(`${SOURCES_DIR}/${f.file}`), 'utf8');
    } catch {
      problems.push(`${f.id}: no source ${f.file}`);
      continue;
    }
    if (f.quote && !squash(text).includes(squash(f.quote))) problems.push(`${f.id}: quote not found in ${f.file}`);
  }
  if (problems.length) throw new Error(`real findings are malformed:\n  ${problems.join('\n  ')}`);
}

/**
 * The judge counts a purchase as caught when the agent stopped it even if the
 * cited rule never ran (a card-limit hold on a computer bought at a grant's
 * end). Here a finding is caught only for the reason the auditors gave.
 */
function strict(c, rule, tables) {
  if (c.feature !== 'purchases' || c.kind !== 'mistake' || c.outcome !== 'caught') return c;
  const r = tables.request.find(x => x.id === c.refId);
  const failed = (r?.verdicts ?? []).some(v => v.rule.startsWith(rule) && !v.pass);
  return failed ? c : { ...c, outcome: 'missed', detail: `Stopped (${c.got}), but not by "${rule}": ${c.detail}` };
}

/**
 * Plants each in-scope finding in its own copy of the seed, runs the agents,
 * and judges that one case. The seed's own planted cases stay in the key, so
 * their holds aren't counted against the finding.
 */
export async function scoreFindings(findings = FINDINGS) {
  checkSources(findings);
  const { replay } = await loadScorer();
  const baseKey = load('../sim/answer-key.json');
  const results = [];
  for (const f of findings) {
    const source = { file: f.file, auditee: f.auditee, year: f.year, amount: f.amount ?? null, quote: f.quote };
    if (f.outOfScope) {
      results.push({ id: f.id, what: f.what, source, outcome: 'out of scope', why: f.outOfScope });
      continue;
    }
    const seed = load('../sim/seed.json');
    const cases = f.plant(seed);
    const key = { ...baseKey, cases: [...baseKey.cases, ...cases] };
    const { tables, errors } = await replay(seed);
    const card = judge({ tables, key, seed });
    const mine = new Set(cases.map(c => c.id));
    const planted = new Set(cases.flatMap(c => [c.refId, ...(c.relatedIds ?? [])]));
    const scored = card.cases.filter(c => mine.has(c.id)).map(c => strict(c, cases.find(k => k.id === c.id).rule, tables));
    // A hold or flag on a record this finding planted that no case explains.
    const extras = card.unlistedFalseAlarms.filter(x => planted.has(x.refId) || String(x.refId).startsWith('rf-'));
    results.push({
      id: f.id, what: f.what, source, rule: cases[0].rule, auditee: f.auditee,
      outcome: scored.find(c => c.kind === 'mistake')?.outcome ?? 'no mistake case',
      cases: scored.map(({ id, kind, refId, expected, got, outcome, detail }) => ({ id, kind, refId, expected, got, outcome, detail })),
      falseAlarms: scored.filter(c => c.outcome === 'false alarm').length + extras.length,
      extras, errors,
    });
  }
  const inScope = results.filter(r => r.outcome !== 'out of scope');
  const decoys = inScope.flatMap(r => r.cases.filter(c => c.kind === 'decoy'));
  return {
    about: 'Questioned costs from real audit reports, each rebuilt in a fresh copy of sim/seed.json and run through the real module and agents. Agents run on their deterministic fallbacks unless GG_CLAUDE says otherwise.',
    claude: process.env.GG_CLAUDE,
    totals: {
      findings: results.length,
      inScope: inScope.length,
      caught: inScope.filter(r => r.outcome === 'caught').length,
      missed: inScope.filter(r => r.outcome !== 'caught').length,
      outOfScope: results.length - inScope.length,
      decoys: decoys.length,
      correctPasses: decoys.filter(c => c.outcome === 'correct pass').length,
      falseAlarms: inScope.reduce((n, r) => n + r.falseAlarms, 0),
    },
    findings: results,
  };
}

const pad = (s, n) => String(s).padEnd(n);
const money = n => (n == null ? '' : `$${n.toLocaleString('en-US')}`);

export function formatFindings(card) {
  const lines = ['Real audit findings, replayed through GrantGuard', ''];
  lines.push(`${pad('case', 7)}${pad('auditee', 30)}${pad('amount', 12)}${pad('outcome', 14)}what`);
  for (const r of card.findings) {
    lines.push(`${pad(r.id, 7)}${pad(`${r.auditee ?? r.source.auditee} ${r.source.year ?? ''}`.slice(0, 29), 30)}${pad(money(r.source.amount), 12)}${pad(r.outcome, 14)}${r.what}`);
    for (const c of r.cases ?? []) if (c.kind === 'decoy') lines.push(`${pad('', 7)}${pad('  decoy', 42)}${pad(c.outcome, 14)}${c.refId}`);
    if (r.outcome === 'out of scope') lines.push(`${pad('', 63)}(${r.why})`);
    for (const x of r.extras ?? []) lines.push(`${pad('', 63)}false alarm: ${x.refId} ${x.what}`);
  }
  const t = card.totals;
  lines.push('', `In scope: caught ${t.caught}/${t.inScope}, decoys passed ${t.correctPasses}/${t.decoys}, false alarms ${t.falseAlarms}. Out of scope: ${t.outOfScope} of ${t.findings} findings.`);
  return lines.join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: here('./real-findings.json') },
      'no-write': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });
  let card;
  try {
    card = await scoreFindings();
  } catch (e) {
    console.error(`eval: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  if (!values['no-write']) writeFileSync(values.out, `${JSON.stringify(card, null, 2)}\n`);
  console.log(values.json ? JSON.stringify(card, null, 2) : formatFindings(card));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
