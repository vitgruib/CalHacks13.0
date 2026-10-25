// The viewer's UI state (hover, selection, the open sidebar section) and the
// helpers that read the feed from React. The dashboard owns this file; the
// scene reads it.

import { useSyncExternalStore } from 'react'
import { feed } from '../../feed'
import type { World } from '../../feed'

export type PanelKind = 'request' | 'inbox' | 'index' | 'ledger' | 'detail'
export type Section = 'grants' | 'requests' | 'agents' | 'lab' | 'activity' | 'chapters'

export interface UiState {
  hovered: string | null
  /** 'sidebar' while a sidebar row set `hovered`; the scene shows its hover card only for its own hovers. */
  hoverFrom: 'sidebar' | null
  selected: string | null
  /** Round 1's floating panel. The sidebar never covers the stage, so this stays null. */
  panel: PanelKind | null
  /** The one open sidebar section. */
  section: Section | null
  composing: boolean
  openRequest: string | null
  composeFor: string | null
  mine: string[]
  /** Phone: the bottom sheet is expanded. */
  sheet: boolean
}

const blank = (): UiState => ({
  hovered: null,
  hoverFrom: null,
  selected: null,
  panel: null,
  section: 'grants',
  composing: false,
  openRequest: null,
  composeFor: null,
  mine: [],
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

const isNode = (id: string) => /^[a-z]:/.test(id)

/** Which sidebar section shows the detail for a node or request id. */
export function sectionFor(id: string): Section {
  if (id.startsWith('r:')) return 'lab'
  if (id.startsWith('g:')) return 'grants'
  if (isNode(id)) return 'agents'
  return 'requests'
}

/** Select a node or request (the scene glides to it; the sidebar opens its detail). Null clears. */
export const selectNode = (id: string | null) => {
  if (!id) return ui.set({ selected: null })
  ui.set({ selected: id, section: sectionFor(id), openRequest: isNode(id) ? state.openRequest : id })
}

/** Sidebar rows mark what they point at in the scene, without the scene's hover card. */
export const hoverRow = (id: string) => {
  if (state.hovered !== id || state.hoverFrom !== 'sidebar') ui.set({ hovered: id, hoverFrom: 'sidebar' })
}
export const unhoverRow = (id: string) => {
  if (state.hovered === id) ui.set({ hovered: null, hoverFrom: null })
}
export const rowLink = (id: string) => ({
  onMouseEnter: () => hoverRow(id),
  onMouseLeave: () => unhoverRow(id),
  onFocus: () => hoverRow(id),
  onBlur: () => unhoverRow(id),
})

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

/** Restart the story and run it forward to `ms` of feed time (0 replays from the top), like `?at`. */
export function jumpTo(ms: number) {
  ui.set({ selected: null, hovered: null, hoverFrom: null, openRequest: null, composing: false, composeFor: null, mine: [] })
  act(() => {
    feed.restart()
    if (ms > 0) feed.advance(ms)
  })
}

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Scrolls the sidebar, never the page, to bring el into view (scrollIntoView would move a host page too). */
export function reveal(el: HTMLElement | null | undefined, block: 'nearest' | 'start' = 'nearest') {
  const box = el?.closest<HTMLElement>('.a-scroll')
  if (!el || !box) return
  const b = box.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
  let dy = 0
  if (block === 'start' || r.top - margin < b.top) dy = r.top - margin - b.top
  else if (r.bottom > b.bottom) dy = Math.min(r.bottom - b.bottom, r.top - margin - b.top)
  if (dy) box.scrollBy({ top: dy, behavior: reducedMotion() ? 'auto' : 'smooth' })
}

/** `?hq` pins the top quality tier (headless captures otherwise step down to the lowest). */
export const pinnedQuality = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('hq')
