// Where everything sits in the section model, and the pneumatic tube network
// between rooms. Units are model metres: one floor is 3.2 tall, the cut face
// is at z = +2.4, the back wall at z = -2.4. Every feed node id maps to a
// tube terminal; an unknown id falls back to the central exchange.

import * as THREE from 'three'
import { R01, R21 } from '../../feed'

export const FH = 3.2
export const ZB = -2.4
export const ZF = 2.4
export const TZ = -1.45 // tubes run along the back of each room
export const LINE_DY = 2.35 // tube line height above its floor
export const ROOF = 9.6
export const PULL = 3.8 // how far a room slides out of the model

export type Wing = 'lab' | 'office'
export type RoomKind = 'supply' | 'micro' | 'purify' | 'office' | 'confocal' | 'gm' | 'dispatch' | 'rules' | 'records' | 'vault'

export interface Room {
  node: string
  num: string
  name: string
  kind: RoomKind
  wing: Wing
  x0: number
  x1: number
  y0: number
}

export const ROOMS: Room[] = [
  { node: 'r:ortiz', num: '2.01', name: 'PI office', kind: 'office', wing: 'lab', x0: -14.2, x1: -7.9, y0: 6.4 },
  { node: 'r:silva', num: '2.02', name: 'Confocal room', kind: 'confocal', wing: 'lab', x0: -7.9, x1: -1.6, y0: 6.4 },
  { node: 'r:raman', num: '1.01', name: 'Microbiology', kind: 'micro', wing: 'lab', x0: -14.2, x1: -7.9, y0: 3.2 },
  { node: 'r:okafor', num: '1.02', name: 'Protein purification', kind: 'purify', wing: 'lab', x0: -7.9, x1: -1.6, y0: 3.2 },
  { node: 'r:park', num: '0.01', name: 'Supply room, −80 °C freezer', kind: 'supply', wing: 'lab', x0: -14.2, x1: -1.6, y0: 0 },
  { node: 'a:bookkeeping', num: '2.11', name: 'Bookkeeping: fund tracker', kind: 'records', wing: 'office', x0: 1.6, x1: 14.2, y0: 6.4 },
  { node: 'a:purchasing', num: '1.11', name: 'Purchasing: six spending rules', kind: 'rules', wing: 'office', x0: 1.6, x1: 14.2, y0: 3.2 },
  { node: 'p:grant_manager', num: '0.11', name: 'Grant manager', kind: 'gm', wing: 'office', x0: 1.6, x1: 7.6, y0: 0 },
  { node: 'a:payment_report', num: '0.12', name: 'Payment & report: dispatch', kind: 'dispatch', wing: 'office', x0: 7.6, x1: 14.2, y0: 0 },
  { node: `g:${R01}`, num: 'B.11', name: `Vault ${R01}`, kind: 'vault', wing: 'office', x0: 1.6, x1: 7.9, y0: -3.2 },
  { node: `g:${R21}`, num: 'B.12', name: `Vault ${R21}`, kind: 'vault', wing: 'office', x0: 7.9, x1: 14.2, y0: -3.2 },
]

export const roomOf = (node: string) => ROOMS.find(r => r.node === node)
export const roomMid = (r: Room) => new THREE.Vector3((r.x0 + r.x1) / 2, r.y0 + FH / 2, 0)

export const ANTENNAS = [
  { node: 's:reporter', x: 4.3, h: 2.3, top: 'dish' },
  { node: 's:usaspending', x: 6.5, h: 1.8, top: 'dish' },
  { node: 's:cancellations', x: 8.7, h: 2.6, top: 'yagi' },
  { node: 's:court', x: 10.9, h: 2.0, top: 'mast' },
  { node: 's:payments', x: 13.1, h: 2.2, top: 'dish' },
] as const
export const antennaTip = (a: (typeof ANTENNAS)[number]) => ROOF + 0.3 + a.h

export const TRUCK = { x0: -21.6, x1: -16.2 }
export const FUNDER = { x0: 16.6, x1: 20.8 }

// ── The rule room ────────────────────────────────────────────────────────

