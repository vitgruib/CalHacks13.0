// The viewer's UI state (hover, selection, the sidebar's tab and sheet) and
// the helpers that read the feed from React. The dashboard owns this file;
// the scene reads it.

import { useSyncExternalStore } from 'react'
import { feed } from '../../feed'
import type { World } from '../../feed'

/** Kept so older imports compile. The sidebar replaced the floating panels, so it stays null. */
export type PanelKind = 'request' | 'inbox' | 'index' | 'ledger' | 'detail'
export type Tab = 'overview' | 'requests' | 'activity'

export interface UiState {
  hovered: string | null
  selected: string | null
  panel: PanelKind | null
  openRequest: string | null
  composeFor: string | null
  mine: string[]
  tab: Tab
  composing: boolean
  sheet: boolean // the phone's bottom sheet is expanded
  reveal: number // bumps when the scene picks something, so the sidebar shows it
}

const blank = (): UiState => ({
  hovered: null,
  selected: null,
  panel: null,
  openRequest: null,
  composeFor: null,
  mine: [],
  tab: 'overview',
  composing: false,
  sheet: false,
  reveal: 0,
})
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

const isRequest = (id: string) => !/^[a-z]:/.test(id)

/** Pick a node (or a request) from anywhere; the sidebar opens its row. */
export const selectNode = (id: string | null) =>
  ui.set({
    selected: id,
    panel: null,
    openRequest: id && isRequest(id) ? id : null,
    reveal: id ? state.reveal + 1 : state.reveal,
  })
/** Pick from inside the sidebar: the camera follows, the sidebar stays where it is. */
export const pick = (id: string | null) => ui.set({ selected: id, panel: null })
export const hover = (id: string | null) => {
  if (id) ui.set({ hovered: id })
  else if (state.hovered) ui.set({ hovered: null })
}
export const unhover = (id: string) => state.hovered === id && ui.set({ hovered: null })

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
