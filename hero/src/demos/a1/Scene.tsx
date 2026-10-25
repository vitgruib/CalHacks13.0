// The studio: a seamless grey void with a soft pool of light under two
// floating plinths, a warm key from the upper left, a cool fill and a faint
// rim. The camera opens close on the benches, cranes back to frame the lab
// and the network for whatever shape the stage is, then drifts very slowly
// while nobody is steering. Selecting something glides to it (and follows a
// researcher as they walk). The one piece of DOM is the hover card.

import { ContactShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BackSide, Color, MeshBasicMaterial, RingGeometry, ShaderMaterial, Vector3, type Mesh, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { feed, usd } from '../../feed'
import type { World } from '../../feed'
import { embed, useEmbed } from './embed'
import { Flow } from './Flow'
import { LabPlinth } from './Lab'
import { OfficePlinth } from './Office'
import { NET, OPENING, PAL, haloSize, heroFor, netAnchor, netFloor, type Framing } from './layout'
import { fx, pinnedQuality, pointer, reducedMotion, ui } from './store'
import { grantStatus, nodeName, nodeNow } from './words'
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
    <mesh material={mat} renderOrder={-1} raycast={() => null}>
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
    <mesh material={mat} position={[0, -3.12, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1} raycast={() => null}>
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
        intensity={2.6}
        color="#FFF0DC"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-camera-left={-17}
        shadow-camera-right={17}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={70}
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

// ── Where things are right now ───────────────────────────────────────────

/** A request id (from a sidebar row) points at its item if it's in flight, else at whoever asked. */
function requestOwner(id: string): string | null {
  const r = feed.getWorld().requests.find(q => q.id === id)
  return r ? `r:${r.researcherId}` : null
}

/** Live focus point for an id: researchers walk and items fly, so ask every frame. */
function focusPoint(id: string, out: Vector3): boolean {
  if (id.startsWith('r:')) {
    const f = fx.figs.get(id.slice(2))
    if (!f) return false
    out.copy(f.pos).setY(0.9)
    return true
  }
  if (NET[id] || id === 'v:vendors' || id === 'p:funder') {
    netAnchor(id, out)
    out.y = Math.min(out.y, 1.0)
    return true
  }
  const p = fx.parcels.get(id)
  if (p) {
    out.copy(p)
    return true
  }
  const who = requestOwner(id)
  return who ? focusPoint(who, out) : false
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
const DRIFT = (1.5 * Math.PI) / 180
const DRIFT_S = 22
const off = new Vector3()
const fp = new Vector3()
const dv = new Vector3()

function Rig() {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, size } = useThree()
  const tween = useRef<Tween | null>(null)
  const still = useMemo(reducedMotion, [])
  const heroRef = useRef<Framing>(heroFor(size.width / Math.max(1, size.height)))
  const drift = useRef({ t: 0, a: 0, drag: false })
  const fov = useRef(0)

  const glide = (toP: Vector3, toT: Vector3, ms: number, lift = 0) => {
    const c = controls.current
    if (!c) return
    tween.current = { fromP: camera.position.clone(), toP, fromT: c.target.clone(), toT, t0: performance.now(), ms: still ? 0 : ms, lift }
  }
  const focusFor = (id: string) => {
    if (!focusPoint(id, fp)) return null
    const h = heroRef.current
    const dir = h.pos.clone().sub(h.target)
    const d = dir.length() * (id.startsWith('r:') || !NET[id] ? 0.36 : id.startsWith('g:') ? 0.46 : 0.42)
    const target = fp.clone()
    return { pos: target.clone().addScaledVector(dir.normalize(), d), target }
  }

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const hero = heroRef.current
    const at = new URLSearchParams(location.search).has('at')
    // Embedded, the landing's still of this framing hands over to it, so there's no opening crane.
    if (still || at || embed.get().on) {
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
      const f = s ? focusFor(s) : null
      if (f) glide(f.pos, f.target, 1400, 0.6)
      else if (!s) glide(h.pos.clone(), h.target.clone(), 1500, 0.6)
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
    const hero = heroFor(size.width / Math.max(1, size.height))
    if (hero !== heroRef.current) {
      heroRef.current = hero
      if (!ui.get().selected) glide(hero.pos.clone(), hero.target.clone(), still ? 0 : 900)
    }
    if (fov.current !== hero.fov) {
      fov.current = hero.fov
      cam.fov = hero.fov
      cam.updateProjectionMatrix()
    }
    const s = ui.get()
    const tw = tween.current
    if (tw) {
      // Selected things that move: aim the glide at where they are now.
      if (s.selected && (s.selected.startsWith('r:') || !NET[s.selected]) && focusPoint(s.selected, fp)) {
        dv.subVectors(fp, tw.toT)
        tw.toT.add(dv)
        tw.toP.add(dv)
      }
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
    // Follow a selected researcher (or item) as it moves.
    if (s.selected && (s.selected.startsWith('r:') || !NET[s.selected]) && focusPoint(s.selected, fp)) {
      dv.subVectors(fp, c.target).multiplyScalar(still ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 3))
      c.target.add(dv)
      camera.position.add(dv)
    }
    // Idle life: a very slow sway about the target while nobody is steering.
    const d = drift.current
    if (!still && !d.drag && !s.selected && document.visibilityState === 'visible') {
      d.t += Math.min(dt, 0.05)
      const a = DRIFT * Math.sin((d.t / DRIFT_S) * Math.PI * 2)
      const da = a - d.a
      d.a = a
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
      // Inside another page the wheel scrolls that page instead.
      enableZoom={!embed.get().on}
      zoomSpeed={0.7}
      minDistance={5}
      maxDistance={110}
      minPolarAngle={0.3}
      maxPolarAngle={1.36}
      minAzimuthAngle={-1.95}
      maxAzimuthAngle={1.3}
    />
  )
}

// ── Halo: a ring on the floor under what is hovered or selected ──────────

const haloGeo = new RingGeometry(0.86, 1, 64)
function Halo() {
  const sel = useRef<Mesh>(null)
  const hov = useRef<Mesh>(null)
  const selMat = useMemo(() => new MeshBasicMaterial({ color: PAL.ink, transparent: true, opacity: 0.8, depthWrite: false }), [])
  const hovMat = useMemo(() => new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false }), [])
  const p = useMemo(() => new Vector3(), [])
  useFrame(({ clock }) => {
    const s = ui.get()
    for (const [m, raw] of [
      [sel.current, s.selected],
      [hov.current, s.hovered !== s.selected ? s.hovered : null],
    ] as const) {
      if (!m) continue
      let id = raw
      // A request in flight is lit on the item itself; otherwise ring whoever asked.
      if (id && !/^[a-z]:/.test(id)) id = fx.parcels.has(id) ? null : requestOwner(id)
      m.visible = false
      if (!id) continue
      if (id.startsWith('r:')) {
        const f = fx.figs.get(id.slice(2))
        if (!f) continue
        p.copy(f.pos).setY(0.025)
      } else netFloor(id, p)
      m.visible = true
      m.position.copy(p)
      m.scale.setScalar(haloSize(id) * (m === hov.current ? 1 + 0.03 * Math.sin(clock.elapsedTime * 4) : 1))
    }
  })
  return (
    <>
      <mesh ref={sel} geometry={haloGeo} material={selMat} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3} raycast={() => null} />
      <mesh ref={hov} geometry={haloGeo} material={hovMat} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3} raycast={() => null} />
    </>
  )
}

