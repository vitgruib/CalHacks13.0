// GrantGuard's actions (reducers): the only way anything changes. Who may
// call what is checked here, by identity, never in a prompt:
// - agents register once per identity with one role; people register
//   separately, and one identity can't be both;
// - only the grant manager decides Inbox items, always with a reason;
// - nobody approves their own request; agents never decide anything;
// - nothing is bought alone (T108): every purchase request and every invoice
//   waits for the grant office; the module's rules flag what fails.
// Every action writes a log row.

import { SenderError, t } from 'spacetimedb/server';
import spacetimedb from './schema';
import { fixtures } from './fixtures';
import { clearWorld, loadSeed, type Ctx, type Seed } from './seed';
import {
  addDays,
  canBuyAlone,
  checkInvoice,
  checkPaper,
  effortWhy,
  freezeState,
  isRealDay,
  spendingVerdicts,
  usd,
  type Verdict,
} from './rules';
import {
  AGENT_ROLES,
  CHECK_REASONS,
  CHOICES,
  FLAG_KINDS,
  GRANT_STATUSES,
  HOLD_KINDS,
  PAYMENT_EXPLANATION_MAX,
  PERSON_ROLES,
  SOURCES,
  STATUS_EVENT_KINDS,
  oneOf,
  type AgentRole,
  type PersonRole,
} from './vocab';

export default spacetimedb;

const Evidence = t.object('EvidenceArg', { label: t.string(), value: t.string() });
const Split = t.object('SplitArg', { grantId: t.string(), share: t.f64() });
const Correction = t.object('CorrectionArg', { kind: t.string(), disclosed: t.bool(), note: t.string() });

// ── Helpers ───────────────────────────────────────────────────────────────

function fail(msg: string): never {
  throw new SenderError(msg);
}

function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof SenderError) throw e;
    throw new SenderError(e instanceof Error ? e.message : String(e));
  }
}

const today = (ctx: Ctx): string => ctx.db.clock.id.find(0)?.today ?? '2026-01-01';

/** A request with the same person's other live requests that day, for the split-purchase rule. */
function withSameDay<R extends { id: string; day: string; requesterName: string }>(ctx: Ctx, r: R): R & { sameDay: { id: string; category: string; price: number }[] } {
  const sameDay = r.requesterName
    ? [...ctx.db.request.iter()]
      .filter(o => o.id !== r.id && o.day === r.day && o.requesterName === r.requesterName && !['rejected', 'blocked', 'canceled'].includes(o.state))
      .map(o => ({ id: o.id, category: o.category, price: o.price }))
    : [];
  return { ...r, sameDay };
}

function agentRole(ctx: Ctx): AgentRole | undefined {
  return ctx.db.agent.identity.find(ctx.sender)?.role as AgentRole | undefined;
}
function personRole(ctx: Ctx): PersonRole | undefined {
  return ctx.db.person.identity.find(ctx.sender)?.role as PersonRole | undefined;
}

function requireAgent(ctx: Ctx, ...roles: AgentRole[]): AgentRole {
  const role = agentRole(ctx);
  if (!role) fail('Only a registered agent can do this.');
  if (roles.length && !roles.includes(role)) fail(`Only the ${roles.join(' or ')} agent can do this (you are ${role}).`);
  return role;
}
function requirePerson(ctx: Ctx, ...roles: PersonRole[]): PersonRole {
  const role = personRole(ctx);
  if (!role) fail(agentRole(ctx) ? 'Agents cannot do this; only people can.' : 'Register as a person first.');
  if (roles.length && !roles.includes(role)) fail(`Only the ${roles.join(' or ')} can do this (you are ${role}).`);
  return role;
}
/** Anyone registered: an agent or a person. Returns their role. */
function requireAnyone(ctx: Ctx): string {
  return agentRole(ctx) ?? personRole(ctx) ?? fail('Register first.');
}

function writeLog(
  ctx: Ctx,
  actor: string,
  action: string,
  reason: string,
  extra: { rule?: string; refId?: string } = {},
): void {
  ctx.db.log.insert({
    id: 0n, day: today(ctx), at: ctx.timestamp, actor, action, reason,
    rule: extra.rule, refId: extra.refId,
  });
}

/** Next readable id like rq5, skipping any already used (e.g. by a seed). */
function nextId(ctx: Ctx, prefix: string, taken: (id: string) => boolean): string {
  const row = ctx.db.counter.name.find(prefix);
  let n = row?.next ?? 1;
  while (taken(`${prefix}${n}`)) n++;
  if (row) ctx.db.counter.name.update({ name: prefix, next: n + 1 });
  else ctx.db.counter.insert({ name: prefix, next: n + 1 });
  return `${prefix}${n}`;
}

function getGrant(ctx: Ctx, id: string) {
  return ctx.db.grant.id.find(id) ?? fail(`No grant ${id}.`);
}

/**
 * Fund tracker (T5): recompute a grant's status, freeze and truly-available
 * money from its events and open flags. Logs when the freeze changes.
 */
