// Loads the runner with tsx, so plain Node can import the TypeScript in
// agents/ and server/. Agents' Claude calls use saved answers only.
import { register as registerTsx } from 'tsx/esm/api';

let loaded;

export function loadScorer() {
  process.env.GG_CLAUDE ??= 'offline';
  loaded ??= (async () => {
    registerTsx();
    // The SDK replaces globalThis.console with the host's, which drops output.
    const realConsole = globalThis.console;
    try {
      return await import('./replay.mjs');
    } finally {
      globalThis.console = realConsole;
    }
  })();
  return loaded;
}
