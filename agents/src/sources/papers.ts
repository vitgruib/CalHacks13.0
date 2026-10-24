// Looks up the papers a progress report lists, for the report checker (T14):
// does the DOI exist, which grants does the paper credit, does it have a
// PubMed Central ID, and was it corrected or retracted.
//
// Crossref and PubMed each know about notices the other misses (JAMA, for
// one, sends its errata to PubMed but not to Crossref), and each holds grant
// numbers the other lacks, so a lookup reads both. RePORTER answers the
// other direction: which papers NIH links to a grant.

import { fetchJson } from './http.ts';
import { readCrossrefNoticeTitles, readCrossrefWork } from './crossref.ts';
import { readPubmed } from './pubmed.ts';

export type UpdateKind = 'correction' | 'retraction' | 'expression_of_concern' | 'other';

export interface PaperUpdate {
  kind: UpdateKind;
  noticeDoi: string | null;
  noticePmid: string | null;
  // The notice's own title. Some journals say what changed ("Error in
  // Affiliation."); others only repeat the paper's title, so a correction
  // with a vague title still needs a person to judge whether it matters.
  title: string | null;
  date: string | null; // YYYY-MM-DD, or YYYY-MM / YYYY when that's all the source gives
  source: 'Crossref' | 'PubMed';
  // Who told Crossref: 'publisher' or 'retraction-watch'. null for PubMed.
  via: string | null;
}

export interface PaperRecord {
  doi: string;
  title: string | null;
  pmid: string | null;
  pmcid: string | null;
  // NIH project numbers the paper acknowledges (PubMed's grant list plus
  // Crossref's funder awards), normalized like 'R01HD115985'. When the paper
  // gives only institute and serial, the entry is just that ('EY006190'):
  // compare with creditsGrant(), not ===.
  grantsCredited: string[];
  otherAwards: string[]; // award numbers that aren't NIH project numbers, as written
  updates: PaperUpdate[];
  urls: string[]; // the API requests each fact came from
}

export interface PaperLookupOptions {
  fetchImpl?: typeof fetch;
  cacheDir?: string;
  mode?: 'live' | 'offline';
  // Crossref and NCBI ask callers to identify themselves. Defaults to
  // GG_CONTACT_EMAIL; sent with each request but never part of the saved copy.
  contactEmail?: string;
  // Space requests to each site's published limit. Tests turn it off.
  throttle?: boolean;
}

export interface PaperLookup {
  lookup(doi: string): Promise<PaperRecord | null>; // null when Crossref has no such DOI
  grantPublications(coreProjectNumber: string): Promise<string[]>; // PMIDs RePORTER links to the grant
}

// How crossref.ts and pubmed.ts reach the network: fetchJson with this
// lookup's cache, mode and manners. `about` names the DOI or grant for errors.
export type Get = (
  url: string,
  about: string,
  options?: { body?: unknown; select?: (json: unknown) => unknown; wrap?: (inner: typeof fetch) => typeof fetch },
) => Promise<unknown>;

// Activity code (R01, K23, UL1...), institute (HD, AI...), serial. A leading
// application-type digit and a trailing support year ('5R01HD115985-03')
// are dropped: the core project number is what stays the same across years.
const FULL_NUMBER = /(?<![A-Z0-9])(?:[1-9]\s*)?([A-Z][A-Z0-9]{2})[\s-]*([A-Z]{2})[\s-]*(\d{6}|\d{4,5}(?!\d))/g;
const INSTITUTE_AND_SERIAL = /^([A-Z]{2})[\s-]*(\d{6}|\d{4,5})$/;

export function grantNumbersIn(raw: string): string[] {
  const text = raw.toUpperCase().trim().replace(/[.;,]+$/, '');
  const found = [...text.matchAll(FULL_NUMBER)].map((m) => m[1] + m[2] + m[3].padStart(6, '0'));
  if (found.length > 0) return [...new Set(found)];
  const partial = INSTITUTE_AND_SERIAL.exec(text);
  return partial ? [partial[1] + partial[2].padStart(6, '0')] : [];
}

export function normalizeGrantNumber(raw: string): string | null {
  return grantNumbersIn(raw)[0] ?? null;
}

export function creditsGrant(paper: Pick<PaperRecord, 'grantsCredited'>, grant: string): boolean {
  const wanted = normalizeGrantNumber(grant);
  if (wanted === null) return false;
  // An 8-character entry is institute + serial only: it matches any activity code.
  return paper.grantsCredited.some(
    (credited) => credited === wanted || (credited.length === 8 && wanted.endsWith(credited)) || (wanted.length === 8 && credited.endsWith(wanted)),
  );
}

// Published limits: Crossref allows one list query per second in its public
// pool, NCBI three requests per second without a key, RePORTER one per second.
const GAP_MS = { crossref: 1000, ncbi: 350, reporter: 1000 } as const;
type Site = keyof typeof GAP_MS;

function siteOf(url: string): Site | null {
  const host = new URL(url).hostname;
  if (host === 'api.crossref.org') return 'crossref';
  if (host.endsWith('ncbi.nlm.nih.gov')) return 'ncbi';
  if (host === 'api.reporter.nih.gov') return 'reporter';
  return null;
}

