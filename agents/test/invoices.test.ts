import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, mock, test } from 'node:test';

import { dollars, explainedHold } from '../src/agents/invoices.ts';
import type { Connection, HoldRow, InvoiceRow } from '../src/db/contract.ts';
import { SIM_SEED } from '../src/db/local.ts';
import { noteOnHeldInvoice, noteProblem, type HeldInvoice } from '../src/prompts/invoices.ts';
import { oneGrantSeed, startWorld, TEST_GRANT, type TestWorld } from './helpers.ts';

let world: TestWorld | undefined;
afterEach(() => {
  world?.stop();
  world = undefined;
});

const RULE = 'Invoice needs an open order and the approved amount';

const request = (id: string, item: string, price: number) => ({
  id, day: '2026-05-01', requester: 'scientist', item, category: 'lab supplies', price,
  grantId: TEST_GRANT, chargedGrantId: TEST_GRANT, purpose: 'Aim 1', state: 'bought',
});
const order = (id: string, requestId: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id, requestId, grantId: TEST_GRANT, vendor: 'Test Vendor', amount, placed: '2026-05-01', state: 'open', ...extra,
});

// The one-grant world with one open order (o-1, $700) and nothing else.
async function oneOrderWorld(amount = 700) {
  world = await startWorld({ seedJson: oneGrantSeed({ requests: [request('rq-1', 'Agar plates', amount)], orders: [order('o-1', 'rq-1', amount)] }) });
  return { conn: world.worker.sessions.bookkeeping, lab: await world.person('grant_manager') };
}

const invoice = (conn: Connection, id: string) => conn.rows('invoice').find((row) => row.id === id)!;
const invoicesFor = (conn: Connection, orderId: string) => conn.rows('invoice').filter((row) => row.orderId === orderId);
const invoiceHolds = (conn: Connection, invoiceId: string) => conn.rows('hold').filter((hold) => hold.kind === 'invoice' && hold.refId === invoiceId);
const openHold = (conn: Connection, invoiceId: string): HoldRow => {
  const open = invoiceHolds(conn, invoiceId).filter((hold) => hold.open);
  assert.equal(open.length, 1, `${invoiceId} should have exactly one open invoice hold`);
  return open[0];
};
const evidence = (hold: HoldRow, label: string) => hold.evidence.find((line) => line.label === label)?.value;
const heldLogs = (conn: Connection, invoiceId: string) => conn.rows('log').filter((row) => row.action === `Held invoice ${invoiceId}`);

// Settles the world, then checks that one more round does nothing at all.
async function settle() {
  await world!.worker.idle();
  const version = world!.db.version();
  await world!.worker.idle();
  assert.equal(world!.db.version(), version, 'a second idle must change nothing');
}

// ── The planted cases (sim/answer-key.json) ────────────────────────────────

test('in_1_the_invoice_for_a_canceled_order_is_held_with_its_timeline', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.bookkeeping;
  const inv = invoice(conn, 'inv-030');
  assert.equal(inv.checked, true);
  assert.equal(inv.state, 'held');
  assert.match(inv.mismatch!, /canceled on 2026-03-02/);
  assert.deepEqual(
    inv.timeline.map((entry) => entry.day),
    ['2026-02-20', '2026-03-02', '2026-06-11'],
  );
  assert.match(inv.timeline[0].what, /Order placed/);
  assert.match(inv.timeline[1].what, /canceled/);
  assert.match(inv.timeline[2].what, /Invoice arrived/);

  const hold = openHold(conn, 'inv-030');
  assert.equal(hold.why, inv.mismatch, "the module's reason is kept word for word");
  assert.deepEqual(hold.evidence.slice(0, 3), inv.timeline.map((entry) => ({ label: entry.day, value: entry.what })));
  assert.equal(evidence(hold, 'Rule'), RULE);
  assert.equal(evidence(hold, 'Order o-030'), '$2,400, placed 2026-02-20 for rq-030 on R21AI000002; canceled 2026-03-02');
  assert.equal(evidence(hold, 'Invoice inv-030'), '$2,400 from BioReagents Inc, received 2026-06-11');
  assert.deepEqual(hold.options, ['approve', 'reject', 'ask_vendor']);
});

