// NIH RePORTER source client. The documented search API gives every
// fiscal-year record for a core project number (amounts and dates), but it
// has no termination field, and is_active only marks the current budget
// period. So the latest record's termination flag comes from ProjectInfo,
// the undocumented web service behind reporter.nih.gov's project pages.

import type { GrantStatus } from '../db/contract.ts';
import { fetchJson } from './http.ts';
import type { SourceClient } from './types.ts';

const SEARCH_URL = 'https://api.reporter.nih.gov/v2/projects/search';
const PROJECT_INFO_URL = 'https://reporter.nih.gov/services/Projects/ProjectInfo';
const DETAILS_URL = 'https://reporter.nih.gov/project-details';

// What ProjectInfo sets on a fiscal-year record that NIH terminated. It can
// stay set on an older year after a court restores the grant, which is why
// only the latest record is checked.
const TERMINATED = 'TERMINATED_DEPT_AUTH';

// Only the fields read() uses. Naming them keeps people's names (PIs,
// program officers) out of the answer; the select functions below drop
// anything else again before saving, in case RePORTER ignores the list.
const INCLUDE_FIELDS = [
  'ApplId',
  'CoreProjectNum',
  'ProjectNum',
  'FiscalYear',
  'AwardAmount',
  'AwardNoticeDate',
  'ProjectEndDate',
];
const RECORD_FIELDS = [
  'appl_id',
  'core_project_num',
  'project_num',
  'fiscal_year',
  'award_amount',
  'award_notice_date',
  'project_end_date',
];
const PROJECT_INFO_FIELDS = ['appl_id', 'post_award_action_type'];
const ACTION_FIELDS = ['revision_type_code'];

// The API's page maximum. A core project number has one record per fiscal
// year plus supplements, so one page always fits; read() checks anyway.
const PAGE_LIMIT = 500;

interface SearchRecord {
  appl_id: number;
  core_project_num?: string | null;
  project_num?: string | null;
  fiscal_year?: number | null;
  award_amount?: number | null;
  award_notice_date?: string | null;
  project_end_date?: string | null;
}

interface SearchAnswer {
  meta: { total: number | null };
  results: SearchRecord[];
}

export interface ReporterOptions {
  fetchImpl?: typeof fetch;
  cacheDir?: string;
  mode?: 'live' | 'offline';
  // YYYY-MM-DD. Decides whether a past end date means the grant has ended.
  today?: () => string;
  // RePORTER asks for at most one request per second. Tests pass 0.
  minIntervalMs?: number;
}

// RePORTER may block an IP that sends more than one request per second, so
// every client in this process shares one schedule. Slots are reserved
// before waiting, so concurrent reads still go out one per interval.
let nextSlotAt = 0;

async function waitForSlot(minIntervalMs: number): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlotAt);
  nextSlotAt = slot + minIntervalMs;
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
}

// Copies only the fields that are present, so a field RePORTER stops sending
// reads the same from a live answer and from its saved copy.
function pick(value: unknown, fields: string[], what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`RePORTER ${what} is not an object`);
  const source = value as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in source) kept[field] = source[field];
  }
  return kept;
}

function trimSearch(raw: unknown): unknown {
  const answer = raw as { meta?: { total?: unknown }; results?: unknown } | null;
  // A malformed answer must fail (and fall back to the saved copy), not be
  // saved as "no records".
  if (!Array.isArray(answer?.results)) throw new Error('RePORTER search answered without a results list');
  return {
    meta: { total: answer.meta?.total ?? null },
    results: answer.results.map((record) => pick(record, RECORD_FIELDS, 'search record')),
  };
}

function trimProjectInfo(raw: unknown): unknown {
  const info = pick(raw, PROJECT_INFO_FIELDS, 'ProjectInfo answer');
  const action = info.post_award_action_type;
  if (typeof action === 'object' && action !== null) {
    info.post_award_action_type = pick(action, ACTION_FIELDS, 'post_award_action_type');
  }
  return info;
}

// A supplement's project number ends in S1, S2, ...: extra money on the same
// grant, not the grant's own record for the year.
const isSupplement = (record: SearchRecord) => /S\d+$/i.test(record.project_num ?? '');

