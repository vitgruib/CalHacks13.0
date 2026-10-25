// Where everything sits. One world unit is roughly a metre.
// The lab plinth spans x -11.5..-0.9, the transit map plinth x 1.6..11.0,
// both z -3.8..3.8 with their tops at y = 0. Vendors and the funder stand on
// two small pedestals past the map's right edge.

import { Vector3 } from 'three'

export type V3 = [number, number, number]
export type V2 = [number, number]

export const PAL = {
  void: '#C9CDD2',
  voidHi: '#E9EAEC',
  ground: '#DDE0E3',
  labBody: '#D3C9BA',
  labFloor: '#E4DED3',
  mapBody: '#2B333D',
  board: '#EEEAE2',
  ink: '#1C232C',
  money: '#2F9DB5',
  ice: '#C8D5E1',
  lens: '#F3F8FF',
}

/** One colour per flow family on the transit map. */
export const LINE = { request: '#D9623A', money: '#2F9DB5', reading: '#7C62AE', people: '#C24F7E' } as const
export type Family = keyof typeof LINE
export const GRANT_COLOR: Record<string, string> = { R01GM061721: '#3D7FD1', R21AI182745: '#8AAE3B' }
export const GLAZE = { accept: '#4F9C80', refine: '#C98B2E', reject: '#9C2E2A', hold: '#2E5BA6' } as const

export const LAB = { x0: -11.5, x1: -0.9, z0: -3.8, z1: 3.8 }
export const MAP = { x0: 1.6, x1: 11.0, z0: -3.8, z1: 3.8 }
export const PLINTH_H = 1.1

// ── The lab: work spots, what each task looks like, and the aisles ────────

export type Act =
  | 'stand'
  | 'pipette'
  | 'swirl'
  | 'type'
  | 'read'
  | 'scope'
  | 'adjust'
  | 'cabinet'
  | 'freezer'
  | 'write'
  | 'reach'
  | 'count'
  | 'look'
  | 'pickup'
  | 'place'

export type Prop = 'box' | 'rack' | 'plate'

export interface Spot {
  p: V2
  yaw: number // 0 faces +z (toward the camera side)
  sit?: boolean
}

const PI = Math.PI
export const SPOTS: Record<string, Spot> = {
  'ortiz.board': { p: [-10.0, -3.0], yaw: PI },
  'ortiz.desk': { p: [-10.35, -2.1], yaw: -PI / 2, sit: true },
  'ortiz.gel': { p: [-2.1, 0.0], yaw: PI / 2 },
  'okafor.spin': { p: [-7.2, -1.42], yaw: 0 },
  'okafor.fplc': { p: [-6.4, -1.42], yaw: 0 },
  'okafor.ice': { p: [-5.6, -1.42], yaw: 0 },
  'okafor.gel': { p: [-4.75, -1.42], yaw: 0 },
  'raman.bsc': { p: [-6.05, -2.5], yaw: PI },
  'raman.incubator': { p: [-4.6, -2.5], yaw: PI },
  'raman.chip': { p: [-3.95, 0.8], yaw: PI },
  'raman.desk': { p: [-4.4, 2.78], yaw: PI, sit: true },
  'silva.scope': { p: [-9.1, 2.0], yaw: -PI / 2 },
  'silva.desk': { p: [-5.7, 2.78], yaw: PI, sit: true },
  'park.shelf': { p: [-2.55, -2.5], yaw: PI },
  'park.freezer': { p: [-1.82, -2.16], yaw: 2.84 },
  'park.door': { p: [-1.6, 2.82], yaw: 0.6 },
  'park.bench': { p: [-3.4, -1.42], yaw: 0 },
}

export interface Step {
  at: string
  act: Act
  ms?: number // how long before the next step; the last step lasts until the task changes
  gets?: Prop // picked up during this step
  hold?: Prop // carried on the way to this step and put down there
}

