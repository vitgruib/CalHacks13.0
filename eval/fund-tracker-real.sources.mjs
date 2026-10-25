// T114: the saved public records the real-grants fund tracker eval reads, and
// the readers that show them as they stood on a past real day.
//
// - Grant Witness (NIH dl-table.csv): the rows for the eval's grants, saved
//   in docs/research/sources/docs/ and turned into the cancellation list's
//   rows (fund-tracker-real.list.json) by the scraper's own parser. The real
//   cancellation-list reader reads that file, and its demo time (viewAsOf)
//   shows each row as it stood on the check day.
// - USAspending: the award, its obligations (the real reader) and its
//   monthly outlays (/api/v2/awards/funding/). Outlays are reported per
//   funding line as fiscal-year-to-date totals each month, so "paid by day D"
//   is the sum of each finished fiscal year's last month plus the current
//   year's latest month that ended on or before D. On 2026-10-25 this
//   matched the award's total_outlay to the cent for most grants; for 12 of
//   37 it differs (by up to $120k), likely later adjustments the monthly
//   rows don't carry. The build script prints each difference.
// - NIH RePORTER (the real reader): only today's records and termination
//   flag are public, so it is read only on the final check day.
//
// Everything is read from fund-tracker-real.cache/ (offline, deterministic).
// `node eval/fund-tracker-real.build.mjs` refreshes the saved copies.
import { fileURLToPath } from 'node:url';
import { register as registerTsx } from 'tsx/esm/api';

const here = p => fileURLToPath(new URL(p, import.meta.url));

export const CACHE_DIR = here('./fund-tracker-real.cache');
export const LIST_FILE = here('./fund-tracker-real.list.json');
export const GW_FILE = 'grantwitness-nih-fund-tracker-cases-2026-10-25.csv';
export const SOURCES_DIR = here('../docs/research/sources/docs');
/** The day the saved readings were taken: the final check of every case. */
export const SAVED_ON = '2026-10-25';

const FUNDING_URL = 'https://api.usaspending.gov/api/v2/awards/funding/';

let ts;
/** The agents' TypeScript, loaded once through tsx. */
export function loadTs() {
  ts ??= (async () => {
    registerTsx();
    const realConsole = globalThis.console;
    try {
      const [http, cancellations, reporter, usaspending] = await Promise.all([
        import('../agents/src/sources/http.ts'),
        import('../agents/src/sources/cancellations.ts'),
        import('../agents/src/sources/reporter.ts'),
        import('../agents/src/sources/usaspending.ts'),
      ]);
      return { http, cancellations, reporter, usaspending };
    } finally {
      globalThis.console = realConsole;
    }
  })();
  return ts;
}

// Only the fields used here are saved (the full rows name accounts and offices).
function trimFunding(raw) {
  if (!Array.isArray(raw?.results)) throw new Error('USAspending funding answered without a results list');
  return {
    results: raw.results.map(r => ({
      reporting_fiscal_year: r.reporting_fiscal_year,
      reporting_fiscal_month: r.reporting_fiscal_month,
      transaction_obligated_amount: r.transaction_obligated_amount ?? null,
      gross_outlay_amount: r.gross_outlay_amount ?? null,
    })),
    hasNext: raw.page_metadata?.hasNext === true,
  };
}

/** Every monthly funding row USAspending has for an NIH award. */
export async function fundingRows(grantId, { mode = 'offline' } = {}) {
  const { http, usaspending } = await loadTs();
  const rows = [];
  for (let page = 1; page <= 20; page++) {
    const body = { award_id: usaspending.awardIdFor(grantId), limit: 100, page, sort: 'reporting_fiscal_date', order: 'asc' };
    const answer = await http.fetchJson(FUNDING_URL, { body, cacheDir: CACHE_DIR, mode, select: trimFunding });
    rows.push(...answer.results);
    if (!answer.hasNext) break;
  }
  return rows;
}

/** The last day of fiscal month m (1 = October) of fiscal year y. */
export function fiscalMonthEnd(y, m) {
  const year = m <= 3 ? y - 1 : y;
  const month = ((m + 8) % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

/** Paid out to date at the end of each reported month: [{ through, paid }]. */
export function paidSeries(rows) {
  const byYear = new Map();
  for (const r of rows) {
    if (typeof r.gross_outlay_amount !== 'number') continue;
    const months = byYear.get(r.reporting_fiscal_year) ?? new Map();
    months.set(r.reporting_fiscal_month, (months.get(r.reporting_fiscal_month) ?? 0) + r.gross_outlay_amount);
    byYear.set(r.reporting_fiscal_year, months);
  }
  const series = [];
  let before = 0;
  for (const year of [...byYear.keys()].sort((a, b) => a - b)) {
    const months = byYear.get(year);
    const order = [...months.keys()].sort((a, b) => a - b);
    for (const m of order) series.push({ through: fiscalMonthEnd(year, m), paid: Math.round((before + months.get(m)) * 100) / 100 });
    before += months.get(order.at(-1));
  }
  return series;
}

/** Paid out by `day` (0 before the first reported month). */
export function paidBy(series, day) {
  return series.filter(p => p.through <= day).at(-1)?.paid ?? 0;
}

/**
 * The three sources for one grant, each read as it stood on the check day
 * the tracker passes in (viewAsOf). `finalDay` is the only day RePORTER and
 * USAspending's current fields (end date) are read.
 */
export async function sourcesFor(grantId, { finalDay = SAVED_ON } = {}) {
  const { cancellations, reporter, usaspending } = await loadTs();
  const series = paidSeries(await fundingRows(grantId));
  const list = cancellations.createCancellationListSource({ file: LIST_FILE, mode: 'offline' });
  const nih = reporter.createReporterSource({ mode: 'offline', cacheDir: CACHE_DIR, today: () => finalDay, minIntervalMs: 0 });
  const spending = usaspending.createUsaspendingSource({ mode: 'offline', cacheDir: CACHE_DIR });
  let day = null;
  return [
    list,
    {
      source: 'NIH RePORTER',
      viewAsOf: d => { day = d; },
      read: id => ((day ?? finalDay) >= finalDay ? nih.read(id) : Promise.resolve(null)),
    },
    {
      source: 'USAspending',
      viewAsOf: d => { day = d; },
      async read(id) {
        const now = await spending.read(id);
        if (!now) return null;
        const on = day ?? finalDay;
        const awards = now.awards?.filter(a => a.date <= on);
        const final = on >= finalDay;
        return {
          ...now,
          paid: paidBy(series, on),
          awarded: awards ? awards.reduce((s, a) => s + a.amount, 0) : final ? now.awarded : null,
          endDate: final ? now.endDate : null,
          ...(awards ? { awards } : {}),
        };
      },
    },
  ];
}
