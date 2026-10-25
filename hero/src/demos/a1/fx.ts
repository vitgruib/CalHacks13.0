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

/** Most rules a purchase is checked against at once (requests make 5 to 9). */
export const RULES_MAX = 9

/** One request's rule check at the purchasing pod: when it began and when each rule lit, pass or fail. */
export interface Run {
  req: string
  start: number // feed time the checking began (the parcel landed)
  total: number // rules in this check, at most RULES_MAX
  at: Float64Array // feed time rule i lit, or -1
  pass: Int8Array // 1 pass, 0 fail, -1 not yet
  last: number // feed time of the latest rule
}

export function newRun(req: string, start: number, total: number): Run {
  return { req, start, total: Math.min(RULES_MAX, Math.max(1, total)), at: new Float64Array(RULES_MAX).fill(-1), pass: new Int8Array(RULES_MAX).fill(-1), last: start }
}

export const fx = {
  ripples: [] as Ripple[],
  runs: new Map<string, Run>(), // request id → its latest rule check (written by Flow, read by the pips and the parcel)
  runId: '', // the request whose check the pips show

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
    this.runs.clear()
    this.runId = ''
  },
}

/** The 3D object under the viewer's pointer (the hover card shows only for this, never for sidebar hovers). */
export const pointer = { id: null as string | null, x: 0, y: 0 }

export const now = () => feed.now()
