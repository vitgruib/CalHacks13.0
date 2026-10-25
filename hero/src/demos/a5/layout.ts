// Where everything sits. One world unit is roughly a metre of lab floor.
// The lab plinth spans x -9.2..2.4, z -3.2..3.6 with its floor at y = 0 and
// a back wall of dusk windows along z = -3.2. The finance network is a dark
// round plinth behind and to the right, centred on NET.

import { Vector3 } from 'three'

export type V3 = [number, number, number]

export const PAL = {
  void: '#070A14',
  voidHi: '#161E38',
  ground: '#10162A',
  labBody: '#BDB3A5',
  floor: '#C9C1B4',
  wall: '#CFC8BD',
  netBody: '#161B24',
  netTop: '#1D232E',
  clay: '#D3CABD',
  clayDeep: '#A99F92',
  porcelain: '#E9E4DC',
  steel: '#AEB4BA',
  slate: '#4E5967',
  ink: '#1C232C',
  warm: '#FFB86E',
  lamp: '#FFC98C',
  screen: '#B9CCFF',
  ice: '#CFE3F2',
  line: '#9FB6E8',
}

/** The two grants' colours: their liquid, their tags, their lines. */
export const GRANT_COLOR: Record<string, string> = {
  R01GM061721: '#E15FA6',
  R21AI182745: '#3FC4DE',
}
export const GLAZE = { accept: '#5BC98C', refine: '#E8B04A', reject: '#E2574F', hold: '#7C93F2' } as const

// ── The lab ──────────────────────────────────────────────────────────────

export const LAB = { x0: -9.2, x1: 2.4, z0: -3.2, z1: 3.6 }
export const LAB_C: V3 = [(LAB.x0 + LAB.x1) / 2, 0, (LAB.z0 + LAB.z1) / 2]
export const WALL_H = 2.7
export const BENCH_H = 0.92

/** Aisle waypoints: people walk only along these lines. */
export const NODES_XZ: Record<string, [number, number]> = {
  b0: [-6.15, -1.55],
  b1: [-5.0, -1.55],
  b2: [-3.9, -1.55],
  b3: [-2.6, -1.55],
  b4: [-1.4, -1.55],
  b5: [-0.3, -1.55],
  b6: [0.9, -1.55],
  w0: [-6.15, -0.1],
  f0: [-6.15, 1.3],
  f1: [-5.0, 1.3],
  f2: [-3.8, 1.3],
  f3: [-2.4, 1.3],
  f4: [-1.2, 1.3],
  f5: [0.1, 1.3],
  f6: [1.2, 1.3],
  e0: [0.2, -0.2],
  e1: [1.15, -0.2],
  o0: [-6.95, -0.3],
  o1: [-7.55, -1.35],
  c0: [-6.9, 1.55],
  c1: [-7.0, 2.45],
  d0: [-5.95, 3.05],
  d1: [-2.35, 3.05],
  u0: [1.5, 2.0],
}
const LINKS: [string, string][] = [
  ['b0', 'b1'], ['b1', 'b2'], ['b2', 'b3'], ['b3', 'b4'], ['b4', 'b5'], ['b5', 'b6'],
  ['b0', 'w0'], ['w0', 'f0'],
  ['f0', 'f1'], ['f1', 'f2'], ['f2', 'f3'], ['f3', 'f4'], ['f4', 'f5'], ['f5', 'f6'],
  ['b5', 'e0'], ['b6', 'e1'], ['e0', 'e1'], ['e0', 'f5'], ['e1', 'f6'],
  ['w0', 'o0'], ['o0', 'o1'],
  ['f0', 'c0'], ['c0', 'c1'],
  ['f0', 'd0'], ['f3', 'd1'], ['f6', 'u0'],
]
export const GRAPH: Record<string, string[]> = {}
for (const [a, b] of LINKS) {
  ;(GRAPH[a] ??= []).push(b)
  ;(GRAPH[b] ??= []).push(a)
}

