# GrantGuard master plan

**Locked scope, Sat 10/24 just after midnight** (decided by @nathan; logged
in `DECISIONS.md`). Owners: **Track A @suhu, Track B @nathan, Track C
@ethan.** Every agent: read this file, `AGENTS.md`, `TASKS.md` and
`DECISIONS.md` before starting.

**How this relates to `docs/FEATURES.md`:** the IDs below are FEATURES IDs.
This plan keeps P1 to P6, B1, B2, B4 to B7; **cuts B3 (Stripe cards) and S1
to S4**; **adds P7 (report checker)**; and moves the proposal checker (P8)
to the future list. Where the two files differ, this one is newer.

Evidence for every number is in `docs/research/` (read its `README.md`
before citing anything) and `docs/REPORT-grantguard.md`.

---

## 1. The product

GrantGuard is an AI grant office for a university research lab. It tracks
every grant's money and status all the time, keeps purchases within the
grant's rules, checks invoices, writes the lab's payment requests to the
government, and checks the lab's progress reports. It asks a human manager
whenever it should, and logs every decision with its reason.

- **Seats (Hyphenate's one line):** purchasing agent, grant accountant, and
  payment and report preparer for a university research lab.
- **Company:** a fictional lab, seeded with real public NIH grant records.
- **The moment:** a court restores a canceled grant, and GrantGuard still
  won't spend until the money actually arrives.

## 2. Who does what

**AI agents** (each logs in with its own identity, so the database knows who
did what):

| Agent | Hyphenate seat | Job |
|---|---|---|
| Purchasing agent | purchasing | Turns requests into allowed purchases |
| Bookkeeping agent | grant accountant | Keeps the fund tracker current; checks invoices |
| Payment and report agent | payment and report preparer | Writes payment requests; checks progress reports |

**People:**

| Person | Played by in the demo | Job |
|---|---|---|
| Grant manager | the judge | The only one who approves, rejects or overrides, always with a reason |
| Scientist | an AI persona, or us typing | Asks to buy things; pushes back |
| Government funder | an AI persona | Sends follow-up questions about payment requests |

**Hard limits, enforced in the database, not in prompts:**
- nobody approves their own request;
- an agent can never approve its own work;
- the purchasing agent cannot approve payment requests;
- agents act alone only under the card limit and when every rule passes;
  everything else waits for the grant manager.

## 3. Features

Each feature lists what the agents do and what people do, separately.

### 3.1 Fund tracker (the core; P1, P6, B7)

Tracks every grant's status and money: awarded, received, spent, promised
(orders not yet paid), **truly available** (awarded minus spent minus
promised), and end date.

**Agents do (bookkeeping agent):**
- reads the government sites for the lab's grant IDs only (NIH RePORTER,
  USAspending, and cancellation lists through an Apify scraper): once a
  day, on "check now", and once more right before any money moves;
- compares each reading with the last one and records only changes, each
  with its source and date;
- flags any two sources that disagree about the same grant;
- uses Claude to read messy text (a court notice, an agency letter) and work
  out which grant it's about and what changed;