/** Every task string in world.ts, mapped to where it happens and what the hands do. */
export const PLANS: Record<string, Step[]> = {
  'Drafting the mitochondria progress report': [{ at: 'ortiz.desk', act: 'type' }],
  'Reviewing gel images with Sam': [{ at: 'ortiz.gel', act: 'look' }],
  'Sketching aim 3 on the whiteboard': [{ at: 'ortiz.board', act: 'write' }],
  'Reading reviewer comments': [{ at: 'ortiz.desk', act: 'read' }],
  'Running a Ni-NTA purification': [{ at: 'okafor.fplc', act: 'adjust' }],
  'Loading an SDS-PAGE gel': [{ at: 'okafor.gel', act: 'pipette' }],
  'Prepping outer membranes': [{ at: 'okafor.ice', act: 'pipette', ms: 4200 }, { at: 'okafor.spin', act: 'reach' }],
  'Setting up a folding assay': [{ at: 'okafor.ice', act: 'swirl' }],
  'Plating E. coli isolates': [{ at: 'raman.bsc', act: 'cabinet' }],
  'Reading MIC plates': [{ at: 'raman.incubator', act: 'reach', ms: 2000, gets: 'plate' }, { at: 'raman.incubator', act: 'read', hold: 'plate' }],
  'Loading the microfluidic chip': [{ at: 'raman.chip', act: 'pipette' }],
  'Logging assay results': [{ at: 'raman.desk', act: 'type' }],
  'Imaging labeled membranes': [{ at: 'silva.scope', act: 'scope' }],
  'Calibrating the 63x objective': [{ at: 'silva.scope', act: 'adjust' }],
  'Stitching a tile scan': [{ at: 'silva.desk', act: 'type' }],
  'Exporting time-lapse stacks': [{ at: 'silva.desk', act: 'type' }],
  'Counting reagent stock': [{ at: 'park.shelf', act: 'count' }],
  'Logging the -80 °C freezer': [{ at: 'park.freezer', act: 'freezer' }],
  'Receiving a delivery': [{ at: 'park.door', act: 'pickup', ms: 1500, gets: 'box' }, { at: 'park.shelf', act: 'place', hold: 'box' }],
  'Restocking pipette tips': [{ at: 'park.shelf', act: 'pickup', ms: 1300, gets: 'rack' }, { at: 'park.bench', act: 'place', hold: 'rack' }],
}

const HOME: Record<string, string> = { ortiz: 'ortiz.desk', okafor: 'okafor.ice', raman: 'raman.bsc', silva: 'silva.scope', park: 'park.shelf' }

/** A task the table doesn't know still lands somewhere sensible. */
export function planFor(id: string, task: string): Step[] {
  const p = PLANS[task]
  if (p) return p
  if (/whiteboard/i.test(task)) return [{ at: 'ortiz.board', act: 'write' }]
  if (/Draft|Logging|Stitch|Export|Writ/i.test(task)) return [{ at: HOME[id] ?? 'park.shelf', act: SPOTS[HOME[id]]?.sit ? 'type' : 'stand' }]
  return [{ at: HOME[id] ?? 'park.shelf', act: 'stand' }]
}

const AISLE_NODES: Record<string, V2> = {
  o1: [-9.15, -1.45],
  o0: [-9.15, -0.55],
  c1: [-8.2, -0.55],
  b1: [-8.2, -1.95],
  b9: [-2.6, -1.95],
  bE: [-1.5, -1.95],
  c6: [-2.6, 0.0],
  f1: [-9.1, 1.3],
  f2: [-8.2, 1.3],
  fL: [-6.9, 1.3],
  f6: [-2.6, 1.3],
  f7: [-1.5, 1.3],
  d0: [-6.9, 3.3],
  dE: [-1.5, 3.3],
}
const AISLES: [string, string][] = [
  ['o1', 'o0'],
  ['o0', 'c1'],
  ['c1', 'b1'],
  ['c1', 'f2'],
  ['b1', 'b9'],
  ['b9', 'bE'],
  ['b9', 'c6'],
  ['c6', 'f6'],
  ['f1', 'f2'],
  ['f2', 'fL'],
  ['fL', 'f6'],
  ['f6', 'f7'],
  ['fL', 'd0'],
  ['d0', 'dE'],
  ['f7', 'dE'],
]

const dist2 = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1])

interface Graph {
  pts: V2[]
  ids: string[]
  edges: [number, number][]
  next: number[][] // next hop on the shortest path
  d: number[][]
}

