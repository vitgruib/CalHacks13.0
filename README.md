# Grant Test Auto

An AI grant office for a university research lab. Built at Cal Hacks 13.0
for the Hyphenate track, "The Hyphenated Enterprise: Autonomous Systems for
Finance".

**Live demo:** https://calhacks130.vercel.app (web app on Vercel, connected
to the hosted database and the always-on agent worker)
**Code:** https://github.com/vitgruib/CalHacks13.0

## What it is

Grant Test Auto is the go-between for a lab's researchers and its grant office.
Researchers ask to buy things and send in invoices; AI agents check each one
against the grant's real balance, status and rules, and either act or pass
it to the one human grant manager with the reason. Anything unclear or over a limit waits for the
grant manager on the request or bill itself. Every action is logged with the
rule and the reason behind it.

**The problem in one sentence:** since 2025 a lab's grant can be canceled,
restored by a court, and still not pay a cent, while the official sources
disagree about which of those is true.

- On Grant Witness's NIH list, 5,098 awards worth $14.6B were disrupted, and
  4,352 (85%) are now marked restored [verified, our count of the Grant
  Witness CSV, as of 2026-10-23]. Grant Witness is a volunteer,
  advocacy-adjacent project; its count is the best public one, not an
  official one.
- The main UC reinstatement case is still pending at the Supreme Court
  (No. 26-210) [verified, 2026-10-24].
- 94% of 18 NSF university audits found unallowable expenses [verified,
  NSF-OIG 22-6-002].

Sources, dates and caveats: [docs/submission/IMPACT-EVIDENCE.md](docs/submission/IMPACT-EVIDENCE.md).

**The seat it fills:** the grant accountant in a university lab's grant
office, reporting to one human grant manager, who approves every purchase
and every invoice.

### For Hyphenate judges