- freezes spending when a grant is canceled, and unfreezes it only when a
  payment actually arrives (a court order alone doesn't unfreeze it).

**People do (grant manager):**
- decides which source is right when the tracker flags a disagreement;
- can unfreeze a grant early, with a reason that goes in the log.

**Rules in code:** the truly-available math; frozen from a cancellation
until a payment lands after it; any disagreement about status freezes
spending and asks the grant manager.

**Planted mistakes:** a grant active in one source and canceled in another;
a purchase while canceled; a court order with no payment yet.

### 3.2 Purchases (P2, P3)

**Agents do (purchasing agent):**
- reads the request and picks the right grant;
- runs the spending rules and explains each verdict, citing the rule and a
  real audit case;
- buys on its own when every rule passes and it's under the card limit;
- blocks it, or reroutes it to another grant with time and money left;
- pauses it for the grant manager when it's over the limit or unclear;
- checks again right before buying.

**People do:**
- the scientist submits the request (item, price, grant, purpose) and can
  push back with new information;
- the grant manager approves, rejects or overrides paused requests, with a
  reason.

**Rules in code:** the grant is active and not frozen; not in the grant's
last 90 days; the category is allowed; under the card limit; enough truly
available money; shared items split across grants.

**Planted mistakes:** supplies bought in the last 90 days (audits at WVU and
Delaware); an unallowable item (UC Davis); a shared cost charged 100% to one
grant (NSF audit summary); a buy over the card limit. **Decoys** (must not
be flagged): a buy exactly at the limit; a correct shared-cost split.

### 3.3 Invoice check (P4)

**Agents do (bookkeeping agent):**
- matches every invoice to its order and its approval;
- marks matching invoices ready to pay;
- holds a mismatch, and rebuilds the timeline of what happened (order
  placed, order canceled, invoice arrived).

**People do (grant manager):** decides each held invoice: pay it, reject it,
or ask the vendor.

**Rules in code:** an invoice is payable only if its order is open and its
amount matches the approval.

**Planted mistakes:** an invoice for a canceled order; an approval for a
different amount. **Decoy:** an invoice matching an approved change to the
order.

### 3.4 Payment request writer (P5)

The lab spends first, then asks the government to pay it back. Each request
needs a short written explanation, and the government can ask follow-up
questions.

**Agents do (payment and report agent):**
- drafts the explanation (up to 1,000 characters) from the exact purchase
  records, by category and date range;
- leaves out anything still on hold;
- drafts answers to follow-up questions, quoting the exact purchases.

**People do:**
- the grant manager approves each request and each follow-up answer before
  it is sent;
- the government funder (a persona) asks the follow-up questions.

**Rules in code:** a request can't include held or frozen spending; the
purchasing agent can't approve it.

**Planted mistake:** a held purchase that must be left out of the request.

### 3.5 Report checker (P7, new)

Each year the lab sends a progress report that lists the papers the grant
paid for.

**Agents do (payment and report agent):**
- for each listed paper, checks that it credits the right grant and has a
  PubMed Central ID (looks up RePORTER and PubMed);
- checks whether the paper was corrected or retracted (Crossref);
- when a paper credits Grant A but its costs were charged to Grant B,
  proposes moving the cost, and shows how many days are left on the 90-day
  limit for fixing it;
- reports public records only and never accuses anyone of misconduct.

**People do (grant manager):** fixes the report, discloses a correction, or
approves the cost move.

**Rules in code:** only a material correction holds the report; anything
smaller is a note.

**Planted mistakes:** a paper crediting the wrong grant; a paper missing its
PubMed Central ID; a corrected paper listed without disclosure. **Decoys:**
an author-affiliation correction; a retracted paper cited in order to
discuss the retraction.

### 3.6 Base pieces (B1, B2, B4, B5, B6)

- **Log (B4):** the system writes a row for every action (who, what, which
  rule, the reason). People read it and can click "why?" on any decision.
- **Test lab and scorecard (B6):** people (us, or the judge) drop in events
  and run the test cases; the system replays them and scores caught,
  missed, and false alarms against the answer key.

## 4. Windows

Each window has one job. **Only the Inbox has decision buttons**; the other
windows show information.

| Window | Used by | Its one job |
|---|---|---|
| Funds | everyone | How much money each grant really has, its status timeline, and any flags |
| Requests | scientist | Ask to buy something; see your requests and their status |
| Invoices | bookkeeping agent, grant manager | Each bill: matched (green) or held (red), with the mismatch spelled out |
| Payment requests | grant manager | Drafted requests, follow-up questions, and their status |
| Reports | grant manager | Each paper in the progress report, with its check results |
| Inbox | grant manager only | Everything waiting for a human decision, with its evidence |
| Log | everyone | Who did what, and why |
| Test lab | us and the judges (demo only) | Drop in events, fast-forward the clock, run the test cases, see the scorecard |

## 5. The demo

1. **The moment:** a grant is canceled, so spending freezes. A court
   restores it. The scientist pushes to buy; the agent holds, because the
   money hasn't arrived, and explains. The payment lands and the purchase
   goes through by itself. One item is still blocked (supplies in the last
   90 days) and rerouted to another grant.
2. An invoice for a canceled order is held, with its timeline.
3. A payment request is drafted, and the government's follow-up is answered
   with the exact purchases.
4. The progress report catches a paper crediting the wrong grant.
5. The scorecard: results on the planted mistakes.

**Pitch hook:** in June 2025 a federal court restored University of
California researchers' canceled grants (*Thakur v. Trump*,
`docs/research/pain-points/02-status-reversals.md`). A court order is not a
payment.

At the table, the judge plays the grant manager and can try their own
inputs from the Requests window and the Test lab.

## 6. Build tracks

Everything goes through the database: agents (B) and windows (C) never talk
to each other directly. **Track A's tables and actions are the shared
contract.** A ships the contract with fake data in about an hour; B and C
build against it from then on, stubbing anything not ready.

Every track builds in the same order, so pieces arrive together:
**fund tracker and the freeze → invoice check → payment requests → report
checker.**

### Track A: database and rules (@suhu; `server/`, `sim/`)

Tasks in `TASKS.md`: T2, T3, then T5 to T8.

1. **T2:** pin the SpacetimeDB version; choose the module language
   (TypeScript if that version supports it, logged in `DECISIONS.md`);
   scaffold; set up a run script and a check command.
2. **T3, the contract:** tables (grants, status events, source readings,
   flags, requests, orders, invoices, approvals, payroll, payment requests,
   follow-ups, report papers, holds, decisions, log, agents, clock), action
   stubs, and fixtures for 2 grants.
3. **T5:** fund tracker math and the freeze rule.
4. **T6:** spending rules and hard limits.
5. **T7:** approval gate (hold → decide with a reason → recheck → act) and a
   log row from every action.
6. **T8:** fake university data with the planted mistakes from §3.

**Human-only (@suhu):** install the SpacetimeDB CLI on every machine.

### Track B: agents and outside data (@nathan; `agents/`)

Tasks in `TASKS.md`: T9 to T15.

