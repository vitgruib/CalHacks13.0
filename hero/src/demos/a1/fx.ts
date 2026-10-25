// Scene-local state that the feed's events and the figures share (ripples,
// reactions, where each researcher is right now). It lives outside React so
// the Canvas tree never re-renders on a feed event. The scene owns this file.

import { Vector3 } from 'three'
import { feed } from '../../feed'
import type { Outcome } from '../../feed'
import type { Action } from './layout'

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
/** Where a researcher is this frame, written by the figure, read by parcels, halos and the camera. */
export interface Fig {
  pos: Vector3 // feet
  hands: Vector3 // between the hands, where a parcel is held
  head: Vector3
  yaw: number
  action: Action
  spot: string
  arrived: boolean
}

export const fx = {
  ripples: [] as Ripple[],
  reactions: new Map<string, Reaction>(), // researcher id → latest reaction
  pulses: new Map<string, number>(), // node id → feed time it last sent or received
  slosh: new Map<string, { at: number; amp: number }>(), // grant id → when its liquid was last disturbed
  holding: new Map<string, number>(), // researcher id → feed time until which their hands hold a returned parcel
  figs: new Map<string, Fig>(),
  parcels: new Map<string, Vector3>(), // request id → where its item is this frame (written by Flow)
  clear() {
    this.ripples.length = 0
    this.reactions.clear()
    this.pulses.clear()
    this.slosh.clear()
    this.holding.clear()
    this.parcels.clear()
  },
}

/** The 3D object under the viewer's pointer (the hover card shows only for this, never for sidebar hovers). */
export const pointer = { id: null as string | null, x: 0, y: 0 }

export const now = () => feed.now()