export const RULE_Y = 3.2 + 1.2
export const TRACK_Z = -0.5
export const INTAKE_X = 2.5
export const OUTLET_X = 13.5
export const STATION_X = [3.95, 5.6, 7.25, 8.9, 10.55, 12.2]
export const STATION_NAMES = [
  'Grant active, not frozen',
  'Not in the last 90 days',
  'Truly available money',
  'Category allowed',
  'Under the $5,000 card limit',
  'Shared cost split',
]

/** Which of the six stations a feed rule belongs to. */
export function stationOf(rule: string): number {
  if (rule.startsWith('Grant')) return 0
  if (rule.startsWith('Not in')) return 1
  if (rule.startsWith('Enough')) return 2
  if (rule.startsWith('Category')) return 3
  if (rule.startsWith('Under')) return 4
  return 5
}

// ── Tube terminals ───────────────────────────────────────────────────────

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const key = (wing: Wing, y0: number) => `${wing}:${y0}`
const lineY = (k: string) => Number(k.split(':')[1]) + LINE_DY

interface Port {
  line: string
  path: THREE.Vector3[] // terminal first, last point lies on the line
}

const drop = (wing: Wing, x: number, y0: number, h = 1.2): Port => ({ line: key(wing, y0), path: [V(x, y0 + h, TZ), V(x, y0 + LINE_DY, TZ)] })

const PORTS: Record<string, { in: Port; out: Port }> = {}
const both = (id: string, p: Port) => (PORTS[id] = { in: p, out: p })

both('r:park', drop('lab', -5.6, 0))
both('r:raman', drop('lab', -8.7, 3.2))
both('r:okafor', drop('lab', -2.45, 3.2))
both('r:ortiz', drop('lab', -8.7, 6.4))
both('r:silva', drop('lab', -2.45, 6.4))
both('p:grant_manager', drop('office', 2.7, 0, 1.12))
both('a:payment_report', drop('office', 8.5, 0))
both('a:bookkeeping', drop('office', 2.6, 6.4))
both(`g:${R01}`, drop('office', 6.95, -3.2, 1.15))
both(`g:${R21}`, drop('office', 13.25, -3.2, 1.15))
PORTS['a:purchasing'] = {
  in: { line: key('office', 3.2), path: [V(INTAKE_X, RULE_Y, TRACK_Z), V(INTAKE_X, RULE_Y, TZ), V(INTAKE_X, 3.2 + LINE_DY, TZ)] },
  out: { line: key('office', 3.2), path: [V(OUTLET_X, RULE_Y, TRACK_Z), V(OUTLET_X, RULE_Y, TZ), V(OUTLET_X, 3.2 + LINE_DY, TZ)] },
}
for (const a of ANTENNAS) both(a.node, { line: key('office', 6.4), path: [V(a.x, antennaTip(a) - 0.2, TZ), V(a.x, 6.4 + LINE_DY, TZ)] })
both('p:funder', { line: key('office', 0), path: [V(18.3, 1.2, TZ), V(18.3, LINE_DY, TZ)] })
both('v:vendors', { line: key('lab', 0), path: [V(-17.6, 1.7, TZ), V(-17.6, LINE_DY, TZ)] })

const CORE: Port = { line: key('office', 3.2), path: [V(0, 3.2 + LINE_DY, TZ)] }
const portOf = (id: string, dir: 'in' | 'out') => PORTS[id]?.[dir] ?? CORE

/** Where a capsule comes to rest at a node. */
export const terminalOf = (id: string, dir: 'in' | 'out' = 'in') => portOf(id, dir).path[0]

