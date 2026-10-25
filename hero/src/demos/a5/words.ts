// Plain words for the sidebar: grant status, days left, what each agent is
// doing now, the story's beats. Award numbers and internal ids never come out of here.

import type { AgentRole, Grant, LogRow, Packet, Request, World } from '../../feed'

export const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
export const fmtShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
export const dayOrText = (s: string) => (isDay(s) ? fmtDay(s) : s)
/** Engine text carries dates as 2026-08-31; people read Aug 31, 2026. */
export const plainDates = (s: string) => s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, fmtDay)

export const daysLeft = (today: string, end: string) => Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000)

export function grantStatus(g: Grant): { word: string; tone: 'active' | 'frozen' | 'ended' } {
  if (g.status === 'ended') return { word: 'Ended', tone: 'ended' }
  if (g.frozen) return g.status === 'restored_by_court' ? { word: 'Restored by court, still frozen', tone: 'frozen' } : { word: 'Canceled, spending frozen', tone: 'frozen' }
  if (g.status === 'canceled') return { word: 'Canceled', tone: 'ended' }
  return { word: 'Active', tone: 'active' }
}

/** The plain name of a grant from its key, e.g. "Mitochondria grant". */
export const grantName = (id: string, grants: Grant[]) => grants.find(g => g.id === id)?.name ?? 'another grant'
/** Short form for tight rows: "Mitochondria". */
export const grantShort = (id: string, grants: Grant[]) => grantName(id, grants).replace(/ grant$/, '')

export const firstName = (name: string) => name.replace(/^Dr\. /, '').split(' ')[0]
export const plainName = (name: string) => name.replace(/^Dr\. /, '')

export const ACTOR: Record<LogRow['actor'], string> = {
  purchasing: 'Purchasing agent',
  bookkeeping: 'Bookkeeping agent',
  payment_report: 'Payment & report agent',
  grant_manager: 'Grant manager',
  scientist: 'Lab',
  system: 'System',
}

const ACTIONS: Record<string, string> = {
  submit_request: 'Asked',
  push_back: 'Pushed back',
  'decide_hold: approve': 'Approved',
  'decide_hold: reject': 'Rejected',
  'act_on_request: reroute': 'Rerouted',
  'act_on_request: hold': 'Held',
  'act_on_request: block': 'Blocked',
  'act_on_request: buy': 'Bought',
  raise_hold: 'Asked the grant manager',
  'request_check: before_money_moves': 'Checked again',
  post_status_event: 'Read a source',
  'raise_flag: court_order_no_payment': 'Flagged',
  'daily check': 'Daily check',
  'check_invoice: matched': 'Invoice matched',
  'check_invoice: held': 'Invoice held',
  'check_paper: ok': 'Paper checked',
  'check_paper: note': 'Paper noted',
  'check_paper: held': 'Paper held',
  draft_payment_request: 'Drafted a payment request',
  answer_follow_up: 'Answered the funder',
}
export const actionWord = (a: string) => {
  const w = ACTIONS[a] ?? a.replace(/[_:]+/g, ' ').trim()
  return w.charAt(0).toUpperCase() + w.slice(1)
}

export function outcomeTone(r: Pick<Request, 'outcome'>) {
  return r.outcome ?? 'pending'
}

// ── What each node is doing now ─────────────────────────────────────────

export type Activity = 'idle' | 'working' | 'waiting'
export interface Now {
  state: Activity
  line: string
}

const what = (p: Packet) => p.label.replace(/^“|”$/g, '')

function incoming(p: Packet, w: World): string {
  switch (p.kind) {
    case 'request':
      return `Receiving a request: ${what(p)}`
    case 'pushback':
      return 'Hearing a researcher push back'
    case 'recheck':
      return p.to === 'a:bookkeeping' ? 'Checking the books again before money moves' : `Hearing back from the bookkeeping agent: ${what(p).toLowerCase()}`
    case 'reading':
      return `Reading ${w.nodes.find(n => n.id === p.from)?.label ?? 'a source'}`
    case 'payment':
      return 'Recording a payment that just arrived'
    case 'invoice':
      return `Checking an invoice: ${what(p)}`
    case 'paper':
      return 'Checking a paper for the progress report'
    case 'follow_up':
      return 'Answering a follow-up question from NIH'
    case 'decision':
      return `Receiving the grant manager’s decision: ${what(p).toLowerCase()}`
    default:
      return what(p)
  }
}

