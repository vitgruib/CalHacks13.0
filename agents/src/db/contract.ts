// Track A's contract (server/src/schema.ts and server/src/index.ts) as the
// agents see it. Track A's names win: when the module changes, this file
// follows (test/contract.test.ts fails when a table grows a column).
//
// Rows arrive the same way from both databases (db/local.ts, db/spacetime.ts):
// - identities are hex strings and timestamps are milliseconds;
// - u64 ids (holds, flags, events, readings, check requests, log) are bigint;
// - an optional column that isn't set is undefined;
// - rows() lists rows in primary-key order (rq-9 before rq-10).
// Kinds and states are strings the module checks against server/src/vocab.ts.

import type { Role } from '../roles.ts';

export type AgentRole = Role;
export type PersonRole = 'grant_manager' | 'scientist' | 'funder';

export type GrantStatus = 'active' | 'canceled' | 'restored_by_court' | 'ended';
export type Source =
  | 'NIH RePORTER'
  | 'USAspending'
  | 'Cancellation list (Apify)'
  | 'Court notice'
  | 'Payment system';
export type StatusEventKind = 'canceled' | 'court_order' | 'payment_received' | 'reading_changed' | 'unfrozen';
export type FlagKind = 'sources_disagree' | 'spend_while_canceled' | 'court_order_no_payment';
export type CheckReason = 'check_now' | 'before_money_moves';
export type HoldKind = 'purchase' | 'invoice' | 'payment_request' | 'follow_up' | 'report' | 'source_disagreement';
export type Choice = 'approve' | 'reject' | 'override' | 'ask_vendor' | 'pick_source';
export type RequestState = 'submitted' | 'bought' | 'blocked' | 'rerouted' | 'waiting_on_manager' | 'rejected' | 'canceled';
export type OrderState = 'open' | 'canceled' | 'changed' | 'paid';
export type InvoiceState = 'matched' | 'held' | 'paid' | 'rejected';
export type PaymentRequestState = 'drafted' | 'waiting_on_manager' | 'sent' | 'paid';
export type FollowUpState = 'asked' | 'drafted' | 'waiting_on_manager' | 'sent';
export type PaperResult = 'ok' | 'note' | 'held';

export interface Evidence {
  label: string;
  value: string;
}
export interface RuleVerdict {
  rule: string;
  pass: boolean;
  detail: string;
  auditCase?: string;
}
/** How a shared cost is charged; shares sum to 1. */
export interface Split {
  grantId: string;
  share: number;
}
export interface TimelineEntry {
  day: string;
  what: string;
}
export interface Excluded {
  requestId: string;
  why: string;
}
export interface Correction {
  kind: 'material' | 'minor' | 'retraction';
  disclosed: boolean;
  note: string;
}
export interface PaperCheck {
  check: string;
  pass: boolean;
  detail: string;
}

// ── Who is who ─────────────────────────────────────────────────────────────

export interface AgentRow {
  identity: string;
  role: AgentRole;
  registeredAt: number;
}
export interface PersonRow {
  identity: string;
  role: PersonRole;
  name: string;
  registeredAt: number;
}
/** Single row (id 0): the simulated "today" every rule reads. */
export interface ClockRow {
  id: number;
  today: string;
}

// ── Fund tracker ───────────────────────────────────────────────────────────

/** Money and freeze are kept current by the module: available = awarded − spent − promised. */
export interface GrantRow {
  id: string;
  title: string;
  pi: string;
  agency: string;
  awarded: number;
  received: number;
  spent: number;
  promised: number;
  available: number;
  start: string;
  end: string;
  status: GrantStatus;
  frozen: boolean;
  frozenReason?: string;
}
export interface StatusEventRow {
  id: bigint;
  grantId: string;
  day: string;
  kind: StatusEventKind;
  source: Source;
  summary: string;
  amount?: number;
  at: number;
}
/** What one source said about one grant. Only changes are posted, so the latest row per (grant, source) is current. */
export interface SourceReadingRow {
  id: bigint;
  grantId: string;
  source: Source;
  status?: GrantStatus;
  awarded?: number;
  paid?: number;
  endDate?: string;
  url: string;
  day: string;
  at: number;
}
export interface FlagRow {
  id: bigint;
  grantId: string;
  day: string;
  kind: FlagKind;
  summary: string;
  open: boolean;
  raisedBy: string;
}
/** "Check now" from a window, or a recheck right before money moves. No grantId = every grant. */
export interface CheckRequestRow {
  id: bigint;
  grantId?: string;
  reason: CheckReason;
  requestedBy: string;
  day: string;
  done: boolean;
  asOf: string; // demo time (T59): the real day the cancellation list is read as of; '' = today
}

