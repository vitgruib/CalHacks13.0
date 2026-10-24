// The three AI agents (docs/MASTER-PLAN.md §2). Each one connects to the
// database with its own identity, so the database, not a prompt, decides
// what each is allowed to do.

export const ROLES = ['purchasing', 'bookkeeping', 'payment_report'] as const;

export type Role = (typeof ROLES)[number];

export const SEATS: Record<Role, string> = {
  purchasing: 'purchasing',
  bookkeeping: 'grant accountant',
  payment_report: 'payment and report preparer',
};
