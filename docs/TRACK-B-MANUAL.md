# Track B: manual setup and links (@nathan)

What only a person can do for `agents/`. Real keys go in `.env.local`
(repo root, git-ignored) and get shared by DM, never here.

## Checklist

- [x] Anthropic API key in `.env.local` as `ANTHROPIC_API_KEY`
- [x] Apify token in `.env.local` as `APIFY_TOKEN`
- [x] SpacetimeDB CLI 2.13.0 installed (`spacetime --version`)
- [ ] Add these names (no values) to `.env.example` and push (agents can't read that file here):
  `ANTHROPIC_API_KEY`, `APIFY_TOKEN`, and the optional agent settings `GG_DB` (local | spacetime),
  `GG_CLAUDE` (cached | live | offline | off), `GG_MODEL`, `GG_CLAUDE_CACHE_DIR`, `GG_CACHE_DIR`,
  `GG_SOURCES` (live | offline), `GG_LIVE_SOURCES` (1 = read RePORTER/USAspending in `npm start`),
  `GG_CONTACT_EMAIL` (sent to Crossref/NCBI as the polite-pool contact), `GG_STATE_DIR`, `GG_SPACETIME_DB`
- [ ] DM the Apify token to @ethan (T15 scraper)
- [ ] Pick the 2 real NIH grants to seed from, log the pick in `DECISIONS.md`, tell @ethan (T8)
- [ ] Run `npm --prefix server run dev` once and confirm it publishes `grantguard`

## Dashboards

| What | Link |
|---|---|
| Anthropic API keys | https://console.anthropic.com/settings/keys |
| Anthropic billing / credits | https://console.anthropic.com/settings/billing |
| Anthropic spend limits | https://console.anthropic.com/settings/limits |
| Apify token | https://console.apify.com/settings/integrations |
| Apify usage / billing | https://console.apify.com/billing |
| SpacetimeDB install | https://spacetimedb.com/install |
| SpacetimeDB docs | https://spacetimedb.com/docs |

Watch spend: the agents call Claude in a loop, so check usage after each
long run.

## Grant lookups (for picking the seed grants)

| Source | Link | What to check |
|---|---|---|
| NIH RePORTER | https://reporter.nih.gov | Search by project number; status and award amounts per fiscal year |
| USAspending | https://www.usaspending.gov/search | Whether the award still shows as active |
| HHS TAGGS | https://taggs.hhs.gov | HHS list of terminated grants |

Candidates from earlier research (not re-verified):

- **R01AI181732**: UCSF Doxy-PEP study, about $1.6M, terminated 2025-03-18
  and on the HHS cancellation list. Fits the "grant canceled, spending
  freezes" opening.
- **R01HD115985**: USAspending shows it active, while the HHS list shows it
  terminated. A sources-disagree example.
- **R01HL174472**: suspended in the *Thakur v. Trump* case, but missing from
  the HHS cancellation list.
- **R01DE030445**: award amount differs by about $71K between sources.

Recommended pick: R01AI181732 + R01HD115985.

## Deadlines

- Sat night: Devpost draft up
- Sun 10/25 7:00 AM: feature freeze
- Sun 10/25 9:00 AM: Devpost deadline
