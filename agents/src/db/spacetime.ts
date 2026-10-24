// GG_DB=spacetime: Track A's module on a running SpacetimeDB server, through
// the generated client bindings in src/module_bindings (regenerate them with
// `npm --prefix server run generate` whenever server/ changes).
//
// Each connect() opens one websocket, which is one identity, and subscribes
// it to every public table in contract.ts TABLES with a single subscription.
// Rows come out the way db/local.ts delivers them (see contract.ts).

import { Identity, Timestamp, type Infer } from 'spacetimedb';

import { DbConnection, reducers, tables, type EventContext } from '../module_bindings/index.ts';
import {
  ActionError,
  TABLES,
  type ActionName,
  type Actions,
  type Connection,
  type Db,
  type TableName,
  type Tables,
  type Unsubscribe,
} from './contract.ts';
import { byPrimaryKey, fingerprint } from './rows.ts';

const CONNECT_TIMEOUT_MS = 10_000;
const SETTLE_TIMEOUT_MS = 5_000;

export interface SpacetimeDbOptions {
  /** Default: env GG_SPACETIME_URI, else ws://127.0.0.1:3000. */
  uri?: string;
  /** Default: env GG_SPACETIME_DB, else grantguard. */
  databaseName?: string;
}

// Contract action names are the module's reducer names; the bindings call
// them by camelCase accessor (act_on_request → actOnRequest).
const ACCESSORS = new Map<string, string>(Object.values(reducers).map((r) => [r.name, r.accessorName]));

type RowListener = (ctx: EventContext, row: object) => void;
type UpdateListener = (ctx: EventContext, oldRow: object, newRow: object) => void;
type Reducer = (args: object) => Promise<void>;

// One cached table, typed loosely: rows only become contract types after
// normalize(). Every contract table has a primary key, so onUpdate exists.
interface CachedTable {
  iter(): Iterable<object>;
  onInsert(cb: RowListener): void;
  removeOnInsert(cb: RowListener): void;
  onDelete(cb: RowListener): void;
  removeOnDelete(cb: RowListener): void;
  onUpdate(cb: UpdateListener): void;
  removeOnUpdate(cb: UpdateListener): void;
}

const cached = (conn: DbConnection, table: TableName): CachedTable =>
  (conn.db as unknown as Record<TableName, CachedTable>)[table];

// Identities become hex strings and timestamps milliseconds; u64 stays bigint
// and an unset option stays undefined, as the SDK already delivers them.
function normalize(value: unknown): unknown {
  if (value instanceof Identity) return value.toHexString();
  if (value instanceof Timestamp) return Number(value.microsSinceUnixEpoch / 1000n);
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, normalize(inner)]));
  }
  return value;
}

// A subscriber that throws must not take down the websocket's message loop.
function deliver(table: TableName, run: () => void): void {
  try {
    run();
  } catch (error) {
    console.error(`db: a ${table} subscriber failed`, error);
  }
}

interface Live {
  conn: DbConnection;
  open: boolean;
  /** Highest log id in this connection's cache: how far it has caught up. */
  maxLogId: bigint;
  lastEventId?: string;
}