test('in_2_the_invoice_over_its_approval_is_held_naming_ap_034', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.bookkeeping;
  const inv = invoice(conn, 'inv-034');
  assert.equal(inv.state, 'held');
  assert.equal(inv.mismatch, 'Invoice is $6,200 but the approved amount is $5,800.');

  const hold = openHold(conn, 'inv-034');
  assert.equal(hold.why, inv.mismatch);
  assert.equal(evidence(hold, 'Approval ap-034'), '$5,800 by the grant manager on 2026-04-21');
  assert.equal(evidence(hold, 'Invoice inv-034'), '$6,200 from SpinWorks, received 2026-06-09');
  assert.equal(evidence(hold, 'Order o-034'), '$6,200, placed 2026-04-22 for rq-034 on R21AI000002; open');
  assert.equal(evidence(hold, 'Rule'), RULE);
  assert.equal(hold.grantId, 'R21AI000002');
});

test('in_d1_the_invoice_matching_an_approved_change_is_paid_with_no_hold', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.bookkeeping;
  const inv = invoice(conn, 'inv-036');
  assert.equal(inv.checked, true);
  assert.equal(inv.state, 'paid', 'the module pays a matching invoice as soon as it matches');
  assert.equal(inv.mismatch, undefined);
  assert.match(inv.timeline.at(-1)!.what, /matches the approved amount/);
  assert.deepEqual(invoiceHolds(conn, 'inv-036'), [], 'no hold, open or closed');
  assert.ok(conn.rows('log').some((row) => row.action === 'Matched invoice inv-036' && row.rule === RULE));
});

test('the_seeded_hold_h_004_on_inv_037_is_neither_duplicated_nor_reopened', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.bookkeeping;
  const holds = invoiceHolds(conn, 'inv-037');
  assert.equal(holds.length, 1);
  assert.equal(holds[0].open, true);
  assert.equal(holds[0].title, 'Pay MicroMedia $2,920 for an order of $1,460?');
  assert.equal(invoice(conn, 'inv-037').mismatch, 'Billed for 24 bottles ($2,920); the order was for 12 bottles ($1,460).');
  assert.equal(conn.rows('log').filter((row) => row.refId === 'inv-037').length, 1, 'only the seeded log row');
});

test('every_waiting_sim_invoice_is_checked_and_only_the_planted_ones_are_held', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.bookkeeping;
  assert.deepEqual(conn.rows('invoice').filter((row) => !row.checked).map((row) => row.id), []);
  assert.equal(invoice(conn, 'inv-038').state, 'paid');
  const open = conn.rows('hold').filter((hold) => hold.kind === 'invoice' && hold.open).map((hold) => hold.refId).sort();
  assert.deepEqual(open, ['inv-030', 'inv-034', 'inv-037']);
});

test('a_second_idle_on_the_sim_world_changes_nothing', async () => {
  world = await startWorld();
  await settle();
});

test('reloading_the_sim_world_in_the_test_lab_checks_its_invoices_again_without_duplicates', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.bookkeeping;
  const lab = await world.person('grant_manager');
  await lab.call('load_seed', { json: readFileSync(SIM_SEED, 'utf8') });
  await world.worker.idle();

  assert.deepEqual(conn.rows('invoice').filter((row) => !row.checked).map((row) => row.id), []);
  assert.equal(invoice(conn, 'inv-030').state, 'held');
  assert.equal(invoice(conn, 'inv-036').state, 'paid');
  const open = conn.rows('hold').filter((hold) => hold.kind === 'invoice' && hold.open).map((hold) => hold.refId).sort();
  assert.deepEqual(open, ['inv-030', 'inv-034', 'inv-037']);
  assert.equal(evidence(openHold(conn, 'inv-034'), 'Approval ap-034'), '$5,800 by the grant manager on 2026-04-21');
  await settle();
});

