// The payment and report agent's payment request writer (P5, MASTER-PLAN
// §3.4). For each grant it drafts the payment request for the last full
// calendar month (every month that ended, when the clock jumps past several),
// and it answers the funder's follow-up questions with the exact purchases
// behind a request. Track A's module picks what a request includes, leaves
// held spending out and computes the amount; this agent only writes the
// words. Both drafts wait in the Inbox for the grant manager.
//
// - A frozen grant (canceled or disputed) gets no request. The module
//   doesn't refuse one, but frozen spending can't be claimed (§3.4), so the
//   agent waits until the module unfreezes the grant. An ended grant is
//   frozen in the module too, but what it spent before its end stays
//   claimable for the 120 days closeout allows (2 CFR 200.344), unless it
//   would be frozen anyway.
// - The explanation has to exist before the module picks, so the agent copies
//   the module's selection to describe it, then reads the drafted row back. If
//   the module picked differently, its lists win: the agent drafts again from
//   them and asks the grant manager to reject the first draft.
// - Claude's text is only used when every id and dollar amount in it comes
//   from the records; otherwise the template is.

import { PAYMENT_EXPLANATION_MAX } from '../../../server/src/vocab.ts';
import { ask } from '../claude.ts';
import type { Connection, FollowUpRow, GrantRow, InvoiceRow, PaymentRequestRow } from '../db/contract.ts';
import { loadRules, type SpendingRules } from './purchasing.ts';
import {
  ANSWER_MAX,
  ANSWER_SYSTEM,
  AnswerSchema,
  EXPLAIN_SYSTEM,
  ExplanationSchema,
  type AnswerText,
  type ExplanationText,
} from '../prompts/payment-requests.ts';
import { workQueue, type AgentContext, type AgentHandle } from './types.ts';

const AGENT = 'payment-requests';
// Days after a grant's end it can still be paid for what it spent before (2 CFR 200.344).
export const CLOSEOUT_DAYS = 120;
// The rule the module logs when it drafts a request (server/src/index.ts).
const HELD_RULE = 'Held spending is left out';

export interface Period {
  from: string;
  to: string;
}

/** The last full calendar month before `today` (both YYYY-MM-DD). */
export function lastFullMonth(today: string): Period {
  const [year, month] = today.split('-').map(Number);
  const day = (date: Date) => date.toISOString().slice(0, 10);
  return { from: day(new Date(Date.UTC(year, month - 2, 1))), to: day(new Date(Date.UTC(year, month - 1, 0))) };
}

// The most months one move of the clock drafts, so a jump of years can't
// queue years of drafts.
export const MONTHS_PER_MOVE = 12;

/** The full calendar months whose last day is on or after `from` and before `to`, oldest first; at most `max`, the most recent. */
export function monthsEnded(from: string, to: string, max = MONTHS_PER_MOVE): Period[] {
  const periods: Period[] = [];
  for (let period = lastFullMonth(to); period.to >= from && periods.length < max; period = lastFullMonth(period.from)) periods.unshift(period);
  return periods;
}

// ── Money and ids as they appear in text ──────────────────────────────────

const cents = (n: number) => Math.round(n * 100) / 100;
const sum = (amounts: number[]) => cents(amounts.reduce((total, n) => total + n, 0));
const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;

