// The bookkeeping agent's fund tracker loop (docs/MASTER-PLAN.md §3.1). It
// reads every source for the lab's own grants once a day, on "check now", and
// right before money moves; posts only what changed; and raises a flag when
// sources disagree, when money was spent while a grant was canceled, or when
// a court restored a grant but no money has come. Track A's module decides
// what a flag or event freezes, and puts a disagreement in the Inbox.

import type { CheckRequestRow, Connection, OrderRow, StatusEventRow } from '../db/contract.ts';
import type { Reading, SourceClient } from '../sources/types.ts';
import { changedFields, disagreement, eventsFor, merge, readingOf } from '../tracker/compare.ts';

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface Tracker {
  // Reads every source for one grant, or for all grants when no id is given.
  refresh(grantId?: string): Promise<void>;
  // Resolves once every queued refresh and check has finished.
  idle(): Promise<void>;
  stop(): void;
}

function latestReadings(conn: Connection, grantId: string): Reading[] {
  const latest = new Map<string, Reading>();
  const rows = conn.rows('sourceReading').filter((reading) => reading.grantId === grantId);
  rows.sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const row of rows) latest.set(row.source, readingOf(row));
  return [...latest.values()];
}

const byDay = (a: StatusEventRow, b: StatusEventRow) => a.day.localeCompare(b.day) || (a.id < b.id ? -1 : 1);
const dollars = (amount: number) => `$${amount.toLocaleString('en-US')}`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

// The cancellation still in force on a day: canceled until a payment arrives
// after it (a court order alone isn't cash). Same reading as the module's
// freeze rule, which also keeps the first date when a second source reports
// the same cancellation.
export function cancellationOn(day: string, events: StatusEventRow[]): StatusEventRow | undefined {
  let cancellation: StatusEventRow | undefined;
  for (const event of [...events].sort(byDay)) {
    if (event.day > day) break;
    if (event.kind === 'canceled') cancellation ??= event;
    if (event.kind === 'payment_received' || event.kind === 'unfrozen') cancellation = undefined;
  }
  return cancellation;
}

// A cancellation the same day as the order only counts if it came first.
// Orders keep only the day, so placedAt is when the purchase was logged; with
// no time known, a same-day cancellation isn't counted (no false alarm).
export function canceledWhenPlaced(order: OrderRow, events: StatusEventRow[], placedAt?: number): StatusEventRow | undefined {
  const cancellation = cancellationOn(order.placed, events);
  if (!cancellation || cancellation.day !== order.placed) return cancellation;
  return placedAt !== undefined && cancellation.at < placedAt ? cancellation : undefined;
}

// When a purchase placed its orders: the "Bought" or "Rerouted" log row the
// module writes for the request that day.
const loggedAt = (conn: Connection, order: OrderRow) =>
  conn
    .rows('log')
    .filter((row) => row.refId === order.requestId && row.day === order.placed && /^(Bought|Rerouted)\b/.test(row.action))
    .reduce<number | undefined>((first, row) => (first === undefined || row.at < first ? row.at : first), undefined);

