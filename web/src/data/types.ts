// Stand-in for Track A's SpacetimeDB contract (T3). Table names follow
// docs/MASTER-PLAN.md §6. When T3 lands, swap these for the generated
// bindings and keep the window code unchanged where the shapes match.

/** Simulated clock, ISO date (YYYY-MM-DD). */
export type Day = string
export type Money = number // whole US dollars

export type AgentId = 'purchasing' | 'bookkeeping' | 'payment_report'
export type PersonId = 'grant_manager' | 'scientist' | 'funder'
export type Actor = AgentId | PersonId | 'system'

export type GrantStatus = 'active' | 'canceled' | 'restored_by_court' | 'ended'

export interface Grant {
  id: string // e.g. "R01GM061721" (real NIH grant IDs; the sim world around them is made up)
  title: string
  pi: string
  agency: string
  awarded: Money
  received: Money
  spent: Money
  promised: Money // orders placed, not yet paid
  start: Day
  end: Day
  status: GrantStatus
  frozen: boolean
  frozenReason?: string
}

/** truly available = awarded − spent − promised (MASTER-PLAN §3.1). */
export const trulyAvailable = (g: Grant): Money => g.awarded - g.spent - g.promised

export type Source = 'NIH RePORTER' | 'USAspending' | 'Cancellation list (Apify)' | 'Court notice' | 'Payment system'

export interface StatusEvent {
  id: string
  grantId: string
  day: Day
  kind: 'canceled' | 'court_order' | 'payment_received' | 'reading_changed' | 'unfrozen'
  source: Source
  summary: string
  amount?: Money
}

export interface SourceReading {
  id: string
  grantId: string
  day: Day
  source: Source
  status: GrantStatus
}

export interface Flag {
  id: string
  grantId: string
  day: Day
  kind: 'sources_disagree' | 'spend_while_canceled' | 'court_order_no_payment'
  summary: string
  open: boolean
}

export type RequestState = 'submitted' | 'bought' | 'blocked' | 'rerouted' | 'waiting_on_manager' | 'rejected'

export interface RuleVerdict {
  rule: string // e.g. "Not in the grant's last 90 days"
  pass: boolean
  detail: string
  auditCase?: string // a real audit the rule comes from, e.g. "NSF OIG 22-1-010 (WVU)"
}

export interface PurchaseRequest {
  id: string
  day: Day
  requester: PersonId
  item: string
  category: string
  price: Money
  grantId: string // grant asked for
  chargedGrantId?: string // grant actually charged (differs when rerouted)
  split?: { grantId: string; share: number }[] // shared costs; shares sum to 1
  purpose: string
  state: RequestState
  verdicts: RuleVerdict[]
  explanation: string // purchasing agent's plain-language reason
}

export interface Order {
  id: string
  requestId: string
  vendor: string
  amount: Money
  placed: Day
  state: 'open' | 'canceled' | 'changed' | 'paid'
  canceledOn?: Day
  changedAmount?: Money
}

export interface Approval {
  id: string
  orderId: string
  amount: Money
  by: PersonId
  day: Day
}

export interface Invoice {
  id: string
  orderId: string
  vendor: string
  amount: Money
  received: Day
  state: 'matched' | 'held' | 'paid' | 'rejected'
  mismatch?: string // spelled out, e.g. "Order canceled on 2026-03-02"
  timeline: { day: Day; what: string }[]
  /** false = arrived but not yet checked by the bookkeeping agent (raw seed);
   *  `state` is then only a placeholder. Absent = already checked. */
  checked?: boolean
}

export interface FollowUp {
  id: string
  question: string // from the funder persona
  answerDraft?: string // quotes exact purchases
  state: 'drafted' | 'waiting_on_manager' | 'sent'
}

export interface PaymentRequest {
  id: string
  grantId: string
  from: Day
  to: Day
  amount: Money
  explanation: string // ≤ 1,000 characters
  includedRequestIds: string[]
  /** Payroll rows in this request; amount = included purchases + payroll. */
  includedPayrollIds?: string[]
  excluded: { requestId: string; why: string }[]
  state: 'drafted' | 'waiting_on_manager' | 'sent' | 'paid'
  followUps: FollowUp[]
}

export interface ReportPaper {
  id: string
  grantId: string // grant whose progress report lists it
  title: string
  doi: string
  pmcid?: string
  creditsGrantId: string // grant the paper's acknowledgments name
  correction?: { kind: 'material' | 'minor' | 'retraction'; disclosed: boolean; note: string }
  checks: { check: string; pass: boolean; detail: string }[]
  result: 'ok' | 'note' | 'held'
  /** false = not yet checked by the report checker (raw seed); `result` is
   *  then only a placeholder. Absent = already checked. */
  checked?: boolean
  /** Purchase requests whose costs belong to this paper (e.g. its publication fee). */
  costRequestIds?: string[]
}

export type HoldKind = 'purchase' | 'invoice' | 'payment_request' | 'follow_up' | 'report' | 'source_disagreement'

/** Anything waiting for the grant manager. Only the Inbox shows these buttons. */
export interface Hold {
  id: string
  kind: HoldKind
  refId: string // id of the request / invoice / payment request / follow-up / paper / flag
  grantId: string
  raisedBy: AgentId
  day: Day
  title: string
  why: string
  evidence: { label: string; value: string }[]
  options: Decision['choice'][]
  decision?: Decision
}

export interface Decision {
  choice: 'approve' | 'reject' | 'override' | 'ask_vendor' | 'pick_source'
  reason: string // required, never empty
  by: PersonId
  day: Day
}

export interface LogRow {
  id: string
  day: Day
  actor: Actor
  action: string
  rule?: string
  reason: string
  refId?: string
}

/** One person's salary charged to a grant for one pay period. */
export interface PayrollRow {
  id: string
  grantId: string
  person: string
  role: string
  period: { from: Day; to: Day }
  effortPct: number // percent of the person's time on this grant, 0-100
  amount: Money
}

export interface Db {
  today: Day
  grants: Grant[]
  statusEvents: StatusEvent[]
  sourceReadings: SourceReading[]
  flags: Flag[]
  requests: PurchaseRequest[]
  orders: Order[]
  approvals: Approval[]
  invoices: Invoice[]
  payroll: PayrollRow[]
  paymentRequests: PaymentRequest[]
  papers: ReportPaper[]
  holds: Hold[]
  log: LogRow[]
}
