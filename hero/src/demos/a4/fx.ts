// Scene-local state that the 3D parts share frame to frame: where each lab
// member is right now (their hands and head, for parcels and the hover
// card), and the short-lived effects feed events kick off. It lives outside
// React so the Canvas tree never re-renders on a feed event. The scene owns
// this file.

import { Vector3 } from 'three'
import { feed } from '../../feed'
import type { Outcome } from '../../feed'

export interface Ripple {
  pos: Vector3
  color: string
  at: number
  size: number
  ms: number
}

export interface Person {
  pos: Vector3 // feet
  yaw: number
  hand: Vector3 // right hand, world space
  head: Vector3
  walking: boolean
  seated: boolean
}

export interface Reaction {
  kind: 'send' | Outcome
  at: number
}

export const fx = {
  ripples: [] as Ripple[],
  people: new Map<string, Person>(), // researcher id (and 'gm') → live pose
  reactions: new Map<string, Reaction>(), // researcher id → latest reaction
  pulses: new Map<string, number>(), // node id → feed time it last sent or received
  freezerOpen: 0, // 0..1, Jun's freezer door
  clear() {
    this.ripples.length = 0
    this.reactions.clear()
    this.pulses.clear()
  },
}

export function person(id: string): Person {
  let p = fx.people.get(id)
  if (!p) {
    p = { pos: new Vector3(), yaw: 0, hand: new Vector3(), head: new Vector3(0, 1.6, 0), walking: false, seated: false }
    fx.people.set(id, p)
  }
  return p
}

export const now = () => feed.now()

/**
 * How a request's 2.4 s trip is split: the researcher holds the item up,
 * throws it to the intake, and a car takes it to the purchasing agent.
 * An answer runs the other way: stamped, carried to the intake, thrown home.
 */
export const SEND = { hold: 0.3, fly: 0.62 }
export const BACK = { stamp: 0.14, ride: 0.46 }
