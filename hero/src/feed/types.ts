// The hero's data contract. Row shapes mirror Track A's tables in
// server/src/schema.ts (grant, request, hold, status_event, log), so a
// SpacetimeDB adapter can replace the scripted source without touching the
// scenes. Everything a scene animates arrives as a FlowEvent.

export type Day = string // YYYY-MM-DD, the simulated clock
export type Money = number // whole US dollars

export type AgentRole = 'purchasing' | 'bookkeeping' | 'payment_report'
export type GrantStatus = 'active' | 'canceled' | 'restored_by_court' | 'ended'
export type RequestState = 'submitted' | 'bought' | 'blocked' | 'rerouted' | 'waiting_on_manager' | 'rejected'
export type Source = 'NIH RePORTER' | 'USAspending' | 'Cancellation list (Apify)' | 'Court notice' | 'Payment system'
export type StatusEventKind = 'canceled' | 'court_order' | 'payment_received' | 'reading_changed' | 'unfrozen'
export type HoldKind = 'purchase' | 'invoice' | 'payment_request' | 'follow_up' | 'report' | 'source_disagreement'

/**
 * What the researcher hears back, in the brief's words:
 * accept = bought; refine = rerouted to another grant, or sent back with a fix
 * to make (e.g. split a shared cost); reject = blocked; hold = parked until
 * money lands or the grant manager decides.
 */
export type Outcome = 'accept' | 'refine' | 'reject' | 'hold'
export type HoldFor = 'payment' | 'grant_manager'

export interface Verdict {
  rule: string
  pass: boolean
  detail: string
  auditCase?: string // a real audit the rule comes from
}

export interface Grant {
  id: string // the award number; never shown on screen
  name: string // hero-only: the plain name every scene shows instead of the award number
  title: string
  pi: string
  agency: string
  awarded: Money
  received: Money
  spent: Money
  promised: Money
  available: Money // truly available = awarded − spent − promised
  start: Day
  end: Day
  status: GrantStatus
  frozen: boolean
  frozenReason?: string
}

export interface Split {
  grantId: string
  share: number // 0..1, shares sum to 1
}

export interface Request {
  id: string
  day: Day
  researcherId: string // hero-only: which lab member sent it (the backend stores the person role)
  item: string
  kind: ItemKind // hero-only: what the thing physically is, so a scene can show it (see items.ts)
  category: string
  price: Money
  grantId: string
  chargedGrantId?: string
  sharedWith: string[]
  split: Split[]
  purpose: string
  state: RequestState
  verdicts: Verdict[]
  explanation: string // the purchasing agent's plain-language reason
  outcome?: Outcome
  holdFor?: HoldFor
  revisionOf?: string // a refined resubmission points at the request it fixes
}

export interface Hold {
  id: string
  kind: HoldKind
  refId: string
  grantId?: string
  raisedBy: AgentRole
  day: Day
  title: string
  why: string
  evidence: { label: string; value: string }[]
  options: ('approve' | 'reject')[]
  open: boolean
  decision?: { choice: 'approve' | 'reject'; reason: string; by: 'grant_manager' | 'viewer'; day: Day }
}

export interface StatusEvent {
  id: string
  grantId: string
  day: Day
  kind: StatusEventKind
  source: Source
  summary: string
  amount?: Money
}

export interface LogRow {
  id: string
  day: Day
  actor: AgentRole | 'grant_manager' | 'scientist' | 'system'
  action: string
  rule?: string
  reason: string
  refId?: string
}

// ── The cast ───────────────────────────────────────────────────────────────

export interface Researcher {
  id: string
  name: string
  role: 'PI' | 'Postdoc' | 'Grad student' | 'Lab manager'
  station: string // where they work in the lab
  grantIds: string[] // grants their work is paid from
  tasks: string[] // what they cycle through while working
  task: string // what they are doing right now
}

export interface FinanceAgent {
  role: AgentRole
  name: string
  seat: string // the job a person would hold
  job: string
}

/** What a requested thing physically is. `kindOf` in items.ts picks one from the item text. */
export type ItemKind =
  | 'gloves'
  | 'plates'
  | 'tips'
  | 'bottle'
  | 'kit'
  | 'dishes'
  | 'pump'
  | 'rotor'
  | 'espresso'
  | 'service'
  | 'food'
  | 'chair'
  | 'carton'

