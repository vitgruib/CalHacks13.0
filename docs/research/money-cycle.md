# Where the money cycle goes out of sync

A federal grant's money passes through five phases, and each phase is
recorded by a different system. This file lists what goes wrong between
each pair of phases, how GrantGuard combines its three public sources,
and a proposed reliability score for each grant. Written 2026-10-24
(@ethan/claude). Follow the rules in [`README.md`](README.md).

The "Real example" lines come from our own reads of the public APIs on
2026-10-24 for the sim's two real grant IDs. Raw figures:
[`sources/docs/money-cycle-api-reads-2026-10-24.txt`](sources/docs/money-cycle-api-reads-2026-10-24.txt).
They're tagged `[verified, our read]`. Remember that the sim's
cancel, court and payment *timeline* is invented (`sim/README.md`); only the
grant IDs and the public records below are real.

## The five phases

| # | Phase | What happens | Who records it | Public? |
|---|---|---|---|---|
| 1 | **Award** | NIH issues a Notice of Award for a budget year | NIH RePORTER (one record per fiscal year) | Yes |
| 2 | **Obligation** | The money is committed on the government's books | USAspending (obligations) | Yes |
| 3 | **Payment** | The university draws cash from the federal Payment Management System, with a written justification | USAspending (outlays, reported by the agency) | Yes, with a lag |
| 4 | **University books** | The grant office posts charges to the grant's account | The university's finance system | No |
| 5 | **Lab spending** | Orders, invoices, payroll, money promised but not yet billed | Lab and department records | No (simulated in our demo) |

Across all five sits **status**: canceled, restored by a court, ended. Grant
Witness, RePORTER's termination flag and, until it stopped, HHS TAGGS all
record status, and they don't always agree.

## Gaps between phases

### 1 → 2: Award vs obligation. "Awarded" means different things in each source
- **The two public totals cover different years.** RePORTER adds up every
  fiscal year it holds; USAspending's award covers fewer years and subtracts
  money taken back.
  Real example: for R01GM061721, RePORTER lists $8,130,073 over FY2000–2025,
  and USAspending lists $5,912,827.46. The $2.2M gap is RePORTER's FY2000–2007
  records plus a −$75,911.54 deobligation on 2022-03-01 that RePORTER doesn't
  show. Once those are accounted for, the two agree within $41.
  `[verified, our read]`
- **Neither total is what a lab can spend now.** The lab can only spend the
  current project period (for this grant, FY2022 onward). A tool that copies
  a source's "awarded" figure overstates the budget.
  Real example: FY2022–2025 adds up to $2,098,030, about a quarter of
  RePORTER's total. `[verified, our read]`
- **One grant can be paid from two institutes' accounts.** RePORTER shows one
  grant, while USAspending splits it across NIGMS (075-0851) and NIA
  (075-0843), because one supplement came from NIA. `[verified, our read]`
- **An award notice doesn't mean the grant is live.** NIH issued R01GM061721's
  FY2025 continuation ($429,221) on 2025-08-07, a week *after* the
  2025-07-31 termination date that Grant Witness lists. `[verified, our read]`

### 2 → 3: Obligated isn't paid
- **Obligations and outlays are tracked separately.** Headlines often mix them up. `[verified]`
  https://www.gfoa.org/tracking-federal-award-obligations
- **Payment data lags by about two months.** USAspending refreshes about
  every two weeks, and agencies have 30 days to report (pain point
  [06](pain-points/06-awarded-vs-paid.md)). `[verified]`
  Real example: on 2026-10-24, the newest outlay period for R01GM061721 is
  August 2026. `[verified, our read]`
- **Payments really did stop and restart.** The money flow matches the story
  in our demo.
  Real example: R01GM061721's payouts were still rising in July 2025, stayed
  flat in August and September 2025 (after the 2025-07-31 termination), and
  resumed by November 2025 (after the 2025-09-22 reinstatement). The
  FY2025 $429,221 was then paid out month by month from December 2025 to July
  2026. `[verified, our read]`
