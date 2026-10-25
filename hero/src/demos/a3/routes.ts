// Every packet travels in two legs: from its sender into the shared record
// at the centre of the table, then out of the record to its receiver.
// Legs on the table ride low along the spokes; legs from the lab or from
// outside arc over the gap. The table and the parcels share this maths, so
// the spoke that lights is the one the parcel is on.

import { Vector3 } from 'three'
import type { Packet } from '../../feed'
import { body } from './crowd'
import { HUB, LAB_X1, TABLE, TABLE_R, spot } from './layout'

export interface Route {
  a: Vector3
  m: Vector3
  b: Vector3
  ca: Vector3
  cb: Vector3
  s: number // the share of the route spent on the first leg
}

export const newRoute = (): Route => ({ a: new Vector3(), m: HUB.clone(), b: new Vector3(), ca: new Vector3(), cb: new Vector3(), s: 0.5 })

const onTable = (p: Vector3) => Math.hypot(p.x - TABLE[0], p.z - TABLE[2]) < TABLE_R + 0.05 && p.y > -0.2
const inLab = (p: Vector3) => p.x < LAB_X1 + 0.4

function lift(p: Vector3, d: number) {
  if (inLab(p)) return 0.5 + 0.22 * d
  if (onTable(p)) return 0.1 + 0.05 * d
  return 0.35 + 0.16 * d
}

/** From `a` through the record to `b`. */
export function viaHub(a: Vector3, b: Vector3, r: Route, low = 1) {
  r.a.copy(a)
  r.b.copy(b)
  r.m.copy(HUB)
  const d1 = a.distanceTo(HUB)
  const d2 = HUB.distanceTo(b)
  r.ca.lerpVectors(a, HUB, 0.5)
  r.ca.y = Math.max(a.y, HUB.y) + lift(a, d1) * low
  r.cb.lerpVectors(HUB, b, 0.5)
  r.cb.y = Math.max(b.y, HUB.y) + lift(b, d2) * low
  r.s = d1 + d2 > 1e-4 ? d1 / (d1 + d2) : 0.5
  return r
}

const bez = (a: Vector3, c: Vector3, b: Vector3, t: number, out: Vector3) => {
  const u = 1 - t
  return out.set(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z)
}

export function routePoint(r: Route, u: number, out: Vector3) {
  if (u <= r.s) return bez(r.a, r.ca, r.m, r.s > 0 ? u / r.s : 1, out)
  return bez(r.m, r.cb, r.b, r.s < 1 ? (u - r.s) / (1 - r.s) : 1, out)
}

// ── Timing ───────────────────────────────────────────────────────────────

/** Of a request's or pushback's travel time: the part spent held up in the sender's hand. */
export const IN_HAND = 0.2

export const handHeld = (p: Packet) => p.from.startsWith('r:') && (p.kind === 'request' || p.kind === 'pushback' || p.kind === 'paper')

/** How far along its route a packet is, 0..1, with an easing that slows through the record. */
export function travel(p: Packet, t: number) {
  const k = Math.min(1, Math.max(0, (t - p.sentAt) / p.ms))
  if (!handHeld(p)) return k
  return k < IN_HAND ? 0 : (k - IN_HAND) / (1 - IN_HAND)
}

/** Where a node sends from and receives at: a lab member's hand, or the node's anchor. */
export function anchorInto(id: string, out: Vector3) {
  if (id.startsWith('r:')) return out.copy(body(id.slice(2)).hand)
  const a = spot(id).anchor
  return out.set(a[0], a[1], a[2])
}

const ea = new Vector3()
const eb = new Vector3()
/** The share of a packet's route on its first leg, from the nodes' anchors (good enough for lighting spokes). */
export function splitOf(p: Packet) {
  anchorInto(p.from, ea)
  anchorInto(p.to, eb)
  const d1 = ea.distanceTo(HUB)
  const d2 = HUB.distanceTo(eb)
  return d1 / Math.max(1e-4, d1 + d2)
}
