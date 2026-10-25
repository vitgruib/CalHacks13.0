// n1 "Neural net": where every neuron and weight sits. Layers run left to
// right: the lab's port, the input neuron, the purchasing agent's six rule
// neurons and its decision neuron, the bookkeeping and payment & report
// agents, the two grants with the grant manager's gate between them, then the
// four outcome neurons. Answers ride the lane round the front, back to the port.

import { QuadraticBezierCurve3, Vector3 } from 'three'
import { R01, R21 } from '../../feed'

export const Y = 0.5 // neuron centres
const LY = 0.14 // the answer lane, low on the deck

export type Kind = 'way' | 'in' | 'rule' | 'dec' | 'agent' | 'grant' | 'gm' | 'out'
export interface NNode {
  id: string
  at: Vector3
  r: number
  kind: Kind
}

export const G1 = `g:${R01}`
export const G2 = `g:${R21}`
export const OUTS = ['accept', 'refine', 'hold', 'reject'] as const
export const RULES = 6

const N: NNode[] = []
const node = (id: string, x: number, z: number, r: number, kind: Kind, y = Y) => N.push({ id, at: new Vector3(x, y, z), r, kind })

node('lab', -10.8, 0, 0, 'way')
node('port', -8.3, 0, 0, 'way', 0.32)
node('in', -6.5, 0, 0.34, 'in')
for (let i = 0; i < RULES; i++) node(`r${i}`, -4.3, -2.5 + i, 0.24, 'rule')
node('dec', -2.1, 0, 0.42, 'dec')
node('book', 0.7, -2.0, 0.46, 'agent')
node('pay', 0.7, 2.0, 0.46, 'agent')
node(G1, 3.7, -2.15, 0.56, 'grant')
node('gm', 3.7, 0, 0.3, 'gm')
node(G2, 3.7, 2.15, 0.56, 'grant')
OUTS.forEach((o, i) => node(`o:${o}`, 6.5, -2.4 + i * 1.6, 0.34, 'out'))
node('inlet', 0.7, -5.1, 0, 'way')
node('funder', 0.7, 5.1, 0, 'way')
// The answer lane: out past the outcomes, down the right side, along the front, up to the port.
OUTS.forEach((_, i) => node(`j${i}`, 7.7, -2.4 + i * 1.6, 0, 'way', LY))
node('c1', 7.7, 3.85, 0, 'way', LY)
const LANE_W = 6
for (let i = 1; i <= LANE_W; i++) node(`w${i}`, 7.7 - (16 * i) / (LANE_W + 1), 3.85, 0, 'way', LY)
node('c2', -8.3, 3.85, 0, 'way', LY)
node('w9', -8.3, 1.9, 0, 'way', LY)

export const NODES = Object.fromEntries(N.map(n => [n.id, n])) as Record<string, NNode>
export const pos = (id: string) => NODES[id].at

// ── Weights ──────────────────────────────────────────────────────────────

export interface Edge {
  key: string
  a: string
  b: string
  pts: Vector3[]
  cum: number[] // cumulative length at each point
  len: number
  lane: boolean
}

const E: Edge[] = []
function edge(a: string, b: string, arc = 0, lane = false) {
  const A = pos(a), B = pos(b)
  let pts: Vector3[]
  if (arc) {
    const mid = A.clone().add(B).multiplyScalar(0.5)
    mid.y += arc
    const c = new QuadraticBezierCurve3(A.clone(), mid, B.clone())
    pts = c.getPoints(28)
  } else pts = [A.clone(), B.clone()]
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
  E.push({ key: `${a}|${b}`, a, b, pts, cum, len: cum[cum.length - 1], lane })
}

edge('lab', 'port')
edge('port', 'in')
for (let i = 0; i < RULES; i++) {
  edge('in', `r${i}`)
  edge(`r${i}`, 'dec')
}
edge('dec', 'book')
edge('dec', 'gm')
edge('book', G1)
edge('book', G2)
edge('book', 'gm')
edge('pay', 'gm')
edge('inlet', 'book')
edge('pay', 'funder')
edge('in', 'pay', 1.7) // skip connection: papers go straight to the payment & report agent
edge('dec', 'o:reject', 2.6) // skip connection: a blocked request leaps to its outcome
for (const g of [G1, G2]) for (const o of ['accept', 'refine', 'hold']) edge(g, `o:${o}`)
edge('gm', 'o:hold')
edge('gm', 'o:reject')
OUTS.forEach((o, i) => edge(`o:${o}`, `j${i}`, 0, true))
const LANE = ['j0', 'j1', 'j2', 'j3', 'c1', ...Array.from({ length: LANE_W }, (_, i) => `w${i + 1}`), 'c2', 'w9', 'port']
for (let i = 1; i < LANE.length; i++) edge(LANE[i - 1], LANE[i], 0, true)

export const EDGES = E
const byKey = new Map(E.map(e => [e.key, e]))

export interface Seg {
  e: Edge
  fwd: boolean
}

/** The weights a signal crosses, node to node. Unknown hops are skipped. */
export function route(ids: string[]): Seg[] {
  const out: Seg[] = []
  for (let i = 1; i < ids.length; i++) {
    const a = ids[i - 1], b = ids[i]
    const f = byKey.get(`${a}|${b}`)
    if (f) out.push({ e: f, fwd: true })
    else {
      const r = byKey.get(`${b}|${a}`)
      if (r) out.push({ e: r, fwd: false })
    }
  }
  return out
}

/** From an outcome neuron round the lane and out of the port to the lab. */
export function laneFrom(outcome: string): string[] {
  const i = OUTS.indexOf(outcome as (typeof OUTS)[number])
  return [`o:${outcome}`, ...LANE.slice(Math.max(0, i)), 'lab']
}

/** A point `d` along an edge from the end the signal entered. */
export function edgeAt(s: Seg, d: number, out: Vector3) {
  const e = s.e
  const x = Math.min(e.len, Math.max(0, s.fwd ? d : e.len - d))
  let i = 1
  while (i < e.cum.length - 1 && e.cum[i] < x) i++
  const a = e.cum[i - 1], b = e.cum[i]
  return out.lerpVectors(e.pts[i - 1], e.pts[i], b > a ? (x - a) / (b - a) : 0)
}

/** Which of the six rule neurons a verdict lights: by rule name, so a rule lights the same neuron every time. */
const RULE_SLOTS = [/^Grant is active/, /last 90 days/, /^Enough truly/, /^Category/, /^Under the card limit/, /^Shared cost/]
export const ruleSlot = (rule: string, i: number) => {
  const k = RULE_SLOTS.findIndex(r => r.test(rule))
  return k >= 0 ? k : i % RULES
}

export const otherGrant = (gid: string) => (gid === R01 ? R21 : R01)