function recomputeGrant(ctx: Ctx, id: string, actor = 'system'): void {
  const g = getGrant(ctx, id);
  // Index order is not insertion order; ids only grow, so sort by id to
  // replay same-day events in the order they happened.
  const events = [...ctx.db.statusEvent.grantId.filter(id)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const lastCourt = events.map(e => e.kind).lastIndexOf('court_order');
  if (lastCourt >= 0 && events.slice(lastCourt + 1).some(e => e.kind === 'payment_received')) {
    for (const f of [...ctx.db.flag.grantId.filter(id)]) {
      if (!f.open || f.kind !== 'court_order_no_payment') continue;
      ctx.db.flag.id.update({ ...f, open: false });
      writeLog(ctx, actor, `Closed flag on ${id}`, 'A payment arrived after the court order.', { refId: id });
    }
  }
  const disagree = [...ctx.db.flag.grantId.filter(id)].some(f => f.open && f.kind === 'sources_disagree');
  const ended = g.status === 'ended' || today(ctx) > g.end;
  const fs = freezeState(ended ? 'ended' : 'active', events, disagree);
  const available = g.awarded - g.spent - g.promised;
  ctx.db.grant.id.update({ ...g, status: fs.status, frozen: fs.frozen, frozenReason: fs.frozenReason, available });
  askAboutPaymentWhileCanceled(ctx, id, events, fs.paidWhileCanceled);
  if (fs.frozen !== g.frozen) {
    writeLog(ctx, actor, `${fs.frozen ? 'Froze' : 'Unfroze'} ${id}`, fs.frozenReason ?? 'A payment arrived after the cancellation.', {
      rule: fs.frozen ? 'Canceled or disputed grants freeze' : 'Only a payment (or the grant manager) unfreezes',
      refId: id,
    });
    resendWaiting(ctx, id);
  }
}

/**
 * Money that arrived on a canceled grant nothing restored may be closeout
 * money (2 CFR 200.343): the grant manager decides whether it restores the
 * grant. One hold per payment; a hold that no longer applies is closed.
 */
function askAboutPaymentWhileCanceled(ctx: Ctx, id: string, events: { id: bigint; day: string; kind: string; amount?: number }[], paidOn?: string): void {
  const payment = paidOn ? events.filter(e => e.kind === 'payment_received' && e.day === paidOn).at(-1) : undefined;
  for (const h of [...ctx.db.hold.iter()]) {
    if (h.open && h.kind === 'paid_while_canceled' && h.grantId === id && h.refId !== payment?.id.toString()) ctx.db.hold.id.update({ ...h, open: false });
  }
  if (!payment || [...ctx.db.hold.iter()].some(h => h.kind === 'paid_while_canceled' && h.refId === payment.id.toString())) return;
  const canceled = events.filter(e => e.kind === 'canceled' && e.day <= payment.day).at(-1);
  raiseHoldRow(ctx, {
    kind: 'paid_while_canceled', refId: payment.id.toString(), grantId: id, raisedBy: 'bookkeeping',
    title: `Money arrived on canceled ${id}`,
    why: `${usd(payment.amount ?? 0)} arrived on ${payment.day}, but ${id} was canceled${canceled ? ` on ${canceled.day}` : ''} and no court order or notice has restored it. ` +
      'After a termination, money still comes in for costs incurred before it (2 CFR 200.343), so this may be closeout money, not a restored grant. ' +
      'Approve to unfreeze if the funder confirms the grant is live again; reject to keep spending frozen.',
    evidence: [
      ...(canceled ? [{ label: 'Canceled', value: canceled.day }] : []),
      { label: 'Payment', value: `${usd(payment.amount ?? 0)} (${payment.day})` },
      { label: 'Restored by', value: 'nothing on record' },
    ],
    options: ['approve', 'reject'],
  });
}

function adjustMoney(ctx: Ctx, id: string, d: { spent?: number; promised?: number; received?: number }): void {
  const g = getGrant(ctx, id);
  const spent = g.spent + (d.spent ?? 0);
  const promised = g.promised + (d.promised ?? 0);
  ctx.db.grant.id.update({
    ...g, spent, promised, received: g.received + (d.received ?? 0), available: g.awarded - spent - promised,
  });
}

/** Verdicts as table rows (optional columns need an explicit key). */
const vrows = (vs: Verdict[]) => vs.map(v => ({ rule: v.rule, pass: v.pass, detail: v.detail, auditCase: v.auditCase }));


function raiseHoldRow(
  ctx: Ctx,
  h: { kind: string; refId: string; grantId?: string; raisedBy: string; title: string; why: string; evidence: { label: string; value: string }[]; options: string[] },
): bigint {
  // One open hold per item: replace an older open one.
  for (const old of ctx.db.hold.iter()) {
    if (old.open && old.kind === h.kind && old.refId === h.refId) ctx.db.hold.id.update({ ...old, open: false });
  }
  const row = ctx.db.hold.insert({ id: 0n, ...h, grantId: h.grantId, day: today(ctx), open: true });
  writeLog(ctx, h.raisedBy, `Sent to the Inbox: ${h.title}`, h.why, { refId: h.refId });
  return row.id;
}

/** A bought or rerouted request has nothing left to decide: close its open purchase holds. */
function closePurchaseHolds(ctx: Ctx, requestId: string): void {
  for (const h of [...ctx.db.hold.iter()]) {
    if (h.open && h.kind === 'purchase' && h.refId === requestId) ctx.db.hold.id.update({ ...h, open: false });
  }
}

const DONE_STATES = ['bought', 'rerouted', 'rejected', 'canceled'];

type RequestRow = NonNullable<ReturnType<Ctx['db']['request']['id']['find']>>;

/**
 * The life of a request (T108): the researcher asks, the grant office
 * approves or rejects, the researcher buys it and sends the invoice, the
 * bookkeeping agent checks the invoice, the grant office approves it, and the
 * cost is charged to the grant. Here the module runs the spending rules and
 * puts the request in the Inbox; failing rules flag it, nothing blocks it.
 */
function sendToGrantOffice(ctx: Ctx, r: RequestRow, pushedBack?: string): void {
  const gid = r.chargedGrantId ?? r.grantId;
  const g = gid ? ctx.db.grant.id.find(gid) : undefined;
  const verdicts = g ? spendingVerdicts(withSameDay(ctx, r), g, today(ctx)) : [];
  const failed = verdicts.filter(v => !v.pass);
  const explanation = !g
    ? 'Waiting for the grant office. No grant was picked for it.'
    : failed.length
      ? `Flagged for the grant office: ${failed.map(v => `${v.rule} (${v.detail.replace(/\.$/, '')})`).join('; ')}.`
      : `Every rule passes on ${gid}; waiting for the grant office to approve it.`;
  ctx.db.request.id.update({ ...r, state: 'waiting_on_manager', chargedGrantId: gid, verdicts: vrows(verdicts), explanation });
  raiseHoldRow(ctx, {
    kind: 'purchase', refId: r.id, grantId: gid, raisedBy: 'system',
    title: `${failed.length ? 'Flagged: approve' : 'Approve'} ${r.item} (${usd(r.price)})${gid ? ` on ${gid}` : ''}${r.requesterName ? ` for ${r.requesterName}` : ''}?`,
    why: explanation,
    evidence: [
      ...(pushedBack ? [{ label: 'The researcher pushed back', value: pushedBack }] : []),
      ...(failed.length ? failed : verdicts).map(v => ({ label: v.rule, value: v.detail })),
    ],
    options: ['approve', 'reject'],
  });
}

/** A grant's freeze changed: refresh the verdicts of its requests still waiting. */
function resendWaiting(ctx: Ctx, grantId: string): void {
  for (const r of [...ctx.db.request.iter()]) {
    if (r.state === 'waiting_on_manager' && (r.chargedGrantId ?? r.grantId) === grantId) sendToGrantOffice(ctx, r);
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

function seedWorld(ctx: Ctx, seed: Seed): void {
  loadSeed(ctx, seed);
  for (const g of [...ctx.db.grant.iter()]) recomputeGrant(ctx, g.id);
  for (const r of [...ctx.db.request.iter()]) if (r.state === 'submitted') sendToGrantOffice(ctx, r);
}

export const init = spacetimedb.init(ctx => {
  seedWorld(ctx, fixtures);
});

// ── Registration ──────────────────────────────────────────────────────────

/** Binds the caller's identity to one agent role, once. One identity per role. */
export const register_agent = spacetimedb.reducer({ role: t.string() }, (ctx, { role }) => guard(() => {
  const r = oneOf('role', AGENT_ROLES, role);
  if (ctx.db.person.identity.find(ctx.sender)) fail('This identity is a person; agents need their own.');
  const mine = ctx.db.agent.identity.find(ctx.sender);
  if (mine) {
    if (mine.role !== r) fail(`This identity is already the ${mine.role} agent.`);
    return; // reconnecting with the same role is fine
  }
  if (ctx.db.agent.role.find(r)) fail(`The ${r} agent is already registered to another identity.`);
  ctx.db.agent.insert({ identity: ctx.sender, role: r, registeredAt: ctx.timestamp });
  writeLog(ctx, r, `Registered the ${r} agent`, 'New agent identity.');
}));

/** Binds the caller's identity to a person role (grant_manager, scientist, funder), once. */
export const register_person = spacetimedb.reducer({ role: t.string(), name: t.string() }, (ctx, { role, name }) => guard(() => {
  const r = oneOf('role', PERSON_ROLES, role);
  if (ctx.db.agent.identity.find(ctx.sender)) fail('This identity is an agent; people need their own.');
  const mine = ctx.db.person.identity.find(ctx.sender);
  if (mine) {
    if (mine.role !== r) fail(`This identity is already the ${mine.role}.`);
    return;
  }
  ctx.db.person.insert({ identity: ctx.sender, role: r, name: name || r, registeredAt: ctx.timestamp });
  writeLog(ctx, r, `Registered ${name || r} as ${r}`, 'New person identity.');
}));

// ── Purchases (P2, P3) ────────────────────────────────────────────────────

/** People only: ask to buy something. It goes straight to the grant office. */
export const submit_request = spacetimedb.reducer(
  {
    item: t.string(), category: t.string(), price: t.f64(), grantId: t.string().optional(),
    // sharedWith and oneGrantBasis are ignored: grant splitting was removed
    // (T95); the args stay so deployed clients keep working.
    purpose: t.string(), sharedWith: t.array(t.string()),
    oneGrantBasis: t.string().optional(),
  },
  (ctx, a) => guard(() => {
    const who = requirePerson(ctx, 'scientist', 'grant_manager');
    if (!a.item.trim()) fail('Say what to buy.');
    if (!(a.price > 0)) fail('Price must be more than $0.');
    if (a.grantId) getGrant(ctx, a.grantId);
    const id = nextId(ctx, 'rq', x => !!ctx.db.request.id.find(x));
    const name = ctx.db.person.identity.find(ctx.sender)?.name ?? who;
    ctx.db.request.insert({
      id, day: today(ctx), requester: who, requestedBy: ctx.sender, item: a.item, category: a.category,
      price: a.price, grantId: a.grantId, chargedGrantId: undefined, sharedWith: [], split: [],
      purpose: a.purpose, state: 'submitted', verdicts: [], explanation: '', requesterName: name,
      oneGrantBasis: '',
    });
    writeLog(ctx, who, `${name} asked to buy ${a.item} (${usd(a.price)})`, a.purpose || 'No purpose given.', { refId: id });
    sendToGrantOffice(ctx, ctx.db.request.id.find(id)!);
  }),
);

// ── Experiment plans (T71) ────────────────────────────────────────────────

const PlanLine = t.object('PlanLineArg', { line: t.u32(), item: t.string(), category: t.string(), price: t.f64(), purpose: t.string() });
const PLAN_SAVES = ['draft', 'submitted', 'sent'] as const;

type PlanRow = NonNullable<ReturnType<Ctx['db']['plan']['id']['find']>>;

/** A plan's purchasable lines become requests, asked by the plan's researcher. */
function sendPlanLines(ctx: Ctx, p: PlanRow, actor: string): void {
  for (const l of p.lines) {
    if (!l.item.trim() || !(l.price > 0)) fail(`Line ${l.line} needs an item and a price over $0.`);
    const id = nextId(ctx, 'rq', x => !!ctx.db.request.id.find(x));
    ctx.db.request.insert({
      id, day: today(ctx), requester: 'scientist', requestedBy: p.ownedBy, item: l.item, category: l.category,
      price: l.price, grantId: p.grantId, chargedGrantId: undefined, sharedWith: [], split: [],
      purpose: l.purpose, state: 'submitted', verdicts: [], explanation: '', requesterName: p.researcher, oneGrantBasis: '',
    });
    writeLog(ctx, actor, `${p.researcher} asked to buy ${l.item} (${usd(l.price)}), line ${l.line} of plan ${p.id}`, l.purpose, { refId: id });
    sendToGrantOffice(ctx, ctx.db.request.id.find(id)!);
  }
}

/**
 * Researchers only: save a plan as a draft, submit it for the grant manager,
 * or send it (its report cleared every check), which makes one request per
 * purchasable line. Each goes to the grant office like any request.
 */
export const save_plan = spacetimedb.reducer(
  {
    id: t.string(), status: t.string(), grantId: t.string(), experiment: t.string(), total: t.f64(),
    overall: t.string(), lines: t.array(PlanLine), body: t.string(), report: t.string(),
  },
  (ctx, a) => guard(() => {
    const who = requirePerson(ctx, 'scientist');
    const status = oneOf('status', PLAN_SAVES, a.status);
    if (!/^[\w-]{1,40}$/.test(a.id)) fail('A plan id is letters, digits and dashes.');
    getGrant(ctx, a.grantId);
    const old = ctx.db.plan.id.find(a.id);
    if (old && !old.ownedBy.isEqual(ctx.sender)) fail('Only the researcher who wrote a plan can change it.');
    if (old?.status === 'sent') fail('This plan\'s lines are already requests; push back on those instead.');
    if (status !== 'draft' && !a.report) fail('Assess the plan before submitting it.');
    if (status === 'sent' && a.overall !== 'aligned') fail('Only a plan that clears every check becomes requests right away; submit it for review instead.');
    const name = ctx.db.person.identity.find(ctx.sender)?.name ?? who;
    const row = {
      id: a.id, researcher: name, ownedBy: ctx.sender, status, grantId: a.grantId, experiment: a.experiment,
      total: a.total, overall: a.overall, lines: a.lines, body: a.body, report: a.report, savedOn: today(ctx),
      submittedOn: status === 'draft' ? '' : today(ctx), sentOn: status === 'sent' ? today(ctx) : '',
      decisionChoice: '', decisionReason: '', decisionDay: '',
    };
    if (old) ctx.db.plan.id.update(row); else ctx.db.plan.insert(row);
    const what = { draft: 'Saved a draft of', submitted: 'Submitted for review', sent: 'Sent as requests' }[status];
    writeLog(ctx, who, `${what} plan ${a.id} (${usd(a.total)})`, a.experiment.slice(0, 200) || 'No experiment given.', { refId: a.id });
    if (status === 'sent') sendPlanLines(ctx, row, who);
  }),
);

/** The researcher deletes a plan whose lines aren't requests yet. */
export const delete_plan = spacetimedb.reducer({ id: t.string() }, (ctx, { id }) => guard(() => {
  const who = requirePerson(ctx, 'scientist');
  const p = ctx.db.plan.id.find(id) ?? fail(`No plan ${id}.`);
  if (!p.ownedBy.isEqual(ctx.sender)) fail('Only the researcher who wrote a plan can delete it.');
  if (p.status === 'sent') fail('This plan\'s lines are already requests.');
  ctx.db.plan.id.delete(id);
  writeLog(ctx, who, `Deleted plan ${id}`, p.experiment.slice(0, 200) || 'No experiment given.', { refId: id });
}));

/**
 * Grant manager only, with a reason: approve a submitted plan (its lines
 * become requests in the researcher's name) or return it to them.
 */
export const decide_plan = spacetimedb.reducer({ id: t.string(), choice: t.string(), reason: t.string() }, (ctx, a) => guard(() => {
  const who = requirePerson(ctx, 'grant_manager');
  const choice = oneOf('choice', ['approve', 'return'] as const, a.choice);
  if (!a.reason.trim()) fail('A reason is required.');
  const p = ctx.db.plan.id.find(a.id) ?? fail(`No plan ${a.id}.`);
  if (p.ownedBy.isEqual(ctx.sender)) fail('Nobody approves their own plan.');
  if (p.status !== 'submitted') fail(`Plan ${a.id} is ${p.status}, not waiting for a decision.`);
  const row = {
    ...p, status: choice === 'approve' ? 'sent' : 'returned', sentOn: choice === 'approve' ? today(ctx) : '',
    decisionChoice: choice, decisionReason: a.reason.trim(), decisionDay: today(ctx),
  };
  ctx.db.plan.id.update(row);
  writeLog(ctx, who, `${choice === 'approve' ? 'Approved' : 'Returned'} plan ${p.id} (${p.researcher}, ${usd(p.total)})`, a.reason.trim(), { refId: p.id });
  if (choice === 'approve') sendPlanLines(ctx, row, who);
}));

/** The requester pushes back with new information; it goes back to the grant office. */
export const push_back = spacetimedb.reducer({ requestId: t.string(), message: t.string() }, (ctx, { requestId, message }) => guard(() => {
  const who = requirePerson(ctx);
  const r = ctx.db.request.id.find(requestId) ?? fail(`No request ${requestId}.`);
  if (!r.requestedBy || !r.requestedBy.isEqual(ctx.sender)) fail('Only the person who asked can push back.');
  if (!message.trim()) fail('Say what changed.');
  if (r.state === 'bought' || r.state === 'rerouted' || r.state === 'canceled') fail(`Already ${r.state}.`);
  writeLog(ctx, who, `Pushed back on ${r.item}${r.requesterName ? ` (${r.requesterName})` : ''}`, message, { refId: requestId });
  sendToGrantOffice(ctx, r, message.trim());
}));

/**
 * Unused since T108 (the purchasing agent was cut); kept so deployed clients
 * keep working. Purchasing agent: run every spending rule for a request against a grant
 * (default: the one asked for) and store the verdicts on the request. No
 * money moves; read the verdicts, then call act_on_request.
 */
export const evaluate_request = spacetimedb.reducer(
  // split is ignored (T95); the arg stays so deployed workers keep working.
  { requestId: t.string(), grantId: t.string().optional(), split: t.array(Split) },
  (ctx, { requestId, grantId }) => guard(() => {
    const role = requireAgent(ctx, 'purchasing');
    const r = ctx.db.request.id.find(requestId) ?? fail(`No request ${requestId}.`);
    const gid = grantId ?? r.grantId ?? fail('Pick a grant to check against.');
    const g = getGrant(ctx, gid);
    const req = withSameDay(ctx, r);
    const verdicts = spendingVerdicts(req, g, today(ctx));
    ctx.db.request.id.update({ ...r, chargedGrantId: gid, verdicts: vrows(verdicts) });
    const failed = verdicts.filter(v => !v.pass);
    writeLog(ctx, role, `Checked ${r.item} against ${gid}`, failed.length ? `Failed: ${failed.map(v => v.rule).join('; ')}.` : 'Every rule passes.', {
      rule: failed[0]?.rule, refId: requestId,
    });
  }),
);

/**
 * Unused since T108, kept for deployed clients. Purchasing agent acts on a request:
 * - buy: rules are rechecked now; refused unless every rule passes (incl. card limit);
 * - reroute: buy on `grantId` instead; same recheck there;
 * - hold: send to the grant manager's Inbox;
 * - block: flag it: nothing is bought, and it goes to the grant manager's
 *   Inbox (the explanation says why). The agent never rejects a request;
 *   only the grant manager does.
 */
export const act_on_request = spacetimedb.reducer(
  { requestId: t.string(), action: t.string(), grantId: t.string().optional(), vendor: t.string(), explanation: t.string() },
  (ctx, a) => guard(() => {
    const role = requireAgent(ctx, 'purchasing');
    const r = ctx.db.request.id.find(a.requestId) ?? fail(`No request ${a.requestId}.`);
    if (DONE_STATES.includes(r.state)) fail(`Request is already ${r.state}.`);
    if (!a.explanation.trim()) fail('Explain the decision.');
    const action = oneOf('action', ['buy', 'reroute', 'hold', 'block'] as const, a.action);
    const gid = a.grantId ?? r.chargedGrantId ?? r.grantId ?? fail('Pick a grant.');
    const verdicts = spendingVerdicts(withSameDay(ctx, r), getGrant(ctx, gid), today(ctx));

    if (action === 'buy' || action === 'reroute') {
      if (!canBuyAlone(verdicts)) {
        const failed = verdicts.filter(v => !v.pass).map(v => v.rule).join('; ');
        fail(`Can't buy on ${gid}: ${failed}. Hold it for the grant manager or block it.`);
      }
      placeOrder(ctx, { ...r, chargedGrantId: gid }, a.vendor || 'Vendor', role);
      ctx.db.request.id.update({
        ...ctx.db.request.id.find(r.id)!, state: action === 'reroute' && gid !== r.grantId ? 'rerouted' : 'bought',
        chargedGrantId: gid, verdicts: vrows(verdicts), explanation: a.explanation,
      });
      closePurchaseHolds(ctx, r.id);
      writeLog(ctx, role, `${action === 'reroute' ? `Rerouted to ${gid} and bought` : 'Bought'} ${r.item} (${usd(r.price)})`, a.explanation, {
        rule: 'All rules pass, under card limit', refId: r.id,
      });
      return;
    }
    if (action === 'hold') {
      ctx.db.request.id.update({ ...r, state: 'waiting_on_manager', chargedGrantId: gid, verdicts: vrows(verdicts), explanation: a.explanation });
      const failed = verdicts.filter(v => !v.pass);
      raiseHoldRow(ctx, {
        kind: 'purchase', refId: r.id, grantId: gid, raisedBy: role,
        title: `Buy ${r.item} (${usd(r.price)}) on ${gid}?`, why: a.explanation,
        evidence: (failed.length ? failed : verdicts).map(v => ({ label: v.rule, value: v.detail })),
        options: ['approve', 'reject'],
      });
      return;
    }
    ctx.db.request.id.update({ ...r, state: 'blocked', chargedGrantId: gid, verdicts: vrows(verdicts), explanation: a.explanation });
    const failed = verdicts.filter(v => !v.pass);
    writeLog(ctx, role, `Flagged ${r.item}`, a.explanation, { rule: failed[0]?.rule, refId: r.id });
    raiseHoldRow(ctx, {
      kind: 'purchase', refId: r.id, grantId: gid, raisedBy: role,
      title: `Flagged: buy ${r.item} (${usd(r.price)}) on ${gid} anyway?`, why: a.explanation,
      evidence: (failed.length ? failed : verdicts).map(v => ({ label: v.rule, value: v.detail })),
      options: ['approve', 'reject'],
    });
  }),
);

function placeOrder(
  ctx: Ctx,
  r: { id: string; price: number; chargedGrantId?: string; split: { grantId: string; share: number }[] },
  vendor: string,
  actor: string,
): void {
  const charges = r.split.length ? r.split : [{ grantId: r.chargedGrantId!, share: 1 }];
  for (const c of charges) {
    const amount = Math.round(r.price * c.share * 100) / 100;
    const id = nextId(ctx, 'o', x => !!ctx.db.order.id.find(x));
    ctx.db.order.insert({ id, requestId: r.id, grantId: c.grantId, vendor, amount, placed: today(ctx), state: 'open', canceledOn: undefined, changedAmount: undefined });
    ctx.db.approval.insert({ id: nextId(ctx, 'ap', x => !!ctx.db.approval.id.find(x)), orderId: id, amount, by: actor, day: today(ctx) });
    adjustMoney(ctx, c.grantId, { promised: amount });
  }
}

// ── The Inbox (T7) ────────────────────────────────────────────────────────

/** Agents only: put something in the grant manager's Inbox. */
export const raise_hold = spacetimedb.reducer(
  {
    kind: t.string(), refId: t.string(), grantId: t.string().optional(), title: t.string(), why: t.string(),
    evidence: t.array(Evidence), options: t.array(t.string()),
  },
  (ctx, a) => guard(() => {
    const role = requireAgent(ctx);
    oneOf('kind', HOLD_KINDS, a.kind);
    for (const o of a.options) oneOf('option', CHOICES, o);
    if (!a.title.trim() || !a.why.trim()) fail('A hold needs a title and a reason.');
    raiseHoldRow(ctx, { ...a, raisedBy: role, options: a.options.length ? a.options : ['approve', 'reject'] });
  }),
);

/**
 * Grant manager only, reason required: decide an Inbox item. The module then
 * acts on it. On a purchase the grant manager's call is final: approve buys
 * (any rules that fail are logged with the reason), reject refuses.
 */
export const decide_hold = spacetimedb.reducer(
  { holdId: t.u64(), choice: t.string(), reason: t.string() },
  (ctx, { holdId, choice, reason }) => guard(() => {
    const who = requirePerson(ctx, 'grant_manager');
    const h = ctx.db.hold.id.find(holdId) ?? fail(`No hold ${holdId}.`);
    if (!h.open) fail('Already decided.');
    const c = oneOf('choice', CHOICES, choice);
    if (!h.options.includes(c)) fail(`This item can't be decided with "${c}"; options: ${h.options.join(', ')}.`);
    if (!reason.trim()) fail('A reason is required.');
    if (h.kind === 'purchase') {
      const r = ctx.db.request.id.find(h.refId);
      if (r?.requestedBy && r.requestedBy.isEqual(ctx.sender)) fail('Nobody approves their own request.');
    }
    ctx.db.hold.id.update({ ...h, open: false });
    ctx.db.decision.insert({ id: 0n, holdId, choice: c, reason, by: who, byIdentity: ctx.sender, day: today(ctx), at: ctx.timestamp });
    writeLog(ctx, who, `Decided "${h.title}": ${c}`, reason, { refId: h.refId });
    applyDecision(ctx, h, c, reason, who);
  }),
);

const ASKED_VENDOR = 'Grant manager asked the vendor';

function applyDecision(ctx: Ctx, h: { kind: string; refId: string; grantId?: string }, c: string, reason: string, who: string): void {
  switch (h.kind) {
    case 'purchase': {
      const r = ctx.db.request.id.find(h.refId);
      if (!r) return;
      if (r.state === 'bought' || r.state === 'rerouted') {
        writeLog(ctx, 'system', `Did not buy ${r.item} again`, `It was already ${r.state}; no second order placed.`, { refId: r.id });
        return;
      }
      if (c === 'reject') {
        ctx.db.request.id.update({ ...r, state: 'rejected', explanation: `The grant manager rejected it: ${reason}` });
        return;
      }
      const gid = r.chargedGrantId ?? r.grantId;
      if (!gid) return;
      const verdicts = spendingVerdicts(withSameDay(ctx, r), getGrant(ctx, gid), today(ctx));
      const failing = verdicts.filter(v => !v.pass);
      // The approval promises the money; the researcher buys it and sends the invoice.
      placeOrder(ctx, { ...r, chargedGrantId: gid }, 'Vendor', who);
      const next = `The researcher buys it and sends the invoice; once the grant office approves the invoice, it is charged to ${gid}.`;
      const explanation = failing.length
        ? `The grant office approved it (${reason}), although it fails: ${failing.map(v => v.rule).join('; ')}. ${next}`
        : `The grant office approved it (${reason}); every rule passes. ${next}`;
      // 'bought' is the state name older clients and the eval read; since T108 it means approved to buy.
      ctx.db.request.id.update({ ...ctx.db.request.id.find(r.id)!, verdicts: vrows(verdicts), state: 'bought', chargedGrantId: gid, explanation });
      writeLog(ctx, 'system', `Approved buying ${r.item} (${usd(r.price)}) on ${gid}`, failing.length ? `Approved by the grant office despite: ${failing.map(v => v.rule).join('; ')}.` : 'Approved; every rule passes.', { rule: failing[0]?.rule, refId: r.id });
      return;
    }
    case 'invoice': {
      const inv = ctx.db.invoice.id.find(h.refId);
      if (!inv) return;
      const decided = (what: string) => [...inv.timeline, { day: today(ctx), what: `${what}: ${reason}` }];
      if (c === 'approve') {
        const o = ctx.db.order.id.find(inv.orderId);
        ctx.db.invoice.id.update({ ...inv, timeline: [...decided('Approved by the grant office'), { day: today(ctx), what: `Charged to ${o?.grantId ?? 'the grant'}; the researcher is reimbursed` }] });
        payInvoice(ctx, inv.id);
      } else if (c === 'reject') ctx.db.invoice.id.update({ ...inv, state: 'rejected', timeline: decided('Rejected by the grant manager') });
      else if (c === 'ask_vendor') {
        // Not a dead end: the invoice stays held and the Inbox keeps an item
        // for the vendor's answer. A corrected invoice for the order replaces
        // this one instead (inject_invoice).
        const timeline = decided(ASKED_VENDOR);
        ctx.db.invoice.id.update({ ...inv, timeline });
        raiseHoldRow(ctx, {
          kind: 'invoice', refId: inv.id, grantId: h.grantId, raisedBy: 'bookkeeping', // the invoice check's item, continued
          title: `Waiting on ${inv.vendor} about ${inv.id}: record their answer`,
          why: `You asked ${inv.vendor} about this invoice (${usd(inv.amount)}): ${inv.mismatch ?? 'it did not match.'} Approve pays it as billed if they confirm it; reject refuses it. A corrected invoice from them replaces this one.`,
          evidence: timeline.map(e => ({ label: e.day, value: e.what })),
          options: ['approve', 'reject'],
        });
      }
      return;
    }
    case 'payment_request': {
      const pr = ctx.db.paymentRequest.id.find(h.refId);
      if (pr) ctx.db.paymentRequest.id.update({ ...pr, state: c === 'reject' ? 'drafted' : 'sent' });
      return;
    }
    case 'follow_up': {
      const fu = ctx.db.followUp.id.find(h.refId);
      if (fu) ctx.db.followUp.id.update({ ...fu, state: c === 'reject' ? 'drafted' : 'sent' });
      return;
    }
    case 'report': {
      const p = ctx.db.reportPaper.id.find(h.refId);
      if (p && c !== 'reject') ctx.db.reportPaper.id.update({ ...p, result: 'note' });
      return;
    }
    case 'paid_while_canceled': {
      if (c !== 'approve' || !h.grantId) return;
      ctx.db.statusEvent.insert({ id: 0n, grantId: h.grantId, day: today(ctx), kind: 'unfrozen', source: 'Payment system', summary: `Unfrozen by the grant manager: the money restores the grant. ${reason}`, amount: undefined, at: ctx.timestamp });
      recomputeGrant(ctx, h.grantId, who);
      return;
    }
    case 'source_disagreement': {
      const f = ctx.db.flag.id.find(BigInt(h.refId));
      if (f) {
        ctx.db.flag.id.update({ ...f, open: false });
        recomputeGrant(ctx, f.grantId, who);
      }
      return;
    }
  }
}

/** Grant manager only: unfreeze a grant early, with a reason that goes in the log. */
export const unfreeze_grant = spacetimedb.reducer({ grantId: t.string(), reason: t.string() }, (ctx, { grantId, reason }) => guard(() => {
  const who = requirePerson(ctx, 'grant_manager');
  if (!reason.trim()) fail('A reason is required.');
  getGrant(ctx, grantId);
  ctx.db.statusEvent.insert({ id: 0n, grantId, day: today(ctx), kind: 'unfrozen', source: 'Payment system', summary: `Unfrozen early by the grant manager: ${reason}`, amount: undefined, at: ctx.timestamp });
  for (const f of [...ctx.db.flag.grantId.filter(grantId)]) if (f.open && f.kind === 'sources_disagree') ctx.db.flag.id.update({ ...f, open: false });
  writeLog(ctx, who, `Unfroze ${grantId} early`, reason, { refId: grantId });
  recomputeGrant(ctx, grantId, who);
}));

// ── Fund tracker (P1, P6, B7) ─────────────────────────────────────────────

/** Bookkeeping agent: what one source says about one grant (post changes only). */
export const post_source_reading = spacetimedb.reducer(
  {
    grantId: t.string(), source: t.string(), status: t.string().optional(), awarded: t.f64().optional(),
    paid: t.f64().optional(), endDate: t.string().optional(), url: t.string(),
  },
  (ctx, a) => guard(() => {
    const role = requireAgent(ctx, 'bookkeeping');
    getGrant(ctx, a.grantId);
    oneOf('source', SOURCES, a.source);
    if (a.status) oneOf('status', GRANT_STATUSES, a.status);
    ctx.db.sourceReading.insert({
      id: 0n, grantId: a.grantId, source: a.source, status: a.status, awarded: a.awarded,
      paid: a.paid, endDate: a.endDate, url: a.url, day: today(ctx), at: ctx.timestamp,
    });
    writeLog(ctx, role, `Read ${a.source} for ${a.grantId}`, a.status ? `Status: ${a.status}.` : 'New reading.', { refId: a.grantId });
  }),
);

// day (T65): the day the source says it happened (e.g. the list's
// termination date), not after today; none = today.
function insertStatusEvent(ctx: Ctx, actor: string, a: { grantId: string; kind: string; source: string; summary: string; amount?: number; day?: string }): void {
  getGrant(ctx, a.grantId);
  oneOf('kind', STATUS_EVENT_KINDS, a.kind);
  oneOf('source', SOURCES, a.source);
  if (a.kind === 'payment_received' && !(a.amount && a.amount > 0)) fail('A payment needs an amount.');
  if (a.day && !(isRealDay(a.day) && a.day <= today(ctx))) fail(`day must be a real date written YYYY-MM-DD, not after today (${today(ctx)}); got "${a.day}".`);
  const { day, ...rest } = a;
  ctx.db.statusEvent.insert({ id: 0n, ...rest, amount: a.amount, day: day || today(ctx), at: ctx.timestamp });
  if (a.kind === 'payment_received') adjustMoney(ctx, a.grantId, { received: a.amount });
  writeLog(ctx, actor, `${a.grantId}: ${a.kind.replace(/_/g, ' ')}`, a.summary, { refId: a.grantId });
  recomputeGrant(ctx, a.grantId, actor);
}

/** Bookkeeping agent: a status change (canceled, court order, payment...). Freeze is recomputed. */
export const post_status_event = spacetimedb.reducer(
  { grantId: t.string(), kind: t.string(), source: t.string(), summary: t.string(), amount: t.f64().optional(), day: t.string().optional() },
  (ctx, a) => guard(() => insertStatusEvent(ctx, requireAgent(ctx, 'bookkeeping'), a)),
);

/** Each source's latest reading of a grant (ids only grow, so the highest id is the latest). */
function latestReadings(ctx: Ctx, grantId: string) {
  const byId = [...ctx.db.sourceReading.grantId.filter(grantId)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const latest = new Map<string, (typeof byId)[number]>();
  for (const r of byId) latest.set(r.source, r);
  return [...latest.values()];
}

/** Bookkeeping agent: flag a problem. A sources_disagree flag freezes the grant and goes to the Inbox. */
export const raise_flag = spacetimedb.reducer(
  { grantId: t.string(), kind: t.string(), summary: t.string() },
  (ctx, { grantId, kind, summary }) => guard(() => {
    const role = requireAgent(ctx, 'bookkeeping');
    getGrant(ctx, grantId);
    oneOf('kind', FLAG_KINDS, kind);
    const f = ctx.db.flag.insert({ id: 0n, grantId, day: today(ctx), kind, summary, open: true, raisedBy: role });
    writeLog(ctx, role, `Flagged ${grantId}: ${kind.replace(/_/g, ' ')}`, summary, { refId: f.id.toString() });
    if (kind === 'sources_disagree') {
      raiseHoldRow(ctx, {
        kind: 'source_disagreement', refId: f.id.toString(), grantId, raisedBy: role,
        title: `Which source is right about ${grantId}?`, why: `${summary} Spending stays frozen until you decide.`,
        evidence: latestReadings(ctx, grantId).map(r => ({ label: r.source, value: `${r.status ?? 'no status'} (${r.day})` })),
        options: ['pick_source'],
      });
    }
    recomputeGrant(ctx, grantId, role);
  }),
);

/** Anyone: "check now" (person) or a recheck before money moves (agent). */
// asOf (demo time buttons, T59): the real day the cancellation list is read
// as of, for this and later checks until another check_now changes it.
export const request_check = spacetimedb.reducer({ grantId: t.string().optional(), reason: t.string(), asOf: t.string().optional() }, (ctx, { grantId, reason, asOf }) => guard(() => {
  const who = requireAnyone(ctx);
  oneOf('reason', CHECK_REASONS, reason);
  if (grantId) getGrant(ctx, grantId);
  if (asOf && !isRealDay(asOf)) fail(`asOf must be a real date written YYYY-MM-DD; got "${asOf}".`);
  const row = ctx.db.checkRequest.insert({ id: 0n, grantId, reason, requestedBy: who, day: today(ctx), done: false, asOf: asOf ?? '' });
  writeLog(ctx, who, `Asked for a source check${grantId ? ` of ${grantId}` : ''}`, `${reason.replace(/_/g, ' ')}${asOf ? `, cancellation list as of ${asOf}` : ''}`, { refId: row.id.toString() });
}));

/** Bookkeeping agent: mark a check request done. */
export const complete_check = spacetimedb.reducer({ id: t.u64() }, (ctx, { id }) => guard(() => {
  const role = requireAgent(ctx, 'bookkeeping');
  const c = ctx.db.checkRequest.id.find(id) ?? fail(`No check request ${id}.`);
  ctx.db.checkRequest.id.update({ ...c, done: true });
  writeLog(ctx, role, 'Finished a source check', c.grantId ?? 'all grants', { refId: id.toString() });
}));

// ── Item check (T103) ─────────────────────────────────────────────────────

const ITEM_VERDICTS = ['fine', 'flag', 'unchecked'];

/** A person: ask whether an item is a research cost at all, before any grant. The worker answers with Haiku. */
export const ask_item_check = spacetimedb.reducer({ item: t.string(), purpose: t.string(), price: t.f64() }, (ctx, { item, purpose, price }) => guard(() => {
  const who = requirePerson(ctx);
  if (!item.trim()) fail('Say what you want to buy.');
  if (!(price > 0)) fail('The price must be more than $0.');
  ctx.db.itemCheck.insert({ id: 0n, item: item.trim(), purpose: purpose.trim(), price, requestedBy: who, answered: false, verdict: '', why: '', category: '' });
}));

/** The bookkeeping agent (the purchasing agent before T108): answer an item check. */
export const answer_item_check = spacetimedb.reducer({ id: t.u64(), verdict: t.string(), why: t.string(), category: t.string() }, (ctx, { id, verdict, why, category }) => guard(() => {
  requireAgent(ctx, 'bookkeeping', 'purchasing');
  oneOf('verdict', ITEM_VERDICTS, verdict);
  const c = ctx.db.itemCheck.id.find(id) ?? fail(`No item check ${id}.`);
  ctx.db.itemCheck.id.update({ ...c, answered: true, verdict, why, category });
}));

// ── Invoice check (P4) ────────────────────────────────────────────────────

function payInvoice(ctx: Ctx, invoiceId: string): void {
  const inv = ctx.db.invoice.id.find(invoiceId)!;
  const o = ctx.db.order.id.find(inv.orderId);
  ctx.db.invoice.id.update({ ...inv, state: 'paid' });
  if (o && o.state !== 'paid') {
    const wasPromised = o.state === 'open' || o.state === 'changed';
    ctx.db.order.id.update({ ...o, state: 'paid' });
    if (o.grantId) adjustMoney(ctx, o.grantId, { spent: inv.amount, promised: wasPromised ? -(o.changedAmount ?? o.amount) : 0 });
  }
}

/**
 * Bookkeeping agent: match an invoice to its order and approval. The module
 * applies the rule: a match goes to the grant office to approve; a mismatch
 * is held with its timeline. Either way the grant office decides in the
 * Inbox, and an approved invoice is charged to the grant (T108).
 */
export const check_invoice = spacetimedb.reducer({ invoiceId: t.string() }, (ctx, { invoiceId }) => guard(() => {
  const role = requireAgent(ctx, 'bookkeeping');
  const inv = ctx.db.invoice.id.find(invoiceId) ?? fail(`No invoice ${invoiceId}.`);
  if (inv.state === 'paid' || inv.state === 'rejected') fail(`Invoice is already ${inv.state}.`);
  const o = ctx.db.order.id.find(inv.orderId);
  const others = [...ctx.db.invoice.iter()].filter(x => x.orderId === inv.orderId && x.id !== inv.id);
  const v = checkInvoice(inv, o ?? undefined, [...ctx.db.approval.orderId.filter(inv.orderId)], others);
  if (v.matched && o?.grantId) getGrant(ctx, o.grantId); // a match must have a grant to charge
  ctx.db.invoice.id.update({ ...inv, state: v.matched ? 'matched' : 'held', mismatch: v.mismatch, timeline: v.timeline, checked: true });
  if (v.matched) {
    writeLog(ctx, role, `Matched invoice ${inv.id}`, 'Order open and amount matches the approval; sent to the grant office to approve.', { rule: 'Invoice needs an open order and the approved amount', refId: inv.id });
    raiseHoldRow(ctx, {
      kind: 'invoice', refId: inv.id, grantId: o?.grantId, raisedBy: role,
      title: `Approve ${inv.vendor}'s invoice ${inv.id} (${usd(inv.amount)})?`,
      why: `It matches its order ${inv.orderId} and the approved amount. Approving charges it to ${o?.grantId ?? 'the grant'} and reimburses the researcher.`,
      evidence: v.timeline.map(e => ({ label: e.day, value: e.what })),
      options: ['approve', 'reject'],
    });
  } else {
    writeLog(ctx, role, `Held invoice ${inv.id}`, v.mismatch!, { rule: 'Invoice needs an open order and the approved amount', refId: inv.id });
    raiseHoldRow(ctx, {
      kind: 'invoice', refId: inv.id, grantId: o?.grantId, raisedBy: role,
      title: `Pay ${inv.vendor} ${usd(inv.amount)}?`, why: v.mismatch!,
      evidence: v.timeline.map(e => ({ label: e.day, value: e.what })),
      options: ['approve', 'reject', 'ask_vendor'],
    });
  }
}));

// ── Payment requests (P5) ─────────────────────────────────────────────────

/**
 * Payment and report agent: draft a payment request for a grant and date
 * range. The module picks the purchases (held invoices left out) and payroll
 * and computes the amount; the agent writes the explanation (≤ 1,000 chars).
 */
export const draft_payment_request = spacetimedb.reducer(
  { grantId: t.string(), from: t.string(), to: t.string(), explanation: t.string() },
  (ctx, a) => guard(() => {
    const role = requireAgent(ctx, 'payment_report');
    getGrant(ctx, a.grantId);
    if (a.explanation.length > PAYMENT_EXPLANATION_MAX) fail(`Explanation is ${a.explanation.length} characters; the limit is ${PAYMENT_EXPLANATION_MAX}.`);
    if (!a.explanation.trim()) fail('Write the explanation.');
    const inRange = (d: string) => d >= a.from && d <= a.to;
    const orders = [...ctx.db.order.iter()].filter(o => o.grantId === a.grantId && inRange(o.placed) && o.state !== 'canceled');
    const invoices = [...ctx.db.invoice.iter()];
    const included: string[] = [];
    const excluded: { requestId: string; why: string }[] = [];
    let amount = 0;
    for (const o of orders) {
      const held = invoices.find(i => i.orderId === o.id && i.state === 'held');
      if (held) {
        excluded.push({ requestId: o.requestId, why: `Invoice ${held.id} is on hold: ${held.mismatch ?? 'mismatch'}` });
        continue;
      }
      if (!included.includes(o.requestId)) included.push(o.requestId);
      amount += o.changedAmount ?? o.amount;
    }
    // Held invoices outside the order window still get named, so nothing held slips in.
    for (const i of invoices) {
      const o = ctx.db.order.id.find(i.orderId);
      if (i.state === 'held' && o?.grantId === a.grantId && inRange(i.received) && !excluded.some(e => e.requestId === o.requestId)) {
        excluded.push({ requestId: o.requestId, why: `Invoice ${i.id} is on hold: ${i.mismatch ?? 'mismatch'}` });
      }
    }
    const allPay = [...ctx.db.payroll.iter()];
    const pay: typeof allPay = [];
    for (const p of allPay.filter(p => p.grantId === a.grantId && p.from >= a.from && p.to <= a.to)) {
      const why = effortWhy(p, allPay);
      if (why) excluded.push({ requestId: p.id, why });
      else pay.push(p);
    }
    amount += pay.reduce((s, p) => s + p.amount, 0);
    const id = nextId(ctx, 'pr', x => !!ctx.db.paymentRequest.id.find(x));
    ctx.db.paymentRequest.insert({
      id, grantId: a.grantId, from: a.from, to: a.to, amount, explanation: a.explanation,
      includedRequestIds: included, includedPayrollIds: pay.map(p => p.id), excluded, state: 'waiting_on_manager',
    });
    writeLog(ctx, role, `Drafted payment request ${id} (${usd(amount)})`, `${included.length} purchases, ${pay.length} payroll rows, ${excluded.length} left out.`, {
      rule: 'Held spending is left out', refId: id,
    });
    raiseHoldRow(ctx, {
      kind: 'payment_request', refId: id, grantId: a.grantId, raisedBy: role,
      title: `Send payment request ${id} (${usd(amount)})?`, why: 'Payment requests always need the grant manager.',
      evidence: [
        { label: 'Period', value: `${a.from} to ${a.to}` },
        { label: 'Left out', value: excluded.length ? excluded.map(e => `${e.requestId}: ${e.why}`).join(' ') : 'nothing' },
      ],
      options: ['approve', 'reject'],
    });
  }),
);

/** The funder persona asks a follow-up question about a payment request. */
export const ask_follow_up = spacetimedb.reducer({ paymentRequestId: t.string(), question: t.string() }, (ctx, a) => guard(() => {
  const who = requirePerson(ctx, 'funder', 'grant_manager');
  ctx.db.paymentRequest.id.find(a.paymentRequestId) ?? fail(`No payment request ${a.paymentRequestId}.`);
  if (!a.question.trim()) fail('Ask a question.');
  const id = nextId(ctx, 'fu', x => !!ctx.db.followUp.id.find(x));
  ctx.db.followUp.insert({ id, paymentRequestId: a.paymentRequestId, question: a.question, answerDraft: undefined, state: 'asked' });
  writeLog(ctx, who, `Asked a follow-up on ${a.paymentRequestId}`, a.question, { refId: id });
}));

/** Payment and report agent: draft an answer to a follow-up; it waits for the grant manager. */
export const draft_follow_up_answer = spacetimedb.reducer({ followUpId: t.string(), answer: t.string() }, (ctx, a) => guard(() => {
  const role = requireAgent(ctx, 'payment_report');
  const fu = ctx.db.followUp.id.find(a.followUpId) ?? fail(`No follow-up ${a.followUpId}.`);
  if (!a.answer.trim()) fail('Write the answer.');
  ctx.db.followUp.id.update({ ...fu, answerDraft: a.answer, state: 'waiting_on_manager' });
  writeLog(ctx, role, `Drafted an answer to ${fu.id}`, a.answer.slice(0, 200), { refId: fu.id });
  const pr = ctx.db.paymentRequest.id.find(fu.paymentRequestId);
  raiseHoldRow(ctx, {
    kind: 'follow_up', refId: fu.id, grantId: pr?.grantId, raisedBy: role,
    title: `Send this answer to the funder's question on ${fu.paymentRequestId}?`, why: fu.question,
    evidence: [{ label: 'Draft answer', value: a.answer }], options: ['approve', 'reject'],
  });
}));

// ── Progress report (P7) ──────────────────────────────────────────────────

/**
 * Payment and report agent: record what public records say about a paper.
 * The module runs the checks; a held paper goes to the Inbox.
 */
export const record_paper_facts = spacetimedb.reducer(
  { paperId: t.string(), creditsGrantId: t.string(), pmcid: t.string().optional(), correction: Correction.optional() },
  (ctx, a) => guard(() => {
    const role = requireAgent(ctx, 'payment_report');
    const p = ctx.db.reportPaper.id.find(a.paperId) ?? fail(`No paper ${a.paperId}.`);
    const facts = { grantId: p.grantId, creditsGrantId: a.creditsGrantId, pmcid: a.pmcid, correction: a.correction };
    const { checks, result } = checkPaper(facts);
    ctx.db.reportPaper.id.update({ ...p, ...facts, checks, result, checked: true });
    const failed = checks.filter(c => !c.pass);
    writeLog(ctx, role, `Checked paper "${p.title}": ${result}`, failed.length ? failed.map(c => c.detail).join(' ') : 'All checks pass.', {
      rule: 'Only a material correction holds the report', refId: p.id,
    });
    if (result === 'held') {
      raiseHoldRow(ctx, {
        kind: 'report', refId: p.id, grantId: p.grantId, raisedBy: role,
        title: `Paper needs a fix before the report: ${failed.map(c => c.check.toLowerCase()).join(', ')}`,
        why: failed.map(c => c.detail).join(' '),
        evidence: [{ label: 'Paper', value: p.title }, { label: 'DOI', value: p.doi }, ...failed.map(c => ({ label: c.check, value: c.detail }))],
        options: ['approve', 'reject'],
      });
    }
  }),
);

// ── Test lab (demo only; any registered person) ───────────────────────────

/** Set the simulated date. */
export const set_today = spacetimedb.reducer({ day: t.string() }, (ctx, { day }) => guard(() => {
  const who = requirePerson(ctx);
  if (!isRealDay(day)) fail(`Day must be a real date written YYYY-MM-DD; got "${day}".`);
  ctx.db.clock.id.update({ id: 0, today: day });
  writeLog(ctx, who, `Set the clock to ${day}`, 'Test lab.');
  for (const g of [...ctx.db.grant.iter()]) recomputeGrant(ctx, g.id);
}));

/** Fast-forward the simulated clock by n days. */
export const advance_days = spacetimedb.reducer({ days: t.u32() }, (ctx, { days }) => guard(() => {
  const who = requirePerson(ctx);
  const day = addDays(today(ctx), days);
  ctx.db.clock.id.update({ id: 0, today: day });
  writeLog(ctx, who, `Fast-forwarded ${days} days to ${day}`, 'Test lab.');
  for (const g of [...ctx.db.grant.iter()]) recomputeGrant(ctx, g.id);
}));

/** Drop in a status event (cancellation, court order, payment). */
export const inject_status_event = spacetimedb.reducer(
  { grantId: t.string(), kind: t.string(), source: t.string(), summary: t.string(), amount: t.f64().optional(), day: t.string().optional() },
  (ctx, a) => guard(() => insertStatusEvent(ctx, requirePerson(ctx), a)),
);

/** Drop in a vendor invoice for an order; the bookkeeping agent checks it. */
export const inject_invoice = spacetimedb.reducer(
  { orderId: t.string(), amount: t.f64() },
  (ctx, a) => guard(() => {
    const who = requirePerson(ctx);
    const o = ctx.db.order.id.find(a.orderId) ?? fail(`No order ${a.orderId}.`);
    if (!(Number.isFinite(a.amount) && a.amount > 0)) fail('An invoice must be for more than $0.');
    const id = nextId(ctx, 'inv', x => !!ctx.db.invoice.id.find(x));
    ctx.db.invoice.insert({
      id, orderId: o.id, vendor: o.vendor, amount: a.amount, received: today(ctx), state: 'held',
      mismatch: undefined, timeline: [{ day: today(ctx), what: `Invoice arrived for ${usd(a.amount)}` }], checked: false,
    });
    writeLog(ctx, who, `Dropped in invoice ${id} (${usd(a.amount)}) for ${o.id}`, 'Test lab.', { refId: id });
    // The vendor's answer to "ask the vendor": this invoice replaces the held one.
    for (const old of [...ctx.db.invoice.iter()]) {
      if (old.orderId !== o.id || old.state !== 'held' || !old.timeline.at(-1)?.what.startsWith(ASKED_VENDOR)) continue;
      ctx.db.invoice.id.update({ ...old, state: 'rejected', timeline: [...old.timeline, { day: today(ctx), what: `Replaced by the vendor's corrected invoice ${id}` }] });
      for (const hd of [...ctx.db.hold.iter()]) if (hd.open && hd.kind === 'invoice' && hd.refId === old.id) ctx.db.hold.id.update({ ...hd, open: false });
      writeLog(ctx, who, `Replaced invoice ${old.id} with ${id}`, `${o.vendor} sent a corrected invoice after the grant manager asked.`, { refId: old.id });
    }
  }),
);

/** Cancel an open order (its promised money is released). */
export const cancel_order = spacetimedb.reducer({ orderId: t.string() }, (ctx, { orderId }) => guard(() => {
  const who = requirePerson(ctx);
  const o = ctx.db.order.id.find(orderId) ?? fail(`No order ${orderId}.`);
  if (o.state !== 'open' && o.state !== 'changed') fail(`Order is ${o.state}.`);
  ctx.db.order.id.update({ ...o, state: 'canceled', canceledOn: today(ctx) });
  adjustMoney(ctx, o.grantId, { promised: -(o.changedAmount ?? o.amount) });
  writeLog(ctx, who, `Canceled order ${o.id}`, 'Test lab.', { refId: o.id });
  // Every order of its request canceled: nothing was bought after all.
  const r = ctx.db.request.id.find(o.requestId);
  const orders = [...ctx.db.order.iter()].filter(x => x.requestId === o.requestId);
  if (r && (r.state === 'bought' || r.state === 'rerouted') && orders.every(x => x.state === 'canceled')) {
    ctx.db.request.id.update({ ...r, state: 'canceled', explanation: `${r.explanation} Then its order ${o.id} was canceled on ${today(ctx)}, so nothing was bought.`.trim() });
  }
}));

/** Reset to the built-in 2-grant fixtures. */
export const reset_world = spacetimedb.reducer(ctx => guard(() => {
  const who = requirePerson(ctx);
  seedWorld(ctx, fixtures);
  writeLog(ctx, who, 'Reset the world to the fixtures', 'Test lab.');
}));

/** Replace the world with a seed (JSON shaped like Track C's `Db`, web/src/data/types.ts). */
export const load_seed = spacetimedb.reducer({ json: t.string() }, (ctx, { json }) => guard(() => {
  const who = requirePerson(ctx);
  let seed: Seed;
  try {
    seed = JSON.parse(json) as Seed;
  } catch {
    fail('Seed is not valid JSON.');
  }
  if (!seed.today || !Array.isArray(seed.grants)) fail('Seed needs `today` and `grants`.');
  seedWorld(ctx, seed);
  writeLog(ctx, who, `Loaded a seed (${seed.grants.length} grants)`, 'Test lab.');
}));

/** Wipe the world (agents and people stay registered). */
export const clear_world = spacetimedb.reducer(ctx => guard(() => {
  const who = requirePerson(ctx);
  clearWorld(ctx);
  writeLog(ctx, who, 'Cleared the world', 'Test lab.');
}));

