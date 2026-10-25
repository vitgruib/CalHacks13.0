// The studio: a seamless grey void with a soft pool of light under the lab
// plinth and the slate base, the finance network hanging above like a
// mobile. A warm key from the upper left, a cool fill, a faint rim. The
// camera opens close on Sam's bench, cranes back to show the lab and the
// network together, then drifts very slowly while nobody is steering it.

import { ContactShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BackSide, Color, MeshBasicMaterial, RingGeometry, ShaderMaterial, Vector3, type Mesh, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { feed } from '../../feed'
import { CardTracker, HoverCard, leaveStage } from './Card'
import { Flow, itemAt } from './Flow'
import { LabPlinth } from './Lab'
import { OfficeMobile, Solver } from './Office'
import { HERO_TALL, OPENING, PAL, heroFor, type Framing } from './layout'
import { P } from './mobile'
import { fx, pinnedQuality, reducedMotion, ui } from './store'
import './scene.css'
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

/** The floor far below the plinths: a soft radial pool of light falling off into the void. */
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
    <mesh material={mat} position={[1.2, -3.12, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <planeGeometry args={[140, 140]} />
    </mesh>
  )
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#FFF8EE', '#8A93A0', 0.62]} />
      <directionalLight
        position={[-12, 18, 9]}
        intensity={2.7}
        color="#FFF0DC"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-near={1}
        shadow-camera-far={70}
      />
      <directionalLight position={[16, 7, 8]} intensity={0.55} color="#CFE0F5" />
      <directionalLight position={[6, 9, -16]} intensity={0.9} color="#EAF2FF" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.0} position={[-4, 9, 3]} rotation={[Math.PI / 2, 0, 0]} scale={[16, 8, 1]} color="#FFF6EA" />
        <Lightformer form="rect" intensity={1.0} position={[-12, 4, 6]} rotation={[0, Math.PI / 2.4, 0]} scale={[10, 4, 1]} color="#FFF1E2" />
        <Lightformer form="rect" intensity={0.9} position={[12, 3, -4]} rotation={[0, -Math.PI / 2.2, 0]} scale={[10, 3, 1]} color="#D6E4F2" />
        <Lightformer form="ring" intensity={1.4} position={[6, 6, -12]} scale={4} color="#EAF2FF" />
      </Environment>
    </>
  )
}

// ── Camera: an establishing move, then the viewer's ───────────────────────

interface Tween {
  fromP: Vector3
  toP: Vector3
  fromT: Vector3
  toT: Vector3
  t0: number
  ms: number
  lift: number
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const UP = new Vector3(0, 1, 0)
const DRIFT = (1.5 * Math.PI) / 180 // ±1.5°
const DRIFT_S = 20 // one slow sway every 20 s
const off = new Vector3()

/** Where to look for a node, a person or a request, from where it is right now. */
function focusFor(id: string, hero: Framing) {
  const dir = hero.pos.clone().sub(hero.target).normalize()
  const target = new Vector3(-3.4, 1, 0.2)
  let dist = 10
  const body = (rid: string) => {
    const b = fx.bodies.get(rid)
    if (b) target.copy(b.pos).setY(1.0)
    dist = 8.5
  }
  if (id.startsWith('r:')) body(id.slice(2))
  else if (id === 'p:grant_manager') body('gm')
  else if (P.has(id)) {
    target.copy(P.get(id)!)
    dist = id.startsWith('s:') ? 8 : 10
  } else {
    const at = itemAt.get(id)
    const r = feed.getWorld().requests.find(q => q.id === id)
    if (at) {
      target.copy(at)
      dist = 9
    } else if (r) body(r.researcherId)
  }
  // A phone's narrow frame needs more distance to hold the same subject.
  if (hero === HERO_TALL) dist *= 1.9
  return { pos: target.clone().addScaledVector(dir, dist), target }
}

function Rig() {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, size } = useThree()
  const tween = useRef<Tween | null>(null)
  const applied = useRef({ fov: 0, aspect: 0 })
  const still = useMemo(reducedMotion, [])
  const heroRef = useRef<Framing>(heroFor(size.width / size.height))
  const drift = useRef({ t: 0, a: 0, drag: false })

