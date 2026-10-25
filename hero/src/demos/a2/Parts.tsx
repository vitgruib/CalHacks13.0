// The pick wrapper shared by the lab and the mobile. Hovering anything inside
// sets the shared `hovered` id (the sidebar highlights its row) and marks it
// as hovered from the stage (the hover card follows only that). A click
// selects it; drags (orbiting) are ignored.

import type { ThreeEvent } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { fx, selectNode, ui } from './store'

export function Pick({ id, children }: { id: string; children: ReactNode }) {
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    fx.pointer = id
    if (ui.get().hovered !== id) ui.set({ hovered: id })
    document.body.style.cursor = 'pointer'
  }
  const out = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (fx.pointer === id) fx.pointer = null
    if (ui.get().hovered === id) ui.set({ hovered: null })
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
