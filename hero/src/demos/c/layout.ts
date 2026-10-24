// Geography of the money terrain. One source of truth for where things are:
// the terrain mesh, the places on it, and every packet route read from here.
//
// Axes: x runs west → east, z runs north (−) → south (+), y is up. The lab
// settlement sits on the southern plain, the agents on the ridge in the
// middle, the grant landforms behind it, the outside world on the horizon.

import * as THREE from 'three'
import { R01, R21 } from '../../feed'

/** Dollars per world unit of height on a grant landform (one contour = $25,000). */
export const UNIT = 50_000
export const CONTOUR = 0.5
/** Ground level under the grant landforms. Money elevation = y − MESA_BASE. */
export const MESA_BASE = 1.25

export interface MesaSpec {
  id: string
  cx: number
  cz: number
  R: number
  seed: number
}

export const MESAS: MesaSpec[] = [
  { id: R01, cx: -8.8, cz: -10.6, R: 5.5, seed: 1.3 },
  { id: R21, cx: 9.0, cz: -10.2, R: 4.7, seed: 4.1 },
]
export const mesaFor = (grantId: string) => MESAS.find(m => m.id === grantId)

// ── Noise (CPU only; the shader has its own for texture) ───────────────────

const fract = (v: number) => v - Math.floor(v)
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453)
export const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t

