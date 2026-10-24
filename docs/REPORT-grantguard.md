# Report: GrantGuard, the certification desk for research proposals

Status: **proposal, not decided.** Written Fri 10/23 (night) from an
eight-agent research round. Product and scope choices belong to the team
(`AGENTS.md` §6); record what we adopt in `DECISIONS.md`.

**Agents: this is not the build list. `docs/FEATURES.md` is.** This report
proposes a pre-award direction (checking proposals before they are signed);
`docs/FEATURES.md` describes the post-award grant office (P1 to P6). Where
they overlap or conflict, raise it with the humans. Known overlaps: §4.4 E
(payment justifications) is FEATURES P5, and the evidence graph and holds
are close to P2 and P3.

**Evidence level** (per `docs/research/README.md`): every figure here is
`[agent-reported]`: a research agent reported it from a page it opened, and
nobody has re-verified it first-hand. Items marked **(verify)** are weaker or
carry a demo moment; §12 lists them. Re-verify before anything goes on a
slide.

---

## 1. The idea in one paragraph

Before a university asks a funder for research money, a scientist writes a
proposal: what they will study, the earlier research that says it will
work, and a budget. The university then signs it, certifying that everything
in it is true. GrantGuard is the team of finance agents that checks the
proposal before anyone signs. Every number in the budget must cite the rule
it came from. Every paper in the literature review must check out against
live public databases. No person may be promised to more work than they have
time for. If anything fails, the signature is held until it is fixed or a
human overrides it on the record.

**Pitch line:** *"Nothing gets signed until every number and every claim
cites its source."*

