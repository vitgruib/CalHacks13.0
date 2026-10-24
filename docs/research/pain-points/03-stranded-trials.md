# 03. Patients stranded in defunded clinical trials

**Status:** stretch (team decision 2026-10-23: hard to build well; keep for later)
**One-liner:** When a grant is cut, a medical study can stop with real
patients mid-treatment, and there's no standard way to hand the study to a
new funder.

## What happens (plain language)
Research grants often pay for clinical trials. When funding stops, the trial
can stop too, and the people most affected (participants) aren't party to
the funding deal.

## Everyday analogy
Insurance cancelled while you're in the hospital, and nobody is responsible
for moving you to a new plan.

## Evidence
- 383 of 11,008 NIH-funded trials (3.5%) lost funding between 2025-02-28 and
  2025-08-15, affecting 74,311 participants; 43 were "active, not recruiting";
  infectious disease hit hardest (14.4%). Patel, Liu & Jena, *JAMA Internal
  Medicine*, 2025-11-17, DOI 10.1001/jamainternmed.2025.6088. [agent-reported:
  numbers taken from coverage + a same-issue commentary, not the paper itself]
  https://www.cidrap.umn.edu/public-health/nih-grant-terminations-disrupt-hundreds-clinical-trials-affecting-more-74000
  · https://www.ajmc.com/view/nih-grant-terminations-disrupt-1-in-30-clinical-trials-impacting-over-74-000-participants
  · https://jamanetwork.com/journals/jamainternalmedicine/article-abstract/2840939
- ClinicalTrials.gov examples (checked via API v2): NCT06225297 (suspended by
  foreign-aid executive order, 4,600 enrolled), NCT06215664 (NIH grant
  terminated, 28 enrolled), NCT07017595 ("no longer meets agency priorities").
  58 trials updated since 2025 cite NIH/USAID/federal funding in the stop
  reason; 1,000+ cite funding generally. [verified]

## Quotes
- "We were hoping to continue to follow up with these babies all the way into their adulthood," — Dani Dumitriu, Columbia, AP via ClickOnDetroit, 2025-03-26 — [agent-reported]
- Harvard's Sarah Fortune on research macaques possibly being euthanized; Boston Globe on labs culling mice to save ~$1.40/cage/day — [unverified]

## What our product does about it (if built)
Pull funding-stopped trials from ClinicalTrials.gov, link to the NIH grant,
and match to foundations that fund that disease area (via 990 data, see 04).

## Gaps / caveats
- Read the JAMA paper itself before quoting numbers on a slide.

## Corrections
- 2026-10-24 (@ethan/claude-evidence): CIDRAP's article was opened and states
  383 trials, "Of 11,008 ongoing trials, 3.5% lost funding", "more than
  74,000 enrolled participants", Feb 28 to Aug 15, 2025. Those numbers are
  now [verified] against CIDRAP's coverage; the JAMA letter itself is still
  paywalled (citation: JAMA Intern Med 2026;186(1):126–128).
