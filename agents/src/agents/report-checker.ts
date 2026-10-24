// The payment and report agent's progress report checker (P7, docs/MASTER-PLAN.md
// §3.5). For each paper a progress report lists, it looks up the public record
// (Crossref and PubMed; the sim world's own registry for its made-up DOIs) and
// records what it says: which grant the paper credits, its PubMed Central ID,
// and any correction or retraction notice. Track A's checkPaper decides ok,
// note or held, and puts a held paper in the Inbox. The agent then rewrites
// that Inbox item so it says what to do, and, when a paper credits another lab
// grant than the one whose budget paid for it, proposes moving the cost with
// the days left on the 90-day limit. It reports public records only.

import { ask } from '../claude.ts';
import type { Correction, Evidence, HoldRow, ReportPaperRow } from '../db/contract.ts';
import {
  asksFor,
  CORRECTION_SYSTEM,
  correctionSchema,
  daysLeftPhrase,
  EXPLAIN_SYSTEM,
  explainSchema,
  fallbackCorrection,
  fallbackExplanation,
  holdTitle,
  moveLine,
  mustMention,
  type CostMove,
  type HeldPaper,
  type Notice,
} from '../prompts/report-checker.ts';
import { creditsGrant, type PaperRecord, type PaperUpdate } from '../sources/papers.ts';
import { createSimPaperLookup, isSimPaperLookup } from '../sources/sim-papers.ts';
import { workQueue, type AgentContext, type AgentHandle } from './types.ts';

const AGENT = 'report checker';

// Track A's date helpers, so the days left are the module's own date math.
// Loaded by path at run time (as db/local.ts loads the module): rules.ts
// imports './vocab' without an extension, which this package's NodeNext
// typecheck rejects, so its two signatures are restated here.
interface RulesDates {
  addDays(day: string, n: number): string;
  daysBetween(from: string, to: string): number;
}
const RULES = new URL('../../../server/src/rules.ts', import.meta.url).href;
const { addDays, daysBetween } = (await import(RULES)) as RulesDates;

// NIH wants a charge on the wrong grant moved within 90 days (WashU Single
// Audit finding 2023-001). Counted from the charge, as sim/answer-key.json does.
export const COST_TRANSFER_DAYS = 90;
// The rule the module cites for every paper check (its record_paper_facts log row).
const PAPER_RULE = 'Only a material correction holds the report';
// What a paper credits when neither PubMed nor Crossref lists any grant.
export const NO_GRANT_ON_RECORD = 'none on record';
// The evidence row that marks an Inbox item this agent has already explained.
const TO_DO = 'What to do';

/**
 * The grant the public record says a paper credits: the report's own grant
 * when the paper credits it, else another of the lab's grants, else the first
 * grant it lists.
 */
export function creditedGrant(record: Pick<PaperRecord, 'grantsCredited'>, reportGrantId: string, labGrantIds: string[]): string {
  const credits = (grantId: string) => record.grantsCredited.includes(grantId) || creditsGrant(record, grantId);
  if (credits(reportGrantId)) return reportGrantId;
  return labGrantIds.find((grantId) => grantId !== reportGrantId && credits(grantId)) ?? record.grantsCredited[0] ?? NO_GRANT_ON_RECORD;
}

interface DistinctNotice extends Notice {
  kind: 'correction' | 'expression_of_concern';
}
type Kinded = { kind: PaperUpdate['kind']; date: string | null; title: string | null; source: string };

// Crossref and PubMed often report the same notice; count it once.
function distinct(updates: PaperUpdate[]): Kinded[] {
  const seen = new Map<string, Kinded>();
  for (const update of updates) {
    if (update.kind === 'other') continue;
    const key = update.noticeDoi?.toLowerCase() ?? `${update.kind}:${(update.title ?? '').toLowerCase().replace(/[\s.]+$/, '')}`;
    const known = seen.get(key);
    if (known) {
      if (!known.source.includes(update.source)) known.source += ` and ${update.source}`;
      continue;
    }
    seen.set(key, { kind: update.kind, date: update.date, title: update.title, source: update.source });
  }
  return [...seen.values()];
}

