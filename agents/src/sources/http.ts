// Fetches JSON from the government sites and keeps a copy of every answer in
// agents/cache/ (committed: it's public data). The demo then still works
// offline or when a site is down.
//
// GG_SOURCES=live (default): ask the site; fall back to the saved copy if
//   the site fails.
// GG_SOURCES=offline: only use saved copies.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface FetchOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  fetchImpl?: typeof fetch;
  cacheDir?: string;
  mode?: 'live' | 'offline';
  timeoutMs?: number;
}

const DEFAULT_CACHE = fileURLToPath(new URL('../../cache', import.meta.url));

function cachePath(dir: string, url: string, body: string | undefined): string {
  const key = createHash('sha256').update(`${url}\n${body ?? ''}`).digest('hex').slice(0, 24);
  const host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
  return join(dir, `${host}-${key}.json`);
}

function readCache(path: string): unknown | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')).response;
  } catch {
    return undefined;
  }
}

export async function fetchJson(url: string, options: FetchOptions = {}): Promise<unknown> {
  const {
    method = options.body === undefined ? 'GET' : 'POST',
    fetchImpl = fetch,
    cacheDir = process.env.GG_CACHE_DIR ?? DEFAULT_CACHE,
    mode = process.env.GG_SOURCES === 'offline' ? 'offline' : 'live',
    timeoutMs = 20_000,
  } = options;
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const path = cachePath(cacheDir, url, body);

  if (mode === 'offline') {
    const saved = readCache(path);
    if (saved === undefined) throw new Error(`offline and no saved copy of ${method} ${url}`);
    return saved;
  }

  try {
    const response = await fetchImpl(url, {
      method,
      body,
      headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`${method} ${url} answered ${response.status}`);
    const json: unknown = await response.json();
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ request: { method, url, body: options.body ?? null }, savedAt: new Date().toISOString(), response: json }, null, 2),
    );
    return json;
  } catch (error) {
    const saved = readCache(path);
    if (saved === undefined) throw error;
    console.warn(`sources: ${method} ${url} failed, using the saved copy`, error);
    return saved;
  }
}
