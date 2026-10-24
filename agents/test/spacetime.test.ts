// Integration test for db/spacetime.ts against a live local SpacetimeDB.
// Skipped unless GG_SPACETIME_IT=1 (npm run test:spacetime). It publishes
// server/ to a fresh throwaway database and deletes it afterwards; the
// team's `grantguard` database is never touched.
//
// Needs: a running server (`spacetime start`), the CLI (default
// ~/.local/bin/spacetime, or GG_SPACETIME_CLI) and server/node_modules.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ActionError, type Connection, type Db, type LogRow } from '../src/db/contract.ts';
import { createSpacetimeDb } from '../src/db/spacetime.ts';

const enabled = process.env.GG_SPACETIME_IT === '1';
const CLI = process.env.GG_SPACETIME_CLI ?? join(homedir(), '.local/bin/spacetime');
// The CLI's server nickname and the websocket address must name the same server.
const CLI_SERVER = process.env.GG_SPACETIME_CLI_SERVER ?? 'local';
const URI = process.env.GG_SPACETIME_URI ?? 'ws://127.0.0.1:3000';
const MODULE = fileURLToPath(new URL('../../server/', import.meta.url));
const NAME = `grantguard-agents-test-${randomBytes(4).toString('hex')}`;
// A hung step fails on its own, so the after hook still deletes the database.
const STEP = { timeout: 30_000 };

