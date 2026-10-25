// Allowed values for the string columns in schema.ts. Actions reject
// anything else, so a typo fails loudly instead of creating a new state.

export const AGENT_ROLES = ['purchasing', 'bookkeeping', 'payment_report'] as const;
export const PERSON_ROLES = ['grant_manager', 'scientist', 'funder'] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];
export type PersonRole = (typeof PERSON_ROLES)[number];

export const GRANT_STATUSES = ['active', 'canceled', 'restored_by_court', 'ended'] as const;
export const SOURCES = [
  'NIH RePORTER',
  'USAspending',
  'Cancellation list (Apify)',
  'Court notice',
  'Payment system',
] as const;
export const STATUS_EVENT_KINDS = [
  'canceled',
  'court_order',
  'payment_received',
  'reading_changed',
  'unfrozen',
] as const;
export const FLAG_KINDS = ['sources_disagree', 'spend_while_canceled', 'court_order_no_payment'] as const;
export const CHECK_REASONS = ['check_now', 'before_money_moves'] as const;
export const HOLD_KINDS = [
  'purchase',
  'invoice',
  'payment_request',
  'follow_up',
  'report',
  'source_disagreement',
  'paid_while_canceled',
] as const;
export const CHOICES = ['approve', 'reject', 'ask_vendor', 'pick_source'] as const;
export type Choice = (typeof CHOICES)[number];

/** Purchases at or under this go through without the grant manager. */
export const CARD_LIMIT = 5_000;
export const PAYMENT_EXPLANATION_MAX = 1_000;

export function oneOf<T extends readonly string[]>(what: string, allowed: T, value: string): T[number] {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${what} must be one of ${allowed.join(', ')}; got "${value}"`);
  }
  return value as T[number];
}