function vnoise(x: number, y: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

function fbm(x: number, y: number) {
  let v = 0
  let a = 0.5
  for (let i = 0; i < 4; i++) {
    v += a * vnoise(x, y)
    x = x * 2.03 + 1.7
    y = y * 2.03 + 9.2
    a *= 0.5
  }
  return v
}

function ridged(x: number, y: number) {
  let v = 0
  let a = 0.55
  for (let i = 0; i < 4; i++) {
    v += a * (1 - Math.abs(vnoise(x, y) * 2 - 1)) ** 2
    x = x * 2.1 + 3.3
    y = y * 2.1 + 7.1
    a *= 0.5
  }
  return v
}

export const ridgeZ = (x: number) => -1.5 + 0.55 * Math.sin(x * 0.33 + 0.4)

/** Everything except the grant landforms. */
export function baseHeight(x: number, z: number) {
  let flat = 0
  for (const m of MESAS) flat = Math.max(flat, 1 - smoothstep(1.15, 1.75, Math.hypot(x - m.cx, z - m.cz) / m.R))
  const rise = 1.1 * smoothstep(5, -7, z)
  const plain = 0.15 + 0.24 * (fbm(x * 0.13, z * 0.13) - 0.45)
  const saddle = 1 - 0.45 * Math.exp(-((x - 3) ** 2) / 2.2)
  const ridgeAmp = (2.0 + 0.9 * fbm(x * 0.21 + 3.1, 2.7)) * saddle * (1 - smoothstep(12, 17, Math.abs(x)))
  const ridge = ridgeAmp * Math.exp(-((z - ridgeZ(x)) ** 2) / (2 * 1.35 ** 2))
  const spur = 2.5 * Math.exp(-(x * x) / (2 * 1.6 * 1.6)) * smoothstep(7.6, 1.2, z) * smoothstep(-3.2, 0.8, z)
  const far = smoothstep(-17, -28, z) * (1.6 + 4.2 * ridged(x * 0.085 + 5, z * 0.085))
  const side = smoothstep(16, 26, Math.abs(x)) * (1.2 + 2.6 * ridged(x * 0.1, z * 0.1 + 2)) * smoothstep(14, -4, z)
  const h = plain + rise + ridge + spur + far + side
  return mix(h, MESA_BASE, flat)
}

/** A grant landform's shape, 0 on the plain … 1 on its plateau top. */
export function mesaShape(m: MesaSpec, x: number, z: number) {
  const dx = x - m.cx
  const dz = z - m.cz
  const r = Math.hypot(dx, dz)
  const a = Math.atan2(dz, dx)
  const wob = 1 + 0.08 * Math.sin(a * 3 + m.seed) + 0.05 * Math.sin(a * 7 + m.seed * 2.3) + 0.08 * (fbm(dx * 0.32 + m.seed, dz * 0.32) - 0.45)
  const rn = r / (m.R * wob)
  const p = 1 - smoothstep(0.56, 1.02, rn)
  const t = p * 3
  const k = Math.floor(t)
  const terr = (k + smoothstep(0.3, 1, t - k)) / 3
  const talus = 0.045 * (1 - smoothstep(0.95, 1.45, rn))
  return Math.min(1, 0.3 * p + 0.7 * terr) + talus * (1 - p)
}

/** Live mesa heights in world units, by grant index. Mutated by the terrain each frame. */
export const mesaHeights = [314_695 / UNIT, 132_800 / UNIT]

export function terrainHeight(x: number, z: number) {
  let h = baseHeight(x, z)
  MESAS.forEach((m, i) => (h += mesaHeights[i] * mesaShape(m, x, z)))
  return h
}

// ── Places ────────────────────────────────────────────────────────────────

const at = (x: number, z: number, lift = 0) => new THREE.Vector3(x, terrainHeight(x, z) + lift, z)

export const HOUSES: { id: string; x: number; z: number; variant: number }[] = [
  { id: 'ortiz', x: -6.8, z: 10.2, variant: 0 },
  { id: 'okafor', x: -3.5, z: 11.3, variant: 1 },
  { id: 'raman', x: 0, z: 11.8, variant: 2 },
  { id: 'silva', x: 3.5, z: 11.3, variant: 3 },
  { id: 'park', x: 6.8, z: 10.2, variant: 4 },
]

export const AGENT_SPOTS: Record<string, { x: number; z: number; scale: number }> = {
  purchasing: { x: 0, z: 0.9, scale: 1.25 },
  bookkeeping: { x: -5.8, z: ridgeZ(-5.8), scale: 1 },
  payment_report: { x: 6.4, z: ridgeZ(6.4), scale: 1 },
}
export const LODGE = { x: 3.0, z: ridgeZ(3.0) + 0.15 }

export const STATIONS: Record<string, { x: number; z: number }> = {
  's:reporter': { x: -25, z: -25 },
  's:usaspending': { x: -17.5, z: -29.5 },
  's:cancellations': { x: -10, z: -32.5 },
  's:court': { x: -2.2, z: -33.5 },
  's:payments': { x: 5.6, z: -33 },
  'p:funder': { x: 19, z: -29 },
}
export const DEPOT = { x: 12.2, z: 4.6 }

/** The switchback up the spur to the purchasing observatory; rule markers stand on its corners. */
export const SWITCHBACK: [number, number][] = [
  [0, 7.2],
  [1.9, 6.0],
  [-1.7, 4.9],
  [1.5, 3.85],
  [-1.25, 2.9],
  [0.95, 2.05],
  [-0.45, 1.5],
  [0, 1.0],
]
export const trailhead = () => at(SWITCHBACK[0][0], SWITCHBACK[0][1], 0.2)
export const markerSpot = (i: number) => at(SWITCHBACK[i + 1][0], SWITCHBACK[i + 1][1])

export const housePos = (id: string) => {
  const h = HOUSES.find(x => x.id === id)
  return h ? at(h.x, h.z) : undefined
}
const houseDoor = (id: string) => {
  const h = HOUSES.find(x => x.id === id)!
  return at(h.x, h.z - 0.75, 0.35)
}

/** Where a packet starts or ends for a node id. Unknown ids get a spot in the sky. */
export function nodePos(id: string): THREE.Vector3 {
  if (id.startsWith('r:')) {
    const p = housePos(id.slice(2))
    if (p) return p.add(new THREE.Vector3(0, 1.0, 0))
  }
  if (id.startsWith('a:')) {
    const s = AGENT_SPOTS[id.slice(2)]
    if (s) return at(s.x, s.z, 1.5 * s.scale)
  }
  if (id === 'p:grant_manager') return at(LODGE.x, LODGE.z, 1.1)
  if (id.startsWith('g:')) {
    const i = MESAS.findIndex(m => m.id === id.slice(2))
    if (i >= 0) return new THREE.Vector3(MESAS[i].cx, MESA_BASE + mesaHeights[i] + 0.35, MESAS[i].cz)
  }
  const st = STATIONS[id]
  if (st) return at(st.x, st.z, id === 'p:funder' ? 2.2 : 2.7)
  if (id === 'v:vendors') return at(DEPOT.x, DEPOT.z, 1.1)
  return new THREE.Vector3(0, 12, -8)
}

/** Ground point under a node, for impact rings. */
export function nodeGround(id: string) {
  const p = nodePos(id)
  return new THREE.Vector3(p.x, terrainHeight(p.x, p.z) + 0.06, p.z)
}

// ── Routes ────────────────────────────────────────────────────────────────

/** Lift each point so a trail never cuts through the ground. */
function clear(points: THREE.Vector3[], margin: number) {
  for (const p of points) p.y = Math.max(p.y, terrainHeight(p.x, p.z) + margin)
  return points
}

/** A lifted arc between two points, sampled densely and kept above ground. */
export function arc(a: THREE.Vector3, b: THREE.Vector3, lift = 0.22, n = 40) {
  const d = a.distanceTo(b)
  const top = Math.max(a.y, b.y) + 0.6 + d * lift
  const mid = a.clone().lerp(b, 0.5)
  mid.y = top
  const q = new THREE.QuadraticBezierCurve3(a, mid, b)
  return clear(q.getPoints(n), 0.35)
}

/** Settlement → road → switchback → observatory. */
export function climb(researcherId: string) {
  const door = houseDoor(researcherId)
  const th = trailhead()
  const join = new THREE.Vector3(door.x * 0.45, 0, (door.z + th.z) / 2 + 0.6)
  join.y = terrainHeight(join.x, join.z) + 0.25
  const pts = [door, join, th, ...SWITCHBACK.slice(1, -1).map(([x, z]) => at(x, z, 0.32)), nodePos('a:purchasing')]
  return dense(pts, 0.18)
}

function dense(pts: THREE.Vector3[], margin: number, n = 90) {
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  return clear(c.getPoints(n), margin)
}

/** A verdict's way home: the form of the route is part of the answer. */
export function descent(researcherId: string, outcome: string | undefined, side: number) {
  const up = climb(researcherId)
  if (outcome === 'refine') {
    // Bends out and around: the request takes a detour before it comes home.
    const obs = nodePos('a:purchasing')
    const door = houseDoor(researcherId)
    const pts = [
      obs,
      new THREE.Vector3(side * 3.4, obs.y + 1.6, 0.4),
      new THREE.Vector3(side * 6.2, 3.4, 3.2),
      new THREE.Vector3(side * 5.0, 1.6, 7.0),
      new THREE.Vector3(door.x * 0.6 + side * 1.2, 0.9, door.z - 2.2),
      door,
    ]
    return dense(pts, 0.4, 110)
  }
  if (outcome === 'reject') {
    // Falls off the front of the spur in hops, like a stone kicked loose.
    const obs = nodePos('a:purchasing')
    const door = houseDoor(researcherId)
    const out: THREE.Vector3[] = []
    const hops = 6
    for (let i = 0; i <= 140; i++) {
      const t = i / 140
      const x = mix(obs.x, door.x, t)
      const z = mix(obs.z, door.z, t)
      const g = terrainHeight(x, z) + 0.12
      const phase = fract(t * hops)
      const amp = (1 - t) * 1.6 + 0.25
      const floor = t < 1 / hops ? mix(obs.y, g, phase) : g
      out.push(new THREE.Vector3(x, Math.max(g, floor + Math.sin(Math.PI * phase) * amp), z))
    }
    return out
  }
  return up.slice().reverse()
}

/** Side a reroute bends toward: the grant it was charged to. */
export const sideOf = (grantId?: string) => {
  const m = grantId ? mesaFor(grantId) : undefined
  return m ? Math.sign(m.cx) : -1
}

/** Bookkeeping observatory → down off the ridge → across the valley → up the landform to its plateau. */
export function grantPath(grantIndex: number) {
  const m = MESAS[grantIndex]
  const from = nodePos('a:bookkeeping')
  const dir = new THREE.Vector2(from.x - m.cx, from.z - m.cz).normalize()
  const perp = new THREE.Vector2(-dir.y, dir.x)
  const rimAt = (f: number, off: number) => {
    const x = m.cx + dir.x * m.R * f + perp.x * off
    const z = m.cz + dir.y * m.R * f + perp.y * off
    return new THREE.Vector3(x, terrainHeight(x, z) + 0.1, z)
  }
  const valley = from.clone().lerp(rimAt(1.2, 0), 0.5)
  valley.y = terrainHeight(valley.x, valley.z) + 0.3
  const pts = [
    from,
    valley,
    rimAt(1.25, 0.4),
    rimAt(1.02, -0.9),
    rimAt(0.88, 0.8),
    rimAt(0.72, -0.6),
    rimAt(0.55, 0.3),
    new THREE.Vector3(m.cx, MESA_BASE + mesaHeights[grantIndex] + 0.1, m.cz),
  ]
  return dense(pts, 0.08, 160)
}

/** Where frost starts on a landform: the rim facing the bookkeeping observatory. */
export function frostSeed(grantIndex: number) {
  const m = MESAS[grantIndex]
  const from = nodePos('a:bookkeeping')
  const dir = new THREE.Vector2(from.x - m.cx, from.z - m.cz).normalize()
  return new THREE.Vector2(m.cx + dir.x * m.R * 0.9, m.cz + dir.y * m.R * 0.9)
}

// ── Camera ────────────────────────────────────────────────────────────────

export const HERO = { pos: new THREE.Vector3(-1, 19, 37.5), target: new THREE.Vector3(0, 2.8, 1.6) }
export const INTRO = { pos: new THREE.Vector3(4.5, 4.2, 19.5), target: new THREE.Vector3(0, 0.6, 10.5) }
export const BOUNDS = { minX: -18, maxX: 18, minZ: -18, maxZ: 15, minY: 0, maxY: 7 }
