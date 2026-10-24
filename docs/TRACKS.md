# Event rules and prize tracks

Source: the Cal Hacks 13.0 hacker guide (pasted Fri 10/23). Sponsor details
can change, so check the Live Site and starter packs at kickoff.

## Event rules that constrain us

- **All projects must be started during the event.** Write no project code
  before hacking opens. Teams are disqualified for this every year.
- Teams have at most 4 people. Add every teammate on Devpost.
- **Devpost deadline: Sun 9:00 AM.** Late entries aren't judged. Submit a
  draft Sat night, then keep editing it.
- Judging runs Sun 10:30 AM–12:30 PM at an assigned table. **The whole team
  must be present** the entire time, or we aren't judged. Each judge visit
  is a ~2-min pitch plus a **live demo**.
- General judging looks at impact, quality, technical complexity, and
  creativity.
- Hardware rentals: no soldering at the venue.

## Primary target: Hyphenate, "The Hyphenated Enterprise: Autonomous Systems for Finance"

**Prizes:** $8,000 / $5,000 / $3,000 for the top 3. The top 5 teams get
an expedited interview process. This is the largest cash prize at the event.

**Judging: every submission is judged on the same four questions (verbatim):**

1. **Is it real enough?** Realistic data, a messy problem, and proof that it works.
2. **Would you hire it?** For which seats, and would it earn them: limited
   access, a clean record of its work, and knowing when to ask?
3. **Did we see something new?** A company, problem or approach we haven't
   seen made autonomous before.
4. **The moment.** When it catches what others missed, recovers from
   something going wrong, or defends a decision when questioned.

**Required deliverables:**

- A **demo video that opens with our moment**.
- A **live demo at judging**. *They may ask us to try a scenario of their
  own*, so the system must accept new inputs live, not just a scripted path.
- **One line on the seats** our system fills (job titles it would replace or
  assist).
- **Proof it works:** what's real, what's simulated, and how we know.

The guide links a fuller "CalHacks_Hyphenate_Track" doc that we don't have
yet (see `HUMAN_TODO.md`). Paste it here when we get it.

### What this means for the build (derived from the criteria)

| Criterion | What we build |
| --- | --- |
| Real enough | Messy, realistic data: inconsistent vendor names, partial payments, duplicates, OCR noise, missing fields. Use sponsor sandboxes (Nessie, CRS) where they fit. |
| Limited access | Explicit permission tiers on every tool (read → propose → execute up to a $ limit → human only), enforced in code, not in the prompt. |
| Clean record | An append-only action log: every observation, decision, tool call, and the evidence for it, viewable in the UI and exportable. |
| Knowing when to ask | Escalation rules (confidence, amount, novelty, policy conflict) that route to a human inbox with a recommended action. |
| The moment | One seeded scenario where the agent catches something a naive rule would miss. It also has to recover from a failure (API error, bad data) and answer "why?" by citing its log. |
| Judge's own scenario | A "new scenario" input (upload a doc or paste an email/transaction) that runs the same pipeline live. |
| How we know | A small eval set of labeled scenarios with catch rate, false positives, and escalations, shown on screen and in the README. |

## Tracks that stack naturally with Hyphenate

Ranked by how much extra work each costs us. Each one requires *meaningful*
use, so only pick tracks that are core to the build. Check whether Devpost
caps the number of tracks per entry.

| Track | Prize | Why it fits | Extra cost |
| --- | --- | --- | --- |
| **Microsoft: Built for the Real World** (+ Customer Impact Award) | Surface laptop per member + FDE talk/mentorship | "Production-minded AI agent… in finance". Its criteria (customer understanding, measurable usefulness, path to production, responsible design, end-to-end) are the same evidence Hyphenate wants. | ~Free: add a "path to production" slide/README section. |
| **Anthropic** | $5k Claude credits + Max 20x | If Claude is the model. Needs a **named community** and a real problem someone lived. Claude must matter, and we must know where it can go wrong. | Low: pick a narrow user and talk to one. Write up the failure modes. |
| **CRS Credit API** | $1k overall, $500 Best Financial AI Agent, interviews for identity/fraud and most unexpected use | Credit, identity, and fraud sandbox with test identities, via API or MCP. It must be central and run live against the sandbox. | Low–medium: only fits if credit or identity is part of the problem. |
| **Capital One Nessie** | $300 Giftogram/person | Mock banking API (accounts, transactions, bills, transfers). Gives the agent a bank to act on, with realistic data. | Low. |
| **Factory Droid SDK** | $2,000 + credits | Droid must do real work in the running product, on a trigger, with scoped permissions and visible plans/diffs. That overlaps "limited access + clean record". E.g. Droid writes a new matching rule as a diff and a human approves it. | Medium: the README must explain where Droid is used. |
| **Apify** | $2k / $1k / $800 / $400 / $400 | Scraping real public data (vendor registries, sanctions lists, SEC filings) makes it "real enough". | Medium. |
| **General: Most Technically Complex / People-First** | Prizes | Automatic consideration. | Free. |

### Waiting on docs (check the Live Site at kickoff)

Atlassian ("Agentic Workforce", promising), Armadin (Security), Elastic,
Bright Data, Convex, Creao (AI-First Disruptor / Team Empowerment,
likely require their platform).

### Eliminated (don't spend time on these)

| Track | Why |
| --- | --- |
| SpaceXAI | Requires building with Cursor + the Grok Imagine/Voice API, space theme |
| Meta | Judged on human connection, which conflicts with finance autonomy |
| Mana.space | Must build *with* Mana and link Mana chats as proof |
| Notability | Needs notes from the first sketch on, and after-the-fact notes score poorly |
| Creao One-Person Company | We're a team |
| Best Solo / Hardware / Planet-First | Not solo, no hardware, not climate |
| Bitdeer, Moss | Compete with our model choice (Claude) or don't fit the theme |
| Visa, Figma | Team decision: cut |
| Cartesia | Team decision: no voice agents |
