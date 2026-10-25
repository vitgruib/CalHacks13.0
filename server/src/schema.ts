// The shared contract (T3): every table Grant Test Auto keeps. Agents (Track B)
// and windows (Track C) only ever talk through these tables and the actions
// in index.ts. Shapes follow Track C's stand-in (web/src/data/types.ts) so
// the windows swap over with little change.
//
// Conventions:
// - Days on the simulated clock are ISO strings (YYYY-MM-DD); `clock.today`
//   is "now" for every rule. Real time is kept separately as `at`.
// - Money is whole US dollars as f64 (plain JS numbers in the bindings).
// - Kinds and states are strings; the allowed values are listed in
//   vocab.ts and checked by the actions.
// - Column names go out snake_case on the wire (SpacetimeDB's default);
//   generated TypeScript bindings use camelCase.
// - Schema changes after T3 are additive only (AGENTS.md §3).

import { schema, table, t } from 'spacetimedb/server';

const Evidence = t.object('Evidence', { label: t.string(), value: t.string() });
const Verdict = t.object('RuleVerdict', {
  rule: t.string(),
  pass: t.bool(),
  detail: t.string(),
  auditCase: t.string().optional(),
});
const Split = t.object('Split', { grantId: t.string(), share: t.f64() });
const TimelineEntry = t.object('TimelineEntry', { day: t.string(), what: t.string() });
const Excluded = t.object('Excluded', { requestId: t.string(), why: t.string() });
const Correction = t.object('Correction', {
  kind: t.string(), // material | minor | retraction
  disclosed: t.bool(),
  note: t.string(),
});
const PaperCheck = t.object('PaperCheck', { check: t.string(), pass: t.bool(), detail: t.string() });

// ── Who is who ────────────────────────────────────────────────────────────

/** One AI agent per identity; a role is bound once (register_agent). */
const agent = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    role: t.string().unique(), // purchasing | bookkeeping | payment_report
    registeredAt: t.timestamp(),
  }
);

/** People (grant manager, scientist, funder persona), bound once per identity. */
const person = table(
  { public: true },
  {
    identity: t.identity().primaryKey(),
    role: t.string(), // grant_manager | scientist | funder
    name: t.string(),
    registeredAt: t.timestamp(),
  }
);

/** Single row (id 0): the simulated "today" every rule reads. */
const clock = table({ public: true }, { id: t.u8().primaryKey(), today: t.string() });

// ── Fund tracker ──────────────────────────────────────────────────────────

/**
 * spent / promised / received / available / frozen are kept current by the
 * module (T5): available = awarded − spent − promised.
 */
const grant = table(
  { public: true },
  {
    id: t.string().primaryKey(), // e.g. R01GM061721
    title: t.string(),
    pi: t.string(),
    agency: t.string(),
    awarded: t.f64(),
    received: t.f64(),
    spent: t.f64(),
    promised: t.f64(), // orders placed, not yet paid
    available: t.f64(), // truly available
    start: t.string(),
    end: t.string(),
    status: t.string(), // active | canceled | restored_by_court | ended
    frozen: t.bool(),
    frozenReason: t.string().optional(),
  }
);

const statusEvent = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    grantId: t.string().index('btree'),
    day: t.string(),
    kind: t.string(), // canceled | court_order | payment_received | reading_changed | unfrozen
    source: t.string(),
    summary: t.string(),
    amount: t.f64().optional(),
    at: t.timestamp(),
  }
);

/** What one source said about one grant. Only changes are posted. */
const sourceReading = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    grantId: t.string().index('btree'),
    source: t.string(),
    status: t.string().optional(),
    awarded: t.f64().optional(),
    paid: t.f64().optional(),
    endDate: t.string().optional(),
    url: t.string(),
    day: t.string(),
    at: t.timestamp(),
  }
);

const flag = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    grantId: t.string().index('btree'),
    day: t.string(),
    kind: t.string(), // sources_disagree | spend_while_canceled | court_order_no_payment
    summary: t.string(),
    open: t.bool(),
    raisedBy: t.string(), // role or person role
  }
);