// ── Hover card: one at a time, beside the thing under the pointer ────────

const card = { el: null as HTMLDivElement | null, name: null as HTMLElement | null, line: null as HTMLElement | null }

function lineFor(id: string, w: World) {
  if (id.startsWith('g:')) {
    const g = w.grants.find(x => x.id === id.slice(2))
    return g ? `${grantStatus(g).word} · ${usd(g.available)} available` : ''
  }
  return nodeNow(id, w).line
}

const cp = new Vector3()
function CardTracker() {
  const { camera, size } = useThree()
  const st = useMemo(() => ({ id: '' as string, at: 0, on: false }), [])
  useFrame(() => {
    const el = card.el
    if (!el || !card.name || !card.line) return
    const s = ui.get()
    const id = pointer.id && s.hovered === pointer.id && s.hoverFrom !== 'sidebar' ? pointer.id : null
    const anchored = id ? anchorOf(id, cp) : false
    if (!id || !anchored) {
      if (st.on) {
        el.style.display = 'none'
        st.on = false
        st.id = ''
      }
      return
    }
    const t = performance.now()
    if (id !== st.id || t - st.at > 400) {
      const w = feed.getWorld()
      const name = nodeName(id, w)
      const line = lineFor(id, w)
      if (card.name.textContent !== name) card.name.textContent = name
      if (card.line.textContent !== line) card.line.textContent = line
      st.id = id
      st.at = t
    }
    if (!st.on) {
      el.style.display = 'block'
      st.on = true
    }
    cp.project(camera)
    const x = (cp.x * 0.5 + 0.5) * size.width
    const y = (-cp.y * 0.5 + 0.5) * size.height
    const cw = el.offsetWidth
    const ch = el.offsetHeight
    let left = x - cw / 2
    let top = y - ch - 14
    if (top < 8) top = Math.min(size.height - ch - 8, y + 22)
    left = Math.max(8, Math.min(size.width - cw - 8, left))
    top = Math.max(8, top)
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
  })
  return null
}

