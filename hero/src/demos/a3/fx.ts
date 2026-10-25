// Scene-local effects that the feed's events kick off (ripples, landings,
// figurine reactions). They live outside React so the Canvas tree never
// re-renders on a feed event. The scene owns this file.

import type { Vector3 } from 'three'
import { feed } from '../../feed'
import type { Outcome } from '../../feed'

// ── Scene-local effects (feed time) ───────────────────────────────────────

export type Form = 'coin' | 'bead' | 'money' | 'slip' | 'parcel' | 'ring' | 'tile' | 'pawn'

export interface Ripple {
  pos: Vector3
  color: string
  at: number
  size: number
  ms: number
}
export interface Landing {
  form: Form
  color: string
  pos: Vector3
  at: number
  outcome?: Outcome
}
export interface Reaction {
  kind: 'send' | Outcome
  at: number
}

export const fx = {
  ripples: [] as Ripple[],
  landings: [] as Landing[],
  reactions: new Map<string, Reaction>(), // researcher id → latest reaction
  pulses: new Map<string, number>(), // node id → feed time it last sent or received
  slosh: new Map<string, { at: number; amp: number }>(), // grant id → when its liquid was last disturbed
  clear() {
    this.ripples.length = 0
    this.landings.length = 0
    this.reactions.clear()
    this.pulses.clear()
    this.slosh.clear()
  },
}

export const now = () => feed.now()
