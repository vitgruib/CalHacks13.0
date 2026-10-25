// The pick wrapper: pointing at anything inside marks it hovered (the scene
// shows its hover card), clicking selects it. Drags (orbiting) are ignored.

import type { ThreeEvent } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { pointer, selectNode, ui } from './store'
import { useZones } from './zones'

export function Pick({ id, children }: { id: string; children: ReactNode }) {
  // Zone mode (the landing): the whole plinth is the target, so single nodes neither hover nor select.
  const zoned = useZones()
  if (zoned) return <group>{children}</group>
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    pointer.id = id
    const s = ui.get()
    if (s.hovered !== id || s.hoverFrom) ui.set({ hovered: id, hoverFrom: null })
    document.body.style.cursor = 'pointer'
  }
  const out = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (pointer.id === id) pointer.id = null
    const s = ui.get()
    if (s.hovered === id && s.hoverFrom !== 'sidebar') ui.set({ hovered: null })
    document.body.style.cursor = ''
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