// The newest fiscal year; within a year the grant's own record over a
// supplement (its termination flag and page are the grant's), then the
// latest award notice; then the newest application.
function compareRecords(a: SearchRecord, b: SearchRecord): number {
  const year = (a.fiscal_year ?? -Infinity) - (b.fiscal_year ?? -Infinity);
  if (year !== 0) return year;
  const parent = Number(isSupplement(b)) - Number(isSupplement(a));
  if (parent !== 0) return parent;
  const notice = (a.award_notice_date ?? '').localeCompare(b.award_notice_date ?? '');
  if (notice !== 0) return notice;
  return a.appl_id - b.appl_id;
}

function totalAwarded(records: SearchRecord[]): number | null {
  const amounts = records
    .map((record) => record.award_amount)
    .filter((amount): amount is number => typeof amount === 'number');
  return amounts.length === 0 ? null : amounts.reduce((sum, amount) => sum + amount, 0);
}

function toDate(value: string | null | undefined): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// The revision code, null when the record has no post-award action, or
// undefined when the answer doesn't carry the field at all (we don't know).
function revisionCode(info: unknown, applId: number): string | null | undefined {
  const { appl_id, post_award_action_type: action } = (info ?? {}) as Record<string, unknown>;
  if (appl_id !== applId) return undefined;
  if (action === null) return null;
  if (typeof action !== 'object' || action === undefined) return undefined;
  const code = (action as Record<string, unknown>).revision_type_code;
  return typeof code === 'string' || code === null ? code : undefined;
}

export function createReporterSource(options: ReporterOptions = {}): SourceClient {
  const { fetchImpl, cacheDir, today = localToday, minIntervalMs = 1000 } = options;

  async function get(url: string, request: { body?: unknown; select: (json: unknown) => unknown }) {
    const mode = options.mode ?? (process.env.GG_SOURCES === 'offline' ? 'offline' : 'live');
    if (mode === 'live') await waitForSlot(minIntervalMs);
    return fetchJson(url, { ...request, fetchImpl, cacheDir, mode });
  }

  async function search(grantId: string): Promise<SearchAnswer> {
    const body = { criteria: { project_nums: [grantId] }, include_fields: INCLUDE_FIELDS, limit: PAGE_LIMIT };
    try {
      return (await get(SEARCH_URL, { body, select: trimSearch })) as SearchAnswer;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`NIH RePORTER: search for ${grantId} failed (POST ${SEARCH_URL}): ${reason}`, { cause: error });
    }
  }

  // true or false, or null when ProjectInfo can't say: then the status is
  // unknown rather than guessed.
  async function isTerminated(grantId: string, record: SearchRecord): Promise<boolean | null> {
    const url = `${PROJECT_INFO_URL}?projectId=${record.appl_id}`;
    let info: unknown;
    try {
      info = await get(url, { select: trimProjectInfo });
    } catch (error) {
      console.warn(`NIH RePORTER: no termination flag for ${grantId} (GET ${url} failed); status unknown`, error);
      return null;
    }
    const code = revisionCode(info, record.appl_id);
    if (code === undefined) {
      console.warn(`NIH RePORTER: GET ${url} has no termination field for ${grantId}; status unknown`);
      return null;
    }
    if (code !== null && code !== TERMINATED) {
      // Not known to mean a termination, but a human should look in case
      // NIH renamed the code.
      console.warn(`NIH RePORTER: ${grantId} has an unrecognized post-award action ${code} (GET ${url})`);
    }
    return code === TERMINATED;
  }

  return {
    source: 'NIH RePORTER',
    async read(grantId) {
      const answer = await search(grantId);
      if (typeof answer.meta.total === 'number' && answer.meta.total > answer.results.length) {
        throw new Error(
          `NIH RePORTER: ${grantId} has ${answer.meta.total} records, more than one page (POST ${SEARCH_URL}); the amount awarded would be short`,
        );
      }
      // Only records filed under exactly this core number count toward its
      // totals, whatever else the search matched.
      const records = answer.results.filter(
        (record) => record.core_project_num?.toUpperCase() === grantId.toUpperCase(),
      );
      if (records.length === 0) return null;

      const latest = records.reduce((best, record) => (compareRecords(record, best) > 0 ? record : best));
      const endDate = toDate(latest.project_end_date);
      const terminated = await isTerminated(grantId, latest);

      let status: GrantStatus | null = null;
      if (terminated === true) status = 'canceled';
      else if (terminated === false) status = endDate !== null && endDate < today() ? 'ended' : 'active';

      return {
        grantId,
        source: 'NIH RePORTER',
        status,
        awarded: totalAwarded(records),
        paid: null,
        endDate,
        url: `${DETAILS_URL}/${latest.appl_id}`,
      };
    },
  };
}
