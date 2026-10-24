// The sim world end to end, in this process: sim/seed.json loaded into Track
// A's real module, then all three agents run until nothing is left to do. The
// scorecard (T19, eval/) compares the result with sim/answer-key.json.

import { TABLES, type Db, type TableName, type Tables } from './db/contract.ts';
import { createLocalDb } from './db/local.ts';
import { createPaperLookup } from './sources/papers.ts';
import { startWorker, type Worker, type WorkerOptions } from './worker.ts';

export type Snapshot = { [T in TableName]: Tables[T][] };

export interface SimRun {
  db: Db;
  worker: Worker;
  // Every table's rows once the agents went quiet.
  tables: Snapshot;
  // Log rows written during this run (the seed brings its own history).
  newLog: Snapshot['log'];
  stop(): void;
}

export interface SimOptions extends WorkerOptions {
  // Another world in the same shape as sim/seed.json.
  seedJson?: string;
}

export async function runSim({ seedJson, ...options }: SimOptions = {}): Promise<SimRun> {
  const db = await createLocalDb({ world: seedJson ? { seedJson } : 'sim' });
  const seeded = new Set((await db.connect()).rows('log').map((row) => row.id));
  // Saved copies only: a sim run never reaches the network for papers.
  const worker = await startWorker(db, { papers: createPaperLookup({ mode: 'offline' }), ...options });
  await worker.idle();
  const conn = worker.sessions.bookkeeping;
  const tables = Object.fromEntries(TABLES.map((table) => [table, conn.rows(table)])) as Snapshot;
  return {
    db,
    worker,
    tables,
    newLog: tables.log.filter((row) => !seeded.has(row.id)),
    stop() {
      worker.stop();
      db.close();
    },
  };
}
