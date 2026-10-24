// Small building blocks shared by both plinths: rounded clay boxes,
// cylinders, the pick wrapper and the in-scene chips.

import { Html, RoundedBox } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Material } from 'three'
import { useFlow } from '../../feed'
import type { V3 } from './layout'
import { selectNode, ui, useUi } from './store'

export function B({ p, s, m, r = 0.035, rot }: { p: V3; s: V3; m: Material; r?: number; rot?: V3 }) {
  const radius = Math.max(0.002, Math.min(r, Math.min(...s) / 2 - 0.002))
  return <RoundedBox args={s} radius={radius} smoothness={2} bevelSegments={2} position={p} rotation={rot} material={m} castShadow receiveShadow />
}

export function Cyl({ p, r, h, m, seg = 28, rot, r2 }: { p: V3; r: number; h: number; m: Material; seg?: number; rot?: V3; r2?: number }) {
  return (
    <mesh position={p} rotation={rot} material={m} castShadow receiveShadow>
      <cylinderGeometry args={[r2 ?? r, r, h, seg]} />
    </mesh>
  )
}

/** Hover and click on anything inside selects the node. Drags (orbiting) are ignored. */
export function Pick({ id, children }: { id: string; children: ReactNode }) {
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (ui.get().hovered !== id) ui.set({ hovered: id })
  }
  const out = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
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

/** True for a few seconds after a packet leaves or reaches the node. */
export function useFlash(id: string, ms = 3600) {
  const [on, setOn] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useFlow(e => {
    if (e.type === 'reset') {
      setOn(false)
      return
    }
    if ((e.type === 'packet' && e.packet.from === id) || (e.type === 'arrive' && e.packet.to === id)) {
      setOn(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setOn(false), ms)
    }
  })
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return on
}

export function Chip({
  id,
  at,
  title,
  sub,
  tone = 'light',
  quiet = false,
  minor = false,
  hoverSub = false,
  nudge,
  children,
}: {
  id: string
  at: V3
  title: string
  sub?: string
  tone?: 'light' | 'dark'
  quiet?: boolean
  minor?: boolean
  hoverSub?: boolean
  nudge?: number
  children?: ReactNode
}) {
  const on = useUi(s => s.hovered === id || s.selected === id)
  const flash = useFlash(id)
  return (
    <Html position={at} zIndexRange={[20, 10]} wrapperClass="a-html" pointerEvents="none">
      <div
        className={`a-chip a-chip--${tone}${on ? ' is-on' : ''}${quiet && !on ? ' is-quiet' : ''}${minor ? ' is-minor' : ''}${flash ? ' is-flash' : ''}`}
        style={nudge === undefined ? undefined : { translate: `${nudge * 100}% -100%` }}
      >
        <span className="a-chip-title">{title}</span>
        {sub && (!hoverSub || on) && <span className="a-chip-sub">{sub}</span>}
        {children}
      </div>
    </Html>
  )
}