/** Every place a packet can travel between. Scenes map ids to positions. */
export type NodeKind = 'researcher' | 'agent' | 'person' | 'source' | 'grant' | 'vendor'
export interface FlowNode {
  id: string // r:<researcher>, a:<agent role>, p:grant_manager, p:funder, s:<source>, g:<grant id>, v:vendors
  kind: NodeKind
  side: 'lab' | 'finance' | 'outside'
  label: string
  sub?: string
}

export type PacketKind =
  | 'request' // researcher → purchasing agent
  | 'verdict' // purchasing agent → researcher (accept / refine / reject / hold)
  | 'pushback' // researcher → purchasing agent, arguing with a hold
  | 'recheck' // purchasing ↔ bookkeeping, "check again before money moves"
  | 'reading' // a government source → bookkeeping agent
  | 'payment' // payment system → a grant (money arrives)
  | 'charge' // a grant → vendors (an order is placed)
  | 'hold' // an agent → grant manager (needs a human)
  | 'decision' // grant manager → an agent
  | 'paper' // researcher → payment & report agent
  | 'invoice' // vendors → bookkeeping agent
  | 'payment_request' // payment & report agent → funder
  | 'follow_up' // funder → payment & report agent

/** A line in the finance network: every packet route, plus who watches or spends from each grant. */
export interface Edge {
  from: string // FlowNode id
  to: string // FlowNode id
  kinds: PacketKind[] // packets that travel it (either way); empty for a standing relationship
  what: string // a few words for a hover card, e.g. "Requests and answers"
}

export interface Packet {
  id: string
  kind: PacketKind
  from: string // FlowNode id
  to: string // FlowNode id
  label: string // short, e.g. "Nitrile gloves · $640"
  refId?: string // request / hold / paper / invoice id
  outcome?: Outcome // on verdict packets (and decisions)
  holdFor?: HoldFor
  amount?: Money
  sentAt: number // feed time (ms) when it left
  ms: number // travel time in feed ms; arrives at sentAt + ms
}

export interface Beat {
  id: string
  title: string // a few words, e.g. "Court order isn't cash"
  caption: string // one or two sentences of narration
}

export interface World {
  today: Day
  grants: Grant[]
  researchers: Researcher[]
  agents: FinanceAgent[]
  nodes: FlowNode[]
  requests: Request[] // newest first
  holds: Hold[] // newest first, open and closed
  statusEvents: StatusEvent[] // newest first
  log: LogRow[] // newest first, last 80
  packets: Packet[] // in flight right now
  beat?: Beat // what the story is showing right now
  storyDone: boolean
  playing: boolean
  speed: number
}

// ── What scenes animate ────────────────────────────────────────────────────

export type FlowEvent =
  | { type: 'packet'; packet: Packet } // left `from`
  | { type: 'arrive'; packet: Packet } // reached `to`
  | { type: 'rule'; requestId: string; index: number; total: number; verdict: Verdict } // flashes at the purchasing agent
  | { type: 'request'; request: Request } // a request row was inserted or changed state
  | { type: 'grant'; grant: Grant; event?: StatusEvent } // money or status changed; freeze toggles live here
  | { type: 'hold'; hold: Hold } // opened, or closed with a decision
  | { type: 'task'; researcherId: string; task: string } // a lab member moved on to a new task
  | { type: 'paper'; researcherId: string; paperId: string; title: string; result: 'ok' | 'note' | 'held'; checks: { check: string; pass: boolean; detail: string }[] }
  | { type: 'invoice'; invoiceId: string; vendor: string; amount: Money; matched: boolean; mismatch?: string }
  | { type: 'log'; row: LogRow }
  | { type: 'beat'; beat: Beat }
  | { type: 'reset' } // the story restarted; drop any scene-local state

export interface RequestInput {
  researcherId: string
  item: string
  category: string
  price: Money
  grantId: string
  purpose?: string
  split?: Split[]
  sharedWith?: string[]
}

export interface Preset extends RequestInput {
  label: string // what the viewer sees on the button
  expect: Outcome // what the rules will most likely say (for the button's hint)
}
