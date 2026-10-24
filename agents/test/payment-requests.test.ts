import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';

import type { Tracker } from '../src/agents/bookkeeping.ts';
import {
  answerProblems,
  claimFor,
  explanationProblems,
  lastFullMonth,
  mentionedIds,
  money,
  requestClaim,
  startPaymentRequests,
  templateExplanation,
} from '../src/agents/payment-requests.ts';
import type { AgentHandle } from '../src/agents/types.ts';
import type { ActionName, Actions, Connection, Db, PaymentRequestRow, PersonRole } from '../src/db/contract.ts';
import { createLocalDb } from '../src/db/local.ts';
import { createPaperLookup } from '../src/sources/papers.ts';
import { oneGrantSeed, startWorld, TEST_GRANT, type TestWorld } from './helpers.ts';

const R21 = 'R21AI000002';
const R01 = 'R01GM000001';
const MAY = { from: '2026-05-01', to: '2026-05-31' };

let world: TestWorld | undefined;
let alone: Alone | undefined;
afterEach(() => {
  world?.stop();
  world = undefined;
  alone?.stop();
  alone = undefined;
});

const requestsFor = (conn: Connection, grantId: string, period = MAY) =>
  conn.rows('paymentRequest').filter((pr) => pr.grantId === grantId && pr.from === period.from && pr.to === period.to);
const sorted = (ids: string[]) => [...ids].sort();
const openHolds = (conn: Connection, kind: string, refId: string) =>
  conn.rows('hold').filter((hold) => hold.open && hold.kind === kind && hold.refId === refId);
// The explanation's two parts: what is claimed, then what was left out.
const parts = (pr: PaymentRequestRow) => {
  const at = pr.explanation.indexOf('Left out');
  return at < 0 ? { claimed: pr.explanation, leftOut: '' } : { claimed: pr.explanation.slice(0, at), leftOut: pr.explanation.slice(at) };
};
// Names the seed holds (PIs, payroll, requesters): none may reach text the agent writes.
const personNames = (conn: Connection) => [
  ...conn.rows('grant').map((grant) => grant.pi),
  ...conn.rows('payroll').map((row) => row.person),
  ...conn.rows('request').map((request) => request.requester),
].filter((name) => name.trim().length > 3);

// ── The payment request writer alone on the real module ───────────────────
// For tests that need to step in between the agent's moves (a fake tracker,
// a race, the wrong identity) without the other agents acting too.

interface Alone {
  db: Db;
  conn: Connection;
  calls: { action: ActionName; args: Record<string, unknown> }[];
  person(role: PersonRole): Promise<Connection>;
  quiet(): Promise<void>;
  stop(): void;
}

const noTracker: Tracker = { refresh: async () => {}, idle: async () => {}, stop() {} };

async function startAlone({
  seedJson,
  role = 'payment_report',
  tracker = noTracker,
  beforeCall,
}: {
  seedJson?: string;
  role?: 'payment_report' | 'bookkeeping';
  tracker?: Tracker | ((lab: Connection) => Tracker);
  beforeCall?: (action: ActionName, lab: Connection) => Promise<void>;
} = {}): Promise<Alone> {
  const db = await createLocalDb({ world: seedJson ? { seedJson } : 'sim' });
  const raw = await db.connect();
  await raw.call('register_agent', { role });
  const lab = await db.connect();
  await lab.call('register_person', { role: 'grant_manager', name: 'grant_manager' });
  const calls: Alone['calls'] = [];
  // The agent's connection, with every action it sends recorded.
  const conn: Connection = {
    identity: raw.identity,
    token: raw.token,
    async call<A extends ActionName>(action: A, args: Actions[A]) {
      calls.push({ action, args: args as Record<string, unknown> });
      await beforeCall?.(action, lab);
      return raw.call(action, args);
    },
    rows: raw.rows.bind(raw),
    today: raw.today.bind(raw),
    onInsert: raw.onInsert.bind(raw),
    onUpdate: raw.onUpdate.bind(raw),
    onDelete: raw.onDelete.bind(raw),
    disconnect: raw.disconnect.bind(raw),
  };
  const agent: AgentHandle = startPaymentRequests({
    conn,
    tracker: typeof tracker === 'function' ? tracker(lab) : tracker,
    papers: createPaperLookup({ mode: 'offline', throttle: false }),
  });
  const quiet = async () => {
    for (let round = 0; round < 50; round++) {
      const before = db.version();
      await db.settled();
      await agent.idle();
      await db.settled();
      if (db.version() === before) return;
    }
    throw new Error('payment request writer still busy after 50 rounds');
  };
  await quiet();
  return {
    db,
    conn,
    calls,
    async person(personRole) {
      const person = await db.connect();
      await person.call('register_person', { role: personRole, name: personRole });
      return person;
    },
    quiet,
    stop() {
      agent.stop();
      db.close();
    },
  };
}

