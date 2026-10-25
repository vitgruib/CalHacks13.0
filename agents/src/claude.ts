// The one way an agent asks Claude something. Claude only reads, matches and
// explains; the rules and the money math live elsewhere. So every question
// carries a deterministic fallback, and the demo runs with no API key and no
// network. Answers are saved in agents/cache/claude/ so a demo run repeats
// exactly and costs nothing the second time.
//
// GG_CLAUDE=cached (default): use the saved answer if there is one, else ask
//   Claude and save what it says.
// GG_CLAUDE=live: always ask Claude, then save the answer.
// GG_CLAUDE=offline: saved answer or fallback; never calls.
// GG_CLAUDE=off: fallback only. The test script sets this so tests can never
//   reach the network.
// GG_MODEL overrides the model, GG_CLAUDE_CACHE_DIR the saved answers' folder.
// GG_REUSE_SAVED=1: with GG_MODEL set (say, a cheaper model), cached and offline
//   modes use the default model's saved answer when the new model has none, so
//   the team's checked answers still play and only new questions cost a call.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

export type ClaudeMode = 'cached' | 'live' | 'offline' | 'off';

// What ask() needs from a client. The real SDK client fits; tests pass a fake.
export interface ClaudeClient {
  messages: { parse: (...args: any[]) => Promise<any> };
}

export interface AskOptions<T> {
  task: string; // e.g. 'purchasing.explain'; names the saved file and the log line
  system: string; // stable instructions, sent as the cached prompt prefix
  input: unknown; // the facts for this one question; only ever in the user message
  schema: z.ZodType<T>;
  fallback: () => T; // the deterministic answer when Claude can't be used
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  // A task that always runs on one model (e.g. the price check on Haiku).
  // GG_MODEL and GG_REUSE_SAVED don't apply to it.
  model?: string;
  // Server tools Claude may use for this question (e.g. web search).
  tools?: Anthropic.ToolUnion[];
  // A last check on Claude's answer against the whole reply (e.g. the link it
  // gives came from its own search results); false makes it an invalid answer.
  accept?: (value: T, message: unknown) => boolean;
  client?: ClaudeClient;
  cacheDir?: string;
  mode?: ClaudeMode;
}

export interface Answer<T> {
  value: T;
  by: 'claude' | 'saved' | 'fallback';
  model?: string; // set when by is claude or saved
  // Why Claude's own answer wasn't used: 'off' | 'no key' |
  // 'offline, nothing saved' | 'refusal' | 'invalid answer' |
  // '<ErrorClass> <status>'. Also set on a saved answer that stood in for a
  // failed live call.
  note?: string;
}

interface SavedAnswer<T> {
  value: T;
  model: string;
}

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const DEFAULT_CACHE = fileURLToPath(new URL('../cache/claude', import.meta.url));
const MODES: readonly string[] = ['cached', 'live', 'offline', 'off'] satisfies ClaudeMode[];

export function claudeModel(): string {
  return process.env.GG_MODEL || DEFAULT_MODEL;
}

function modeFromEnv(): ClaudeMode {
  const mode = process.env.GG_CLAUDE ?? 'cached';
  return MODES.includes(mode) ? (mode as ClaudeMode) : 'cached';
}

function hasKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let sharedClient: Anthropic | undefined;

function defaultClient(): Anthropic {
  // The SDK reads the key from the environment itself. Its own timeout is 10
  // minutes; a stuck call should fall back well before that.
  sharedClient ??= new Anthropic({ timeout: 60_000 });
  return sharedClient;
}

function cachePath(dir: string, task: string, parts: string[]): string {
  const key = createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 24);
  return join(dir, `${task.replace(/[^a-z0-9.-]/gi, '_')}-${key}.json`);
}

function readSavedFile(path: string): { model?: unknown; answer?: unknown } | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

// The key already covers the schema's JSON Schema, but checks it can't express
// (refinements) and hand-edited files still need the schema's say.
function readSaved<T>(path: string, schema: z.ZodType<T>): SavedAnswer<T> | undefined {
  const saved = readSavedFile(path);
  if (saved == null) return undefined;
  const parsed = schema.safeParse(saved.answer);
  return parsed.success ? { value: parsed.data, model: String(saved.model) } : undefined;
}

