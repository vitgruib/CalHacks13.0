// What the report checker asks Claude, and the deterministic answers it falls
// back on. Claude does two things here, both reading and explaining: it
// tells a material correction notice from a minor one, and it writes the
// Inbox explanation for a held paper. The module's checkPaper decides what
// is held; nothing here judges a paper.

import { z } from 'zod';

// ── Is a correction material? ─────────────────────────────────────────────

export interface Notice {
  kind: 'correction' | 'expression_of_concern';
  date: string | null;
  title: string | null;
  source: string;
}

export const CORRECTION_SYSTEM = `You read the correction notices on record for one published paper and say whether the correction is material or minor for a federal grant progress report.

- minor: the notices fix only author names, affiliations, contact details, typos or formatting, and change no data, analysis, figure, table, result or conclusion.
- material: anything that changes data, analyses, figures, tables, results or conclusions.
- If a notice's title doesn't say what changed (many just repeat the paper's title), answer material: a person has to read the notice.

Use only the notices given. Report public records; never suggest misconduct. Reply with the kind and one sentence saying which notice text decided it.`;

export const correctionSchema = z.object({
  kind: z.enum(['material', 'minor']),
  reason: z.string().min(1).max(300),
});
export type CorrectionAnswer = z.infer<typeof correctionSchema>;

// Fixes that change no finding. Kept narrow on purpose: anything else, or a
// title that says nothing, counts as material and goes to a person.
const COSMETIC = /\b(affiliations?|author(?:'s|s')? names?|name of (?:an |one )?author|misspel\w*|spelling|typos?|typographical|orcid|e-?mail|contact details|corresponding address)\b/i;
const SUBSTANTIVE = /\b(data|analys[ie]s|results?|figures?|fig\.|tables?|conclusions?|estimates?|re-?measured|statistic\w*|methods?|abstract|findings?)\b/i;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text);

// A quoted notice title, short enough that every reason fits correctionSchema
// (a real "Correction to: <paper title>" can run past 250 characters).
const QUOTE_MAX = 160;
const quote = (title: string) => clip(title, QUOTE_MAX);

export function fallbackCorrection(notices: Notice[]): CorrectionAnswer {
  const cosmetic = (notice: Notice) =>
    notice.kind === 'correction' && !!notice.title && COSMETIC.test(notice.title) && !SUBSTANTIVE.test(notice.title);
  if (notices.length > 0 && notices.every(cosmetic)) {
    return { kind: 'minor', reason: `The notice only fixes ${COSMETIC.exec(notices[0].title!)![0].toLowerCase()} details: "${quote(notices[0].title!)}".` };
  }
  const first = notices.find((notice) => notice.kind === 'expression_of_concern') ?? notices.find((notice) => notice.title) ?? notices[0];
  if (first?.kind === 'expression_of_concern') return { kind: 'material', reason: `An expression of concern is on record: "${quote(first.title ?? 'untitled')}".` };
  return first?.title
    ? { kind: 'material', reason: `The notice doesn't show a cosmetic-only fix ("${quote(first.title)}"), so it counts as material until a person reads it.` }
    : { kind: 'material', reason: "The notice doesn't say what changed, so it counts as material until a person reads it." };
}

// ── The Inbox explanation for a held paper ───────────────────────────────

export interface CostMove {
  requestId: string;
  orderId?: string;
  item: string;
  amount: number;
  from: string;
  to: string;
  chargedOn: string;
  fixBy: string;
  daysLeft: number;
}

export interface HeldPaper {
  paperId: string;
  title: string;
  doi: string;
  reportGrantId: string;
  creditsGrantId: string;
  // Whether the credited grant is one of the lab's own.
  creditedIsLabGrant: boolean;
  // The module's failed checks, in its words.
  failed: { check: string; detail: string }[];
  // The module's rule for the paper check (its log row).
  rule: string;
  correctionKind?: string;
  costMoves: CostMove[];
  // The credited grant's status as the module keeps it, e.g. when it is frozen.
  creditedGrantStatus?: string;
  creditedGrantFrozen?: boolean;
}

export const usd = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;

export function daysLeftPhrase(move: Pick<CostMove, 'daysLeft' | 'fixBy'>): string {
  if (move.daysLeft > 0) return `${move.daysLeft} day${move.daysLeft === 1 ? '' : 's'} left on the 90-day limit (fix by ${move.fixBy})`;
  if (move.daysLeft === 0) return `the 90-day limit ends today (${move.fixBy})`;
  return `${-move.daysLeft} day${move.daysLeft === -1 ? '' : 's'} past the 90-day limit, which ended ${move.fixBy}`;
}

export const moveLine = (move: CostMove) => `move ${move.requestId}'s ${usd(move.amount)} from ${move.from} to ${move.to}`;

