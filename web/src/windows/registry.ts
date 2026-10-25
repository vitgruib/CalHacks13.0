// One entry per window (MASTER-PLAN §4). Each window lives in its own file.
import { createContext, type ComponentType } from 'react'
import Funds from './Funds'
import Requests from './Requests'
import Invoice from './Invoice'
import PaymentRequests from './PaymentRequests'
import Reports from './Reports'
import Inbox from './Inbox'
import Log from './Log'
import Ask from './Ask'
import Grants from './Grants'
import Cases from './Cases'
import { openHolds } from './Inbox'
import type { Store } from '../data/store'

export type Role = 'grant_manager' | 'scientist'
// `home` is the window a role lands on.
export const roles: { id: Role; label: string; home: string }[] = [
  { id: 'grant_manager', label: 'Grant office', home: 'funds' },
  { id: 'scientist', label: 'Researcher', home: 'ask' },
]

/** The role the app is viewed as, for the few windows that differ by role. */
export const RoleContext = createContext<Role>('grant_manager')

// SOFT DELETE (Nathan, Sat 10/24): `hidden: true` ONLY hides a window's button in
// the side menu. NOTHING IS DELETED. The window's code, CSS and data stay as
// they are, and its URL still works (#inbox, #log, ...), so the links inside the
// visible windows ("See it in the Inbox", "Open in Payment requests") still open
// it. That keeps the decision buttons and the payment-request and report views
// reachable. To bring a button back, delete its `hidden: true`.
// A researcher's own requests sit on Ask (T100); their `#requests` links open Ask.
// `badge` is the count on the window's menu button: what waits there for a decision.
export interface WindowDef { id: string; label: string; job: string; Component: ComponentType; roles: Role[]; hidden?: boolean; badge?: (s: Store) => number }

export const windows: WindowDef[] = [
  { id: 'ask', label: 'Ask', job: 'Type what you need; see which grant can pay, in plain words', Component: Ask, roles: ['scientist'] },
  { id: 'grants', label: 'My grants', job: 'Each grant in plain words; a paused grant shows where its money is', Component: Grants, roles: ['scientist'] },
  { id: 'funds', label: 'Funds', job: 'How much money each grant really has, its status timeline, and any flags', Component: Funds, roles: ['grant_manager'] },
  { id: 'cases', label: 'Cases', job: 'Every problem on each grant in one place: the records that disagree, what happened, and what\'s missing', Component: Cases, roles: ['grant_manager'], hidden: true },
  { id: 'requests', label: 'Requests', job: 'Every purchase request and experiment plan from the lab\'s researchers: who asked, for what, the plan\'s funding-readiness report, and what the purchasing agent did', Component: Requests, roles: ['grant_manager'], badge: s => openHolds(s.db, 'purchase').length + s.plans.filter(p => p.status === 'submitted').length },
  { id: 'invoices', label: 'Invoice', job: 'Submit and track invoices (researcher); verify them against the purchase order and the grant, decide exceptions and keep the audit trail (grant office)', Component: Invoice, roles: ['scientist', 'grant_manager'], badge: s => openHolds(s.db, 'invoice').length },
  { id: 'payment-requests', label: 'Payment requests', job: 'Drafted requests, follow-up questions, and their status', Component: PaymentRequests, roles: ['grant_manager'], hidden: true },
  { id: 'reports', label: 'Reports', job: 'Each paper in the progress report, with its check results', Component: Reports, roles: ['grant_manager'], hidden: true },
  { id: 'inbox', label: 'Inbox', job: 'Everything waiting for a human decision, with its evidence', Component: Inbox, roles: ['grant_manager'], hidden: true, badge: s => s.db.holds.filter(h => !h.decision).length },
  { id: 'log', label: 'Log', job: 'Who did what, and why', Component: Log, roles: ['grant_manager'], hidden: true },
]
