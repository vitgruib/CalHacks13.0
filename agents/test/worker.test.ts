import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { ActionError } from '../src/db/contract.ts';
import { createLocalDb } from '../src/db/local.ts';
import { memoryTokens } from '../src/identity.ts';
import { ROLES } from '../src/roles.ts';
import { runSim } from '../src/sim.ts';
import { startWorker } from '../src/worker.ts';
import { oneGrantSeed, startWorld, TEST_GRANT, type TestWorld } from './helpers.ts';

let world: TestWorld | undefined;
afterEach(() => {
  world?.stop();
  world = undefined;
});

const gloves = { item: 'Nitrile gloves', category: 'lab supplies', price: 240, grantId: TEST_GRANT, purpose: 'Aim 2', sharedWith: [] };

test('each_agent_connects_as_its_own_registered_identity', async () => {
  world = await startWorld({ seedJson: oneGrantSeed() });
  const { sessions } = world.worker;
  const identities = ROLES.map((role) => sessions[role].identity);
  assert.equal(new Set(identities).size, ROLES.length);
  const registered = new Map(sessions.bookkeeping.rows('agent').map((agent) => [agent.role, agent.identity]));
  for (const role of ROLES) assert.equal(registered.get(role), sessions[role].identity);
});

test('a_restarted_worker_keeps_the_same_identities', async () => {
  const db = await createLocalDb({ world: { seedJson: oneGrantSeed() } });
  const tokens = memoryTokens();
  const first = await startWorker(db, { tokens });
  const before = ROLES.map((role) => first.sessions[role].identity);
  first.stop();

  const second = await startWorker(db, { tokens });
  assert.deepEqual(ROLES.map((role) => second.sessions[role].identity), before);
  assert.equal(second.sessions.bookkeeping.rows('agent').length, ROLES.length);
  second.stop();
});

test('agents_cannot_ask_to_buy_things', async () => {
  world = await startWorld({ seedJson: oneGrantSeed() });
  await assert.rejects(world.worker.sessions.bookkeeping.call('submit_request', gloves), (error: unknown) => {
    assert.ok(error instanceof ActionError);
    assert.match(error.message, /only people/i);
    return true;
  });
});

test('a_person_cannot_take_an_agent_role', async () => {
  world = await startWorld({ seedJson: oneGrantSeed() });
  const scientist = await world.person('scientist');
  await assert.rejects(scientist.call('register_agent', { role: 'bookkeeping' }), /agent/);
});

test('a_refused_action_changes_nothing', async () => {
  world = await startWorld({ seedJson: oneGrantSeed() });
  const { bookkeeping } = world.worker.sessions;
  const logBefore = bookkeeping.rows('log').length;
  await assert.rejects(bookkeeping.call('check_invoice', { invoiceId: 'inv-404' }), /No invoice inv-404/);
  assert.equal(bookkeeping.rows('log').length, logBefore);
});

test('subscribers_hear_about_a_new_row_only_after_the_action_returns', async () => {
  world = await startWorld({ seedJson: oneGrantSeed() });
  const scientist = await world.person('scientist');
  const heard: string[] = [];
  world.worker.sessions.bookkeeping.onInsert('request', (row) => heard.push(row.item));
  await scientist.call('submit_request', gloves);
  assert.deepEqual(heard, [], 'not inside the action');
  assert.equal(scientist.rows('request').length, 1, 'but the row is already readable');
  await world.db.settled();
  assert.deepEqual(heard, ['Nitrile gloves']);
});

test('loading_a_world_reports_removed_rows_and_nothing_for_rows_it_brings_back_unchanged', async () => {
  world = await startWorld({ seedJson: oneGrantSeed() });
  const scientist = await world.person('scientist');
  await scientist.call('submit_request', gloves);
  await world.worker.idle();
  const conn = world.worker.sessions.bookkeeping;
  const removed: string[] = [];
  const clockChanges: string[] = [];
  conn.onDelete('request', (row) => removed.push(row.item));
  conn.onUpdate('clock', (_before, after) => clockChanges.push(after.today));
  const lab = await world.person('grant_manager');
  await lab.call('load_seed', { json: oneGrantSeed() });
  await world.db.settled();
  assert.deepEqual(removed, ['Nitrile gloves']);
  assert.equal(conn.rows('request').length, 0);
  assert.deepEqual(clockChanges, [], 'the same day came back, so the clock sends nothing');
});

test('the_sim_world_loads_with_grant_a_frozen_by_a_court_order_without_payment', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.bookkeeping;
  const grantA = conn.rows('grant').find((grant) => grant.id === 'R01GM061721');
  assert.equal(grantA?.status, 'restored_by_court');
  assert.equal(grantA?.frozen, true);
  assert.equal(conn.today(), '2026-06-15');
  assert.equal(conn.rows('request').length, 22);
});

test('run_sim_returns_every_table_once_the_agents_are_quiet', async () => {
  const run = await runSim();
  try {
    assert.equal(run.tables.grant.length, 8); // grants A and B, and the six cut-script grants (T65, T74)
    assert.ok(run.tables.log.length > 0);
    assert.equal(run.tables.agent.length, ROLES.length);
  } finally {
    run.stop();
  }
});
