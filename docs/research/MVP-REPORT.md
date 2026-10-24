# MVP report: pain points → features

2026-10-23. **The build list now lives in `docs/FEATURES.md`** (F1–F6 below
are folded into its P/B features). Built from the pain points in `pain-points/` (weak ones moved to
`cut/`). Product and scope calls here are **recommendations for the humans**,
not decisions; record anything adopted in `DECISIONS.md`.

## The pitch in one line

An autonomous **post-award grant office** for a university research lab:
seats that buy lab supplies within grant rules, keep the grant books
reconciled across sources that disagree, and file the government's
drawdown paperwork, explaining every call and asking a human when it should.

**Seats it fills (Hyphenate's "one line"):** grant accountant
(reconciliation), purchasing/P-card reconciler, drawdown preparer.

This fits Hyphenate's brief almost word for word:

| Hyphenate "what makes it hard" | Our evidence |
|---|---|
| Sources that disagree | RePORTER vs TAGGS vs USAspending vs the lab's own ledger disagree (01, 06) |
| Time ("March should change June") | Terminations reversed by courts (02); purchases in an award's last 90 days are disallowed (08) |
| Working with others / controller says no | PI requests, grant office approves; HHS "Defend the Spend" questions come back (10) |
| Limits / segregation of duties | Requester ≠ approver on purchases and drawdowns; per-grant card limits |
| Explainable and accountable | Every flag cites the rule (2 CFR 200, NIH GPS 6.1) or audit precedent behind it |

## Pain points kept

| # | Pain point | Evidence strength | In MVP? |
|---|---|---|---|
| 01 | No single source of truth for grant status | strong, verified | **yes** |
| 02 | Status reversed by courts | strong, verified | **yes** |
| 06 | Awarded ≠ paid; frozen funds | strong, verified | **yes** |
| 07 | PIs can't see trustworthy balances | strong (FDP survey) | **yes** |
| 08 | Unallowable / end-of-award / P-card purchases fail audits | strong (NSF-OIG audits) | **yes** (core) |
| 10 | Every drawdown needs a written justification | strong (COGR, NIH GPS) | **yes** (core) |
| 09 | Finance-system rollouts break purchasing/billing | medium | supporting story only |
| 04 | Foundation data stale, no lab named | strong | post-MVP |
| 05 | Foundation dollar ≠ federal dollar | facts strong, quotes weak | post-MVP |
| 03 | Stranded clinical trials | strong (JAMA) | stretch |

## MVP features (build these)

### F1. Purchase guardrails at checkout ★ (pain 08, 07)
The purchasing seat takes a request ("2× 500 mL ethanol on R01-123"), picks
the grant, and checks before paying:
- category allowed / not excluded (radioactive, select agents, animals, office supplies);
- grant has balance; purchase ≤ card threshold (else route to PO + human);
- **not in the award's last 90 days** (NSF-OIG's own recommendation);
- purpose + grant code recorded now, not at month-end;
- shared items split across grants with a recorded allocation.
Every decline or escalation cites the rule and an audit precedent
(e.g. WVU: $17,335 disallowed for end-of-award supplies).

### F2. Live per-grant ledger and balance (pain 06, 07)
For each grant: awarded, obligated, paid out by the agency, spent by the lab,
committed (pending orders), remaining runway. Built from our own purchase
records so it doesn't depend on the university ERP (pain 09).

### F3. Multi-source reconciliation with disagreements shown (pain 01, 06)
Pull the same grant from NIH RePORTER, USAspending and (simulated) university
ERP; line up obligations/outlays/status; flag where they disagree and say
which source the system acted on and why. Never silently pick one.

### F4. Status timeline, not a status field (pain 02)
Events: awarded → terminated → court-ordered reinstatement → funds actually
disbursed, each with its source. The system changes behaviour when status
changes (freeze purchasing on termination, resume on *disbursement*, not on
the court order).

### F5. Auto-drafted drawdown justification ★ (pain 10)
From the ledger, the drawdown seat drafts the ≤1,000-character PMS
justification by budget category and date range, and answers a "Defend the
Spend" follow-up with the exact transactions behind it. A human approves
before submission (segregation of duties: the seat that bought can't
approve the draw).

### F6. Audit trail
Every action: who/which seat, inputs, rule applied, source cited, human
approval. This is what "defends a decision when questioned" in the demo.

## The demo moment (Hyphenate criterion 4)
Pick one, both are grounded in real audit findings:
1. **Catches what others missed:** an agent-proposed equipment buy lands 40
   days before the award ends; the system blocks it, cites the NSF-OIG
   finding and 2 CFR 200, and offers to route it to a grant with time left.
2. **Defends a decision:** HHS sends a Defend the Spend question about a
   draw; the system answers with the line items, grant, dates and receipts
   in seconds, where COGR members report "dozens" of these taking staff time.

## Proof it works (Hyphenate wants "planted errors with an answer key")
Build the test set from **real audit finding types** so the answer key isn't
invented:
| Planted error | Real precedent |
|---|---|
| Supplies bought in last 90 days | WVU (OIG 22-1-010), Delaware (OIG 19-1-011) |
| Restocking with no usage record | NSF-OIG capstone 22-6-002 |
| Charge on wrong grant, corrected late (>90 days) | WashU Single Audit 2023-001 |
| Unallowable P-card item | UC Davis (OIG 17-1-002) |
| Shared cost charged 100% to one grant | NSF-OIG capstone (55% of audits) |
| Grant shown active in one source, terminated in another | Grant Witness RePORTER/TAGGS mismatches |
Report: errors caught / missed / false alarms.

## Real vs simulated
- **Real:** NIH RePORTER + USAspending data for real grants (seed the
  company with an actual lab's awards); Claude for request parsing,
  justification drafting and explanations; Stripe Issuing **test mode** for
  per-order virtual cards, live approve/decline webhooks and itemized
  receipts (see `visa-pipeline.md`).
- **Simulated:** supplier catalog, university ERP feed, HHS PMS / Defend the
  Spend inbox, court-order events.

## How it hits the other kept tracks
- **Apify:** real public data. Scrape Grant Witness / agency termination
  lists or supplier info as an Actor feeding F3/F4.
- **Anthropic:** named community = university research administrators and
  PIs. We have their words (FDP survey, COGR, UC Senate, quotes in
  `pain-points/`), but the track wants an interview: talk to one real
  research administrator or PI this weekend. Document failure modes
  (wrong grant chosen, hallucinated justification → human approval gate).
- **SpacetimeDB:** ledger, rules, audit trail and seat identities in one
  store, with segregation of duties enforced server-side.

## Post-MVP (in priority order)
1. Funder X-ray / replacement funding matching from 990 data (pain 04),
   with direct-cost comparison (pain 05).
2. Stranded-trial rescue (pain 03).
3. Real Visa Intelligent Commerce mandates if a sponsor provides credentials.

## Open questions for the humans
1. **Visa:** `DECISIONS.md` records the Visa track as **cut**, but Visa-style
   automated purchasing is now central. Options: (a) reinstate the Visa
   track (log it in `DECISIONS.md`), or (b) keep purchasing but run it on
   Stripe test mode and don't enter Visa. Recommended: (b) unless the Visa
   track's prize structure is worth it; the build is the same either way.
2. **Company choice:** a real university lab seeded with real NIH grants, or
   a fictional institute using real grant data? Recommended: a fictional lab
   using real public grant records, so we can plant errors freely.
3. **Who interviews** a research administrator or PI for the Anthropic track.
