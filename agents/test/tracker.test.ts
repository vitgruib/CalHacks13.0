import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import type { Source } from '../src/db/contract.ts';
import { ActionError, createStubDb } from '../src/db/stub.ts';
import type { Reading, SourceClient } from '../src/sources/types.ts';
import { startWorker, type Worker } from '../src/worker.ts';

const GRANT = 'DEMO-GRANT-A';

let stateDir: string;
let worker: Worker | undefined;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'gg-tracker-'));
  process.env.GG_STATE_DIR = stateDir;
});

afterEach(() => {
  worker?.stop();
  worker = undefined;
  rmSync(stateDir, { recursive: true, force: true });
});

// A source that answers with the next reading in the list each time it's
// read (the last one repeats). A thrown Error stands for an outage.
function fakeSource(source: Source, answers: Array<Partial<Reading> | null | Error>): SourceClient {
  let call = 0;
  return {
    source,
    async read(grantId) {
      if (grantId !== GRANT) return null;
      const answer = answers[Math.min(call++, answers.length - 1)];
      if (answer instanceof Error) throw answer;
      if (answer === null) return null;
      return {
        grantId,
        source,
        status: null,
        awarded: null,
        paid: null,
        endDate: null,
        url: `https://example.test/${grantId}`,
        ...answer,
      };
    },
  };
}

async function startWith(sources: SourceClient[]) {
  const db = createStubDb();
  worker = await startWorker(db, { sources });
  await worker.tracker.idle();
  return db;
}

test('a_first_reading_is_stored_and_an_unchanged_repeat_is_not', async () => {
  const db = await startWith([fakeSource('NIH RePORTER', [{ status: 'active', awarded: 450_000 }])]);
  await worker!.tracker.refresh(GRANT);

  assert.equal(db.rows('source_readings').length, 1);
  assert.equal(db.rows('status_events').length, 0, 'a first "active" reading is the baseline, not news');
});

test('a_cancellation_posts_a_canceled_status_event', async () => {
  const db = await startWith([
    fakeSource('Cancellation list (Apify)', [{ status: 'active' }, { status: 'canceled' }]),
  ]);
  await worker!.tracker.refresh(GRANT);

  assert.deepEqual(
    db.rows('status_events').map((event) => event.kind),
    ['canceled'],
  );
  assert.equal(db.rows('source_readings').length, 2);
});

test('a_first_reading_that_says_canceled_is_news', async () => {
  const db = await startWith([fakeSource('Cancellation list (Apify)', [{ status: 'canceled' }])]);
  assert.deepEqual(db.rows('status_events').map((event) => event.kind), ['canceled']);
});

test('a_court_restoration_posts_a_court_order_event', async () => {
  const db = await startWith([
    fakeSource('Court notice', [{ status: 'canceled' }, { status: 'restored_by_court' }]),
  ]);
  await worker!.tracker.refresh(GRANT);

  assert.deepEqual(
    db.rows('status_events').map((event) => event.kind),
    ['canceled', 'court_order'],
  );
});

test('more_money_paid_out_posts_a_payment_received_event_with_the_difference', async () => {
  const db = await startWith([fakeSource('USAspending', [{ paid: 100_000 }, { paid: 130_000 }])]);
  await worker!.tracker.refresh(GRANT);

  const [event] = db.rows('status_events');
  assert.equal(event.kind, 'payment_received');
  assert.equal(event.amount, 30_000);
});

test('an_end_date_pulled_earlier_is_reported', async () => {
  const db = await startWith([
    fakeSource('NIH RePORTER', [{ endDate: '2028-06-30' }, { endDate: '2025-04-15' }]),
  ]);
  await worker!.tracker.refresh(GRANT);

  const [event] = db.rows('status_events');
  assert.equal(event.kind, 'reading_changed');
  assert.match(event.summary, /2028-06-30 to 2025-04-15 \(earlier\)/);
});

test('a_source_that_stops_mentioning_a_field_has_not_changed_it', async () => {
  const db = await startWith([
    fakeSource('USAspending', [{ paid: 100_000, awarded: 450_000 }, { awarded: 450_000 }]),
  ]);
  await worker!.tracker.refresh(GRANT);

  assert.equal(db.rows('source_readings').length, 1);
  assert.equal(db.rows('status_events').length, 0);
});

test('disagreeing_sources_raise_one_flag_and_one_inbox_hold', async () => {
  const db = await startWith([
    fakeSource('NIH RePORTER', [{ status: 'active' }]),
    fakeSource('Cancellation list (Apify)', [{ status: 'canceled' }]),
  ]);
  await worker!.tracker.refresh(GRANT);

  const flags = db.rows('flags');
  assert.equal(flags.length, 1, 'a second check must not raise a second flag');
  assert.equal(flags[0].kind, 'sources_disagree');
  assert.match(flags[0].summary, /NIH RePORTER says active; Cancellation list \(Apify\) says canceled/);

  const holds = db.rows('holds').filter((hold) => hold.kind === 'source_disagreement');
  assert.equal(holds.length, 1);
  assert.equal(holds[0].refId, String(flags[0].id));
});

test('active_and_restored_by_court_are_not_a_disagreement', async () => {
  const db = await startWith([
    fakeSource('NIH RePORTER', [{ status: 'active' }]),
    fakeSource('Court notice', [{ status: 'restored_by_court' }]),
  ]);
  assert.equal(db.rows('flags').length, 0);
});

test('check_now_reads_the_sources_and_marks_the_request_done', async () => {
  const db = await startWith([fakeSource('USAspending', [{ paid: 100_000 }, { paid: 120_000 }])]);
  const grantManager = await db.connect();
  await grantManager.call('request_check', { grantId: GRANT, reason: 'check_now' });
  await worker!.tracker.idle();

  const [check] = db.rows('check_requests');
  assert.notEqual(check.completedAt, null);
  assert.equal(db.rows('status_events')[0]?.kind, 'payment_received');
});

test('a_failing_source_does_not_stop_the_others', async () => {
  const db = await startWith([
    fakeSource('NIH RePORTER', [new Error('RePORTER is down')]),
    fakeSource('USAspending', [{ paid: 100_000 }]),
  ]);
  assert.deepEqual(db.rows('source_readings').map((reading) => reading.source), ['USAspending']);
});

test('only_the_bookkeeping_agent_can_post_readings', async () => {
  const db = await startWith([]);
  await assert.rejects(
    worker!.sessions.purchasing.call('post_source_reading', {
      grantId: GRANT,
      source: 'NIH RePORTER',
      status: 'active',
      awarded: null,
      paid: null,
      endDate: null,
      url: 'https://example.test',
      fetchedAt: Date.now(),
    }),
    ActionError,
  );
  assert.equal(db.rows('source_readings').length, 0);
});
