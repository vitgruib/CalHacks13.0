# Should the agent buy research purchases without a person?

**Status:** evidence for a team decision (not decided)
**One-liner:** The evidence says a person should approve every research
purchase, with the agent preparing the check and the recommendation. The
agent is good at spotting bad requests, but its judgments are inconsistent
and its price lookups are unreliable. Federal rules make the grantee
answerable for each cost, and security guidance says high-impact actions
need human approval.

Collected 2026-10-25. Raw test output is in
`sources/docs/agent-purchasing-test-2026-10-25.txt`; the script is in
`sources/docs/agent-purchasing-test-script.txt`.

## What happens today (plain language)

When a researcher sends a purchase request, the purchasing agent
(`agents/src/agents/purchasing.ts`) picks a grant and has the database check
the spending rules. If every rule passes and the request is under the $5,000
card limit, a Haiku "strict check" and a web price lookup run, and then the
agent buys the item **without a person**. A person sees a request only when
something fails or is flagged. Every "buy" is an order recorded in the
simulated lab; no real money moves.

## Everyday analogy

The agent is a new office assistant with the department card. It catches
most of the obvious problems, but it might answer the same question
differently on Tuesday than on Monday, and it sometimes reads "price per
item" as "price for the box". You would let it fill in the purchase form,
but you would still sign the form yourself.

## Evidence

### Our own test (manual, 2026-10-25)

The setup was 23 purchase requests on two grants in different fields
(bacterial membrane transport, and sleep and memory). Expected outcomes were
written before running. Each request went through the real worker with live
Claude, in 3 fresh runs. [verified] `sources/docs/agent-purchasing-test-2026-10-25.txt`

- **It never bought something it should have stopped:** 0 of 42 across the
  3 runs (14 per run). Requests it held included coffee beans entered as
  "lab supplies", headphones, office chairs entered as "equipment", a resort
  trip to Maui, business class, mouse cages on the bacteria grant, $900 for
  one box of tips, and a $45 −80 °C freezer. Wine was blocked by the
  spending rules. [verified] same file
- **The same request got different outcomes on different runs.** A $1,900
  Dell laptop "to run the EEG sleep-scoring pipeline" was held in runs 1
  and 2 and **bought with no person** in run 3. Nothing in the request
  changed. [verified] same file
- **The web price lookup got quantity wrong.** For "Mouse EEG headmount
  electrodes, 10" at $900, it reported a single headmount's price ($287.80
  or $362.80) as the price for 10 (`sameQuantity: true`). It then held the
  request as "more than twice the list price", in all 3 runs. [verified] same file
- **The web price lookup gave different "list prices" for the same thing.**
  The same 12 mouse running wheels came back as $351.24 in runs 1 and 3 and
  $4,980 in run 2. Run 2's source URL was a page for
  "bone-forceps-scissors". Its two GFP antibodies were listed at $488.65 and
  $284.65. [verified] same file
- **It held an allowed cost:** IRB-approved payments to study participants
  (20 × $25 prepaid cards) were held in all 3 runs. The strict check's prompt
  lists gift cards as always flagged. [verified] same file and
  `agents/src/prompts/purchasing.ts`

### Earlier live runs logged in this repo

- A truncated answer turned a flag into a buy: "a borderline Peloton
  answer used up to 592 output tokens; at 400 it was cut off, fell back to
  'fine' and was bought" — @nathan/claude, T99, `PROGRESS.md` (commit
  433ec48) [verified]. That bug was fixed by raising the limit. What it shows
  is the design: when the check can't answer, the request goes through.
- The same check gave different answers on the same input: "the purpose
  prompt flags "Benchtop microcentrifuge / for the lab" 7/7 runs and passes
  the Peloton 2/7" — @nathan/claude, T99, `PROGRESS.md` (commit 433ec48)
  [verified].
