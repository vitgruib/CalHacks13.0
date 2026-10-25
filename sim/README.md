# sim/: the fake university world (T8)

`seed.json` is the full test world for Grant Test Auto: one fictional lab (Dr. Lena
Ortiz, microbiology) with two real NIH grant IDs, holding every planted mistake and decoy
from `docs/MASTER-PLAN.md` §3 as real records. `answer-key.json` lists each
one with the decision the system should make. T19's scorecard compares the
system's decisions with it: caught, missed, and false alarms.

| File | What it is |
|---|---|
| `build-seed.mjs` | Generates `seed.json`. Edit this, not the JSON, then regenerate. |
| `seed.json` | The full world as a `Db` (`web/src/data/types.ts`): the archive. The scorecard, eval and tests run on it. |
| `demo-seed.json` | The demo world the web app loads (T83, trimmed in T111): the demo path's requests (rq-101, its vendor history rq-012, the "Bought after the cut" case rq-060) plus one request per failing rule (rq-102 last 90 days, rq-103 espresso machine, rq-105 over the card limit, rq-108/rq-109 split purchase; the canceled-order invoice rq-030 is archive only), no payment requests or papers. Cut from `seed.json` by `build-seed.mjs` (`DEMO_REQUESTS`, `DEMO_PAPERS`). Same ids. |
| `answer-key.json` | One case per planted mistake and decoy, plus the rules' assumptions (card limit, 90-day categories). |
| `validate.mjs` | Checks the seed and key against each other. |

```sh
node sim/build-seed.mjs   # regenerate seed.json and demo-seed.json
node sim/validate.mjs     # exit 1 with every problem listed, or print a summary
```