1. **T9:** a worker program with one login per agent; a stub agent first.
2. **T10:** source reader for RePORTER and USAspending by grant ID (daily,
   "check now", and before money moves); posts only changes; flags
   disagreements.
3. **T11:** purchasing agent.
4. **T12:** invoice check.
5. **T13:** payment request writer.
6. **T14:** report checker, with about 20 papers cached for the demo plus
   live lookup.
7. **T15:** Apify scraper for cancellation lists, feeding T10.

Agents only change data through Track A's actions. Claude reads, matches and
explains; the rules and math stay in Track A's code. Suggested models:
`claude-sonnet-5-5` for the three agents, `claude-haiku-5-5` for the
personas.

**Human-only (@nathan):** Anthropic API key and Apify account, shared out
of band, with their names in `.env.example`; pick the 2 real NIH grants to
seed from.

### Track C: windows, test lab and pitch (@ethan; `web/`, `eval/`)

Tasks in `TASKS.md`: T16 to T20.

1. **T16:** the 8 windows from §4, on fixture data.
2. **T17:** live updates; Inbox buttons call Track A's actions.
3. **T18:** Test lab: drop in events, fast-forward the clock.
4. **T19:** answer key and scorecard, added to the check command.
5. **T20:** demo script, backup video, Devpost.

**Human-only (@ethan):** visit the Hyphenate booth (ask whether a grant
office counts as a finance team for them); interview one PI or research
administrator for the Anthropic and Microsoft tracks; record the video;
submit Devpost.

## 7. Checkpoints

| When | What should work |
|---|---|
| Sat ~2 AM | Contract landed; stubs connected end to end (T4) |
| Sat ~2 PM | The demo moment works live (integration check) |
| Sat ~10 PM | Demo frozen; Devpost draft up |
| Sun 7 AM | Feature freeze |
| Sun 9 AM | Devpost deadline |

## 8. Agent kickoff prompts

Each owner pastes theirs into their agent.

**@suhu, Track A:**

```
I'm @suhu. You're the Track A agent for GrantGuard: the SpacetimeDB
database and rules. Read AGENTS.md, docs/MASTER-PLAN.md (sections 2, 3 and
6), TASKS.md and DECISIONS.md first. You own server/ and sim/ only.
Do T2, then T3. Tracks B and C are waiting on T3's contract (tables,
action stubs, fixtures for 2 grants), so push it within about an hour,
even if the stubs are thin. Then do T5 to T8 in order.
Rules: every limit lives in code inside the database, never in a prompt.
Nobody approves their own request, and no agent approves its own work.
After the contract lands, schema changes must be additive; a breaking
change needs a DECISIONS.md line and fixes to every caller in the same
commit. Claim each task in TASKS.md before starting, and follow
AGENTS.md for commits and pushes.
```

**@nathan, Track B:**

```
I'm @nathan. You're the Track B agent for GrantGuard: the agent worker
and outside data. Read AGENTS.md, docs/MASTER-PLAN.md (sections 2, 3 and
6), TASKS.md and DECISIONS.md first. You own agents/ only.
Start T9 now against a stub of the contract; switch to the real one when
Track A pushes T3. Then do T10 to T15 in order.
Rules: each agent logs in with its own identity. Agents change data only
by calling Track A's actions, never by writing tables directly. Claude
reads, matches and explains; rules and math stay in Track A's code. Only
look up the lab's own grant IDs, and record only changes. Cache every
outside lookup so the demo works offline. Keys come from .env.local; add
each new variable name to .env.example. Claim each task in TASKS.md
before starting, and follow AGENTS.md for commits and pushes.
```

**@ethan, Track C:**

```
I'm @ethan. You're the Track C agent for GrantGuard: the windows, the
test lab and the scorecard. Read AGENTS.md, docs/MASTER-PLAN.md (sections
3 to 7), TASKS.md and DECISIONS.md first. You own web/ and eval/ only.
Start T16 now on fixture data; switch to the real contract when Track A
pushes T3. Then do T17 to T20 in order.
Rules: each window has one job, and only the Inbox has decision buttons.
Every human decision needs a reason field. The Test lab is demo-only.
The scorecard compares the system's decisions with the answer key
(caught, missed, false alarms) and joins the check command. Claim each
task in TASKS.md before starting, and follow AGENTS.md for commits and
pushes.
```

## 9. Cut and future

**Cut:**
- Stripe test cards (B3);
- cloud computing rules;
- the separate sources-disagree view (now part of the tracker);
- the AI rule writer (Factory Droid, S3);
- the replacement funder finder (S1);
- clinical trial rescue (S2);
- the voice and "ask why" agent (S4);
- Nessie.

**Future, not built this weekend:**
- **Proposal checker (P8):** before the lab applies for a new grant, checks
  the application's budget and cited papers using what the tracker and the
  report checker already know. It's one "what's next" slide in the pitch.
  Details: `docs/REPORT-grantguard.md`.

## 10. Verify before it goes on a slide

1. *Thakur v. Trump*: dates and scope. The source is the plaintiffs' law
   firm.
2. Whether written explanations for payment requests are still required as
   of Oct 2026.
3. Every `[agent-reported]` quote in `docs/research/pain-points/`.
