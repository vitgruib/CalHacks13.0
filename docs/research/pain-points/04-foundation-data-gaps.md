# 04. Replacement money is years stale and doesn't name the lab

**Status:** core
**One-liner:** Labs that lose federal money turn to foundations, but the
public data on what foundations fund is 1–3+ years old, doesn't say which
researcher got the money, and names institutions inconsistently.

## What happens (plain language)
Foundations report grants on IRS tax forms (990 / 990-PF). Those become
public long after the fact, list the receiving *organization* (not the lab,
person or project), have thin descriptions, and spell the same university
dozens of ways. Federal data, by contrast, is weekly and topic-coded. The
money is moving toward the sources with the worst information.

## Everyday analogy
Job hunting with a list of companies that hired people three years ago,
without knowing which roles they filled.

## Evidence
- Form 990 Schedule I (public charities) lists recipient name, address,
  **EIN**, amount, purpose for grants > $5,000. [verified] https://www.irs.gov/instructions/i990si
- Form 990-PF (private foundations) lists name, address, status, amount; EIN
  apparently not required (not confirmed against current instructions). [verified sample form]
  https://webharvest.gov/peth04/20041019065003/http:/www.irs.gov/pub/irs-utl/sample990pf.pdf
- **Neither form identifies the researcher, lab or project.** [verified, both forms]
- Candid: grant descriptions from filings "are often sparse"; grant lists sometimes missing. [verified] https://blog.candid.org/?p=3209
- Lag: 14–18 months before 2020; "well over 36 months" for tax year 2019
  onward (Candid, 2022); only 76% of 2019 990-PF filings posted (Aspen).
  Sources from 2022–23; nothing newer found. [verified]
  https://blog.candid.org/?p=9850 · https://www.aspeninstitute.org/blog-posts/nonprofit-data-collective-members-submit-comments-to-the-irs/
  · https://johnsoncenter.org/blog/irs-delays-and-other-barriers-to-data-mean-real-risks-for-nonprofits/
- NIH RePORTER updates weekly; bulk ExPORTER files went annual Oct 2021, API stays current. [verified]
  https://report.nih.gov/node/921
- One institution can appear "hundreds of ways" (CASRAI); ROR keeps up to 15
  name variants per institution across 120 languages. [verified]
  https://casrai.org/wp/?p=1197 · https://ror.org/blog/2022-08-31-name-metadata-in-ror/
- Foundation topic codes in Candid data are optional. [verified] https://data.candid.org/docs/identifying-grants
- (Contrast) NIH already topic-codes its grants with RCDC (300+ categories,
  text mining, admits some misclassification). So **AI classification matters
  most for foundation data**, not NIH. [verified] https://report.nih.gov/node/102

## Quotes
- "it's clear that private foundations cannot pick up the slack." / "foundations don't fund continuously: Once you have proven something, it's not high risk anymore." — Mark Raizen, UT Austin, Physics Today, 2026-02-10 — [agent-reported] https://physicstoday.aip.org/news/philanthropies-selectively-mitigate-damage-from-lost-federal-science-funding
- "Researchers are looking more desperately for opportunities." — David Kaplan, Johns Hopkins, same article — [agent-reported]
- "We couldn't put a finger in the dike for all of the need." — Andrew Feig, Research Corporation for Science Advancement (a funder), same article — [agent-reported]
- "We are looking for private funding to fill gaps but that comes with other issues." — r/NIH, 2026-04-10 — [agent-reported] https://www.reddit.com/r/NIH/comments/1sh8is2/comment/ofb47q2/
- "One doesn't replace the other," — JoonHyung Cho, University of Minnesota, Post Bulletin, 2025-04-26 — [agent-reported] https://www.postbulletin.com/health/federal-research-dollars-are-being-pulled-can-foundations-businesses-fill-the-gap-for-minnesota-scientists
- "consider repurposing your proposal to private, non-NIH sources of funding." — r/labrats, advice to a student whose F31 was cancelled, 2025-05-05 — [scrape] https://www.reddit.com/r/labrats/comments/1kfh293/comment/mqqojba/

## What our product does about it
"Funder X-ray": parse 990 Schedule I / 990-PF grant lists (ProPublica
Nonprofit Explorer API), normalize recipient names to ROR IDs, have the LLM
classify the sparse purpose text into topics, and match a lab's lost grant to
foundations that have funded similar work, citing the filing line behind
each match.

## Gaps / caveats
- Lag figures are 2022–23; IRS processing may have improved since.