// ── The sim world, all agents running ─────────────────────────────────────

test('pr_1_the_may_request_for_r21_leaves_held_rq_037_out', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.payment_report;
  const may = requestsFor(conn, R21);
  assert.equal(may.length, 1, 'one May request for R21AI000002');
  const [pr] = may;
  assert.ok(pr.excluded.some((e) => e.requestId === 'rq-037'), 'rq-037 is in excluded');
  assert.ok(!pr.includedRequestIds.includes('rq-037'), 'rq-037 is not in includedRequestIds');
  assert.match(pr.excluded.find((e) => e.requestId === 'rq-037')!.why, /inv-037 is on hold/);
  // The module's picks and amount, read back from its row.
  assert.deepEqual(sorted(pr.includedRequestIds), ['rq-036', 'rq-038']);
  assert.deepEqual(sorted(pr.includedPayrollIds), ['pay-R21-2026-05-1', 'pay-R21-2026-05-2']);
  assert.equal(pr.amount, 7_060);
  assert.equal(pr.state, 'waiting_on_manager');
  assert.equal(openHolds(conn, 'payment_request', pr.id).length, 1, 'the grant manager decides it in the Inbox');
  assert.deepEqual(requestsFor(conn, R01), [], 'the frozen grant asks for nothing');
});

// The live demo's Test lab loads a world while the agents run. Rows the new
// world brings back unchanged send nothing, so a month whose request went
// away must still be claimed again.
const SIM_SEED = readFileSync(new URL('../../sim/seed.json', import.meta.url), 'utf8');

test('loading_the_sim_world_over_the_fixtures_drafts_its_may_request', async () => {
  // The fixtures already claim R21AI000002's May (pr1); the sim world doesn't.
  world = await startWorld({ fixtures: true });
  const lab = await world.person('grant_manager');
  await lab.call('load_seed', { json: SIM_SEED });
  await world.worker.idle();
  const may = requestsFor(world.worker.sessions.payment_report, R21);
  assert.equal(may.length, 1, 'one May request for R21AI000002');
  assert.ok(may[0].excluded.some((e) => e.requestId === 'rq-037'), 'rq-037 is still left out');
  assert.equal(may[0].amount, 7_060);
});

test('reloading_the_sim_world_drafts_its_may_request_again', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.payment_report;
  assert.equal(requestsFor(conn, R21).length, 1);
  const lab = await world.person('grant_manager');
  await lab.call('load_seed', { json: SIM_SEED });
  await world.worker.idle();
  const may = requestsFor(conn, R21);
  assert.equal(may.length, 1, 'the reload removed the first draft, and May was drafted again');
  assert.equal(may[0].amount, 7_060);
  assert.equal(openHolds(conn, 'payment_request', may[0].id).length, 1, 'waiting in the Inbox again');
});

test('the_explanation_fits_the_limit_and_claims_only_included_purchases', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.payment_report;
  const [pr] = requestsFor(conn, R21);
  assert.ok(pr.explanation.length <= 1_000, `${pr.explanation.length} characters`);
  const { claimed, leftOut } = parts(pr);
  assert.ok(claimed.includes('$7,060'), 'states the module\'s total exactly');
  for (const id of mentionedIds(claimed).filter((id) => id.startsWith('rq'))) {
    assert.ok(pr.includedRequestIds.includes(id), `${id} is claimed in the text but not included`);
  }
  assert.ok(!claimed.includes('rq-037'), 'the held purchase is not claimed');
  assert.ok(leftOut.includes('rq-037'), 'the held purchase is named as left out');
  assert.match(leftOut, /Held spending is left out/, 'cites the rule the module applied');
  assert.match(leftOut, /\$2,920/, 'with the exact amounts from the mismatch');
  for (const name of personNames(conn)) assert.ok(!pr.explanation.includes(name), `no person names (${name})`);

  // The deterministic template passes the same check Claude's text must pass.
  const claim = claimFor(conn, R21, MAY)!;
  assert.deepEqual(explanationProblems(templateExplanation(claim), claim), []);
});

