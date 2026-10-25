# Pitch brief: Grant Test Auto (single source for building the pitch)

Purpose: one file an AI (or a person) can read to write the 3-minute pitch,
slides, Devpost text or judge Q&A. It maps every judging criterion we face
(general Cal Hacks criteria, Hyphenate, **Microsoft**, and the other tracks
we enter) to concrete evidence in the current build.

Compiled 2026-10-25 from the repo at commit `380012b` and later (README,
DECISIONS, eval output, `docs/submission/IMPACT-EVIDENCE.md`,
`docs/research/`). **Where this file and older drafts disagree, this file
reflects the current build** (see "Stale claims" below).

Tag legend, same as `docs/research/README.md`:
- `[verified]` we opened the primary source
- `[scrape]` verbatim text saved in `docs/research/sources/`
- `[ours]` our own measurement; scope stated next to it
- `[gap]` something judges may ask for that we don't have yet; don't claim it
- `[eval WIP]` an evaluation result that is still being worked on; **don't use it** in the pitch, slides, Devpost or Q&A

> **EVALS ARE A WORK IN PROGRESS. DO NOT USE THEM YET.** Every scorecard and
> real-audit replay number in this file (planted mistakes caught, decoys,
> false alarms, real findings caught/missed) is tagged `[eval WIP]`. Don't put
> any of them in the pitch, slides, Devpost text or judge answers until the
> team says the evals are final and this banner is removed. You may say *that*
> we evaluate (replay against an answer key, counting misses and false alarms
> on decoys), not *what it scored*.

---

## 0. Fast facts (machine-readable)

```yaml
project: Grant Test Auto
formerly: GrantGuard   # infra IDs still say grantguard (database, Azure VM, service)
one_liner: >
  An AI grant office for a university research lab: agents track every
  grant's real money and status and check every purchase request and
  invoice, and one human grant manager approves each one with the reason
  in front of them.
problem_one_sentence: >
  Since 2025 a lab's grant can be canceled, restored by a court, and still
  not pay a cent, while the official sources disagree about which is true.
seat_filled: >
  The grant accountant in a university lab's grant office, reporting to one
  human grant manager who approves every purchase and every invoice.
users:
  - grant manager (approves; the judge plays this role in the demo)
  - researchers / lab staff (ask to buy, submit invoices) via their own portals
buyer: a university's sponsored-programs or department grant office
demo_moment: >
  A court restores a canceled grant; Grant Test Auto still flags spending on
  it until the money actually arrives, then every rule passes and the grant
  manager can approve.
live_url: https://calhacks130.vercel.app
repo: https://github.com/vitgruib/CalHacks13.0
stack:
  database: SpacetimeDB 2.13.0, TypeScript module, hosted on maincloud (20+ tables, 30+ actions)
  agents: TypeScript worker on Node 22, always-on on an Azure VM (systemd), one DB identity per agent
  model: Claude (claude-sonnet-5-5 default; claude-haiku-5-5 on the hosted worker and for the item check)
  web: Vite + React 19 + TypeScript on Vercel, live subscriptions to the database
  data: NIH RePORTER, USAspending, Grant Witness cancellation list via our Apify Actor, Crossref, PubMed
  ci: GitHub Actions publish the module and redeploy the Azure worker on push
scorecard_planted:  # [eval WIP] do not use yet
  {mistakes: 12, caught: 12, missed: 0, decoys: 4, false_alarms: 0}   # eval/scorecard.json
scorecard_real_audits:  # [eval WIP] do not use yet
  {findings: 42, in_scope: 25, caught: 18, missed: 7, decoys: 4, false_alarms: 0}  # eval/real-findings.json
tracks: [Hyphenate (primary), Microsoft Built for the Real World + Customer Impact Award, Anthropic, SpacetimeDB, Apify, Meta, Cal Hacks general]
judging_format: 3 min pitch + 2 min questions, live demo, whole team present
```

## 1. Stale claims: do NOT say these

Older drafts (`DEVPOST-DRAFT.md`, parts of `DEMO-SCRIPT.md`) predate scope
cuts. In the pitch:

| Old claim | Current truth | Source |
|---|---|---|
| "Three agents / three seats" (purchasing agent, grant accountant, payment & report preparer) | One working seat: the **grant accountant** (bookkeeping agent). The purchasing agent was cut; the grant manager approves every request | DECISIONS T108 |
| "The agent buys on its own" / "reroutes to grant B" | The AI **never buys and never rejects**. It flags with reasons; the human approves or rejects | DECISIONS T101, T108 |
| Payment-request justifications, "Defend the Spend" drafting, progress-report checker | **Out of scope** (code still in repo, hidden and unscored) | DECISIONS T105 |
| "14 of 14 caught, 5 decoys" | No scorecard numbers at all for now `[eval WIP]`; current file reads 12 of 12, 4 decoys, 0 false alarms | `eval/scorecard.json` |
| "Real findings: 22 of 27" (README) | No real-findings numbers for now `[eval WIP]`; current file reads 18 of 25 in scope (42 findings) and disagrees with the README | `eval/real-findings.json` |
| "GrantGuard" | **Grant Test Auto** | DECISIONS (rename) |
| "Test lab" window | **Demo controls** | DECISIONS T67 |
| Claude reads the court notice text | Court orders arrive as ready-made status events; text parsing is a stretch, not built | DECISIONS 01:25 Sun |

## 2. The problem (numbers safe to say out loud)

| Claim | Number | Tag / source |
|---|---|---|
| NIH awards disrupted (Grant Witness list) | **5,098 awards, $14.6B** obligated, $7.5B unspent | [verified, our count of the CSV, as of 2026-10-23] |
| ...now marked restored | **4,352 (85%)** | same |
| Main UC reinstatement case (*Thakur v. Trump*) | **Pending at the Supreme Court**, No. 26-210 | [verified 2026-10-24; re-check before judging] |
| University audits with unallowable expenses | **94%** of 18 NSF audits | [verified] NSF-OIG 22-6-002 |
| Example disallowance | WVU: **$17,335** for supplies bought "near or after the end of award periods" | [verified] NSF-OIG 22-1-010 |
| Researcher time on admin | **44.3%** of federally funded research time | [verified] FDP 2018 survey (old; no newer wave) |
| Federally funded university R&D | **$64B+ a year** | [verified] NSF HERD FY2024 |
| US research universities (R1 + R2) | **326** | [verified] Carnegie 2025 |
| Researcher voice | "I won't believe it until ALL the funding has been disbursed" (r/AskAcademia, NEH grantee) | [scrape] |
| Balance visibility | UC Academic Senate: "the inability to accurately track balances in a timely fashion" | [verified, 2022] |
| Approval starts in email | Kentucky, Northern Illinois, Berkeley CEE procedures | [verified] `docs/research/approval-loop.md` |

Caveat to state if asked: Grant Witness is volunteer and advocacy-adjacent;
it's the best public count, not an official one.

## 2A. Why this problem is hard (the domain)

The pitch should make judges feel this: **there is no single place that
knows whether a lab can spend money right now.** The answer has to be
assembled from systems that disagree, lag, and change their minds, under
rules where a mistake shows up years later as a repayment.

### H1. There is no source of truth for "is this grant on?"

- About **300 terminated NIH grants appeared in only one** of NIH's two
  official sources (RePORTER vs HHS TAGGS) [verified, Grant Witness].
- HHS **stopped posting** new terminations to TAGGS and **removed** some
  existing entries [verified].
- **40+ terminations** reported by researchers appeared on **no official
  list** [verified, Grant Witness methodology].
- Terminations in RePORTER **can't be searched and aren't in its API**;
  trackers have to snapshot it and diff a status flag [verified].
