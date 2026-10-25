// Where the lab members go and what they do there. Each feed `task` maps to
// a short plan of legs: walk the aisles to a spot, then work there. Walking
// follows a small waypoint graph so nobody cuts through a bench, every spot
// belongs to one person, and the plan runs on feed time, so a jump with
// ?at lands each person at the spot their current task puts them.

import { Vector3 } from 'three'

export type Act =
  | 'idle'
  | 'pipette'
  | 'swirl'
  | 'type'
  | 'read'
  | 'scope'
  | 'cabinet'
  | 'freezer'
  | 'count'
  | 'write'
  | 'calibrate'
  | 'look'
  | 'load'
  | 'pick'
  | 'place'
export type Prop = 'pipette' | 'flask' | 'clipboard' | 'papers' | 'marker' | 'plate' | null
export type Carry = 'box' | 'rack' | null

export interface Spot {
  x: number
  z: number
  yaw: number // 0 faces +z
  sit?: boolean
}

const PI = Math.PI
const S = (x: number, z: number, yaw: number, sit = false): Spot => ({ x, z, yaw, sit })

/** Every spot belongs to one person, so two people never stand in one place. */
export const SPOTS: Record<string, Spot> = {
  'ortiz.desk': S(-9.12, -2.42, -PI / 2, true),
  'ortiz.board': S(-8.72, -2.72, PI),
  'ortiz.gel': S(-6.15, 0.7, 0),
  'okafor.fplc': S(-6.5, -1.36, 0),
  'okafor.assay': S(-5.72, -1.36, 0),
  'okafor.gel': S(-5.18, 0.7, 0),
  'okafor.spin': S(-6.98, 0.7, 0),
  'raman.bsc': S(-5.3, -2.06, PI),
  'raman.incubator': S(-4.05, -2.06, PI),
  'raman.chip': S(-4.32, -1.36, 0),
  'raman.desk': S(-9.08, 0.9, -PI / 2, true),
  'silva.scope': S(-2.16, 1.45, -PI / 2, true),
  'silva.stitch': S(-2.16, 1.45, -1.25, true),
  'silva.calib': S(-3.05, 0.7, 0),
  'silva.desk': S(-9.08, 2.3, -PI / 2, true),
  'park.shelf': S(-1.88, -2.2, PI),
  'park.reagents': S(-2.98, -0.55, -PI / 2),
  'park.freezer': S(-2.86, -1.9, PI),
  'park.dock': S(-1.95, 2.9, PI / 2),
  'park.tipsB': S(-6.9, 2.32, PI),
}

// Aisle waypoints and the lines between them, all clear of furniture.
const NODES: Record<string, [number, number]> = {
  OI: [-8.5, -2.1],
  OD: [-8.35, -1.15],
  BA0: [-7.3, -1.72],
  BA1: [-5.3, -1.72],
  BA2: [-4.05, -1.72],
  BA3: [-2.95, -1.62],
  BA4: [-1.75, -1.55],
  L0: [-8.4, 0.2],
  L1: [-8.4, 1.6],
  L2: [-8.4, 2.85],
  M0: [-7.62, 0.22],
  M1: [-5.6, 0.2],
  M2: [-3.97, 0.2],
  R0: [-2.95, 0.2],
  RR0: [-1.5, 0.2],
  RR1: [-1.45, 1.6],
  DK: [-1.9, 2.5],
  F0: [-6.0, 2.62],
  F1: [-4.0, 2.6],
  F2: [-2.75, 2.7],
}
const LINKS: [string, string][] = [
  ['OI', 'OD'],
  ['OD', 'BA0'],
  ['OD', 'L0'],
  ['BA0', 'BA1'],
  ['BA1', 'BA2'],
  ['BA2', 'BA3'],
  ['BA3', 'BA4'],
  ['BA3', 'R0'],
  ['BA4', 'RR0'],
  ['L0', 'M0'],
  ['L0', 'L1'],
  ['L1', 'L2'],
  ['L2', 'F0'],
  ['M0', 'M1'],
  ['M1', 'M2'],
  ['M2', 'R0'],
  ['M2', 'F1'],
  ['R0', 'RR0'],
  ['RR0', 'RR1'],
  ['RR1', 'DK'],
  ['F0', 'F1'],
  ['F1', 'F2'],
  ['F2', 'DK'],
]

const adj = new Map<string, [string, number][]>()
for (const [a, b] of LINKS) {
  const d = Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1])
  adj.set(a, [...(adj.get(a) ?? []), [b, d]])
  adj.set(b, [...(adj.get(b) ?? []), [a, d]])
}

function nearest(x: number, z: number) {
  let best = 'M1'
  let bd = Infinity
  for (const [id, [nx, nz]] of Object.entries(NODES)) {
    const d = Math.hypot(nx - x, nz - z)
    if (d < bd) {
      bd = d
      best = id
    }
  }
  return best
}

