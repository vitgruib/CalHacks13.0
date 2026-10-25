// How a packet gets from one node to another: held up in a researcher's
// hands, an arc through the air to a port on the network's edge, then along
// the grooves inlaid in the slate. Routes are built once per packet; a
// position along one is cheap. The groove under a packet lights up in its
// colour (GLOW, read by the groove shader in Office.tsx).

import { Color, Vector3 } from 'three'
import type { Packet } from '../../feed'
import { FUNDER, GROOVES, HOME, NET, SPOTS, VENDORS, grooveIndex, parkOf, portFor } from './layout'
import { fx } from './fx'

/** Of a request's flight: held up in the hands before it leaves. */
export const SEND_HOLD = 0.24
/** Of an answer's flight: stamped on the purchasing pod before it leaves. */
export const STAMP = 0.14

export type Phase = 'hands' | 'dock' | 'air' | 'groove'

interface Stay {
  t: 'stay'
  k0: number
  k1: number
  at: Vector3 | null // null: the researcher's hands
}
interface Air {
  t: 'air'
  k0: number
  k1: number
  a: Vector3 | null // null: the researcher's hands
  b: Vector3 | null
  h: number
}
interface Line {
  t: 'line'
  k0: number
  k1: number
  pts: Vector3[]
  cum: number[]
  total: number
  g: number // groove index
  dir: number // 1: along the groove's a → b, −1: against
  s0: number // where the groove proper starts and ends along this line
  s1: number
}
type Leg = Stay | Air | Line
export interface Route {
  legs: Leg[]
  rid: string // researcher at one end, or ''
  move0: number // where moving starts
  move1: number
}

// ── Building ─────────────────────────────────────────────────────────────

export function dock(id: string, out = new Vector3()) {
  if (id === 'v:vendors') return out.set(VENDORS[0] - 0.9, VENDORS[1] + 0.05, VENDORS[2] - 0.2)
  if (id === 'p:funder') return out.set(FUNDER[0] + 0.1, FUNDER[1] + 0.05, FUNDER[2] + 0.9)
  const n = NET[id]
  return n ? out.set(n.at[0], n.top, n.at[1]) : out.set(0, 0.5, 0)
}

function line(gi: number, fromA: boolean): Line {
  const g = GROOVES[gi]
  const src = fromA ? g.pts : [...g.pts].reverse()
  const A = fromA ? g.a : g.b
  const B = fromA ? g.b : g.a
  const ra = NET[A]?.r ?? 0
  const rb = NET[B]?.r ?? 0
  const n = src.length
  const rim = (p: [number, number], q: [number, number], r: number) => {
    const dx = q[0] - p[0]
    const dz = q[1] - p[1]
    const l = Math.hypot(dx, dz) || 1
    return new Vector3(p[0] + (dx / l) * (r + 0.12), 0, p[1] + (dz / l) * (r + 0.12))
  }
  const pts = [dock(A), rim(src[0], src[1], ra)]
  for (let i = 1; i < n - 1; i++) pts.push(new Vector3(src[i][0], 0, src[i][1]))
  pts.push(rim(src[n - 1], src[n - 2], rb), dock(B))
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
  const total = cum[cum.length - 1] || 1
  return { t: 'line', k0: 0, k1: 1, pts, cum, total, g: gi, dir: fromA ? 1 : -1, s0: cum[1], s1: cum[cum.length - 2] }
}

function lineBetween(a: string, b: string): Line | null {
  const gi = grooveIndex(a, b)
  if (gi < 0) return null
  return line(gi, GROOVES[gi].a === a)
}

const airLen = (a: Vector3, b: Vector3) => a.distanceTo(b) * 1.3

/** Spread the moving legs over [k0, 1] by length. */
function time(legs: Leg[], k0: number, k1 = 1) {
  const len = legs.map(l => (l.t === 'line' ? l.total : l.t === 'air' ? airLen(l.a ?? HANDS_GUESS, l.b ?? HANDS_GUESS) : 0))
  const sum = len.reduce((s, x) => s + x, 0) || 1
  let k = k0
  legs.forEach((l, i) => {
    l.k0 = k
    k += ((k1 - k0) * len[i]) / sum
    l.k1 = k
  })
}

