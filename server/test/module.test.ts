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
  call('pa', mod.register_agent, { role: 'purchasing' });
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
  expect(() => call('pa', mod.register_agent, { role: 'bookkeeping' })).toThrow(/already the purchasing/);
  expect(() => call('someone-else', mod.register_agent, { role: 'purchasing' })).toThrow(/another identity/);
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
  call('pa', mod.act_on_request, { requestId: rq.id, action: 'hold', grantId: 'R21AI182745', vendor: 'V', explanation: 'Over the card limit.' });
  const hold = rows('hold').find(x => x.refId === rq.id && x.open);
  expect(() => call('gm', mod.decide_hold, { holdId: hold.id, choice: 'approve', reason: 'mine' })).toThrow(/own request/);
});

test('each request names the researcher who asked, and only they can push back on it', () => {
  call('priya', mod.register_person, { role: 'scientist', name: 'Dr. Priya Nair' });
  call('marcus', mod.register_person, { role: 'scientist', name: 'Marcus Webb' });
  submit('priya', A, 7_000);
  const rq = lastRequest();
  expect(rq.requesterName).toBe('Dr. Priya Nair');
  call('pa', mod.act_on_request, { requestId: rq.id, action: 'hold', grantId: A, vendor: 'V', explanation: 'Over the card limit.' });
  expect(() => call('marcus', mod.push_back, { requestId: rq.id, message: 'Needed for aim 3' })).toThrow(/person who asked/);
  call('priya', mod.push_back, { requestId: rq.id, message: 'Needed for aim 3' });
  expect(rows('log').some(l => l.refId === rq.id && l.action.startsWith('Dr. Priya Nair asked to buy'))).toBe(true);
});

test('the purchasing agent cannot buy over the card limit on its own', () => {
  submit('sci', 'R21AI182745', 5_001);
  const rq = lastRequest();
  expect(() => call('pa', mod.act_on_request, { requestId: rq.id, action: 'buy', vendor: 'V', explanation: 'buy' })).toThrow(/card limit/);
  expect(rows('order').some(o => o.requestId === rq.id)).toBe(false);
});

test('demo path: court order is not cash; the purchase goes through only after the payment lands', () => {
  submit('sci');
  const rq = lastRequest();
  expect(() => call('pa', mod.act_on_request, { requestId: rq.id, action: 'buy', vendor: 'V', explanation: 'buy' }))
    .toThrow(/not frozen/);

  // The open sources-disagree flag also freezes A; the manager settles it first.
  const disagreement = rows('hold').find(x => x.kind === 'source_disagreement' && x.open);
  call('gm', mod.decide_hold, { holdId: disagreement.id, choice: 'pick_source', reason: 'Court order makes RePORTER right.' });
  expect(db().grant.id.find(A).frozen).toBe(true); // still frozen: no payment yet

  call('bk', mod.post_status_event, { grantId: A, kind: 'payment_received', source: 'Payment system', summary: 'Drawdown received.', amount: 25_000 });
  const g = db().grant.id.find(A);
  expect(g.frozen).toBe(false);
  expect(g.received).toBe(205_000);

  call('pa', mod.act_on_request, { requestId: rq.id, action: 'buy', vendor: 'LabSource', explanation: 'Money arrived; every rule passes.' });
  expect(db().request.id.find(rq.id).state).toBe('bought');
  expect(db().grant.id.find(A).promised).toBe(12_350 + 640);
});

test('every action writes a log row', () => {
  const before = rows('log').length;
  submit('sci', 'R21AI182745', 380);
  call('pa', mod.evaluate_request, { requestId: lastRequest().id, split: [] });
  expect(rows('log').length).toBe(before + 2);
});

// A fresh $380 LabSource order on B, bought by the agent, with nothing billed yet
// (the fixtures' o1 already has its matched invoice inv3).
function boughtOrder(): string {
  call('sci', mod.submit_request, { item: 'Pipette tips', category: 'core facility services', price: 380, grantId: 'R21AI182745', purpose: 'Aim 1', sharedWith: [] });
  const rq = lastRequest();
  call('pa', mod.act_on_request, { requestId: rq.id, action: 'buy', vendor: 'LabSource', explanation: 'Every rule passes.' });
  return rows('order').find(o => o.requestId === rq.id).id;
}

