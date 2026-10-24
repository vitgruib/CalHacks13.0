// The scene: light, ground, the machine, and the camera. The camera opens
// with one crane move from a researcher's bench out to the whole machine,
// then belongs to the viewer. Dropping a ball hands it to the follow rig
// until the ball lands, then it pulls back out.

import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useRef } from 'react'
import { CatmullRomCurve3, Vector3, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Engine } from './Engine'
import { C, easeInOut, fx, reducedMotion, uiStore } from './kit'
import { Projector } from './Labels'
import { FOOT, FOOT_SIZE, v } from './layout'
import { Ground, Hardware, Marker, Pulses } from './Parts'

// Framed so every plate clears the HUD at 1440x900 and 390x844.
const WIDE = { pos: v(-1.2, 27.6, 31.5), target: v(-1.2, -0.4, -4.4), fov: 34 }
const TALL = { pos: v(38.2, 42.1, -3.7), target: v(1, 0.4, 0), fov: 50 }
const INTRO_FROM = { pos: v(-9.6, 5.2, 7.6), target: v(-14.2, 3.4, -1.2) }
const BOUNDS = { min: v(-19, -1, -13), max: v(19, 6, 8) }
// The crane and the pull-back run on wall-clock time, so a slow first
// second (shader compile, a busy machine) never stretches them out.
const INTRO_S = 3.6
const RETURN_S = 2.0
const now = () => performance.now() / 1000

type Mode = 'intro' | 'free' | 'follow' | 'return'

function Rig() {
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree(s => s.camera)
  const size = useThree(s => s.size)
  const mode = useRef<Mode>(reducedMotion() ? 'free' : 'intro')
  const t = useRef(0)
  const t0 = useRef(0)
  const settle = useRef(0)
  const from = useRef({ pos: new Vector3(), target: new Vector3() })
  const home = () => (size.width / size.height < 0.8 ? TALL : WIDE)
  const intro = useRef<CatmullRomCurve3 | null>(null)

  const begin = () => {
    const h = home()
    const c = controls.current
    const a = INTRO_FROM.pos
    intro.current = new CatmullRomCurve3([a, a.clone().lerp(h.pos, 0.35).add(v(0, 3, 4)), a.clone().lerp(h.pos, 0.72).add(v(0, 2, 2)), h.pos])
    const start = mode.current === 'intro' ? INTRO_FROM : h
    camera.position.copy(start.pos)
    c?.target.copy(start.target)
    camera.lookAt(start.target)
    t0.current = now()
  }

  useEffect(
    () =>
      uiStore.subscribe(() => {
        const f = uiStore.get().follow
        if (!f || reducedMotion()) return
        if (mode.current !== 'follow') {
          mode.current = 'follow'
          fx.follow.has = false
          fx.follow.settled = false
          settle.current = 0
        }
      }),
    [],
  )

  useFrame((_, dtRaw) => {
    const c = controls.current
    if (!c) return
    const dt = Math.min(dtRaw, 0.25)
    const h = home()
    const cam = camera as PerspectiveCamera
    if (cam.fov !== h.fov) {
      cam.fov = h.fov
      cam.updateProjectionMatrix()
    }
    if (!intro.current) begin()
    if (mode.current === 'intro') {
      t.current = (now() - t0.current) / INTRO_S
      const k = easeInOut(Math.min(1, t.current))
      intro.current?.getPoint(k, camera.position)
      c.target.lerpVectors(INTRO_FROM.target, h.target, easeInOut(Math.min(1, t.current * 1.15)))
      camera.lookAt(c.target)
      if (t.current >= 1) mode.current = 'free'
      return
    }
    if (mode.current === 'follow') {
      if (!uiStore.get().follow) {
        mode.current = 'return'
        t0.current = now()
        from.current.pos.copy(camera.position)
        from.current.target.copy(c.target)
        return
      }
      if (!fx.follow.has) return
      const p = fx.follow.pos
      const a = 1 - Math.exp(-dt * 3.4)
      camera.position.lerp(TMP.set(p.x - 2.3, p.y + 1.7, p.z + 4.9), a)
      c.target.lerp(TMP2.set(p.x + 0.9, p.y - 0.15, p.z), a)
      camera.lookAt(c.target)
      if (fx.follow.settled) settle.current += dt
      else settle.current = 0
      if (settle.current > 1.5) uiStore.set({ follow: undefined })
      return
    }
    if (mode.current === 'return') {
      t.current = (now() - t0.current) / RETURN_S
      const k = easeInOut(Math.min(1, t.current))
      camera.position.lerpVectors(from.current.pos, h.pos, k)
      c.target.lerpVectors(from.current.target, h.target, k)
      camera.lookAt(c.target)
      if (t.current >= 1) mode.current = 'free'
      return
    }
    c.target.clamp(BOUNDS.min, BOUNDS.max)
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={4.5}
      maxDistance={80}
      minPolarAngle={0.18}
      maxPolarAngle={1.34}
      zoomSpeed={0.8}
      onStart={() => {
        if (mode.current === 'free') return
        mode.current = 'free'
        if (uiStore.get().follow) uiStore.set({ follow: undefined })
      }}
    />
  )
}
const TMP = new Vector3()
const TMP2 = new Vector3()

export function Scene() {
  return (
    <>
      <color attach="background" args={[C.ground]} />
      <fog attach="fog" args={[C.ground, 62, 140]} />
      <hemisphereLight args={['#f6f8f9', '#8a9297', 0.4]} />
      <directionalLight
        castShadow
        position={[-14, 28, 18]}
        intensity={0.95}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-27}
        shadow-camera-right={27}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
      <Environment resolution={128} frames={1} environmentIntensity={0.3}>
        <Lightformer intensity={2.4} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[34, 34, 1]} />
        <Lightformer intensity={1.3} position={[-14, 5, 10]} rotation-y={Math.PI / 3} scale={[18, 6, 1]} />
        <Lightformer intensity={0.9} color="#e3e9ff" position={[16, 6, -8]} rotation-y={-Math.PI / 2} scale={[22, 6, 1]} />
        <Lightformer intensity={0.5} position={[0, 3, -20]} scale={[40, 4, 1]} />
      </Environment>
      <Ground />
      <Hardware />
      <Engine />
      <Pulses />
      <Marker foot={id => FOOT[id]} size={id => FOOT_SIZE[id] ?? 1.5} />
      <Projector />
      <Rig />
      <EffectComposer multisampling={4}>
        <N8AO halfRes aoRadius={1.4} intensity={2.2} distanceFalloff={0.8} quality="performance" color="#20262b" />
        <Bloom mipmapBlur luminanceThreshold={1.15} luminanceSmoothing={0.2} intensity={0.75} radius={0.55} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
    </>
  )
}
