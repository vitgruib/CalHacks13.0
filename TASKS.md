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
| contracts | TBD | TBD (shared contracts file(s), fixtures, stubs) |
| TBD | TBD | TBD |

## In progress
<!-- - [ ] T7 ★ [api] extract endpoint — @alex/claude — owns: `app/api/extract/` — stubbed: LLM call -->

## Up next (priority order)
- [ ] T1 ★ [all] Fill in AGENTS.md §0 + Lanes table — needs: — — done when: no TBDs left (humans, at kickoff)
- [ ] T2 ★ [contracts] Scaffold project + run script + check command — needs: T1 — done when: fresh clone runs and check passes
- [ ] T3 ★ [contracts] Shared contracts + fixtures + stubs — needs: T1 — done when: every lane can import the types and get fixture data from the stubs
- [ ] T4 ★ [all] Thin end-to-end demo path on stubs — needs: T2, T3 — done when: demo path clicks through with fake data

## Requests (cross-lane asks / blockers)
<!-- - @alex → contracts lane: need optional `score` on Result (blocks T9) -->

## Done
