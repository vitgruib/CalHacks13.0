// Picking. Pointer over a 3D object sets the shared `hovered` (and, for a
// mouse, remembers that the scene set it, so only then does the hover card
// show); a click selects. Drags (orbiting) are ignored.

import type { ThreeEvent } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import { zoneAt } from './layout'
import { fx, selectNode, ui } from './store'

const isMouse = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
  const t = (e.nativeEvent as PointerEvent).pointerType
  return t === undefined || t === 'mouse' || t === 'pen'
}

export function hoverOn(id: string, mouse: boolean) {
  fx.sceneHover = mouse ? id : null
  if (ui.get().hovered !== id) ui.set({ hovered: id })
}
export function hoverOff(id: string) {
  if (fx.sceneHover === id) fx.sceneHover = null
  if (ui.get().hovered === id) ui.set({ hovered: null })
}

export function Pick({ id, children }: { id: string; children: ReactNode }) {
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hoverOn(id, isMouse(e))
  }
  const out = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hoverOff(id)
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 6) return
    selectNode(id)
  }
  return (
    <group onPointerOver={over} onPointerOut={out} onClick={click}>
      {children}
    </group>
  )
}

/** The lab's furniture is one mesh: which station is under the pointer comes from where it hits. */
export function ZonePick({ children }: { children: ReactNode }) {
  const cur = useRef<string | null>(null)
  const set = (id: string | null, mouse: boolean) => {
    if (id === cur.current) return
    if (cur.current) hoverOff(cur.current)
    cur.current = id
    if (id) hoverOn(id, mouse)
  }
  return (
    <group
      onPointerMove={e => {
        e.stopPropagation()
        set(zoneAt(e.point.x, e.point.z), isMouse(e))
      }}
      onPointerOut={() => set(null, false)}
      onClick={e => {
        e.stopPropagation()
        if (e.delta > 6) return
        const id = zoneAt(e.point.x, e.point.z)
        if (id) selectNode(id)
      }}
    >
      {children}
    </group>
  )
}
