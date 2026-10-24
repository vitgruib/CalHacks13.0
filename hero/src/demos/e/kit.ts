// Shared materials, palette, easing and the machine's effect bus. The bus is
// plain mutable state: the ball engine writes impulses, each part reads them
// in useFrame. Nothing here causes a React render.

import { useSyncExternalStore } from 'react'
import { Color, DoubleSide, MeshStandardMaterial, Vector3 } from 'three'
import { R01, R21 } from '../../feed'
import { GATES, RESEARCHER_IDS } from './layout'

export const C = {
  ground: '#cdd2d4',
  ash: '#e9ecec',
  ashDeep: '#b8bfc3',
  steel: '#1b1e22',
  red: '#d23a1f',
  cobalt: '#1f47b4',
  yellow: '#f2bd0c',
  ink: '#14171a',
}
export type Paint = 'red' | 'cobalt' | 'yellow' | 'ash' | 'steel'

const std = (color: string, roughness: number, metalness: number, side = false) =>
  new MeshStandardMaterial({ color, roughness, metalness, side: side ? DoubleSide : undefined })

export const M = {
  black: std(C.steel, 0.42, 0.55),
  blackSide: std(C.steel, 0.45, 0.55, true),
  ash: std(C.ash, 0.78, 0),
  ashDeep: std(C.ashDeep, 0.7, 0.1),
  red: std(C.red, 0.42, 0.05),
  redSide: std(C.red, 0.45, 0.05, true),
  cobalt: std(C.cobalt, 0.4, 0.08),
  yellow: std(C.yellow, 0.38, 0.05),
  chrome: std('#dfe3e7', 0.14, 1),
  rail: std('#a7aeb4', 0.28, 0.92),
}
export const paint = (p: Paint) => (p === 'steel' ? M.black : M[p])

export const COL = {
  red: new Color(C.red),
  cobalt: new Color(C.cobalt),
  yellow: new Color(C.yellow),
  ash: new Color('#f1f3f3'),
  card: new Color('#f4f5f5'),
  grey: new Color('#aeb5bb'),
  steel: new Color('#2a2e33'),
  white: new Color('#ffffff'),
  lampOff: new Color('#3a3f45'),
}

// ── Easing and springs ────────────────────────────────────────────────────

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
export const gravity = (t: number) => 0.3 * t + 0.7 * t * t
export const roll = (t: number) => 0.18 * t + 0.82 * easeInOut(t)

/** One damped spring step; sub-steps keep big frames stable. */
export function spring(s: { x: number; v: number }, target: number, k: number, c: number, dt: number) {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)))
  const h = dt / n
  for (let i = 0; i < n; i++) {
    s.v += (-(s.x - target) * k - s.v * c) * h
    s.x += s.v * h
  }
}

// ── The effect bus ────────────────────────────────────────────────────────

export type LampState = 'idle' | 'pass' | 'fail' | 'skip'
interface Pulse {
  pos: Vector3
  color: Color
  t: number
  size: number
}

const fresh = () => ({
  gates: GATES.map(() => ({ flap: { x: 0, v: 0 }, lamp: 'idle' as LampState, flash: 0, kick: 0, shake: 0 })),
  sw: { angle: { x: Math.PI, v: 0 }, target: Math.PI, deciding: 0 },
  hopper: { [R01]: { gulp: 0 }, [R21]: { gulp: 0 } } as Record<string, { gulp: number }>,
  lock: {
    [R01]: { a: { x: 1.62, v: 0 }, frozen: false, rattle: 0 },
    [R21]: { a: { x: 1.62, v: 0 }, frozen: false, rattle: 0 },
  } as Record<string, { a: { x: number; v: number }; frozen: boolean; rattle: number }>,
  bench: Object.fromEntries(RESEARCHER_IDS.map(id => [id, { send: 0, recv: 0, color: COL.yellow.clone() }])) as Record<string, { send: number; recv: number; color: Color }>,
  ticker: { tick: 0, reel: 0 },
  press: { stamp: 0, color: COL.yellow.clone(), sheets: 0 },
  lift: { y: 0, active: false },
  desk: { ping: 0 },
  follow: { pos: new Vector3(), has: false, settled: false },
  pulses: [] as Pulse[],
})

export let fx = fresh()
export const resetFx = () => {
  fx = fresh()
}
export const pulse = (pos: Vector3, color: Color, size = 1) => {
  fx.pulses.push({ pos: pos.clone(), color, t: 0, size })
  if (fx.pulses.length > 12) fx.pulses.shift()
}

// ── UI store (selection, hover, follow) ──────────────────────────────────

interface Ui {
  selected?: string
  hover?: string
  follow?: string
  requestOpen: boolean
  sheet?: 'request' | 'desk' | 'ledger' | 'parts' | 'detail'
}
let ui: Ui = { requestOpen: false }
const subs = new Set<() => void>()
export const uiStore = {
  get: () => ui,
  set(p: Partial<Ui>) {
    ui = { ...ui, ...p }
    subs.forEach(f => f())
  },
  subscribe(f: () => void) {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
}
export const useUi = () => useSyncExternalStore(uiStore.subscribe, uiStore.get)

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
