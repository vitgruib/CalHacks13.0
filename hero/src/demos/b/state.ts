// Scene-local state the 3D components read inside useFrame, and the tiny UI
// store shared by the scene and the HUD (selection, hover). Nothing here
// re-renders the Canvas tree.

import { useSyncExternalStore } from 'react'
import type { Outcome, Packet } from '../../feed'

// ── UI: which room is pulled out, which is under the pointer ────────────

type Fn = () => void
const selListeners = new Set<Fn>()

export const ui = {
  selected: null as string | null,
  hovered: null as string | null,
  stage: null as HTMLElement | null,
  touchedAt: 0, // last time the viewer moved the camera (ms)
}

export function select(id: string | null) {
  if (ui.selected === id) return
  ui.selected = id
  selListeners.forEach(f => f())
}

export function hover(id: string | null) {
  ui.hovered = id
  if (ui.stage) ui.stage.style.cursor = id ? 'pointer' : ''
}

export const onSelect = (f: Fn) => {
  selListeners.add(f)
  return () => {
    selListeners.delete(f)
  }
}

export const useSelected = () => useSyncExternalStore(onSelect, () => ui.selected)

// ── Activity: rooms light up when something happens in them ─────────────

export const activity: Record<string, number> = {}
export const pull: Record<string, number> = {}

export function bump(node: string, v = 1) {
  activity[node] = Math.max(activity[node] ?? 0, v)
}

// ── The rule room ────────────────────────────────────────────────────────

export const stations = Array.from({ length: 6 }, () => ({ state: 0, t: -1e9 })) // 1 pass, -1 fail
export const run = { refId: '', target: -1, visible: false, outAt: 0 }

// ── Arrivals and things left behind ──────────────────────────────────────

export interface Effect {
  kind: 'ring' | 'accept' | 'refine' | 'reject' | 'slug'
  t: number // performance.now() / 1000 when it started
  node: string
  packet?: Packet
  outcome?: Outcome
  color: string
  key: string
}
export const effects: Effect[] = []
export const vaultHoldUntil: Record<string, number> = {} // vault stays frosted until the money slug lands
export const vaultShake: Record<string, number> = {} // a court order rattles the shutter; it stays shut

export const intro = { t: 0 } // 0..1 progress of the opening move

/** DOM tags that ride along with capsules in flight (filled by the label layer). */
export const tagEls: (HTMLElement | null)[] = []
export const TAGS = 10

let seq = 0
export const nextKey = () => `fx-${seq++}`

export function resetScene() {
  for (const k of Object.keys(activity)) delete activity[k]
  for (const s of stations) {
    s.state = 0
    s.t = -1e9
  }
  run.refId = ''
  run.target = -1
  run.visible = false
  run.outAt = 0
  effects.length = 0
  for (const k of Object.keys(vaultHoldUntil)) delete vaultHoldUntil[k]
  for (const k of Object.keys(vaultShake)) delete vaultShake[k]
}

export const clock = () => performance.now() / 1000
