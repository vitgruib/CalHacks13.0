// The bookkeeping agent's invoice check (P4): matches each new invoice to its order and approval through the module, and explains every held one with a timeline.
// Built in T12; until then it starts and does nothing.

import type { AgentContext, AgentHandle } from './types.ts';

export function startInvoices(_context: AgentContext): AgentHandle {
  return { idle: () => Promise.resolve(), stop() {} };
}
