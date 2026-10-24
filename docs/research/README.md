# Research: grant-funding pain points + evidence

Evidence base for the grant-funding idea (see `docs/IDEAS.md`): what hurts,
who says so, and the source for every claim. **Agents: read this file before
citing, adding to, or building on anything in this folder.**

Researched 2026-10-23. Things move fast in this space; re-check anything
time-sensitive (court cases, agency policy) before putting it on a slide.

## Layout

```
docs/research/
  README.md            ← you are here: rules + index
  pain-points/NN-*.md  ← one file per pain point (the thing to read)
  visa-pipeline.md     ← how automated purchasing via Visa/Stripe would work
  sources/
    docs/*.txt         ← text extracted from primary PDFs (audits, surveys, letters)
    reddit/*.txt       ← raw Reddit scrapes (Apify), verbatim post/comment text
    devpost-scan.txt   ← prior-art scan of Devpost projects
```

## Index

Status: **core** = the team picked it; **stretch** = keep for later;
**new** = found in the 2026-10-23 sweep, not yet discussed with the team.

| # | Pain point (plain language) | Status | Feeds which feature |
|---|---|---|---|
| [01](pain-points/01-no-source-of-truth.md) | Nobody has a complete, consistent list of which grants were cut | core | aggregation / reconciliation |
| [02](pain-points/02-status-reversals.md) | "Terminated" can be reversed by courts; status is never final | core | status timeline |
| [03](pain-points/03-stranded-trials.md) | Patients stranded in defunded clinical trials | **stretch** | trial rescue matching |
| [04](pain-points/04-foundation-data-gaps.md) | Replacement (foundation) money is years stale and doesn't name the lab | core | funder matching |
| [05](pain-points/05-overhead-mismatch.md) | A foundation dollar ≠ a federal dollar (overhead caps) | core | apples-to-apples comparison |
| [06](pain-points/06-awarded-vs-paid.md) | Amount awarded ≠ money actually paid; frozen funds | core | burn / balance tracking |
| [07](pain-points/07-balance-visibility-admin-burden.md) | PIs can't see trustworthy grant balances; 44% of time on admin | new | real-time balances |
| [08](pain-points/08-unallowable-purchases-audits.md) | Unallowable / end-of-award / P-card purchases keep failing audits | new | **purchase guardrails (Visa)** |
| [09](pain-points/09-erp-outages.md) | University finance-system rollouts freeze purchasing & billing | new | reconciliation |
| [10](pain-points/10-drawdown-justification.md) | Every federal drawdown now needs a written justification | new | **auto-justification from purchase data** |
| [11](pain-points/11-award-limbo-backlogs.md) | Awards stuck in "administrative review" / year-long backlogs | new | status tracking |
| [12](pain-points/12-workforce-loss.md) | Layoffs, lost postdocs, expertise that doesn't come back | new | (impact framing) |
| [13](pain-points/13-keyword-screening.md) | Fear of keyword-based termination; self-censoring grants | new | (context only) |
| [14](pain-points/14-application-treadmill.md) | Labs submit far more applications just to survive | new | funder matching |

Strongest combined story for judges: **01 + 02 + 06** (the data is a mess),
**04 + 05** (the replacement money is hard to find and compare), and
**08 + 10** (the Visa purchasing pipeline that keeps spending compliant and
writes its own paperwork).

## Rules for agents working in this folder

### Evidence standard (non-negotiable)

1. **Every claim needs a source URL.** No URL → it doesn't go in.
2. **Quotes are verbatim.** Copy exact text. Never paraphrase inside quote
   marks, never stitch two sentences together, never "clean up" grammar.
3. **Attribute by role, not by private name.** News-quoted people and public
   figures: name + affiliation. Reddit/forums: role only ("r/NIH, self-described
   PI"), never the username.
4. **Tag every quote and number with a verification level:**
   - `[verified]` — you (or a prior agent) opened the primary source and saw it.
   - `[scrape]` — verbatim text is in `sources/reddit/*.txt` (grep-able).
   - `[agent-reported]` — a research agent reported it from a page it opened,
     but the raw text isn't saved here. Re-verify before using on a slide.
   - `[unverified]` — seen only in a search-result summary. Never put on a slide.
5. **Never fabricate.** If you can't find evidence for something the team
   wants to say, write "no evidence found" — that is a useful result.
6. **Flag interested sources** (vendors, plaintiffs' law firms, advocacy
   groups) and **dates** (anything older than ~2 years).
7. **Corrections beat silence.** If new evidence contradicts a file, fix the
   file and add a `## Corrections` note saying what changed and why.

### Adding a pain point

1. Copy the template below to `pain-points/NN-short-slug.md` (next free number).
2. Add a row to the Index table above.
3. Save any raw material you scraped/extracted under `sources/` (text, not
   giant PDFs) and reference it by path.
4. Commit with `docs(research): …` and push, per the repo's `AGENTS.md`.

### Adding evidence to an existing pain point

Append to its `## Evidence` / `## Quotes` sections with a tag and URL. If you
upgrade something from `[agent-reported]`/`[unverified]` to `[verified]`,
change the tag in place.

### Verifying an `[agent-reported]` Reddit quote

`grep -rF "<distinctive phrase>" docs/research/sources/reddit/` — if it hits,
retag `[scrape]`. If not, open the comment URL (Reddit blocks plain fetches;
the Apify actor `harshmaur/reddit-scraper` worked) and save the text.

### Tools that worked / didn't (save yourself time)

- Reddit: WebFetch/WebSearch blocked; **Apify `harshmaur/reddit-scraper`** works.
- Devpost: HTML 403s; JSON at `https://devpost.com/software/search.json?query=…&page=N`
  works but rate-limits (429) — back off ~20 s.
- Government PDFs: WebFetch can't parse; download and run `pdftotext`.
- Open data APIs (no key needed): ClinicalTrials.gov v2, NIH RePORTER,
  NSF Awards, ProPublica Nonprofit Explorer.

### Template

```markdown
# NN. <Pain point in plain words>

**Status:** core | stretch | new
**One-liner:** <what hurts, for whom, in one sentence a judge gets>

## What happens (plain language)
## Everyday analogy
## Evidence
- <fact> — [tag] <source URL> (<date>)
## Quotes
- "<verbatim>" — <role/name>, <outlet>, <date> — [tag] <URL>
## What our product does about it
## Gaps / caveats
```