function shortest(from: string, to: string): string[] {
  const dist = new Map<string, number>([[from, 0]])
  const prev = new Map<string, string>()
  const open = new Set([from])
  while (open.size) {
    let cur = ''
    let cd = Infinity
    for (const n of open) {
      const d = dist.get(n) ?? Infinity
      if (d < cd) {
        cd = d
        cur = n
      }
    }
    open.delete(cur)
    if (cur === to) break
    for (const [nb, w] of adj.get(cur) ?? []) {
      const nd = cd + w
      if (nd < (dist.get(nb) ?? Infinity)) {
        dist.set(nb, nd)
        prev.set(nb, cur)
        open.add(nb)
      }
    }
  }
  const out = [to]
  while (out[0] !== from) {
    const p = prev.get(out[0])
    if (!p) return [from, to]
    out.unshift(p)
  }
  return out
}

export interface Path {
  pts: Vector3[]
  cum: number[]
  len: number
}

/** A walk from (x, z) to a spot along the aisles. */
export function route(x: number, z: number, to: Spot): Path {
  const pts: Vector3[] = [new Vector3(x, 0, z)]
  if (Math.hypot(to.x - x, to.z - z) > 0.05) {
    const a = nearest(x, z)
    const b = nearest(to.x, to.z)
    const ids = a === b ? [a] : shortest(a, b)
    const ns = ids.map(id => new Vector3(NODES[id][0], 0, NODES[id][1]))
    // Don't step back to a waypoint that's behind us, or past one the spot sits before.
    if (ns.length > 1 && pts[0].distanceTo(ns[1]) < ns[0].distanceTo(ns[1])) ns.shift()
    const end = new Vector3(to.x, 0, to.z)
    if (ns.length > 1 && end.distanceTo(ns[ns.length - 2]) < ns[ns.length - 2].distanceTo(ns[ns.length - 1])) ns.pop()
    pts.push(...ns, end)
  }
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
  return { pts, cum, len: cum[cum.length - 1] }
}

export function pointAt(p: Path, d: number, out: Vector3) {
  if (p.pts.length === 1 || d <= 0) return out.copy(p.pts[0])
  if (d >= p.len) return out.copy(p.pts[p.pts.length - 1])
  let i = 1
  while (i < p.cum.length - 1 && p.cum[i] < d) i++
  const k = (d - p.cum[i - 1]) / Math.max(1e-6, p.cum[i] - p.cum[i - 1])
  return out.lerpVectors(p.pts[i - 1], p.pts[i], k)
}

// ── Plans ────────────────────────────────────────────────────────────────

export interface Leg {
  at: string // spot id
  act: Act
  prop?: Prop // in hand while working
  holds?: Carry // in both hands while working (picked up or put down)
  carry?: Carry // carried on the walk to this spot
  ms?: number // how long the work lasts; the last leg lasts until the next task
}

const TASKS: Record<string, Leg[]> = {
  'Drafting the mitochondria progress report': [{ at: 'ortiz.desk', act: 'type' }],
  'Reviewing gel images with Sam': [{ at: 'ortiz.gel', act: 'look' }],
  'Sketching aim 3 on the whiteboard': [{ at: 'ortiz.board', act: 'write', prop: 'marker' }],
  'Reading reviewer comments': [{ at: 'ortiz.desk', act: 'read', prop: 'papers' }],
  'Running a Ni-NTA purification': [{ at: 'okafor.fplc', act: 'pipette', prop: 'pipette' }],
  'Loading an SDS-PAGE gel': [{ at: 'okafor.gel', act: 'pipette', prop: 'pipette' }],
  'Prepping outer membranes': [
    { at: 'okafor.spin', act: 'load', ms: 4200 },
    { at: 'okafor.assay', act: 'swirl', prop: 'flask' },
  ],
  'Setting up a folding assay': [{ at: 'okafor.assay', act: 'pipette', prop: 'pipette' }],
  'Plating E. coli isolates': [{ at: 'raman.bsc', act: 'cabinet' }],
  'Reading MIC plates': [
    { at: 'raman.incubator', act: 'pick', prop: 'plate', ms: 1900 },
    { at: 'raman.chip', act: 'read', prop: 'plate' },
  ],
  'Loading the microfluidic chip': [{ at: 'raman.chip', act: 'pipette', prop: 'pipette' }],
  'Logging assay results': [{ at: 'raman.desk', act: 'type' }],
  'Imaging labeled membranes': [{ at: 'silva.scope', act: 'scope' }],
  'Calibrating the 63x objective': [{ at: 'silva.calib', act: 'calibrate' }],
  'Stitching a tile scan': [{ at: 'silva.stitch', act: 'type' }],
  'Exporting time-lapse stacks': [{ at: 'silva.desk', act: 'type' }],
  'Counting reagent stock': [
    { at: 'park.shelf', act: 'count', prop: 'clipboard', ms: 4200 },
    { at: 'park.reagents', act: 'count', prop: 'clipboard' },
  ],
  'Logging the -80 °C freezer': [{ at: 'park.freezer', act: 'freezer', prop: 'clipboard' }],
  'Receiving a delivery': [
    { at: 'park.dock', act: 'pick', holds: 'box', ms: 1500 },
    { at: 'park.shelf', act: 'place', holds: 'box', carry: 'box', ms: 1300 },
    { at: 'park.shelf', act: 'count', prop: 'clipboard' },
  ],
  'Restocking pipette tips': [
    { at: 'park.shelf', act: 'pick', holds: 'rack', ms: 1300 },
    { at: 'park.reagents', act: 'place', holds: 'rack', carry: 'rack', ms: 1300 },
    { at: 'park.tipsB', act: 'place', holds: 'rack', carry: 'rack', ms: 1300 },
    { at: 'park.shelf', act: 'count', prop: 'clipboard' },
  ],
}