test('the_seeded_follow_up_gets_an_answer_naming_only_its_requests_purchases', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.payment_report;
  const fu = conn.rows('followUp').find((row) => row.id === 'fu-001')!;
  const pr = conn.rows('paymentRequest').find((row) => row.id === fu.paymentRequestId)!;
  assert.equal(fu.state, 'waiting_on_manager');
  assert.ok(fu.answerDraft, 'the answer is drafted');
  const allowed = new Set([pr.id, fu.id, ...pr.includedRequestIds, ...pr.includedPayrollIds]);
  for (const id of mentionedIds(fu.answerDraft!)) assert.ok(allowed.has(id), `${id} is not in ${pr.id}`);
  for (const id of pr.includedRequestIds) assert.ok(fu.answerDraft!.includes(id), `itemizes ${id}`);
  for (const id of pr.excluded.map((e) => e.requestId)) assert.ok(!fu.answerDraft!.includes(id), `${id} was left out, not claimed`);
  // Vendors, dates and amounts, exactly as the records hold them.
  assert.match(fu.answerDraft!, /MicroMedia, ordered 2026-04-14, \$1,180/);
  assert.match(fu.answerDraft!, /ordered before the project end date \(2026-08-01\)/);
  assert.ok(fu.answerDraft!.includes(money(pr.amount)));
  for (const name of personNames(conn)) assert.ok(!fu.answerDraft!.includes(name), `no person names (${name})`);
  assert.equal(openHolds(conn, 'follow_up', fu.id).length, 1, 'the answer waits for the grant manager');
});

test('a_second_idle_drafts_nothing_new', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.payment_report;
  const before = { version: world.db.version(), requests: conn.rows('paymentRequest').length, holds: conn.rows('hold').length };
  await world.worker.idle();
  assert.equal(world.db.version(), before.version, 'not one change');
  assert.equal(conn.rows('paymentRequest').length, before.requests);
  assert.equal(conn.rows('hold').length, before.holds);
});

test('a_funders_new_question_is_answered_within_one_idle', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.payment_report;
  const [pr] = requestsFor(conn, R21);
  const manager = await world.person('grant_manager');
  const [hold] = openHolds(conn, 'payment_request', pr.id);
  await manager.call('decide_hold', { holdId: hold.id, choice: 'approve', reason: 'Matches the May ledger.' });
  await world.worker.idle();
  assert.equal(conn.rows('paymentRequest').find((row) => row.id === pr.id)!.state, 'sent');

  const funder = await world.person('funder');
  await funder.call('ask_follow_up', {
    paymentRequestId: pr.id,
    question: 'Please itemize the equipment service and sequencing costs in this request with vendors and dates.',
  });
  await world.worker.idle();
  const fu = conn.rows('followUp').find((row) => row.paymentRequestId === pr.id)!;
  assert.equal(fu.state, 'waiting_on_manager');
  const answer = fu.answerDraft!;
  const allowed = new Set([pr.id, fu.id, ...pr.includedRequestIds, ...pr.includedPayrollIds]);
  for (const id of mentionedIds(answer)) assert.ok(allowed.has(id), `${id} is not in ${pr.id}`);
  assert.match(answer, /rq-038 Genomics core: sequencing run for 24 isolates \(core facility services, Campus Genomics Core, ordered 2026-05-20, \$640/);
  assert.match(answer, /rq-036 .*\$1,290, changed from \$1,150/);
  assert.ok(!answer.includes('rq-037'), 'the held purchase was never claimed');
  assert.ok(answer.includes('$7,060'));
  assert.equal(openHolds(conn, 'follow_up', fu.id).length, 1);
  assert.deepEqual(requestsFor(conn, R21).map((row) => row.id), [pr.id], 'no new draft');
});

