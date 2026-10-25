import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseGrantWitnessCsv, type ListedGrant } from '../src/grantwitness.ts';

// The saved copy: 23 real rows from https://data.grantwitness.org/nih/dl-table.csv
// (fixtures/grantwitness-nih-sample.meta.json). Expected values are read off
// those rows by hand.
const SAVED = fileURLToPath(new URL('../fixtures/grantwitness-nih-sample.csv', import.meta.url));
const { grants, rowsRead, dropped } = parseGrantWitnessCsv(readFileSync(SAVED, 'utf8'), { fetchedAt: '2026-10-24T08:13:52Z', savedCopy: true });
const grant = (id: string) => grants.find((g) => g.grantId === id);

test('every_saved_row_is_read_and_one_row_per_grant_comes_out', () => {
  assert.equal(rowsRead, 23);
  assert.equal(dropped, 0);
  assert.equal(grants.length, 22); // U01CA267827 is listed twice
  const byStatus = (s: ListedGrant['status']) => grants.filter((g) => g.status === s).length;
  assert.deepEqual([byStatus('canceled'), byStatus('restored_by_court'), byStatus('active')], [9, 8, 5]);
});

test('list_statuses_map_to_ours', () => {
  assert.equal(grant('R01AG072641')?.status, 'canceled'); // Terminated
  assert.equal(grant('F32AG084167')?.status, 'canceled'); // Frozen
  assert.equal(grant('R01MH129285')?.status, 'restored_by_court'); // Reinstated (confirmed)
  assert.equal(grant('K08DE034493')?.status, 'restored_by_court'); // Reinstated (unconfirmed)
  assert.deepEqual(
    pick(grant('K01HL173859')),
    { status: 'active', listStatus: 'Unfrozen (confirmed)', terminatedOn: '2025-04-08', restoredOn: '2026-09-17', listedOn: '2026-09-17', fullAwardNumber: '5K01HL173859-03', supplement: null },
  );
});

test('the_whole_award_speaks_for_a_grant_also_listed_as_a_supplement', () => {
  // 5U01CA267827-05 Reinstated (confirmed) vs 3U01CA267827-04S1 Terminated.
  assert.equal(grant('U01CA267827')?.status, 'restored_by_court');
  assert.equal(grant('U01CA267827')?.supplement, null);
  // Only the supplement 3K99DK136503-02S1 is listed: kept, and marked.
  assert.deepEqual(pick(grant('K99DK136503')), {
    status: 'canceled', listStatus: 'Terminated', terminatedOn: '2026-07-11', restoredOn: null, listedOn: '2026-07-11', fullAwardNumber: '3K99DK136503-02S1', supplement: 'S1',
  });
});

test('a_row_without_a_full_award_number_uses_its_fain', () => {
  assert.equal(grant('R01AI135631')?.status, 'restored_by_court');
  assert.equal(grant('R01AI135631')?.fullAwardNumber, null);
});

test('the_fund_tracker_reads_our_rows_with_the_statuses_we_wrote', async () => {
  // T10's own reader (agents/src/sources/cancellations.ts); a variable path
  // keeps agents/ out of this package's typecheck.
  const reader = '../../agents/src/sources/cancellations.ts';
  const { parseList } = (await import(reader)) as { parseList(raw: unknown): Array<{ grantId: string; status: string }> };
  const read = parseList(JSON.parse(JSON.stringify(grants)));
  assert.deepEqual(read.map((r) => [r.grantId, r.status]), grants.map((g) => [g.grantId, g.status]));
});

// The time switch: the real list, as it stood on a given day. K01HL173859's
// row: Frozen 2025-04-08, Unfrozen (confirmed) 2026-09-17.
const asOf = (day: string) =>
  parseGrantWitnessCsv(readFileSync(SAVED, 'utf8'), { fetchedAt: '2026-10-24T08:13:52Z', savedCopy: true, asOf: day }).grants;

test('as_of_a_day_before_the_disruption_the_grant_is_not_listed', () => {
  assert.equal(asOf('2025-04-07').find((g) => g.grantId === 'K01HL173859'), undefined);
});

test('as_of_a_day_during_the_disruption_the_grant_is_canceled', () => {
  assert.deepEqual(pick(asOf('2026-01-01').find((g) => g.grantId === 'K01HL173859')), {
    status: 'canceled', listStatus: 'Frozen', terminatedOn: '2025-04-08', restoredOn: null, listedOn: '2025-04-08', fullAwardNumber: '5K01HL173859-03', supplement: null,
  });
});

test('as_of_the_restoration_day_the_grant_has_its_current_status', () => {
  assert.equal(asOf('2026-09-17').find((g) => g.grantId === 'K01HL173859')?.status, 'active');
});

function pick(g: ListedGrant | undefined) {
  if (!g) return undefined;
  const { status, listStatus, terminatedOn, restoredOn, listedOn, fullAwardNumber, supplement } = g;
  return { status, listStatus, terminatedOn, restoredOn, listedOn, fullAwardNumber, supplement };
}
