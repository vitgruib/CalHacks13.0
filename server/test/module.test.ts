// The module through its actions, as callers see it: hard limits by
// identity, and the demo path's core (a court order isn't cash).
import { beforeEach, expect, test } from 'vitest';
import { ConnectionId } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import spacetimedb from '../src/schema';
import * as mod from '../src/index';

type H = ReturnType<typeof createModuleTestHarness<any>>;
let h: H;

const as = (sub: string) =>
  TestAuth.fromJwtPayload(JSON.stringify({ iss: 'http://test', sub, aud: ['spacetimedb'], iat: 0 }), ConnectionId.random());

// Reducer exports are callable as (ctx, args) inside a transaction.
function call(who: string, reducer: unknown, args: object = {}): void {
  h.withReducerTx(as(who), ctx => (reducer as (c: unknown, a: object) => void)(ctx, args));
}

const A = 'R01GM061721'; // fixtures: canceled, court-restored, no payment yet
const db = () => h.db as any;
const rows = (table: string) => [...db()[table].iter()] as any[];

beforeEach(() => {
  h = createModuleTestHarness(spacetimedb, mod as Record<string, unknown>);
  h.withReducerTx(TestAuth.internal(), ctx => (mod.init as any)(ctx, {}));
  call('pa', mod.register_agent, { role: 'payment_report' });
  call('bk', mod.register_agent, { role: 'bookkeeping' });
  call('gm', mod.register_person, { role: 'grant_manager', name: 'Grant manager' });
  call('sci', mod.register_person, { role: 'scientist', name: 'Scientist' });
});

const submit = (who: string, grantId = A, price = 640) =>
  call(who, mod.submit_request, { item: 'Nitrile gloves', category: 'lab supplies', price, grantId, purpose: 'Aim 2', sharedWith: [] });
const lastRequest = () => rows('request').sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })).at(-1);

test('the fixtures load with grant A frozen by a court order without payment', () => {
  const g = db().grant.id.find(A);
  expect(g.status).toBe('restored_by_court');
  expect(g.frozen).toBe(true);
  expect(g.available).toBe(236_250);
});

test('an identity binds to one agent role, and a role to one identity', () => {
  expect(() => call('pa', mod.register_agent, { role: 'bookkeeping' })).toThrow(/already the payment_report/);
  expect(() => call('someone-else', mod.register_agent, { role: 'payment_report' })).toThrow(/another identity/);
  expect(() => call('pa', mod.register_person, { role: 'grant_manager', name: 'x' })).toThrow(/agent/);
});

test('agents cannot submit requests or decide Inbox items', () => {
  expect(() => submit('pa')).toThrow(/only people/i);
  const hold = rows('hold').find(x => x.open);
  expect(() => call('bk', mod.decide_hold, { holdId: hold.id, choice: 'reject', reason: 'no' })).toThrow(/only people/i);
});

test('the scientist cannot decide Inbox items; the grant manager must give a reason', () => {
  const hold = rows('hold').find(x => x.kind === 'invoice');
  expect(() => call('sci', mod.decide_hold, { holdId: hold.id, choice: 'reject', reason: 'no' })).toThrow(/grant_manager/);
  expect(() => call('gm', mod.decide_hold, { holdId: hold.id, choice: 'reject', reason: '  ' })).toThrow(/reason is required/);
});

test('nobody approves their own request', () => {
  submit('gm', 'R21AI182745', 6_000);
  const rq = lastRequest();
  const hold = rows('hold').find(x => x.refId === rq.id && x.open);
  expect(() => call('gm', mod.decide_hold, { holdId: hold.id, choice: 'approve', reason: 'mine' })).toThrow(/own request/);
});

