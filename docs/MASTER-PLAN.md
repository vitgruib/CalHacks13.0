# GrantGuard master plan

The product spec: what GrantGuard does, who does what, the rules in code,
the planted mistakes, the windows and the demo path. Scope locked Sat 10/24
just after midnight (`DECISIONS.md`); updated as decisions land. Live work is
in `TASKS.md`; evidence for every rule and planted mistake is in
`docs/research/` (read its `README.md` before citing anything).

Code and data cite this file by section number (§2 to §5, §10), so keep the
numbering.

---

## 1. The product

GrantGuard is the interface between a university lab's researchers and its
grant office. Researchers ask to buy things and send in invoices; the
database checks each against every grant's money, status and rules, and
puts it in front of the human grant manager with the verdicts. Every
decision is logged with its reason.

**The lifecycle (T108, Sun 10/25):** a researcher submits a request → the
grant office approves it (the money becomes promised on the grant) → the
researcher buys it → the researcher sends the invoice → the bookkeeping
agent matches it to the order → the grant office approves the invoice → it
is charged to the grant (promised becomes spent) and the researcher is
reimbursed. The purchasing agent is cut; its code stays, unused.

**Scope (T105, Sun 10/25):** payment requests to the government (§3.4) and
progress-report checks (§3.5) are cut. Their code stays in the repo, unused
and out of the menu and scorecard.

- **Seat:** grant accountant for a university research lab.
- **Company:** a fictional lab, seeded with real public NIH grant records.
- **The core behavior:** a court restores a canceled grant, and GrantGuard
  still won't spend until the money actually arrives.
- **Proposed thesis (not yet adopted; `DECISIONS.md`):** the funder, the
  grant office and the researcher each keep their own record of the same
  money, and GrantGuard keeps those three in sync.

## 2. Who does what

**AI agents** (each logs in with its own identity, so the database knows who
did what):

| Agent | Seat | Job |
|---|---|---|
| ~~Purchasing agent~~ | cut (T108) | The grant manager approves every request |
| Bookkeeping agent | grant accountant | Keeps the fund tracker current; checks invoices; checks an asked-for item |
| ~~Payment and report agent~~ | cut (T105) | Writes payment requests; checks progress reports |

**People:**

| Person | Played by in the demo | Job |
|---|---|---|
| Grant manager | the judge | Approves or rejects every request and every invoice, always with a reason |
| Researchers (Dr. Priya Nair, Sofia Alvarez) | us, each in their own researcher portal | Ask to buy things; push back on their own requests |
| Government funder | not played (no persona) | Its follow-up questions are written into the seed data |

**Hard limits, enforced in the database, not in prompts:**
- nobody approves their own request;
- an agent can never approve its own work;
- nothing is bought or paid without the grant manager's approval.

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

**The database does (no purchasing agent since T108):**
- runs the spending rules on every request and explains each verdict,
  citing the rule and a real audit case;
- sends every request to the Inbox: "Approve" when every rule passes,
  "Flagged" when one fails, and refreshes it when a freeze changes.

**People do:**
- the researcher submits the request (item, price, grant, purpose) and can
  push back with new information;
- the grant manager approves or rejects every request, with a reason;
- once approved, the researcher buys it and sends the invoice.

**Rules in code:** the grant is active and not frozen; not in the grant's
last 90 days; the category is allowed; under the card limit; enough truly
available money; shared items split across grants.

**Planted mistakes:** supplies bought in the last 90 days (audits at WVU and
Delaware); an unallowable item (UC Davis); a buy over the card limit. **Decoys** (must not
be flagged): a buy exactly at the limit. (The shared-cost mistake and decoy
were dropped with cost splitting in T95.)

### 3.3 Invoice check (P4)

**Agents do (bookkeeping agent):**
- matches every invoice to its order and its approval;
- sends a matching invoice to the grant manager to approve;
- holds a mismatch, and rebuilds the timeline of what happened (order
  placed, order canceled, invoice arrived).

**People do (grant manager):** approves each matching invoice (it is charged
to the grant and the researcher is reimbursed) and decides each held one:
pay it, reject it, or ask the vendor.

**Rules in code:** an invoice is payable only if its order is open and its
amount matches the approval.

**Planted mistakes:** an invoice for a canceled order; an approval for a
different amount. **Decoy:** an invoice matching an approved change to the
order.

### 3.4 Payment request writer (P5) — CUT (T105)

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
- the government funder's follow-up questions come pre-written in the
  seed data (no funder persona).

**Rules in code:** a request can't include held or frozen spending; the
purchasing agent can't approve it.

**Planted mistake:** a held purchase that must be left out of the request.

