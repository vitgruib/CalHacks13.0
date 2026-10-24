# Idea brainstorm (Hyphenate-first)

Every idea must answer Hyphenate's four questions (see `docs/TRACKS.md`):
real/messy data, the seats it fills with limited access + clean record +
knowing when to ask, something new, and one demo moment. Humans pick one at
kickoff and record the choice in `DECISIONS.md`.

The shared core is the same for every idea, so lanes can start right after
the pick: **scenario/data generator → agent with permission-tiered tools →
escalation inbox → append-only audit log UI → eval harness.**

---

## 1. AP desk: accounts-payable clerk that catches payment fraud ⭐ recommended

**Seats:** AP clerk + AP fraud/controls reviewer at a 20–200 person company.

Invoices arrive by email or PDF. The agent extracts them, matches each one
against POs, receipts, and the vendor master, then schedules payment through
a bank API, within a $ limit. It escalates anything outside policy.

- **Messy data:** vendor name variants, partial shipments, a resent
  duplicate invoice with a new number, mismatched tax, a scanned PDF.
- **The moment:** a vendor email says "we've changed banks, please update
  our account". It looks legit (a real thread, the right signature), but the
  domain is off by one letter and the amount is unusual. The agent freezes
  payment, asks the human, and cites its evidence when challenged. This is
  business email compromise, a multi-billion-dollar real problem that rules
  engines miss because each signal alone looks fine.
- **Recovery:** the bank API times out mid-payment, and the agent checks
  for idempotency before retrying, so there's no double pay.
- **Stacks:** Microsoft (production-minded finance agent), Nessie (the bank),
  Anthropic (name the community, e.g. "office managers at Bay Area dental
  practices doing AP by hand"), Droid (proposes new vendor-matching rules as
  reviewable diffs).
- **Risk:** AP automation exists. Our "new" has to be the fraud-catching
  judgment and the hire-ability (record + escalation), not the OCR.

## 2. Close-bot: month-end reconciliation for a small business

**Seats:** staff accountant / bookkeeper.

The agent reconciles the bank feed against the ledger and Stripe/Square
payouts. It matches batched deposits, splits fees, and proposes journal
entries. Anything it can't explain gets written into a close memo for the
human.

- **The moment:** a $1,847.20 variance traced to a refund booked twice
  across two months. A human skimming the totals missed it.
- **Recovery:** a payout CSV arrives with shifted columns. The agent
  notices, re-maps, and logs why.
- **Stacks:** Nessie, Microsoft, Droid (the reconciliation rule *as code*,
  shown as a diff), Anthropic.
- **Risk:** less dramatic as a demo, and it needs very good fake data.

## 3. Junior underwriter for a credit union, with a synthetic-ID catch

**Seats:** consumer loan underwriter + fraud analyst.

The agent pulls the applicant's credit and identity data from the CRS
sandbox (test identities), reads bank statements, and applies the lending
policy. It approves within its authority, or escalates. For declines it
drafts adverse-action reasons citing specific tradelines.

- **The moment:** one applicant passes every rule, but the agent flags a
  **synthetic identity**: a thin file, a recently added SSN, authorized-user
  piggybacking. When challenged ("why decline?"), it defends the call
  citing the exact data.
- **Stacks:** **CRS on all fronts** (Best Overall, Financial AI Agent,
  Identity/Fraud), Microsoft, Anthropic. Optionally Cartesia: the applicant
  calls to ask why they were declined.
- **Risk:** fair-lending and bias questions. Address them head on (good for
  the "responsible" criteria), but don't overclaim.

## 4. Treasurer copilot for Berkeley student orgs

**Seats:** student org treasurer + ASUC finance reviewer.

Reimbursement requests arrive with receipt photos. The agent checks each
one against funding rules (allowed categories, per-event caps, required
pre-approval), catches duplicate or altered receipts, and pays out within
limits. It escalates and logs everything for audit season.

- **The moment:** the same receipt submitted by two members of different
  orgs, cropped differently.
- **Stacks:** **Anthropic** (a perfectly named community, and we can
  interview real treasurers at the venue), Nessie, Microsoft.
- **Risk:** smaller dollar stakes, so Hyphenate's "enterprise" judges may
  see it as less ambitious. Counter by framing it as "any org with
  delegated spend".

## 5. Collections & hardship desk, with a voice agent

**Seats:** collections agent + member-services rep.

The agent calls members who are behind on payments, using voice, and
reviews their finances. It offers hardship plans within policy and
escalates the rest.

- **The moment:** mid-call, it realizes from the credit report that the
  delinquent accounts were opened by an identity thief. It stops collecting
  and switches to fraud-victim handling.
- **Stacks:** Cartesia (voice is core), CRS identity/fraud, Anthropic,
  People-First.
- **Risk:** the most scope (voice + telephony + finance). Only pick this if
  someone has done real-time voice before.

---

## Recommendation

**#1 (AP desk)** gives the clearest Hyphenate moment, and it stacks
Microsoft + Nessie + Anthropic almost for free. Pick **#3** instead if we
want to go hard on CRS's three sub-prizes. Pick **#4** if we can find real
treasurers to interview at the venue (the strongest Anthropic story).

## Possible lanes once an idea is picked (4 people)

| Lane | Owns |
| --- | --- |
| scenarios + eval | messy data generator, seeded "moment" scenarios, labeled eval set, metrics |
| agent core | model calls, tool definitions, permission tiers, escalation logic |
| integrations | bank/credit sandbox clients (Nessie/CRS), doc ingestion, stubs |
| UI + pitch | inbox, audit-log viewer, "new scenario" input, demo video, Devpost |