function makeGraph(nodes: Record<string, V2>, edges: [string, string][]): Graph {
  const ids = Object.keys(nodes)
  const pts = ids.map(k => nodes[k])
  const n = ids.length
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)))
  const next = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? j : -1)))
  const es: [number, number][] = []
  for (const [a, b] of edges) {
    const i = ids.indexOf(a)
    const j = ids.indexOf(b)
    const w = dist2(pts[i], pts[j])
    d[i][j] = d[j][i] = w
    next[i][j] = j
    next[j][i] = i
    es.push([i, j])
  }
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (d[i][k] + d[k][j] < d[i][j]) {
          d[i][j] = d[i][k] + d[k][j]
          next[i][j] = next[i][k]
        }
  return { pts, ids, edges: es, next, d }
}

function hops(g: Graph, i: number, j: number): number[] {
  const out = [i]
  let k = i
  while (k !== j && k >= 0) {
    k = g.next[k][j]
    out.push(k)
  }
  return out
}

const aisles = makeGraph(AISLE_NODES, AISLES)

/** The nearest point on any aisle, and which aisle. */
function onAisle(p: V2) {
  let best = { e: 0, q: [0, 0] as V2, d: Infinity }
  aisles.edges.forEach(([i, j], e) => {
    const a = aisles.pts[i]
    const b = aisles.pts[j]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)))
    const q: V2 = [a[0] + dx * t, a[1] + dz * t]
    const dd = dist2(p, q)
    if (dd < best.d) best = { e, q, d: dd }
  })
  return best
}

/** A walk from one floor point to another: off to the nearest aisle, along the aisles, in to the spot. */
export function walkPath(from: V2, to: V2): V2[] {
  const A = onAisle(from)
  const B = onAisle(to)
  const out: V2[] = [from]
  const push = (p: V2) => {
    const l = out[out.length - 1]
    if (dist2(l, p) > 0.02) out.push(p)
  }
  push(A.q)
  if (A.e !== B.e) {
    const [a0, a1] = aisles.edges[A.e]
    const [b0, b1] = aisles.edges[B.e]
    let best = { cost: Infinity, i: a0, j: b0 }
    for (const i of [a0, a1])
      for (const j of [b0, b1]) {
        const cost = dist2(A.q, aisles.pts[i]) + aisles.d[i][j] + dist2(aisles.pts[j], B.q)
        if (cost < best.cost) best = { cost, i, j }
      }
    for (const k of hops(aisles, best.i, best.j)) push(aisles.pts[k])
  }
  push(B.q)
  push(to)
  return out
}

// ── The transit map: stations, lines, and the route every packet takes ────

export const LINE_Y = 0.09 // top of a raised line
export const DECK_Y = 0.09 // cars ride on top of the raised lines
export const V_Y = -0.38 // vendors pedestal top
export const F_Y = -0.2 // funder pedestal top

const MP: Record<string, V3> = {
  I: [2.35, DECK_Y, 0.6],
  P: [4.3, DECK_Y, 0.6],
  X: [6.3, DECK_Y, 0.6],
  R: [8.3, DECK_Y, 0.6],
  K: [6.3, DECK_Y, -1.4],
  G1: [4.3, DECK_Y, -1.4],
  G2: [8.3, DECK_Y, -1.4],
  J2: [9.4, DECK_Y, -1.4],
  ME: [11.0, DECK_Y, -1.4],
  VB: [11.7, V_Y + DECK_Y, -1.4],
  V: [12.35, V_Y + DECK_Y, -1.4],
  GM: [6.3, DECK_Y, 2.6],
  RF: [9.6, DECK_Y, 1.9],
  FE: [11.0, DECK_Y, 1.9],
  FB: [11.7, F_Y + DECK_Y, 1.9],
  F: [12.35, F_Y + DECK_Y, 1.9],
  RT: [6.3, DECK_Y, -3.0],
  s1: [3.1, DECK_Y, -3.0],
  s2: [4.2, DECK_Y, -3.0],
  s3: [5.3, DECK_Y, -3.0],
  s4: [7.3, DECK_Y, -3.0],
  s5: [10.4, DECK_Y, -2.4],
  S1: [1.95, DECK_Y, -1.4],
  S2: [9.55, DECK_Y, -0.15],
}

