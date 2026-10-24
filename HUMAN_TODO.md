# Human TODO

Things agents can't do. Put your name next to one when you take it.

- [x] Fill in AGENTS.md §0 at kickoff (idea, demo path, stack, check cmd, deadline) — @nathan: idea, demo path, contract done; version, run and check commands come with T2
- [ ] Everyone: run the one-time setup in README.md
- [ ] Get API keys, share them out-of-band (not in git), and list their names in `.env.example`
- [ ] Attend the Hyphenate workshop **Fri 7 PM** (in person). Then visit their booth to ask what exceptions make our chosen corner hard, and note the answers in `docs/HYPHENATE.md`
- [x] Pick the idea from `docs/IDEAS.md` and log it in `DECISIONS.md` — @nathan: GrantGuard, see `docs/MASTER-PLAN.md`
- [ ] @suhu: install the SpacetimeDB CLI on every machine once T2 pins the version
- [ ] @nathan: Anthropic API key and Apify account, shared out of band, names in `.env.example`; pick the 2 real NIH grants to seed from
- [x] @nathan: publish the T15 Actor to Apify: done by @ethan/claude 10/24 with the token in `.env.local`, as **private** Actor `nathanqiu/nih-grant-cancellation-list` (built via the API; `apify login` + `apify push` also works). First cloud run: 5,635 grants, dataset `stCRB7mY0IZwpzk6M`. To have the tracker read the cloud copy, add `GG_APIFY_DATASET=stCRB7mY0IZwpzk6M` to `.env.local` (not set yet; it reads `scrapers/out/cancellations.json` otherwise). Make it public only if we enter Apify Best Actor (open item below)
- [ ] @nathan: make the Actor public (team said go, 10/24): Apify requires the owner to have a **public profile** first (console → Settings → Account → set a public username/profile). Then tell @ethan/claude, or in the Actor's page → Publication → "Publish to Store". Store page text is ready (`scrapers/.actor/README.md`, categories set in the publish request)
- [ ] @nathan: add the agents' variable names (no values) to `.env.example`: the list is in `docs/TRACK-B-MANUAL.md` (agents can't open `.env*` files in this setup)
- [ ] **The agent worker runs on an Azure VM (T26): `ssh -i ~/.ssh/grantguard_azure azureuser@20.98.65.44` (key on @ethan's Mac), logs: `journalctl -u grantguard-agents -f`. Its three identities own the agent roles on maincloud, so nobody else should run the worker against maincloud (it would be refused). Pushes touching `agents/`, `server/` or `sim/` update it automatically.** Was: @nathan (decide): where the agent worker runs for the live demo. Default: your MacBook, `GG_DB=spacetime GG_SPACETIME_URI=wss://maincloud.spacetimedb.com npm --prefix agents start`, left running through judging. The first run registers the three agents on maincloud's `grantguard` and binds them to tokens kept only on that machine (`agents/.state/maincloud.spacetimedb.com-grantguard/`). The PC can't take those seats unless you copy that folder over out of band (it's credentials) or @ethan republishes with `--reset`
- [ ] **Unassigned, outside the tracks (presentation and submission):** Hyphenate booth (does a grant office count as a finance team?); interview one PI or research administrator; record the video; submit Devpost. Required to be judged, so someone must own this by Sat evening
  - Prep is in `docs/submission/`: booth sheet + interview guide + outreach drafts (`INTERVIEW-KIT.md`, fill `[email]`/`[phone]` before sending), Devpost text (`DEVPOST-DRAFT.md`), demo + video script (`DEMO-SCRIPT.md`)
  - Open: Anthropic and SpacetimeDB aren't on the Devpost prize list; ask #ask-directors or their booths how to enter
  - Open: enter Apify Best Actor (means publishing the T15 scraper as a public Actor)? MLH Commit Fellowship (supplemental form)? Are Cal Hacks general prizes opt-in?
  - Open: check the Devpost submission form itself for a cap on prizes per entry (the event page doesn't say)
  - Open: docket-check *Thakur v. Trump* (MASTER-PLAN §10) before it goes in the video or on a slide
- [ ] Check whether Devpost caps the number of tracks per entry. Read the Fetch.ai hackpack (or visit their booth) and confirm the minimum build when they're posted
- [ ] Get sponsor sandbox keys we'll use (Nessie, model API, `FACTORY_API_KEY` if we do Droid)
- [ ] SpacetimeDB: pin one version (likely stable 1.x) and install the `spacetime` CLI on every machine
- [ ] If going for Anthropic: talk to 1–2 real people in the named community and write down what they said
- [ ] Sat night: Devpost draft submitted
- [ ] Demo video **opens with the moment**. Write the one line on seats, plus a real-vs-simulated + how-we-know section
- [x] Deploy + get the public demo URL: https://calhacks130.vercel.app (Vercel, vitgruib's account; module on maincloud, @ethan's login). Left: delete or fix the duplicate Vercel project `cal-hacks13-0` (no env vars, shows offline data)
- [ ] Write the demo script, record the video, submit on Devpost
- [ ] Microsoft: interview 2–3 people who do the chosen finance seat (venue, Slack, friends) and quote them in the Devpost; this feeds Customer Understanding and the Customer Impact Award (and Anthropic)
- [ ] Nessie: log in at nessieisreal.com with GitHub, get an API key into `.env.local`, confirm the endpoints in `/docs`, and ask the Capital One booth how many winners there are and what "best use" means to them
