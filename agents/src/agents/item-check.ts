// Ask's item check (T103), run by the bookkeeping agent (T108): a researcher asks
// whether an item is a research cost at all, before any grant is matched, and
// Haiku answers fine or flag with a one-line reason and the kind of thing it
// is. Nothing is bought or held; the request is checked again when it is sent.
// With no Claude answer the check comes back "unchecked", and Ask goes on to
// the grants as before.

import { ask, type AskOptions } from '../claude.ts';
import type { ItemCheckRow } from '../db/contract.ts';
import { CHECK_CATEGORIES } from '../prompts/purchasing.ts';
import { ITEM_MODEL, ITEM_SYSTEM, ITEM_TASK, ItemAnswer } from '../prompts/item-check.ts';
import { workQueue, type AgentContext, type AgentHandle } from './types.ts';

const AGENT = 'bookkeeping';

const clip = (text: string, max = 160) => (text.length <= max ? text.trim() : `${text.slice(0, max - 1).trim()}…`);

export function startItemChecks({
  conn,
  itemClaude,
}: Pick<AgentContext, 'conn'> & {
  // Tests pass a fake client.
  itemClaude?: Pick<AskOptions<unknown>, 'client' | 'mode' | 'cacheDir'>;
}): AgentHandle {
  const queue = workQueue(`${AGENT} item check`);
  let stopped = false;

  async function answer(check: ItemCheckRow): Promise<void> {
    const { value, by } = await ask({
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
    const unchecked = by === 'fallback';
    await conn.call('answer_item_check', {
      id: check.id,
      verdict: unchecked ? 'unchecked' : value.verdict,
      why: unchecked || value.verdict === 'fine' ? '' : clip(value.why),
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
