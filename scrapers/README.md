# scrapers/ — cancellation-list scraper (T15)

An Apify Actor (Apify SDK + Crawlee) that reads the public list of disrupted
NIH grants kept by [Grant Witness](https://grantwitness.org/nih) and turns it
into one row per grant, in the shape GrantGuard's fund tracker reads.

- **Source:** Grant Witness's own "download the full dataset" CSV,
  `https://data.grantwitness.org/nih/dl-table.csv` (no HTML scraping). On
  2026-10-24 it had 5,776 rows, which became 5,635 grants: 1,100 canceled
  (terminated or frozen), 2,301 reinstated, 2,234 unfrozen.
- **Caveat (docs/research/README.md rule 6):** Grant Witness is a volunteer,
  advocacy-adjacent project. It infers terminations and restorations from
  RePORTER, TAGGS, USAspending and court filings
  ([methodology](https://grantwitness.org/nih/updates/methodology)). It's one
  source among several. That's the point: when it disagrees with RePORTER,
  the tracker asks the grant manager.

## How the rows reach the fund tracker

The scraper **does not post to the database**. Only the bookkeeping agent may
call `post_source_reading` (`server/src/index.ts`), so the tracker reads the
scraper's rows as one more source (`agents/src/sources/cancellations.ts`) and
posts the reading, the `canceled` status event and any `sources_disagree`
flag itself, only when something changed. It reads either:

- `scrapers/out/cancellations.json` (default; written by every local run), or
- an Apify dataset, when `GG_APIFY_DATASET` (+ `APIFY_TOKEN`) is set.

The tracker picks the rows up on its daily read, on "check now", and before
money moves. It only looks up the lab's own grants.

Row shape (the tracker reads the first four fields; the rest are for people):

```json
{ "grantId": "K99DK136503", "status": "canceled", "url": "https://grantwitness.org/nih", "listedOn": "2026-07-11",
  "source": "Cancellation list (Apify)", "list": "Grant Witness (NIH)", "listStatus": "Terminated",
  "terminatedOn": "2026-07-11", "restoredOn": null, "restoredBy": null,
  "fullAwardNumber": "3K99DK136503-02S1", "supplement": "S1", "title": "…", "institution": "…",
  "reporterUrl": "https://reporter.nih.gov/project-details/…", "fetchedAt": "…", "savedCopy": false }
```

- `grantId` is the core project number: `1R01GM000001-01` becomes `R01GM000001`.
- `status` uses the module's words: Terminated and Frozen become `canceled`,
  Reinstated becomes `restored_by_court`, Unfrozen becomes `active`.
  Restorations are kept on purpose. If only cancellations were listed, a grant
  restored by a court would drop off the list, and the tracker (for which
  "not listed" says nothing) would keep the old `canceled`.
- A grant listed both as the whole award and as a supplement (`-04S1`) gets
  the whole award's row. A grant whose only listing is a supplement is kept,
  with `supplement` set, because part of its money is affected.

## Run locally (no Apify token needed)

```bash
npm --prefix scrapers install
npm --prefix scrapers run scrape          # live list -> storage/datasets/default/ + out/cancellations.json
npm --prefix scrapers run scrape:saved    # the bundled saved copy (offline)
GG_LAB_GRANTS=R01GM000001,R21AI000002 npm --prefix scrapers run scrape   # only the lab's grants
npm --prefix scrapers run scrape:demo     # + the demo row (see below)
npm --prefix scrapers run check           # typecheck + tests (offline)
```

If the live list can't be read, the run falls back to the saved copy and
logs a warning. Rows from the saved copy have `savedCopy: true`. The saved
copy is `fixtures/grantwitness-nih-sample.csv`: 23 real rows, fetched
2026-10-24 (source and fetch date are in `grantwitness-nih-sample.meta.json`).

Options (Actor input, or env vars for local runs):

| Input | Env | Default |
| --- | --- | --- |
| `source` (`live`/`saved`) | `GG_SCRAPE_SOURCE` | `live` |
| `grantIds` | `GG_LAB_GRANTS` (comma-separated) | whole list |
| `demo` | `GG_SCRAPE_DEMO=1` | off |
| `outFile` | `GG_CANCELLATIONS_FILE` | `scrapers/out/cancellations.json` locally, none in the cloud |
| `csvUrl` | none | Grant Witness NIH CSV |

## Demo data

The sim world's grants (`R01GM000001`, `R21AI000002`) are made up, so no
real list mentions them. `scrape:demo` adds the single row in
`fixtures/demo-rows.json`: `R21AI000002` as canceled. It's labelled
`demo: true`, `list: "DEMO DATA …"`, with a `#demo-data-not-a-real-listing`
URL. With it, the tracker posts the reading, a `canceled` event (the module
freezes R21AI000002) and a `sources_disagree` flag ("NIH RePORTER says
active; USAspending says active; Cancellation list (Apify) says canceled"),
which puts "Which source is right about R21AI000002?" in the Inbox. Never
use demo mode once the lab's real grant IDs are in the seed.

## Against the local SpacetimeDB

1. `npm --prefix server run dev` (or reuse a running server on :3000).
2. `npm --prefix scrapers run scrape:demo` (or plain `scrape` for real IDs).
3. Run the tracker with the cancellation source, e.g.
   `GG_DB=spacetime GG_LIVE_SOURCES=1 npm --prefix agents run demo`. Note that
   `GG_LIVE_SOURCES=1` also turns on RePORTER and USAspending. (T15 was
   verified with only the tracker and only this source; this exact command
   wasn't run.)
4. Check: `spacetime sql -s local grantguard "select * from source_reading where source = 'Cancellation list (Apify)'"`
   and `"select * from flag"`.

## Publish to Apify (needs @nathan's token)

```bash
cd scrapers
npx apify-cli login            # paste the token; never commit it
npx apify-cli push             # builds .actor/Dockerfile on the platform
```

Then run it in the Apify console. A cloud run pushes rows to its dataset and
writes no file. To have the tracker read the cloud copy, set
`GG_APIFY_DATASET=<dataset id>` and `APIFY_TOKEN` in `.env.local`. The Actor
is private by default. Make it public only if we enter Apify's Best Actor
prize (open item in `HUMAN_TODO.md`).
