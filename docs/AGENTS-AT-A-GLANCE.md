# What each agent does

GrantGuard has three agents, each signed in as its own seat. They share one
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
against the order and approval and either pays it or holds it. For a held
invoice, the agent names the conflicting records and their amounts.
*Claude:* writes a short note on what doesn't match (for example, "billed for
an order canceled 2026-03-02").

## Purchasing agent

For each purchase request, it picks the grant, has the database check the
spending rules (frozen grant, last 90 days, card limit, shared cost), then
buys, reroutes to another grant, holds or blocks. When a frozen grant gets its
money, it buys what was waiting for that grant.
*Claude:*
- reads the free-text request: which grant, whether the cost is shared, and
  any split the person stated (never a guessed split);
- explains each decision and cites the rule and the audit it comes from;
- for a shared cost, says whether each grant's use could be measured.

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
