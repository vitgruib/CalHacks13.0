// The payment and report agent's payment request writer (P5): drafts each month's payment request with an explanation of at most 1,000 characters, and answers the funder's follow-ups with the exact purchases.
// Built in T13; until then it starts and does nothing.

import type { AgentContext, AgentHandle } from './types.ts';

export function startPaymentRequests(_context: AgentContext): AgentHandle {
  return { idle: () => Promise.resolve(), stop() {} };
}