test('resetting_the_test_lab_to_the_fixtures_neither_rechecks_nor_pays_their_checked_invoices', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.bookkeeping;
  const lab = await world.person('grant_manager');
  await lab.call('reset_world', {});
  // The fixtures' inv2 is checked and 'matched' for an order whose approval
  // arrives as a new row: that is the world loading, not news about the order.
  const spent = () => conn.rows('grant').map((grant) => [grant.id, grant.spent, grant.promised]);
  const before = spent();
  await world.worker.idle();

  assert.equal(invoice(conn, 'inv2').state, 'matched');
  assert.equal(conn.rows('order').find((row) => row.id === 'o3')?.state, 'changed');
  assert.deepEqual(spent(), before, 'no money moved');
  const checks = conn.rows('log').filter((row) => /^(Held|Matched) invoice inv\d$/.test(row.action)).map((row) => row.action);
  assert.deepEqual(checks, ['Held invoice inv1'], "only the fixtures' own log row");
  await settle();
});

test('reloading_the_sim_world_after_a_cancel_leaves_the_reseeded_h_004_alone', async () => {
  world = await startWorld();
  const conn = world.worker.sessions.bookkeeping;
  const lab = await world.person('grant_manager');
  await lab.call('cancel_order', { orderId: 'o-037' });
  await world.worker.idle();
  assert.match(invoice(conn, 'inv-037').mismatch!, /canceled/, 'the cancellation is news: re-checked');

  // The reload puts o-037 back to open and inv-037 back to its seeded hold.
  await lab.call('load_seed', { json: readFileSync(SIM_SEED, 'utf8') });
  await world.worker.idle();
  const holds = invoiceHolds(conn, 'inv-037');
  assert.equal(holds.length, 1, 'only the reseeded hold');
  assert.equal(holds[0].open, true);
  assert.equal(holds[0].title, 'Pay MicroMedia $2,920 for an order of $1,460?');
  assert.equal(invoice(conn, 'inv-037').mismatch, 'Billed for 24 bottles ($2,920); the order was for 12 bottles ($1,460).');
  await settle();
});

// ── The Test lab ───────────────────────────────────────────────────────────

test('an_injected_invoice_for_a_canceled_order_is_held_with_a_timeline', async () => {
  const { conn, lab } = await oneOrderWorld(900);
  await lab.call('cancel_order', { orderId: 'o-1' });
  await lab.call('advance_days', { days: 3 });
  await lab.call('inject_invoice', { orderId: 'o-1', amount: 900 });
  await world!.worker.idle();

  const [inv] = invoicesFor(conn, 'o-1');
  assert.equal(inv.checked, true);
  assert.equal(inv.state, 'held');
  assert.deepEqual(inv.timeline, [
    { day: '2026-05-01', what: 'Order placed ($900)' },
    { day: '2026-06-15', what: 'Order canceled' },
    { day: '2026-06-18', what: 'Invoice arrived for $900' },
  ]);
  const hold = openHold(conn, inv.id);
  assert.equal(hold.why, inv.mismatch);
  assert.deepEqual(hold.evidence, [
    ...inv.timeline.map((entry) => ({ label: entry.day, value: entry.what })),
    { label: 'Rule', value: RULE },
    { label: `Invoice ${inv.id}`, value: '$900 from Test Vendor, received 2026-06-18' },
    { label: 'Order o-1', value: `$900, placed 2026-05-01 for rq-1 on ${TEST_GRANT}; canceled 2026-06-15` },
    { label: 'Approval', value: 'None on file for o-1' },
  ]);
  const replaced = invoiceHolds(conn, inv.id).filter((row) => !row.open);
  assert.equal(replaced.length, 1, "the module's own item is replaced, not left open beside ours");
  assert.equal(conn.rows('decision').length, 0, 'replacing an item is not a decision');
  await settle();
});