// ── Purchases, orders, invoices ────────────────────────────────────────────

export interface RequestRow {
  id: string;
  day: string;
  requester: string;
  requestedBy?: string;
  item: string;
  category: string;
  price: number;
  /** The grant asked for; the purchasing agent picks one if there is none. */
  grantId?: string;
  /** The grant actually charged (set by evaluate_request / act_on_request). */
  chargedGrantId?: string;
  /** Grants the item serves; two or more make it a shared cost. */
  sharedWith: string[];
  split: Split[];
  purpose: string;
  state: RequestState;
  /** Written by the module's spending rules, never by an agent. */
  verdicts: RuleVerdict[];
  explanation: string;
  /** The person who asked, e.g. "Dr. Priya Nair" ('' if unknown). */
  requesterName: string;
}
export interface OrderRow {
  id: string;
  requestId: string;
  grantId: string;
  vendor: string;
  amount: number;
  placed: string;
  state: OrderState;
  canceledOn?: string;
  changedAmount?: number;
}
export interface ApprovalRow {
  id: string;
  orderId: string;
  amount: number;
  by: string;
  day: string;
}
export interface InvoiceRow {
  id: string;
  orderId: string;
  vendor: string;
  amount: number;
  received: string;
  state: InvoiceState;
  mismatch?: string;
  timeline: TimelineEntry[];
  /** false until the bookkeeping agent checks it. */
  checked: boolean;
}
export interface PayrollRow {
  id: string;
  grantId: string;
  person: string;
  role: string;
  from: string;
  to: string;
  effortPct: number;
  amount: number;
}

// ── Payment requests and progress reports ──────────────────────────────────

export interface PaymentRequestRow {
  id: string;
  grantId: string;
  from: string;
  to: string;
  amount: number;
  /** ≤ 1,000 characters. */
  explanation: string;
  includedRequestIds: string[];
  includedPayrollIds: string[];
  excluded: Excluded[];
  state: PaymentRequestState;
}
export interface FollowUpRow {
  id: string;
  paymentRequestId: string;
  question: string;
  answerDraft?: string;
  state: FollowUpState;
}
export interface ReportPaperRow {
  id: string;
  /** The grant whose progress report lists the paper. */
  grantId: string;
  title: string;
  doi: string;
  pmcid?: string;
  /** The grant the paper's acknowledgments name. */
  creditsGrantId: string;
  correction?: Correction;
  checks: PaperCheck[];
  result: PaperResult;
  checked: boolean;
  costRequestIds: string[];
}

// ── The Inbox, decisions, log ──────────────────────────────────────────────

/** Anything waiting for the grant manager. Only the Inbox (a person) decides these. */
export interface HoldRow {
  id: bigint;
  kind: HoldKind;
  /** The request / invoice / payment request / follow-up / paper id, or a flag id as a string. */
  refId: string;
  grantId?: string;
  raisedBy: string;
  day: string;
  title: string;
  why: string;
  evidence: Evidence[];
  options: Choice[];
  open: boolean;
}
export interface DecisionRow {
  id: bigint;
  holdId: bigint;
  choice: Choice;
  reason: string;
  by: string;
  byIdentity: string;
  day: string;
  at: number;
}
/** A row for every action: who, what, which rule, why. */
export interface LogRow {
  id: bigint;
  day: string;
  at: number;
  actor: string;
  action: string;
  rule?: string;
  reason: string;
  refId?: string;
}

/** Every public table, by the module's accessor name (also the generated bindings' name). */
export interface Tables {
  agent: AgentRow;
  person: PersonRow;
  clock: ClockRow;
  grant: GrantRow;
  statusEvent: StatusEventRow;
  sourceReading: SourceReadingRow;
  flag: FlagRow;
  checkRequest: CheckRequestRow;
  request: RequestRow;
  order: OrderRow;
  approval: ApprovalRow;
  invoice: InvoiceRow;
  payroll: PayrollRow;
  paymentRequest: PaymentRequestRow;
  followUp: FollowUpRow;
  reportPaper: ReportPaperRow;
  hold: HoldRow;
  decision: DecisionRow;
  log: LogRow;
}
export type TableName = keyof Tables;

/** Each table's primary key, which identifies a row across updates. */
export const PRIMARY_KEYS = {
  agent: 'identity',
  person: 'identity',
  clock: 'id',
  grant: 'id',
  statusEvent: 'id',
  sourceReading: 'id',
  flag: 'id',
  checkRequest: 'id',
  request: 'id',
  order: 'id',
  approval: 'id',
  invoice: 'id',
  payroll: 'id',
  paymentRequest: 'id',
  followUp: 'id',
  reportPaper: 'id',
  hold: 'id',
  decision: 'id',
  log: 'id',
} as const satisfies { [T in TableName]: keyof Tables[T] };

