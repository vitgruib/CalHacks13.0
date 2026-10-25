// Plain words for the sidebar: dates, grant states, request outcomes, the
// story's beats, and what each agent is doing right now. Everything here is
// read from the World snapshot, so a ?at jump lands on the right words.

import type { Grant, LogRow, Packet, Request, World } from '../../feed'

export const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
export const fmtShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
/** Feed sentences sometimes carry machine dates (2026-03-10); show them as Mar 10, 2026. */
export const prose = (s: string) => s.replace(/\b(\d{4}-\d\d-\d\d)\b/g, (_m, d: string) => fmtDay(d))

export const ACTOR: Record<LogRow['actor'], string> = {
  purchasing: 'Purchasing agent',
  bookkeeping: 'Bookkeeping agent',
  payment_report: 'Payment & report agent',
  grant_manager: 'Grant manager',
  scientist: 'Lab',
  system: 'System',
}

export const firstName = (name: string) => name.replace('Dr. ', '').split(' ')[0]
export const shortItem = (item: string) => item.split(',')[0]

export const grantName = (w: World, id?: string) => w.grants.find(g => g.id === id)?.name ?? 'the other grant'
export const personName = (w: World, id: string) => w.researchers.find(r => r.id === id)?.name ?? 'A lab member'

export function daysLeft(today: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000)
}

export function grantStatus(g: Grant, today: string): { word: string; tone: 'ok' | 'frozen' | 'ended' } {
  if (g.status === 'ended' || daysLeft(today, g.end) <= 0) return { word: 'Ended', tone: 'ended' }
  if (g.frozen) return g.status === 'restored_by_court' ? { word: 'Restored by court, still frozen', tone: 'frozen' } : { word: 'Canceled, spending frozen', tone: 'frozen' }
  return { word: 'Active', tone: 'ok' }
}

/** Grant colours, matching the scene's re-tags. */
export const GRANT_TONE = (w: World, id?: string) => (w.grants.findIndex(g => g.id === id) === 1 ? 'b' : 'a')

export function outcomeText(r: Request, w: World): string {
  if (!r.outcome) return r.verdicts.length ? 'Checking the rules' : 'On its way'
  if (r.outcome === 'accept') return 'Bought'
  if (r.outcome === 'refine') return r.chargedGrantId ? `Rerouted to the ${grantName(w, r.chargedGrantId).toLowerCase()}` : 'Sent back to split'
  if (r.outcome === 'reject') return r.state === 'rejected' ? 'Rejected by the grant manager' : 'Blocked'
  return r.holdFor === 'grant_manager' ? 'Waiting on you' : 'Held until money lands'
}

/** The story's scenes, in feed ms from the start. Titles match the feed's beats. */
export const BEATS: { at: number; title: string }[] = [
  { at: 400, title: 'A normal week in the Ortiz Lab' },
  { at: 19600, title: 'The grant is canceled' },
  { at: 30600, title: 'A court restores it' },
  { at: 38600, title: 'The scientist pushes to buy' },
  { at: 48100, title: 'It defends the decision' },
  { at: 58600, title: 'The money lands' },
  { at: 71100, title: 'Rerouted to a grant with time left' },
  { at: 81600, title: 'Not allowed on a federal grant' },
  { at: 91100, title: 'Sent back to refine' },
  { at: 112100, title: 'Exactly at the limit' },
  { at: 123600, title: 'Over the limit: your call' },
  { at: 144600, title: 'A paper credits the wrong grant' },
  { at: 157200, title: 'A bill for a canceled order' },
  { at: 168200, title: 'Payment request, drafted and defended' },
  { at: 190200, title: 'Live' },
]
export const STORY_MS = 190200

const NODE_WORD: Record<string, string> = {
  'a:purchasing': 'the purchasing agent',
  'a:bookkeeping': 'the bookkeeping agent',
  'a:payment_report': 'the payment & report agent',
  'p:grant_manager': 'the grant manager',
  'p:funder': 'NIH',
  'v:vendors': 'the vendors',
}

function nodeWord(w: World, id: string) {
  return NODE_WORD[id] ?? w.nodes.find(n => n.id === id)?.label ?? 'the lab'
}

