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

test('a held invoice goes to the Inbox; a matched one is paid and moves money from promised to spent', () => {
  call('gm', mod.inject_invoice, { orderId: 'o1', amount: 380 });
  const inv = rows('invoice').find(i => i.orderId === 'o1' && !i.checked);
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