export const TABLES = Object.keys(PRIMARY_KEYS) as TableName[];

// ── Actions (reducers), by the module's export name ────────────────────────
// Who may call each one is checked by the module, by identity.

export interface Actions {
  register_agent: { role: AgentRole };
  register_person: { role: PersonRole; name: string };

  // Purchases. People submit; the purchasing agent evaluates, then acts.
  submit_request: { item: string; category: string; price: number; grantId?: string; purpose: string; sharedWith: string[] };
  push_back: { requestId: string; message: string };
  /** Runs every spending rule against a grant (default: the one asked for) and stores the verdicts on the request. No money moves. */
  evaluate_request: { requestId: string; grantId?: string; split: Split[] };
  /** buy and reroute recheck the rules and are refused unless every rule passes; hold sends it to the Inbox; block refuses it. */
  act_on_request: { requestId: string; action: 'buy' | 'reroute' | 'hold' | 'block'; grantId?: string; vendor: string; explanation: string };

  // The Inbox. Agents raise; only the grant manager decides, with a reason.
  raise_hold: { kind: HoldKind; refId: string; grantId?: string; title: string; why: string; evidence: Evidence[]; options: Choice[] };
  decide_hold: { holdId: bigint; choice: Choice; reason: string };
  unfreeze_grant: { grantId: string; reason: string };

  // Fund tracker (bookkeeping agent).
  post_source_reading: { grantId: string; source: Source; status?: GrantStatus; awarded?: number; paid?: number; endDate?: string; url: string };
  post_status_event: { grantId: string; kind: StatusEventKind; source: Source; summary: string; amount?: number };
  /** A sources_disagree flag freezes the grant and the module puts it in the Inbox. */
  raise_flag: { grantId: string; kind: FlagKind; summary: string };
  request_check: { grantId?: string; reason: CheckReason; asOf?: string };
  complete_check: { id: bigint };

  // Invoices (bookkeeping agent). The module applies the match rule: paid, or held with a timeline and an Inbox item.
  check_invoice: { invoiceId: string };

  // Payment requests (payment and report agent). The module picks purchases and payroll, leaves held spending out and computes the amount.
  draft_payment_request: { grantId: string; from: string; to: string; explanation: string };
  ask_follow_up: { paymentRequestId: string; question: string };
  draft_follow_up_answer: { followUpId: string; answer: string };

  // Progress report (payment and report agent): what public records say; the module runs the checks.
  record_paper_facts: { paperId: string; creditsGrantId: string; pmcid?: string; correction?: Correction };

  // Test lab (any registered person; demo only).
  set_today: { day: string };
  advance_days: { days: number };
  inject_status_event: { grantId: string; kind: StatusEventKind; source: Source; summary: string; amount?: number };
  inject_invoice: { orderId: string; amount: number };
  cancel_order: { orderId: string };
  reset_world: Record<string, never>;
  load_seed: { json: string };
  clear_world: Record<string, never>;
}
export type ActionName = keyof Actions;

/** The module refused an action (its SenderError message, e.g. "Only the purchasing agent can do this"). */
export class ActionError extends Error {
  constructor(
    readonly action: string,
    message: string,
  ) {
    super(message);
    this.name = 'ActionError';
  }
}

export type Unsubscribe = () => void;

// One client connection = one identity. The token is the credential that
// brings the same identity back after a restart.
export interface Connection {
  readonly identity: string;
  readonly token: string;
  /** Resolves once the action committed; rejects with ActionError when the module refuses it. */
  call<A extends ActionName>(action: A, args: Actions[A]): Promise<void>;
  rows<T extends TableName>(table: T): Tables[T][];
  /** The simulated date every rule reads (clock row 0). */
  today(): string;
  /** New rows only; read rows() first for what was already there. */
  onInsert<T extends TableName>(table: T, callback: (row: Tables[T]) => void): Unsubscribe;
  onUpdate<T extends TableName>(table: T, callback: (oldRow: Tables[T], newRow: Tables[T]) => void): Unsubscribe;
  /** Rows that went away, e.g. when the Test lab loads a world: rows it brings back unchanged send nothing. */
  onDelete<T extends TableName>(table: T, callback: (row: Tables[T]) => void): Unsubscribe;
  disconnect(): void;
}

export interface Db {
  connect(options?: { token?: string }): Promise<Connection>;
  /** Resolves once every change so far has reached every subscriber. */
  settled(): Promise<void>;
  /** Counts committed changes, so callers can tell when the world has gone quiet. */
  version(): number;
  close(): void;
}
