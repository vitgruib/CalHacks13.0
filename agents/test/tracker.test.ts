import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { canceledWhenPlaced } from '../src/agents/bookkeeping.ts';
import { ActionError, type FlagRow, type OrderRow, type Source, type StatusEventRow } from '../src/db/contract.ts';
import { createLocalDb } from '../src/db/local.ts';
import { memoryTokens } from '../src/identity.ts';
import type { Reading, SourceClient } from '../src/sources/types.ts';
import { startWorker } from '../src/worker.ts';
import { oneGrantSeed, startWorld, TEST_GRANT, type TestWorld } from './helpers.ts';

let world: TestWorld | undefined;
afterEach(() => {
  world?.stop();
  world = undefined;
});

// A source that answers with the next reading in the list each time it's
// read (the last one repeats). A thrown Error stands for an outage.
function fakeSource(source: Source, answers: Array<Partial<Reading> | null | Error>): SourceClient {
  let call = 0;
  return {
    source,
    async read(grantId) {
      if (grantId !== TEST_GRANT) return null;
      const answer = answers[Math.min(call++, answers.length - 1)];
      if (answer instanceof Error) throw answer;
      if (answer === null) return null;
      return { grantId, source, status: null, awarded: null, paid: null, endDate: null, url: `https://example.test/${grantId}`, ...answer };
    },
  };
}

// The one-grant world, its sources read once at startup.
async function startWith(sources: SourceClient[], extra?: Record<string, unknown[]>) {
  world = await startWorld({ seedJson: oneGrantSeed(extra), sources });
  return world.worker.sessions.bookkeeping;
}

// Each refresh happens on the next simulated day, as it would in real life.
const refresh = async () => {
  const lab = await world!.person('grant_manager');
  await lab.call('advance_days', { days: 1 });
  await world!.worker.tracker.refresh(TEST_GRANT);
  await world!.worker.idle();
};
const kinds = (conn: { rows(table: 'statusEvent'): StatusEventRow[] }) =>
  conn.rows('statusEvent').map((event) => event.kind);
const grant = () => world!.worker.sessions.bookkeeping.rows('grant').find((row) => row.id === TEST_GRANT)!;

test('a_first_reading_is_stored_and_an_unchanged_repeat_is_not', async () => {
  const conn = await startWith([fakeSource('NIH RePORTER', [{ status: 'active', awarded: 450_000 }])]);
  await refresh();
  assert.equal(conn.rows('sourceReading').length, 1);
  assert.deepEqual(kinds(conn), [], 'a first "active" reading is the baseline, not news');
});

test('a_cancellation_posts_a_canceled_event_and_the_module_freezes_the_grant', async () => {
  const conn = await startWith([fakeSource('Cancellation list (Apify)', [{ status: 'active' }, { status: 'canceled' }])]);
  assert.equal(grant().frozen, false);
  await refresh();
  assert.deepEqual(kinds(conn), ['canceled']);
  assert.equal(conn.rows('sourceReading').length, 2);
  assert.equal(grant().frozen, true);
});

test('a_first_reading_that_says_canceled_is_news', async () => {
  const conn = await startWith([fakeSource('Cancellation list (Apify)', [{ status: 'canceled' }])]);
  assert.deepEqual(kinds(conn), ['canceled']);
});

test('a_court_order_without_money_keeps_the_freeze_and_raises_a_flag', async () => {
  const conn = await startWith([fakeSource('Court notice', [{ status: 'canceled' }, { status: 'restored_by_court' }])]);
  await refresh();
  assert.deepEqual(kinds(conn), ['canceled', 'court_order']);
  assert.equal(grant().status, 'restored_by_court');
  assert.equal(grant().frozen, true, 'a court order is not cash');
  const flags = conn.rows('flag').filter((flag) => flag.kind === 'court_order_no_payment');
  assert.equal(flags.length, 1);
  assert.match(flags[0].summary, /no payment has arrived/);
});

test('money_paid_out_after_the_court_order_unfreezes_the_grant', async () => {
  const conn = await startWith([
    fakeSource('Court notice', [{ status: 'canceled' }, { status: 'restored_by_court' }]),
    fakeSource('USAspending', [{ paid: 100_000 }, { paid: 100_000 }, { paid: 130_000 }]),
  ]);
  await refresh();
  assert.equal(grant().frozen, true);
  await refresh();
  const payment = conn.rows('statusEvent').find((event) => event.kind === 'payment_received');
  assert.equal(payment?.amount, 30_000);
  assert.equal(grant().frozen, false);
});