test('a_matching_injected_invoice_is_matched_and_paid', async () => {
  const { conn, lab } = await oneOrderWorld(480);
  const grant = () => conn.rows('grant').find((row) => row.id === TEST_GRANT)!;
  const before = grant();
  await lab.call('inject_invoice', { orderId: 'o-1', amount: 480 });
  await world!.worker.idle();

  const [inv] = invoicesFor(conn, 'o-1');
  assert.equal(inv.checked, true);
  assert.equal(inv.state, 'paid');
  assert.deepEqual(invoiceHolds(conn, inv.id), []);
  assert.equal(conn.rows('order').find((row) => row.id === 'o-1')?.state, 'paid');
  assert.equal(grant().spent - before.spent, 480, 'the module moved the money');
  assert.equal(grant().promised - before.promised, -480);
  await settle();
});

test('an_injected_invoice_over_the_order_amount_is_held_naming_both_amounts', async () => {
  const { conn, lab } = await oneOrderWorld(700);
  await lab.call('inject_invoice', { orderId: 'o-1', amount: 750.5 });
  await world!.worker.idle();

  const [inv] = invoicesFor(conn, 'o-1');
  assert.equal(inv.state, 'held');
  const hold = openHold(conn, inv.id);
  assert.equal(evidence(hold, `Invoice ${inv.id}`), '$750.50 from Test Vendor, received 2026-06-15', 'exact amount, cents and all');
  assert.equal(evidence(hold, 'Order o-1'), `$700, placed 2026-05-01 for rq-1 on ${TEST_GRANT}; open`);
  await settle();
});

// ── Re-checks ──────────────────────────────────────────────────────────────

test('a_held_invoice_is_rechecked_once_when_its_order_is_canceled', async () => {
  const { conn, lab } = await oneOrderWorld(700);
  await lab.call('inject_invoice', { orderId: 'o-1', amount: 750 });
  await world!.worker.idle();
  const [first] = invoicesFor(conn, 'o-1');
  assert.match(first.mismatch!, /\$750 but the approved amount is \$700/);
  const firstHold = openHold(conn, first.id);

  await lab.call('cancel_order', { orderId: 'o-1' });
  await world!.worker.idle();
  const inv = invoice(conn, first.id);
  assert.match(inv.mismatch!, /canceled on 2026-06-15/);
  assert.ok(inv.timeline.some((entry) => entry.what === 'Order canceled'));
  const hold = openHold(conn, inv.id);
  assert.notEqual(hold.id, firstHold.id);
  assert.equal(hold.why, inv.mismatch);
  assert.match(evidence(hold, 'Order o-1')!, /canceled 2026-06-15$/);
  assert.equal(heldLogs(conn, inv.id).length, 2, 'checked once on arrival, once after the cancellation');
  await settle();
});

test('paying_an_order_does_not_recheck_its_other_held_invoice', async () => {
  const { conn, lab } = await oneOrderWorld(700);
  await lab.call('inject_invoice', { orderId: 'o-1', amount: 1400 });
  await world!.worker.idle();
  const [duplicate] = invoicesFor(conn, 'o-1');
  const hold = openHold(conn, duplicate.id);

  await lab.call('inject_invoice', { orderId: 'o-1', amount: 700 });
  await world!.worker.idle();
  const right = invoicesFor(conn, 'o-1').find((row) => row.id !== duplicate.id)!;
  assert.equal(right.state, 'paid');
  assert.equal(conn.rows('order').find((row) => row.id === 'o-1')?.state, 'paid');
  assert.equal(invoice(conn, duplicate.id).state, 'held');
  assert.equal(openHold(conn, duplicate.id).id, hold.id, 'the same Inbox item, not a new one');
  assert.equal(heldLogs(conn, duplicate.id).length, 1);
  await settle();
});

