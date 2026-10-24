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
}

const v = new THREE.Vector3()

export class Overlay {
  root: HTMLDivElement | null = null
  private items = new Set<Anchor>()

  add(el: HTMLElement, at: () => THREE.Vector3 | null): Anchor {
    const wrap = document.createElement('div')
    wrap.className = 'dd-anchor'
    wrap.style.visibility = 'hidden'
    wrap.appendChild(el)
    const a = { wrap, el, at }
    this.items.add(a)
    this.root?.appendChild(wrap)
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
      if (!p) {
        a.wrap.style.visibility = 'hidden'
        continue
      }
      v.copy(p).project(camera)
      if (v.z > 1 || v.z < -1) {
        a.wrap.style.visibility = 'hidden'
        continue
      }
      a.wrap.style.visibility = ''
      a.wrap.style.transform = `translate3d(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px, 0)`
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