test('a held invoice goes to the Inbox; a matched one is paid and moves money from promised to spent', () => {
  const oid = boughtOrder();
  call('gm', mod.inject_invoice, { orderId: oid, amount: 380 });
  const inv = rows('invoice').find(i => i.orderId === oid && !i.checked);
  const before = db().grant.id.find('R21AI182745');
  call('bk', mod.check_invoice, { invoiceId: inv.id });
  const after = db().grant.id.find('R21AI182745');
  expect(db().invoice.id.find(inv.id).state).toBe('paid');
  expect(after.spent - before.spent).toBe(380);
  expect(before.promised - after.promised).toBe(380);

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
    event('payment_received', 1_000);
    expect(db().grant.id.find(B)).toMatchObject({ status: 'active', frozen: false });
  }
});

// Settle A's source disagreement and land a payment, so A unfreezes.
function moneyArrivesOnA(): void {
  const disagreement = rows('hold').find(x => x.kind === 'source_disagreement' && x.open);
  call('gm', mod.decide_hold, { holdId: disagreement.id, choice: 'pick_source', reason: 'Court order makes RePORTER right.' });
  call('bk', mod.post_status_event, { grantId: A, kind: 'payment_received', source: 'Payment system', summary: 'Drawdown received.', amount: 25_000 });
}
const ordersFor = (requestId: string) => rows('order').filter(o => o.requestId === requestId);

test('buying a held request closes its hold, and approving a stale hold places no second order', () => {
  submit('sci');
  const rq = lastRequest();
  call('pa', mod.act_on_request, { requestId: rq.id, action: 'hold', grantId: A, vendor: 'V', explanation: 'Grant is frozen.' });
  moneyArrivesOnA();
  call('pa', mod.act_on_request, { requestId: rq.id, action: 'buy', grantId: A, vendor: 'LabSource', explanation: 'Money arrived.' });
  expect(rows('hold').filter(x => x.refId === rq.id && x.open)).toEqual([]);

  call('pa', mod.raise_hold, { kind: 'purchase', refId: rq.id, grantId: A, title: 'Buy gloves?', why: 'stale', evidence: [], options: [] });
  const stale = rows('hold').find(x => x.refId === rq.id && x.open);
  call('gm', mod.decide_hold, { holdId: stale.id, choice: 'approve', reason: 'ok' });
  expect(ordersFor(rq.id)).toHaveLength(1);
});

test('a rerouted request cannot be bought again', () => {
  call('sci', mod.submit_request, { item: 'Centrifuge service', category: 'equipment service', price: 900, grantId: A, purpose: 'Aim 1', sharedWith: [] });
  const rq = lastRequest();
  call('pa', mod.act_on_request, { requestId: rq.id, action: 'reroute', grantId: 'R21AI182745', vendor: 'V', explanation: 'A is frozen.' });
  expect(db().request.id.find(rq.id).state).toBe('rerouted');
  expect(() => call('pa', mod.act_on_request, { requestId: rq.id, action: 'buy', grantId: 'R21AI182745', vendor: 'V', explanation: 'again' })).toThrow(/already rerouted/);
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
  call('gm', mod.decide_hold, { holdId: hold.id, choice: 'ask_vendor', reason: 'Asking LabSource why it is $20 more.' });
  const [waiting] = openInvoiceHolds(inv.id);
  expect(waiting.title).toMatch(/^Waiting on LabSource about inv\d+/);
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
  call('pa', mod.act_on_request, { requestId: rq.id, action: 'buy', vendor: 'LabSource', explanation: 'Every rule passes.' });
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
  expect(hold.title).toBe('Pay LabSource $6,200.50?');
  expect(hold.why).toBe('Invoice is $6,200.50 but the approved amount is $380.');
});

