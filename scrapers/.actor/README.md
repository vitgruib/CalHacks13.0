# NIH grant cancellation list (Grant Witness)

Get one clean row per NIH grant that has been terminated, frozen, reinstated
or unfrozen, with a status you can act on. The Actor downloads
[Grant Witness](https://grantwitness.org/nih)'s own "full dataset" CSV on
every run (no HTML scraping) and normalizes it.

Built for [Grant Test Auto](https://github.com/vitgruib/CalHacks13.0), an AI grant office for
research labs, whose fund tracker compares this list with NIH RePORTER and
USAspending and asks a person when they disagree.

## What you get

```json
{ "grantId": "K99DK136503", "status": "canceled", "listStatus": "Terminated",
  "terminatedOn": "2026-07-11", "restoredOn": null, "restoredBy": null,
  "fullAwardNumber": "3K99DK136503-02S1", "supplement": "S1",
  "title": "…", "institution": "…",
  "reporterUrl": "https://reporter.nih.gov/project-details/…",
  "url": "https://grantwitness.org/nih", "fetchedAt": "…", "savedCopy": false }
```

- **`grantId`** is the core project number: `1R01GM061721-01` becomes `R01GM061721`, so it matches however your records write the award.
- **`status`** is one of `canceled` (Terminated or Frozen), `restored_by_court` (Reinstated) or `active` (Unfrozen). The list's own wording is kept in `listStatus`.
- **Restorations are kept**, not dropped, so a grant that a court restored doesn't look canceled forever.
- **One row per grant.** When a grant is listed both as the whole award and as a supplement (`-04S1`), the whole award's row wins.

A run in October 2026 returned 5,635 grants (1,100 canceled, 2,301 reinstated, 2,234 unfrozen) in a few seconds.

## Input

| Field | What it does | Default |
| --- | --- | --- |
| `grantIds` | Only return these grants (any number format) | the whole list |
| `source` | `live` downloads the list; `saved` uses a small bundled copy (23 real rows) | `live` |
| `csvUrl` | Another copy of the CSV | Grant Witness NIH CSV |

If the download fails, the run falls back to the bundled copy, logs a
warning and marks those rows `savedCopy: true`.

## About the source

Grant Witness is a volunteer project that infers terminations and
restorations from NIH RePORTER, TAGGS, USAspending and court filings
([methodology](https://grantwitness.org/nih/updates/methodology)). Treat it
as one source among several, and please cite Grant Witness when you use its
data. This Actor isn't affiliated with Grant Witness or NIH.
