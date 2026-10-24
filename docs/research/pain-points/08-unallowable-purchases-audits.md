# 08. Unallowable, end-of-award and P-card purchases keep failing audits

**Status:** new — **core rationale for the Visa purchasing pipeline**
**One-liner:** Auditors keep finding the same lab-spending mistakes: costs
that aren't allowed, supplies bought right before a grant expires, charges
on the wrong grant moved too late, and card purchases without support.

## What happens (plain language)
Labs buy supplies with university purchasing cards (P-cards) or purchase
orders. Each charge must later be matched to a receipt, a purpose and the
right grant. Mistakes get caught months or years later in audits and the
university has to repay.

## Everyday analogy
Expensing a work trip, except the expense report is reviewed two years
later and you have to pay back anything that doesn't fit the rules.

## Evidence
- **NSF-OIG capstone 22-6-002 (Jan 2022), 18 university audits since 2018:**
  94% had unallowable expenses; 83% misapplied indirect costs; 67%
  inadequately supported expenses; 55% inappropriately allocated; 9 audits
  had misallocated materials/supplies/equipment. Suggests non-program review
  of supply charges in an award's **final 90 days**. [verified]
  `sources/docs/nsf-oig-22-6-002-promising-practices.txt`
  https://www.oversight.gov/sites/default/files/documents/reports/2022-01/22-6-002-Promising-Practices-NSF-Award-ManagementRedacted.pdf
- **West Virginia Univ. Research Corp (OIG 22-1-010):** $43,156 questioned,
  100% disallowed, incl. $17,335 for "materials and supplies, purchased or
  received, near or after the end of award periods." [verified]
  `sources/docs/nsf-oig-22-1-010-wvu.txt` https://nsf-gov-resources.nsf.gov/files/auditrep221010-wvu-r.pdf
- **Univ. of Delaware (OIG 19-1-011):** $426,667 questioned, $214,027 repaid;
  "Equipment Purchases at the End of Award or With No Benefit to Award"
  ($125,458) and "Unreasonable Materials and Supplies" ($19,208). [verified]
  `sources/docs/nsf-oig-19-1-011-delaware.txt` https://nsf-gov-resources.nsf.gov/files/auditrep191011-delaware.pdf
- **UC Davis (OIG 17-1-002):** questioned purchase-card transactions $14,164
  ($6,420 disallowed); questioned cost transfers $83,488 ($69,545
  disallowed); total questioned $2,330,503. [verified]
  `sources/docs/nsf-oig-17-1-002-ucdavis.txt` https://nsf-gov-resources.nsf.gov/files/auditrep171002-ucdavis.pdf
- **Cost transfers:** WashU Single Audit finding 2023-001: "2 of 25 cost
  transfers, totaling $24,438, that were not completed within the
  timeframe… completed 8 to 16 days late"; NIH requires transfers "within 90
  days of when the error was discovered." [agent-reported, third-party FAC mirror]
  https://fac.procurementexpress.com/findings/372071
- **P-card misuse (not grant-specific, context only):** WA State Auditor 2013,
  $226,583 unallowable card purchases across six universities
  (`sources/docs/wa-auditor-2013-pcard.txt`); Fayetteville State 2024,
  $575,123 (comms office, not grants) (`sources/docs/nc-auditor-2024-fayetteville-state-pcard.txt`). [verified]
- NSF's own P-card review: "3 out of the 50 high-risk transactions… were
  improper split purchases totaling $30,000." [unverified] https://oig.nsf.gov/sites/default/files/reports/2025-09/25-06-001%20Risk%20Assessment%20of%20NSF_s%20Purchase%20Card%20Program%20for%20Fiscal%20Years%202022%20and%202023%28public%29.pdf
- University P-card policies: often limited to small buys (Idaho: P-card
  under $5k, Jaggaer required for punchout vendors and >$5k); exclude
  radioactive materials, select agents, acutely toxic chemicals, biohazards,
  animals; some require one card per sponsored project (CUNY). [agent-reported]
  https://uidaho.edu/finance/controller/contracts-and-purchasing-services/faculty-and-staff-links
  · https://sph.cuny.edu/research/office-of-sponsored-programs-and-research/research-policies-and-procedures/award-management/purchasing-card-policy/

## Quotes
- "Award recipients charged NSF for materials and supplies and equipment purchased near an award's expiration date when the award recipients had little to no time to use the purchases to benefit the awards." — NSF-OIG / Cotton & Company capstone, 2022-01-21 — [verified]
- "Award recipients charged NSF for costs associated with re-stocking general lab materials and supplies and did not have documentation to support that the quantity and types of materials restocked were consistent with the quantity and types of materials actually used to benefit the award charged." — same report — [verified]

## What our product does about it
Guardrails enforced **at checkout** instead of at audit time (see
`visa-pipeline.md`):
- block/flag supply purchases in an award's last 90 days;
- block disallowed categories and over-budget buys per grant;
- require purpose + grant code + receipt at purchase time;
- split shared purchases across grants with a recorded allocation;
- warn when a correction (cost transfer) is approaching the 90-day limit.

## Gaps / caveats
- No HHS-OIG P-card audit of a university found.
- Most audit examples are NSF; NIH equivalents not collected.