- Grant Witness **removed 362 grants** it had listed, because they came from
  court reinstatement orders and were never detected as terminated in the
  first place [verified].
- The government's first termination list was "both incomplete … and
  somewhat inaccurate (i.e., it listed some grants twice and appeared to
  include a grant that had not yet been terminated)" [verified, Delaney
  sworn declaration ¶6, *APHA v. NIH*, 2025-04-25].
- The co-creator of the most-cited tracker, under oath: "These federal
  databases, while technically public, are **difficult to access and
  interpret**." [verified; interested source, filed for plaintiffs]
- A research administrator on r/NIH: "We are completely in the dark. Those
  at the highest levels are getting more information from Reddit than
  anywhere else." [scrape]

### H2. Status is never final: canceled → restored → appealed

- 5,098 NIH awards disrupted; **85% now marked restored**; the lead UC case
  (*Thakur v. Trump*) went district court → Ninth Circuit (2026-05-26) →
  **cert petition pending at the Supreme Court** (No. 26-210) [verified].
- The Supreme Court separately let **$783M** of NIH terminations stand
  (5-4, 2025-08-21) [verified, SCOTUSblog]. So some cuts are reversed and
  some aren't, grant by grant.
- "This is a good problem to have, the funding's come back, but could it
  disappear again? You don't know." (U. Minnesota biology professor)
  [verified, Minnesota Daily 2025-07-20]
- So status can't be a field. It has to be a **timeline of dated events,
  each with its source**, and the system must reason over the whole history
  ("what happened in March changes what we do in June").

### H3. "Restored" is not "paid": three different facts

- A court order doesn't move money. Grant Witness only confirms a
  reinstatement "by verifying that an award has received outlays since the
  reinstatement" [verified]. Its co-creator: "Frankly, we don't believe it
  until we see it." [verified, Physics Today 2025-09-04]
- "Active in NIH's system" and "money can be drawn" are separate questions:
  the federal Payment Management System can place a **"hard funds
  control"** on a university, blocking draws on awards NIH lists as active,
  and **nobody outside can see it** [verified, Minnesota Daily; scrape,
  r/NIH].
- "I won't believe it until ALL the funding has been disbursed" (NEH
  grantee) [scrape]. "Even if it's not appealed, it's not obvious this
  ruling requires they pay funds." [scrape]
- And the reverse trap: money arriving on a canceled grant may be
  **closeout money** for costs before termination (2 CFR 200.343), not a
  restoration. Our module holds that case for a human instead of
  unfreezing.

### H4. The sources disagree even on the numbers (our own reads of real APIs)

From our reads of NIH RePORTER and USAspending on 2026-10-24 for the demo's
real grant R01GM061721 [verified, our read; `docs/research/money-cycle.md`]:

- **"Awarded" differs by $2.2M between sources:** RePORTER lists
  $8,130,073 (FY2000–2025); USAspending lists $5,912,827.46. USAspending's
  window starts in FY2007, it is **missing the entire FY2008 award
  ($328,450)**, and it has a −$75,911.54 deobligation RePORTER doesn't show.
- **One award, two obligations:** R21AI182745's first-year $204,375 is one
  notice in RePORTER but two USAspending entries ($183,938 and $20,437,
  two months apart). Naive one-to-one matching calls healthy grants broken;
  you have to sum by federal fiscal year.
- **Neither total is spendable:** only the current project period counts
  ($2,098,030, about a quarter of RePORTER's total). Copying a source's
  "awarded" figure overstates the budget 4×.
- **One grant, two paying institutes** (NIGMS and NIA accounts) in
  USAspending, one grant in RePORTER.
- **An award notice isn't proof the grant is live:** NIH issued the FY2025
  continuation ($429,221) on 2025-08-07, a week *after* the termination
  date Grant Witness lists.
- **Payment data lags ~2 months** (USAspending refreshes ~biweekly;
  agencies get 30 days to report). On 2026-10-24 the newest outlay period
  was August 2026. A payout line even appeared **before** its obligation was
  recorded.
- GAO found USAspending's award key "did not always result in a complete and
  accurate display of financial assistance award information" [agent-reported,
  GAO-22-104702, dated 2021].

### H5. The money cycle is spread over five systems, two of them private

| Phase | Recorded in | Public? |
|---|---|---|
| Award | NIH RePORTER | Yes |
| Obligation | USAspending | Yes |
| Payment (drawdown) | Payment Management System → USAspending outlays | Lagged |
| University books | University ERP (Workday, Oracle) | No |
| Lab spending (orders, invoices, payroll) | Lab and department records | No |