const HOME: Record<string, string> = { ortiz: 'ortiz.board', okafor: 'okafor.assay', raman: 'raman.bsc', silva: 'silva.scope', park: 'park.shelf' }

export const legsFor = (id: string, task: string): Leg[] => TASKS[task] ?? [{ at: HOME[id] ?? 'okafor.assay', act: 'idle' }]

export const SPEED = 1.25 // metres per feed second
const SIT_MS = 600
const STAND_MS = 480

export type SegKind = 'walk' | 'act' | 'sit' | 'stand'
export interface Seg {
  kind: SegKind
  t0: number
  t1: number
  leg: Leg
  spot: Spot
  path?: Path
}

/** Lay out a plan starting at plan-clock time `t` from where the person stands now. */
export function plan(legs: Leg[], x: number, z: number, seated: boolean, from: Spot | null, t: number): Seg[] {
  const segs: Seg[] = []
  let px = x, pz = z
  let sitting = seated
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]
    const spot = SPOTS[leg.at]
    const far = Math.hypot(spot.x - px, spot.z - pz) > 0.05
    if (sitting && (far || !spot.sit)) {
      segs.push({ kind: 'stand', t0: t, t1: t + STAND_MS, leg, spot: from ?? spot })
      t += STAND_MS
      sitting = false
    }
    if (far) {
      const path = route(px, pz, spot)
      const ms = Math.max(500, (path.len / SPEED) * 1000 + 300)
      segs.push({ kind: 'walk', t0: t, t1: t + ms, leg, spot, path })
      t += ms
    }
    if (spot.sit && !sitting) {
      segs.push({ kind: 'sit', t0: t, t1: t + SIT_MS, leg, spot })
      t += SIT_MS
      sitting = true
    }
    const last = i === legs.length - 1
    segs.push({ kind: 'act', t0: t, t1: last ? Infinity : t + (leg.ms ?? 3000), leg, spot })
    t += leg.ms ?? 3000
    px = spot.x
    pz = spot.z
    from = spot
  }
  return segs
}

/** Settled at the end of the plan, for mounting mid-story. */
export function settled(legs: Leg[]): Seg[] {
  const leg = legs[legs.length - 1]
  return [{ kind: 'act', t0: -1e12, t1: Infinity, leg, spot: SPOTS[leg.at] }]
}

/** Walk distance covered `ms` into a walk of `len` metres over `total` ms, easing in and out. */
export function walked(ms: number, total: number, len: number) {
  const ramp = Math.min(350, total / 3)
  const v = len / (total - ramp) // cruise speed (per ms)
  if (ms <= 0) return 0
  if (ms >= total) return len
  if (ms < ramp) return (v * ms * ms) / (2 * ramp)
  if (ms > total - ramp) {
    const r = total - ms
    return len - (v * r * r) / (2 * ramp)
  }
  return (v * ramp) / 2 + v * (ms - ramp)
}

// ── Live bodies, read by the parcels, the equipment and the hover card ──

export interface Body {
  pos: Vector3 // feet
  yaw: number
  hand: Vector3 // right hand, world
  head: Vector3 // top of the head, world
  act: Act
  walking: boolean
  seated: number
  showing: boolean // holding up something to send
}

export const crowd = new Map<string, Body>()
export function body(id: string): Body {
  let b = crowd.get(id)
  if (!b) {
    b = { pos: new Vector3(), yaw: 0, hand: new Vector3(0, 1.2, 0), head: new Vector3(0, 1.8, 0), act: 'idle', walking: false, seated: 0, showing: false }
    crowd.set(id, b)
  }
  return b
}

/** Where a lab member is standing when nobody has rendered them yet: their current task's spot. */
export function restingSpot(id: string, task: string) {
  const legs = legsFor(id, task)
  return SPOTS[legs[legs.length - 1].at]
}