test('a_rejected_draft_and_a_rejected_answer_are_not_redrafted', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.payment_report;
  const manager = await world.person('grant_manager');
  const [pr] = requestsFor(conn, R21);
  const [prHold] = openHolds(conn, 'payment_request', pr.id);
  const [fuHold] = openHolds(conn, 'follow_up', 'fu-001');
  await manager.call('decide_hold', { holdId: prHold.id, choice: 'reject', reason: 'Hold the May request for now.' });
  await manager.call('decide_hold', { holdId: fuHold.id, choice: 'reject', reason: 'I will answer this one myself.' });
  const answer = conn.rows('followUp').find((row) => row.id === 'fu-001')!.answerDraft;
  await world.worker.idle();
  assert.deepEqual(requestsFor(conn, R21).map((row) => [row.id, row.state]), [[pr.id, 'drafted']], 'the person decided; no second request');
  const fu = conn.rows('followUp').find((row) => row.id === 'fu-001')!;
  assert.equal(fu.state, 'drafted');
  assert.equal(fu.answerDraft, answer, 'the rejected answer is left as the person left it');
  assert.equal(openHolds(conn, 'follow_up', 'fu-001').length, 0);
});

// ── Freezes and the last refresh ──────────────────────────────────────────

// One grant with May spending: a purchase and a payroll row (placeholder labels, no names).
function maySpending(extra: Record<string, unknown[]> = {}) {
  return {
    requests: [
      { id: 'rq-901', day: '2026-05-04', requester: 'scientist', item: 'Pipette tips, 10 racks', category: 'lab supplies', price: 420, grantId: TEST_GRANT, purpose: 'Aim 1 binding assays', state: 'bought' },
    ],
    orders: [{ id: 'o-901', requestId: 'rq-901', grantId: TEST_GRANT, vendor: 'Example Supply', amount: 420, placed: '2026-05-05', state: 'open' }],
    payroll: [
      { id: 'pay-T-2026-05-1', grantId: TEST_GRANT, person: 'staff-1', role: 'Research technician', period: { from: '2026-05-01', to: '2026-05-31' }, effortPct: 25, amount: 1_200 },
    ],
    ...extra,
  };
}

test('a_frozen_grant_gets_no_request_until_a_payment_unfreezes_it', async () => {
  const canceled = { grantId: TEST_GRANT, day: '2026-06-02', kind: 'canceled', source: 'Cancellation list (Apify)', summary: 'Listed as terminated.' };
  alone = await startAlone({ seedJson: oneGrantSeed(maySpending({ statusEvents: [canceled] })) });
  const { conn } = alone;
  assert.equal(conn.rows('grant')[0].frozen, true);
  assert.deepEqual(requestsFor(conn, TEST_GRANT), [], 'frozen spending is not claimed');
  assert.ok(!alone.calls.some((call) => call.action === 'draft_payment_request'), 'not even tried');

  const lab = await alone.person('grant_manager');
  await lab.call('inject_status_event', { grantId: TEST_GRANT, kind: 'payment_received', source: 'Payment system', summary: 'Drawdown paid.', amount: 5_000 });
  await alone.quiet();
  assert.equal(conn.rows('grant')[0].frozen, false);
  const [pr] = requestsFor(conn, TEST_GRANT);
  assert.deepEqual(pr.includedRequestIds, ['rq-901']);
  assert.deepEqual(pr.includedPayrollIds, ['pay-T-2026-05-1']);
  assert.equal(pr.amount, 1_620);
  assert.ok(pr.explanation.includes('$1,620'));
});

test('the_tracker_refreshes_the_grant_right_before_the_draft', async () => {
  const events: string[] = [];
  alone = await startAlone({
    tracker: { refresh: async (grantId) => void events.push(`refresh ${grantId}`), idle: async () => {}, stop() {} },
    beforeCall: async (action) => void events.push(action),
  });
  const draftAt = events.indexOf('draft_payment_request');
  assert.ok(draftAt > 0, 'a request was drafted');
  assert.equal(events[draftAt - 1], `refresh ${R21}`, 'the last thing before the draft is a refresh of that grant');
});

