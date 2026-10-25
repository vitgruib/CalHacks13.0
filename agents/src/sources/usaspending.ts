// USAspending: how much of an NIH grant is committed (obligated) and how much
// has actually been paid out (outlays). The rise in paid-out money is how the
// tracker sees a restored grant's money really arrive.
//
// It never says a grant was terminated (only $0 non-financial transactions
// hint at it), so status is always null here. Paid-out figures lag about two
// months behind the payments themselves.

import { fetchJson } from './http.ts';
import type { AwardAction, Reading, SourceClient } from './types.ts';

const API = 'https://api.usaspending.gov/api/v2/awards';
const SITE = 'https://www.usaspending.gov/award';

// The award ID is built from the NIH core project number (FAIN) and HHS's
// agency code 075. Full project numbers like 5R01HD115985-03 have no award.
export function awardIdFor(grantId: string): string {
  return `ASST_NON_${encodeURIComponent(grantId)}_075`;
}

interface AwardAnswer {
  notFound?: true;
  total_obligation?: number | null;
  total_outlay?: number | null;
  period_of_performance?: { end_date?: string | null };
}

// Only the fields the reading uses get saved: the full answer also carries
// executive names and recipient contacts we don't want in git.
function trim(raw: unknown): AwardAnswer {
  const award = (raw ?? {}) as Record<string, unknown> & AwardAnswer;
  if (award.notFound === true) return { notFound: true };
  return {
    total_obligation: award.total_obligation ?? null,
    total_outlay: award.total_outlay ?? null,
    period_of_performance: { end_date: award.period_of_performance?.end_date ?? null },
  };
}

// fetchJson treats every non-2xx as an outage and would serve an older saved
// copy, but a 404 is USAspending's real answer ("no such award"), so it's
// turned into a body that is saved and replayed like any other answer.
function notFoundAsAnswer(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    if (response.status !== 404) return response;
    await response.body?.cancel();
    return Response.json({ notFound: true });
  };
}

const dollars = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const isoDate = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

const TRANSACTIONS_URL = 'https://api.usaspending.gov/api/v2/transactions/';
const TRANSACTION_FIELDS = ['action_date', 'federal_action_obligation', 'modification_number'];

interface TransactionsAnswer {
  results: Array<{ action_date?: string; federal_action_obligation?: number; modification_number?: string }>;
  hasNext: boolean;
}

// Keeps only the dates and amounts (the full rows carry descriptions).
function trimTransactions(raw: unknown): TransactionsAnswer {
  const answer = (raw ?? {}) as { results?: unknown; page_metadata?: { hasNext?: unknown } };
  if (!Array.isArray(answer.results)) throw new Error('USAspending transactions answered without a results list');
  return {
    results: answer.results.map((row) =>
      Object.fromEntries(TRANSACTION_FIELDS.filter((field) => field in row).map((field) => [field, row[field]])),
    ),
    hasNext: answer.page_metadata?.hasNext === true,
  };
}

export function createUsaspendingSource(
  options: { fetchImpl?: typeof fetch; cacheDir?: string; mode?: 'live' | 'offline' } = {},
): SourceClient {
  const fetchImpl = notFoundAsAnswer(options.fetchImpl ?? ((input, init) => fetch(input, init)));

  return {
    source: 'USAspending',
    async read(grantId) {
      const awardId = awardIdFor(grantId);
      const url = `${API}/${awardId}/`;
      let award: AwardAnswer;
      try {
        award = (await fetchJson(url, {
          fetchImpl,
          cacheDir: options.cacheDir,
          mode: options.mode,
          select: trim,
        })) as AwardAnswer;
      } catch (error) {
        throw new Error(`USAspending: could not read ${grantId} from ${url}: ${(error as Error).message}`, {
          cause: error,
        });
      }
      if (award.notFound) return null;

      // Each obligation, for comparing with RePORTER year by year. Without
      // them the totals are still worth reporting, so a failure is only logged.
      let awards: AwardAction[] | undefined = [];
      try {
        for (let page = 1; ; page++) {
          const body = { award_id: awardId, limit: 100, page, sort: 'action_date', order: 'asc' };
          const answer = (await fetchJson(TRANSACTIONS_URL, {
            body,
            fetchImpl,
            cacheDir: options.cacheDir,
            mode: options.mode,
            select: trimTransactions,
          })) as TransactionsAnswer;
          for (const row of answer.results) {
            const date = isoDate(row.action_date);
            const amount = dollars(row.federal_action_obligation);
            // $0 rows are paperwork (no-cost extensions, notices), not money.
            if (date && amount) awards.push({ date, amount, label: row.modification_number ?? '' });
          }
          if (!answer.hasNext || page >= 20) break;
        }
      } catch (error) {
        console.warn(`USAspending: no obligation list for ${grantId} (POST ${TRANSACTIONS_URL})`, error);
        awards = undefined;
      }

      return {
        grantId,
        source: 'USAspending',
        status: null,
        awarded: dollars(award.total_obligation),
        paid: dollars(award.total_outlay),
        endDate: isoDate(award.period_of_performance?.end_date),
        url: `${SITE}/${awardId}`,
        ...(awards ? { awards } : {}),
      } satisfies Reading;
    },
  };
}