test('each request names the researcher who asked, and only they can push back on it', () => {
  call('priya', mod.register_person, { role: 'scientist', name: 'Dr. Priya Nair' });
  call('marcus', mod.register_person, { role: 'scientist', name: 'Marcus Webb' });
  submit('priya', A, 7_000);
  const rq = lastRequest();
  expect(rq.requesterName).toBe('Dr. Priya Nair');
  expect(() => call('marcus', mod.push_back, { requestId: rq.id, message: 'Needed for aim 3' })).toThrow(/person who asked/);
  call('priya', mod.push_back, { requestId: rq.id, message: 'Needed for aim 3' });
  expect(rows('log').some(l => l.refId === rq.id && l.action.startsWith('Dr. Priya Nair asked to buy'))).toBe(true);
  const [hold] = rows('hold').filter(x => x.refId === rq.id && x.open);
  expect(hold.evidence[0]).toEqual({ label: 'The researcher pushed back', value: 'Needed for aim 3' });
});

const openHold = (refId: string) => rows('hold').find(x => x.refId === refId && x.open);
const approve = (refId: string, reason = 'ok') => call('gm', mod.decide_hold, { holdId: openHold(refId).id, choice: 'approve', reason });

test('every request waits for the grant office; nothing is bought until it approves', () => {
  call('sci', mod.submit_request, { item: 'Pipette tips', category: 'core facility services', price: 380, grantId: 'R21AI182745', purpose: 'Aim 1', sharedWith: [] });
  const rq = lastRequest();
  expect(rq.state).toBe('waiting_on_manager');
  expect(openHold(rq.id).title).toBe('Approve Pipette tips ($380) on R21AI182745 for Scientist?');
  expect(rows('order').filter(o => o.requestId === rq.id)).toEqual([]);

  approve(rq.id);
  expect(db().request.id.find(rq.id).state).toBe('bought');
  expect(rows('order').filter(o => o.requestId === rq.id).map(o => o.amount)).toEqual([380]);
});

test('a request that fails a rule is flagged to the grant office with the rule, not blocked', () => {
  submit('sci', 'R21AI182745', 5_001);
  const rq = lastRequest();
  const hold = openHold(rq.id);
  expect(hold.title).toMatch(/^Flagged: approve/);
  expect(hold.evidence.map((e: any) => e.label)).toContain('Under the card limit ($5,000)');
  expect(rq.state).toBe('waiting_on_manager');
  expect(rq.explanation).not.toContain('.)'); // each rule's detail ends in "."; QA nit
});

test('demo path: court order is not cash; the request on the frozen grant stays flagged until the payment lands', () => {
  submit('sci');
  const rq = lastRequest();
  expect(openHold(rq.id).evidence.map((e: any) => e.label)).toContain('Grant is active and not frozen');

  // The open sources-disagree flag also freezes A; the manager settles it first.
  const disagreement = rows('hold').find(x => x.kind === 'source_disagreement' && x.open);
  call('gm', mod.decide_hold, { holdId: disagreement.id, choice: 'pick_source', reason: 'Court order makes RePORTER right.' });
  expect(db().grant.id.find(A).frozen).toBe(true); // still frozen: no payment yet
  expect(openHold(rq.id).title).toMatch(/^Flagged/);

  call('bk', mod.post_status_event, { grantId: A, kind: 'payment_received', source: 'Payment system', summary: 'Drawdown received.', amount: 25_000 });
  const g = db().grant.id.find(A);
  expect(g.frozen).toBe(false);
  expect(g.received).toBe(205_000);
  expect(openHold(rq.id).title).toMatch(/^Approve/); // every rule passes now, but nobody bought it
  expect(ordersFor(rq.id)).toEqual([]);

  approve(rq.id, 'Money arrived.');
  expect(db().grant.id.find(A).promised).toBe(12_350 + 640);
});

test('every action writes a log row', () => {
  const before = rows('log').length;
  submit('sci', 'R21AI182745', 380);
  expect(rows('log').map(l => l.action).slice(before)).toEqual([
    'Scientist asked to buy Nitrile gloves ($380)',
    'Sent to the Inbox: Flagged: approve Nitrile gloves ($380) on R21AI182745 for Scientist?',
  ]);
});

