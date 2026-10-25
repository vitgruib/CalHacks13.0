// Small building blocks: a rounded clay box, a cylinder, and the pick
// wrapper that turns pointer hover and click into the shared UI state. No
// words live in the scene; the hover card (Scene.tsx) and the sidebar carry them.

import { RoundedBox } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type { ReactNode } from 'react'
import type { Material } from 'three'
import type { V3 } from './layout'
import { selectNode, ui } from './store'

export function B({ p, s, m, r = 0.035, rot, shadow = true }: { p: V3; s: V3; m: Material; r?: number; rot?: V3; shadow?: boolean }) {
  const radius = Math.max(0.002, Math.min(r, Math.min(...s) / 2 - 0.002))
  return <RoundedBox args={s} radius={radius} smoothness={3} bevelSegments={2} position={p} rotation={rot} material={m} castShadow={shadow} receiveShadow />
}

export function Cyl({ p, r, h, m, seg = 32, rot, r2 }: { p: V3; r: number; h: number; m: Material; seg?: number; rot?: V3; r2?: number }) {
  return (
    <mesh position={p} rotation={rot} material={m} castShadow receiveShadow>
      <cylinderGeometry args={[r2 ?? r, r, h, seg]} />
    </mesh>
  )
}

/** Which node the pointer is over in the scene (the hover card follows only this, never a sidebar row). */
export const pointer = { id: null as string | null }

/** Hover and click on anything inside selects the node. Drags (orbiting) are ignored. */
export function Pick({ id, children }: { id: string; children: ReactNode }) {
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    pointer.id = id
    if (ui.get().hovered !== id) ui.set({ hovered: id })
  }
  const out = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (pointer.id === id) pointer.id = null
    if (ui.get().hovered === id) ui.set({ hovered: null })
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