- **A payout line can appear before its obligation is recorded.** A new
  NIGMS payout line started in July 2026 ($38,279 by July, $81,447 by
  August), but no FY2026 obligation shows in the transaction list yet.
  `[verified, our read]`
- **A grant can end with money unpaid, for reasons you can't see.**
  Real example: R21AI182745 ended 2026-08-31 with $369,060.38 of $450,375
  (82%) paid out. Public data can't tell whether the rest is unspent, not yet
  drawn, or just not reported yet. `[verified, our read]`
- **Reinstated grants keep adding obligations and outlays,** so their totals
  keep moving after a court order. `[verified]`
  https://grantwitness.org/nih/updates/2026-06-22-new-nih-award-value

### Status vs money: a court order isn't a payment
- **Status sources disagree with each other.** About 300 terminated NIH
  grants appeared in only one of NIH's two official sources. HHS stopped
  posting terminations to TAGGS, and terminations in RePORTER can't be
  searched or read through its API. `[verified]` Pain point
  [01](pain-points/01-no-source-of-truth.md).
- **Status dates differ by source.**
  Real example: Grant Witness dates R01GM061721's termination 2025-07-31 and
  its reinstatement 2025-09-22. USAspending shows $0 "non-financial" actions
  on 2025-12-02 and 2026-05-04 instead, and RePORTER's latest record now
  carries no termination flag. `[verified, our read]`
- **RePORTER's termination flag can stay on an older year** after a court
  restores the grant, so only the latest record counts (noted in
  `agents/src/sources/reporter.ts`; Grant Witness also checks each flag
  change by hand because flags change for unrelated reasons). `[verified]`
  https://grantwitness.org/nih/updates/methodology
- **Restored on paper doesn't mean paid.** Grantees say "I won't believe it
  until ALL the funding has been disbursed" `[scrape]`. *Thakur v. Trump*, the
  case behind R01GM061721's reinstatement, is pending at the Supreme Court
  (docket 26-210) `[verified]`. Pain point
  [02](pain-points/02-status-reversals.md).

### 3 → 4: Payment vs university books
- **Every drawdown now needs a written justification** of up to 1,000
  characters, reviewed in NIH's "Defend the Spend" system, so cash can be
  held up after the money is obligated. `[verified]` Pain point
  [10](pain-points/10-drawdown-justification.md).
- **Finance-system rollouts can freeze purchasing and billing for months.**
  (Context only.) Pain point [09](pain-points/09-erp-outages.md).

### 4 → 5: University books vs the lab
- **Labs can't see their real balance.** About 60% of PIs who want finance
  fixed rate "transparent, accurate, and timely reports of grant expenditure
  balances" a high priority. `[verified]` Pain point
  [07](pain-points/07-balance-visibility-admin-burden.md).
- **Promised money isn't on the books yet.** Orders placed but not yet
  invoiced still use up the grant, so "spent" understates what's gone.
  GrantGuard tracks this as *promised*.
- **Charges land on the wrong grant and get fixed late.** NIH wants cost
  transfers done within 90 days; WashU's Single Audit found transfers 8 to 16
  days late. `[agent-reported]` Pain point
  [08](pain-points/08-unallowable-purchases-audits.md).
- **Purchases near a grant's end get disallowed.** At WVU, $17,335 for
  supplies bought near or after the award's end was disallowed. `[verified]`
  Same file.

## How GrantGuard combines the three sources

The bookkeeping agent's fund tracker (`agents/src/agents/bookkeeping.ts`,
rules in `agents/src/tracker/compare.ts`; the freeze itself is in
`server/src/rules.ts`) works like this:

