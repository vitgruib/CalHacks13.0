// Where every node sits, and the drafted path a packet follows between two
// of them. Lab traffic runs along two floor lanes out through the lab door;
// office traffic arcs between machines. Unknown ids fall back to the centre.

import * as THREE from 'three'
import { DOOR, buildModels, type Model } from './models'

export const MODELS = buildModels()
export const MODEL_BY_ID = new Map<string, Model>(MODELS.map(m => [m.id, m]))

export function portOf(id: string, out = new THREE.Vector3()) {
  const m = MODEL_BY_ID.get(id)
  if (!m) return out.set(2, 1, 0)
  return out.set(m.at[0] + m.port[0], m.port[1], m.at[1] + m.port[2])
}

export function centreOf(id: string, out = new THREE.Vector3()) {
  const m = MODEL_BY_ID.get(id)
  if (!m) return out.set(2, 0, 0)
  return out.set(m.at[0], 1, m.at[1])
}

export interface Route {
  curve: THREE.Curve<THREE.Vector3>
  ground: THREE.Vector3[] // the path's footprint, for drafting it on the floor
}

const cache = new Map<string, Route>()
const LANE = 0.24
const SLIDE = 0.32

function labPath(rid: string, target: string, back: boolean): THREE.Vector3[] {
  const m = MODEL_BY_ID.get(rid)
  const p = portOf(rid)
  const t = portOf(target)
  const off = back ? LANE : -LANE
  const pts: THREE.Vector3[] = [p.clone()]
  if (m) {
    const aisleZ = m.at[1] + 1.55 + (back ? 0.25 : 0)
    pts.push(new THREE.Vector3(p.x, SLIDE, aisleZ))
    pts.push(new THREE.Vector3(Math.min(p.x + 2.2, DOOR[0] - 1.1), SLIDE, aisleZ + (DOOR[2] - aisleZ) * 0.35))
  }
  pts.push(new THREE.Vector3(DOOR[0] - 0.7, SLIDE, DOOR[2] + off))
  pts.push(new THREE.Vector3(DOOR[0] + 0.9, SLIDE, DOOR[2] + off))
  const tm = MODEL_BY_ID.get(target)
  const approach = tm ? new THREE.Vector3(tm.at[0] - 2.1, SLIDE + 0.15, t.z + 0.9 + off) : t.clone()
  pts.push(approach, t.clone())
  return pts
}

/** The route for a packet. `back` picks the return lane (verdicts). */
export function route(from: string, to: string): Route {
  const key = `${from}>${to}`
  const hit = cache.get(key)
  if (hit) return hit
  let curve: THREE.Curve<THREE.Vector3>
  const fromLab = from.startsWith('r:')
  const toLab = to.startsWith('r:')
  if (fromLab || toLab) {
    const pts = fromLab ? labPath(from, to, false) : labPath(to, from, true).reverse()
    curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)
  } else {
    const a = portOf(from)
    const b = portOf(to)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const d = Math.hypot(b.x - a.x, b.z - a.z)
    const side = from < to ? 1 : -1
    const nx = -(b.z - a.z) / (d || 1)
    const nz = (b.x - a.x) / (d || 1)
    mid.y = Math.max(a.y, b.y) + 0.7 + d * 0.09
    mid.x += nx * 0.45 * side
    mid.z += nz * 0.45 * side
    curve = new THREE.QuadraticBezierCurve3(a, mid, b)
  }
  const ground = curve.getSpacedPoints(48).map(p => new THREE.Vector3(p.x, 0.015, p.z))
  const r = { curve, ground }
  cache.set(key, r)
  return r
}

/** Lanes drafted on the floor permanently: every researcher's way out and back. */
export const LAB_IDS = ['r:ortiz', 'r:okafor', 'r:raman', 'r:silva', 'r:park']

/** Office wiring drafted as floor construction lines. */
export const LINKS: [string, string][] = [
  ['a:purchasing', 'a:bookkeeping'],
  ['a:purchasing', 'p:grant_manager'],
  ['a:bookkeeping', 'p:grant_manager'],
  ['a:payment_report', 'p:grant_manager'],
  ['a:bookkeeping', 'g:R01GM061721'],
  ['a:bookkeeping', 'g:R21AI182745'],
  ['a:purchasing', 'g:R01GM061721'],
  ['g:R01GM061721', 'v:vendors'],
  ['g:R21AI182745', 'v:vendors'],
  ['v:vendors', 'a:bookkeeping'],
  ['a:payment_report', 'p:funder'],
  ['s:reporter', 'a:bookkeeping'],
  ['s:usaspending', 'a:bookkeeping'],
  ['s:cancellations', 'a:bookkeeping'],
  ['s:court', 'a:bookkeeping'],
  ['s:payments', 'a:bookkeeping'],
]
