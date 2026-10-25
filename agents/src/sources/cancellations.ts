// Cancellation lists (Grant Witness and the like), as scraped by T15's Apify
// scraper in scrapers/. Only the bookkeeping agent may post readings, so the
// scraper doesn't post them: it leaves its rows in an Apify dataset or a JSON
// file, and the fund tracker reads them here like any other source.
//
// Each row: { grantId, status, url, listedOn? }. grantId can be a full number
// (5R01GM061721-21); status words like "terminated" or "reinstated" are
// mapped to ours. A grant that isn't on the list gets no reading: absence
// says nothing either way.
//
// GG_APIFY_ACTOR (+ APIFY_TOKEN), e.g. nathanqiu~nih-grant-cancellation-list:
//   read the latest successful run of that Actor, so a scheduled run keeps it
//   fresh. GG_APIFY_DATASET instead pins one run's dataset. Either is cached
//   like the government sites (the token goes in a header, never in
//   agents/cache/), asks only for the fields read here (~40 KB gzipped for the
//   whole list), and is downloaded once per check, not once per grant.
//   Check now (beforeCheck 'check_now') first starts a fresh run of the Actor
//   (waits up to 60 s; a run takes ~8 s) and reads that run's dataset instead
//   of the memo; rechecks before money moves don't. A
//   run that fails falls back to the latest run and says so in the check's
//   log line. Needs the token and live mode (GG_SOURCES isn't offline).
// Demo time (T59, viewAsOf): read the list as it stood on a past real day,
//   from each row's own dates (scrapers/ T57 does the same in the Actor):
//   before terminatedOn the grant isn't listed, until restoredOn it's
//   canceled, from restoredOn on it has its current status. A row without
//   terminatedOn (an older saved copy) can't be placed, so it isn't listed.
// GG_LAB_GRANTS (comma-separated): the saved copy keeps only these grants, so
//   agents/cache/ doesn't hold the whole list.
// GG_CANCELLATIONS_FILE: read a local file instead (default
//   scrapers/out/cancellations.json; no file means no readings).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { GrantStatus } from '../db/contract.ts';
import { fetchJson } from './http.ts';
import { normalizeGrantNumber } from './papers.ts';
import type { Reading, SourceClient } from './types.ts';

const DEFAULT_FILE = fileURLToPath(new URL('../../../scrapers/out/cancellations.json', import.meta.url));

export interface ListedGrant {
  grantId: string;
  status: GrantStatus;
  url: string;
  listedOn: string | null;
  terminatedOn: string | null;
  restoredOn: string | null;
}

const STATUS_WORDS: Array<[RegExp, GrantStatus]> = [
  [/reinstat|restor|court/i, 'restored_by_court'],
  [/terminat|cancel|suspend/i, 'canceled'],
  [/active|unfrozen/i, 'active'],
];

export function statusOf(word: unknown): GrantStatus | null {
  if (typeof word !== 'string') return null;
  return STATUS_WORDS.find(([pattern]) => pattern.test(word))?.[1] ?? null;
}

// NIH numbers come back as core project numbers; anything else that still
// looks like an id (one token, letters and digits) is kept as written.
function grantIdOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return normalizeGrantNumber(raw) ?? (/^[A-Z0-9-]{6,}$/i.test(raw.trim()) ? raw.trim().toUpperCase() : null);
}

const dayOf = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

/** A row as the list showed it on `day` (demo time), or null if it wasn't listed yet. */
export function asListedOn(row: ListedGrant, day: string | null): ListedGrant | null {
  if (!day) return row;
  if (!row.terminatedOn || row.terminatedOn > day) return null;
  if (row.restoredOn && row.restoredOn > day) return { ...row, status: 'canceled', listedOn: row.terminatedOn, restoredOn: null };
  return row;
}

// Rows that can't be read (no grant number, an unknown status) are dropped,
// not guessed at.
export function parseList(raw: unknown): ListedGrant[] {
  if (!Array.isArray(raw)) throw new Error(`a cancellation list must be an array of rows, got ${typeof raw}`);
  const rows: ListedGrant[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const grantId = grantIdOf(item?.grantId);
    const status = statusOf(item?.status);
    if (!grantId || !status || typeof item.url !== 'string') continue;
    rows.push({ grantId, status, url: item.url, listedOn: dayOf(item.listedOn), terminatedOn: dayOf(item.terminatedOn), restoredOn: dayOf(item.restoredOn) });
  }
  return rows;
}

export interface CancellationListOptions {
  actor?: string;
  dataset?: string;
  grants?: string[];
  token?: string;
  file?: string;
  fetchImpl?: typeof fetch;
  cacheDir?: string;
  mode?: 'live' | 'offline';
}

