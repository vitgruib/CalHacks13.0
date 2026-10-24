// The studio: a seamless cool-grey void, softbox lighting, two floating
// plinths, and a camera that opens close on Sam's bench and cranes back to
// reveal both sides as his first request crosses the gap.

import { ContactShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BackSide, Color, MeshBasicMaterial, RingGeometry, ShaderMaterial, Vector3, type Mesh, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Flow } from './Flow'
import { LabPlinth } from './Lab'
import { OfficePlinth } from './Office'
import { HERO_TALL, OPENING, PAL, STATIONS, anchorOf, floorOf, heroFor, type Framing } from './layout'
import { reducedMotion, ui } from './store'

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

function Lights() {
  return (
    <>
      <hemisphereLight args={['#F1F5F9', '#6E7A88', 0.9]} />
      <directionalLight
        position={[-8, 16, 10]}
        intensity={2.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-camera-left={-17}
        shadow-camera-right={17}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <directionalLight position={[12, 7, -6]} intensity={0.55} color="#D7E2EE" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 9, 2]} rotation={[Math.PI / 2, 0, 0]} scale={[16, 8, 1]} color="#FFFFFF" />
        <Lightformer form="rect" intensity={1.1} position={[-12, 4, 6]} rotation={[0, Math.PI / 2.4, 0]} scale={[10, 4, 1]} color="#EEF3F8" />
        <Lightformer form="rect" intensity={0.8} position={[12, 3, -4]} rotation={[0, -Math.PI / 2.2, 0]} scale={[10, 3, 1]} color="#DCE6F0" />
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

function focusFor(id: string, hero: Framing) {
  const dir = hero.pos.clone().sub(hero.target).normalize()
  let target: Vector3
  let dist = 11
  if (id.startsWith('r:')) {
    const s = STATIONS[id.slice(2)]
    target = s ? new Vector3(s.fig[0] + 0.5, 0.85, s.fig[2] + 0.2) : anchorOf(id)
    dist = 8.5
  } else if (id.startsWith('g:')) {
    target = floorOf(id).setY(1)
    dist = 9.5
  } else if (id.startsWith('a:') || id === 'p:grant_manager') {
    target = anchorOf(id).setY(1)
    dist = 9.5
  } else target = anchorOf(id).setY(0.8)
  // A phone's narrow lens needs more distance to hold the same subject.
  if (hero === HERO_TALL) dist *= 2.1
  return { pos: target.clone().addScaledVector(dir, dist), target }
}

function Rig() {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, size } = useThree()
  const tween = useRef<Tween | null>(null)
  const applied = useRef({ w: 0, h: 0, sx: 0, sy: 0, fov: 0 })
  const shift = useRef<[number, number]>([...heroFor(size.width / size.height).shift])
  const still = useMemo(reducedMotion, [])
  const heroRef = useRef<Framing>(heroFor(size.width / size.height))

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
    }
    c.addEventListener('start', stop)
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
      if (!ui.get().selected && !tween.current) glide(hero.pos.clone(), hero.target.clone(), 900)
    }

    // Slide the picture so it clears the copy, and the open panel.
    const s = ui.get()
    const panelOpen = s.panel !== null
    const wide = size.width >= 900
    // Wide: the panel sits on the right, so slide left. Phone: the sheet covers the
    // bottom, so centre whatever is in focus in the strip above it.
    const tx = panelOpen ? (wide ? hero.shift[0] - 0.15 : 0) : hero.shift[0]
    const ty = panelOpen && !wide ? -0.27 : hero.shift[1]
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 6)
    shift.current[0] += (tx - shift.current[0]) * k
    shift.current[1] += (ty - shift.current[1]) * k
    const a = applied.current
    const sx = Math.round(shift.current[0] * size.width)
    const sy = Math.round(shift.current[1] * size.height)
    if (a.w !== size.width || a.h !== size.height || a.sx !== sx || a.sy !== sy || a.fov !== hero.fov) {
      cam.fov = hero.fov
      cam.setViewOffset(size.width, size.height, -sx, -sy, size.width, size.height)
      cam.updateProjectionMatrix()
      Object.assign(a, { w: size.width, h: size.height, sx, sy, fov: hero.fov })
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
      minDistance={6}
      maxDistance={100}
      minPolarAngle={0.3}
      maxPolarAngle={1.36}
      minAzimuthAngle={-1.95}
      maxAzimuthAngle={1.3}
    />
  )
}

/** A ring on the floor under whatever is hovered or selected. */
const haloGeo = new RingGeometry(0.62, 0.7, 64)
function Halo() {
  const sel = useRef<Mesh>(null)
  const hov = useRef<Mesh>(null)
  const selMat = useMemo(() => new MeshBasicMaterial({ color: PAL.ink, transparent: true, opacity: 0.85, depthWrite: false }), [])
  const hovMat = useMemo(() => new MeshBasicMaterial({ color: '#F7F9FB', transparent: true, opacity: 0.9, depthWrite: false }), [])
  useFrame(({ clock }) => {
    const s = ui.get()
    for (const [m, id] of [
      [sel.current, s.selected],
      [hov.current, s.hovered !== s.selected ? s.hovered : null],
    ] as const) {
      if (!m) continue
      m.visible = !!id
      if (!id) continue
      m.position.copy(floorOf(id)).setY(floorOf(id).y + 0.01)
      const big = id.startsWith('g:') ? 1.75 : id.startsWith('a:') ? 1.15 : id.startsWith('s:') ? 0.5 : 0.85
      m.scale.setScalar(big * (m === hov.current ? 1 + 0.03 * Math.sin(clock.elapsedTime * 4) : 1))
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
  const decline = () => {
    if (performance.now() - t0.current > 4000) setLevel(l => Math.max(0, l - 1))
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
    <Canvas
      className="a-canvas"
      shadows="soft"
      dpr={[1, 2]}
      camera={{ fov: 30, near: 0.5, far: 300, position: OPENING.pos.toArray() }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      role="img"
      aria-label="A 3D model of the Ortiz Lab on one plinth and the grant office on the other. Requests travel as tokens from researchers to the purchasing agent, and answers come back as bought, rerouted, blocked or held."
    >
      <Backdrop />
      <Lights />
      <LabPlinth />
      <OfficePlinth />
      <Flow />
      <Halo />
      <ContactShadows position={[1.6, -3.1, 0]} scale={[36, 18]} blur={2.6} far={4.5} opacity={0.38} resolution={512} frames={1} color="#28313C" />
      <Rig />
      <Effects />
    </Canvas>
  )
}
