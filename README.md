# GrantGuard

An AI grant office for a university research lab. Built at Cal Hacks 13.0
for the Hyphenate track, "The Hyphenated Enterprise: Autonomous Systems for
Finance".

**Live demo:** https://calhacks130.vercel.app (web app on Vercel, connected
to the hosted database and the always-on agent worker)
**Code:** https://github.com/vitgruib/CalHacks13.0

## What it is

GrantGuard runs the money side of a lab's federal grants. Three AI agents
fill three seats in the lab's grant office and answer to one human grant
manager. They track each grant's real balance and status, keep purchases
inside the grant's rules, check invoices against orders, draft the lab's
payment requests to the government, and check the papers listed in progress
reports. Anything unclear or over a limit waits in the grant manager's
Inbox. Every action is logged with the rule and the reason behind it.

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

**The seats it fills:** the purchasing agent, the grant accountant, and the
payment and report preparer in a university lab's grant office, all
reporting to one human grant manager.

### For Hyphenate judges

| Their question | Where to look |
|---|---|
| Is it real enough? | Real NIH grant records and a real scrape of the public cancellation list. A simulated lab with 14 planted mistakes modeled on real audit findings, plus 5 decoys. Scorecard: 14 of 14 caught, 0 false alarms ([below](#whats-real-and-whats-simulated)). |
| Would you hire it? | Each agent logs in as its own database identity. Limits live in the database code, not in prompts: agents cannot decide Inbox items, nobody approves their own request, and an agent buys alone only under the $5,000 card limit with every rule passing. Every action has a Log row with a "why?". |
| Did we see something new? | The corner: the post-award grant office of a research lab during the 2025 to 2026 grant cancellations, where a grant's status is a timeline of dated events with sources, not one field. |
| The moment | A court restores a canceled grant, and the agent still won't spend until the money arrives. Then it buys on its own. |

## The 3-minute demo

The judge plays the grant manager. Full script, timings, a backup video
script and a "try your own scenario" playbook:
[docs/submission/DEMO-SCRIPT.md](docs/submission/DEMO-SCRIPT.md).

The demo runs on the sim world (`sim/seed.json`, simulated today
2026-06-15). Grant A is R01GM061721. Grant B is R21AI182745, which ends
2026-08-31, 77 days away.

1. **Funds.** Grant A was canceled on 2026-03-10 and restored by a court
   order on 2026-04-20. No payment has arrived since, so it is still frozen.
   The Test lab buttons "Cancel grant", "Court order restores it" and
   "Payment arrives" replay this sequence on either grant.
2. **A scientist asks to buy** nitrile gloves ($640) on grant A, noting that
   the court restored it. A rule engine reading "restored" would say yes.
   The purchasing agent holds the request and explains: no money has
   arrived since the court order. Click "why?" on its Log row.
3. **The money lands.** In the Test lab, press "Payment arrives". In the
   Inbox, settle "Which source is right about R01GM061721?" (RePORTER says
   active; USAspending and the cancellation list say canceled) with "Pick
   this source" and a reason. Both steps are needed, in either order. Grant A
   unfreezes, and the waiting purchases go through on their own: the gloves,
   a kit priced exactly at the card limit, and a cost split 60/40 across
   both grants. Agar plates requested on grant B, now inside its last 90
   days, are rerouted to grant A, citing the NSF-OIG audits of WVU and
   Delaware.
4. **Invoices.** An invoice for an order canceled on 2026-03-02 is held, with
   the timeline of what happened. The judge decides it in the Inbox. The
   reason field is required.
5. **Payment requests.** The agent drafts May's payment request for grant B
   from the purchase records (up to 1,000 characters), leaves out a purchase
   whose invoice is on hold, and drafts an answer to the agency's follow-up
   question that quotes the exact purchases. Both wait for the grant
   manager.
6. **Reports.** The progress-report check holds a paper that credits the
   wrong grant and proposes moving its cost, with the days left on the
   90-day limit. It also holds a paper with no PubMed Central ID and a
   corrected paper listed without disclosure.
7. **Test lab: the scorecard.** Planted mistakes caught, missed, and false
   alarms on decoys.

On the live site, "Load demo seed" in the status bar resets the world to the
sim seed. The live site is one shared world: anyone with the link acts as the
grant manager, and the Test lab changes the world for everyone. Presenter
cautions: [docs/TRACK-B-MANUAL.md#demo-cautions](docs/TRACK-B-MANUAL.md#demo-cautions).

## How it works

```
 NIH RePORTER, USAspending, Grant Witness list (our Apify Actor), Crossref, PubMed
                 (lab's own grant IDs only; saved copies in agents/cache/)
                                     |
 +------------------- agent worker (agents/, Node) --------------------+
 |  bookkeeping agent     purchasing agent     payment & report agent  |
 |  Claude reads, matches and explains; saved answers + code fallback  |
 +----------------------------------+----------------------------------+
                                    |  one identity per agent; changes
                                    v  data only through actions
 +---------- SpacetimeDB module "grantguard" (server/) ----------------+
 |  20 tables, 27 actions: rules, money math, freeze, limits, the log  |
 +----------------------------------^----------------------------------+
                                    |  live subscriptions + actions
 +------------------------- web app (web/) ----------------------------+
 |  Grant office portal: 8 windows; only its Inbox decides            |
 |  2 researcher portals (Priya, Sofia): Ask, My grants, My requests  |
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
- **Six spending rules** ([rules.ts](server/src/rules.ts)), each with a real
  audit case: the grant is active and not frozen; not in its last 90 days;
  the category is allowed; under the $5,000 card limit; enough truly
  available money; a shared cost is split across the grants it serves.
- **Hard limits in code:** each identity is bound to one role, once. Agents
  cannot decide Inbox items ("Agents cannot do this; only people can").
  Nobody approves their own request. A buy fails unless every rule passes,
  rechecked inside the action.
- **Agents report facts, the module decides.** Agents call actions such as
  `evaluate_request`, `check_invoice`, `record_paper_facts` and
  `post_status_event`; the module applies the rule and raises the Inbox item.

### The three agents (`agents/`, Track B)

One worker process connects the three agents, each with its own SpacetimeDB
identity ([agents/README.md](agents/README.md)).

| Agent (role) | Seat | What it does |
|---|---|---|
| Bookkeeping (`bookkeeping`) | Grant accountant | Fund tracker: reads the sources daily, on "Check now" and right before money moves; posts only changes, each with its source and date; flags sources that disagree, spending while canceled, and a court order with no payment. Also checks every invoice against its order and approval. |
| Purchasing (`purchasing`) | Purchasing agent | Reads each request, picks the grant, asks the module for its verdicts, then buys, blocks, reroutes or holds for the grant manager, explaining the failed rule. A request held only by a freeze is bought once the grant unfreezes. |
| Payment and report (`payment_report`) | Payment and report preparer | Drafts each month's payment request (up to 1,000 characters) and answers to follow-up questions, both approved by a person. Checks each progress-report paper's grant credit, PubMed Central ID and corrections. |

**Claude's role.** Claude reads requests (which grant, shared use, a stated
split), writes explanations, payment justifications and follow-up answers,
and judges paper corrections. It never does the math: amounts and verdicts
come from the module. Where its text quotes records, code checks it, and an
ID or amount that isn't in the records sends the agent back to a template.
Every call has a saved answer (committed in `agents/cache/claude/`) and a
deterministic fallback, so the agents also run with no API key. Default
model: `claude-sonnet-5-5`. The hosted worker runs `claude-haiku-5-5` to keep
costs down, but plays the saved Sonnet answers first (`GG_REUSE_SAVED=1`), so
only questions nobody has answered before cost a call.

### The grant manager

The Inbox is the only window with decision buttons (Approve, Reject,
Override, Pick this source). Every decision needs a reason; the module
rechecks the rules, then acts. Researchers are people using their own
researcher portals; the agency's follow-up questions are pre-written in the seed.

### Outside data

| Source | What it gives the tracker | Code |
|---|---|---|
| NIH RePORTER | Grant status and award by project number | `agents/src/sources/reporter.ts` |
| USAspending | Whether the award still shows as active | `agents/src/sources/usaspending.ts` |
| Grant Witness NIH list, through our Apify Actor | Canceled, reinstated or unfrozen | [scrapers/](scrapers/README.md), `agents/src/sources/cancellations.ts` |
| Crossref, PubMed and PubMed Central | Funding credits, PMCIDs, corrections and retractions | `agents/src/sources/papers.ts` ([verified demo papers](agents/src/sources/papers.md)) |

The tracker looks up only the lab's own grant IDs. Every answer is saved in
`agents/cache/` (committed), so the agents also run offline. The Funds
window shows "Sources last checked X ago" and a "Check now" button that runs
a tracker check (and a fresh Apify run, when the worker has an Apify token).

### The web app (`web/`, Track C)

Vite, React 19 and TypeScript. It reads the live module and falls back to
the bundled seed, with an "Offline demo data" badge, if it can't connect.
The app has three separate portals, and a portal switch (in the grant office
nav, or the researcher header) moves between them. Each window has one job
([web/src/windows/registry.ts](web/src/windows/registry.ts)):

- **Grant office portal** (the grant manager): Funds (real money, status
  timeline, flags), Requests (every researcher's requests, each saying
  "Requested by" whom, with a researcher filter), Invoices (matched or held),
  Payment requests, Reports (each paper's checks), Inbox (waiting for a
  human, with evidence; a purchase hold names the researcher who asked), Log
  (who did what, and why), Test lab (demo only: inject events, fast-forward,
  scorecard).
- **Researcher portals**, one per researcher: **Dr. Priya Nair**
  (postdoctoral researcher, grant A, R01GM061721) and **Sofia Alvarez**
  (graduate researcher, grant B, R21AI182745). Each has Ask (which grant can
  pay, in plain words), My grants (a paused grant shows where its money is)
  and My requests. A researcher sees only their own requests and can push
  back only on those. They never see the grant office's windows.

Each researcher is a separate identity on the server, so every request
stores who asked (`request.requesterName`), and only that person can push
back on it. The grant office uses this to know which researcher to answer.

## What's real and what's simulated

| Piece | Real or simulated |
|---|---|
| The two grants (IDs, titles, institutes, end dates) | Real NIH records, checked against NIH RePORTER on 2026-10-24: R01GM061721 "Biogenesis of the mitochondrial inner membrane" (NIGMS, ends 2027-07-31) and R21AI182745 "Investigating ploidy modulation as a strategy to improve antibiotic activity" (NIAID, ends 2026-08-31) |
| The lab, its people, purchases, invoices, approvals, payroll, amounts and start dates | Simulated. None of it describes the real investigators or their work |
| The cancel, court order and payment timeline | Simulated (ready-made status events). The real R01GM061721 was terminated in 2025 and reinstated under *Thakur v. Trump*, which is why live government lookups stay off in the scripted demo (`GG_LIVE_SOURCES`) |
| The cancellation list | Real: the Grant Witness NIH CSV, scraped by our Apify Actor (5,776 rows into 5,635 grants on 2026-10-24) [ours] |
| Papers in the progress report | Simulated (12 papers). The report checker's live lookup was verified on 21 real papers, cached |
| Government payment system and follow-up questions | Simulated; the questions are pre-written in the seed |
| Rules, money math and limits | Real code in the module, with a test for each planted case and decoy |
| The audit cases the rules cite (WVU, Delaware, UC Davis, the NSF-OIG summary) | Real public audit findings ([pain point 08](docs/research/pain-points/08-unallowable-purchases-audits.md)) |

### The scorecard

`eval/` ([score.mjs](eval/score.mjs)) replays the sim seed through the real
module and agents and scores the result against
[sim/answer-key.json](sim/answer-key.json). It runs in `./check.sh`; the
Test lab shows it.

| Area | Planted mistakes caught | Decoys passed (no false alarm) |
|---|---|---|
| Fund tracker | 3 of 3 | none planted |
| Purchases | 5 of 5 | 2 of 2 |
| Invoices | 2 of 2 | 1 of 1 |
| Payment requests | 1 of 1 | none planted |
| Progress reports | 3 of 3 | 2 of 2 |
| **Total** | **14 of 14, 0 missed** | **5 of 5, 0 false alarms** |

From `node eval/score.mjs --no-write` on 2026-10-24 at commit c3aecac; same
as the committed [eval/scorecard.json](eval/scorecard.json). It measures our
own planted cases, modeled on real audit findings, in a simulated lab, with
saved Claude answers or code fallbacks (`GG_CLAUDE=offline`). So it tests
the rules and the pipeline end to end, not live model judgment, and these
are not field results. Every case: [sim/README.md](sim/README.md#planted-cases).

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
`server/`, `agents/`, `eval/`, `web/` and `scrapers/`, and prints the
scorecard. It rewrites `eval/scorecard.json`. A miss or false alarm is
printed but does not fail the check; `node eval/score.mjs --strict` exits 1
on either.

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
GG_DB=spacetime npm --prefix agents start   # the three agents against local grantguard (keep it running)
npm --prefix web run dev                    # connects to ws://localhost:3000, database grantguard
```

Open the URL Vite prints and click "Load demo seed" in the status bar to
load the sim world. `npm --prefix server run dev -- --reset` wipes local
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
| `GG_LIVE_SOURCES` | off, `1` | `1` makes `npm start` read RePORTER, USAspending and the cancellation list |
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
| [agents/](agents/README.md) | Agent worker: the three agents, source clients, Claude helper, saved answers | B |
| `web/` | The web app; windows in `web/src/windows/` | C |
| [sim/](sim/README.md) | The simulated lab: seed, answer key, generator, validator | C |
| `eval/` | The scorecard: replay, judge, `scorecard.json` | C |
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

### Plan and scope

| Doc | What it's for | Who it's for |
|---|---|---|
| [docs/MASTER-PLAN.md](docs/MASTER-PLAN.md) | Locked scope: seats, features, windows, the demo path, build tracks, kickoff prompts. Newest source of scope | Everyone |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature IDs (P1 to P6, B1 to B7, S1 to S5) cited in tasks and commits; older than the master plan | Builders |
| [docs/HYPHENATE.md](docs/HYPHENATE.md) | The Hyphenate brief and judging criteria, verbatim, with what they mean for us | Everyone, pitch |
| [docs/TRACKS.md](docs/TRACKS.md) | Event rules, the other prize tracks we target, and tracks we cut | Submission |

### Submission

| Doc | What it's for | Who it's for |
|---|---|---|
| [docs/submission/DEMO-SCRIPT.md](docs/submission/DEMO-SCRIPT.md) | 3-minute live demo, backup video shot list, judge-scenario playbook, pre-record checklist | Presenters |
| [docs/submission/DEVPOST-DRAFT.md](docs/submission/DEVPOST-DRAFT.md) | Paste-ready Devpost text, track pitches, sources; still has `[TBD]` fields | Whoever submits |
| [docs/submission/IMPACT-EVIDENCE.md](docs/submission/IMPACT-EVIDENCE.md) | Problem size, market and measured results, each with source and date | Judges, pitch |
| [docs/submission/INTERVIEW-KIT.md](docs/submission/INTERVIEW-KIT.md) | Hyphenate booth sheet, interview guide, unsent outreach drafts | Whoever interviews |

### Research and evidence

Read [docs/research/README.md](docs/research/README.md) before citing
anything: every figure needs a source and a tag ([verified], [scrape],
[agent-reported], [unverified]).

| Doc | What it's for |
|---|---|
| [docs/research/README.md](docs/research/README.md) | Evidence rules, pain-point index, tools that worked |
| [docs/research/MVP-REPORT.md](docs/research/MVP-REPORT.md) | Pain points mapped to features, the demo moment and the planted-error set |
| [01 No source of truth](docs/research/pain-points/01-no-source-of-truth.md) | Nobody has a complete list of which grants were cut |
| [02 Status reversals](docs/research/pain-points/02-status-reversals.md) | A canceled grant might not stay canceled |
| [03 Stranded trials](docs/research/pain-points/03-stranded-trials.md) | Patients stranded in defunded clinical trials |
| [04 Foundation data gaps](docs/research/pain-points/04-foundation-data-gaps.md) | Replacement money is years stale and doesn't name the lab |
| [05 Overhead mismatch](docs/research/pain-points/05-overhead-mismatch.md) | A foundation dollar isn't worth a federal dollar |
| [06 Awarded vs paid](docs/research/pain-points/06-awarded-vs-paid.md) | The amount on paper isn't the money actually paid |
| [07 Balance visibility](docs/research/pain-points/07-balance-visibility-admin-burden.md) | Researchers can't see trustworthy balances; admin eats their time |
| [08 Unallowable purchases](docs/research/pain-points/08-unallowable-purchases-audits.md) | The same lab-spending mistakes keep failing audits |
| [09 ERP outages](docs/research/pain-points/09-erp-outages.md) | Finance-system rollouts freeze purchasing and billing |
| [10 Drawdown justification](docs/research/pain-points/10-drawdown-justification.md) | Every federal drawdown now needs a written justification |
| [docs/research/cut/README.md](docs/research/cut/README.md) | Why pain points 11 to 14 were cut: [11](docs/research/cut/11-award-limbo-backlogs.md), [12](docs/research/cut/12-workforce-loss.md), [13](docs/research/cut/13-keyword-screening.md), [14](docs/research/cut/14-application-treadmill.md) |
| [docs/research/visa-pipeline.md](docs/research/visa-pipeline.md) | How automated card purchasing would work (cut from scope with B3) |
| [docs/research/sources/](docs/research/sources/) | Raw text behind the claims: audits, surveys, letters, Reddit scrapes |

### Component docs

| Doc | What it's for | Who it's for |
|---|---|---|
| [agents/README.md](agents/README.md) | Agent worker: run commands, code layout, every environment variable | Track B, operators |
| [agents/src/sources/papers.md](agents/src/sources/papers.md) | The real papers verified for the report checker, with their API calls | Track B |
| [sim/README.md](sim/README.md) | The simulated lab, the planted cases and the rule assumptions | Track C, judges |
| [scrapers/README.md](scrapers/README.md) | The cancellation-list scraper: source, row shape, local runs, publishing | Track C |
| [scrapers/.actor/README.md](scrapers/.actor/README.md) | Apify Store page text for the Actor (the Actor is still private) | Apify users |
| [docs/TRACK-B-MANUAL.md](docs/TRACK-B-MANUAL.md) | Track B setup only a person can do, dashboards, demo cautions | @nathan, presenters |

### Team process and history

| Doc | What it's for |
|---|---|
| [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md) | Rules for every agent and human in the repo |
| [TASKS.md](TASKS.md), [HUMAN_TODO.md](HUMAN_TODO.md) | Live work queues for agents and for people |
| [PROGRESS.md](PROGRESS.md) | What landed, when, and how it was checked |
| [DECISIONS.md](DECISIONS.md) | Why the stack and scope are what they are |
| [docs/IDEAS.md](docs/IDEAS.md) | The kickoff idea brainstorm (GrantGuard was picked) |
| [docs/REPORT-grantguard.md](docs/REPORT-grantguard.md) | An earlier pre-award "certification desk" proposal; source of the future proposal checker (P8) |
