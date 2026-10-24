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
| A: db (database, rules, shared contract) | @suhu | `server/`, `sim/` |
| B: agents (agent worker, outside data) | @nathan | `agents/` |
| C: web (windows, test lab, scorecard, pitch) | @ethan | `web/`, `eval/` |

Scope, features and kickoff prompts: `docs/MASTER-PLAN.md`. The shared
contract is Track A's SpacetimeDB schema and actions in `server/`.

## In progress
<!-- - [ ] T7 ★ [api] extract endpoint — @alex/claude — owns: `app/api/extract/` — stubbed: LLM call -->

## Up next (priority order)
- [ ] T2 ★ [db] Pin SpacetimeDB version, pick module language, scaffold + run script + check command — needs: — — done when: fresh clone runs and check passes; version and language in AGENTS.md §0 and DECISIONS.md
- [ ] T3 ★ [db] Shared contract: tables + action stubs + fixtures for 2 grants (MASTER-PLAN §6 Track A) — needs: T2 — done when: B and C can call the stubs and read fixture data
- [ ] T4 ★ [all] Thin end-to-end demo path on stubs — needs: T3, T9, T16 — done when: a request submitted in the UI shows a stub agent finding in the Inbox and a Log row
- [ ] T5 ★ [db] Fund tracker math + freeze rule — needs: T3 — done when: truly available = awarded − spent − promised per grant; a cancellation freezes spending, a court order doesn't unfreeze it, a payment does
- [ ] T6 ★ [db] Spending rules + hard limits (MASTER-PLAN §2, §3.2) — needs: T3 — done when: each rule rejects its planted case and passes its decoy; self-approval and agent self-approval are rejected
- [ ] T7 ★ [db] Approval gate + log — needs: T3 — done when: hold → decide (approve / reject / override, reason required) → recheck → act; every action writes a log row
- [ ] T8 [db] Fake university data with planted mistakes (MASTER-PLAN §3) — needs: T3 — done when: seed loads orders, invoices, approvals and payroll with every planted mistake and decoy
- [ ] T9 ★ [agents] Worker with one identity per agent + stub agent — needs: T3 (stub ok) — done when: 3 agents connect as separate identities; the stub posts a finding through an action
- [ ] T10 ★ [agents] Source reader: RePORTER + USAspending by grant ID, daily / check now / before money moves — needs: T3 (stub ok) — done when: real IDs return readings; a change posts a status event; disagreeing sources post a flag
- [ ] T11 ★ [agents] Purchasing agent — needs: T6 (stub ok) — done when: a typed request gets a grant, a rule verdict and an explanation citing the rule; unclear or over-limit requests go to the Inbox
- [ ] T12 [agents] Invoice check (P4) — needs: T8 (stub ok) — done when: canceled-order and wrong-amount invoices are held with a timeline; the decoy passes
- [ ] T13 [agents] Payment request writer (P5) — needs: T5 (stub ok) — done when: a draft of ≤1,000 characters from purchase records, held items left out; a follow-up answered with exact purchases; both wait in the Inbox
- [ ] T14 [agents] Report checker (P7) — needs: T3 (stub ok) — done when: ~20 cached papers; wrong grant, missing PMCID and undisclosed correction flagged; decoys not flagged; live DOI lookup works
- [ ] T15 [agents] Apify scraper for cancellation lists → T10 — needs: T10 — done when: a scraper run produces status readings for the lab's grant IDs
- [ ] T16 ★ [web] The 8 windows on fixture data (MASTER-PLAN §4) — needs: T3 (stub ok) — done when: every window renders fixtures; only the Inbox has decision buttons
- [ ] T17 ★ [web] Live updates + Inbox actions — needs: T7 (stub ok) — done when: an Inbox decision (reason required) calls an action and every window updates live
- [ ] T18 ★ [web] Test lab: drop in events + fast-forward clock — needs: T3 (stub ok) — done when: cancellation, court order, payment and bad invoice can be injected from the UI
- [ ] T19 ★ [web] Answer key + scorecard in the check command — needs: T8 — done when: the check replays the seed and prints caught / missed / false alarms
- [ ] T20 [web] Demo script, backup video, Devpost draft — needs: T17 — done when: Devpost draft up by Sat 10 PM

## Requests (cross-lane asks / blockers)
<!-- - @alex → contracts lane: need optional `score` on Result (blocks T9) -->

## Done
- [x] T1 ★ [all] Fill in AGENTS.md §0 + Lanes table — @nathan/claude — product, demo path and contract filled; stack version, run and check commands come with T2
