// Mockup C: Money terrain. Each grant is a landform whose height is its truly
// available money; a cancellation ices it over, a court order lights a thin
// path across the ice, and only a payment thaws it. The lab is a lit
// settlement on the plain; requests climb a switchback past six rule cairns
// to the purchasing observatory and the answer comes back down.

import { EffectComposer, Bloom, ToneMapping, Vignette } from '@react-three/postprocessing'
import { Canvas } from '@react-three/fiber'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFlow } from '../../feed'
import { CameraRig } from './CameraRig'
import { Hud } from './Hud'
import { INTRO } from './layout'
import { Packets } from './Packets'
import { Horizon, Ridge, Settlement } from './Places'
import { Sky } from './Sky'
import { overlay, ui } from './store'
import { GrantPaths, MesaLevelsAll, Pools, Terrain } from './Terrain'
import { FOG } from './terrainMaterial'
import './demo-c.css'

function Scene() {
  return (
    <>
      <color attach="background" args={['#0a101b']} />
      <fog attach="fog" args={[FOG, 38, 120]} />
      <hemisphereLight args={['#5d6f93', '#2e2116', 0.75]} />
      <directionalLight position={[-30, 12, -18]} intensity={1.7} color="#ffad74" />
      <pointLight position={[0, 2.4, 12.5]} intensity={9} distance={16} decay={1.5} color="#ffa04a" />
      <Sky />
      <Terrain />
      <Pools />
      <GrantPaths />
      <MesaLevelsAll />
      <Settlement />
      <Ridge />
      <Horizon />
      <Packets />
      <CameraRig />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={0.95} luminanceThreshold={0.9} luminanceSmoothing={0.25} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.32} darkness={0.5} />
      </EffectComposer>
    </>
  )
}

export default function Demo() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ui.set({ hovered: null, selected: null, panel: null, mine: [], cameraIdle: false })
    return ui.subscribe(() => {
      if (root.current) root.current.style.cursor = ui.get().hovered ? 'pointer' : ''
    })
  }, [])

  useFlow(e => {
    if (e.type === 'reset') ui.set({ mine: [] })
  })

  return (
    <div className="demo-c" ref={root}>
      <Canvas
        className="c-canvas"
        dpr={[1, 2]}
        camera={{ fov: 40, near: 0.1, far: 500, position: INTRO.pos.toArray() }}
        gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: 'high-performance' }}
        role="img"
        aria-label="A dusk landscape: the Ortiz Lab's five researchers in a lit settlement on the plain send requests up a switchback to the purchasing agent's observatory; the two grants stand behind the ridge as landforms whose height is their truly available money."
        onPointerMissed={() => ui.set({ hovered: null })}
      >
        <Scene />
      </Canvas>
      <div
        className="c-overlay"
        aria-hidden
        ref={el => {
          overlay.el = el
        }}
      />
      <Hud />
    </div>
  )
}
