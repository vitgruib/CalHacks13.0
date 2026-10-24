// Grant Witness's NIH list (https://grantwitness.org/nih), from the CSV the
// page offers as "download the full dataset". One CSV row per disrupted award
// (terminated, frozen, then maybe reinstated or unfrozen), including
// supplements (Subaward ID like "04S1").
//
// We turn each row into a ListedGrant: the shape the fund tracker reads
// (agents/src/sources/cancellations.ts: { grantId, status, url, listedOn? },
// extra fields are ignored there) plus what a person needs to check it.
//
// Restored grants are kept, not dropped: if the list only carried
// cancellations, a grant that a court restored would vanish from it, and the
// tracker (for which absence says nothing) would keep the stale "canceled".

import { parse } from 'csv-parse/sync';

import { parseGrantNumber } from './grant-ids.ts';

export const GRANT_WITNESS_CSV = 'https://data.grantwitness.org/nih/dl-table.csv';
export const GRANT_WITNESS_PAGE = 'https://grantwitness.org/nih';
export const SOURCE = 'Cancellation list (Apify)'; // server/src/vocab.ts SOURCES

// Our statuses (server/src/vocab.ts GRANT_STATUSES).
export type ListStatus = 'canceled' | 'restored_by_court' | 'active';

export interface ListedGrant {
  grantId: string; // core project number, R01GM061721
  status: ListStatus;
  url: string; // where a person can check the listing
  listedOn: string | null; // date of the latest change the list records (YYYY-MM-DD)
  source: typeof SOURCE;
  list: string; // which list this came from
  listStatus: string; // the list's own words, e.g. "Reinstated (confirmed)"
  terminatedOn: string | null; // earliest disruption (termination or freeze)
  restoredOn: string | null;
  restoredBy: string | null; // e.g. "Thakur v. Trump (Sep 2025)" or "Freeze lifted"
  fullAwardNumber: string | null; // 5R01GM061721-21
  supplement: string | null; // "S1" when the row is a supplement, not the whole grant
  title: string | null;
  institution: string | null;
  reporterUrl: string | null;
  fetchedAt: string; // when the list was read (ISO)
  savedCopy: boolean; // true when read from the saved copy, not the live site
  demo?: true; // made-up demo row (fixtures/demo-rows.json), never real
}

// Grant Witness "Detailed Status" → ours. Frozen funds can't be drawn, which
// for the lab's spending is the same as canceled. Anything unknown is
// dropped rather than guessed.
const STATUS: Record<string, ListStatus> = {
  terminated: 'canceled',
  frozen: 'canceled',
  'reinstated (confirmed)': 'restored_by_court',
  'reinstated (unconfirmed)': 'restored_by_court',
  'unfrozen (confirmed)': 'active',
  'unfrozen (unconfirmed)': 'active',
};

const blank = (value: string | undefined): string | null => {
  const v = value?.trim();
  return !v || v === 'N/A' ? null : v;
};
const date = (value: string | undefined): string | null => {
  const v = blank(value);
  return v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
};

export interface ParseOptions {
  fetchedAt: string;
  savedCopy: boolean;
}

export interface ParseResult {
  grants: ListedGrant[];
  rowsRead: number;
  dropped: number; // rows with no readable grant number or an unknown status
}

/** Parses Grant Witness's NIH CSV into one ListedGrant per core project number. */
export function parseGrantWitnessCsv(csv: string, { fetchedAt, savedCopy }: ParseOptions): ParseResult {
  const records = parse(csv, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true }) as Record<string, string>[];
  const byGrant = new Map<string, ListedGrant>();
  let dropped = 0;

  for (const r of records) {
    const number = parseGrantNumber(blank(r['Most Recent Full Award Number'])) ?? parseGrantNumber(blank(r['Most Recent FAIN']));
    const listStatus = blank(r['Detailed Status']);
    const status = listStatus ? STATUS[listStatus.toLowerCase()] : undefined;
    if (!number || !listStatus || !status) {
      dropped++;
      continue;
    }
    const subaward = blank(r['Subaward ID']);
    const terminatedOn = date(r['Earliest Disruption']);
    const restoredOn = date(r['Latest Restoration']);
    const grant: ListedGrant = {
      grantId: number.core,
      status,
      url: GRANT_WITNESS_PAGE,
      listedOn: status === 'canceled' ? terminatedOn : (restoredOn ?? terminatedOn),
      source: SOURCE,
      list: 'Grant Witness (NIH)',
      listStatus,
      terminatedOn,
      restoredOn,
      restoredBy: blank(r['Restoration Indicators']),
      fullAwardNumber: blank(r['Most Recent Full Award Number']),
      supplement: number.supplement ?? (subaward ? subaward.replace(/^\d+/, '') || subaward : null),
      title: blank(r['Grant Title']),
      institution: blank(r['Grantee Organization']),
      reporterUrl: blank(r['RePORTER']),
      fetchedAt,
      savedCopy,
    };
    // A grant listed both as the whole award and as a supplement: the whole
    // award's row speaks for the grant. A supplement-only listing is kept
    // (part of the grant's money is affected), marked by `supplement`.
    const existing = byGrant.get(grant.grantId);
    if (!existing || (existing.supplement && !grant.supplement)) byGrant.set(grant.grantId, grant);
  }

  return { grants: [...byGrant.values()], rowsRead: records.length, dropped };
}