// A fresh $380 order on B (vendor not known until the invoice: the researcher buys it), approved by the grant office, with
// nothing billed yet (the fixtures' o1 already has its matched invoice inv3).
function boughtOrder(): string {
  call('sci', mod.submit_request, { item: 'Pipette tips', category: 'core facility services', price: 380, grantId: 'R21AI182745', purpose: 'Aim 1', sharedWith: [] });
  const rq = lastRequest();
  approve(rq.id);
  return rows('order').find(o => o.requestId === rq.id).id;
}

test('a matched invoice waits for the grant office, then is charged to the grant and the researcher reimbursed', () => {
  const oid = boughtOrder();
  call('gm', mod.inject_invoice, { orderId: oid, amount: 380 });
  const inv = rows('invoice').find(i => i.orderId === oid && !i.checked);
  const before = db().grant.id.find('R21AI182745');
  call('bk', mod.check_invoice, { invoiceId: inv.id });
  expect(db().invoice.id.find(inv.id).state).toBe('matched');
  expect(db().grant.id.find('R21AI182745').spent).toBe(before.spent);

  approve(inv.id);
  const after = db().grant.id.find('R21AI182745');
  expect(db().invoice.id.find(inv.id).state).toBe('paid');
  expect(db().invoice.id.find(inv.id).timeline.at(-1).what).toBe('Charged to R21AI182745; the researcher is reimbursed');
  expect(after.spent - before.spent).toBe(380);
  expect(before.promised - after.promised).toBe(380);
});

test('a held invoice goes to the Inbox', () => {

  call('gm', mod.inject_invoice, { orderId: 'o2', amount: 2_400 });
  const bad = rows('invoice').find(i => i.orderId === 'o2' && !i.checked);
  call('bk', mod.check_invoice, { invoiceId: bad.id });
  expect(db().invoice.id.find(bad.id).state).toBe('held');
  expect(rows('hold').some(x => x.refId === bad.id && x.open)).toBe(true);
});

test('same-day grant events apply in the order they happened', () => {
  const B = 'R21AI182745'; // fixtures: active
  const event = (kind: string, amount?: number) =>
    call('gm', mod.inject_status_event, { grantId: B, kind, source: 'Payment system', summary: kind, amount });
  for (let i = 0; i < 3; i++) {
    event('payment_received', 1_000);
    event('canceled');
    expect(db().grant.id.find(B)).toMatchObject({ status: 'canceled', frozen: true });
    event('court_order');
    event('payment_received', 1_000);
    expect(db().grant.id.find(B)).toMatchObject({ status: 'active', frozen: false });
  }
});

test('money on a canceled grant that nothing restored waits for the grant manager', () => {
  const B = 'R21AI182745'; // fixtures: active
  call('gm', mod.inject_status_event, { grantId: B, kind: 'canceled', source: 'Cancellation list (Apify)', summary: 'Terminated.', day: '2025-06-30' });
  call('gm', mod.inject_status_event, { grantId: B, kind: 'payment_received', source: 'Payment system', summary: 'Drawdown.', amount: 34_026, day: '2025-11-30' });
  expect(db().grant.id.find(B)).toMatchObject({ status: 'canceled', frozen: true });
  const hold = rows('hold').find(x => x.kind === 'paid_while_canceled' && x.grantId === B && x.open);
  expect(hold?.options).toEqual(['approve', 'reject']);

  call('gm', mod.decide_hold, { holdId: hold.id, choice: 'approve', reason: 'NIH confirmed the award is reinstated.' });
  expect(db().grant.id.find(B)).toMatchObject({ frozen: false });
  expect(rows('hold').filter(x => x.kind === 'paid_while_canceled' && x.open)).toEqual([]);
});

// Settle A's source disagreement and land a payment, so A unfreezes.
function moneyArrivesOnA(): void {
  const disagreement = rows('hold').find(x => x.kind === 'source_disagreement' && x.open);
  call('gm', mod.decide_hold, { holdId: disagreement.id, choice: 'pick_source', reason: 'Court order makes RePORTER right.' });
  call('bk', mod.post_status_event, { grantId: A, kind: 'payment_received', source: 'Payment system', summary: 'Drawdown received.', amount: 25_000 });
}
const ordersFor = (requestId: string) => rows('order').filter(o => o.requestId === requestId);

