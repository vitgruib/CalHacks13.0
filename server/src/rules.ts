// The rules, as plain functions over plain rows (MASTER-PLAN §3). The
// actions in index.ts call these, so every limit lives in the database, not
// in a prompt. Kept free of SpacetimeDB types so they test directly.

import { CARD_LIMIT } from './vocab';

export interface GrantFacts {
  id: string;
  status: string;
  end: string;
  awarded: number;
  spent: number;
  promised: number;
}

export interface EventFacts {
  day: string;
  kind: string;
}

export interface Verdict {
  rule: string;
  pass: boolean;
  detail: string;
  auditCase?: string;
}

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export const addDays = (day: string, n: number): string =>
  new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10);

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

// ── Fund tracker (T5) ─────────────────────────────────────────────────────

/** Truly available = awarded − spent − promised. */
export const trulyAvailable = (g: Pick<GrantFacts, 'awarded' | 'spent' | 'promised'>): number =>
  g.awarded - g.spent - g.promised;

export interface FreezeState {
  status: string;
  frozen: boolean;
  frozenReason?: string;
}

/**
 * Status and freeze from the grant's events. A cancellation freezes
 * spending; a court order restores the status but does NOT unfreeze; only a
 * payment received on or after the cancellation (or a grant manager's
 * unfreeze) does. An open sources-disagree flag freezes too.
 * Events are processed in day order; same-day ties keep insertion order.
 */
export function freezeState(
  baseStatus: string,
  events: EventFacts[],
  openDisagreement: boolean,
): FreezeState {
  let status = baseStatus === 'ended' ? 'ended' : 'active';
  let canceledOn: string | undefined;
  let courtOn: string | undefined;
  let frozenByCancel = false;
  const sorted = events.map((e, i) => ({ e, i })).sort((a, b) =>
    a.e.day === b.e.day ? a.i - b.i : a.e.day < b.e.day ? -1 : 1,
  );
  for (const { e } of sorted) {
    if (e.kind === 'canceled') {
      // A second source reporting the same cancellation keeps the first date.
      if (status !== 'canceled') canceledOn = e.day;
      status = 'canceled';
      courtOn = undefined;
      frozenByCancel = true;
    } else if (e.kind === 'court_order' && canceledOn) {
      status = 'restored_by_court';
      courtOn = e.day;
    } else if (e.kind === 'payment_received' && canceledOn) {
      // Money actually arrived after the cancellation: the grant is live again.
      status = 'active';
      canceledOn = undefined;
      courtOn = undefined;
      frozenByCancel = false;
    } else if (e.kind === 'unfrozen') {
      // The grant manager unfroze it early (reason is in the log).
      frozenByCancel = false;
    }
  }
  if (baseStatus === 'ended') status = 'ended';

  if (status === 'ended') return { status, frozen: true, frozenReason: 'The grant has ended.' };
  if (frozenByCancel) {
    const frozenReason = courtOn
      ? `Canceled ${canceledOn}. A court restored it on ${courtOn}, but no payment has arrived since, so spending stays frozen.`
      : `Canceled ${canceledOn}. Spending is frozen until a payment arrives.`;
    return { status, frozen: true, frozenReason };
  }
  if (openDisagreement) {
    return {
      status,
      frozen: true,
      frozenReason: 'Sources disagree about this grant. Spending stays frozen until the grant manager decides.',
    };
  }
  return { status, frozen: false };
}

// ── Spending rules (T6) ───────────────────────────────────────────────────

export const SUPPLY_CATEGORIES = ['lab supplies', 'supplies', 'materials', 'reagents'];
export const UNALLOWABLE_CATEGORIES = [
  'general office',
  'food',
  'alcohol',
  'entertainment',
  'personal',
  'furniture',
];

export interface RequestFacts {
  category: string;
  price: number;
  sharedWith: string[];
  split: { grantId: string; share: number }[];
}

export interface GrantForRules extends GrantFacts {
  frozen: boolean;
  frozenReason?: string;
}

/**
 * Every spending rule's verdict for charging `req` to `g` (or, for a shared
 * cost, to each grant in its split). The purchase may go through on its own
 * only if every verdict passes; see `canBuyAlone`.
 */