const HANDS_GUESS = new Vector3(-7, 1.2, 0)
const arcH = (a: Vector3 | null, b: Vector3 | null) => Math.max(1.9, 0.16 * (a ?? HANDS_GUESS).distanceTo(b ?? HANDS_GUESS))

function build(from: string, to: string): Route {
  const legs: Leg[] = []
  let rid = ''
  let move0 = 0
  let move1 = 1
  const head: Leg[] = []
  const tail: Leg[] = []
  let a = from
  let b = to
  const pf = portFor(from, to)
  const pt = portFor(to, from)
  if (from.startsWith('r:')) {
    rid = from.slice(2)
    head.push({ t: 'stay', k0: 0, k1: SEND_HOLD, at: null })
    const d = dock('port:lab')
    head.push({ t: 'air', k0: 0, k1: 0, a: null, b: d, h: arcH(null, d) })
    a = 'port:lab'
    move0 = SEND_HOLD
  } else if (pf) {
    const s = dock(from)
    const d = dock(pf)
    head.push({ t: 'air', k0: 0, k1: 0, a: s, b: d, h: arcH(s, d) * 0.6 })
    a = pf
  }
  if (to.startsWith('r:')) {
    rid = to.slice(2)
    const d = dock('port:lab')
    tail.push({ t: 'air', k0: 0, k1: 0, a: d, b: null, h: arcH(d, null) })
    b = 'port:lab'
  } else if (pt) {
    const s = dock(pt)
    const d = dock(to)
    tail.push({ t: 'air', k0: 0, k1: 0, a: s, b: d, h: arcH(s, d) * 0.6 })
    b = pt
  }
  if (from === 'a:purchasing' && to.startsWith('r:')) {
    legs.push({ t: 'stay', k0: 0, k1: STAMP, at: dock(from) })
    move0 = STAMP
  }
  legs.push(...head)
  const mid = a !== b ? lineBetween(a, b) : null
  if (mid) legs.push(mid)
  else if (a !== b) legs.push({ t: 'air', k0: 0, k1: 0, a: dock(a), b: dock(b), h: 1.2 })
  legs.push(...tail)
  time(legs.filter(l => l.t !== 'stay'), move0, move1)
  return { legs, rid, move0, move1 }
}

/** A held-for-money answer: along the groove to the frozen grant, then up to its parking slot. */
export function parkRoute(gid: string, slot: number): Route {
  const legs: Leg[] = [{ t: 'stay', k0: 0, k1: STAMP, at: dock('a:purchasing') }]
  const l = lineBetween('a:purchasing', `g:${gid}`)
  const g = dock(`g:${gid}`)
  if (l) legs.push(l)
  legs.push({ t: 'air', k0: 0, k1: 0, a: g, b: parkOf(gid, slot, new Vector3()), h: 0.6 })
  time(legs.filter(x => x.t !== 'stay'), STAMP)
  return { legs, rid: '', move0: STAMP, move1: 1 }
}

const cache = new Map<string, Route>()
export function routeOf(p: Packet): Route {
  let r = cache.get(p.id)
  if (!r) {
    r = build(p.from, p.to)
    cache.set(p.id, r)
  }
  return r
}
/** Forget routes for packets no longer in flight. */
export function pruneRoutes(live: Set<string>) {
  for (const id of cache.keys()) if (!live.has(id)) cache.delete(id)
}
export const clearRoutes = () => cache.clear()

// ── Reading ──────────────────────────────────────────────────────────────

const ha = new Vector3()
const hb = new Vector3()

/** Where a researcher's hands are now (or their home station if the figure isn't there). */
export function handsOf(rid: string, out: Vector3) {
  const f = fx.figs.get(rid)
  if (f) return out.copy(f.hands)
  const s = SPOTS[HOME[rid] ?? 'fplc']
  return out.set(s.at[0], 1.2, s.at[1])
}

const sine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x)
/** The leg placeAt last landed on: how far along it, and whether it is the final leg. */
export const LEG = { u: 0, last: false }

const WALL_X = -1.47 // the lab's wall on the network side
const CLEAR = 2.85 // over the top of it, with room for the item