export const MAP_SEGMENTS: { a: string; b: string; fam: Family }[] = [
  { a: 'I', b: 'P', fam: 'request' },
  { a: 'P', b: 'X', fam: 'request' },
  { a: 'X', b: 'R', fam: 'request' },
  { a: 'P', b: 'K', fam: 'request' },
  { a: 'P', b: 'GM', fam: 'people' },
  { a: 'R', b: 'GM', fam: 'people' },
  { a: 'K', b: 'X', fam: 'people' },
  { a: 'X', b: 'GM', fam: 'people' },
  { a: 's1', b: 's2', fam: 'reading' },
  { a: 's2', b: 's3', fam: 'reading' },
  { a: 's3', b: 'RT', fam: 'reading' },
  { a: 'RT', b: 's4', fam: 'reading' },
  { a: 'RT', b: 'K', fam: 'reading' },
  { a: 'G1', b: 'K', fam: 'money' },
  { a: 'K', b: 'G2', fam: 'money' },
  { a: 'G2', b: 'J2', fam: 'money' },
  { a: 'J2', b: 'ME', fam: 'money' },
  { a: 'ME', b: 'VB', fam: 'money' },
  { a: 'VB', b: 'V', fam: 'money' },
  { a: 's5', b: 'J2', fam: 'money' },
  { a: 'R', b: 'RF', fam: 'money' },
  { a: 'RF', b: 'FE', fam: 'money' },
  { a: 'FE', b: 'FB', fam: 'money' },
  { a: 'FB', b: 'F', fam: 'money' },
  { a: 'P', b: 'G1', fam: 'money' },
  { a: 'S1', b: 'G1', fam: 'money' },
  { a: 'G2', b: 'S2', fam: 'money' },
]
export const mapPoint = (k: string) => MP[k]

const mapGraph = (() => {
  const nodes: Record<string, V2> = {}
  for (const [k, p] of Object.entries(MP)) nodes[k] = [p[0], p[2]]
  return makeGraph(
    nodes,
    MAP_SEGMENTS.map(s => [s.a, s.b]),
  )
})()

/** Which map station a FlowNode stops at. Lab members all come in at the intake. */
const STOP: Record<string, string> = {
  'a:purchasing': 'P',
  'a:bookkeeping': 'K',
  'a:payment_report': 'R',
  'p:grant_manager': 'GM',
  'g:R01GM061721': 'G1',
  'g:R21AI182745': 'G2',
  's:reporter': 's1',
  's:usaspending': 's2',
  's:cancellations': 's3',
  's:court': 's4',
  's:payments': 's5',
  'v:vendors': 'V',
  'p:funder': 'F',
}
export const stopOf = (id: string) => (id.startsWith('r:') ? 'I' : STOP[id] ?? 'P')

/** A polyline along the lines, with cumulative lengths for travel at an even speed. */
export interface Route {
  pts: Vector3[]
  cum: number[]
  len: number
}

function makeRoute(pts: Vector3[]): Route {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
  return { pts, cum, len: cum[cum.length - 1] }
}

const routes = new Map<string, Route>()
export function routeBetween(a: string, b: string, tail?: V2): Route {
  const key = `${a}>${b}${tail ? `>${tail[0]},${tail[1]}` : ''}`
  let r = routes.get(key)
  if (!r) {
    const i = mapGraph.ids.indexOf(a)
    const j = mapGraph.ids.indexOf(b)
    const pts = (i < 0 || j < 0 ? [i < 0 ? j : i] : hops(mapGraph, i, j)).map(k => new Vector3(...MP[mapGraph.ids[Math.max(0, k)]]))
    if (tail) pts.push(new Vector3(tail[0], DECK_Y, tail[1]))
    r = makeRoute(pts)
    routes.set(key, r)
  }
  return r
}
/** The reverse of a route with a tail: from the tail point back to station `b`. */
export function routeFromTail(tail: V2, b: string, a: string): Route {
  const key = `<${tail[0]},${tail[1]}>${a}>${b}`
  let r = routes.get(key)
  if (!r) {
    const f = routeBetween(b, a, tail)
    r = makeRoute([...f.pts].reverse())
    routes.set(key, r)
  }
  return r
}

