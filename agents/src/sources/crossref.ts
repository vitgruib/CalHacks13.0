// Crossref: does the DOI exist, its title, the awards its funders list, and
// the notices that update it. `updated-by` is Crossref's reverse index of
// every notice's `update-to`, and since the 2023 acquisition it includes
// Retraction Watch's records (source 'retraction-watch'), so one request
// covers what the `updates:<doi>` filter would and more.
//
// The list endpoint (`filter=doi:`) is used instead of /works/<doi> because it
// answers "no such DOI" with an empty list, not a 404, and fetchJson can keep
// a saved copy of an empty list. That keeps "not found" working offline.

import type { Get, PaperUpdate, UpdateKind } from './papers.ts';

const WORKS = 'https://api.crossref.org/works';

type Json = Record<string, unknown>;
const asObject = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

// Titles can carry JATS/HTML markup and line breaks.
function cleanTitle(value: unknown): string | null {
  const first = asText(asArray(value)[0]);
  return first === null ? null : first.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;
}

const UPDATE_KINDS: Record<string, UpdateKind> = {
  correction: 'correction',
  erratum: 'correction',
  corrigendum: 'correction',
  retraction: 'retraction',
  partial_retraction: 'retraction',
  withdrawal: 'retraction',
  removal: 'retraction',
  expression_of_concern: 'expression_of_concern',
};

function updateKind(type: string): UpdateKind {
  return UPDATE_KINDS[type.toLowerCase().replace(/-/g, '_')] ?? 'other';
}

function dateFromParts(value: unknown): string | null {
  const parts = asArray(asArray(asObject(value)['date-parts'])[0]).filter((part): part is number => typeof part === 'number');
  if (parts.length === 0) return null;
  return parts.map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0'))).join('-');
}

// Keeps only what the client reads, before fetchJson saves it. Asking the
// server to `select` the same fields means authors never travel either.
function keepWorkFields(raw: unknown): unknown {
  const message = asObject(asObject(raw).message);
  return {
    message: {
      'total-results': message['total-results'] ?? null,
      items: asArray(message.items).map((entry) => {
        const item = asObject(entry);
        return {
          DOI: item.DOI ?? null,
          title: asArray(item.title),
          funder: asArray(item.funder).map((funder) => ({ name: asObject(funder).name ?? null, award: asArray(asObject(funder).award) })),
          'updated-by': asArray(item['updated-by']).map((update) => {
            const fields = asObject(update);
            return {
              DOI: fields.DOI ?? null,
              type: fields.type ?? null,
              source: fields.source ?? null,
              updated: { 'date-parts': asObject(fields.updated)['date-parts'] ?? null },
            };
          }),
        };
      }),
    },
  };
}

function keepNoticeFields(raw: unknown): unknown {
  const message = asObject(asObject(raw).message);
  return {
    message: {
      items: asArray(message.items).map((entry) => ({ DOI: asObject(entry).DOI ?? null, title: asArray(asObject(entry).title) })),
    },
  };
}

export interface CrossrefWork {
  url: string;
  title: string | null;
  awards: string[];
  updates: PaperUpdate[]; // titles are filled in from readCrossrefNoticeTitles
}

export async function readCrossrefWork(get: Get, doi: string, about: string): Promise<CrossrefWork | null> {
  const url = `${WORKS}?filter=doi:${encodeURIComponent(doi)}&select=DOI,title,funder,updated-by&rows=1`;
  const answer = asObject(await get(url, about, { select: keepWorkFields }));
  const item = asArray(asObject(answer.message).items)
    .map(asObject)
    .find((entry) => asText(entry.DOI)?.toLowerCase() === doi);
  if (item === undefined) return null;

  const awards = asArray(item.funder).flatMap((funder) => asArray(asObject(funder).award).map(asText).filter((award) => award !== null));

  const seen = new Set<string>();
  const updates: PaperUpdate[] = [];
  for (const entry of asArray(item['updated-by'])) {
    const fields = asObject(entry);
    const type = asText(fields.type);
    if (type === null) continue;
    const update: PaperUpdate = {
      kind: updateKind(type),
      noticeDoi: asText(fields.DOI)?.toLowerCase() ?? null,
      noticePmid: null,
      title: null,
      date: dateFromParts(fields.updated),
      source: 'Crossref',
      via: asText(fields.source),
    };
    // A publisher and Retraction Watch often report the same notice; both
    // are kept since they're separate claims. Only exact repeats are dropped.
    const key = `${update.kind}|${update.noticeDoi}|${update.via}`;
    if (seen.has(key)) continue;
    seen.add(key);
    updates.push(update);
  }

  return { url, title: cleanTitle(item.title), awards, updates };
}

export async function readCrossrefNoticeTitles(
  get: Get,
  updates: PaperUpdate[],
  about: string,
): Promise<{ titles: Map<string, string>; urls: string[] }> {
  const dois = [...new Set(updates.map((update) => update.noticeDoi).filter((doi) => doi !== null))].sort();
  const titles = new Map<string, string>();
  if (dois.length === 0) return { titles, urls: [] };
  // Repeating a filter name ORs the values: one request for every notice.
  const filter = dois.map((doi) => `doi:${encodeURIComponent(doi)}`).join(',');
  const url = `${WORKS}?filter=${filter}&select=DOI,title&rows=${dois.length}`;
  const answer = asObject(await get(url, `${about} (notices)`, { select: keepNoticeFields }));
  for (const entry of asArray(asObject(answer.message).items)) {
    const item = asObject(entry);
    const doi = asText(item.DOI)?.toLowerCase();
    const title = cleanTitle(item.title);
    if (doi && title) titles.set(doi, title);
  }
  return { titles, urls: [url] };
}
