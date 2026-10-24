// The fund tracker's comparison rules (docs/MASTER-PLAN.md §3.1): what
// counts as a change, which changes become status events, and when sources
// disagree. Pure functions, so they're easy to test. The freeze itself is
// Track A's rule, not decided here.

import type { GrantStatus, SourceReadingRow, StatusEventKind } from '../db/contract.ts';
import type { Reading } from '../sources/types.ts';

// A stored reading in the same shape as a fresh one (unset columns → null).
export function readingOf(row: SourceReadingRow): Reading {
  return {
    grantId: row.grantId,
    source: row.source,
    status: row.status ?? null,
    awarded: row.awarded ?? null,
    paid: row.paid ?? null,
    endDate: row.endDate ?? null,
    url: row.url,
  };
}

const FIELDS = ['status', 'awarded', 'paid', 'endDate'] as const;
type Field = (typeof FIELDS)[number];

// A source that stops mentioning a field hasn't changed it, so keep what it
// said last. Otherwise a flaky source would look like constant changes.
export function merge(previous: Reading | undefined, next: Reading): Reading {
  const merged = { ...next };
  for (const field of FIELDS) {
    if (merged[field] === null && previous) {
      (merged as Record<Field, unknown>)[field] = previous[field];
    }
  }
  return merged;
}

export function changedFields(previous: Reading | undefined, merged: Reading): Field[] {
  return FIELDS.filter((field) => merged[field] !== null && previous?.[field] !== merged[field]);
}

export interface EventDraft {
  kind: StatusEventKind;
  summary: string;
  amount?: number;
}

const dollars = (amount: number) => `$${amount.toLocaleString('en-US')}`;

export function eventsFor(previous: Reading | undefined, merged: Reading): EventDraft[] {
  const events: EventDraft[] = [];
  const { source, grantId } = merged;

  if (merged.status !== null && merged.status !== previous?.status) {
    // A first reading of "active" is the baseline, not news.
    if (previous?.status != null || merged.status !== 'active') {
      const was = previous?.status ? ` (was ${previous.status})` : '';
      if (merged.status === 'canceled') {
        events.push({ kind: 'canceled', summary: `${source} lists ${grantId} as canceled${was}` });
      } else if (merged.status === 'restored_by_court') {
        events.push({ kind: 'court_order', summary: `${source} shows ${grantId} restored by a court${was}` });
      } else {
        events.push({ kind: 'reading_changed', summary: `${source}: ${grantId} is ${merged.status}${was}` });
      }
    }
  }

  if (previous?.paid != null && merged.paid !== null && merged.paid > previous.paid) {
    const received = merged.paid - previous.paid;
    events.push({
      kind: 'payment_received',
      summary: `${source} shows ${dollars(received)} more paid out on ${grantId} (total ${dollars(merged.paid)})`,
      amount: received,
    });
  }

  if (previous?.awarded != null && merged.awarded !== null && merged.awarded !== previous.awarded) {
    events.push({
      kind: 'reading_changed',
      summary: `${source}: amount awarded on ${grantId} went from ${dollars(previous.awarded)} to ${dollars(merged.awarded)}`,
    });
  }

  if (previous?.endDate != null && merged.endDate !== null && merged.endDate !== previous.endDate) {
    // An end date pulled earlier is often how a termination first shows up.
    const earlier = merged.endDate < previous.endDate ? ' (earlier)' : '';
    events.push({
      kind: 'reading_changed',
      summary: `${source}: end date of ${grantId} moved from ${previous.endDate} to ${merged.endDate}${earlier}`,
    });
  }

  return events;
}

// "Active" and "restored by a court" both mean the grant is funded, so they
// don't count as a disagreement. Canceled vs funded, or ended vs funded, do.
const MEANING: Record<GrantStatus, string> = {
  active: 'funded',
  restored_by_court: 'funded',
  canceled: 'canceled',
  ended: 'ended',
};

export function disagreement(latest: Reading[]): string | null {
  const claims = latest.filter((reading) => reading.status !== null);
  const meanings = new Set(claims.map((reading) => MEANING[reading.status!]));
  if (meanings.size < 2) return null;
  return claims.map((reading) => `${reading.source} says ${reading.status}`).join('; ');
}
