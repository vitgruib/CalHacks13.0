// The purchasing agent (docs/MASTER-PLAN.md §3.2): picks a grant for each
// request, has the module check its spending rules, then buys, reroutes,
// holds or blocks, with an explanation that cites the rule. Track A's module
// decides what passes and rechecks every buy; this agent reads the verdicts
// the module stores on the request and takes the action they call for.
//
// It acts on state changes only, so it never answers its own writes:
// - a request entering 'submitted' (already there at start, new, or pushed back);
// - a grant's freeze lifting (frozen true -> false): requests held only for
//   that freeze are bought, and requests blocked by grant-specific rules are
//   rerouted when a grant can now take them.
// A request a person decided in the Inbox is never bought alone afterwards,
// except an approval the module's recheck blocked only for a freeze: the
// approval stands, so it is bought once that grant unfreezes (or, over the
// card limit, put back in the Inbox for the grant manager to buy).

import { ask } from '../claude.ts';
import {
  ActionError,
  type DecisionRow,
  type GrantRow,
  type OrderRow,
  type RequestRow,
  type RuleVerdict,
  type Split,
} from '../db/contract.ts';
import { EXPLAIN_SYSTEM, EXPLAIN_TASK, ExplainAnswer, READ_SYSTEM, READ_TASK, ReadAnswer } from '../prompts/purchasing.ts';
import { workQueue, type AgentContext, type AgentHandle } from './types.ts';

const AGENT = 'purchasing';
// Used when the lab has never bought anything like it: the university's
// purchasing desk sources it. The rules don't read the vendor.
export const DEFAULT_VENDOR = 'Department purchasing office';
const EXPLANATION_MAX = 1_000;

// ── Track A's spending rules ───────────────────────────────────────────────
// The same pure functions the module runs (server/src/rules.ts). Loaded at
// run time because rules.ts imports './vocab' without an extension, which this
// package's NodeNext typecheck rejects; tsx resolves it, as for db/local.ts.

interface RequestFacts {
  category: string;
  price: number;
  sharedWith: string[];
  split: Split[];
}
type GrantFacts = Pick<GrantRow, 'id' | 'status' | 'end' | 'awarded' | 'spent' | 'promised' | 'frozen' | 'frozenReason'>;
export interface SpendingRules {
  spendingVerdicts(req: RequestFacts, grant: GrantFacts, today: string, grantsById?: Map<string, GrantFacts>): RuleVerdict[];
  rerouteTarget(req: RequestFacts, from: GrantFacts, today: string, grants: GrantFacts[]): string | undefined;
  freezeState(baseStatus: string, events: Array<{ day: string; kind: string }>, openDisagreement: boolean): { status: string; frozen: boolean; frozenReason?: string };
  daysBetween(from: string, to: string): number;
}
const RULES_URL = new URL('../../../server/src/rules.ts', import.meta.url).href;
let rulesModule: Promise<SpendingRules> | undefined;
export const loadRules = (): Promise<SpendingRules> => (rulesModule ??= import(RULES_URL) as Promise<SpendingRules>);

// ── Reading the module's verdicts ──────────────────────────────────────────

// 'ended' is a freeze verdict on a grant past its end date: the module fails
// it under the same rule, but it never lifts. ruleKind can't tell the two
// apart from the rule name; endedFreezeOf can, from the grant.
export type RuleKind = 'grant_exists' | 'freeze' | 'ended' | 'last_90_days' | 'money' | 'category' | 'card_limit' | 'shared_cost' | 'unknown';

