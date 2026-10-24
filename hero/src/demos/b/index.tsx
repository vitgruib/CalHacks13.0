// B — Cutaway. An architect's section model of the science building, cut
// open: the lab on the left, the grant office on the right, pneumatic tubes
// between them. Requests go down the tubes as capsules; answers come back.

import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Hud } from './Hud'
import { LabelLayer } from './Labels'
import { Scene } from './Scene'
import { resetScene, select, ui } from './state'
import './demo-b.css'

function useReducedMotion() {
  const q = '(prefers-reduced-motion: reduce)'
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setR(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return r
}

const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Barlow+Semi+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap'

export default function Demo() {
  const reduced = useReducedMotion()
  useEffect(() => {
    if (!document.querySelector('link[data-demo-b-fonts]')) {
      const l = document.createElement('link')
      l.rel = 'stylesheet'
      l.href = FONTS
      l.dataset.demoBFonts = ''
      document.head.appendChild(l)
    }
    resetScene()
    return () => {
      select(null)
      ui.stage = null
    }
  }, [])
  return (
    <div className="demo-b">
      <div
        className="b-stage"
        role="img"
        aria-label="A cut-open model of the science building. On the left, five researchers work in their labs. On the right, the grant office: the purchasing agent's rule room, the bookkeeping records room, the payment and report room, the grant manager's office, and two basement vaults holding the grants. Request capsules travel between them through pneumatic tubes."
        ref={el => {
          ui.stage = el
        }}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ fov: 26, near: 0.5, far: 420, position: [-27, 3.4, 24] }}
          gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NoToneMapping
            gl.shadowMap.type = THREE.PCFSoftShadowMap
          }}
          onPointerMissed={() => select(null)}
        >
          <Scene reduced={reduced} />
        </Canvas>
        <LabelLayer />
      </div>
      <Hud />
    </div>
  )
}