function save(path: string, record: { task: string; model: string; input: unknown; answer: unknown }): void {
  // An unchanged answer keeps its file as is, so live runs don't churn the
  // committed cache with nothing but new savedAt stamps.
  if (JSON.stringify(readSavedFile(path)?.answer) === JSON.stringify(record.answer)) return;
  const { task, model, input, answer } = record;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ task, model, savedAt: new Date().toISOString(), input, answer }, null, 2));
  } catch (error) {
    // The answer is still good for this run; only the saved copy is missing.
    console.warn(`claude: ${task} answer not saved (${errorName(error)})`);
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

// API failures are APIError subclasses with a status (none for a dropped
// connection). The SDK throws a plain AnthropicError when the reply isn't JSON
// or fails the schema, which is an invalid answer, not an outage.
function errorNote(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return error.status === undefined ? errorName(error) : `${errorName(error)} ${error.status}`;
  }
  if (error instanceof Anthropic.AnthropicError) return 'invalid answer';
  return errorName(error);
}

// A fallback that throws or breaks its own schema is a bug in the caller, so
// that one is allowed to throw.
function fromFallback<T>(options: AskOptions<T>, note: string): Answer<T> {
  return { value: options.schema.parse(options.fallback()), by: 'fallback', note };
}

function fromSaved<T>(saved: SavedAnswer<T>, note?: string): Answer<T> {
  const answer: Answer<T> = { value: saved.value, by: 'saved', model: saved.model };
  if (note !== undefined) answer.note = note;
  return answer;
}

function whenClaudeFails<T>(options: AskOptions<T>, note: string, saved: SavedAnswer<T> | undefined): Answer<T> {
  console.warn(`claude: ${options.task} got no usable answer (${note}), using the ${saved ? 'saved answer' : 'fallback'}`);
  return saved ? fromSaved(saved, note) : fromFallback(options, note);
}

// Never throws because of Claude (no key, network, refusal, bad answer); only
// on caller bugs: a fallback that throws or breaks the schema, or a schema
// JSON Schema can't express.
export async function ask<T>(options: AskOptions<T>): Promise<Answer<T>> {
  const { task, system, input, schema, effort = 'medium', maxTokens = 4000 } = options;
  const mode = options.mode ?? modeFromEnv();
  // Built even when off, so a schema that can't be sent to Claude fails in the
  // tests rather than at the demo.
  const schemaJson = JSON.stringify(z.toJSONSchema(schema));
  if (mode === 'off') return fromFallback(options, 'off');

  const model = options.model ?? claudeModel();
  const cacheDir = options.cacheDir ?? process.env.GG_CLAUDE_CACHE_DIR ?? DEFAULT_CACHE;
  // Tools join the key only when given, so every other task keeps its saved answers.
  const path = cachePath(cacheDir, task, [model, system, JSON.stringify(input ?? null), schemaJson, ...(options.tools ? [JSON.stringify(options.tools)] : [])]);
  const saved =
    readSaved(path, schema) ??
    (mode !== 'live' && !options.model && process.env.GG_REUSE_SAVED === '1' && model !== DEFAULT_MODEL
      ? readSaved(cachePath(cacheDir, task, [DEFAULT_MODEL, system, JSON.stringify(input ?? null), schemaJson]), schema)
      : undefined);

  if (mode === 'offline') return saved ? fromSaved(saved) : fromFallback(options, 'offline, nothing saved');
  if (mode === 'cached' && saved) return fromSaved(saved);
  if (!hasKey()) return saved ? fromSaved(saved, 'no key') : fromFallback(options, 'no key');

  const client = options.client ?? defaultClient();
  const request = {
    model,
    max_tokens: maxTokens,
    // Only stable text goes here, so repeated questions reuse the cached prefix.
    system: [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: JSON.stringify(input ?? null, null, 2) }],
    output_config: { format: zodOutputFormat(schema), effort },
    ...(options.tools ? { tools: options.tools } : {}),
  } satisfies Anthropic.MessageCreateParamsNonStreaming;

  let message: { stop_reason?: string | null; model?: unknown; parsed_output?: unknown };
  try {
    message = await client.messages.parse(request);
  } catch (error) {
    return whenClaudeFails(options, errorNote(error), saved);
  }
  if (message.stop_reason === 'refusal') return whenClaudeFails(options, 'refusal', saved);
  const parsed = message.parsed_output == null ? undefined : schema.safeParse(message.parsed_output);
  if (!parsed?.success || (options.accept && !options.accept(parsed.data, message))) return whenClaudeFails(options, 'invalid answer', saved);

  const answeredBy = typeof message.model === 'string' ? message.model : model;
  save(path, { task, model: answeredBy, input, answer: parsed.data });
  return { value: parsed.data, by: 'claude', model: answeredBy };
}
