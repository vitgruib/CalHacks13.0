// The payment and report agent's progress report checker (P7): looks up what public records say about each paper and records it, so the module can hold a paper credited to the wrong grant, missing its PMCID, or with an undisclosed correction.
// Built in T14; until then it starts and does nothing.

import type { AgentContext, AgentHandle } from './types.ts';

export function startReportChecker(_context: AgentContext): AgentHandle {
  return { idle: () => Promise.resolve(), stop() {} };
}
