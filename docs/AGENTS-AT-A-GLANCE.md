# What each agent does

GrantGuard's agents each sign in as their own seat (the purchasing agent was
cut in T108; the payment and report agent is out of scope since T105). They share one
rule: **the database's rules decide, and the agents act on those decisions.**
Claude reads what people wrote and writes what people read. Anything that
moves money, or that a person has to decide, waits in the grant manager's Inbox.

## Bookkeeping agent

**Grant tracker.** It reads each grant's status from NIH RePORTER, USAspending
and the cancellation list when someone presses "check now", and again right
before money moves. It posts only what changed, and raises a flag when:
- the sources disagree,
- money was spent while the grant was canceled, or
- a court restored the grant but no payment has arrived.

The database decides what a flag freezes. *No Claude.*

**Invoice check.** It sends each new invoice to the database, which matches it
against the order and approval. A match waits for the grant manager to
approve; approving charges the grant and reimburses the researcher. A
mismatch is held. For a held
invoice, the agent names the conflicting records and their amounts.
*Claude:* writes a short note on what doesn't match (for example, "billed for
an order canceled 2026-03-02").

## ~~Purchasing agent~~ (cut, T108)

Nothing is bought on an agent's say-so. Every request goes to the grant
manager's Inbox with the database's rule verdicts ("Approve" when every rule
passes, "Flagged" when one fails). Once approved, the researcher buys it and
sends the invoice. The bookkeeping agent also runs Ask's item check (*Claude
Haiku*): could a grant pay for this kind of thing at all?

## Payment and report agent

**Payment requests.** At each month end, it drafts the payment request for each
grant. The database picks what's included (held spending is left out) and
computes the amount. A frozen grant gets no request. It also answers the
funder's follow-up questions with the exact purchases and bills behind them.
*Claude:* writes the justification (≤1,000 characters) and the follow-up
answers. Any id or amount Claude writes that isn't in the records is rejected.

**Progress report check.** For each paper a progress report lists, it looks up
the public record (Crossref, PubMed): which grant the paper credits, and any
correction or retraction. The database decides whether the paper is ok, gets
a note, or is held. When a paper credits a different lab grant than the one
that paid for it, the agent proposes moving the cost before the 90-day limit
runs out.
*Claude:* classifies a correction notice as minor, material or a retraction,
and explains the check.

## Whenever Claude is unavailable

Every Claude step has a fallback written by hand, so the agents keep running
and the rules decide as before. The wording is plainer, and a request that
only describes its grant or split in words (no grant id, no stated shares)
may be held instead of matched. The demo replays saved
Claude answers (`agents/cache/claude/`).