test('an_end_date_pulled_earlier_is_reported', async () => {
  const conn = await startWith([fakeSource('NIH RePORTER', [{ endDate: '2028-06-30' }, { endDate: '2025-04-15' }])]);
  await refresh();
  const [event] = conn.rows('statusEvent');
  assert.equal(event.kind, 'reading_changed');
  assert.match(event.summary, /2028-06-30 to 2025-04-15 \(earlier\)/);
});

test('a_source_that_stops_mentioning_a_field_has_not_changed_it', async () => {
  const conn = await startWith([fakeSource('USAspending', [{ paid: 100_000, awarded: 450_000 }, { awarded: 450_000 }])]);
  await refresh();
  assert.equal(conn.rows('sourceReading').length, 1);
  assert.deepEqual(kinds(conn), []);
});

test('disagreeing_sources_raise_one_flag_and_the_module_puts_it_in_the_inbox', async () => {
  const conn = await startWith([
    fakeSource('NIH RePORTER', [{ status: 'active' }]),
    fakeSource('Cancellation list (Apify)', [{ status: 'canceled' }]),
  ]);
  await refresh();
  const flags = conn.rows('flag').filter((flag) => flag.kind === 'sources_disagree');
  assert.equal(flags.length, 1, 'a second check must not raise a second flag');
  assert.match(flags[0].summary, /NIH RePORTER says active; Cancellation list \(Apify\) says canceled/);
  const holds = conn.rows('hold').filter((hold) => hold.kind === 'source_disagreement' && hold.open);
  assert.equal(holds.length, 1);
  assert.equal(holds[0].refId, String(flags[0].id));
  assert.equal(grant().frozen, true);
});

const decideDisagreement = async () => {
  const hold = world!.worker.sessions.bookkeeping.rows('hold').find((h) => h.open && h.kind === 'source_disagreement');
  assert.ok(hold, 'an open disagreement in the Inbox');
  const lab = await world!.person('grant_manager');
  await lab.call('decide_hold', { holdId: hold.id, choice: 'pick_source', reason: 'RePORTER is right; the list is out of date.' });
  await world!.worker.idle();
};
const disagreements = (conn: { rows(table: 'flag'): FlagRow[] }) => conn.rows('flag').filter((flag) => flag.kind === 'sources_disagree');

test('a_disagreement_the_grant_manager_decided_is_not_raised_again', async () => {
  const conn = await startWith([
    fakeSource('NIH RePORTER', [{ status: 'active' }]),
    fakeSource('Cancellation list (Apify)', [{ status: 'canceled' }]),
  ]);
  await decideDisagreement();
  await world!.worker.tracker.refresh(TEST_GRANT);
  await world!.worker.idle();
  assert.equal(disagreements(conn).length, 1, 'the same readings, so no second flag');
  assert.equal(conn.rows('hold').filter((hold) => hold.kind === 'source_disagreement' && hold.open).length, 0);
});

test('a_restarted_worker_keeps_a_decided_disagreement_decided', async () => {
  const sources = () => [fakeSource('NIH RePORTER', [{ status: 'active' }]), fakeSource('Cancellation list (Apify)', [{ status: 'canceled' }])];
  const db = await createLocalDb({ world: { seedJson: oneGrantSeed() } });
  const tokens = memoryTokens();
  const first = await startWorker(db, { sources: sources(), tokens });
  await first.idle();
  const lab = await db.connect();
  await lab.call('register_person', { role: 'grant_manager', name: 'grant_manager' });
  const hold = lab.rows('hold').find((h) => h.open && h.kind === 'source_disagreement');
  assert.ok(hold);
  await lab.call('decide_hold', { holdId: hold.id, choice: 'pick_source', reason: 'RePORTER is right; the list is out of date.' });
  first.stop();
  const again = await startWorker(db, { sources: sources(), tokens });
  try {
    await again.idle();
    assert.equal(disagreements(lab).length, 1, 'the restart read the same readings and raised nothing');
  } finally {
    again.stop();
    db.close();
  }
});

test('a_decided_disagreement_is_raised_again_when_a_source_reports_something_new', async () => {
  const conn = await startWith([
    fakeSource('NIH RePORTER', [{ status: 'active' }, { status: 'active' }, { status: 'restored_by_court' }]),
    fakeSource('Cancellation list (Apify)', [{ status: 'canceled' }]),
  ]);
  await decideDisagreement();
  await refresh();
  assert.equal(disagreements(conn).length, 1, 'nothing new yet');
  await refresh();
  const flags = disagreements(conn);
  assert.equal(flags.length, 2, 'RePORTER changed, so the new disagreement is raised');
  assert.match(flags[1].summary, /NIH RePORTER says restored_by_court/);
  assert.equal(flags[1].open, true);
});