export type Action =
  | 'type' // seated at a keyboard
  | 'write' // marker on the whiteboard
  | 'read' // a printout in both hands
  | 'look' // leaning in to a screen, pointing
  | 'pipette' // thumb on the plunger
  | 'swirl' // a flask in one hand
  | 'cabinet' // both arms into the biosafety cabinet
  | 'inspect' // a plate held up to the lamp
  | 'scope' // leaning into the eyepieces
  | 'adjust' // both hands on the stage
  | 'reach' // up to a shelf
  | 'freezer' // the freezer door open, reaching in
  | 'load' // bent over the centrifuge
  | 'pickup' // lifting a box from the floor
  | 'place' // putting a box on a shelf or bench

export interface Spot {
  x: number
  z: number
  yaw: number // 0 faces +z, toward the camera
  via: string // the aisle node it hangs off
  seat?: number // seat height when seated
}

const F = 0 // facing +z (toward the camera)
const B = Math.PI // facing the back wall
const W = -Math.PI / 2 // facing -x
const E = Math.PI / 2 // facing +x

export const SPOTS: Record<string, Spot> = {
  // Lena: the office, the whiteboard, the window, the gel imager
  piDesk: { x: -8.0, z: -1.3, yaw: W, via: 'o1', seat: 0.5 },
  board: { x: -7.05, z: -1.75, yaw: E, via: 'o1' },
  window: { x: -8.15, z: -2.45, yaw: B + 0.35, via: 'o1' },
  gelImg: { x: -1.25, z: 1.18, yaw: B, via: 'f4' },
  // Sam: the purification bench, the gel box, the ultracentrifuge
  fplc: { x: -5.3, z: -1.2, yaw: F, via: 'b1' },
  assay: { x: -4.4, z: -1.2, yaw: F, via: 'b2' },
  ice: { x: -4.6, z: -1.2, yaw: F, via: 'b2' },
  gelBox: { x: -3.75, z: 1.18, yaw: B, via: 'f2' },
  ultra: { x: 1.5, z: 2.05, yaw: F, via: 'u0' },
  // Priya: the cabinet, the micro bench, a desk
  bsc: { x: -4.0, z: -1.9, yaw: B, via: 'b2' },
  mic: { x: -2.55, z: -1.2, yaw: F, via: 'b3' },
  chip: { x: -1.6, z: -1.2, yaw: F, via: 'b4' },
  deskA: { x: -4.9, z: 3.12, yaw: B, via: 'd0', seat: 0.5 },
  // Mateo: the confocal bay and a desk
  scope: { x: -7.4, z: 1.55, yaw: W, via: 'c0' },
  stage: { x: -7.55, z: 0.95, yaw: W, via: 'c0' },
  scopePc: { x: -7.55, z: 2.95, yaw: W, via: 'c1', seat: 0.5 },
  deskB: { x: -3.25, z: 3.12, yaw: B, via: 'd1', seat: 0.5 },
  // Jun: shelves, freezer, the hallway door, drop-offs at the benches
  shelf: { x: 1.35, z: -1.0, yaw: E, via: 'e1' },
  shelfLow: { x: 1.35, z: -0.25, yaw: E, via: 'e1' },
  freezer: { x: 0.9, z: -1.85, yaw: B, via: 'b6' },
  door: { x: -0.35, z: -2.0, yaw: B, via: 'b5' },
  dropA: { x: -5.3, z: 1.18, yaw: B, via: 'f1' },
  dropB: { x: -2.45, z: 1.18, yaw: B, via: 'f3' },
}

export interface Leg {
  spot: keyof typeof SPOTS
  act: Action
  ms: number // how long the leg lasts before the next; Infinity for a single-station task
  carry?: boolean // carries a box while walking to this leg
}

const stay = (spot: keyof typeof SPOTS, act: Action): Leg[] => [{ spot, act, ms: Infinity }]

