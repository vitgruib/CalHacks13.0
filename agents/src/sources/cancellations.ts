// Cancellation lists (Grant Witness and the like), as scraped by T15's Apify
// scraper in scrapers/. Only the bookkeeping agent may post readings, so the
// scraper doesn't post them: it leaves its rows in an Apify dataset or a JSON
// file, and the fund tracker reads them here like any other source.
//
// Each row: { grantId, status, url, listedOn? }. grantId can be a full number
// (5R01GM000001-03); status words like "terminated" or "reinstated" are
// mapped to ours. A grant that isn't on the list gets no reading: absence
// says nothing either way.
//
// GG_APIFY_DATASET (+ APIFY_TOKEN): read that Apify dataset, cached like the
//   government sites (the token goes in a header, never in agents/cache/).
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

// Rows that can't be read (no grant number, an unknown status) are dropped,
// not guessed at.
export function parseList(raw: unknown): ListedGrant[] {
  if (!Array.isArray(raw)) throw new Error(`a cancellation list must be an array of rows, got ${typeof raw}`);
  const rows: ListedGrant[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const grantId = grantIdOf(item?.grantId);
    const status = statusOf(item?.status);
    if (!grantId || !status || typeof item.url !== 'string') continue;
    const listedOn = typeof item.listedOn === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item.listedOn) ? item.listedOn.slice(0, 10) : null;
    rows.push({ grantId, status, url: item.url, listedOn });
  }
  return rows;
}

export interface CancellationListOptions {
  dataset?: string;
  token?: string;
  file?: string;
  fetchImpl?: typeof fetch;
  cacheDir?: string;
  mode?: 'live' | 'offline';
}

export function createCancellationListSource(options: CancellationListOptions = {}): SourceClient {
  const dataset = options.dataset ?? process.env.GG_APIFY_DATASET;
  const token = options.token ?? process.env.APIFY_TOKEN;
  const file = options.file ?? process.env.GG_CANCELLATIONS_FILE ?? DEFAULT_FILE;

  async function load(): Promise<ListedGrant[]> {
    if (dataset) {
      const url = `https://api.apify.com/v2/datasets/${encodeURIComponent(dataset)}/items?clean=true&format=json`;
      const raw = await fetchJson(url, {
        fetchImpl: options.fetchImpl,
        cacheDir: options.cacheDir,
        mode: options.mode,
        headers: token ? { authorization: `Bearer ${token}` } : {},
        // Saved without anything the tracker doesn't read.
        select: (json) => parseList(json),
      });
      return parseList(raw);
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
    async read(grantId): Promise<Reading | null> {
      const wanted = grantIdOf(grantId) ?? grantId;
      const listed = (await load()).filter((row) => row.grantId === wanted);
      if (listed.length === 0) return null;
      // The newest listing wins; undated rows count as oldest.
      const latest = listed.reduce((a, b) => ((b.listedOn ?? '') >= (a.listedOn ?? '') ? b : a));
      return { grantId, source: 'Cancellation list (Apify)', status: latest.status, awarded: null, paid: null, endDate: null, url: latest.url };
    },
  };
}
