// In-memory stand-in for Track A's database, used until T3 lands and in
// tests. It mirrors what matters to the agents: a token maps to a stable
// identity, actions check who is calling, every action writes a log row, and
// subscribers hear about new rows.

import { createHash, randomBytes } from 'node:crypto';

import { ROLES, type Role } from '../roles.ts';
import type {
  ActionName,
  Actions,
  Connection,
  Db,
  GrantRow,
  TableName,
  Tables,
} from './contract.ts';

export class ActionError extends Error {}

// Placeholder grants. The real seed uses 2 public NIH grants (HUMAN_TODO).
export const STUB_GRANTS: GrantRow[] = [
  {
    id: 'DEMO-GRANT-A',
    title: 'Placeholder grant A',
    status: 'active',
    awarded: 450_000,
    endDate: '2027-06-30',
  },
  {
    id: 'DEMO-GRANT-B',
    title: 'Placeholder grant B',
    status: 'active',
    awarded: 300_000,
    endDate: '2026-12-31',
  },
];

type Listener = (row: never) => void;

export interface StubDb extends Db {
  // Read access for tests and the demo, outside any identity.
  rows<T extends TableName>(table: T): Tables[T][];
}

export function createStubDb(grants: GrantRow[] = STUB_GRANTS): StubDb {
  const tables: { [T in TableName]: Tables[T][] } = {
    agents: [],
    grants: grants.map((g) => ({ ...g })),
    requests: [],
    holds: [],
    source_readings: [],
    status_events: [],
    flags: [],
    check_requests: [],
    log: [],
  };
  const listeners = new Map<TableName, Set<Listener>>();
  // Like a SpacetimeDB transaction, subscribers only hear about an action's
  // rows once the whole action has finished.
  let unsent: Array<() => void> = [];
  // Each table counts its own ids, like a SpacetimeDB auto-increment column.
  const lastId = {
    requests: 0,
    holds: 0,
    source_readings: 0,
    status_events: 0,
    flags: 0,
    check_requests: 0,
    log: 0,
  };

  function insert<T extends TableName>(table: T, row: Tables[T]): void {
    tables[table].push(row);
    for (const listener of listeners.get(table) ?? []) {
      unsent.push(() => (listener as (row: Tables[T]) => void)(row));
    }
  }

  function commit(): void {
    const toSend = unsent;
    unsent = [];
    for (const send of toSend) send();
  }

  // Callers get a copy, so they can't edit rows behind an action's back.
  function read<T extends TableName>(table: T): Tables[T][] {
    return [...tables[table]] as Tables[T][];
  }

  function roleOf(identity: string): Role | undefined {
    return tables.agents.find((a) => a.identity === identity)?.role;
  }

  function requireBookkeeping(sender: string, action: string): void {
    if (roleOf(sender) !== 'bookkeeping') {
      throw new ActionError(`${action}: only the bookkeeping agent may call this`);
    }
  }

  function requireGrant(grantId: string): void {
    if (!tables.grants.some((g) => g.id === grantId)) {
      throw new ActionError(`unknown grant ${grantId}`);
    }
  }

  function log(actor: string, action: string, subject: string, reason: string) {
    insert('log', { id: ++lastId.log, at: Date.now(), actor, action, subject, reason });
  }

  const handlers: {
    [A in ActionName]: (sender: string, args: Actions[A]) => void;
  } = {
    register_agent(sender, { role }) {
      if (!ROLES.includes(role)) throw new ActionError(`unknown role ${role}`);
      const current = roleOf(sender);
      if (current === role) return;
      if (current) {
        throw new ActionError(`identity is already the ${current} agent`);
      }
      if (tables.agents.some((a) => a.role === role)) {
        throw new ActionError(`another identity is already the ${role} agent`);
      }
      insert('agents', { identity: sender, role, registeredAt: Date.now() });
      log(sender, 'register_agent', role, `identity registered as the ${role} agent`);
    },

    submit_request(sender, args) {
      if (roleOf(sender)) throw new ActionError('agents cannot submit requests');
      const id = ++lastId.requests;
      insert('requests', { id, ...args, requestedBy: sender, createdAt: Date.now() });
      log(sender, 'submit_request', `request ${id}`, args.purpose);
    },

    raise_hold(sender, args) {
      const role = roleOf(sender);
      if (!role) throw new ActionError('only registered agents can raise holds');
      const id = ++lastId.holds;
      insert('holds', {
        id,
        ...args,
        raisedBy: sender,
        raisedByRole: role,
        createdAt: Date.now(),
      });
      log(sender, 'raise_hold', `${args.kind} ${args.refId}`, args.why);
    },

    post_source_reading(sender, args) {
      requireBookkeeping(sender, 'post_source_reading');
      requireGrant(args.grantId);
      insert('source_readings', { id: ++lastId.source_readings, ...args });
      log(sender, 'post_source_reading', `grant ${args.grantId}`, `${args.source} changed (${args.url})`);
    },

    post_status_event(sender, args) {
      requireBookkeeping(sender, 'post_status_event');
      requireGrant(args.grantId);
      insert('status_events', { id: ++lastId.status_events, ...args, createdAt: Date.now() });
      log(sender, 'post_status_event', `grant ${args.grantId}`, args.summary);
    },

    // A disagreement asks the grant manager, so the flag and its Inbox item
    // are written together.
    raise_flag(sender, args) {
      requireBookkeeping(sender, 'raise_flag');
      requireGrant(args.grantId);
      const id = ++lastId.flags;
      insert('flags', { id, ...args, open: true, raisedBy: sender, createdAt: Date.now() });
      if (args.kind === 'sources_disagree') {
        insert('holds', {
          id: ++lastId.holds,
          kind: 'source_disagreement',
          refId: String(id),
          grantId: args.grantId,
          raisedBy: sender,
          raisedByRole: 'bookkeeping',
          title: `Which source is right about ${args.grantId}?`,
          why: args.summary,
          evidence: [],
          createdAt: Date.now(),
        });
      }
      log(sender, 'raise_flag', `grant ${args.grantId}`, args.summary);
    },

    request_check(sender, args) {
      if (args.grantId !== null) requireGrant(args.grantId);
      const id = ++lastId.check_requests;
      insert('check_requests', {
        id,
        ...args,
        requestedBy: sender,
        completedAt: null,
        createdAt: Date.now(),
      });
      log(sender, 'request_check', `check ${id}`, `${args.reason} for ${args.grantId ?? 'every grant'}`);
    },

    complete_check(sender, { id }) {
      requireBookkeeping(sender, 'complete_check');
      const check = tables.check_requests.find((c) => c.id === id);
      if (!check) throw new ActionError(`unknown check request ${id}`);
      check.completedAt = Date.now();
      log(sender, 'complete_check', `check ${id}`, 'sources read');
    },
  };

  return {
    rows: read,

    async connect({ token = randomBytes(32).toString('hex') } = {}) {
      const identity = createHash('sha256').update(token).digest('hex');
      const own = new Set<() => void>();
      const connection: Connection = {
        identity,
        token,
        async call(action, args) {
          handlers[action](identity, args);
          commit();
        },
        rows: read,
        onInsert(table, callback) {
          const set = listeners.get(table) ?? new Set();
          listeners.set(table, set);
          set.add(callback as Listener);
          const off = () => {
            set.delete(callback as Listener);
            own.delete(off);
          };
          own.add(off);
          return off;
        },
        disconnect() {
          for (const off of [...own]) off();
        },
      };
      return connection;
    },
  };
}
