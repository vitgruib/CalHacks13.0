import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { startTracker } from '../src/agents/bookkeeping.ts';
import {
  DEFAULT_VENDOR,
  explanationOr,
  finishExplanation,
  loadRules,
  planFor,
  readFallback,
  sanitizeRead,
  startPurchasing,
  vendorFor,
  withFreezePromise,
} from '../src/agents/purchasing.ts';
import type { Actions, ActionName, Connection, GrantRow, OrderRow, RequestRow, RuleVerdict, Source } from '../src/db/contract.ts';
import { createLocalDb } from '../src/db/local.ts';
import { memoryTokens } from '../src/identity.ts';
import { createPaperLookup } from '../src/sources/papers.ts';
import type { SourceClient } from '../src/sources/types.ts';
import { startWorker } from '../src/worker.ts';
import { oneGrantSeed, startWorld, TEST_GRANT, type TestWorld } from './helpers.ts';

let world: TestWorld | undefined;
let cleanup: (() => void) | undefined;
afterEach(() => {
  world?.stop();
  world = undefined;
  cleanup?.();
  cleanup = undefined;
});

const GRANT_A = 'R01GM061721';
const GRANT_B = 'R21AI182745';
const SECOND_GRANT = 'R21TEST000002';

const conn = () => world!.worker.sessions.purchasing;
const request = (id: string) => conn().rows('request').find((row) => row.id === id)!;
const failedRules = (row: RequestRow) => row.verdicts.filter((v) => !v.pass).map((v) => v.rule);
const verdict = (row: RequestRow, prefix: string) => row.verdicts.find((v) => v.rule.startsWith(prefix));
const purchaseHolds = (id: string, c: Connection = conn()) => c.rows('hold').filter((hold) => hold.kind === 'purchase' && hold.refId === id);
const openPurchaseHolds = (id: string, c: Connection = conn()) => purchaseHolds(id, c).filter((hold) => hold.open);
const ordersFor = (id: string, c: Connection = conn()) => c.rows('order').filter((order) => order.requestId === id);
const newestRequest = () => conn().rows('request').at(-1)!;

const gloves = { item: 'Nitrile gloves, 4 cases', category: 'lab supplies', price: 240, grantId: TEST_GRANT, purpose: 'Aim 2 membrane preps', sharedWith: [] };

// A source that has no news until the test says it caught up, then reports
// the grant as funded again.
function catchingUp(source: Source, grantId: string) {
  let caughtUp = false;
  const client: SourceClient = {
    source,
    async read(id) {
      if (id !== grantId || !caughtUp) return null;
      return { grantId: id, source, status: 'active', awarded: null, paid: null, endDate: null, url: `https://example.test/${source}/${id}` };
    },
  };
  return { client, catchUp: () => (caughtUp = true) };
}

// The sim world, with USAspending and the cancellation list for grant A
// still saying canceled until catchUp().
async function startSim() {
  const usaspending = catchingUp('USAspending', GRANT_A);
  const cancellations = catchingUp('Cancellation list (Apify)', GRANT_A);
  world = await startWorld({ sources: [usaspending.client, cancellations.client] });
  return () => {
    usaspending.catchUp();
    cancellations.catchUp();
  };
}

// The demo's payment, as people drive it: money lands on grant A, the
// sources catch up, and the grant manager settles the source disagreement the
// fund tracker raised (ft-1). Only then is grant A unfrozen.
async function payGrantA(catchUp: () => void) {
  const grantManager = await world!.person('grant_manager');
  await grantManager.call('inject_status_event', {
    grantId: GRANT_A, kind: 'payment_received', source: 'Payment system', summary: 'Payment of $20,000 received.', amount: 20_000,
  });
  await world!.worker.idle();
  const stillFrozen = conn().rows('grant').find((grant) => grant.id === GRANT_A)!.frozen;
  catchUp();
  await grantManager.call('request_check', { grantId: GRANT_A, reason: 'check_now' });
  await world!.worker.idle();
  const disagreement = conn().rows('hold').find((hold) => hold.kind === 'source_disagreement' && hold.open && hold.grantId === GRANT_A)!;
  await grantManager.call('decide_hold', { holdId: disagreement.id, choice: 'pick_source', reason: 'RePORTER is right: the payment arrived.' });
  await world!.worker.idle();
  return { grantManager, frozenAfterPaymentAlone: stillFrozen };
}

// The same climax with no sources to catch up, as in the demo path
// (tracker.test.ts): the payment lands and the grant manager settles ft-1,
// in the order given.
async function unfreezeGrantA(grantManager: Connection, order: readonly ('pay' | 'pick')[]) {
  for (const step of order) {
    if (step === 'pay') {
      await grantManager.call('inject_status_event', {
        grantId: GRANT_A, kind: 'payment_received', source: 'Payment system', summary: 'Payment of $20,000 received.', amount: 20_000,
      });
    } else {
      const disagreement = conn().rows('hold').find((hold) => hold.kind === 'source_disagreement' && hold.open && hold.grantId === GRANT_A)!;
      await grantManager.call('decide_hold', { holdId: disagreement.id, choice: 'pick_source', reason: 'RePORTER is right: the payment arrived.' });
    }
    await world!.worker.idle();
  }
}

function twoGrantSeed(): string {
  const seed = JSON.parse(oneGrantSeed());
  seed.grants.push({ ...seed.grants[0], id: SECOND_GRANT, title: 'Second test grant' });
  return JSON.stringify(seed);
}

// A world (the sim by default) whose worker can be restarted with the same
// identities, as a real worker comes back with its saved tokens. Nothing the
// agents remember survives; only the rows do.
async function startRestartable(seedJson?: string) {
  const db = await createLocalDb({ world: seedJson ? { seedJson } : 'sim' });
  const tokens = memoryTokens();
  const papers = createPaperLookup({ mode: 'offline', throttle: false });
  let worker = await startWorker(db, { tokens, papers });
  await worker.idle();
  world = {
    db,
    get worker() {
      return worker;
    },
    async person(role) {
      const c = await db.connect();
      await c.call('register_person', { role, name: role });
      return c;
    },
    stop() {
      worker.stop();
      db.close();
    },
  };
  return async function restart() {
    worker.stop();
    worker = await startWorker(db, { tokens, papers });
    await worker.idle();
  };
}

// ── The planted cases (sim/answer-key.json) ────────────────────────────────

test('pu_0_rq_101_is_held_for_grant_a_s_freeze_with_a_purchase_hold', async () => {
  await startSim();
  const row = request('rq-101');
  assert.equal(row.state, 'waiting_on_manager');
  assert.equal(row.chargedGrantId, GRANT_A);
  assert.deepEqual(failedRules(row), ['Grant is active and not frozen']);
  const holds = openPurchaseHolds('rq-101');
  assert.equal(holds.length, 1);
  assert.equal(holds[0].raisedBy, 'purchasing');
  assert.match(row.explanation, /Grant is active and not frozen/);
  assert.match(row.explanation, /\$640/);
  assert.match(row.explanation, /no payment has arrived/);
  assert.equal(ordersFor('rq-101').length, 0);
});

