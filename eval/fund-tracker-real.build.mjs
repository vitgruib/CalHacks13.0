#!/usr/bin/env node
// T114: saves the public records the real-grants fund tracker eval reads.
// Run by hand (needs the network and scrapers/node_modules); the eval itself
// only reads what this saves.
//
//   node eval/fund-tracker-real.build.mjs [--csv path/to/nih-dl-table.csv]
//
// 1. Grant Witness's NIH CSV (downloaded unless --csv): the rows for the
//    eval's grants, minus the abstract columns, go to
//    docs/research/sources/docs/<GW_FILE>, and through the scraper's own
//    parser (scrapers/src/grantwitness.ts) to fund-tracker-real.list.json.
// 2. For each grant, the real RePORTER and USAspending readers and the
//    monthly outlays, read live into fund-tracker-real.cache/.
// 3. Prints each grant's facts, the table the cases' expectations are
//    written from by hand.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CACHE_DIR, GW_FILE, LIST_FILE, SAVED_ON, SOURCES_DIR, fundingRows, loadTs, paidSeries } from './fund-tracker-real.sources.mjs';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const GW_CSV = 'https://data.grantwitness.org/nih/dl-table.csv';
const DROP = new Set(['Grant Abstract', 'Public Health Relevance']);

/** Every grant the cases may use, including the never-listed decoys. */
export const GRANTS = (process.env.FT_GRANTS ?? '').split(',').filter(Boolean);

const { values } = parseArgs({ options: { csv: { type: 'string' } } });
const { parse } = createRequire(here('../scrapers/package.json'))('csv-parse/sync');

let csv;
if (values.csv) csv = readFileSync(values.csv, 'utf8');
else {
  const answer = await fetch(GW_CSV);
  if (!answer.ok) throw new Error(`${GW_CSV} answered ${answer.status}`);
  console.log(`Grant Witness last-modified: ${answer.headers.get('last-modified')}`);
  csv = await answer.text();
}
const { grants: wanted } = await import('./fund-tracker-real.cases.mjs').then(m => ({ grants: m.GRANT_IDS })).catch(() => ({ grants: GRANTS }));
const ids = new Set(wanted.length ? wanted : GRANTS);

const records = parse(csv, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
const keep = records.filter(r => ids.has(r['Most Recent FAIN']));
const columns = Object.keys(records[0]).filter(c => !DROP.has(c));
const cell = v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const subset = [columns.map(cell).join(','), ...keep.map(r => columns.map(c => cell(r[c] ?? '')).join(','))].join('\n') + '\n';
writeFileSync(`${SOURCES_DIR}/${GW_FILE}`, subset);
console.log(`saved ${keep.length} Grant Witness rows to docs/research/sources/docs/${GW_FILE}`);

const { parseGrantWitnessCsv } = await import('../scrapers/src/grantwitness.ts');
const list = parseGrantWitnessCsv(subset, { fetchedAt: `${SAVED_ON}T00:00:00Z`, savedCopy: true });
// Only what the tracker reads, plus the list's own words for the record.
const rows = list.grants.map(({ grantId, status, url, listedOn, terminatedOn, restoredOn, supplement, fullAwardNumber, listStatus, restoredBy }) =>
  ({ grantId, status, url, listedOn, terminatedOn, restoredOn, supplement, fullAwardNumber, listStatus, restoredBy }));
writeFileSync(LIST_FILE, `${JSON.stringify(rows, null, 2)}\n`);

const { reporter, usaspending } = await loadTs();
const nih = reporter.createReporterSource({ mode: 'live', cacheDir: CACHE_DIR, today: () => SAVED_ON });
const spending = usaspending.createUsaspendingSource({ mode: 'live', cacheDir: CACHE_DIR });
for (const id of ids) {
  const gw = keep.filter(r => r['Most Recent FAIN'] === id);
  const [r, u] = [await nih.read(id).catch(e => e), await spending.read(id).catch(e => e)];
  const series = paidSeries(await fundingRows(id, { mode: 'live' }));
  console.log(`\n== ${id}`);
  for (const g of gw) {
    console.log(`  GW ${g['Most Recent Full Award Number']} sub=${g['Subaward ID']} ${g['Detailed Status']} | disrupted ${g['Earliest Disruption']} (${g['Disruption Indicators']}) | restored ${g['Latest Restoration']} (${g['Restoration Indicators']}) | ${g['Project Start Date']}..${g['Project End Date (Original)']} | ${g['Grantee Organization']} ${g['Institute']}`);
  }
  if (!gw.length) console.log('  GW: not listed');
  console.log(`  RePORTER: ${r instanceof Error ? r.message : r ? `${r.status} end ${r.endDate} awarded ${r.awarded} ${r.url} awards ${r.awards.map(a => `${a.date}:${a.label}:${a.amount}`).join(' ')}` : 'none'}`);
  console.log(`  USAspending: ${u instanceof Error ? u.message : u ? `obligated ${u.awarded} paid ${u.paid} end ${u.endDate} obligations ${(u.awards ?? []).map(a => `${a.date}:${a.amount}`).join(' ')}` : 'none'}`);
  const last = series.at(-1)?.paid ?? 0;
  console.log(`  outlays: ${series.map(p => `${p.through.slice(0, 7)}=${Math.round(p.paid)}`).join(' ')}${u && !(u instanceof Error) && Math.abs((u.paid ?? 0) - last) > 1 ? `  !! series ends ${last}, total_outlay ${u.paid}` : ''}`);
}
