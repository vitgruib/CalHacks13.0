# Track B: manual setup and links (@nathan)

What only a person can do for `agents/`. Real keys go in `.env.local`
(repo root, git-ignored) and get shared by DM, never here.

## Checklist

- [x] Anthropic API key in `.env.local` as `ANTHROPIC_API_KEY`
- [x] Apify token in `.env.local` as `APIFY_TOKEN`
- [x] SpacetimeDB CLI 2.13.0 installed (`spacetime --version`)
- [x] Env names in `.env.example` (T33): it lists `ANTHROPIC_API_KEY`, `APIFY_TOKEN`, `GG_DB`, `GG_LIVE_SOURCES` and points to `agents/README.md#environment`, which documents the rest. Full set for reference:
  `ANTHROPIC_API_KEY`, `APIFY_TOKEN`, and the optional agent settings `GG_DB` (local | spacetime),
  `GG_CLAUDE` (cached | live | offline | off), `GG_MODEL`, `GG_CLAUDE_CACHE_DIR`, `GG_CACHE_DIR`,
  `GG_SOURCES` (live | offline), `GG_LIVE_SOURCES` (1 = read RePORTER/USAspending in `npm start`),
  `GG_CONTACT_EMAIL` (sent to Crossref/NCBI as the polite-pool contact), `GG_STATE_DIR`, `GG_SPACETIME_DB`
- [ ] Set `ANTHROPIC_API_KEY` on the Azure VM (T26, @ethan's `deploy/agent-worker/`)
- [ ] Make the Apify Actor public: first set a public profile in https://console.apify.com → Settings → Account, then the Actor's page → Publication → Publish
- [ ] `git config rebase.autoStash true` in each clone, on both machines
- [ ] T28 researcher-screen design in `web/` (delegated by @ethan; outside Track B)
- [ ] Product call for Track A: draft a payment request for a month on a grant that has since ended (a closeout claim)? Today an ended grant counts as frozen and is skipped
- [ ] Someone owns T20 (Devpost draft by Sat night, demo script, backup video)
- [ ] Does the Azure VM have `APIFY_TOKEN`? Only needed if the VM worker should read the cancellation list live (`agents/src/sources/cancellations.ts`); without it the worker uses the saved copy, which is fine for the demo
- [x] Pick the real NIH grants to seed from (done in T30)
- [ ] Run `npm --prefix server run dev` once and confirm it publishes `grantguard`

## Demo cautions

- Don't run the agent worker against maincloud from the laptop. The Azure VM has to claim the three agent seats.
- Until T32's purchasing fix lands, don't click Approve on a purchase in the Inbox while grant A (R01GM061721) is still frozen; it gets stuck as blocked. The climax works in either order: inject the payment, and "Pick this source" on the disagreement.

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
