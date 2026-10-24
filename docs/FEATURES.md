# GrantGuard product features

The product features for GrantGuard, in priority order. **Agents: read this
before picking or writing a feature task.** Build in priority order: finish
(or stub) a higher-priority feature before starting a lower one. Each
feature has a stable ID (`P1`–`P4`); cite it in task titles and commits,
e.g. `T12 [P1] reconcile open POs`.

For the pain points and evidence behind these features, see
`docs/research/MVP-REPORT.md`. If this file and the MVP report disagree,
raise it with the humans rather than picking one.

## Summary

| ID | Priority | Feature | What it does | Demo wow factor |
| --- | --- | --- | --- | --- |
| P1 | 1 | Commitment-Aware Grant Reconciliation | Reconciles balances, expenses, and outstanding purchase orders to calculate true available funding. | Exposes a grant that looks healthy but is financially overcommitted. |
| P2 | 2 | Autonomous Risk Investigator | Cross-checks grant rules, purchase requests, approval records, and award deadlines to identify risks and explain them with evidence. | Connects scattered clues into one actionable financial case. |
| P3 | 3 | Human Approval & Safe Execution | Routes decisions to the right approver, pauses for a response, and rechecks conditions before taking authorized action. | Demonstrates autonomy with accountability and a complete audit trail. |
| P4 | 4 | 🔥 Cross-System "Impossible Spend" Detective | Detects a purchase that looks acceptable in isolation but becomes problematic when combined with another system's data. Checks records, reconstructs the timeline, and holds the workflow for review. | Every individual record looks plausible, but the combined evidence reveals the problem. |

## P1. Commitment-Aware Grant Reconciliation

- **Priority:** 1
- **What it does:** Reconciles balances, expenses, and outstanding purchase
  orders to calculate true available funding.
- **Inputs:** grant balances, posted expenses, outstanding purchase orders.
- **Output:** true available funding per grant (balance minus what is
  already committed).
- **Demo wow factor:** exposes a grant that looks healthy but is
  financially overcommitted.

## P2. Autonomous Risk Investigator

- **Priority:** 2
- **What it does:** Cross-checks grant rules, purchase requests, approval
  records, and award deadlines to identify risks and explain them with
  evidence.
- **Inputs:** grant rules, purchase requests, approval records, award
  deadlines.
- **Output:** identified risks, each explained with the evidence behind it.
- **Demo wow factor:** connects scattered clues into one actionable
  financial case.

## P3. Human Approval & Safe Execution

- **Priority:** 3
- **What it does:**
  1. Routes the decision to the right approver.
  2. Pauses for a response.
  3. Rechecks conditions before taking the authorized action.
- **Output:** the authorized action, taken only after approval and a
  recheck, with every step recorded in the audit trail.
- **Demo wow factor:** demonstrates autonomy with accountability and a
  complete audit trail.

## P4. 🔥 Cross-System "Impossible Spend" Detective

- **Priority:** 4
- **What it does:** Detects when a purchase appears acceptable in isolation
  but becomes problematic when combined with another system's data. It
  checks records, reconstructs the timeline, and holds the workflow for
  review.
- **Example scenarios:**
  - A vendor invoice matches an approved purchase, but the purchase order
    was canceled.
  - A vendor invoice matches an approved purchase, but the approval applied
    to a different amount.
- **Output:** the workflow is held for review *before* the payment or
  charge proceeds, with an explanation of:
  - exactly which records conflict,
  - what happened (the reconstructed timeline),
  - what evidence is missing.
- **Demo wow factor (the twist):** every individual record looks plausible,
  but the combined evidence reveals the problem. GrantGuard explains exactly
  which records conflict, what happened, and what evidence is missing,
  before the payment or charge proceeds.

---

# Full build list (everything needed to demo P1–P4)

Added 2026-10-23 to put every feature in one place. P1–P4 above are
unchanged. **P5–P6 are proposals** carried over from
`docs/research/MVP-REPORT.md` and need a human OK before anyone builds them.
**B** features are the platform pieces P1–P4 run on; **S** features are
stretch goals (only after the demo path works end to end).

## Stack (as decided in `DECISIONS.md`)

