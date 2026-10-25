# 15. Impossible spend: payments that only look wrong next to another record

**Status:** core (the case file's cross-record checks are built from these)
**One-liner:** Most money mistakes auditors find aren't visible in any one
record. The invoice looks fine, and so does the order. The problem only
shows up when you put the invoice next to the award end date, the earlier
payment, the effort certification or the other card charges that day.

## What happens (plain language)
A payment goes through a chain of records: grant (dates, status, budget),
order (PO or card charge), receipt of goods, invoice, payment, ledger
charge to a grant, and later corrections (cost transfers) and effort
certifications. Each step gets checked alone, if it gets checked at all.
The failures below all come from two records that disagree: an order
dated after the invoice, a charge dated after the grant ended, two
payments for one invoice, four card charges on the same day that add up
past the limit, or salary charged to a grant above the effort the person
certified. Nobody compares the two, so it surfaces in an audit years
later, or in a False Claims Act settlement.

Dates below matter: today is 2026-10-24, so anything before ~Oct 2024 is
flagged **(old)**.

## Everyday analogy
Your bank shows a $40 restaurant charge. Fine. It's only wrong because
the restaurant already charged you $40 for the same dinner yesterday, or
because the charge is dated after you canceled the card.

## Evidence

### 1. Charges after the award ended (or bought right before it ended)
**Records that conflict:** award period of performance (end date) vs. PO
date, receipt date, invoice date or ledger posting date. Also award
suspension or termination date vs. obligation date.
- **UW-Madison, NSF OIG 15-1-014 (Mar 31, 2015) (old):** $1,669,588
  questioned, including "$56,965 of expenses incurred after the NSF award
  period had expired." "Purchase orders for equipment and other supplies
  allocated to NSF grants were submitted after the grant's POP had
  expired." Example: award 0446017 ended Feb 28, 2011; PO dated March 8,
  2011; invoice April 26, 2011; $20,816 charged May 10, 2011. [verified]
  `sources/docs/nsf-oig-15-1-014-uwm.txt` (file name says uwm, but the
  report is UW-Madison) https://oig.nsf.gov/sites/default/files/reports/2024-08/15-1-014-UWM.pdf
- **Univ. of South Carolina, NSF OIG 21-1-016 (Jun 29, 2021) (old):**
  $140,360 questioned, including "$93,738 in purchases and adjustments near
  or after award expiration." For example, equipment "purchased on
  September 15, 2016, on an award that expired on July 31, 2016." [verified]
  `sources/docs/nsf-oig-21-1-016-southcarolina.txt` https://oig.nsf.gov/sites/default/files/reports/2024-11/21-1-016UniversityofSouthCarolinaFinal.pdf
- **USC, NSF OIG 17-1-009 (Sep 29, 2017) (old):** $639,479 questioned,
  including "$304,290 of unreasonable expenses near award expiration";
  equipment "installed after the award had expired." [verified]
  `sources/docs/nsf-oig-17-1-009-usc.txt` https://oig.nsf.gov/sites/default/files/reports/2024-11/17-1-009_USC.pdf
- **Univ. of Minnesota, NSF OIG 19-1-006 (Apr 5, 2019) (old):** $73,260
  questioned, of which "$65,973 of unallocable and/or unreasonable expenses
  against expired award." [verified] `sources/docs/nsf-oig-19-1-006-minnesota.txt`
  https://oig.nsf.gov/sites/default/files/reports/2024-11/19-1-006_University_of_Minnesota.pdf
- **Duke, NSF OIG 20-1-008 resolution (Jan 19, 2023) (old):** "Inappropriate
  Drawdown of Expiring Appropriations," $29,892 that "appear to have been
  incurred after funding appropriations expired." [verified]
  `sources/docs/nsf-oig-20-1-008-duke.txt` https://nsf-gov-resources.nsf.gov/files/auditrep201008-duke-r.pdf
- **Pomona College FY2022 single audit, finding 2022-001 (NSF, R&D
  cluster) (old):** stipends for work after June 30, 2022 charged in FY22,
  $16,588 questioned. [verified] `sources/docs/fac-single-audit-findings.txt`
- **Pattern across audits:** the NSF OIG capstone 22-6-002 lists "Purchases
  After Grant Expiration" and "Services Provided Outside of an Award's
  Period of Performance" among its common findings. [verified]
  `sources/docs/nsf-oig-22-6-002-promising-practices.txt` (see also 08 for
  WVU and Delaware)
- **The rule for suspended or terminated awards:** 2 CFR 200.343: "Costs to
  the recipient or subrecipient resulting from financial obligations
  incurred by the recipient or subrecipient during a suspension or after
  the termination of a Federal award are not allowable unless the Federal
  agency or pass-through entity expressly authorizes them". Costs are only
  safe if they were incurred before the effective date "and not in
  anticipation of it." 2 CFR 200.403(h): "All other costs must be incurred
  during the approved budget period." [verified]
  `sources/docs/ecfr-2cfr200-selected-sections.txt` https://www.ecfr.gov/current/title-2/section-200.343
- No published audit finding was found yet for costs charged *during a
  2025 suspension or termination*. Those audits probably haven't been
  published yet.

**What a checker must compare:** for every charge, the PO date, receipt
date and invoice service dates against the award's start and end dates and
its status timeline (suspended or terminated, and when). The posting date
alone isn't enough: UW-Madison's charge posted in May for a PO placed
after the end date.

### 2. Salary charged above the effort actually worked or certified
**Records that conflict:** payroll distribution to a grant vs. the
employee's effort certification, appointment, or budget (e.g., the NSF
2-month senior-personnel cap).
- **Univ. of Florida, $19.875M FCA settlement (Nov 20, 2015) (old):**
  "overcharged hundreds of grants for the salary costs of its employees,
  where it did not have documentation to support the level of effort
  claimed." [verified] `sources/docs/doj-university-grant-settlements.txt`
  https://www.justice.gov/opa/pr/university-florida-agrees-pay-19875-million-settle-false-claims-act-allegations
