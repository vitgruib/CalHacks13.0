# Devpost draft: GrantGuard

Paste-ready text for the Devpost form. Drafted Sat 10/24 before any product
code landed, so **everything describing the product is the plan in
`docs/MASTER-PLAN.md`, not observed behavior.** Before submitting:

- Re-read every section against what actually runs. Delete or soften any
  claim tagged `[needs Tn]` whose task isn't done.
- Fill every `[TBD: ...]`. Never fill a scorecard number by hand; copy it
  from the check command's output (T19).
- Quotes and figures follow `docs/research/README.md`. Only `[verified]` and
  `[scrape]` items are used below. Tags are for us; strip them before
  pasting, but keep the source links in the "Sources" section.

---

## Submission requirements (checked Sat 10/24 on the event's Devpost page)

Source: https://cal-hacks-13-0.devpost.com/ (overview, "Requirements" and
"Judging Criteria" sections) and https://cal-hacks-13-0.devpost.com/rules
(it only contains the code of conduct).

**Confirmed:**
- Deadline **Sun Oct 25, 9:00 AM PDT**, hard. Submit together with teammates.
- Be at the venue by **Oct 25, 8:00 AM**. You must be accepted and checked
  in to submit.
- Team of 2 to 4. Add every teammate on Devpost.
- **Include an image of the project and the GitHub repo link**, or the code
  isn't considered.
- All work must be done during the hackathon.
- Judging slot: **3 minutes to pitch, 2 minutes of judge questions.** (Our
  `docs/TRACKS.md` said ~2 min; the Devpost page says 3 + 2.)
- "You must have a pre-recorded or live demonstration." The Functionality
  criterion also says submissions "should also include a clear, meaningful
  video demo on devpost for sponsors evaluating asynchronously." So upload a
  video even though we demo live.
- General judging criteria: Application, Intentionality, Functionality,
  Creativity, Technical Complexity.

**Not stated anywhere I could find (assume the safe option):**
- **Video length limit:** none on the page. Keep it **under 3:00**, the
  common Devpost default, and since sponsors judge it asynchronously.
  Devpost embeds YouTube, Vimeo, Facebook Video or Youku links, so upload as
  a public or unlisted YouTube video.
- **Cap on prizes/tracks per entry:** none on the page or rules. Prizes are
  picked in the submission form ("Additional info" step), editable until the
  deadline. Check the form itself for a cap when filling it in.

