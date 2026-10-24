// Track A's real module (server/src), run in this process on SpacetimeDB's
// own in-memory test datastore. Tests and the offline demo get the real
// rules, identities and Inbox, with no server to start. The rows and
// callbacks look the way db/spacetime.ts delivers them from a live server.
//
// Needs server/node_modules (npm --prefix server install).

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ActionError,
  PRIMARY_KEYS,
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

const SERVER = fileURLToPath(new URL('../../../server/', import.meta.url));
export const SIM_SEED = fileURLToPath(new URL('../../../sim/seed.json', import.meta.url));

type Harness = {
  db: Record<string, { iter(): Iterable<Record<string, unknown>> }>;
  clock: { set(timestamp: unknown): void };
  withReducerTx<T>(auth: unknown, body: (ctx: { sender: { toHexString(): string } }) => T): T;
};
interface Runtime {
  createHarness(): Harness;
  auth(subject: string): unknown;
  internal: unknown;
  now(): unknown;
  actions: Record<string, unknown>;
}

let runtime: Promise<Runtime> | undefined;

// The module imports `spacetime:sys@2.x`, the host's syscalls. SpacetimeDB's
// vitest plugin answers those with a stub module; this hook hands Node the
// same stub, taken from the plugin so it stays in step with the SDK.
async function loadRuntime(): Promise<Runtime> {
  const sdk = (path: string) => import(pathToFileURL(`${SERVER}node_modules/spacetimedb/dist/${path}`).href);
  const { spacetimedbModuleTestPlugin } = await sdk('server/test-utils/vitest.mjs');
  const sys = `data:text/javascript,${encodeURIComponent(spacetimedbModuleTestPlugin().load('\0spacetimedb-module-test-sys'))}`;
  registerHooks({
    resolve: (specifier, context, next) =>
      specifier.startsWith('spacetime:sys@2.') ? { url: sys, shortCircuit: true } : next(specifier, context),
  });

  // The SDK swaps the global console for the host's, which the stub drops,
  // so every console.log after the import would vanish. Put ours back.
  const realConsole = globalThis.console;
  const { createModuleTestHarness, TestAuth } = await sdk('server/test-utils/index.mjs');
  const { ConnectionId, Timestamp } = await sdk('index.mjs');
  const schema = (await import(pathToFileURL(`${SERVER}src/schema.ts`).href)).default;
  const actions = await import(pathToFileURL(`${SERVER}src/index.ts`).href);
  globalThis.console = realConsole;

  return {
    createHarness: () => createModuleTestHarness(schema, actions),
    auth: (subject) =>
      TestAuth.fromJwtPayload(
        JSON.stringify({ iss: 'http://grantguard.local', sub: subject, aud: ['spacetimedb'], iat: 0 }),
        ConnectionId.random(),
      ),
    internal: TestAuth.internal(),
    now: () => Timestamp.now(),
    actions,
  };
}

// Identities become hex strings and timestamps milliseconds, as in contract.ts.
function plain(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map(plain);
  const object = value as Record<string, unknown> & { toHexString?: () => string };
  if (typeof object.toHexString === 'function') return object.toHexString();
  if (typeof object.microsSinceUnixEpoch === 'bigint') return Number(object.microsSinceUnixEpoch / 1000n);
  return Object.fromEntries(Object.entries(object).map(([key, inner]) => [key, plain(inner)]));
}

type World = 'fixtures' | 'sim' | { seedJson: string };

export interface LocalDbOptions {
  // fixtures = the module's built-in 2-grant set; sim = sim/seed.json (T8).
  world?: World;
}