- **UNT Health Science Center, $13,073,000 (Feb 16, 2018) (old):**
  employees "received salary payments when the correlating payments did
  not match the accompanying time and effort reports." [verified] same file,
  https://www.justice.gov/usao-ndtx/pr/university-north-texas-health-science-center-pay-13-million-settle-claims-related
- **Columbia / ICAP, $9,020,073 (Oct 28, 2014) (old):** "Columbia admitted
  failing to use a suitable means of verifying whether the salary and wage
  charges that ICAP applied to specific federal grants were based on an
  employee's actual effort for that grant." [verified] same file,
  https://www.justice.gov/usao-sdny/pr/manhattan-us-attorney-settles-civil-fraud-claims-against-columbia-university-and
- **Yale, $7.6M (Dec 23, 2008) (old):** researchers "wrongfully charged 100
  percent of their summer effort to federal grants when, in fact, the
  researchers expended significant effort on unrelated work." [verified]
  `sources/docs/usao-ct-2008-yale-grants-settlement.txt` https://oig.nasa.gov/wp-content/uploads/2024/02/pr2009-B.pdf
- **New York Medical College, HHS OIG A-04-20-03583 (May 10, 2024)
  (old):** "used budget estimates instead of actual activity to claim $7.5
  million in salaries, fringe benefits, and indirect costs." [verified]
  `sources/docs/hhs-oig-2024-a-04-20-03583-nymc-summary.txt`
  https://oig.hhs.gov/reports/all/2024/new-york-medical-college-claimed-unallowable-grant-costs-and-did-not-meet-certain-financial-conflict-of-interest-requirements/
- **UW-Madison 15-1-014 (old):** 45 instances of senior-personnel salary
  above NSF's two-month cap. Also late certifications: "for 26 of our 93
  sampled salary transactions, employees had not certified the effort
  reports within the specified time period." [verified]
  `sources/docs/nsf-oig-15-1-014-uwm.txt`
- The NSF capstone 22-6-002 lists "Salary Expenses Inconsistent with
  Certified Effort" among its common findings. [verified]
- UNC-Chapel Hill ~$4.5M repayment (Jan 2020) for salary charged after
  grant terms: only found on a whistleblower law firm's page (an
  interested source); no DOJ release found. [unverified]
  https://constantinecannon.com/whistleblower/government-enforcement-actions/doj-fraud-settlements/january-7-2020/