export function createCancellationListSource(options: CancellationListOptions = {}): SourceClient {
  const dataset = options.dataset ?? process.env.GG_APIFY_DATASET;
  const actor = options.actor ?? process.env.GG_APIFY_ACTOR;
  const token = options.token ?? process.env.APIFY_TOKEN;
  const file = options.file ?? process.env.GG_CANCELLATIONS_FILE ?? DEFAULT_FILE;
  const grantList = options.grants ?? process.env.GG_LAB_GRANTS?.split(',');
  const lab = grantList ? new Set(grantList.map((id) => grantIdOf(id.trim())).filter((id) => id !== null)) : null;

  const items = dataset
    ? `datasets/${encodeURIComponent(dataset)}/items?`
    : actor
      ? `acts/${encodeURIComponent(actor)}/runs/last/dataset/items?status=SUCCEEDED&`
      : null;

  const mode = options.mode ?? (process.env.GG_SOURCES === 'offline' ? 'offline' : 'live');
  const canRun = !dataset && actor && token && mode === 'live';
  const FIELDS = 'clean=true&format=json&fields=grantId,status,url,listedOn,terminatedOn,restoredOn';

  // A check reads every grant within moments; the list changes at most daily.
  const FRESH_MS = 10 * 60_000;
  let loaded: { at: number; rows: Promise<ListedGrant[]> } | undefined;
  let viewDay: string | null = null;

  async function fetchList(): Promise<ListedGrant[]> {
    const url = `https://api.apify.com/v2/${items}${FIELDS}`;
    const raw = await fetchJson(url, {
      fetchImpl: options.fetchImpl,
      cacheDir: options.cacheDir,
      mode: options.mode,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      // Saved without anything the tracker doesn't read.
      select: (json) => parseList(json).filter((row) => !lab || lab.has(row.grantId)),
    });
    return parseList(raw);
  }

  // A fresh Actor run and its dataset. Not saved to agents/cache/: each run
  // has its own dataset id, and the next plain read saves the same rows.
  async function freshRun(): Promise<{ runId: string; rows: ListedGrant[] }> {
    const doFetch = options.fetchImpl ?? fetch;
    const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
    const started = await doFetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actor!)}/runs?waitForFinish=60`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: '{}', // the Actor's defaults: the whole live list
      signal: AbortSignal.timeout(75_000),
    });
    if (!started.ok) throw new Error(`starting a run answered ${started.status}`);
    const run = ((await started.json()) as { data?: { id?: string; status?: string; defaultDatasetId?: string } }).data;
    if (run?.status !== 'SUCCEEDED' || !run.defaultDatasetId) throw new Error(`run ${run?.id ?? '?'} ended ${run?.status ?? 'with no status'}`);
    const answer = await doFetch(`https://api.apify.com/v2/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?${FIELDS}`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (!answer.ok) throw new Error(`run ${run.id}'s dataset answered ${answer.status}`);
    return { runId: run.id ?? '?', rows: parseList(await answer.json()) };
  }

  async function load(): Promise<ListedGrant[]> {
    if (items) {
      if (!loaded || Date.now() - loaded.at > FRESH_MS) {
        const rows = fetchList();
        loaded = { at: Date.now(), rows };
        rows.catch(() => (loaded = undefined)); // a failed download isn't remembered
      }
      return loaded.rows;
    }
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      return []; // the scraper hasn't run yet
    }
    return parseList(JSON.parse(text));
  }

  return {
    source: 'Cancellation list (Apify)',
    viewAsOf(day) {
      viewDay = day;
    },
    async beforeCheck(reason) {
      if (reason !== 'check_now' || !canRun) return undefined;
      try {
        const { runId, rows } = await freshRun();
        loaded = { at: Date.now(), rows: Promise.resolve(rows) };
        return `read fresh Apify run ${runId} (${rows.length} grants listed)`;
      } catch (error) {
        return `a fresh Apify run failed (${error instanceof Error ? error.message : error}), so this check reads the latest run`;
      }
    },
    async read(grantId): Promise<Reading | null> {
      const wanted = grantIdOf(grantId) ?? grantId;
      const listed = (await load())
        .filter((row) => row.grantId === wanted)
        .map((row) => asListedOn(row, viewDay))
        .filter((row) => row !== null);
      if (listed.length === 0) return null;
      // The newest listing wins; undated rows count as oldest.
      const latest = listed.reduce((a, b) => ((b.listedOn ?? '') >= (a.listedOn ?? '') ? b : a));
      return { grantId, source: 'Cancellation list (Apify)', status: latest.status, awarded: null, paid: null, endDate: null, url: latest.url };
    },
  };
}
