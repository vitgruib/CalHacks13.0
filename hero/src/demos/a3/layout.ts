// Where everything sits. One world unit is roughly a metre of lab floor.
// The lab plinth spans x -10.1..-1.1, z -3.4..3.4 with its top at y = 0.
// The finance network is a round table centred at TABLE: the shared record
// in the middle, the three agents and the grant manager around it, the two
// grants inside the ring, the sources as posts on the rim, and vendors and
// the funder on small pedestals outside.

import { Vector3 } from 'three'

export type V3 = [number, number, number]

export const PAL = {
  void: '#C7CCD2',
  voidHi: '#E6E8EB',
  ground: '#DCDFE3',
  labBody: '#D6CDBF',
  labTop: '#E8E2D8',
  floor: '#E3DDD2',
  wall: '#E9E4DB',
  officeBody: '#252D37',
  officeTop: '#2E3742',
  tableTop: '#38424E',
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

/** Each grant's own colour: the band on its vessel and the tag on everything charged to it. */
export const GRANT_HUE: Record<string, string> = {
  R01GM061721: '#C66B4E',
  R21AI182745: '#7D5BA6',
}
export const otherGrant = (gid: string) => (gid === 'R01GM061721' ? 'R21AI182745' : 'R01GM061721')

export const LAB_X = -5.6
export const LAB_W = 9
export const LAB_D = 6.8
export const LAB_X0 = LAB_X - LAB_W / 2
export const LAB_X1 = LAB_X + LAB_W / 2

// ── The round table ──────────────────────────────────────────────────────

export const TABLE: V3 = [4.4, 0, 0]
export const TABLE_R = 3.9
/** Where every packet passes: just above the shared record. */
export const RECORD_H = 0.82
export const HUB = new Vector3(TABLE[0], RECORD_H + 0.12, TABLE[2])

/** A point on the table at angle `deg` (0 = east, 90 = toward the camera) and radius `r`. */
export const polar = (deg: number, r: number, y = 0): V3 => {
  const a = (deg * Math.PI) / 180
  return [TABLE[0] + r * Math.cos(a), y, TABLE[2] + r * Math.sin(a)]
}

export const SEAT_R = 2.55
export const NODE_DEG: Record<string, number> = {
  'a:purchasing': 180,
  'a:bookkeeping': 90,
  'a:payment_report': 0,
  'p:grant_manager': 270,
  'g:R01GM061721': 135,
  'g:R21AI182745': 45,
  's:reporter': 212,
  's:usaspending': 238,
  's:cancellations': 264,
  's:court': 290,
  's:payments': 316,
  'v:vendors': 22,
  'p:funder': -24,
}
export const GRANT_R = 1.72
export const SOURCE_R = 3.62
export const OUTSIDE_R = 5.65

export const PURCHASING = polar(180, SEAT_R)
export const BOOKKEEPING = polar(90, SEAT_R)
export const PAYMENT_REPORT = polar(0, SEAT_R)
export const GM_POS = polar(270, 2.78) // the grant manager stands here, facing the record
export const GM_DESK = polar(270, 2.2)
export const RESERVOIRS: Record<string, V3> = {
  R01GM061721: polar(135, GRANT_R),
  R21AI182745: polar(45, GRANT_R),
}
export const SOURCES: Record<string, V3> = {
  's:reporter': polar(212, SOURCE_R),
  's:usaspending': polar(238, SOURCE_R),
  's:cancellations': polar(264, SOURCE_R),
  's:court': polar(290, SOURCE_R),
  's:payments': polar(316, SOURCE_R),
}
export const VENDORS: V3 = polar(22, OUTSIDE_R, -0.55) // pedestal top centre
export const FUNDER: V3 = polar(-24, OUTSIDE_R, -0.3)

/** Requested things are shown this big while they travel (about 50 px on a 1440×900 hero). */
export const ITEM = 0.92
export const POD_H = 0.78
/** Where a request rests while the purchasing agent checks it: a tray on the agent's inner side. */
export const DESK_SPOT: V3 = polar(180, SEAT_R - 0.86, 0.18 + ITEM * 0.36)
export const GM_SPOT: V3 = [GM_DESK[0], 0.72 + ITEM * 0.34, GM_DESK[2] + 0.08]

// ── Node anchors, for packets, halos and the hover card ─────────────────

interface NodeSpot {
  anchor: V3 // where packets leave from and arrive at
  floor: V3 // ground point under the node, for halos
  top: number // height of the node's top, for the hover card
}

const spots: Record<string, NodeSpot> = {}
const node = (id: string, p: V3, anchorY: number, top: number) => (spots[id] = { anchor: [p[0], anchorY, p[2]], floor: [p[0], p[1] + 0.012, p[2]], top })
node('a:purchasing', PURCHASING, POD_H * 0.62, POD_H + 0.35)
node('a:bookkeeping', BOOKKEEPING, POD_H * 0.62, POD_H + 0.35)
node('a:payment_report', PAYMENT_REPORT, POD_H * 0.62, POD_H + 0.35)
node('p:grant_manager', GM_POS, 1.25, 1.85)
for (const [gid, p] of Object.entries(RESERVOIRS)) node(`g:${gid}`, p, 0.95, 1.5)
for (const [sid, p] of Object.entries(SOURCES)) node(sid, p, 0.62, 0.75)
node('v:vendors', VENDORS, VENDORS[1] + 0.55, VENDORS[1] + 1.1)
node('p:funder', FUNDER, FUNDER[1] + 0.9, FUNDER[1] + 1.5)

const FALLBACK: NodeSpot = { anchor: [0, 3, 0], floor: [0, 0.012, 0], top: 3 }

export const spot = (id: string): NodeSpot => spots[id] ?? FALLBACK
export const anchorOf = (id: string) => new Vector3(...spot(id).anchor)
export const floorOf = (id: string) => new Vector3(...spot(id).floor)

export const isLab = (id: string) => id.startsWith('r:')

/** Parcels held until money lands wait beside their frozen grant, on the table's outer ring. */
export function parkOf(gid: string, i: number, out = new Vector3()) {
  const s = gid === 'R01GM061721' ? 1 : -1
  const deg = (NODE_DEG[`g:${gid}`] ?? 135) + s * 18 - s * i * 22
  const [x, , z] = polar(deg, GRANT_R + 1.38) // clear of the bell jar and the next pod
  return out.set(x, ITEM * 0.36 + 0.02, z)
}

/** Plinth or table top under a point, or null over the gap. */
export function groundAt(x: number, z: number): number | null {
  if (Math.abs(z) <= LAB_D / 2 && x >= LAB_X0 && x <= LAB_X1) return 0
  if (Math.hypot(x - TABLE[0], z - TABLE[2]) <= TABLE_R) return 0
  return null
}

// ── Framing ──────────────────────────────────────────────────────────────

export interface Framing {
  pos: Vector3
  target: Vector3
  fov: number
}

/** Everything the hero shot must hold. */
const BOUNDS: Vector3[] = (() => {
  const out: Vector3[] = []
  for (const x of [LAB_X0, LAB_X1]) for (const z of [-LAB_D / 2, LAB_D / 2]) for (const y of [-1.1, 0.4]) out.push(new Vector3(x, y, z))
  for (const x of [LAB_X0 + 0.2, LAB_X1 - 0.2]) out.push(new Vector3(x, 2.3, -LAB_D / 2 + 0.1))
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    for (const y of [-1.1, 0.5]) out.push(new Vector3(TABLE[0] + TABLE_R * Math.cos(a), y, TABLE[2] + TABLE_R * Math.sin(a)))
  }
  for (const p of [VENDORS, FUNDER]) for (const dx of [-1, 1]) for (const dz of [-1, 1]) out.push(new Vector3(p[0] + dx * 0.95, p[1] - 0.65, p[2] + dz * 0.95), new Vector3(p[0] + dx * 0.6, p[1] + 1.1, p[2] + dz * 0.6))
  return out
})()

