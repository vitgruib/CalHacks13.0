// Where everything sits. One world unit is roughly a metre of lab floor.
// The lab plinth spans x -9.4..2.6 and z -3.4..3.9 with its top at y = 0.
// The finance network hangs from one hook above a small slate base to the
// right, like a balanced mobile; the grant manager's desk sits on that base.

import { Vector3 } from 'three'
import { R01, R21 } from '../../feed'

export type V3 = [number, number, number]

export const PAL = {
  void: '#C7CCD2',
  voidHi: '#E6E8EB',
  ground: '#DCDFE3',
  labBody: '#D6CDBF',
  labTop: '#E8E2D8',
  officeBody: '#252D37',
  officeTop: '#2E3742',
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
  kraft: '#C9A67A',
  wire: '#2A313A',
}

export const GLAZE = { accept: PAL.celadon, refine: PAL.ochre, reject: PAL.oxblood, hold: PAL.cobalt } as const

/** Each grant's own colour: the collar on its vessel and the tag on whatever it pays for. */
export const GRANT_TINT: Record<string, string> = { [R01]: '#C25B7A', [R21]: '#6F62B0' }
export const GRANTS = [R01, R21]

export const LAB = { x: -3.4, z: 0.25, w: 12, d: 7.3 }
export const BASE = { x: 5.9, z: -1.5, w: 4.2, d: 3.4 }
export const PLINTH_H = 1.1

// ── The mobile ────────────────────────────────────────────────────────────
// Arms hang from the end of their parent arm (or from the hook); things hang
// from arm ends, from an arm's pivot (a pendant), or from another thing.

export const HOOK: V3 = [5.6, 12.2, -1.5]

export interface ArmSpec {
  id: string
  parent: string // 'hook' or an arm end such as 'A0.L'
  drop: number // thread from the parent point to this pivot
  l: number // reach to the left end
  r: number // reach to the right end
  yaw: number
  sway: number // idle sway amplitude (radians of yaw)
}

export const ARMS: ArmSpec[] = [
  { id: 'A0', parent: 'hook', drop: 1.0, l: 3.6, r: 4.2, yaw: 0.1, sway: 0.025 },
  { id: 'AL', parent: 'A0.L', drop: 1.0, l: 1.35, r: 1.35, yaw: -0.32, sway: 0.05 },
  { id: 'AR', parent: 'A0.R', drop: 0.9, l: 2.0, r: 1.9, yaw: 0.34, sway: 0.04 },
  { id: 'AG', parent: 'AR.L', drop: 1.05, l: 1.25, r: 1.25, yaw: -0.28, sway: 0.05 },
  { id: 'AB', parent: 'AR.R', drop: 1.1, l: 1.0, r: 1.1, yaw: 0.42, sway: 0.06 },
  { id: 'AS', parent: 'AB.R', drop: 0.85, l: 0.95, r: 0.95, yaw: -0.5, sway: 0.08 },
]

/** The sources hang from five points along their little arm, at staggered depths. */
export const SOURCE_IDS = ['s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments']
const SOURCE_DROPS = [0.45, 0.8, 1.05, 0.8, 0.45]

export type NodeShape = 'agent' | 'vessel' | 'source' | 'vendors' | 'funder'

export interface HangSpec {
  id: string // FlowNode id
  parent: string // an arm end, an arm pivot, or another node
  drop: number // thread length to the top of the thing
  top: number // from its top to its centre
  bottom: number // from its centre to its underside
  shape: NodeShape
  size: number
}

export const HANGS: HangSpec[] = [
  { id: 'a:purchasing', parent: 'AL.L', drop: 1.15, top: 0.5, bottom: 0.5, shape: 'agent', size: 1.0 },
  { id: 'a:payment_report', parent: 'AL.R', drop: 0.85, top: 0.4, bottom: 0.4, shape: 'agent', size: 0.8 },
  { id: 'p:funder', parent: 'a:payment_report', drop: 0.55, top: 0.36, bottom: 0.2, shape: 'funder', size: 1 },
  { id: `g:${R01}`, parent: 'AG.L', drop: 0.9, top: 0.62, bottom: 0.62, shape: 'vessel', size: 1 },
  { id: `g:${R21}`, parent: 'AG.R', drop: 0.9, top: 0.62, bottom: 0.62, shape: 'vessel', size: 1 },
  { id: 'v:vendors', parent: 'AG', drop: 2.55, top: 0.32, bottom: 0.25, shape: 'vendors', size: 1 },
  { id: 'a:bookkeeping', parent: 'AB.L', drop: 0.95, top: 0.42, bottom: 0.42, shape: 'agent', size: 0.84 },
  ...SOURCE_IDS.map((id, i) => ({ id, parent: `AS.${i}`, drop: SOURCE_DROPS[i], top: 0.1, bottom: 0.1, shape: 'source' as const, size: 1 })),
]