test('active_and_restored_by_court_are_not_a_disagreement', async () => {
  const conn = await startWith([
    fakeSource('NIH RePORTER', [{ status: 'active' }]),
    fakeSource('Court notice', [{ status: 'restored_by_court' }]),
  ]);
  assert.equal(conn.rows('flag').filter((flag) => flag.kind === 'sources_disagree').length, 0);
});

test('check_now_reads_the_sources_and_marks_the_request_done', async () => {
  const conn = await startWith([fakeSource('USAspending', [{ paid: 100_000 }, { paid: 120_000 }])]);
  const grantManager = await world!.person('grant_manager');
  await grantManager.call('request_check', { grantId: TEST_GRANT, reason: 'check_now' });
  await world!.worker.idle();
  const [check] = conn.rows('checkRequest');
  assert.equal(check.done, true);
  assert.equal(conn.rows('statusEvent')[0]?.kind, 'payment_received');
});

test('a_failing_source_does_not_stop_the_others', async () => {
  const conn = await startWith([
    fakeSource('NIH RePORTER', [new Error('RePORTER is down')]),
    fakeSource('USAspending', [{ paid: 100_000 }]),
  ]);
  assert.deepEqual(conn.rows('sourceReading').map((reading) => reading.source), ['USAspending']);
});

test('only_the_bookkeeping_agent_can_post_readings', async () => {
  const conn = await startWith([]);
  await assert.rejects(
    world!.worker.sessions.purchasing.call('post_source_reading', { grantId: TEST_GRANT, source: 'NIH RePORTER', status: 'active', url: 'https://example.test' }),
    ActionError,
  );
  assert.equal(conn.rows('sourceReading').length, 0);
});

// ── Spending while canceled ────────────────────────────────────────────────

const event = (day: string, kind: StatusEventRow['kind']): StatusEventRow => ({
  id: 0n, grantId: TEST_GRANT, day, kind, source: 'Payment system', summary: kind, at: 0,
});
const order = (placed: string): OrderRow => ({
  id: 'o-1', requestId: 'rq-1', grantId: TEST_GRANT, vendor: 'V', amount: 890, placed, state: 'open',
});

test('an_order_placed_after_a_cancellation_with_no_payment_since_was_spent_while_canceled', () => {
  assert.equal(canceledWhenPlaced(order('2026-03-18'), [event('2026-03-10', 'canceled')])?.day, '2026-03-10');
  assert.equal(
    canceledWhenPlaced(order('2026-05-01'), [event('2026-03-10', 'canceled'), event('2026-04-20', 'court_order')])?.day,
    '2026-03-10',
    'a court order is not a payment',
  );
});

test('a_second_source_reporting_the_same_cancellation_keeps_the_first_date', () => {
  const events = [event('2026-03-10', 'canceled'), event('2026-03-11', 'canceled')];
  assert.equal(canceledWhenPlaced(order('2026-03-18'), events)?.day, '2026-03-10');
});

test('an_order_before_the_cancellation_or_after_a_payment_was_not', () => {
  assert.equal(canceledWhenPlaced(order('2026-03-01'), [event('2026-03-10', 'canceled')]), undefined);
  assert.equal(
    canceledWhenPlaced(order('2026-05-02'), [event('2026-03-10', 'canceled'), event('2026-05-01', 'payment_received')]),
    undefined,
  );
});

test('a_cancellation_the_same_day_counts_only_if_it_came_before_the_order', () => {
  const canceled = { ...event('2026-06-15', 'canceled'), at: 2_000 };
  assert.equal(canceledWhenPlaced(order('2026-06-15'), [canceled], 1_000), undefined, 'bought, then canceled');
  assert.equal(canceledWhenPlaced(order('2026-06-15'), [canceled], 3_000)?.day, '2026-06-15', 'canceled, then bought');
  assert.equal(canceledWhenPlaced(order('2026-06-15'), [canceled]), undefined, 'no time known: no false alarm');
  assert.equal(canceledWhenPlaced(order('2026-06-16'), [canceled])?.day, '2026-06-15', 'a later day still counts');
});

