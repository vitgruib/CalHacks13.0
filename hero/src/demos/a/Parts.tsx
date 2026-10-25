// Small building blocks shared by both plinths: rounded clay boxes,
// cylinders, the pick wrapper and the in-scene name chips. Names stay hidden
// at rest; they show on hover, selection, or for a moment while that actor
// sends or receives something.

import { Html, RoundedBox } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CanvasTexture, SRGBColorSpace, type Material } from 'three'
import { useFlow } from '../../feed'
import type { Packet } from '../../feed'
import { PLINTH_D, type V3 } from './layout'
import { selectNode, ui, useUi } from './store'

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

// Routine traffic (the daily "no change" readings) doesn't flash anyone's name.
const routine = (p: Packet) => p.kind === 'reading' && /no change/.test(p.label)

/** True for a moment after a meaningful packet leaves or reaches the node. */
export function useFlash(id: string, ms = 2000) {
  const [on, setOn] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useFlow(e => {
    if (e.type === 'reset') {
      setOn(false)
      return
    }
    if ((e.type === 'packet' && e.packet.from === id && !routine(e.packet)) || (e.type === 'arrive' && e.packet.to === id && !routine(e.packet))) {
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
  nudge,
  children,
}: {
  id: string
  at: V3
  title: string
  sub?: string
  tone?: 'light' | 'dark'
  nudge?: number
  children?: ReactNode
}) {
  const on = useUi(s => s.hovered === id || s.selected === id)
  const flash = useFlash(id)
  const shown = on || flash
  return (
    <Html position={at} zIndexRange={[20, 10]} wrapperClass="a-html" pointerEvents="none">
      <div
        className={`a-chip a-chip--${tone}${on ? ' is-on' : ''}${flash && !on ? ' is-flash' : ''}${shown ? '' : ' is-hidden'}`}
        style={nudge === undefined ? undefined : { translate: `${nudge * 100}% -100%` }}
        aria-hidden="true"
      >
        <span className="a-chip-title">{title}</span>
        {sub && on && <span className="a-chip-sub">{sub}</span>}
        {on && children}
      </div>
    </Html>
  )
}

/** A name debossed into a plinth's front face: a canvas texture, no web font. */
function plateTexture(text: string, ink: string, light: string) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 128
  const g = c.getContext('2d')
  if (g) {
    g.font = '600 64px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const t = text.toUpperCase().split('').join(String.fromCharCode(8202))
    g.fillStyle = light
    g.fillText(t, 512, 66)
    g.fillStyle = ink
    g.fillText(t, 512, 62)
  }
  return c
}

export function NamePlate({ text, x, ink, light }: { text: string; x: number; ink: string; light: string }) {
  const tex = useMemo(() => {
    const t = new CanvasTexture(plateTexture(text, ink, light))
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [text, ink, light])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <mesh position={[x, -0.56, PLINTH_D / 2 + 0.004]}>
      <planeGeometry args={[4.6, 0.575]} />
      <meshStandardMaterial map={tex} transparent roughness={0.9} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  )
}
