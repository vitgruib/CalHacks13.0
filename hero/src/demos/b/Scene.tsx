// The model on its table, lit by daylight from one side.

import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { Capsules } from './Capsules'
import { Director } from './Director'
import { Projector } from './Labels'
import { Rig } from './Rig'
import { Rooms } from './Rooms'
import { Facade, Structure } from './Structure'

const SKY_TOP = '#9eacba'
const SKY_LOW = '#d9dcda'

function Backdrop() {
  const scene = useThree(s => s.scene)
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 256
    const g = c.getContext('2d')
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, 256)
      grad.addColorStop(0, SKY_TOP)
      grad.addColorStop(0.62, '#c6cdd2')
      grad.addColorStop(1, SKY_LOW)
      g.fillStyle = grad
      g.fillRect(0, 0, 4, 256)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useEffect(() => {
    scene.background = tex
    scene.fog = new THREE.Fog(SKY_LOW, 90, 230)
    return () => {
      scene.background = null
      scene.fog = null
      tex.dispose()
    }
  }, [scene, tex])
  return null
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#e4ecf3', '#b8a68c', 0.95]} />
      <ambientLight intensity={0.16} />
      <directionalLight
        position={[-34, 26, 30]}
        intensity={2.7}
        color="#fff0dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-36}
        shadow-camera-right={36}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
      />
      <directionalLight position={[26, 8, 34]} intensity={0.32} color="#cddbea" />
    </>
  )
}

export function Scene({ reduced }: { reduced: boolean }) {
  return (
    <>
      <Backdrop />
      <Lights />
      <Structure />
      <Rooms />
      <Facade />
      <Capsules />
      <Director />
      <Rig reduced={reduced} />
      <Projector />
      <EffectComposer multisampling={0}>
        <N8AO halfRes aoRadius={1.4} distanceFalloff={1.2} intensity={2.2} quality="medium" color="#2f2a24" />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <SMAA />
      </EffectComposer>
    </>
  )
}