/** Where the grant manager's call line and the intake line end. */
export const GM_DESK: V3 = [HOOK[0], 0, -1.15]
export const DESK_H = 0.76
export const GM_TRAY: V3 = [HOOK[0], DESK_H + 0.05, -1.5]

// Rest positions, computed once from the specs above (no tilt, no sway).
const rest = new Map<string, Vector3>()
const restYaw = new Map<string, number>()
{
  rest.set('hook', new Vector3(...HOOK))
  restYaw.set('hook', 0)
  for (const a of ARMS) {
    const parentPos = rest.get(a.parent)!
    const parentYaw = restYaw.get(a.parent.split('.')[0]) ?? 0
    const yaw = parentYaw + a.yaw
    const pivot = parentPos.clone().add(new Vector3(0, -a.drop, 0))
    rest.set(a.id, pivot)
    restYaw.set(a.id, yaw)
    const end = (k: number) => new Vector3(k * Math.cos(yaw), 0, -k * Math.sin(yaw)).add(pivot)
    rest.set(`${a.id}.L`, end(-a.l))
    rest.set(`${a.id}.R`, end(a.r))
    if (a.id === 'AS') for (let i = 0; i < 5; i++) rest.set(`AS.${i}`, end(-a.l + ((a.l + a.r) * i) / 4))
  }
  for (const h of HANGS) {
    const p = rest.get(h.parent)!
    const parentHang = HANGS.find(x => x.id === h.parent)
    const y = p.y - (parentHang ? parentHang.bottom : 0) - h.drop - h.top
    rest.set(h.id, new Vector3(p.x, y, p.z))
  }
}
export const restOf = (id: string) => rest.get(id) ?? new Vector3(0, 4, 0)

const PURCH = restOf('a:purchasing')
/** The intake: a thread that drops from under the purchasing agent to a post in the lab. */
export const PICKUP: V3 = [PURCH.x, 1.32, PURCH.z]
export const HOOK_DROP = 0.72 // from the purchasing agent's centre down to the hook where requests wait

// ── The lab floor ─────────────────────────────────────────────────────────

export type Action = 'idle' | 'pipette' | 'swirl' | 'type' | 'scope' | 'cabinet' | 'freezer' | 'write' | 'carry' | 'read' | 'look' | 'reach' | 'place'

export interface Spot {
  p: [number, number] // x, z of the feet
  yaw: number // 0 faces +z (the camera)
  act: Action
  seat?: boolean
  carry?: boolean // carries a box on the way there
  node: string // the aisle node it is reached from
  surf?: number // height of the surface in front, for answers that come home
}

const FACE_CAM = 0
const FACE_BACK = Math.PI
const FACE_LEFT = -Math.PI / 2 // toward -x

/** The aisles as a small graph. Every walk runs spot → node → … → node → spot. */
export const NODES_XZ: Record<string, [number, number]> = {
  A0: [-6.4, -1.78],
  A1: [-4.8, -1.78],
  A2: [-3.0, -1.78],
  A3: [-1.5, -1.78],
  A4: [-0.25, -1.78],
  D1: [-6.4, -0.75],
  D0: [-7.25, -0.75],
  O1: [-7.75, -1.75],
  B0: [-6.4, 0.6],
  B1: [-4.8, 0.6],
  B2: [-3.0, 0.6],
  B3: [-1.5, 0.6],
  B4: [-0.25, 0.6],
  C0: [-6.4, 2.95],
  C1: [-4.8, 2.95],
  C2: [-3.0, 2.95],
  C3: [-1.2, 2.95],
}
const LINKS: [string, string][] = [
  ['A0', 'A1'], ['A1', 'A2'], ['A2', 'A3'], ['A3', 'A4'],
  ['B0', 'B1'], ['B1', 'B2'], ['B2', 'B3'], ['B3', 'B4'],
  ['C0', 'C1'], ['C1', 'C2'], ['C2', 'C3'],
  ['A0', 'D1'], ['D1', 'B0'], ['B0', 'C0'], ['D1', 'D0'], ['D0', 'O1'],
  ['A4', 'B4'], ['B4', 'C3'],
]