const LABEL = { correction: 'Correction', retraction: 'Retraction', expression_of_concern: 'Expression of concern', other: 'Notice' } as const;
const NOTE_MAX = 400;

// The notices as one sentence the module can quote, e.g. "Correction (2026-03-02): ...".
export function noteOf(notices: Kinded[]): string {
  const text = notices
    .map((notice) => `${LABEL[notice.kind]} (${notice.date ?? 'undated'}): ${(notice.title ?? 'no title on record').replace(/([^.!?])$/, '$1.')}`)
    .join(' ');
  return text.length > NOTE_MAX ? `${text.slice(0, NOTE_MAX - 3).trimEnd()}...` : text;
}

/**
 * The correction to record: the public notices, how serious they are, and
 * whether the lab's report already discloses it (from the report itself).
 */
export async function correctionFrom(
  report: Pick<ReportPaperRow, 'correction'>,
  record: Pick<PaperRecord, 'doi' | 'title' | 'updates'>,
): Promise<{ correction?: Correction; assessment?: string }> {
  const notices = distinct(record.updates);
  if (notices.length === 0) return {};
  const disclosed = report.correction?.disclosed ?? false;
  const retractions = notices.filter((notice) => notice.kind === 'retraction');
  if (retractions.length > 0) return { correction: { kind: 'retraction', disclosed, note: noteOf(retractions) } };

  const others = notices as DistinctNotice[];
  // An expression of concern isn't a correction a reader can weigh; a person decides.
  const answer = others.some((notice) => notice.kind === 'expression_of_concern')
    ? fallbackCorrection(others)
    : (
        await ask({
          task: 'report-checker.correction',
          system: CORRECTION_SYSTEM,
          input: { paper: { doi: record.doi, title: record.title }, notices: others },
          schema: correctionSchema,
          fallback: () => fallbackCorrection(others),
          effort: 'low',
          maxTokens: 1000,
        })
      ).value;
  return { correction: { kind: answer.kind, disclosed, note: noteOf(others) }, assessment: answer.reason };
}

const mentionsAll = (text: string, tokens: string[]) => tokens.every((token) => text.toLowerCase().includes(token.toLowerCase()));

