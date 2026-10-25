# GrantGuard: why it matters (evidence for judges)

Compiled Sat 2026-10-24. Every number has a source and an as-of date. Tags
follow `docs/research/README.md`: **[verified]** = we opened the primary
source; **[scrape]** = verbatim text saved in `docs/research/sources/reddit/`;
**[ours]** = our own measurement, scoped below. Nothing `[unverified]` is used.

## Summary

Since January 2025, federal agencies have canceled or frozen thousands of
university research grants, and most of the NIH ones have since come back.
On Grant Witness's NIH list as of 2026-10-23, **5,098 awards worth $14.6B
were disrupted, $7.5B of it not yet spent, and 4,352 (85%) are now marked
restored** [verified, our count of their data]. So a grant's status flips, and a
"restored" grant still isn't money in the bank: the government's appeal of
the main UC reinstatement case is **pending at the Supreme Court right now**
(No. 26-210) [verified, 2026-10-24]. Meanwhile **every NIH payment request
needs a written justification** reviewed in "Defend the Spend" [verified,
NIH GPS rev. March 2026], **94% of 18 NSF university audits found
unallowable expenses** [verified, NSF-OIG 2022], and researchers spend
**44.3% of their federally funded research time on administration**
[verified, FDP survey 2018]. This sits on **$64B+ a year of federally funded
university R&D** [verified, NSF, FY2024]. GrantGuard is the grant office
that tracks all of this on its own. On our planted test set it **caught 14
of 14 mistakes with 0 false alarms on 5 decoys** [ours].

## 1. How big the problem is