**What a checker must compare:** salary charged per person per grant per
period vs. certified effort %, the appointment, and any award salary cap.
This is the largest dollar category in the settlements above.

### 3. Late cost transfers (moving a charge to a grant months later)
**Records that conflict:** original transaction date vs. the date of the
cost transfer moving it onto a grant (NIH/HHS: within 90 days), and
whether the receiving grant was even active then.
- **Saint Louis University FY2023 single audit, finding 2023-001 (report
  accepted Mar 29, 2024) (old):** "seventy-five of our one hundred nineteen
  transactions sampled cost transfers (totaling $246,869 positive and
  $66,004 negative) where the cost transfer date was between 91 and 1,002
  days past the date the original expenditure was incurred." Repeat
  finding. [verified] `sources/docs/fac-single-audit-findings.txt`,
  https://api.fac.gov/findings_text?report_id=eq.2023-06-GSAFAC-0000030175
- **Washington University FY2023, finding 2023-001 (old):** "2 of 25 cost
  transfers, totaling $24,438, that were not completed within the
  timeframe noted above. The cost transfers were completed 8 to 16 days
  late." This upgrades the third-party mirror cited in 08. [verified] same
  file, https://api.fac.gov/findings_text?report_id=eq.2023-06-GSAFAC-0000011065
- **UTRGV internal audit 23-AEN-05 (Feb 29, 2024) (old):** "Cost transfers
  are an after-the-fact reallocation"; payroll transfers over 90 days were
  not approved by the Director of Grants & Contracts. [verified]
  `sources/docs/utrgv-2024-cost-transfers-internal-audit.txt`
  https://www.utsystem.edu/sites/default/files/documents/ut-system-reports/2024/utrgv-cost-transfers-report/utrgv-cost-transfers-report.pdf
- **UC Davis, NSF OIG 17-1-002 (old):** cost transfers $83,488 questioned,
  $69,545 disallowed (see 08). [verified]
- **Yale 2008 (old)** ties transfers to spend-down: "motivated to carry out
  these wrongful transfers when the federal grant was near its expiration
  date." [verified]

**What a checker must compare:** the transfer date minus the original
expense date (over 90 days means late), the expense date vs. the receiving
grant's period, and whether a transfer moves costs *onto* a grant that's
about to expire.

### 4. Order created after the invoice (after-the-fact PO)
**Records that conflict:** PO or requisition approval date vs. invoice
date, service date or payment date.
- **Southern Connecticut State Univ., CT Auditors of Public Accounts,
  FY2021–22 (released Nov 5, 2025):** "approved one $7,400 purchase
  requisition and order 31 days after the invoice"; "two instances,
  totaling $12,727, in which the university approved the purchase
  requisitions and orders after the invoice date. In one of these
  instances, the university paid the vendor in full, totaling $5,500,
  prior to receiving the service." [verified]
  `sources/docs/ct-apa-2025-scsu-fy2021-2022.txt` https://wp.cga.ct.gov/apa/wp-content/cgacustom/reports/FullReports/Southern%20Connecticut%20State%20University%20FULL_20251105_FY2021,2022.pdf
- **UT Tyler, Texas Comptroller post-payment audit (Jan 30, 2024) (old):**
  "two purchase transactions in which the purchase orders were dated after
  services were rendered and after the final invoices were received."
  [verified] `sources/docs/tx-cpa-2024-ut-tyler-post-payment-audit.txt`
  https://fmx.cpa.texas.gov/fm/audit/ar24-2q/UTT-(01-30-24)_508c.pdf
- **UH-Victoria, Texas Comptroller (Dec 16, 2022) (old):** "one purchase
  transaction for $47,946.64 in which the purchase order was dated after
  services were rendered and after the final invoice was received."
  [verified] `sources/docs/tx-cpa-2023-uhv-post-payment-audit.txt`
  https://fmx.cpa.texas.gov/fm/audit/ar23-2q/PPA-UHV.pdf
- These are general university purchasing findings, not grant-specific.

