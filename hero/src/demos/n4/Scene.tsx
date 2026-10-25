// The studio, after a1: a pale seamless void, a soft pool of light under one
// clay plinth, a warm key from the upper left, a cool fill and a faint rim.
// The camera faces the plumbing almost head on so every pipe reads as a line.

import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo } from 'react'
import { BackSide, Color, ShaderMaterial } from 'three'
import { feed } from '../../feed'
import { PAL } from '../a1/layout'
import { LabelLayer, LabelTracker } from './Labels'
import { Live } from './Live'
import { Plant } from './Plant'

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

function Ground() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        depthWrite: false,
        uniforms: { inner: { value: new Color(PAL.ground) }, outer: { value: new Color(PAL.void) } },
        vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 inner; uniform vec3 outer; varying vec2 vP; void main() { float d = length(vP * vec2(0.62, 1.0)) / 18.0; float k = 1.0 - smoothstep(0.0, 1.0, d); gl_FragColor = vec4(mix(outer, inner, k * k), 1.0); }',
      }),
    [],
  )
  return (
    <mesh material={mat} position={[0, -1.6, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1} raycast={() => null}>
      <planeGeometry args={[140, 140]} />
    </mesh>
  )
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#FFF8EE', '#8A93A0', 0.62]} />
      <directionalLight
        position={[-8, 16, 12]}
        intensity={2.5}
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
      <directionalLight position={[14, 7, 8]} intensity={0.55} color="#CFE0F5" />
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

const TARGET: [number, number, number] = [0.45, 1.35, 0.35]

export default function Scene() {
  // For screenshot scripts in development: step the story by hand.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __n4Feed?: typeof feed }).__n4Feed = feed
  }, [])
  return (
    <>
      <Canvas
        className="n4-canvas"
        shadows="percentage"
        dpr={[1, 1.5]}
        camera={{ fov: 30, near: 0.5, far: 300, position: [0.45, 10.0, 19.4] }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        role="img"
        aria-label="A clay plumbing model of the grant office. Each grant is a closed clay vault with a bar for the money left. A request from the lab opens a draw from its vault; a glowing capsule runs to the purchasing valve, whose six gauges check the spending rules, then flows on to vendors, switches vaults, runs back, or waits at a shut valve. Money from NIH arrives as capsules along an overhead pipe and clears a frozen vault."
      >
        <Backdrop />
        <Ground />
        <Lights />
        <Plant />
        <Live />
        <LabelTracker />
        <ContactShadows position={[0, -1.58, 0]} scale={[30, 14]} blur={3} far={3} opacity={0.3} resolution={512} frames={1} color="#3A3530" />
        <OrbitControls
          makeDefault
          target={TARGET}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.5}
          zoomSpeed={0.7}
          minDistance={8}
          maxDistance={40}
          minPolarAngle={0.6}
          maxPolarAngle={1.5}
          minAzimuthAngle={-0.9}
          maxAzimuthAngle={0.9}
        />
        <EffectComposer multisampling={4}>
          <N8AO halfRes quality="low" aoRadius={0.6} distanceFalloff={0.7} intensity={1.8} color="#26303B" />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      </Canvas>
      <LabelLayer />
    </>
  )
}
