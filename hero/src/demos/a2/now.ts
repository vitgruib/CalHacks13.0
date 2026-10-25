// Plain words for what every node is doing right now, derived from the World
// snapshot (packets in flight, open holds, requests being checked, the log).
// The sidebar uses these, and the scene's hover card may too, so both say
// the same thing. No ids ever come out of here.

import type { Grant, Packet, Request, World } from '../../feed'
import { outcomeWord } from './icons'

export type Busy = 'idle' | 'working' | 'waiting'
export interface Line {
  text: string
  busy: Busy
}

export const firstName = (name: string) => name.replace(/^Dr\.\s+/, '').split(' ')[0]
export const shortItem = (item: string) => item.split(',')[0]

export const grantName = (w: World, gid: string | undefined) => w.grants.find(g => g.id === gid)?.name ?? 'another grant'

export function daysLeft(today: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000)
}

export function grantStatus(g: Grant): string {
  if (g.status === 'ended') return 'Ended'
  if (g.frozen) return g.status === 'restored_by_court' ? 'Restored by court, still frozen' : 'Canceled, spending frozen'
  return 'Active'
}

export function nodeName(w: World, id: string): string {
  if (id.startsWith('r:')) return w.researchers.find(r => r.id === id.slice(2))?.name ?? 'A researcher'
  if (id.startsWith('a:')) return w.agents.find(a => a.role === id.slice(2))?.name ?? 'An agent'
  if (id.startsWith('g:')) return grantName(w, id.slice(2))
  const n = w.nodes.find(x => x.id === id)
  if (n) return n.label
  const r = w.requests.find(q => q.id === id)
  return r ? shortItem(r.item) : ''
}

const into = (w: World, id: string, ...kinds: Packet['kind'][]) => w.packets.find(p => p.to === id && (!kinds.length || kinds.includes(p.kind)))
const outOf = (w: World, id: string, ...kinds: Packet['kind'][]) => w.packets.find(p => p.from === id && (!kinds.length || kinds.includes(p.kind)))
const openHoldBy = (w: World, role: string) => w.holds.find(h => h.open && h.raisedBy === role)
const checking = (w: World): Request | undefined => w.requests.find(r => !r.outcome && r.verdicts.length > 0)

const IDLE: Record<string, string> = {
  purchasing: 'Ready for the next request',
  bookkeeping: 'Watching the grant sources',
  payment_report: 'Ready for papers and payment requests',
}

