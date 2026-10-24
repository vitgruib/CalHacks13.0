// The purchasing agent (docs/MASTER-PLAN.md §3.2): picks a grant for each request, has the module check its rules, then buys, reroutes, holds or blocks, with an explanation that cites the rule.
// Built in T11; until then it starts and does nothing.

import type { AgentContext, AgentHandle } from './types.ts';

export function startPurchasing(_context: AgentContext): AgentHandle {
  return { idle: () => Promise.resolve(), stop() {} };
}
