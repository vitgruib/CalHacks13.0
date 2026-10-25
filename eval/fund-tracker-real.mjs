#!/usr/bin/env node
// T114: the fund tracker on real NIH grants. Each case is a real grant
// replayed month by month: on every month end (then 2026-10-25) the real
// fund tracker reads the saved public records as they stood that day
// (fund-tracker-real.sources.mjs), and on the case's check days its answer
// (frozen? which flag? a hold for the grant manager?) is graded against
// what the records say should have happened (fund-tracker-real.cases.mjs).
//
//   node eval/fund-tracker-real.mjs [--json] [--no-write] [--out file]
//
// Runs offline from saved readings. Writes fund-tracker-real.json.
// Exit 2 when a case's facts don't match its saved sources.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CASES } from './fund-tracker-real.cases.mjs';
import { GW_FILE, SAVED_ON, SOURCES_DIR, fundingRows, loadTs, paidBy, paidSeries, sourcesFor } from './fund-tracker-real.sources.mjs';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const FIRST_CHECK = '2025-01-31';

// --- facts against their saved sources ---------------------------------

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const monthEnd = ym => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
const fiscalYear = d => Number(d.slice(0, 4)) + (Number(d.slice(5, 7)) >= 10 ? 1 : 0);
const sum = xs => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

/** Every fact a case states, checked against the saved copy it names. Throws on any mismatch. */
export async function checkFacts(cases, { gwCsv = readFileSync(`${SOURCES_DIR}/${GW_FILE}`, 'utf8') } = {}) {
  const gw = parseCsv(gwCsv);
  const { reporter, usaspending } = await loadTs();
  const nih = reporter.createReporterSource({ mode: 'offline', cacheDir: here('./fund-tracker-real.cache'), today: () => SAVED_ON, minIntervalMs: 0 });
  const spending = usaspending.createUsaspendingSource({ mode: 'offline', cacheDir: here('./fund-tracker-real.cache') });
  const problems = [];
  for (const c of cases) {
    const say = (fact, got) => problems.push(`${c.id} (${c.grantId}): ${JSON.stringify(fact)} but the saved source says ${JSON.stringify(got)}`);
    for (const fact of c.facts) {
      if (fact.source === 'gw') {
        const rows = gw.filter(r => r['Most Recent FAIN'] === c.grantId);
        if (fact.unlisted) { if (rows.length) say(fact, `${rows.length} rows`); continue; }
        const row = fact.award ? rows.find(r => r['Most Recent Full Award Number'] === fact.award) : rows.find(r => r['Subaward ID'] === 'N/A') ?? rows[0];
        if (row?.[fact.field] !== fact.value) say(fact, row ? row[fact.field] : 'no such row');
      } else if (fact.source === 'usaspending') {
        const got = Math.round(paidBy(paidSeries(await fundingRows(c.grantId)), monthEnd(fact.through)));
        if (got !== fact.paid) say(fact, got);
      } else if (fact.source === 'reporter') {
        const got = (await nih.read(c.grantId))?.status;
        if (got !== fact.status) say(fact, got);
      } else if (fact.source === 'obligations') {
        const [r, u] = [await nih.read(c.grantId), await spending.read(c.grantId)];
        const inYear = awards => sum((awards ?? []).filter(a => fiscalYear(a.date) === fact.fy).map(a => a.amount));
        const got = { reporter: inYear(r?.awards), usaspending: inYear(u?.awards) };
        if (got.reporter !== fact.reporter || got.usaspending !== fact.usaspending) say(fact, got);
      } else say(fact, 'unknown source');
    }
  }
  if (problems.length) throw new Error(`fund tracker real cases are malformed:\n  ${problems.join('\n  ')}`);
}

// --- the replay ----------------------------------------------------------

function checkDays(c) {
  const days = [FIRST_CHECK];
  for (let ym = FIRST_CHECK.slice(0, 7); ; ) {
    const [y, m] = ym.split('-').map(Number);
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const end = monthEnd(ym);
    if (end >= SAVED_ON) break;
    days.push(end);
  }
  const last = c.checks.at(-1).day;
  return [...days.filter(d => d <= last), ...(last === SAVED_ON ? [SAVED_ON] : [])];
}

function seedFor(c) {
  return JSON.stringify({
    today: FIRST_CHECK,
    grants: [{
      id: c.grantId, title: `${c.grantId} (${c.org})`, pi: 'PI', agency: 'NIH',
      awarded: 1, received: 0, spent: 0, promised: 0, start: c.start, end: c.end, status: 'active',
    }],
    statusEvents: [], sourceReadings: [], flags: [], requests: [], orders: [], approvals: [],
    invoices: [], payroll: [], paymentRequests: [], papers: [], holds: [], log: [],
  });
}

