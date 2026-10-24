import type { Db } from './contract.ts';
import { createStubDb } from './stub.ts';

// GG_DB=stub (default) runs on the in-memory stand-in. GG_DB=spacetime will
// connect to Track A's module once its contract (T3) is published.
export async function openDb(kind = process.env.GG_DB ?? 'stub'): Promise<Db> {
  if (kind === 'stub') return createStubDb();
  throw new Error(
    `GG_DB=${kind} is not available yet: the SpacetimeDB adapter lands with Track A's contract (T3)`,
  );
}
