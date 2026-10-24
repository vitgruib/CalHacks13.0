import type { Db } from './contract.ts';
import { createLocalDb } from './local.ts';
import { createSpacetimeDb, type SpacetimeDbOptions } from './spacetime.ts';

// GG_DB=local (default): Track A's module in this process, on sim/seed.json.
// GG_DB=spacetime: the module published on a SpacetimeDB server (T22).
// onLost only applies to a server; the local module never drops a connection.
export async function openDb(kind = process.env.GG_DB ?? 'local', { onLost }: Pick<SpacetimeDbOptions, 'onLost'> = {}): Promise<Db> {
  if (kind === 'local') return createLocalDb({ world: 'sim' });
  if (kind === 'spacetime') return createSpacetimeDb({ onLost });
  throw new Error(`GG_DB=${kind} is not supported; use local or spacetime`);
}
