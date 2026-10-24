// Scene-local UI state shared by the HUD and the 3D scene. The scene reads it
// with ui.get() inside useFrame; DOM components subscribe with useUI().

import { useSyncExternalStore } from 'react'

export type Panel = 'request' | 'detail' | null

export interface UIState {
  hovered: string | null // a FlowNode id
  selected: string | null
  panel: Panel
  fly: { id: string | null; nonce: number } // camera fly-to request; id null = back to the overview
  mine: string[] // request ids the viewer sent
  cameraIdle: boolean // the establishing move has finished
}

let state: UIState = { hovered: null, selected: null, panel: null, fly: { id: null, nonce: 0 }, mine: [], cameraIdle: false }
const subs = new Set<() => void>()

export const ui = {
  get: () => state,
  set(p: Partial<UIState>) {
    state = { ...state, ...p }
    subs.forEach(f => f())
  },
  subscribe(fn: () => void) {
    subs.add(fn)
    return () => {
      subs.delete(fn)
    }
  },
  select(id: string | null) {
    const fly = id?.startsWith('g:') ? { id, nonce: state.fly.nonce + 1 } : state.fly
    ui.set({ selected: id, panel: id ? 'detail' : null, fly })
  },
  overview() {
    ui.set({ fly: { id: null, nonce: state.fly.nonce + 1 } })
  },
}

export function useUI<T>(pick: (s: UIState) => T): T {
  return useSyncExternalStore(ui.subscribe, () => pick(state))
}

/** Feed-independent real-time pulses, keyed by node id, for arrival flashes. */
export const pulses = new Map<string, { at: number; color: [number, number, number] }>()
export const pulse = (id: string, color: [number, number, number]) => pulses.set(id, { at: performance.now(), color })
export const pulseAge = (id: string) => {
  const p = pulses.get(id)
  return p ? (performance.now() - p.at) / 1000 : Infinity
}

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** The DOM layer that floats packet labels over the canvas. Set by the root. */
export const overlay: { el: HTMLDivElement | null } = { el: null }
