// Ask's item check (T103), run by the bookkeeping agent (T108): a researcher asks
// whether an item is a research cost at all, before any grant is matched, and
// Haiku answers fine or flag with a one-line reason and the kind of thing it
// is. Nothing is bought or held; the request is checked again when it is sent.
// With no Claude answer the check comes back "unchecked", and Ask goes on to
// the grants as before.
//
// The price check (T117) runs in the same answer: for lab supplies, reagents
// and equipment, the item's list price from the saved list or a Haiku web
// search. Code compares it with the asked price; more than twice list (and
// $100 over) flags the item with the vendor's price. A lookup that takes
// past ANSWER_BY_MS is left to finish and save its price for next
// time, so Ask still gets its answer before it stops waiting.

import { ask, type AskOptions } from '../claude.ts';
import type { ItemCheckRow } from '../db/contract.ts';
import { CHECK_CATEGORIES } from '../prompts/purchasing.ts';
import { ITEM_MODEL, ITEM_SYSTEM, ITEM_TASK, ItemAnswer } from '../prompts/item-check.ts';
import { checkPrice, type PriceCheck } from './price-check.ts';
import { workQueue, type AgentContext, type AgentHandle } from './types.ts';

const AGENT = 'bookkeeping';

// Ask waits 10 s in all (web/src/data/live.tsx), so the whole answer is in by
// 8.5 s. Haiku's read takes ~2 s and a fresh price search ~6 s.
const ANSWER_BY_MS = 8_500;

const INJECTION_WHY = 'The request has text addressed to the checker rather than describing the item; the grant manager will read it.';

const dollars = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

async function priceWithin(lookup: Promise<PriceCheck | undefined>, ms: number): Promise<PriceCheck | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([lookup.catch(() => undefined), late]);
  } finally {
    clearTimeout(timer);
  }
}

// Haiku often runs past the length its prompt asks for; cutting it mid-word
// left the researcher a reason ending in "…". Keep it whole, and only a
// runaway answer is cut back, at its last full sentence.
const clip = (text: string, max = 400) => {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const sentences = trimmed.slice(0, max).match(/^.*[.!?]\)?(?=\s)/s)?.[0];
  return sentences ?? `${trimmed.slice(0, max - 1).trim()}…`;
};

export function startItemChecks({
  conn,
  itemClaude,
  priceCatalog,
}: Pick<AgentContext, 'conn'> & {
  // Tests pass a fake client.
  itemClaude?: Pick<AskOptions<unknown>, 'client' | 'mode' | 'cacheDir'>;
  // Tests pass their own saved price list.
  priceCatalog?: string;
}): AgentHandle {
  const queue = workQueue(`${AGENT} item check`);
  let stopped = false;

  async function answer(check: ItemCheckRow): Promise<void> {
    const started = Date.now();
    const { value, by, note } = await ask({
      task: ITEM_TASK,
      system: ITEM_SYSTEM,
      model: ITEM_MODEL,
      input: { item: check.item, price: check.price, purpose: check.purpose, categories: CHECK_CATEGORIES },
      schema: ItemAnswer,
      fallback: () => ({ verdict: 'fine' as const, why: '', category: 'other' as const }),
      effort: 'low',
      maxTokens: 1_000,
      ...itemClaude,
    });
    // Text written to steer the checker is a reason to look, not to wave through.
    if (note === 'prompt injection') {
      await conn.call('answer_item_check', { id: check.id, verdict: 'flag', why: INJECTION_WHY, category: '' });
      return;
    }
    const unchecked = by === 'fallback';
    let verdict: 'fine' | 'flag' | 'unchecked' = unchecked ? 'unchecked' : value.verdict;
    let why = unchecked || value.verdict === 'fine' ? '' : clip(value.why);
    if (verdict === 'fine') {
      const lookup = checkPrice({ item: check.item, category: value.category, price: check.price }, { catalog: priceCatalog, ...itemClaude });
      const price = await priceWithin(lookup, ANSWER_BY_MS - (Date.now() - started));
      if (price?.tooHigh) {
        verdict = 'flag';
        why = clip(`${price.entry.vendor} lists this at ${dollars(price.entry.listPrice)}; ${dollars(check.price)} is more than twice that.`);
      }
    }
    await conn.call('answer_item_check', {
      id: check.id,
      verdict,
      why,
      category: unchecked ? '' : value.category,
    });
  }

  const onAsked = (check: ItemCheckRow) => {
    if (check.answered) return;
    void queue.push(`item check ${check.id}`, async () => {
      if (!stopped) await answer(check);
    });
  };
  for (const check of conn.rows('itemCheck')) onAsked(check);
  const stops = [conn.onInsert('itemCheck', onAsked)];

  return {
    idle: () => queue.idle(),
    stop() {
      stopped = true;
      for (const stop of stops) stop();
    },
  };
}