export function money(n: number): string {
  const value = cents(n);
  const digits = Number.isInteger(value) ? 0 : 2;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// Record ids as the seed (rq-036, pay-R21-2026-05-1) and the module (rq5, pr1) write them.
// A payroll id has a digit somewhere, so "pay-period" isn't one.
const ID = /\b(?:(?:rq|inv|ap|pr|fu|o)-?\d+|pay-(?=[A-Za-z0-9-]*\d)[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\b/g;
export const mentionedIds = (text: string): string[] => [...new Set(text.match(ID) ?? [])];

const AMOUNT = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g;
const mentionedAmounts = (text: string): number[] =>
  [...text.matchAll(AMOUNT)].map((m) => Number(`${m[1].replace(/,/g, '')}${m[2] ? `.${m[2]}` : ''}`));

// Shortens text to at most `max` characters at a space, so no id or amount is
// cut in half: "rq-123" cut to "rq-12" would name a purchase that isn't there.
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1);
  const space = head.lastIndexOf(' ');
  return `${(space > 0 ? head.slice(0, space) : head).replace(/[\s;,:(]+$/, '')}…`;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
// "Research technician" reads as "research technician"; "PI" and "BamA" stay.
const lower = (text: string) => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);
const sentence = (text: string) => text.replace(/[.\s]+$/, '');

// ── What a payment request claims ─────────────────────────────────────────

/**
 * One order on the grant, with what its request says it was for. Text names
 * a purchase by its request id only, the id the payment request lists, so
 * order, invoice and approval ids are kept out.
 */
interface Purchase {
  requestId: string;
  item: string;
  category: string;
  aim: string;
  vendor: string;
  ordered: string;
  amount: number;
  changedFrom?: number;
  sharePct?: number;
  invoice?: { state: string; amount: number; received: string };
  approvedAmounts: number[];
}
interface Personnel {
  payrollId: string;
  role: string;
  effortPct: number;
  from: string;
  to: string;
  amount: number;
}
interface LeftOut {
  requestId: string;
  item: string;
  amount?: number;
  why: string;
  invoiceId?: string;
  ids: string[];
}

/** One payment request's contents (the module's picks, or our copy of them) with the records behind them. */
export interface Claim {
  grant: GrantRow;
  period: Period;
  total: number;
  purchases: Purchase[];
  personnel: Personnel[];
  leftOut: LeftOut[];
  includedRequestIds: string[];
  includedPayrollIds: string[];
  excludedRequestIds: string[];
  // Invoices nobody has checked yet. A held one is left out only because it is
  // new; any other may still be held by its check, which takes its purchase out.
  unchecked: string[];
}

interface Picks {
  includedRequestIds: string[];
  includedPayrollIds: string[];
  excluded: { requestId: string; why: string; invoice?: InvoiceRow }[];
}

const heldWhy = (invoice: InvoiceRow) =>
  `invoice ${invoice.id} is on hold${invoice.mismatch ? ` (${sentence(invoice.mismatch)})` : invoice.checked ? '' : ' until it is checked'}`;

// A copy of the selection in Track A's draft_payment_request
// (server/src/index.ts), so the explanation can be written before the module
// picks: orders on the grant placed in the period and not canceled, minus any
// with a held invoice; held invoices on the grant that arrived in the period;
// payroll rows wholly inside the period. Only the picking is copied; the
// module's own lists and amount are read back after the draft and win.
function modulePicks(conn: Connection, grantId: string, { from, to }: Period): Picks {
  const inRange = (day: string) => day >= from && day <= to;
  const orders = conn.rows('order');
  const invoices = conn.rows('invoice');
  const included: string[] = [];
  const excluded: Picks['excluded'] = [];
  for (const order of orders) {
    if (order.grantId !== grantId || !inRange(order.placed) || order.state === 'canceled') continue;
    const held = invoices.find((invoice) => invoice.orderId === order.id && invoice.state === 'held');
    if (held) {
      excluded.push({ requestId: order.requestId, why: heldWhy(held), invoice: held });
      continue;
    }
    if (!included.includes(order.requestId)) included.push(order.requestId);
  }
  const orderById = new Map(orders.map((order) => [order.id, order]));
  for (const invoice of invoices) {
    const order = orderById.get(invoice.orderId);
    if (invoice.state !== 'held' || order?.grantId !== grantId || !inRange(invoice.received)) continue;
    if (excluded.some((e) => e.requestId === order.requestId)) continue;
    excluded.push({ requestId: order.requestId, why: heldWhy(invoice), invoice });
  }
  const payroll = conn.rows('payroll').filter((row) => row.grantId === grantId && row.from >= from && row.to <= to);
  return { includedRequestIds: included, includedPayrollIds: payroll.map((row) => row.id), excluded };
}

const rowPicks = (row: PaymentRequestRow): Picks => ({
  includedRequestIds: row.includedRequestIds,
  includedPayrollIds: row.includedPayrollIds,
  excluded: row.excluded.map((e) => ({ requestId: e.requestId, why: e.why })),
});

// The records behind a set of picks. For a draft, an order with a held
// invoice is not counted (as in the module); for a follow-up on a drafted
// request, every order the request names is.
function describe(conn: Connection, grant: GrantRow, period: Period, picks: Picks, { total, forDraft }: { total?: number; forDraft: boolean }): Claim {
  const requests = new Map(conn.rows('request').map((request) => [request.id, request]));
  const invoices = conn.rows('invoice');
  const approvals = conn.rows('approval');
  const orders = conn.rows('order').filter((order) => order.grantId === grant.id && order.state !== 'canceled');
  const inRange = (day: string) => day >= period.from && day <= period.to;
  const isHeld = (orderId: string) => invoices.some((invoice) => invoice.orderId === orderId && invoice.state === 'held');
  const notYetChecked = (invoice: InvoiceRow) => !invoice.checked && invoice.state !== 'paid' && invoice.state !== 'rejected';
  const ordersOf = (requestId: string) => {
    const all = orders.filter((order) => order.requestId === requestId);
    const inPeriod = all.filter((order) => inRange(order.placed));
    if (forDraft) return inPeriod.filter((order) => !isHeld(order.id));
    return inPeriod.length ? inPeriod : all;
  };

  const unchecked = new Set<string>();
  const purchases: Purchase[] = picks.includedRequestIds.flatMap((requestId) =>
    ordersOf(requestId).map((order) => {
      for (const invoice of invoices) if (invoice.orderId === order.id && notYetChecked(invoice)) unchecked.add(invoice.id);
      const request = requests.get(requestId);
      const share = request && request.split.length > 1 ? request.split.find((s) => s.grantId === grant.id)?.share : undefined;
      const invoice = invoices.filter((row) => row.orderId === order.id && row.state !== 'rejected').at(-1);
      return {
        requestId,
        item: request?.item ?? 'item',
        category: request?.category || 'other direct costs',
        aim: request?.purpose ?? '',
        vendor: order.vendor,
        ordered: order.placed,
        amount: order.changedAmount ?? order.amount,
        changedFrom: order.changedAmount !== undefined && order.changedAmount !== order.amount ? order.amount : undefined,
        sharePct: share === undefined ? undefined : Math.round(share * 100),
        invoice: invoice && { state: invoice.state, amount: invoice.amount, received: invoice.received },
        approvedAmounts: approvals.filter((a) => a.orderId === order.id).map((a) => a.amount),
      };
    }),
  );

  const payroll = new Map(conn.rows('payroll').map((row) => [row.id, row]));
  const personnel: Personnel[] = picks.includedPayrollIds.flatMap((id) => {
    const row = payroll.get(id);
    return row ? [{ payrollId: id, role: row.role, effortPct: row.effortPct, from: row.from, to: row.to, amount: row.amount }] : [];
  });

  const leftOut: LeftOut[] = [];
  for (const e of picks.excluded) {
    if (leftOut.some((l) => l.requestId === e.requestId)) continue;
    const its = orders.filter((order) => order.requestId === e.requestId);
    const placed = its.filter((order) => inRange(order.placed));
    const counted = placed.length ? placed : its;
    const invoiceId = e.invoice?.id ?? mentionedIds(e.why).find((id) => id.startsWith('inv'));
    leftOut.push({
      requestId: e.requestId,
      item: requests.get(e.requestId)?.item ?? e.requestId,
      amount: counted.length ? sum(counted.map((order) => order.changedAmount ?? order.amount)) : undefined,
      why: e.why,
      invoiceId,
      ids: [...new Set([...its.map((order) => order.id), ...(invoiceId ? [invoiceId] : []), ...mentionedIds(e.why)])],
    });
  }

  return {
    grant,
    period,
    total: total ?? sum([...purchases.map((p) => p.amount), ...personnel.map((p) => p.amount)]),
    purchases,
    personnel,
    leftOut,
    includedRequestIds: picks.includedRequestIds,
    includedPayrollIds: picks.includedPayrollIds,
    excludedRequestIds: leftOut.map((l) => l.requestId),
    unchecked: [...picks.excluded.flatMap((e) => (e.invoice && !e.invoice.checked ? [e.invoice.id] : [])), ...unchecked],
  };
}

/** What the module will put in this grant's request for this period, described from the records. */
export function claimFor(conn: Connection, grantId: string, period: Period): Claim | undefined {
  const grant = conn.rows('grant').find((row) => row.id === grantId);
  return grant && describe(conn, grant, period, modulePicks(conn, grantId, period), { forDraft: true });
}

/** What a drafted payment request claims (its own lists and amount), described from the records. */
export function requestClaim(conn: Connection, pr: PaymentRequestRow): Claim | undefined {
  const grant = conn.rows('grant').find((row) => row.id === pr.grantId);
  return grant && describe(conn, grant, { from: pr.from, to: pr.to }, rowPicks(pr), { total: pr.amount, forDraft: false });
}

const setOf = (ids: string[]) => [...new Set(ids)].sort().join(' ');
const samePicks = (a: Claim, b: Claim) =>
  setOf(a.includedRequestIds) === setOf(b.includedRequestIds) &&
  setOf(a.includedPayrollIds) === setOf(b.includedPayrollIds) &&
  setOf(a.excludedRequestIds) === setOf(b.excludedRequestIds) &&
  sameAmount(a.total, b.total);

/** Where the drafted row differs from what its explanation described. Empty when they match. */
function differences(described: Claim, row: PaymentRequestRow): string[] {
  const out: string[] = [];
  const compare = (what: string, ours: string[], theirs: string[]) => {
    const missing = [...new Set(ours)].filter((id) => !theirs.includes(id));
    const extra = [...new Set(theirs)].filter((id) => !ours.includes(id));
    if (missing.length) out.push(`${what} described but not in ${row.id}: ${missing.join(', ')}`);
    if (extra.length) out.push(`${what} in ${row.id} but not described: ${extra.join(', ')}`);
  };
  compare('Purchases', described.includedRequestIds, row.includedRequestIds);
  compare('Payroll rows', described.includedPayrollIds, row.includedPayrollIds);
  compare('Left-out items', described.excludedRequestIds, row.excluded.map((e) => e.requestId));
  if (!sameAmount(described.total, row.amount)) out.push(`Total described as ${money(described.total)}; the module computed ${money(row.amount)}`);
  return out;
}

// ── Explanation (≤ 1,000 characters, the module enforces it) ──────────────

type Detail = 'full' | 'ids' | 'counts';

function byCategory(purchases: Purchase[]) {
  const groups = new Map<string, Purchase[]>();
  for (const p of purchases) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
  return [...groups].map(([category, list]) => ({ category, subtotal: sum(list.map((p) => p.amount)), purchases: list }));
}

function staffGroups(personnel: Personnel[]) {
  const groups = new Map<string, { role: string; effortPct: number; amount: number; count: number }>();
  for (const p of personnel) {
    const key = `${p.role}|${p.effortPct}`;
    const group = groups.get(key) ?? { role: p.role, effortPct: p.effortPct, amount: 0, count: 0 };
    group.amount = cents(group.amount + p.amount);
    group.count++;
    groups.set(key, group);
  }
  return [...groups.values()];
}

function purchaseLine(p: Purchase): string {
  const facts = [p.vendor, `ordered ${p.ordered}`, money(p.amount)];
  if (p.changedFrom !== undefined) facts.push(`changed from ${money(p.changedFrom)}`);
  if (p.sharePct !== undefined) facts.push(`${p.sharePct}% share`);
  return `${p.requestId} ${p.item} (${facts.join(', ')})${p.aim ? `, purpose: ${sentence(p.aim)}` : ''}`;
}

function claimedText(claim: Claim, detail: Detail): string {
  const { grant, period } = claim;
  const parts = [`Reimbursement of direct costs on ${grant.id} for ${period.from} to ${period.to}, ${money(claim.total)} in total.`];
  const staff = staffGroups(claim.personnel);
  if (staff.length) {
    const head = `Personnel ${money(sum(staff.map((s) => s.amount)))}`;
    const lines = staff.map((s) => `${lower(s.role)}, ${s.effortPct}% effort, ${money(s.amount)}${s.count > 1 ? ` (${s.count} pay periods)` : ''}`);
    parts.push(detail === 'counts' ? `${head}.` : `${head}: ${lines.join('; ')}.`);
  }
  for (const group of byCategory(claim.purchases)) {
    const head = `${capital(group.category)} ${money(group.subtotal)}`;
    const n = group.purchases.length;
    if (detail === 'counts') parts.push(`${head} (${n} order${n === 1 ? '' : 's'}).`);
    else if (detail === 'ids') parts.push(`${head}: ${group.purchases.map((p) => p.requestId).join(', ')}.`);
    else parts.push(`${head}: ${group.purchases.map(purchaseLine).join('; ')}.`);
  }
  if (claim.purchases.length) parts.push(`Each purchase was ordered on ${grant.id} in this period, and none has an invoice on hold.`);
  return parts.join(' ');
}

function leftOutText(claim: Claim, detail: Detail): string {
  if (!claim.leftOut.length) return '';
  const items = claim.leftOut.map((l) => {
    const amount = l.amount === undefined ? '' : money(l.amount);
    if (detail === 'counts') return l.requestId;
    if (detail === 'ids') return `${l.requestId} (${[amount, l.invoiceId ? `invoice ${l.invoiceId} on hold` : 'on hold'].filter(Boolean).join('; ')})`;
    return `${l.requestId} ${l.item}${amount ? ` (${amount})` : ''}: ${lower(sentence(l.why))}`;
  });
  return `Left out under the rule "${HELD_RULE}": ${items.join('; ')}.`;
}

const joined = (text: ExplanationText) => (text.leftOut.trim() ? `${text.claimed.trim()} ${text.leftOut.trim()}` : text.claimed.trim());

// Richest wording first; what was left out keeps its reason longest.
const TIERS: [Detail, Detail][] = [
  ['full', 'full'],
  ['ids', 'full'],
  ['ids', 'ids'],
  ['counts', 'full'],
  ['counts', 'ids'],
  ['counts', 'counts'],
];

/** The deterministic explanation: the same facts Claude gets, always within the module's limit. */
export function templateExplanation(claim: Claim): ExplanationText {
  let text: ExplanationText = { claimed: '', leftOut: '' };
  for (const [claimed, leftOut] of TIERS) {
    text = { claimed: claimedText(claim, claimed), leftOut: leftOutText(claim, leftOut) };
    if (joined(text).length <= PAYMENT_EXPLANATION_MAX) return text;
  }
  // Dozens of categories or left-out items: cut, keeping the left-out list whole if it fits.
  const room = PAYMENT_EXPLANATION_MAX - (text.leftOut ? text.leftOut.length + 1 : 0);
  if (room > 80) return { claimed: clip(text.claimed, room), leftOut: text.leftOut };
  return { claimed: clip(joined(text), PAYMENT_EXPLANATION_MAX), leftOut: '' };
}

function knownAmounts(claim: Claim): number[] {
  return [
    claim.total,
    ...claim.purchases.flatMap((p) => [
      p.amount,
      ...(p.changedFrom === undefined ? [] : [p.changedFrom]),
      ...(p.invoice ? [p.invoice.amount] : []),
      ...p.approvedAmounts,
      ...mentionedAmounts(`${p.item} ${p.aim}`),
    ]),
    ...byCategory(claim.purchases).map((g) => g.subtotal),
    sum(claim.purchases.map((p) => p.amount)),
    ...claim.personnel.map((p) => p.amount),
    ...staffGroups(claim.personnel).map((s) => s.amount),
    sum(claim.personnel.map((p) => p.amount)),
    ...claim.leftOut.flatMap((l) => [...(l.amount === undefined ? [] : [l.amount]), ...mentionedAmounts(`${l.item} ${l.why}`)]),
  ];
}

const unknownAmounts = (text: string, known: number[]) =>
  mentionedAmounts(text).filter((amount) => !known.some((k) => sameAmount(k, amount)));

/** Why an explanation can't go out as written. Empty means every id and amount comes from the records. */
export function explanationProblems(text: ExplanationText, claim: Claim): string[] {
  const problems: string[] = [];
  const full = joined(text);
  if (full.length > PAYMENT_EXPLANATION_MAX) problems.push(`${full.length} characters, over the ${PAYMENT_EXPLANATION_MAX} limit`);
  if (!text.claimed.includes(money(claim.total))) problems.push(`doesn't state the total, ${money(claim.total)}`);
  const claimedIds = new Set([...claim.includedRequestIds, ...claim.includedPayrollIds]);
  const leftOutIds = new Set(claim.leftOut.flatMap((l) => [l.requestId, ...l.ids]));
  for (const id of mentionedIds(text.claimed)) if (!claimedIds.has(id)) problems.push(`claims ${id}, which the request doesn't include`);
  // A left-out purchase named by what it is ("the Mueller-Hinton broth"), not
  // its id, is still claimed. A false match only means the template is used.
  const claimedLower = text.claimed.toLowerCase();
  for (const l of claim.leftOut) {
    if (claimedIds.has(l.requestId) || l.item === l.requestId) continue;
    const name = l.item.split(/[,(:;]/)[0].trim().toLowerCase();
    if (name.length >= 4 && claimedLower.includes(name)) problems.push(`claims ${l.item} (${l.requestId}), which was left out`);
  }
  for (const id of mentionedIds(text.leftOut)) if (!leftOutIds.has(id)) problems.push(`lists ${id} as left out, which it isn't`);
  const named = mentionedIds(text.leftOut);
  for (const id of claim.excludedRequestIds) if (!named.includes(id)) problems.push(`doesn't say ${id} was left out`);
  for (const amount of unknownAmounts(full, knownAmounts(claim))) problems.push(`mentions ${money(amount)}, which isn't in the records`);
  return problems;
}

function explainFacts(claim: Claim) {
  return {
    grant: { id: claim.grant.id, title: claim.grant.title, agency: claim.grant.agency },
    period: claim.period,
    total: money(claim.total),
    personnelTotal: money(sum(claim.personnel.map((p) => p.amount))),
    personnel: staffGroups(claim.personnel).map((s) => ({ role: s.role, effort: `${s.effortPct}%`, amount: money(s.amount), payPeriods: s.count })),
    categories: byCategory(claim.purchases).map((group) => ({
      category: group.category,
      subtotal: money(group.subtotal),
      purchases: group.purchases.map((p) => ({
        requestId: p.requestId,
        item: p.item,
        aim: p.aim,
        vendor: p.vendor,
        ordered: p.ordered,
        amount: money(p.amount),
        ...(p.changedFrom === undefined ? {} : { changedFrom: money(p.changedFrom) }),
        ...(p.sharePct === undefined ? {} : { share: `${p.sharePct}%` }),
      })),
    })),
    leftOut: claim.leftOut.map((l) => ({ requestId: l.requestId, item: l.item, ...(l.amount === undefined ? {} : { amount: money(l.amount) }), why: l.why })),
    rule: HELD_RULE,
    limits: { total: PAYMENT_EXPLANATION_MAX },
  };
}

// ── Follow-up answers ─────────────────────────────────────────────────────

function answerLine(p: Purchase, grant: GrantRow, detail: Detail): string {
  if (detail === 'counts') return `${p.requestId} ${p.ordered} ${money(p.amount)}`;
  if (detail === 'ids') return `${p.requestId} ${p.item}, ${p.vendor}, ordered ${p.ordered}, ${money(p.amount)}`;
  const facts = [p.category, p.vendor, `ordered ${p.ordered}`, money(p.amount)];
  if (p.changedFrom !== undefined) facts.push(`changed from ${money(p.changedFrom)}`);
  if (p.sharePct !== undefined) facts.push(`${p.sharePct}% share charged to ${grant.id}`);
  if (p.invoice) facts.push(`invoiced ${p.invoice.received}, ${p.invoice.state}`);
  return `${p.requestId} ${p.item} (${facts.join(', ')})${p.aim ? `, purpose: ${sentence(p.aim)}` : ''}`;
}

function answerTemplate(pr: PaymentRequestRow, claim: Claim): AnswerText {
  const { grant } = claim;
  const build = (detail: Detail) => {
    const parts = [`Payment request ${pr.id} on ${grant.id} covers ${pr.from} to ${pr.to} and asks for ${money(pr.amount)}.`];
    if (claim.purchases.length) {
      parts.push(`Purchases claimed (${claim.purchases.length}): ${claim.purchases.map((p) => answerLine(p, grant, detail)).join('; ')}.`);
      const late = claim.purchases.filter((p) => p.ordered > grant.end);
      parts.push(
        late.length
          ? `Ordered after the project end date (${grant.end}): ${late.map((p) => p.requestId).join(', ')}.`
          : `Each was charged to ${grant.id} and ordered before the project end date (${grant.end}).`,
      );
    } else {
      parts.push('It claims no purchases.');
    }
    if (claim.personnel.length) {
      const lines = claim.personnel.map((p) =>
        detail === 'full' ? `${p.payrollId} ${lower(p.role)}, ${p.effortPct}% effort, ${p.from} to ${p.to}, ${money(p.amount)}` : `${p.payrollId} ${money(p.amount)}`,
      );
      parts.push(`Personnel: ${lines.join('; ')}.`);
    }
    const left = new Set(pr.excluded.map((e) => e.requestId)).size;
    if (left) parts.push(`${left} item${left === 1 ? ' was' : 's were'} left out of ${pr.id} and ${left === 1 ? 'is' : 'are'} not claimed.`);
    return parts.join(' ');
  };
  // Richest wording that fits; past that, every purchase still by id, date and amount.
  for (const detail of ['full', 'ids', 'counts'] as const) {
    const answer = build(detail);
    if (answer.length <= ANSWER_MAX) return { answer };
  }
  return { answer: clip(build('counts'), ANSWER_MAX) };
}

// A left-out item may be named only in a sentence saying it was left out,
// never as claimed. A sentence split at "J. Appl." only makes this stricter,
// and a false match only means the template is used.
const SAYS_LEFT_OUT = /\b(?:left out|not claimed|excluded)\b/i;
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/);

/** Why an answer can't go out as written. Empty means every id and amount comes from the payment request. */
export function answerProblems(text: AnswerText, pr: PaymentRequestRow, followUpId: string, claim: Claim): string[] {
  const problems: string[] = [];
  if (text.answer.length > ANSWER_MAX) problems.push(`${text.answer.length} characters, over ${ANSWER_MAX}`);
  const allowed = new Set([pr.id, followUpId, ...pr.includedRequestIds, ...pr.includedPayrollIds]);
  const leftOutIds = new Set(claim.leftOut.flatMap((l) => [l.requestId, ...mentionedIds(l.why)]));
  const namedAsLeftOut = (id: string) =>
    sentences(text.answer).filter((s) => mentionedIds(s).includes(id)).every((s) => SAYS_LEFT_OUT.test(s));
  for (const id of mentionedIds(text.answer)) {
    if (allowed.has(id) || (leftOutIds.has(id) && namedAsLeftOut(id))) continue;
    problems.push(leftOutIds.has(id) ? `mentions ${id}, which was left out of ${pr.id}, as if claimed` : `mentions ${id}, which ${pr.id} doesn't claim`);
  }
  for (const amount of unknownAmounts(text.answer, [pr.amount, ...knownAmounts(claim)])) problems.push(`mentions ${money(amount)}, which isn't in the records`);
  return problems;
}

function answerFacts(question: string, pr: PaymentRequestRow, claim: Claim) {
  // Added up here so Claude quotes them; only when they make up the total,
  // so a quoted breakdown can't contradict it.
  const purchasesSubtotal = sum(claim.purchases.map((p) => p.amount));
  const personnelSubtotal = sum(claim.personnel.map((p) => p.amount));
  const subtotals = sameAmount(purchasesSubtotal + personnelSubtotal, pr.amount)
    ? { purchasesSubtotal: money(purchasesSubtotal), personnelSubtotal: money(personnelSubtotal) }
    : {};
  return {
    question,
    paymentRequest: {
      id: pr.id,
      grant: pr.grantId,
      period: `${pr.from} to ${pr.to}`,
      total: money(pr.amount),
      ...subtotals,
      state: pr.state,
    },
    grant: { id: claim.grant.id, title: claim.grant.title, agency: claim.grant.agency, projectEnd: claim.grant.end },
    purchases: claim.purchases.map((p) => ({
      requestId: p.requestId,
      item: p.item,
      category: p.category,
      aim: p.aim,
      vendor: p.vendor,
      ordered: p.ordered,
      amount: money(p.amount),
      ...(p.changedFrom === undefined ? {} : { changedFrom: money(p.changedFrom) }),
      ...(p.sharePct === undefined ? {} : { share: `${p.sharePct}%` }),
      ...(p.invoice ? { invoice: { state: p.invoice.state, amount: money(p.invoice.amount), received: p.invoice.received } } : {}),
      approvedAmounts: p.approvedAmounts.map(money),
    })),
    personnel: claim.personnel.map((p) => ({ id: p.payrollId, role: p.role, effort: `${p.effortPct}%`, period: `${p.from} to ${p.to}`, amount: money(p.amount) })),
    leftOut: claim.leftOut.map((l) => ({ requestId: l.requestId, item: l.item, ...(l.amount === undefined ? {} : { amount: money(l.amount) }), why: l.why })),
  };
}

// ── The loop ──────────────────────────────────────────────────────────────

// The seed marks a question nobody has answered yet as drafted with no
// answer; the module marks an answer the grant manager rejected as drafted
// with its answer kept, and that one is a person's decision to leave alone.
const needsAnswer = (fu: FollowUpRow) => fu.state === 'asked' || (fu.state === 'drafted' && !fu.answerDraft);

export function startPaymentRequests({ conn, tracker }: AgentContext): AgentHandle {
  const queue = workQueue(AGENT);
  // A grant id (its last full month) or "grant id, month start" (that month).
  const queuedDrafts = new Set<string>();
  const queuedFollowUps = new Set<string>();
  // Drafts the module refused, so a refusal can't turn into a retry loop.
  const refusedDrafts = new Set<string>();
  const refusedAnswers = new Set<string>();
  // Invoice nobody has checked yet → the grant and month whose draft waits for it.
  const waitingOn = new Map<string, { grantId: string; period: Period }>();
  const noted = new Set<string>();
  let stopped = false;

  const note = (key: string, message: string) => {
    if (noted.has(key)) return;
    noted.add(key);
    console.log(`${AGENT}: ${message}`);
  };

  const grantRow = (id: string) => conn.rows('grant').find((row) => row.id === id);
  const covered = (grantId: string, period: Period) =>
    conn.rows('paymentRequest').some((pr) => pr.grantId === grantId && pr.from <= period.from && pr.to >= period.to);

  // Why a grant can't be claimed now, or undefined if it can. An ended grant
  // is frozen in the module, but within closeout it is checked as if it
  // hadn't ended: only a cancellation with no payment since, or sources
  // disagreeing, freeze it then.
  function frozenNow(grant: GrantRow, rules: SpendingRules): string | undefined {
    if (!grant.frozen) return undefined;
    if (grant.status !== 'ended' && conn.today() <= grant.end) return grant.frozenReason ?? grant.status;
    if (rules.daysBetween(grant.end, conn.today()) > CLOSEOUT_DAYS) return `it ended ${grant.end}, more than ${CLOSEOUT_DAYS} days ago`;
    const events = conn.rows('statusEvent').filter((event) => event.grantId === grant.id).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const disagree = conn.rows('flag').some((flag) => flag.grantId === grant.id && flag.open && flag.kind === 'sources_disagree');
    const apart = rules.freezeState('active', events, disagree);
    return apart.frozen ? (apart.frozenReason ?? apart.status) : undefined;
  }

  // Everything that must hold to draft, read fresh from the rows each time.
  function readyToDraft(grantId: string, period: Period, rules: SpendingRules): Claim | undefined {
    const span = `${grantId} for ${period.from} to ${period.to}`;
    const grant = grantRow(grantId);
    if (!grant || period.to < grant.start || period.from > grant.end) return undefined;
    if (covered(grantId, period)) return undefined;
    const frozen = frozenNow(grant, rules);
    if (frozen) {
      note(`${span} frozen`, `no payment request for ${span}: the grant is frozen (${frozen}).`);
      return undefined;
    }
    const claim = claimFor(conn, grantId, period)!;
    if (!claim.includedRequestIds.length && !claim.includedPayrollIds.length) {
      note(`${span} empty`, `no payment request for ${span}: nothing to claim.`);
      return undefined;
    }
    if (claim.unchecked.length) {
      for (const invoiceId of claim.unchecked) waitingOn.set(invoiceId, { grantId, period });
      note(`${span} waiting ${claim.unchecked.join(' ')}`, `payment request for ${span} waits until ${claim.unchecked.join(', ')} is checked.`);
      return undefined;
    }
    return claim;
  }

  async function writeExplanation(claim: Claim): Promise<string> {
    const template = templateExplanation(claim);
    const reply = await ask({
      task: 'payment_request.explain',
      system: EXPLAIN_SYSTEM,
      input: explainFacts(claim),
      schema: ExplanationSchema,
      fallback: () => template,
      maxTokens: 2_000,
    });
    if (reply.by === 'fallback') return joined(reply.value);
    const problems = explanationProblems(reply.value, claim);
    if (!problems.length) return joined(reply.value);
    console.warn(`${AGENT}: Claude's explanation for ${claim.grant.id} ${claim.period.from} not used (${problems.join('; ')}); using the template`);
    return joined(template);
  }

  async function draft(grantId: string, period: Period, explanation: string): Promise<PaymentRequestRow | undefined> {
    const before = new Set(conn.rows('paymentRequest').map((pr) => pr.id));
    try {
      await conn.call('draft_payment_request', { grantId, from: period.from, to: period.to, explanation });
    } catch (error) {
      refusedDrafts.add(`${grantId} ${period.from} ${period.to}`);
      throw error;
    }
    const row = conn.rows('paymentRequest').find((pr) => !before.has(pr.id) && pr.grantId === grantId && pr.from === period.from && pr.to === period.to);
    if (!row) console.error(`${AGENT}: drafted ${grantId} for ${period.from} to ${period.to}, but the row isn't there`);
    return row;
  }

  // The module picked differently from what the explanation says (rows
  // changed in between). Its lists win: draft again from them, and ask the
  // grant manager to reject the first draft. At most one extra draft.
  async function redraft(described: Claim, first: PaymentRequestRow, drift: string[]) {
    console.warn(`${AGENT}: ${first.id} doesn't match its explanation (${drift.join('; ')}); drafting again from the module's lists`);
    const fromModule = describe(conn, described.grant, described.period, rowPicks(first), { total: first.amount, forDraft: true });
    // The replacement asks for money too, so the grant is refreshed again and
    // a grant that froze meanwhile gets no replacement. The first draft still
    // has to be flagged if the refresh fails or the module refuses the second.
    const fresh = await tracker.refresh(first.grantId).then(
      () => true,
      (error: unknown) => {
        console.error(`${AGENT}: refresh of ${first.grantId} before replacing ${first.id} failed:`, error instanceof Error ? error.message : error);
        return false;
      },
    );
    const grant = grantRow(first.grantId);
    const frozen = !grant || frozenNow(grant, await loadRules()) !== undefined;
    if (frozen) console.warn(`${AGENT}: ${first.grantId} is frozen now, so ${first.id} gets no replacement`);
    const second =
      fresh && !frozen
        ? await draft(first.grantId, described.period, joined(templateExplanation(fromModule))).catch((error: unknown) => {
            console.error(`${AGENT}: replacement for ${first.id} refused:`, error instanceof Error ? error.message : error);
            return undefined;
          })
        : undefined;
    await conn.call('raise_hold', {
      kind: 'payment_request',
      refId: first.id,
      grantId: first.grantId,
      title: `Reject ${first.id}: ${second ? `replaced by ${second.id}` : 'its explanation is wrong'}`,
      why: `${first.id}'s explanation doesn't match what the module put in it. ${drift.join('. ')}. The module's lists win${second ? `, so ${second.id} was drafted from them` : ''}.${frozen ? ` ${first.grantId} is frozen now, so no replacement was drafted.` : ''}`,
      evidence: [
        { label: `Explanation in ${first.id}`, value: first.explanation },
        ...drift.map((d) => ({ label: 'Mismatch', value: d })),
        ...(second ? [{ label: 'Replacement', value: `${second.id} (${money(second.amount)})` }] : []),
      ],
      options: ['reject'],
    });
    const again = second ? differences(fromModule, second) : [];
    if (second && again.length) {
      await conn.call('raise_hold', {
        kind: 'payment_request',
        refId: second.id,
        grantId: second.grantId,
        title: `Check ${second.id} before sending: its explanation doesn't match it`,
        why: `${again.join('. ')}.`,
        evidence: [{ label: `Explanation in ${second.id}`, value: second.explanation }],
        options: ['approve', 'reject'],
      });
    }
  }

  async function draftMonth(grantId: string, period: Period) {
    if (refusedDrafts.has(`${grantId} ${period.from} ${period.to}`)) return;
    const rules = await loadRules();
    const planned = readyToDraft(grantId, period, rules);
    if (!planned) return;
    const written = await writeExplanation(planned);
    // Right before money moves, so a stale status can't let a frozen grant ask for money.
    await tracker.refresh(grantId);
    const now = readyToDraft(grantId, period, rules);
    if (!now) return;
    // Rows changed while Claude wrote: describe what is there now instead.
    const explanation = samePicks(planned, now) ? written : joined(templateExplanation(now));
    const row = await draft(grantId, period, explanation);
    const drift = row ? differences(now, row) : [];
    if (row && drift.length) await redraft(now, row, drift);
  }

  async function writeAnswer(fu: FollowUpRow, pr: PaymentRequestRow, claim: Claim): Promise<string> {
    const template = answerTemplate(pr, claim);
    const reply = await ask({
      task: 'payment_request.follow_up',
      system: ANSWER_SYSTEM,
      input: answerFacts(fu.question, pr, claim),
      schema: AnswerSchema,
      fallback: () => template,
      maxTokens: 2_000,
    });
    if (reply.by === 'fallback') return reply.value.answer;
    const problems = answerProblems(reply.value, pr, fu.id, claim);
    if (!problems.length) return reply.value.answer;
    console.warn(`${AGENT}: Claude's answer to ${fu.id} not used (${problems.join('; ')}); using the template`);
    return template.answer;
  }

  async function answerFollowUp(followUpId: string) {
    const fu = conn.rows('followUp').find((row) => row.id === followUpId);
    if (!fu || !needsAnswer(fu) || refusedAnswers.has(followUpId)) return;
    const pr = conn.rows('paymentRequest').find((row) => row.id === fu.paymentRequestId);
    const claim = pr && requestClaim(conn, pr);
    if (!pr || !claim) {
      console.error(`${AGENT}: follow-up ${followUpId} is about ${fu.paymentRequestId}, which isn't there`);
      return;
    }
    const answer = await writeAnswer(fu, pr, claim);
    const still = conn.rows('followUp').find((row) => row.id === followUpId);
    if (!still || !needsAnswer(still)) return;
    try {
      await conn.call('draft_follow_up_answer', { followUpId, answer });
    } catch (error) {
      refusedAnswers.add(followUpId);
      throw error;
    }
  }

  // With no period, the month is the last full one when the work runs.
  const checkGrant = (grantId: string, period?: Period) => {
    const key = period ? `${grantId} ${period.from}` : grantId;
    if (stopped || queuedDrafts.has(key)) return;
    queuedDrafts.add(key);
    void queue.push(`payment request for ${grantId}${period ? ` for ${period.from} to ${period.to}` : ''}`, async () => {
      queuedDrafts.delete(key);
      if (!stopped) await draftMonth(grantId, period ?? lastFullMonth(conn.today()));
    });
  };
  const checkAllGrants = () => {
    for (const grant of conn.rows('grant')) checkGrant(grant.id);
  };

  const takeFollowUp = (fu: FollowUpRow) => {
    if (stopped || !needsAnswer(fu) || queuedFollowUps.has(fu.id)) return;
    queuedFollowUps.add(fu.id);
    void queue.push(`answer to follow-up ${fu.id}`, async () => {
      queuedFollowUps.delete(fu.id);
      if (!stopped) await answerFollowUp(fu.id);
    });
  };

  const invoiceChanged = (invoice: InvoiceRow) => {
    const waiting = waitingOn.get(invoice.id);
    if (!waiting || (!invoice.checked && invoice.state !== 'paid' && invoice.state !== 'rejected')) return;
    waitingOn.delete(invoice.id);
    checkGrant(waiting.grantId, waiting.period);
  };

  for (const fu of conn.rows('followUp')) takeFollowUp(fu);
  checkAllGrants();
  const stops = [
    conn.onInsert('followUp', takeFollowUp),
    conn.onUpdate('followUp', (_before, after) => takeFollowUp(after)),
    // A new month on the clock means a new month to claim, and a jump past
    // several month ends means each of them, oldest first. Only the clock
    // moving forward claims past months; startup, an unfreeze and a request
    // that went away claim the last one, since a grant's frozen months can't
    // be claimed. (The sim world and the fixtures both start on 2026-06-15,
    // so loading either after a fast-forward moves the clock back.)
    conn.onUpdate('clock', (before, after) => {
      if (before.today === after.today) return;
      const periods = monthsEnded(before.today, after.today);
      // Within a month or back in time: the last full month, as always.
      if (!periods.length) {
        checkAllGrants();
        return;
      }
      if (lastFullMonth(periods[0].from).to >= before.today) {
        note(`clock ${before.today} ${after.today}`, `the clock jumped from ${before.today} to ${after.today}; only the last ${MONTHS_PER_MOVE} months, from ${periods[0].from}, are claimed.`);
      }
      for (const period of periods) for (const grant of conn.rows('grant')) checkGrant(grant.id, period);
    }),
    conn.onInsert('grant', (grant) => checkGrant(grant.id)),
    // A request that went away (the Test lab loaded a world) leaves its month
    // unclaimed. Loading a world sends nothing for rows it brings back
    // unchanged, so this is the only sign a month needs claiming again.
    conn.onDelete('paymentRequest', (pr) => checkGrant(pr.grantId)),
    // A payment unfreezing a grant lets its waiting request go out.
    conn.onUpdate('grant', (before, after) => {
      if (before.frozen !== after.frozen || before.status !== after.status) checkGrant(after.id);
    }),
    conn.onInsert('invoice', invoiceChanged),
    conn.onUpdate('invoice', (_before, after) => invoiceChanged(after)),
  ];

  return {
    idle: () => queue.idle(),
    stop() {
      stopped = true;
      for (const stop of stops) stop();
    },
  };
}
