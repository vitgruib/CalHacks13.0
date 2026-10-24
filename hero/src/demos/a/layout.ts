// Where everything sits. One world unit is roughly a metre of lab floor.
// The lab plinth spans x -9.4..-1.4, the grant office plinth x 1.4..9.4,
// both z -3.2..3.2 with their tops at y = 0. Vendors and the funder float
// on two small pedestals past the office.

import { QuadraticBezierCurve3, Vector3 } from 'three'

export type V3 = [number, number, number]

export const PAL = {
  void: '#BCC5CF',
  voidHi: '#DCE2E8',
  labBody: '#D6DCE2',
  labTop: '#E4E8EC',
  officeBody: '#6A7787',
  officeTop: '#7F8C9B',
  chalk: '#E6E9EC',
  porcelain: '#F1F3F5',
  clay: '#B7C0CA',
  clayDeep: '#97A3B0',
  slate: '#5E6B7A',
  slateDeep: '#36414E',
  ink: '#1C232C',
  money: '#2F4560',
  celadon: '#4F9C80',
  ochre: '#C98B2E',
  oxblood: '#9C2E2A',
  cobalt: '#2E5BA6',
  lens: '#EAF4FF',
  ice: '#A9BCCD',
}

export const GLAZE = { accept: PAL.celadon, refine: PAL.ochre, reject: PAL.oxblood, hold: PAL.cobalt } as const

export const LAB_X = -5.4
export const OFFICE_X = 5.4
export const PLINTH_W = 8
export const PLINTH_D = 6.4

export type Gesture = 'write' | 'pipette' | 'cabinet' | 'scope' | 'reach'

export interface Station {
  fig: V3 // figurine feet
  rot: number // figurine yaw; 0 faces +z (toward the default camera)
  anchor: V3 // where tokens leave from and land
  stack: V3 // where the researcher's token stack sits
  gesture: Gesture
}

export const STATIONS: Record<string, Station> = {
  ortiz: { fig: [-7.55, 0, -1.55], rot: Math.PI + 0.55, anchor: [-7.2, 1.25, -1.1], stack: [-6.85, 0, -1.3], gesture: 'write' },
  okafor: { fig: [-7.4, 0, 0.05], rot: 0, anchor: [-7.4, 1.25, 0.95], stack: [-8.95, 0, 0.9], gesture: 'pipette' },
  raman: { fig: [-5.05, 0, -1.45], rot: Math.PI, anchor: [-4.55, 1.25, -1.1], stack: [-4.3, 0, -1.35], gesture: 'cabinet' },
  silva: { fig: [-4.15, 0, 0.1], rot: 0, anchor: [-4.15, 1.25, 1.0], stack: [-2.75, 0, 1.0], gesture: 'scope' },
  park: { fig: [-2.75, 0, -1.4], rot: Math.PI - 0.5, anchor: [-2.4, 1.25, -1.0], stack: [-2.05, 0, -0.75], gesture: 'reach' },
}

export const PURCHASING: V3 = [2.95, 0, 0.25]
export const BOOKKEEPING: V3 = [5.55, 0, -1.55]
export const PAYMENT_REPORT: V3 = [8.25, 0, -1.25]
export const GM_DESK: V3 = [3.45, 0, -2.2]
export const RESERVOIRS: Record<string, V3> = {
  R01GM061721: [5.25, 0, 1.35],
  R21AI182745: [7.55, 0, 1.35],
}
export const SOURCES: Record<string, V3> = {
  's:reporter': [4.75, 0, -2.85],
  's:usaspending': [5.75, 0, -2.85],
  's:cancellations': [6.75, 0, -2.85],
  's:court': [7.75, 0, -2.85],
  's:payments': [8.75, 0, -2.85],
}
export const VENDORS: V3 = [12.1, -0.7, 1.7] // pedestal top centre
export const FUNDER: V3 = [12.1, -0.3, -1.7]

interface NodeSpot {
  anchor: V3
  floor: V3 // ground point under the node, for halos and ripples
}

