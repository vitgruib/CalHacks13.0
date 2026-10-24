// Starts the three agents, each on its own connection and identity, and
// registers each identity's role with the database.

import { startStubAgent } from './agents/stub-agent.ts';
import type { Connection, Db } from './db/contract.ts';
import { loadToken, saveToken } from './identity.ts';
import { ROLES, type Role } from './roles.ts';

export interface Worker {
  sessions: Record<Role, Connection>;
  stop(): void;
}

export async function startWorker(db: Db): Promise<Worker> {
  const sessions = {} as Record<Role, Connection>;
  for (const role of ROLES) {
    const conn = await db.connect({ token: loadToken(role) });
    saveToken(role, conn.token);
    await conn.call('register_agent', { role });
    sessions[role] = conn;
  }

  const stops = [startStubAgent(sessions.purchasing)];

  return {
    sessions,
    stop() {
      for (const stop of stops) stop();
      for (const conn of Object.values(sessions)) conn.disconnect();
    },
  };
}
