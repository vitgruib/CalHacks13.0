# 16. A grant's real status has to be pieced together by hand

**Status:** core
**One-liner:** No single government system says both "is this grant on?"
and "can the money actually be drawn?". The people who track it best do it
by hand, crossing NIH RePORTER, USAspending and other systems, the same way
GrantGuard's fund tracker does it automatically.

## What happens (plain language)
- NIH's grant database (RePORTER) says whether NIH lists a grant as terminated.
- The federal spending database (USAspending) says how much money was committed and paid out, one to two months late.
- The payment system (PMS) decides whether a university can actually draw the money, and nobody outside can see it.
- A grant can be "active" in NIH's system while its money is blocked, or "restored" by a court while no money moves.

The volunteers who built the most-cited tracker (Grant Witness) treat a
restoration as real only once USAspending shows money flowing again. In
court, under oath, one of them called these databases "technically public"
but "difficult to access and interpret".

This is the complaint behind GrantGuard's design, and confirmation that the
design copies how the real system works. Related: 01 (no complete list), 02
(status reversals), 06 (awarded vs paid), 10 (drawdown justifications).

## Everyday analogy
Your bank app says the account is open, the court says the freeze was
lifted, but your card still declines. The only way to know is to watch your
statement for money moving, and the statement is a month or two behind.

## Evidence

### It's the real system: how GrantGuard's sources line up with practice

| GrantGuard assumes (`docs/DATA-SOURCES.md`) | Confirmed by |
| --- | --- |
| RePORTER's termination flag is the NIH-side status signal, and it needs checking | Grant Witness snapshots RePORTER and uses the "Terminated - Departmental Authority" flag being added or removed as its termination and reinstatement signal, with manual review. [verified] https://grantwitness.org/nih/updates/methodology |
| USAspending outlays show whether money actually moves, monthly | Grant Witness uses USAspending File C "primarily for outlay actions"; File C "is released roughly once a month". [verified] same page |
| A court order doesn't count until money moves (the freeze rule) | Grant Witness: "Reinstatements are confirmed by verifying that an award has received outlays since the reinstatement." [verified] same page. Physics Today: Grant Witness won't label a grant "fully reinstated" without proof "through USAspending.gov of returned money flow". [verified] https://physicstoday.aip.org/news/a-crowdsourced-database-tracks-us-science-grant-cancellations |
| The three sources together, compared | Delaney's sworn declaration: Ross "scour[ed] federal databases, including NIH RePORTER, USASpending.gov, and the HHS TAGGS system". A grant budget "prematurely changed to $0" on USAspending was "one piece of evidence" of termination. [verified] `sources/docs/delaney-2025-declaration-excerpt.txt` |
| The Grant Witness list is widely used | "widely used by journalists, lawyers, congressional staff, and universities." [agent-reported] Harvard Chan School news, 2025-07-31, https://hsph.harvard.edu/news/creating-a-trusted-database-of-federal-research-funding-cuts |

### The system is contrived: complaints

- The government's first termination list was "both incomplete … and
  somewhat inaccurate (i.e., it listed some grants twice and appeared to
  include a grant that had not yet been terminated)". [verified] Delaney
  declaration ¶6, filed 2025-04-25.
- NIH posted conflicting information about the extent of the cuts, which is
  why the tracker was started (Ross, paraphrased by Physics Today). [verified]
  Physics Today, 2025-09-04.
- "Active in the NIH system" and "money can be drawn" are separate questions.
  Payment holds (PMS "hard funds control") block draws on awards NIH lists as
  active. [verified] Minnesota Daily 2025-07-20; [scrape] r/NIH (quotes below).
- GAO found that USAspending's unique award key "did not always result in a
  complete and accurate display of financial assistance award information".
  19 agencies left out the file that links budget and award data. Treasury
  fixed the award key in August 2025. Dated (report from 2021). [agent-reported]
  https://www.gao.gov/products/gao-22-104702

## Quotes

