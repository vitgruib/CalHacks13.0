// Round 3 network mock n1 "Neural net": the finance office as a small neural
// network on a clay deck. A request is a signal from the lab that propagates
// layer to layer, lighting the weights it crosses; the answer rides the lane
// back out. Same studio as a1 (pale grey void, warm key, soft AO), its own
// scene. The root never re-renders except for the one caption line.

import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useMemo } from 'react'
import { BackSide, Color, ShaderMaterial, Vector3 } from 'three'
import { feed, useWorld } from '../../feed'
import { PAL } from '../a1/layout'
import { clearGlow } from './glow'
import { LabelLayer, LabelTracker } from './labels'
import { Net } from './Net'
import { Signals } from './Signals'
import './demo-n1.css'

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
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[120, 32, 16]} />
    </mesh>
  )
}

function Ground() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        depthWrite: false,
        uniforms: { inner: { value: new Color(PAL.ground) }, outer: { value: new Color(PAL.void) } },
        vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 inner; uniform vec3 outer; varying vec2 vP; void main() { float d = length(vP * vec2(0.62, 1.0)) / 24.0; float k = 1.0 - smoothstep(0.0, 1.0, d); gl_FragColor = vec4(mix(outer, inner, k * k), 1.0); }',
      }),
    [],
  )
  return (
    <mesh material={mat} position={[0, -2.6, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <planeGeometry args={[140, 140]} />
    </mesh>
  )
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#FFF8EE', '#8A93A0', 0.62]} />
      <directionalLight
        position={[-10, 18, 10]}
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
        shadow-camera-far={60}
      />
      <directionalLight position={[16, 7, 8]} intensity={0.55} color="#CFE0F5" />
      <directionalLight position={[6, 9, -16]} intensity={0.85} color="#EAF2FF" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.0} position={[-4, 9, 3]} rotation={[Math.PI / 2, 0, 0]} scale={[16, 8, 1]} color="#FFF6EA" />
        <Lightformer form="rect" intensity={1.0} position={[-12, 4, 6]} rotation={[0, Math.PI / 2.4, 0]} scale={[10, 4, 1]} color="#FFF1E2" />
        <Lightformer form="rect" intensity={0.9} position={[12, 3, -4]} rotation={[0, -Math.PI / 2.2, 0]} scale={[10, 3, 1]} color="#D6E4F2" />
        <Lightformer form="ring" intensity={1.4} position={[6, 6, -12]} scale={4} color="#EAF2FF" />
      </Environment>
    </>
  )
}

/** A fixed three-quarter view that sways a degree or two, and fits the deck to the window's shape. */
const TARGET = new Vector3(-0.5, 0, 0.3)
const DIR = new Vector3(0, 0.82, 0.6).normalize()
function Rig() {
  const { camera, size } = useThree()
  const off = useMemo(() => new Vector3(), [])
  useFrame(({ clock }) => {
    const aspect = size.width / Math.max(1, size.height)
    // Wide windows need less distance to fit the deck's 17 units across.
    const dist = Math.max(24, 42 / Math.min(aspect, 1.9) + 2)
    const a = 0.03 * Math.sin((clock.elapsedTime / 24) * Math.PI * 2)
    off.copy(DIR).multiplyScalar(dist).applyAxisAngle(new Vector3(0, 1, 0), a)
    camera.position.copy(TARGET).add(off)
    camera.lookAt(TARGET)
  })
  return null
}

function Caption() {
  const title = useWorld().beat?.title
  return title ? (
    <p className="n1-caption" aria-live="polite">
      {title}
    </p>
  ) : null
}

// For screenshot scripts in development: pause and step the story to an exact moment.
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __n1Feed: feed, __n1Clear: clearGlow })

export default function Demo() {
  return (
    <div className="demo-n1">
      <Canvas
        className="n1-canvas"
        shadows="percentage"
        dpr={[1, 1.5]}
        camera={{ fov: 26, near: 0.5, far: 300, position: [0, 16, 13] }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        role="img"
        aria-label="The grant office as a small clay neural network. Requests from the lab enter at the left as signals, fan through the purchasing agent's six rule neurons, pass the bookkeeping agent and the grants, light one of four outcome neurons, and the answer rides a lane back to the lab."
      >
        <Backdrop />
        <Ground />
        <Lights />
        <Net />
        <Signals />
        <ContactShadows position={[0, -0.49, 0]} scale={[26, 16]} blur={2.6} far={3} opacity={0.32} resolution={512} frames={1} color="#3A3530" />
        <Rig />
        <LabelTracker />
        <EffectComposer multisampling={4}>
          <N8AO halfRes quality="low" aoRadius={0.5} distanceFalloff={0.7} intensity={1.6} color="#26303B" />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      </Canvas>
      <LabelLayer />
      <Caption />
    </div>
  )
}
