import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { ask, claudeModel } from '../src/claude.ts';
import type { AskOptions } from '../src/claude.ts';

// Every test passes a fake client, so nothing here can reach the API even with
// the fake key set below.

const ENV_NAMES = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'GG_MODEL', 'GG_CLAUDE', 'GG_CLAUDE_CACHE_DIR', 'GG_REUSE_SAVED'];
let savedEnv: Record<string, string | undefined>;
let cacheDir: string;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
  process.env.ANTHROPIC_API_KEY = 'test-key';
  cacheDir = mkdtempSync(join(tmpdir(), 'gg-claude-'));
});

afterEach(() => {
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  rmSync(cacheDir, { recursive: true, force: true });
});

const Verdict = z.object({ allowed: z.boolean(), reason: z.string() });
type Verdict = z.infer<typeof Verdict>;

const SYSTEM = 'You check one purchase against the grant rules you are given. Explain in one sentence.';
const INPUT = { item: 'centrifuge rotor', amount: 1840, grant: 'R01-GM123456' };
const FALLBACK: Verdict = { allowed: false, reason: 'rule check only' };

interface SentRequest {
  model: string;
  max_tokens: number;
  system: Array<{ type: string; text: string; cache_control?: { type: string } }>;
  messages: Array<{ role: string; content: string }>;
  output_config: { format: { type: string; schema: unknown }; effort: string };
}

function fakeClient(reply: () => unknown) {
  const calls: SentRequest[] = [];
  return {
    calls,
    messages: {
      parse: async (request: SentRequest) => {
        calls.push(request);
        return reply();
      },
    },
  };
}

const answering = (parsed: unknown, stopReason = 'end_turn') =>
  fakeClient(() => ({ model: 'claude-sonnet-5-5', stop_reason: stopReason, parsed_output: parsed }));

const throwing = (error: unknown) =>
  fakeClient(() => {
    throw error;
  });

function question(overrides: Partial<AskOptions<Verdict>> = {}): AskOptions<Verdict> {
  return {
    task: 'purchasing.explain',
    system: SYSTEM,
    input: INPUT,
    schema: Verdict,
    fallback: () => FALLBACK,
    cacheDir,
    mode: 'cached',
    ...overrides,
  };
}

const CLAUDE_SAYS: Verdict = { allowed: true, reason: 'Lab equipment is an allowed cost on this grant.' };

test('off_mode_uses_the_fallback_without_asking_claude', async () => {
  const client = answering(CLAUDE_SAYS);
  const answer = await ask(question({ client, mode: 'off' }));
  assert.deepEqual(answer, { value: FALLBACK, by: 'fallback', note: 'off' });
  assert.equal(client.calls.length, 0);
});

test('the_mode_comes_from_GG_CLAUDE_at_call_time', async () => {
  const client = answering(CLAUDE_SAYS);
  process.env.GG_CLAUDE = 'off';
  assert.equal((await ask(question({ client, mode: undefined }))).by, 'fallback');
  process.env.GG_CLAUDE = 'live';
  assert.equal((await ask(question({ client, mode: undefined }))).by, 'claude');
  assert.equal(client.calls.length, 1);
});

test('no_key_falls_back_without_asking_claude', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const client = answering(CLAUDE_SAYS);
  const answer = await ask(question({ client }));
  assert.deepEqual(answer, { value: FALLBACK, by: 'fallback', note: 'no key' });
  assert.equal(client.calls.length, 0);
});

test('an_auth_token_counts_as_a_key', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_AUTH_TOKEN = 'test-token';
  const answer = await ask(question({ client: answering(CLAUDE_SAYS) }));
  assert.equal(answer.by, 'claude');
});