| Layer | Choice | Status |
| --- | --- | --- |
| Backend / system of record | **SpacetimeDB**, one pinned version | decided; version TBD |
| Agent loop | separate worker, one client identity per seat | decided; language TBD |
| Model | **Claude** | decided |
| Payments | **Stripe Issuing test mode** (virtual card per purchase) | proposed in `docs/research/visa-pipeline.md` |
| Real public data | NIH RePORTER + USAspending APIs; **Apify** for scraping | Apify track kept |
| Frontend | — | TBD |
| Tracks | Hyphenate (primary), Microsoft, Anthropic, SpacetimeDB, Apify | kept |

## Proposed product features

| ID | Feature | What it does | Needs |
| --- | --- | --- | --- |
| P5 | Drawdown justification drafter | Drafts the ≤1,000-character justification the government now requires for every federal payment request, by budget category and date range, and answers "Defend the Spend" follow-up questions with the exact transactions. A human approves before it's filed. | B1, B4, P1, P3 |
| P6 | Grant status timeline | Records status as events (awarded → terminated → court-ordered reinstatement → money actually paid), each with its source. Purchasing freezes on termination and resumes only when money arrives, not when a court orders it. | B1, B7 |

## Platform features (B)

| ID | Feature | What it does | Needs |
| --- | --- | --- | --- |
| B1 ★ | Company world + seed data | SpacetimeDB tables for grants (rules, end dates), purchase requests, POs, expenses, approvals, simulated ERP and supplier catalog. Seeded from real RePORTER/USAspending grant records for a fictional lab. Reducers enforce segregation of duties (requester ≠ approver). | — |
| B2 ★ | Agent worker | Claude-driven seats (purchasing, grant accountant, drawdown preparer), each connecting under its own identity with only the permissions its seat needs. | B1 |
| B3 | Purchase execution | Approved purchases issue a single-use Stripe test card limited to the grant's amount, category and end date; the approval webhook re-checks the balance live; receipts with line items post back to the ledger. | B1, P3 |
| B4 ★ | Audit trail | Append-only log of every action: which seat, inputs, rule applied, source cited, who approved. Powers "why did you do that?" answers. | B1 |
| B5 ★ | Dashboard + approval inbox | Per-grant true balance (P1), flagged risks with evidence (P2, P4), pending approvals (P3), audit trail view (B4). | B1 |
| B6 ★ | Planted-error test set | Seeded mistakes drawn from real audit findings (end-of-award purchases, wrong-grant charges, unallowable items, shared costs on one grant, sources that disagree) with an answer key; reports caught / missed / false alarms. Hyphenate's "proof it works". | B1 |
| B7 | Apify ingestion | Apify Actor that scrapes grant termination/reinstatement data (e.g. Grant Witness) into B1. Qualifies for the Apify track. | B1 |

## Stretch (S) — only after the demo path works

| ID | Feature | Source |
| --- | --- | --- |
| S1 | Replacement-funder matching from foundation tax filings (990s), compared on direct costs | pain points 04, 05 |
| S2 | Stranded clinical-trial rescue | pain point 03 |
| S3 | Factory Droid writes new policy rules from recurring exceptions | `docs/TRACKS.md` |
| S4 | Fetch.ai "why?" agent, Cartesia voice | `docs/TRACKS.md` |
| S5 | Claude reads a pasted court notice or agency letter, works out which grant and what changed, and posts a status event | `docs/MASTER-PLAN.md` §3.1 |
| S6 | Grant splits: the scientist states how a shared cost divides across the grants it serves (e.g. 60% A / 40% B) when submitting; the purchasing agent checks that split against the shared-cost rule instead of proposing one. Needs an optional `split` on `submit_request` (additive) and a split field in the web forms. Today the stated split only rides in the purpose text, so with Claude off a shared cost goes to the grant manager | `docs/MASTER-PLAN.md` §3.2, `TASKS.md` Requests (T35) |

Nessie (a mock consumer bank) was a stretch goal for the earlier AP idea; it
has no natural role in a grant office, so it isn't listed.

## Suggested build order

1. B1 → B2, B4 (in parallel) → B5 shell
2. P1 → P2 → P3 → P4, each shown in B5 as it lands
3. B6 alongside P2/P4 (it's how we prove they work)
4. B3, B7, then P5/P6 if approved
5. Stretch
