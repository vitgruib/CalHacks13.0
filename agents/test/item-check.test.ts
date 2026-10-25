// Ask's item check (T103): a person asks, the bookkeeping agent answers with
// Claude before any grant is matched. Claude is faked at the network edge.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { startItemChecks } from '../src/agents/item-check.ts';
import { createLocalDb } from '../src/db/local.ts';
import { oneGrantSeed } from './helpers.ts';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

async function start(answer: (item: string) => Record<string, unknown> | Error) {
  const key = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const cacheDir = mkdtempSync(join(tmpdir(), 'gg-item-'));
  const client = {
    messages: {
      parse: async ({ messages }: { messages: { content: string }[] }) => {
        const out = answer(JSON.parse(messages[0].content).item ?? messages[0].content);
        if (out instanceof Error) throw out;
        return { model: 'claude-haiku-5-5', stop_reason: 'end_turn', parsed_output: out };
      },
    },
  };
  const db = await createLocalDb({ world: { seedJson: oneGrantSeed() } });
  const bookkeeping = await db.connect();
  await bookkeeping.call('register_agent', { role: 'bookkeeping' });
  const agent = startItemChecks({ conn: bookkeeping, itemClaude: { client, mode: 'live', cacheDir } });
  const scientist = await db.connect();
  await scientist.call('register_person', { role: 'scientist', name: 'scientist' });
  cleanup = () => {
    agent.stop();
    db.close();
    rmSync(cacheDir, { recursive: true, force: true });
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = key;
  };
  const askAndWait = async (item: string) => {
    await scientist.call('ask_item_check', { item, purpose: 'for the lab', price: 500 });
    await db.settled();
    await agent.idle();
    await db.settled();
    return scientist.rows('itemCheck').at(-1)!;
  };
  return { askAndWait };
}

test('an_item_claude_flags_comes_back_with_its_reason_and_kind_of_thing', async () => {
  const { askAndWait } = await start(() => ({ verdict: 'flag', why: 'Game consoles are entertainment (2 CFR 200.438).', category: 'entertainment' }));
  const row = await askAndWait('PS5');
  assert.deepEqual(
    { answered: row.answered, verdict: row.verdict, why: row.why, category: row.category },
    { answered: true, verdict: 'flag', why: 'Game consoles are entertainment (2 CFR 200.438).', category: 'entertainment' },
  );
});

test('with_no_claude_answer_the_item_comes_back_unchecked', async () => {
  const { askAndWait } = await start(() => new Error('overloaded'));
  const row = await askAndWait('Nitrile gloves');
  assert.equal(row.answered, true);
  assert.equal(row.verdict, 'unchecked');
});

test('only_a_person_can_ask_and_only_an_agent_can_answer', async () => {
  const db = await createLocalDb({ world: { seedJson: oneGrantSeed() } });
  cleanup = () => db.close();
  const scientist = await db.connect();
  await scientist.call('register_person', { role: 'scientist', name: 'scientist' });
  await scientist.call('ask_item_check', { item: 'Gloves', purpose: '', price: 40 });
  const id = scientist.rows('itemCheck').at(-1)!.id;
  await assert.rejects(scientist.call('answer_item_check', { id, verdict: 'fine', why: '', category: 'lab supplies' }), /Only a registered agent/);
});
