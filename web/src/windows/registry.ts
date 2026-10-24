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

export interface WindowDef { id: string; label: string; job: string; Component: ComponentType }

export const windows: WindowDef[] = [
  { id: 'funds', label: 'Funds', job: 'How much money each grant really has, its status timeline, and any flags', Component: Funds },
  { id: 'requests', label: 'Requests', job: 'Ask to buy something; see your requests and their status', Component: Requests },
  { id: 'invoices', label: 'Invoices', job: 'Each bill: matched or held, with the mismatch spelled out', Component: Invoices },
  { id: 'payment-requests', label: 'Payment requests', job: 'Drafted requests, follow-up questions, and their status', Component: PaymentRequests },
  { id: 'reports', label: 'Reports', job: 'Each paper in the progress report, with its check results', Component: Reports },
  { id: 'inbox', label: 'Inbox', job: 'Everything waiting for a human decision, with its evidence', Component: Inbox },
  { id: 'log', label: 'Log', job: 'Who did what, and why', Component: Log },
  { id: 'test-lab', label: 'Test lab', job: 'Demo only: drop in events, fast-forward the clock, see the scorecard', Component: TestLab },
]
