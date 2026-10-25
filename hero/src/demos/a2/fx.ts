// Scene-local effects that the feed's events kick off (ripples, reactions,
// pulses), plus where the moving things are this frame. They live outside
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
export interface Reaction {
  kind: 'send' | Outcome
  at: number
}

/** A lab member as the scene last drew them. */
export interface Body {
  pos: Vector3 // feet
  head: Vector3
  hand: Vector3 // right hand, where a sent item is held up
  yaw: number
  surf: number // height of the bench in front of them
  walking: boolean
}

export const fx = {
  ripples: [] as Ripple[],
  reactions: new Map<string, Reaction>(), // researcher id → latest reaction
  pulses: new Map<string, number>(), // node id → feed time it last sent or received
  kicks: new Map<string, number>(), // node id → feed time something arrived (the mobile dips)
  bodies: new Map<string, Body>(),
  freezer: 0, // how far Jun has the freezer door open
  /** What the pointer is over in the 3D stage. The hover card follows only this, never a sidebar row. */
  pointer: null as string | null,
  clear() {
    this.ripples.length = 0
    this.reactions.clear()
    this.pulses.clear()
    this.kicks.clear()
  },
}

export function bodyOf(id: string): Body {
  let b = fx.bodies.get(id)
  if (!b) {
    b = { pos: new Vector3(), head: new Vector3(0, 1.6, 0), hand: new Vector3(0, 1, 0), yaw: 0, surf: 0.94, walking: false }
    fx.bodies.set(id, b)
  }
  return b
}

export const now = () => feed.now()