test('a_cancellation_found_by_the_last_refresh_stops_the_draft', async () => {
  let refreshes = 0;
  // The refresh right before the draft finds the grant canceled (as the fund tracker would post it).
  const tracker = (lab: Connection): Tracker => ({
    async refresh(grantId) {
      if (grantId === R21 && refreshes++ === 0) {
        await lab.call('inject_status_event', { grantId: R21, kind: 'canceled', source: 'Cancellation list (Apify)', summary: 'Listed as terminated.' });
      }
    },
    idle: async () => {},
    stop() {},
  });
  alone = await startAlone({ tracker });
  const { conn } = alone;
  assert.equal(conn.rows('grant').find((g) => g.id === R21)!.frozen, true);
  assert.deepEqual(requestsFor(conn, R21), [], 'no money asked for on a grant that was just canceled');

  // The money arrives a few days later: now it goes out.
  const lab = await alone.person('grant_manager');
  await lab.call('advance_days', { days: 3 });
  await lab.call('inject_status_event', { grantId: R21, kind: 'payment_received', source: 'Payment system', summary: 'Drawdown paid.', amount: 7_000 });
  await alone.quiet();
  assert.equal(conn.rows('grant').find((g) => g.id === R21)!.frozen, false);
  assert.equal(requestsFor(conn, R21).length, 1);
});

// ── Invoices nobody has checked, and the module picking differently ──────

test('a_new_held_invoice_nobody_has_checked_holds_the_draft_until_it_is_checked', async () => {
  const seed = JSON.parse(
    oneGrantSeed(
      maySpending({
        requests: [
          { id: 'rq-911', day: '2026-05-08', requester: 'scientist', item: 'Centrifuge rotor service', category: 'equipment service', price: 800, grantId: TEST_GRANT, purpose: 'Aim 2 sample prep', state: 'bought' },
          { id: 'rq-912', day: '2026-05-09', requester: 'scientist', item: 'Primer set, 96 wells', category: 'reagents', price: 600, grantId: TEST_GRANT, purpose: 'Aim 1 cloning', state: 'bought' },
        ],
        orders: [
          { id: 'o-911', requestId: 'rq-911', grantId: TEST_GRANT, vendor: 'Spin Service Co', amount: 800, placed: '2026-05-10', state: 'open' },
          { id: 'o-912', requestId: 'rq-912', grantId: TEST_GRANT, vendor: 'Oligo Works', amount: 600, placed: '2026-05-11', state: 'open' },
        ],
      }),
    ),
  );
  seed.today = '2026-05-20';
  alone = await startAlone({ seedJson: JSON.stringify(seed) });
  const { conn, db } = alone;
  const lab = await alone.person('grant_manager');
  await lab.call('inject_invoice', { orderId: 'o-911', amount: 800 });
  await lab.call('inject_invoice', { orderId: 'o-912', amount: 950 });
  await lab.call('advance_days', { days: 12 });
  await alone.quiet();
  assert.equal(conn.today(), '2026-06-01');
  assert.deepEqual(requestsFor(conn, TEST_GRANT), [], 'waits: the invoices are new, not yet checked');

  // The bookkeeping agent's invoice check (T12), done here by hand.
  const books = await db.connect();
  await books.call('register_agent', { role: 'bookkeeping' });
  const invoiceOf = (orderId: string) => conn.rows('invoice').find((invoice) => invoice.orderId === orderId)!;
  await books.call('check_invoice', { invoiceId: invoiceOf('o-911').id });
  await alone.quiet();
  assert.deepEqual(requestsFor(conn, TEST_GRANT), [], 'still waits for the second invoice');
  await books.call('check_invoice', { invoiceId: invoiceOf('o-912').id });
  await alone.quiet();
  assert.equal(invoiceOf('o-912').state, 'held');

  const [pr] = requestsFor(conn, TEST_GRANT);
  assert.deepEqual(pr.includedRequestIds, ['rq-911']);
  assert.deepEqual(pr.excluded.map((e) => e.requestId), ['rq-912']);
  assert.equal(pr.amount, 800 + 1_200);
  assert.match(parts(pr).leftOut, /rq-912 Primer set, 96 wells \(\$600\): invoice inv-?\d+ is on hold \(Invoice is \$950 but the approved amount is \$600\)/);
  assert.equal(alone.calls.filter((call) => call.action === 'draft_payment_request').length, 1);
});

