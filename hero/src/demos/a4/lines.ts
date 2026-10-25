// The transit map's four lines, shared by the map and the sidebar so a
// colour means the same thing in both. Every packet kind rides one line.

import { EDGES } from '../../feed'
import type { PacketKind } from '../../feed'

export type Line = 'requests' | 'money' | 'readings' | 'people'

export const LINES: Record<Line, { name: string; color: string }> = {
  requests: { name: 'Requests and answers', color: '#D9623A' },
  money: { name: 'Money', color: '#2F9DB5' },
  readings: { name: 'Readings', color: '#7C62AE' },
  people: { name: 'Holds and decisions', color: '#C24F7E' },
}

export const LINE_ORDER: Line[] = ['requests', 'money', 'readings', 'people']

export const LINE_OF: Record<PacketKind, Line> = {
  request: 'requests',
  verdict: 'requests',
  pushback: 'requests',
  recheck: 'requests',
  paper: 'requests',
  payment: 'money',
  charge: 'money',
  invoice: 'money',
  payment_request: 'money',
  follow_up: 'money',
  reading: 'readings',
  hold: 'people',
  decision: 'people',
}

/** The lines that stop at a node, in map order: what a station sign lists. */
export function linesAt(id: string): Line[] {
  const on = new Set<Line>()
  for (const e of EDGES) if (e.from === id || e.to === id) for (const k of e.kinds) on.add(LINE_OF[k])
  return LINE_ORDER.filter(l => on.has(l))
}
