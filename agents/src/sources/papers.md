# Paper lookup: verified demo papers

Real papers for the report checker (T14) demo and tests. Each row was checked
live on 2026-10-24 through `createPaperLookup` (`papers.ts`), and its saved
answers are in `agents/cache/`. Every fact below is `[verified]`: the API
answer was opened and read. Authors are not named, by the evidence rules in
`docs/research/README.md`.

The API calls behind each row (`<doi>` and `<pmid>` filled in):

- **Crossref:** `https://api.crossref.org/works?filter=doi:<doi>&select=DOI,title,funder,updated-by&rows=1`
  (`funder[].award` = grant numbers; `updated-by` = correction, retraction and concern notices, including Retraction Watch's)
- **PMC ID converter:** `https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/?ids=<doi>&format=json&tool=grantguard`
- **PubMed search** (only when the paper isn't in PMC): `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&tool=grantguard&term="<doi>"[doi]`
- **PubMed record:** `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&tool=grantguard&id=<pmid>`
  (`GrantList`; `CommentsCorrections` of type `ErratumIn`, `RetractionIn` or `ExpressionOfConcernIn`; `PublicationType`)
- **RePORTER:** `POST https://api.reporter.nih.gov/v2/publications/search` with
  `{"criteria":{"core_project_nums":["<grant>"]},"offset":0,"limit":500}`

## 1. Papers RePORTER links to the seed grants

| Grant | RePORTER `meta.total` | PMIDs |
|---|---|---|
| R01HD115985 | 0 | not found: RePORTER links no papers to it |
| R01AI181732 | 2 | 42330440, 42521605 |
| R01EY028739 | 24 | 29720364 … 40714524 (full list in the cache) |

| DOI | PMID | PMCID | Grants credited (PubMed `GrantList` / Crossref `award`) | Shows |
|---|---|---|---|---|
| `10.3201/eid3208.260433` | 42521605 | PMC13426860 | PubMed: R01 AI181732, R01 AI143439 | Clean paper on a seed grant |
| `10.1097/OLQ.0000000000002380` | 42330440 | none: the converter answers "Identifier not found in PMC"; the PMID came from the PubMed search | PubMed: R01 AI181732 | **Missing PMCID** on a seed-grant paper |
| `10.1001/jamaophthalmol.2023.6830` | 38358762 | PMC10870220 | PubMed: R01 EY028739 | Clean |
| `10.1016/j.ophtha.2022.05.008` | 35588945 | PMC9110065 | PubMed: none. Crossref: "R01 EY028739" | The grant appears only in Crossref, which is why both sources are read |
| `10.1001/jamanetworkopen.2022.42240` | 36383382 | PMC9669817 | PubMed: K23 AI146268, L30 AI126521. Crossref: no funders | RePORTER links it to R01EY028739, but neither index lists that grant (the full text was not checked) |
| `10.1093/cid/ciab121` | 33580245 | PMC8442779 | PubMed: R01 EY028739 and "EY06190" | A grant printed without its activity code: normalized to `EY006190` |

## 2. Corrected papers (material)

- `10.1136/bmj-2022-072924` (BMJ 2023 meta-analysis; PMID 36889791,
  PMC10535030; PubMed credits R01 CA197422). **In both sources.** Crossref
  `updated-by`: `correction`, notice `10.1136/bmj.r2557`, 2025-12-12, source
  `publisher`. PubMed: `ErratumIn` PMID 41386776. What changed: the notice
  (full text PMC12699368, via Europe PMC) says wrong excess-relative-risk data
  were used for one included study and another study's entries were
  overlooked, and it gives corrected estimates.
- `10.1001/jamanetworkopen.2024.34707` (JAMA Netw Open 2024; PMID 39302676,
  PMC11415781; PubMed credits P30 CA008748, R01 AG069352). **PubMed only:**
  Crossref has no `updated-by`. PubMed: `ErratumIn` PMID 39964688, titled
  "Error in Data and Analyses." (notice DOI `10.1001/jamanetworkopen.2025.1566`).
  The notice (PMC11836750) says some patients were removed from the analysis
  by mistake. This changed participant counts, demographics and regression
  estimates in the Results, Tables and Figures. The notice adds that the
  findings "remain consistent with the originally published article."

## 3. Retracted paper

- `10.1016/S0140-6736(20)31180-6` (Lancet 2020, hydroxychloroquine registry
  analysis; PMID 32450107, PMC7255293; no grants in either source). Crossref
  `updated-by`: `retraction`, notice `10.1016/s0140-6736(20)31324-6`,
  2020-06-05, source `retraction-watch`; `expression_of_concern`,
  `10.1016/s0140-6736(20)31290-3`, 2020-06-03, `retraction-watch`; and four
  entries the publisher deposited. PubMed: `PublicationType` "Retracted
  Publication"; `RetractionIn` 32511943 and 32653079; `ExpressionOfConcernIn`
  32504543; `ErratumIn` 32485145. Caveat: one publisher entry in Crossref
  lists `10.1016/s0140-6736(20)31174-0` as a retraction of this paper. That
  DOI is a separate commentary, which was itself retracted. The client reports
  it as Crossref gives it.

## 4. Decoys: corrections that don't matter

- `10.1001/jamanetworkopen.2023.2937` (JAMA Netw Open 2023; PMID 36917109,
  PMC10015308; PubMed credits P30 MH062246, P30 AG024409). **Affiliation
  only.** PubMed: `ErratumIn` PMID 38214934, titled "Error in Affiliation."
  (notice DOI `10.1001/jamanetworkopen.2023.54465`). Crossref: no `updated-by`.
  The notice (PMC10787310) says only that one author's affiliation was wrong
  and has been amended. The client's `updates[].title` is enough to tell.
- `10.1371/journal.pone.0330427` (PLOS ONE; PMID 40961032, PMC12443297;
  both sources credit R01AG080486; PubMed also lists T32 CA094186).
  **Affiliation only, but the title doesn't say so.** Crossref:
  `correction`, notice `10.1371/journal.pone.0339502`, 2025-12-22; PubMed:
  `ErratumIn` 41428630. The notice title is just "Correction: " plus the
  paper's title. Its text (PMC12721518) says "There are errors in the author
  affiliations" and lists the corrected affiliations, nothing else. A
  checker has to read the notice or ask a person.
- `10.1038/s41598-025-22661-4` (Sci Rep 2025; PMID 41198766, PMC12592345;
  K23 AT010879, R24 AT012845). **Author-name spelling only** (not an
  affiliation fix). Crossref: `correction`, `10.1038/s41598-025-32949-0`,
  2025-12-23; PubMed: `ErratumIn` 41436770; the notice text (PMC12728161)
  corrects one author's name, nothing else.

## 5. A DOI that doesn't exist

- `10.5555/grantguard-not-a-real-doi`: made up on purpose. The prefix
  belongs to Crossref's "Test accounts" member
  (`https://api.crossref.org/prefixes/10.5555`). The Crossref answer has
  `total-results: 0`, so `lookup` returns `null`, and that answer is saved,
  so it works offline too.

## Limits

- Notice texts were read in Europe PMC for this note only. The client saves
  notice **titles** and nothing more, because the texts name people.
- `grantsCredited` is what PubMed and Crossref indexed, not the paper's
  full acknowledgments section. A grant missing from both may still be
  printed in the paper.
- Counts and links are as of 2026-10-24. RePORTER and PubMed keep adding
  links.