export function spendingVerdicts(
  req: RequestFacts,
  g: GrantForRules,
  today: string,
  grantsById: Map<string, GrantForRules> = new Map([[g.id, g]]),
): Verdict[] {
  const out: Verdict[] = [];
  const charges = req.split.length > 0 ? req.split : [{ grantId: g.id, share: 1 }];

  for (const c of charges) {
    const cg = grantsById.get(c.grantId);
    const amount = req.price * c.share;
    const label = charges.length > 1 ? ` (${c.grantId})` : '';
    if (!cg) {
      out.push({ rule: `Grant exists${label}`, pass: false, detail: `No grant ${c.grantId}.` });
      continue;
    }
    const usable = (cg.status === 'active' || cg.status === 'restored_by_court') && !cg.frozen;
    out.push({
      rule: `Grant is active and not frozen${label}`,
      pass: usable,
      detail: usable ? `${cg.id} is ${cg.status === 'active' ? 'active' : 'restored and paid'}.` : (cg.frozenReason ?? `${cg.id} is ${cg.status}.`),
    });
    if (SUPPLY_CATEGORIES.includes(req.category.toLowerCase())) {
      const left = daysBetween(today, cg.end);
      out.push({
        rule: `Not in the grant's last 90 days${label}`,
        pass: left > 90,
        detail: left > 90 ? `${cg.id} ends ${cg.end}, ${left} days away.` : `${cg.id} ends ${cg.end}, ${left} days away.`,
        auditCase: left > 90 ? undefined : 'NSF OIG audits of WVU and Delaware: supplies bought in a grant\'s last months were disallowed',
      });
    }
    const avail = trulyAvailable(cg);
    out.push({
      rule: `Enough truly available money${label}`,
      pass: amount <= avail,
      detail: `${usd(amount)} needed, ${usd(avail)} truly available.`,
    });
  }

  const unallowable = UNALLOWABLE_CATEGORIES.includes(req.category.toLowerCase());
  out.push({
    rule: 'Category allowed',
    pass: !unallowable,
    detail: unallowable ? `${req.category} is not an allowable direct cost on a federal grant.` : `${req.category} is allowed.`,
    auditCase: unallowable ? 'NSF OIG audit of UC Davis: unallowable items charged to awards' : undefined,
  });

  out.push({
    rule: `Under the card limit (${usd(CARD_LIMIT)})`,
    pass: req.price <= CARD_LIMIT,
    detail: req.price <= CARD_LIMIT ? `${usd(req.price)}.` : `${usd(req.price)} is over the limit; the grant manager decides.`,
  });

  if (req.sharedWith.length >= 2 || req.split.length > 0) {
    const sum = req.split.reduce((s, c) => s + c.share, 0);
    const charged = new Set(req.split.filter(c => c.share > 0).map(c => c.grantId));
    const missing = req.sharedWith.filter(id => !charged.has(id));
    const ok = req.split.length >= 2 && Math.abs(sum - 1) < 1e-9 && missing.length === 0;
    out.push({
      rule: 'Shared cost split across the grants it serves',
      pass: ok,
      detail: ok
        ? `Split ${req.split.map(c => `${Math.round(c.share * 100)}% ${c.grantId}`).join(', ')}.`
        : missing.length > 0 || req.split.length < 2
          ? `Serves ${req.sharedWith.join(' and ')} but is charged to ${req.split.length ? req.split.map(c => c.grantId).join(', ') : 'one grant'} only.`
          : `Shares add up to ${Math.round(sum * 100)}%, not 100%.`,
      auditCase: ok ? undefined : 'NSF OIG audit summary: shared costs charged 100% to one award',
    });
  }
  return out;
}

export const canBuyAlone = (verdicts: Verdict[]): boolean => verdicts.every(v => v.pass);

