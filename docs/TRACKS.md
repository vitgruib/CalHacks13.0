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

$8,000 / $5,000 / $3,000, plus expedited interviews for the top 5. **The full
brief, judging criteria, deliverables, resources and our build implications
are in `docs/HYPHENATE.md`.** Read it before building anything.

## Tracks that stack naturally with Hyphenate

Ranked by how much extra work each costs us. Each one requires *meaningful*
use, so only pick tracks that are core to the build. Check whether Devpost
caps the number of tracks per entry.

| Track | Prize | Why it fits | Extra cost |
| --- | --- | --- | --- |
| **Microsoft: Built for the Real World** (+ Customer Impact Award) | Surface laptop per member + FDE talk/mentorship | "Production-minded AI agent… in finance". Its criteria (customer understanding, measurable usefulness, path to production, responsible design, end-to-end) are the same evidence Hyphenate wants. | ~Free: add a "path to production" slide/README section. |
| **Anthropic** | $5k Claude credits + Max 20x | If Claude is the model. Needs a **named community** and a real problem someone lived. Claude must matter, and we must know where it can go wrong. | Low: pick a narrow user and talk to one. Write up the failure modes. |
| **CRS Credit API** | $1k overall, $500 Best Financial AI Agent, interviews for identity/fraud and most unexpected use | Credit, identity, and fraud sandbox with test identities, via API or MCP. It must be central and run live against the sandbox. | Low–medium: only fits if credit or identity is part of the problem. |
| **SpacetimeDB** ✅ chosen backend | $2,048 / $1,024 / $512 | Must be the **core** real-time backend. We'll keep the company world in it: ledger, subledgers, inbox, audit trail, simulated clock. Reducers enforce double-entry balance + segregation of duties server-side, so limits live in the backend, not the prompt. Agents and human approvers subscribe live. | ~Free if we need a backend anyway. |
| **Capital One Nessie** | $300 Giftogram/person | Mock banking API (accounts, transactions, bills, transfers). Gives the agent a bank to act on, with realistic data. | Low. |
| **Factory Droid SDK** | $2,000 + credits | Droid is Factory's agent harness (like Claude Code), runnable headless from our code via the TS/Python SDK. The track wants it doing real work in the running product, on a trigger, with scoped permissions and visible plans/diffs. Our fit: one automated **"finance-systems" seat**. When a class of exceptions recurs, Droid writes a new matching/policy rule as a diff; the controller approves; the rule ships. That's the "automated colleague" Hyphenate describes. | Medium: needs a `FACTORY_API_KEY` + `droid` CLI, and the README must explain where Droid is used. **Stretch lane, after the core works.** |
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
| Cartesia | Team decision: no voice agents (for now) |
