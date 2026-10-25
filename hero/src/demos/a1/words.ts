// Plain words for the sidebar: dates, grant status, log actions, and one line
// on what each node in the network is doing right now. No ids reach the screen.

import { R01, R21 } from '../../feed'
import type { Grant, LogRow, Packet, Request, StatusEvent, World } from '../../feed'

export const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
export const fmtShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export const ACTOR: Record<LogRow['actor'], string> = {
  purchasing: 'Purchasing agent',
  bookkeeping: 'Bookkeeping agent',
  payment_report: 'Payment & report agent',
  grant_manager: 'Grant manager',
  scientist: 'Researcher',
  system: 'System',
}

/** Each grant's colour in the 3D scene (reservoir collars, re-tagged parcels). Keys only; never shown. */
export const GRANT_COLOR: Record<string, string> = { [R01]: '#d0607a', [R21]: '#6f62b8' }

export const firstName = (name: string) => name.replace(/^Dr\.\s+/, '').split(' ')[0]
export const shortItem = (item: string) => item.split(',')[0]
export const possessive = (name: string) => `${name}’s`

export type GrantTone = 'ok' | 'frozen' | 'ended'
export function grantStatus(g: Grant): { word: string; tone: GrantTone } {
  if (g.status === 'ended') return { word: 'Ended', tone: 'ended' }
  if (g.frozen) return g.status === 'restored_by_court' ? { word: 'Restored by court, still frozen', tone: 'frozen' } : { word: 'Canceled, spending frozen', tone: 'frozen' }
  return { word: 'Active', tone: 'ok' }
}

export const daysLeft = (today: string, end: string) => Math.max(0, Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000))

const ACTIONS: [RegExp, string][] = [
  [/^submit_request/, 'Asked'],
  [/^push_back/, 'Pushed back'],
  [/^decide_hold: approve/, 'Approved'],
  [/^decide_hold: reject/, 'Rejected'],
  [/^act_on_request: buy/, 'Bought'],
  [/^act_on_request: reroute/, 'Rerouted'],
  [/^act_on_request: hold/, 'Held'],
  [/^act_on_request: block/, 'Blocked'],
  [/^raise_hold/, 'Asked the grant manager'],
  [/^request_check/, 'Checked again'],
  [/^post_status_event/, 'Status update'],
  [/^raise_flag/, 'Flagged'],
  [/^daily check/, 'Daily check'],
  [/^check_invoice: matched/, 'Invoice matched'],
  [/^check_invoice/, 'Invoice held'],
  [/^check_paper: ok/, 'Paper checked'],
  [/^check_paper: note/, 'Paper noted'],
  [/^check_paper/, 'Paper held'],
  [/^draft_payment_request/, 'Drafted a payment request'],
  [/^answer_follow_up/, 'Answered NIH'],
]
export function actionWord(action: string) {
  for (const [re, word] of ACTIONS) if (re.test(action)) return word
  const w = action.split(':')[0].replace(/_/g, ' ')
  return w.charAt(0).toUpperCase() + w.slice(1)
}

const SOURCE: Record<string, string> = {
  's:reporter': 'NIH RePORTER',
  's:usaspending': 'USAspending',
  's:cancellations': 'the cancellation list',
  's:court': 'the court notice',
  's:payments': 'the payment system',
}

const FEED_SOURCE: Record<StatusEvent['source'], string> = {
  'NIH RePORTER': 's:reporter',
  USAspending: 's:usaspending',
  'Cancellation list (Apify)': 's:cancellations',
  'Court notice': 's:court',
  'Payment system': 's:payments',
}

export function nodeName(id: string, w: World) {
  if (id.startsWith('r:')) return w.researchers.find(r => r.id === id.slice(2))?.name ?? 'A researcher'
  if (id.startsWith('g:')) return w.grants.find(g => g.id === id.slice(2))?.name ?? 'A grant'
  const n = w.nodes.find(x => x.id === id)
  if (n) return n.label
  const r = w.requests.find(q => q.id === id)
  return r ? shortItem(r.item) : ''
}

const who = (id: string, w: World) => (id.startsWith('r:') ? firstName(nodeName(id, w)) : nodeName(id, w))
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

export type NodeState = 'idle' | 'working' | 'waiting'
export interface Now {
  state: NodeState
  line: string
}

/** The packet touching `id` that left most recently, or nothing. */
function latest(id: string, packets: Packet[]) {
  let best: Packet | undefined
  for (const p of packets) if ((p.from === id || p.to === id) && (!best || p.sentAt > best.sentAt)) best = p
  return best
}