test('pu_1_rq_102_is_blocked_on_the_last_90_days_rule_until_grant_a_can_take_it', async () => {
  await startSim();
  const row = request('rq-102');
  assert.equal(row.state, 'blocked');
  assert.equal(row.chargedGrantId, GRANT_B);
  assert.deepEqual(failedRules(row), ["Not in the grant's last 90 days"]);
  assert.match(row.explanation, /Not in the grant's last 90 days: R21AI182745 ends 2026-08-31, 77 days away/);
  assert.match(row.explanation, /rerouted there once R01GM061721 unfreezes/);
  assert.equal(openPurchaseHolds('rq-102').length, 1, 'flagged for the grant manager, never rejected by the agent');
  const log = conn().rows('log').find((entry) => entry.refId === 'rq-102' && entry.action.startsWith('Flagged'));
  assert.equal(log?.rule, "Not in the grant's last 90 days");
});

test('pu_2_rq_103_is_blocked_citing_the_category_rule', async () => {
  await startSim();
  const row = request('rq-103');
  assert.equal(row.state, 'blocked');
  assert.deepEqual(failedRules(row), ['Category allowed']);
  assert.match(row.explanation, /Category allowed: general office is not an allowable direct cost/);
  assert.match(row.explanation, /UC Davis/);
  assert.deepEqual(openPurchaseHolds('rq-103').map((hold) => hold.options), [['approve', 'reject']]);
});

test('pu_4_rq_105_waits_on_the_manager_citing_the_card_limit', async () => {
  await startSim();
  const row = request('rq-105');
  assert.equal(row.state, 'waiting_on_manager');
  const [hold] = openPurchaseHolds('rq-105');
  assert.ok(hold.evidence.some((e) => e.label === 'Under the card limit ($5,000)'));
  assert.match(row.explanation, /Under the card limit \(\$5,000\): \$6,850 is over the limit/);
});

test('pu_d1_rq_106_passes_the_card_limit_and_waits_only_for_the_freeze', async () => {
  await startSim();
  const row = request('rq-106');
  assert.equal(verdict(row, 'Under the card limit')?.pass, true);
  assert.deepEqual(failedRules(row), ['Grant is active and not frozen']);
  const [hold] = openPurchaseHolds('rq-106');
  assert.ok(!hold.evidence.some((e) => e.label.startsWith('Under the card limit')), 'held for the freeze, not the limit');
});

test('once_grant_a_is_paid_and_its_sources_agree_the_waiting_purchases_go_through', async () => {
  const catchUp = await startSim();
  const { frozenAfterPaymentAlone } = await payGrantA(catchUp);
  assert.equal(frozenAfterPaymentAlone, true, 'while sources disagree (ft-1) a payment alone does not unfreeze grant A');
  assert.equal(conn().rows('grant').find((grant) => grant.id === GRANT_A)?.frozen, false);

  for (const id of ['rq-101', 'rq-106']) {
    assert.equal(request(id).state, 'bought', id);
    assert.ok(request(id).verdicts.every((v) => v.pass), id);
  }
  assert.deepEqual(ordersFor('rq-101').map((o) => [o.grantId, o.amount, o.vendor]), [[GRANT_A, 640, 'LabSource']]);
  assert.deepEqual(ordersFor('rq-106').map((o) => [o.grantId, o.amount, o.vendor]), [[GRANT_A, 5000, 'MembraneChem']]);
  assert.match(request('rq-101').explanation, /held only for the freeze/);

  const rerouted = request('rq-102');
  assert.equal(rerouted.state, 'rerouted');
  assert.equal(rerouted.chargedGrantId, GRANT_A);
  assert.deepEqual(ordersFor('rq-102').map((o) => [o.grantId, o.amount]), [[GRANT_A, 1180]]);
  assert.match(rerouted.explanation, /Rerouted .* from R21AI182745 to R01GM061721/);
  assert.match(rerouted.explanation, /Not in the grant's last 90 days/);

  // Still waiting on what only a person can fix, and not bought; the Inbox
  // says what still holds it, no longer the freeze.
  assert.equal(request('rq-105').state, 'waiting_on_manager');
  assert.equal(ordersFor('rq-105').length, 0);
  const holds = openPurchaseHolds('rq-105');
  assert.equal(holds.length, 1);
  assert.ok(holds[0].why.includes('Under the card limit'));
  assert.ok(!holds[0].why.includes('Grant is active and not frozen'), holds[0].why);
  assert.ok(holds[0].evidence.every((row) => !row.label.startsWith('Grant is active')));
  assert.equal(request('rq-103').state, 'blocked');
});

// The grant manager decides a held item while the agent is checking it again
// after the unfreeze (QA's race): the decision stands, and the rest of the
// rechecks still happen.
for (const [id, choice] of [['rq-105', 'approve'], ['rq-105', 'reject']] as const) {
  test(`a_${choice}_of_${id}_while_its_hold_is_checked_again_is_not_undone`, async () => {
    const catchUp = await startSim();
    const grantManager = await world!.person('grant_manager');
    const agent = conn();
    const call = agent.call.bind(agent);
    let decided = false;
    agent.call = (async (action: ActionName, args: never) => {
      const out = await call(action, args);
      if (!decided && action === 'evaluate_request' && (args as { requestId: string }).requestId === id && !conn().rows('grant').find((g) => g.id === GRANT_A)!.frozen) {
        decided = true;
        const [hold] = openPurchaseHolds(id);
        await grantManager.call('decide_hold', { holdId: hold.id, choice, reason: 'Decided while the agent checks it again.' });
      }
      return out;
    }) as typeof agent.call;
    await payGrantA(catchUp);
    assert.ok(decided);
    assert.deepEqual(openPurchaseHolds(id), [], `${id} was decided; it must not come back to the Inbox`);
    assert.equal(request('rq-101').state, 'bought', 'the other waiting purchases are still checked again');
  });
}

test('after_grant_a_reopens_new_supplies_asked_for_on_grant_b_are_rerouted_to_it', async () => {
  const catchUp = await startSim();
  await payGrantA(catchUp);
  const scientist = await world!.person('scientist');
  await scientist.call('submit_request', {
    item: 'Pipette tips, 20 racks', category: 'lab supplies', price: 380, grantId: GRANT_B, purpose: 'Assay plates', sharedWith: [],
  });
  await world!.worker.idle();
  const row = newestRequest();
  assert.equal(row.state, 'rerouted');
  assert.equal(row.chargedGrantId, GRANT_A);
  assert.match(row.explanation, /Not in the grant's last 90 days: R21AI182745 ends 2026-08-31/);
});

test('supplies_in_grant_b_s_last_90_days_are_never_rerouted_to_another_pi_s_grant', async () => {
  world = await startWorld();
  const scientist = await world.person('scientist');
  await scientist.call('submit_request', {
    item: 'Pipette tips, 20 racks', category: 'lab supplies', price: 380, grantId: GRANT_B, purpose: 'Assay plates', sharedWith: [],
  });
  await world.worker.idle();
  const pis = new Map(conn().rows('grant').map((grant) => [grant.id, grant.pi]));
  const row = newestRequest();
  assert.equal(pis.get(row.chargedGrantId ?? GRANT_B), pis.get(GRANT_B));
  assert.ok(ordersFor(row.id).every((order) => pis.get(order.grantId) === pis.get(GRANT_B)));
});

// The grant manager's call is final: Approve buys at once, even while grant
// A is frozen and over the card limit, and a rejection stands.
test('the_grant_manager_s_approval_buys_at_once_even_while_grant_a_is_frozen', async () => {
  world = await startWorld();
  const grantManager = await world.person('grant_manager');
  const decide = (id: string, choice: 'approve' | 'reject', reason: string) =>
    grantManager.call('decide_hold', { holdId: openPurchaseHolds(id)[0].id, choice, reason });
  await decide('rq-101', 'approve', 'Yes, buy the gloves.');
  await decide('rq-105', 'approve', 'The pump is needed for aim 3.');
  await decide('rq-106', 'reject', 'Use the kit left from round 1.');
  await world.worker.idle();
  assert.equal(conn().rows('grant').find((grant) => grant.id === GRANT_A)?.frozen, true);
  assert.equal(request('rq-101').state, 'bought');
  assert.deepEqual(ordersFor('rq-101').map((o) => [o.grantId, o.amount]), [[GRANT_A, 640]]);
  assert.equal(request('rq-105').state, 'bought');
  assert.deepEqual(ordersFor('rq-105').map((o) => [o.grantId, o.amount]), [[GRANT_A, 6850]]);
  assert.equal(request('rq-106').state, 'rejected');
  assert.equal(ordersFor('rq-106').length, 0);

  // Nothing is bought twice once grant A unfreezes.
  await unfreezeGrantA(grantManager, ['pay', 'pick']);
  assert.equal(ordersFor('rq-101').length, 1);
  assert.equal(ordersFor('rq-105').length, 1);
  assert.equal(request('rq-106').state, 'rejected');
});

// ── Typed requests ─────────────────────────────────────────────────────────

// The one-grant test seed with these grants, each over the test grant's fields.
function grantsSeed(grants: Array<Record<string, unknown>>, extra: Record<string, unknown[]> = {}): string {
  const seed = JSON.parse(oneGrantSeed(extra));
  seed.grants = grants.map((grant) => ({ ...seed.grants[0], ...grant }));
  return JSON.stringify(seed);
}
const PROMISE = /will be bought automatically once/;
const canceledJune1 = (grantId: string) => ({ grantId, day: '2026-06-01', kind: 'canceled', source: 'Cancellation list (Apify)', summary: 'Terminated.' });

// The module fails an ended grant on "Grant is active and not frozen" too,
// but an ended grant never unfreezes.
test('a_request_on_a_grant_that_has_ended_is_rerouted_without_promising_a_buy_on_unfreeze', async () => {
  world = await startWorld({ seedJson: grantsSeed([{ id: TEST_GRANT, end: '2026-06-20' }, { id: SECOND_GRANT, title: 'Second test grant' }]) });
  const grantManager = await world.person('grant_manager');
  await grantManager.call('advance_days', { days: 10 });
  const scientist = await world.person('scientist');
  await scientist.call('submit_request', { ...gloves, item: 'Centrifuge rotor service', category: 'equipment service', price: 900 });
  await world.worker.idle();
  const row = newestRequest();
  assert.equal(conn().rows('grant').find((grant) => grant.id === TEST_GRANT)!.status, 'ended');
  assert.equal(row.state, 'rerouted');
  assert.deepEqual(ordersFor(row.id).map((o) => [o.grantId, o.amount]), [[SECOND_GRANT, 900]]);
  assert.doesNotMatch(row.explanation, PROMISE);
  assert.deepEqual(openPurchaseHolds(row.id), []);
});

test('a_request_on_an_ended_grant_no_other_grant_can_take_is_blocked_without_a_promise', async () => {
  world = await startWorld({ seedJson: grantsSeed([{ id: TEST_GRANT, end: '2026-06-20' }]) });
  const grantManager = await world.person('grant_manager');
  await grantManager.call('advance_days', { days: 10 });
  const scientist = await world.person('scientist');
  await scientist.call('submit_request', { ...gloves, item: 'Centrifuge rotor service', category: 'equipment service', price: 900 });
  await world.worker.idle();
  const row = newestRequest();
  assert.equal(row.state, 'blocked');
  assert.match(row.explanation, /The grant has ended/);
  assert.match(row.explanation, /No other grant can take it/);
  assert.doesNotMatch(row.explanation, PROMISE);
  assert.equal(ordersFor(row.id).length, 0);
});

// Held only for the freeze, with the promise to buy it on unfreeze; by the
// time the payment lands the grant is in its last 90 days.
async function holdThenUnfreezeInLast90Days(grants: Array<Record<string, unknown>>) {
  world = await startWorld({ seedJson: grantsSeed(grants, { statusEvents: [canceledJune1(TEST_GRANT)] }) });
  const scientist = await world.person('scientist');
  await scientist.call('submit_request', gloves);
  await world.worker.idle();
  const id = newestRequest().id;
  assert.equal(request(id).state, 'waiting_on_manager');
  assert.match(openPurchaseHolds(id)[0].why, PROMISE);
  const grantManager = await world.person('grant_manager');
  await grantManager.call('advance_days', { days: 15 }); // 87 days left
  await grantManager.call('inject_status_event', { grantId: TEST_GRANT, kind: 'court_order', source: 'Court notice', summary: 'A court restored the grant.' });
  await grantManager.call('inject_status_event', {
    grantId: TEST_GRANT, kind: 'payment_received', source: 'Payment system', summary: 'Payment of $10,000 received.', amount: 10_000,
  });
  await world.worker.idle();
  assert.equal(conn().rows('grant').find((grant) => grant.id === TEST_GRANT)!.frozen, false);
  return id;
}

test('a_freeze_hold_whose_grant_unfreezes_in_its_last_90_days_is_rerouted_to_a_grant_that_can_take_it', async () => {
  const id = await holdThenUnfreezeInLast90Days([{ id: TEST_GRANT, end: '2026-09-25' }, { id: SECOND_GRANT, title: 'Second test grant' }]);
  assert.equal(request(id).state, 'rerouted');
  assert.deepEqual(ordersFor(id).map((o) => [o.grantId, o.amount]), [[SECOND_GRANT, 240]]);
  assert.match(request(id).explanation, /Not in the grant's last 90 days/);
  assert.deepEqual(openPurchaseHolds(id), []);
});

test('a_freeze_hold_whose_grant_unfreezes_in_its_last_90_days_with_no_other_grant_stays_in_the_inbox_without_its_promise', async () => {
  const id = await holdThenUnfreezeInLast90Days([{ id: TEST_GRANT, end: '2026-09-25' }]);
  assert.equal(request(id).state, 'waiting_on_manager');
  assert.equal(ordersFor(id).length, 0);
  const [hold] = openPurchaseHolds(id);
  assert.ok(hold, 'still in the Inbox for the grant manager');
  assert.doesNotMatch(hold.why, PROMISE);
  assert.match(hold.why, /Not in the grant's last 90 days/);
  assert.match(hold.why, /No other grant can take it/);
});

// A judge fast-forwards the Test lab clock past grant B's end before paying grant A.
test('after_a_fast_forward_past_grant_b_s_end_the_waiting_purchases_go_through', async () => {
  const catchUp = await startSim();
  const grantManager = await world!.person('grant_manager');
  await grantManager.call('advance_days', { days: 80 });
  await world!.worker.idle();
  await payGrantA(catchUp);
  assert.equal(conn().rows('grant').find((grant) => grant.id === GRANT_A)?.frozen, false);
  for (const id of ['rq-101', 'rq-106']) assert.equal(request(id).state, 'bought', id);
  // Rerouted on the rules as they stand now, not as on the day it was blocked.
  assert.equal(request('rq-102').state, 'rerouted');
  assert.match(request('rq-102').explanation, /The grant has ended/);
  assert.doesNotMatch(request('rq-102').explanation, /77 days away/);
});

test('a_typed_request_without_a_grant_gets_one_a_verdict_and_an_explanation', async () => {
  await startSim();
  const scientist = await world!.person('scientist');
  await scientist.call('submit_request', {
    item: 'Sequencing run for 12 isolates', category: 'core facility services', price: 900, purpose: 'Isolates from the assay validation', sharedWith: [],
  });
  await world!.worker.idle();
  const row = newestRequest();
  // Grant A is frozen; grant B passes every rule, and services aren't supplies.
  assert.equal(row.state, 'bought');
  assert.equal(row.chargedGrantId, GRANT_B);
  assert.ok(row.verdicts.length > 0 && row.verdicts.every((v) => v.pass));
  assert.match(row.explanation, /Every rule passes: Grant is active and not frozen; Enough truly available money; Category allowed; Under the card limit/);
  assert.equal(ordersFor(row.id)[0]?.vendor, DEFAULT_VENDOR);
});

test('a_request_two_grants_could_pay_for_is_held_instead_of_guessing', async () => {
  world = await startWorld({ seedJson: twoGrantSeed() });
  const scientist = await world.person('scientist');
  await scientist.call('submit_request', { item: 'Pipette tips, 20 racks', category: 'lab supplies', price: 380, purpose: 'General bench use', sharedWith: [] });
  await world.worker.idle();
  const row = newestRequest();
  assert.equal(row.state, 'waiting_on_manager');
  assert.equal(openPurchaseHolds(row.id).length, 1);
  assert.match(row.explanation, new RegExp(`${TEST_GRANT} and ${SECOND_GRANT} could each pay for it`));
  assert.equal(ordersFor(row.id).length, 0);
});

test('an_over_limit_typed_request_goes_to_the_inbox', async () => {
  world = await startWorld({ seedJson: oneGrantSeed() });
  const scientist = await world.person('scientist');
  await scientist.call('submit_request', { ...gloves, item: 'Plate reader', category: 'equipment', price: 7_200 });
  await world.worker.idle();
  const row = newestRequest();
  assert.equal(row.state, 'waiting_on_manager');
  assert.deepEqual(failedRules(row), ['Under the card limit ($5,000)']);
  assert.ok(openPurchaseHolds(row.id)[0].evidence.some((e) => e.label === 'Under the card limit ($5,000)'));
  assert.equal(ordersFor(row.id).length, 0);
});

test('a_clean_typed_request_under_the_limit_is_bought_alone', async () => {
  world = await startWorld({ seedJson: oneGrantSeed() });
  const scientist = await world.person('scientist');
  await scientist.call('submit_request', gloves);
  await world.worker.idle();
  const row = newestRequest();
  assert.equal(row.state, 'bought');
  assert.equal(purchaseHolds(row.id).length, 0);
  assert.deepEqual(ordersFor(row.id).map((o) => [o.grantId, o.amount]), [[TEST_GRANT, 240]]);
});

test('a_push_back_on_a_rerouted_request_never_buys_it_twice', async () => {
  // The asked-for grant is in its last 90 days, so supplies are rerouted to the second.
  const seed = JSON.parse(twoGrantSeed());
  seed.grants[0].end = '2026-07-15';
  world = await startWorld({ seedJson: JSON.stringify(seed) });
  const scientist = await world.person('scientist');
  await scientist.call('submit_request', { ...gloves, item: 'Pipette tips, 20 racks', price: 380 });
  await world.worker.idle();
  const id = newestRequest().id;
  assert.equal(request(id).state, 'rerouted');
  assert.deepEqual(ordersFor(id).map((o) => [o.grantId, o.amount]), [[SECOND_GRANT, 380]]);

  // The module refuses a push back on a rerouted request, as on a bought one.
  await assert.rejects(scientist.call('push_back', { requestId: id, message: 'Did this go through?' }), /Already rerouted/);
  await world.worker.idle();
  assert.equal(ordersFor(id).length, 1, 'one order, not two');
  assert.equal(request(id).state, 'rerouted', 'still shows as bought on the other grant');
  assert.equal(request(id).chargedGrantId, SECOND_GRANT);
  assert.equal(openPurchaseHolds(id).length, 0, 'no approve button that would order it again');
});

// ── People decide; the module refuses ──────────────────────────────────────

async function freezeTestGrant(grantManager: Connection) {
  await grantManager.call('inject_status_event', {
    grantId: TEST_GRANT, kind: 'canceled', source: 'Cancellation list (Apify)', summary: 'Listed as terminated.',
  });
}
// The payment lands the next day: the module orders same-day events by how
// its index returns them, so a same-day payment can sort before the
// cancellation and leave the grant frozen (reported to Track A).
async function payTestGrant(grantManager: Connection) {
  await grantManager.call('advance_days', { days: 1 });
  await grantManager.call('inject_status_event', { grantId: TEST_GRANT, kind: 'court_order', source: 'Court notice', summary: 'A court restored the grant.' });
  await grantManager.call('inject_status_event', {
    grantId: TEST_GRANT, kind: 'payment_received', source: 'Payment system', summary: 'Payment of $10,000 received.', amount: 10_000,
  });
}

// unfreeze_grant leaves the grant canceled, so it fails the rule until its
// payment lands, and then only its status changes.
test('a_freeze_hold_is_bought_once_a_grant_unfrozen_early_is_paid', async () => {
  world = await startWorld({ seedJson: grantsSeed([{ id: TEST_GRANT }], { statusEvents: [canceledJune1(TEST_GRANT)] }) });
  const scientist = await world.person('scientist');
  const grantManager = await world.person('grant_manager');
  await scientist.call('submit_request', gloves);
  await world.worker.idle();
  const id = newestRequest().id;
  assert.match(openPurchaseHolds(id)[0].why, PROMISE);

  await grantManager.call('unfreeze_grant', { grantId: TEST_GRANT, reason: 'The agency confirmed funds are coming.' });
  await world.worker.idle();
  assert.equal(request(id).state, 'waiting_on_manager');
  assert.match(openPurchaseHolds(id)[0].why, PROMISE);

  await payTestGrant(grantManager);
  await world.worker.idle();
  assert.equal(request(id).state, 'bought');
  assert.equal(ordersFor(id).length, 1);
  assert.deepEqual(openPurchaseHolds(id), []);
});

// The agent never moves money alone after a person's decision, so a block
// after one can't promise a reroute on unfreeze either.
test('after_a_person_s_decision_a_block_waiting_on_a_frozen_grant_goes_back_to_the_inbox_without_a_promise', async () => {
  world = await startWorld({
    seedJson: grantsSeed(
      [{ id: TEST_GRANT, end: '2026-09-25' }, { id: SECOND_GRANT, title: 'Second test grant', end: '2028-06-30' }],
      { statusEvents: [canceledJune1(TEST_GRANT), canceledJune1(SECOND_GRANT)] },
    ),
  });
  const scientist = await world.person('scientist');
  const grantManager = await world.person('grant_manager');
  await scientist.call('submit_request', { ...gloves, item: 'Agar plates, 10 packs', price: 300 });
  await world.worker.idle();
  const id = newestRequest().id;
  await grantManager.call('decide_hold', { holdId: openPurchaseHolds(id)[0].id, choice: 'reject', reason: 'Not while both grants are canceled.' });
  await grantManager.call('advance_days', { days: 15 }); // the test grant is in its last 90 days
  await scientist.call('push_back', { requestId: id, message: 'Please look again.' });
  await world.worker.idle();
  assert.equal(request(id).state, 'waiting_on_manager');
  const [hold] = openPurchaseHolds(id);
  assert.match(hold.why, /already decided this request/);
  assert.match(hold.why, new RegExp(`takes a new request on ${SECOND_GRANT} once ${SECOND_GRANT} unfreezes`));
  assert.doesNotMatch(hold.why, /rerouted there once/);
  assert.doesNotMatch(hold.why, PROMISE);

  await grantManager.call('inject_status_event', { grantId: SECOND_GRANT, kind: 'court_order', source: 'Court notice', summary: 'A court restored the grant.' });
  await grantManager.call('inject_status_event', { grantId: SECOND_GRANT, kind: 'payment_received', source: 'Payment system', summary: 'Paid.', amount: 10_000 });
  await world.worker.idle();
  assert.equal(request(id).state, 'waiting_on_manager');
  assert.deepEqual(ordersFor(id), []);
});

test('a_rejected_request_stays_rejected_when_its_grant_unfreezes', async () => {
  world = await startWorld({ seedJson: oneGrantSeed() });
  const grantManager = await world.person('grant_manager');
  const scientist = await world.person('scientist');
  await freezeTestGrant(grantManager);
  await scientist.call('submit_request', gloves);
  await world.worker.idle();
  const id = newestRequest().id;
  await grantManager.call('decide_hold', { holdId: openPurchaseHolds(id)[0].id, choice: 'reject', reason: 'Use the stock in room 4.' });
  await payTestGrant(grantManager);
  await world.worker.idle();
  assert.equal(request(id).state, 'rejected');
  assert.equal(ordersFor(id).length, 0);

  // A push back after the decision goes back to the Inbox, never straight to a buy.
  await scientist.call('push_back', { requestId: id, message: 'The payment landed, please buy it now.' });
  await world.worker.idle();
  assert.equal(request(id).state, 'waiting_on_manager');
  assert.equal(openPurchaseHolds(id).length, 1);
  assert.equal(ordersFor(id).length, 0);
  assert.match(request(id).explanation, /already decided/);
});

// ── After a restart: only the rows are left ────────────────────────────────

test('a_restarted_worker_still_buys_a_request_naming_no_grant_that_waits_only_for_the_freeze', async () => {
  const restart = await startRestartable();
  const scientist = await world!.person('scientist');
  await scientist.call('submit_request', { item: 'Pipette tips, 20 racks', category: 'lab supplies', price: 380, purpose: 'Aim 1 binding assays', sharedWith: [] });
  await world!.worker.idle();
  const id = newestRequest().id;
  // Grant B is in its last 90 days, so grant A is the only one that can take it.
  assert.equal(request(id).state, 'waiting_on_manager');
  assert.equal(request(id).chargedGrantId, GRANT_A);
  assert.match(request(id).explanation, /will be bought automatically once R01GM061721 unfreezes/);

  await restart();
  await unfreezeGrantA(await world!.person('grant_manager'), ['pay', 'pick']);
  assert.equal(request(id).state, 'bought', 'as it is without the restart');
  assert.deepEqual(ordersFor(id).map((o) => [o.grantId, o.amount]), [[GRANT_A, 380]]);
});

test('after_a_restart_only_a_hold_that_promised_the_buy_is_bought_when_its_grant_unfreezes', async () => {
  const restart = await startRestartable(twoGrantSeed());
  const grantManager = await world!.person('grant_manager');
  const scientist = await world!.person('scientist');
  await freezeTestGrant(grantManager);
  await grantManager.call('inject_status_event', {
    grantId: SECOND_GRANT, kind: 'canceled', source: 'Cancellation list (Apify)', summary: 'Listed as terminated.',
  });
  // Both grants could take it once unfrozen: one request names a grant in its purpose, the other doesn't.
  const tips = { item: 'Pipette tips, 20 racks', category: 'lab supplies', price: 380, sharedWith: [] };
  await scientist.call('submit_request', { ...tips, purpose: `Binding assays for ${TEST_GRANT}` });
  await scientist.call('submit_request', { ...tips, purpose: 'General bench use' });
  await world!.worker.idle();
  const [named, unclear] = conn().rows('request').slice(-2).map((row) => row.id);
  for (const id of [named, unclear]) {
    assert.equal(request(id).state, 'waiting_on_manager', id);
    assert.equal(request(id).chargedGrantId, TEST_GRANT, id);
    assert.deepEqual(failedRules(request(id)), ['Grant is active and not frozen'], id);
  }
  assert.match(request(named).explanation, /will be bought automatically once R01TEST000001 unfreezes/);
  assert.match(request(unclear).explanation, /doesn't make clear which grant/);

  await restart();
  await payTestGrant(grantManager);
  await world!.worker.idle();
  assert.equal(request(named).state, 'bought');
  assert.equal(ordersFor(named).length, 1);
  assert.equal(request(unclear).state, 'waiting_on_manager', 'the grant manager decides, as before the restart');
  assert.equal(ordersFor(unclear).length, 0);
});

// The purchasing agent alone on its own connection, so a test can step in
// between the agent's last look and its buy.
async function startAlone(
  seedJson: string,
  wrap: (purchasing: Connection) => Connection = (purchasing) => purchasing,
  purposeClaude?: Parameters<typeof startPurchasing>[0]['purposeClaude'],
) {
  const db = await createLocalDb({ world: { seedJson } });
  const bookkeeping = await db.connect();
  await bookkeeping.call('register_agent', { role: 'bookkeeping' });
  const purchasing = await db.connect();
  await purchasing.call('register_agent', { role: 'purchasing' });
  const tracker = startTracker(bookkeeping, []);
  const agent = startPurchasing({ conn: wrap(purchasing), tracker, papers: createPaperLookup({ mode: 'offline', throttle: false }), purposeClaude });
  cleanup = () => {
    agent.stop();
    tracker.stop();
    db.close();
  };
  const person = async (role: 'grant_manager' | 'scientist') => {
    const c = await db.connect();
    await c.call('register_person', { role, name: role });
    return c;
  };
  async function idle() {
    for (let round = 0; round < 100; round++) {
      const before = db.version();
      await db.settled();
      await tracker.idle();
      await agent.idle();
      await db.settled();
      if (db.version() === before) return;
    }
    throw new Error('purchasing test: still busy after 100 rounds');
  }
  return { purchasing, person, idle };
}

test('a_buy_the_module_refuses_at_its_last_check_is_held_and_bought_once_the_grant_is_paid', async () => {
  let grantManager: Connection | undefined;
  let refusals = 0;
  const setup = await startAlone(oneGrantSeed(), (purchasing) => ({
    ...purchasing,
    // Right before the agent's buy reaches the module, the grant is canceled.
    async call<A extends ActionName>(action: A, args: Actions[A]) {
      const act = args as Actions['act_on_request'];
      if (action === 'act_on_request' && act.action === 'buy' && refusals === 0) {
        refusals++;
        await freezeTestGrant(grantManager!);
      }
      return purchasing.call(action, args);
    },
  }));
  grantManager = await setup.person('grant_manager');
  const scientist = await setup.person('scientist');
  await scientist.call('submit_request', gloves);
  await setup.idle();

  const row = setup.purchasing.rows('request').at(-1)!;
  assert.equal(refusals, 1);
  assert.equal(row.state, 'waiting_on_manager');
  assert.deepEqual(failedRules(row), ['Grant is active and not frozen']);
  assert.match(row.explanation, /The database refused to buy it at its last check \("Can't buy on R01TEST000001: Grant is active and not frozen/);
  assert.equal(openPurchaseHolds(row.id, setup.purchasing).length, 1);
  assert.equal(ordersFor(row.id, setup.purchasing).length, 0);

  await payTestGrant(grantManager);
  await setup.idle();
  assert.equal(setup.purchasing.rows('request').at(-1)!.state, 'bought');
  assert.equal(ordersFor(row.id, setup.purchasing).length, 1);
});

test('only_the_purchasing_agent_can_act_on_a_request', async () => {
  world = await startWorld({ seedJson: oneGrantSeed() });
  const scientist = await world.person('scientist');
  await scientist.call('submit_request', { ...gloves, item: 'Plate reader', category: 'equipment', price: 7_200 });
  await world.worker.idle();
  const id = newestRequest().id;
  await assert.rejects(
    world.worker.sessions.bookkeeping.call('act_on_request', { requestId: id, action: 'buy', vendor: 'V', explanation: 'x' }),
    /Only the purchasing agent/,
  );
  await assert.rejects(
    world.worker.sessions.purchasing.call('act_on_request', { requestId: id, action: 'buy', vendor: 'V', explanation: 'x' }),
    /Can't buy on R01TEST000001: Under the card limit/,
    'the module refuses an over-limit buy even from the purchasing agent',
  );
});

// ── The tricky parts, on their own ─────────────────────────────────────────

const v = (rule: string, pass: boolean, detail = ''): RuleVerdict => ({ rule, pass, detail });
const PASSING = [
  v('Grant is active and not frozen', true),
  v("Not in the grant's last 90 days", true),
  v('Enough truly available money', true),
  v('Category allowed', true),
  v('Under the card limit ($5,000)', true),
];
const failing = (...rules: string[]) => PASSING.map((x) => (rules.includes(x.rule) ? { ...x, pass: false } : x));

test('plan_for_puts_the_category_rule_first_and_the_freeze_last', () => {
  assert.deepEqual(planFor(PASSING), { action: 'buy' });
  assert.deepEqual(planFor(failing('Category allowed', 'Grant is active and not frozen')), { action: 'block', reason: 'category' });
  assert.deepEqual(planFor(failing('Under the card limit ($5,000)', 'Grant is active and not frozen')), { action: 'hold', reason: 'card_limit' });
  assert.deepEqual(planFor(failing('Grant is active and not frozen')), { action: 'hold', reason: 'freeze' });
  assert.deepEqual(planFor(failing('Grant is active and not frozen'), () => true), { action: 'try_reroute' }, 'an ended grant never unfreezes');
  assert.deepEqual(planFor(failing("Not in the grant's last 90 days")), { action: 'try_reroute' });
  assert.deepEqual(planFor(failing('Enough truly available money', 'Grant is active and not frozen')), { action: 'try_reroute' });
  assert.deepEqual(planFor([...PASSING, v('A rule nobody told the agent about', false)]), { action: 'hold', reason: 'unplaced' });
  assert.deepEqual(planFor([]), { action: 'hold', reason: 'unplaced' }, 'no verdicts is never a buy');
});

const grantRow = (id: string, extra: Partial<GrantRow> = {}): GrantRow => ({
  id, title: `Grant ${id}`, pi: 'Test PI', agency: 'NIGMS', awarded: 400_000, received: 100_000, spent: 50_000, promised: 0,
  available: 350_000, start: '2025-01-01', end: '2028-06-30', status: 'active', frozen: false, ...extra,
});
const requestRow = (extra: Partial<RequestRow> = {}): RequestRow => ({
  id: 'rq-1', day: '2026-06-15', requester: 'scientist', item: 'Pipette tips, 20 racks', category: 'lab supplies', price: 380,
  sharedWith: [], split: [], purpose: 'Bench use', state: 'submitted', verdicts: [], explanation: '', requesterName: '', oneGrantBasis: '', ...extra,
});

test('the_fallback_reading_takes_the_only_grant_that_can_pay_and_calls_two_unclear', async () => {
  const rules = await loadRules();
  const frozen = grantRow('G-A', { frozen: true, status: 'canceled', frozenReason: 'Canceled.' });
  const open = grantRow('G-B');
  assert.deepEqual(
    [readFallback(requestRow(), [frozen, open], rules, '2026-06-15')].map((r) => [r.grantId, r.grantIsClear]),
    [['G-B', true]],
  );
  const two = readFallback(requestRow(), [grantRow('G-A'), grantRow('G-B')], rules, '2026-06-15');
  assert.equal(two.grantIsClear, false);
});

const answer = (extra: Partial<Parameters<typeof sanitizeRead>[0]> = {}) => ({ grantId: 'G-B', grantIsClear: true, note: '', ...extra });

test('sanitize_read_keeps_the_scientist_s_grant_and_drops_ids_outside_the_lab', () => {
  const grants = [grantRow('G-A'), grantRow('G-B')];
  const fallback = answer({ grantId: 'G-A', grantIsClear: false });
  const asked = sanitizeRead(answer({ grantId: 'G-B' }), requestRow({ grantId: 'G-A' }), grants, fallback);
  assert.deepEqual([asked.grantId, asked.grantIsClear], ['G-A', true]);
  const outside = sanitizeRead(answer({ grantId: 'R01-NOT-OURS' }), requestRow(), grants, fallback);
  assert.deepEqual([outside.grantId, outside.grantIsClear], ['G-A', false]);
});

test('explanation_or_uses_the_template_when_claude_returns_nothing', () => {
  const facts = {
    request: { id: 'rq-1', item: 'Pipette tips', category: 'lab supplies', price: 380, purpose: 'Bench use' },
    action: 'hold' as const, grantId: 'G-A', passed: [],
    failed: [{ rule: 'Under the card limit ($5,000)', detail: '$7,200 is over the limit.' }], next: 'The grant manager decides.',
  };
  assert.match(explanationOr('  ', facts), /^Held Pipette tips \(\$380\) on G-A .*Under the card limit \(\$5,000\): \$7,200 is over the limit/);
  assert.equal(explanationOr('Held for the card limit.', facts), 'Held for the card limit.');
});

test('finish_explanation_names_a_rule_claude_left_out', () => {
  const failed = [v('Under the card limit ($5,000)', false)];
  assert.equal(finishExplanation('Held: it costs too much.', failed), 'Held: it costs too much. Rule: Under the card limit ($5,000).');
  assert.equal(finishExplanation('Held: Under the card limit ($5,000) fails.', failed), 'Held: Under the card limit ($5,000) fails.');
  assert.ok(finishExplanation('x'.repeat(2_000), []).length <= 1_000);
});

// T99: the Live Tester's two repeats, on the gloves and the NovaSeq lane.
test('a_freeze_promise_claude_already_made_in_its_own_words_is_said_once', () => {
  const step = 'Every other rule passes, so it will be bought automatically once R01GM061721 unfreezes.';
  const frozen = ['R01GM061721'];
  const why = 'It failed the rule "Grant is active and not frozen" on grant R01GM061721: the grant was canceled 2026-03-10, a court restored it on 2026-04-20, but no payment has arrived since, so spending stays frozen.';
  const repros = [
    `${why} All other rules passed, and the purchase will be made automatically once R01GM061721 unfreezes.`,
    `${why} All other rules passed, including enough truly available money, category allowed, and the $5,000 card limit, so the purchase will be made automatically once R01GM061721 unfreezes.`,
  ];
  for (const text of repros) {
    const out = withFreezePromise(text, frozen, step, step);
    assert.equal(out.split('unfreezes').length - 1, 1, out);
    assert.equal(out, `${why} ${step}`);
    assert.match(out, /will be bought automatically once R01GM061721 unfreezes/, 'the promise the agent reads back to keep');
  }
});

test('a_freeze_promise_claude_left_out_or_made_for_another_grant_is_added', () => {
  const step = 'Every other rule passes, so it will be bought automatically once R01GM061721 unfreezes.';
  const frozen = ['R01GM061721'];
  const exact = 'Held on R01GM061721 for its freeze. All other rules passed, so the order will be bought automatically once R01GM061721 unfreezes.';
  assert.equal(withFreezePromise(exact, frozen, step, step), exact);
  assert.equal(withFreezePromise('Held on R01GM061721 for its freeze.', frozen, step, step), `Held on R01GM061721 for its freeze. ${step}`);
  const other = 'Held on R01GM061721. R21AI182745 could take it automatically once R21AI182745 unfreezes.';
  assert.equal(withFreezePromise(other, frozen, step, step), `${other} ${step}`);
  const asks = 'Held on R01GM061721. Once R01GM061721 unfreezes, the grant manager decides whether to buy it.';
  assert.equal(withFreezePromise(asks, frozen, step, step), `${asks} ${step}`);
});

test('vendor_for_reuses_the_lab_s_vendor_for_the_same_item', () => {
  const past = [requestRow({ id: 'rq-old', item: 'Nitrile gloves, 10 cases' }), requestRow({ id: 'rq-kit', item: 'Detergent screening kit, 2 plates', category: 'reagents' })];
  const orders: OrderRow[] = [
    { id: 'o-1', requestId: 'rq-old', grantId: 'G-A', vendor: 'LabSource', amount: 640, placed: '2025-01-14', state: 'paid' },
    { id: 'o-2', requestId: 'rq-kit', grantId: 'G-A', vendor: 'MembraneChem', amount: 2300, placed: '2026-02-17', state: 'paid' },
  ];
  assert.equal(vendorFor(requestRow({ item: 'Nitrile gloves, 4 cases' }), past, orders), 'LabSource');
  assert.equal(vendorFor(requestRow({ item: 'Membrane protein detergent screening kit, 4 plates', category: 'reagents' }), past, orders), 'MembraneChem');
  assert.equal(vendorFor(requestRow({ item: 'Peristaltic pump', category: 'equipment' }), past, orders), DEFAULT_VENDOR);
});

// A saved list pricing rq-101's gloves and rq-102's agar plates far below what
// was asked: both are bought by the agent alone once grant A is paid (one
// after its freeze, one rerouted), so both get the price check.
function overpricedList(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gg-prices-'));
  const path = join(dir, 'prices.json');
  const entry = (item: string, listPrice: number) => ({
    item, category: 'lab supplies', found: true, vendor: 'Example Lab Supply', product: item, listPrice, sameQuantity: true,
    url: 'https://example.test/item', checkedOn: '2026-10-24', by: 'claude-haiku-5-5',
  });
  writeFileSync(path, JSON.stringify([entry('Nitrile gloves, 10 cases', 200), entry('Agar plates, 40 packs', 300)]));
  const before = process.env.GG_PRICE_CATALOG;
  process.env.GG_PRICE_CATALOG = path;
  cleanup = () => {
    if (before === undefined) delete process.env.GG_PRICE_CATALOG;
    else process.env.GG_PRICE_CATALOG = before;
    rmSync(dir, { recursive: true, force: true });
  };
  return path;
}

test('an_overpriced_request_held_for_the_freeze_or_rerouted_is_held_for_its_price_instead_of_bought', async () => {
  overpricedList();
  const catchUp = await startSim();
  await payGrantA(catchUp);
  for (const id of ['rq-101', 'rq-102']) {
    assert.equal(request(id).state, 'waiting_on_manager', id);
    assert.equal(ordersFor(id).length, 0, id);
    assert.match(openPurchaseHolds(id)[0]?.why ?? '', /more than twice the list price/, id);
  }
  assert.equal(request('rq-106').state, 'bought');
});

// T86: Claude's light look before the agent buys alone, with a fake Claude
// that answers the purpose check and nothing else (every other question is off).
type PurposeRun = (scientist: Connection, idle: () => Promise<void>, lab: Connection) => Promise<void>;
const withPurposeAnswer = (answer: Record<string, unknown>, run: PurposeRun) =>
  withPurposeClient({ messages: { parse: async () => ({ model: 'claude-haiku-5-5', stop_reason: 'end_turn', parsed_output: answer }) } }, run);
async function withPurposeClient(client: { messages: { parse: (request: { max_tokens: number; messages: { content: string }[] }) => Promise<unknown> } }, run: PurposeRun) {
  const key = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const cacheDir = mkdtempSync(join(tmpdir(), 'gg-purpose-'));
  try {
    const setup = await startAlone(oneGrantSeed(), undefined, { client, mode: 'live', cacheDir });
    await run(await setup.person('scientist'), setup.idle, setup.purchasing);
  } finally {
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = key;
    rmSync(cacheDir, { recursive: true, force: true });
  }
}
const fits = { purpose: 'fine', purposeWhy: '', price: 'fine', priceWhy: '', categoryFits: true, categoryWhy: '' };

test('a_request_claude_finds_plainly_not_for_research_is_held_instead_of_bought', () =>
  withPurposeAnswer({ ...fits, purpose: 'flag', purposeWhy: 'A birthday cake is a party cost.', betterCategory: 'food' }, async (scientist, idle, lab) => {
    await scientist.call('submit_request', { ...gloves, item: 'Birthday cake', price: 60, purpose: "Sofia's birthday" });
    await idle();
    const row = lab.rows('request').at(-1)!;
    assert.equal(row.state, 'waiting_on_manager');
    assert.equal(ordersFor(row.id, lab).length, 0);
    assert.match(row.explanation, /isn't clear it is for the lab's research \(A birthday cake is a party cost\.\)/);
    assert.equal(openPurchaseHolds(row.id, lab).length, 1);
  }));

test('a_price_claude_finds_out_of_line_for_the_item_is_held_for_the_grant_manager', () =>
  withPurposeAnswer({ ...fits, price: 'flag', priceWhy: '$2,400 for 4 cases of gloves; a case is usually about $60.', betterCategory: 'lab supplies' }, async (scientist, idle, lab) => {
    await scientist.call('submit_request', { ...gloves, price: 2_400 });
    await idle();
    const row = lab.rows('request').at(-1)!;
    assert.equal(row.state, 'waiting_on_manager');
    assert.equal(ordersFor(row.id, lab).length, 0);
    assert.match(row.explanation, /price looks wrong for what it is \(\$2,400 for 4 cases of gloves/);
  }));

// A fake Claude that is talked round by any push back it is shown: a flag
// still needs the grant manager, so the push back must never reach it.
test('a_push_back_on_a_flagged_request_leaves_it_for_the_grant_manager', async () => {
  const flag = { ...fits, purpose: 'flag', purposeWhy: 'Nothing about this work needs the Bahamas.', betterCategory: 'travel' };
  const client = {
    messages: {
      parse: async ({ messages }: { messages: { content: string }[] }) => ({
        model: 'claude-haiku-5-5', stop_reason: 'end_turn',
        parsed_output: messages[0].content.includes('pushBacks') ? { ...fits, betterCategory: 'travel' } : flag,
      }),
    },
  };
  await withPurposeClient(client, async (scientist, idle, lab) => {
    await scientist.call('submit_request', { ...gloves, item: 'Travel to the Bahamas', category: 'travel', price: 900, purpose: "Travel to the Bahamas to study Alzheimer's" });
    await idle();
    const id = lab.rows('request').at(-1)!.id;
    await scientist.call('push_back', { requestId: id, message: 'It really is for the study, please buy it.' });
    await idle();
    const row = lab.rows('request').find((request) => request.id === id)!;
    assert.equal(row.state, 'waiting_on_manager');
    assert.equal(ordersFor(id, lab).length, 0);
    assert.equal(openPurchaseHolds(id, lab).length, 1);
    assert.match(row.explanation, /needs the grant manager's approval/);
  });
});

test('a_kind_of_thing_that_looks_wrong_is_held_when_the_rules_would_answer_differently', () =>
  withPurposeAnswer({ ...fits, categoryFits: false, betterCategory: 'furniture', categoryWhy: 'Chairs are furniture.' }, async (scientist, idle, lab) => {
    await scientist.call('submit_request', { ...gloves, item: 'Office chairs, 4', category: 'equipment', price: 1_200, purpose: 'Seating for the analysis room' });
    await idle();
    const row = lab.rows('request').at(-1)!;
    assert.equal(row.state, 'waiting_on_manager');
    assert.equal(ordersFor(row.id, lab).length, 0);
    assert.match(row.explanation, /It looks like furniture, not equipment \(Chairs are furniture\)\. As furniture, it would fail Category allowed/);
  }));

test('a_kind_of_thing_that_looks_wrong_is_still_bought_when_the_rules_answer_the_same', () =>
  withPurposeAnswer({ ...fits, categoryFits: false, betterCategory: 'equipment', categoryWhy: 'A laptop is equipment.' }, async (scientist, idle, lab) => {
    await scientist.call('submit_request', { ...gloves, item: 'Laptop for image analysis', category: 'reagents', price: 1_400, purpose: 'Analyzing the imaging runs' });
    await idle();
    const row = lab.rows('request').at(-1)!;
    assert.equal(row.state, 'bought');
    assert.equal(purchaseHolds(row.id, lab).length, 0);
  }));

// T99: live, Haiku used up to ~600 output tokens on a borderline purpose (it
// thinks first). At 400 it was cut off, the check fell back to 'fine', and a
// Peloton for "my own cognition" was bought with no hold.
test('a_borderline_purpose_check_has_room_to_finish_so_its_flag_still_holds_the_request', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const flag = { ...fits, purpose: 'flag', purposeWhy: 'A personal exercise bike for a self-study is not this grant\'s research.', betterCategory: 'equipment' };
  const sent: number[] = [];
  const client = {
    messages: {
      parse: async ({ max_tokens }: { max_tokens: number }) => {
        sent.push(max_tokens);
        return max_tokens < 600
          ? { model: 'claude-haiku-5-5', stop_reason: 'max_tokens', parsed_output: null }
          : { model: 'claude-haiku-5-5', stop_reason: 'end_turn', parsed_output: flag };
      },
    },
  };
  await withPurposeClient(client, async (scientist, idle, lab) => {
    await scientist.call('submit_request', {
      ...gloves, item: 'Peloton bike', category: 'equipment', price: 2_200,
      purpose: 'Aim 2: measure the effect of exercise on my own cognition as a pilot n=1 study',
    });
    await idle();
    const row = lab.rows('request').at(-1)!;
    assert.ok(sent.length > 0, 'the purpose check asked Claude');
    assert.equal(row.state, 'waiting_on_manager');
    assert.equal(ordersFor(row.id, lab).length, 0);
    assert.match(row.explanation, /isn't clear it is for the lab's research \(A personal exercise bike/);
  });
  assert.ok(!warn.mock.calls.some((call) => /cut off/.test(String(call.arguments[0]))), 'no answer was cut off');
});