test('a_claude_answer_is_returned_and_saved', async () => {
  const answer = await ask(question({ client: answering(CLAUDE_SAYS) }));
  assert.deepEqual(answer, { value: CLAUDE_SAYS, by: 'claude', model: 'claude-sonnet-5-5' });
  const files = readdirSync(cacheDir);
  assert.equal(files.length, 1);
  assert.match(files[0], /^purchasing\.explain-[0-9a-f]{24}\.json$/);
  const saved = JSON.parse(readFileSync(join(cacheDir, files[0]), 'utf8'));
  assert.equal(saved.task, 'purchasing.explain');
  assert.equal(saved.model, 'claude-sonnet-5-5');
  assert.deepEqual(saved.input, INPUT);
  assert.deepEqual(saved.answer, CLAUDE_SAYS);
  assert.ok(!Number.isNaN(Date.parse(saved.savedAt)));
});

test('cached_mode_returns_the_saved_answer_without_asking_again', async () => {
  await ask(question({ client: answering(CLAUDE_SAYS) }));
  const client = throwing(new Error('should not be called'));
  const answer = await ask(question({ client }));
  assert.deepEqual(answer, { value: CLAUDE_SAYS, by: 'saved', model: 'claude-sonnet-5-5' });
  assert.equal(client.calls.length, 0);
});

test('a_saved_answer_needs_no_key_in_cached_mode', async () => {
  await ask(question({ client: answering(CLAUDE_SAYS) }));
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await ask(question())).by, 'saved');
});

test('offline_mode_with_nothing_saved_uses_the_fallback', async () => {
  const client = answering(CLAUDE_SAYS);
  const answer = await ask(question({ client, mode: 'offline' }));
  assert.deepEqual(answer, { value: FALLBACK, by: 'fallback', note: 'offline, nothing saved' });
  assert.equal(client.calls.length, 0);
});

test('offline_mode_uses_a_saved_answer', async () => {
  await ask(question({ client: answering(CLAUDE_SAYS) }));
  const client = answering({ allowed: false, reason: 'a newer answer' });
  const answer = await ask(question({ client, mode: 'offline' }));
  assert.deepEqual(answer.value, CLAUDE_SAYS);
  assert.equal(answer.by, 'saved');
  assert.equal(client.calls.length, 0);
});

test('live_mode_asks_again_and_saves_the_new_answer', async () => {
  await ask(question({ client: answering(CLAUDE_SAYS), mode: 'live' }));
  const newer = { allowed: false, reason: 'The grant ended last month.' };
  const answer = await ask(question({ client: answering(newer), mode: 'live' }));
  assert.equal(answer.by, 'claude');
  assert.deepEqual(answer.value, newer);
  assert.deepEqual((await ask(question({ mode: 'offline' }))).value, newer);
});

test('live_mode_uses_the_saved_answer_when_claude_fails', async (t) => {
  t.mock.method(console, 'warn', () => {});
  await ask(question({ client: answering(CLAUDE_SAYS), mode: 'live' }));
  const answer = await ask(question({ client: throwing(new Error('network down')), mode: 'live' }));
  assert.deepEqual(answer, { value: CLAUDE_SAYS, by: 'saved', model: 'claude-sonnet-5-5', note: 'Error' });
});

test('a_refusal_falls_back_and_saves_nothing', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const answer = await ask(question({ client: answering(null, 'refusal') }));
  assert.deepEqual(answer, { value: FALLBACK, by: 'fallback', note: 'refusal' });
  assert.equal(readdirSync(cacheDir).length, 0);
});

test('a_failing_call_falls_back_and_never_throws', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const rateLimited = Anthropic.APIError.generate(429, { type: 'error' }, 'rate limited', new Headers());
  const answer = await ask(question({ client: throwing(rateLimited) }));
  assert.deepEqual(answer, { value: FALLBACK, by: 'fallback', note: 'RateLimitError 429' });

  const dropped = new Anthropic.APIConnectionError({ message: 'socket hang up' });
  assert.equal((await ask(question({ client: throwing(dropped) }))).note, 'APIConnectionError');
  assert.equal((await ask(question({ client: throwing(new TypeError('boom')) }))).note, 'TypeError');

  // One short line per failure, naming the task and the error, never the key.
  assert.equal(warn.mock.callCount(), 3);
  const line = String(warn.mock.calls[0].arguments[0]);
  assert.match(line, /purchasing\.explain/);
  assert.match(line, /RateLimitError 429/);
  assert.doesNotMatch(line, /test-key/);
  assert.equal(warn.mock.calls[0].arguments.length, 1);
});