| Their question | Where to look |
|---|---|
| Is it real enough? | Real NIH grant records and a real scrape of the public cancellation list. Evaluated only on real cases: 42 questioned costs from real audit reports, graded by what the funder or auditor decided. 18 of 24 in-scope findings stopped, both costs the funder allowed passed, 0 false alarms ([below](#real-audit-findings)). |
| Would you hire it? | Each agent logs in as its own database identity. Limits live in the database code, not in prompts: agents cannot decide Inbox items, nobody approves their own request, and nothing is bought or paid without the grant manager's approval. Every action has a Log row with a "why?". |
| Did we see something new? | The corner: the post-award grant office of a research lab during the 2025 to 2026 grant cancellations, where a grant's status is a timeline of dated events with sources, not one field. |
| The moment | A court restores a canceled grant, and Grant Test Auto still flags spending on it until the money arrives. Then the request clears every rule and the grant manager can approve it. |

## The 3-minute demo

The judge plays the grant manager. Full script, timings, a backup video
script and a "try your own scenario" playbook:
[docs/submission/DEMO-SCRIPT.md](docs/submission/DEMO-SCRIPT.md).

The demo runs on the app's demo world (`sim/demo-seed.json`, simulated
today 2026-06-15). Grant A is R01GM061721. Grant B is R21AI182745, which ends
2026-08-31, 77 days away.

1. **Funds.** Grant A was canceled on 2026-03-10 and restored by a court
   order on 2026-04-20. No payment has arrived since, so it is still frozen.
   Demo controls → Real failure cases → "Court restored, no cash" runs the
   same sequence (cut, court order, payment) on a real cut grant.
2. **A scientist asks to buy** nitrile gloves ($640) on grant A, noting that
   the court restored it. A rule engine reading "restored" would say yes.
   Grant Test Auto sends it to the Inbox flagged, and explains: no money has
   arrived since the court order. Click "why?" on its Log row.
3. **The money lands.** (Demo controls no longer has a payment button for
   grant A; the payment step lives on the "Court restored, no cash" failure
   case.) In the
   Inbox, settle "Which source is right about R01GM061721?" (RePORTER says
   active, USAspending says canceled, the cancellation list says restored by
   court) with "Pick this source" and a reason. Both steps are needed, in either order. Grant A
   unfreezes, and the gloves' Inbox item changes from "Flagged" to
   "Approve": every rule passes now. Approve it with a reason; the researcher
   buys the gloves and sends the invoice. Agar plates requested on grant B,
   now inside its last 90 days, stay flagged, citing the NSF-OIG audits of
   WVU and Delaware.
4. **Invoices.** An invoice for an order canceled on 2026-03-02 is held, with
   the timeline of what happened. The judge decides it in the Inbox. The
   reason field is required. A matching invoice also waits in the Inbox;
   approving it charges the grant (promised becomes spent) and reimburses
   the researcher.
5. **Demo controls: real audit findings.** Questioned costs from real audit
   reports, run through the real module and agents and graded by what the
   funder or auditor decided: stopped, missed, and costs the funder allowed
   that passed.

Payment requests to the government and progress-report checks are out of
scope (T105): Grant Test Auto is the interface between the grant office and the
lab's researchers. Their code is still in the repo, unused.

The app loads a smaller demo world (`sim/demo-seed.json`, 11 of the 22
purchases) so each step above is easy to find; see
`sim/README.md`. On the live site, Demo controls → Start over → "Reset to
the demo seed…" → "Yes, reset everything" resets the world to it. Demo controls also
holds the real failure cases. The live site is one shared world: anyone with
the link acts as the grant manager, and Demo controls changes the world for
everyone. Presenter
checklist and known edge cases: [docs/EDGE-TESTING.md](docs/EDGE-TESTING.md).

## How it works

```
 NIH RePORTER, USAspending, Grant Witness list (our Apify Actor), Crossref, PubMed
                 (lab's own grant IDs only; saved copies in agents/cache/)
                                     |
 +------------------- agent worker (agents/, Node) --------------------+
 |  bookkeeping agent                          payment & report agent  |
 |  Claude reads, matches and explains; saved answers + code fallback  |
 +----------------------------------+----------------------------------+
                                    |  one identity per agent; changes
                                    v  data only through actions
 +---------- SpacetimeDB module "grantguard" (server/) ----------------+
 |  20 tables, 27 actions: rules, money math, freeze, limits, the log  |
 +----------------------------------^----------------------------------+
                                    |  live subscriptions + actions
 +------------------------- web app (web/) ----------------------------+
 |  Grant office portal: 9 windows; only its Inbox decides             |
 |  2 researcher portals (Priya, Sofia): Ask, My grants, My requests   |
 +---------------------------------------------------------------------+
```

Agents and windows never talk to each other directly. Everything goes
through the database.

### The database module (`server/`, Track A)

[SpacetimeDB](https://spacetimedb.com) 2.13.0 with a TypeScript module. It is
the whole company, from grants, orders and invoices to holds, the log and a
simulated clock ([schema.ts](server/src/schema.ts), actions in
[index.ts](server/src/index.ts)).

- **Money:** awarded, received, spent, promised (orders not yet paid), and
  truly available = awarded minus spent minus promised.
- **The freeze rule:** a cancellation freezes spending. Only a payment that
  lands after it unfreezes the grant; a court order alone does not. A
  disagreement between sources about status also freezes spending and asks
  the grant manager.
- **Seven spending rules** ([rules.ts](server/src/rules.ts)): the grant is
  active and not frozen; supplies are not bought in its last 90 days; the
  category is allowed; at or under the $5,000 card limit; the same person's
  same-day purchases in one category add up to no more than that limit (a
  split purchase); enough truly available money. Each purchase is charged to
  one grant. The last-90-days, category and split-purchase rules cite a real
  audit case when they fail.
- **Invoice and payroll checks:** a bill must match its order and approval,
  and is held if its order was canceled, the order was already paid (a
  duplicate), or it arrived before the order was placed. Salary for anyone over 100%
  effort across grants is left out of a payment request until it's fixed.
- **Hard limits in code:** each identity is bound to one role, once. Agents
  cannot decide Inbox items ("Agents cannot do this; only people can").
  Nobody approves their own request. A buy fails unless every rule passes,
  rechecked inside the action.
- **Agents report facts, the module decides.** Agents call actions such as
  `evaluate_request`, `check_invoice`, `record_paper_facts` and
  `post_status_event`; the module applies the rule and raises the Inbox item.

### The agents (`agents/`, Track B)

One worker process connects the agents, each with its own SpacetimeDB
identity ([agents/README.md](agents/README.md)).

| Agent (role) | Seat | What it does |
|---|---|---|
| Bookkeeping (`bookkeeping`) | Grant accountant | Fund tracker: reads the sources on "Check now" and right before money moves (never on a timer); posts only changes, each with its source and date; flags sources that disagree, spending while canceled, and a court order with no payment. Also checks every invoice against its order and approval. |
| ~~Purchasing (`purchasing`)~~ | Cut (T108) | The grant manager approves every request instead. Its code stays in `agents/`, unused; the worker doesn't start it. |
| Payment and report (`payment_report`) | Out of scope (T105); still runs, nothing shows it | Drafts each month's payment request (up to 1,000 characters) and answers to follow-up questions, both approved by a person. Checks each progress-report paper's grant credit, PubMed Central ID and corrections. |

**Claude's role.** Claude checks whether a grant could pay for an asked-for
item at all (Ask's item check), writes explanations, payment justifications and follow-up answers,
and judges paper corrections. It never does the math: amounts and verdicts
come from the module. Where its text quotes records, code checks it, and an
ID or amount that isn't in the records sends the agent back to a template.
Every call has a saved answer (committed in `agents/cache/claude/`) and a
deterministic fallback, so the agents also run with no API key. Default
model: `claude-sonnet-5-5`. The hosted worker runs `claude-haiku-5-5` to keep
costs down. It plays its own saved answers first, then the team's saved
Sonnet answers (`GG_REUSE_SAVED=1`), so only questions nobody has answered
before cost a call.

### The grant manager

The Inbox is the only window with decision buttons (Approve, Reject,
Override, Ask vendor, Pick this source). Every decision needs a reason; the module
rechecks the rules, then acts. Researchers are people using their own
researcher portals; the agency's follow-up questions are pre-written in the seed.

### Outside data

| Source | What it gives the tracker | Code |
|---|---|---|
| NIH RePORTER | Grant status and award by project number | `agents/src/sources/reporter.ts` |
| USAspending | Money obligated and paid out on the award (it reports no status; the seed's USAspending status readings are simulated) | `agents/src/sources/usaspending.ts` |
| Grant Witness NIH list, through our Apify Actor | Canceled, reinstated or unfrozen | [scrapers/](scrapers/README.md), `agents/src/sources/cancellations.ts` |
| Crossref, PubMed and PubMed Central | Funding credits, PMCIDs, corrections and retractions | `agents/src/sources/papers.ts` ([verified demo papers](agents/src/sources/papers.md)) |

The tracker looks up only the lab's own grant IDs. Every answer is saved in
`agents/cache/` (committed), so the agents also run offline. The Funds
window shows "Sources last checked X ago" and a "Check now" button that runs
a tracker check. With the government sources switched on
(`GG_LIVE_SOURCES=1` and an Apify token), it also starts a fresh Apify run.
The hosted worker reads only the live cancellation list (`GG_LIVE_SOURCES=list`):
live RePORTER says R21AI182745 has ended. With no Apify Actor or scraper
output, it reads the saved copy of the lab grants' rows in
`agents/cache/cancellation-list-lab.json`. The demo's real failure cases don't move
the clock or read the list as of another day: each step changes the grant
directly (cancel it, restore it by court order, land a payment), dated the
day that really happened, and the agents react.

### The web app (`web/`, Track C)

Vite, React 19 and TypeScript. It reads the live module and falls back to
the bundled seed, with an "Offline demo data" badge, if it can't connect.
The app has three separate portals, and a portal switch (in the grant office
nav, or the researcher header) moves between them. Each window has one job
([web/src/windows/registry.ts](web/src/windows/registry.ts)):

- **Grant office portal** (the grant manager): Funds (real money, status
  timeline, flags), Requests (every researcher's requests, each saying
  "Requested by" whom, with a researcher filter, plus the experiment plans
  researchers submitted: each plan's funding-readiness report as a written
  summary and one table of its lines, and Approve or Return with a reason; a held request is decided on its card), Invoice (matched or held bills, decided on their card), Rules
  (every check a purchase request goes through), Demo controls (demo only: start over, the real
  failure cases, inject events, scorecard).
- **Researcher portals**, one per researcher: **Dr. Priya Nair**
  (postdoctoral researcher, grant A, R01GM061721) and **Sofia Alvarez**
  (graduate researcher, grant B, R21AI182745). Each has Ask (which grant can
  pay, in plain words), My grants (a paused grant shows where its money is),
  My requests: ask for one item, or plan an experiment with a line-item
  budget and get a funding-readiness report (scope, allowability, budget,
  follow-ups) before sending it. A plan that clears all three checks sends
  each line to the grant office as its own request; any other waits for
  the grant office to approve the plan first. Plans are stored in SpacetimeDB, so every portal on every
  computer sees them. A researcher sees
  only their own requests and can push back only on those. They never see the grant office's windows.

Each researcher is a separate identity on the server, so every request
stores who asked (`request.requesterName`), and only that person can push
back on it. The grant office uses this to know which researcher to answer.

## What's real and what's simulated

| Piece | Real or simulated |
|---|---|
| The eight grants (IDs, titles, end dates) | Real NIH awards. The two demo-path grants were checked against NIH RePORTER on 2026-10-24: R01GM061721 "Biogenesis of the mitochondrial inner membrane" (NIGMS, ends 2027-07-31) and R21AI182745 "Investigating ploidy modulation as a strategy to improve antibiotic activity" (NIAID, ends 2026-08-31). The other six are real cuts taken from the live cancellation list for the real failure cases (T65) |
| The lab, its people, purchases, invoices, approvals, payroll, amounts and start dates | Simulated. None of it describes the real investigators or their work |
| The cancel, court order and payment timeline | Simulated (ready-made status events). The real R01GM061721 was terminated in 2025 and reinstated under *Thakur v. Trump*, which is why live government lookups stay off in the scripted demo (`GG_LIVE_SOURCES`) |
| The cancellation list | Real: the Grant Witness NIH CSV, scraped by our Apify Actor (5,776 rows into 5,635 grants on 2026-10-24) [ours] |
| Papers in the progress report | Simulated (7 papers in the full seed, 2 in the app's demo world). The report checker's live lookup was verified on 2026-10-24 on 12 real papers and their 8 correction and retraction notices, saved for offline use |
| Government payment system and follow-up questions | Simulated; the questions are pre-written in the seed |
| Rules, money math and limits | Real code in the module, with a test for each planted case and decoy |
| The audit cases the rules cite (WVU, Delaware, UC Davis, the NSF-OIG summary) | Real public audit findings ([pain point 08](docs/research/pain-points/08-unallowable-purchases-audits.md)) |

### Regression test on the sim seed

`eval/` ([score.mjs](eval/score.mjs)) replays the sim seed through the real
module and agents and judges the result against
[sim/answer-key.json](sim/answer-key.json). Its cases are made up (modeled
on real findings), so it is not shown as a result: `./check.sh` runs it with
`--strict` and fails on any miss or false alarm, as a regression test for
the demo path. Every case: [sim/README.md](sim/README.md#planted-cases).

### Real audit findings

`eval/real-findings.mjs` (T80) takes 42 questioned costs from real audit
reports saved in `docs/research/sources/docs/`, rebuilds each one as
records in a fresh copy of the sim seed, and runs it through the same
module and agents. Each case's quote is checked against its saved source,
and each is graded by what was finally decided about that cost. There are no
made-up cases or decoys (T113): the only decoys are costs a funder allowed.
In [eval/real-findings.json](eval/real-findings.json) (`GG_CLAUDE=offline`):

| Decided by | Stopped | Allowed costs passed | Out of scope |
|---|---|---|---|
| Funder disallowed (NSF resolution letter) | 6 of 6 | | 4 |
| Funder allowed (NSF resolution letter) | | 2 of 2 | 2 |
| Auditee agreed | 2 of 4 | | 3 |
| Auditor only | 8 of 8 | | 9 |
| Partly allowed (items not named) | 2 of 4 | | |
| **Total** | **18 of 24, 6 missed** | **2 of 2, 0 false alarms** | **18** |

The 18 out-of-scope findings have no Grant Test Auto rule to test (or need
progress reports, out of scope since T105) and are listed with the reason.
Demo controls shows every finding.

### Fund tracker on real grants

`eval/fund-tracker-real.mjs` (T114) replays 37 real NIH grants from
[Grant Witness](https://grantwitness.org/nih) through the real tracker, month by
month from January 2025, reading saved copies of the cancellation list,
USAspending monthly outlays and RePORTER as they stood on each day. Cases:
still terminated, paid while terminated, Duke's funds freeze, the Thakur and
Harvard court restorations, restored then paid, restored then cut again,
supplement-only cuts, a RePORTER/USAspending disagreement, freezes lifted,
and never-cut grants as decoys. Every fact is checked against its saved
source; what should happen follows the grant office's rule (frozen from
cancellation until a payment lands after a restoration).

| | Result |
|---|---|
| Should be frozen or flagged | 38 of 38 caught, 0 missed |
| Should be open | 30 of 35 passed, 5 false alarms |

All 5 false alarms have one cause: when Grant Witness marks a frozen grant
"Unfrozen", the tracker doesn't treat it as a restoration, so it keeps those
grants (Columbia, Cornell, Northwestern) frozen after they were paid
normally. Limits: each month's outlays are treated as known at month end
(USAspending really lags about 2 months), and RePORTER is read only today.

### Item check on real audited items

`eval/item-check-real.mjs` (T115) runs Claude's item check (Haiku, through
`agents/src/claude.ts`) on 39 real items from NSF-OIG audits and NSF
resolution letters: 28 the auditors questioned as unallowable (alcohol,
entertainment, gifts, meals, general-use computers) and 11 the funder or
auditor accepted. Each item quotes its saved source and the decision on it.
Claude was asked once per item; the answers are saved in
`agents/cache/claude/` and replayed by `./check.sh`.

| Decided by | Flagged | Accepted items passed |
|---|---|---|
| Funder disallowed | 22 of 22 | |
| Funder allowed | | 3 of 6 |
| Auditee agreed | 3 of 3 | |
| Auditor only | 3 of 3 | 2 of 5 |
| **Total** | **28 of 28, 0 missed** | **5 of 11, 6 false alarms** |

It never missed an unallowable item, but it leans toward flagging: it
flagged budgeted training lunches, polo shirts for fieldwork, a research
vessel with no purpose given and a laptop, all later accepted. A flag is
advice to the researcher before they send the request; it blocks nothing,
and the grant manager still decides every request.

## Run it locally

### Prerequisites

- **Node 22.4 or later** (the packages declare `>=22`).
- **SpacetimeDB CLI 2.13.0**, only for the local server and deploys:

```sh
curl -sSf https://install.spacetimedb.com | sh
spacetime version install 2.13.0 --use   # pin the version CI uses
spacetime --version                       # should say 2.13.0
```

- **Keys are optional.** Without them the agents use saved answers and code
  fallbacks.

```sh
git clone https://github.com/vitgruib/CalHacks13.0 && cd CalHacks13.0
cp .env.example .env.local   # fill in keys shared out of band; never commit them
```

The agent worker reads the repo root's `.env.local`. Variable names only:
`ANTHROPIC_API_KEY`, `APIFY_TOKEN`, `GG_APIFY_ACTOR`, `GG_APIFY_DATASET`,
`GG_CONTACT_EMAIL`, `GG_MODEL`, and the `GG_*` settings below. Full list
with defaults: [agents/README.md#environment](agents/README.md#environment).

### The check (must pass before every push)

```sh
./check.sh
```

Installs each package on a fresh clone, then runs typecheck and tests for
`server/`, `agents/`, `eval/` and `scrapers/`, a typecheck and production
build for `web/` (it has no tests), then the evals. It rewrites
`eval/real-findings.json` and `eval/scorecard.json`. A miss or false alarm on
the sim seed fails the check (`score.mjs --strict`); real-findings misses
are reported, not failed.

### Fastest: everything in one process, no server, no key

```sh
npm --prefix server install          # the in-process database runs server/src
npm --prefix agents install
npm --prefix agents run demo         # plays the sim world to quiet; prints the Inbox and what each agent did

npm --prefix web install
VITE_BACKEND=local npm --prefix web run dev   # the web app on the bundled seed; changes stay in the tab
```

### Full stack on a local SpacetimeDB

```sh
npm --prefix server run dev                 # starts SpacetimeDB on :3000 if needed, publishes grantguard, regenerates bindings
GG_DB=spacetime npm --prefix agents start   # the agents against local grantguard (keep it running)
npm --prefix web run dev                    # connects to ws://localhost:3000, database grantguard
```

Open the URL Vite prints, then Demo controls → Start over → "Reset to the
demo seed…" → "Yes, reset everything" to load the sim world. `npm --prefix server run dev -- --reset` wipes local
data. After pulling a change to `server/`, run `npm --prefix server run
generate` (or `dev`) to regenerate the client bindings.

Don't run the agent worker against maincloud from a laptop: the hosted
worker's identities own the three agent roles there.

### Other commands

```sh
node sim/build-seed.mjs                    # regenerate sim/seed.json (edit build-seed.mjs, not the JSON)
node sim/validate.mjs                      # check the seed and answer key against each other
node eval/score.mjs --no-write             # score without rewriting eval/scorecard.json
npm --prefix scrapers install
npm --prefix scrapers run scrape           # live Grant Witness list -> scrapers/out/cancellations.json
npm --prefix scrapers run scrape:saved     # the bundled saved copy (23 real rows), offline
npm --prefix hero install
npm --prefix hero run dev                  # 3D hero mockups on port 5190 (outside check.sh)
```

### Offline and cached modes

| Setting | Values (default first) | Effect |
|---|---|---|
| `GG_CLAUDE` | `cached`, `live`, `offline`, `off` | Saved answer else ask Claude and save it; always ask; saved answers only; code fallbacks only |
| `GG_SOURCES` | `live`, `offline` | Ask the sites and fall back to saved copies; saved copies only |
| `GG_LIVE_SOURCES` | off, `1`, `list` | `1` makes `npm start` read RePORTER, USAspending and the cancellation list; `list` reads only the cancellation list |
| `GG_DB` | `local`, `spacetime` | The module in this process on `sim/seed.json`; a SpacetimeDB server (`GG_SPACETIME_URI`, `GG_SPACETIME_DB`) |
| `VITE_BACKEND` | live, `local` | Web reads the module (`VITE_STDB_URI`, `VITE_STDB_DB`); web uses the bundled seed only |
| `GG_SCRAPE_SOURCE` | `live`, `saved` | Scraper reads the live CSV; the saved copy |

## Deploys

| Piece | Where it runs | How it updates |
|---|---|---|
| Web app | Vercel, https://calhacks130.vercel.app (root `web/`, pointed at maincloud) | Vercel builds from `main` (configured in Vercel, not in this repo) |
| Database module | SpacetimeDB maincloud, database `grantguard` | [publish-module.yml](.github/workflows/publish-module.yml) runs on pushes to `main` that touch `server/`: the server check, then [deploy/publish-module.sh](deploy/publish-module.sh). Only the identity that owns the database can publish. A schema change maincloud can't migrate fails the run and leaves the old module live |
| Agent worker | Azure VM `grantguard-agents` (westus2), systemd service `grantguard-agents` | [deploy-agents.yml](.github/workflows/deploy-agents.yml) runs on pushes that touch `agents/`, `server/` or `sim/`: it SSHes in and runs [update.sh](deploy/agent-worker/update.sh). One-time setup: [setup.sh](deploy/agent-worker/setup.sh) |
| Cancellation-list Actor | Apify, `nathanqiu/nih-grant-cancellation-list` (private) | By hand: `npx apify-cli push` from `scrapers/` ([scrapers/README.md](scrapers/README.md#publish-to-apify-needs-nathans-token)) |

VM access and logs are in [HUMAN_TODO.md](HUMAN_TODO.md). A second Vercel
project, `cal-hacks13-0`, has no settings and shows offline data; use the
URL above.

## Repo map

| Path | What it is | Lane |
|---|---|---|
| [server/](server/src/schema.ts) | SpacetimeDB module: tables, actions, rules, fixtures, tests | A |
| [agents/](agents/README.md) | Agent worker: the agents, source clients, Claude helper, saved answers | B |
| `web/` | The web app; windows in `web/src/windows/` | C |
| [sim/](sim/README.md) | The simulated lab: seed, answer key, generator, validator | C |
| `eval/` | Evals: real audit findings, plus the sim-seed regression test | C |
| [scrapers/](scrapers/README.md) | Apify Actor for the Grant Witness NIH list | C |
| `hero/` | Standalone 3D hero-dashboard mockups on a scripted feed (T23, in progress) | none |
| `deploy/` | Maincloud publish script; agent worker VM setup, update and service | A |
| `.github/workflows/` | Publish module, deploy agents | A |
| `docs/` | Plan, submission drafts, research | all |
| [check.sh](check.sh) | The repo-wide check | all |

## Working on it (team)

Three lanes, one owner each, split along directories:

| Lane | Owner | Owns |
|---|---|---|
| A: database, rules, shared contract, deploy | @suhu | `server/`, `deploy/` |
| B: agent worker, government data readers | @nathan | `agents/` |
| C: windows, test data, scraper, scorecard | @ethan | `web/`, `sim/`, `eval/`, `scrapers/` |

The shared contract is the module's tables and actions in `server/`. Change
it only by adding; a breaking change needs a [DECISIONS.md](DECISIONS.md)
line and a fix for every caller in the same commit.

**One-time setup (per person, about 2 minutes):**

```sh
git clone https://github.com/vitgruib/CalHacks13.0 && cd CalHacks13.0
git config pull.rebase true        # rebase only your unpushed commits on pull
git config rebase.autoStash true   # don't block pulls on uncommitted work
git config rerere.enabled true     # reuse conflict resolutions
cp .env.example .env.local         # then fill in keys shared out-of-band
```

Point your agent at the repo. Claude Code reads `CLAUDE.md`; Codex, Cursor
and others read `AGENTS.md` (same rules). Each session, tell your agent who
you are, for example "I'm @nathan; pick up the next task in TASKS.md." Give
each extra agent its own clone.

**The loop:** pull, read [TASKS.md](TASKS.md), the end of
[PROGRESS.md](PROGRESS.md) and [DECISIONS.md](DECISIONS.md); claim one task
and push the claim; stay in your lane (ask through *Requests* in TASKS.md);
run `./check.sh` after pulling and before every push; push every 15 to 45
minutes; log the result in PROGRESS.md. Never push red, never force-push,
and unblock others before your own work. Full rules: [AGENTS.md](AGENTS.md).
Things only people can do (keys, deploys, the video, Devpost) go in
[HUMAN_TODO.md](HUMAN_TODO.md).

Deadlines: Devpost closes Sun 10/25 at 9:00 AM (no late entries); feature
freeze is 7:00 AM; judging is 10:30 to 12:30 with a live demo.

## Documentation index

```
README.md                  you are here: what it is, the demo, how it works, how to run it
docs/
  MASTER-PLAN.md           the product spec: seats, features, rules, planted mistakes, windows, demo path
  ARCHITECTURE.md          stack, identities and where tokens live, with diagrams
  EDGE-TESTING.md          known edge cases and the pre-demo checklist
  HYPHENATE.md             the primary track's brief and judging criteria, and how we answer each
  TRACKS.md                event rules and the other prize tracks we enter
  submission/              what judges and Devpost see
  research/                the evidence behind every claim
server/ agents/ sim/ scrapers/   component READMEs, below
AGENTS.md TASKS.md ...     team process, below
```

### Submission

| Doc | What it's for |
|---|---|
| [DEMO-SCRIPT.md](docs/submission/DEMO-SCRIPT.md) | 3-minute live demo, backup video shot list, judge-scenario playbook, pre-record checklist |
| [DEVPOST-DRAFT.md](docs/submission/DEVPOST-DRAFT.md) | Paste-ready Devpost text, track pitches, sources; still has `[TBD]` fields |
| [IMPACT-EVIDENCE.md](docs/submission/IMPACT-EVIDENCE.md) | Problem size, market and measured results, each with source and date |
| [INTERVIEW-KIT.md](docs/submission/INTERVIEW-KIT.md) | Hyphenate booth sheet, interview guide, unsent outreach drafts |

### Research and evidence

Read [docs/research/README.md](docs/research/README.md) before citing
anything: every figure needs a source and a tag ([verified], [scrape],
[agent-reported], [unverified]). It indexes the pain points and the real
audit findings behind each planted mistake.

| Pain point | In one line |
|---|---|
| [01 No source of truth](docs/research/pain-points/01-no-source-of-truth.md) | Nobody has a complete list of which grants were cut |
| [02 Status reversals](docs/research/pain-points/02-status-reversals.md) | A canceled grant might not stay canceled |
| [06 Awarded vs paid](docs/research/pain-points/06-awarded-vs-paid.md) | The amount on paper isn't the money actually paid |
| [07 Balance visibility](docs/research/pain-points/07-balance-visibility-admin-burden.md) | Researchers can't see trustworthy balances; admin eats their time |
| [08 Unallowable purchases](docs/research/pain-points/08-unallowable-purchases-audits.md) | The same lab-spending mistakes keep failing audits |
| [09 ERP outages](docs/research/pain-points/09-erp-outages.md) | Finance-system rollouts freeze purchasing and billing (context) |
| [10 Drawdown justification](docs/research/pain-points/10-drawdown-justification.md) | Every federal drawdown now needs a written justification |

Raw text behind the claims (audits, surveys, letters, Reddit scrapes) is in
[docs/research/sources/](docs/research/sources/).

### Component docs

| Doc | What it's for |
|---|---|
| [agents/README.md](agents/README.md) | Agent worker: run commands, code layout, every environment variable |
| [agents/src/sources/papers.md](agents/src/sources/papers.md) | The real papers verified for the report checker, with their API calls |
| [sim/README.md](sim/README.md) | The simulated lab, the planted cases and the rule assumptions |
| [scrapers/README.md](scrapers/README.md) | The cancellation-list scraper: source, row shape, local runs, publishing |
| [scrapers/.actor/README.md](scrapers/.actor/README.md) | Apify Store page text for the Actor (the Actor is still private) |

### Team process

| Doc | What it's for |
|---|---|
| [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md) | Rules for every agent and human in the repo |
| [TASKS.md](TASKS.md) | Live work queue for agents, lanes and cross-lane requests |
| [HUMAN_TODO.md](HUMAN_TODO.md) | What only people can do: submission, setup, VM access, dashboards |
| [PROGRESS.md](PROGRESS.md) | What landed, when, and how it was checked |
| [DECISIONS.md](DECISIONS.md) | Why the stack and scope are what they are, including what was cut |
