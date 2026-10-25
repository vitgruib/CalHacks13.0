# Hyphenate track brief (primary target)

Source: the official "CalHacks_Hyphenate_Track" doc (Google Doc
1u4iN8R97ILY3kfHTPKC82zdutHrGx4ze5eCAP-J92w4), copied Fri 10/23. The quotes
are verbatim. Everything under "What this means for us" is our own
interpretation.

**"The Hyphenated Enterprise: Autonomous Systems for Finance."**
$8,000 / $5,000 / $3,000 for 1st–3rd. The top 5 teams get expedited
interviews. "No finance background needed."

## The ask

> Pick a company and one corner of its finance team: a few seats that work
> closely together, like the accountant who applies customer payments and
> the person who chases the late ones. Then build the autonomous system
> you'd hire to fill them, **and the company it works in**: the software it
> uses, the people it answers to, and the mistakes hiding in its data. Be as
> imaginative as you like about who the company is (a Formula 1 team, a
> music festival, a three-person startup, a colony on Mars) and strict about
> how it works underneath.

> The frontier is autonomy inside a company: systems that pick up work **on
> their own**, across the software and the people that run it, with
> decisions that are explainable when someone asks and accountable whenever
> someone looks back.

## What makes it hard (their list)

- **Sources that disagree.** The bank, the ledger and the contract each tell
  a slightly different story. Act on the right one, and say why.
- **Time.** "What happened in March should change what the system does in
  June."
- **Working with others.** Approvers are busy, colleagues (human or
  automated) hand work over half done, and the controller sometimes says
  no. Ask at the right moment and handle the answer.
- **Limits.** No all-access. "Whoever requests a payment can't be the one
  who approves it" (segregation of duties).
- **Explainable and accountable.** Every call traces back to the data, rule
  or person behind it, "no matter how long ago it was made."

## Sample workflows (pick a corner of one, or one not listed)

Revenue Accounting · Accounts Receivable · Cash & Treasury · Accounts
Payable ("a vendor's bank details change the day before a large payment") ·
Accruals · Expenses (prepaids, fixed assets, leases, capitalized R&D) ·
Payroll · Close & Consolidation · FP&A · Reporting.

The doc says the exceptions and judgment calls are ours to discover, "by
digging in or by finding the Hyphenate team at our booth."

## How we judge (verbatim)

1. **Is it real enough?** Realistic data, a messy problem, and proof that it works.
2. **Would you hire it?** For which seats, and would it earn them: limited
   access, a clean record of its work, and knowing when to ask?
3. **Did we see something new?** A company, problem or approach we haven't
   seen made autonomous before.
4. **The moment.** When it catches what others missed, recovers from
   something going wrong, or defends a decision when questioned.

## What to submit

"Judges see hundreds of projects, so put the evidence up front." Along with
the code:

- **A demo video** that opens with your moment.
- **A live demo** at judging, running for real. "We may ask you to try a
  scenario of our own."
- **One line** on the seats your system would fill.
- **Proof it works:** what's real, what's simulated, and how you know.
  Their examples: "a test set, planted errors with an answer key, or a
  benchmark score."

## Workshop

"Beyond Agentic Harnesses: Engineering the Autonomous Enterprise". **In
person Fri 10/23, 7 PM** ("an hour after hacking starts", so hacking starts
6 PM). Someone from the team should go.

## Places to start (from the doc)

- **Real product:** hyphenate.ai (platform video, product pages).
- **Sandboxes:** Stripe sandboxes, Increase sandbox, Lago (self-hosted),
  Odoo (Docker), ERPNext (frappe_docker).
- **Ledgers:** Formance Ledger, Blnk, TigerBeetle, Beancount + Fava.
- **Mocks:** Mockoon, Prism, stripe-mock.
- **Data:** SEC EDGAR APIs, public GitHub repos.
- **Benchmarks:** AccountingBench, APEX-Accounting (HF
  `mercor/apex-accounting`), Finance Agent Benchmark (HF
  `vals-ai/finance_agent_benchmark`), DABstep (HF `adyen/DABstep`), BenchRec
  (Kaggle, real-world cash reconciliation), Invoice Sandbox Benchmark
  (github `ciru-ai/invoice-sandbox-benchmark`).
- **People:** "A model can play the approver, the colleague or the auditor."
- **Models and frameworks:** "Use whatever you like."

## Key concepts (glossary)

- **Double-entry:** every transaction is a debit in one account and an
  equal credit in another, so the books balance.
- **General ledger:** the master record of all entries, by account.
- **Chart of accounts:** the list of accounts.
- **Journal entry:** a dated record moving amounts between accounts, with a
  reason.
- **Subledger:** detail for one area (customers, vendors, assets) that rolls
  up into the GL.
- **System of record:** the source treated as truth for a given piece of
  data.
- **Reconciliation:** confirming two records agree, and explaining any
  difference.
- **Period close:** finalizing a month or quarter, after which its entries
  are locked.
- **Materiality:** how big a difference must be before it matters.
- **Internal controls:** the checks that catch mistakes and fraud.
- **Segregation of duties:** no single person or system both starts and
  approves an action.
- **Audit trail:** who did what, when and why.
- **Controller:** owns the accuracy of the books and signs off.

## What this means for us

How GrantGuard answers each requirement (details in `docs/MASTER-PLAN.md`).

| Their requirement | GrantGuard |
| --- | --- |
| Build the company too | A simulated university lab on two real NIH grant records: orders, invoices, approvals, payroll, papers, a simulated clock, and the grant manager and researchers it answers to (§1, §2) |
| Several seats, not one | Grant accountant (bookkeeping agent) and the grant manager who approves every request and invoice, each its own database identity (§2; the purchasing agent was cut in T108) |
| Picks up work on its own | Agents react to new rows (a request, an invoice, a status change, a month end) and to the daily source check; no chat prompt needed |
| Sources disagree | RePORTER, USAspending and the cancellation list are compared; a disagreement freezes spending and asks the grant manager which source is right (§3.1) |
| Time | A cancellation in March freezes June's purchases until a payment lands; the last-90-days rule; the 90-day cost-transfer limit (§3.1, §3.2, §3.5) |
| Limits / SoD | Enforced in the module, not the prompt: nobody approves their own request, agents can't decide Inbox items, a buy over the card limit waits (§2) |
| Explainable & accountable | Every action writes a Log row with the rule and reason; "why?" on any row (§3.6) |
| Ask at the right moment | Over the limit, unclear, or a source disagreement goes to the Inbox with its evidence; a reason is required to decide (§3) |
| The moment | A court restores a canceled grant, and the agent still won't spend until the money arrives; then it buys on its own (§5) |
| Judge's scenario | The Test lab injects cancellations, court orders, payments and invoices; anyone can submit a request (§5) |
| Proof | 14 planted mistakes and 5 decoys from real audit findings, scored on every `./check.sh` (README, Scorecard) |
| Something new | The corner: the post-award grant office during the 2025–2026 grant cancellations, where status is a dated timeline, not a field |