/** Height along a flight: an arc that always clears the lab wall, or under reduced motion straight lines (up, across, down). */
function airY(a: Vector3, b: Vector3, u: number, h: number, still: boolean) {
  const base = a.y + (b.y - a.y) * u
  const crosses = (a.x - WALL_X) * (b.x - WALL_X) < 0
  const uw = crosses ? (WALL_X - a.x) / (b.x - a.x) : 0.5
  if (!still) {
    if (crosses) h = Math.max(h, (CLEAR - (a.y + (b.y - a.y) * uw)) / (4 * uw * (1 - uw)))
    return base + 4 * h * u * (1 - u)
  }
  if (!crosses) return base
  const r = Math.max(0.02, Math.min(0.14, uw * 0.8, (1 - uw) * 0.8))
  if (u < r) return a.y + (CLEAR - a.y) * (u / r)
  if (u > 1 - r) return b.y + (CLEAR - b.y) * ((1 - u) / r)
  return CLEAR
}

/** Position along a route at progress k. `still` flattens arcs (reduced motion). Returns the phase. */
export function placeAt(r: Route, k: number, out: Vector3, still: boolean): Phase {
  // A gentle start and stop over the moving part.
  if (k > r.move0 && r.move1 > r.move0) {
    const m = (k - r.move0) / (r.move1 - r.move0)
    k = r.move0 + (0.5 * m + 0.5 * sine(m)) * (r.move1 - r.move0)
  }
  let leg = r.legs[r.legs.length - 1]
  for (const l of r.legs)
    if (k <= l.k1) {
      leg = l
      break
    }
  const u = leg.k1 > leg.k0 ? Math.min(1, Math.max(0, (k - leg.k0) / (leg.k1 - leg.k0))) : 1
  LEG.u = u
  LEG.last = leg === r.legs[r.legs.length - 1]
  if (leg.t === 'stay') {
    if (leg.at) {
      out.copy(leg.at)
      return 'dock'
    }
    handsOf(r.rid, out)
    return 'hands'
  }
  if (leg.t === 'air') {
    const a = leg.a ?? handsOf(r.rid, ha)
    const b = leg.b ?? handsOf(r.rid, hb)
    out.lerpVectors(a, b, u)
    out.y = airY(a, b, u, leg.h, still)
    return 'air'
  }
  const s = u * leg.total
  let i = 1
  while (i < leg.cum.length - 1 && leg.cum[i] < s) i++
  const seg = leg.cum[i] - leg.cum[i - 1]
  const f = seg > 1e-6 ? (s - leg.cum[i - 1]) / seg : 1
  out.lerpVectors(leg.pts[i - 1], leg.pts[i], f)
  return s < leg.s0 || s > leg.s1 ? 'dock' : 'groove'
}

/** The groove a route is on at progress k, with the head's position along it (0 at the groove's a end). */
export function grooveAt(r: Route, k: number): { g: number; u: number; dir: number } | null {
  for (const l of r.legs) {
    if (l.t !== 'line' || k < l.k0 || k > l.k1) continue
    const s = ((k - l.k0) / (l.k1 - l.k0 || 1)) * l.total
    const f = Math.min(1, Math.max(0, (s - l.s0) / (l.s1 - l.s0 || 1)))
    HEAD.g = l.g
    HEAD.u = l.dir > 0 ? f : 1 - f
    HEAD.dir = l.dir
    return HEAD
  }
  return null
}
const HEAD = { g: 0, u: 0, dir: 1 }

/** Point at fraction u (0..1) along groove gi, at floor level. */
export function groovePoint(gi: number, u: number, out: Vector3) {
  const pts = GROOVES[gi].pts
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  let s = u * total
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    if (s <= l || i === pts.length - 1) {
      const f = l > 0 ? Math.min(1, s / l) : 1
      return out.set(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, 0, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f)
    }
    s -= l
  }
  return out.set(pts[0][0], 0, pts[0][1])
}

// ── Groove light, written by Flow each frame, read by the groove shader ──

const N = GROOVES.length
export const GLOW = {
  head: new Float32Array(N),
  dir: new Float32Array(N).fill(1),
  on: new Float32Array(N),
  col: Array.from({ length: N }, () => new Color('#FFFFFF')),
  live: new Uint8Array(N),
}
