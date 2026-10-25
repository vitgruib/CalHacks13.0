// The finance network's lines: one curve per edge, shared by the drawing
// (Office) and by everything that travels them (Flow). Every lab member's
// line enters the network at one intake, so r:<id> maps to it here.

import { Vector3 } from 'three'
import { EDGES } from '../../feed'
import type { PacketKind } from '../../feed'
import { BOW, NODE_AT } from './layout'

export const nodeOf = (id: string) => (id.startsWith('r:') ? 'intake' : id)

/** How high on a node its lines attach. */
export function attachY(id: string) {
  const y = NODE_AT[id]?.[1] ?? 0
  if (id === 'intake') return y + 0.42
  if (id.startsWith('a:')) return y + 0.62
  if (id === 'p:grant_manager') return y + 0.95
  if (id.startsWith('g:')) return y + 0.4
  if (id.startsWith('s:')) return y + 0.95
  return y + 0.75
}

export interface NetEdge {
  key: string
  from: string
  to: string
  kinds: PacketKind[]
  a: Vector3
  b: Vector3
  c: Vector3
}

function makeEdge(from: string, to: string, kinds: PacketKind[]): NetEdge {
  const pa = NODE_AT[from]
  const pb = NODE_AT[to]
  const a = new Vector3(pa[0], attachY(from), pa[2])
  const b = new Vector3(pb[0], attachY(to), pb[2])
  const len = Math.hypot(b.x - a.x, b.z - a.z)
  const bow = BOW[`${from}>${to}`] ?? 0
  const c = new Vector3().lerpVectors(a, b, 0.5)
  c.x += (-(b.z - a.z) / len) * bow
  c.z += ((b.x - a.x) / len) * bow
  c.y = Math.max(a.y, b.y) + 0.22 + 0.07 * len
  return { key: `${from}>${to}`, from, to, kinds, a, b, c }
}

export const NET_EDGES: NetEdge[] = []
{
  const seen = new Set<string>()
  for (const e of EDGES) {
    const from = nodeOf(e.from)
    const to = nodeOf(e.to)
    const key = `${from}>${to}`
    if (seen.has(key) || !NODE_AT[from] || !NODE_AT[to]) continue
    seen.add(key)
    NET_EDGES.push(makeEdge(from, to, e.kinds))
  }
}
const BY_KEY = new Map(NET_EDGES.map((e, i) => [e.key, i]))

/** The edge a packet from → to travels, and whether it runs it backwards. */
export function edgeOf(from: string, to: string): { i: number; back: boolean } | null {
  const f = nodeOf(from)
  const t = nodeOf(to)
  const i = BY_KEY.get(`${f}>${t}`)
  if (i !== undefined) return { i, back: false }
  const j = BY_KEY.get(`${t}>${f}`)
  if (j !== undefined) return { i: j, back: true }
  return null
}

/** A point on an edge's curve; u runs 0 → 1 from `from` to `to` in the edge's own direction. */
export function edgePoint(i: number, u: number, out: Vector3) {
  const e = NET_EDGES[i]
  const v = 1 - u
  out.set(
    v * v * e.a.x + 2 * v * u * e.c.x + u * u * e.b.x,
    v * v * e.a.y + 2 * v * u * e.c.y + u * u * e.b.y,
    v * v * e.a.z + 2 * v * u * e.c.z + u * u * e.b.z,
  )
  return out
}

/** A point along the path a packet takes between two nodes, u from its sender to its receiver. */
export function travel(from: string, to: string, u: number, out: Vector3) {
  const e = edgeOf(from, to)
  if (!e) {
    const a = NODE_AT[nodeOf(from)] ?? [0, 0, 0]
    const b = NODE_AT[nodeOf(to)] ?? [0, 0, 0]
    out.set(a[0] + (b[0] - a[0]) * u, 1 + 4 * 0.6 * u * (1 - u), a[2] + (b[2] - a[2]) * u)
    return out
  }
  return edgePoint(e.i, e.back ? 1 - u : u, out)
}

/** Light running along the lines: where a packet is on which edge, and in what colour. */
export interface Pulse {
  edge: number
  u: number
  r: number
  g: number
  b: number
  k: number
}
export const PULSES = 24
export const pulses: Pulse[] = Array.from({ length: PULSES }, () => ({ edge: -1, u: 0, r: 1, g: 1, b: 1, k: 0 }))
export const pulseN = { n: 0 }
