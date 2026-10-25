// Two tiny stores: the viewer's UI state (hover, selection, open panel), and
// scene-local effects that the feed's events kick off (ripples, landings,
// figurine reactions). The effects live outside React so the Canvas tree
// never re-renders on a feed event.

import { useSyncExternalStore } from 'react'
import type { Vector3 } from 'three'
import { feed } from '../../feed'
import type { Outcome, World } from '../../feed'

export type PanelKind = 'request' | 'inbox' | 'index' | 'ledger' | 'detail'

export interface UiState {
  hovered: string | null
  selected: string | null
  panel: PanelKind | null
  openRequest: string | null
  composeFor: string | null
  mine: string[]
}

const blank = (): UiState => ({ hovered: null, selected: null, panel: null, openRequest: null, composeFor: null, mine: [] })
let state = blank()
const listeners = new Set<() => void>()

export const ui = {
  get: () => state,
  set(p: Partial<UiState>) {
    state = { ...state, ...p }
    listeners.forEach(f => f())
  },
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  reset() {
    state = blank()
    listeners.forEach(f => f())
  },
}

export function useUi<T>(sel: (s: UiState) => T): T {
  return useSyncExternalStore(ui.subscribe, () => sel(state))
}

export const selectNode = (id: string | null) => ui.set({ selected: id, panel: id ? 'detail' : null, openRequest: null })
export const openPanel = (panel: PanelKind | null) => ui.set({ panel, selected: panel === 'detail' ? state.selected : null })

/** A slice of the feed's World. The selector must return a primitive or an existing reference. */
// The feed tells subscribers about changes on its clock tick, so a decision made while the
// story is paused would not show until play. Viewer actions go through `act`, which has
// every subscriber re-read the world straight away.
const nudged = new Set<() => void>()
const subscribe = (fn: () => void) => {
  const off = feed.subscribeWorld(fn)
  nudged.add(fn)
  return () => {
    off()
    nudged.delete(fn)
  }
}
export function act<T>(f: () => T): T {
  const r = f()
  for (const fn of [...nudged]) fn()
  return r
}

export function useFeed<T>(sel: (w: World) => T): T {
  return useSyncExternalStore(subscribe, () => sel(feed.getWorld()))
}

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** `?hq` pins the top quality tier (headless captures otherwise step down to the lowest). */
export const pinnedQuality = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('hq')

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
