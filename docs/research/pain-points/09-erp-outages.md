# 09. University finance-system rollouts freeze purchasing and billing

**Status:** supporting (context only; no feature)
**One-liner:** When a university switches finance systems (Workday,
Oracle), vendors go unpaid, labs can't buy supplies, PIs can't see balances,
and sponsors don't get billed.

## What happens (plain language)
Grant money flows through the university's accounting system. Botched
migrations leave months of unreconciled transactions; faculty pay out of
pocket and the university may fail to bill the government at all.

## Everyday analogy
Your bank switches software and for six months your card works sometimes,
your statements are wrong, and your employer forgets to pay you.

## Evidence
- University of Washington Workday (launched 2023-07-06, $340M project):
  unpaid vendor backlog $90M by mid-Aug 2023 ("around two-thirds of the total
  amount invoiced since the launch"), $71M ~Oct 2023, $43M end of Feb 2024. [agent-reported]
  https://www.seattletimes.com/business/uw-is-spending-340-million-on-an-it-upgrade-its-not-going-well/
  · https://theregister.com/2024/03/28/washington_uni_workday/ ("Hundreds of research grants are stuck in processing limbo")
- UW Faculty Senate survey: 39% of grant-dependent faculty applied for fewer
  grants due to Workday; 59% considered leaving. [unverified]
- UC Merced / UC San Diego Oracle: slower procurement, inability to see grant
  balances, late invoicing, "even return of unexpended funds." [verified]
  `sources/docs/uc-senate-2022-oracle-letter.txt`
  https://senate.universityofcalifornia.edu/_files/reports/rh-md-oracle-software-problems.pdf
- UW Research: "in some cases, participants have gone unpaid for many weeks." [unverified]
  https://www.washington.edu/research/announcements/for-the-record-august-17-2023

## Quotes
- "We're all told that 'This is going to get better, don't worry,' but it's reached a stage now where it's adversely affecting the operations of faculty." — Arthur Nowell, UW School of Oceanography, Seattle Times, ~Oct 2023 — [agent-reported]
- Paying local research collaborators with cashier's checks from her personal bank account "is not a great use of a principal investigator's time, but we want to be a responsible collaborator to folks in the community and that was the fastest way we could do that." — Jennie Romich, UW School of Social Work, same article — [agent-reported]
- UW's vice provost for research (Mari Ostendorf) acknowledged "critical capabilities for research that are not fully functional" and was "concerned about the potential for unanticipated costs, lost opportunities, audit risks and compliance violations." — email quoted in same article — [agent-reported]
- "All the people we've been working with have tried hard, but the system isn't set up to succeed, and we may lose the money, which means that people would get let go immediately." — Doug Fowler, UW (his $3M/yr grant renewed but UW "hasn't been billing the feds"), Washington State Standard, 2026-09-16 — [agent-reported] https://washingtonstatestandard.com/2026/09/16/profs-and-staff-give-uw-a-failing-grade-for-budget-and-bureaucracy-troubles/
- "$500 in outstanding reimbursements represents more than ten percent of a typical postdoctoral scholar's monthly salary." — UC Academic Senate letter, 2022 — [verified]

## What our product does about it
A lab-side ledger that doesn't depend on the ERP being healthy, reconciling
our own purchase records against whatever the ERP eventually posts.
