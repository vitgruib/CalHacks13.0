// The viewer's UI state (hover, selection, which sidebar section is open) and
// the helpers that read the feed from React. The dashboard owns this file;
// the scene reads it.

import { useSyncExternalStore } from 'react'
import { feed } from '../../feed'
import type { World } from '../../feed'

export type PanelKind = 'request' | 'inbox' | 'index' | 'ledger' | 'detail'
export type Section = 'waiting' | 'grants' | 'requests' | 'agents' | 'activity' | 'story'

export interface UiState {
  hovered: string | null
  selected: string | null
  /** Round 1's floating panel. The sidebar replaced it, so it stays null. */
  panel: PanelKind | null
  openRequest: string | null
  composeFor: string | null
  mine: string[]
  /** The sidebar section that is open; one at a time. */
  section: Section | null
  /** The send-a-request form, inside the Requests section. */
  composing: boolean
  /** Phone only: the bottom sheet is pulled up. */
  sheet: boolean
}

const blank = (): UiState => ({
  hovered: null,
  selected: null,
  panel: null,
  openRequest: null,
  composeFor: null,
  mine: [],
  section: 'grants',
  composing: false,
  sheet: false,
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

/** The sidebar section that shows a node's details. */
export function sectionFor(id: string): Section {
  if (id.startsWith('g:')) return 'grants'
  if (id.startsWith('r:') || id.startsWith('rq-')) return 'requests'
  return 'agents'
}

/** Select a node (or a request id) from the scene or the sidebar; its section opens on it. */
export const selectNode = (id: string | null) =>
  ui.set(id ? { selected: id, section: sectionFor(id), openRequest: id.startsWith('rq-') ? id : null } : { selected: null, openRequest: null })
export const openPanel = (panel: PanelKind | null) => ui.set({ panel, selected: panel === 'detail' ? state.selected : null })
export const openSection = (section: Section | null) => ui.set({ section, composing: section === 'requests' ? state.composing : false })

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
