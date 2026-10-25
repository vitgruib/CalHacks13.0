// The viewer's UI state (hover, selection, the sidebar's open section) and the
// helpers that read the feed from React. The dashboard owns this file; the scene reads it.

import { useSyncExternalStore } from 'react'
import { feed } from '../../feed'
import type { World } from '../../feed'

/** Kept for older readers; the sidebar never opens a panel, so it stays null. */
export type PanelKind = 'request' | 'inbox' | 'index' | 'ledger' | 'detail'

/** The sidebar's collapsible sections. One is open at a time. */
export type SectionId = 'grants' | 'waiting' | 'requests' | 'agents' | 'lab' | 'activity' | 'story'

export interface UiState {
  hovered: string | null
  selected: string | null
  panel: PanelKind | null
  openRequest: string | null
  composeFor: string | null
  mine: string[]
  section: SectionId | null
  composing: boolean
  sheet: boolean // the phone's bottom sheet is expanded
  chosen: boolean // the viewer picked a section themselves, so the story stops opening them
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
  chosen: false,
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

/** Which section shows the detail of a node or request. */
export function sectionFor(id: string): SectionId {
  if (id.startsWith('g:')) return 'grants'
  if (id.startsWith('r:')) return 'lab'
  if (id.startsWith('a:') || id.startsWith('p:') || id.startsWith('s:') || id.startsWith('v:')) return 'agents'
  return 'requests'
}

/**
 * Select a node (or a request) from the scene or the sidebar. The camera glides to it
 * and the sidebar opens the section that holds its row. Selecting the same id again clears it.
 */
export const selectNode = (id: string | null) => {
  if (!id || id === state.selected) {
    ui.set({ selected: null, openRequest: null })
    return
  }
  const section = sectionFor(id)
  ui.set({ selected: id, section, openRequest: section === 'requests' ? id : null, chosen: true })
}

/** Open one sidebar section (or close it when it is already open). */
export const openSection = (s: SectionId | null) => ui.set({ section: state.section === s ? null : s, chosen: true })

/** Kept so older callers still work. */
export const openPanel = (panel: PanelKind | null) => {
  if (panel === 'request') ui.set({ section: 'requests', composing: true, sheet: true })
  else if (panel === 'inbox') ui.set({ section: 'waiting', sheet: true })
  else if (panel === 'ledger') ui.set({ section: 'activity', sheet: true })
  else if (panel === 'index') ui.set({ section: 'story', sheet: true })
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
