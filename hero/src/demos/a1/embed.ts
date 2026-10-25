// Lab floor inside another page (hero/src/embed.tsx, the web landing) rather
// than the gallery's full window. Set once before the demo mounts; `awake`
// follows whether the visitor can see it. The gallery never sets any of this.

import { useSyncExternalStore } from 'react'

export type Role = 'researcher' | 'grant_office'

interface EmbedState {
  /** Inside another page: no wheel zoom, page scroll passes through, listeners stay on the root. */
  on: boolean
  /** On screen and the tab visible; the canvas and the sidebar's progress bar stop drawing otherwise. */
  awake: boolean
  /** The host's call to action; a role when the visitor picked a side. */
  onEnter?: (role?: Role) => void
  /** False while the opening crane plays (Scene.tsx Rig); the hover zones and names wait for it. */
  settled: boolean
  /** The opening crane has played in this tab (once per tab: coming back opens on the hero framing, over the still). */
  craned: boolean
}

let state: EmbedState = { on: false, awake: true, settled: true, craned: false }
const fns = new Set<() => void>()

export const embed = {
  get: () => state,
  set(patch: Partial<EmbedState>) {
    state = { ...state, ...patch }
    fns.forEach(f => f())
  },
  subscribe(fn: () => void) {
    fns.add(fn)
    return () => {
      fns.delete(fn)
    }
  },
}

export const useEmbed = <T,>(pick: (s: EmbedState) => T) => useSyncExternalStore(embed.subscribe, () => pick(state))
