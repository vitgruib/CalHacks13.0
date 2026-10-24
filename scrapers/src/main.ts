// The T15 Apify Actor: reads public NIH cancellation lists (Grant Witness's
// CSV download), turns each row into { grantId, status, url, listedOn, ... }
// and pushes the rows to the Actor's dataset. Run locally (no Apify token
// needed: storage/ on disk) it also writes out/cancellations.json, the file
// the fund tracker reads by default (agents/src/sources/cancellations.ts).
//
// The scraper never posts to the database: only the bookkeeping agent may
// call post_source_reading, so the tracker reads these rows like any other
// source and posts the reading, status event and any disagreement itself.
//
// Input (Actor input, or env vars for local runs; env wins):
//   source     live | saved          GG_SCRAPE_SOURCE   (default live; falls back to saved on failure)
//   grantIds   only these grants     GG_LAB_GRANTS      (comma-separated; default: every listed grant)
//   demo       add the demo row(s)   GG_SCRAPE_DEMO=1   (fixtures/demo-rows.json, made-up, labelled)
//   outFile    local output file     GG_CANCELLATIONS_FILE (default scrapers/out/cancellations.json)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BasicCrawler } from '@crawlee/basic';
import { Actor, log } from 'apify';

import { parseGrantList } from './grant-ids.ts';
import { GRANT_WITNESS_CSV, parseGrantWitnessCsv, SOURCE, type ListedGrant } from './grantwitness.ts';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const SAVED_COPY = here('../fixtures/grantwitness-nih-sample.csv');
const SAVED_COPY_META = here('../fixtures/grantwitness-nih-sample.meta.json');
const DEMO_ROWS = here('../fixtures/demo-rows.json');
const DEFAULT_OUT = here('../out/cancellations.json');

interface Input {
  source?: 'live' | 'saved';
  csvUrl?: string;
  grantIds?: string[];
  demo?: boolean;
  outFile?: string;
}

async function download(url: string): Promise<string | null> {
  let body: string | null = null;
  const crawler = new BasicCrawler({
    maxRequestRetries: 2,
    requestHandlerTimeoutSecs: 300,
    async requestHandler({ request, sendRequest }) {
      const response = await sendRequest({ responseType: 'text', timeout: { request: 240_000 } });
      if (response.statusCode !== 200) throw new Error(`${request.url} answered ${response.statusCode}`);
      if (!/^Award ID,/.test(response.body)) throw new Error(`${request.url} is not the Grant Witness CSV any more (header changed)`);
      body = response.body;
    },
    failedRequestHandler({ request }, error) {
      log.warning(`Could not read ${request.url}: ${error.message}`);
    },
  });
  await crawler.run([url]);
  return body;
}

function demoRows(fetchedAt: string): ListedGrant[] {
  const file = JSON.parse(readFileSync(DEMO_ROWS, 'utf8')) as { rows: Array<Partial<ListedGrant> & Pick<ListedGrant, 'grantId' | 'status' | 'url'>> };
  return file.rows.map((row) => ({
    listedOn: null, listStatus: 'DEMO DATA', terminatedOn: null, restoredOn: null, restoredBy: null,
    fullAwardNumber: null, supplement: null, title: null, institution: null, reporterUrl: null,
    ...row,
    source: SOURCE,
    list: 'DEMO DATA (fixtures/demo-rows.json), not a real list',
    fetchedAt,
    savedCopy: false,
    demo: true,
  }));
}

await Actor.init();
const input = ((await Actor.getInput<Input>()) ?? {}) as Input;
const env = process.env;
const source = (env.GG_SCRAPE_SOURCE as Input['source']) ?? input.source ?? 'live';
const csvUrl = input.csvUrl ?? GRANT_WITNESS_CSV;
const labGrants = env.GG_LAB_GRANTS ? parseGrantList(env.GG_LAB_GRANTS) : parseGrantList((input.grantIds ?? []).join(','));
const demo = env.GG_SCRAPE_DEMO ? env.GG_SCRAPE_DEMO === '1' : (input.demo ?? false);
const outFile = env.GG_CANCELLATIONS_FILE ?? input.outFile ?? (Actor.isAtHome() ? null : DEFAULT_OUT);

let csv = source === 'live' ? await download(csvUrl) : null;
let fetchedAt = new Date().toISOString();
const savedCopy = csv === null;
if (savedCopy) {
  if (source === 'live') log.warning('Live list unreachable: using the saved copy instead.');
  csv = readFileSync(SAVED_COPY, 'utf8');
  fetchedAt = (JSON.parse(readFileSync(SAVED_COPY_META, 'utf8')) as { fetchedAt: string }).fetchedAt;
}

const parsed = parseGrantWitnessCsv(csv!, { fetchedAt, savedCopy });
let rows = parsed.grants;
if (labGrants.length) rows = rows.filter((row) => labGrants.includes(row.grantId));
if (demo) rows = [...rows, ...demoRows(new Date().toISOString())];

await Actor.pushData(rows);
if (outFile) {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(rows, null, 2)}\n`);
}

const counts = rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});
const summary = {
  list: savedCopy ? `saved copy (${fetchedAt})` : csvUrl,
  csvRows: parsed.rowsRead,
  droppedRows: parsed.dropped,
  grantsListed: parsed.grants.length,
  labGrants: labGrants.length ? labGrants : 'all',
  rowsOut: rows.length,
  byStatus: counts,
  demoRows: demo,
  outFile,
};
await Actor.setValue('OUTPUT', summary);
log.info(`Cancellation list: ${JSON.stringify(summary)}`);
await Actor.exit();