export function startReportChecker(ctx: AgentContext): AgentHandle {
  const { conn, tracker } = ctx;
  const papers = isSimPaperLookup(ctx.papers) ? ctx.papers : createSimPaperLookup({ real: ctx.papers });
  const queue = workQueue(AGENT);
  const waiting = new Set<string>();
  let stopped = false;

  const paper = (id: string) => conn.rows('reportPaper').find((row) => row.id === id);
  const openHold = (id: string): HoldRow | undefined =>
    conn.rows('hold').find((hold) => hold.open && hold.kind === 'report' && hold.refId === id);

  function costMovesFor(row: ReportPaperRow, to: string): CostMove[] {
    const today = conn.today();
    const moves: CostMove[] = [];
    for (const requestId of row.costRequestIds) {
      const request = conn.rows('request').find((r) => r.id === requestId);
      const orders = conn.rows('order').filter((o) => o.requestId === requestId && o.grantId === row.grantId && o.state !== 'canceled');
      const charges: Array<{ orderId?: string; amount: number; chargedOn: string }> =
        orders.length > 0
          ? orders.map((o) => ({ orderId: o.id, amount: o.changedAmount ?? o.amount, chargedOn: o.placed }))
          : request && (request.chargedGrantId ?? request.grantId) === row.grantId && (request.state === 'bought' || request.state === 'rerouted')
            ? [{ amount: request.price, chargedOn: request.day }]
            : [];
      for (const charge of charges) {
        const fixBy = addDays(charge.chargedOn, COST_TRANSFER_DAYS);
        moves.push({
          requestId, orderId: charge.orderId, item: request?.item ?? requestId, amount: charge.amount,
          from: row.grantId, to, chargedOn: charge.chargedOn, fixBy, daysLeft: daysBetween(today, fixBy),
        });
      }
    }
    return moves;
  }

  async function grantStatus(grantId: string): Promise<{ text: string; frozen: boolean } | undefined> {
    // Read the sources first, so the status quoted next to a cost move isn't stale.
    await tracker.refresh(grantId).catch((error: unknown) => {
      console.error(`${AGENT}: could not refresh ${grantId}:`, error instanceof Error ? error.message : error);
    });
    const grant = conn.rows('grant').find((g) => g.id === grantId);
    if (!grant) return undefined;
    const status = grant.status.replace(/_/g, ' ');
    return {
      text: grant.frozen ? `${status}, spending frozen. ${grant.frozenReason ?? ''}`.trim() : `${status}, not frozen.`,
      frozen: grant.frozen,
    };
  }

  // A held paper's Inbox item, rewritten to say what to do.
  async function explain(id: string, record?: PaperRecord | null, assessment?: string) {
    const row = paper(id);
    const hold = openHold(id);
    if (!row?.checked || row.result !== 'held' || !hold || hold.evidence.some((e) => e.label === TO_DO)) return;

    const failed = row.checks.filter((c) => !c.pass).map(({ check, detail }) => ({ check, detail }));
    const creditedIsLabGrant = conn.rows('grant').some((g) => g.id === row.creditsGrantId);
    const creditFailed = failed.some((c) => c.check === 'Credits this grant');
    const costMoves = creditFailed && creditedIsLabGrant ? costMovesFor(row, row.creditsGrantId) : [];
    const status = costMoves.length > 0 ? await grantStatus(row.creditsGrantId) : undefined;
    const held: HeldPaper = {
      paperId: row.id, title: row.title, doi: row.doi, reportGrantId: row.grantId, creditsGrantId: row.creditsGrantId,
      creditedIsLabGrant, failed, rule: PAPER_RULE, correctionKind: row.correction?.kind, costMoves,
      creditedGrantStatus: status?.text, creditedGrantFrozen: status?.frozen,
    };
    const draft = fallbackExplanation(held);
    const answer = await ask({
      task: 'report-checker.explain',
      system: EXPLAIN_SYSTEM,
      input: { ...held, asks: asksFor(held), draft },
      schema: explainSchema,
      fallback: () => ({ why: draft }),
    });
    let why = answer.value.why;
    if (!mentionsAll(why, mustMention(held))) {
      console.warn(`${AGENT}: the explanation for ${id} dropped an id or amount; using the template`);
      why = draft;
    }

    const evidence: Evidence[] = [...hold.evidence];
    for (const move of costMoves) {
      evidence.push(
        { label: 'Proposed cost move', value: `${moveLine(move)} (${move.orderId ? `${move.orderId}, ` : ''}charged ${move.chargedOn})` },
        { label: '90-day limit', value: `Charged ${move.chargedOn}: ${daysLeftPhrase(move)}` },
      );
    }
    if (held.creditedGrantStatus) evidence.push({ label: `${row.creditsGrantId} now`, value: held.creditedGrantStatus });
    if (assessment && failed.some((c) => c.check === 'No undisclosed correction')) evidence.push({ label: 'Why the correction counts', value: assessment });
    if (record?.urls.length) evidence.push({ label: 'Public record', value: record.urls.join(' ') });
    evidence.push({ label: TO_DO, value: asksFor(held).join(' ') });

    // A person may have decided it while Claude was writing.
    if (stopped || openHold(id)?.id !== hold.id) return;
    await conn.call('raise_hold', {
      kind: 'report', refId: row.id, grantId: row.grantId, title: holdTitle(held), why, evidence,
      options: hold.options.length > 0 ? hold.options : ['approve', 'reject'],
    });
  }

  async function unknownDoi(row: ReportPaperRow) {
    const title = `Paper ${row.id}'s DOI has no public record`;
    // Asked once per DOI. A hold the grant manager has decided stays decided:
    // approving it marks the paper a note, an update that lands back here.
    const asked = conn
      .rows('hold')
      .some((hold) => hold.kind === 'report' && hold.refId === row.id && hold.title === title && hold.evidence.some((e) => e.label === 'DOI' && e.value === row.doi));
    if (asked) return;
    await conn.call('raise_hold', {
      kind: 'report', refId: row.id, grantId: row.grantId, title,
      why:
        `${row.id} ("${row.title}") is in ${row.grantId}'s progress report with DOI ${row.doi}, but Crossref has no record of that DOI, ` +
        `so its grant credit, PubMed Central ID and corrections can't be checked. Check the DOI in the report. ` +
        'Approve once it is fixed; reject to keep it held.',
      evidence: [{ label: 'Paper', value: row.title }, { label: 'DOI', value: row.doi }, { label: TO_DO, value: 'Check the DOI in the report.' }],
      options: ['approve', 'reject'],
    });
  }

  // A lookup that throws (the record can't be reached, or the DOI isn't one)
  // would leave the paper unchecked with nothing in the Inbox. Asked once per
  // DOI; a restart, a reloaded world or the grant manager's approval looks it
  // up again.
  async function lookupFailed(row: ReportPaperRow, error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`${AGENT}: paper ${row.id} (${row.doi}) failed: ${reason}`);
    const title = `Paper ${row.id}'s public record couldn't be read`;
    const asked = conn
      .rows('hold')
      .some((hold) => hold.kind === 'report' && hold.refId === row.id && hold.title === title && hold.evidence.some((e) => e.label === 'DOI' && e.value === row.doi));
    if (asked || stopped) return;
    await conn.call('raise_hold', {
      kind: 'report', refId: row.id, grantId: row.grantId, title,
      why:
        `${row.id} ("${row.title}") is in ${row.grantId}'s progress report with DOI ${row.doi}, but its public record couldn't be read, ` +
        `so its grant credit, PubMed Central ID and corrections aren't checked yet. Check the DOI in the report; ` +
        'approve to look it up again, reject to keep it held.',
      evidence: [
        { label: 'Paper', value: row.title },
        { label: 'DOI', value: row.doi },
        { label: 'Lookup error', value: reason.length > 300 ? `${reason.slice(0, 297)}...` : reason },
        { label: TO_DO, value: 'Check the DOI in the report, then approve to look it up again.' },
      ],
      options: ['approve', 'reject'],
    });
  }

  async function check(id: string) {
    const row = paper(id);
    if (!row || row.checked) return;
    let record: PaperRecord | null;
    try {
      record = await papers.lookup(row.doi);
    } catch (error) {
      return lookupFailed(row, error);
    }
    // The world may have changed while the lookup ran.
    const now = paper(id);
    if (stopped || !now || now.checked || now.doi !== row.doi) return;
    if (record === null) return unknownDoi(now);

    const creditsGrantId = creditedGrant(record, now.grantId, conn.rows('grant').map((g) => g.id));
    const { correction, assessment } = await correctionFrom(now, record);
    if (stopped) return;
    await conn.call('record_paper_facts', { paperId: id, creditsGrantId, pmcid: record.pmcid ?? undefined, correction });
    await explain(id, record, assessment);
  }

  // One job per unchecked paper; a paper reloaded by a seed is checked again.
  const queueCheck = (row: ReportPaperRow) => {
    if (row.checked || waiting.has(row.id)) return;
    waiting.add(row.id);
    void queue.push(`paper ${row.id} (${row.doi})`, async () => {
      waiting.delete(row.id);
      if (!stopped) await check(row.id);
    });
  };

  for (const row of conn.rows('reportPaper')) {
    if (!row.checked) queueCheck(row);
    // Held before a restart but never explained.
    else if (row.result === 'held') void queue.push(`explain ${row.id}`, () => explain(row.id));
  }
  const stops = [
    conn.onInsert('reportPaper', queueCheck),
    // load_seed replaces a paper in place, which arrives as an update.
    conn.onUpdate('reportPaper', (_before, after) => queueCheck(after)),
  ];

  return {
    idle: () => queue.idle(),
    stop() {
      stopped = true;
      for (const stop of stops) stop();
    },
  };
}
