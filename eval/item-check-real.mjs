#!/usr/bin/env node
// T115 item-check eval on real items. Ask's item check (agents/src/agents/
// item-check.ts) is the one place Claude judges: before any grant is matched,
// is this item something a federal research grant could pay for at all? Each
// case is one real item from a saved audit report or funder letter in
// docs/research/sources/docs/, asked through the real module and the real
// agent exactly as the Ask page asks it. Ground truth is what the funder,
// auditee or auditor decided about that item, never Claude's own say.
//
//   node eval/item-check-real.mjs [--ask] [--out path | --no-write] [--json]
//
// By default Claude is never called: saved answers in agents/cache/claude/
// replay (GG_CLAUDE=offline), and an item with no saved answer is "not run".
// --ask (GG_CLAUDE=cached) asks Claude for any item without a saved answer and
// saves what it says, to be committed.
//
// Exit codes: 0 = scored (misses are findings, not failures); 2 = a case is
// malformed or its quote isn't in its source.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ITEMS, OUT_OF_SCOPE, SOURCES_DIR } from './item-check-real.cases.mjs';

const here = p => fileURLToPath(new URL(p, import.meta.url));

/** Whitespace-insensitive: the saved sources wrap lines where the PDFs did. */
const squash = s => s.replace(/\s+/g, ' ').trim();

// Who decided the item's fate. Only a funder's letter is final; the others
// are reported in their own rows.
export const LABELS = ['disallowed', 'allowed', 'agreed', 'auditor'];
export const EXPECT = ['flag', 'fine'];

const readSource = (file, cache) => {
  if (!cache.has(file)) {
    try {
      cache.set(file, squash(readFileSync(here(`${SOURCES_DIR}/${file}`), 'utf8')));
    } catch {
      cache.set(file, null);
    }
  }
  return cache.get(file);
};

/** Throws unless every item quotes a saved source, and its decision quotes its letter. */
export function checkSources(items = ITEMS) {
  const problems = [];
  const ids = new Set();
  const cache = new Map();
  for (const c of items) {
    if (ids.has(c.id)) problems.push(`${c.id}: duplicate id`);
    ids.add(c.id);
    for (const k of ['id', 'file', 'auditee', 'item', 'quote']) if (!c[k]) problems.push(`${c.id ?? '?'}: missing ${k}`);
    if (!(c.price > 0)) problems.push(`${c.id}: price must be more than $0`);
    if (!EXPECT.includes(c.expect)) problems.push(`${c.id}: expect must be flag or fine`);
    const text = readSource(c.file, cache);
    if (text == null) {
      problems.push(`${c.id}: no source ${c.file}`);
      continue;
    }
    if (c.quote && !text.includes(squash(c.quote))) problems.push(`${c.id}: quote not found in ${c.file}`);
    const d = c.decision;
    if (!LABELS.includes(d?.label)) {
      problems.push(`${c.id}: decision label must be one of ${LABELS.join(', ')}`);
      continue;
    }
    if (d.label === 'auditor' && !d.quote) continue;
    if (!d.quote) {
      problems.push(`${c.id}: a ${d.label} decision needs a quote`);
      continue;
    }
    const letter = readSource(d.file ?? c.file, cache);
    if (letter == null) problems.push(`${c.id}: no decision source ${d.file}`);
    else if (!letter.includes(squash(d.quote))) problems.push(`${c.id}: decision quote not found in ${d.file ?? c.file}`);
  }
  if (problems.length) throw new Error(`item-check cases are malformed:\n  ${problems.join('\n  ')}`);
}

/** One answer against what was decided. `unchecked` means Claude gave no answer. */
export function outcome(expect, verdict) {
  if (verdict !== 'flag' && verdict !== 'fine') return 'not run';
  if (expect === 'flag') return verdict === 'flag' ? 'caught' : 'missed';
  return verdict === 'fine' ? 'correct pass' : 'false alarm';
}

let loaded;
/** The real module (local) and the real item-check agent, loaded through tsx. */
function loadAgent() {
  loaded ??= (async () => {
    const { register } = await import('tsx/esm/api');
    register();
    // The SDK replaces globalThis.console with the host's, which drops output.
    const realConsole = globalThis.console;
    try {
      const [{ createLocalDb }, { startItemChecks }, { ITEM_MODEL }] = await Promise.all([
        import('../agents/src/db/local.ts'),
        import('../agents/src/agents/item-check.ts'),
        import('../agents/src/prompts/item-check.ts'),
      ]);
      return { createLocalDb, startItemChecks, ITEM_MODEL };
    } finally {
      globalThis.console = realConsole;
    }
  })();
  return loaded;
}

/**
 * Asks each item the way a scientist does on the Ask page and returns the
 * agent's answer per item. mode: 'offline' replays saved answers only;
 * 'cached' asks Claude for any item with no saved answer and saves it.
 */
export async function askItems(items, { mode = 'offline' } = {}) {
  const { createLocalDb, startItemChecks, ITEM_MODEL } = await loadAgent();
  const db = await createLocalDb({ world: 'fixtures' });
  const bookkeeping = await db.connect();
  await bookkeeping.call('register_agent', { role: 'bookkeeping' });
  const scientist = await db.connect();
  await scientist.call('register_person', { role: 'scientist', name: 'Item-check eval' });
  const agent = startItemChecks({ conn: bookkeeping, itemClaude: { mode } });
  const answers = new Map();
  try {
    for (const c of items) {
      await scientist.call('ask_item_check', { item: c.item, purpose: c.purpose ?? '', price: c.price });
      await db.settled();
      await agent.idle();
      await db.settled();
      const row = scientist.rows('itemCheck').at(-1);
      answers.set(c.id, { verdict: row.verdict, why: row.why, category: row.category });
    }
  } finally {
    agent.stop();
    db.close();
  }
  return { answers, model: ITEM_MODEL };
}

