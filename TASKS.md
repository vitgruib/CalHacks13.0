# Tasks

Claim before you start: move the task to *In progress*, tag `@human/agent`,
list the files/dirs you'll touch, then commit + push the claim on its own.
Pick work in the order from `AGENTS.md` §1 (unblock others first). See §2
for claiming. One claimed task per agent.

Task format:
`- [ ] T<id> ★? [lane] title — needs: T<id>,… | — — done when: <checkable>`
(★ = on the critical path to the demo. Ready = all `needs` done or stubbed.)

## Lanes
| Lane | Owner | Owns dirs/files |
| --- | --- | --- |
| A: db (database, rules, shared contract, deploy) | @suhu | `server/`, `deploy/` |
| B: agents (agent worker, government data readers) | @nathan | `agents/` |
| C: app (windows, test data, scraper, scorecard) | @ethan | `web/`, `sim/`, `eval/`, `scrapers/` |

Scope, features and kickoff prompts: `docs/MASTER-PLAN.md`. The shared
contract is Track A's SpacetimeDB schema and actions in `server/`.
All three tracks are technical only. Presentation and submission work
(video, Devpost, booth, interviews) sits outside the tracks, in
`HUMAN_TODO.md`.

## In progress
- [ ] T19 ★ [app] Answer key + scorecard in the check command — needs: T8 — done when: the check replays the seed and prints caught / missed / false alarms — @ethan/claude — owns: `eval/`, `web/src/windows/TestLab*` (scorecard), `check.sh` (one added line)
- [ ] T10 ★ [agents] Source reader: RePORTER + USAspending by grant ID, daily / check now / before money moves — needs: T3 (stub ok) — done when: real IDs return readings; a change posts a status event; disagreeing sources (including T15's scraper readings) post a flag — @nathan/claude — owns: `agents/` — stubbed: Track A contract (readings, status events, flags, check requests added to `agents/src/db/stub.ts`)
- [ ] T23 [hero] Five 3D hero-dashboard mockups (lab of researchers ↔ network of finance agents; requests flow out, bought / rerouted / blocked / held flow back) on one localhost gallery — needs: — — done when: `npm --prefix hero run dev` shows all 5 switchable, each driven by one shared scripted feed shaped like the `request`/`hold`/`status_event` tables; humans pick one to port into `web/` with @ethan — @nathan/claude-hero (own clone) — owns: `hero/` (new top-level dir, no lane owns it) — stubbed: live data (scripted feed; SpacetimeDB adapter later)
<!-- - [ ] T7 ★ [api] extract endpoint — @alex/claude — owns: `app/api/extract/` — stubbed: LLM call -->

## Up next (priority order)
- [ ] T4 ★ [all] Thin end-to-end demo path on stubs — needs: T3, T9, T16 — done when: a request submitted in the UI shows a stub agent finding in the Inbox and a Log row
- [ ] T11 ★ [agents] Purchasing agent — needs: T6 (stub ok) — done when: a typed request gets a grant, a rule verdict and an explanation citing the rule; unclear or over-limit requests go to the Inbox
- [ ] T12 [agents] Invoice check (P4) — needs: T8 (stub ok) — done when: canceled-order and wrong-amount invoices are held with a timeline; the decoy passes
- [ ] T13 [agents] Payment request writer (P5) — needs: T5 (stub ok) — done when: a draft of ≤1,000 characters from purchase records, held items left out; a follow-up answered with exact purchases; both wait in the Inbox
- [ ] T14 [agents] Report checker (P7) — needs: T3 (stub ok) — done when: ~20 cached papers; wrong grant, missing PMCID and undisclosed correction flagged; decoys not flagged; live DOI lookup works
- [ ] T22 ★ [agents] Swap the agent worker's stub DB for Track A's generated SpacetimeDB bindings (`GG_DB=spacetime`) — needs: T3 — done when: `npm --prefix agents run demo` passes against the local module, 3 identities registered there
- [ ] T15 [app] Apify scraper for cancellation lists, in `scrapers/`; posts status readings through Track A's action — needs: T3 (stub ok) — done when: a scraper run posts readings for the lab's grant IDs, and T10 picks them up
- [ ] T21 [db] Deploy: publish the module to hosted SpacetimeDB and host the web build, in `deploy/` — needs: T7, T17 — done when: a public URL runs the demo path from a fresh browser, and the URL is in README.md — part 1 done (@ethan/claude-a): module live on maincloud as `grantguard` (`wss://maincloud.spacetimedb.com`, republish with `deploy/publish-module.sh`); left: host the web build once T17 connects it

## Outside the tracks (unassigned; not for track agents)
- [ ] T20 [submission] Demo script, backup video, Devpost draft — needs: T17 — done when: Devpost draft up by Sat 10 PM — drafts done in `docs/submission/` (DEVPOST-DRAFT, DEMO-SCRIPT, INTERVIEW-KIT); left: fill `[TBD]`/`[needs Tn]` once T17/T19 land, paste into Devpost, record video

## Requests (cross-lane asks / blockers)
- @ethan/claude → Track A (server): `recomputeGrant` replays same-day events in index order, not id order, so a payment and a cancel on the same simulated day can resolve the wrong way (seen: cancel ignored, then applied after a fast-forward). Suggest sorting events by id before `freezeState`. Also: `load_seed` skips already-decided seed holds, so the Inbox "Decided" list starts empty on live data.
- @nathan → @suhu/claude (for T3): the agent worker codes against `agents/src/db/contract.ts`. Please include (your names win; tell me and I'll adapt): an `agents` table (identity, role) and `register_agent(role)` that binds the caller's identity to one role, once; `submit_request` (people only); `raise_hold(kind, ref_id, grant_id, title, why, evidence)` into a `holds` table (agents only; the Inbox; same shape as Track C's `Hold` in `web/src/data/types.ts`); a `log` row from every action. Reducers can't return values to clients, so rule verdicts (T6) need to land in a row the agent can read. For T10 I'll post `post_source_reading(grant_id, source, status, amounts, fetched_at, url)`; say whether the module or the agent derives status events and flags from readings.
  - @ethan/claude-a → @nathan (T3 landed, names in `server/src/index.ts`): `register_agent(role)` with roles `purchasing|bookkeeping|payment_report`, one identity per role, once ✓; `submit_request` people only ✓; `raise_hold(kind, refId, grantId?, title, why, evidence[{label,value}], options[])` agents only ✓; a log row from every action ✓. Verdicts: purchasing calls `evaluate_request(requestId, grantId?, split[])` and reads `request.verdicts`, then `act_on_request(requestId, buy|reroute|hold|block, grantId?, vendor, explanation)` (buy is refused unless every rule passes). Readings: `post_source_reading(grantId, source, status?, awarded?, paid?, endDate?, url)`; the module stamps the day and time, so no fetched_at. **The agent derives** status events (`post_status_event`) and flags (`raise_flag`) from readings; the module recomputes the freeze and auto-raises the Inbox item for a `sources_disagree` flag, a held invoice (`check_invoice`), a held purchase, a payment request and a held paper. Bindings: `spacetimedb generate` output imports `spacetimedb` without file extensions, so `agents/` needs the `spacetimedb` 2.13.0 dependency plus `moduleResolution: Bundler` (or excluding `src/module_bindings` from tsc) before `npm --prefix server run generate` writes them; the script skips `agents/` until the dependency is there. Same for `web/` (T17).
<!-- - @alex → contracts lane: need optional `score` on Result (blocks T9) -->

## Done
- [x] T17 ★ [app] Live updates + Inbox actions — needs: T7 (stub ok) — done when: an Inbox decision (reason required) calls an action and every window updates live — @ethan/claude — owns: `web/` (adds `spacetimedb` 2.13.0 + `web/src/module_bindings/`) — live by default (`VITE_BACKEND`), falls back to local seed with an "Offline demo data" badge
- [x] T18 ★ [app] Test lab: drop in events + fast-forward clock — needs: T3 (stub ok) — done when: cancellation, court order, payment and bad invoice can be injected from the UI — @ethan/claude — owns: `web/src/windows/TestLab*`, `web/src/data/store.tsx` — on the local store; T17 swaps to the reducers
- [x] T3 ★ [db] Shared contract: tables + actions + fixtures for 2 grants — @ethan/claude-a (covering Track A for @suhu) — `server/src/schema.ts` (20 tables), `server/src/index.ts` (27 actions + init), fixtures = web's 2-grant set; published to local SpacetimeDB 2.13.0 (`npm --prefix server run dev`), `load_seed` takes `sim/seed.json` as-is; bindings are generated per client once that package depends on `spacetimedb` (see Requests)
- [x] T5 ★ [db] Fund tracker math + freeze rule — @ethan/claude-a — landed with T3 (`server/src/rules.ts` `freezeState`, `recomputeGrant` in index.ts); tests: court order stays frozen, payment unfreezes, payment before cancel doesn't
- [x] T6 ★ [db] Spending rules + hard limits — @ethan/claude-a — landed with T3: 6 rules with audit cases, each planted case + decoy tested; buy refused unless every rule passes (rechecked in the action); nobody approves their own request; agents can't decide
- [x] T7 ★ [db] Approval gate + log — @ethan/claude-a — landed with T3: `decide_hold` (grant manager only, reason required) → recheck → act per kind; every action writes a log row (tested)
- [x] T8 [app] Fake university data with planted mistakes (MASTER-PLAN §3), in `sim/` — needs: T3 (stub ok) — done when: seed loads orders, invoices, approvals and payroll with every planted mistake and decoy — @ethan/claude — owns: `sim/`, `web/src/data/` — `node sim/validate.mjs`; T3 loader still to wire (server has `load_seed`)
- [x] T2 ★ [db] Pin SpacetimeDB version, pick module language, scaffold + run script + check command — needs: — — done when: fresh clone runs and check passes; version and language in AGENTS.md §0 and DECISIONS.md — @ethan/claude-a — 2.13.0, TypeScript, `./check.sh`, `npm --prefix server run dev`; left: run script not yet tried against a real CLI (not installed on this machine)
- [x] T16 ★ [app] The 8 windows on fixture data (MASTER-PLAN §4) — needs: T3 (stub ok) — done when: every window renders fixtures; only the Inbox has decision buttons — @ethan/claude — owns: `web/` — on local fixtures; swap to T3 bindings in T17
- [x] T9 ★ [agents] Worker with one identity per agent + stub agent — @nathan/claude — on the in-memory stub (`agents/src/db/stub.ts`): 3 agents register as separate identities, keep them across restarts, and the stub agent raises a hold (Inbox item) per request plus log rows; 8 tests in `npm --prefix agents run check`. Real SpacetimeDB connection is T22
- [x] T1 ★ [all] Fill in AGENTS.md §0 + Lanes table — @nathan/claude — product, demo path and contract filled; stack version, run and check commands come with T2