/** Rules that rerouting to another grant can fix. */
const REROUTABLE = /^(Grant is active and not frozen|Not in the grant's last 90 days|Enough truly available money)/;

/** First other grant where every rule passes, for a request blocked only by grant-specific rules. */
export function rerouteTarget(
  req: RequestFacts,
  from: GrantForRules,
  today: string,
  grants: GrantForRules[],
): string | undefined {
  if (req.split.length > 0) return undefined;
  const failed = spendingVerdicts(req, from, today).filter(v => !v.pass);
  if (failed.length === 0 || !failed.every(v => REROUTABLE.test(v.rule))) return undefined;
  return grants.find(g => g.id !== from.id && canBuyAlone(spendingVerdicts(req, g, today)))?.id;
}

// ── Invoice check (P4) ────────────────────────────────────────────────────

export interface OrderFacts {
  id: string;
  vendor: string;
  amount: number;
  placed: string;
  state: string;
  canceledOn?: string;
  changedAmount?: number;
}

export interface InvoiceVerdict {
  matched: boolean;
  mismatch?: string;
  timeline: { day: string; what: string }[];
}

/** Payable only if the order is open (or changed) and the amount matches the latest approval. */
export function checkInvoice(
  inv: { amount: number; received: string },
  order: OrderFacts | undefined,
  approvals: { amount: number; day: string; by: string }[],
): InvoiceVerdict {
  if (!order) {
    return {
      matched: false,
      mismatch: 'No order matches this invoice.',
      timeline: [{ day: inv.received, what: `Invoice arrived (${usd(inv.amount)}) with no matching order` }],
    };
  }
  const timeline: { day: string; what: string }[] = [
    { day: order.placed, what: `Order placed (${usd(order.amount)})` },
  ];
  const sortedApprovals = [...approvals].sort((a, b) => (a.day < b.day ? -1 : 1));
  for (const a of sortedApprovals) {
    timeline.push({ day: a.day, what: `${a.amount === order.amount ? 'Approved' : `Change to ${usd(a.amount)} approved`} by the ${a.by.replace('_', ' ')}` });
  }
  if (order.canceledOn) timeline.push({ day: order.canceledOn, what: 'Order canceled' });

  if (order.state === 'canceled') {
    timeline.push({ day: inv.received, what: `Invoice arrived for ${usd(inv.amount)}` });
    timeline.sort((a, b) => (a.day < b.day ? -1 : 1));
    return {
      matched: false,
      mismatch: `The order was canceled${order.canceledOn ? ` on ${order.canceledOn}` : ''}, before this invoice arrived.`,
      timeline,
    };
  }
  const approved = sortedApprovals.length > 0 ? sortedApprovals[sortedApprovals.length - 1].amount : order.amount;
  const matched = Math.abs(inv.amount - approved) < 0.005;
  timeline.push({
    day: inv.received,
    what: matched ? `Invoice arrived for ${usd(inv.amount)}: matches the approved amount` : `Invoice arrived for ${usd(inv.amount)}`,
  });
  timeline.sort((a, b) => (a.day < b.day ? -1 : 1));
  return matched
    ? { matched, timeline }
    : { matched, mismatch: `Invoice is ${usd(inv.amount)} but the approved amount is ${usd(approved)}.`, timeline };
}

// ── Progress report (P7) ──────────────────────────────────────────────────

export interface PaperFacts {
  grantId: string;
  creditsGrantId: string;
  pmcid?: string;
  correction?: { kind: string; disclosed: boolean; note: string };
}

/** Only a material correction (or retraction) holds the report; anything smaller is a note. */
export function checkPaper(p: PaperFacts): { checks: { check: string; pass: boolean; detail: string }[]; result: string } {
  const checks = [
    {
      check: 'Credits this grant',
      pass: p.creditsGrantId === p.grantId,
      detail:
        p.creditsGrantId === p.grantId
          ? `Acknowledgments name ${p.grantId}.`
          : `Listed in ${p.grantId}'s report, but its acknowledgments name ${p.creditsGrantId}.`,
    },
    {
      check: 'Has a PubMed Central ID',
      pass: !!p.pmcid,
      detail: p.pmcid ? p.pmcid : 'No PMCID found; NIH public access policy requires one.',
    },
  ];
  let note = false;
  if (p.correction) {
    const serious = p.correction.kind === 'material' || p.correction.kind === 'retraction';
    const pass = !serious || p.correction.disclosed;
    if (!serious) note = true;
    checks.push({
      check: 'No undisclosed correction',
      pass,
      detail: !serious
        ? `${p.correction.note} Minor: a note, not a hold.`
        : p.correction.disclosed
          ? `${p.correction.note} Disclosed in the report.`
          : `${p.correction.note} Not disclosed in the report.`,
    });
  }
  const result = checks.some(c => !c.pass) ? 'held' : note ? 'note' : 'ok';
  return { checks, result };
}
