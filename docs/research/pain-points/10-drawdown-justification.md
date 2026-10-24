# 10. Every federal drawdown now needs a written justification

**Status:** new — **strong fit for the purchasing pipeline + AI**
**One-liner:** Since 2025, universities must explain in writing why they're
drawing each payment of grant money, tied to budget categories and dates
their accounting systems don't naturally produce; vague requests get
rejected or stuck in "Defend the Spend" review.

## What happens (plain language)
Universities pay lab costs first, then "draw down" reimbursement from the
government's Payment Management System (PMS). Executive Order 14222 added a
mandatory justification field to every draw. HHS reviews them under "Defend
the Spend" (DTS) and sends follow-up questions; payments can sit unapproved.

## Everyday analogy
Your employer now makes you write a paragraph explaining every reimbursement
request, and may email you three times with questions before paying.

## Evidence
- Mandatory PMS justification field, 1,000-character limit; requests without
  it are rejected. Example: "This payment request is to cover salary expense
  and equipment for the week ending 3/14/25." DOL FAQ says field live
  2025-03-17; COGR says HHS recipients were emailed 2025-02-14 (sources
  disagree on date). [verified] `sources/docs/dol-2025-pms-justification-faq.txt`
  https://resources.uta.edu/research/_documents/gcs_documents/executive-orders/DOL-3-25-2025-FAQs-PMS-Justification.pdf
- NIH Grants Policy Statement 6.1 (rev. March 2026): recipients must give "a
  detailed justification explaining why the funds are being drawn and how the
  funds are being used," reviewed "within the Defend the Spend (DTS) system." [verified]
  https://grants.nih.gov/grants/policy/nihgps/html5/section_6/6.1_nih_payment_review_process.htm
- Treasury's ASAP system (DOE, DOJ, USDA-NIFA) added the same requirement 2025-05-19. [agent-reported]
- FY2026 report language reportedly tells HHS to pay within 5 business days. [unverified]
  https://www.casrai.org/news/nih-5-business-day-grant-payment-disbursement-rule-fy2026

## Quotes
All from COGR, "Points to Consider for Reimbursement of Expenses Under Active
Grants," ~May 2025 — [verified] `sources/docs/cogr-points-to-consider-reimbursement-2025.txt`
https://research.iastate.edu/wp-content/uploads/sites/3/2025/05/PointstoConsiderforReimbursementofExpenses68237c22751ca.pdf
- "Instructions for completing the field in PMS and responding to Defend the Spend emails are varied, increasingly onerous, and impractical."
- "NIH has not provided guidance, but COGR members report receiving dozens of Defend the Spend email demands after submitting draw requests."
- "COGR members report problems with unapproved payments sitting in the system, with no communication from the sponsor."
- CDC email quoted there: "OGS cannot provide a timeframe in which the payment will be released by PMS… After the 3rd request, if OGS does not have enough information to approve the payment it will be rejected."
- Worked examples of draws that can't map to one category (prior-month payables, a "rebate of $86").

## What our product does about it
Because every purchase goes through our pipeline with grant, category, line
items and date, the LLM can **draft the ≤1,000-char justification per draw**
by budget category and date range, and answer DTS follow-ups with the exact
transactions behind it. Human approves before submission.

## Gaps / caveats
- No NIH figure found on how many draws were delayed.