1. **Each source reports separately.** Each one returns a reading for one
   grant with `status`, `awarded`, `paid` and `endDate`, using null for
   anything it doesn't cover:

   | Source | status | awarded | paid | endDate |
   |---|---|---|---|---|
   | Cancellation list (Grant Witness, via Apify) | ✓ | – | – | – |
   | NIH RePORTER | ✓ (termination flag) | ✓ (sum of all years) | – | ✓ |
   | USAspending | – | ✓ (obligated) | ✓ (outlays) | ✓ |

2. **Nothing gets averaged.** Every reading is saved with its source. If a
   source stops mentioning a field, its last value is kept, so a flaky source
   doesn't look like constant change.
3. **Changes become dated events, each naming its source:**
   - a status of canceled becomes `canceled`;
   - restored by a court becomes `court_order`;
   - a rise in USAspending's paid-out total becomes `payment_received`, with the amount.
4. **The freeze rule reads those events in date order.** A cancellation
   freezes the grant. A court order changes the status but keeps it frozen.
   Only a payment after the cancellation, or the grant manager, unfreezes it.
5. **Disagreements go to the Inbox.** If the latest readings conflict (one
   source says canceled while another says active or restored), the tracker
   raises a `sources_disagree` flag. That freezes the grant and asks the
   grant manager which source is right. "Active" and "restored by a court"
   both count as funded, so they don't conflict.

In short:
- Grant Witness says what happened to the status.
- USAspending says whether the money moved.
- RePORTER is NIH's own record, used as a cross-check on both.
- Status decides when to freeze, and only money decides when to unfreeze.

### What it doesn't do yet (found while writing this)
- **"Awarded" is never compared across sources.** A naive comparison would
  raise a false alarm on R01GM061721 every time, because of the window gap
  above.
- **RePORTER's "awarded" is a lifetime total** ($8.1M for R01GM061721), not
  the current project period. The app's balances come from the seed, not
  from RePORTER, so the demo isn't affected. But it would matter once live
  sources feed balances.
- **Payments are seen only as a rise in USAspending's total**, which lags by
  about two months. The month-by-month outlays endpoint shown above is
  more detailed, but the worker doesn't read it.
- **A grant missing from Grant Witness is treated as no information**, not
  as "fine". That's correct, because the list only holds disrupted grants.

## A reliability score for each grant (proposal; not in the app)

How much can you trust what public data says about a grant? Each of four
checks scores 0, 1 or 2:

| Check | 2 | 1 | 0 |
|---|---|---|---|
| **Status agreement** | Two or more sources speak and agree | Only one source speaks | Sources disagree |
| **Amount agreement** | RePORTER and USAspending totals match | They differ, but the gap is explained | Unexplained gap |
| **Payment visibility** | Recent payouts that fit the status | Payouts present but stale or incomplete for the status | No payment data |
| **Status stability** | Never disrupted | Disrupted, then settled | Its current status rests on a pending appeal |

Scored by hand from the 2026-10-24 reads:

| Grant | Status | Amount | Payment | Stability | **Score** | Main risk |
|---|---|---|---|---|---|---|
| R01GM061721 | 2: RePORTER active, Grant Witness restored | 1: $8.13M vs $5.91M, explained | 2: payouts resumed after reinstatement; latest is Aug 2026 | 0: *Thakur* pending at the Supreme Court | **5 / 8** | A Supreme Court ruling could cancel it again |
| R21AI182745 | 1: only RePORTER says "ended"; not on Grant Witness | 2: $450,375 in both | 1: ended with 18% not paid out, cause unknown | 2: never disrupted | **6 / 8** | Unexplained unpaid remainder at closeout |

These scores describe the **real** public records. They aren't the sim's
scripted state, where R01GM061721 is frozen until a simulated payment arrives.

## Gaps / caveats
- USAspending outlays are fiscal-year-to-date per account line, and we read
  them by hand. We didn't confirm which line belongs to which budget year
  beyond matching the $429,221 amounts.
- We didn't confirm how many years USAspending's paid-out total covers, only
  that its obligations start at FY2008 for this grant.
- The scoring rubric is ours, untested on other grants, and not yet built
  into the app.