test('when_the_module_picks_differently_its_lists_win_and_the_first_draft_is_flagged', async () => {
  let raced = false;
  // A person cancels o-038 between the agent's last look and the module's pick.
  alone = await startAlone({
    beforeCall: async (action, lab) => {
      if (action !== 'draft_payment_request' || raced) return;
      raced = true;
      await lab.call('cancel_order', { orderId: 'o-038' });
    },
  });
  const { conn } = alone;
  const [first, second] = requestsFor(conn, R21);
  assert.ok(first && second, 'drafted again from the module\'s lists');
  assert.deepEqual(first.includedRequestIds, ['rq-036'], 'the module left the canceled order out');
  assert.ok(first.explanation.includes('rq-038'), 'the first explanation described the old picks');
  assert.deepEqual(second.includedRequestIds, ['rq-036']);
  assert.equal(second.amount, 1_290 + 2_880 + 2_250);
  assert.ok(!second.explanation.includes('rq-038'), 'the replacement describes only what the module picked');
  assert.ok(second.explanation.includes(money(second.amount)));

  const [flag] = openHolds(conn, 'payment_request', first.id);
  assert.equal(flag.title, `Reject ${first.id}: replaced by ${second.id}`);
  assert.deepEqual(flag.options, ['reject'], 'the wrong draft can only be rejected');
  assert.match(flag.why, /rq-038/);
  assert.equal(openHolds(conn, 'payment_request', second.id).length, 1, 'the replacement waits for approval as usual');
  assert.equal(alone.calls.filter((call) => call.action === 'draft_payment_request').length, 2, 'one extra draft, no more');
});

test('a_grant_that_freezes_before_the_replacement_gets_none_and_the_first_draft_is_still_flagged', async () => {
  let raced = false;
  let refreshes = 0;
  alone = await startAlone({
    // The second refresh (right before the replacement) finds the grant canceled.
    tracker: (lab) => ({
      async refresh(grantId) {
        if (grantId === R21 && ++refreshes === 2) {
          await lab.call('inject_status_event', { grantId: R21, kind: 'canceled', source: 'Cancellation list (Apify)', summary: 'Listed as terminated.' });
        }
      },
      idle: async () => {},
      stop() {},
    }),
    beforeCall: async (action, lab) => {
      if (action !== 'draft_payment_request' || raced) return;
      raced = true;
      await lab.call('cancel_order', { orderId: 'o-038' });
    },
  });
  const { conn } = alone;
  assert.equal(conn.rows('grant').find((g) => g.id === R21)!.frozen, true);
  const [first, ...rest] = requestsFor(conn, R21);
  assert.deepEqual(rest, [], 'no replacement on a frozen grant');
  assert.equal(alone.calls.filter((call) => call.action === 'draft_payment_request').length, 1);
  const flag = openHolds(conn, 'payment_request', first.id).find((hold) => hold.title.startsWith('Reject'))!;
  assert.equal(flag.title, `Reject ${first.id}: its explanation is wrong`);
  assert.deepEqual(flag.options, ['reject']);
  assert.match(flag.why, /frozen now, so no replacement was drafted/);
});

// ── The module refuses ────────────────────────────────────────────────────

test('a_refused_draft_is_not_retried_and_the_agent_stays_quiet', async () => {
  // Started on the bookkeeping identity: the module refuses every payment request action.
  alone = await startAlone({ role: 'bookkeeping' });
  const { conn } = alone;
  const attempts = (action: ActionName) => alone!.calls.filter((call) => call.action === action).length;
  assert.equal(attempts('draft_payment_request'), 1, 'tried once for R21AI000002');
  assert.equal(attempts('draft_follow_up_answer'), 1, 'tried once for fu-001');
  assert.deepEqual(requestsFor(conn, R21), []);
  assert.equal(conn.rows('followUp').find((row) => row.id === 'fu-001')!.state, 'drafted');

  // A new day wakes every grant again; the refusal still stands, so nothing is resent.
  const lab = await alone.person('grant_manager');
  await lab.call('advance_days', { days: 1 });
  await alone.quiet();
  assert.equal(attempts('draft_payment_request'), 1);
  assert.equal(attempts('draft_follow_up_answer'), 1);
});

