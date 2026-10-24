// Runs the agent worker. `npm start` keeps it running; `npm run demo` plays
// one scientist request through the stub database and prints what happened.

import { openDb } from './db/index.ts';
import { SEATS } from './roles.ts';
import { startWorker } from './worker.ts';

const db = await openDb();
const worker = await startWorker(db);

for (const [role, conn] of Object.entries(worker.sessions)) {
  console.log(`${role} agent (${SEATS[role as keyof typeof SEATS]}): ${conn.identity.slice(0, 16)}…`);
}

if (process.argv.includes('--demo')) {
  const scientist = await db.connect();
  await scientist.call('submit_request', {
    item: 'Pipette tips, 10 boxes',
    price: 240,
    grantId: 'DEMO-GRANT-A',
    purpose: 'Sample prep for aim 2',
  });

  console.log('\nInbox:');
  for (const hold of scientist.rows('holds')) {
    console.log(`  [${hold.kind} ${hold.refId}] ${hold.title}, raised by ${hold.raisedByRole}: ${hold.why}`);
  }
  console.log('\nLog:');
  for (const row of scientist.rows('log')) {
    console.log(`  ${row.action} ${row.subject} by ${row.actor.slice(0, 16)}…: ${row.reason}`);
  }

  scientist.disconnect();
  worker.stop();
} else {
  console.log('\nWorker running. Ctrl-C to stop.');
  process.on('SIGINT', () => {
    worker.stop();
    process.exit(0);
  });
  setInterval(() => {}, 1 << 30);
}
