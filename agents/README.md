# agents/ (Track B)

The agent worker: the three GrantGuard agents (`docs/MASTER-PLAN.md` §2),
each connected to the database with its own identity. Agents only change
data by calling Track A's actions; rules and money math live in Track A's
code (`server/`).

## Run

```
npm --prefix agents install
npm --prefix agents run check   # typecheck + tests
npm --prefix agents run demo    # one scientist request, end to end, on the stub
npm --prefix agents start       # keep the worker running
```

Node 22 or later.

## Layout

| Path | What it is |
|---|---|
| `src/roles.ts` | The three agents and their seats |
| `src/db/contract.ts` | What Track B expects from Track A's contract (stand-in until T3) |
| `src/db/stub.ts` | In-memory stand-in database: identities, actions, log, subscriptions |
| `src/identity.ts` | Saves each agent's token so restarts keep the same identities |
| `src/worker.ts` | Connects the three agents and starts their loops |
| `src/agents/stub-agent.ts` | Placeholder purchasing agent (replaced by T11) |

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `GG_DB` | `stub` | `stub` = in-memory stand-in. `spacetime` = Track A's module (after T3) |
| `GG_STATE_DIR` | `agents/.state` | Where agent tokens are saved. Tokens are credentials; the folder is git-ignored |

## What's stubbed

Track A's contract (T3) hasn't landed, so the worker runs on `src/db/stub.ts`.
The stub mirrors SpacetimeDB where it matters: a token maps to a stable
identity, actions check who is calling, and subscribers hear about rows
only after an action finishes. Agents also handle rows that already exist
when they start (SpacetimeDB replays them on subscribe) and skip work they've
already done. Swapping in the generated bindings is T22.