/** "Check now" from a window, or a recheck right before money moves. */
const checkRequest = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    grantId: t.string().optional(), // none = every grant
    reason: t.string(), // check_now | before_money_moves
    requestedBy: t.string(),
    day: t.string(),
    done: t.bool(),
    asOf: t.string().default(''), // demo time: read the cancellation list as it stood this real day (YYYY-MM-DD), '' = today; added T59
  }
);

/**
 * Ask's look at an item before any grant (T103): a researcher asks, the
 * bookkeeping agent answers with Claude. A preview only: nothing is bought or
 * held, and the request itself is checked again when it is sent.
 */
const itemCheck = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    item: t.string(),
    purpose: t.string(),
    price: t.f64(),
    requestedBy: t.string(), // person role
    answered: t.bool(),
    verdict: t.string(), // '' until answered | fine | flag | unchecked (no Claude answer)
    why: t.string(), // one line when flagged
    category: t.string(), // the kind of thing it is, from Claude ('' = not read)
  }
);

// ── Purchases, orders, invoices ───────────────────────────────────────────

const request = table(
  { public: true },
  {
    id: t.string().primaryKey(), // rq1, rq2, ...
    day: t.string(),
    requester: t.string(), // person role, e.g. scientist
    requestedBy: t.identity().optional(), // none for seeded rows
    item: t.string(),
    category: t.string(),
    price: t.f64(),
    grantId: t.string().optional(), // grant asked for (agent picks if none)
    chargedGrantId: t.string().optional(), // grant actually charged
    sharedWith: t.array(t.string()), // unused: grant splitting was removed (T95)
    split: t.array(Split), // unused (T95)
    purpose: t.string(),
    state: t.string(), // submitted | bought | blocked | rerouted | waiting_on_manager | rejected | canceled
    verdicts: t.array(Verdict), // written by the module's rules (T6)
    explanation: t.string(), // plain-language status (sendToGrantOffice)
    requesterName: t.string().default(''), // the person who asked, e.g. Dr. Priya Nair ('' if unknown); added T39
    oneGrantBasis: t.string().default(''), // unused (T95); added T63
  }
);

/** A purchasable line of an experiment plan: what becomes a request. */
const PlanLine = t.object('PlanLine', {
  line: t.u32(), // 1-based position in the plan
  item: t.string(),
  category: t.string(),
  price: t.f64(),
  purpose: t.string(),
});

/**
 * An experiment plan (T71, was browser-only SpendGuard): a researcher's
 * experiment and line-item budget with its funding-readiness report. A plan
 * that clears its checks, or that the grant manager approves, becomes one
 * request per purchasable line, made by the module. The full line items and
 * the report are JSON in the web's shape (web/src/spendguard/assess.ts) until
 * the scope assessment moves into the module and agents (T72, T73).
 */
const plan = table(
  { public: true },
  {
    id: t.string().primaryKey(), // pl1, pl2, ...
    researcher: t.string(), // name, as on requests
    ownedBy: t.identity(),
    status: t.string(), // draft | submitted | sent | returned
    grantId: t.string(),
    experiment: t.string(),
    total: t.f64(),
    overall: t.string(), // the report's verdict: aligned | clarify | outside ('' = not assessed)
    lines: t.array(PlanLine),
    body: t.string(), // JSON: the plan as the researcher entered it
    report: t.string(), // JSON: the funding-readiness report ('' = not assessed)
    savedOn: t.string(),
    submittedOn: t.string(), // '' = not yet
    sentOn: t.string(), // '' = its lines aren't requests yet
    decisionChoice: t.string(), // approve | return ('' = none)
    decisionReason: t.string(),
    decisionDay: t.string(),
  }
);

const order = table(
  { public: true },
  {
    id: t.string().primaryKey(),
    requestId: t.string().index('btree'),
    grantId: t.string(),
    vendor: t.string(),
    amount: t.f64(),
    placed: t.string(),
    state: t.string(), // open | canceled | changed | paid
    canceledOn: t.string().optional(),
    changedAmount: t.f64().optional(),
  }
);