test('approving a stale hold places no second order', () => {
  submit('sci');
  const rq = lastRequest();
  moneyArrivesOnA();
  approve(rq.id);
  expect(rows('hold').filter(x => x.refId === rq.id && x.open)).toEqual([]);

  call('pa', mod.raise_hold, { kind: 'purchase', refId: rq.id, grantId: A, title: 'Buy gloves?', why: 'stale', evidence: [], options: [] });
  const stale = rows('hold').find(x => x.refId === rq.id && x.open);
  call('gm', mod.decide_hold, { holdId: stale.id, choice: 'approve', reason: 'ok' });
  expect(ordersFor(rq.id)).toHaveLength(1);
});

test('a payment after the court order closes the "no payment yet" flag', () => {
  expect(rows('flag').some(f => f.grantId === A && f.kind === 'court_order_no_payment' && f.open)).toBe(true);
  moneyArrivesOnA();
  expect(rows('flag').filter(f => f.grantId === A && f.kind === 'court_order_no_payment' && f.open)).toEqual([]);
});

// ── Smoke-test fixes (T36) ────────────────────────────────────────────────

const B = 'R21AI182745';
// A $400 invoice on a fresh, open $380 order: held for the amount.
function heldInvoice(): { inv: any; hold: any; oid: string } {
  const oid = boughtOrder();
  call('gm', mod.inject_invoice, { orderId: oid, amount: 400 });
  const inv = rows('invoice').find(i => i.orderId === oid && !i.checked);
  call('bk', mod.check_invoice, { invoiceId: inv.id });
  return { inv, oid, hold: rows('hold').find(x => x.kind === 'invoice' && x.refId === inv.id && x.open) };
}
const openInvoiceHolds = (invoiceId: string) => rows('hold').filter(x => x.kind === 'invoice' && x.refId === invoiceId && x.open);

test('asking the vendor keeps an Inbox item open whose decision settles the invoice', () => {
  const { inv, hold, oid } = heldInvoice();
  call('gm', mod.decide_hold, { holdId: hold.id, choice: 'ask_vendor', reason: 'Asking the vendor why it is $20 more.' });
  const [waiting] = openInvoiceHolds(inv.id);
  expect(waiting.title).toMatch(/^Waiting on Vendor about inv\d+/);
  expect(waiting.options).toEqual(['approve', 'reject']);
  expect(db().invoice.id.find(inv.id).state).toBe('held');

  call('gm', mod.decide_hold, { holdId: waiting.id, choice: 'approve', reason: 'Vendor says a shipping fee was agreed.' });
  expect(db().invoice.id.find(inv.id).state).toBe('paid');
  expect(openInvoiceHolds(inv.id)).toEqual([]);
});

test("the vendor's corrected invoice replaces the one asked about, so the order can be paid and claimed", () => {
  const { inv, hold, oid } = heldInvoice();
  call('gm', mod.decide_hold, { holdId: hold.id, choice: 'ask_vendor', reason: 'Asking for a corrected invoice.' });
  call('gm', mod.inject_invoice, { orderId: oid, amount: 380 });
  expect(db().invoice.id.find(inv.id).state).toBe('rejected');
  expect(openInvoiceHolds(inv.id)).toEqual([]);

  const corrected = rows('invoice').find(i => i.orderId === oid && !i.checked);
  call('bk', mod.check_invoice, { invoiceId: corrected.id });
  approve(corrected.id);
  expect(db().invoice.id.find(corrected.id).state).toBe('paid');
});

