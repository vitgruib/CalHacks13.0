// The bookkeeping agent's invoice check (docs/MASTER-PLAN.md §3.3, P4). Every
// invoice that hasn't been checked goes to Track A's check_invoice, which
// matches it to its order and approval and either pays it or holds it with a
// timeline and an Inbox item. The agent never decides the match itself.
//
// It re-checks a held invoice once when its order is canceled or changes
// amount, or a new approval lands for it. It never re-checks because an order
// was paid: that's the result of an invoice, not news about the order.
//
// The module's Inbox item says what's wrong and when, but not which records
// conflict. Right after the module holds an invoice, the agent raises the same
// item again (the module replaces the older one) with every line the module
// wrote kept word for word, plus the rule the module cited and the invoice,
// order and approval by id and exact amount. When Claude is on, a short note
// on what evidence is missing is added after the module's reason.

import type { ApprovalRow, Evidence, HoldRow, InvoiceRow, OrderRow } from '../db/contract.ts';
import { noteOnHeldInvoice, type HeldInvoice } from '../prompts/invoices.ts';
import { workQueue, type AgentContext, type AgentHandle } from './types.ts';

// Money is whole dollars in the module, but the Test lab takes any amount, so
// cents are shown when there are any.
export const dollars = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;

// The module refuses to check these again.
const settled = (invoice: InvoiceRow) => invoice.state === 'paid' || invoice.state === 'rejected';
const waiting = (invoice: InvoiceRow) => !invoice.checked && !settled(invoice);
const recheckable = (invoice: InvoiceRow) => invoice.checked && (invoice.state === 'held' || invoice.state === 'matched');

// The parts of an order an invoice is matched against. Its state only counts
// as canceled or not, so an order being paid isn't a change.
const orderTerms = (order: OrderRow | undefined) =>
  order ? [order.state === 'canceled', order.canceledOn ?? null, order.amount, order.changedAmount ?? null] : null;
const matchedAgainst = (order: OrderRow | undefined, approvals: ApprovalRow[]) =>
  JSON.stringify([orderTerms(order), approvals.map((approval) => [approval.id, approval.amount, approval.day])]);

// News about an order that its invoices were matched against: it was canceled
// or its amount changed. Nothing in the module un-cancels an order; only a
// world reloaded in the Test lab does that, and it rewrites the invoices too.
const orderNews = (before: OrderRow, after: OrderRow) =>
  (after.state === 'canceled' && before.state !== 'canceled') ||
  after.amount !== before.amount ||
  (after.changedAmount ?? null) !== (before.changedAmount ?? null);

function orderLine(order: OrderRow): string {
  const changed = order.changedAmount === undefined ? '' : `, changed to ${dollars(order.changedAmount)}`;
  const grant = order.grantId ? ` on ${order.grantId}` : '';
  const state = order.state === 'canceled' ? `canceled${order.canceledOn ? ` ${order.canceledOn}` : ''}` : order.state;
  return `${dollars(order.amount)}${changed}, placed ${order.placed} for ${order.requestId}${grant}; ${state}`;
}

/** The records behind a held invoice, by id and exact amount, as Inbox evidence lines. */
export function recordLines(held: HeldInvoice): Evidence[] {
  const { invoice, order, approvals, rule } = held;
  const lines: Evidence[] = [];
  if (rule) lines.push({ label: 'Rule', value: rule });
  lines.push({ label: `Invoice ${invoice.id}`, value: `${dollars(invoice.amount)} from ${invoice.vendor}, received ${invoice.received}` });
  if (!order) {
    lines.push({ label: 'Order', value: `No order ${invoice.orderId} on file` });
    return lines;
  }
  lines.push({ label: `Order ${order.id}`, value: orderLine(order) });
  for (const approval of approvals) {
    lines.push({ label: `Approval ${approval.id}`, value: `${dollars(approval.amount)} by the ${approval.by.replace(/_/g, ' ')} on ${approval.day}` });
  }
  if (approvals.length === 0) lines.push({ label: 'Approval', value: `None on file for ${order.id}` });
  return lines;
}

/**
 * The module's Inbox item with the records added: its title, reason, evidence
 * and options are kept as written, the records come after its evidence, and
 * Claude's note (if any) after its reason.
 */
export function explainedHold(hold: HoldRow, held: HeldInvoice, note?: string) {
  return {
    kind: 'invoice' as const,
    refId: hold.refId,
    grantId: hold.grantId,
    title: hold.title,
    why: note ? `${hold.why} ${note}` : hold.why,
    evidence: [...hold.evidence, ...recordLines(held)],
    options: [...hold.options],
  };
}