function stateOf(conn, grantId) {
  const grant = conn.rows('grant').find(g => g.id === grantId);
  return {
    status: grant.status,
    frozen: grant.frozen,
    reason: grant.frozenReason || null,
    flags: conn.rows('flag').filter(f => f.grantId === grantId && f.open).map(f => f.kind),
    decide: conn.rows('hold').some(h => h.grantId === grantId && h.open && h.kind === 'paid_while_canceled'),
    notice: conn.rows('statusEvent').some(e => e.grantId === grantId && e.kind === 'reading_changed' && /supplement/i.test(e.summary)),
  };
}

/** One case replayed: the tracker's state on each of its check days. */
export async function runCase(c) {
  const { local, worker: workerTs, papers } = await loadAgents();
  const db = await local.createLocalDb({ world: { seedJson: seedFor(c) } });
  const worker = await workerTs.startWorker(db, { sources: await sourcesFor(c.grantId), papers: papers.createPaperLookup({ mode: 'offline', throttle: false }) });
  try {
    await worker.idle();
    const office = await db.connect();
    await office.call('register_person', { role: 'grant_manager', name: 'eval' });
    const wanted = new Set(c.checks.map(k => k.day));
    const got = {};
    for (const day of checkDays(c)) {
      await office.call('set_today', { day });
      await office.call('request_check', { grantId: c.grantId, reason: 'check_now', asOf: day });
      await worker.idle();
      if (wanted.has(day)) got[day] = stateOf(office, c.grantId);
    }
    return got;
  } finally {
    worker.stop();
    db.close();
  }
}

let agents;
async function loadAgents() {
  await loadTs();
  agents ??= (async () => {
    const realConsole = globalThis.console;
    try {
      const [local, worker, papers] = await Promise.all([
        import('../agents/src/db/local.ts'),
        import('../agents/src/worker.ts'),
        import('../agents/src/sources/papers.ts'),
      ]);
      return { local, worker, papers };
    } finally {
      globalThis.console = realConsole;
    }
  })();
  return agents;
}

// The agents narrate to the console; the eval's own output is the table.
async function quietly(run) {
  const { log, error, warn } = console;
  console.log = console.error = console.warn = () => {};
  try {
    return await run();
  } finally {
    Object.assign(console, { log, error, warn });
  }
}

// --- grading -------------------------------------------------------------

/** caught / missed for an expected freeze; correct pass / false alarm for an expected go-ahead. */
export function grade(expect, got) {
  if (expect.frozen) {
    const ok = got.frozen && (!expect.flag || got.flags.includes(expect.flag)) && (!expect.decide || got.decide);
    return ok ? 'caught' : 'missed';
  }
  const ok = !got.frozen && !got.flags.includes('sources_disagree') && (!expect.notice || got.notice);
  return ok ? 'correct pass' : 'false alarm';
}

const describe = e => (e.frozen ? ['frozen', e.flag, e.decide && 'decide'].filter(Boolean).join(' + ') : `unfrozen${e.notice ? ' + notice' : ''}`);
const describeGot = g =>
  [g.frozen ? 'frozen' : 'unfrozen', ...g.flags, g.decide && 'decide', g.notice && 'notice'].filter(Boolean).join(' + ');

export async function score(cases = CASES) {
  await checkFacts(cases);
  const rows = [];
  for (const c of cases) {
    const got = await quietly(() => runCase(c));
    for (const check of c.checks) {
      const g = got[check.day];
      rows.push({
        case: c.id, grantId: c.grantId, kind: c.kind, org: c.org, day: check.day,
        facts: check.why, expected: describe(check.expect), got: describeGot(g),
        trackerSaid: g.reason, outcome: grade(check.expect, g),
      });
    }
  }
  const count = o => rows.filter(r => r.outcome === o).length;
  return {
    totals: { checks: rows.length, grants: cases.length, caught: count('caught'), missed: count('missed'), falseAlarms: count('false alarm'), correctPasses: count('correct pass') },
    rows,
  };
}

export function format({ totals, rows }) {
  const lines = [
    'Fund tracker on real NIH grants (T114). Facts: Grant Witness, USAspending, NIH RePORTER (saved 2026-10-25).',
    'Expected = our freeze policy applied to those facts by hand.',
    '',
  ];
  for (const r of rows) {
    const mark = r.outcome === 'caught' || r.outcome === 'correct pass' ? 'ok ' : 'XX ';
    lines.push(`${mark}${r.grantId.padEnd(12)} ${r.day}  ${r.kind}`);
    lines.push(`     facts:    ${r.facts}`);
    lines.push(`     expected: ${r.expected}   got: ${r.got}   -> ${r.outcome}`);
  }
  lines.push('', `${totals.grants} grants, ${totals.checks} checks: ${totals.caught} caught, ${totals.missed} missed, ${totals.falseAlarms} false alarms, ${totals.correctPasses} correct passes.`);
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({ options: { json: { type: 'boolean' }, 'no-write': { type: 'boolean' }, out: { type: 'string' } } });
  let result;
  try {
    result = await score();
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  console.log(values.json ? JSON.stringify(result, null, 2) : format(result));
  if (!values['no-write']) writeFileSync(values.out ?? here('./fund-tracker-real.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}