test('canceling_a_grant_after_the_days_purchases_flags_none_of_them', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.bookkeeping;
  const lab = await world.person('grant_manager');
  const hold = conn.rows('hold').find((h) => h.open && h.kind === 'source_disagreement' && h.grantId === 'R01GM061721')!;
  await lab.call('decide_hold', { holdId: hold.id, choice: 'pick_source', reason: 'The court order stands.' });
  await lab.call('inject_status_event', { grantId: 'R01GM061721', kind: 'payment_received', source: 'Payment system', summary: 'Payment of $50,000 received.', amount: 50_000 });
  await world.worker.idle();
  const spent = () => conn.rows('flag').filter((flag) => flag.kind === 'spend_while_canceled' && flag.open).map((flag) => flag.summary);
  const before = spent();
  assert.ok(conn.rows('order').some((o) => o.placed === conn.today() && o.grantId === 'R01GM061721'), "today's purchases were placed");
  await lab.call('inject_status_event', { grantId: 'R01GM061721', kind: 'canceled', source: 'Cancellation list (Apify)', summary: 'Listed as terminated.' });
  await world.worker.idle();
  assert.deepEqual(spent(), before, 'bought before the cancellation, so not spent while canceled');
});

// ── The planted cases (sim/answer-key.json) ────────────────────────────────

test('ft_1_today_s_readings_disagree_so_a_flag_and_an_inbox_item_are_raised', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.bookkeeping;
  const flags = conn.rows('flag').filter((flag) => flag.grantId === 'R01GM061721' && flag.kind === 'sources_disagree' && flag.open);
  assert.equal(flags.length, 1);
  assert.ok(conn.rows('hold').some((hold) => hold.kind === 'source_disagreement' && hold.open && hold.refId === String(flags[0].id)));
  assert.equal(conn.rows('grant').find((g) => g.id === 'R01GM061721')?.frozen, true);
});

test('ft_2_the_890_charge_eight_days_after_the_cancellation_is_flagged', async () => {
  world = await startWorld();
  const flags = world.worker.sessions.bookkeeping
    .rows('flag')
    .filter((flag) => flag.grantId === 'R01GM061721' && flag.kind === 'spend_while_canceled' && flag.open);
  const summaries = flags.map((flag) => flag.summary);
  assert.ok(summaries.some((summary) => summary.includes('rq-050') && summary.includes('o-050') && summary.includes('8 days after')), summaries.join('\n'));
});

test('ft_3_the_court_order_without_payment_keeps_grant_a_frozen_and_flagged', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.bookkeeping;
  assert.equal(conn.rows('grant').find((g) => g.id === 'R01GM061721')?.frozen, true);
  assert.equal(conn.rows('flag').filter((flag) => flag.grantId === 'R01GM061721' && flag.kind === 'court_order_no_payment' && flag.open).length, 1);
});

// The demo path's climax: a court order is not cash, and the open
// disagreement (ft-1) also holds the freeze. Once the grant manager picks a
// source and the money arrives, in either order, grant A spends again.
for (const order of [['pick', 'pay'], ['pay', 'pick']] as const) {
  test(`demo_path_${order.join('_then_')}_unfreezes_grant_a_and_its_waiting_purchases_go_through`, async () => {
    world = await startWorld();
    const conn = world.worker.sessions.bookkeeping;
    const lab = await world.person('grant_manager');
    const grantA = () => conn.rows('grant').find((g) => g.id === 'R01GM061721')!;
    for (const step of order) {
      assert.equal(grantA().frozen, true, `still frozen before ${step}`);
      if (step === 'pick') {
        const hold = conn.rows('hold').find((h) => h.open && h.kind === 'source_disagreement' && h.grantId === 'R01GM061721');
        assert.ok(hold, 'ft-1 is in the Inbox');
        await lab.call('decide_hold', { holdId: hold.id, choice: 'pick_source', reason: 'The court order stands; the list is out of date.' });
      } else {
        await lab.call('inject_status_event', { grantId: 'R01GM061721', kind: 'payment_received', source: 'Payment system', summary: 'Payment of $50,000 received.', amount: 50_000 });
      }
      await world.worker.idle();
    }
    assert.equal(grantA().frozen, false, `still frozen: ${grantA().frozenReason}`);
    assert.equal(disagreements(conn).filter((flag) => flag.grantId === 'R01GM061721').length, 1, 'the decided disagreement was not raised again');
    const state = (id: string) => conn.rows('request').find((r) => r.id === id)?.state;
    assert.deepEqual(['rq-101', 'rq-106', 'rq-107'].map(state), ['bought', 'bought', 'bought']);
    assert.equal(state('rq-102'), 'rerouted');
  });
}