test('a_missing_or_wrong_shaped_answer_is_an_invalid_answer', async (t) => {
  t.mock.method(console, 'warn', () => {});
  for (const parsed of [null, undefined, { allowed: 'yes', reason: 'ok' }, { allowed: true }]) {
    const answer = await ask(question({ client: answering(parsed) }));
    assert.deepEqual(answer, { value: FALLBACK, by: 'fallback', note: 'invalid answer' });
  }
  assert.equal(readdirSync(cacheDir).length, 0);
});

test('a_reply_cut_off_at_max_tokens_falls_back_and_says_it_was_cut_off', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const answer = await ask(question({ client: answering(null, 'max_tokens'), maxTokens: 400 }));
  assert.deepEqual(answer, { value: FALLBACK, by: 'fallback', note: 'cut off at max_tokens 400' });
  assert.match(String(warn.mock.calls[0].arguments[0]), /purchasing\.explain got no usable answer \(cut off at max_tokens 400\), using the fallback/);
  assert.equal(readdirSync(cacheDir).length, 0);
});

test('a_whole_answer_that_ends_on_max_tokens_is_still_used', async () => {
  const answer = await ask(question({ client: answering(CLAUDE_SAYS, 'max_tokens') }));
  assert.equal(answer.by, 'claude');
  assert.deepEqual(answer.value, CLAUDE_SAYS);
});

test('an_answer_the_sdk_cannot_parse_is_an_invalid_answer', async (t) => {
  t.mock.method(console, 'warn', () => {});
  // What the SDK's parse() throws when the reply isn't JSON or fails the schema.
  const unparsable = new Anthropic.AnthropicError('Failed to parse structured output: Unexpected end of JSON input');
  const answer = await ask(question({ client: throwing(unparsable) }));
  assert.equal(answer.note, 'invalid answer');
});

test('the_instructions_are_cached_and_the_facts_go_only_in_the_user_message', async () => {
  const client = answering(CLAUDE_SAYS);
  await ask(question({ client }));
  const [sent] = client.calls;
  assert.deepEqual(sent.system, [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(sent.messages, [{ role: 'user', content: JSON.stringify(INPUT, null, 2) }]);
  assert.doesNotMatch(JSON.stringify(sent.system), /centrifuge|R01-GM123456/);
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.equal(sent.output_config.effort, 'medium');
  assert.equal(sent.max_tokens, 4000);
  assert.equal(sent.model, 'claude-sonnet-5-5');
  assert.ok(!('temperature' in sent) && !('thinking' in sent));
});

test('effort_and_max_tokens_are_passed_through', async () => {
  const client = answering(CLAUDE_SAYS);
  await ask(question({ client, effort: 'low', maxTokens: 1200 }));
  assert.equal(client.calls[0].output_config.effort, 'low');
  assert.equal(client.calls[0].max_tokens, 1200);
});

test('GG_MODEL_changes_the_model_sent_and_where_it_is_saved', async () => {
  await ask(question({ client: answering(CLAUDE_SAYS) }));
  process.env.GG_MODEL = 'claude-opus-5-5';
  assert.equal(claudeModel(), 'claude-opus-5-5');
  const client = answering(CLAUDE_SAYS);
  await ask(question({ client }));
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].model, 'claude-opus-5-5');
  assert.equal(readdirSync(cacheDir).length, 2);
});

test('GG_REUSE_SAVED_uses_the_default_models_saved_answer_before_asking_a_cheaper_model', async () => {
  await ask(question({ client: answering(CLAUDE_SAYS) }));
  process.env.GG_MODEL = 'claude-haiku-5-5';
  process.env.GG_REUSE_SAVED = '1';
  const client = answering({ allowed: false, reason: 'haiku says no' });
  const answer = await ask(question({ client }));
  assert.equal(client.calls.length, 0);
  assert.deepEqual(answer, { value: CLAUDE_SAYS, by: 'saved', model: 'claude-sonnet-5-5' });
});

