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
| **Microsoft: Built for the Real World** ✅ kept (+ Customer Impact Award) | **2 ways to place.** Grand: Surface laptop per member + remote talk at a Microsoft Delta/Frontier Co. FDE tech talk + 1:1 mentorship with senior FDEs. Customer Impact Award: the talk + mentorship (no hardware). | "Production-minded AI agent that solves a meaningful problem in finance…". Criteria: 1) customer understanding, 2) measurable usefulness, 3) path from prototype to production, 4) responsible design, 5) end-to-end functionality. **No Azure requirement stated**; Azure for Students credits are optional. Same evidence Hyphenate wants. | ~Free. Add to README/Devpost: who the customer is (named seat + company), metrics from the planted-error eval (catch rate, false positives, escalations, time saved), a path-to-production section (real bank/ERP swap-in, auth, monitoring, rollout), and responsible design (backend-enforced limits, audit trail, human approval). Customer Impact Award favors real user interviews. |
| **Anthropic** | $5k Claude credits + Max 20x | If Claude is the model. Needs a **named community** and a real problem someone lived. Claude must matter, and we must know where it can go wrong. | Low: pick a narrow user and talk to one. Write up the failure modes. |
| **CRS Credit API** | $1k overall, $500 Best Financial AI Agent, interviews for identity/fraud and most unexpected use | One sandbox for consumer credit reports (soft/hard pull, single or tri-bureau, FICO/VantageScore), **business credit** (a company's debts + state filings), identity verification (KBA, OTP, document, device), public records (bankruptcies, liens, judgments), criminal/eviction, and compliance (**OFAC**, Military Lending Act). JSON API with bearer auth, plus an MCP server (`@crscreditapi/crs-calhacks-mcp-server`). Must be central and run live against the sandbox, using only their test identities. Judges also look at being "open about what it does with data". Our fit: **business credit + OFAC + public records** for vetting new vendors and customers (AP onboarding, AR credit terms). | Low–medium. **Request sandbox access by email first.** |
| **SpacetimeDB** ✅ chosen backend | $2,048 / $1,024 / $512 (**3 places**) | Must be the **core** real-time backend; their criteria name AI agent coordination, live dashboards and financial-style apps. We'll keep the company world in it: ledger, subledgers, inbox, audit trail, simulated clock. Reducers enforce double-entry balance + segregation of duties server-side, so limits live in the backend, not the prompt. Reducers can't make network calls, so the agent loop runs in a **separate worker** that connects as a client, one connection (identity) per seat. Pin one SpacetimeDB version at setup. | ~Free if we need a backend anyway. |
| **Apify** ✅ kept | $2k / $1k / $800 / $400 / $400 | Scraping real public data (vendor registries, sanctions lists, SEC filings) makes it "real enough". | Medium. |
| **General: Most Technically Complex / People-First** | Prizes | Automatic consideration. | Free. |

### Stretch goals (only after the core demo path works end to end)

Never put these on the critical path. Build each one behind an interface the
core works without, so cutting it costs nothing.

| Track | Prize | Plan | Needs |
| --- | --- | --- | --- |
| **Factory Droid SDK** | $2,000 + credits | Droid (Factory's agent harness, headless via the TS/Python SDK) is an automated **finance-systems seat**. When a class of exceptions recurs, Droid writes a new matching/policy rule as a diff; the controller approves; the rule ships. That's Hyphenate's "automated colleague". Track rules: real work in the running product, a trigger we designed, scoped permissions, visible plans/diffs. **The README must explain where and how Droid is used.** | `FACTORY_API_KEY`, `droid` CLI |
| **Capital One Nessie: Best Use of the Nessie API** | $300 Giftogram/person (number of winners unconfirmed) | Capital One's mock bank API, relaunched at **nessieisreal.com** (log in with GitHub to get a key and see `/docs`, `/sdk`, `/examples`; API host `prod-api.nessieisreal.com`). Resources (from their SDKs; confirm in the new docs): customers, accounts, **bills**, **transfers**, **deposits**, withdrawals, **purchases**, **merchants**, ATMs, branches. Map for us: our company = a Nessie customer with checking/savings; vendors = merchants; AP payments = bills/transfers; customer payments = deposits; card spend = purchases. Nessie is the **bank feed**, the source that disagrees with our SpacetimeDB ledger. Build only after the core demo path works; until then the core uses our own simulated bank feed behind the same adapter. | Low: one integration-lane adapter. Risks: it's consumer-shaped (no business accounts, so we label the mapping), a shared sandbox can be slow or down, so record fixtures and keep a stub fallback. Show live calls in the demo where it's safe. |
| **Fetch.ai** (conditional) | $1,250 / $750 / $500 + internship interview; two $250 special prizes | One Python uAgent, e.g. "ask our finance team", registered on Agentverse and chat-enabled for ASI:One. It reads from SpacetimeDB and answers "why?" questions with evidence. The core never depends on it. **Only if the hackpack's rules allow this light build**; if it requires their model or several Fetch agents, cut it. | Hackpack/booth check, Agentverse account, ~3–4 h for one person |
| **Cartesia** (voice) | Meta glasses (TBD) | Voice must be core for this track, so only do it if a voice surface clearly helps. E.g. the controller questions a decision out loud and the agent defends it from the audit trail. Track rules: 2-min demo-first pitch; README with setup, Cartesia features used, known limitations; no keys in repo. | Cartesia API key |

### Eliminated (don't spend time on these)

| Track | Why |
| --- | --- |
| SpaceXAI | Requires building with Cursor + the Grok Imagine/Voice API, space theme |
| Meta | Judged on human connection, which conflicts with finance autonomy |
| Mana.space | Must build *with* Mana and link Mana chats as proof |
| Notability | Needs notes from the first sketch on, and after-the-fact notes score poorly |
| Creao (all three tracks) | One-Person: we're a team. Others: a Creao-built agent must do the core work, which competes with Claude + our backend. Team decision: cut |
| Best Solo / Hardware / Planet-First | Not solo, no hardware, not climate |
| Bitdeer, Moss | Compete with our model choice (Claude) or don't fit the theme |
| Visa, Figma | Team decision: cut |
| Convex | $5k but **one winner only**, and a crowded track. Lost the backend decision to SpacetimeDB (3 places); only one backend can be core |
| Atlassian Agentic Workforce | Team decision: out (Forge app is a separate build) |
| Bright Data | Fewer prizes than Apify (3 vs 5 + Best Actor) and DQs mocked demo data |
| Armadin (Security), Elastic | Team decision: cut |
| Coinbase x402 | Team decision: cut (crypto rails off our finance story, extra deliverables) |
