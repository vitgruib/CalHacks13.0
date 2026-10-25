// Where everything sits. One world unit is roughly a metre of lab floor.
// The lab plinth spans x -12.2..-1.4, z -3.8..3.8; the finance plinth
// x 1.4..10.2, z -3.4..3.4; both tops at y = 0. Vendors and the funder
// stand outside on two small pedestals.

import { Vector3 } from 'three'

export type V3 = [number, number, number]
export type V2 = [number, number]

export const PAL = {
  void: '#C7CCD2',
  voidHi: '#E6E8EB',
  ground: '#DCDFE3',
  labBody: '#D6CDBF',
  labTop: '#E8E2D8',
  officeBody: '#252D37',
  officeTop: '#2E3742',
  groove: '#20272F',
  chalk: '#EEE9E1',
  porcelain: '#F5F1EB',
  clay: '#D3CABD',
  clayDeep: '#B8AD9F',
  slate: '#4E5967',
  slateDeep: '#3A4451',
  ink: '#1C232C',
  money: '#2F9DB5',
  celadon: '#4F9C80',
  ochre: '#C98B2E',
  oxblood: '#9C2E2A',
  cobalt: '#2E5BA6',
  lens: '#F3F8FF',
  ice: '#C8D5E1',
  parcel: '#EDE6DA',
}

export const GLAZE = { accept: PAL.celadon, refine: PAL.ochre, reject: PAL.oxblood, hold: PAL.cobalt } as const
export const R01 = 'R01GM061721'
export const R21 = 'R21AI182745'
/** Each grant's own colour: reservoir collars and the tags on rerouted or split parcels. */
export const GRANT_COLOR: Record<string, string> = { [R01]: '#D0607A', [R21]: '#6F62B8' }

export const LAB_BOX = { x0: -12.2, x1: -1.4, z0: -3.8, z1: 3.8 }
export const NET_BOX = { x0: 1.4, x1: 10.2, z0: -3.4, z1: 3.4 }
export const LAB_X = (LAB_BOX.x0 + LAB_BOX.x1) / 2
export const NET_X = (NET_BOX.x0 + NET_BOX.x1) / 2

// ── The lab floor ─────────────────────────────────────────────────────────

/** Aisle junctions. People walk only along GRAPH edges, then step straight to a spot. */
export const NODES_XZ: V2[] = [
  [-10.3, -1.75], // 0 inside the PI office
  [-9.0, -1.9], // 1 back aisle, left
  [-6.55, -1.9], // 2 back aisle, by the biosafety cabinet
  [-3.95, -1.9], // 3 back aisle, right
  [-2.4, -1.85], // 4 supply alcove
  [-2.3, -0.85], // 5 by the lab door
  [-9.0, 0.65], // 6 middle aisle, left
  [-6.4, 0.65], // 7 middle aisle
  [-3.95, 0.65], // 8 middle aisle, right
  [-9.0, 3.15], // 9 front aisle, left
  [-6.4, 3.15], // 10 front aisle
  [-3.95, 3.15], // 11 front aisle, right
]
export const GRAPH: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [3, 8],
  [1, 6], [6, 7], [7, 8], [6, 9], [9, 10], [10, 11], [8, 11],
]

export type Action =
  | 'stand'
  | 'write'
  | 'type'
  | 'read'
  | 'look'
  | 'pipette'
  | 'swirl'
  | 'load'
  | 'cabinet'
  | 'scope'
  | 'adjust'
  | 'freezer'
  | 'reach'
  | 'pickup'
  | 'place'

export interface Spot {
  at: V2
  yaw: number // 0 faces +z, toward the default camera
  node: number
  sit?: boolean
}