export class Route {
  pts: THREE.Vector3[]
  cum: number[] = [0]
  len = 0
  constructor(pts: THREE.Vector3[]) {
    this.pts = pts.filter((p, i) => i === 0 || p.distanceToSquared(pts[i - 1]) > 1e-6)
    for (let i = 1; i < this.pts.length; i++) {
      this.len += this.pts[i].distanceTo(this.pts[i - 1])
      this.cum.push(this.len)
    }
  }
  /** Position and heading at fraction t of the way along. */
  at(t: number, pos: THREE.Vector3, dir: THREE.Vector3) {
    const n = this.pts.length
    if (n === 1 || this.len === 0) {
      pos.copy(this.pts[0])
      dir.set(0, 1, 0)
      return
    }
    const d = Math.min(Math.max(t, 0), 1) * this.len
    let i = 1
    while (i < n - 1 && this.cum[i] < d) i++
    const a = this.pts[i - 1]
    const b = this.pts[i]
    const seg = this.cum[i] - this.cum[i - 1] || 1
    pos.copy(a).lerp(b, (d - this.cum[i - 1]) / seg)
    dir.copy(b).sub(a).normalize()
  }
}

const cache = new Map<string, Route>()

/** The tube route between two nodes: up the room's drop, along its floor line, through the exchange riser. */
export function route(from: string, to: string): Route {
  const k = `${from}>${to}`
  let r = cache.get(k)
  if (!r) {
    const a = portOf(from, 'out')
    const b = portOf(to, 'in')
    const pts = [...a.path]
    if (a.line !== b.line) pts.push(V(0, lineY(a.line), TZ), V(0, lineY(b.line), TZ))
    pts.push(...[...b.path].reverse())
    r = new Route(pts)
    cache.set(k, r)
  }
  return r
}

/** Every straight run of tube in the building, for drawing the network once. */
export function tubeRuns(): [THREE.Vector3, THREE.Vector3][] {
  const runs: [THREE.Vector3, THREE.Vector3][] = []
  const ext = new Map<string, [number, number]>()
  const ports = Object.values(PORTS).flatMap(p => (p.in === p.out ? [p.in] : [p.in, p.out]))
  for (const p of ports) {
    for (let i = 0; i < p.path.length - 1; i++) runs.push([p.path[i], p.path[i + 1]])
    const end = p.path[p.path.length - 1]
    const e = ext.get(p.line) ?? [0, 0]
    ext.set(p.line, [Math.min(e[0], end.x), Math.max(e[1], end.x)])
  }
  let lo = Infinity
  let hi = -Infinity
  for (const [k, [a, b]] of ext) {
    const y = lineY(k)
    runs.push([V(a, y, TZ), V(b, y, TZ)])
    lo = Math.min(lo, y)
    hi = Math.max(hi, y)
  }
  runs.push([V(0, lo, TZ), V(0, hi, TZ)])
  return runs
}

/** Where each floor line meets the riser (the exchange's diverters). */
export function junctions(): THREE.Vector3[] {
  const ys = new Set<number>()
  for (const p of Object.values(PORTS)) ys.add(lineY(p.in.line))
  return [...ys].map(y => V(0, y, TZ))
}

// ── Lab members' spots for each task (x, z, facing) ──────────────────────

export const SPOTS: Record<string, [number, number, number][]> = {
  // order matches the feed's task list for each researcher
  ortiz: [
    [-10.3, -0.05, Math.PI],
    [-9.7, -0.05, Math.PI],
    [-11.9, -1.45, Math.PI],
    [-13.3, -0.5, -Math.PI / 2],
  ],
  okafor: [
    [-5.75, -0.85, Math.PI],
    [-4.35, -0.85, Math.PI],
    [-6.7, -0.85, Math.PI],
    [-3.55, -0.75, Math.PI],
  ],
  raman: [
    [-12.9, -0.45, Math.PI],
    [-11.2, -0.9, Math.PI],
    [-10.1, -0.9, Math.PI],
    [-9.25, -0.25, Math.PI * 0.8],
  ],
  silva: [
    [-3.75, -0.35, Math.PI],
    [-5.85, -0.35, Math.PI],
    [-3.2, -0.35, Math.PI],
    [-4.0, -0.35, Math.PI],
  ],
  park: [
    [-11.8, -0.95, Math.PI],
    [-8.8, -0.55, Math.PI],
    [-13.4, 0.3, -Math.PI / 2],
    [-10.4, -0.95, Math.PI],
  ],
}