/** What the grant manager is asked to do, one line per failed check. */
export function asksFor(paper: HeldPaper): string[] {
  const asks: string[] = [];
  for (const { check } of paper.failed) {
    if (check === 'Credits this grant') {
      if (paper.costMoves.length > 0) {
        const first = paper.costMoves.reduce((a, b) => (b.daysLeft < a.daysLeft ? b : a));
        const when = first.daysLeft >= 0 ? ` by ${first.fixBy}` : ` now (the 90-day limit ended ${first.fixBy})`;
        // Approve only marks the paper a note (the module moves no money), so
        // the person makes the move in the ledger and approves after.
        const moves = paper.costMoves.map(moveLine).join(' and ');
        asks.push(
          `${moves[0].toUpperCase()}${moves.slice(1)} in the ledger${when} (Grant Test Auto doesn't move charges), ` +
            `list the paper in ${paper.creditsGrantId}'s report, then approve.`,
        );
      } else if (paper.creditedIsLabGrant) {
        asks.push(`List the paper in ${paper.creditsGrantId}'s report instead, or confirm with the authors that it also credits ${paper.reportGrantId}.`);
      } else {
        asks.push(`Check the paper's acknowledgments and take it out of ${paper.reportGrantId}'s report if it doesn't belong there.`);
      }
    } else if (check === 'Has a PubMed Central ID') {
      asks.push('Get the paper deposited in PubMed Central (or find its PMCID) and add the PMCID to the report.');
    } else if (check === 'No undisclosed correction') {
      asks.push(`Disclose the ${paper.correctionKind === 'retraction' ? 'retraction' : 'correction'} in the report: what changed and when.`);
    } else {
      asks.push(`Fix "${check}" before the report goes out.`);
    }
  }
  return asks;
}

export function holdTitle(paper: HeldPaper): string {
  const parts = paper.failed.map(({ check }) => {
    if (check === 'Credits this grant') {
      // Not "move …?": the Approve button beside it moves no money.
      const moves = paper.costMoves.map((move) => `${move.requestId}'s ${usd(move.amount)}`).join(' and ');
      return `credits ${paper.creditsGrantId}, not ${paper.reportGrantId}${moves ? `: ${moves} ${paper.costMoves.length === 1 ? 'is' : 'are'} charged to the wrong grant` : ''}`;
    }
    if (check === 'Has a PubMed Central ID') return 'has no PubMed Central ID';
    if (check === 'No undisclosed correction') return `lists a ${paper.correctionKind === 'retraction' ? 'retraction' : 'correction'} the report doesn't disclose`;
    return `fails "${check}"`;
  });
  return `Paper ${paper.paperId} ${parts.join('; ')}`;
}

// Holds have no length limit in the module; this keeps the Inbox readable.
export const WHY_MAX = 1200;

export function fallbackExplanation(paper: HeldPaper): string {
  const lines = [`${paper.paperId} ("${paper.title}") is in ${paper.reportGrantId}'s progress report.`];
  for (const { check, detail } of paper.failed) {
    lines.push(`The check "${check}" failed: ${detail}`);
    if (check === 'Credits this grant') {
      if (!paper.creditedIsLabGrant) {
        lines.push(`${paper.creditsGrantId} is not one of the lab's grants, so there is no cost to move.`);
      }
      for (const move of paper.costMoves) {
        lines.push(`Its cost ${move.requestId} (${usd(move.amount)}) was charged to ${move.from} on ${move.chargedOn}. Proposed fix: ${moveLine(move)}; ${daysLeftPhrase(move)}.`);
      }
      if (paper.costMoves.length > 0 && paper.creditedGrantFrozen) lines.push(`Note: ${paper.creditsGrantId} is frozen right now.`);
    }
    if (check === 'No undisclosed correction') {
      lines.push(`Rule: ${paper.rule}, and this one is ${paper.correctionKind === 'retraction' ? 'a retraction' : (paper.correctionKind ?? 'material')}.`);
    }
  }
  lines.push(`To do: ${asksFor(paper).join(' ')}`);
  // The module's approve only marks the paper a note; it moves no money.
  lines.push(
    paper.costMoves.length > 0
      ? 'Approve once the charge is moved (the paper then shows as a note); reject to keep it held.'
      : 'Approve once it is fixed (the paper then shows as a note); reject to keep it held.',
  );
  return clip(lines.join(' '), WHY_MAX);
}

export const EXPLAIN_SYSTEM = `You write the explanation a university grant manager reads in their Inbox when a paper in a grant's progress report is held.

The input has the module's failed checks (its exact words), what the grant manager is asked to do, any proposed cost move with exact amounts, ids and days left, and a draft. Rewrite the draft in plain English:
- name each failed check the way the module does, in quotes, and say what the public record shows;
- keep every id, amount, date and day count exactly as given; add no numbers of your own;
- say what to do and what approve and reject mean, as the draft does;
- report public records only; never suggest misconduct, and name no people;
- at most 900 characters.`;

export const explainSchema = z.object({ why: z.string().min(1).max(WHY_MAX) });

/** Ids and numbers an explanation must carry; one written by Claude that drops any of them is not used. */
export function mustMention(paper: HeldPaper): string[] {
  const tokens = [paper.paperId, ...paper.failed.map(({ check }) => check)];
  for (const move of paper.costMoves) tokens.push(move.requestId, usd(move.amount), move.from, move.to, String(Math.abs(move.daysLeft)));
  return tokens;
}
