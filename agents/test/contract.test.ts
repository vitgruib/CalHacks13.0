// contract.ts is written by hand from server/src/schema.ts. This fails the
// moment Track A adds, renames or drops a column, so the agents' picture of
// the tables can't silently drift. Fix it by updating contract.ts (and the
// list below to match).

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { TABLES, type TableName } from '../src/db/contract.ts';
import { startWorld, type TestWorld } from './helpers.ts';

const COLUMNS: Record<TableName, string[]> = {
  agent: ['identity', 'role', 'registeredAt'],
  person: ['identity', 'role', 'name', 'registeredAt'],
  clock: ['id', 'today'],
  grant: ['id', 'title', 'pi', 'agency', 'awarded', 'received', 'spent', 'promised', 'available', 'start', 'end', 'status', 'frozen', 'frozenReason'],
  statusEvent: ['id', 'grantId', 'day', 'kind', 'source', 'summary', 'amount', 'at'],
  sourceReading: ['id', 'grantId', 'source', 'status', 'awarded', 'paid', 'endDate', 'url', 'day', 'at'],
  flag: ['id', 'grantId', 'day', 'kind', 'summary', 'open', 'raisedBy'],
  checkRequest: ['id', 'grantId', 'reason', 'requestedBy', 'day', 'done', 'asOf'],
  request: ['id', 'day', 'requester', 'requestedBy', 'item', 'category', 'price', 'grantId', 'chargedGrantId', 'sharedWith', 'split', 'purpose', 'state', 'verdicts', 'explanation', 'requesterName', 'oneGrantBasis'],
  order: ['id', 'requestId', 'grantId', 'vendor', 'amount', 'placed', 'state', 'canceledOn', 'changedAmount'],
  approval: ['id', 'orderId', 'amount', 'by', 'day'],
  invoice: ['id', 'orderId', 'vendor', 'amount', 'received', 'state', 'mismatch', 'timeline', 'checked'],
  payroll: ['id', 'grantId', 'person', 'role', 'from', 'to', 'effortPct', 'amount'],
  paymentRequest: ['id', 'grantId', 'from', 'to', 'amount', 'explanation', 'includedRequestIds', 'includedPayrollIds', 'excluded', 'state'],
  followUp: ['id', 'paymentRequestId', 'question', 'answerDraft', 'state'],
  reportPaper: ['id', 'grantId', 'title', 'doi', 'pmcid', 'creditsGrantId', 'correction', 'checks', 'result', 'checked', 'costRequestIds'],
  hold: ['id', 'kind', 'refId', 'grantId', 'raisedBy', 'day', 'title', 'why', 'evidence', 'options', 'open'],
  decision: ['id', 'holdId', 'choice', 'reason', 'by', 'byIdentity', 'day', 'at'],
  log: ['id', 'day', 'at', 'actor', 'action', 'rule', 'reason', 'refId'],
  plan: ['id', 'researcher', 'ownedBy', 'status', 'grantId', 'experiment', 'total', 'overall', 'lines', 'body', 'report', 'savedOn', 'submittedOn', 'sentOn', 'decisionChoice', 'decisionReason', 'decisionDay'],
};

let world: TestWorld | undefined;
afterEach(() => {
  world?.stop();
  world = undefined;
});

test('every_table_has_exactly_the_columns_contract_ts_describes', async () => {
  world = await startWorld();
  const manager = await world.person('grant_manager');
  // Put a row in the tables the sim world leaves empty.
  await manager.call('request_check', { reason: 'check_now' });
  const scientist = await world.person('scientist');
  await scientist.call('save_plan', {
    id: 'pl-contract', status: 'draft', grantId: manager.rows('grant')[0].id, experiment: 'Contract shape', total: 0, overall: '', lines: [], body: '{}', report: '',
  });
  const hold = manager.rows('hold').find((row) => row.open && row.options.includes('ask_vendor'))!;
  await manager.call('decide_hold', { holdId: hold.id, choice: 'ask_vendor', reason: 'Checking the contract shape.' });
  await world.worker.idle();

  for (const table of TABLES) {
    const rows = manager.rows(table) as unknown as Record<string, unknown>[];
    assert.ok(rows.length > 0, `${table} has no rows to check`);
    const seen = new Set(rows.flatMap((row) => Object.keys(row)));
    assert.deepEqual([...seen].sort(), [...COLUMNS[table]].sort(), `${table}: columns differ from contract.ts`);
  }
});

test('identities_are_hex_strings_and_timestamps_are_milliseconds', async () => {
  world = await startWorld();
  const [agent] = world.worker.sessions.purchasing.rows('agent');
  assert.match(agent.identity, /^[0-9a-f]{64}$/);
  assert.equal(typeof agent.registeredAt, 'number');
  assert.ok(agent.registeredAt > Date.parse('2026-01-01'));
  assert.equal(typeof world.worker.sessions.purchasing.rows('log')[0].id, 'bigint');
});