test('a purchase the grant manager approves is explained as approved and bought, not held', () => {
  call('sci', mod.submit_request, { item: 'Plate reader service', category: 'equipment service', price: 6_000, grantId: B, purpose: 'Aim 2', sharedWith: [] });
  const rq = lastRequest();
  call('pa', mod.act_on_request, { requestId: rq.id, action: 'hold', grantId: B, vendor: 'V', explanation: `Held ${rq.item} ($6,000) on ${B} for the grant manager.` });
  const hold = rows('hold').find(x => x.refId === rq.id && x.open);
  call('gm', mod.decide_hold, { holdId: hold.id, choice: 'approve', reason: 'Needed for Aim 2.' });
  const after = db().request.id.find(rq.id);
  expect(after.state).toBe('bought');
  expect(after.explanation).not.toMatch(/^Held/);
  expect(after.explanation).toMatch(/approved/i);
  expect(after.explanation).toContain('Needed for Aim 2.');
});

test('same-day purchases that dodge the card limit together cannot be bought by the agent, but the grant manager can approve them', () => {
  const service = (price: number) => call('sci', mod.submit_request, {
    item: 'Sequencing core run', category: 'core facility services', price, grantId: 'R21AI182745', purpose: 'Aim 1', sharedWith: [],
  });
  service(2_900);
  service(2_600);
  const rq = lastRequest();
  call('pa', mod.evaluate_request, { requestId: rq.id, split: [] });
  expect(() => call('pa', mod.act_on_request, { requestId: rq.id, action: 'buy', vendor: 'V', explanation: 'buy' })).toThrow(/same-day/);

  call('pa', mod.act_on_request, { requestId: rq.id, action: 'hold', vendor: 'V', explanation: 'Looks split to stay under the card limit.' });
  const hold = rows('hold').find(x => x.refId === rq.id && x.open);
  call('gm', mod.decide_hold, { holdId: hold.id, choice: 'approve', reason: 'Two separate experiments.' });
  expect(db().request.id.find(rq.id).state).toBe('bought');
});

test('a second bill for an order already paid is held, not paid twice', () => {
  const oid = boughtOrder();
  call('gm', mod.inject_invoice, { orderId: oid, amount: 380 });
  const first = rows('invoice').find(i => i.orderId === oid && !i.checked);
  call('bk', mod.check_invoice, { invoiceId: first.id });
  expect(db().invoice.id.find(first.id).state).toBe('paid');
  const spent = db().grant.id.find('R21AI182745').spent;

  call('gm', mod.inject_invoice, { orderId: oid, amount: 380 });
  const again = rows('invoice').find(i => i.orderId === oid && !i.checked);
  call('bk', mod.check_invoice, { invoiceId: again.id });
  expect(db().invoice.id.find(again.id).state).toBe('held');
  expect(db().invoice.id.find(again.id).mismatch).toContain(first.id);
  expect(db().grant.id.find('R21AI182745').spent).toBe(spent);
});

test('the grant manager can approve a shared cost charged in full to one grant only when the requester stated why', () => {
  const ask = (oneGrantBasis?: string) => {
    call('sci', mod.submit_request, {
      item: 'Confocal time', category: 'core facility services', price: 900, grantId: B, purpose: 'Both aims', sharedWith: [B, A], oneGrantBasis,
    });
    const rq = lastRequest();
    call('pa', mod.evaluate_request, { requestId: rq.id, split: [] });
    call('pa', mod.act_on_request, { requestId: rq.id, action: 'hold', vendor: 'V', explanation: 'Held: shared cost.' });
    const hold = rows('hold').find(x => x.refId === rq.id && x.open);
    call('gm', mod.decide_hold, { holdId: hold.id, choice: 'approve', reason: 'OK.' });
    return db().request.id.find(rq.id);
  };
  expect(ask().state).toBe('blocked');
  const flagged = ask('Both aims image the same slides in one session.');
  expect(flagged.state).toBe('bought');
  expect(flagged.oneGrantBasis).toBe('Both aims image the same slides in one session.');
  expect(ordersFor(flagged.id).map((o: any) => o.grantId)).toEqual([B]);
});
