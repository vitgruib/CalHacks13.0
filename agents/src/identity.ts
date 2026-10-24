// Saves each agent's database token, so a restarted worker comes back as the
// same three identities. Tokens are credentials: agents/.state/ is ignored by
// git. A world that lives only in this process (db/local.ts) keeps its tokens
// in memory instead.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Role } from './roles.ts';

export interface TokenStore {
  load(role: Role): string | undefined;
  save(role: Role, token: string): void;
}

function stateDir(): string {
  return (
    process.env.GG_STATE_DIR ?? fileURLToPath(new URL('../.state', import.meta.url))
  );
}

// One folder per database, so a token from one server is never sent to another.
export function fileTokens(database = 'default'): TokenStore {
  const dir = () => join(stateDir(), database);
  return {
    load(role) {
      try {
        return readFileSync(join(dir(), `${role}.token`), 'utf8').trim() || undefined;
      } catch {
        return undefined; // first run: no token saved yet
      }
    },
    save(role, token) {
      mkdirSync(dir(), { recursive: true });
      writeFileSync(join(dir(), `${role}.token`), token, { mode: 0o600 });
    },
  };
}

export function memoryTokens(): TokenStore {
  const tokens = new Map<Role, string>();
  return { load: (role) => tokens.get(role), save: (role, token) => void tokens.set(role, token) };
}
