// Shared test setup: Track A's real module in this process (db/local.ts),
// the agents started on it, and people who can act in it.

import type { Connection, Db, PersonRole } from '../src/db/contract.ts';
import { createLocalDb } from '../src/db/local.ts';
import { createPaperLookup, type PaperLookup } from '../src/sources/papers.ts';
import type { SourceClient } from '../src/sources/types.ts';
import { startWorker, type Worker } from '../src/worker.ts';

export interface TestWorld {
  db: Db;
  worker: Worker;
  // A newly registered person (grant_manager, scientist or funder).
  person(role: PersonRole): Promise<Connection>;
  stop(): void;
}

export async function startWorld({
  seedJson,
  fixtures = false,
  sources = [],
  papers = createPaperLookup({ mode: 'offline', throttle: false }),
}: { seedJson?: string; fixtures?: boolean; sources?: SourceClient[]; papers?: PaperLookup } = {}): Promise<TestWorld> {
  // fixtures = the module's built-in world, as a freshly published database starts.
  const db = await createLocalDb({ world: fixtures ? 'fixtures' : seedJson ? { seedJson } : 'sim' });
  const worker = await startWorker(db, { sources, papers });
  await worker.idle();
  return {
    db,
    worker,
    async person(role) {
      const conn = await db.connect();
      await conn.call('register_person', { role, name: role });
      return conn;
    },
    stop() {
      worker.stop();
      db.close();
    },
  };
}

/**
 * The grant office approves every purchase waiting in the Inbox whose rules
 * all pass (T108: nothing is bought without it). Flagged ones stay waiting.
 */
export async function approvePassingPurchases(manager: Connection, worker: Worker): Promise<void> {
  const passing = manager.rows('hold').filter((hold) => hold.open && hold.kind === 'purchase' && hold.title.startsWith('Approve '));
  for (const hold of passing) await manager.call('decide_hold', { holdId: hold.id, choice: 'approve', reason: 'Every rule passes.' });
  await worker.idle();
}

export const TEST_GRANT = 'R01TEST000001';

// A world with one clean, active grant and nothing else: for tests that want
// to see exactly what one change does.
export function oneGrantSeed(extra: Record<string, unknown[]> = {}): string {
  return JSON.stringify({
    today: '2026-06-15',
    grants: [
      {
        id: TEST_GRANT, title: 'Test grant', pi: 'Test PI', agency: 'NIGMS',
        awarded: 450_000, received: 100_000, spent: 50_000, promised: 0,
        start: '2025-01-01', end: '2028-06-30', status: 'active',
      },
    ],
    statusEvents: [], sourceReadings: [], flags: [], requests: [], orders: [], approvals: [],
    invoices: [], payroll: [], paymentRequests: [], papers: [], holds: [], log: [],
    ...extra,
  });
}
