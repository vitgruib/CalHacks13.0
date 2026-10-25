// Mockup E, "Rule machine": Grant Test Auto as a precise marble-run instrument.
// Every request is a steel ball that runs six physical spending-rule gates;
// a switch sends it to a grant's hopper, across to the other grant, into the
// blocked bin, onto the grant manager's cradle, or round the waiting loop.

import { Canvas } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { NeutralToneMapping } from 'three'
import { useFlow } from '../../feed'
import { Hud } from './Hud'
import { uiStore } from './kit'
import { Labels } from './Labels'
import { setCursorEl } from './Parts'
import { Scene } from './Scene'
import './e.css'

const LABEL =
  'A marble-run model of the Ortiz Lab grant office. Researchers at five benches drop requests as steel balls; each ball runs six spending-rule gates at the purchasing agent and is switched to a grant hopper, the other grant, the blocked bin, the grant manager, or the waiting loop. Use the Parts list to open any part.'

export default function Demo() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setCursorEl(root.current)
    return () => {
      setCursorEl(null)
      uiStore.set({ selected: undefined, hover: undefined, follow: undefined, requestOpen: false, sheet: undefined })
    }
  }, [])
  useFlow(e => {
    if (e.type === 'reset') uiStore.set({ follow: undefined, hover: undefined })
  })
  return (
    <div className="demo-e" ref={root}>
      <Canvas
        className="e-canvas"
        shadows
        dpr={[1, 2]}
        camera={{ fov: 34, near: 0.5, far: 240, position: [1.5, 21.5, 27.5] }}
        gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: NeutralToneMapping }}
        onCreated={({ gl }) => {
          gl.domElement.setAttribute('role', 'img')
          gl.domElement.setAttribute('aria-label', LABEL)
        }}
        onPointerMissed={() => uiStore.set({ selected: undefined, sheet: uiStore.get().sheet === 'detail' ? undefined : uiStore.get().sheet })}
      >
        <Scene />
      </Canvas>
      <Labels />
      <Hud />
    </div>
  )
}