export function createSpacetimeDb(options: SpacetimeDbOptions = {}): Db {
  const uri = options.uri ?? process.env.GG_SPACETIME_URI ?? 'ws://127.0.0.1:3000';
  const databaseName = options.databaseName ?? process.env.GG_SPACETIME_DB ?? 'grantguard';

  const lives = new Set<Live>();
  const inflight = new Set<Promise<void>>();
  const waiters = new Set<() => void>();
  let commits = 0;
  let checkQueued = false;

  function wakeWaiters(): void {
    if (checkQueued) return;
    checkQueued = true;
    // After the current server message: the SDK runs every row callback for
    // a transaction synchronously, so by then they have all run.
    setImmediate(() => {
      checkQueued = false;
      for (const check of [...waiters]) check();
    });
  }

  // Counts transactions (not rows) and tracks the newest log row seen.
  function watch(live: Live): void {
    const seen = (ctx: EventContext) => {
      const { tag, id } = ctx.event;
      if ((tag !== 'Reducer' && tag !== 'Transaction') || id === live.lastEventId) return;
      live.lastEventId = id;
      commits++;
      wakeWaiters();
    };
    for (const table of TABLES) {
      const cache = cached(live.conn, table);
      cache.onInsert(seen);
      cache.onDelete(seen);
      cache.onUpdate(seen);
    }
    cached(live.conn, 'log').onInsert((_ctx, row) => {
      const { id } = row as { id: bigint };
      if (id > live.maxLogId) live.maxLogId = id;
    });
  }

  // Every connection subscribes to every table, so each one receives every
  // transaction. Every action writes a log row with an increasing id, so a
  // connection has caught up once its newest log id reaches the newest any
  // connection has seen.
  function caughtUp(): Promise<void> {
    const open = [...lives].filter((live) => live.open);
    const target = open.reduce((max, live) => (live.maxLogId > max ? live.maxLogId : max), -1n);
    const behind = () => open.some((live) => live.open && live.maxLogId < target);
    return new Promise<void>((resolve, reject) => {
      if (!behind()) {
        setImmediate(resolve);
        return;
      }
      const timer = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`db: a connection to ${databaseName} is still behind log #${target} after ${SETTLE_TIMEOUT_MS} ms`));
      }, SETTLE_TIMEOUT_MS);
      const check = () => {
        if (behind()) return;
        clearTimeout(timer);
        waiters.delete(check);
        resolve();
      };
      waiters.add(check);
    });
  }

  async function invoke(conn: DbConnection, action: string, args: object): Promise<void> {
    const accessor = ACCESSORS.get(action);
    const reducer = accessor ? (conn.reducers as unknown as Record<string, Reducer>)[accessor] : undefined;
    if (!reducer) throw new ActionError(action, `The module has no action ${action}.`);
    try {
      // Resolves once the reducer committed, after this connection applied its
      // rows and ran their callbacks; rejects with the module's SenderError
      // message, an InternalError, or a disconnect.
      await reducer(args);
    } catch (error) {
      throw new ActionError(action, error instanceof Error ? error.message : String(error));
    }
  }

  function track(call: Promise<void>): void {
    const done = call.then(
      () => undefined,
      () => undefined,
    );
    inflight.add(done);
    void done.then(() => inflight.delete(done));
  }

  function connection(live: Live, identity: string, token: string): Connection {
    const { conn } = live;
    const stops = new Set<Unsubscribe>();
    const rows = <T extends TableName>(table: T): Tables[T][] =>
      byPrimaryKey(table, [...cached(conn, table).iter()].map((row) => normalize(row) as Tables[T]));

    return {
      identity,
      token,
      call<A extends ActionName>(action: A, args: Actions[A]): Promise<void> {
        const call = invoke(conn, action, args);
        track(call);
        return call;
      },
      rows,
      today: () => rows('clock').find((row) => row.id === 0)?.today ?? '2026-01-01',
      onInsert<T extends TableName>(table: T, callback: (row: Tables[T]) => void): Unsubscribe {
        const cache = cached(conn, table);
        const listener: RowListener = (ctx, row) => {
          if (ctx.event.tag === 'SubscribeApplied') return;
          deliver(table, () => callback(normalize(row) as Tables[T]));
        };
        cache.onInsert(listener);
        const stop = () => {
          cache.removeOnInsert(listener);
          stops.delete(stop);
        };
        stops.add(stop);
        return stop;
      },
      onUpdate<T extends TableName>(table: T, callback: (oldRow: Tables[T], newRow: Tables[T]) => void): Unsubscribe {
        const cache = cached(conn, table);
        const listener: UpdateListener = (_ctx, oldRow, newRow) => {
          const before = normalize(oldRow) as Tables[T];
          const after = normalize(newRow) as Tables[T];
          if (fingerprint(before) === fingerprint(after)) return;
          deliver(table, () => callback(before, after));
        };
        cache.onUpdate(listener);
        const stop = () => {
          cache.removeOnUpdate(listener);
          stops.delete(stop);
        };
        stops.add(stop);
        return stop;
      },
      onDelete<T extends TableName>(table: T, callback: (row: Tables[T]) => void): Unsubscribe {
        const cache = cached(conn, table);
        // Only deletes a transaction made; nothing here unsubscribes.
        const listener: RowListener = (ctx, row) => {
          if (ctx.event.tag !== 'Reducer' && ctx.event.tag !== 'Transaction') return;
          deliver(table, () => callback(normalize(row) as Tables[T]));
        };
        cache.onDelete(listener);
        const stop = () => {
          cache.removeOnDelete(listener);
          stops.delete(stop);
        };
        stops.add(stop);
        return stop;
      },
      disconnect() {
        for (const stop of [...stops]) stop();
        if (live.open) {
          live.open = false;
          lives.delete(live);
          conn.disconnect();
          wakeWaiters();
        }
      },
    };
  }

  return {
    connect({ token } = {}): Promise<Connection> {
      return new Promise<Connection>((resolve, reject) => {
        let conn: DbConnection | undefined;
        let live: Live | undefined;
        let finished = false;
        const fail = (error: unknown) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          if (live) live.open = false;
          conn?.disconnect();
          const why = error instanceof Error ? error.message : String(error);
          reject(new Error(`db: could not connect to ${databaseName} at ${uri}: ${why}`));
        };
        const timer = setTimeout(() => fail(new Error(`no answer in ${CONNECT_TIMEOUT_MS} ms`)), CONNECT_TIMEOUT_MS);

        conn = DbConnection.builder()
          .withUri(uri)
          .withDatabaseName(databaseName)
          .withToken(token)
          .onConnect((connected, identity, newToken) => {
            const current: Live = { conn: connected, open: true, maxLogId: -1n };
            live = current;
            watch(current);
            connected
              .subscriptionBuilder()
              .onApplied(() => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                lives.add(current);
                resolve(connection(current, identity.toHexString(), newToken));
              })
              .onError((ctx) => fail(ctx.event ?? new Error('the subscription was refused')))
              .subscribe(TABLES.map((table) => tables[table]));
          })
          .onConnectError((_ctx, error) => fail(error))
          .onDisconnect(() => {
            if (!live?.open) return;
            live.open = false;
            lives.delete(live);
            wakeWaiters();
          })
          .build();
      });
    },

    // Over the network "settled" means: every action this process sent has
    // resolved (so its own connection applied the rows and ran callbacks),
    // and every open connection has received every transaction any of them
    // has seen. Actions that subscribers start meanwhile are waited for too.
    // Writes from other processes (the web app) are only waited for once
    // one of this Db's connections has seen them.
    async settled(): Promise<void> {
      for (;;) {
        while (inflight.size) await Promise.all([...inflight]);
        await caughtUp();
        if (!inflight.size) return;
      }
    },

    // Transactions applied, summed over this Db's connections (one commit
    // seen by three connections counts three).
    version: () => commits,

    close() {
      for (const live of [...lives]) {
        live.open = false;
        live.conn.disconnect();
      }
      lives.clear();
      wakeWaiters();
    },
  };
}