Status (canceled / restored / ended) cuts across all five and is recorded by
yet other sources (RePORTER's flag, Grant Witness, formerly TAGGS). Every
feature in Grant Test Auto exists to catch one place where two of these
drift apart.

### H6. Mistakes are invisible in any single record and surface years later

- **94%** of 18 NSF university audits found unallowable expenses; 83%
  misapplied indirect costs; 67% inadequately supported expenses; 55%
  inappropriately allocated [verified, NSF-OIG 22-6-002].
- The failures only show when **two records are put side by side**: an
  invoice dated after the award ended, an order dated after its invoice, two
  payments for one invoice, four same-day card charges that together pass
  the limit, salary above certified effort [verified,
  `pain-points/15-impossible-spend.md`]. Real cases: UW-Madison, $56,965
  incurred after awards expired (PO dated 8 days after the end date); USC,
  $304,290 "unreasonable expenses near award expiration"; South Carolina,
  equipment bought 6 weeks after expiry; WVU, $17,335 end-of-award supplies
  [verified, NSF-OIG reports, mostly older than 2 years].
- Whether a cost belongs on a grant is a **judgment call** by rule: 2 CFR
  200.405 allocates by "relative benefits received". A laptop for an EEG
  pipeline is allowable or not depending on its purpose [verified, eCFR].
- The university is **liable for every cost** (2 CFR 200.303 internal
  controls) and repays disallowances [verified].

### H7. The work is manual, fragmented and already overloaded

- Researchers spend **44.3%** of federally funded research time on admin;
  **73%** of PIs handling finances call it a substantial workload; ~60% of
  those wanting finance fixed rank timely, accurate balance reports a high
  priority [verified, FDP 2018].
- Purchase approval **starts in email** (Kentucky, Northern Illinois,
  Berkeley CEE), then the same checks repeat in the purchasing system (CU
  Boulder's sequential approvals) and accounts payable (UC Riverside holds
  invoices that don't match their PO) [verified].
- Gaps are filled with "user-developed Excel and Google worksheets" [verified,
  SRAI].
- Finance systems themselves break: UW's $340M Workday rollout left a $90M
  unpaid-invoice backlog and "hundreds of research grants … stuck in
  processing limbo" [verified, The Register 2024].
- AI adoption in research offices is ad hoc: "staff use of AI is left to
  individual discretion" [verified, Ithaka S+R 2026].

### H8. Why it's hard to automate *safely*

- **Judgment is required, but LLM judgment is inconsistent.** In our live
  test the same $1,900 laptop request was held twice and bought once with
  nothing changed; a web price lookup read a single unit's price as the
  price for a pack of 10 [ours, `agent-purchasing.md`].
- **The cost of a false "yes" is real money repaid to the government; the
  cost of a false "no" is stalled research.** Both false alarms and misses
  have to be measured, which is why the scorecard counts decoys (results `[eval WIP]`).
- **Fail-open is the default danger:** an earlier truncated model answer
  turned a flag into a purchase (fixed; and the AI can no longer buy).
- **Segregation of duties must hold against the model itself:** a prompt
  can't be the control, so limits live in the database by caller identity.

## 2B. Why it's hard to build (engineering difficulty)

| Challenge | How we solved it |
|---|---|
| Reconciling three public sources that use different units, windows and lags | Per-source readings stored with source + date; award amounts summed by federal fiscal year over the current project period; last 45 days skipped for lag; any gap ≥ $1 or status conflict freezes the grant and asks the human |
| Status as history, not state | Append-only dated `status_event` rows; freeze logic evaluates the sequence (cancel → court order → payment), events dated by the source's own date |
| "As of" reasoning | Per-grant demo time; the cancellation list can be read as it stood on a given day (not listed before termination, still canceled before restoration) |
| Agents must not exceed their authority | Each agent and person is a separate SpacetimeDB identity bound to one role once; every reducer checks the caller's role; agents report facts, the module applies rules |
| Real-time multi-party UI | SpacetimeDB subscriptions push every change to the grant office and every researcher portal at once; no polling, no separate API server |
| Cross-record checks (the audit failures) | Invoice checks against the order, its other invoices and dates (duplicate, canceled order, bill before order); same-day split-purchase rule; effort over 100% |
| LLM output that quotes records | Code verifies every ID and amount in generated text; anything not in the records falls back to a template |
| Reliable live demo with flaky outside APIs and paid model calls | Every outside lookup and Claude answer is saved and keyed by model; deterministic fallbacks; web falls back to bundled seed |
| Proving it works without real lab data | Seed generator, validator, answer key with planted mistakes and decoys, replay harness, plus real audit findings rebuilt as records (results `[eval WIP]`) |
| Schema evolution on a live hosted database | Additive-only contract changes so maincloud migrates without wiping data; CI blocks a worker redeploy until the matching module publish succeeds |
| Four people and many coding agents on one repo in 36 hours | Lanes by directory, a shared contract in `server/`, `./check.sh` gate before every push, tasks/decisions logs |

## 2C. The paperwork burden: government documentation and tedium

Federal grant money comes with a paper trail the lab and grant office must
produce, mostly by hand, for every dollar.

**Rules a single purchase has to satisfy** ([verified] in eCFR or
university/agency procedure unless noted):

- **2 CFR 200.303:** the university must keep "effective internal control"
  giving "reasonable assurance" that every cost complies with statutes,
  regulations and award terms. It is liable for every cost it charges and
  repays what auditors disallow.
- **2 CFR 200.403 / 200.405:** each cost must be allowable, reasonable and
  allocable "in accordance with the relative benefits received": a judgment
  made per item, per grant.
- **2 CFR 200.423, 200.438 and others:** alcohol, entertainment and similar
  costs are unallowable, so someone has to read every request's purpose.
- **End-of-award timing:** CU Boulder's procedure: "Sponsor approval will be
  necessary if within 90 days of the end of the project"; NSF-OIG
  recommends extra review of supply charges in an award's final 90 days.
- **2 CFR 200.343:** after a termination, money can still arrive for costs
  incurred before it (closeout), so an incoming payment must be
  interpreted, not just recorded.
- **Card limits, split-purchase bans, 3-way invoice matching (order,
  receipt, invoice), effort certification** (salary can't exceed certified
  effort): each checked by a different office (`pain-points/15`).

**Documentation the government now demands on top:**

- **Every federal drawdown needs a written justification** of up to 1,000
  characters (Executive Order 14222). NIH Grants Policy Statement 6.1 (rev.
  March 2026): "a detailed justification explaining why the funds are being
  drawn and how the funds are being used", reviewed in **"Defend the
  Spend"**. Requests without it are rejected [verified].
- COGR (the research universities' association): instructions are "varied,
  increasingly onerous, and impractical"; members receive "**dozens** of
  Defend the Spend email demands after submitting draw requests"; there are
  "unapproved payments sitting in the system, with no communication from the
  sponsor" [verified, COGR 2025].
- A CDC email quoted by COGR: "After the 3rd request, if OGS does not have
  enough information to approve the payment it will be rejected." [verified]
- COGR estimates Defend the Spend creates "approximately **53,749 hours** of
  redundant work for recipients and federal agencies" [verified, NCURA
  Magazine 2025; interested source].
- Universities pay lab costs first and are reimbursed later, so every held
  draw is the university fronting the money.

**Tracking the government makes hard** (details in §2A H1–H4): termination
status isn't searchable in RePORTER or in its API; HHS TAGGS stopped
updating; payment holds in the Payment Management System are invisible from
outside; USAspending lags about two months. Staff piece status together by
hand across three or more sites, and a volunteer project became the de
facto record.

**What it costs people:**

- **44.3%** of federally funded research time goes to admin; post-award
  admin ("Purchasing supplies/equipment, supervising budgets, managing
  project personnel, complying with regulations…") alone is **13.7%**; 73%
  of PIs who handle finances call it a substantial workload (67% in 2012);
  50% of those wanting finance fixed want expenditure
  approvals/justifications fixed [verified, FDP 2018].
- The same three questions (money left? grant still open? allowed?) are
  asked at up to six steps, by different people, in different tools (§3C)
  [verified, university procedures].
- Gaps are filled with "user-developed Excel and Google worksheets"
  [verified, SRAI].

**What Grant Test Auto does about the paperwork (in scope today):**

- Every request is one structured record (item, price, category, grant,
  purpose, who asked, date), not an email thread with a scanned PDF.
- The rules are checked once, in code, and the failing rule and its audit
  case are written on the request, instead of being re-checked at each
  approval step.
- Every decision is logged with who, which rule and why, and every human
  call requires a reason: the audit trail is a by-product, not something
  reconstructed years later.
- Grant status across RePORTER, USAspending and the cancellation list is
  gathered automatically on "Check now" and before money moves.

**Built but out of scope for this demo (T105; code still in repo):** drafting
the ≤1,000-character drawdown justification from purchase records (held
items left out in code), answering Defend the Spend follow-ups by quoting
the exact purchases, and checking progress-report papers for grant credit.
Pitch these only as "what's next".

## 3. What it does (current build)

- **Fund tracker** (bookkeeping agent). Per grant: awarded, received,
  spent, promised, and **truly available** = awarded − spent − promised.
  Status is a **timeline of dated events with sources**, not one field.
  Reads RePORTER, USAspending and the Grant Witness list (our Apify Actor)
  on "Check now" and right before money moves. If the sources disagree, the
  grant freezes and the grant manager picks the right source, with a reason.
- **The freeze rule** (in the database). A cancellation freezes spending.
  A court order alone does not unfreeze it; only a payment that lands after
  the court order does. Money that arrives on a canceled grant with no court
  order raises a "paid while canceled" hold, because it may be closeout
  money (2 CFR 200.343).
- **Purchase requests.** A researcher asks in plain words on their portal.
  Claude Haiku first checks whether a grant could pay for the item at all
  (flags alcohol, entertainment, personal items, food, furniture, office
  supplies, or vague purposes, citing 2 CFR 200.403/.423/.438). Then the
  database runs the **spending rules**: grant active and not frozen; no
  supplies in the last 90 days; allowed category; ≤ $5,000 card limit;
  no split purchases (same person, same day, same category); enough truly
  available money. Every request goes to the grant manager as "Approve …"
  or "Flagged: approve …", with each failing rule and the audit case it
  comes from (WVU, Delaware, UC Davis, NSF-OIG).
- **Experiment plans.** A researcher can budget a whole experiment and get a
  funding-readiness report (scope, allowability, budget, follow-ups) before
  sending it; approved plans become one request per line.
- **Invoices.** Each bill is matched to its order and approval. Held if the
  order was canceled, already paid (duplicate), or the bill predates the
  order, with a rebuilt timeline. Approving a matched invoice charges the
  grant (promised → spent) and reimburses the researcher.
- **Lifecycle:** researcher requests → grant office approves → researcher
  buys → submits invoice → grant office approves invoice.
- **Portals:** one grant-office portal and separate researcher portals
  (Dr. Priya Nair, grant A; Sofia Alvarez, grant B). Every request names who
  asked; only that person can push back on it.
- **Accountability:** every action writes a Log row (who, what, which rule,
  why); "why?" works on any row, however old. Every human decision requires
  a reason. A Rules page lists every check in plain language.

## 3A. Stack (full)

```
 NIH RePORTER · USAspending · Grant Witness list (our Apify Actor) · Crossref · PubMed
                 (lab's own grant IDs only; saved copies in agents/cache/)
                                     |
 +--------- agent worker (agents/, Node 22 + tsx) on an Azure VM ------+
 |  bookkeeping agent: fund tracker, invoice check, item check         |
 |  Claude: item check + held-invoice notes; saved answers + fallback  |
 +----------------------------------+----------------------------------+
                                    |  one identity per agent; changes
                                    v  data only through actions
 +------ SpacetimeDB module "grantguard" (server/) on maincloud -------+
 |  20+ tables, 30+ actions: rules, money math, freeze, roles, the log |
 +----------------------------------^----------------------------------+
                                    |  live subscriptions + actions
 +------------- web app (web/, Vite + React 19) on Vercel -------------+
 |  Grant office portal (Funds, Requests, Invoices, Rules, Demo)       |
 |  Researcher portals (Priya, Sofia): Ask, My grants, My requests     |
 +---------------------------------------------------------------------+
```

| Layer | Technology | Details | Why we chose it |
|---|---|---|---|
| Database + business logic | **SpacetimeDB 2.13.0**, TypeScript module (`server/`) | Grants, status events, source readings, requests, orders, invoices, holds, plans, log, simulated clock; rules in `rules.ts`, vocab in `vocab.ts`; reducers check caller role; tests via SpacetimeDB's in-process test harness (vitest) | One store for data, rules and identity; server-side enforcement a model can't bypass; live subscriptions for free |
| Hosting (DB) | SpacetimeDB **maincloud**, database `grantguard` | Published by GitHub Action on pushes touching `server/` | Always on; no server to run |
| Agents | TypeScript on **Node 22**, run with tsx (`agents/`) | One worker, one SpacetimeDB connection and identity per agent; tokens persisted so restarts keep identity; agents: bookkeeping (fund tracker, invoices, item check); payment/report agent kept but out of scope | Same language and SDK as the module |
| Hosting (agents) | **Microsoft Azure VM** `grantguard-agents` (Azure for Students, westus2), systemd service | GitHub Action SSHes in and runs `update.sh` on pushes touching `agents/`, `server/`, `sim/`, after the module publish succeeds; secrets in `/etc/grantguard/agents.env` | Always-on agents with no laptop at the booth; production-shaped deploy |
| AI model | **Claude** via Anthropic API | `claude-sonnet-5-5` default; `claude-haiku-5-5` on the hosted worker (cost) and for the item check; Haiku + web search tool for the price check (max 2 searches) in the cut purchasing path | Strong reading/explaining; Haiku for cheap high-volume checks |
| AI safety rails | Saved answers (`agents/cache/claude/`, keyed by model), deterministic fallbacks, record-quoting checks | `GG_CLAUDE=cached/live/offline/off`; `GG_REUSE_SAVED=1` replays team-checked Sonnet answers on Haiku | Deterministic demo, low cost, no hallucinated amounts |
| Outside data | NIH RePORTER API, USAspending API (`/api/v2/transactions/`), Grant Witness NIH CSV, Crossref, PubMed / PMC | Read only for the lab's own grant IDs; cached | Real public records |
| Scraper | **Apify** Actor `nathanqiu/nih-grant-cancellation-list` (`scrapers/`) | 5,776 rows → 5,635 grants; feeds the tracker as a source reading | Managed scraping runs; Apify track |
| Web | **Vite + React 19 + TypeScript**, no UI library (`web/`) | Reads the live module through generated bindings; falls back to bundled seed with an "Offline demo data" badge; one browser identity per person role | Fast to build; live updates |
| Hosting (web) | **Vercel**, https://calhacks130.vercel.app | Builds from `main` | Zero-config deploys |
| Simulation + eval | `sim/` (seed generator, validator, answer key), `eval/` (replay + judge) | Scorecard on every `./check.sh`; real-audit replay `eval/real-findings.mjs` | Proof it works, including false alarms |
| CI / quality gate | GitHub Actions + `./check.sh` | Typecheck + tests for server, agents, eval, scrapers; web build; scorecard | `main` always runs |

## 3B. What each part of the stack does (one request, end to end)

Follow one purchase, Dr. Priya Nair asking for nitrile gloves on grant A,
through every component:

| # | What happens | Component doing it | What it guarantees |
|---|---|---|---|
| 1 | Priya types "nitrile gloves, $640, for the cell culture work" into **Ask** on her researcher portal | **Web app** (React on Vercel), signed in as her own SpacetimeDB identity | The request is tied to a real person; she sees only her own requests |
| 2 | Before matching a grant, Claude Haiku reads the item: could any grant pay for this? (fine/flag, one-line reason, kind of thing) | **Agent worker** on the **Azure VM** answers the `itemCheck` row via **Claude Haiku** | Unallowable categories (alcohol, food, furniture, personal items, vague purposes) are flagged with the regulation; if Claude doesn't answer in 20 s, the request goes on unchecked to a human, never auto-approved |
| 3 | Ask shows, in plain words, which of her grants can pay; she submits | Web app reading live **SpacetimeDB** tables | She knows before asking whether money is really there |
| 4 | `submit_request` runs: the module records who asked, then applies the spending rules (active and not frozen, last 90 days, category, card limit, split purchases, truly available money) | **SpacetimeDB module** (`server/`, TypeScript reducers on maincloud) | Rules and money math run in one place, server-side, the same way every time; no model is involved in the verdict |
| 5 | Grant A is frozen (canceled, court-restored, no payment), so the module opens an Inbox item: "Flagged: approve …" with each failing rule, its audit case, and Priya's name | SpacetimeDB module writes the hold + a **Log** row | Nothing is bought without a person; the reason is on the record |
| 6 | The grant office portal updates instantly, with no refresh | **SpacetimeDB subscriptions** → web app | Everyone sees the same state at the same moment |
| 7 | Grant manager clicks "Check now" (or money is about to move): the bookkeeping agent reads RePORTER, USAspending and the cancellation list for the lab's grant IDs | **Agent worker** + **NIH RePORTER API**, **USAspending API**, **Grant Witness list via our Apify Actor** | Only changes are posted, each with source and date; disagreement freezes the grant and asks the human which source is right |
| 8 | A payment lands after the court order → the module unfreezes grant A and refreshes Priya's Inbox item to "Approve …: every rule passes" | SpacetimeDB module (freeze rule over the dated event timeline) | A court order alone never unfreezes; only money does |
| 9 | Grant manager approves, typing a reason | Web app → `decide` reducer, role-checked | Agents can't decide Inbox items; nobody approves their own request |
| 10 | Priya buys and submits the invoice; the bookkeeping agent checks it against the order, approvals, other invoices and dates | Agent worker reports facts via `check_invoice`; module applies the invoice rules | Duplicates, bills for canceled orders and bills dated before their order are held with a rebuilt timeline |
| 11 | Grant manager approves the invoice → promised becomes spent, Priya is reimbursed | SpacetimeDB module | The balance everyone sees is the real one |
| 12 | Any row, any time later: click "why?" | Log table + web app; Claude's explanation text is checked against the records in code | Every decision traces to the data, rule and person behind it |
| — | On every push: tests, scorecard replay, module publish, then worker redeploy | **GitHub Actions**, `./check.sh`, `eval/` | `main` always runs; the deployed agents never run against a schema that isn't live yet |

## 3C. The workflow it replaces, and why it makes fewer errors

**Today** (assembled from real university procedures: Kentucky, Northern
Illinois, Berkeley CEE, CU Boulder, UCF, Ohio State, UC Riverside;
`docs/research/approval-loop.md`, all [verified] unless noted):

| # | Step today | Who / where | Where errors creep in | Grant Test Auto |
|---|---|---|---|---|
| 1 | "Can I buy this?" | Student → PI, by **email** ("Starts with (grad student email to PI)", Kentucky) | No structure; purpose and grant often missing; nothing checked yet | Structured request on the researcher portal; Haiku checks allowability before it's even sent |
| 2 | PI approves and names a grant | Email forwarded, PDF of a cart, or a signed, **scanned paper form** (Berkeley CEE) | PI guesses which grant has money; no view of real balance or status | Ask shows which of *your* grants can pay, with truly available money and freeze status |
| 3 | Requisition entered | Department admin in a marketplace (BearBuy, CU Marketplace) or the ERP (Workday, Oracle); PIs often lack access | Re-keying from email; wrong grant or category typed | No re-keying: the request record is the requisition |
| 4 | "Does the grant have money and is it still open?" | Department approver, as a marketplace step | Checks the ERP budget line, which **doesn't know** about cancellations, court orders or whether money arrived | Truly available = awarded − spent − promised; status from three outside sources; frozen grants flagged |
| 5 | "Is this allowed on this grant?" | Grant office, another approval step (CU Boulder: "three sequential approvals") | Same question asked again by a different person; end-of-award rule depends on someone remembering it | Every rule runs once, in code, citing the audit case; the grant manager sees the verdicts on one card |
| 6 | Purchase order sent | Purchasing office | — | Grant manager approves with a reason; researcher buys |
| 7 | Invoice arrives | Vendor → **central accounts-payable email inbox**; invoices sent to the lab get lost | Lost or duplicate bills; bills for canceled orders | Invoice submitted against its order in the same record |
| 8 | Invoice matched to order | AP 3-way match; mismatches bounce back to the department (UC Riverside delays "POs not matching vendor invoice") | Each record looks fine alone; cross-record problems (duplicate, canceled order, bill before order) slip through | Agent matches invoice to order, approvals, other invoices and dates; mismatches held with a timeline |
| 9 | Card purchases reviewed after the fact | Card reconciliation tool (Concur, Works) | Split purchases to dodge the card limit found later, if at all | Same-day split-purchase rule checked *before* approval |
| 10 | Monthly "is the ledger right?" | Admin exports ERP reports to **Excel / Google Sheets**; PI signs off ("user-developed Excel and Google worksheets", SRAI) | Stale, hand-built balances; UC Senate: "inability to accurately track balances in a timely fashion" | Live balances on every portal, updated the instant something is approved |
| 11 | Grant status tracked | By hand across RePORTER, USAspending, TAGGS, Grant Witness, agency letters, Reddit | Sources disagree; status flips; payment holds invisible | Fund tracker posts dated, sourced events; disagreement freezes and asks; only a payment unfreezes |
| 12 | Audit, 1–4 years later | Auditors rebuild the story from emails and ledgers | 94% of NSF audits find unallowable costs; university repays | The story is already written: every decision has rule, reason and person in the Log |

**Why it's less error-prone, in one list:**

1. **One record instead of six tools.** Email, marketplace, ERP, AP inbox,
   card tool and spreadsheets each hold part of the story today; here the
   request, approval, invoice and grant status are one linked record, so
   nothing is re-keyed or lost between systems.
2. **Checked once, the same way every time.** Rules run in deterministic
   code in the database, not in six people's memories. The end-of-award
   rule doesn't depend on someone remembering it.
3. **Cross-record checks humans skip.** Duplicate bills, bills for canceled
   orders, bills dated before their order, same-day split purchases:
   invisible in any single record, caught automatically.
4. **Real status, not the budget line.** The ERP knows the budget; it
   doesn't know a grant was canceled, restored by a court, or still unpaid.
   The fund tracker does, from three sources, and freezes when they
   disagree.
5. **Before the money moves, not years after.** Problems surface at
   request time, while they're cheap to fix, instead of in an audit.
6. **A person still decides, with better information.** The grant manager
   approves every purchase and invoice, but sees every rule verdict, the
   audit case, who asked and why, on one card, and must give a reason.
7. **Limits the AI can't talk past.** Segregation of duties and the money
   rules are enforced by the database per identity, so a wrong or
   manipulated model output can't approve or spend anything.
8. **Being measured.** We're building an eval that replays planted
   mistakes, decoys and real audit findings, counting misses and false
   alarms. Results are `[eval WIP]`: don't quote them yet.

**Honest limits:** it sits beside the ERP rather than replacing it; the lab
data in the demo is simulated; there's no receiving-record or cost-transfer
check yet (the data has no such records); and the evals are still in
progress `[eval WIP]`.

## 3D. The outside sources we read, and what each one tells us

The fund tracker (`agents/src/sources/`, `agents/src/agents/bookkeeping.ts`)
reads these **only for the lab's own grant IDs**, on "Check now" and right
before money moves (never on a timer, T59). Every answer is saved in
`agents/cache/` (public data, committed), so the demo still works offline or
when a site is down (`GG_SOURCES=live|offline`). Only changes are posted,
each as a dated source reading with its source.

| Source | What the site is | What we read from it | What it can't tell us (why we need the others) | In scope? |
|---|---|---|---|---|
| **NIH RePORTER** (search API + the ProjectInfo service behind its project pages) | NIH's public database of funded projects | Every fiscal-year award record for a grant (award notice amounts and dates, project period, end date); the termination flag on the latest record (only on the project page service, not the documented API) | Whether money was actually paid; a status history (only the current flag); terminations aren't searchable | Yes |
| **USAspending** (`/api/v2/transactions/`) | The federal government's public spending database (obligations and outlays from agency reports) | How much is obligated (committed) per fiscal year and how much was actually **paid out**; a rise in paid-out money after a court order is how the tracker sees a restored grant's money really arrive | Never says a grant was terminated (status is always null); paid-out figures lag about two months; window starts FY2007 | Yes |
| **Grant Witness NIH list**, read through **our Apify Actor** `nathanqiu/nih-grant-cancellation-list` (`scrapers/`) | A volunteer project tracking disrupted NIH grants, inferred from RePORTER, TAGGS, USAspending and court filings | Per grant: canceled (terminated or frozen), reinstated or unfrozen, and the date listed. The Actor downloads Grant Witness's full CSV (`data.grantwitness.org/nih/dl-table.csv`, no HTML scraping): 5,776 rows → 5,635 grants on 2026-10-24 (1,100 canceled, 2,301 reinstated, 2,234 unfrozen). It writes a dataset, never the database; the tracker reads the four fields it needs (~40 KB gzipped) and posts the reading itself | Whether money moved; it's advocacy-adjacent and unofficial, which is exactly why a disagreement with RePORTER goes to the grant manager | Yes |
| **Crossref** | Registry of scholarly DOIs | Does a paper's DOI exist, its title, the grant awards its funders list, and correction/retraction notices (including Retraction Watch records) | Some errata only reach PubMed | No (report checker, cut in T105) |
| **PubMed / PubMed Central** | NIH's biomedical literature index and full-text archive | DOI → PMID/PMCID, grant numbers a paper acknowledges, errata, retraction and concern links | Papers outside biomedicine | No (report checker, cut in T105) |

**How the sources combine** (`agents/src/tracker/compare.ts`, the module's
freeze rule): award amounts are compared year by year by federal fiscal year
over the current project period, skipping the last 45 days for reporting
lag; a status conflict or a gap of $1 or more raises `sources_disagree`,
which freezes the grant and puts the choice in the grant manager's Inbox.
Status changes are dated by the source's own date. A cancellation holds
until a payment arrives *after* a court order; money on a canceled grant
with no court order raises a "paid while canceled" hold (possible closeout
money). A disagreement the manager already decided stays decided until a
source reports something new.

## 3E. What the AI agent does, in full

Be precise in the pitch: **the agent worker does a lot on its own, but most
of it is deterministic code; Claude is used for two jobs in the demo, and
both only read and explain.** No Claude output ever approves, rejects,
buys, pays or unfreezes anything; the module decides, and a person approves.

**The bookkeeping agent (grant accountant seat), running on its own on the
Azure VM, one SpacetimeDB identity:**

| # | What it does on its own | Trigger | Claude? | What it can't do |
|---|---|---|---|---|
| 1 | Reads RePORTER, USAspending and the cancellation list for every lab grant | "Check now", or right before money moves | No (code) | Read any grant that isn't the lab's |
| 2 | Compares the sources year by year and posts only what changed, as dated, sourced readings | After each read | No (code) | Write a status directly; it reports facts, the module applies the freeze rule |
| 3 | Raises flags: sources disagree; money spent while a grant was canceled; a court restored a grant but no money has come; a grant restored then cut again | When a reading changes | No (code) | Clear a flag or unfreeze a grant |
| 4 | Answers Ask's **item check**: before any grant is matched, is this item something a federal research grant could pay for at all? Returns fine/flag, a one-line reason and the kind of thing it is; flags alcohol, entertainment, personal items, food and drinks, furniture, office supplies and vague purposes, citing 2 CFR 200.403/.423/.438 | A researcher types a request in Ask | **Yes, Claude Haiku** (`claude-haiku-5-5`) | Block the request: a flag just tells the researcher why; they can still send it, and if Haiku doesn't answer in ~20 s the check comes back "unchecked" and Ask goes on |
| 5 | Checks every new invoice by sending it to the module's `check_invoice`, which matches it to its order and approval and pays it or holds it (duplicate, canceled order, bill dated before the order) with a timeline | A new invoice; re-checks a held one once when its order is canceled, changes amount, or gets a new approval | No (code + module) | Decide the match or pay anything itself |
| 6 | Enriches a held invoice's Inbox item with the conflicting records by id and exact amount, the rule the module cited, kept word for word | Right after the module holds an invoice | No (code) | Change the module's wording or verdict |
| 7 | Adds a short **note on a held invoice**: which records conflict and what evidence is missing before the grant manager decides | Same moment, when Claude is on | **Yes, Claude** (Sonnet by default, Haiku on the hosted worker) | Change the verdict or numbers. A note naming any dollar amount, record id or date not in the records is dropped, and the Inbox keeps the module's text |

**Guardrails on every Claude call** (`agents/src/claude.ts`):
`GG_CLAUDE=cached|live|offline|off`; answers saved in `agents/cache/claude/`
keyed by model and task, so the demo is repeatable; `GG_REUSE_SAVED=1`
replays team-checked Sonnet answers on Haiku; every call has a
deterministic fallback and never throws because of Claude; generated text
is checked against the records in code.

**What is deliberately *not* Claude** (say this if asked "where's the AI
judgment?"): the spending rules, the money math (truly available =
awarded − spent − promised), the freeze rule, source comparison, invoice
matching and the experiment-plan funding-readiness report
(`web/src/spendguard/assess.ts`: "no model call, so the same plan always
gives the same report"). These are decisions with legal consequences, so
they're code that gives the same answer every time, and the model only
reads messy text and explains.

**Claude jobs built but out of scope for the demo** (code in repo, hidden,
unscored; pitch only as "next"):

| Agent | Claude tasks | Status |
|---|---|---|
| Purchasing agent | Read a free-text request into item, quantity, price; judge whether the purpose fits the grant; explain the decision | Cut (T108): our live test showed inconsistent answers; the grant manager now approves every request |
| Price check | Claude Haiku with the web search tool (max 2 searches) checks a quoted price against the web | Cut with the purchasing agent; it once read a unit price as a pack price |
| Payment & report agent: payment requests | Draft the ≤1,000-character drawdown justification from purchase records; answer "Defend the Spend" follow-ups quoting exact purchases; redo both after rework | Out of scope (T105); the worker still starts it, hidden in the UI |
| Payment & report agent: report checker | Check each paper in a progress report (Crossref, PubMed): does it exist, credit the grant, have a PMCID, any correction or retraction; explain findings | Out of scope (T105) |

## 4. Demo path (3 minutes; judge plays the grant manager)

Demo world: `sim/demo-seed.json`, simulated today 2026-06-15. Grant A =
R01GM061721 (real NIH award), Grant B = R21AI182745 (real, ends 2026-08-31).

1. **Funds:** grant A was canceled 2026-03-10, restored by court
   2026-04-20, no payment since → still frozen.
2. **Researcher asks** for nitrile gloves ($640) on grant A: "the court
   restored it." A rule engine reading "restored" would say yes. Grant Test
   Auto flags it: no money has arrived since the court order. Click "why?".
3. **Money lands** (Demo controls → "Payment arrives"), and the grant
   manager settles "Which source is right?" (RePORTER: active; USAspending:
   canceled; list: restored by court). Grant A unfreezes; the gloves' item
   changes from "Flagged" to "Approve": every rule passes. Approve with a
   reason. Agar plates on grant B stay flagged (last 90 days, citing WVU and
   Delaware audits).
4. **Invoices:** a bill for an order canceled 2026-03-02 is held with its
   timeline; the judge decides it, reason required.
5. ~~Scorecard~~ `[eval WIP]`: skip the scorecard in the demo until the evals are final.

Fallbacks: the web app falls back to bundled seed data ("Offline demo data"
badge) if the database is unreachable; agents run on saved Claude answers
and code fallbacks with no API key.

---

## 5. General Cal Hacks judging criteria

### 5.1 Application

- **Real, current, measurable problem:** 5,098 disrupted NIH awards, 85%
  restored, the lead case still at the Supreme Court; 94% of NSF university
  audits find unallowable costs [verified].
- **Real users and buyer:** grant managers, PIs and lab staff at 326 US
  research universities; buyer is the sponsored-programs office; market
  context $64B+/yr federally funded university R&D [verified].
- **Fills a gap existing tools leave:** Workday-style finance systems check
  the budget line, not whether a grant is canceled or its money has arrived;
  Grant Witness is a public record, not a spending control; we found no tool
  linking cancellation status to what a lab can buy [verified search
  2026-10-24, `IMPACT-EVIDENCE.md` §3].
- **Built on real data:** real NIH grant IDs, a live scrape of the real
  cancellation list (5,776 rows → 5,635 grants) [ours], rules citing real
  audit findings.
- **Sits beside, not instead of, the finance system:** adoption doesn't
  require replacing the ERP.
- `[gap]` No interview with a real grant manager/PI yet (HUMAN_TODO). If one
  happens before judging, put the quote here.

### 5.2 Functionality

- **Live, deployed, end to end:** web on Vercel, database on SpacetimeDB
  maincloud, agents always-on on Azure. Judges can open
  https://calhacks130.vercel.app themselves.
- **Tested:** `./check.sh` runs typecheck + tests in every package (server
  67 tests, agents 227, eval 10, scrapers 11 at last QA run) and the
  scorecard on every push (results `[eval WIP]`); QA click-path checks logged in `PROGRESS.md`.
- **Resilient demo:** offline fallback in the web app; saved Claude answers
  and deterministic fallbacks; cached outside lookups.
- **Understandable UI:** one job per window; plain-language explanations on
  every flag; researcher portals show "which grant can pay" in plain words;
  branded loading screen; Rules page explains every check.
- Known edge cases and the pre-demo checklist: `docs/EDGE-TESTING.md`.
  Caveat: the live site is one shared world; reset it (Demo controls →
  Start over) right before judging.

### 5.3 Creativity

- **New corner:** the post-award grant office during the 2025–2026
  cancellations, a seat nobody has automated (Devpost scan: grant projects
  help *find or write* grants; closest, GrantLoop and GrantProof, don't
  track cancellations/reinstatements or hold spending until payment)
  [verified 2026-10-24].
- **Key idea:** "awarded", "restored" and "paid" are three different facts.
  Status is a dated multi-source timeline, and **a court order is not
  money**.
- **Sources disagree → freeze and ask,** instead of silently picking one.
- **Rules that cite the audit they come from,** so the warning arrives
  before the purchase, not years later in an audit.
- **Proof built from real audits:** real questioned costs from audit reports
  rebuilt as test cases (`eval/real-findings.mjs`); results `[eval WIP]`.

### 5.4 Technical complexity

Talking points that show depth:

- **SpacetimeDB as the whole company:** tables, simulated clock, log and
  rules live in a TypeScript module; reducers enforce role checks per
  caller identity; clients get live subscriptions, so a freeze shows up in
  every window at once. Module tests run in-process with SpacetimeDB's test
  harness. Additive-only schema changes so maincloud migrates without a
  reset.
- **Agents report facts, the module decides:** agents call `post_status_event`,
  `check_invoice` etc.; the module applies the rule and raises the Inbox
  item. A model can't talk its way past a limit.
- **Identity design:** each agent and person is one SpacetimeDB identity
  bound to one role, once; tokens persist per database so restarts keep the
  same identity; the hosted worker's identities own the agent roles.
- **Claude use is bounded:** it reads, matches and explains; it never does
  the math. Text that quotes records is checked in code, and an ID or
  amount not in the records falls back to a template. Saved answers keyed
  by model, `GG_REUSE_SAVED` lets Haiku replay checked Sonnet answers.
- **Source reconciliation:** award amounts compared year by year across
  RePORTER and USAspending by federal fiscal year, skipping the last 45
  days (USAspending often lacks older years, so comparing totals would flag
  healthy grants).
- **Ops:** GitHub Actions publish the module, then redeploy the Azure
  worker only after that commit's publish succeeds (a worker once crashed
  subscribing to a table maincloud didn't have yet).
- **Evaluation:** replay harness scores the real module + agents against an
  answer key, counting misses *and* false alarms on decoys (results `[eval WIP]`).

### 5.5 Intentionality (responsible AI)

This is our strongest story. We **removed** autonomy where evidence said it
was unsafe.

- **We tested the autonomous purchasing agent and cut it.** Live test, 23
  tricky requests × 3 runs (`docs/research/agent-purchasing.md`) [ours]:
  it never bought a bad request (0 of 42 should-stop cases), **but** the
  same $1,900 laptop was held twice and bought once with nothing changed;
  the web price lookup confused unit vs pack price; it held legitimate
  IRB-approved participant payments. Federal rules (2 CFR 200.303) make the
  university answerable for every cost, and OWASP LLM06 says high-impact
  actions need a human. So the AI **flags, a person decides** (T101, T108).
- **Limits in code, not prompts:** agents cannot decide Inbox items
  ("Agents cannot do this; only people can"); nobody approves their own
  request; each identity has one role.
- **Explainable and accountable:** every flag shows the rule and the real
  audit case; every action is logged with its reason; every human decision
  requires a reason.
- **Conservative on money:** a court order never unfreezes a grant; only a
  recorded payment does. Disagreeing sources freeze and ask.
- **Fails safe:** no API key or Claude outage → saved answers and
  deterministic code; the item check times out and passes the request to a
  human, never auto-approves.
- **Who it helps:** researchers spend 44% of research time on admin
  [verified]; clearer balances and earlier warnings protect labs from
  disallowed costs they'd have to repay, and help keep research funded
  through cancellations.
- **Honest scope:** the lab is simulated and the evals are still in progress
  `[eval WIP]`; no field results.

---

## 6. Hyphenate (primary track): "Autonomous Systems for Finance"

Judging (verbatim headings): Is it real enough? / Would you hire it? / Did
we see something new? / The moment. Deliverables: demo video opening on the
moment, live demo (they may try their own scenario), one line on the seats,
proof it works (what's real, simulated, how we know).

| Criterion | Our answer |
|---|---|
| Is it real enough? | Real NIH grant records; real scrape of the cancellation list; simulated lab with planted mistakes modeled on real audits plus decoys; eval results `[eval WIP]`, don't quote numbers |
| Would you hire it? | Seat: grant accountant. Limited access (one role per identity, can't decide Inbox items), clean record (Log + "why?" on every row), knows when to ask (disagreeing sources, flagged rules, held invoices all go to the human with evidence) |
| Did we see something new? | Post-award grant office during the 2025–26 cancellations; status as a multi-source dated timeline |
| The moment | Court restores a grant; it still flags spending until money arrives; then every rule passes and the manager approves |
| Sources disagree | RePORTER vs USAspending vs Grant Witness → freeze + "which source is right?" |
| Time | A March cancellation still blocks a June purchase; last-90-days rule; dated events |
| Working with others | Researchers push back on their own requests; manager approves/rejects with a reason; "Ask the vendor" on invoices |
| Limits / SoD | Enforced in the SpacetimeDB module per caller identity |
| Judge's own scenario | Demo controls injects cancellations, court orders, payments and invoices; anyone can submit a request (playbook: `DEMO-SCRIPT.md` §c, but use current behavior: flags, not buys) |

**One line on seats:** "Grant Test Auto fills the grant accountant seat in a
university lab's grant office, reporting to one human grant manager who
approves every purchase and invoice."

## 7. Microsoft: Built for the Real World (+ Customer Impact Award)

Prizes: Grand = Surface laptop per member, a Microsoft FDE tech talk, 1:1
mentorship with senior FDEs. Customer Impact Award = the talk and
mentorship. Devpost names: "[Microsoft] 1st Place Built for the Real World",
"[Microsoft] 2nd Place Microsoft Customer Impact Award". **No Azure
requirement**, but we do run on Azure.

**The track (confirmed from the official Microsoft brief, 2026-10-25):**
build a production-minded AI agent that solves a meaningful problem in a
high-impact domain; finance is one of the named domains, and that's ours.

Judging criteria (official, five):
1. **Customer understanding**
2. **Measurable usefulness**
3. **Path from prototype to production**
4. **Responsible design**
5. **End-to-end functionality**

The Customer Impact Award favors real user conversations.

| Microsoft criterion | Evidence |
|---|---|
| **Customer understanding** | Named customer: a university lab's grant office (grant manager + researchers). Research base of 15+ pain-point files with sources (`docs/research/pain-points/`); real procedures from Kentucky, NIU, Berkeley CEE, CU Boulder, UC Riverside show approval starts in email and checks repeat; researcher quotes from r/AskAcademia and r/NIH; UC Senate and FDP survey on balance visibility. Lifecycle mirrors how labs actually buy: request → approve → buy → invoice → approve invoice. `[gap]` no first-hand interview yet |
| **Measurable usefulness** | Eval scores are `[eval WIP]`: don't quote them. Use instead: the size of the measured problem (44.3% of research time on admin, 94% of NSF university audits with unallowable costs, 5,098 NIH awards disrupted); each check maps to a real audit failure it would have caught before the money moved (e.g. UW-Madison $56,965 after award end, USC $304,290 near expiry); on the demo's real grant, the tracker surfaces the $2.2M gap between RePORTER and USAspending and the pay-after-restoration signal from real outlays. Say we are building an eval that counts misses and false alarms, results coming |
| **Path from prototype to production** | Already runs as a production-shaped system: always-on **Azure VM** (systemd service, auto-restart) for the agent worker; hosted SpacetimeDB; Vercel web; CI/CD via GitHub Actions (module publish gated by the check; worker redeploys only after the matching publish succeeds); secrets only on the VM and in GitHub secrets; cost control (Haiku on the hosted worker, saved answers replayed first). Simulated ERP and government systems sit behind the same database actions a real integration would call. Next: SSO for the grant manager, a read-only "suggest" rollout, a pilot with one research administration office, a real ERP connector |
| **Responsible design** | Human approves every purchase and invoice; AI never buys or rejects (cut after our own test showed inconsistency; §5.5). Segregation of duties in code. Reason required for every decision. Append-only log with "why?". Conservative money rule (court order ≠ cash). Fails safe to human review. Real-vs-simulated labeled in the UI; real investigators' names and work never described. Evals count misses and false alarms, not just catches (results `[eval WIP]`) |
| **End-to-end functionality** | Live at https://calhacks130.vercel.app: researcher portal → Haiku item check → database rules → grant-office approval → invoice match → charge grant and reimburse; fund tracker reads real sources and freezes/unfreezes live across all windows |
| **Customer Impact Award** | Strongest lever is a real conversation: interview kit is ready (`docs/submission/INTERVIEW-KIT.md`, Q10 "what would you never let it do without you?", Q11 "what would make you trust or distrust this?"). Until then, lean on documented user evidence above and say plainly it's secondary research |

**Microsoft pitch paragraph (paste-ready):**
Grant Test Auto is built for a real customer: a university lab's grant
office, which since 2025 has had to track grants that are canceled,
restored by courts, and still unpaid, using official sources that disagree.
It's running in production shape today: an always-on agent worker on an
Azure VM, a hosted real-time database that enforces every limit, and a live
web app, all redeployed by CI on every push. Every check it runs is tied
to a real audit failure, the kind that shows up in 94% of NSF university
audits, and it catches them before the money moves instead of years later.
Responsible design came from evidence: when our own test showed
the purchasing agent gave the same request different answers, we cut its
authority. The AI now flags with reasons, and a person approves every
purchase and invoice.

## 8. Other tracks (short)

| Track | Requirement | Our answer |
|---|---|---|
| **Anthropic** (ask organizers how to enter; not on Devpost list) | Named community with a lived problem; Claude must matter; know where it fails | Community: research administrators and researchers. Claude: item allowability check (Haiku), explanations, matching. Failure modes and mitigations: inconsistent judgments → human approves everything; unreliable price lookup → never decides alone; truncated answer once turned a flag into a buy → fixed, and the design no longer lets the AI buy; misquoting records → code checks IDs/amounts and falls back to a template |
| **SpacetimeDB** (ask how to enter) | Core real-time backend | The whole company is the module: 20 tables, 27+ actions, rules, money math, roles, log, simulated clock; one identity per agent and person; live subscriptions drive every window |
| **Apify** | Real scraped public data | Our Actor `nathanqiu/nih-grant-cancellation-list` scrapes Grant Witness's NIH list (5,776 rows → 5,635 grants); it feeds the fund tracker as a source reading. Best Actor needs it made public `[gap]` |
| **Meta: Bringing People Closer Together with AI** | Strengthens human connection; AI essential; originality; working demo | Connects researchers and their grant office: each researcher has their own portal, every request names who asked, Claude explains each decision in plain words, and a researcher can push back to a human instead of getting an unexplained "no" |
| **Cal Hacks general** | Automatic | Most Technically Advanced (multi-identity agents on a real-time DB with server-side limits); Best People-First Social Impact (keeping labs funded and compliant through cancellations); Most Creative |

## 9. Pitch skeleton (3:00)

| Time | Beat | Content |
|---|---|---|
| 0:00 | Hook (the moment) | "This grant was canceled, then a court restored it. Most systems would say 'active'. Grant Test Auto still won't let you spend, because a court order isn't money." Show the frozen grant |
| 0:20 | Problem | 5,098 NIH awards disrupted, 85% marked restored, the main case still at the Supreme Court; 94% of NSF university audits find unallowable costs |
| 0:40 | Who it's for | The grant office and its researchers; seat = grant accountant; the judge is the grant manager |
| 0:50 | Live demo | Steps 2–4 of §4: flagged request with "why?", payment lands + pick source, approve; held canceled-order invoice, judge decides with a reason |
| 2:10 | Proof | `[eval WIP]` no eval numbers yet. Use instead: the rules cite real audit cases (WVU, Delaware, UC Davis, NSF-OIG), and the demo runs on real NIH grant records and the real cancellation list |
| 2:25 | Responsible design | "We tested letting the AI buy. Same request, different answers. So the AI flags and a person decides. Limits are in the database, not the prompt." |
| 2:40 | Real world | Live on Azure + SpacetimeDB + Vercel; next: pilot with one research office, read-only first |
| 2:55 | Close | "Try your own scenario." |

## 10. Likely judge questions

| Question | Answer |
|---|---|
| Why not let the AI approve small purchases? | We tried. 3 runs of 23 requests: never bought a bad one, but the same laptop was held twice and bought once. The university is liable for every cost (2 CFR 200.303). So it flags, a person decides |
| What's real vs simulated? | Real: grant IDs/titles/end dates, the cancellation list scrape, audit cases, the rules code, Claude calls. Simulated: the lab, people, purchases, invoices, amounts, the cancel/court/payment timeline |
| How do you know it works? | Every rule is tested in the module's test suite and the demo path is checked by hand; we're building an eval that replays planted mistakes, decoys and real audit findings, counting misses and false alarms. Results `[eval WIP]`: say it's in progress, give no numbers |
| What if sources disagree? | The grant freezes and the manager picks a source, with a reason, logged |
| Can an agent approve its own work? | No. The database rejects it by caller identity, whatever the prompt says |
| What if Claude is down? | Saved answers and deterministic fallbacks; anything uncertain goes to a human |
| How would this reach production? | Already hosted (Azure VM, maincloud, Vercel, CI). Next: SSO, read-only suggest mode, ERP connector behind the same actions, one-office pilot |
| How is this different from Workday? | Workday checks the budget line. We add the grant's real status across sources and the audit rules, and sit beside the ERP |
| Did you talk to users? | `[gap]` Answer honestly: secondary research (university procedures, surveys, researcher posts), plus what we'd ask (INTERVIEW-KIT). Update if an interview happens |

## 11. Open gaps before judging

- [ ] Real user interview (Microsoft Customer Impact, Anthropic)
- [ ] Re-check Supreme Court docket 26-210 before saying "pending"
- [ ] Ask organizers how to enter Anthropic and SpacetimeDB
- [ ] Update `DEVPOST-DRAFT.md` and `DEMO-SCRIPT.md` from §1 (stale claims)
- [ ] Finish the evals; then replace every `[eval WIP]` in this file and remove the banner at the top
- [ ] README's real-findings line (22/27) disagrees with `eval/real-findings.json` (18/25); settle when the evals are final
- [ ] Reset the live demo world right before judging