const rq = new Vector3()
/** Point and heading `s` units along a route. */
export function along(r: Route, s: number, out: Vector3, dir?: Vector3) {
  const x = Math.min(r.len, Math.max(0, s))
  let i = 1
  while (i < r.pts.length - 1 && r.cum[i] < x) i++
  const a = r.pts[i - 1] ?? r.pts[0]
  const b = r.pts[i] ?? a
  const seg = Math.max(1e-6, (r.cum[i] ?? 0) - (r.cum[i - 1] ?? 0))
  out.lerpVectors(a, b, Math.min(1, Math.max(0, (x - (r.cum[i - 1] ?? 0)) / seg)))
  if (dir) {
    // Look a little ahead and behind so corners turn smoothly.
    const ahead = Math.min(r.len, x + 0.18)
    const behind = Math.max(0, x - 0.18)
    if (ahead - behind > 1e-4) {
      along(r, ahead, dir)
      along(r, behind, rq)
      dir.sub(rq)
    }
  }
  return out
}

/** Where parked requests wait: on a short siding by their grant. */
export const PARK: Record<string, V2[]> = {
  R01GM061721: [
    [3.25, -1.4],
    [2.45, -1.4],
  ],
  R21AI182745: [
    [8.95, -0.75],
    [9.45, -0.25],
  ],
}
/** Where held requests wait for the grant manager. */
export const GM_SLOTS: V2[] = [
  [5.4, 2.95],
  [7.2, 2.95],
  [4.7, 3.35],
  [7.9, 3.35],
]

/** Each grant is a glass vessel standing on its own station. */
export const VESSEL: Record<string, V3> = {
  R01GM061721: [MP.G1[0], 0, MP.G1[2]],
  R21AI182745: [MP.G2[0], 0, MP.G2[2]],
}
/** Each agent is a drum standing on its own station; the lines run into it. */
export const KIOSK: Record<string, V3> = {
  'a:purchasing': [MP.P[0], 0, MP.P[2]],
  'a:bookkeeping': [MP.K[0], 0, MP.K[2]],
  'a:payment_report': [MP.R[0], 0, MP.R[2]],
}
export const DRUM = { r: 0.44, h: 0.42 }
export const VESSEL_R = 0.4
export const PEDESTAL = { vendors: [12.55, V_Y, -1.4] as V3, funder: [12.55, F_Y, 1.9] as V3 }

// ── FlowNode positions (static ones; researchers move and live in fx.people) ─

const ANCHOR: Record<string, V3> = {
  'a:purchasing': [MP.P[0], 0.62, MP.P[2]],
  'a:bookkeeping': [MP.K[0], 0.62, MP.K[2]],
  'a:payment_report': [MP.R[0], 0.62, MP.R[2]],
  'p:grant_manager': [MP.GM[0], 1.85, MP.GM[2]],
  'g:R01GM061721': [MP.G1[0], 1.35, MP.G1[2]],
  'g:R21AI182745': [MP.G2[0], 1.35, MP.G2[2]],
  's:reporter': [MP.s1[0], 0.45, MP.s1[2]],
  's:usaspending': [MP.s2[0], 0.45, MP.s2[2]],
  's:cancellations': [MP.s3[0], 0.45, MP.s3[2]],
  's:court': [MP.s4[0], 0.45, MP.s4[2]],
  's:payments': [MP.s5[0], 0.45, MP.s5[2]],
  'v:vendors': [PEDESTAL.vendors[0], V_Y + 1.0, PEDESTAL.vendors[2]],
  'p:funder': [PEDESTAL.funder[0], F_Y + 1.15, PEDESTAL.funder[2]],
}
const FLOOR: Record<string, V3> = {
  'a:purchasing': [MP.P[0], 0.13, MP.P[2]],
  'a:bookkeeping': [MP.K[0], 0.13, MP.K[2]],
  'a:payment_report': [MP.R[0], 0.13, MP.R[2]],
  'p:grant_manager': [MP.GM[0], 0.13, MP.GM[2]],
  'g:R01GM061721': [MP.G1[0], 0.1, MP.G1[2]],
  'g:R21AI182745': [MP.G2[0], 0.1, MP.G2[2]],
  'v:vendors': [PEDESTAL.vendors[0], V_Y + 0.02, PEDESTAL.vendors[2]],
  'p:funder': [PEDESTAL.funder[0], F_Y + 0.02, PEDESTAL.funder[2]],
}
for (const k of ['s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments']) FLOOR[k] = [ANCHOR[k][0], 0.13, ANCHOR[k][2]]