test('GG_REUSE_SAVED_still_asks_the_cheaper_model_when_nothing_is_saved', async () => {
  process.env.GG_MODEL = 'claude-haiku-5-5';
  process.env.GG_REUSE_SAVED = '1';
  const client = answering(CLAUDE_SAYS);
  const answer = await ask(question({ client }));
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].model, 'claude-haiku-5-5');
  assert.equal(answer.by, 'claude');
});

test('different_inputs_are_saved_separately', async () => {
  await ask(question({ client: answering(CLAUDE_SAYS) }));
  const other = { allowed: false, reason: 'Travel is not allowed on this grant.' };
  await ask(question({ client: answering(other), input: { ...INPUT, item: 'conference flight' } }));
  assert.equal(readdirSync(cacheDir).length, 2);
  assert.deepEqual((await ask(question({ mode: 'offline' }))).value, CLAUDE_SAYS);
});

test('a_saved_answer_the_schema_rejects_counts_as_missing', async () => {
  await ask(question({ client: answering(CLAUDE_SAYS) }));
  const [file] = readdirSync(cacheDir);
  const saved = JSON.parse(readFileSync(join(cacheDir, file), 'utf8'));
  writeFileSync(join(cacheDir, file), JSON.stringify({ ...saved, answer: { allowed: 'maybe' } }));
  assert.equal((await ask(question({ mode: 'offline' }))).by, 'fallback');
  const client = answering(CLAUDE_SAYS);
  assert.equal((await ask(question({ client }))).by, 'claude');
  assert.equal(client.calls.length, 1);
});

test('an_unchanged_answer_does_not_rewrite_its_saved_copy', async () => {
  await ask(question({ client: answering(CLAUDE_SAYS), mode: 'live' }));
  const [file] = readdirSync(cacheDir);
  const before = readFileSync(join(cacheDir, file), 'utf8');
  await new Promise((resolve) => setTimeout(resolve, 5));
  await ask(question({ client: answering(CLAUDE_SAYS), mode: 'live' }));
  assert.equal(readFileSync(join(cacheDir, file), 'utf8'), before);
});

// The real SDK client over a fake fetch: checks the request ask() builds is
// one the SDK accepts, and how the SDK's own errors map to notes.
function sdkClient(status: number, text: string) {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = async (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(JSON.parse(String(init?.body)));
    if (status !== 200) return Response.json({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, { status });
    return Response.json({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-5',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    });
  };
  return { bodies, client: new Anthropic({ apiKey: 'test-key', fetch: fetchImpl as typeof fetch, maxRetries: 0 }) };
}

test('the_real_sdk_client_parses_an_answer_from_the_wire', async () => {
  const { bodies, client } = sdkClient(200, JSON.stringify(CLAUDE_SAYS));
  const answer = await ask(question({ client }));
  assert.deepEqual(answer, { value: CLAUDE_SAYS, by: 'claude', model: 'claude-sonnet-5-5' });
  const [body] = bodies;
  assert.deepEqual(body.system, [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }]);
  const outputConfig = body.output_config as { format: { type: string; schema: { properties: object } }; effort: string };
  assert.equal(outputConfig.format.type, 'json_schema');
  assert.deepEqual(Object.keys(outputConfig.format.schema.properties), ['allowed', 'reason']);
  assert.equal(outputConfig.effort, 'medium');
  assert.ok(!('temperature' in body) && !('thinking' in body));
});

test('the_real_sdk_client_maps_bad_json_and_rate_limits_to_notes', async (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.equal((await ask(question({ client: sdkClient(200, '{"allowed": tr').client }))).note, 'invalid answer');
  assert.equal((await ask(question({ client: sdkClient(200, '{"allowed": 1}').client }))).note, 'invalid answer');
  assert.equal((await ask(question({ client: sdkClient(429, '').client }))).note, 'RateLimitError 429');
});

test('a_fallback_that_breaks_its_schema_is_a_bug_and_throws', async () => {
  const broken = question({ mode: 'off', fallback: () => ({ allowed: 'no' }) as unknown as Verdict });
  await assert.rejects(ask(broken), z.ZodError);
});