function describe(p: Packet, id: string, w: World): string {
  const out = p.from === id
  switch (p.kind) {
    case 'request':
      return out ? `Sending a request: ${p.label}` : `Receiving ${possessive(who(p.from, w))} request: ${p.label}`
    case 'pushback':
      return out ? 'Pushing back on a hold' : `Hearing ${who(p.from, w)} push back on a hold`
    case 'verdict':
      return out ? `Answering ${who(p.to, w)}: ${lower(p.label)}` : `Hearing back: ${lower(p.label)}`
    case 'recheck':
      if (id === 'a:purchasing') return out ? 'Asking bookkeeping to check the grant again before money moves' : 'Hearing that the grant is still good'
      return out ? 'Confirming the grant is still good' : 'Re-reading the sources before money moves'
    case 'reading':
      return out ? 'Sending a reading to bookkeeping' : `Reading ${SOURCE[p.from] ?? 'a source'}`
    case 'payment':
      return out ? `Sending a payment: ${lower(p.label)}` : `Logging a payment: ${lower(p.label)}`
    case 'charge':
      return out ? `Paying an order: ${p.label}` : `Receiving an order: ${p.label}`
    case 'invoice':
      return out ? `Sending an invoice: ${p.label}` : `Checking an invoice: ${p.label}`
    case 'hold':
      return out ? `Asking the grant manager: ${lower(p.label)}` : `Receiving a question from the ${lower(nodeName(p.from, w))}`
    case 'decision':
      return out ? `Sending a decision: ${lower(p.label)}` : `Hearing the grant manager: ${lower(p.label)}`
    case 'paper':
      return out ? 'Sending a paper for the progress report' : `Checking a paper from ${who(p.from, w)}`
    case 'payment_request':
      return out ? `Sending NIH: ${lower(p.label)}` : `Receiving: ${lower(p.label)}`
    case 'follow_up':
      return out ? `Asking: ${p.label}` : `NIH asks: ${p.label}`
  }
}

/** What a finance-side or outside node is doing now, from the packets in flight and the log. */
export function nodeNow(id: string, w: World): Now {
  if (id === 'p:grant_manager') {
    const n = w.holds.reduce((k, h) => k + (h.open ? 1 : 0), 0)
    if (n) return { state: 'waiting', line: `${n} decision${n === 1 ? '' : 's'} waiting on you` }
    const p = latest(id, w.packets)
    if (p) return { state: 'working', line: describe(p, id, w) }
    const last = w.holds.find(h => h.decision)
    return { state: 'idle', line: last ? `Last decided: ${last.title}` : 'Nothing waiting' }
  }
  if (id.startsWith('a:')) {
    const role = id.slice(2)
    const open = w.holds.find(h => h.open && h.raisedBy === role)
    if (open) return { state: 'waiting', line: `Waiting on you: ${open.title}` }
    const p = latest(id, w.packets)
    if (p) return { state: 'working', line: describe(p, id, w) }
    if (role === 'purchasing') {
      const r = w.requests.find(q => !q.outcome && q.verdicts.length)
      if (r) return { state: 'working', line: `Running the six spending rules on ${lower(shortItem(r.item))}` }
    }
    const last = w.log.find(l => l.actor === role)
    return { state: 'idle', line: last ? `Last: ${last.reason}` : 'Nothing yet' }
  }
  if (id.startsWith('r:')) {
    const p = latest(id, w.packets)
    if (p && p.from === id) return { state: 'working', line: describe(p, id, w) }
    const r = w.researchers.find(x => x.id === id.slice(2))
    return { state: 'idle', line: r?.task ?? '' }
  }
  if (id.startsWith('g:')) {
    const g = w.grants.find(x => x.id === id.slice(2))
    return { state: g?.frozen ? 'waiting' : 'idle', line: g ? grantStatus(g).word : '' }
  }
  const p = latest(id, w.packets)
  if (p) return { state: 'working', line: describe(p, id, w) }
  if (id.startsWith('s:')) {
    const ev = w.statusEvents.find(e => FEED_SOURCE[e.source] === id)
    return { state: 'idle', line: ev ? `Last: ${ev.summary}` : 'Quiet' }
  }
  return { state: 'idle', line: 'Quiet' }
}

export function requestStatus(r: Request, packets: Packet[]) {
  const traveling = packets.some(p => p.refId === r.id && (p.kind === 'request' || p.kind === 'verdict'))
  if (!r.outcome) return r.verdicts.length ? 'checking the spending rules' : 'on its way'
  return traveling ? 'on its way back' : ''
}