// ── Contract drift ─────────────────────────────────────────────────────────
// Compile-time check that contract.ts still matches the generated bindings:
// same tables, columns, optional columns and base types (contract string
// unions count as string). A mismatch fails `tsc` and names the culprit.

type Normalized<V> = V extends Identity
  ? string
  : V extends Timestamp
    ? number
    : V extends readonly (infer U)[]
      ? Normalized<U>[]
      : V extends object
        ? { [K in keyof V]: Normalized<V[K]> }
        : V;
type Shape<V> = V extends string
  ? 'string'
  : V extends number
    ? 'number'
    : V extends boolean
      ? 'boolean'
      : V extends bigint
        ? 'bigint'
        : V extends readonly (infer U)[]
          ? ['array', Shape<U>]
          : V extends object
            ? { [K in keyof V]-?: [undefined extends V[K] ? 'optional' : 'required', Shape<Exclude<V[K], undefined>>] }
            : 'unknown';
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type GeneratedRow<T extends TableName> = DbConnection['db'][T] extends { iter(): Iterator<infer Row> } ? Row : never;
type RowDrift = { [T in TableName]: Same<Shape<Tables[T]>, Shape<Normalized<GeneratedRow<T>>>> extends true ? never : T }[TableName];

type ReducerDef = (typeof reducers)[keyof typeof reducers];
type GeneratedArgs<A> = Normalized<Infer<Extract<ReducerDef, { name: A }>['params']>>;
type ContractArgs<A extends ActionName> = string extends keyof Actions[A] ? {} : Actions[A];
type ActionDrift =
  | Exclude<ActionName, ReducerDef['name']>
  | Exclude<ReducerDef['name'], ActionName>
  | { [A in ActionName]: Same<Shape<ContractArgs<A>>, Shape<GeneratedArgs<A>>> extends true ? never : A }[ActionName];

const contractMatchesBindings: [RowDrift | ActionDrift] extends [never] ? true : RowDrift | ActionDrift = true;
void contractMatchesBindings;
