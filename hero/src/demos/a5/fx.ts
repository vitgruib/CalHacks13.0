// Scene-local effects that the feed's events kick off (ripples, landings,
// figure reactions), and where each researcher's hands are right now. They
// live outside React so the Canvas tree never re-renders on a feed event.
// The scene owns this file.

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

const RIDS = ['ortiz', 'okafor', 'raman', 'silva', 'park']

export const fx = {
  ripples: [] as Ripple[],
  reactions: new Map<string, Reaction>(), // researcher id → latest reaction
  pulses: new Map<string, number>(), // node id → feed time it last sent or received
  slosh: new Map<string, { at: number; amp: number }>(), // grant id → when its liquid was last disturbed
  /** Each researcher's working hand and chest, in world space, written by the figures every frame. */
  hand: new Map<string, Vector3>(RIDS.map(id => [id, new Vector3(-3.4, 1.1, 0)])),
  chest: new Map<string, Vector3>(RIDS.map(id => [id, new Vector3(-3.4, 1.2, 0)])),
  /** What a researcher is doing right now, in words, for the hover card. */
  doing: new Map<string, string>(),
  /** Whether the pointer is over the stage right now (the hover card shows only then). */
  pointer: { inside: false, mouse: false, x: 0, y: 0 },
  sceneHover: null as string | null,
  clear() {
    this.ripples.length = 0
    this.reactions.clear()
    this.pulses.clear()
    this.slosh.clear()
  },
}

export const now = () => feed.now()
