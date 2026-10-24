// Claude's note on an invoice the module held (P4): which records conflict
// and what evidence is missing before the grant manager decides. The module
// has already matched the invoice and its finding and numbers are final;
// Claude only explains. A note that names a dollar amount, record id or date
// that isn't in the records is dropped, and the Inbox item keeps the module's
// own text.

import { z } from 'zod';

import { ask, type ClaudeClient, type ClaudeMode } from '../claude.ts';
import type { ApprovalRow, InvoiceRow, OrderRow } from '../db/contract.ts';

export const NOTE_MAX = 400;

export const SYSTEM = `You help a university research lab's grant manager decide on a vendor invoice that the lab's bookkeeping system has put on hold.

The system has already matched the invoice to its order and approval and found the problem. Its finding, the rule it cited and every number are final: do not recheck them, recompute them or contradict them.

Write a short note for the grant manager, at most 3 sentences and under ${NOTE_MAX} characters, in plain English, that:
- names the records that conflict, by their ids (invoice, order, approval);
- says what evidence is missing, or what to ask the vendor, before deciding.

Rules:
- Use only ids, dates and dollar amounts that appear in the input, written exactly as given (amounts like $6,200).
- Do not calculate new amounts: no differences, totals or percentages.
- Do not repeat the finding word for word; the grant manager already sees it.
- Do not say whether to pay, approve or reject the invoice. The grant manager decides.
- Do not name any person.`;

export const NoteSchema = z.object({ note: z.string() });
export type Note = z.infer<typeof NoteSchema>;

/** One held invoice and the rows the module matched it against. */
export interface HeldInvoice {
  invoice: InvoiceRow;
  order?: OrderRow;
  approvals: ApprovalRow[];
  /** The module's mismatch, as it wrote it on the invoice and the hold. */
  finding: string;
  /** The rule the module cited in its log row for this check. */
  rule?: string;
  /** What was bought, from the order's request. */
  item?: string;
}

// The facts Claude sees. Only plain row fields, so the saved answer's key is
// the same on every run of the same world.
export function noteInput(held: HeldInvoice) {
  const { invoice, order, approvals } = held;
  return {
    finding: held.finding,
    rule: held.rule ?? null,
    item: held.item ?? null,
    invoice: { id: invoice.id, vendor: invoice.vendor, amount: invoice.amount, received: invoice.received },
    order: order
      ? {
          id: order.id,
          requestId: order.requestId,
          grantId: order.grantId,
          amount: order.amount,
          changedAmount: order.changedAmount ?? null,
          placed: order.placed,
          state: order.state,
          canceledOn: order.canceledOn ?? null,
        }
      : null,
    approvals: approvals.map((approval) => ({ id: approval.id, amount: approval.amount, by: approval.by, day: approval.day })),
    timeline: invoice.timeline,
  };
}

const AMOUNT = /\$\s?(\d[\d,]*(?:\.\d+)?)/g;
const RECORD_ID = /\b(?:inv|ap|rq|o)-?\d+\b/g;
const GRANT_ID = /\b[A-Z]\d{2}[A-Z]{2,4}\d{6}\b/g;
const DAY = /\b\d{4}-\d{2}-\d{2}\b/g;

/** Why a note can't be shown (an amount, id or date not in the records), or undefined when it can. */
export function noteProblem(note: string, held: HeldInvoice): string | undefined {
  const { invoice, order, approvals } = held;
  if (note.length > NOTE_MAX) return `${note.length} characters, over ${NOTE_MAX}`;

  const amounts = [invoice.amount, order?.amount, order?.changedAmount, ...approvals.map((a) => a.amount)].filter(
    (amount): amount is number => amount !== undefined,
  );
  for (const match of note.matchAll(AMOUNT)) {
    const amount = Number(match[1].replace(/,/g, ''));
    if (!amounts.some((known) => Math.abs(known - amount) < 0.005)) return `${match[0].trim()} is not an amount in the records`;
  }

  const ids = new Set([invoice.id, invoice.orderId, order?.requestId, order?.grantId, ...approvals.map((a) => a.id)]);
  for (const match of [...note.matchAll(RECORD_ID), ...note.matchAll(GRANT_ID)]) {
    if (!ids.has(match[0])) return `${match[0]} is not one of the records`;
  }

  const days = new Set([
    invoice.received,
    order?.placed,
    order?.canceledOn,
    ...approvals.map((a) => a.day),
    ...invoice.timeline.map((entry) => entry.day),
  ]);
  for (const match of note.matchAll(DAY)) {
    if (!days.has(match[0])) return `${match[0]} is not a date in the records`;
  }
  return undefined;
}

export interface NoteOptions {
  client?: ClaudeClient;
  mode?: ClaudeMode;
  cacheDir?: string;
}

/**
 * Claude's note on a held invoice, or undefined when Claude isn't used (the
 * fallback) or its note fails noteProblem. Never throws because of Claude.
 */
export async function noteOnHeldInvoice(held: HeldInvoice, options: NoteOptions = {}): Promise<string | undefined> {
  const answer = await ask<Note>({
    task: 'invoices.note',
    system: SYSTEM,
    input: noteInput(held),
    schema: NoteSchema,
    // No note: the Inbox item keeps the module's text unchanged.
    fallback: () => ({ note: '' }),
    effort: 'low',
    maxTokens: 1000,
    ...options,
  });
  const note = answer.value.note.trim();
  if (answer.by === 'fallback' || !note) return undefined;
  const problem = noteProblem(note, held);
  if (problem) {
    console.warn(`invoices: dropped Claude's note on ${held.invoice.id} (${problem}); the Inbox item keeps the module's text`);
    return undefined;
  }
  return note;
}
