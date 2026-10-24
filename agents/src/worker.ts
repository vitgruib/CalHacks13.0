// Starts the three agents, each on its own connection and identity, and
// registers each identity's role with the database.

import { startTracker, type Tracker } from './agents/bookkeeping.ts';
import { startStubAgent } from './agents/stub-agent.ts';
import type { Connection, Db } from './db/contract.ts';
import { loadToken, saveToken } from './identity.ts';
import { ROLES, type Role } from './roles.ts';
import type { SourceClient } from './sources/types.ts';

export interface Worker {
  sessions: Record<Role, Connection>;
  // Other agents call tracker.refresh(grantId) right before money moves.
  tracker: Tracker;
  stop(): void;
}

export async function startWorker(
  db: Db,
  { sources = [] }: { sources?: SourceClient[] } = {},
): Promise<Worker> {
  const sessions = {} as Record<Role, Connection>;
  for (const role of ROLES) {
    const conn = await db.connect({ token: loadToken(role) });
    saveToken(role, conn.token);
    await conn.call('register_agent', { role });
    sessions[role] = conn;
  }

  const tracker = startTracker(sessions.bookkeeping, sources);
  const stops = [startStubAgent(sessions.purchasing), () => tracker.stop()];

  return {
    sessions,
    tracker,
    stop() {
      for (const stop of stops) stop();
      for (const conn of Object.values(sessions)) conn.disconnect();
    },
  };
}
