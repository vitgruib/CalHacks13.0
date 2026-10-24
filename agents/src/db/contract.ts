// What Track B expects from Track A's contract (server/, task T3).
//
// This is a stand-in until T3 lands. Then the row types come from the
// generated SpacetimeDB bindings, and this file only maps our action names to
// their reducers. Names match the Track B note under *Requests* in TASKS.md;
// if Track A picks different names, theirs win and this file changes.

import type { Role } from '../roles.ts';

// Same words as Track C's stand-in (web/src/data/types.ts).
export type GrantStatus = 'active' | 'canceled' | 'restored_by_court' | 'ended';

export interface AgentRow {
  identity: string;
  role: Role;
  registeredAt: number;
}

export interface GrantRow {
  id: string;
  title: string;
  status: GrantStatus;
  awarded: number;
  endDate: string;
}

export interface RequestRow {
  id: number;
  item: string;
  price: number;
  grantId: string | null;
  purpose: string;
  requestedBy: string;
  createdAt: number;
}

export type HoldKind =
  | 'purchase'
  | 'invoice'
  | 'payment_request'
  | 'follow_up'
  | 'report'
  | 'source_disagreement';

export interface Evidence {
  label: string;
  value: string;
}

// Something waiting for the grant manager: the Inbox shows these.
export interface HoldRow {
  id: number;
  kind: HoldKind;
  refId: string;
  grantId: string | null;
  raisedBy: string;
  raisedByRole: Role;
  title: string;
  why: string;
  evidence: Evidence[];
  createdAt: number;
}

export type Source =
  | 'NIH RePORTER'
  | 'USAspending'
  | 'Cancellation list (Apify)'
  | 'Court notice'
  | 'Payment system';

// What one source said about one grant. null means the source doesn't say.
// Only changes are stored, so the latest row per (grant, source) is current.
export interface SourceReadingRow {
  id: number;
  grantId: string;
  source: Source;
  status: GrantStatus | null;
  awarded: number | null;
  paid: number | null;
  endDate: string | null;
  url: string;
  fetchedAt: number;
}

export type StatusEventKind =
  | 'canceled'
  | 'court_order'
  | 'payment_received'
  | 'reading_changed'
  | 'unfrozen';

export interface StatusEventRow {
  id: number;
  grantId: string;
  kind: StatusEventKind;
  source: Source;
  summary: string;
  amount: number | null;
  createdAt: number;
}

export type FlagKind =
  | 'sources_disagree'
  | 'spend_while_canceled'
  | 'court_order_no_payment';

export interface FlagRow {
  id: number;
  grantId: string;
  kind: FlagKind;
  summary: string;
  open: boolean;
  raisedBy: string;
  createdAt: number;
}

// "Check now" from a window, or a recheck right before money moves.
// grantId null means every grant.
export interface CheckRequestRow {
  id: number;
  grantId: string | null;
  reason: 'check_now' | 'before_money_moves';
  requestedBy: string;
  completedAt: number | null;
  createdAt: number;
}

export interface LogRow {
  id: number;
  at: number;
  actor: string;
  action: string;
  subject: string;
  reason: string;
}

export interface Tables {
  agents: AgentRow;
  grants: GrantRow;
  requests: RequestRow;
  holds: HoldRow;
  source_readings: SourceReadingRow;
  status_events: StatusEventRow;
  flags: FlagRow;
  check_requests: CheckRequestRow;
  log: LogRow;
}

export type TableName = keyof Tables;

export interface Actions {
  // Binds the caller's identity to one agent role, once.
  register_agent: { role: Role };
  // People only (the scientist). Agents can't ask to buy things.
  submit_request: {
    item: string;
    price: number;
    grantId: string | null;
    purpose: string;
  };
  // Agents only. Puts an item in the grant manager's Inbox.
  raise_hold: {
    kind: HoldKind;
    refId: string;
    grantId: string | null;
    title: string;
    why: string;
    evidence: Evidence[];
  };
  // Bookkeeping agent only, for the next four.
  post_source_reading: Omit<SourceReadingRow, 'id'>;
  post_status_event: Omit<StatusEventRow, 'id' | 'createdAt'>;
  raise_flag: { grantId: string; kind: FlagKind; summary: string };
  complete_check: { id: number };
  // Anyone: a person's "check now", or an agent before money moves.
  request_check: { grantId: string | null; reason: CheckRequestRow['reason'] };
}

export type ActionName = keyof Actions;

// One client connection = one identity. The token is the credential that
// brings the same identity back after a restart.
export interface Connection {
  readonly identity: string;
  readonly token: string;
  call<A extends ActionName>(action: A, args: Actions[A]): Promise<void>;
  rows<T extends TableName>(table: T): Tables[T][];
  onInsert<T extends TableName>(
    table: T,
    callback: (row: Tables[T]) => void,
  ): () => void;
  disconnect(): void;
}

export interface Db {
  connect(options?: { token?: string }): Promise<Connection>;
}
