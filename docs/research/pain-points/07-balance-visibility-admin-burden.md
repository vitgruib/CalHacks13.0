# 07. PIs can't see trustworthy grant balances; admin eats their time

**Status:** new
**One-liner:** Researchers spend ~44% of research time on admin, and the
finance fix they want most is accurate, timely reports of how much grant
money is left.

## What happens (plain language)
Managing grant budgets, purchases and approvals is one of the most common and
heaviest burdens for lead researchers, and university systems don't show
reliable real-time balances.

## Everyday analogy
Running a household where your bank only tells you your balance once a month,
and sometimes it's wrong.

## Evidence (FDP 2018 Faculty Workload Survey, n = 11,167 PIs, ~20% response; report ©2020)
Primary text: `sources/docs/fdp-2018-faculty-workload-survey.txt`
- 44.3% of research time goes to requirements/admin (42.3% in 2005/06 and 2012). [verified]
- Post-award admin ("Purchasing supplies/equipment, supervising budgets,
  managing project personnel, complying with regulations…") = 13.7% of research time. [verified]
- 73% of PIs handling project finances say it's a substantial workload (67% in 2012). [verified]
- Of 2,719 PIs wanting finance fixed: ~60% rate "transparent, accurate, and
  timely reports of grant expenditure balances" high priority; 50%
  expenditure approvals/justifications; just under 50% "grant-related
  purchasing procedures." [verified]
  https://thefdp.org/wp-content/uploads/FDP-FWS-2018-Primary-Report.pdf
- NASEM 2016: several universities spend "$500,000 and $1 million annually on
  effort reporting"; audit response "$300,000 to $1 million per campus".
  [agent-reported; recheck wording] https://www.nationalacademies.org/read/21824/chapter/8
- University of Arkansas told PIs to subtract Workday transactions from legacy
  balances by hand during a cutover. [unverified]
  https://news.uark.edu/articles/54142/grant-balance-update-from-the-office-of-sponsored-programs

## Quotes
- "Administration of project finances had the dubious distinction of being one of the most prevalent and most workload heavy areas that is also among the most common to be rated as a high priority for change." — FDP report (Sandra L. Schneider, PI), ©2020 — [verified]
- "Every minute that I spend doing administrative work is a minute I can't spend writing a grant or doing research that lets me write a grant." — Doug Fowler, UW genome sciences professor, Washington State Standard, 2026-09-16 — [agent-reported] https://washingtonstatestandard.com/2026/09/16/profs-and-staff-give-uw-a-failing-grade-for-budget-and-bureaucracy-troubles/
- "The campuses are experiencing caution in PI spending from contracts and grants, especially from junior faculty, due to the intolerably high degree of uncertainty and the inability to accurately track balances in a timely fashion." — UC Academic Senate (CCGA chair Andrea Kasko), 2022-07-19 — [verified] `sources/docs/uc-senate-2022-oracle-letter.txt`

## What our product does about it
Real-time per-grant balance computed from our own purchase ledger (see
`visa-pipeline.md`), reconciled against the university/federal numbers.

## Gaps / caveats
- Survey is from 2018; the 2024 FDP survey wasn't checked.

## Corrections
- 2026-10-24 (@ethan/claude-evidence): the "73% of PIs handling project
  finances say it's a substantial workload" line overstated the source. The
  FDP report says "increasing from about 67% to 73% reporting substantial
  workload from project personnel and project finances", i.e. the two
  responsibilities together, not finances alone. Cite it that way. Also: no
  newer FDP survey wave (2024) was found in a search on 2026-10-24.