test('a_hold_the_grant_manager_answered_with_ask_vendor_is_not_reopened', async () => {
  const { conn, lab } = await oneOrderWorld(700);
  await lab.call('inject_invoice', { orderId: 'o-1', amount: 750 });
  await world!.worker.idle();
  const [inv] = invoicesFor(conn, 'o-1');
  const hold = openHold(conn, inv.id);

  await lab.call('decide_hold', { holdId: hold.id, choice: 'ask_vendor', reason: 'Asking the vendor for a corrected invoice.' });
  await world!.worker.idle();
  assert.deepEqual(invoiceHolds(conn, inv.id).filter((row) => row.open), []);
  assert.equal(invoice(conn, inv.id).timeline.at(-1)?.what, 'Grant manager asked the vendor');
  assert.equal(heldLogs(conn, inv.id).length, 1);
  await settle();
});

test('a_rejected_invoice_is_left_alone_when_its_order_is_canceled_later', async () => {
  const errors = mock.method(console, 'error', () => {});
  try {
    const { conn, lab } = await oneOrderWorld(700);
    await lab.call('inject_invoice', { orderId: 'o-1', amount: 750 });
    await world!.worker.idle();
    const [inv] = invoicesFor(conn, 'o-1');
    await lab.call('decide_hold', { holdId: openHold(conn, inv.id).id, choice: 'reject', reason: 'Not what we ordered.' });
    await lab.call('cancel_order', { orderId: 'o-1' });
    await world!.worker.idle();

    assert.equal(invoice(conn, inv.id).state, 'rejected');
    assert.deepEqual(invoiceHolds(conn, inv.id).filter((row) => row.open), []);
    assert.equal(errors.mock.callCount(), 0, 'the agent never asks the module to check a rejected invoice');
    await settle();
  } finally {
    errors.mock.restore();
  }
});

// ── When the module refuses ────────────────────────────────────────────────

test('the_module_refuses_to_pay_an_invoice_on_a_missing_grant_and_the_agent_carries_on', async () => {
  const errors = mock.method(console, 'error', () => {});
  try {
    const unchecked = (id: string, orderId: string, amount: number) => ({
      id, orderId, vendor: 'Test Vendor', amount, received: '2026-06-10', state: 'matched', timeline: [], checked: false,
    });
    world = await startWorld({
      seedJson: oneGrantSeed({
        orders: [order('o-6', 'rq-6', 300, { grantId: 'R01GONE000009' }), order('o-7', 'rq-7', 250)],
        invoices: [unchecked('inv-6', 'o-6', 300), unchecked('inv-7', 'o-7', 250)],
      }),
    });
    const conn = world.worker.sessions.bookkeeping;

    const refused = invoice(conn, 'inv-6');
    assert.equal(refused.checked, false, 'left as not checked yet, for a person to see');
    assert.deepEqual(invoiceHolds(conn, 'inv-6'), []);
    assert.equal(invoice(conn, 'inv-7').state, 'paid', 'the next invoice is still checked');
    const logged = errors.mock.calls.map((call) => call.arguments.map(String).join(' '));
    assert.ok(logged.some((line) => line.startsWith('invoices: check inv-6 failed') && line.includes('No grant R01GONE000009')), logged.join('\n'));
    await settle();
  } finally {
    errors.mock.restore();
  }
});

// ── Claude's note (tricky logic) ───────────────────────────────────────────

const heldInvoice034 = (): HeldInvoice => ({
  invoice: {
    id: 'inv-034', orderId: 'o-034', vendor: 'SpinWorks', amount: 6200, received: '2026-06-09', state: 'held',
    mismatch: 'Invoice is $6,200 but the approved amount is $5,800.', checked: true,
    timeline: [
      { day: '2026-04-21', what: 'Change to $5,800 approved by the grant manager' },
      { day: '2026-04-22', what: 'Order placed ($6,200)' },
      { day: '2026-06-09', what: 'Invoice arrived for $6,200' },
    ],
  } satisfies InvoiceRow,
  order: { id: 'o-034', requestId: 'rq-034', grantId: 'R21AI000002', vendor: 'SpinWorks', amount: 6200, placed: '2026-04-22', state: 'open' },
  approvals: [{ id: 'ap-034', orderId: 'o-034', amount: 5800, by: 'grant_manager', day: '2026-04-21' }],
  finding: 'Invoice is $6,200 but the approved amount is $5,800.',
  rule: RULE,
  item: 'Orbital plate shaker',
});