// ── Long months and new months ────────────────────────────────────────────

test('a_month_with_many_purchases_still_fits_the_limit', async () => {
  const categories = ['lab supplies', 'reagents', 'equipment service', 'core facility services'];
  const requests = [];
  const orders = [];
  const invoices = [];
  for (let i = 0; i < 120; i++) {
    const id = String(100 + i);
    requests.push({ id: `rq-${id}`, day: '2026-05-02', requester: 'scientist', item: `Consumable lot ${id} for the plate reader and incubators`, category: categories[i % 4], price: 50 + i, grantId: TEST_GRANT, purpose: 'Aim 2 screening of the compound library', state: 'bought' });
    orders.push({ id: `o-${id}`, requestId: `rq-${id}`, grantId: TEST_GRANT, vendor: 'Example Supply', amount: 50 + i, placed: '2026-05-03', state: 'open' });
  }
  for (const i of [3, 40, 77]) {
    invoices.push({ id: `inv-${100 + i}`, orderId: `o-${100 + i}`, vendor: 'Example Supply', amount: 999, received: '2026-05-20', state: 'held', mismatch: `Invoice is $999 but the approved amount is $${50 + i}.` });
  }
  alone = await startAlone({ seedJson: oneGrantSeed({ requests, orders, invoices }) });
  const { conn } = alone;
  const [pr] = requestsFor(conn, TEST_GRANT);
  assert.ok(pr, 'the module accepted the draft');
  assert.ok(pr.explanation.length <= 1_000, `${pr.explanation.length} characters`);
  assert.equal(pr.includedRequestIds.length, 117);
  assert.ok(pr.explanation.includes(money(pr.amount)), 'still states the exact total');
  for (const e of pr.excluded) assert.ok(parts(pr).leftOut.includes(e.requestId), `still names ${e.requestId} as left out`);
  const claim = claimFor(conn, TEST_GRANT, MAY)!;
  assert.deepEqual(explanationProblems(templateExplanation(claim), claim), []);
});

test('a_long_follow_up_answer_lists_every_purchase_and_cuts_no_id_in_half', async () => {
  // 40 purchases overflow the itemized answer; 200 overflow even the compact one.
  for (const count of [40, 200]) {
    const requests = [];
    const orders = [];
    for (let i = 0; i < count; i++) {
      const id = String(100 + i);
      requests.push({ id: `rq-${id}`, day: '2026-05-02', requester: 'scientist', item: `Lot ${id}`, category: 'lab supplies', price: 50 + i, grantId: TEST_GRANT, purpose: 'Aim 2', state: 'bought' });
      orders.push({ id: `o-${id}`, requestId: `rq-${id}`, grantId: TEST_GRANT, vendor: 'Example Supply', amount: 50 + i, placed: '2026-05-03', state: 'open' });
    }
    alone = await startAlone({ seedJson: oneGrantSeed({ requests, orders }) });
    const { conn } = alone;
    const [pr] = requestsFor(conn, TEST_GRANT);
    const funder = await alone.person('funder');
    await funder.call('ask_follow_up', { paymentRequestId: pr.id, question: 'Itemize every purchase.' });
    await alone.quiet();
    const fu = conn.rows('followUp').find((row) => row.paymentRequestId === pr.id)!;
    const answer = fu.answerDraft!;
    assert.ok(answer.length <= 2_000, `${answer.length} characters`);
    const allowed = new Set([pr.id, fu.id, ...pr.includedRequestIds, ...pr.includedPayrollIds]);
    for (const id of mentionedIds(answer)) assert.ok(allowed.has(id), `${count} purchases: ${id} is not in ${pr.id}`);
    if (count === 40) for (const id of pr.includedRequestIds) assert.ok(answer.includes(id), `itemizes ${id}`);
    alone.stop();
    alone = undefined;
  }
});