const PI = Math.PI
export const SPOTS: Record<string, Spot> = {
  // Lena, the PI
  wb: { at: [-10.15, -3.0], yaw: PI, node: 0 },
  pidesk: { at: [-11.2, -2.15], yaw: PI, node: 0, sit: true },
  samside: { at: [-6.2, 0.32], yaw: PI - 0.55, node: 7 },
  // Sam, protein purification
  fplc: { at: [-7.3, 0.3], yaw: PI, node: 7 },
  centrifuge: { at: [-7.65, 2.95], yaw: PI, node: 10 },
  gelrig: { at: [-5.35, 2.95], yaw: PI, node: 10 },
  // Priya, microbiology
  bsc: { at: [-6.55, -2.2], yaw: PI, node: 2 },
  micro: { at: [-5.2, 1.0], yaw: 0, node: 7 },
  desk2: { at: [-10.8, 2.4], yaw: -PI / 2, node: 9, sit: true },
  // Mateo, the confocal
  scope: { at: [-3.5, 1.8], yaw: PI / 2, node: 8 },
  baypc: { at: [-2.55, 0.78], yaw: PI, node: 8, sit: true },
  desk1: { at: [-10.8, 0.85], yaw: -PI / 2, node: 6, sit: true },
  // Jun, the lab manager
  freezer: { at: [-2.85, -2.2], yaw: PI, node: 4 },
  shelves: { at: [-1.95, -2.62], yaw: PI, node: 4 },
  door: { at: [-2.0, -0.85], yaw: PI / 2, node: 5 },
  restockA: { at: [-4.85, 0.3], yaw: PI, node: 8 },
  restockB: { at: [-7.95, 1.0], yaw: 0, node: 7 },
}

/** The furniture each researcher calls home: the camera's first stop when one is selected. */
export const HOME: Record<string, string> = { ortiz: 'pidesk', okafor: 'fplc', raman: 'bsc', silva: 'scope', park: 'freezer' }

/** Shortest next hop between every pair of junctions (computed once). */
export const NEXT: number[][] = (() => {
  const n = NODES_XZ.length
  const d = Array.from({ length: n }, () => Array<number>(n).fill(Infinity))
  const nx = Array.from({ length: n }, () => Array<number>(n).fill(-1))
  for (let i = 0; i < n; i++) {
    d[i][i] = 0
    nx[i][i] = i
  }
  for (const [a, b] of GRAPH) {
    const l = Math.hypot(NODES_XZ[a][0] - NODES_XZ[b][0], NODES_XZ[a][1] - NODES_XZ[b][1])
    d[a][b] = d[b][a] = l
    nx[a][b] = b
    nx[b][a] = a
  }
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (d[i][k] + d[k][j] < d[i][j]) {
          d[i][j] = d[i][k] + d[k][j]
          nx[i][j] = nx[i][k]
        }
  return nx
})()

// ── The finance network ───────────────────────────────────────────────────

export interface NetNode {
  at: V2
  r: number // footprint radius on the plinth
  top: number // where a parcel docks on it
}

export const NET: Record<string, NetNode> = {
  'port:lab': { at: [1.85, 0.6], r: 0.26, top: 0.12 },
  'a:purchasing': { at: [3.35, 0.6], r: 0.62, top: 1.02 },
  'a:payment_report': { at: [3.0, -2.1], r: 0.55, top: 0.95 },
  'p:grant_manager': { at: [5.2, -1.45], r: 0.72, top: 0.84 },
  'a:bookkeeping': { at: [7.6, -1.3], r: 0.6, top: 1.0 },
  [`g:${R01}`]: { at: [5.4, 1.85], r: 1.08, top: 1.2 },
  [`g:${R21}`]: { at: [7.9, 1.85], r: 1.08, top: 1.2 },
  's:reporter': { at: [6.0, -2.95], r: 0.2, top: 0.62 },
  's:usaspending': { at: [6.8, -2.95], r: 0.2, top: 0.62 },
  's:cancellations': { at: [7.6, -2.95], r: 0.2, top: 0.62 },
  's:court': { at: [8.4, -2.95], r: 0.2, top: 0.62 },
  's:payments': { at: [9.2, -2.95], r: 0.2, top: 0.62 },
  'port:vendors': { at: [10.05, 3.15], r: 0.0, top: 0.1 },
  'port:invoice': { at: [10.05, 0.4], r: 0.0, top: 0.1 },
  'port:funder': { at: [3.0, -3.3], r: 0.0, top: 0.1 },
}

export const VENDORS: V3 = [12.4, -0.7, 2.4] // pedestal top centre
export const FUNDER: V3 = [2.2, -0.35, -5.0]

export interface Groove {
  a: string
  b: string
  pts: V2[] // centre line from a to b, node centre to node centre
}