// The module's rule names (rules.ts spendingVerdicts); a split adds " (<grant>)".
const RULE_NAMES: Array<[RegExp, RuleKind]> = [
  [/^Grant exists/, 'grant_exists'],
  [/^Grant is active and not frozen/, 'freeze'],
  [/^Not in the grant's last 90 days/, 'last_90_days'],
  [/^Enough truly available money/, 'money'],
  [/^Category allowed/, 'category'],
  [/^Under the card limit/, 'card_limit'],
  [/^Shared cost split/, 'shared_cost'],
];
export const ruleKind = (rule: string): RuleKind => RULE_NAMES.find(([name]) => name.test(rule))?.[1] ?? 'unknown';

// Rules another grant can fix: the same three Track A's rerouteTarget accepts.
const GRANT_SPECIFIC = new Set<RuleKind>(['freeze', 'last_90_days', 'money']);
const blockedOnGrantRules = (verdicts: RuleVerdict[]): boolean => {
  const failed = verdicts.filter((v) => !v.pass);
  return failed.length > 0 && failed.every((v) => GRANT_SPECIFIC.has(ruleKind(v.rule)));
};

/** The grant a freeze verdict is about: named in the rule on a split charge, else the grant checked. */
export const frozenGrantOf = (verdict: RuleVerdict, checked: string | undefined): string | undefined =>
  / \(([A-Za-z0-9-]+)\)$/.exec(verdict.rule)?.[1] ?? checked;

/** The grant ended (the module's own test: status ended, or past its end date). */
export const grantEnded = (grant: Pick<GrantRow, 'status' | 'end'> | undefined, today: string): boolean =>
  grant !== undefined && (grant.status === 'ended' || today > grant.end);

/** A freeze verdict about a grant that has ended, for planFor and failingKinds. */
export const endedFreezeOf = (checked: string | undefined, grants: GrantFacts[], today: string) => (verdict: RuleVerdict): boolean =>
  ruleKind(verdict.rule) === 'freeze' && grantEnded(grants.find((grant) => grant.id === frozenGrantOf(verdict, checked)), today);

/** Every rule the module last failed for the request (apart from `besides`) is a freeze, and one of them is this grant's. */
const failsOnlyOnFreezeOf = (request: RequestRow, grantId: string, besides?: RuleKind): boolean => {
  const failed = request.verdicts.filter((v) => !v.pass && ruleKind(v.rule) !== besides);
  return failed.length > 0 && failed.every((v) => ruleKind(v.rule) === 'freeze') && failed.some((v) => frozenGrantOf(v, request.chargedGrantId) === grantId);
};

export type HoldReason =
  | 'freeze' | 'card_limit' | 'shared_cost' | 'unplaced' | 'unclear_grant' | 'decided_before' | 'unchecked' | 'refused' | 'approved_over_limit';
export type BlockReason = 'category' | 'grant_rules' | 'already_ordered';

export type Plan =
  | { action: 'buy' }
  | { action: 'hold'; reason: HoldReason }
  | { action: 'block'; reason: BlockReason }
  | { action: 'try_reroute' };

/**
 * What the module's verdicts call for, before looking at other grants. A
 * freeze on a grant that has ended (`hasEnded`) never lifts, so it is never
 * held with the promise to buy on unfreeze: another grant may take it instead.
 */
export function planFor(verdicts: RuleVerdict[], hasEnded: (verdict: RuleVerdict) => boolean = () => false): Plan {
  if (verdicts.length === 0) return { action: 'hold', reason: 'unplaced' };
  const failed = failingKinds(verdicts, hasEnded);
  if (failed.length === 0) return { action: 'buy' };
  if (failed.includes('category')) return { action: 'block', reason: 'category' };
  if (failed.some((kind) => kind === 'unknown' || kind === 'grant_exists')) return { action: 'hold', reason: 'unplaced' };
  if (failed.includes('shared_cost')) return { action: 'hold', reason: 'shared_cost' };
  if (failed.includes('card_limit')) return { action: 'hold', reason: 'card_limit' };
  if (failed.every((kind) => kind === 'freeze')) return { action: 'hold', reason: 'freeze' };
  return { action: 'try_reroute' };
}

/**
 * A block of a request already in the Inbox, made a hold: act_on_request's
 * block leaves the open hold as it was. A pending reroute is dropped, since
 * only a blocked request's is carried out (rerouteBlocked).
 */
const keptInInbox = (decision: Decision): Decision => (decision.action === 'block' ? { ...decision, action: 'hold', pendingTo: undefined } : decision);

export interface Decision {
  action: 'buy' | 'reroute' | 'hold' | 'block';
  reason?: HoldReason | BlockReason | 'unfrozen' | 'approved';
  // The grant checked; for a reroute, the one it moves away from.
  grantId: string;
  to?: string;
  // A frozen grant that can take it once it unfreezes (the request is blocked meanwhile).
  pendingTo?: string;
  failed: RuleVerdict[];
  passed: RuleVerdict[];
  note?: string;
  // The module's message when it refused to buy at its own last check.
  refusal?: string;
  // The grant manager's approval this buy (or hold) carries out, which the
  // module blocked while `unfrozen` was frozen.
  approval?: { id: bigint; day: string; unfrozen: string };
}

// ── Reading the request ────────────────────────────────────────────────────

export interface Reading {
  grantId: string;
  grantIsClear: boolean;
  serves: string[];
  split: Split[];
  splitSource: ReadAnswer['splitSource'];
  note: string;
}

const unique = <T>(items: T[]): T[] => [...new Set(items)];
const factsOf = (request: RequestRow, split: Split[]): RequestFacts => ({
  category: request.category,
  price: request.price,
  sharedWith: request.sharedWith,
  split,
});
function failingKinds(verdicts: RuleVerdict[], hasEnded: (verdict: RuleVerdict) => boolean = () => false): RuleKind[] {
  return verdicts.filter((v) => !v.pass).map((v) => (hasEnded(v) ? 'ended' : ruleKind(v.rule)));
}
/** The lab grant ids written out in the item or purpose. */
const namedGrants = (request: RequestRow, ids: string[]): string[] => {
  const text = `${request.item}\n${request.purpose}`;
  return ids.filter((id) => text.includes(id));
};

/**
 * The deterministic reading (and Claude's fallback): the grant the scientist
 * asked for, else the one grant the text names, else the only grant where
 * every rule passes, else the only one failing just on its freeze. Anything
 * else is unclear. A split is only ever the one already on the request.
 */
export function readFallback(request: RequestRow, grants: GrantRow[], rules: SpendingRules, today: string): ReadAnswer {
  const ids = grants.map((grant) => grant.id);
  const named = namedGrants(request, ids);
  const serves = unique([...request.sharedWith, ...request.split.map((share) => share.grantId), ...named]).filter((id) => ids.includes(id));
  const split = request.split.map(({ grantId, share }) => ({ grantId, share }));
  const splitSource = split.length ? 'request' : 'none';
  if (request.grantId) {
    return { grantId: request.grantId, grantIsClear: true, servesGrantIds: serves, split, splitSource, note: `Asked for ${request.grantId}.` };
  }
  if (named.length === 1) {
    return { grantId: named[0], grantIsClear: true, servesGrantIds: serves, split, splitSource, note: `The request names ${named[0]}.` };
  }
  const pool = named.length > 1 ? grants.filter((grant) => named.includes(grant.id)) : grants;
  const byId = new Map(grants.map((grant) => [grant.id, grant]));
  const kinds = pool.map((grant) => ({
    id: grant.id,
    failed: failingKinds(rules.spendingVerdicts(factsOf(request, split), grant, today, byId), endedFreezeOf(grant.id, grants, today)),
  }));
  const passing = kinds.filter((k) => k.failed.length === 0).map((k) => k.id);
  if (passing.length === 1) {
    return { grantId: passing[0], grantIsClear: true, servesGrantIds: serves.length ? serves : passing, split, splitSource, note: `${passing[0]} is the only grant where every rule passes.` };
  }
  const freezeOnly = kinds.filter((k) => k.failed.length > 0 && k.failed.every((kind) => kind === 'freeze')).map((k) => k.id);
  if (passing.length === 0 && freezeOnly.length === 1) {
    return { grantId: freezeOnly[0], grantIsClear: true, servesGrantIds: serves.length ? serves : freezeOnly, split, splitSource, note: `${freezeOnly[0]} is the only grant that can take it, once it unfreezes.` };
  }
  const first = passing[0] ?? freezeOnly[0] ?? pool[0].id;
  return {
    grantId: first,
    grantIsClear: false,
    servesGrantIds: serves,
    split,
    splitSource,
    note: passing.length > 1 ? `Unclear: ${passing.join(' and ')} could each pay for it.` : 'Unclear: no grant is named and none can take it as it stands.',
  };
}

/** Claude's (or the fallback's) answer, held to the lab's own grants and the scientist's own choice. */
export function sanitizeRead(answer: ReadAnswer, request: RequestRow, grants: GrantRow[], fallback: ReadAnswer): Reading {
  const ids = new Set(grants.map((grant) => grant.id));
  const asked = request.grantId && ids.has(request.grantId) ? request.grantId : undefined;
  const picked = ids.has(answer.grantId) ? answer.grantId : undefined;
  const grantId = asked ?? picked ?? fallback.grantId;
  const grantIsClear = asked ? true : picked ? answer.grantIsClear : false;
  // Grants the text names always count, so Claude can't read a shared cost
  // that names two grants (rq-104) as a one-grant buy.
  const serves = unique([
    ...answer.servesGrantIds, ...namedGrants(request, [...ids]), ...request.sharedWith, ...request.split.map((share) => share.grantId),
  ]).filter((id) => ids.has(id));
  const split = answer.split.filter((share) => ids.has(share.grantId) && Number.isFinite(share.share) && share.share > 0);
  // One grant at 100% isn't a split someone stated; it would only trip the shared-cost rule.
  const stated = answer.splitSource !== 'none' && split.length >= 2;
  return {
    grantId,
    grantIsClear,
    serves,
    split: stated ? split : [],
    splitSource: stated ? answer.splitSource : 'none',
    note: answer.note.slice(0, 300),
  };
}

/**
 * The split to have the module check: a split the scientist stated in a push
 * back, else the one on the request, else one stated in the request. A shared
 * cost with no split is checked as charged (100% to one grant), so the
 * module's shared-cost rule runs and fails rather than being skipped.
 */
export function splitFor(request: RequestRow, reading: Reading): Split[] {
  if (reading.splitSource === 'push_back' && reading.split.length) return reading.split;
  if (request.split.length) return request.split.map(({ grantId, share }) => ({ grantId, share }));
  if (reading.split.length) return reading.split;
  if (request.sharedWith.length >= 2) return []; // the module checks a declared shared cost itself
  if (reading.serves.length >= 2) return [{ grantId: reading.grantId, share: 1 }];
  return [];
}

// ── Vendor ─────────────────────────────────────────────────────────────────

const itemBase = (item: string) => item.toLowerCase().split(',')[0].trim();

/** The vendor the lab last bought the same item from (or a close match in the same category). */
export function vendorFor(request: RequestRow, requests: RequestRow[], orders: OrderRow[]): string {
  const byId = new Map(requests.map((row) => [row.id, row]));
  const mine = itemBase(request.item);
  const past = orders
    .filter((order) => order.requestId !== request.id && order.vendor && order.vendor !== 'Vendor')
    .map((order) => ({ order, base: itemBase(byId.get(order.requestId)?.item ?? ''), category: byId.get(order.requestId)?.category }))
    .filter((entry) => entry.base)
    .sort((a, b) => b.order.placed.localeCompare(a.order.placed));
  const exact = past.find((entry) => entry.base === mine);
  const close = past.find(
    (entry) => entry.category === request.category && Math.min(entry.base.length, mine.length) >= 8 && (mine.includes(entry.base) || entry.base.includes(mine)),
  );
  return (exact ?? close)?.order.vendor ?? DEFAULT_VENDOR;
}

// ── Explanations ───────────────────────────────────────────────────────────

export interface ExplanationFacts {
  request: { id: string; item: string; category: string; price: number; purpose: string };
  action: Decision['action'];
  grantId: string;
  to?: string;
  split: Array<{ grantId: string; percent: number }>;
  failed: Array<{ rule: string; detail: string; auditCase?: string }>;
  passed: string[];
  vendor?: string;
  next: string;
}

const usd = (amount: number) => `$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// What a hold for a freeze promises people. The agent keeps the promise by
// reading it back from its open hold (waitsOnlyForFreeze), so it survives a restart.
const FREEZE_PROMISE = 'will be bought automatically once';
const promisesBuy = (text: string) => text.toLowerCase().includes(FREEZE_PROMISE);

function nextStep(decision: Decision, facts: { serves: string[]; vendor: string; frozen: string[] }): string {
  const step = reasonStep(decision, facts);
  return decision.refusal ? `The database refused to buy it at its last check ("${decision.refusal}"). ${step}` : step;
}

function reasonStep(decision: Decision, facts: { serves: string[]; vendor: string; frozen: string[] }): string {
  switch (decision.reason) {
    case 'freeze':
      return `Every other rule passes, so it ${FREEZE_PROMISE} ${facts.frozen.join(' and ')} unfreezes.`;
    case 'card_limit':
      return 'Only the grant manager can approve a purchase over the card limit.';
    case 'shared_cost':
      return facts.serves.length >= 2
        ? `It serves ${facts.serves.join(' and ')}, so its cost has to be split between them by use before it can be bought; send the split and it will be checked again.`
        : 'It is a shared cost, so it has to be split by use across the grants it serves before it can be bought.';
    case 'unclear_grant':
      return `The request doesn't make clear which grant it is for${decision.note ? ` (${decision.note})` : ''}, so the grant manager decides instead of the agent guessing.`;
    case 'decided_before':
      return 'The grant manager already decided this request and the scientist pushed back, so it goes back to the Inbox instead of being bought automatically.';
    case 'unchecked':
      return "The grant's status couldn't be refreshed right before buying, so no money moves until it is.";
    case 'refused':
      return 'The grant manager decides.';
    case 'unplaced':
      return 'A rule failed that the agent cannot place, so the grant manager decides.';
    case 'category':
      return 'It cannot be charged to a federal grant.';
    case 'already_ordered':
      return `It was already ordered (${decision.note ?? 'an order exists'}), so a push back never buys it again; the grant manager can change or cancel the order.`;
    case 'grant_rules':
      return decision.pendingTo
        ? `${decision.pendingTo} has the time and money for it but is frozen, so it will be rerouted there once ${decision.pendingTo} unfreezes.`
        : 'No other grant can take it right now.';
    case 'unfrozen':
      return `It was held only for the freeze, which has lifted. Ordered from ${facts.vendor}.`;
    case 'approved':
      return `The grant manager approved it on ${decision.approval?.day} while ${decision.approval?.unfrozen} was frozen, so it was bought once ${decision.approval?.unfrozen} unfroze. Ordered from ${facts.vendor}.`;
    case 'approved_over_limit':
      return `The grant manager approved it on ${decision.approval?.day} while ${decision.approval?.unfrozen} was frozen. ${decision.approval?.unfrozen} has unfrozen, but it is over the card limit, so only the grant manager can approve the buy.`;
    default:
      return decision.action === 'reroute' ? `Every rule passes on ${decision.to}. Ordered from ${facts.vendor}.` : `Ordered from ${facts.vendor}.`;
  }
}