/** What each feed task looks like on the floor. Unknown tasks fall back to the person's home spot. */
export const ROUTINES: Record<string, Leg[]> = {
  'Drafting the mitochondria progress report': stay('piDesk', 'type'),
  'Reviewing gel images with Sam': stay('gelImg', 'look'),
  'Sketching aim 3 on the whiteboard': stay('board', 'write'),
  'Reading reviewer comments': stay('window', 'read'),
  'Running a Ni-NTA purification': stay('fplc', 'pipette'),
  'Loading an SDS-PAGE gel': stay('gelBox', 'pipette'),
  'Prepping outer membranes': [
    { spot: 'ice', act: 'swirl', ms: 6500 },
    { spot: 'ultra', act: 'load', ms: 4500 },
  ],
  'Setting up a folding assay': stay('assay', 'pipette'),
  'Plating E. coli isolates': stay('bsc', 'cabinet'),
  'Reading MIC plates': stay('mic', 'inspect'),
  'Loading the microfluidic chip': stay('chip', 'pipette'),
  'Logging assay results': stay('deskA', 'type'),
  'Imaging labeled membranes': stay('scope', 'scope'),
  'Calibrating the 63x objective': stay('stage', 'adjust'),
  'Stitching a tile scan': stay('scopePc', 'type'),
  'Exporting time-lapse stacks': stay('deskB', 'type'),
  'Counting reagent stock': [
    { spot: 'shelf', act: 'reach', ms: 5000 },
    { spot: 'shelfLow', act: 'reach', ms: 4000 },
  ],
  'Logging the -80 °C freezer': stay('freezer', 'freezer'),
  'Receiving a delivery': [
    { spot: 'door', act: 'pickup', ms: 2600 },
    { spot: 'shelfLow', act: 'place', ms: 2600, carry: true },
    { spot: 'shelf', act: 'reach', ms: 3500 },
  ],
  'Restocking pipette tips': [
    { spot: 'shelf', act: 'pickup', ms: 2400 },
    { spot: 'dropA', act: 'place', ms: 2200, carry: true },
    { spot: 'shelf', act: 'pickup', ms: 2400 },
    { spot: 'dropB', act: 'place', ms: 2200, carry: true },
  ],
}

export const HOME: Record<string, Leg[]> = {
  ortiz: stay('board', 'write'),
  okafor: stay('assay', 'pipette'),
  raman: stay('bsc', 'cabinet'),
  silva: stay('scope', 'scope'),
  park: stay('shelf', 'reach'),
}

/** Which station a point on the lab floor belongs to, for hovering the furniture. */
export const ZONES: { id: string; x0: number; x1: number; z0: number; z1: number }[] = [
  { id: 'r:ortiz', x0: -9.2, x1: -6.45, z0: -3.2, z1: -0.55 },
  { id: 'r:silva', x0: -9.2, x1: -6.5, z0: 0.2, z1: 3.6 },
  { id: 'r:okafor', x0: -5.9, x1: -3.55, z0: -0.85, z1: 0.75 },
  { id: 'r:okafor', x0: 1.0, x1: 2.4, z0: 1.9, z1: 3.6 },
  { id: 'r:raman', x0: -4.75, x1: -3.25, z0: -3.2, z1: -2.15 },
  { id: 'r:raman', x0: -3.55, x1: -0.4, z0: -0.85, z1: 0.0 },
  { id: 'r:park', x0: 0.35, x1: 2.4, z0: -3.2, z1: 0.3 },
]
export function zoneAt(x: number, z: number): string | null {
  for (const r of ZONES) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.id
  return null
}

// ── The finance network ──────────────────────────────────────────────────

export const NET: V3 = [7.8, 0, -3.0]
export const NET_R = 3.6
const n = (x: number, z: number, y = 0): V3 => [x, y, z]