const S_IDS = ['s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments']
const at = (id: string) => NET[id].at
export const GROOVES: Groove[] = [
  { a: 'port:lab', b: 'a:purchasing', pts: [at('port:lab'), at('a:purchasing')] },
  { a: 'port:lab', b: 'a:payment_report', pts: [at('port:lab'), at('a:payment_report')] },
  { a: 'a:purchasing', b: 'a:bookkeeping', pts: [at('a:purchasing'), at('a:bookkeeping')] },
  { a: 'a:purchasing', b: 'p:grant_manager', pts: [at('a:purchasing'), at('p:grant_manager')] },
  { a: 'a:payment_report', b: 'p:grant_manager', pts: [at('a:payment_report'), at('p:grant_manager')] },
  { a: 'a:bookkeeping', b: 'p:grant_manager', pts: [at('a:bookkeeping'), at('p:grant_manager')] },
  ...S_IDS.map(id => ({ a: id, b: 'a:bookkeeping', pts: [at(id), at('a:bookkeeping')] })),
  { a: 'a:bookkeeping', b: `g:${R01}`, pts: [at('a:bookkeeping'), at(`g:${R01}`)] },
  { a: 'a:bookkeeping', b: `g:${R21}`, pts: [at('a:bookkeeping'), at(`g:${R21}`)] },
  { a: 'a:purchasing', b: `g:${R01}`, pts: [at('a:purchasing'), at(`g:${R01}`)] },
  { a: 'a:purchasing', b: `g:${R21}`, pts: [at('a:purchasing'), [6.6, 0.72], at(`g:${R21}`)] },
  { a: `g:${R01}`, b: 'port:vendors', pts: [at(`g:${R01}`), [6.75, 3.15], at('port:vendors')] },
  { a: `g:${R21}`, b: 'port:vendors', pts: [at(`g:${R21}`), [9.2, 3.15], at('port:vendors')] },
  { a: 'port:invoice', b: 'a:bookkeeping', pts: [at('port:invoice'), at('a:bookkeeping')] },
  { a: 'a:payment_report', b: 'port:funder', pts: [at('a:payment_report'), at('port:funder')] },
]

/** Which ports a node outside the plinth goes through, and which groove leg it joins. */
export function portFor(outside: string, inside: string): string | null {
  if (outside.startsWith('r:')) return 'port:lab'
  if (outside === 'v:vendors') return inside === 'a:bookkeeping' ? 'port:invoice' : 'port:vendors'
  if (outside === 'p:funder') return 'port:funder'
  return null
}

export const grooveIndex = (a: string, b: string) => GROOVES.findIndex(g => (g.a === a && g.b === b) || (g.a === b && g.b === a))

export const PARK_Y = 0.95
/** Parcels held until money lands wait in a row in front of their frozen grant. */
export function parkOf(gid: string, i: number, out = new Vector3()) {
  const n = NET[`g:${gid}`] ?? NET[`g:${R01}`]
  return out.set(n.at[0] - 0.75 + i * 0.75, PARK_Y, 3.12)
}

// ── Anchors for halos, the hover card and the camera ─────────────────────

const fixed: Record<string, V3> = {
  'v:vendors': [VENDORS[0], VENDORS[1] + 0.9, VENDORS[2]],
  'p:funder': [FUNDER[0], FUNDER[1] + 1.2, FUNDER[2]],
}
for (const [id, n] of Object.entries(NET)) fixed[id] = [n.at[0], n.top, n.at[1]]

/** Static anchor for network nodes; researchers move, so their anchor comes from fx.figs. */
export const netAnchor = (id: string, out = new Vector3()) => {
  const p = fixed[id]
  return p ? out.set(p[0], p[1], p[2]) : out.set(0, 2, 0)
}
export const netFloor = (id: string, out = new Vector3()) => {
  if (id === 'v:vendors') return out.set(VENDORS[0], VENDORS[1] + 0.012, VENDORS[2])
  if (id === 'p:funder') return out.set(FUNDER[0], FUNDER[1] + 0.012, FUNDER[2])
  const n = NET[id]
  return n ? out.set(n.at[0], 0.014, n.at[1]) : out.set(0, 0.014, 0)
}
export const haloSize = (id: string) =>
  id.startsWith('g:') ? 1.75 : id.startsWith('a:') ? 1.0 : id === 'p:grant_manager' ? 1.15 : id.startsWith('s:') ? 0.42 : id.startsWith('r:') ? 0.62 : 1.5

/** An arc whose height grows with distance; `u` is already eased. */
export function arcPoint(a: Vector3, b: Vector3, u: number, h: number, out: Vector3) {
  out.lerpVectors(a, b, u)
  out.y += 4 * h * u * (1 - u)
  return out
}

