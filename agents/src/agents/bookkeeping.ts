// The bookkeeping agent's fund tracker loop (docs/MASTER-PLAN.md §3.1). It
// reads every source for the lab's own grants once a day, on "check now", and
// right before money moves; posts only what changed; and raises a flag when
// sources disagree. Track A's rules decide what a flag or event freezes.

import type { CheckRequestRow, Connection, SourceReadingRow } from '../db/contract.ts';
import type { Reading, SourceClient } from '../sources/types.ts';
import { changedFields, disagreement, eventsFor, merge } from '../tracker/compare.ts';

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface Tracker {
  // Reads every source for one grant, or for all grants when no id is given.
  refresh(grantId?: string): Promise<void>;
  // Resolves once every queued refresh and check has finished.
  idle(): Promise<void>;
  stop(): void;
}

function latestReadings(conn: Connection, grantId: string): SourceReadingRow[] {
  const latest = new Map<string, SourceReadingRow>();
  for (const reading of conn.rows('source_readings')) {
    if (reading.grantId === grantId) latest.set(reading.source, reading);
  }
  return [...latest.values()];
}

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

  async function record(reading: Reading) {
    const previous = latestReadings(conn, reading.grantId).find((r) => r.source === reading.source);
    const merged = merge(previous, reading);
    if (changedFields(previous, merged).length === 0) return;

    await conn.call('post_source_reading', { ...merged, fetchedAt: Date.now() });
    for (const event of eventsFor(previous, merged)) {
      await conn.call('post_status_event', { grantId: reading.grantId, source: reading.source, ...event });
    }
  }

  async function checkAgreement(grantId: string) {
    const summary = disagreement(latestReadings(conn, grantId));
    if (!summary) return;
    const alreadyOpen = conn
      .rows('flags')
      .some((flag) => flag.grantId === grantId && flag.kind === 'sources_disagree' && flag.open);
    if (alreadyOpen) return;
    await conn.call('raise_flag', { grantId, kind: 'sources_disagree', summary: `Sources disagree: ${summary}` });
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
    await checkAgreement(grantId);
  }

  async function refreshNow(grantId?: string) {
    const grants = conn.rows('grants').filter((grant) => grantId === undefined || grant.id === grantId);
    if (grantId !== undefined && grants.length === 0) {
      throw new Error(`tracker: unknown grant ${grantId}`);
    }
    for (const grant of grants) await refreshGrant(grant.id);
  }

  const handleCheck = (check: CheckRequestRow) => {
    if (check.completedAt !== null) return;
    enqueue(async () => {
      await refreshNow(check.grantId ?? undefined);
      await conn.call('complete_check', { id: check.id });
    }).catch((error: unknown) => {
      console.error(`tracker: check request ${check.id} failed`, error);
    });
  };

  for (const check of conn.rows('check_requests')) handleCheck(check);
  const stopChecks = conn.onInsert('check_requests', handleCheck);

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
      stopChecks();
    },
  };
}
