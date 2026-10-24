// Row helpers both databases share (local.ts and spacetime.ts), so agents see
// the same rows in the same order from either one.

import { PRIMARY_KEYS, type TableName } from './contract.ts';

// A stable text form of a row, for "did anything change?" checks.
export const fingerprint = (row: unknown) =>
  JSON.stringify(row, (_key, value) => (typeof value === 'bigint' ? `${value}n` : value));

// Numeric ids numerically, string ids naturally (rq-9 before rq-10).
const natural = new Intl.Collator('en', { numeric: true }).compare;
function compareKeys(a: unknown, b: unknown): number {
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0;
  return natural(String(a), String(b));
}

// Rows in primary-key order, whatever order the datastore iterates in.
export function byPrimaryKey<R>(table: TableName, rows: R[]): R[] {
  const key = PRIMARY_KEYS[table];
  return rows.sort((a, b) => compareKeys((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