**Seats (Hyphenate's one line):** department research administrator and
sponsored-programs proposal reviewer at a university research lab; a human
signing official keeps the pen.

**Why now:** *AI made proposals cheap to write. It did not make them cheap to
check.*

---

## 2. Plain-language background

- **Proposal (application):** the request for money. It has a budget, a
  research plan, and references to earlier papers.
- **Budget rules:** salaries, benefits ("fringe"), overhead ("F&A" or
  "indirect costs") and prices follow rules spread across several documents:
  federal regulations (2 CFR 200), funder notices, and the university's own
  negotiated rate agreement.
- **Literature review:** the part of the proposal that cites earlier papers
  to argue the idea is sound. If a cited paper is later corrected or
  retracted, the argument may be weaker than it looks.
- **Correction vs retraction:** a retraction withdraws a paper. A correction
  fixes part of it, sometimes a typo, sometimes a key figure. Both are public
  records.
- **Effort (person-months):** how much of a person's year is promised to a
  project. Twelve person-months is 100% of their time.
- **Signing official:** the university staff member who certifies the
  application on the institution's behalf.
- **False Claims Act:** the federal law used to recover money when a claim
  for federal funds was false. Universities have paid settlements over grant
  applications.
- **Just-in-Time (JIT):** NIH's request for updated information shortly
  before it makes an award, often months after submission.

---

## 3. The problem

A proposal is a promise backed by three kinds of evidence: **numbers,
claims and people.** Each breaks in a different way, and today nobody checks
all three before the signature.

### 3.1 Numbers come from rules that disagree and change

- The 2024 federal rule counts the first **$50,000** of each subaward in the
  overhead base and defines equipment as **$10,000** or more
  ([2 CFR 200.1](https://www.ecfr.gov/current/title-2/section-200.1)).
- Berkeley's May 2026 rate agreement (60.5% on-campus research F&A) still
  says **$25,000** and **$5,000**
  ([Berkeley SPO PDF](https://spo.berkeley.edu/policy/fa2026.pdf)). Schools
  adopt the new thresholds only when their rate agreement is renewed.
- COGR reads NIH's April 2026 notice (NOT-OD-26-072) as pointing NIH awards
  back to $25,000
  ([COGR](https://www.cogr.edu/blog/nih-notice-not-od-26-072-indirect-cost-provisions-and-uniform-guidance-implementation))
  **(verify)**.
- The NIH salary cap moved from $225,700 to **$228,000** (NOT-OD-26-034),
  and its effective date was corrected from Jan 11 to Jan 1, 2026
  ([NIH](https://www.grants.nih.gov/grants/guide/notice-files/NOT-OD-26-034.html),
  [Harvard OSP](https://osp.finance.harvard.edu/news/2026/01/2026-nih-salary-cap-effective-january-11-2026)).
- Proposal software (Cayuse, Kuali) calculates from rates an administrator
  typed in, and salary caps often need manual overrides
  ([Utah](https://osp.utah.edu/policies/procedure-library/apply-salary-cap.php)).
  Nothing records which document a number came from.

A budget built on the newer federal numbers, which is exactly what an AI
drafting tool would reach for, overstates overhead by **$15,125 per
subaward** (an extra $25,000 in the base at 60.5%).

### 3.2 Claims in the literature review can be wrong, and that has a price

- About **25.4%** of quotations in medical journals misrepresent the cited
  source, 11.9% seriously
  ([PeerJ meta-analysis](https://peerj.com/articles/1364)).
- Language models invent references: in one study GPT-3.5 fabricated
  **55%**, GPT-4 **18%**
  ([Walters & Wilder, Sci Rep](https://doaj.org/article/fc88ea07ec994a7c8a144f8516c48cbf)).
  A 2026 preprint estimates about 146,932 non-existent citations in 2025
  alone ([arXiv 2605.07723](https://arxiv.org/abs/2605.07723), preprint).
- NIH saw single PIs submit more than **40 applications in one round** with
  AI help. It now caps PIs at **6 a year** and will not treat applications
  "substantially developed by AI" as original
  ([NOT-OD-25-132](https://grants.nih.gov/grants/guide/notice-files/NOT-OD-25-132.html)).
- **Dana-Farber paid $15M (Dec 2025)** to settle allegations that NIH grant
  applications described a 2015 *Nature Medicine* paper without disclosing
  its problems
  ([DOJ](https://www.justice.gov/opa/pr/dana-farber-cancer-institute-agrees-pay-15m-settle-fraud-allegations-related-scientific)).
  A research agent queried the paper (PMID 26005854) live: Crossref shows
  **two 2024 corrections and no retraction**, so a "was it retracted?" check
  passes it. It is linked to four NIH projects, two of which are on the
  settlement's grant list **(verify)**.

Settlements over evidence in grant applications and reports:

| Year | Institution | Amount | What was alleged |
|---|---|---|---|
| 2017 | Partners / Brigham and Women's | $10M | Manipulated data in NIH applications |
| 2019 | Duke | $112.5M | Falsified data in NIH and EPA applications and progress reports |
| 2021 | Mass General + one researcher | about $1.15M | Data in an R01 application |
| 2023 | Purdue | $737K | Falsified data in 16 to 17 applications |
| 2025 | Athira Pharma | $4.07M | Undisclosed misconduct allegations about papers cited in applications |
| 2025 | Northwestern | $2.30M | Falsified research cited in applications and reports |
| 2025 | Dana-Farber | $15M | Applications described a flawed paper without disclosure |

About **$146M** in total, $112.5M of it Duke's. The Duke, Brigham and Athira
figures come from search summaries because justice.gov blocked direct
loading, so they are `[unverified]` until someone opens the releases.
Sources are listed at the end.

### 3.3 People get promised to more work than they have

- NIH bans three kinds of overlap: the same science funded twice, the same
  costs requested twice, and a person committed above 100% (12
  person-months) "whether or not salary support is requested"
  ([NIH language](https://hco.cfa.harvard.edu/files/2023/05/nih_language_on_overlap.pdf)).
- NIH runs its own machine duplicate check and screens about 80,000
  applications a year
  ([HHS AI use case](https://www.healthit.gov/hhs-ai-usecases/detecting-overlapping-science-dos),
  [HHS OIG](https://oig.hhs.gov/reports/all/2020/the-national-institutes-of-health-has-controls-to-mitigate-the-risk-that-grantees-receive-duplicate-grant-funding/)).
- Getting it wrong is expensive: Cleveland Clinic paid $7.6M (2024) over
  undisclosed support
  ([DOJ](https://www.justice.gov/usao-ndoh/pr/cleveland-clinic-pay-over-7-million-settle-allegations-undisclosed-foreign-sources)),
  and UNT Health Science Center paid $13.07M over inaccurate effort
  certification
  ([DOJ](https://www.justice.gov/usao-ndtx/pr/university-north-texas-health-science-center-pay-13-million-settle-claims-related)).
- Existing tools add up effort and alert near 100%
  ([Weill Cornell](https://research.weill.cornell.edu/sites/default/files/effort_tracking_system_policy.pdf)).
  None asks "what if these three pending proposals are all funded?"

### 3.4 The people checking have no time

- At BU in FY19, **58%** of proposals reached the proposal office a day or
  less before the deadline, and six rejected or withdrawn proposals cost
  **$26M** ([BU](https://www.bu.edu/research/?p=20359)).
- UCSD gives full review only with 5 or more business days; with 2 or
  fewer, the proposal goes out "as-is"
  ([UCSD](https://blink.ucsd.edu/research/sra/preparing-proposals/timely-submissions.html)).
- PIs report about 116 hours per proposal
  ([von Hippel 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4349454)), and
  spend **44.3%** of research time on administration (FDP 2018 survey of
  11,167 PIs)
  ([FDP](https://thefdp.org/wp-content/uploads/FDP-FWS-2018-Primary-Report.pdf)).
- **36%** of research administrators are likely to look for another job
  within a year; workload is the top retention problem
  ([SRAI](https://www.srainternational.org/blogs/srai-jra2/2025/12/13/the-needs-and-challenges-of-the-ra-workforce)).
- Funding is tighter: NIH R01-equivalent success rates fell to **13.0%** in
  FY2025, so labs keep more proposals pending at once
  ([NIH](https://www.grants.nih.gov/news-events/nih-extramural-nexus-news/2026/03/fiscal-year-2025-by-the-numbers-extramural-grant-investments-in-research)).

### 3.5 Who carries the risk

The institution. Applications certify that statements are "true, complete,
and accurate" (quoted in the
[Dana-Farber settlement](https://www.justice.gov/d9/2025-12/usa_v._dana-farber_cancer_institute_-_settlement_agreement.pdf)),
and NIH says the signing official "should ascertain and assure" application
materials are the PI's own work
([NIH GPS 2.1.2](https://grants.nih.gov/grants/policy/nihgps/HTML5/section_2/2.1.2_recipient_staff.htm)).
Image-checking tools are run by research-integrity offices and aimed at
manuscripts
([Rochester](https://www.rochester.edu/university-research/research-integrity-stewardship-ethics/protocols-and-plagiarism/),
[Proofig](https://proofig.com/proofig-for-research-institutions)). The
proposal office certifies costs, not claims. **We found no office that
checks the evidence behind a proposal before the signature.**

---

## 4. The product

### 4.1 The company we simulate

A fictional lab (working name: the Halden Lab, computational immunology) at
a university whose rules are copied from Berkeley's real, public 2026
documents. The lab has one PI, a few postdocs and grad students, one funded
NIH award, and about six proposals pending or in preparation, including a
resubmission due in 26 hours. The lab is simulated; every rule and every
literature lookup is real.

### 4.2 The seats

| Seat | Played by | Can | Cannot |
|---|---|---|---|
| Budget Builder (department research administrator) | Claude agent | Rebuild the budget from sources, attach a citation to every line, escalate source conflicts | Approve its own budget, sign |
| Evidence Checker (citation engine) | Claude agent + deterministic lookups | Resolve every reference, check status, check prior-work claims, build the evidence graph | Edit proposal text, accuse anyone |
| Proposal Reviewer (sponsored-programs pre-award) | Claude agent | Check commitments across the portfolio, rank findings by dollars and deadline, place and clear holds | Edit the budget, sign |
| PI | Claude persona | Submit drafts, fix issues, push back | Clear a hold |
| Signing Official | Human (the judge in the demo) | Sign when no holds are open, or override a hold with a written reason | Sign over an open hold without a reason |
| Research Integrity Officer | Claude persona | Receive confidential evidence flags | Edit anything |

Permissions are enforced in the database, not in prompts. The sign action
fails while any hold is open unless an override with a reason is recorded.

### 4.3 How a proposal flows

1. The PI drops in a draft: budget spreadsheet, narrative with references,
   personnel list. No one types a prompt; the upload starts the work.
2. The **Budget Builder** rebuilds every line from the source registry and
   attaches a citation chip (document, clause, effective date). Where
   sources disagree, it picks one, says why, and shows the dollar
   difference.
3. The **Evidence Checker** runs the citation engine (§5) over every
   reference and every claim about earlier work.
4. The **Proposal Reviewer** runs commitment checks across all pending
   proposals, ranks findings by dollars and deadline, and places holds.
5. The PI fixes issues or argues. The reviewer holds its position when the
   rule is clear and offers the fastest fix.
6. The **Signing Official** signs when no holds are open, or overrides one
   on the record.
7. **The work continues after submission.** Cited papers, funder notices and
   the PI's other support are watched. JIT and the award's arrival trigger
   rechecks (§4.4 E).

### 4.4 Feature catalog

**M** = on the demo path. **S** = stretch.

**A. Every number cites its source**
- **M** Source registry: rate agreement, fringe table by fiscal year, NIH
  salary cap notices, the funding notice, and two or three core-facility
  rate sheets, each with effective dates and a precedence order.
- **M** Rule resolution: decide which source governs this budget period,
  record why, escalate true conflicts.
- **M** Line recomputation: salary x effort under the cap, fringe,
  escalation, overhead base exclusions (equipment, subaward amounts above
  the threshold), F&A.
- **M** Citation chips: click any number to open the source document with
  the clause highlighted.
- **S** Policy-shock repricing: a new notice arrives, and every in-flight
  proposal it touches is repriced with the deltas sent to the PI.
- **S** Price and unit checks against core-facility rate sheets (per cage vs
  per mouse, wrong sequencing lane type), using the "reasonable cost" test
  in [2 CFR 200.404](https://www.law.cornell.edu/cfr/text/2/200.404).

**B. Citation engine for the literature review** (detail in §5)
- **M** Reference resolution: every reference must resolve to a real DOI or
  PMID with matching title, authors and year. Catches invented references.
- **M** Status check: retraction, correction, expression of concern.
- **M** Prior-work claims: "our last award produced 12 papers" is checked
  against NIH RePORTER links.
- **M** Evidence graph: each paper, the claims that rely on it, the
  proposals and reports that make those claims, and the grants and dollars
  behind them.
- **M** Materiality: a correction to an author affiliation is a note; a
  correction to a figure the proposal relies on is a hold.
- **S** Claim support: does the sentence match what the cited paper says?
  A flag for a human, never a verdict.
- **S** Uncited claims: flag factual claims with no citation and show
  candidate sources for the PI to read. It never edits the text.
- **S** Watchlist: keep monitoring cited papers after submission; a new
  correction or retraction opens a disclosure task.
- **S** Grant credit and public access: papers reported as outputs must
  credit the right grant and have a PubMed Central ID. Missing ones can hold
  up continuation funding
  ([NOT-OD-12-160](https://grants.nih.gov/grants/guide/notice-files/NOT-OD-12-160.html)).

**C. People and commitments**
- **M** Commitment scenarios: each person's effort under every combination
  of pending proposals being funded, including unpaid and non-federal
  effort, against the 12 person-month limit.
- **M** Application counter: NIH's 6-a-year cap for each PI.
- **M** Duplicate lines: the same postdoc or equipment requested in two
  pending proposals.
- **S** Other Support drift: new in-kind support (donated equipment, a new
  appointment) since the last disclosure.

**D. Controls and accountability**
- **M** Separation of duties in the database: the builder cannot approve,
  the reviewer cannot edit, only the signing official signs.
- **M** Holds with reasons; overrides need a written reason and are logged.
- **M** Append-only decision log; "why?" on any number or hold, however old.
- **M** Deadline-aware triage: with 26 hours left, the reviewer surfaces the
  findings that matter most in dollars first.
- **M** Confidential routing: evidence concerns go to the integrity officer,
  never into a public comment or an accusation.

**E. Time: from proposal to award**
- **M** JIT recheck: months later, rerun commitments against what changed
  (for example, a foundation award that landed in April).
- **M** Award arrives with a cut: rebuild the budget baseline, flag
  commitments that are now unfunded (a year-3 hire), and separate changes
  the lab can make itself from ones that need funder approval.
- **S** Payment justifications after award: since March 2025 each NIH
  payment request needs a written justification
  ([DOL FAQ](https://resources.uta.edu/research/_documents/gcs_documents/executive-orders/DOL-3-25-2025-FAQs-PMS-Justification.pdf),
  [NIH GPS 6.1](https://grants.nih.gov/grants/policy/nihgps/html5/section_6/6.1_nih_payment_review_process.htm)),
  and COGR estimates 53,749 hours of redundant work
  ([COGR](https://www.cogr.edu/sites/default/files/FINAL%20Infographic%20and%20Appendix.pdf)).
  The agent drafts each one citing ledger entries **(verify still in force)**.

### 4.5 What it never does

- **Write the science.** It checks; the PI writes. This keeps it on the
  right side of NIH's AI policy.
- **Conclude misconduct.** It reports what the public record says and routes
  it to the right person.
- **Sign.** A human signs, and every override is on the record.

---

## 5. The citation engine (literature review)

One engine, two kinds of citation. **Budget citations** tie each number to a
rule (§4.4 A). **Literature citations** tie each claim to evidence. Both
write to the same evidence graph, so any number or claim can be traced to
its source and to the dollars that depend on it.

### 5.1 Checks, in order

| # | Check | How | Automated? |
|---|---|---|---|
| 1 | Does the reference exist? | Resolve DOI or PMID; match title, first author, year | Yes |
| 2 | Is it the paper the text says it is? | Compare citation metadata and the citing sentence to the record and abstract | Yes, with a confidence score |
| 3 | Retracted, corrected or flagged? | Crossref update records (includes Retraction Watch data); OpenAlex retraction flag | Yes |
| 4 | Does the correction matter here? | Is the corrected part what the proposal relies on? | Agent judgment under a materiality rule, human review |
| 5 | Do prior-work claims match the record? | NIH RePORTER project-to-publication links, iCite | Yes |
| 6 | Is each output credited to the right grant? | Funding acknowledgments vs the grant claimed | Yes (stretch) |
| 7 | Does the paper support the sentence? | Compare claim to abstract | Flag only |

### 5.2 Data sources

- **Crossref**, which acquired the Retraction Watch database in 2023 and
  opened it: 76,426 retraction updates at the time of the agent's query
  ([Crossref](https://www.crossref.org/blog/news-crossref-and-retraction-watch/)).
- **OpenAlex:** 137,130 works flagged as retracted at query time.
- **NIH RePORTER API:** projects, award amounts and linked PMIDs
  ([API](https://api.reporter.nih.gov/)). An agent tested it live.
- **PubMed, iCite, Europe PMC:** metadata, PubMed Central IDs, citation
  context.
- **NSF Awards API** for NSF proposals
  ([API](https://api.nsf.gov/services/v1/awards.json)).

For the demo, cache every lookup on the scripted path; call live only for
the judge's own DOI.

### 5.3 Why this is finance, not a better bibliography

Each claim connects to money. When a cited paper is corrected, the engine
walks the graph: which proposals and progress reports relied on it, which
grants those support, and how many dollars were awarded in the affected
period. A correction stops being a footnote and becomes a priced exposure
with a disclosure task and an owner. No existing tool we found takes that
step.

### 5.4 Honest limits

- Judging whether a paper supports a sentence is hard. Earlier research in
  this session found scite's "contrasting" labels about 59% accurate
  **(verify)**, so check 7 only flags for a human and never holds on its own.
- Links between grants and papers are self-reported and overcount, since
  one paper can credit several grants.
- "Not found" is a result, not an accusation: some real papers have no DOI.

---

## 6. The demo and its WOW factor

### 6.1 Screens

1. **Proposal View:** the budget, with a citation chip on every number.
   Click one and the source document opens beside it, clause highlighted.
2. **Evidence Graph:** papers, claims, proposals, grants and dollars as
   nodes. When a paper's status changes, the affected path turns red and the
   dollar total at risk counts up.
3. **Commitment Grid:** people down the side, funding scenarios across the
   top; cells turn red above 12 person-months.
4. **Review Queue:** holds ranked by dollar risk, with a deadline countdown.
5. **Signing Official Inbox:** the sign button stays disabled while holds
   are open; an override needs a written reason.
6. **Timeline and Inject Panel:** the simulated clock, plus controls to drop
   a funder notice, deliver an award, add new support for a person, or
   paste a DOI.
7. **Decision Inspector:** the "why" chain for any number or hold.
8. **Scorecard:** results against the answer key.

### 6.2 The 3-minute script

1. **0:00 The hook, on a real case.** "In December 2025, Dana-Farber paid
   $15 million to settle allegations that its grant applications described a
   flawed paper without disclosing its problems. Here's that paper. Every
   retraction checker says it's clean." Paste the PMID live. GrantGuard
   finds two corrections, and the graph fans out to the NIH projects linked
   to it. "Nobody runs this check before the university signs. GrantGuard
   does."
2. **0:30 Our lab.** The PI uploads a resubmission 26 hours before the
   deadline. Three agents start on their own and the queue fills.
3. **1:00 Numbers.** The builder flags the subaward base: three documents
   side by side, one saying $50,000 and two saying $25,000. It applies the
   rate agreement, cites the clause, and shows overhead overstated by
   $15,125.
4. **1:30 Claims.** The evidence checker finds that a paper the research
   plan depends on was corrected last month. The reviewer places a hold,
   drafts disclosure language, and routes the concern to the integrity
   officer. The PI persona pushes back ("the deadline is tomorrow"). The
   reviewer holds and offers the ten-minute fix: add the disclosure
   sentence.
5. **2:00 Time.** Jump to June. A foundation award landed in April that pays
   no salary. At JIT the commitment grid turns red at 12.6 person-months.
   The award arrives with NCI's 17% cut **(verify)**. The agent rebuilds the
   baseline, flags the year-3 hire as unfunded, and labels which fixes need
   NIH approval.
6. **2:30 Judge's turn.** "Give us any DOI or PMID." It runs live. Or the
   judge edits a budget line or drops a notice.
7. **2:50 Proof.** Flip to the Scorecard.

### 6.3 Why it lands

- **It's real.** The opening is a $15M public case replayed on live public
  data, not a story we wrote.
- **You can see the liability.** The graph turns an invisible footnote into
  a red path that ends in a dollar figure.
- **Everything is clickable.** Any number opens the real clause it came
  from, so judges can check us themselves.
- **The judge drives.** Their own DOI, budget edit or notice goes through
  the same live pipeline.
- **It argues back.** The agent holds against a PI under deadline pressure
  and explains itself, which is Hyphenate's "defends a decision" moment.

Honest estimate: a strong wow (about 8/10) if the graph and the live lookup
work; closer to 6/10 if the demo is mostly tables. Spend UI time on the
graph and the clause highlight, not on extra screens.

### 6.4 Judge scenarios to rehearse

- Paste a retracted paper's DOI (should hold) and a clean one (should pass).
- Paste a DOI that the proposal cites in order to discuss its retraction
  (should note, not hold: the proposal is being honest about it).
- Raise the PI's salary above the cap.
- Add a $7,500 instrument. Under Berkeley's $5,000 definition it is
  equipment and carries no overhead; treating it as a supply overstates
  overhead by $4,537.50.
- Drop a notice that changes the salary cap's effective date.

---

## 7. Novelty

### 7.1 Closest existing work

| Tool | What it does | What it doesn't do |
|---|---|---|
| Cayuse, Kuali | Proposal budgets from configured rates; salary-cap validation; Current & Pending reports | No evidence trail; doesn't decide which rate applies; no literature checks |
| Idaho AI4RA "Vandalizer" (May 2026) | Drafts budget justifications, shows the arithmetic, cross-checks sections | Trusts the rates you give it; no salary-cap or overhead-base logic found |
| scite Reference Check | Flags retracted or corrected references in manuscripts | Manuscripts, not proposals; no money attached |
| Proofig, ImageTwin, iThenticate | Image and text integrity screening | Run by integrity offices, mostly for manuscripts |
| Weill Cornell and Duke effort tools | Add up effort; alert near 100% | No funding-combination scenarios; no unpaid effort |
| NIH's duplicate detector | Finds overlapping applications | Funder side, after submission |

### 7.2 What's new

1. A source citation on every budget number, and an agent that decides which
   of several disagreeing documents governs.
2. A literature citation engine that catches corrections, not just
   retractions, and prices them by walking from paper to grant to dollars.
3. Commitment checks across combinations of pending proposals, not just
   totals.
4. A hold on the institution's signature until numbers, claims and people
   all reconcile.
5. The same evidence trail carried from proposal to award.

### 7.3 Caveats

The agents did not read vendor documentation in depth, so "not found" means
not found, not proven absent. AI4RA (NSF-funded, building open-source AI
tools for research administrators) is the closest group to watch.

## Corrections

- **Fri 10/23 ~23:30:** the team's Devpost scan
  (`docs/research/sources/devpost-scan.txt`) found **GrantProof**, a past
  hackathon project that checks a nonprofit's grant proposals, agreements
  and reports against the funder's rules and cites the exact page
  (https://devpost.com/software/wateraid-x75h92), plus a second GrantProof
  that keeps conflicting report numbers visible
  (https://devpost.com/software/grantproof). The first one also computes
  dates, sums and percentages in code, shows conflicting clauses on both
  sides and leaves the call to staff, and was tested on seeded errors. So
  citing the rule behind every finding, computing in code and keeping
  conflicts visible are not new on their own. What GrantProof's pages don't
  describe: rate-agreement and salary-cap budget math, choosing which
  disagreeing document governs by a written precedence rule, literature
  status checks (corrections), commitment scenarios, or a signature hold
  enforced by separate seats. Claim those, not "first ever". See the novelty
  section of `docs/MASTER-PLAN.md`.

---

## 8. Fit with Hyphenate

| Their criterion | Our answer |
|---|---|
| Is it real enough? | Real Berkeley rate agreement, real NIH notices, live Crossref and RePORTER data, a real $15M case, and a planted-error answer key |
| Would you hire it? | Named seats, each limited by the database; a full decision log; asks the signing official at the right moment |
| Something new? | Nobody checks the evidence behind a proposal before the signature (§7) |
| The moment | Catches the corrected paper that retraction checkers miss; defends the hold against the PI; recovers at JIT when a new award breaks the commitments |

| Their hard part | Where it shows up |
|---|---|
| Sources that disagree | $50,000 vs $25,000 subaward base: three documents, one decision, cited |
| Time | Priced in March, rechecked at JIT in June; papers corrected after submission; the award arrives cut |
| Working with others | The PI pushes back; the integrity officer gets confidential flags; the signing official can override |
| Limits | The builder can't approve, the reviewer can't edit, only a human signs |
| Explainable | Every number and hold answers "why?" with a source |

---

## 9. Proof it works

### 9.1 Real vs simulated

| Piece | Real or simulated |
|---|---|
| Lab, PI, staff, proposals | Simulated |
| Rate agreement, salary cap, federal rules | **Real** public documents, hand-encoded with dates |
| Literature lookups | **Real** (Crossref, OpenAlex, RePORTER), cached for the scripted path |
| Dana-Farber replay | **Real** public data |
| PI and integrity officer | Claude personas |
| Signing official | The judge |
| Agents | **Real**: live Claude with tools, nothing hardcoded |
| Answer key | **Real**: planted errors with the expected action for each |

### 9.2 Answer key

Six proposals: three clean, three with planted errors.

- **Numbers:** stale salary cap; uncapped salary; $50,000 subaward base;
  a $7,500 instrument treated as a supply; the wrong fiscal year's fringe
  rate; a core-facility price in the wrong unit.
- **Claims:** an invented reference; a paper with a material correction; a
  prior-award claim that RePORTER doesn't support.
- **People:** a 7th NIH application; 12.6 person-months under one funding
  scenario; the same postdoc in two proposals.

Decoys that should **not** hold: a retracted paper cited in order to
discuss it; a correction to an author's affiliation; a salary exactly at the
cap.

Metrics: errors caught (recall), false holds (precision), dollar error per
line, and time to triage. The eval script replays the scenario at full speed
and diffs decisions against the key; it can double as the check command
(`AGENTS.md` §0).

---

## 10. Build plan

Stack as decided in `DECISIONS.md` and listed in `docs/FEATURES.md`:
SpacetimeDB (one pinned version) for tables and rules, and a separate agent
worker that connects with one client identity per seat. The worker calls
Claude (suggested: `claude-sonnet-5-5` for seats, `claude-haiku-5-5` for
personas) and the public APIs, since reducers can't call external services.
The module and worker language and the frontend are still TBD.

### 10.1 Tables and reducers (sketch)

- `source_doc` (type, effective dates, precedence), `rule` (clause text,
  source)
- `proposal`, `budget_line` (amount, source_id, clause, computed_by)
- `person`, `commitment` (person, proposal, person-months, paid or unpaid)
- `reference` (doi, pmid, status, checked_at), `claim` (text, reference
  ids, verdict)
- `finding` and `decision` (append-only), `hold`, `signature`, `actor`,
  `sim_clock`, `notice`
- Reducers: `submit_draft` (PI), `post_line` (builder), `post_finding`
  (checker, reviewer), `place_hold` and `clear_hold` (reviewer), `sign`
  (signing official only; fails with open holds), `override_hold` (signing
  official; reason required), `ingest_notice`, `deliver_award`,
  `advance_clock` (simulator only)

### 10.2 Lanes (hours are estimates)

| Lane | Owns | Hours |
|---|---|---|
| Rules + ledger | `server/` | 6 to 8 |
| Agents + citation engine | `agents/` | 12 to 16 |
| Lab, sources, answer key | `sim/`, `data/` | 6 to 8 |
| UI, graph, eval | `web/`, `eval/` | 8 to 10 |

### 10.3 Order

1. Contracts and fixtures (about 30 min): the tables above, one proposal,
   ten references with cached statuses.
2. Demo path first: number check, claim check, hold, sign, scorecard.
3. The time scene: JIT recheck and award arrival.
4. Polish the graph and the clause highlight.
5. Live lookup for the judge's DOI.
6. Stretch, only if ahead: policy-shock repricing, claim support, payment
   justifications.

Scope guards: one institution, one PI, six proposals, about 30 references.
Use an NIH R01 above $250,000 a year in direct costs; smaller ones are
submitted as modular budgets with no line items to check
([NIH modular](https://grants.nih.gov/grants/how-to-apply-application-guide/forms-i/general/g.320-phs-398-modular-budget-form.htm)).

---

## 11. Other tracks

- **Anthropic:** a named community (Berkeley PIs and research
  administrators). Claude reads rate agreements, matches claims to
  abstracts, triages and argues. The failure-mode story writes itself: we
  use Claude to catch the failure language models are known for, invented
  citations.
- **Microsoft, Built for the Real World:** measurable results (caught N of
  M, dollars corrected); a path to production through a university-licensed
  deployment, since Berkeley allows only public data in unlicensed AI tools
  ([Berkeley guidance](https://oercs.berkeley.edu/appropriate-use-generative-ai-tools));
  responsible design (never accuses, a human signs).
- **SpacetimeDB:** rules, holds and signatures live in reducers; every
  screen is a live subscription.
- **Apify:** an Actor that scrapes core-facility rate sheets and new NIH
  notices into the source registry, so budget citations stay current.
- **General (technical complexity):** multiple agents, database-enforced
  permissions, live public data, rechecks over time.

---

## 12. Risks, guards and facts to verify

| Risk | Guard |
|---|---|
| "Is this a finance team?" | The budget is a multi-year cost commitment the institution certifies; pricing salaries, fringe and overhead is cost accounting. The award-arrival scene connects it to the ledger. |
| "Peer reviewers don't score budgets" | True ([NIH](https://www.grants.nih.gov/policy-and-compliance/policy-topics/peer-review/simplifying-review/framework)). Our user is the institution that signs, not the reviewer. |
| Looks like an AI grant writer | It never writes. Lead with NIH's AI policy: we're the checker. |
| False accusation | Report the public record, route confidentially, never conclude. |
| Live APIs fail on stage | Cache the scripted path; keep a backup video. |
| Claim-support judgment is unreliable | Flag only; holds come from status and materiality rules. |
| Policy facts keep changing | Store an "as of" date on every source and show it. |
| Scope creep | After-award features are stretch only. |

Verify before the demo relies on them:

1. What NOT-OD-26-072 does to the NIH subaward base (only COGR's reading so
   far). Demo step 3 depends on it.
2. The Dana-Farber paper: PMID 26005854, its two 2024 corrections, and
   which linked projects are on the settlement list.
3. NCI's award-cut percentages and the $250,000 trigger
   ([NCI policy](https://grants.nih.gov/policy-and-compliance/policy-topics/nih-fiscal-policies/ico-funding-policies-and-considerations/NCI)).
4. Berkeley's fringe rates (from a search snippet only).
5. Whether payment justifications are still required as of October 2026.
6. The Duke, Brigham and Athira settlement figures (from search summaries).
7. Berkeley's licensed AI tools list (an agent warned its table may have
   parsed wrong).
8. The scite 59% accuracy figure.

---

## 13. Interview plan (this weekend)

University offices are closed. Ask a PI or lab manager a teammate knows,
and email their research administrator tonight (look them up in
[Phoebe](https://phoebe.rac.berkeley.edu/search)). Berkeley Sponsored
Projects Office: [spo.berkeley.edu](https://spo.berkeley.edu/), (510)
642-0120.

1. Walk me through your last budget to Sponsored Projects: where did each
   rate come from, and what came back?
2. Has a proposal ever gone out with a wrong rate, cap or base? Who caught
   it, and when?
3. When a PI cites earlier work, does anyone besides the PI check it?
4. What would you let software do without your sign-off, and what should it
   never do?
5. Could a draft budget with salaries go into an unlicensed AI tool? What
   would IT need to see first?

If (4) is "nothing", reframe the autonomy pitch. If (2) is "that never
happens", the numbers story weakens.

---

## 14. Open decisions for the team

1. Adopt this, the after-award version of GrantGuard, or the settlement
   administrator idea?
2. Name the university (Berkeley's real rules) or use a fictional one
   modeled on them?
3. Three agent seats, or two (fold the Evidence Checker into the Reviewer)?
4. Which stretch features, if any?
5. Who runs the interview?

---

## Sources

**Rules and notices**
- [2 CFR 200.1 definitions (MTDC, equipment)](https://www.ecfr.gov/current/title-2/section-200.1)
- [2 CFR 200.404 reasonable costs](https://www.law.cornell.edu/cfr/text/2/200.404)
- [2 CFR 200.415 certifications](https://www.law.cornell.edu/cfr/text/2/200.415)
- [Berkeley 2026 F&A rate agreement](https://spo.berkeley.edu/policy/fa2026.pdf)
- [COGR on NOT-OD-26-072](https://www.cogr.edu/blog/nih-notice-not-od-26-072-indirect-cost-provisions-and-uniform-guidance-implementation)
- [NOT-OD-26-034 salary cap](https://www.grants.nih.gov/grants/guide/notice-files/NOT-OD-26-034.html)
- [Harvard OSP on the cap's effective date](https://osp.finance.harvard.edu/news/2026/01/2026-nih-salary-cap-effective-january-11-2026)
- [NOT-OD-25-132 application cap and AI policy](https://grants.nih.gov/grants/guide/notice-files/NOT-OD-25-132.html)
- [NOT-OD-12-160 public access and continuation awards](https://grants.nih.gov/grants/guide/notice-files/NOT-OD-12-160.html)
- [NIH overlap definitions](https://hco.cfa.harvard.edu/files/2023/05/nih_language_on_overlap.pdf)
- [NIH GPS 2.1.2 signing official](https://grants.nih.gov/grants/policy/nihgps/HTML5/section_2/2.1.2_recipient_staff.htm)
- [NIH GPS 6.1 payment review](https://grants.nih.gov/grants/policy/nihgps/html5/section_6/6.1_nih_payment_review_process.htm)
- [DOL FAQ on payment justifications](https://resources.uta.edu/research/_documents/gcs_documents/executive-orders/DOL-3-25-2025-FAQs-PMS-Justification.pdf)
- [NCI funding policy](https://grants.nih.gov/policy-and-compliance/policy-topics/nih-fiscal-policies/ico-funding-policies-and-considerations/NCI)
- [NIH modular budgets](https://grants.nih.gov/grants/how-to-apply-application-guide/forms-i/general/g.320-phs-398-modular-budget-form.htm)
- [NIH review framework (budget not scored)](https://www.grants.nih.gov/policy-and-compliance/policy-topics/peer-review/simplifying-review/framework)

**Settlements and integrity**
- [Dana-Farber, DOJ release](https://www.justice.gov/opa/pr/dana-farber-cancer-institute-agrees-pay-15m-settle-fraud-allegations-related-scientific)
- [Dana-Farber settlement agreement](https://www.justice.gov/d9/2025-12/usa_v._dana-farber_cancer_institute_-_settlement_agreement.pdf)
- [Duke, DOJ release](https://www.justice.gov/usao-mdnc/pr/duke-university-agrees-pay-us-1125-million-settle-false-claims-act-allegations-related)
- [Partners / Brigham, DOJ release](https://www.justice.gov/usao-ma/pr/partners-healthcare-and-brigham-and-women-s-hospital-agree-pay-10-million-resolve)
- [Mass General, Retraction Watch](https://retractionwatch.com/2021/08/13/false-claims-allegations-cost-mass-general-former-harvard-researcher-more-than-1-million)
- [Purdue, ORI case summary](https://ori.hhs.gov/case-summary-chang-alice-c)
- [Athira Pharma, GeekWire](https://www.geekwire.com/2025/seattle-biotech-firm-athira-pharma-will-pay-4m-to-settle-allegations-related-to-research-misconduct/)
- [Northwestern, Retraction Watch](https://retractionwatch.com/2026/01/14/northwestern-to-pay-2-3-million-for-falsified-research-in-nih-grants)
- [Cleveland Clinic, DOJ release](https://www.justice.gov/usao-ndoh/pr/cleveland-clinic-pay-over-7-million-settle-allegations-undisclosed-foreign-sources)
- [UNT Health Science Center, DOJ release](https://www.justice.gov/usao-ndtx/pr/university-north-texas-health-science-center-pay-13-million-settle-claims-related)
- [ORI 2024 annual report](https://ori.hhs.gov/sites/default/files/2025-12/CY%202024%20ORI%20Annual%20Report_final.pdf)
- [Rochester integrity tools](https://www.rochester.edu/university-research/research-integrity-stewardship-ethics/protocols-and-plagiarism/)
- [Proofig for institutions](https://proofig.com/proofig-for-research-institutions)

**Citations and literature data**
- [PeerJ quotation-error meta-analysis](https://peerj.com/articles/1364)
- [Walters & Wilder, fabricated references](https://doaj.org/article/fc88ea07ec994a7c8a144f8516c48cbf)
- [arXiv 2605.07723, non-existent citations (preprint)](https://arxiv.org/abs/2605.07723)
- [Crossref and Retraction Watch](https://www.crossref.org/blog/news-crossref-and-retraction-watch/)
- [NIH RePORTER API](https://api.reporter.nih.gov/)
- [NSF Awards API](https://api.nsf.gov/services/v1/awards.json)
- [scite Reference Check](https://help.scite.ai/zh/article/how-do-i-use-the-scite-reference-check-u52q0w)
- [Semantic Scholar citation intent](https://semanticscholar.readthedocs.io/en/stable/s2objects/Citation.html)

**Workload and practice**
- [FDP 2018 Faculty Workload Survey](https://thefdp.org/wp-content/uploads/FDP-FWS-2018-Primary-Report.pdf)
- [SRAI workforce survey](https://www.srainternational.org/blogs/srai-jra2/2025/12/13/the-needs-and-challenges-of-the-ra-workforce)
- [BU proposal timing](https://www.bu.edu/research/?p=20359)
- [UCSD review tiers](https://blink.ucsd.edu/research/sra/preparing-proposals/timely-submissions.html)
- [von Hippel 2015, hours per proposal](https://pmc.ncbi.nlm.nih.gov/articles/PMC4349454)
- [NIH FY2025 by the numbers](https://www.grants.nih.gov/news-events/nih-extramural-nexus-news/2026/03/fiscal-year-2025-by-the-numbers-extramural-grant-investments-in-research)
- [COGR payment-justification burden](https://www.cogr.edu/sites/default/files/FINAL%20Infographic%20and%20Appendix.pdf)
- [Ithaka S+R, AI in research administration](https://sr.ithaka.org/publications/ai-adoption-in-research-administration-at-emerging-research-institutions/)

**Tools**
- [Idaho AI4RA Vandalizer](https://ai4ra.uidaho.edu/ai4ra-tip-of-the-week-7/)
- [Cayuse salary cap](https://support.cayuse.com/hc/en-us/articles/7079530965267)
- [Utah salary cap procedure](https://osp.utah.edu/policies/procedure-library/apply-salary-cap.php)
- [Kuali Current & Pending](https://www.kent.edu/research/sponsored-programs/kuali-research)
- [Weill Cornell effort tracking](https://research.weill.cornell.edu/sites/default/files/effort_tracking_system_policy.pdf)
- [Duke Other Support tool](https://myresearchpath.duke.edu/reviewing-other-support-using-other-support-tool-step-step-guidance)
- [NIH duplicate detection (HHS AI use case)](https://www.healthit.gov/hhs-ai-usecases/detecting-overlapping-science-dos)
- [HHS OIG on duplicate funding controls](https://oig.hhs.gov/reports/all/2020/the-national-institutes-of-health-has-controls-to-mitigate-the-risk-that-grantees-receive-duplicate-grant-funding/)

**Berkeley**
- [Appropriate use of generative AI tools](https://oercs.berkeley.edu/appropriate-use-generative-ai-tools)
- [Licensed generative AI tools](https://ai.berkeley.edu/resources/licensed-generative-ai-tools)
- [Phoebe directory](https://phoebe.rac.berkeley.edu/search)
- [Sponsored Projects Office](https://spo.berkeley.edu/)

**Internal:** `docs/HYPHENATE.md`, `docs/TRACKS.md`, `docs/FEATURES.md`,
`docs/research/README.md`, `DECISIONS.md`
