// The studio, as in a1: a pale grey seamless void, a warm key from the upper
// left, a cool fill, soft contact shadows and ambient occlusion. The camera
// is fixed on the board from the front, a little above, so every lane and
// both grants stay in view.

import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo } from 'react'
import { BackSide, Color, ShaderMaterial, type PerspectiveCamera } from 'three'
import { useFlow } from '../../feed'
import { PAL } from '../a1/layout'
import { Board } from './Board'
import { Labels } from './Labels'
import { Pieces } from './Pieces'
import { clearAll, fromWorld, onEvent } from './story'

function Backdrop() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: { top: { value: new Color(PAL.voidHi) }, bottom: { value: new Color(PAL.void) } },
        vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main() { float h = smoothstep(-0.25, 0.55, vP.y); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
      }),
    [],
  )
  return (
    <mesh material={mat} renderOrder={-1} raycast={() => null}>
      <sphereGeometry args={[120, 32, 16]} />
    </mesh>
  )
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#FFF8EE', '#8A93A0', 0.7]} />
      <directionalLight
        position={[-5, 19, 7]}
        intensity={2.4}
        color="#FFF0DC"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={50}
      />
      <directionalLight position={[14, 7, 8]} intensity={0.5} color="#CFE0F5" />
      <directionalLight position={[4, 9, -14]} intensity={0.8} color="#EAF2FF" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.0} position={[-4, 9, 3]} rotation={[Math.PI / 2, 0, 0]} scale={[16, 8, 1]} color="#FFF6EA" />
        <Lightformer form="rect" intensity={1.0} position={[-12, 4, 6]} rotation={[0, Math.PI / 2.4, 0]} scale={[10, 4, 1]} color="#FFF1E2" />
        <Lightformer form="rect" intensity={0.9} position={[12, 3, -4]} rotation={[0, -Math.PI / 2.2, 0]} scale={[10, 3, 1]} color="#D6E4F2" />
        <Lightformer form="ring" intensity={1.4} position={[6, 6, -12]} scale={4} color="#EAF2FF" />
      </Environment>
    </>
  )
}

/** Frame the whole table for the window's shape: back off on narrow screens. */
function Aim() {
  const camera = useThree(s => s.camera) as PerspectiveCamera
  const aspect = useThree(s => s.size.width / Math.max(1, s.size.height))
  useEffect(() => {
    const k = Math.max(1, 1.62 / aspect)
    camera.position.set(0, 17.6 * k, 10.0 * k)
    camera.lookAt(0, 0, -0.5)
    camera.updateProjectionMatrix()
  }, [camera, aspect])
  return null
}

/** Feed events in; the board's memory rebuilt from the world on mount. */
function Director() {
  useEffect(() => {
    clearAll()
    fromWorld()
    return () => clearAll()
  }, [])
  useFlow(onEvent)
  return null
}

export default function Scene() {
  return (
    <Canvas
      className="n5-canvas"
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: 32, near: 0.5, far: 300, position: [0, 17.6, 10.0] }}
      gl={{ antialias: false }}
      role="img"
      aria-label="A clay kanban board for the grant office. Each purchase request is a card that slides in from the lab, gets a stamp for each of six spending rules, and lands in the Bought, Rerouted, Blocked or Held tray. Invoices and papers are cards in the bookkeeping and payment and report lanes. The two grants are coin stacks; a frozen one sits under a glass cloche."
    >
      <Backdrop />
      <Lights />
      <Aim />
      <Director />
      <Board />
      <Pieces />
      <Labels />
      <ContactShadows position={[0, -0.62, -0.5]} scale={[24, 14]} blur={2.6} far={3} opacity={0.32} resolution={512} frames={1} color="#3A3530" />
      <EffectComposer multisampling={4}>
        <N8AO halfRes quality="low" aoRadius={0.5} distanceFalloff={0.7} intensity={1.8} color="#26303B" />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
    </Canvas>
  )
}
