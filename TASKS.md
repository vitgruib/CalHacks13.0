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
- [ ] T3 ★ [db] Shared contract: tables + action stubs + fixtures for 2 grants (MASTER-PLAN §6 Track A) — needs: T2 — done when: B and C can call the stubs and read fixture data — @ethan/claude-a (covering Track A for @suhu) — owns: `server/`
- [ ] T8 [app] Fake university data with planted mistakes (MASTER-PLAN §3), in `sim/` — needs: T3 (stub ok) — done when: seed loads orders, invoices, approvals and payroll with every planted mistake and decoy — @ethan/claude — owns: `sim/`, `web/src/data/` — stubbed: Track A contract (seed is JSON shaped like `web/src/data/types.ts`; T3 loader comes when the contract lands)
- [ ] T10 ★ [agents] Source reader: RePORTER + USAspending by grant ID, daily / check now / before money moves — needs: T3 (stub ok) — done when: real IDs return readings; a change posts a status event; disagreeing sources (including T15's scraper readings) post a flag — @nathan/claude — owns: `agents/` — stubbed: Track A contract (readings, status events, flags, check requests added to `agents/src/db/stub.ts`)
<!-- - [ ] T7 ★ [api] extract endpoint — @alex/claude — owns: `app/api/extract/` — stubbed: LLM call -->

## Up next (priority order)
- [ ] T4 ★ [all] Thin end-to-end demo path on stubs — needs: T3, T9, T16 — done when: a request submitted in the UI shows a stub agent finding in the Inbox and a Log row
- [ ] T5 ★ [db] Fund tracker math + freeze rule — needs: T3 — done when: truly available = awarded − spent − promised per grant; a cancellation freezes spending, a court order doesn't unfreeze it, a payment does
- [ ] T6 ★ [db] Spending rules + hard limits (MASTER-PLAN §2, §3.2) — needs: T3 — done when: each rule rejects its planted case and passes its decoy; self-approval and agent self-approval are rejected
- [ ] T7 ★ [db] Approval gate + log — needs: T3 — done when: hold → decide (approve / reject / override, reason required) → recheck → act; every action writes a log row
- [ ] T11 ★ [agents] Purchasing agent — needs: T6 (stub ok) — done when: a typed request gets a grant, a rule verdict and an explanation citing the rule; unclear or over-limit requests go to the Inbox
- [ ] T12 [agents] Invoice check (P4) — needs: T8 (stub ok) — done when: canceled-order and wrong-amount invoices are held with a timeline; the decoy passes
- [ ] T13 [agents] Payment request writer (P5) — needs: T5 (stub ok) — done when: a draft of ≤1,000 characters from purchase records, held items left out; a follow-up answered with exact purchases; both wait in the Inbox
- [ ] T14 [agents] Report checker (P7) — needs: T3 (stub ok) — done when: ~20 cached papers; wrong grant, missing PMCID and undisclosed correction flagged; decoys not flagged; live DOI lookup works
- [ ] T22 ★ [agents] Swap the agent worker's stub DB for Track A's generated SpacetimeDB bindings (`GG_DB=spacetime`) — needs: T3 — done when: `npm --prefix agents run demo` passes against the local module, 3 identities registered there
- [ ] T15 [app] Apify scraper for cancellation lists, in `scrapers/`; posts status readings through Track A's action — needs: T3 (stub ok) — done when: a scraper run posts readings for the lab's grant IDs, and T10 picks them up
- [ ] T17 ★ [app] Live updates + Inbox actions — needs: T7 (stub ok) — done when: an Inbox decision (reason required) calls an action and every window updates live
- [ ] T18 ★ [app] Test lab: drop in events + fast-forward clock — needs: T3 (stub ok) — done when: cancellation, court order, payment and bad invoice can be injected from the UI
- [ ] T19 ★ [app] Answer key + scorecard in the check command — needs: T8 — done when: the check replays the seed and prints caught / missed / false alarms
- [ ] T21 [db] Deploy: publish the module to hosted SpacetimeDB and host the web build, in `deploy/` — needs: T7, T17 — done when: a public URL runs the demo path from a fresh browser, and the URL is in README.md

## Outside the tracks (unassigned; not for track agents)
- [ ] T20 [submission] Demo script, backup video, Devpost draft — needs: T17 — done when: Devpost draft up by Sat 10 PM — drafts done in `docs/submission/` (DEVPOST-DRAFT, DEMO-SCRIPT, INTERVIEW-KIT); left: fill `[TBD]`/`[needs Tn]` once T17/T19 land, paste into Devpost, record video

## Requests (cross-lane asks / blockers)
- @nathan → @suhu/claude (for T3): the agent worker codes against `agents/src/db/contract.ts`. Please include (your names win; tell me and I'll adapt): an `agents` table (identity, role) and `register_agent(role)` that binds the caller's identity to one role, once; `submit_request` (people only); `raise_hold(kind, ref_id, grant_id, title, why, evidence)` into a `holds` table (agents only; the Inbox; same shape as Track C's `Hold` in `web/src/data/types.ts`); a `log` row from every action. Reducers can't return values to clients, so rule verdicts (T6) need to land in a row the agent can read. For T10 I'll post `post_source_reading(grant_id, source, status, amounts, fetched_at, url)`; say whether the module or the agent derives status events and flags from readings.
<!-- - @alex → contracts lane: need optional `score` on Result (blocks T9) -->

## Done
- [x] T2 ★ [db] Pin SpacetimeDB version, pick module language, scaffold + run script + check command — needs: — — done when: fresh clone runs and check passes; version and language in AGENTS.md §0 and DECISIONS.md — @ethan/claude-a — 2.13.0, TypeScript, `./check.sh`, `npm --prefix server run dev`; left: run script not yet tried against a real CLI (not installed on this machine)
- [x] T16 ★ [app] The 8 windows on fixture data (MASTER-PLAN §4) — needs: T3 (stub ok) — done when: every window renders fixtures; only the Inbox has decision buttons — @ethan/claude — owns: `web/` — on local fixtures; swap to T3 bindings in T17
- [x] T9 ★ [agents] Worker with one identity per agent + stub agent — @nathan/claude — on the in-memory stub (`agents/src/db/stub.ts`): 3 agents register as separate identities, keep them across restarts, and the stub agent raises a hold (Inbox item) per request plus log rows; 8 tests in `npm --prefix agents run check`. Real SpacetimeDB connection is T22
- [x] T1 ★ [all] Fill in AGENTS.md §0 + Lanes table — @nathan/claude — product, demo path and contract filled; stack version, run and check commands come with T2
