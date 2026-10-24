// Scene-local state shared by the canvas and the HUD without re-rendering the
// canvas tree: selection and hover live in a tiny external store, in-scene DOM
// (labels, stamps, packet tags) hangs off one Overlay that projects anchors to
// the screen once per frame.

import { useSyncExternalStore } from 'react'
import * as THREE from 'three'

interface Ui {
  selected: string | null
  hovered: string | null
  requestOpen: boolean
}

let state: Ui = { selected: null, hovered: null, requestOpen: false }
const subs = new Set<() => void>()

export const ui = {
  get: () => state,
  set(p: Partial<Ui>) {
    state = { ...state, ...p }
    subs.forEach(f => f())
  },
  subscribe(f: () => void) {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
}

export const useUi = () => useSyncExternalStore(ui.subscribe, ui.get)

/** Request ids the viewer sent from the HUD, so their slips are marked. */
export const mine = new Set<string>()

/** Intro progress shared by scene parts: yScale rises from flat plan to model. */
export const stage = { yScale: 1, introDone: false, reduced: false }

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

interface Anchor {
  wrap: HTMLDivElement
  el: HTMLElement
  at: () => THREE.Vector3 | null
  prio: number
  seq: number
  shown: boolean
  dx: number
  culled: boolean
  until: number
}

const v = new THREE.Vector3()

// Who wins when two in-scene labels collide: the moment beats the furniture.
function basePrio(el: HTMLElement) {
  const c = el.classList
  if (c.contains('dd-rules')) return 100
  if (c.contains('dd-land')) return 90
  if (c.contains('dd-note')) return 88
  if (c.contains('dd-tag-grant')) return 84
  if (c.contains('dd-seal')) return 80
  if (c.contains('dd-callout')) return 75
  if (c.contains('dd-tag-agent')) return 60
  if (c.contains('dd-ptag')) return 58
  if (c.contains('dd-tag-person')) return 55
  if (c.contains('dd-tag-researcher')) return 50
  if (c.contains('dd-tag-source')) return 45
  if (c.contains('dd-zone')) return 10
  return 48
}

const HUD = '.dd-brand, .dd-top-r, .dd-hero h1, .dd-lede, .dd-cta, .dd-tray-chip, .dd-narr, .dd-sheetinfo, .dd-side > *, .dd-req, .dd-parts-pop, .dd-drawer'
const PAD = 3
const EDGE = 8

type Box = [number, number, number, number]
const hit = (a: Box, b: Box) => a[0] < b[2] + PAD && a[2] + PAD > b[0] && a[1] < b[3] + PAD && a[3] + PAD > b[1]

function rectOf(el: HTMLElement): Box | null {
  let r = el.getBoundingClientRect()
  if (r.width < 1 && el.children.length) {
    let box: Box | null = null
    for (const c of el.children) {
      r = c.getBoundingClientRect()
      if (r.width < 1) continue
      box = box ? [Math.min(box[0], r.left), Math.min(box[1], r.top), Math.max(box[2], r.right), Math.max(box[3], r.bottom)] : [r.left, r.top, r.right, r.bottom]
    }
    return box
  }
  return r.width < 1 ? null : [r.left, r.top, r.right, r.bottom]
}

export class Overlay {
  root: HTMLDivElement | null = null
  private items = new Set<Anchor>()
  private seq = 0
  private frame = 0

  add(el: HTMLElement, at: () => THREE.Vector3 | null): Anchor {
    const wrap = document.createElement('div')
    wrap.className = 'dd-anchor'
    wrap.style.visibility = 'hidden'
    wrap.appendChild(el)
    const a = { wrap, el, at, prio: basePrio(el), seq: this.seq++, shown: false, dx: 0, culled: false, until: 0 }
    this.items.add(a)
    this.root?.appendChild(wrap)
    this.frame = 0
    return a
  }

  remove(a: Anchor) {
    this.items.delete(a)
    a.wrap.remove()
  }

  clear(filter: (a: Anchor) => boolean) {
    for (const a of [...this.items]) if (filter(a)) this.remove(a)
  }

  update(camera: THREE.Camera, w: number, h: number) {
    if (!this.root) return
    for (const a of this.items) {
      if (!a.wrap.isConnected) this.root.appendChild(a.wrap)
      const p = a.at()
      a.shown = false
      if (!p) {
        a.wrap.style.visibility = 'hidden'
        continue
      }
      v.copy(p).project(camera)
      if (v.z > 1 || v.z < -1) {
        a.wrap.style.visibility = 'hidden'
        continue
      }
      a.shown = true
      a.wrap.style.visibility = ''
      a.wrap.style.transform = `translate3d(${((v.x + 1) / 2) * w + a.dx}px, ${((1 - v.y) / 2) * h}px, 0)`
    }
    if (this.frame++ % 6 === 0) this.declutter(w)
  }

  /** Keep labels inside the viewport and, where two still collide, fade the
   *  lower-priority one. HUD panels count as obstacles. Runs at ~10 Hz. */
  private declutter(w: number) {
    const t = performance.now()
    const scope = this.root?.parentElement
    const placed: Box[] = []
    if (scope) for (const e of scope.querySelectorAll<HTMLElement>(HUD)) {
      const r = e.getBoundingClientRect()
      if (r.width > 1 && r.height > 1) placed.push([r.left, r.top, r.right, r.bottom])
    }
    const hud = placed.slice()
    const { hovered, selected } = state
    const live: { a: Anchor; r: Box; p: number }[] = []
    for (const a of this.items) {
      const d = a.el.dataset
      if (!a.shown || d.on === '0' || d.state === 'off') continue
      const got = rectOf(a.el)
      if (!got) continue
      const zone = a.el.classList.contains('dd-zone')
      const r: Box = [got[0] - a.dx, got[1], got[2] - a.dx, got[3]]
      let dx = 0
      if (!zone && r[2] - r[0] < w - 2 * EDGE) {
        if (r[0] < EDGE) dx = EDGE - r[0]
        else if (r[2] > w - EDGE) dx = w - EDGE - r[2]
      }
      if (Math.abs(dx - a.dx) > 0.5) {
        a.dx = dx
        a.el.style.setProperty('--dx', `${dx}px`)
      }
      r[0] += a.dx
      r[2] += a.dx
      if (a.el.classList.contains('dd-land')) {
        // a verdict always lands: if it would rise into a HUD panel, it drops below the desk instead
        if (d.flip !== '1' && hud.some(b => hit(r, b))) d.flip = '1'
        placed.push(r)
        continue
      }
      const id = d.id
      const p = zone && (r[0] < 0 || r[2] > w) ? -1 : id && (id === hovered || id === selected) ? 200 : a.prio
      live.push({ a, r, p })
    }
    live.sort((x, y) => y.p - x.p || x.a.seq - y.a.seq)
    for (const { a, r, p } of live) {
      const blocked = p < 0 || (p < 200 && placed.some(b => hit(r, b)))
      const cull = blocked || (a.culled && t < a.until && p < 200)
      if (!cull) placed.push(r)
      if (cull !== a.culled) {
        a.culled = cull
        if (cull) a.until = t + 600
        a.wrap.dataset.cull = cull ? '1' : '0'
      }
    }
  }
}

export const overlay = new Overlay()

export function el(tag: string, cls: string, text?: string) {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