- **When Claude can't answer, the purchase goes ahead.** The price
  check: "With Claude off or offline and nothing saved, there is no price to
  compare and the purchase goes ahead as before." (`agents/src/agents/price-check.ts`
  header) [verified]. The purpose check's fallback answer is `purpose:
  'fine'` (`agents/src/agents/purchasing.ts`, the `fallback` in the purpose
  check) [verified].

### Outside sources

- **Federal rules make the grantee answerable for every cost.** 2 CFR
  200.303(a): the recipient must "Establish, document, and maintain effective
  internal control over the Federal award that provides reasonable assurance
  that the recipient or subrecipient is managing the Federal award in
  compliance with Federal statutes, regulations, and the terms and
  conditions of the Federal award." — [verified] eCFR,
  https://www.ecfr.gov/current/title-2/section-200.303
  (text read 2026-10-25 from the eCFR versioner API, 2026-01-01 version:
  https://www.ecfr.gov/api/versioner/v1/full/2026-01-01/title-2.xml?part=200&section=200.303)
- **Whether a cost belongs on a grant is a judgment call.** 2 CFR
  200.405(a): "A cost is allocable to a Federal award or other cost
  objective if the cost is assignable to that Federal award or other cost
  objective in accordance with the relative benefits received." — [verified]
  eCFR, https://www.ecfr.gov/current/title-2/section-200.405
  The laptop and participant-payment cases above are exactly this kind of
  "relative benefits" call.
- **OWASP's LLM Top 10 says high-impact actions need a person.** "Utilise
  human-in-the-loop control to require a human to approve high-impact
  actions before they are taken." Excessive Agency "is the vulnerability
  that enables damaging actions to be performed in response to unexpected,
  ambiguous or manipulated outputs from an LLM" — [verified] OWASP Top 10
  for LLM Applications 2025, LLM06:2025 Excessive Agency,
  https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
- **Claude running a real shop made money mistakes.** In Anthropic's
  Project Vend (Claude Sonnet 3.7 running an office shop for about a month),
  "Claudius received payments via Venmo but for a time instructed customers
  to remit payment to an account that it hallucinated." "Claudius would
  offer prices without doing any research, resulting in potentially
  high-margin items being priced below what they cost." "Claudius was
  cajoled via Slack messages into providing numerous discount codes"
  Verdict: "If Anthropic were deciding today to expand into the in-office
  vending market, we would not hire Claudius." — [verified] Anthropic, "Project Vend", 2025-06-27,
  https://www.anthropic.com/research/project-vend-1 (interested source: a
  model vendor writing about its own model; an older model than ours)
- **Agents lose track over long runs.** Andon Labs' Vending-Bench found
  that agents running a simulated vending business got worse over long time
  horizons, misread their own state (for example, believing an order had
  arrived when it hadn't), and varied more from run to run than a human did —
  [unverified] search summary of https://arxiv.org/pdf/2502.15840 (2025-02).
  Re-check before using on a slide.

## Evidence the other way (keep this; don't cherry-pick)

- In our test the agent **never bought a bad request**. Every error was a
  hold, which costs a grant manager a click, not money. [verified] test file
- Since T101 the AI never rejects anything: a flag only sends the request
  to the grant manager (`PROGRESS.md`, T101). So a false flag already ends
  with a person deciding.
- Holding every request removes the demo's central beat: "the agent won't
  spend until the money actually arrives, then does" (`AGENTS.md` §0). That
  beat would have to become "the agent recommends buying once the money
  arrives".
- 23 cases × 3 runs is a small sample.

## What the product could do about it

This is a decision for the humans, not made here. The options:

1. **A person approves every purchase.** The agent still runs the rules,
   the strict check and the price lookup, and writes a recommendation with
   its reasons. The grant manager clicks approve. This matches 2 CFR 200.303
   and OWASP LLM06.
2. **The agent may buy alone only a narrow list** (named consumables under a
   low limit). Everything else goes to a person.
3. **Keep the current behavior** and treat the variance and price-lookup
   errors as known issues.

## Gaps / caveats

- The test used simulated grants and Claude Haiku/Sonnet as configured on
  2026-10-25. It didn't test prompt injection or many requests over time.
- The Vending-Bench claim is unverified; the other outside quotes were read
  from the primary pages.
- No evidence found yet of a university policy that bans software agents
  from placing orders. The rules above require controls and judgment;
  they don't mention AI.
