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