- "These federal databases, while technically public, are difficult to access and interpret." — Scott Delaney, Harvard Chan research scientist, Grant Witness co-creator, sworn declaration in *APHA v. NIH*, filed 2025-04-25 — [verified] https://assets.aclu.org/live/uploads/2025/05/038-27-Exhibit-27-Declaration-of-Scott-Delaney.pdf (interested source: filed for the plaintiffs)
- "This lack of government transparency raised challenges for the health science research community." — Scott Delaney, same declaration ¶4 — [verified]
- "It's important to make sure that not only is the grant active in the NIH system, but also the payment management system is allowing the money to flow out the door," / "We know right now that the payment management system is holding up tons of grants." — Scott Delaney, Minnesota Daily, 2025-07-20 — [verified] https://mndaily.com/top-story/umn-sees-nih-grants-restored-amidst-court-rulings/07/20/2025/eicmndaily-com/
- "Frankly, we don't believe it until we see it," — Noam Ross, rOpenSci executive director, Grant Witness co-creator, on restorations, Physics Today, 2025-09-04 — [verified] https://physicstoday.aip.org/news/a-crowdsourced-database-tracks-us-science-grant-cancellations
- "Whether or not the funding ever truly gets reinstated for my grant—and I would like that it is—it's important, given the complexities, to make sure these things go from a court order to reality." — Nancy Krieger, Harvard Chan professor, quoted by Harvard Chan School news (from the Boston Globe), 2025-08-07 — [verified] https://hsph.harvard.edu/news/after-some-federal-funds-restored-researchers-struggle-to-restart-projects
- "This is a good problem to have, the funding's come back, but could it disappear again? You don't know," — David Greenstein, University of Minnesota biology professor, Minnesota Daily, 2025-07-20 — [verified] URL above
- "Is NIH RePORTER a reliable source for determining if the grant is terminated?" — r/NIH commenter, 2025-05-28, answering advice to "First determine if the grant is actually terminated in the NIH system" — [scrape] https://www.reddit.com/r/NIH/comments/1kwm9so/move_frozen_terminated_grants_to_other/mumycux/
- "We've been told that there are a select group of universities have a Hard Funds control placed on them by the Payment Management System (PMS). This means that that existing funds awarded that have not yet been drawn down, are not accessible." / "We are completely in the dark. Those at the highest levels are getting more information from Reddit than anywhere else." — r/NIH commenter writing as NIH staff (role not verified), 2025-04-30 — [scrape] https://www.reddit.com/r/NIH/comments/1k7uloc/as_harvard_battle_escalates_hhs_directs_nih_not/mprhf6a/
- "The institutions have what's called a "hard funds control" at the payment management system (PMS) level Placed on them. No funds can be drawn down and no competing or non competings awards are being released." — r/NIH commenter, 2025-05-22 — [scrape] https://www.reddit.com/r/NIH/comments/1kqgfnt/this_is_not_normal_nih_freeze_for_northwestern/mtnr86h/
- "We thought Project 3 was solely terminating but the letter we got from Michelle Bulls was the full award." — r/NIH, self-described research administrator at UW Madison, 2025-03-21 — [scrape] https://www.reddit.com/r/NIH/comments/1jgozbd/comment/mj1up7l/

Raw text: `sources/docs/delaney-2025-declaration-excerpt.txt`,
`sources/docs/restored-grants-payment-news-2025.txt`,
`sources/reddit/r-nih-data-sources.txt`.

## What our product does about it
The fund tracker does what Grant Witness's volunteers do by hand:
- It reads RePORTER (status), USAspending (obligated and paid out) and the Grant Witness list for each lab grant, daily and on demand.
- It keeps every source's answer side by side and flags disagreements to the grant manager.
- It keeps spending frozen after a court order until USAspending shows a payment.

See `docs/DATA-SOURCES.md` and `money-cycle.md`.

## Gaps / caveats
- **PMS is invisible to us too.** The payment system's holds aren't public. GrantGuard sees money move only through USAspending outlays, one to two months late, so it can't see a hold directly. It sees the absence of payments.
- **Mostly 2025 sources.** Most evidence is from the 2025 termination wave. Grant Witness reports new terminations have been quiet in 2026 (see 01).
- **Interested sources.** Delaney and Ross run Grant Witness and Delaney's declaration was filed for the plaintiffs. They are the best-placed witnesses to how the data works, but not neutral on the policy.
- **Reddit roles are self-described** and unverified.
- **No complaints found in the saved Reddit scrapes about USAspending itself.** The GAO report is the evidence on its data quality, and it's from 2021.
- **To verify before a slide:** the Axios piece "NIH grantees may face long waits for restored money" (2025-06-24) returned 403 and wasn't read. The PNAS 2026 study matching Grant Witness against RePORTER was seen only in search summaries. [unverified]
