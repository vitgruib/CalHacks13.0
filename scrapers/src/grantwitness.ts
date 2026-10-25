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
//
// asOf (YYYY-MM-DD) is the time switch for test runs: the same real list, as
// it stood that day, read off each row's own dates. Before the earliest
// disruption the grant isn't listed; from it until the latest restoration it
// is canceled (Terminated, or Frozen when it was later unfrozen); from the
// restoration on it has its current status. The list keeps only the earliest
// disruption and the latest restoration, so a grant cut, restored and cut
// again shows its current status from that restoration on.

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
  asOf: string | null; // the day the list is shown as of (time switch), or null for today's list
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
  asOf?: string | null;
}

export interface ParseResult {
  grants: ListedGrant[];
  rowsRead: number;
  dropped: number; // rows with no readable grant number or an unknown status
  notYetListed: number; // rows whose disruption came after asOf (or has no date)
}

/** Parses Grant Witness's NIH CSV into one ListedGrant per core project number. */
export function parseGrantWitnessCsv(csv: string, { fetchedAt, savedCopy, asOf = null }: ParseOptions): ParseResult {
  const records = parse(csv, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true }) as Record<string, string>[];
  const byGrant = new Map<string, ListedGrant>();
  let dropped = 0;
  let notYetListed = 0;

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
    let restoredOn = date(r['Latest Restoration']);
    let restoredBy = blank(r['Restoration Indicators']);
    let shown = { status, listStatus };
    if (asOf) {
      if (!terminatedOn || terminatedOn > asOf) {
        notYetListed++;
        continue;
      }
      if (restoredOn && restoredOn > asOf) {
        shown = { status: 'canceled', listStatus: status === 'active' ? 'Frozen' : status === 'restored_by_court' ? 'Terminated' : listStatus };
        restoredOn = null;
        restoredBy = null;
      }
    }
    const grant: ListedGrant = {
      grantId: number.core,
      status: shown.status,
      url: GRANT_WITNESS_PAGE,
      listedOn: shown.status === 'canceled' ? terminatedOn : (restoredOn ?? terminatedOn),
      source: SOURCE,
      list: 'Grant Witness (NIH)',
      listStatus: shown.listStatus,
      terminatedOn,
      restoredOn,
      restoredBy,
      fullAwardNumber: blank(r['Most Recent Full Award Number']),
      supplement: number.supplement ?? (subaward ? subaward.replace(/^\d+/, '') || subaward : null),
      title: blank(r['Grant Title']),
      institution: blank(r['Grantee Organization']),
      reporterUrl: blank(r['RePORTER']),
      fetchedAt,
      savedCopy,
      asOf,
    };
    // A grant listed both as the whole award and as a supplement: the whole
    // award's row speaks for the grant. A supplement-only listing is kept
    // (part of the grant's money is affected), marked by `supplement`.
    const existing = byGrant.get(grant.grantId);
    if (!existing || (existing.supplement && !grant.supplement)) byGrant.set(grant.grantId, grant);
  }

  return { grants: [...byGrant.values()], rowsRead: records.length, dropped, notYetListed };
}