/** Scores answers against the cases; pure, so the tests can feed it one answer. */
export function scoreAnswers(items, answers) {
  const results = items.map(c => {
    const a = answers.get(c.id) ?? { verdict: 'unchecked', why: '', category: '' };
    const r = {
      id: c.id, auditee: c.auditee, year: c.year ?? null, item: c.item, price: c.price, purpose: c.purpose ?? '',
      expect: c.expect, decision: { file: c.file, ...c.decision }, source: { file: c.file, quote: c.quote },
      got: a.verdict, why: a.why, category: a.category, outcome: outcome(c.expect, a.verdict),
    };
    if (c.category) r.categoryExpected = c.category;
    if (c.category && a.category) r.categoryAgrees = (Array.isArray(c.category) ? c.category : [c.category]).includes(a.category);
    if (c.note) r.note = c.note;
    return r;
  });
  const count = (rs, o) => rs.filter(r => r.outcome === o).length;
  const tally = rs => ({
    items: rs.length,
    mistakes: rs.filter(r => r.expect === 'flag').length,
    caught: count(rs, 'caught'),
    missed: count(rs, 'missed'),
    decoys: rs.filter(r => r.expect === 'fine').length,
    correctPasses: count(rs, 'correct pass'),
    falseAlarms: count(rs, 'false alarm'),
    notRun: count(rs, 'not run'),
  });
  const withCategory = results.filter(r => 'categoryAgrees' in r);
  return {
    totals: { ...tally(results), categoryAgrees: withCategory.filter(r => r.categoryAgrees).length, categoryChecked: withCategory.length },
    byDecision: Object.fromEntries(LABELS.map(l => [l, tally(results.filter(r => r.decision.label === l))])),
    items: results,
  };
}

export async function scoreItems(items = ITEMS, { mode = 'offline' } = {}) {
  checkSources(items);
  const { answers, model } = await askItems(items, { mode });
  return {
    about: "Real items from saved audit reports and funder letters, asked through Ask's item check (the real module and agent). Ground truth is the funder's, auditee's or auditor's decision on the item, quoted from the saved source. Saved Claude answers replay offline; an item with none is not run.",
    model,
    mode,
    ...scoreAnswers(items, answers),
    outOfScope: OUT_OF_SCOPE,
  };
}

const pad = (s, n) => String(s).padEnd(n);
const money = n => `$${n.toLocaleString('en-US')}`;

export function formatItems(card) {
  const lines = [`Item check on real items (${card.model}, ${card.mode})`, ''];
  lines.push(`${pad('case', 7)}${pad('decided', 12)}${pad('want', 6)}${pad('got', 11)}${pad('outcome', 14)}${pad('price', 10)}item`);
  for (const r of card.items) {
    lines.push(`${pad(r.id, 7)}${pad(r.decision.label, 12)}${pad(r.expect, 6)}${pad(r.got, 11)}${pad(r.outcome, 14)}${pad(money(r.price), 10)}${r.item.slice(0, 70)}`);
    if (r.outcome === 'missed' || r.outcome === 'false alarm') lines.push(`${pad('', 60)}${r.why ? `why: ${r.why}` : `(said fine, category ${r.category})`}`);
  }
  const t = card.totals;
  const b = card.byDecision;
  const notRun = t.notRun ? `; ${t.notRun} not run (no saved answer)` : '';
  lines.push(
    '',
    `Unallowable items flagged ${t.caught}/${t.mistakes}; allowable items passed ${t.correctPasses}/${t.decoys}${notRun}.`,
    `  funder's letter: disallowed flagged ${b.disallowed.caught}/${b.disallowed.mistakes}, allowed passed ${b.allowed.correctPasses}/${b.allowed.decoys}`,
    `  auditee agreed:  flagged ${b.agreed.caught}/${b.agreed.mistakes}, passed ${b.agreed.correctPasses}/${b.agreed.decoys}`,
    `  auditor only:    flagged ${b.auditor.caught}/${b.auditor.mistakes}, passed ${b.auditor.correctPasses}/${b.auditor.decoys}`,
    `Category matched the expected kind on ${t.categoryAgrees}/${t.categoryChecked} answered items.`,
    `Out of scope (not about what the item is): ${card.outOfScope.length} findings looked at, listed in the JSON.`,
  );
  return lines.join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: {
      ask: { type: 'boolean', default: false },
      out: { type: 'string', default: here('./item-check-real.json') },
      'no-write': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });
  // Never 'off': offline already can't reach the network, and off would hide
  // every saved answer.
  const mode = values.ask ? 'cached' : 'offline';
  if (values.ask) {
    // The agents read the key from the repo root's .env.local.
    try {
      for (const line of readFileSync(here('../.env.local'), 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    } catch {}
  }
  let card;
  try {
    card = await scoreItems(ITEMS, { mode });
  } catch (e) {
    console.error(`eval: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  if (!values['no-write']) writeFileSync(values.out, `${JSON.stringify(card, null, 2)}\n`);
  console.log(values.json ? JSON.stringify(card, null, 2) : formatItems(card));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
