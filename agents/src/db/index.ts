import type { Db } from './contract.ts';
import { createLocalDb } from './local.ts';

// GG_DB=local (default): Track A's module in this process, on sim/seed.json.
// GG_DB=spacetime: the module published on a SpacetimeDB server (T22).
export async function openDb(kind = process.env.GG_DB ?? 'local'): Promise<Db> {
  if (kind === 'local') return createLocalDb({ world: 'sim' });
  throw new Error(`GG_DB=${kind} is not supported; use local or spacetime`);
}
