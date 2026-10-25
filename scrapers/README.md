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
- the cloud copy: the latest successful run of the Actor, when
  `GG_APIFY_ACTOR=nathanqiu~nih-grant-cancellation-list` (+ `APIFY_TOKEN`) is
  set, or one pinned run with `GG_APIFY_DATASET`. The tracker asks for just
  the four fields it reads (about 40 KB gzipped for the whole list),
  downloads it once per check, and saves only `GG_LAB_GRANTS` in
  `agents/cache/` for offline use.

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

- `grantId` is the core project number: `1R01GM061721-01` becomes `R01GM061721`.
- `status` uses the module's words: Terminated and Frozen become `canceled`,
  Reinstated becomes `restored_by_court`, Unfrozen becomes `active`.
  Restorations are kept on purpose. If only cancellations were listed, a grant
  restored by a court would drop off the list, and the tracker (for which
  "not listed" says nothing) would keep the old `canceled`.
- A grant listed both as the whole award and as a supplement (`-04S1`) gets
  the whole award's row. A grant whose only listing is a supplement is kept,
  with `supplement` set, because part of its money is affected.

## Time switch (test runs)

`asOf` (Actor input, or `GG_AS_OF` locally) shows the real list as it stood
on a past day, read off each row's own dates: before the earliest disruption
a grant isn't listed, until the latest restoration it's `canceled`
(`listStatus` Terminated, or Frozen for a grant later unfrozen), and from the
restoration on it has its current status. Each row carries `asOf`. The list
keeps only the earliest disruption and the latest restoration, so a grant
cut, restored and cut again shows its current status from that restoration.

The lab's R01GM061721 is on the real list (terminated 2025-07-31, reinstated
2025-09-22 under *Thakur v. Trump*), so:

```bash
GG_AS_OF=2025-07-30 GG_LAB_GRANTS=R01GM061721 npm --prefix scrapers run scrape   # not listed
GG_AS_OF=2025-08-15 GG_LAB_GRANTS=R01GM061721 npm --prefix scrapers run scrape   # canceled
GG_AS_OF=2025-09-22 GG_LAB_GRANTS=R01GM061721 npm --prefix scrapers run scrape   # restored_by_court
```

## Run locally (no Apify token needed)

```bash
npm --prefix scrapers install
npm --prefix scrapers run scrape          # live list -> storage/datasets/default/ + out/cancellations.json
npm --prefix scrapers run scrape:saved    # the bundled saved copy (offline)
GG_LAB_GRANTS=R01GM061721,R21AI182745 npm --prefix scrapers run scrape   # only the lab's grants
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
| `outFile` | `GG_CANCELLATIONS_FILE` | `scrapers/out/cancellations.json` locally, none in the cloud |
| `csvUrl` | none | Grant Witness NIH CSV |
| `asOf` (YYYY-MM-DD) | `GG_AS_OF` | none: today's list |

## Demo data

The sim world uses two real NIH grant IDs (`R01GM061721`, `R21AI182745`;
the lab, money and timeline around them are simulated). The real Grant
Witness list already has `R01GM061721` (reinstated, Thakur v. Trump), so a
plain scrape gives the tracker a real reading. There is no made-up demo row
any more.

## Against the local SpacetimeDB

1. `npm --prefix server run dev` (or reuse a running server on :3000).
2. `npm --prefix scrapers run scrape`.
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
`GG_APIFY_DATASET=<dataset id>` and `APIFY_TOKEN` in `.env.local`. The Actor is
deployed as `nathanqiu/nih-grant-cancellation-list` (private until the
account has a public profile; see `HUMAN_TODO.md`). Its Store page is
`.actor/README.md`.
