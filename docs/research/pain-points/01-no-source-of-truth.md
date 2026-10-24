# 01. Nobody has a complete list of which grants were cut

**Status:** core
**One-liner:** When the government cancels research grants, the official
lists disagree, get quietly edited, or stop updating, so nobody (including
the researchers) reliably knows what was cut.

## What happens (plain language)
You'd expect one official list. Instead there are several, they don't match,
and some cancellations appear on none of them. Volunteer trackers (Grant
Witness) ended up doing the record-keeping.

## Everyday analogy
Two bank statements that disagree, one of which stopped updating, and some
charges that appear on neither.

## Evidence
- About 300 terminated NIH grants appeared in only one of NIH's two official
  sources (RePORTER vs HHS TAGGS). [verified] https://grantwitness.org/nih/updates/2025-05-20-700-new-terminations
- HHS stopped posting new terminations to TAGGS and removed some existing
  entries. [verified] same source + https://grantwitness.org/nih/updates/methodology
- 40+ terminations reported by researchers appeared on no official list. [verified] methodology page above
- Terminations in RePORTER can't be searched and aren't exposed in its API. [verified] methodology page above
- Grant Witness removed 362 grants it had listed as terminated: they came from
  court reinstatement orders but were never detected as terminated. [verified]
  https://grantwitness.org/nih/updates/2026-01-30-remove-court-reported-no-termination-date
- NSF hasn't updated its public termination list since June 2025. [verified]
  https://grantwitness.org/nsf/updates/2026-05-27-new-nsf-terminations
- Termination counts differ by source/date, e.g. NSF ~1,425 (Nature, May 2025)
  vs ~1,752 (later compilation). Weak on its own (different dates). [verified]
  https://www.nature.com/articles/d41586-025-01396-2 · https://fundinglandscape.com/answers/nsf-grants-guide-2026

## Quotes
- "the government was putting forth information about which grants it terminated. They stopped doing that." — Scott Delaney, Harvard research scientist, Grant Watch co-creator, STAT, 2025-05-27 — [agent-reported] https://www.statnews.com/2025/05/27/nih-cuts-tracked-in-grant-watch-database-q-and-a-with-harvard-researcher-scott-delaney/
- "they remove it from any federal database and from any other record any indication that it was terminated" / "there is no record that that grant was ever terminated in the first place" — Scott Delaney, same article — [agent-reported]
- "Is there any news about this? Any way to find out what grants were terminated? Is it only SAMHSA?" — r/publichealth commenter, 2026-01-14 — [agent-reported] https://www.reddit.com/r/publichealth/comments/1qco3yd/comment/nzjm9yp/
- "I haven't seen anything publicly, the termination emails came from SAMHSA." — r/publichealth, self-described SAMHSA grantee, 2026-01-14 — [agent-reported] https://www.reddit.com/r/publichealth/comments/1qco3yd/comment/nzjq7j4/
- "I applied for and was awarded a grant that very likely has been terminated by the current US administration." — r/AskAcademia, self-described grantee, 2025-06-01 — [scrape] https://www.reddit.com/r/AskAcademia/comments/1l0ejc1/listing_cancelled_grant_on_cv/
- "based on the list of terminated grants at grant-watch, many were terminated for reasons not immediately clear" — r/AskAcademia reply, 2025-06-02 — [scrape] same thread
- "Our project staff at NIH say, according to them, nothing's been terminated" — Walter Willett, Harvard professor, Harvard Crimson, 2025-09-17 — [agent-reported] https://www.thecrimson.com/article/2025/9/17/researchers-waiting-grants

## What our product does about it
Merge RePORTER, TAGGS, USAspending, NSF lists, Grant Witness and
researcher self-reports into one record per grant, keep every source's claim
side by side, and surface disagreements explicitly instead of picking a winner.

## Gaps / caveats
- Grant Witness is an advocacy-adjacent volunteer project; its numbers are the
  best available but not official.
- New terminations have been quiet in 2026 per Grant Witness; the pain is now
  more about reconciliation/history than live alerts.