| What | Number | As of | Source |
|---|---|---|---|
| NIH awards on Grant Witness's disruption list (prime awards) | **5,098** at 430 organizations | CSV updated 2026-10-23 | [verified, our count] Grant Witness CSV |
| ...money already committed to them before disruption | **$14.6B** obligated; **$7.5B** not yet spent | same | same |
| ...now marked restored (reinstated or unfrozen) | **4,352 (85%)**; 145 of the reinstatements marked "unconfirmed" by Grant Witness | same | same |
| ...still terminated or frozen | 746 | same | same |
| NSF awards on the list | **2,031** ($1.6B obligated, $1.0B unspent); 1,400 still terminated, 631 reinstated | CSV updated 2026-10-23 | same |
| All 7 agencies Grant Witness tracks (NIH, NSF, EPA, CDC, SAMHSA, AHRQ, NOAA) | 11,547 prime awards | 2026-10-13 to 10-23 | same (EPA/CDC dollars are mostly non-university, so we don't headline the total) |
| NIH grants terminated that the Supreme Court let stand | **$783M** (5-4, emergency order) | 2025-08-21 | [verified] SCOTUSblog |
| Main UC reinstatement case (*Thakur v. Trump*) | Ninth Circuit decision 2026-05-26; government's cert petition filed 2026-08-18; opposition filed 2026-10-19; **no ruling yet** | 2026-10-24 | [verified] Supreme Court docket 26-210 |
| NIH new grants awarded Jan 1–May 10, 2026 | **3,081** vs a 6,544 five-year average for the same window | 2026-06-03 | [verified] Rep. Davids press release (a member of Congress, so an interested source) |
| NIH-funded clinical trials that lost funding | 383 of 11,008 (3.5%), 74,000+ participants | Feb 28–Aug 15, 2025 | [verified, from CIDRAP's coverage of Patel et al., *JAMA Intern Med*; paper paywalled] |
| Researcher time on administration | **44.3%** of federally funded research time (42.3% in 2005 and 2012); n = 11,167 PIs, ~20% response | survey 2018, report 2020 | [verified] FDP Faculty Workload Survey (no newer wave found) |
| Most-wanted finance fix | "Almost 60%" rate timely, accurate reports of grant balances a high priority | 2018 | same |
| University audits with unallowable expenses | **94%** (17 of 18 NSF audits) | 2018–2022 | [verified] NSF-OIG 22-6-002 |
| Example disallowance | WVU Research Corp: **$17,335** for supplies bought "near or after the end of award periods", repaid in full | 2022 | [verified] NSF-OIG 22-1-010 |
| Finance-system outage | UW's $340M Workday rollout: unpaid supplier invoices hit **$90M**; "Hundreds of research grants are stuck in processing limbo" | 2024-03-28 | [verified] The Register |

How we counted the Grant Witness rows: we downloaded each agency's full CSV
on 2026-10-24 and summed their own columns (prime awards only). Script and
output: `docs/research/sources/docs/grantwitness-csv-summary*.{py,txt}`.
Grant Witness is a volunteer, advocacy-adjacent project; its numbers are the
best public count, not an official one.

## 2. Why it's hard today, and what GrantGuard does

| Why it's hard | Evidence | GrantGuard feature | Demo moment |
|---|---|---|---|
| **No single source of truth.** Official lists disagree. | ~300 terminated NIH grants appeared in only one of NIH's two official sources; HHS stopped posting terminations to TAGGS; NSF's list hasn't updated since June 2025 [verified, Grant Witness] | Fund tracker reads RePORTER, USAspending and the Grant Witness list (our Apify scraper), keeps each reading with its source, and freezes and asks when they disagree | "Sources disagree" flag in the Inbox |
| **Status is never final.** Canceled, restored, appealed. | 85% of disrupted NIH awards restored; *Thakur* still at the Supreme Court [verified] | Status is a timeline of dated events with sources, not one field | Cancel, then court order: grant **stays frozen** |
| **A court order isn't a payment.** | NIH new awards ran at about half the usual pace in early 2026 [verified]; Grant Witness itself separates "confirmed" from "unconfirmed" reinstatements | Only a recorded payment unfreezes a grant | Purchase held until the payment lands, then it buys on its own |
| **Spending mistakes surface years later in audits.** | 94% of NSF audits; WVU end-of-award supplies [verified] | Purchase rules checked before buying: last-90-days, category, card limit, truly available money, cost splits | Supplies asked for in grant B's last 90 days rerouted to grant A, citing WVU |
| **Every drawdown needs a written defense.** | NIH GPS 6.1; COGR members get "dozens" of follow-ups [verified] | Payment request writer drafts the ≤1,000-character justification from purchase records and answers follow-ups with exact purchases | Draft with held invoice left out; human approves |
| **Labs can't see real balances.** | UC Senate letter; FDP "almost 60%" [verified] | Awarded / received / spent / promised / truly available per grant | Funds window |
| **ERP outages leave the books wrong.** | UW Workday $90M backlog [verified] | Lab-side ledger that reconciles invoices to orders | Invoice for a canceled order held with its timeline |

## 3. What already exists, and what's new

Checked 2026-10-24. "Not found" means we searched and found nothing, not
proof that nothing exists.

| What labs have today | What it does | What it doesn't do | Source |
|---|---|---|---|
| **University finance system** (e.g. Workday Grants Management) | A budget check can "limit spending on the award for specific worktags and in specific ledger accounts or summaries", and either block or warn on an overrun | Nothing in its budget-check documentation about allowable costs, timing rules, or the grant's status in outside sources. It checks the budget line, not whether the grant is canceled or whether its money has arrived | [verified] Workday admin guide (updated 2026-03-13) |
| **Grant Witness** | "An independent, up-to-date, grant-level record of federal science funding disruptions in the United States": a public list, dashboards, CSV | It's a record, not a control. No link to a lab's spending | [verified] grantwitness.org/nih |
| **Grant management platforms** | A vendor's own 2026 buyer's guide says post-award is "Where most GMS platforms are weakest. Post-award is where the most organizational risk sits." | (Most of these platforms serve funders handing out grants, not labs receiving them) | [verified, vendor source] AcceleratorApp buyer's guide 2026, p. 2 |
| **AI in research offices** | "A few compliance officers have used it to flag expenses that might violate a funder's regulations." | "In most cases, staff use of AI is left to individual discretion and occurs without a broader strategic framework"; "formal implementation and/or strategic planning about AI remain in the early stages of development." | [verified] Ithaka S+R issue brief, 2026-03-30 |
| | Cambridge's ai@cam is piloting "Copilot, ChatGPT, and Google NotebookLM" for "summarising funder guidance to checking eligibility and interpreting terms and conditions" | General-purpose chat tools, used before the award, on documents. They don't watch status or check spending | [verified] ai@cam project page (© 2026) |
| **NIH "Defend the Spend" justifications** | Written today by grant staff for every drawdown; COGR estimates "approximately 53,749 hours of redundant work for recipients and federal agencies" | **No tool found** that drafts NIH drawdown justifications. The only product hit was GoEngage, for Head Start agencies, not NIH | [verified, interested source] NCURA Magazine 2025 (COGR authors); search 2026-10-24 |
| **Other hackathon projects** | Most grant projects on Devpost help find or write grants (Grant Scout, Granted, GrantHarbor). Closest to us: **GrantLoop**, "Agents carry every budget commitment from application through award and spending to an audit-ready SF-425", and **GrantProof**, which "checks grant proposals, agreements and reports against the funder's rules" | Neither tracks cancellations and reinstatements across sources, holds spending until a payment actually arrives, or checks purchases against past audit findings. Only one "grant termination" hit (ConractIQ, aimed at hospitals) | [verified] Devpost search, 2026-10-24 (`docs/research/sources/devpost-scan*.txt`) |

**What only GrantGuard does, as far as we found:**

1. **Status from several sources, kept as a dated history.** It reads
   RePORTER, USAspending and Grant Witness, freezes the grant when they
   disagree, and **unfreezes only when a payment is recorded**, not when a
   court rules. Finance systems check the budget line; Grant Witness keeps
   a public record; neither changes what a lab can buy.
2. **Purchase checks based on real audit findings, before the money is
   spent.** The timing, category and cost-split rules each cite the
   NSF-OIG audit they come from. Today that
   kind of checking is "a few compliance officers" trying AI on their own.
3. **One agent team from status to payment request to progress report.**
   It drafts the NIH payment justification from purchase records; we
   found no tool that does this.

**Honest overlap:** finance systems already block overspending on a budget
line, and GrantLoop also tracks spending commitments through to reporting.
GrantGuard is not a finance system. It sits beside one and adds the
grant's real status and the audit rules.

## 4. Who benefits and how big the market is

| | Number | Source |
|---|---|---|
| US research universities (Carnegie R1 + R2) | **187 + 139 = 326** | [verified] Carnegie/ACE, 2025-02-13 |
| Institutions in the federal R&D spending census | 925 | [verified] NSF NCSES HERD FY2024, pub. 2026-02-10 |
| University R&D spending, all sources | **$117.7B** a year | same |
| ...federally funded | **"surpassed $64 billion"** | same |
| ...from HHS (includes NIH) | $35.5B | same |
| Number of US research administrators / grant managers | **No national count found.** (An NSF-funded 2024 workforce survey drew 2,441 responses; it is not a headcount.) | search 2026-10-24 |

The buyer is a university's sponsored-programs or department grant office.
The users are the grant manager (approves), the PI and lab staff (request
purchases), and central research administration (payment requests).

## 5. Our measured results (honestly scoped)

| Measurement | Result | What it measures, and what it doesn't |
|---|---|---|
| Scorecard (`eval/scorecard.json`, run by `./check.sh`) | **14 of 14 planted mistakes caught, 0 missed, 0 false alarms, 5 of 5 decoys passed.** Fund tracker 3/3, purchases 5/5, invoices 2/2, payment requests 1/1, progress reports 3/3 | A simulated lab (`sim/seed.json`) with mistakes we planted, modeled on real audit findings, scored against our own answer key. Claude answers come from saved responses or code fallbacks in this run, so it tests the rules and pipeline end to end, not live model judgment. **Not field results.** |
| Live cancellation-list scrape (our Apify Actor, `scrapers/`) | Grant Witness's NIH CSV, **5,776 rows → 5,635 grants**: 1,100 canceled (terminated or frozen), 2,301 reinstated, 2,234 unfrozen | Shows the tracker reads the real public list in seconds. Counts are per grant after we merge subawards, so they differ slightly from the prime-award counts in §1. As of 2026-10-24. |

## 6. Real voices

- "I won't believe it until ALL the funding has been disbursed" — r/AskAcademia, NEH grantee, 2026-07-17 [scrape] https://www.reddit.com/r/AskAcademia/comments/1t6xkif/comment/oy4plgs/
- "Even if it's not appealed, it's not obvious this ruling requires they pay funds." — r/AskAcademia, 2026-05-08 [scrape] https://www.reddit.com/r/AskAcademia/comments/1t6xkif/comment/oklkmg8/
- "Some believe an appeals court could reverse lower court decision to reinstate grants. IDK what is real anymore." — r/AskAcademia, NEH grantee, 2026-07-17 [scrape] https://www.reddit.com/r/AskAcademia/comments/1t6xkif/comment/oy4oph4/
- "...trying to figure out how to spend money from canceled vs reinstated awards..." — r/NIH, self-described NIH-side staff, 2025-11-12 [scrape] https://www.reddit.com/r/NIH/comments/1oqwz71/comment/nojbegh/
- "COGR members report receiving dozens of Defend the Spend email demands after submitting draw requests." — COGR (university association), ~May 2025 [verified]
- "...the intolerably high degree of uncertainty and the inability to accurately track balances in a timely fashion." — UC Academic Senate, 2022-07-19 [verified; older than 2 years]
- "Award recipients charged NSF for materials and supplies and equipment purchased near an award’s expiration date..." — NSF-OIG capstone, 2022-01-21 [verified]

## 7. Caveats

- FDP (2018), NSF-OIG (2022), UC Senate (2022) and UW Workday (2024) are
  older than two years; no newer equivalents found.
- Grant Witness, the *Thakur* plaintiffs' firm and members of Congress are
  interested sources. Court status changes fast; re-check docket 26-210
  before judging.
- No figure found for how many drawdowns were delayed by "Defend the Spend".

## 8. Sources

- Grant Witness CSVs: https://data.grantwitness.org/nih/dl-table.csv (and `/nsf/`, `/epa/`, `/cdc/`, `/samhsa/`, `/ahrq/`, `/noaa/`), downloaded 2026-10-24 · methodology: https://grantwitness.org/nih/updates/methodology · RePORTER vs TAGGS: https://grantwitness.org/nih/updates/2025-05-20-700-new-terminations · NSF list stale: https://grantwitness.org/nsf/updates/2026-05-27-new-nsf-terminations
- Supreme Court docket 26-210 (*Trump v. Thakur*): https://www.supremecourt.gov/docket/docketfiles/html/public/26-210.html
- SCOTUSblog, 2025-08-21: https://www.scotusblog.com/2025/08/supreme-court-allows-trump-administration-to-terminate-783-million-in-nih-grants-linked-to-dei-initiatives/
- Rep. Davids, 2026-06-03: https://davids.house.gov/media/press-releases/davids-d-fitzpatrick-r-seek-answers-delays-nih-research-funding
- CIDRAP on Patel, Liu & Jena (*JAMA Intern Med* 2026;186(1):126–128): https://www.cidrap.umn.edu/public-health/nih-grant-terminations-disrupt-hundreds-clinical-trials-affecting-more-74000
- FDP 2018 Faculty Workload Survey: https://thefdp.org/wp-content/uploads/FDP-FWS-2018-Primary-Report.pdf (text: `docs/research/sources/docs/fdp-2018-faculty-workload-survey.txt`)
- NSF-OIG 22-6-002: https://www.oversight.gov/sites/default/files/documents/reports/2022-01/22-6-002-Promising-Practices-NSF-Award-ManagementRedacted.pdf · WVU 22-1-010: https://nsf-gov-resources.nsf.gov/files/auditrep221010-wvu-r.pdf
- NIH GPS 6.1 (rev. March 2026): https://grants.nih.gov/grants/policy/nihgps/html5/section_6/6.1_nih_payment_review_process.htm
- COGR, Points to Consider: https://research.iastate.edu/wp-content/uploads/sites/3/2025/05/PointstoConsiderforReimbursementofExpenses68237c22751ca.pdf
- UC Academic Senate letter: https://senate.universityofcalifornia.edu/_files/reports/rh-md-oracle-software-problems.pdf
- The Register, 2024-03-28: https://theregister.com/2024/03/28/washington_uni_workday/
- Carnegie 2025: https://carnegieclassifications.acenet.edu/news/carnegie-classifications-release-2025-research-activity-designations-debut-updated-methodology/
- NSF NCSES 26-305 (HERD FY2024): https://ncses.nsf.gov/pubs/nsf26305
- Workday budget checks: https://doc.workday.com/admin-guide/en-us/education-and-government/grants-management/award-setup-and-management/award-budgets/hve1561071566150.html · Grant Witness: https://grantwitness.org/nih
- AcceleratorApp buyer's guide 2026 (vendor): https://resources.acceleratorapp.co/hubfs/Grant%20Management%20Software%20Buyers%20Guide%202026%20%E2%80%94%20AcceleratorApp.pdf (excerpt: `docs/research/sources/docs/acceleratorapp-2026-buyers-guide-excerpt.txt`)
- Ithaka S+R, AI Adoption in Research Administration at Emerging Research Institutions (2026-03-30): https://sr.ithaka.org/publications/ai-adoption-in-research-administration-at-emerging-research-institutions/ · ai@cam: https://www.ai.cam.ac.uk/projects/exploring-ai-in-research-grants-administration/
- NCURA Magazine, "The Administrative Burden of Defend the Spend" (Hope & Toups, COGR, 2025): https://www.cogr.edu/sites/default/files/2025-12/The%20Administrative%20Burden%20of%20Defend%20the%20Spend_NCURA%20Mag%202025.pdf (text: `docs/research/sources/docs/ncura-2025-defend-the-spend-burden.txt`)
- Devpost: https://devpost.com/software/grantloop · https://devpost.com/software/wateraid-x75h92 (GrantProof) · scans: `docs/research/sources/devpost-scan.txt`, `docs/research/sources/devpost-scan-2026-10-24.txt`
- Pain-point files with more detail: `docs/research/pain-points/01`, `02`, `06`–`10`
