// Small building blocks shared by the lab and the table: rounded clay
// boxes, cylinders, and the pick wrapper that turns pointer hover and click
// into the viewer's hover and selection. Nothing here prints a word.

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

/** Hover and click on anything inside marks the node. Drags (orbiting) are ignored. `select={false}` hovers only. */
export function Pick({ id, children, select = true }: { id: string; children: ReactNode; select?: boolean }) {
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const s = ui.get()
    if (s.hovered !== id || s.hoverSrc !== 'scene') ui.set({ hovered: id, hoverSrc: 'scene' })
  }
  const out = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const s = ui.get()
    if (s.hovered === id && s.hoverSrc !== 'dashboard') ui.set({ hovered: null, hoverSrc: null })
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 6 || !select) return
    selectNode(id)
  }
  return (
    <group onPointerOver={over} onPointerOut={out} onClick={click}>
      {children}
    </group>
  )
}