/** The plain template used when Claude isn't: the module's own rule names and details. */
export function fallbackExplanation(facts: ExplanationFacts): string {
  const { item, price } = facts.request;
  const charged = facts.split.length >= 2 ? facts.split.map((share) => `${share.grantId} (${share.percent}%)`).join(' and ') : facts.grantId;
  const lead = {
    buy: `Bought ${item} (${usd(price)}) on ${charged}.`,
    reroute: `Rerouted ${item} (${usd(price)}) from ${facts.grantId} to ${facts.to} and bought it.`,
    hold: `Held ${item} (${usd(price)}) on ${charged} for the grant manager.`,
    block: `Blocked ${item} (${usd(price)}) on ${charged}.`,
  }[facts.action];
  const cites = facts.failed.map((v) => `${v.rule}: ${v.detail}${v.auditCase ? ` Audit case: ${v.auditCase}.` : ''}`);
  const passes = facts.action === 'buy' && facts.passed.length ? [`Every rule passes: ${facts.passed.join('; ')}.`] : [];
  return [lead, ...cites, ...passes, facts.next].join(' ');
}

/** Claude's text, or the template when it came back blank: the module refuses an empty explanation. */
export const explanationOr = (text: string, facts: ExplanationFacts): string => (text.trim() ? text : fallbackExplanation(facts));