const fw = new Vector3()
const fr = new Vector3()
const fu = new Vector3()
const fd = new Vector3()
const UPV = new Vector3(0, 1, 0)

/** Places the camera along `dir` so every bound fits the frustum with a margin, centred. */
function fit(dir: Vector3, target: Vector3, fov: number, aspect: number, margin: number): Framing {
  const ty = Math.tan(((fov / 2) * Math.PI) / 180) * (1 - margin)
  const tx = ty * aspect
  const t = target.clone()
  fw.copy(dir).normalize().negate()
  fr.crossVectors(fw, UPV).normalize()
  fu.crossVectors(fr, fw).normalize()
  let dist = 40
  const pos = new Vector3()
  for (let pass = 0; pass < 3; pass++) {
    let lo = 4, hi = 400
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      const cam = t.clone().addScaledVector(dir, mid)
      let ok = true
      for (const p of BOUNDS) {
        fd.subVectors(p, cam)
        const z = fd.dot(fw)
        if (z <= 0.1 || Math.abs(fd.dot(fr)) / z > tx || Math.abs(fd.dot(fu)) / z > ty) {
          ok = false
          break
        }
      }
      if (ok) hi = mid
      else lo = mid
    }
    dist = hi
    // Re-centre: shift the target by the bounds' mean offset on screen.
    const cam = t.clone().addScaledVector(dir, dist)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of BOUNDS) {
      fd.subVectors(p, cam)
      const z = fd.dot(fw)
      const x = fd.dot(fr) / z, y = fd.dot(fu) / z
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    pos.copy(cam).addScaledVector(fr, cx * dist).addScaledVector(fu, cy * dist)
    // The orbit target is where the view ray meets the floor.
    t.copy(pos).addScaledVector(dir, -pos.y / dir.y)
  }
  return { pos, target: t, fov }
}

const WIDE_DIR = new Vector3(-0.36, 0.76, 0.6).normalize()
const TALL_DIR = new Vector3(-0.74, 0.6, 0.3).normalize()
const cache = new Map<string, Framing>()

/** The hero framing for a stage of this aspect: wide holds both side by side; a phone looks down the lab toward the table. */
export function heroFor(aspect: number): Framing {
  const tall = aspect < 0.85
  const key = `${tall ? 't' : 'w'}${aspect.toFixed(2)}`
  let f = cache.get(key)
  if (!f) {
    f = tall ? fit(TALL_DIR, new Vector3(-1, 0, 0), 30, aspect, 0.03) : fit(WIDE_DIR, new Vector3(0, 0, 0), 24, aspect, 0.04)
    cache.set(key, f)
  }
  return f
}
export const isTall = (f: Framing) => f.fov === 30

export const OPENING = { pos: new Vector3(-9.2, 2.6, 6.2), target: new Vector3(-6.2, 0.9, 0.4) }