const spots: Record<string, NodeSpot> = {}
for (const [id, s] of Object.entries(STATIONS)) spots[`r:${id}`] = { anchor: s.anchor, floor: [s.fig[0], 0.012, s.fig[2]] }
spots['a:purchasing'] = { anchor: [PURCHASING[0], 2.0, PURCHASING[2]], floor: [PURCHASING[0], 0.012, PURCHASING[2]] }
spots['a:bookkeeping'] = { anchor: [BOOKKEEPING[0], 1.5, BOOKKEEPING[2]], floor: [BOOKKEEPING[0], 0.012, BOOKKEEPING[2]] }
spots['a:payment_report'] = { anchor: [PAYMENT_REPORT[0], 1.85, PAYMENT_REPORT[2]], floor: [PAYMENT_REPORT[0], 0.012, PAYMENT_REPORT[2]] }
spots['p:grant_manager'] = { anchor: [GM_DESK[0] - 0.35, 1.05, GM_DESK[2]], floor: [GM_DESK[0], 0.012, GM_DESK[2] - 0.3] }
for (const [gid, p] of Object.entries(RESERVOIRS)) spots[`g:${gid}`] = { anchor: [p[0], 1.15, p[2]], floor: [p[0], 0.012, p[2]] }
for (const [sid, p] of Object.entries(SOURCES)) spots[sid] = { anchor: [p[0], 1.35, p[2]], floor: [p[0], 0.012, p[2]] }
spots['v:vendors'] = { anchor: [VENDORS[0], VENDORS[1] + 0.85, VENDORS[2]], floor: [VENDORS[0], VENDORS[1] + 0.012, VENDORS[2]] }
spots['p:funder'] = { anchor: [FUNDER[0], FUNDER[1] + 1.25, FUNDER[2]], floor: [FUNDER[0], FUNDER[1] + 0.012, FUNDER[2]] }

const FALLBACK: NodeSpot = { anchor: [0, 3, 0], floor: [0, 0.012, 0] }

export const spot = (id: string): NodeSpot => spots[id] ?? FALLBACK
export const anchorOf = (id: string) => new Vector3(...spot(id).anchor)
export const floorOf = (id: string) => new Vector3(...spot(id).floor)

/** Lab ↔ office routes cross the gap and get a tall arc; hops inside the office stay low. */
const side = (id: string) => (id.startsWith('r:') ? 'lab' : 'office')

const curves = new Map<string, QuadraticBezierCurve3>()
export function routeCurve(from: string, to: string): QuadraticBezierCurve3 {
  const key = `${from}>${to}`
  let c = curves.get(key)
  if (!c) {
    const a = anchorOf(from)
    const b = anchorOf(to)
    const d = a.distanceTo(b)
    const lift = side(from) !== side(to) ? Math.min(3.4, 1.4 + d * 0.16) : Math.min(1.6, 0.35 + d * 0.16)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    mid.y += lift * 2
    c = new QuadraticBezierCurve3(a, mid, b)
    curves.set(key, c)
  }
  return c
}

/** Both directions of a route share one ribbon. */
export const ribbonKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export interface Framing {
  pos: Vector3
  target: Vector3
  fov: number
  shift: [number, number] // fraction of the viewport to slide the picture (x right, y down)
}

export const HERO_WIDE: Framing = { pos: new Vector3(-3.2, 15.3, 26.3), target: new Vector3(1.7, -0.4, 0), fov: 30, shift: [0.03, 0.1] }
export const HERO_TALL: Framing = { pos: new Vector3(-46.8, 53.7, 27.7), target: new Vector3(1.4, -0.3, 0), fov: 28, shift: [0.066, 0.002] }
export const OPENING = { pos: new Vector3(-8.6, 2.4, 5.4), target: new Vector3(-6.6, 0.9, 0.2) }

export const heroFor = (aspect: number) => (aspect < 0.85 ? HERO_TALL : HERO_WIDE)
