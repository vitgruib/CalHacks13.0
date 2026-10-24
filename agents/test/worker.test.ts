import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { ActionError, createStubDb } from '../src/db/stub.ts';
import { ROLES } from '../src/roles.ts';
import { startWorker, type Worker } from '../src/worker.ts';

let stateDir: string;
let worker: Worker | undefined;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'gg-agents-'));
  process.env.GG_STATE_DIR = stateDir;
});

afterEach(() => {
  worker?.stop();
  worker = undefined;
  rmSync(stateDir, { recursive: true, force: true });
});

const pipetteTips = {
  item: 'Pipette tips',
  price: 240,
  grantId: 'DEMO-GRANT-A',
  purpose: 'Sample prep',
};

test('three_agents_connect_as_separate_registered_identities', async () => {
  const db = createStubDb();
  worker = await startWorker(db);

  const identities = ROLES.map((role) => worker!.sessions[role].identity);
  assert.equal(new Set(identities).size, 3);
  assert.deepEqual(
    db.rows('agents').map((a) => [a.role, a.identity]),
    ROLES.map((role) => [role, worker!.sessions[role].identity]),
  );
});

test('restarted_worker_keeps_the_same_identities', async () => {
  const db = createStubDb();
  const first = await startWorker(db);
  const before = ROLES.map((role) => first.sessions[role].identity);
  first.stop();

  worker = await startWorker(db);
  assert.deepEqual(ROLES.map((role) => worker!.sessions[role].identity), before);
  assert.equal(db.rows('agents').length, 3);
});

test('stub_agent_puts_a_new_request_in_the_inbox_with_log_rows', async () => {
  const db = createStubDb();
  worker = await startWorker(db);
  const scientist = await db.connect();
  await scientist.call('submit_request', pipetteTips);

  const [request] = db.rows('requests');
  const holds = db.rows('holds');
  assert.equal(holds.length, 1);
  assert.equal(holds[0].raisedBy, worker.sessions.purchasing.identity);
  assert.equal(holds[0].kind, 'purchase');
  assert.equal(holds[0].refId, String(request.id));
  assert.deepEqual(
    db.rows('log').map((row) => row.action).filter((a) => a !== 'register_agent'),
    ['submit_request', 'raise_hold'],
  );
});

test('restarted_worker_does_not_answer_the_same_request_twice', async () => {
  const db = createStubDb();
  const first = await startWorker(db);
  const scientist = await db.connect();
  await scientist.call('submit_request', pipetteTips);
  first.stop();

  worker = await startWorker(db);
  assert.equal(db.rows('holds').length, 1);
});

test('agents_cannot_submit_requests', async () => {
  const db = createStubDb();
  worker = await startWorker(db);
  await assert.rejects(
    worker.sessions.purchasing.call('submit_request', pipetteTips),
    ActionError,
  );
});

test('people_cannot_raise_holds', async () => {
  const db = createStubDb();
  const scientist = await db.connect();
  await assert.rejects(
    scientist.call('raise_hold', {
      kind: 'purchase',
      refId: '1',
      grantId: null,
      title: 'Approve my own request',
      why: 'people must not write Inbox items',
      evidence: [],
    }),
    ActionError,
  );
});

test('a_second_identity_cannot_take_a_role_already_held', async () => {
  const db = createStubDb();
  worker = await startWorker(db);
  const impostor = await db.connect();
  await assert.rejects(impostor.call('register_agent', { role: 'purchasing' }), ActionError);
});

test('an_identity_cannot_switch_to_another_role', async () => {
  const db = createStubDb();
  worker = await startWorker(db);
  await assert.rejects(
    worker.sessions.purchasing.call('register_agent', { role: 'bookkeeping' }),
    ActionError,
  );
});