test('the "which source is right" item shows each source once, at its latest reading', () => {
  const read = (source: string, status: string) =>
    call('bk', mod.post_source_reading, { grantId: A, source, status, url: 'https://example.org' });
  read('NIH RePORTER', 'canceled');
  read('USAspending', 'active');
  call('bk', mod.raise_flag, { grantId: A, kind: 'sources_disagree', summary: 'They disagree.' });
  const hold = rows('hold').find(x => x.kind === 'source_disagreement' && x.open && x.why.startsWith('They disagree.'));
  const labels = hold.evidence.map((e: any) => e.label);
  expect(labels).toEqual([...new Set(labels)]);
  expect(hold.evidence.find((e: any) => e.label === 'NIH RePORTER').value).toMatch(/^canceled/);
  expect(hold.evidence.find((e: any) => e.label === 'USAspending').value).toMatch(/^active/);
});

test('canceling the only order of a bought request marks the request canceled', () => {
  call('sci', mod.submit_request, { item: 'Freezer service', category: 'equipment service', price: 300, grantId: B, purpose: 'Aim 1', sharedWith: [] });
  const rq = lastRequest();
  approve(rq.id);
  const [o] = ordersFor(rq.id);
  call('gm', mod.cancel_order, { orderId: o.id });
  expect(db().request.id.find(rq.id).state).toBe('canceled');
});

test('the Test lab refuses impossible dates and invoices of $0 or less', () => {
  expect(() => call('gm', mod.set_today, { day: '2026-13-45' })).toThrow(/real date/);
  expect(() => call('gm', mod.set_today, { day: '2026-02-30' })).toThrow(/real date/);
  call('gm', mod.set_today, { day: '2026-02-28' });
  expect(() => call('gm', mod.inject_invoice, { orderId: 'o1', amount: 0 })).toThrow(/more than \$0/);
  expect(() => call('gm', mod.inject_invoice, { orderId: 'o1', amount: -5 })).toThrow(/more than \$0/);
});

test('money in module-written text has thousands separators and cents only when there are any', () => {
  const oid = boughtOrder();
  call('gm', mod.inject_invoice, { orderId: oid, amount: 6_200.5 });
  const inv = rows('invoice').find(i => i.orderId === oid && !i.checked);
  call('bk', mod.check_invoice, { invoiceId: inv.id });
  const hold = rows('hold').find(x => x.refId === inv.id && x.open);
  expect(hold.title).toBe('Pay Vendor $6,200.50?');
  expect(hold.why).toBe('Invoice is $6,200.50 but the approved amount is $380.');
});

test('an approved request tells the researcher to buy it and send the invoice', () => {
  call('sci', mod.submit_request, { item: 'Plate reader service', category: 'equipment service', price: 6_000, grantId: B, purpose: 'Aim 2', sharedWith: [] });
  const rq = lastRequest();
  approve(rq.id, 'Needed for Aim 2.');
  const after = db().request.id.find(rq.id);
  expect(after.state).toBe('bought');
  expect(after.explanation).toMatch(/^The grant office approved it \(Needed for Aim 2\.\)/);
  expect(after.explanation).toMatch(/sends the invoice/);
});

test("the grant manager's approval buys a flagged request even when rules fail; there is no override", () => {
  call('sci', mod.submit_request, { item: 'Espresso machine', category: 'general office', price: 890, grantId: B, purpose: 'Lab morale', sharedWith: [] });
  const rq = lastRequest();
  const hold = rows('hold').find(x => x.refId === rq.id && x.open);
  expect(() => call('gm', mod.decide_hold, { holdId: hold.id, choice: 'override', reason: 'Buy it.' })).toThrow(/choice/);
  call('gm', mod.decide_hold, { holdId: hold.id, choice: 'approve', reason: 'Used in the shared core facility.' });
  const after = db().request.id.find(rq.id);
  expect(after.state).toBe('bought');
  expect(rows('order').filter(o => o.requestId === rq.id).map(o => [o.grantId, o.amount])).toEqual([[B, 890]]);
  expect(after.explanation).toContain('Used in the shared core facility.');
  expect(after.explanation).toMatch(/Category allowed/);
});

