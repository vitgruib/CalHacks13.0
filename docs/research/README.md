# Research: pain points and evidence

The evidence behind GrantGuard: what hurts, who says so, and a source for
every claim. **Read this file before citing, adding to, or building on
anything in this folder.** Judge-facing summary with as-of dates:
[`docs/submission/IMPACT-EVIDENCE.md`](../submission/IMPACT-EVIDENCE.md).

Researched 2026-10-23 and 2026-10-24. Re-check anything time-sensitive
(court cases, agency policy) before putting it on a slide.

## Layout

```
docs/research/
  README.md            ← you are here: index, planted-error precedents, rules
  pain-points/NN-*.md  ← one file per pain point
  sources/
    docs/*.txt         ← text extracted from primary PDFs (audits, surveys, letters)
    reddit/*.txt       ← raw Reddit scrapes (Apify), verbatim
    devpost-scan.txt   ← prior-art scan of Devpost projects
```

## Pain points

Numbers 03 to 05 and 11 to 14 were about features we cut (replacement
funders, clinical trials, and weaker leads); they were deleted and remain in
git history.

| # | Pain point | Status | GrantGuard feature (`docs/MASTER-PLAN.md`) |
|---|---|---|---|
| [01](pain-points/01-no-source-of-truth.md) | Nobody has a complete, consistent list of which grants were cut | core | Fund tracker: sources that disagree (§3.1) |
| [02](pain-points/02-status-reversals.md) | A court can reverse "terminated"; status is never final | core | Fund tracker: status timeline, the freeze (§3.1) |
| [06](pain-points/06-awarded-vs-paid.md) | Amount awarded isn't money paid; frozen funds | core | Fund tracker: truly available money (§3.1) |
| [07](pain-points/07-balance-visibility-admin-burden.md) | PIs can't see trustworthy balances; 44% of time on admin | core | Fund tracker, researcher portal |
| [08](pain-points/08-unallowable-purchases-audits.md) | The same purchase mistakes keep failing audits | core | Spending rules (§3.2) |
| [09](pain-points/09-erp-outages.md) | Finance-system rollouts freeze purchasing and billing | supporting | Context only |
| [10](pain-points/10-drawdown-justification.md) | Every federal drawdown needs a written justification | core | Payment request writer (§3.4) |

## Planted mistakes and their real precedents

The sim's planted mistakes (`sim/answer-key.json`, `sim/README.md`) copy
real audit findings, so the answer key isn't invented.

| Planted mistake | Real precedent |
|---|---|
| Supplies bought in the grant's last 90 days | NSF-OIG audits of WVU (22-1-010) and Delaware (19-1-011) |
| Unallowable purchase-card item | NSF-OIG audit of UC Davis (17-1-002) |
| Shared cost charged 100% to one grant | NSF-OIG capstone 22-6-002 (55% of audits) |
| Charge on the wrong grant, corrected late (over 90 days) | WashU Single Audit 2023-001 |
| Grant active in one source, terminated in another | Grant Witness RePORTER/TAGGS mismatches |

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

**Status:** core | supporting
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