/** One line on what a node is doing now, and whether it is idle, working, or waiting on a person. */
export function nodeLine(w: World, id: string): Line {
  if (id.startsWith('r:')) {
    const r = w.researchers.find(x => x.id === id.slice(2))
    const sent = outOf(w, id, 'request', 'pushback', 'paper')
    if (sent) return { text: sent.kind === 'paper' ? `Sending a paper: ${sent.label}` : sent.kind === 'pushback' ? 'Pushing back on a hold' : `Asking for ${sent.label}`, busy: 'working' }
    const back = into(w, id, 'verdict')
    if (back) return { text: `Hearing back: ${back.label}`, busy: 'working' }
    return { text: r?.task ?? '', busy: 'idle' }
  }

  if (id === 'a:purchasing') {
    const held = openHoldBy(w, 'purchasing')
    const arriving = into(w, id, 'request', 'pushback')
    if (arriving) return { text: arriving.kind === 'pushback' ? 'Hearing a push back on a hold' : `Receiving ${arriving.label}`, busy: 'working' }
    const c = checking(w)
    if (c) return { text: `Checking ${shortItem(c.item).toLowerCase()} against the six rules`, busy: 'working' }
    if (outOf(w, id, 'recheck') || into(w, id, 'recheck')) return { text: 'Checking once more before money moves', busy: 'working' }
    const answer = outOf(w, id, 'verdict')
    if (answer) return { text: `Answering: ${answer.label}`, busy: 'working' }
    if (into(w, id, 'decision')) return { text: 'Getting the grant manager’s decision', busy: 'working' }
    if (held) return { text: `Waiting on the grant manager: ${held.title}`, busy: 'waiting' }
    return { text: IDLE.purchasing, busy: 'idle' }
  }

  if (id === 'a:bookkeeping') {
    const held = openHoldBy(w, 'bookkeeping')
    const pay = into(w, id, 'payment')
    if (pay) return { text: `Recording a payment: ${pay.label}`, busy: 'working' }
    const inv = into(w, id, 'invoice')
    if (inv) return { text: `Checking an invoice: ${inv.label}`, busy: 'working' }
    if (into(w, id, 'recheck') || outOf(w, id, 'recheck')) return { text: 'Reading the sources again before money moves', busy: 'working' }
    const read = into(w, id, 'reading')
    if (read) return { text: `Reading ${nodeName(w, read.from)}`, busy: 'working' }
    if (into(w, id, 'decision')) return { text: 'Getting the grant manager’s decision', busy: 'working' }
    if (held) return { text: `Waiting on the grant manager: ${held.title}`, busy: 'waiting' }
    const frozen = w.grants.find(g => g.frozen)
    if (frozen) return { text: `Keeping the ${frozen.name.toLowerCase()} frozen until money lands`, busy: 'idle' }
    return { text: IDLE.bookkeeping, busy: 'idle' }
  }

  if (id === 'a:payment_report') {
    const held = openHoldBy(w, 'payment_report')
    const paper = into(w, id, 'paper')
    if (paper) return { text: `Checking a paper: ${paper.label}`, busy: 'working' }
    if (into(w, id, 'follow_up')) return { text: 'Answering the funder’s follow-up question', busy: 'working' }
    if (outOf(w, id, 'payment_request')) return { text: 'Sending the payment request to the funder', busy: 'working' }
    if (into(w, id, 'decision')) return { text: 'Getting the grant manager’s decision', busy: 'working' }
    if (held) return { text: `Waiting on the grant manager: ${held.title}`, busy: 'waiting' }
    return { text: IDLE.payment_report, busy: 'idle' }
  }

  if (id === 'p:grant_manager') {
    const n = w.holds.filter(h => h.open).length
    if (n) return { text: `${n} decision${n === 1 ? '' : 's'} waiting. You decide.`, busy: 'waiting' }
    if (into(w, id, 'hold')) return { text: 'An agent is asking for a decision', busy: 'working' }
    if (outOf(w, id, 'decision')) return { text: 'Sending a decision back', busy: 'working' }
    return { text: 'Nothing waiting', busy: 'idle' }
  }

  if (id.startsWith('g:')) {
    const g = w.grants.find(x => x.id === id.slice(2))
    if (!g) return { text: '', busy: 'idle' }
    const charge = outOf(w, id, 'charge')
    if (charge) return { text: `Paying a ${charge.label}`, busy: 'working' }
    return { text: grantStatus(g), busy: g.frozen ? 'waiting' : 'idle' }
  }

  if (id === 'v:vendors') {
    const order = into(w, id, 'charge')
    if (order) return { text: `Receiving a ${order.label}`, busy: 'working' }
    const bill = outOf(w, id, 'invoice')
    if (bill) return { text: `Sending an invoice: ${bill.label}`, busy: 'working' }
    return { text: 'Fills orders and sends invoices', busy: 'idle' }
  }

  if (id === 'p:funder') {
    if (into(w, id, 'payment_request')) return { text: 'Reading a payment request', busy: 'working' }
    if (outOf(w, id, 'follow_up')) return { text: 'Asking a follow-up question', busy: 'working' }
    return { text: 'Pays the grants and asks follow-up questions', busy: 'idle' }
  }

  if (id.startsWith('s:')) {
    const p = outOf(w, id)
    if (p) return { text: `Sending: ${p.label}`, busy: 'working' }
    return { text: 'Read by the bookkeeping agent', busy: 'idle' }
  }

  const r = w.requests.find(q => q.id === id)
  if (r) return { text: `${shortItem(r.item)}: ${outcomeWord(r).toLowerCase()}`, busy: r.outcome ? 'idle' : 'working' }
  return { text: '', busy: 'idle' }
}

export const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
export const fmtShortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Each grant's tag colour, the same one the scene paints on parcels and vessel collars. */
const TINTS = ['#C25B7A', '#6F62B0']
export const grantTint = (w: World, gid: string | undefined) => TINTS[Math.max(0, w.grants.findIndex(g => g.id === gid))] ?? TINTS[0]

/** Engine text in plain words: ISO dates read as dates, and no PubMed abbreviations. */
export const say = (text: string) =>
  text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (_, d: string) => fmtDay(d)).replace(/\bPMCID\b/g, 'PubMed Central ID')