export function startTracker(
  conn: Connection,
  sources: SourceClient[],
  { intervalMs = DAY_MS }: { intervalMs?: number } = {},
): Tracker {
  // One refresh at a time, so a daily run and a "check now" can't post the
  // same change twice.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>): Promise<void> => {
    const run = queue.then(work);
    queue = run.catch(() => {});
    return run;
  };

  const openFlag = (grantId: string, kind: string, mentioning?: string) =>
    conn
      .rows('flag')
      .some((flag) => flag.grantId === grantId && flag.kind === kind && flag.open && (!mentioning || flag.summary.includes(mentioning)));

  async function record(reading: Reading) {
    const previous = latestReadings(conn, reading.grantId).find((r) => r.source === reading.source);
    const merged = merge(previous, reading);
    if (changedFields(previous, merged).length === 0) return;

    await conn.call('post_source_reading', {
      grantId: merged.grantId,
      source: merged.source,
      status: merged.status ?? undefined,
      awarded: merged.awarded ?? undefined,
      paid: merged.paid ?? undefined,
      endDate: merged.endDate ?? undefined,
      url: merged.url,
    });
    for (const event of eventsFor(previous, merged)) {
      await conn.call('post_status_event', { grantId: reading.grantId, source: reading.source, ...event });
    }
  }

  // A disagreement the grant manager decided stays decided until a source
  // reports something new: a different disagreement, or a reading on a later
  // day than the last flag. Raising it again would freeze the grant over a
  // person's decision, and it is read from the rows so a restart keeps it.
  function alreadyRaised(grantId: string, summary: string) {
    const flags = conn.rows('flag').filter((flag) => flag.grantId === grantId && flag.kind === 'sources_disagree');
    if (flags.some((flag) => flag.open)) return true;
    const last = flags.at(-1);
    if (!last || last.summary !== summary) return false;
    return !conn.rows('sourceReading').some((reading) => reading.grantId === grantId && reading.day > last.day);
  }

  async function checkAgreement(grantId: string) {
    const found = disagreement(latestReadings(conn, grantId));
    if (!found) return;
    const summary = `Sources disagree: ${found}.`;
    if (alreadyRaised(grantId, summary)) return;
    await conn.call('raise_flag', { grantId, kind: 'sources_disagree', summary });
  }

  async function checkSpendWhileCanceled(grantId: string) {
    const events = conn.rows('statusEvent').filter((event) => event.grantId === grantId);
    const orders = conn.rows('order').filter((order) => order.grantId === grantId && order.state !== 'canceled');
    for (const order of orders) {
      const cancellation = canceledWhenPlaced(order, events, loggedAt(conn, order));
      if (!cancellation || openFlag(grantId, 'spend_while_canceled', order.id)) continue;
      const late = daysBetween(cancellation.day, order.placed);
      await conn.call('raise_flag', {
        grantId,
        kind: 'spend_while_canceled',
        summary:
          `${order.requestId} / ${order.id}: ${dollars(order.amount)} to ${order.vendor} on ${order.placed}, ` +
          `${late} day${late === 1 ? '' : 's'} after ${grantId} was canceled (${cancellation.day}), with no payment since.`,
      });
    }
  }

  async function checkCourtOrderWithoutPayment(grantId: string) {
    const grant = conn.rows('grant').find((row) => row.id === grantId);
    if (!grant || grant.status !== 'restored_by_court' || !grant.frozen) return;
    if (openFlag(grantId, 'court_order_no_payment')) return;
    const events = conn.rows('statusEvent').filter((event) => event.grantId === grantId).sort(byDay);
    const court = events.findLast((event) => event.kind === 'court_order');
    const cancellation = cancellationOn(conn.today(), events);
    await conn.call('raise_flag', {
      grantId,
      kind: 'court_order_no_payment',
      summary:
        `A court restored ${grantId}${court ? ` on ${court.day}` : ''}, but no payment has arrived since ` +
        `${cancellation ? `the ${cancellation.day} cancellation` : 'it was canceled'}. Spending stays frozen until money lands.`,
    });
  }

  async function audit(grantId: string) {
    await checkAgreement(grantId);
    await checkSpendWhileCanceled(grantId);
    await checkCourtOrderWithoutPayment(grantId);
  }

  async function refreshGrant(grantId: string) {
    const results = await Promise.allSettled(sources.map((source) => source.read(grantId)));
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        // One broken source must not stop the others from being read.
        console.error(`tracker: ${sources[index].source} failed for ${grantId}`, result.reason);
        continue;
      }
      if (result.value) await record(result.value);
    }
    await audit(grantId);
  }

  async function refreshNow(grantId?: string) {
    const grants = conn.rows('grant').filter((grant) => grantId === undefined || grant.id === grantId);
    if (grantId !== undefined && grants.length === 0) {
      throw new Error(`tracker: unknown grant ${grantId}`);
    }
    for (const grant of grants) await refreshGrant(grant.id);
  }

  const handleCheck = (check: CheckRequestRow) => {
    if (check.done) return;
    enqueue(async () => {
      const notes = await Promise.all(sources.map((source) => source.beforeCheck?.(check.reason).catch((error: unknown) => `${source.source}: ${error}`)));
      const said = notes.filter((note) => note !== undefined);
      if (said.length) console.log(`tracker: check request ${check.id} (${check.reason}): ${said.join('; ')}`);
      await refreshNow(check.grantId);
      await conn.call('complete_check', { id: check.id });
    }).catch((error: unknown) => {
      console.error(`tracker: check request ${check.id} failed`, error);
    });
  };

  // New events (a court order, a payment) and new orders can each make one
  // of the audits true, without any source changing.
  const reaudit = (grantId: string) =>
    enqueue(() => audit(grantId)).catch((error: unknown) => {
      console.error(`tracker: audit of ${grantId} failed`, error);
    });

  for (const check of conn.rows('checkRequest')) handleCheck(check);
  const stops = [
    conn.onInsert('checkRequest', handleCheck),
    conn.onInsert('statusEvent', (event) => void reaudit(event.grantId)),
    conn.onInsert('order', (order) => void reaudit(order.grantId)),
    conn.onUpdate('grant', (before, after) => {
      if (before.status !== after.status || before.frozen !== after.frozen) void reaudit(after.id);
    }),
  ];

  const daily = () =>
    enqueue(() => refreshNow()).catch((error: unknown) => {
      console.error('tracker: scheduled refresh failed', error);
    });
  void daily();
  const timer = setInterval(daily, intervalMs);
  timer.unref();

  return {
    refresh: (grantId) => enqueue(() => refreshNow(grantId)),
    idle: () => queue,
    stop() {
      clearInterval(timer);
      for (const stop of stops) stop();
    },
  };
}