**What a checker must compare:** PO approval date < invoice date and <
service start date. If not, the order was rubber-stamped after the money
was already committed, so the grant check never actually ran before
purchase.

### 5. Split purchases to stay under a card or approval limit
**Records that conflict:** several card charges or orders (same
cardholder or vendor, same day or a few days apart) vs. the single-purchase
limit. Each one alone is under the limit; their sum isn't.
- **Yale School of Medicine, Petrone guilty plea (2022) (old):** authority
  "below $10,000"; "she broke up the fraudulent purchases into orders below
  the $10,000 threshold that would require additional approval"; loss
  "approximately $40,504,200." [verified] `sources/docs/doj-university-grant-settlements.txt`
  https://www.justice.gov/usao-ct/pr/former-yale-med-school-employee-pleads-guilty-admits-stealing-and-selling-40-million
  (sentenced to 109 months, Oct 2022 [agent-reported] https://www.irs.gov/node/115056)
- **Southern Connecticut State Univ. (Nov 5, 2025):** "Four purchases that
  appear to have been split to circumvent the $2,500 single purchase
  dollar limit. The university placed orders for $1,038, $910, $1,377, and
  $467 (totaling $3,792) with one vendor, on the same day." [verified]
  `sources/docs/ct-apa-2025-scsu-fy2021-2022.txt`
- **NSF's own purchase cards, NSF OIG 25-06-001 (Sep 9, 2025):** "3 out of
  the 50 high-risk transactions we tested were improper split purchases
  totaling $30,000." This is NSF's own agency cards, not a university's.
  It upgrades 08's [unverified] item. [verified]
  `sources/docs/nsf-oig-25-06-001-pcard-risk.txt`
- **UMass Amherst, MA State Auditor (Oct 29, 2018) (old):** "13 instances
  ... multiple Procard transactions with the same vendor on the same day.
  These transactions totaled $19,204, $6,204 of which was over the
  cardholders' approved single-purchase limits." The limit was $1,000.
  [verified] `sources/docs/ma-osa-2018-umass-amherst-procard-dovetail.txt`
  https://www.mass.gov/info-details/procard-users-made-dovetail-transactions-totaling-6204
- WA State Auditor 2013 (old) lists "Splitting purchases to circumvent the
  daily or monthly purchase limits." [verified] `sources/docs/wa-auditor-2013-pcard.txt`

**What a checker must compare:** sum of charges by cardholder (and by
vendor) over a same-day or short window vs. the single-purchase limit.
Also orders just under an approval threshold.

### 6. Duplicate payments (same invoice paid twice)
**Records that conflict:** payment vs. earlier payment with the same
vendor, invoice number and amount (or near-matches).
- **Saint Louis University FY2021, finding 2021-001 (old):** a
  subrecipient invoice of $690 on NIH R01DA043543 "was erroneously paid
  twice and indirect costs in the amount of $355 were charged to the grant
  twice resulting in a total of $1,045 of unallowable costs." Note that the
  overhead doubled too. [verified] `sources/docs/fac-single-audit-findings.txt`
- **Texas Comptroller multi-agency desk audit #001-19-01 (Sep 30, 2020)
  (old):** a 17-agency sample, including University of North Texas and
  Stephen F. Austin: "auditors identified 61 duplicate purchase and travel
  payments totaling $56,542.24." Agencies found "$1,166,963.51 in actual
  duplicates from the $285,371,790.77 potential duplicates investigated."
  Naive matching produces mostly false positives. [verified]
  `sources/docs/tx-cpa-2021-multi-agency-duplicate-payments.txt`
  https://fmx.cpa.texas.gov/fm/desk_audit/reports/2021-1q/Multi-Agency_Desk_Audit-Duplicate_Payments.pdf
- **UT Tyler AP internal audit FY2022 (old):** of 26,758 vouchers (>$119M),
  12 potential duplicates: 9 weren't duplicates, 2 were already resolved, 1
  was an unresolved $250. Also 308 possible duplicate vendors (3%).
  [verified] `sources/docs/ut-tyler-2022-accounts-payable-internal-audit.txt`
- **Frequency:** a FAC keyword scan found 269 findings in 191 reports
  (2020+) mentioning duplicate payments, but only 6 from higher-ed
  entities. Universities rarely get this finding in single audits.
  [verified, own query] `sources/docs/fac-single-audit-findings.txt`
- The OMB Compliance Supplement lists "(3) duplicate payments" and "(5)
  payments for goods or services not received" as improper payments
  (quoted in Pomona 2022-001). [verified]

**What a checker must compare:** vendor + invoice number + amount (and
fuzzy variants) against all prior payments, including payments on
*other* grants. When it finds one, also check that the overhead charged on
it wasn't charged twice.

### 7. Paid but never received, or a fake vendor
**Records that conflict:** payment vs. receiving record (goods or
services), and vendor vs. known/approved vendor list.
- **Stony Brook, Girnun sentencing (Oct 2020) (old):** "submitted
  fraudulent electronic invoices to Stony Brook University for payment to
  the sham companies for equipment, goods and services that were never
  received or provided," more than $200,000 of NIH and university funds.
  [verified] `sources/docs/doj-university-grant-settlements.txt`
  https://www.justice.gov/usao-edny/pr/former-stony-brook-university-professor-sentenced-prison-stealing-cancer-research-funds
- **SCSU (Nov 2025):** paid $5,500 "prior to receiving the service" (see
  §4). [verified]
- **ACFE 2024 Report to the Nations:** billing schemes were 22% of 1,921
  fraud cases, median loss $100,000; in education (70 cases) billing was
  36% of cases. ACFE sells anti-fraud certification (mildly interested);
  the copy is a third-party mirror. [verified]
  `sources/docs/acfe-2024-report-to-the-nations.txt`
  https://www.ivey.uwo.ca/media/kjljj5cy/2024-report-to-the-nations.pdf

**What a checker must compare:** payment date vs. receipt date (a payment
with no receipt, or paid before receipt), and a vendor's creation date or
ownership vs. requester (a new vendor paid soon after creation and
approved by the same person who requested it).

### 8. Same person can request, approve and edit the vendor
**Records that conflict:** requester vs. approver on the same
transaction; who edited the vendor's bank details vs. who released the
payment.
- **UT Tyler (Jan 2024) (old):** two employees could "Enter/edit and
  release/approve payment vouchers in USAS" and also edit vendor
  profile and direct deposit. [verified]
  `sources/docs/tx-cpa-2024-ut-tyler-post-payment-audit.txt`
- **SCSU (Nov 2025):** a segregation-of-duties finding in payroll/HR.
  [verified] `sources/docs/ct-apa-2025-scsu-fy2021-2022.txt`
- ACFE 2024: 32% of frauds were enabled by a lack of internal controls, and
  19% by an override of existing controls. [verified]

**What a checker must compare:** requester ≠ approver ≠ vendor-editor
for each payment.

### 9. Invoice amount above the approved order
**Records that conflict:** invoice total vs. the PO's approved amount.
- **UT Tyler (Jan 2024) (old):** "the vendor's invoice added freight costs,
  which the University paid ... created a purchase order change notice to
  add the freight charges after receiving the invoice." [verified]
  `sources/docs/tx-cpa-2024-ut-tyler-post-payment-audit.txt`

**What a checker must compare:** invoice total (lines + freight + tax) vs.
the latest *approved* PO amount, and whether the PO change was approved
before or after the invoice arrived.

### 10. End-of-grant spend-down
Already covered in 08 (NSF capstone, WVU, Delaware). Yale 2008 (old) is
the clearest statement of motive: "near its expiration date and they
needed to spend down the remaining grant funds." [verified]

### 11. Invoice for a canceled order
No published audit finding was found that specifically describes paying
an invoice against a canceled PO. It's a known AP control (the
Compliance Supplement's "goods or services not received" covers it), but
there's no named precedent. The demo case stands on logic, not on a cited
audit. No evidence found.

## Quotes
- "Purchase orders for equipment and other supplies allocated to NSF grants were submitted after the grant's POP had expired." — NSF OIG 15-1-014, UW-Madison, 2015 — [verified]
- "The university placed orders for $1,038, $910, $1,377, and $467 (totaling $3,792) with one vendor, on the same day." — CT Auditors of Public Accounts, SCSU, 2025 — [verified]
- "she broke up the fraudulent purchases into orders below the $10,000 threshold that would require additional approval" — U.S. Attorney, D. Conn., Petrone plea, 2022 — [verified]
- "was erroneously paid twice and indirect costs in the amount of $355 were charged to the grant twice" — Saint Louis Univ. single audit 2021-001 — [verified]
- "the cost transfer date was between 91 and 1,002 days past the date the original expenditure was incurred" — Saint Louis Univ. single audit 2023-001 — [verified]
- "received salary payments when the correlating payments did not match the accompanying time and effort reports" — U.S. Attorney, N.D. Tex., UNT HSC, 2018 — [verified]

## What our product does about it
The grant office's case file (`docs/MASTER-PLAN.md`) opens one case per
conflict between two records, showing both records side by side. Mapping
against today's checks:
- **Already caught:** invoice for a canceled order; invoice ≠ latest
  approved amount (§9); purchases in the last 90 days (§10); spending on a
  frozen or canceled grant (§1, partly).
- **Cheap to add, same data:** compare PO, receipt and invoice dates with
  the award end date and status timeline (§1); same-day card totals per
  cardholder or vendor vs. the limit (§5); PO approval date after the
  invoice date (§4); vendor + invoice number + amount already paid (§6);
  cost transfer more than 90 days after the original expense (§3).
- **Needs new records:** effort certifications (§2), receiving records
  (§7), and requester/approver identities (§8).

## Gaps / caveats
- Most precedents are **more than 2 years old**. The only recent ones are
  NSF OIG 25-06-001 (2025) and CT APA SCSU (2025). Audits of 2025
  freeze-era spending aren't published yet.
- The after-the-fact PO, duplicate payment and segregation-of-duties
  findings are general university purchasing findings, not grant-specific.
- Duplicate payments are rare in university single audits (6 higher-ed
  findings of 269), and naive matching has a very high false-positive rate
  (Texas: $1.17M real out of $285M flagged).
- No precedent was found for an invoice paid on a canceled PO. No GAO
  report on universities was used.
- UNC-Chapel Hill is only sourced from a law firm's page. The HHS OIG
  University of Chicago cost-transfer audit (2006) wasn't opened
  (https://oig.hhs.gov/reports/all/2006/audit-of-cost-transfers-funded-under-nih-grants-at-the-university-of-chicago). [unverified]
- DOJ and NSF OIG pages were fetched through web.archive.org copies,
  because the live sites block scripts.

## Summary
| Failure mode | Records that conflict | Best precedent | Caught today |
|---|---|---|---|
| Charges after award end / suspension | award end date or status vs. PO, receipt, invoice dates | UW-Madison NSF OIG 15-1-014; USC 17-1-009 ($304,290) | partly |
| Salary above certified effort | payroll distribution vs. effort certification / salary cap | UF $19.875M; UNT HSC $13.07M; NYMC $7.5M | no |
| Late cost transfers | original expense date vs. transfer date (90 days) | Saint Louis Univ. 2023-001 (75 of 119) | no |
| Order after invoice | PO approval date vs. invoice / service date | SCSU 2025 ($12,727); UHV $47,946.64 | no |
| Split purchases | sum of same-day charges vs. card limit | Yale Petrone $40.5M; SCSU 2025; NSF 25-06-001 | partly (single charge only) |
| Duplicate payment | payment vs. earlier payment (vendor, invoice #, amount) | Saint Louis Univ. 2021-001 (NIH, overhead doubled) | no |
| Paid but not received / sham vendor | payment vs. receiving record; vendor vs. requester | Stony Brook Girnun; SCSU $5,500 | no |
| Requester = approver | requester vs. approver vs. vendor editor | UT Tyler 2024 | no |
| Invoice above approved PO | invoice total vs. approved PO amount | UT Tyler 2024 (freight) | yes |
| End-of-grant spend-down | purchase date vs. award end date | Yale 2008; NSF capstone (see 08) | yes |
| Invoice for canceled order | invoice vs. PO status | none found | yes |
