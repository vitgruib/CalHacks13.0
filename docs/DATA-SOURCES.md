# Data sources: what each one says

Snapshot of `main` on Sat 10/24. Sources: `agents/src/sources/reporter.ts`,
`agents/src/sources/usaspending.ts`, `agents/src/sources/cancellations.ts`,
`agents/src/tracker/compare.ts`, `server/src/rules.ts`, `scrapers/README.md`,
and a live read of both demo grants on 2026-10-24. If one of those changes,
update this page.

The fund tracker (bookkeeping agent) reads three outside sources about each
of the lab's grants. Each one answers a different question, and none is
complete on its own. That's why the tracker compares them.

## 1. At a glance

| | NIH RePORTER | USAspending | Grant Witness list (Apify) |
| --- | --- | --- | --- |
| **Who keeps it** | NIH | US Treasury (federal spending records) | Grant Witness, a volunteer project |
| **Status** | yes: `active`, `ended`, `canceled` | **never** (always null) | yes: `canceled`, `restored_by_court`, `active` |
| **Amount awarded** | yes: sum of every award notice | yes: total obligated | no |
| **Amount paid out** | **no** | yes: total outlays (about 2 months behind) | no |
| **End date** | yes | yes | no |
| **Dated money actions** | award notices (for the year-by-year check) | obligations (for the year-by-year check) | no |
| **How it's looked up** | API query by core project number | API query by award ID built from the core number | download the whole list, match by core number locally |
| **Time (live, per check)** | 1–2 s per grant | 0.2–0.7 s per grant | about 1.6 s once (about 10 s more on "check now") |
| **Label in the database** | `NIH RePORTER` | `USAspending` | `Cancellation list (Apify)` |

"Core project number" means the NIH grant ID without the type prefix and
year suffix: `R01GM061721`, not `5R01GM061721-21`. The grant table's IDs are
core numbers. RePORTER and USAspending use the ID exactly as given, so a full
award number finds nothing (both return "no record", without a warning).
Only the list client turns full numbers into core numbers.

## 2. NIH RePORTER — what NIH says about the grant

**Says:**
- **Status.**
  - `canceled` when NIH's termination code (`TERMINATED_DEPT_AUTH`) is set on the latest fiscal-year record.
  - Otherwise `ended` if the end date has passed, or `active` if it hasn't.
  - If the termination code can't be read, status is null ("unknown"), not a guess.