export const SPOTS: Record<string, Spot> = {
  piDesk: { p: [-8.15, -1.45], yaw: FACE_LEFT, act: 'type', seat: true, node: 'O1', surf: 0.76 },
  piRead: { p: [-8.15, -1.45], yaw: FACE_LEFT + 0.35, act: 'read', seat: true, node: 'O1', surf: 0.76 },
  board: { p: [-8.0, -2.55], yaw: FACE_BACK, act: 'write', node: 'O1', surf: 0.9 },
  gel: { p: [-4.05, 0.92], yaw: FACE_CAM, act: 'look', node: 'B1' },
  fplc: { p: [-5.35, -1.42], yaw: FACE_CAM, act: 'pipette', node: 'A1' },
  sds: { p: [-4.45, -1.42], yaw: FACE_CAM, act: 'pipette', node: 'A1' },
  fold: { p: [-5.0, -1.42], yaw: FACE_CAM, act: 'swirl', node: 'A1' },
  spin: { p: [-5.45, 0.92], yaw: FACE_CAM, act: 'cabinet', node: 'B1' },
  bsc: { p: [-4.0, -2.08], yaw: FACE_BACK, act: 'cabinet', node: 'A2' },
  mic: { p: [-2.45, -1.42], yaw: FACE_CAM, act: 'read', node: 'A2' },
  chip: { p: [-1.75, -1.42], yaw: FACE_CAM, act: 'pipette', node: 'A3' },
  write1: { p: [-8.2, 1.05], yaw: FACE_LEFT, act: 'type', seat: true, node: 'B0', surf: 0.76 },
  write2: { p: [-8.2, 2.6], yaw: FACE_LEFT, act: 'type', seat: true, node: 'C0', surf: 0.76 },
  scope: { p: [1.3, 1.82], yaw: FACE_CAM, act: 'scope', node: 'B4', surf: 0.8 },
  calib: { p: [1.55, 1.82], yaw: FACE_CAM + 0.25, act: 'cabinet', node: 'B4', surf: 0.8 },
  tile: { p: [0.25, 1.82], yaw: FACE_CAM, act: 'type', node: 'B4', surf: 0.8 },
  shelfA: { p: [0.7, -2.18], yaw: FACE_BACK, act: 'reach', node: 'A4' },
  shelfB: { p: [1.85, -2.18], yaw: FACE_BACK, act: 'reach', node: 'A4' },
  reagent: { p: [-3.15, 0.32], yaw: FACE_BACK, act: 'reach', node: 'B2' },
  freezer: { p: [-1.02, -2.1], yaw: FACE_BACK, act: 'freezer', node: 'A4' },
  delivery: { p: [1.5, -1.95], yaw: FACE_LEFT + 0.5, act: 'look', node: 'A4' },
  stockIn: { p: [1.85, -2.18], yaw: FACE_BACK, act: 'place', carry: true, node: 'A4' },
  tips1: { p: [-2.85, 0.32], yaw: FACE_BACK, act: 'place', carry: true, node: 'B2' },
  tips2: { p: [-2.45, 0.92], yaw: FACE_CAM, act: 'place', carry: true, node: 'B3' },
  tipsGet: { p: [0.7, -2.18], yaw: FACE_BACK, act: 'reach', node: 'A4' },
}

