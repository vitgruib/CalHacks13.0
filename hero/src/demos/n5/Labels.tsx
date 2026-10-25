// The board's few words, as plain DOM over the canvas: each pin is a point
// on the board projected to the screen every frame. Made by hand rather than
// with drei's Html, whose per-label React roots drop labels under StrictMode.

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

export interface Pin {
  at: Vector3
  text: string
  kind: string
  show: boolean
}
export const PINS = new Map<string, Pin>()

const v = new Vector3()

export function Labels() {
  const gl = useThree(s => s.gl)
  const host = useRef<HTMLDivElement | null>(null)
  const els = useRef(new Map<string, HTMLDivElement>())
  useEffect(() => {
    const h = document.createElement('div')
    h.className = 'n5-pins'
    gl.domElement.parentElement?.appendChild(h)
    host.current = h
    const map = els.current
    return () => {
      h.remove()
      map.clear()
      host.current = null
    }
  }, [gl])
  useFrame(({ camera, size }) => {
    const h = host.current
    if (!h) return
    for (const [id, el] of els.current)
      if (!PINS.has(id)) {
        el.remove()
        els.current.delete(id)
      }
    for (const [id, p] of PINS) {
      let el = els.current.get(id)
      if (!el) {
        el = document.createElement('div')
        h.appendChild(el)
        els.current.set(id, el)
      }
      const cls = `n5-label n5-${p.kind}`
      if (el.className !== cls) el.className = cls
      if (el.textContent !== p.text) el.textContent = p.text
      el.style.display = p.show && p.text ? '' : 'none'
      if (!p.show) continue
      v.copy(p.at).project(camera)
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`
    }
  })
  return null
}
