# sim/: the fake university world (T8)

`seed.json` is the full test world for GrantGuard: one fictional lab (Dr. Lena
Ortiz, microbiology) with two grants, holding every planted mistake and decoy
from `docs/MASTER-PLAN.md` §3 as real records. `answer-key.json` lists each
one with the decision the system should make. T19's scorecard compares the
system's decisions with it: caught, missed, and false alarms.

| File | What it is |
|---|---|
| `build-seed.mjs` | Generates `seed.json`. Edit this, not the JSON, then regenerate. |
| `seed.json` | The world as a `Db` (`web/src/data/types.ts`). The web app loads it. |
| `answer-key.json` | One case per planted mistake and decoy, plus the rules' assumptions (card limit, 90-day categories). |
| `validate.mjs` | Checks the seed and key against each other. |

```sh
node sim/build-seed.mjs   # regenerate seed.json
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

- **R01GM000001** (NIH/NIGMS, to 2027-12-31): canceled 2026-03-10, restored
  by a court order on 2026-04-20, no payment since, so it is **frozen**.
- **R21AI000002** (NIH/NIAID): active, **ends 2026-08-01**, 47 days away.
- 38 ordinary purchases since 2024-08 (bought, ordered, invoiced, mostly paid),
  72 monthly payroll rows, 15 payment requests (14 paid, April's sent with a
  funder follow-up still unanswered), 12 progress-report papers, and 171 log rows.

**Raw, pre-agent state.** The agents and rules still have to find the planted
cases. Today's requests are `submitted` with no verdicts. Invoices waiting to
be checked have `checked: false`, and papers have `checked: false` with empty
`checks`. For both, `state` and `result` are placeholders until the windows
get an "unchecked" state. There are no flags, and no holds on planted
records. Settled history is already filled in: past purchases, paid invoices,
payment events, decided holds and log rows.

**After the demo payment lands on R01GM000001:** the gloves (rq-101), the
at-limit kit (rq-106), the 60/40 split (rq-107) and the rerouted agar plates
(rq-102) go through. The over-limit pump (rq-105) and the unsplit shared
contract (rq-104) still wait for the grant manager.

## Planted cases

| Key | Feature | Kind | §3 case | Record | Expected |
|---|---|---|---|---|---|
| ft-1 | fund tracker | mistake | active in one source, canceled in another | `sr-008` (RePORTER active vs `sr-009`/`sr-010` canceled) | flag |
| ft-2 | fund tracker | mistake | a purchase while canceled | `rq-050` (card charge 2026-03-18) | flag |
| ft-3 | fund tracker | mistake | a court order with no payment yet | `se-a-court-order` | hold (stay frozen) |
| pu-0 | purchases | mistake | demo path: buy on the restored, unpaid grant | `rq-101` | hold |
| pu-1 | purchases | mistake | supplies in the last 90 days (WVU, Delaware) | `rq-102` | reroute (or block) |
| pu-2 | purchases | mistake | an unallowable item (UC Davis) | `rq-103` | block |
| pu-3 | purchases | mistake | a shared cost charged 100% to one grant | `rq-104` | hold (or block) |
| pu-4 | purchases | mistake | a buy over the card limit | `rq-105` ($6,850) | hold |
| pu-d1 | purchases | decoy | a buy exactly at the limit | `rq-106` ($5,000) | pass |
| pu-d2 | purchases | decoy | a correct shared-cost split | `rq-107` (60/40) | pass |
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
