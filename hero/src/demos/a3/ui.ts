// The viewer's UI state (hover, selection, the sidebar's tab and sheet) and
// the helpers that read the feed from React. The dashboard owns this file;
// the scene reads it.

import { useSyncExternalStore } from 'react'
import { feed } from '../../feed'
import type { World } from '../../feed'

/** Kept for older imports. The sidebar never covers the stage, so `panel` stays null. */
export type PanelKind = 'request' | 'inbox' | 'index' | 'ledger' | 'detail'
export type Tab = 'overview' | 'requests' | 'decisions' | 'activity'

export interface UiState {
  hovered: string | null // a FlowNode id or a request id
  hoverSrc: 'scene' | 'dashboard' | null // who set `hovered`; the scene's hover card shows only for 'scene' (or null)
  selected: string | null
  panel: PanelKind | null
  tab: Tab
  sheet: boolean // phone: the bottom sheet is expanded
  composing: boolean // the "Send a request" form is open
  openRequest: string | null
  composeFor: string | null
  mine: string[]
}

const blank = (): UiState => ({
  hovered: null,
  hoverSrc: null,
  selected: null,
  panel: null,
  tab: 'overview',
  sheet: false,
  composing: false,
  openRequest: null,
  composeFor: null,
  mine: [],
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

/** Select a node (or a request); the scene glides its camera there and the sidebar shows its detail. */
// A clicked row unmounts without a mouseleave, so drop the hover it set.
const unhover = () => (state.hoverSrc === 'dashboard' ? { hovered: null, hoverSrc: null } : {})
export const selectNode = (id: string | null) => ui.set({ selected: id, panel: null, openRequest: null, ...unhover() })
export const openTab = (tab: Tab) => ui.set({ tab, selected: null, panel: null, ...unhover() })

/** Sidebar rows mark what they point at, so the scene can light it without a hover card. */
export const hoverFromDashboard = (id: string | null) => {
  if (id) ui.set({ hovered: id, hoverSrc: 'dashboard' })
  else if (state.hoverSrc === 'dashboard') ui.set({ hovered: null, hoverSrc: null })
}

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
