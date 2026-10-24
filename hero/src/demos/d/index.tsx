// Mockup D, Cyanotype: the grant office as a living technical drawing on
// Prussian-blue paper. Lines draw themselves as work happens; verdicts land
// on the researcher's desk as rubber stamps.

import { useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Hud } from './Hud'
import { Scene } from './Scene'
import { overlay, reducedMotion, stage, ui } from './store'
import './demo-d.css'

export default function Demo() {
  const down = useRef<[number, number] | null>(null)

  useEffect(() => {
    stage.reduced = reducedMotion()
    stage.introDone = false
    stage.yScale = stage.reduced ? 1 : 0.02
    ui.set({ selected: null, hovered: null, requestOpen: false })
    return () => {
      document.body.style.cursor = ''
    }
  }, [])

  return (
    <div className="demo-d">
      <div className="dd-paper" aria-hidden="true" />
      <div
        className="dd-canvas"
        onPointerDown={e => (down.current = [e.clientX, e.clientY])}
      >
        <Canvas
          flat
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
          camera={{ fov: 30, near: 0.5, far: 400, position: [1.6, 56, 0.9] }}
          role="img"
          aria-label="A technical drawing of the Ortiz Lab and its AI grant office. Researchers on the left send request slips through the lab door to the purchasing agent, which checks each spending rule and sends a stamped answer back: bought, rerouted, blocked or held. Grant vaults on the right freeze when a grant is canceled and unfreeze when a payment lands. Use the Parts list to open any part."
          onPointerMissed={e => {
            const d = down.current
            if (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) < 5) ui.set({ selected: null })
          }}
        >
          <Scene />
        </Canvas>
      </div>
      <div className="dd-overlay" ref={el => void (overlay.root = el)} aria-hidden="true" />
      <Hud />
    </div>
  )
}