test('a_note_may_name_only_amounts_ids_and_dates_from_the_records', () => {
  const held = heldInvoice034();
  assert.equal(noteProblem('Approval ap-034 covers $5,800, but order o-034 and invoice inv-034 are $6,200.', held), undefined);
  assert.equal(noteProblem('The vendor billed $400 more than approved.', held), '$400 is not an amount in the records');
  assert.equal(noteProblem('See approval ap-099.', held), 'ap-099 is not one of the records');
  assert.equal(noteProblem('Charged to R01GM000001.', held), 'R01GM000001 is not one of the records');
  assert.equal(noteProblem('Shipped on 2026-05-05.', held), '2026-05-05 is not a date in the records');
  assert.match(noteProblem('x'.repeat(401), held)!, /over 400/);
});

test('exact_amounts_keep_their_cents', () => {
  assert.equal(dollars(6200), '$6,200');
  assert.equal(dollars(750.5), '$750.50');
});

function fakeClaude(note: string) {
  return { messages: { parse: async () => ({ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', parsed_output: { note } }) } };
}

async function withFakeKey<T>(run: (cacheDir: string) => Promise<T>): Promise<T> {
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const cacheDir = mkdtempSync(join(tmpdir(), 'gg-invoices-'));
  try {
    return await run(cacheDir);
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved;
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

test('claude_s_note_goes_after_the_module_s_reason_and_every_module_line_is_kept', async () => {
  const held = heldInvoice034();
  const text = 'Approval ap-034 covers $5,800, but order o-034 and invoice inv-034 are $6,200. Ask SpinWorks for the quote behind the extra cost.';
  const note = await withFakeKey((cacheDir) => noteOnHeldInvoice(held, { client: fakeClaude(text), mode: 'live', cacheDir }));
  assert.equal(note, text);

  const moduleHold: HoldRow = {
    id: 7n, kind: 'invoice', refId: 'inv-034', grantId: 'R21AI000002', raisedBy: 'bookkeeping', day: '2026-06-15',
    title: 'Pay SpinWorks $6200?', why: held.finding,
    evidence: held.invoice.timeline.map((entry) => ({ label: entry.day, value: entry.what })),
    options: ['approve', 'reject', 'ask_vendor'], open: true,
  };
  const item = explainedHold(moduleHold, held, note);
  assert.equal(item.title, moduleHold.title);
  assert.equal(item.why, `${held.finding} ${text}`);
  assert.deepEqual(item.evidence.slice(0, 3), moduleHold.evidence);
  assert.deepEqual(item.options, moduleHold.options);
  assert.equal(explainedHold(moduleHold, held).why, held.finding, 'no note: the reason is the module\'s alone');
});

test('a_claude_note_with_a_computed_amount_is_dropped', async () => {
  const warnings = mock.method(console, 'warn', () => {});
  try {
    const note = await withFakeKey((cacheDir) =>
      noteOnHeldInvoice(heldInvoice034(), { client: fakeClaude('SpinWorks billed $400 over approval ap-034.'), mode: 'live', cacheDir }),
    );
    assert.equal(note, undefined);
    assert.ok(warnings.mock.calls.some((call) => String(call.arguments[0]).includes('$400 is not an amount in the records')));
  } finally {
    warnings.mock.restore();
  }
});

test('with_claude_off_there_is_no_note', async () => {
  assert.equal(await noteOnHeldInvoice(heldInvoice034(), { mode: 'off' }), undefined);
});