/** Where the card points: just above the thing. */
function anchorOf(id: string, out: Vector3) {
  if (id.startsWith('r:')) {
    const f = fx.figs.get(id.slice(2))
    if (!f) return false
    out.copy(f.head).setY(f.head.y + 0.15)
    return true
  }
  if (!NET[id] && id !== 'v:vendors' && id !== 'p:funder') return false
  netAnchor(id, out)
  out.y += id.startsWith('g:') ? 0.9 : id.startsWith('s:') ? 0.25 : id === 'p:grant_manager' ? 0.75 : 0.35
  return true
}

function HoverCard() {
  return (
    <div
      className="a1-card"
      data-float="hover-card"
      aria-hidden="true"
      style={{ display: 'none' }}
      ref={el => {
        card.el = el
        card.name = el?.querySelector('.a1-card-name') ?? null
        card.line = el?.querySelector('.a1-card-line') ?? null
      }}
    >
      <span className="a1-card-name" />
      <span className="a1-card-line" />
    </div>
  )
}

// ── Quality ──────────────────────────────────────────────────────────────

/**
 * Full quality on a real GPU, at most 1.5 device pixels per CSS pixel. If the
 * frame rate can't hold, the pixel ratio steps down first (no shader rebuild),
 * and only at 1 does the composer drop ambient occlusion (one rebuild).
 */
const DPR_MAX = 1.5
function Effects() {
  const setDpr = useThree(s => s.setDpr)
  const [ao, setAo] = useState(true)
  const pinned = useMemo(pinnedQuality, [])
  const st = useRef({ at: performance.now() + 4000, dpr: Math.min(DPR_MAX, devicePixelRatio || 1) })
  const decline = () => {
    const s = st.current
    const now = performance.now()
    if (pinned || now < s.at) return
    s.at = now + 2500 // let each step settle before judging the next
    if (s.dpr > 1) {
      s.dpr = Math.max(1, s.dpr - 0.25)
      setDpr(s.dpr)
    } else setAo(false)
  }
  return (
    <>
      <PerformanceMonitor ms={250} iterations={4} onDecline={decline} />
      {ao ? (
        <EffectComposer key="ao" multisampling={4}>
          <N8AO halfRes quality="low" aoRadius={0.6} distanceFalloff={0.7} intensity={2.0} color="#26303B" />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      ) : (
        <EffectComposer key="plain" multisampling={0}>
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          <SMAA />
        </EffectComposer>
      )}
    </>
  )
}