/** Node centres, on the network plinth's top (y = 0) unless they stand outside it. */
export const NODE_AT: Record<string, V3> = {
  intake: n(4.75, -2.1),
  'a:purchasing': n(5.95, -2.55),
  'a:bookkeeping': n(7.55, -4.45),
  'a:payment_report': n(10.55, -3.0),
  'p:grant_manager': n(8.15, -1.25),
  'g:R01GM061721': n(6.35, -0.55),
  'g:R21AI182745': n(9.95, -0.85),
  's:reporter': n(5.05, -4.7),
  's:usaspending': n(6.05, -5.75),
  's:cancellations': n(7.45, -6.35),
  's:court': n(8.95, -6.2),
  's:payments': n(10.25, -5.45),
  'v:vendors': n(12.35, -0.15, -0.55),
  'p:funder': n(12.55, -4.85, -0.35),
}

/** Lines that bow a little so they clear the nodes they pass. */
export const BOW: Record<string, number> = {
  'g:R01GM061721>v:vendors': 1.1,
  'v:vendors>a:bookkeeping': -0.9,
  'a:purchasing>g:R21AI182745': 0.55,
  'a:bookkeeping>g:R21AI182745': -0.35,
  'a:bookkeeping>g:R01GM061721': 0.3,
  'a:payment_report>p:funder': -0.25,
}

/** Where a request rests while the purchasing agent checks it, and where held work waits. */
export const DESK_SPOT: V3 = [NODE_AT['a:purchasing'][0], 1.25, NODE_AT['a:purchasing'][2]]
export const GM_SPOT: V3 = [NODE_AT['p:grant_manager'][0] + 0.55, 1.12, NODE_AT['p:grant_manager'][2] + 0.25]

export function parkOf(gid: string, i: number, out = new Vector3()) {
  const p = NODE_AT[`g:${gid}`] ?? NODE_AT['g:R01GM061721']
  return out.set(p[0] - 0.95 - (i % 3) * 0.75, 1.05 + Math.floor(i / 3) * 0.8, p[2] - 0.55)
}

/** Ground point under any node or researcher home, for halos. */
export function floorOf(id: string, out = new Vector3()): Vector3 {
  const p = NODE_AT[id]
  if (p) return out.set(p[0], p[1] + 0.012, p[2])
  return out.set(0, 0.012, 0)
}
export function anchorOf(id: string, out = new Vector3()): Vector3 {
  const p = NODE_AT[id]
  if (!p) return out.set(-3.4, 1.2, 0.2)
  const h = id.startsWith('g:') ? 1.4 : id.startsWith('s:') ? 0.7 : id === 'p:grant_manager' ? 1.7 : id.startsWith('a:') ? 1.0 : 1.0
  return out.set(p[0], p[1] + h, p[2])
}

/** An arc whose height grows with distance; `u` is already eased. */
export function arcPoint(a: Vector3, b: Vector3, u: number, h: number, out: Vector3) {
  out.lerpVectors(a, b, u)
  out.y += 4 * h * u * (1 - u)
  return out
}

/** Plinth top under a point, or null over the gap. */
export function groundAt(x: number, z: number): number | null {
  if (x >= LAB.x0 && x <= LAB.x1 && z >= LAB.z0 && z <= LAB.z1) return 0
  if (Math.hypot(x - NET[0], z - NET[2]) <= NET_R) return 0
  return null
}

export interface Framing {
  pos: Vector3
  target: Vector3
  fov: number
}

// Fitted so the lab and the network fill the stage the sidebar leaves free.
export const HERO_WIDE: Framing = { pos: new Vector3(-17.2, 23.2, 24.3), target: new Vector3(-0.57, 0, -0.34), fov: 21 }
export const HERO_SQUARE: Framing = { pos: new Vector3(-25.9, 27.3, 19.9), target: new Vector3(-0.99, 0, -1.04), fov: 22 }
export const HERO_TALL: Framing = { pos: new Vector3(-37.0, 39.7, 8.2), target: new Vector3(0.21, 0, -1.11), fov: 22 }
export const OPENING = { pos: new Vector3(-7.4, 2.6, 4.4), target: new Vector3(-4.8, 1.0, -0.6) }

export const heroFor = (aspect: number) => (aspect < 0.8 ? HERO_TALL : aspect < 1.35 ? HERO_SQUARE : HERO_WIDE)