**Surprise on the prize list:** the Devpost prize list has **no Anthropic
prize and no SpacetimeDB prize**, though both are presenting sponsors and
`docs/TRACKS.md` lists them ($5k Claude credits; $2,048 / $1,024 / $512).
They may be judged outside Devpost (Hive, booth, a form). **Ask the
organizers (#ask-directors on Slack) or the two booths how to enter.**

Devpost prize names, as listed, for the ones we want:
- [Hyphenate] 1st / 2nd / 3rd Place The Hyphenated Enterprise: Autonomous Systems for Finance
- [Microsoft] 1st Place Built for the Real World
- [Microsoft] 2nd Place Microsoft Customer Impact Award
- [Apify] 1st to 5th Place Best use of Apify; [Apify] Best Actor sponsored by Apify
- Cal Hacks: Most Technically Advanced Hack; Best People-First Social
  Impact Hack; Most Creative Project; First/Second/Third Overall; Hacker's
  Choice (check whether these need opting in or are automatic)

---

## Project name

GrantGuard

## Tagline (200 chars max)

An AI grant office for a university lab: it tracks every grant's real money, keeps spending inside the rules, and won't spend on a court order until the cash actually arrives.

## The seats it fills (Hyphenate's "one line")

GrantGuard fills three seats in a university lab's grant office: the purchasing agent, the grant accountant, and the payment and report preparer, all reporting to one human grant manager.

---

## Inspiration

Since early 2025, a university lab's grant can be canceled, restored by a
court, and still not pay a cent. And the people tracking it are working from
sources that disagree.

- **The official lists don't agree.** About 300 terminated NIH grants showed
  up in only one of NIH's two official sources (RePORTER vs HHS TAGGS), and
  HHS stopped posting new terminations to TAGGS. [verified, Grant Witness]
- **A court order is not a payment.** In June 2025 a federal court ordered
  canceled grants to University of California researchers reinstated
  (*Thakur v. Trump*). [verified; source is the plaintiffs' law firm]
  Researchers on Reddit put the problem plainly:
  > "I won't believe it until ALL the funding has been disbursed"
  > (r/AskAcademia, NEH grantee) [scrape]

  > "Even if it's not appealed, it's not obvious this ruling requires they
  > pay funds." (r/AskAcademia) [scrape]
- **Labs can't see their real balance.** The University of California's
  Academic Senate wrote that campuses saw "caution in PI spending … due to
  the intolerably high degree of uncertainty and the inability to accurately
  track balances in a timely fashion." [verified] In the Federal
  Demonstration Partnership's 2018 survey, federally funded researchers
  reported spending 44.3% of their
  research time on administration, and about 60% of those who wanted finance
  fixed rated "transparent, accurate, and timely reports of grant expenditure
  balances" a high priority. [verified, FDP 2018 Faculty Workload Survey]
- **The same spending mistakes fail audit every year.** In 18 NSF audits of
  universities, 94% found unallowable expenses. [verified, NSF-OIG 22-6-002]
  West Virginia University's research corporation had $17,335 disallowed for
  "materials and supplies, purchased or received, near or after the end of
  award periods." [verified, NSF-OIG 22-1-010]
- **Every payment request now needs a written defense.** Since 2025, each
  federal drawdown needs a written justification of up to 1,000 characters,
  and NIH reviews it in "Defend the Spend." [verified, NIH Grants Policy
  Statement 6.1, rev. March 2026] The Council on Governmental Relations
  reported that members receive "dozens of Defend the Spend email demands
  after submitting draw requests." [verified, COGR]

Grant offices hold this together by hand. We wanted to build the office
that does it on its own and asks a human when it should.

## What it does

GrantGuard runs a lab's grant office with three AI agents and one human grant
manager. Each agent logs in under its own identity, and the database, not
the prompt, decides what each one is allowed to do.

- **Fund tracker.** For every grant: awarded, received, spent, promised
  (orders not yet paid), and **truly available** (awarded minus spent minus
  promised). It reads NIH RePORTER and USAspending for the lab's own grant
  IDs, plus cancellation lists through an Apify scraper, records only
  changes with their source and date, and flags sources that disagree.
  Claude reads messy text such as a court notice and works out which grant
  it's about. A cancellation freezes spending; **only a payment that
  actually lands unfreezes it.** A court order alone doesn't.
- **Purchases.** A scientist asks to buy something. The purchasing agent
  picks the grant, checks the rules (grant active and not frozen, not in the
  last 90 days, category allowed, under the card limit, enough truly
  available money, shared costs split), explains each verdict citing the
  rule and a real audit case, and then buys, blocks, reroutes to another
  grant, or sends it to the grant manager. It checks again right before
  buying.
- **Invoice check.** Every invoice is matched to its order and approval. A
  mismatch is held with a rebuilt timeline (order placed, order canceled,
  invoice arrived) so the human sees exactly which records conflict.
- **Payment request writer.** Drafts the 1,000-character justification from
  the exact purchase records, leaves out anything on hold, and answers the
  government's follow-up questions by quoting the purchases. The grant
  manager approves before anything is sent.
- **Report checker.** For each paper in the lab's progress report, checks
  that it credits the right grant and has a PubMed Central ID, and whether
  it was corrected or retracted (Crossref). If a paper credits Grant A but
  its costs sat on Grant B, it proposes moving the cost and shows the days
  left on the 90-day limit. It reports public records only and never accuses
  anyone of misconduct.
- **Inbox, log and "why?".** Only the grant manager's Inbox has decision
  buttons, and every decision needs a reason. Every action writes a log row
  (who, what, which rule, why), and any decision can be asked "why?".
- **Hard limits in the database:** nobody approves their own request; no
  agent approves its own work; the purchasing agent can't approve payment
  requests; agents act alone only under the card limit with every rule
  passing.

## How we built it

- **SpacetimeDB** `[TBD: version, from T2]` is the whole company: grants,
  status events, source readings, orders, invoices, approvals, payment
  requests, report papers, holds, the log and a simulated clock. The rules,
  the money math and the segregation-of-duties limits are server-side
  actions, so a model can't talk its way past them.
- **An agent worker** connects to SpacetimeDB as a client, one connection
  and identity per agent. Agents change data only by calling the database's
  actions. **Claude** `[TBD: models actually used; plan is
  claude-sonnet-5-5 for the agents, claude-haiku-5-5 for the scientist persona]` reads,
  matches and explains; it never does the money math.
- **Simulated people:** the scientist is a Claude persona (or us typing);
  the government funder's follow-up questions are pre-written in the seed. The judge plays the grant manager.
- **Real public data:** NIH RePORTER and USAspending by grant ID, PubMed /
  PubMed Central, Crossref, and an **Apify** scraper for cancellation lists.
  Every outside lookup is cached so the demo runs offline.
- **Frontend** `[TBD: framework]` with 8 windows, each with one job, updating
  live from SpacetimeDB subscriptions.
- **Test lab and scorecard:** we drop in events (cancellation, court order,
  payment, bad invoice), fast-forward the clock, and replay a seed full of
  planted mistakes against an answer key on every check run.

## Proof it works

### What's real, what's simulated, and how we know

| Piece | Real or simulated | How we know it works |
|---|---|---|
| Grant records (2 NIH grants) `[TBD: grant IDs]` | Real public records from NIH RePORTER / USAspending; the lab is fictional | Readings are cached with source and date; shown in the Funds window `[needs T10]` |
| Cancellation lists | Real, scraped with Apify `[needs T15]` | Scraper run output stored with the reading `[TBD]` |
| Court order | Simulated status event (ready-made, not parsed from text), modeled on *Thakur v. Trump* | Planted case in the answer key |
| Lab orders, invoices, approvals, payroll | Simulated, with planted mistakes drawn from real audit findings (WVU, Delaware, UC Davis, NSF-OIG capstone) | Answer key scored on every check run `[needs T8, T19]` |
| Government payment system and follow-up questions | Simulated (questions pre-written in the seed) | Draft length and held-item exclusion are checked in code `[needs T13]` |
| Papers in the progress report | Real papers via PubMed and Crossref, ~20 cached `[needs T14]` | Planted wrong-grant, missing-ID and correction cases plus decoys |
| Rules, money math, approval limits | Real code in SpacetimeDB | Each rule rejects its planted case and passes its decoy; self-approval is rejected `[needs T6]` |
| Agent judgment (reading, matching, explaining) | Real Claude calls | Scored against the answer key, including false alarms |

### Scorecard (planted mistakes with an answer key)

The answer key has `[TBD: from check command]` planted mistakes and
`[TBD: from check command]` decoys (the plan in `docs/MASTER-PLAN.md` §3 has
13 mistakes and 5 decoys; replace with the real seed's counts).

| Area | Planted | Caught | Missed | False alarms on decoys |
|---|---|---|---|---|
| Fund tracker (status, freeze) | [TBD: from check command] | [TBD: from check command] | [TBD: from check command] | [TBD: from check command] |
| Purchases | [TBD: from check command] | [TBD: from check command] | [TBD: from check command] | [TBD: from check command] |
| Invoices | [TBD: from check command] | [TBD: from check command] | [TBD: from check command] | [TBD: from check command] |
| Payment requests | [TBD: from check command] | [TBD: from check command] | [TBD: from check command] | [TBD: from check command] |
| Progress report | [TBD: from check command] | [TBD: from check command] | [TBD: from check command] | [TBD: from check command] |
| **Total** | [TBD: from check command] | [TBD: from check command] | [TBD: from check command] | [TBD: from check command] |

Escalations to the grant manager: `[TBD: from check command]`. Run it
yourself: `[TBD: check command, from T2]`.

## Challenges we ran into

`[TBD: fill from PROGRESS.md at the end.]` Likely candidates to confirm:
- Keeping every limit in the database rather than the prompt, while agents
  still explain their reasoning in plain language.
- Modeling grant status as a timeline of events with sources, not one field,
  so "restored" and "paid" stay separate.
- Sources that disagree: deciding when to freeze and ask, rather than
  silently picking one.
- Making a live demo reliable with outside APIs (caching every lookup).

## Accomplishments that we're proud of

`[TBD: confirm each against what runs.]`
- The moment works live: a court restores a grant and GrantGuard still
  holds, then spends on its own the minute the payment lands.
- An answer key built from real audit findings, scored on every build,
  including false alarms on decoys.
- Three agents with separate identities that cannot approve their own work,
  enforced by the database.

## What we learned

`[TBD: team to write; keep to 2-3 honest lines.]` Starting points:
- In grant finance, "awarded", "restored" and "paid" are three different
  facts, and most of the pain lives in the gap between them.
- Rules and math belong in code; the model is best at reading messy text,
  matching it to records, and explaining.

## What's next for GrantGuard

- **Proposal checker:** before the lab applies for a new grant, check the
  application's budget and cited papers using what the tracker and the
  report checker already know.
- Connect to a real university ERP and the government payment systems
  instead of the simulated ones, behind the same actions.
- Pilot with one research administration office. `[TBD: if an interview
  happened, name the role and what they said they'd need.]`
- Path to production: single sign-on for the grant manager, monitoring of
  agent decisions against the answer key, and a rollout that starts in
  read-only "suggest" mode.

## Built with

`[TBD: confirm each is actually used]` spacetimedb, claude, anthropic-api,
apify, nih-reporter-api, usaspending-api, pubmed, crossref,
`[frontend framework]`, `[module language]`

## Links

- GitHub: `[TBD: repo URL]` (required)
- Demo video: `[TBD: YouTube link]`
- Project image: `[TBD: screenshot of the Funds window during the freeze]` (required)

---

## Tracks and prizes to select

Order of priority. Each paragraph below can go in the Devpost text, the
README, or the sponsor's own form, wherever that sponsor reads.

**1. Hyphenate (select all three place entries).**
GrantGuard is "the company and the system it works in": a fictional lab with
real NIH grant records, three agent seats and three people, and planted
mistakes from real audits. It hits each hard part of the brief. Sources
disagree (RePORTER, USAspending and cancellation lists, each reading kept
with its source). Time matters (a March cancellation still blocks a June
purchase until money lands; the 90-day end-of-award rule). Working with
others (the scientist pushes back, the funder asks follow-ups, the manager
says no). Limits are enforced in the database. Every decision has a "why?".
Our moment is a court restoring a grant and the agent still refusing to
spend until the payment arrives. Proof: the scorecard above.

**2. Microsoft: Built for the Real World (and the Customer Impact Award).**
The customer is a university research lab's grant office, a seat that today
works from sources that disagree and audits that land years later.
Measurable usefulness: the scorecard (caught, missed, false alarms,
escalations). Responsible design: limits in the database, human approval
with a reason for anything over the card limit or unclear, an append-only
log, and a report checker that states public records and never accuses
anyone. Path to production: the simulated ERP and government systems sit
behind the same database actions a real integration would call.
`[TBD: interview quote from a PI or research administrator; the Customer
Impact Award favors real user conversations.]`

**3. Apify (select 1st to 5th; add Best Actor only if we publish the scraper
as a public Actor).** GrantGuard's fund tracker depends on knowing when a
grant is canceled or restored, and the official lists don't agree. Our Apify
scraper `[needs T15; TBD: which list]` reads cancellation lists for the
lab's own grant IDs and feeds them into the tracker as source readings,
where they're compared with NIH RePORTER and USAspending. A disagreement
freezes spending and asks the grant manager.

**4. Anthropic (not on the Devpost prize list; ask how to enter).**
Community: university research administrators and the scientists whose
grants they manage. `[TBD: interview: role, date, and one verbatim line.]`
Claude does the reading and judgment: matching a court notice to a grant,
choosing the grant for a purchase, writing payment justifications and
follow-up answers, and checking papers. Where it can go wrong, and what we
do about it: it can pick the wrong grant (the database re-checks every rule
before money moves); it can write a justification that overstates spending
(drafts are built only from purchase records, held items are excluded in
code, and a human approves before sending); it can misread a legal notice
(a court order never unfreezes a grant, only a recorded payment does); it
could imply misconduct about a paper (the report checker states public
records only).

**5. SpacetimeDB (not on the Devpost prize list; ask how to enter).**
SpacetimeDB is the whole company: every table, the simulated clock, the
log, and the rules. Each AI agent is its own client identity, so the
database knows who did what and rejects self-approval and out-of-role
actions server-side. Windows update live from subscriptions, so the judge
watches the freeze and unfreeze happen across all windows at once.

**6. Cal Hacks general prizes.** Most Technically Advanced Hack
(multi-identity agents on a real-time database with server-side limits);
Best People-First Social Impact Hack (keeping research labs funded and
compliant through grant cancellations); Most Creative Project.

**Optional, needs a team call:** [MLH] Commit Fellowship Prize Category
(opt in and fill a supplemental form; judged after the event).

---

## Sources (for us; the claims above trace to these)

Judge-facing impact case with current, re-verified numbers (problem size, market, our measured results): [`IMPACT-EVIDENCE.md`](IMPACT-EVIDENCE.md).

- Grant Witness, RePORTER vs TAGGS mismatches: https://grantwitness.org/nih/updates/2025-05-20-700-new-terminations · methodology: https://grantwitness.org/nih/updates/methodology (`docs/research/pain-points/01-no-source-of-truth.md`)
- *Thakur v. Trump* (plaintiffs' firm): https://www.fbm.com/linda-sobczynski-gilleran/news/thakur-v-trump-defending-the-rule-of-law/ (`02-status-reversals.md`). MASTER-PLAN §10 asks for a docket check before it goes on a slide.
- Reddit quotes: https://www.reddit.com/r/AskAcademia/comments/1t6xkif/comment/oy4plgs/ · https://www.reddit.com/r/AskAcademia/comments/1t6xkif/comment/oklkmg8/ (`02-status-reversals.md`)
- UC Academic Senate 2022 letter: `docs/research/sources/docs/uc-senate-2022-oracle-letter.txt` (`07-balance-visibility-admin-burden.md`)
- FDP 2018 Faculty Workload Survey: https://thefdp.org/wp-content/uploads/FDP-FWS-2018-Primary-Report.pdf (dated 2018; `07`)
- NSF-OIG 22-6-002 capstone: https://www.oversight.gov/sites/default/files/documents/reports/2022-01/22-6-002-Promising-Practices-NSF-Award-ManagementRedacted.pdf · WVU 22-1-010: https://nsf-gov-resources.nsf.gov/files/auditrep221010-wvu-r.pdf (`08-unallowable-purchases-audits.md`)
- NIH GPS 6.1: https://grants.nih.gov/grants/policy/nihgps/html5/section_6/6.1_nih_payment_review_process.htm · COGR: https://research.iastate.edu/wp-content/uploads/sites/3/2025/05/PointstoConsiderforReimbursementofExpenses68237c22751ca.pdf (`10-drawdown-justification.md`)

Do not add these without re-verifying first (`[agent-reported]`): the
Krieger "court order to reality" quote, the Willett and Fortune quotes, the
Moitra quote.
