// Where everything sits. One world unit is roughly a metre of lab floor.
// The lab plinth spans x -9.4..-1.4, the grant office plinth x 1.4..9.4,
// both z -3.2..3.2 with their tops at y = 0. Vendors and the funder float
// on two small pedestals past the office.

import { Vector3 } from 'three'

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
  anchor: V3 // where tokens leave from
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
export const DESK_H = 0.74
export const PARCEL = 0.56
/** Where a request parcel rests while the purchasing agent checks it. */
export const DESK_SPOT: V3 = [PURCHASING[0], DESK_H + PARCEL / 2, PURCHASING[2] + 0.12]
export const BOOKKEEPING: V3 = [5.55, 0, -1.55]
export const PAYMENT_REPORT: V3 = [8.25, 0, -1.25]
export const GM_DESK: V3 = [3.45, 0, -2.2]
export const GM_SPOT: V3 = [GM_DESK[0] + 0.2, 0.74 + PARCEL / 2, GM_DESK[2] + 0.05]
export const RESERVOIRS: Record<string, V3> = {
  R01GM061721: [5.25, 0, 1.35],
  R21AI182745: [7.55, 0, 1.35],
}
/** The five sources share one low rack at the back of the office. */
export const RACK: V3 = [6.75, 0, -2.85]
export const SOURCES: Record<string, V3> = {
  's:reporter': [4.95, 0, -2.85],
  's:usaspending': [5.85, 0, -2.85],
  's:cancellations': [6.75, 0, -2.85],
  's:court': [7.65, 0, -2.85],
  's:payments': [8.55, 0, -2.85],
}
export const VENDORS: V3 = [12.1, -0.7, 1.7] // pedestal top centre
export const FUNDER: V3 = [12.1, -0.3, -1.7]

interface NodeSpot {
  anchor: V3
  floor: V3 // ground point under the node, for halos and ripples
}

const spots: Record<string, NodeSpot> = {}
for (const [id, s] of Object.entries(STATIONS)) spots[`r:${id}`] = { anchor: s.anchor, floor: [s.fig[0], 0.012, s.fig[2]] }
spots['a:purchasing'] = { anchor: [PURCHASING[0], 1.15, PURCHASING[2] - 0.2], floor: [PURCHASING[0], 0.012, PURCHASING[2]] }
spots['a:bookkeeping'] = { anchor: [BOOKKEEPING[0], 1.45, BOOKKEEPING[2]], floor: [BOOKKEEPING[0], 0.012, BOOKKEEPING[2]] }
spots['a:payment_report'] = { anchor: [PAYMENT_REPORT[0], 1.3, PAYMENT_REPORT[2]], floor: [PAYMENT_REPORT[0], 0.012, PAYMENT_REPORT[2]] }
spots['p:grant_manager'] = { anchor: [GM_SPOT[0], 1.0, GM_SPOT[2]], floor: [GM_DESK[0], 0.012, GM_DESK[2] - 0.3] }
for (const [gid, p] of Object.entries(RESERVOIRS)) spots[`g:${gid}`] = { anchor: [p[0], 1.15, p[2]], floor: [p[0], 0.012, p[2]] }
for (const [sid, p] of Object.entries(SOURCES)) spots[sid] = { anchor: [p[0], 0.55, p[2]], floor: [p[0], 0.012, p[2]] }
spots['v:vendors'] = { anchor: [VENDORS[0], VENDORS[1] + 0.85, VENDORS[2]], floor: [VENDORS[0], VENDORS[1] + 0.012, VENDORS[2]] }
spots['p:funder'] = { anchor: [FUNDER[0], FUNDER[1] + 1.2, FUNDER[2]], floor: [FUNDER[0], FUNDER[1] + 0.012, FUNDER[2]] }

const FALLBACK: NodeSpot = { anchor: [0, 3, 0], floor: [0, 0.012, 0] }

export const spot = (id: string): NodeSpot => spots[id] ?? FALLBACK
export const anchorOf = (id: string) => new Vector3(...spot(id).anchor)
export const floorOf = (id: string) => new Vector3(...spot(id).floor)

/** Where an answered request comes to rest: on the floor beside the researcher's stack. */
export function landOf(id: string, out = new Vector3()) {
  const s = STATIONS[id.slice(2)]
  if (!s) return out.set(...spot(id).anchor)
  return out.set(s.stack[0] + 0.42, PARCEL * 0.42, s.stack[2] + 0.18)
}

/**
 * Parcels held until money lands hover in front of their grant, toward the purchasing
 * desk: low and forward enough that, from the hero camera, they clear both the jar and the desk.
 */
export function parkOf(gid: string, i: number, out = new Vector3()) {
  const p = RESERVOIRS[gid] ?? RESERVOIRS.R01GM061721
  return out.set(p[0] - 2.8 - i * 0.72, 1.1, p[2] + 1.45)
}

export const isLab = (id: string) => id.startsWith('r:')

/** An arc whose height grows with distance; `u` is already eased. */
export function arcPoint(a: Vector3, b: Vector3, u: number, h: number, out: Vector3) {
  out.lerpVectors(a, b, u)
  out.y += 4 * h * u * (1 - u)
  return out
}
export function arcHeight(a: Vector3, b: Vector3, cross: boolean) {
  const d = Math.hypot(b.x - a.x, b.z - a.z)
  return cross ? Math.min(3.0, Math.max(0.9, 0.24 * d)) : Math.min(1.2, Math.max(0.3, 0.2 * d))
}

/** Plinth top under a point, or null over the gap. */
export function groundAt(x: number, z: number): number | null {
  if (Math.abs(z) > PLINTH_D / 2) return null
  if (Math.abs(x - LAB_X) <= PLINTH_W / 2 || Math.abs(x - OFFICE_X) <= PLINTH_W / 2) return 0
  return null
}

export interface Framing {
  pos: Vector3
  target: Vector3
  fov: number
  shift: [number, number] // fraction of the viewport to slide the picture (x right, y down)
}

// Both framings were fitted so the two plinths fill the screen and keep clear
// of the headline (top left) and the caption (bottom left).
export const HERO_WIDE: Framing = { pos: new Vector3(-17.27, 35.12, 27.0), target: new Vector3(1.2, 0, 0), fov: 22, shift: [0.145, -0.043] }
export const HERO_TALL: Framing = { pos: new Vector3(-48.85, 43.51, 22.4), target: new Vector3(1.2, 0, 0), fov: 26, shift: [0.051, 0.0] }
export const OPENING = { pos: new Vector3(-8.6, 2.4, 5.4), target: new Vector3(-6.6, 0.9, 0.2) }

export const heroFor = (aspect: number) => (aspect < 0.85 ? HERO_TALL : HERO_WIDE)