`validate.mjs` fails unless all of these hold: every §3 case is in the key
(the list is hard-coded with §3's wording); every `refId` exists; each
planted record really is what the key says it is, and is still raw; all
cross-references resolve (order to request, invoice to order, approval to
order, payment-request items, papers' grants, hold, log and paper-cost ids);
every payment request's items add up to its amount; and each grant's spent,
promised and received match the records.

## The world (today is 2026-06-15)

**Real grants, simulated lab.** The two grant IDs, titles, institutes and end
dates are real NIH records (checked against NIH RePORTER on 2026-10-24).
Everything else is simulated: the lab, Dr. Ortiz and the other people, the
purchases, invoices, papers, amounts, start dates, and the cancel, court and
payment timeline. None of it describes the real investigators or their work.

- **R01GM061721** "Biogenesis of the mitochondrial inner membrane" (NIH/NIGMS;
  really UCLA, to 2027-07-31). In the sim: canceled 2026-03-10, restored by a
  court order on 2026-04-20, no payment since, so it is **frozen**. (Really it
  was terminated in 2025 and reinstated under Thakur v. Trump; with
  `GG_LIVE_SOURCES=1` the live sources report that.)
- **R21AI182745** "Investigating ploidy modulation as a strategy to improve
  antibiotic activity" (NIH/NIAID; really Princeton, to 2026-08-31, not on any
  cancellation list): active, **ends 2026-08-31**, 77 days away.
- Trimmed to the bare minimum for the demo (T82): 10 settled purchases (only
  those the planted cases need, plus the past orders today's requests take
  their vendor from), 12 monthly payroll rows, 3 payment requests (2 paid,
  April's sent with a funder follow-up still unanswered), 7 progress-report
  papers, and 57 log rows. Record ids keep their original numbers.

**Raw, pre-agent state.** The agents and rules still have to find the planted
cases. Today's requests are `submitted` with no verdicts. Invoices waiting to
be checked have `checked: false`, and papers have `checked: false` with empty
`checks`. For both, `state` and `result` are placeholders until the windows
get an "unchecked" state. There are no flags, and no holds on planted
records. Settled history is already filled in: past purchases, paid invoices,
payment events, decided holds and log rows.

**In the full seed, after the demo payment lands on R01GM061721:** the gloves (rq-101), the
at-limit kit (rq-106) and the rerouted agar plates (rq-102) go through. The
over-limit pump (rq-105) still waits for the grant manager. (rq-104 and rq-107,
the shared-cost cases, were removed with cost splitting in T95.)

**The demo world** (`demo-seed.json`) keeps 11 of the 22 purchases: today's
gloves on the frozen grant (rq-101), the agar plates in grant B's last 90 days
(rq-102) and the espresso machine (rq-103); past orders rq-012, rq-017 and
rq-033 as ordinary examples (rq-101 and rq-102 also take their vendor from
them); the canceled-order invoice (rq-030), the shaker billed above its
approval (rq-034, also in April's payment request), the fee behind paper p-10
(rq-035), the held broth invoice left out of May's request (rq-037), and
Kenji's card charge for the "Bought after the cut" edge case (rq-060). Papers
p-01 and p-10, all payroll, all three payment requests and all eight grants
stay. Everything else is archived in `seed.json` only. To show another case,
add its id to `DEMO_REQUESTS` and regenerate.

## Planted cases

| Key | Feature | Kind | §3 case | Record | Expected |
|---|---|---|---|---|---|
| ft-1 | fund tracker | mistake | active in one source, canceled in another | `sr-008` (RePORTER active vs `sr-009`/`sr-010` canceled) | flag |
| ft-2 | fund tracker | mistake | a purchase while canceled | `rq-050` (card charge 2026-03-18) | flag |
| ft-3 | fund tracker | mistake | a court order with no payment yet | `se-a-court-order` | hold (stay frozen) |
| pu-0 | purchases | mistake | demo path: buy on the restored, unpaid grant | `rq-101` | hold |
| pu-1 | purchases | mistake | supplies in the last 90 days (WVU, Delaware) | `rq-102` | reroute (or block) |
| pu-2 | purchases | mistake | an unallowable item (UC Davis) | `rq-103` | block |
| pu-4 | purchases | mistake | a buy over the card limit | `rq-105` ($6,850) | hold |
| pu-d1 | purchases | decoy | a buy exactly at the limit | `rq-106` ($5,000) | pass |
| in-1 | invoices | mistake | an invoice for a canceled order | `inv-030` | hold |
| in-2 | invoices | mistake | an approval for a different amount | `inv-034` ($6,200 vs `ap-034` $5,800) | hold |
| in-d1 | invoices | decoy | matches an approved change to the order | `inv-036` ($1,290) | pass |
| pr-1 | payment requests | mistake | a held purchase left out of the request | `rq-037` (invoice `inv-037` on hold `h-004`) | exclude from May's request |
| rp-1 | reports | mistake | a paper crediting the wrong grant | `p-10` (fee `rq-035`, 38 days left to move it) | hold |
| rp-2 | reports | mistake | a paper missing its PMCID | `p-03` | hold |
| rp-3 | reports | mistake | a corrected paper listed without disclosure | `p-04` | hold |
| rp-d1 | reports | decoy | an author-affiliation correction | `p-05` | note |
| rp-d2 | reports | decoy | a retracted paper cited to discuss the retraction | `p-07` | pass |

## Rule assumptions the key relies on

These are in `answer-key.json` under `assumptions`. Track A's rules should
match them, or the key should change.

- The card limit is $5,000, and a price equal to the limit passes.
- The 90-day rule covers materials and supplies (`lab supplies`,
  `reagents`). It does not cover services, publication costs or payroll.
- `general office` is unallowable.
- An invoice is checked against the latest approval for its order, or against
  the order amount when there is no approval. Auto-bought orders under the
  card limit have no approval row.

## Loading it into SpacetimeDB

For now, the web app imports `seed.json` directly (`web/src/data/store.tsx`).
Once Track A's contract lands (T3), a loader will push `seed.json` through
Track A's actions. If the contract's shapes differ from `types.ts`, the
loader maps them; the answer key's ids stay the same.
