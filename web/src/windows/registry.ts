// One entry per window (MASTER-PLAN §4). Each window lives in its own file.
import type { ComponentType } from 'react'
import Funds from './Funds'
import Requests from './Requests'
import Invoices from './Invoices'
import PaymentRequests from './PaymentRequests'
import Reports from './Reports'
import Inbox from './Inbox'
import Log from './Log'
import TestLab from './TestLab'

export type Role = 'grant_manager' | 'scientist'
// `home` is the window a role lands on.
export const roles: { id: Role; label: string; home: string }[] = [
  { id: 'grant_manager', label: 'Grant manager', home: 'funds' },
  { id: 'scientist', label: 'Scientist', home: 'requests' },
]

export interface WindowDef { id: string; label: string; job: string; Component: ComponentType; roles: Role[] }

export const windows: WindowDef[] = [
  { id: 'funds', label: 'Funds', job: 'How much money each grant really has, its status timeline, and any flags', Component: Funds, roles: ['grant_manager', 'scientist'] },
  { id: 'requests', label: 'Requests', job: 'Ask to buy something; see your requests and their status', Component: Requests, roles: ['grant_manager', 'scientist'] },
  { id: 'invoices', label: 'Invoices', job: 'Each bill: matched or held, with the mismatch spelled out', Component: Invoices, roles: ['grant_manager'] },
  { id: 'payment-requests', label: 'Payment requests', job: 'Drafted requests, follow-up questions, and their status', Component: PaymentRequests, roles: ['grant_manager'] },
  { id: 'reports', label: 'Reports', job: 'Each paper in the progress report, with its check results', Component: Reports, roles: ['grant_manager'] },
  { id: 'inbox', label: 'Inbox', job: 'Everything waiting for a human decision, with its evidence', Component: Inbox, roles: ['grant_manager'] },
  { id: 'log', label: 'Log', job: 'Who did what, and why', Component: Log, roles: ['grant_manager'] },
  { id: 'test-lab', label: 'Test lab', job: 'Demo only: drop in events, fast-forward the clock, see the scorecard', Component: TestLab, roles: ['grant_manager'] },
]
