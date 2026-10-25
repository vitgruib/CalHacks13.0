// Runs the agent worker. `npm start` keeps it running; `npm run demo` lets
// the agents work until they go quiet, prints the Inbox and what each agent
// did, and exits. GG_DB=local (default) plays the sim world (sim/seed.json)
// in this process; GG_DB=spacetime works on the module published on a
// SpacetimeDB server (GG_SPACETIME_URI, GG_SPACETIME_DB).

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { HoldRow, LogRow } from './db/contract.ts';
import { openDb } from './db/index.ts';
import { fileDay, fileTokens, memoryDay, memoryTokens } from './identity.ts';
import { SEATS, type Role } from './roles.ts';
import { runSim } from './sim.ts';
import { createCancellationListSource } from './sources/cancellations.ts';
import { createReporterSource } from './sources/reporter.ts';
import { createUsaspendingSource } from './sources/usaspending.ts';
import { startWorker } from './worker.ts';

// Keys live in the repo root's .env.local (git-ignored). Without it the
// agents still run, on their deterministic fallbacks.
const ENV_FILE = fileURLToPath(new URL('../../.env.local', import.meta.url));
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

function report(holds: HoldRow[], log: LogRow[]): void {
  const open = holds.filter((hold) => hold.open);
  console.log(`Inbox (${open.length} open):`);
  for (const hold of open) console.log(`  [${hold.kind} ${hold.refId}] ${hold.title} (${hold.raisedBy}): ${hold.why}`);
  console.log('\nWhat the agents did this run:');
  for (const row of log) console.log(`  ${row.actor}: ${row.action}${row.rule ? ` [${row.rule}]` : ''}: ${row.reason}`);
}

const kind = process.env.GG_DB ?? 'local';
const demo = process.argv.includes('--demo');

if (demo && kind === 'local') {
  const run = await runSim();
  report(run.tables.hold, run.newLog);
  run.stop();
} else {
  // A dropped connection never comes back on its own, so exit and let the
  // service manager start a fresh worker (systemd Restart=always on the VM);
  // the tokens on disk keep each agent's identity.
  const db = await openDb(kind, {
    onLost(error) {
      console.error(`worker: SpacetimeDB closed an agent's connection${error ? ` (${error.message})` : ''}; exiting so the worker restarts`);
      process.exit(1);
    },
  });
  // Agent roles bind to their identities once, so a real server's tokens are
  // kept on disk, one folder per server and database (agents/.state/, git-
  // ignored): local and maincloud both call theirs grantguard, and a token
  // only works on the server that issued it.
  const server = new URL(process.env.GG_SPACETIME_URI ?? 'ws://127.0.0.1:3000').host.replace(/[^a-z0-9.-]/gi, '_');
  const database = `${server}-${process.env.GG_SPACETIME_DB ?? 'grantguard'}`;
  const tokens = kind === 'local' ? memoryTokens() : fileTokens(database);
  const lastDay = kind === 'local' ? memoryDay() : fileDay(database);
  // The sim world's grant IDs are real NIH grants, but its cancel/court/payment
  // timeline is simulated, so the government sources (which would report the
  // real status) stay off unless asked for (GG_LIVE_SOURCES=1).
  const sources =
    process.env.GG_LIVE_SOURCES === '1'
      ? [createReporterSource(), createUsaspendingSource(), createCancellationListSource()]
      : [];
  const peek = await db.connect();
  const before = new Set(peek.rows('log').map((row) => row.id));
  peek.disconnect();
  const worker = await startWorker(db, { tokens, lastDay, sources });
  for (const [role, conn] of Object.entries(worker.sessions)) {
    console.log(`${role} agent (${SEATS[role as Role]}): ${conn.identity.slice(0, 16)}…`);
  }

  if (demo) {
    await worker.idle();
    const conn = worker.sessions.bookkeeping;
    console.log();
    report(conn.rows('hold'), conn.rows('log').filter((row) => !before.has(row.id)));
    worker.stop();
    db.close();
    process.exit(0);
  }

  console.log('\nWorker running. Ctrl-C to stop.');
  process.on('SIGINT', () => {
    worker.stop();
    db.close();
    process.exit(0);
  });
  setInterval(() => {}, 1 << 30);
}
