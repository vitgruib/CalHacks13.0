# Human TODO

Things agents can't do. Put your name next to one when you take it. Done
items are removed; what landed is in `PROGRESS.md`.

## Submission (required to be judged; deadline Sun 10/25 9:00 AM)

Unassigned, outside the tracks. Someone must own this. Prep is in
`docs/submission/`: booth sheet, interview guide and outreach drafts
(`INTERVIEW-KIT.md`, fill `[email]`/`[phone]` before sending), Devpost text
(`DEVPOST-DRAFT.md`), demo and video script (`DEMO-SCRIPT.md`).

- [ ] Devpost draft submitted Sat night, then keep editing it
- [ ] Record the backup video. It **opens with the moment**, and includes the one line on seats and a real-vs-simulated + how-we-know section
- [ ] Interview one or more PIs or research administrators and quote them in the Devpost (Anthropic track, Microsoft Customer Impact Award)
- [ ] Hyphenate booth: does a grant office count as a finance team?
- [ ] Docket-check *Thakur v. Trump* (MASTER-PLAN §10) before it goes in the video or on a slide
- [ ] Ask #ask-directors or their booths how to enter Anthropic and SpacetimeDB (not on the Devpost prize list)
- [ ] Check the Devpost form for a cap on prizes per entry; are Cal Hacks general prizes opt-in? MLH Commit Fellowship (supplemental form)?
- [ ] Enter Apify Best Actor? Needs the Actor made public (below)

## Setup and deploys

- [ ] @nathan: make the Apify Actor `nathanqiu/nih-grant-cancellation-list` public. Apify needs the owner to have a **public profile** first (console → Settings → Account), then the Actor's page → Publication → "Publish to Store". Store text is ready in `scrapers/.actor/README.md`. First cloud run: 5,635 grants, dataset `stCRB7mY0IZwpzk6M`; set `GG_APIFY_DATASET` in `.env.local` to have a local tracker read it
- [ ] Delete or fix the duplicate Vercel project `cal-hacks13-0` (no env vars, shows offline data). The real one is https://calhacks130.vercel.app
- [ ] Optional: `APIFY_TOKEN` on the Azure VM, only if the hosted worker should read the cancellation list live (it uses the saved copy otherwise, which is fine for the demo)
- [ ] Product call for Track A: draft a payment request for a month on a grant that has since ended (a closeout claim)? Today an ended grant counts as frozen and is skipped

## Reference

**Agent worker (Azure VM, T26):** `ssh -i ~/.ssh/grantguard_azure azureuser@20.98.65.44` (key on @ethan's Mac); logs: `journalctl -u grantguard-agents -f`. Its three identities own the agent roles on maincloud, so nobody else runs the worker against maincloud (it would be refused). Pushes touching `agents/`, `server/` or `sim/` update it automatically.

**Dashboards** (watch Claude spend after long runs):

| What | Link |
|---|---|
| Anthropic keys, billing, limits | https://console.anthropic.com/settings/keys, `/billing`, `/limits` |
| Apify token, usage | https://console.apify.com/settings/integrations, https://console.apify.com/billing |
| SpacetimeDB install, docs | https://spacetimedb.com/install, https://spacetimedb.com/docs |
