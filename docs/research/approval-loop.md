# Where the request, invoice and grant-check loop actually happens

The back-and-forth Grant Test Auto sits in (a researcher asks to buy something,
someone checks the grant can pay for it, an invoice arrives and someone
checks it against the order) doesn't happen in one system. It's spread across
email, a purchasing marketplace, the finance system, an accounts-payable
inbox, a card-reconciliation tool and the grant office's spreadsheets.
Written 2026-10-25 (@ethan/claude). Follow the rules in [`README.md`](README.md).

Raw excerpts for every `[verified]` line below:
[`sources/docs/approval-loop-university-pages-2026-10-25.txt`](sources/docs/approval-loop-university-pages-2026-10-25.txt).
Each source is one university's own process page, not a national standard.
Details vary by school, but the shape is the same everywhere we looked.

## The loop, step by step

| # | Step | Who | Where it happens |
|---|---|---|---|
| 1 | "Can I buy this?" | Student or postdoc → PI | **Email** or in person |
| 2 | PI says yes, names the grant | PI → department admin | **Email** forwarded, a PDF of the cart, a signed paper form |
| 3 | Requisition entered | Department admin (PIs often don't have access) | **Purchasing marketplace** (Jaggaer-based: BearBuy at Berkeley, CU Marketplace, UCR eBuy) or the **finance system** (Workday, Oracle, PeopleSoft, Kuali) |
| 4 | "Does the grant have money, and is it still open?" | Department financial approver | Same marketplace, as an approval step |
| 5 | "Is this allowed on this grant?" | Grant office (sponsored projects) | Same marketplace or finance system, as another approval step |
| 6 | Purchase order to vendor | Purchasing office | Marketplace sends it |
| 7 | Invoice arrives | Vendor → accounts payable | A **central AP email inbox**, or an e-invoicing network; invoices sent to the lab often get lost |
| 8 | Invoice matched to order and receipt | Accounts payable, department confirms receipt | Finance system's 3-way match; mismatches go back to the department |
| 9 | Card purchases checked after the fact | Cardholder → approver (grant office added for grant charges) | **Card reconciliation tool** (Concur, Works) |
| 10 | Monthly "is the ledger right?" | Department admin, PI signs off | Finance-system reports exported to **Excel / Google Sheets** |
| 11 | Draw cash from the agency | Central grant accounting | Federal **Payment Management System** (see [pain point 10](pain-points/10-drawdown-justification.md), [`money-cycle.md`](money-cycle.md)) |

The same three questions (money left? grant still open? allowed?) get asked
at steps 2, 4, 5, 8, 9 and 10, by different people in different tools.
That's Grant Test Auto's core idea: answer them once, from one record of the grant.

## Evidence

### Steps 1–2: the request starts in email
- University of Kentucky, Biosystems & Agricultural Engineering: the purchase
  flowchart "Starts with (grad student email to PI), PI forwards email and
  approval to:" the purchaser. `[verified]`
  https://www.engr.uky.edu/sites/default/files/BAE/PurchaseFlowChart2021.pdf (2021)
- Northern Illinois University, card purchases on a grant: "the PI must
  obtain approval from the Administrator prior to making each purchase using
  grant funds.* For documentation purposes, the request should be made via
  email." `[verified]`
  https://www.niu.edu/spa/_pdf/request-add-grant-commercial-card-form.pdf
- **UC Berkeley, Civil & Environmental Engineering** (our host campus): two
  routes. In BearBuy, "For research funds: Assign the cart to the PI or the
  Research Administrator." Otherwise fill in a paper form, "Have authorizes
  [sic] signatory approve the form", "scan the form and relevant documents
  (such as a quote) then save to PDF", and "Attach the PDF of the Purchase
  Request Form and quotes or emails, then Submit." `[verified]`
  https://ce.berkeley.edu/resources/forms/reimbursements
- University of Montana: because PIs often lack requisition access, the
  department places the order and emails the PI a PDF of the cart; the PI's
  reply naming the funding source is attached to the order. `[unverified]`
  (the page 404'd on 2026-10-25; seen only in a search summary)

### Steps 3–6: the same checks, as approval steps
- **CU Boulder:** sponsored purchases "require three sequential approvals
  after the Principal Investigator (PI) and their department initiate a
  requisition". The department confirms "sufficient funding is available and
  check the award's period of performance"; the grant office reviews "the
  award terms and federal regulations to confirm the purchase is allowable";
  purchasing confirms "the purchase meets procurement requirements." Only then
  "a purchase order is created and sent to the vendor." `[verified]`
  https://www.colorado.edu/ocg/manage-awards/property-and-equipment/marketplace-purchasing
  The department step also says "Sponsor approval will be necessary if within
  90 days of the end of the project", the same rule as one of our planted
  mistakes (`sim/answer-key.json`). `[verified]`
- **UCF:** the post-award team "reviews all online requisitions submitted via
  the financial system involving equipment purchase requests, ... domestic or
  international travel and services to be charged to sponsored projects ...
  to determine if requests are allowable and allocable". `[verified]`
  https://www.research.ucf.edu/wp-content/uploads/sites/56/2025/04/SOP_OR-Procedure_Pre-Expenditure-Reviews_Requisitions.pdf (2025-04)
- **Ohio State (Workday):** "Spend Authorizations containing an OSP grant will
  route to the Grant Managers for every line if one is assigned to the Cost
  Center." The fix was needed because "There were some instances where these
  transactions were routing to both the Cost Center Managers and the Grant
  Managers." `[verified]`
  https://it.osu.edu/news/2026/08/21/spend-authorization-workflow-updates-effective-aug-28 (2026-08-21)
- **UC Berkeley BearBuy:** approvers for requisitions of $1,000 or more "Can
  only view, approve, and return/reject requisitions" and "Cannot edit any
  requisitions fields." `[verified]`
  https://supplychain.berkeley.edu/sites/default/files/bbreqorgnodeapprovertraining-05192021_-_rc.pdf (2021)
- Other schools with the same pattern, seen only in search summaries
  `[unverified]`: Kean (grant office signs requisitions of $1,000+), Howard
  and Montgomery College (Workday routes grant-tagged requisitions to the PI),
  Wesleyan (Workday grant spend goes PI → grants office).

### Steps 7–8: invoices land in an AP inbox and get held on mismatch
- **UC Riverside:** "Vendor/Supplier invoices should be emailed to
  apinvoice@ucr.edu". "Vendor invoices sent directly to departments tend to
  get lost and prevent timely vendor payment." Payments are delayed for "POs
  not matching vendor invoice", "POs not Received/OK to Pay" and "POs not
  having enough encumbered funds". `[verified]`
  https://accounting.ucr.edu/accounts-payable/vendor-invoice-process
  Those three delay causes are exactly what Grant Test Auto's invoice check looks
  for (`docs/MASTER-PLAN.md`).
- Also central AP email inboxes `[unverified]`: UCLA (since Dec 2023), Yale,
  Drew. Boston University auto-pays PO invoices under $5,000 unless the
  department holds them within 3 business days; $5,000+ waits for department
  approval. `[unverified]` https://www.bu.edu/tech/files/2020/12/Process-Guide-Accounts-Payable.pdf
- Three-way match (order, receipt, invoice) is the standard check in Workday
  and Jaggaer. `[unverified]`
  https://doc.workday.com/workday-education/en-us/course-manuals/procure-to-pay-for-administrators/matching.html

### Step 9: card purchases are checked afterwards
- CU Denver tells approvers to add the post-award specialist to any Concur
  report with grant-funded expenses. UNC's Works guide: the cardholder
  uploads a receipt per transaction and signs off before the approver can
  see it. `[unverified]` https://clas.ucdenver.edu/orca/node/390
- Card misuse on grants is already documented in
  [pain point 08](pain-points/08-unallowable-purchases-audits.md).

### Step 10: the ledger gets checked in spreadsheets
- SRAI (the research administrators' professional society): "Common shadow
  systems may include the use of user-developed Excel and Google worksheets,
  webforms, databases, and custom reports". It also asks: "Have you ever tried
  to share an "unaltered" printout of a report or screen from your
  institutional system with a researcher or faculty person? How did that go
  for you?" `[verified]`
  https://www.srainternational.org/blogs/srai-news/2022/01/12/what-we-do-in-the-shadow-systems-in-research-admin (2022)
- Monthly or bi-monthly ledger reconciliation with PI sign-off is required at
  Florida State, George Mason and Tennessee. `[unverified]`
  https://adminmanual.research.fsu.edu/media/1143/sponsored-project-departmental-reconciliation-requirements.pdf
- A Huron review at Rochester found the research finance system "not used
  consistently" and shadow systems in use. `[unverified]`
  https://www.rochester.edu/orpa/_assets/pdf/tool_092016RARA_RR_Huron_Sum.pdf (2016)

### The cost to researchers
- FDP 2018 faculty survey: "Just under 50% reported particular concerns with
  excessive workload associated with proposal budget preparation and with
  grant-related purchasing procedures." `[verified]`
  `sources/docs/fdp-2018-faculty-workload-survey.txt`
  (the 44%-of-time figure is in [pain point 07](pain-points/07-balance-visibility-admin-burden.md)).

## What this means for Grant Test Auto

- **Pitch line:** a purchase is checked for the same three things up to six
  times, by different people in different tools, starting in an email thread.
  Grant Test Auto checks once, against the live state of the grant, and shows
  everyone the same answer.
- **Where we sit:** next to the marketplace and the AP inbox, not instead of
  them. Don't claim to replace Workday, Oracle or BearBuy. The ERP rollout
  failures in [pain point 09](pain-points/09-erp-outages.md) are a reason
  schools won't swap systems.
- **Demo realism:** our researcher request → grant manager → invoice flow
  matches steps 1–8. The "held invoice" beat maps directly to UCR's delay
  causes.

## Gaps / caveats

- **No numbers on how often approval happens by email.** We have
  documented processes at several schools, not a survey. No evidence found
  for a share like "X% of grant purchases start in email".
- Every source is one school's or one department's procedure; we chose ones
  that show the pattern. Some are old (Berkeley BearBuy training 2021,
  Kentucky 2021, Rochester 2016).
- Berkeley's full chain for grant-funded BearBuy carts (which approver checks
  allowability) is not confirmed; we only have the CEE department page and
  the 2021 approver training.
- SRAI is a professional society, not neutral on administrator workload; the
  vendor pages (Workday, Jaggaer) are marketing or product docs.
