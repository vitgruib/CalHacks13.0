# 02. A "cancelled" grant might not stay cancelled

**Status:** core
**One-liner:** Courts have ordered cancelled grants restored, appeals can
flip that again, and money doesn't necessarily follow the order, so no grant
status is ever final.

## What happens (plain language)
A lab gets a termination notice, winds down, then a court orders the grant
reinstated. Maybe the money arrives, maybe in installments, maybe an appeal
reverses it. Databases flag/unflag grants for unrelated reasons too.

## Everyday analogy
A store refund that a judge might reverse months later, with no clear record
of whether you were charged to begin with.

## Evidence
- *Thakur v. Trump*: class action filed 2025-06-04; 2025-06-23 class-wide
  preliminary injunction reinstating EPA/NSF/NEH grants to UC researchers;
  Ninth Circuit refused a stay 2025-08-21; expanded to DOD/DOT/NIH in Sept
  2025. Final outcome not found. [verified] (source is plaintiffs' firm)
  https://www.fbm.com/linda-sobczynski-gilleran/news/ninth-circuit-denies-federal-governments-attempt-to-stay-reinstatement-of-university-of-california-research-grants/
  · https://www.fbm.com/linda-sobczynski-gilleran/news/thakur-v-trump-defending-the-rule-of-law/
- Grant Witness infers termination/reinstatement from a status flag being
  added/removed and reviews each change by hand, because flags change for
  unrelated reasons. [verified] https://grantwitness.org/nih/updates/methodology
- 362 court-reported reinstatements removed because they were never detected
  as terminated. [verified] https://grantwitness.org/nih/updates/2026-01-30-remove-court-reported-no-termination-date

## Quotes
- "It's great news, but a weird twist," / "After five-plus months of uncertainty, we were moving on," / "It's hard to scramble it all back together." — Ethan Moitra, Brown researcher, Boston Globe, 2025-08-03 — [agent-reported] https://www.bostonglobe.com/2025/08/03/metro/nih-grant-cuts-restored/
- "My confidence in future federal funding for this research remains shaken," — John Pachankis, Yale, same article — [agent-reported]
- "it's important, given the complexities, to make sure these things go from a court order to reality." — Nancy Krieger, Harvard Chan School, 2025-08-07 — [agent-reported] https://hsph.harvard.edu/news/after-some-federal-funds-restored-researchers-struggle-to-restart-projects
- "Our team is mixed. Some believe an appeals court could reverse lower court decision to reinstate grants. IDK what is real anymore." — r/AskAcademia, NEH grantee, 2026-07-17 — [scrape] https://www.reddit.com/r/AskAcademia/comments/1t6xkif/comment/oy4oph4/
- "I won't believe it until ALL the funding has been disbursed" — r/AskAcademia, NEH grantee, 2026-07-17 — [scrape] https://www.reddit.com/r/AskAcademia/comments/1t6xkif/comment/oy4plgs/
- "Even if it's not appealed, it's not obvious this ruling requires they pay funds." — r/AskAcademia, 2026-05-08 — [scrape] https://www.reddit.com/r/AskAcademia/comments/1t6xkif/comment/oklkmg8/
- "It's kind of wild the number of press releases reporting the judge ordered the funds be paid." — r/AskAcademia, 2026-05-09 — [scrape] same thread (comment okrpbll)
- "A lot of what got funded FY25 was essentially rearranging deck chairs on Titanic by trying to figure out how to spend money from canceled vs reinstated awards..." — r/NIH, self-described NIH-side staff, 2025-11-12 — [scrape] https://www.reddit.com/r/NIH/comments/1oqwz71/comment/nojbegh/
- "You can't just put these projects on hold and think that you can get back to it later." — Michael Paasche-Orlow, Tufts Medical Center, GBH, 2025-08-22 — [agent-reported] https://www.wgbh.org/news/local/2025-08-22/scientists-research-again-in-limbo-as-supreme-court-rules-800-million-in-funding-can-be-paused

## What our product does about it
Model grant status as a **timeline of events** (awarded → terminated →
court-ordered reinstatement → funds actually disbursed), each with its source,
rather than a single status field. Show "ordered" vs "paid" separately.

## Gaps / caveats
- Court sources are mostly the plaintiffs' law firm; check docket for current status.
