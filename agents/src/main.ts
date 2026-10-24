// Runs the agent worker. `npm start` keeps it running; `npm run demo` plays
// the sim world (sim/seed.json) in this process and prints the Inbox and what
// each agent did.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { openDb } from './db/index.ts';
import { fileTokens, memoryTokens } from './identity.ts';
import { SEATS, type Role } from './roles.ts';
import { runSim } from './sim.ts';
import { createReporterSource } from './sources/reporter.ts';
import { createUsaspendingSource } from './sources/usaspending.ts';
import { startWorker } from './worker.ts';

// Keys live in the repo root's .env.local (git-ignored). Without it the
// agents still run, on their deterministic fallbacks.
const ENV_FILE = fileURLToPath(new URL('../../.env.local', import.meta.url));
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

if (process.argv.includes('--demo')) {
  const run = await runSim();
  const { hold: holds } = run.tables;
  console.log(`Inbox (${holds.filter((hold) => hold.open).length} open):`);
  for (const hold of holds.filter((row) => row.open)) {
    console.log(`  [${hold.kind} ${hold.refId}] ${hold.title} (${hold.raisedBy}): ${hold.why}`);
  }
  console.log('\nWhat the agents did this run:');
  for (const row of run.newLog) {
    console.log(`  ${row.actor}: ${row.action}${row.rule ? ` [${row.rule}]` : ''}: ${row.reason}`);
  }
  run.stop();
} else {
  const kind = process.env.GG_DB ?? 'local';
  const db = await openDb(kind);
  const tokens = kind === 'local' ? memoryTokens() : fileTokens(process.env.GG_SPACETIME_DB ?? 'grantguard');
  // The sim world's grant IDs are made up, so the government sources stay off
  // unless the world holds real ones (GG_LIVE_SOURCES=1).
  const sources = process.env.GG_LIVE_SOURCES === '1' ? [createReporterSource(), createUsaspendingSource()] : [];
  const worker = await startWorker(db, { tokens, sources });
  for (const [role, conn] of Object.entries(worker.sessions)) {
    console.log(`${role} agent (${SEATS[role as Role]}): ${conn.identity.slice(0, 16)}…`);
  }
  console.log('\nWorker running. Ctrl-C to stop.');
  process.on('SIGINT', () => {
    worker.stop();
    db.close();
    process.exit(0);
  });
  setInterval(() => {}, 1 << 30);
}