export function startInvoices({ conn, tracker }: AgentContext): AgentHandle {
  const queue = workQueue('invoices');
  let stopped = false;
  // What each invoice was matched against when this agent last checked it, so
  // one change to its order re-checks it once.
  const checkedAgainst = new Map<string, string>();

  const invoiceById = (id: string) => conn.rows('invoice').find((row) => row.id === id);
  const orderById = (id: string) => conn.rows('order').find((row) => row.id === id);
  const approvalsFor = (orderId: string) => conn.rows('approval').filter((row) => row.orderId === orderId);
  const latestHoldId = () => conn.rows('hold').reduce((max, hold) => (hold.id > max ? hold.id : max), 0n);

  async function check(invoiceId: string): Promise<void> {
    const invoice = invoiceById(invoiceId);
    if (stopped || !invoice || settled(invoice)) return;
    const order = orderById(invoice.orderId);
    // Paying an invoice moves money, so read the grant's sources first.
    if (order && conn.rows('grant').some((grant) => grant.id === order.grantId)) await tracker.refresh(order.grantId);
    if (stopped) return;

    const terms = matchedAgainst(orderById(invoice.orderId), approvalsFor(invoice.orderId));
    const before = latestHoldId();
    await conn.call('check_invoice', { invoiceId });
    checkedAgainst.set(invoiceId, terms);

    const after = invoiceById(invoiceId);
    if (after?.state !== 'held') return;
    const raised = conn
      .rows('hold')
      .filter((hold) => hold.kind === 'invoice' && hold.refId === invoiceId && hold.open && hold.id > before)
      .at(-1);
    if (raised) await explain(after, raised);
  }

  async function explain(invoice: InvoiceRow, hold: HoldRow): Promise<void> {
    const order = orderById(invoice.orderId);
    const held: HeldInvoice = {
      invoice,
      order,
      approvals: approvalsFor(invoice.orderId),
      finding: invoice.mismatch ?? hold.why,
      rule: conn.rows('log').findLast((row) => row.refId === invoice.id && row.rule !== undefined)?.rule,
      item: order ? conn.rows('request').find((request) => request.id === order.requestId)?.item : undefined,
    };
    const note = await noteOnHeldInvoice(held);
    // Decided (or replaced) while Claude was writing: raising it again would
    // reopen a decided item.
    const current = conn.rows('hold').find((row) => row.id === hold.id);
    if (stopped || !current?.open) return;
    await conn.call('raise_hold', explainedHold(current, held, note));
  }

  async function checkIfWaiting(invoiceId: string): Promise<void> {
    const invoice = invoiceById(invoiceId);
    if (invoice && waiting(invoice)) await check(invoiceId);
  }

  async function recheckOrder(orderId: string): Promise<void> {
    const terms = matchedAgainst(orderById(orderId), approvalsFor(orderId));
    for (const invoice of conn.rows('invoice')) {
      if (invoice.orderId !== orderId || !recheckable(invoice)) continue;
      if (checkedAgainst.get(invoice.id) === terms) continue;
      await check(invoice.id);
    }
  }

  const onInvoice = (invoice: InvoiceRow) => {
    if (waiting(invoice)) void queue.push(`check ${invoice.id}`, () => checkIfWaiting(invoice.id));
  };
  // An invoice that arrives already checked (the world at startup, or one the
  // Test lab loads) was matched against what's on file now, so only later news
  // about its order re-checks it. Without this, loading a world re-checks its
  // checked invoices because their approvals arrive as new rows, and pays the
  // ones the seed left at 'matched'.
  const onArrival = (invoice: InvoiceRow) => {
    if (invoice.checked) checkedAgainst.set(invoice.id, matchedAgainst(orderById(invoice.orderId), approvalsFor(invoice.orderId)));
    onInvoice(invoice);
  };
  const onOrderChange = (orderId: string) => {
    void queue.push(`re-check invoices for ${orderId}`, () => recheckOrder(orderId));
  };

  // The world is loaded before agents start: check what's already waiting.
  for (const invoice of conn.rows('invoice')) onArrival(invoice);
  const stops = [
    conn.onInsert('invoice', onArrival),
    // A reloaded world brings invoices back unchecked under the same ids.
    conn.onUpdate('invoice', (_before, after) => onInvoice(after)),
    conn.onUpdate('order', (before, after) => {
      if (orderNews(before, after)) onOrderChange(after.id);
    }),
    conn.onInsert('approval', (approval) => {
      if (conn.rows('invoice').some((invoice) => invoice.orderId === approval.orderId && recheckable(invoice))) onOrderChange(approval.orderId);
    }),
  ];

  return {
    idle: () => queue.idle(),
    stop() {
      stopped = true;
      for (const stop of stops) stop();
    },
  };
}