  const glide = (toP: Vector3, toT: Vector3, ms: number, lift = 0) => {
    const c = controls.current
    if (!c) return
    tween.current = { fromP: camera.position.clone(), toP, fromT: c.target.clone(), toT, t0: performance.now(), ms: still ? 0 : ms, lift }
  }

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const hero = heroRef.current
    if (still) {
      camera.position.copy(hero.pos)
      c.target.copy(hero.target)
    } else {
      camera.position.copy(OPENING.pos)
      c.target.copy(OPENING.target)
      tween.current = { fromP: OPENING.pos.clone(), toP: hero.pos.clone(), fromT: OPENING.target.clone(), toT: hero.target.clone(), t0: performance.now() + 350, ms: 4600, lift: 2.5 }
    }
    camera.lookAt(c.target)
    const stop = () => {
      tween.current = null
      drift.current.drag = true
    }
    const end = () => {
      drift.current.drag = false
    }
    c.addEventListener('start', stop)
    c.addEventListener('end', end)
    let last: string | null = null
    const unsub = ui.subscribe(() => {
      const s = ui.get().selected
      if (s === last) return
      last = s
      const h = heroRef.current
      if (s) {
        const f = focusFor(s, h)
        glide(f.pos, f.target, 1400, 0.6)
      } else glide(h.pos.clone(), h.target.clone(), 1500, 0.6)
    })
    return () => {
      c.removeEventListener('start', stop)
      c.removeEventListener('end', end)
      unsub()
    }
  }, [])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    const cam = camera as PerspectiveCamera
    const aspect = size.width / size.height
    const hero = heroFor(aspect)
    if (hero !== heroRef.current) {
      heroRef.current = hero
      if (!ui.get().selected) glide(hero.pos.clone(), hero.target.clone(), still ? 0 : 900)
    }
    const a = applied.current
    if (a.fov !== hero.fov || a.aspect !== aspect) {
      cam.fov = hero.fov
      cam.updateProjectionMatrix()
      a.fov = hero.fov
      a.aspect = aspect
    }

    const tw = tween.current
    if (tw) {
      const k = tw.ms <= 0 ? 1 : Math.min(1, Math.max(0, (performance.now() - tw.t0) / tw.ms))
      const e = ease(k)
      camera.position.lerpVectors(tw.fromP, tw.toP, e)
      camera.position.y += Math.sin(Math.PI * e) * tw.lift
      c.target.lerpVectors(tw.fromT, tw.toT, e)
      camera.lookAt(c.target)
      c.enabled = false
      if (k >= 1) {
        tween.current = null
        c.enabled = true
      }
      return
    }
    c.enabled = true
    // Idle life: a very slow sway about the target while nobody is steering.
    const d = drift.current
    if (!still && !d.drag && !ui.get().selected && document.visibilityState === 'visible') {
      d.t += Math.min(dt, 0.05)
      const ang = DRIFT * Math.sin((d.t / DRIFT_S) * Math.PI * 2)
      const da = ang - d.a
      d.a = ang
      if (da !== 0) {
        off.subVectors(camera.position, c.target).applyAxisAngle(UP, da)
        camera.position.copy(c.target).add(off)
      }
    }
    c.update()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.55}
      zoomSpeed={0.7}
      minDistance={5}
      maxDistance={110}
      minPolarAngle={0.3}
      maxPolarAngle={1.36}
      minAzimuthAngle={-1.6}
      maxAzimuthAngle={1.6}
    />
  )
}

/** A ring on the floor under a hovered or selected person (the mobile's nodes outline instead). */
const haloGeo = new RingGeometry(0.42, 0.5, 48)
function Halo() {
  const sel = useRef<Mesh>(null)
  const hov = useRef<Mesh>(null)
  const selMat = useMemo(() => new MeshBasicMaterial({ color: PAL.ink, transparent: true, opacity: 0.85, depthWrite: false }), [])
  const hovMat = useMemo(() => new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.95, depthWrite: false }), [])
  const still = useMemo(reducedMotion, [])
  useFrame(({ clock }) => {
    const s = ui.get()
    for (let i = 0; i < 2; i++) {
      const m = i === 0 ? sel.current : hov.current
      const id = i === 0 ? s.selected : s.hovered !== s.selected ? s.hovered : null
      if (!m) continue
      const who = !id ? null : id.startsWith('r:') ? id.slice(2) : id === 'p:grant_manager' ? 'gm' : null
      const b = who ? fx.bodies.get(who) : undefined
      m.visible = !!b
      if (!b) continue
      m.position.set(b.pos.x, 0.012, b.pos.z)
      m.scale.setScalar(i === 1 && !still ? 1 + 0.04 * Math.sin(clock.elapsedTime * 4) : 1)
    }
  })
  return (
    <>
      <mesh ref={sel} geometry={haloGeo} material={selMat} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3} />
      <mesh ref={hov} geometry={haloGeo} material={hovMat} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3} />
    </>
  )
}

/** Full quality on a real GPU; steps down (MSAA, then AO) if the frame rate can't hold. */
function Effects() {
  const [level, setLevel] = useState(2)
  const t0 = useRef(performance.now())
  const pinned = useMemo(pinnedQuality, [])
  const decline = () => {
    if (!pinned && performance.now() - t0.current > 4000) setLevel(l => Math.max(0, l - 1))
  }
  return (
    <>
      <PerformanceMonitor ms={250} iterations={4} onDecline={decline} />
      {level === 2 ? (
        <EffectComposer key="fx2" multisampling={4}>
          <N8AO halfRes quality="low" aoRadius={0.75} distanceFalloff={0.7} intensity={2.2} color="#26303B" />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      ) : level === 1 ? (
        <EffectComposer key="fx1" multisampling={0}>
          <N8AO halfRes quality="performance" aoRadius={0.75} distanceFalloff={0.7} intensity={2.2} color="#26303B" />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          <SMAA />
        </EffectComposer>
      ) : (
        <EffectComposer key="fx0" multisampling={0}>
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          <SMAA />
        </EffectComposer>
      )}
    </>
  )
}

export default function Scene() {
  return (
    <>
      <Canvas
        className="a-canvas"
        shadows="soft"
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.5, far: 300, position: OPENING.pos.toArray() }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        role="img"
        aria-label="A 3D clay model of the Ortiz Lab, with the grant office's finance network hanging above it like a balanced mobile. Researchers work at their benches and toss what they want to buy to the intake post; it rides a thread up to the purchasing agent, where six rule checks light, and comes back boxed, re-tagged to another grant, blocked, or parked under a frozen grant or on the grant manager's desk. Everything is also listed in the sidebar."
        onPointerLeave={leaveStage}
      >
        <Solver />
        <Backdrop />
        <Ground />
        <Lights />
        <LabPlinth />
        <OfficeMobile />
        <Flow />
        <Halo />
        <ContactShadows position={[1.6, -3.1, 0]} scale={[40, 20]} blur={3} far={4.5} opacity={0.3} resolution={512} frames={1} color="#3A3530" />
        <Rig />
        <CardTracker />
        <Effects />
      </Canvas>
      <HoverCard />
    </>
  )
}