test("a purchase the grant manager rejects says so on the request, with the reason", () => {
  call('sci', mod.submit_request, { item: 'Plate reader service', category: 'equipment service', price: 6_000, grantId: B, purpose: 'Aim 2', sharedWith: [] });
  const rq = lastRequest();
  const hold = rows('hold').find(x => x.refId === rq.id && x.open);
  call('gm', mod.decide_hold, { holdId: hold.id, choice: 'reject', reason: 'The core facility can do this for free.' });
  const after = db().request.id.find(rq.id);
  expect(after.state).toBe('rejected');
  expect(after.explanation).toMatch(/grant manager rejected/i);
  expect(after.explanation).toContain('The core facility can do this for free.');
});

test("the grant manager's call on a held invoice goes in its trail, with the reason", () => {
  const paid = heldInvoice();
  call('gm', mod.decide_hold, { holdId: paid.hold.id, choice: 'approve', reason: 'Shipping fee was agreed.' });
  expect(db().invoice.id.find(paid.inv.id).timeline.at(-1).what).toBe('Charged to R21AI182745; the researcher is reimbursed');
  expect(db().invoice.id.find(paid.inv.id).timeline.at(-2).what).toMatch(/^Approved by the grant office.*Shipping fee was agreed\.$/);

  const refused = heldInvoice();
  call('gm', mod.decide_hold, { holdId: refused.hold.id, choice: 'reject', reason: 'We never agreed to $400.' });
  expect(db().invoice.id.find(refused.inv.id).timeline.at(-1).what).toMatch(/^Rejected by the grant manager.*We never agreed to \$400\.$/);

  const asked = heldInvoice();
  call('gm', mod.decide_hold, { holdId: asked.hold.id, choice: 'ask_vendor', reason: 'Why $20 more?' });
  expect(db().invoice.id.find(asked.inv.id).timeline.at(-1).what).toContain('Why $20 more?');
});

test('same-day purchases that dodge the card limit together are flagged, and the grant manager can approve them', () => {
  const service = (price: number) => call('sci', mod.submit_request, {
    item: 'Sequencing core run', category: 'core facility services', price, grantId: 'R21AI182745', purpose: 'Aim 1', sharedWith: [],
  });
  service(2_900);
  service(2_600);
  const rq = lastRequest();
  expect(openHold(rq.id).evidence.map((e: any) => e.label)).toContain('Under the card limit, counting same-day purchases');
  const hold = rows('hold').find(x => x.refId === rq.id && x.open);
  call('gm', mod.decide_hold, { holdId: hold.id, choice: 'approve', reason: 'Two separate experiments.' });
  expect(db().request.id.find(rq.id).state).toBe('bought');
});

test('a second bill for an order already paid is held, not paid twice', () => {
  const oid = boughtOrder();
  call('gm', mod.inject_invoice, { orderId: oid, amount: 380 });
  const first = rows('invoice').find(i => i.orderId === oid && !i.checked);
  call('bk', mod.check_invoice, { invoiceId: first.id });
  approve(first.id);
  expect(db().invoice.id.find(first.id).state).toBe('paid');
  const spent = db().grant.id.find('R21AI182745').spent;

  call('gm', mod.inject_invoice, { orderId: oid, amount: 380 });
  const again = rows('invoice').find(i => i.orderId === oid && !i.checked);
  call('bk', mod.check_invoice, { invoiceId: again.id });
  expect(db().invoice.id.find(again.id).state).toBe('held');
  expect(db().invoice.id.find(again.id).mismatch).toContain(first.id);
  expect(db().grant.id.find('R21AI182745').spent).toBe(spent);
});

test('a request an older client declares shared is checked like any other: no shared-cost rule', () => {
  call('sci', mod.submit_request, {
    item: 'Confocal time', category: 'core facility services', price: 900, grantId: B, purpose: 'Both aims', sharedWith: [B, A], oneGrantBasis: 'Same slides.',
  });
  const rq = lastRequest();
  const checked = db().request.id.find(rq.id);
  expect(checked.verdicts.filter((v: any) => !v.pass)).toEqual([]);
  expect(checked.sharedWith).toEqual([]);
});

