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

| Their requirement | What we build |
| --- | --- |
| Build the company too | A simulated company world: chart of accounts, GL + subledger, a bank feed, contracts/vendors/customers, and **simulated people** (model-played approver, controller, colleague, auditor) with their own goals and response delays. |
| Several seats, not one | 2–3 cooperating agent seats with **different permissions** that hand work to each other and to humans. |
| Picks up work on its own | Event- and schedule-driven: a new bank line, a bill arriving, or day 3 of close starts the work. No chat prompt needed. |
| Sources disagree | Each fact has a source + trust ranking. The agent records which source it relied on and why. |
| Time | Simulated clock across months. Memory of past events (a vendor's history, a customer's payment pattern) changes later decisions. Closed periods are locked, so corrections post to the open period. |
| Limits / SoD | Permissions enforced **in the backend**, not in the prompt. A requester can't approve their own request, even if the model tries. |
| Explainable & accountable | An append-only audit trail linking every entry → decision → evidence (data, rule, or person). A UI answers "why?" for any entry, however old. |
| Ask at the right moment | Escalation thresholds (materiality, novelty, policy conflict). Handles "no" from the controller and replans. |
| The moment | One seeded scenario where it catches what a rule engine misses, *and* one where it recovers from failure, *and* the "why?" defense. The demo video opens with it. |
| Judge's scenario | A live "inject an event" control: a new bill, bank line, email or contract change goes through the same pipeline. |
| Proof | Planted errors + answer key run on every build. Optionally score on one public benchmark (BenchRec fits reconciliation). Show catch rate / false positives / escalations in the README and the UI. |
| Something new | The novelty comes mostly from **which company** and **which corner**. AP bank-change fraud is their own listed example, so expect many teams to build it. |
