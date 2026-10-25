# agents/ (Track B)

The agent worker: the three GrantGuard agents (`docs/MASTER-PLAN.md` §2),
each connected to the database with its own identity. Agents only change
data by calling Track A's actions; rules and money math live in Track A's
code (`server/`). Claude reads, matches and explains; every Claude call has
a deterministic fallback, so the agents also run with no key.

## Run

```
npm --prefix server install     # the in-process database runs server/src
npm --prefix agents install
npm --prefix agents run check   # typecheck + tests (Claude off, no network)
npm --prefix agents run demo    # the sim world, end to end, in this process
npm --prefix agents start       # keep the worker running

# Against a SpacetimeDB server (npm --prefix server run dev publishes grantguard locally):
GG_DB=spacetime npm --prefix agents run demo
GG_SPACETIME_IT=1 npm --prefix agents run test:spacetime   # publishes a throwaway database, then deletes it
```

Node 22.4 or later.

## Layout

| Path | What it is |
|---|---|
| `src/roles.ts` | The three agents and their seats |
| `src/db/contract.ts` | Track A's tables and actions as the agents see them (mirrors `server/src/schema.ts`; `test/contract.test.ts` fails on drift) |
| `src/db/local.ts` | Track A's real module in this process, on SpacetimeDB's test datastore: tests and the offline demo |
| `src/db/spacetime.ts` | The same `Db` over a websocket to a SpacetimeDB server, through `src/module_bindings/` (generated) |
| `src/identity.ts` | Agent tokens: on disk for a server (roles bind to identities once), in memory for the local world |
| `src/worker.ts` | Connects the three agents and starts their loops; `idle()` waits until nobody has anything left to do |
| `src/sim.ts` | `runSim()`: the sim world played to quiet, every table returned (for the T19 scorecard) |
| `src/agents/bookkeeping.ts` | Fund tracker: reads sources on "check now" and before money moves (no timer; demo time via `request_check` asOf); flags disagreements, spending while canceled, and court orders without money |
| `src/agents/purchasing.ts` | Purchasing agent (T11) |
| `src/agents/invoices.ts` | Invoice check (T12), bookkeeping identity |
| `src/agents/payment-requests.ts` | Payment request writer (T13), payment and report identity |
| `src/agents/report-checker.ts` | Report checker (T14), payment and report identity |
| `src/tracker/compare.ts` | What counts as a change, which changes become status events, when sources disagree |
| `src/claude.ts` | `ask()`: one structured Claude call with a saved answer and a fallback |
| `src/sources/` | RePORTER, USAspending, the cancellation list (T15's scraper output), Crossref/PubMed papers, and the saved-copy HTTP helper |

## Environment

Keys and settings are read from the repo root's `.env.local` (git-ignored).

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Claude. Without it every call uses its fallback |
| `GG_CLAUDE` | `cached` | `cached` = saved answer, else ask Claude and save it. `live` = always ask. `offline` = saved answers only. `off` = fallbacks only (tests) |
| `GG_MODEL` | `claude-sonnet-5-5` | Model for agent calls |
| `GG_REUSE_SAVED` | unset | `1`: with `GG_MODEL` set, cached/offline modes use the default model's saved answer when the new model has none |
| `GG_CLAUDE_CACHE_DIR` | `agents/cache/claude` | Saved Claude answers (committed, so the demo works offline) |
| `GG_DB` | `local` | `local` = the module in this process on `sim/seed.json`. `spacetime` = a SpacetimeDB server |
| `GG_SPACETIME_URI` | `ws://127.0.0.1:3000` | Server for `GG_DB=spacetime` |
| `GG_SPACETIME_DB` | `grantguard` | Database name for `GG_DB=spacetime` |
| `GG_STATE_DIR` | `agents/.state` | Where agent tokens are saved, per database. Tokens are credentials; git-ignored |
| `GG_LIVE_SOURCES` | off | `1` = `npm start` reads RePORTER, USAspending and the cancellation list for the world's grants |
| `GG_SOURCES` | `live` | `live` = ask the sites, falling back to saved copies. `offline` = saved copies only |
| `GG_CACHE_DIR` | `agents/cache` | Saved copies of every source answer (public data, committed) |
| `GG_CONTACT_EMAIL` | none | Sent to Crossref and NCBI as the contact for their polite-use pools |
| `APIFY_TOKEN`, `GG_APIFY_ACTOR` | none | Read the cancellation list from the Actor's latest successful run; Check now starts a fresh run first (token sent as a header, never saved) |
| `GG_APIFY_DATASET` | none | Pin one Apify dataset instead (overrides `GG_APIFY_ACTOR`) |
| `GG_CANCELLATIONS_FILE` | `scrapers/out/cancellations.json` | Or read it from a file the scraper wrote |

Test-only: `GG_SPACETIME_IT`, `GG_SPACETIME_CLI`, `GG_SPACETIME_CLI_SERVER` (see `test/spacetime.test.ts`).