/** The key light's shadows redraw every other frame: walkers move millimetres a frame, so the lag never shows, and the shadow pass halves. */
function ShadowClock() {
  const gl = useThree(s => s.gl)
  const n = useRef(0)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl])
  useFrame(() => {
    if (++n.current % 2 === 0) gl.shadowMap.needsUpdate = true
  })
  return null
}

/**
 * Compiles every shader before the first frame shows, then lets the stage fade
 * the canvas in (data-ready on .demo-a1), so nothing pops or stalls mid-move.
 */
function Warm() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    let off = false
    const show = () => {
      if (off) return
      requestAnimationFrame(() => requestAnimationFrame(() => !off && gl.domElement.closest('.demo-a1')?.setAttribute('data-ready', '')))
    }
    gl.compileAsync(scene, camera).then(show, show)
    const late = setTimeout(show, 3000) // a driver that never reports ready still shows the scene
    return () => {
      off = true
      clearTimeout(late)
    }
  }, [gl, scene, camera])
  return null
}

/** Stops drawing while an embedded demo is off screen or its tab is hidden. */
function Sleep() {
  const setFrameloop = useThree(s => s.setFrameloop)
  const awake = useEmbed(s => s.awake)
  useEffect(() => setFrameloop(awake ? 'always' : 'never'), [awake, setFrameloop])
  return null
}

/** In development, count draw calls across every pass of a frame and say it once. */
function DrawCalls() {
  const { gl, camera, size } = useThree()
  const st = useMemo(() => ({ n: 0, said: false }), [])
  useEffect(() => {
    if (!import.meta.env.DEV) return
    gl.info.autoReset = false
    // For screenshot scripts: where on the stage a node's hover anchor is.
    const v = new Vector3()
    ;(window as unknown as { __a1At?: (id: string) => number[] | null }).__a1At = id => {
      if (!anchorOf(id, v)) return null
      v.project(camera)
      return [Math.round((v.x * 0.5 + 0.5) * size.width), Math.round((-v.y * 0.5 + 0.5) * size.height)]
    }
    ;(window as unknown as { __a1Ui?: typeof ui; __a1Feed?: typeof feed }).__a1Ui = ui
    ;(window as unknown as { __a1Feed?: typeof feed }).__a1Feed = feed
    return () => {
      gl.info.autoReset = true
    }
  }, [gl, camera, size])
  useFrame(() => {
    if (!import.meta.env.DEV) return
    const calls = gl.info.render.calls
    gl.info.reset()
    st.n++
    ;(window as unknown as { __a1Calls?: number }).__a1Calls = calls
    if (!st.said && st.n === 400) {
      st.said = true
      console.info(`[a1] draw calls per frame: ${calls}`)
    }
  })
  return null
}

export default function Scene() {
  return (
    <>
      <Canvas
        className="a-canvas"
        shadows="percentage"
        dpr={[1, DPR_MAX]}
        camera={{ fov: 24, near: 0.5, far: 300, position: OPENING.pos.toArray() }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        role="img"
        aria-label="A 3D clay model of the Ortiz Lab, a wet lab where five researchers walk between benches, and beside it the grant office as a network of agents. When a researcher asks to buy something, the thing itself flies to the purchasing agent, the spending rules light up, and it comes back bought, rerouted, blocked or held. Everything in the scene is also listed in the sidebar."
      >
        <Backdrop />
        <Ground />
        <Lights />
        <LabPlinth />
        <OfficePlinth />
        <Flow />
        <Halo />
        <ContactShadows position={[0, -3.1, 0]} scale={[40, 20]} blur={3} far={4.5} opacity={0.3} resolution={512} frames={1} color="#3A3530" />
        <Rig />
        <CardTracker />
        <DrawCalls />
        <Sleep />
        <ShadowClock />
        <Warm />
        <Effects />
      </Canvas>
      <HoverCard />
    </>
  )
}
