// Round 3 network mock n3, "Marble run": the finance network as a clay marble
// run on a soft deck. Requests are marbles from the lab; the purchasing
// agent's six rules are gates; the outcome is the plinth a marble rolls onto
// and the glaze it carries home. The grants are solid clay blocks the funder's
// chute rolls money to; bookkeeping and payment & report are two small side tracks.

import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import { feed, useWorld } from '../../feed'
import { Deck } from './Deck'
import { PIN_KEYS, pins } from './pins'
import { Run } from './Run'
import { Backdrop, Effects, Ground, Lights, Shadows } from './Stage'
import './demo-n3.css'

// For screenshot scripts: pause and step the story to an exact moment.
if (import.meta.env.DEV) (window as unknown as { __n3Feed?: typeof feed }).__n3Feed = feed

const els = new Map<string, HTMLElement>()
const pv = new Vector3()

/** Pins each label's DOM node to its 3D anchor and eases its opacity. */
function Projector() {
  const { camera, size } = useThree()
  useFrame((_, dt) => {
    for (const key of PIN_KEYS) {
      const el = els.get(key)
      const p = pins[key]
      if (!el || !p) continue
      p.shown += (p.op - p.shown) * (1 - Math.exp(-Math.min(dt, 0.5) * 5))
      if (p.text && el.textContent !== p.text && (p.op > 0 || p.shown < 0.05)) el.textContent = p.text
      pv.copy(p.at).project(camera)
      const x = Math.round((pv.x * 0.5 + 0.5) * size.width)
      const y = Math.round((-pv.y * 0.5 + 0.5) * size.height)
      el.style.transform = `translate(${x}px, ${y}px) translate(${p.align === 'left' ? '0' : '-50%'}, -50%)`
      el.style.opacity = p.shown.toFixed(3)
    }
  })
  return null
}

function Caption() {
  const w = useWorld()
  return <div className="n3-caption">{w.beat?.title ?? ''}</div>
}

export default function Demo() {
  const root = useRef<HTMLDivElement>(null)
  return (
    <div className="demo-n3" ref={root}>
      <Canvas
        className="n3-canvas"
        shadows="percentage"
        dpr={[1, 1.5]}
        camera={{ fov: 30, near: 0.5, far: 300, position: [0.3, 17.5, 20.5] }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        role="img"
        aria-label="A clay marble run. Each purchase request is a marble that rolls in from the lab, through the purchasing agent's six rule gates, and rolls onto a plinth: bought, rerouted, blocked or held. Grants are clay blocks with a bar for the money left; the funder rolls a marble to one when it pays, and a frozen grant sits under a frosted jar."
      >
        <Backdrop />
        <Ground />
        <Lights />
        <Deck />
        <Run />
        <Shadows />
        <OrbitControls makeDefault target={[0.0, -0.3, 0.1]} enablePan={false} enableDamping dampingFactor={0.08} rotateSpeed={0.5} minDistance={10} maxDistance={40} minPolarAngle={0.35} maxPolarAngle={1.25} />
        <Projector />
        <Effects />
      </Canvas>
      <div className="n3-pins" aria-hidden="true">
        {PIN_KEYS.map(k => (
          <span
            key={k}
            className={`n3-pin n3-pin-${pins[k].kind}`}
            ref={el => {
              if (el) els.set(k, el)
              else els.delete(k)
            }}
          >
            {pins[k].text}
          </span>
        ))}
      </div>
      <Caption />
    </div>
  )
}
