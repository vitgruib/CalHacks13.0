// Scene-local glow, outside React so a feed event never re-renders the
// canvas. Signals touch a weight or a neuron; the network fades each one out
// in wall time, so a glow lasts the same on screen at any story speed.

import { Color, Vector3 } from 'three'
import { GLAZE, PAL } from '../a1/layout'
import type { Outcome } from '../../feed'

export interface Glow {
  v: number
  c: Color
  tau: number // seconds to fall to about a third
}

export const glow = {
  edge: new Map<string, Glow>(),
  node: new Map<string, Glow>(),
  ripples: [] as { at: Vector3; c: Color; t: number; size: number }[], // t counts up in seconds
}

function touch(m: Map<string, Glow>, id: string, c: Color, v: number, tau: number) {
  const g = m.get(id)
  if (!g) m.set(id, { v, c: c.clone(), tau })
  else {
    if (v >= g.v * 0.6) g.c.copy(c)
    g.v = Math.max(g.v, v)
    g.tau = tau
  }
}

export const touchEdge = (key: string, c: Color, v = 1, tau = 0.75) => touch(glow.edge, key, c, v, tau)
export const touchNode = (id: string, c: Color, v = 1, tau = 0.9) => touch(glow.node, id, c, v, tau)
export const ripple = (at: Vector3, c: Color, size = 1.6) => {
  glow.ripples.push({ at: at.clone(), c: c.clone(), t: 0, size })
  if (glow.ripples.length > 8) glow.ripples.shift()
}

export function decay(dt: number) {
  for (const m of [glow.edge, glow.node])
    for (const [k, g] of m) {
      g.v *= Math.exp(-dt / g.tau)
      if (g.v < 0.01) m.delete(k)
    }
  for (let i = glow.ripples.length - 1; i >= 0; i--) {
    glow.ripples[i].t += dt
    if (glow.ripples[i].t > 1.6) glow.ripples.splice(i, 1)
  }
}

export function clearGlow() {
  glow.edge.clear()
  glow.node.clear()
  glow.ripples.length = 0
}

const C = (hex: string) => new Color(hex)
export const COL = {
  ink: C('#3A4654'), // a request in flight: dark clay, so it reads on the pale deck
  cream: C('#FFF1DA'),
  pass: C('#86C9AC'),
  fail: C(GLAZE.reject),
  money: C(PAL.money),
  paper: C('#9A8468'),
  reading: C('#7FA0C2'),
  alarm: C('#D0614F'),
  good: C('#8FD6B5'),
  ice: C('#CFE0EE'),
}
export const OUT_COL: Record<Outcome, Color> = { accept: C(GLAZE.accept), refine: C(GLAZE.refine), reject: C(GLAZE.reject), hold: C(GLAZE.hold) }