// ── Experiment plans (T71) ────────────────────────────────────────────────

const B2 = 'R21AI182745';
const planArgs = (status: string, overall = 'aligned') => ({
  id: 'pl-test', status, grantId: B2, experiment: 'Organoid imaging, aim 1', total: 1_500, overall,
  lines: [
    { line: 1, item: 'Matrigel', category: 'lab supplies', price: 900, purpose: 'For: organoid imaging' },
    { line: 3, item: 'Antibody panel', category: 'lab supplies', price: 600, purpose: 'For: organoid imaging' },
  ],
  body: '{}', report: status === 'draft' ? '' : '{"overall":"' + overall + '"}',
});
const planRequests = () => rows('request').filter(r => r.purpose === 'For: organoid imaging');

test('a researcher saves a plan that everyone sees; only they can change or delete it', () => {
  call('priya', mod.register_person, { role: 'scientist', name: 'Dr. Priya Nair' });
  call('priya', mod.save_plan, planArgs('draft'));
  expect(db().plan.id.find('pl-test')).toMatchObject({ researcher: 'Dr. Priya Nair', status: 'draft', total: 1_500 });
  expect(() => call('sci', mod.save_plan, planArgs('draft'))).toThrow(/researcher who wrote/);
  expect(() => call('sci', mod.delete_plan, { id: 'pl-test' })).toThrow(/researcher who wrote/);
  expect(() => call('gm', mod.save_plan, planArgs('draft'))).toThrow(/scientist/);
  call('priya', mod.delete_plan, { id: 'pl-test' });
  expect(db().plan.id.find('pl-test')).toBeFalsy();
});

test('a plan that clears every check becomes one request per line in the researcher\'s name', () => {
  call('priya', mod.register_person, { role: 'scientist', name: 'Dr. Priya Nair' });
  expect(() => call('priya', mod.save_plan, planArgs('sent', 'clarify'))).toThrow(/submit it for review/);
  call('priya', mod.save_plan, planArgs('sent'));
  expect(planRequests().map(r => [r.item, r.price, r.requesterName, r.grantId, r.state])).toEqual([
    ['Matrigel', 900, 'Dr. Priya Nair', B2, 'waiting_on_manager'],
    ['Antibody panel', 600, 'Dr. Priya Nair', B2, 'waiting_on_manager'],
  ]);
  expect(() => call('priya', mod.save_plan, planArgs('draft'))).toThrow(/already requests/);
  expect(() => call('priya', mod.delete_plan, { id: 'pl-test' })).toThrow(/already requests/);
});

test('the grant manager approves or returns a submitted plan, with a reason', () => {
  call('priya', mod.register_person, { role: 'scientist', name: 'Dr. Priya Nair' });
  call('priya', mod.save_plan, planArgs('submitted', 'clarify'));
  expect(planRequests()).toHaveLength(0);
  expect(() => call('sci', mod.decide_plan, { id: 'pl-test', choice: 'approve', reason: 'ok' })).toThrow(/grant_manager/);
  expect(() => call('gm', mod.decide_plan, { id: 'pl-test', choice: 'approve', reason: ' ' })).toThrow(/reason is required/);
  call('gm', mod.decide_plan, { id: 'pl-test', choice: 'return', reason: 'Say which aim the antibodies serve.' });
  expect(db().plan.id.find('pl-test')).toMatchObject({ status: 'returned', decisionChoice: 'return', decisionReason: 'Say which aim the antibodies serve.' });
  expect(() => call('gm', mod.decide_plan, { id: 'pl-test', choice: 'approve', reason: 'ok' })).toThrow(/not waiting/);
  call('priya', mod.save_plan, planArgs('submitted', 'clarify'));
  call('gm', mod.decide_plan, { id: 'pl-test', choice: 'approve', reason: 'Aim 1 covers both.' });
  expect(db().plan.id.find('pl-test').status).toBe('sent');
  expect(planRequests()).toHaveLength(2);
});