const approval = table(
  { public: true },
  {
    id: t.string().primaryKey(),
    orderId: t.string().index('btree'),
    amount: t.f64(),
    by: t.string(),
    day: t.string(),
  }
);

const invoice = table(
  { public: true },
  {
    id: t.string().primaryKey(),
    orderId: t.string(),
    vendor: t.string(),
    amount: t.f64(),
    received: t.string(),
    state: t.string(), // matched | held | paid | rejected
    mismatch: t.string().optional(),
    timeline: t.array(TimelineEntry),
    checked: t.bool(), // false until the bookkeeping agent checks it
  }
);

const payroll = table(
  { public: true },
  {
    id: t.string().primaryKey(),
    grantId: t.string().index('btree'),
    person: t.string(),
    role: t.string(),
    from: t.string(),
    to: t.string(),
    effortPct: t.f64(),
    amount: t.f64(),
  }
);

// ── Payment requests and progress reports ─────────────────────────────────

const paymentRequest = table(
  { public: true },
  {
    id: t.string().primaryKey(),
    grantId: t.string(),
    from: t.string(),
    to: t.string(),
    amount: t.f64(),
    explanation: t.string(), // ≤ 1,000 characters
    includedRequestIds: t.array(t.string()),
    includedPayrollIds: t.array(t.string()),
    excluded: t.array(Excluded),
    state: t.string(), // drafted | waiting_on_manager | sent | paid
  }
);

const followUp = table(
  { public: true },
  {
    id: t.string().primaryKey(),
    paymentRequestId: t.string().index('btree'),
    question: t.string(),
    answerDraft: t.string().optional(),
    state: t.string(), // asked | drafted | waiting_on_manager | sent
  }
);

const reportPaper = table(
  { public: true },
  {
    id: t.string().primaryKey(),
    grantId: t.string(), // grant whose progress report lists it
    title: t.string(),
    doi: t.string(),
    pmcid: t.string().optional(),
    creditsGrantId: t.string(), // grant the acknowledgments name
    correction: Correction.optional(),
    checks: t.array(PaperCheck),
    result: t.string(), // ok | note | held
    checked: t.bool(),
    costRequestIds: t.array(t.string()),
  }
);

// ── The Inbox, decisions, log ─────────────────────────────────────────────

/** Anything waiting for the grant manager. Only the Inbox acts on these. */
const hold = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    kind: t.string(), // purchase | invoice | payment_request | follow_up | report | source_disagreement
    refId: t.string(), // request / invoice / payment request / follow-up / paper / flag id
    grantId: t.string().optional(),
    raisedBy: t.string(), // agent role
    day: t.string(),
    title: t.string(),
    why: t.string(),
    evidence: t.array(Evidence),
    options: t.array(t.string()), // approve | reject | ask_vendor | pick_source
    open: t.bool(),
  }
);

const decision = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    holdId: t.u64().index('btree'),
    choice: t.string(),
    reason: t.string(), // required, never empty
    by: t.string(), // person role
    byIdentity: t.identity(),
    day: t.string(),
    at: t.timestamp(),
  }
);

/** A row for every action: who, what, which rule, why. */
const log = table(
  { public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    day: t.string(),
    at: t.timestamp(),
    actor: t.string(), // agent role, person role, or system
    action: t.string(),
    rule: t.string().optional(),
    reason: t.string(),
    refId: t.string().optional(),
  }
);

/** Monotonic counters for readable string ids (rq7, o4, ...). */
const counter = table({}, { name: t.string().primaryKey(), next: t.u32() });

const spacetimedb = schema({
  agent,
  person,
  clock,
  grant,
  statusEvent,
  sourceReading,
  flag,
  checkRequest,
  itemCheck,
  request,
  plan,
  order,
  approval,
  invoice,
  payroll,
  paymentRequest,
  followUp,
  reportPaper,
  hold,
  decision,
  log,
  counter,
});

export default spacetimedb;
