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