/** Plinth top under a point, or null over the gap. */
export function groundAt(x: number, z: number): number | null {
  if (x >= LAB_BOX.x0 && x <= LAB_BOX.x1 && z >= LAB_BOX.z0 && z <= LAB_BOX.z1) return 0
  if (x >= NET_BOX.x0 && x <= NET_BOX.x1 && z >= NET_BOX.z0 && z <= NET_BOX.z1) return 0
  return null
}

// ── Framing: fit both plinths to whatever shape the stage is ─────────────

export interface Framing {
  pos: Vector3
  target: Vector3
  fov: number
}

const FIT: V3[] = [
  [LAB_BOX.x0, 0, LAB_BOX.z0], [LAB_BOX.x0, 0, LAB_BOX.z1], [LAB_BOX.x1, 0, LAB_BOX.z0], [LAB_BOX.x1, 0, LAB_BOX.z1],
  [LAB_BOX.x0, -1.1, LAB_BOX.z1], [LAB_BOX.x1, -1.1, LAB_BOX.z1], [LAB_BOX.x0, 2.4, LAB_BOX.z0 + 0.2], [LAB_BOX.x1, 2.2, LAB_BOX.z0 + 0.2],
  [NET_BOX.x0, 0, NET_BOX.z0], [NET_BOX.x1, 0, NET_BOX.z0], [NET_BOX.x0, -1.1, NET_BOX.z1], [NET_BOX.x1, -1.1, NET_BOX.z1],
  [VENDORS[0] + 1.2, VENDORS[1], VENDORS[2] + 1.1], [VENDORS[0] + 1.2, VENDORS[1] - 0.6, VENDORS[2] + 1.1], [VENDORS[0] + 1.2, VENDORS[1] + 1.0, VENDORS[2] - 1.1],
  [FUNDER[0] - 1.2, FUNDER[1] + 1.4, FUNDER[2] - 1.0], [FUNDER[0] + 1.2, FUNDER[1] + 1.4, FUNDER[2] - 1.0],
]

const _r = new Vector3()
const _u = new Vector3()
const _q = new Vector3()
const _f = new Vector3()

/** Distance and target so every FIT point lands inside the view with a margin. */
function fit(dir: Vector3, fov: number, aspect: number, margin: number): Framing {
  const target = new Vector3(0.4, 0, -0.6)
  const ty = Math.tan(((fov / 2) * Math.PI) / 180) * margin
  const tx = ty * aspect
  _f.copy(dir).negate()
  _r.crossVectors(_f, new Vector3(0, 1, 0)).normalize()
  _u.crossVectors(_r, _f).normalize()
  let d = 40
  for (let pass = 0; pass < 4; pass++) {
    // Re-centre on the projected extents, then size the distance.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of FIT) {
      _q.set(p[0], p[1], p[2]).sub(target)
      const z = d + _q.dot(_f)
      const x = _q.dot(_r) / z
      const y = _q.dot(_u) / z
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
    target.addScaledVector(_r, ((x0 + x1) / 2) * d).addScaledVector(_u, ((y0 + y1) / 2) * d)
    let need = 0
    for (const p of FIT) {
      _q.set(p[0], p[1], p[2]).sub(target)
      const x = Math.abs(_q.dot(_r)), y = Math.abs(_q.dot(_u))
      need = Math.max(need, x / tx - _q.dot(_f), y / ty - _q.dot(_f))
    }
    d = need
  }
  return { pos: target.clone().addScaledVector(dir, d), target, fov }
}

const WIDE_DIR = new Vector3(-0.47, 0.72, 0.6).normalize()
const TALL_DIR = new Vector3(-0.66, 0.74, 0.12).normalize()
let lastAspect = -1
let lastFraming: Framing | null = null

/** The hero framing for a stage of this aspect (width / height). Cached until the aspect changes. */
export function heroFor(aspect: number): Framing {
  const a = Math.round(aspect * 50) / 50
  if (lastFraming && a === lastAspect) return lastFraming
  lastAspect = a
  lastFraming = a < 0.85 ? fit(TALL_DIR, 30, a, 0.94) : fit(WIDE_DIR, 24, a, 0.93)
  return lastFraming
}

export const OPENING = { pos: new Vector3(-9.6, 2.7, 4.4), target: new Vector3(-7.0, 1.0, -0.2) }
