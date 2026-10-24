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