/** What each lab member does for each task, and where. A list cycles every few seconds of feed time. */
export const TASK_SPOTS: Record<string, string[]> = {
  'Drafting the mitochondria progress report': ['piDesk'],
  'Reviewing gel images with Sam': ['gel'],
  'Sketching aim 3 on the whiteboard': ['board'],
  'Reading reviewer comments': ['piRead'],
  'Running a Ni-NTA purification': ['fplc'],
  'Loading an SDS-PAGE gel': ['sds'],
  'Prepping outer membranes': ['spin', 'fold'],
  'Setting up a folding assay': ['fold'],
  'Plating E. coli isolates': ['bsc'],
  'Reading MIC plates': ['mic'],
  'Loading the microfluidic chip': ['chip'],
  'Logging assay results': ['write1'],
  'Imaging labeled membranes': ['scope'],
  'Calibrating the 63x objective': ['calib'],
  'Stitching a tile scan': ['tile'],
  'Exporting time-lapse stacks': ['write2'],
  'Counting reagent stock': ['shelfA', 'reagent', 'shelfB'],
  'Logging the -80 °C freezer': ['freezer'],
  'Receiving a delivery': ['delivery', 'stockIn'],
  'Restocking pipette tips': ['tipsGet', 'tips1', 'tips2'],
}
/** Where each lab member goes if a task string is new to the scene. */
export const HOME: Record<string, string> = { ortiz: 'piDesk', okafor: 'fplc', raman: 'mic', silva: 'scope', park: 'shelfA' }
/** How long each step of a cycling task lasts (feed ms). Jun moves the most. */
export const CYCLE_MS: Record<string, number> = { ortiz: 9000, okafor: 7000, raman: 7000, silva: 8000, park: 4200 }

// All-pairs routes through the aisle graph, worked out once.
const names = Object.keys(NODES_XZ)
const dist = (a: string, b: string) => Math.hypot(NODES_XZ[a][0] - NODES_XZ[b][0], NODES_XZ[a][1] - NODES_XZ[b][1])
const D = new Map<string, number>()
const NEXT = new Map<string, string>()
for (const a of names)
  for (const b of names) {
    D.set(`${a}>${b}`, a === b ? 0 : Infinity)
    if (a === b) NEXT.set(`${a}>${b}`, b)
  }
for (const [a, b] of LINKS) {
  D.set(`${a}>${b}`, dist(a, b))
  D.set(`${b}>${a}`, dist(a, b))
  NEXT.set(`${a}>${b}`, b)
  NEXT.set(`${b}>${a}`, a)
}
for (const k of names)
  for (const i of names)
    for (const j of names) {
      const via = D.get(`${i}>${k}`)! + D.get(`${k}>${j}`)!
      if (via < D.get(`${i}>${j}`)!) {
        D.set(`${i}>${j}`, via)
        NEXT.set(`${i}>${j}`, NEXT.get(`${i}>${k}`)!)
      }
    }
const ROUTES = new Map<string, [number, number][]>()
export function route(a: string, b: string): [number, number][] {
  const key = `${a}>${b}`
  let r = ROUTES.get(key)
  if (r) return r
  r = [NODES_XZ[a]]
  let cur = a
  for (let guard = 0; cur !== b && guard < 30; guard++) {
    cur = NEXT.get(`${cur}>${b}`) ?? b
    r.push(NODES_XZ[cur])
  }
  ROUTES.set(key, r)
  return r
}

// ── Framing ───────────────────────────────────────────────────────────────

export interface Framing {
  pos: Vector3
  target: Vector3
  fov: number
}

// Fitted to the stage the sidebar leaves free: lab bottom left, mobile above right.
// A phone looks from further left, so the mobile stacks above the lab.
export const HERO_WIDE: Framing = { pos: new Vector3(-5.1, 21.4, 30.3), target: new Vector3(1.4, 3.6, -1.5), fov: 30 }
export const HERO_TALL: Framing = { pos: new Vector3(-33.6, 35.5, 17.2), target: new Vector3(1.5, 1.4, -3.0), fov: 30 }
export const OPENING = { pos: new Vector3(-6.0, 3.0, 7.5), target: new Vector3(-4.6, 1.0, -0.6) }

export const heroFor = (aspect: number) => (aspect < 0.85 ? HERO_TALL : HERO_WIDE)

/** Plinth top under a point, or null over the gap. */
export function groundAt(x: number, z: number): number | null {
  if (Math.abs(x - LAB.x) <= LAB.w / 2 && Math.abs(z - LAB.z) <= LAB.d / 2) return 0
  if (Math.abs(x - BASE.x) <= BASE.w / 2 && Math.abs(z - BASE.z) <= BASE.d / 2) return 0
  return null
}
