// One feed for the whole page. Scenes read it; only the gallery restarts it.
//
//   import { feed, useWorld, useFlow, progress, PACE } from '../../feed'
//
// - useWorld()            the World snapshot; re-renders on every change (fine for HUD, not for 3D trees)
// - useFlow(fn)           FlowEvents as they happen; spawn animations here
// - feed.getWorld()       read inside useFrame without re-rendering
// - progress(packet)      0..1 along its route, in feed time (pauses and speeds up with the feed)
// - feed.submit / preview / pushback / decide / inject / play / pause / setSpeed
// - feed.storyProgress()  0..1 through the scripted story (restarts with it)
// - EDGES                 the finance network's lines; ITEM_LOOKS / kindOf what a requested thing looks like
// - grantName(id)         what to show for a grant id; never render the id itself

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Feed } from './engine'
import type { FlowEvent, Packet, World } from './types'

export const feed = new Feed()

export function useWorld(): World {
  return useSyncExternalStore(feed.subscribeWorld, feed.getWorld)
}

export function useFlow(fn: (e: FlowEvent) => void) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => feed.on(e => ref.current(e)), [])
}

export const progress = (p: Packet, now = feed.now()) => Math.min(1, Math.max(0, (now - p.sentAt) / p.ms))

/** The plain name a scene shows for a grant id ("Mitochondria grant"); award numbers never reach the screen. */
export const grantName = (id: string) => feed.getWorld().grants.find(g => g.id === id)?.name ?? 'Another grant'

export { PACE, usd } from './engine'
export { EDGES, PRESETS, R01, R21 } from './world'
export { ITEM_LOOKS, kindOf } from './items'
export * from './types'
