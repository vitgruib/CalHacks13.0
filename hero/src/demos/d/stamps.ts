// The verdict moment: a slip lands on the researcher's desk and a rubber
// stamp slams onto it. Each outcome has its own stamp form and its own
// after-motion: BOUGHT files into the tray, REROUTED / SENT BACK slides off
// sideways, BLOCKED is struck through and shakes, HELD is pinned and waits.

import * as THREE from 'three'
import type { Outcome, Packet, Request } from '../../feed'
import { el, overlay } from './store'

export function outcomeWord(o: Outcome | undefined, label = '') {
  if (o === 'accept') return 'Bought'
  if (o === 'refine') return label.startsWith('Rerouted') ? 'Rerouted' : 'Sent back'
  if (o === 'reject') return 'Blocked'
  if (o === 'hold') return 'Held'
  return 'Sent'
}

const FRAME: Record<Outcome, string> = {
  accept: '<svg viewBox="0 0 140 64" preserveAspectRatio="none" aria-hidden="true"><rect x="3" y="3" width="134" height="58" fill="none" stroke="currentColor" stroke-width="5"/><rect x="10" y="10" width="120" height="44" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  refine: '<svg viewBox="0 0 160 64" preserveAspectRatio="none" aria-hidden="true"><path d="M3 3H128L156 32L128 61H3Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M11 10H124L145 32L124 54H11Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  reject: '<svg viewBox="0 0 140 64" preserveAspectRatio="none" aria-hidden="true"><rect x="3" y="3" width="134" height="58" fill="none" stroke="currentColor" stroke-width="8"/></svg>',
  hold: '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="50" cy="50" r="37" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
}

const STRIKE = '<svg class="dd-strike" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"><path d="M4 6L96 54" pathLength="1"/><path d="M96 6L4 54" pathLength="1"/></svg>'

const stacks = new Map<string, number>()

export function landStamp(p: Packet, req: Request | undefined, at: THREE.Vector3) {
  const o: Outcome = p.outcome ?? 'accept'
  const root = el('div', 'dd-land')
  root.dataset.o = o
  const n = stacks.get(p.to) ?? 0
  stacks.set(p.to, n + 1)
  root.style.setProperty('--i', String(n % 3))
  const slip = el('div', 'dd-land-slip')
  const head = el('div', 'dd-land-head')
  head.append(el('b', '', req ? req.item.split(',')[0] : p.label.split(' · ').slice(1).join(' · ')), el('span', 'dd-id', p.refId ?? ''))
  const why = el('p', 'dd-land-why', req ? firstSentence(req.explanation) : '')
  slip.append(head, why)
  if (o === 'reject') slip.insertAdjacentHTML('beforeend', STRIKE)
  const stamp = el('div', 'dd-stamp')
  stamp.dataset.o = o
  stamp.innerHTML = FRAME[o]
  const word = el('span', 'dd-stamp-word', outcomeWord(o, p.label))
  const sub = el('span', 'dd-stamp-sub', stampSub(o, p, req))
  stamp.append(word, sub)
  slip.append(stamp)
  root.append(slip)
  const pos = at.clone()
  const a = overlay.add(root, () => pos)
  const life = o === 'hold' ? 7600 : 5600
  window.setTimeout(() => root.classList.add('is-out'), life)
  window.setTimeout(() => {
    overlay.remove(a)
    stacks.set(p.to, Math.max(0, (stacks.get(p.to) ?? 1) - 1))
  }, life + 700)
}

function stampSub(o: Outcome, p: Packet, req?: Request) {
  if (o === 'accept') return req?.revisionOf ? 'Split, every rule passed' : 'Every rule passed'
  if (o === 'refine') return req?.chargedGrantId ? `To ${req.chargedGrantId}` : p.label.startsWith('Rerouted') ? p.label.split(' · ')[0].replace('Rerouted to ', 'To ') : 'Split it, resubmit'
  if (o === 'reject') return 'Not allowed'
  return p.holdFor === 'grant_manager' ? 'Grant manager decides' : 'Until money lands'
}

function firstSentence(s: string) {
  const i = s.search(/[.!?](\s|$)/)
  return i > 0 ? s.slice(0, i + 1) : s
}