export async function createLocalDb({ world = 'sim' }: LocalDbOptions = {}): Promise<Db> {
  runtime ??= loadRuntime();
  const rt = await runtime;
  const harness = rt.createHarness();

  // table → primary key → [fingerprint, row]
  const snapshot = new Map<TableName, Map<string, [string, unknown]>>();
  const inserts = new Map<TableName, Set<(row: never) => void>>();
  const updates = new Map<TableName, Set<(oldRow: never, newRow: never) => void>>();
  let pending: Array<() => void> = [];
  let flushing: Promise<void> | undefined;
  let commits = 0;

  function flush(): Promise<void> {
    flushing ??= new Promise<void>((resolve) => {
      setImmediate(() => {
        // Callbacks can call actions, which queue more callbacks: drain all.
        while (pending.length) {
          const batch = pending;
          pending = [];
          for (const deliver of batch) {
            try {
              deliver();
            } catch (error) {
              console.error('db: a subscriber failed', error);
            }
          }
        }
        flushing = undefined;
        resolve();
      });
    });
    return flushing;
  }

  // After every committed action: compare each table with the last snapshot
  // and queue callbacks, delivered after the action returns (as over the
  // network, subscribers never run inside an action).
  function commit(notify: boolean): void {
    commits++;
    for (const table of TABLES) {
      const key = PRIMARY_KEYS[table];
      const before = snapshot.get(table) ?? new Map<string, [string, unknown]>();
      const after = new Map<string, [string, unknown]>();
      const current = byPrimaryKey(table, [...harness.db[table].iter()].map((raw) => plain(raw) as Record<string, unknown>));
      for (const row of current) {
        const id = String(row[key]);
        const print = fingerprint(row);
        after.set(id, [print, row]);
        if (!notify) continue;
        const old = before.get(id);
        if (!old) {
          for (const callback of inserts.get(table) ?? []) pending.push(() => callback(row as never));
        } else if (old[0] !== print) {
          for (const callback of updates.get(table) ?? []) pending.push(() => callback(old[1] as never, row as never));
        }
      }
      snapshot.set(table, after);
    }
    if (pending.length) void flush();
  }

  function run(auth: unknown, action: string, args: object): void {
    const reducer = rt.actions[action];
    if (typeof reducer !== 'function' || action === 'init') throw new ActionError(action, `The module has no action ${action}.`);
    harness.clock.set(rt.now());
    try {
      harness.withReducerTx(auth, (ctx) => reducer(ctx, args));
    } catch (error) {
      throw new ActionError(action, error instanceof Error ? error.message : String(error));
    }
    commit(true);
  }

  harness.withReducerTx(rt.internal, (ctx) => (rt.actions.init as (c: unknown, a: object) => void)(ctx, {}));
  if (world !== 'fixtures') {
    const seedJson = world === 'sim' ? readFileSync(SIM_SEED, 'utf8') : world.seedJson;
    const lab = rt.auth('test-lab');
    run(lab, 'register_person', { role: 'grant_manager', name: 'Test lab' });
    run(lab, 'load_seed', { json: seedJson });
  }
  commit(false);

  const rows = <T extends TableName>(table: T): Tables[T][] =>
    [...(snapshot.get(table)?.values() ?? [])].map(([, row]) => row as Tables[T]);

  const subscribe = <F>(registry: Map<TableName, Set<F>>, table: TableName, callback: F): Unsubscribe => {
    const set = registry.get(table) ?? new Set<F>();
    registry.set(table, set);
    set.add(callback);
    return () => set.delete(callback);
  };

  return {
    async connect({ token = randomUUID() } = {}): Promise<Connection> {
      const auth = rt.auth(token);
      const identity = harness.withReducerTx(auth, (ctx) => ctx.sender.toHexString());
      const mine = new Set<Unsubscribe>();
      return {
        identity,
        token,
        async call<A extends ActionName>(action: A, args: Actions[A]) {
          run(auth, action, args);
        },
        rows,
        today: () => (rows('clock')[0]?.today ?? '2026-01-01'),
        onInsert(table, callback) {
          const stop = subscribe(inserts, table, callback as (row: never) => void);
          mine.add(stop);
          return stop;
        },
        onUpdate(table, callback) {
          const stop = subscribe(updates, table, callback as (oldRow: never, newRow: never) => void);
          mine.add(stop);
          return stop;
        },
        disconnect() {
          for (const stop of mine) stop();
          mine.clear();
        },
      };
    },
    settled: () => (pending.length || flushing ? flush() : new Promise((resolve) => setImmediate(resolve))),
    version: () => commits,
    close() {
      inserts.clear();
      updates.clear();
    },
  };
}
