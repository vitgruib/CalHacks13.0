// Loading a world into the database. The seed's shape is Track C's `Db`
// (web/src/data/types.ts), so T8's JSON loads as-is through `load_seed`.
// String ids on append-only rows (status events, flags, holds, log) are
// replaced by the database's own; hold refIds pointing at seed flags are
// remapped to the new flag ids.

import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from './schema';

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

type Day = string;
interface Opt {
  [k: string]: unknown;
}

export interface Seed {
  today: Day;
  grants: (Opt & {
    id: string; title: string; pi: string; agency: string;
    awarded: number; received: number; spent: number; promised: number;
    start: Day; end: Day; status: string; frozen?: boolean; frozenReason?: string;
  })[];
  statusEvents: (Opt & { grantId: string; day: Day; kind: string; source: string; summary: string; amount?: number })[];
  sourceReadings: (Opt & {
    grantId: string; day: Day; source: string; status?: string | null;
    awarded?: number | null; paid?: number | null; endDate?: string | null; url?: string;
  })[];
  flags: (Opt & { id: string; grantId: string; day: Day; kind: string; summary: string; open: boolean; raisedBy?: string })[];
  requests: (Opt & {
    id: string; day: Day; requester: string; requesterName?: string; item: string; category: string; price: number;
    grantId?: string | null; chargedGrantId?: string; sharedWith?: string[];
    split?: { grantId: string; share: number }[]; purpose: string; state: string;
    verdicts?: { rule: string; pass: boolean; detail: string; auditCase?: string }[]; explanation?: string;
  })[];
  orders: (Opt & {
    id: string; requestId: string; grantId?: string; vendor: string; amount: number; placed: Day;
    state: string; canceledOn?: Day; changedAmount?: number;
  })[];
  approvals: (Opt & { id: string; orderId: string; amount: number; by: string; day: Day })[];
  invoices: (Opt & {
    id: string; orderId: string; vendor: string; amount: number; received: Day; state: string;
    mismatch?: string; timeline?: { day: Day; what: string }[]; checked?: boolean;
  })[];
  payroll?: (Opt & {
    id: string; grantId: string; person: string; role: string;
    period: { from: Day; to: Day }; effortPct: number; amount: number;
  })[];
  paymentRequests: (Opt & {
    id: string; grantId: string; from: Day; to: Day; amount: number; explanation: string;
    includedRequestIds: string[]; includedPayrollIds?: string[];
    excluded: { requestId: string; why: string }[]; state: string;
    followUps?: { id: string; question: string; answerDraft?: string; state: string }[];
  })[];
  papers: (Opt & {
    id: string; grantId: string; title: string; doi: string; pmcid?: string; creditsGrantId: string;
    correction?: { kind: string; disclosed: boolean; note: string };
    checks?: { check: string; pass: boolean; detail: string }[]; result?: string;
    checked?: boolean; costRequestIds?: string[];
  })[];
  holds: (Opt & {
    kind: string; refId: string; grantId?: string | null; raisedBy: string; day: Day; title: string; why: string;
    evidence: { label: string; value: string }[]; options: string[]; decision?: unknown;
  })[];
  log: (Opt & { day: Day; actor: string; action: string; rule?: string; reason: string; refId?: string })[];
}

const DOMAIN_TABLES = [
  'grant', 'statusEvent', 'sourceReading', 'flag', 'checkRequest', 'request', 'order', 'approval',
  'invoice', 'payroll', 'paymentRequest', 'followUp', 'reportPaper', 'hold', 'decision', 'log', 'counter',
] as const;

/** Wipe every world table (agents and people stay registered). */
export function clearWorld(ctx: Ctx): void {
  for (const name of DOMAIN_TABLES) {
    const tbl = ctx.db[name] as unknown as { iter(): Iterable<unknown>; delete(row: unknown): boolean };
    for (const row of [...tbl.iter()]) tbl.delete(row);
  }
}

const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