- **Amount awarded:** the sum of every fiscal-year award for the core number, supplements included.
- **End date** of the latest record.
- **Each award notice** (date, amount, and whether it's a new or competing award that starts a new project period).

**Doesn't say:**
- How much money has actually been paid. `paid` is always null.
- That a court restored a grant. A restored grant shows as `active` once the termination code is gone from the latest record. The code can stay set on older years, so only the latest year is checked.

**How it's read:** two requests per grant, at most one request per second
(NIH's limit, shared by the whole process).
1. `POST api.reporter.nih.gov/v2/projects/search` with `project_nums: [<core number>]`. Only records whose `core_project_num` matches exactly are kept.
2. `GET reporter.nih.gov/services/Projects/ProjectInfo?projectId=<appl_id>` for the latest record. This is the undocumented service behind RePORTER's project pages, and it's the only place the termination code appears. The documented API has no termination field, and its `is_active` only covers the current budget period.

People's names (PIs, program officers) are never requested or saved.

## 3. USAspending — what money has actually moved

**Says:**
- **Amount obligated:** what the government has committed to the grant (`total_obligation`).
- **Amount paid out:** what has actually been drawn (`total_outlay`). It runs about two months behind the payments themselves.
- **End date** (period of performance).
- **Each obligation** (date, amount, modification number). $0 rows are paperwork (no-cost extensions, notices) and are skipped.

**Doesn't say:**
- Status. It never marks a grant terminated, so `status` is always null. This source never produces a cancellation or restoration.
- Older years reliably. They are often missing, so its total obligated can be lower than RePORTER's total awarded.

**How it's read:**
1. `GET api.usaspending.gov/api/v2/awards/ASST_NON_<core number>_075/`. The NIH core number is the award's federal ID (FAIN), and 075 is HHS's agency code. A 404 means "no such award" and is saved like any other answer.
2. `POST api.usaspending.gov/api/v2/transactions/` for that award ID, 100 rows per page, up to 20 pages.

Executive names and recipient contacts in the answer are dropped before saving.

## 4. Grant Witness list (Apify) — who has been canceled or restored

**Says**, for each grant on the list:
- **Status**, mapped to our words:

  | Grant Witness | Ours |
  | --- | --- |
  | Terminated, Frozen | `canceled` |
  | Reinstated | `restored_by_court` |
  | Unfrozen | `active` |

- **Date listed** (the termination or restoration date), and a link.
- If a grant has several rows, the one with the latest date wins.

**Doesn't say:**
- Anything about money or end dates.
- **Anything about grants that aren't on it.** A grant missing from the list gets no reading at all. "Not listed" doesn't mean "fine".

Restorations are kept on purpose: if only cancellations were listed, a
restored grant would drop off the list and the tracker would keep the old
`canceled`.

**Caveat:** Grant Witness is volunteer-run and advocacy-adjacent. It
works out terminations and restorations from RePORTER, TAGGS, USAspending and
court filings ([methodology](https://grantwitness.org/nih/updates/methodology)).
It's one opinion among three, which is the point: when it disagrees with
RePORTER, the grant manager decides.

**How it's read:** in two steps. Grant Witness has no per-grant lookup.
1. **The Apify Actor** (`scrapers/`, deployed as `nathanqiu/nih-grant-cancellation-list`) downloads Grant Witness's full download file, `data.grantwitness.org/nih/dl-table.csv` (25 MB, about 7.5 s; no HTML scraping). It turns every row into `{ grantId, status, url, listedOn, ... }`.
   - Full award numbers become core numbers.
   - A whole-award row beats a supplement row for the same grant.
   - On 2026-10-24 the list had 5,635 grants: 1,100 canceled, 2,301 reinstated, 2,234 unfrozen.
2. **The tracker** (`agents/src/sources/cancellations.ts`) downloads only those four fields once per check (about 40 KB gzipped) and picks out each lab grant's rows in memory. It reads, in this order of preference:
   - the dataset pinned by `GG_APIFY_DATASET`,
   - the latest successful run of `GG_APIFY_ACTOR` (needs `APIFY_TOKEN`),
   - `scrapers/out/cancellations.json`.

   On "check now" it first starts a fresh Actor run, waiting up to 60 s. If that run fails, it reads the latest run instead.

The scraper never writes to the database. Only the bookkeeping agent posts
readings.

**`GG_LAB_GRANTS` decides which grants the tracker can see from this source.**
If it's set, rows for any other grant are dropped before lookup, not just
from the saved copy. If it lists the wrong IDs, the lab's grants come back
"not listed".

## 5. How the tracker uses them together

Rules in `agents/src/tracker/compare.ts` and `server/src/rules.ts`:

- **A reading changes → a status event:**

  | Change | Event |
  | --- | --- |
  | RePORTER or the list says `canceled` | `canceled` |
  | The list says `restored_by_court` | `court_order` |
  | USAspending's paid-out total goes up | `payment_received` (with the amount) |
  | Amount awarded or end date changes | `reading_changed` (an earlier end date is called out) |

  A source that stops mentioning a field hasn't changed it: the last value it gave is kept.
- **Freeze.** A cancellation freezes spending. A court order alone doesn't unfreeze it. Only a later `payment_received` from USAspending (or the grant manager) does. In practice, RePORTER or the list says the grant is back, and USAspending says the money is back.
- **Status disagreement.** One source says funded (`active` or `restored_by_court`) and another says `canceled` or `ended`. That raises a `sources_disagree` flag, which freezes the grant and asks the grant manager which source is right.
- **Award gap.** RePORTER's award notices and USAspending's obligations are totaled by federal fiscal year and compared.
  - Only the current project period counts.
  - The last 45 days are skipped while USAspending catches up.
  - A difference of $1 or more raises `sources_disagree`.

## 6. Live read of the demo grants (2026-10-24)

| Grant | RePORTER | USAspending | Grant Witness list |
| --- | --- | --- | --- |
| R01GM061721 | `active`, $8,130,073 awarded | $5,912,827 obligated, $1,595,913 paid out | `restored_by_court`, listed 2025-09-22 (Thakur v. Trump) |
| R21AI182745 | `ended`, $450,375 awarded | $450,375 obligated, $369,060 paid out | not listed |

R01GM061721's awarded and obligated totals differ because USAspending is
missing older years. The award-gap check compares only the current project
period for that reason.

**The demo doesn't read these live by default.** The sim world uses these two
real grant IDs, but its cancel, court and payment timeline is simulated. The
real records would contradict it, so the three sources stay off unless
`GG_LIVE_SOURCES=1`. `scrapers/fixtures/demo-list.csv` is a list in Grant
Witness's format with R01GM061721 changed to the demo timeline (terminated
2026-03-10). It's our data, not Grant Witness's; say so whenever it's shown.

## 7. Field by field: exactly what we pull

Everything else in each answer is dropped before saving (people's names
included). The database stores only the four totals of a reading (`status`,
`awarded`, `paid`, `endDate`) plus a link; the dated money actions stay in
memory for the award-gap check.

| Source | Field we request | Becomes | Used for |
| --- | --- | --- | --- |
| RePORTER search | `appl_id` | the ID for the second request | finding the termination code |
| | `core_project_num`, `project_num` | exact-match filter; award-notice label | ignoring other grants; telling new/competing awards (type 1 or 2) from continuations |
| | `fiscal_year` | picks the latest record | status and end date come from the latest year |
| | `award_amount` | `awarded` (sum) and one award action per record | amount awarded; award-gap check |
| | `award_notice_date` | award action date | award-gap check (by fiscal year) |
| | `project_end_date` | `endDate`; `ended` once passed | status; "end date moved earlier" |
| RePORTER ProjectInfo | `post_award_action_type.revision_type_code` | `canceled` when it is `TERMINATED_DEPT_AUTH` | the only NIH-side cancellation signal |
| USAspending award | `total_obligation` | `awarded` | amount committed |
| | `total_outlay` | `paid` | **`payment_received` when it rises: the only unfreeze signal** |
| | `period_of_performance.end_date` | `endDate` | end date |
| USAspending transactions | `action_date`, `federal_action_obligation`, `modification_number` | one award action per non-$0 row | award-gap check |
| Grant Witness list | `Award ID` / `Most Recent Full Award Number` | `grantId` (core number) | matching |
| | `Detailed Status` | `status` (table in §4) | `canceled`, `court_order` |
| | `Earliest Disruption`, `Latest Restoration` | `terminatedOn`, `restoredOn`, `listedOn` | event dates; the demo time buttons |
| | `Restoration Indicators` | `restoredBy` (e.g. "Thakur v. Trump") | shown to people only; not used by rules |
| | `Grant Title`, `Grantee Organization`, `RePORTER` link, supplement | saved with the Actor's output | shown to people only |

## 8. Sources that would help

None of these are built. Ranked by how much each would close a gap above.
Adding one is a scope call for the team, and the client code is in
`agents/` (@nathan's lane).

| Source | What it adds | Who can see it | Fills which gap | Effort |
| --- | --- | --- | --- | --- |
| **HHS Payment Management System (PMS)** | Each drawdown and payment as it happens, plus holds on the account | **Only the university** (its PMS account; ID.me login). Not public | The biggest one: "money arrived" today instead of 1–2 months late from USAspending, and holds become visible instead of inferred | For a real customer: export or reports from the university's PMS account. For the demo: a fixture in PMS's shape |
| **University's own ledger** (sponsored-programs / ERP system) | What the lab actually spent, by grant | Only the university | Real spending to check against `available`; the sim stands in for it today | Per-university integration; out of scope for the hackathon |
| **NIH eRA Commons** (Notice of Award) | The official award letter: amount, budget period, terms, and termination notices | Only the university | NIH's own word on status and terms, without the undocumented ProjectInfo service | Grantee login; no simple public API |
| **CourtListener (RECAP)** | Court dockets and orders, by case | Public, free API (token for some endpoints) | A second, primary source for `court_order`, instead of relying only on Grant Witness's `Restoration Indicators` | Small: watch the few cases Grant Witness already names (e.g. Thakur v. Trump). Matching an order to a specific grant still needs the case's grant list |
| **SAM.gov Exclusions API** | Whether a vendor is barred from being paid with federal money | Public; free API key | A new purchase/invoice rule: hold payments to an excluded vendor | Small: one lookup per vendor, by UEI. Name-only matches need a person to confirm |
| **HHS TAGGS** | HHS award actions, updated daily | Public | Faster notice of new or reduced obligations than USAspending | Medium. Records obligations, not payments, so it can't replace USAspending outlays; its termination signals are unreliable (§ caveat in the Grant Witness methodology) |
| **NSF / other agencies' award data** (and Grant Witness's NSF list) | The same three questions for non-NIH grants | Public | Labs with NSF grants | Medium: another client per agency |

Notes on how sure we are:
- PMS: a 2022 HRSA training deck describes PMS reports showing a recipient's
  payment transactions and its award authorizations, downloadable to Excel
  (https://Hrsa.gov/sites/default/files/hrsa/rural-health/grants/manage/june-2022-session-4-managing-award.pdf).
  Read through a search summary, not checked word for word. Access needs a
  PMS account (https://pms.psc.gov/grant-recipients/welcome.html).
- TAGGS "tracks obligated grant funds … at the transaction level" (HHS data
  quality document,
  https://www.hhs.gov/sites/default/files/os_tracking_accountability_in_government_grants_system_dqdar.pdf).
  Read through a search summary.
- CourtListener RECAP API: https://www.courtlistener.com/help/api/rest/v4/recap/
- SAM.gov Exclusions API (GSA, v4): https://open.gsa.gov/api/exclusions-api/

**Recommendation.** For the demo, none are needed. For the pitch, PMS is the
answer to "what about the 1–2 month lag?": a real university already has
this data for its own grants, so Grant Test Auto would read it and drop the lag.
CourtListener and SAM.gov are the two that could actually be built in a few
hours: CourtListener strengthens the court-order story, and SAM.gov adds a
rule judges would recognize.

## 9. Left out on purpose: HHS TAGGS (talking point)

**If a judge asks "why not TAGGS?"** — *"TAGGS is HHS's own grant
tracking system. We looked at it and left it out: it records what HHS
committed, not what it paid, so it can't tell us the money arrived. Its
termination flags are unreliable enough that Grant Witness, which tracks
this full-time, doesn't use them either. USAspending's payments answer the
question we actually care about."*

What TAGGS (Tracking Accountability in Government Grants System,
taggs.hhs.gov) is: HHS's public database of award actions for every HHS
grant, NIH included, updated more often than USAspending.

Why we left it out:
- **It records obligations, not payments.** TAGGS "tracks obligated grant
  funds … at the transaction level" (HHS data quality document, read through
  a search summary:
  https://www.hhs.gov/sites/default/files/os_tracking_accountability_in_government_grants_system_dqdar.pdf).
  Our freeze rule needs money actually paid, which only USAspending's
  outlays give us. TAGGS would duplicate what RePORTER and USAspending
  already say about amounts.
- **Its termination signal is unreliable.** From Grant Witness's methodology
  (https://grantwitness.org/nih/updates/methodology), verbatim:
  - "TAGGS data does contain a signal of termination—a "TERMINATION" action
    type—however, it is not always clear what this means."
  - "Because TAGGS data only shows awards by FAIN and not full award number,
    it is unclear when a "TERMINATION" event indicates only a supplement has
    been terminated."
  - "Sometimes, the "TERMINATION" flag is added to a deobligation event after
    a termination as well."
  - "when they were first introduced, we saw them back-filled to past actions"
  - "we do not use the addition or removal of a "TERMINATION" flag in TAGGS
    data as a signal for termination for NIH or AHRQ awards."
- **Its terminated-grants PDF got worse.** Grant Witness parses HHS's weekly
  PDF of terminated awards (`taggs.hhs.gov/Content/Data/HHS_Grants_Terminated.pdf`)
  as one signal. HHS stopped adding to it and removed entries (pain point
  01), and since 2026-02-20 it no longer carries full award numbers.
- **Grant Witness already reads it for us.** Anything useful TAGGS says about
  terminations already reaches us through the Grant Witness list.

What we gave up: earlier notice of a new, cut or reduced obligation than
USAspending gives. That's the case for adding it later. It still wouldn't
replace USAspending, because it doesn't show payments.