### 3.5 Report checker (P7, new) — CUT (T105)

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
- **Test lab and scorecard (B6):** people drop in events and run the test
  cases; the system replays them and scores caught, missed, and false
  alarms against the answer key.

## 4. Windows

Each window has one job. **Only the Inbox has decision buttons**; the other
windows show information. The app has separate portals
(`web/src/windows/registry.ts`):

**Grant office portal** (the grant manager):

| Window | Its one job |
|---|---|
| Funds | How much money each grant really has, its status timeline, and any flags |
| Requests | Every researcher's requests and their status, each naming who asked |
| Invoices | Each bill: matched (green) or held (red), with the mismatch spelled out |
| Inbox | Everything waiting for a human decision, with its evidence |
| Log | Who did what, and why |
| Test lab | Demo only: drop in events, fast-forward the clock, see the scorecard |

**Researcher portals**, one per researcher: Ask (which grant can pay, in
plain words, from the real spending rules), My grants (a paused grant shows
where its money is) and My requests (only their own, with push back).

## 5. The demo path (the end-to-end test the build must pass)

1. A grant is canceled, so spending freezes. A court restores it. The
   researcher asks to buy; GrantGuard flags it for the grant manager,
   because the money hasn't arrived, and explains. The payment lands, every
   rule passes, and the grant manager approves it. One item is still
   flagged (supplies in the last 90 days).
2. An invoice for a canceled order is held, with its timeline.
3. The scorecard shows results on the planted mistakes.

(Steps for payment requests and the progress report were cut in T105.)

It must also work unscripted: anyone can submit requests from the Requests
window and inject events from the Test lab.

## 6. Build lanes

Everything goes through the database: agents and windows never talk to each
other directly. **The module's tables and actions in `server/` are the
shared contract.** Owners and directories: the *Lanes* table in `TASKS.md`.

| Lane | Builds |
|---|---|
| A: database (@suhu) | `server/`: tables, actions, money math, the freeze, spending rules, hard limits, approval gate, log; `deploy/` |
| B: agents (@nathan) | `agents/`: the worker, the agents, source readers (RePORTER, USAspending, the cancellation list, Crossref/PubMed) |
| C: app (@ethan) | `web/` windows and portals, `sim/` planted data, `eval/` scorecard, `scrapers/` Apify Actor |

Claude reads, matches and explains; the rules and math stay in the module.

## 7. Feature IDs

Tasks and commits cite these IDs.

| ID | Feature | Where |
|---|---|---|
| P1 | Truly available money per grant | §3.1 |
| P2 | Spending rules, each verdict explained with a rule and an audit case | §3.2 |
| P3 | Human approval: hold, decide with a reason, recheck, act | §3.2, §3.6 |
| P4 | Invoice check against order and approval, with the timeline | §3.3 |
| P5 | Payment request writer and follow-up answers | §3.4 |
| P6 | Status timeline and the freeze | §3.1 |
| P7 | Report checker | §3.5 |
| B1 | The simulated lab and its tables | `server/`, `sim/` |
| B2 | Agent worker, one identity per agent | `agents/` |
| B4 | Log with "why?" | §3.6 |
| B5 | Windows and the Inbox | §4 |
| B6 | Planted mistakes, answer key and scorecard | §3.6 |
| B7 | Apify Actor for the cancellation list | `scrapers/` |

## 8. Stretch (only after the demo path works end to end)

- **Reading messy text (S5):** paste a court notice or agency letter into
  the Test lab; Claude works out which grant and what changed and posts it
  as a status event. Until then, court orders arrive as ready-made events.
- ~~**Grant splits (S6)**~~: cut (T95). Cost splitting across grants was
  removed as bloat; each purchase is charged to one grant.

## 9. Cut and future

**Cut:** purchase cards through Stripe or Visa (B3); cloud computing rules;
a separate sources-disagree view (now part of the tracker); the payment
request writer (P5, §3.4) and report checker (P7, §3.5), cut in T105 to keep
GrantGuard to the grant office ↔ researcher interface; the AI rule
writer (Factory Droid, S3); the replacement-funder finder (S1); clinical
trial rescue (S2); the voice and "ask why" agent (S4); Nessie; an AI
scientist persona.

**Future, not built this weekend:** a proposal checker (P8) that, before the
lab applies for a new grant, checks the application's budget and cited
papers using what the tracker and the report checker already know.

## 10. Verify before it goes in the video or Devpost

The submission drafts in `docs/submission/` cite this list.

1. *Thakur v. Trump*: dates and scope. The source is the plaintiffs' law
   firm.
2. Whether written explanations for payment requests are still required as
   of Oct 2026.
3. Every `[agent-reported]` quote in `docs/research/pain-points/`.