// Shared by every lookup in the process, so two checkers running at once
// still stay under each site's limit together.
const turns = new Map<Site, Promise<void>>();

function takeTurn(site: Site): Promise<void> {
  const before = turns.get(site) ?? Promise.resolve();
  turns.set(site, before.then(() => new Promise<void>((resolve) => setTimeout(resolve, GAP_MS[site]))));
  return before;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function politeFetch(inner: typeof fetch, contactEmail: string | undefined, throttle: boolean): typeof fetch {
  return async (input, init) => {
    let url = String(input);
    const site = siteOf(url);
    const headers = new Headers(init?.headers);
    // Added here, below fetchJson, so the address never lands in a cache key
    // or a committed saved copy.
    if (site === 'crossref') {
      headers.set('user-agent', `GrantGuard/0.1 (CalHacks 13.0 project${contactEmail ? `; mailto:${contactEmail}` : ''})`);
    }
    if (site === 'ncbi' && contactEmail) url += `&email=${encodeURIComponent(contactEmail)}`;
    for (let attempt = 0; ; attempt++) {
      if (throttle && site) await takeTurn(site);
      const response = await inner(url, { ...init, headers });
      if ((response.status !== 429 && response.status !== 503) || attempt === 2) return response;
      await response.body?.cancel();
      await sleep(Math.min(Number(response.headers.get('retry-after')) || 2, 10) * 1000);
    }
  };
}

function cleanDoi(input: string): string {
  const doi = input
    .trim()
    .replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '')
    .toLowerCase();
  if (!/^10\.\d{4,9}\/\S+$/.test(doi)) throw new Error(`papers: "${input}" is not a DOI`);
  return doi;
}

const REPORTER_PUBLICATIONS = 'https://api.reporter.nih.gov/v2/publications/search';
const REPORTER_PAGE = 500;

function keepReporterFields(raw: unknown): unknown {
  const json = (raw ?? {}) as { meta?: { total?: unknown }; results?: Array<{ coreproject?: unknown; pmid?: unknown }> };
  return {
    meta: { total: json.meta?.total ?? 0 },
    results: (json.results ?? []).map((row) => ({ coreproject: row.coreproject, pmid: row.pmid })),
  };
}

export function createPaperLookup(options: PaperLookupOptions = {}): PaperLookup {
  const contactEmail = options.contactEmail ?? (process.env.GG_CONTACT_EMAIL || undefined);
  const base = politeFetch(options.fetchImpl ?? fetch, contactEmail, options.throttle ?? true);

  const get: Get = async (url, about, { body, select, wrap } = {}) => {
    try {
      return await fetchJson(url, {
        body,
        select,
        cacheDir: options.cacheDir,
        mode: options.mode,
        fetchImpl: wrap ? wrap(base) : base,
      });
    } catch (error) {
      throw new Error(`papers: ${about}: could not read ${url}: ${(error as Error).message}`, { cause: error });
    }
  };

  return {
    async lookup(input) {
      const doi = cleanDoi(input);
      const about = `DOI ${doi}`;
      const work = await readCrossrefWork(get, doi, about);
      if (work === null) return null;
      const [noticeTitles, pubmed] = await Promise.all([
        readCrossrefNoticeTitles(get, work.updates, about),
        readPubmed(get, doi, about),
      ]);

      const grantsCredited: string[] = [];
      const otherAwards: string[] = [];
      for (const raw of [...pubmed.grantIds, ...work.awards]) {
        const numbers = grantNumbersIn(raw);
        if (numbers.length === 0) otherAwards.push(raw.trim());
        grantsCredited.push(...numbers);
      }

      const crossrefUpdates = work.updates.map((update) => ({
        ...update,
        title: (update.noticeDoi && noticeTitles.titles.get(update.noticeDoi)) || null,
      }));

      return {
        doi,
        title: work.title ?? pubmed.title,
        pmid: pubmed.pmid,
        pmcid: pubmed.pmcid,
        grantsCredited: [...new Set(grantsCredited)],
        otherAwards: [...new Set(otherAwards)],
        updates: [...crossrefUpdates, ...pubmed.updates],
        urls: [...new Set([work.url, ...noticeTitles.urls, ...pubmed.urls])],
      };
    },

    async grantPublications(input) {
      const core = normalizeGrantNumber(input);
      if (core === null || core.length !== 11) {
        throw new Error(`papers: "${input}" is not an NIH core project number (like R01HD115985)`);
      }
      const pmids = new Set<string>();
      for (let offset = 0; ; offset += REPORTER_PAGE) {
        const page = (await get(REPORTER_PUBLICATIONS, `grant ${core}`, {
          body: { criteria: { core_project_nums: [core] }, offset, limit: REPORTER_PAGE },
          select: keepReporterFields,
        })) as { meta: { total: number }; results: Array<{ pmid: unknown }> };
        for (const row of page.results) if (row.pmid !== undefined && row.pmid !== null) pmids.add(String(row.pmid));
        if (page.results.length === 0 || offset + REPORTER_PAGE >= page.meta.total) break;
      }
      return [...pmids].sort((a, b) => Number(a) - Number(b));
    },
  };
}