/** One line for a packet, from the point of view of the node `me`. */
function describe(p: Packet, me: string, w: World): string {
  const out = p.from === me
  const req = p.refId ? w.requests.find(r => r.id === p.refId) : undefined
  const who = req ? firstName(personName(w, req.researcherId)) : 'A lab member'
  const thing = req ? shortItem(req.item).toLowerCase() : 'a request'
  const head = p.label.split(' · ')[0]
  switch (p.kind) {
    case 'request':
      return `Taking in ${who}’s request: ${thing}`
    case 'pushback':
      return `Hearing ${who} push back on the ${thing}`
    case 'verdict':
      return `Telling ${who}: ${head.charAt(0).toLowerCase()}${head.slice(1)}`
    case 'recheck':
      if (me === 'a:purchasing') return out ? 'Asking bookkeeping to check the grant again before money moves' : 'Hearing back: the grant is still good'
      return out ? 'Telling purchasing the grant is still good' : 'Checking the grant again before money moves'
    case 'reading':
      return `Reading ${nodeWord(w, p.from)}`
    case 'payment':
      return `Recording a payment: ${p.label}`
    case 'hold':
      return out ? `Asking the grant manager: ${p.label}` : `A new question from ${nodeWord(w, p.from)}`
    case 'decision':
      return out ? `Sending a decision to ${nodeWord(w, p.to)}` : `Getting the grant manager’s answer: ${p.label.toLowerCase()}`
    case 'paper':
      return `Checking a paper: ${p.label}`
    case 'invoice':
      return `Checking a bill from ${head}`
    case 'payment_request':
      return out ? `Sending NIH: ${p.label.charAt(0).toLowerCase()}${p.label.slice(1)}` : 'Reading a payment request'
    case 'follow_up':
      return out ? 'Asking a follow-up question' : `Answering NIH: “${p.label}”`
    default:
      return `Working with ${nodeWord(w, out ? p.to : p.from)}`
  }
}

export type AgentState = 'idle' | 'working' | 'waiting'

/** What an agent (or the grant manager) is doing now, from in-flight packets, open holds and the log. */
export function agentNow(w: World, id: string): { state: AgentState; word: string; line: string } {
  if (id === 'p:grant_manager') {
    const open = w.holds.filter(h => h.open)
    if (open.length) return { state: 'waiting', word: 'Waiting on you', line: open.length === 1 ? open[0].title : `${open.length} decisions: ${open[0].title}, and more` }
    const coming = w.packets.find(p => p.to === id && p.kind === 'hold')
    if (coming) return { state: 'working', word: 'Question coming', line: `${nodeWord(w, coming.from).replace(/^the /, 'The ')} is asking: ${coming.label}` }
    const last = w.holds.find(h => h.decision)
    return { state: 'idle', word: 'Nothing to decide', line: last ? `Last decided: ${last.title}` : 'Holds land here when an agent needs a person.' }
  }
  const role = id.slice(2)
  let mine: Packet | undefined
  for (const p of w.packets) if ((p.from === id || p.to === id) && (!mine || p.sentAt > mine.sentAt)) mine = p
  if (role === 'purchasing' && !mine) {
    const checking = w.requests.find(r => !r.outcome && r.verdicts.length > 0)
    if (checking) {
      const what = `${firstName(personName(w, checking.researcherId))}’s ${shortItem(checking.item).toLowerCase()}`
      // Rules done, money about to move: bookkeeping is re-reading the sources.
      if (w.packets.some(p => p.refId === checking.id)) return { state: 'working', word: 'Checking again', line: `Bookkeeping is re-reading the sources before money moves on ${what}` }
      return { state: 'working', word: 'Running the rules', line: `The six spending rules, one by one, on ${what}` }
    }
  }
  if (mine) return { state: 'working', word: 'Working', line: describe(mine, id, w) }
  const held = w.holds.find(h => h.open && h.raisedBy === role)
  if (held) return { state: 'waiting', word: 'Waiting on you', line: held.title }
  const last = w.log.find(l => l.actor === role)
  return { state: 'idle', word: 'Idle', line: last ? `Last: ${prose(last.reason)}` : 'Nothing yet.' }
}

/** Log actions in a few plain words. */
export function actionWord(row: LogRow): string {
  const a = row.action
  if (a.startsWith('submit_request')) return 'Asked to buy'
  if (a.endsWith(': buy')) return 'Bought'
  if (a.endsWith(': reroute')) return 'Rerouted'
  if (a.endsWith(': block')) return 'Blocked'
  if (a.endsWith(': hold')) return 'Held'
  if (a.startsWith('raise_hold')) return 'Asked the grant manager'
  if (a.startsWith('request_check')) return 'Checked again'
  if (a.startsWith('push_back')) return 'Pushed back'
  if (a.startsWith('decide_hold')) return a.endsWith('approve') ? 'Approved' : 'Rejected'
  if (a.startsWith('post_status_event')) return 'Read a status change'
  if (a.startsWith('raise_flag')) return 'Flagged'
  if (a.startsWith('daily')) return 'Daily check'
  if (a.startsWith('check_invoice')) return a.endsWith('matched') ? 'Invoice matched' : 'Held an invoice'
  if (a.startsWith('check_paper')) return a.endsWith('ok') ? 'Paper checked' : a.endsWith('held') ? 'Held a paper' : 'Noted a paper'
  if (a.startsWith('draft_payment_request')) return 'Drafted a payment request'
  if (a.startsWith('answer_follow_up')) return 'Answered NIH'
  return a.replace(/_/g, ' ').replace(/:.*/, '')
}