function outgoing(p: Packet, w: World): string {
  const to = w.nodes.find(n => n.id === p.to)
  switch (p.kind) {
    case 'verdict':
      return `Answering ${to ? firstName(to.label) : 'the lab'}: ${what(p)}`
    case 'recheck':
      return p.from === 'a:purchasing' ? 'Asking the bookkeeping agent to check again' : `Telling the purchasing agent: ${what(p).toLowerCase()}`
    case 'hold':
      return `Asking the grant manager: ${what(p)}`
    case 'payment_request':
      return 'Sending a payment request to NIH'
    default:
      return what(p)
  }
}

export function agentNow(role: AgentRole, w: World): Now {
  const id = `a:${role}`
  const open = w.holds.filter(h => h.open && h.raisedBy === role)
  if (role === 'purchasing') {
    const checking = w.requests.find(r => !r.outcome && r.verdicts.length > 0)
    if (checking) return { state: 'working', line: `Running the six spending rules on ${checking.item.split(',')[0].toLowerCase()}` }
  }
  const out = w.packets.find(p => p.from === id)
  const inc = w.packets.find(p => p.to === id)
  if (inc) return { state: 'working', line: incoming(inc, w) }
  if (out) return { state: 'working', line: outgoing(out, w) }
  if (open.length) return { state: 'waiting', line: `Waiting on you: ${plainDates(open[0].title)}` }
  const last = w.log.find(l => l.actor === role)
  return { state: 'idle', line: last ? `Last: ${plainDates(last.reason)}` : 'Idle' }
}

export function managerNow(w: World): Now {
  const open = w.holds.filter(h => h.open).length
  if (open) return { state: 'waiting', line: `${open} decision${open === 1 ? '' : 's'} waiting on you` }
  const coming = w.packets.find(p => p.kind === 'hold')
  if (coming) return { state: 'working', line: `A question is on its way: ${what(coming)}` }
  return { state: 'idle', line: 'Nothing to decide right now' }
}

export function nodeNow(id: string, w: World): Now {
  const n = w.nodes.find(x => x.id === id)
  const out = w.packets.find(p => p.from === id)
  const inc = w.packets.find(p => p.to === id)
  if (out) return { state: 'working', line: out.kind === 'reading' ? `Sending a reading: ${what(out)}` : what(out) }
  if (inc) return { state: 'working', line: inc.kind === 'charge' ? `Receiving an order: ${what(inc)}` : what(inc) }
  return { state: 'idle', line: n?.sub ?? (id.startsWith('s:') ? 'A source the bookkeeping agent reads' : '') }
}

export function researcherNow(id: string, w: World): Now {
  const r = w.researchers.find(x => x.id === id)
  const out = w.packets.find(p => p.from === `r:${id}`)
  if (out) return { state: 'working', line: out.kind === 'paper' ? 'Sending a paper for the progress report' : `Sending a request: ${what(out)}` }
  const back = w.packets.find(p => p.to === `r:${id}`)
  if (back) return { state: 'working', line: `Hearing back: ${what(back)}` }
  return { state: 'idle', line: r?.task ?? '' }
}

// ── The story's beats (feed ms from the start, as engine.ts schedules them) ──

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-')
export const BEATS = (
  [
    [400, 'A normal week in the Ortiz Lab'],
    [19600, 'The grant is canceled'],
    [30600, 'A court restores it'],
    [38600, 'The scientist pushes to buy'],
    [48100, 'It defends the decision'],
    [58600, 'The money lands'],
    [71100, 'Rerouted to a grant with time left'],
    [81600, 'Not allowed on a federal grant'],
    [91100, 'Sent back to refine'],
    [112100, 'Exactly at the limit'],
    [123600, 'Over the limit: your call'],
    [144600, 'A paper credits the wrong grant'],
    [157200, 'A bill for a canceled order'],
    [168200, 'Payment request, drafted and defended'],
    [190200, 'Live'],
  ] as const
).map(([at, title]) => ({ at, title, id: slug(title) }))
export const STORY_MS = 190200