test('a_new_month_on_the_clock_drafts_that_months_request', async () => {
  const june = { id: 'pay-T-2026-06-1', grantId: TEST_GRANT, person: 'staff-1', role: 'Research technician', period: { from: '2026-06-01', to: '2026-06-30' }, effortPct: 25, amount: 1_200 };
  const extra = maySpending();
  alone = await startAlone({ seedJson: oneGrantSeed({ ...extra, payroll: [...extra.payroll, june] }) });
  const { conn } = alone;
  assert.equal(requestsFor(conn, TEST_GRANT).length, 1);
  const lab = await alone.person('grant_manager');
  await lab.call('advance_days', { days: 10 });
  await alone.quiet();
  assert.equal(conn.rows('paymentRequest').length, 1, 'still June: nothing new');
  await lab.call('advance_days', { days: 6 });
  await alone.quiet();
  const [pr] = requestsFor(conn, TEST_GRANT, { from: '2026-06-01', to: '2026-06-30' });
  assert.deepEqual(pr.includedPayrollIds, ['pay-T-2026-06-1']);
  assert.equal(pr.amount, 1_200);
});

// ── The tricky helpers ────────────────────────────────────────────────────

test('last_full_month_handles_january_and_leap_years', () => {
  assert.deepEqual(lastFullMonth('2026-06-15'), MAY);
  assert.deepEqual(lastFullMonth('2026-06-01'), MAY);
  assert.deepEqual(lastFullMonth('2027-01-10'), { from: '2026-12-01', to: '2026-12-31' });
  assert.deepEqual(lastFullMonth('2024-03-31'), { from: '2024-02-01', to: '2024-02-29' });
  assert.deepEqual(lastFullMonth('2026-03-02'), { from: '2026-02-01', to: '2026-02-28' });
});

test('ids_and_money_read_the_way_the_records_write_them', () => {
  assert.deepEqual(
    mentionedIds('rq-036 and rq5 on o-038, invoice inv-037 (inv12), pay-R21-2026-05-1, pr1, pr-015, fu-001; R21AI000002 two pay periods, pay-period'),
    ['rq-036', 'rq5', 'o-038', 'inv-037', 'inv12', 'pay-R21-2026-05-1', 'pr1', 'pr-015', 'fu-001'],
  );
  assert.equal(money(7_060), '$7,060');
  assert.equal(money(1_290.5), '$1,290.50');
  assert.equal(money(0.1 + 0.2), '$0.30');
});

test('the_validators_reject_invented_ids_and_amounts', async () => {
  alone = await startAlone();
  const { conn } = alone;
  const claim = claimFor(conn, R21, MAY)!;
  const good = templateExplanation(claim);
  assert.deepEqual(explanationProblems(good, claim), []);
  const bad = (claimed: string, leftOut = good.leftOut) => explanationProblems({ claimed, leftOut }, claim);
  assert.match(bad(`${good.claimed} Also rq-999.`).join(), /rq-999/, 'an id not in the records');
  assert.match(bad(`${good.claimed} Also rq-037.`).join(), /claims rq-037/, 'a held purchase claimed');
  assert.match(bad(good.claimed.replace('$7,060', '$7,100')).join(), /total|\$7,100/, 'a recomputed total');
  assert.match(bad(good.claimed, 'Nothing was left out.').join(), /doesn't say rq-037 was left out/);
  assert.match(bad(`${good.claimed} It also covers the Mueller-Hinton broth.`).join(), /claims Mueller-Hinton broth, 12 bottles \(rq-037\)/, 'a held purchase claimed by name');
  assert.match(bad(`${good.claimed}${' More detail.'.repeat(80)}`).join(), /over the 1000 limit/);

  const pr = conn.rows('paymentRequest').find((row) => row.id === 'pr-015')!;
  const fu = conn.rows('followUp').find((row) => row.id === 'fu-001')!;
  const answered = { answer: fu.answerDraft! };
  const prClaim = requestClaim(conn, pr)!;
  assert.deepEqual(answerProblems(answered, pr, fu.id, prClaim), []);
  assert.match(answerProblems({ answer: 'rq-034 cost $640.' }, pr, fu.id, prClaim).join(), /rq-034/, 'a left-out purchase');
  assert.match(answerProblems({ answer: 'rq-033 cost $1,234.' }, pr, fu.id, prClaim).join(), /\$1,234/, 'an invented amount');
});
