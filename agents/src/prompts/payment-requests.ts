// What the payment request writer (agents/src/agents/payment-requests.ts)
// asks Claude, and the shape of the answer. Claude only writes the words:
// Track A's module has already picked the purchases and computed the amount,
// and the agent checks every id and dollar amount Claude writes against the
// records before using it.

import { z } from 'zod';

// Follow-up answers have no limit in the module; this keeps them readable.
export const ANSWER_MAX = 2_000;

export const ExplanationSchema = z.object({
  claimed: z.string().min(1),
  leftOut: z.string(),
});
export type ExplanationText = z.infer<typeof ExplanationSchema>;

export const AnswerSchema = z.object({ answer: z.string().min(1).max(ANSWER_MAX) });
export type AnswerText = z.infer<typeof AnswerSchema>;

export const EXPLAIN_SYSTEM = `You write the justification a university research lab attaches to a federal payment request (an NIH drawdown, reviewed under "Defend the Spend"). The lab has already spent the money and is asking to be repaid.

The input holds the exact records the grant office's database selected for one grant and one date range: personnel by role and effort, purchases grouped by budget category with subtotals, the total, and anything left out with the reason. The database picked these records and computed every amount; you only describe them.

Write two parts:
- claimed: what the lab is asking to be repaid for. Name the grant and the date range, state the exact total, then go category by category with its subtotal. For each purchase give its request id (as given, e.g. rq-036), what it is, and the research aim it served.
- leftOut: if the input lists anything left out, one or two sentences naming each left-out request id and why, citing the rule "held spending is left out". If nothing was left out, an empty string.

Rules:
- Use only the facts in the input. Copy every id and dollar amount exactly as written there. Never add, round or recompute an amount, and never mention an id that is not in the input.
- Plain English for a federal reviewer. No names of people; describe staff by role and effort.
- claimed and leftOut, joined by one space, must be at most limits.total characters. If space is short, drop item details before dropping ids or amounts.`;

export const ANSWER_SYSTEM = `You draft a university research lab's answer to a federal funder's follow-up question about one payment request (NIH "Defend the Spend" review). A grant manager reads your draft before anything is sent.

The input holds the question and the exact records the payment request claims: each purchase with its request id, vendor, order date, amount, invoice and the research aim it served; the personnel rows; the request's period and total, with the purchases and personnel subtotals that make up that total when the database computed them; anything left out of the request, with the reason; and the grant's end date. Every purchase listed was ordered on and charged to this grant (a share, when given, is the part charged to it) for the research aim given with it, and that is what makes it allocable to the grant.

Rules:
- Answer the question directly from these records only. Quote ids, items, vendors, dates and amounts exactly as written in the input.
- Never add up, round or recompute amounts; quote the subtotals and the total as given (e.g. "purchases $X and personnel $Y make up the $Z total"). Name purchases by their request id; the only ids you may write are the request ids, personnel ids and payment request id in the input, and the request id of a left-out item.
- A left-out item is not claimed. Name it only in a sentence that says it was left out and why.
- If the records can't answer part of the question, say so plainly instead of guessing. Where they do answer it, answer without caveats about what else the records might hold.
- No names of people; describe staff by role and effort.
- Plain English, at most ${ANSWER_MAX} characters.`;