export function staticAnchor(id: string, out: Vector3) {
  const a = ANCHOR[id]
  return a ? out.set(a[0], a[1], a[2]) : out.set(0, 1, 0)
}
export function staticFloor(id: string, out: Vector3) {
  const a = FLOOR[id]
  return a ? out.set(a[0], a[1], a[2]) : out.set(0, 0.02, 0)
}
export const haloSize = (id: string) =>
  !id.includes(':') ? 0.98 : id.startsWith('g:') ? 0.95 : id.startsWith('a:') || id === 'p:grant_manager' ? 0.95 : id.startsWith('s:') ? 0.42 : id.startsWith('r:') ? 0.55 : 1.1

// ── Camera framing, fitted to the stage's shape ──────────────────────────

export interface Framing {
  pos: Vector3
  target: Vector3
  fov: number
  dist: number
}

const KEY: V3[] = []
for (const [x0, x1] of [
  [LAB.x0, LAB.x1],
  [MAP.x0, MAP.x1],
]) {
  for (const x of [x0, x1])
    for (const z of [LAB.z0, LAB.z1]) {
      KEY.push([x, 0, z], [x, -PLINTH_H, z])
    }
}
KEY.push([LAB.x0, 2.45, LAB.z0], [LAB.x1, 2.45, LAB.z0], [LAB.x0, 2.1, -0.9], [-8.6, 2.1, -0.9])
KEY.push([PEDESTAL.vendors[0] + 1.0, V_Y - 0.7, -2.4], [PEDESTAL.funder[0] + 1.0, F_Y - 0.7, 2.9], [PEDESTAL.funder[0] + 0.8, F_Y + 1.3, 1.9])

const fwd = new Vector3()
const right = new Vector3()
const upv = new Vector3()
const tmp = new Vector3()
const UPY = new Vector3(0, 1, 0)

function fit(az: number, el: number, fov: number, aspect: number, margin: number): Framing {
  const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
  fwd.copy(dir).negate()
  right.crossVectors(fwd, UPY).normalize()
  upv.crossVectors(right, fwd).normalize()
  const tv = Math.tan(((fov / 2) * Math.PI) / 180)
  const th = tv * aspect
  const target = new Vector3(0.6, 0, 0)
  let dist = 40
  for (let it = 0; it < 6; it++) {
    // Extents in screen units at the current distance, then re-centre and re-size.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const k of KEY) {
      tmp.set(k[0], k[1], k[2]).sub(target)
      const depth = dist + tmp.dot(fwd)
      const sx = tmp.dot(right) / (depth * th)
      const sy = tmp.dot(upv) / (depth * tv)
      minX = Math.min(minX, sx)
      maxX = Math.max(maxX, sx)
      minY = Math.min(minY, sy)
      maxY = Math.max(maxY, sy)
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    target.addScaledVector(right, cx * dist * th).addScaledVector(upv, cy * dist * tv)
    const need = Math.max((maxX - minX) / 2, (maxY - minY) / 2) / (1 - margin)
    dist *= need
  }
  return { pos: target.clone().addScaledVector(dir, dist), target, fov, dist }
}

const framings = new Map<number, Framing>()
/** The hero shot for a stage of this shape: wide stages see both plinths from the front left, tall ones from the lab's side. */
export function heroFor(aspect: number): Framing {
  const key = Math.round(aspect * 25)
  let f = framings.get(key)
  if (!f) {
    const a = key / 25
    f = a >= 0.85 ? fit(-0.85, 0.5, 24, a, 0.03) : fit(-1.5, 0.7, 30, a, 0.04)
    framings.set(key, f)
  }
  return f
}
export const OPENING = { pos: new Vector3(-9.8, 2.2, 5.2), target: new Vector3(-6.4, 0.9, -0.6) }