function cli(...args: string[]): string {
  try {
    return execFileSync(CLI, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
    throw new Error(`spacetime ${args.join(' ')} failed:\n${stdout}${stderr}`);
  }
}

async function rejectsWithActionError(call: Promise<void>, action: string, message: RegExp): Promise<void> {
  await assert.rejects(call, (error: unknown) => {
    assert.ok(error instanceof ActionError, `expected an ActionError, got ${String(error)}`);
    assert.equal(error.action, action);
    assert.match(error.message, message);
    return true;
  });
}

describe('spacetime adapter (live server)', { skip: !enabled && 'set GG_SPACETIME_IT=1 to run against a local SpacetimeDB' }, () => {
  let db: Db;
  let published = false;
  const agents: Record<'purchasing' | 'bookkeeping' | 'payment_report', Connection> = {} as never;
  let manager: Connection;

  before(
    () => {
      cli('publish', '--server', CLI_SERVER, '--module-path', MODULE, '--no-config', '-y', NAME);
      published = true;
      db = createSpacetimeDb({ uri: URI, databaseName: NAME });
    },
    { timeout: 300_000 },
  );

  after(() => {
    db?.close();
    if (published) cli('delete', '--server', CLI_SERVER, '--no-config', '-y', NAME);
  });

  test('three_agents_register_as_separate_identities', STEP, async () => {
    for (const role of ['purchasing', 'bookkeeping', 'payment_report'] as const) {
      agents[role] = await db.connect();
      await agents[role].call('register_agent', { role });
    }
    await db.settled();

    const identities = new Set(Object.values(agents).map((c) => c.identity));
    assert.equal(identities.size, 3);
    for (const conn of Object.values(agents)) {
      assert.match(conn.identity, /^[0-9a-f]{64}$/);
      assert.ok(conn.token.length > 0);
      // Every connection sees every registration, not only its own.
      const rows = conn.rows('agent');
      assert.equal(rows.length, 3);
      for (const [role, agent] of Object.entries(agents)) {
        const row = rows.find((r) => r.identity === agent.identity);
        assert.equal(row?.role, role);
        assert.equal(typeof row?.registeredAt, 'number');
        assert.ok(Math.abs(row!.registeredAt - Date.now()) < 60_000, 'registeredAt is in milliseconds');
      }
    }
  });

  test('reconnecting_with_a_saved_token_keeps_the_identity', STEP, async () => {
    const { identity, token } = agents.purchasing;
    agents.purchasing.disconnect();
    agents.purchasing = await db.connect({ token });
    assert.equal(agents.purchasing.identity, identity);
    assert.equal(agents.purchasing.token, token);
    // Registering again with the same role is accepted, not a second agent.
    await agents.purchasing.call('register_agent', { role: 'purchasing' });
    assert.equal(agents.purchasing.rows('agent').filter((r) => r.role === 'purchasing').length, 1);
  });

  test('a_person_cannot_register_as_an_agent', STEP, async () => {
    manager = await db.connect();
    await manager.call('register_person', { role: 'grant_manager', name: 'Test lab' });
    assert.equal(manager.rows('person').find((p) => p.identity === manager.identity)?.role, 'grant_manager');
    await rejectsWithActionError(manager.call('register_agent', { role: 'bookkeeping' }), 'register_agent', /person/);
  });

  test('the_purchasing_agent_cannot_post_source_readings', STEP, async () => {
    const reading = { grantId: 'R01GM000001', source: 'NIH RePORTER', status: 'active', url: 'https://reporter.nih.gov/' } as const;
    await rejectsWithActionError(agents.purchasing.call('post_source_reading', reading), 'post_source_reading', /bookkeeping/);
    await rejectsWithActionError(agents.bookkeeping.call('no_such_action' as never, {} as never), 'no_such_action', /no action/);
  });

  test('on_insert_fires_for_a_new_actions_log_row', STEP, async () => {
    const before = db.version();
    const newest = (conn: Connection) => conn.rows('log').reduce((max, r) => (r.id > max ? r.id : max), 0n);
    const highWater = newest(agents.payment_report);
    const seenByCaller: LogRow[] = [];
    const seenByOther: LogRow[] = [];
    const stopCaller = agents.bookkeeping.onInsert('log', (row) => seenByCaller.push(row));
    const stopOther = agents.payment_report.onInsert('log', (row) => seenByOther.push(row));

    await agents.bookkeeping.call('post_source_reading', {
      grantId: 'R01GM000001',
      source: 'NIH RePORTER',
      status: 'restored_by_court',
      url: 'https://reporter.nih.gov/project-details/R01GM000001',
    });
    // The caller's own rows are in by the time call() resolves; other
    // connections only after settled().
    assert.equal(seenByCaller.length, 1);
    await db.settled();
    stopCaller();
    stopOther();

    for (const seen of [seenByCaller, seenByOther]) {
      assert.equal(seen.length, 1, 'only the new row, not the rows already there');
      const [row] = seen;
      assert.equal(row.actor, 'bookkeeping');
      assert.equal(row.action, 'Read NIH RePORTER for R01GM000001');
      assert.equal(row.refId, 'R01GM000001');
      assert.equal(row.rule, undefined);
      assert.equal(typeof row.id, 'bigint');
      assert.ok(row.id > highWater);
      assert.equal(typeof row.at, 'number');
    }
    const reading = agents.purchasing.rows('sourceReading').find((r) => r.status === 'restored_by_court');
    assert.equal(reading?.awarded, undefined);
    assert.equal(typeof reading?.id, 'bigint');
    // One commit, seen by each of the four open connections.
    assert.equal(db.version() - before, 4);

    // Unsubscribed callbacks stay quiet.
    await agents.bookkeeping.call('request_check', { reason: 'check_now' });
    await db.settled();
    assert.equal(seenByCaller.length + seenByOther.length, 2);
  });

  test('on_update_delivers_the_old_and_new_row', STEP, async () => {
    const updates: Array<[boolean, boolean]> = [];
    const stop = agents.purchasing.onUpdate('checkRequest', (oldRow, newRow) => updates.push([oldRow.done, newRow.done]));
    const open = agents.bookkeeping.rows('checkRequest').find((r) => !r.done);
    assert.ok(open, 'request_check left an open check');
    assert.equal(open.grantId, undefined);
    await agents.bookkeeping.call('complete_check', { id: open.id });
    await db.settled();
    stop();
    assert.deepEqual(updates, [[false, true]]);
  });

  test('the_fixture_grants_show_with_R01GM000001_frozen', STEP, () => {
    const grants = agents.payment_report.rows('grant');
    assert.deepEqual(grants.map((g) => g.id).sort(), ['R01GM000001', 'R21AI000002']);
    const frozen = grants.find((g) => g.id === 'R01GM000001')!;
    assert.equal(frozen.frozen, true);
    assert.equal(frozen.status, 'restored_by_court');
    assert.match(frozen.frozenReason ?? '', /court/);
    const active = grants.find((g) => g.id === 'R21AI000002')!;
    assert.equal(active.frozen, false);
    assert.equal(active.frozenReason, undefined);
    assert.equal(agents.payment_report.today(), '2026-06-15');
  });
});