/** Every failed rule named in the text, and no longer than people can read. */
export function finishExplanation(text: string, failed: Array<{ rule: string }>): string {
  const missing = failed.filter((verdict) => !text.includes(verdict.rule)).map((verdict) => verdict.rule);
  const cited = missing.length ? `${text.trim()} Rule${missing.length > 1 ? 's' : ''}: ${unique(missing).join('; ')}.` : text.trim();
  return cited.length <= EXPLANATION_MAX ? cited : `${cited.slice(0, EXPLANATION_MAX - 1)}…`;
}

// The shared-cost detail lists the request's declared grants; for a shared
// cost the scientist didn't declare, that list is empty ("Serves  but ..."),
// so name the grants the request says it serves.
const readableDetail = (verdict: RuleVerdict, serves: string[]): string =>
  ruleKind(verdict.rule) === 'shared_cost' && serves.length >= 2
    ? verdict.detail.replace(/^Serves {2}but/, `Serves ${serves.join(' and ')} but`)
    : verdict.detail;

// ── The agent ──────────────────────────────────────────────────────────────

export function startPurchasing({ conn, tracker }: AgentContext): AgentHandle {
  const queue = workQueue(AGENT);
  let stopped = false;

  const findRequest = (id: string) => conn.rows('request').find((row) => row.id === id);
  const findGrant = (id: string | undefined) => conn.rows('grant').find((row) => row.id === id);

  // The grant manager's latest decision on any of the request's purchase holds.
  function lastDecision(requestId: string): DecisionRow | undefined {
    const holds = new Set(conn.rows('hold').filter((hold) => hold.kind === 'purchase' && hold.refId === requestId).map((hold) => hold.id));
    return conn.rows('decision').reduce<DecisionRow | undefined>(
      (last, decision) => (holds.has(decision.holdId) && (!last || decision.id > last.id) ? decision : last),
      undefined,
    );
  }
  const personDecided = (requestId: string) => lastDecision(requestId) !== undefined;
  const openAgentHold = (requestId: string) =>
    conn.rows('hold').find((hold) => hold.kind === 'purchase' && hold.refId === requestId && hold.open && hold.raisedBy === AGENT);
  const ordersOf = (requestId: string) => conn.rows('order').filter((order) => order.requestId === requestId);
  const endedFreeze = (checked: string | undefined) => endedFreezeOf(checked, conn.rows('grant'), conn.today());
  const pushBacks = (requestId: string) =>
    conn.rows('log').filter((row) => row.refId === requestId && row.action.startsWith('Pushed back on')).map((row) => row.reason);

  // Right before money moves: read every source for the grants it would come from.
  async function refreshAll(grantIds: string[]): Promise<boolean> {
    for (const grantId of unique(grantIds)) {
      try {
        await tracker.refresh(grantId);
      } catch (error) {
        console.error(`${AGENT}: couldn't refresh ${grantId} before money moves:`, error instanceof Error ? error.message : error);
        return false;
      }
    }
    return true;
  }

  async function evaluate(requestId: string, grantId: string, split: Split[]): Promise<RuleVerdict[]> {
    await conn.call('evaluate_request', { requestId, grantId, split });
    return findRequest(requestId)?.verdicts ?? [];
  }

  async function read(request: RequestRow, grants: GrantRow[], rules: SpendingRules): Promise<Reading> {
    const fallback = readFallback(request, grants, rules, conn.today());
    const { value } = await ask({
      task: READ_TASK,
      system: READ_SYSTEM,
      input: {
        request: {
          item: request.item, category: request.category, price: request.price, purpose: request.purpose,
          askedForGrant: request.grantId || null, declaredSharedWith: request.sharedWith, split: request.split,
        },
        pushBacks: pushBacks(request.id),
        grants: grants.map((grant) => ({ id: grant.id, title: grant.title, end: grant.end })),
      },
      schema: ReadAnswer,
      fallback: () => fallback,
      effort: 'low',
      maxTokens: 1_000,
    });
    return sanitizeRead(value, request, grants, fallback);
  }

  async function explain(request: RequestRow, decision: Decision, serves: string[], vendor: string): Promise<string> {
    const frozen = unique(
      decision.failed.filter((v) => ruleKind(v.rule) === 'freeze').map((v) => frozenGrantOf(v, decision.grantId) ?? decision.grantId),
    );
    const facts: ExplanationFacts = {
      request: { id: request.id, item: request.item, category: request.category, price: request.price, purpose: request.purpose },
      action: decision.action,
      grantId: decision.grantId,
      to: decision.to,
      split: request.split.map((share) => ({ grantId: share.grantId, percent: Math.round(share.share * 100) })),
      failed: decision.failed.map((v) => ({ rule: v.rule, detail: readableDetail(v, serves), auditCase: v.auditCase })),
      passed: decision.passed.filter((v) => v.pass).map((v) => v.rule),
      vendor: decision.action === 'buy' || decision.action === 'reroute' ? vendor : undefined,
      next: nextStep(decision, { serves, vendor, frozen: frozen.length ? frozen : [decision.grantId] }),
    };
    const { value } = await ask({
      task: EXPLAIN_TASK,
      system: EXPLAIN_SYSTEM,
      input: facts,
      schema: ExplainAnswer,
      fallback: () => ({ explanation: fallbackExplanation(facts) }),
      effort: 'low',
      maxTokens: 800,
    });
    const text = explanationOr(value.explanation, facts);
    // Claude may word the next step its own way, but a freeze hold always states its promise.
    const kept = decision.reason === 'freeze' && !promisesBuy(text) ? `${text.trim()} ${facts.next}` : text;
    return finishExplanation(kept, decision.failed);
  }

  async function act(requestId: string, decision: Decision, serves: string[]): Promise<void> {
    const request = findRequest(requestId);
    if (!request) return;
    const vendor = vendorFor(request, conn.rows('request'), conn.rows('order'));
    const decisionBefore = lastDecision(requestId)?.id;
    const explanation = await explain(request, decision, serves, vendor);
    const grantId = decision.action === 'reroute' ? decision.to! : decision.grantId;
    // Looked at again after the wait for Claude: a person may have decided,
    // or the module may have ordered it, in the meantime. An approval being
    // carried out still stands unless a newer decision replaced it.
    const decidedMeanwhile = decision.approval ? lastDecision(requestId)?.id !== decision.approval.id : personDecided(requestId);
    if ((decision.action === 'buy' || decision.action === 'reroute') && (decidedMeanwhile || ordersOf(requestId).length)) {
      console.warn(`${AGENT}: not buying ${requestId}: ${decidedMeanwhile ? 'a person decided it meanwhile' : 'it already has an order'}`);
      return;
    }
    // A hold or block planned before a person decided it would undo that
    // decision (an approval the module blocked would come back to the Inbox).
    if (lastDecision(requestId)?.id !== decisionBefore) {
      console.warn(`${AGENT}: not changing ${requestId}: a person decided it meanwhile`);
      return;
    }
    await conn.call('act_on_request', { requestId, action: decision.action, grantId, vendor, explanation });
  }

  // Buy or reroute. The module rechecks every rule and may refuse, if
  // something changed since the verdicts were read: then look again and hold
  // or block on what it says now, never retry the buy.
  async function moveMoney(requestId: string, decision: Decision, split: Split[], serves: string[]): Promise<void> {
    try {
      await act(requestId, decision, serves);
    } catch (error) {
      if (!(error instanceof ActionError)) throw error;
      console.warn(`${AGENT}: the module refused to ${decision.action} ${requestId}: ${error.message}`);
      const now = findRequest(requestId);
      if (!now || ['bought', 'rerouted', 'rejected'].includes(now.state)) return;
      const verdicts = await evaluate(requestId, decision.grantId, split);
      const plan = planFor(verdicts, endedFreeze(decision.grantId));
      const failed = verdicts.filter((v) => !v.pass);
      const fallback: Decision =
        plan.action === 'hold' || plan.action === 'block'
          ? { action: plan.action, reason: plan.reason, grantId: decision.grantId, failed, passed: verdicts, refusal: error.message }
          : { action: 'hold', reason: 'refused', grantId: decision.grantId, failed, passed: verdicts, refusal: error.message };
      await act(requestId, fallback, serves);
    }
  }

  // Reroute to decision.to: refresh it, have the module check it there, then
  // buy. If the target no longer passes, the record goes back to the grant it
  // came from (and, for a new request, it is blocked there; for one already
  // in the Inbox, held there with what fails now).
  async function reroute(requestId: string, decision: Decision, serves: string[], whenTargetFails: 'block' | 'hold' | 'leave'): Promise<void> {
    const to = decision.to!;
    const fresh = await refreshAll([to]);
    if (fresh) {
      const verdicts = await evaluate(requestId, to, []);
      if (verdicts.length && verdicts.every((v) => v.pass)) {
        await moveMoney(requestId, { ...decision, passed: verdicts }, [], serves);
        return;
      }
    }
    if (whenTargetFails === 'leave') {
      // Put the module's record back on the grant it was blocked on.
      if (fresh) await evaluate(requestId, decision.grantId, []);
      return;
    }
    const back = await evaluate(requestId, decision.grantId, []);
    const failed = back.filter((v) => !v.pass);
    const plan = planFor(back, endedFreeze(decision.grantId));
    const fallback: Decision =
      plan.action === 'hold' || plan.action === 'block'
        ? { action: plan.action, reason: plan.reason, grantId: decision.grantId, failed, passed: back }
        : fresh
          ? { action: 'block', reason: 'grant_rules', grantId: decision.grantId, failed, passed: back }
          : { action: 'hold', reason: 'unchecked', grantId: decision.grantId, failed, passed: back };
    await act(requestId, whenTargetFails === 'hold' ? keptInInbox(fallback) : fallback, serves);
  }

  // Another grant for a request blocked by grant-specific rules: one where
  // every rule passes now (rerouteTarget), or one failing only on its freeze.
  async function rerouteOptions(request: RequestRow, from: string, split: Split[]): Promise<{ to?: string; pendingTo?: string }> {
    const fromGrant = findGrant(from);
    if (split.length || !fromGrant) return {};
    const rules = await loadRules();
    const grants = conn.rows('grant');
    const facts = factsOf(request, []);
    const to = rules.rerouteTarget(facts, fromGrant, conn.today(), grants);
    if (to) return { to };
    const pendingTo = grants.find((grant) => {
      if (grant.id === from) return false;
      const kinds = failingKinds(rules.spendingVerdicts(facts, grant, conn.today()), endedFreeze(grant.id));
      return kinds.length > 0 && kinds.every((kind) => kind === 'freeze');
    })?.id;
    return { pendingTo };
  }

  async function handleSubmitted(requestId: string): Promise<void> {
    const request = findRequest(requestId);
    if (!request || request.state !== 'submitted') return; // already handled
    // The module lets a rerouted (so already ordered) request be pushed back
    // to 'submitted'. Never buy it twice: say so, on the grant the order is on,
    // without re-checking it elsewhere first.
    const ordered = ordersOf(requestId);
    if (ordered.length) {
      const note = ordered.map((order) => `${order.id}: ${usd(order.amount)} on ${order.grantId} from ${order.vendor}`).join('; ');
      await act(requestId, { action: 'block', reason: 'already_ordered', grantId: ordered[0].grantId, failed: [], passed: request.verdicts, note }, request.sharedWith);
      return;
    }
    const grants = conn.rows('grant');
    if (grants.length === 0) throw new Error(`no grants to check ${requestId} against`);
    const rules = await loadRules();
    const reading = await read(request, grants, rules);
    const split = splitFor(request, reading);
    const grantId = reading.grantId;
    const fresh = await refreshAll([grantId, ...split.map((share) => share.grantId)]);
    const verdicts = await evaluate(requestId, grantId, split);
    const failed = verdicts.filter((v) => !v.pass);
    const plan = planFor(verdicts, endedFreeze(grantId));

    let decision: Decision;
    if (plan.action === 'try_reroute') {
      const { to, pendingTo } = await rerouteOptions(request, grantId, split);
      decision = to
        ? { action: 'reroute', grantId, to, failed, passed: verdicts }
        : { action: 'block', reason: 'grant_rules', grantId, pendingTo, failed, passed: verdicts };
    } else if (plan.action === 'buy') {
      decision = { action: 'buy', grantId, failed, passed: verdicts };
    } else {
      decision = { action: plan.action, reason: plan.reason, grantId, failed, passed: verdicts };
    }

    // Never buy alone when unsure, after a person's decision, or on a stale
    // status. A freeze hold or a block waiting on another grant after a
    // person's decision would promise a buy or a reroute on unfreeze that
    // never comes, so it says the grant manager decides again.
    const movesMoney = decision.action === 'buy' || decision.action === 'reroute';
    const promisesMove = decision.reason === 'freeze' || Boolean(decision.pendingTo);
    const asHold = (reason: HoldReason, note?: string): Decision => ({ ...decision, action: 'hold', reason, to: undefined, pendingTo: undefined, note });
    if (!reading.grantIsClear && decision.action !== 'block') decision = asHold('unclear_grant', reading.note);
    else if ((movesMoney || promisesMove) && personDecided(requestId)) decision = asHold('decided_before');
    else if (movesMoney && !fresh) decision = asHold('unchecked');

    if (decision.action === 'reroute') await reroute(requestId, decision, reading.serves, 'block');
    else if (decision.action === 'buy') await moveMoney(requestId, decision, split, reading.serves);
    else await act(requestId, decision, reading.serves);
  }

  // Held only for this grant's freeze, by this agent, and still waiting with
  // the promise to buy it once the grant unfreezes. Read from the open hold
  // rather than remembered, so a restarted agent keeps exactly the promises
  // made before: a hold for an unclear grant can fail on the freeze alone
  // too, but it says the grant manager decides.
  function waitsOnlyForFreeze(request: RequestRow, grantId: string): boolean {
    const hold = openAgentHold(request.id);
    return failsOnlyOnFreezeOf(request, grantId) && hold !== undefined && promisesBuy(hold.why);
  }

  // Approved by the grant manager, then blocked by the module's recheck only
  // for this grant's freeze (the recheck ignores the card limit on an
  // approval, so this does too), and nothing decided since.
  function approvalWaitingOn(request: RequestRow, grantId: string): DecisionRow | undefined {
    const approval = lastDecision(request.id);
    return approval?.choice === 'approve' && request.state === 'blocked' && failsOnlyOnFreezeOf(request, grantId, 'card_limit') ? approval : undefined;
  }

  // Bought on the grant it was checked on, once every rule passes there now.
  // An approval failing only on the card limit goes back to the Inbox
  // instead: act_on_request never lets the agent buy past the limit, but the
  // module's recheck of a second approval does. The agent's own freeze hold
  // failing on another rule now (the grant reached its last 90 days while
  // frozen, or a grant in its split ended) is planned again, so its Inbox item
  // stops promising a buy that can't happen.
  async function buyUnfrozen(requestId: string, state: RequestRow['state'], why: Pick<Decision, 'reason' | 'approval'>): Promise<void> {
    const request = findRequest(requestId);
    const grantId = request?.chargedGrantId ?? request?.grantId;
    if (!request || request.state !== state || !grantId || ordersOf(requestId).length) return;
    const split = request.split.map(({ grantId: id, share }) => ({ grantId: id, share }));
    if (!(await refreshAll([grantId, ...split.map((share) => share.grantId)]))) return;
    const verdicts = await evaluate(requestId, grantId, split);
    const failed = verdicts.filter((v) => !v.pass);
    const serves = unique([...request.sharedWith, ...split.map((share) => share.grantId)]);
    if (failed.length === 0) {
      await moveMoney(requestId, { action: 'buy', ...why, grantId, failed: [], passed: verdicts }, split, serves);
    } else if (why.approval) {
      if (failed.every((v) => ruleKind(v.rule) === 'card_limit')) {
        await act(requestId, { action: 'hold', reason: 'approved_over_limit', approval: why.approval, grantId, failed, passed: verdicts }, serves);
      }
      // Otherwise the approval waits on something else: the request stays as it is.
    } else {
      await planAgain(request, grantId, split, verdicts, serves);
    }
  }

  // A request the agent held for a freeze that has lifted, failing other rules
  // now. It is already in the Inbox, so it stays there (act_on_request's block
  // leaves its open hold, promise and all): rerouted if another grant can take
  // it, else held with what fails now. Still failing only on a freeze (another
  // grant in its split), the open hold's promise still holds.
  async function planAgain(request: RequestRow, grantId: string, split: Split[], verdicts: RuleVerdict[], serves: string[]): Promise<void> {
    const failed = verdicts.filter((v) => !v.pass);
    const plan = planFor(verdicts, endedFreeze(grantId));
    if (plan.action === 'buy' || (plan.action === 'hold' && plan.reason === 'freeze')) return;
    if (plan.action === 'try_reroute') {
      const { to } = await rerouteOptions(request, grantId, split);
      if (to) {
        await reroute(request.id, { action: 'reroute', grantId, to, failed, passed: verdicts }, serves, 'hold');
        return;
      }
    }
    const reason = plan.action === 'try_reroute' ? 'grant_rules' : plan.reason;
    await act(request.id, { action: 'hold', reason, grantId, failed, passed: verdicts }, serves);
  }

  async function rerouteBlocked(requestId: string): Promise<void> {
    const request = findRequest(requestId);
    const from = request?.chargedGrantId ?? request?.grantId;
    if (!request || request.state !== 'blocked' || request.split.length || !from || ordersOf(requestId).length) return;
    if (!blockedOnGrantRules(request.verdicts)) return;
    const { to } = await rerouteOptions(request, from, []);
    if (!to) return;
    // Checked again where it was blocked, so the explanation quotes the rules
    // as they stand today, not on the day it was blocked (unless they no
    // longer block it there: then what blocked it is still why it moves).
    const now = await evaluate(requestId, from, []);
    const failed = (blockedOnGrantRules(now) ? now : request.verdicts).filter((v) => !v.pass);
    await reroute(requestId, { action: 'reroute', grantId: from, to, failed, passed: [] }, request.sharedWith, 'leave');
  }

  // Held by the agent on more than this grant's freeze (a shared cost, the
  // card limit), so its Inbox text still names the freeze. Only a request
  // naming its grant: an unclear one's hold says why it is unclear.
  function heldAlsoForFreezeOf(request: RequestRow, grantId: string): boolean {
    return request.state === 'waiting_on_manager' && Boolean(request.grantId) && openAgentHold(request.id) !== undefined
      && request.verdicts.some((v) => !v.pass && ruleKind(v.rule) === 'freeze' && frozenGrantOf(v, request.chargedGrantId) === grantId);
  }

  // Checked again on the same grant and split, and held again with what fails
  // now, so the Inbox stops saying the grant is frozen.
  async function recheckHold(requestId: string): Promise<void> {
    const request = findRequest(requestId);
    const grantId = request?.chargedGrantId ?? request?.grantId;
    if (!request || request.state !== 'waiting_on_manager' || !grantId || personDecided(requestId) || ordersOf(requestId).length) return;
    const split = request.split.map(({ grantId: id, share }) => ({ grantId: id, share }));
    const verdicts = await evaluate(requestId, grantId, split);
    const plan = planFor(verdicts, endedFreeze(grantId));
    if (plan.action !== 'hold' || personDecided(requestId)) return;
    const named = namedGrants(request, conn.rows('grant').map((grant) => grant.id));
    const serves = unique([...request.sharedWith, ...split.map((share) => share.grantId), ...named]);
    await act(requestId, { action: 'hold', reason: plan.reason, grantId, failed: verdicts.filter((v) => !v.pass), passed: verdicts }, serves);
  }

  async function handleUnfrozen(grantId: string): Promise<void> {
    if (findGrant(grantId)?.frozen !== false) return;
    const recheck: string[] = [];
    for (const request of conn.rows('request')) {
      // A person's decision stands: the agent never buys those alone again,
      // unless it carries out an approval the freeze held up.
      if (personDecided(request.id)) {
        const approval = approvalWaitingOn(request, grantId);
        if (approval) await buyUnfrozen(request.id, 'blocked', { reason: 'approved', approval: { id: approval.id, day: approval.day, unfrozen: grantId } });
        continue;
      }
      if (request.state === 'waiting_on_manager' && waitsOnlyForFreeze(request, grantId)) await buyUnfrozen(request.id, 'waiting_on_manager', { reason: 'unfrozen' });
      else if (request.state === 'blocked') await rerouteBlocked(request.id);
      else if (heldAlsoForFreezeOf(request, grantId)) recheck.push(request.id);
    }
    // After the buys, so the purchases people are waiting for land first. One
    // the module refuses (a person decided it at that moment) skips only itself.
    for (const requestId of recheck) {
      try {
        await recheckHold(requestId);
      } catch (error) {
        if (!(error instanceof ActionError)) throw error;
        console.warn(`${AGENT}: kept ${requestId}'s hold as it was: ${error.message}`);
      }
    }
  }

  const push = (label: string, work: () => Promise<void>) =>
    void queue.push(label, async () => {
      if (!stopped) await work();
    });
  const onSubmitted = (request: RequestRow) => push(`request ${request.id}`, () => handleSubmitted(request.id));
  const onUnfrozen = (grant: GrantRow) => push(`unfreeze of ${grant.id}`, () => handleUnfrozen(grant.id));

  for (const request of conn.rows('request')) if (request.state === 'submitted') onSubmitted(request);
  // A payment may have landed while the agent was down.
  for (const grant of conn.rows('grant')) if (!grant.frozen) onUnfrozen(grant);
  const stops = [
    conn.onInsert('request', (request) => {
      if (request.state === 'submitted') onSubmitted(request);
    }),
    conn.onUpdate('request', (before, after) => {
      if (after.state === 'submitted' && before.state !== 'submitted') onSubmitted(after);
    }),
    // Unfrozen, or usable again while unfrozen: a grant the grant manager
    // unfroze early stays canceled until its payment lands, and only its
    // status changes then.
    conn.onUpdate('grant', (before, after) => {
      if (!after.frozen && (before.frozen || before.status !== after.status)) onUnfrozen(after);
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