/** Replace the world with `seed`. Derived grant fields are recomputed by the caller. */
export function loadSeed(ctx: Ctx, seed: Seed): void {
  clearWorld(ctx);
  const at = ctx.timestamp;
  const clock = ctx.db.clock.id.find(0);
  if (clock) ctx.db.clock.id.update({ id: 0, today: seed.today });
  else ctx.db.clock.insert({ id: 0, today: seed.today });

  for (const g of seed.grants) {
    ctx.db.grant.insert({
      id: g.id, title: g.title, pi: g.pi, agency: g.agency,
      awarded: g.awarded, received: g.received, spent: g.spent, promised: g.promised,
      available: g.awarded - g.spent - g.promised,
      start: g.start, end: g.end, status: g.status,
      frozen: g.frozen ?? false, frozenReason: g.frozenReason,
    });
  }
  for (const e of seed.statusEvents) {
    ctx.db.statusEvent.insert({
      id: 0n, grantId: e.grantId, day: e.day, kind: e.kind, source: e.source,
      summary: e.summary, amount: opt(e.amount), at,
    });
  }
  for (const r of seed.sourceReadings) {
    ctx.db.sourceReading.insert({
      id: 0n, grantId: r.grantId, source: r.source, status: opt(r.status),
      awarded: opt(r.awarded), paid: opt(r.paid), endDate: opt(r.endDate),
      url: r.url ?? '', day: r.day, at,
    });
  }
  const flagIds = new Map<string, string>();
  for (const f of seed.flags) {
    const row = ctx.db.flag.insert({
      id: 0n, grantId: f.grantId, day: f.day, kind: f.kind, summary: f.summary,
      open: f.open, raisedBy: f.raisedBy ?? 'bookkeeping',
    });
    flagIds.set(f.id, row.id.toString());
  }
  const requestGrant = new Map<string, string>();
  for (const r of seed.requests) {
    const charged = r.chargedGrantId ?? r.grantId ?? undefined;
    if (charged) requestGrant.set(r.id, charged);
    ctx.db.request.insert({
      id: r.id, day: r.day, requester: r.requester, requestedBy: undefined,
      item: r.item, category: r.category, price: r.price,
      grantId: opt(r.grantId), chargedGrantId: r.chargedGrantId,
      sharedWith: r.sharedWith ?? [], split: r.split ?? [], purpose: r.purpose,
      state: r.state, verdicts: (r.verdicts ?? []).map(v => ({ ...v, auditCase: v.auditCase })), explanation: r.explanation ?? '',
      requesterName: r.requesterName ?? '',
    });
  }
  for (const o of seed.orders) {
    ctx.db.order.insert({
      id: o.id, requestId: o.requestId, grantId: o.grantId ?? requestGrant.get(o.requestId) ?? '',
      vendor: o.vendor, amount: o.amount, placed: o.placed, state: o.state,
      canceledOn: o.canceledOn, changedAmount: o.changedAmount,
    });
  }
  for (const a of seed.approvals) ctx.db.approval.insert({ ...pick(a, ['id', 'orderId', 'amount', 'by', 'day']) });
  for (const i of seed.invoices) {
    ctx.db.invoice.insert({
      id: i.id, orderId: i.orderId, vendor: i.vendor, amount: i.amount, received: i.received,
      state: i.state, mismatch: i.mismatch, timeline: i.timeline ?? [], checked: i.checked ?? true,
    });
  }
  for (const p of seed.payroll ?? []) {
    ctx.db.payroll.insert({
      id: p.id, grantId: p.grantId, person: p.person, role: p.role,
      from: p.period.from, to: p.period.to, effortPct: p.effortPct, amount: p.amount,
    });
  }
  for (const pr of seed.paymentRequests) {
    ctx.db.paymentRequest.insert({
      id: pr.id, grantId: pr.grantId, from: pr.from, to: pr.to, amount: pr.amount,
      explanation: pr.explanation, includedRequestIds: pr.includedRequestIds,
      includedPayrollIds: pr.includedPayrollIds ?? [], excluded: pr.excluded, state: pr.state,
    });
    for (const fu of pr.followUps ?? []) {
      ctx.db.followUp.insert({
        id: fu.id, paymentRequestId: pr.id, question: fu.question,
        answerDraft: fu.answerDraft, state: fu.state,
      });
    }
  }
  for (const p of seed.papers) {
    ctx.db.reportPaper.insert({
      id: p.id, grantId: p.grantId, title: p.title, doi: p.doi, pmcid: p.pmcid,
      creditsGrantId: p.creditsGrantId, correction: p.correction, checks: p.checks ?? [],
      result: p.result ?? 'ok', checked: p.checked ?? true, costRequestIds: p.costRequestIds ?? [],
    });
  }
  for (const h of seed.holds) {
    if (h.decision) continue; // already decided in the seed: history lives in the log
    ctx.db.hold.insert({
      id: 0n, kind: h.kind,
      refId: h.kind === 'source_disagreement' ? (flagIds.get(h.refId) ?? h.refId) : h.refId,
      grantId: opt(h.grantId), raisedBy: h.raisedBy, day: h.day, title: h.title, why: h.why,
      evidence: h.evidence, options: h.options, open: true,
    });
  }
  for (const l of seed.log) {
    ctx.db.log.insert({
      id: 0n, day: l.day, at, actor: l.actor, action: l.action,
      rule: l.rule, reason: l.reason, refId: l.refId,
    });
  }
}

function pick<T extends object, K extends keyof T>(o: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = o[k];
  return out;
}
