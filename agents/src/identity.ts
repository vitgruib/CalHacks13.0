// Saves each agent's database token, so a restarted worker comes back as the
// same three identities. Tokens are credentials: agents/.state/ is ignored by
// git.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Role } from './roles.ts';

function stateDir(): string {
  return (
    process.env.GG_STATE_DIR ?? fileURLToPath(new URL('../.state', import.meta.url))
  );
}

export function loadToken(role: Role): string | undefined {
  try {
    return readFileSync(join(stateDir(), `${role}.token`), 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

export function saveToken(role: Role, token: string): void {
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(join(stateDir(), `${role}.token`), token, { mode: 0o600 });
}
