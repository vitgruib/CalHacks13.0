// The studio: a seamless grey void with a soft pool of light under the lab
// plinth and the round table, a warm key from the upper left, a cool fill
// and a faint rim. The camera opens close on Sam's bench, cranes back to
// hold the lab and the table together, fitted to whatever size the stage
// is, then drifts very slowly while nobody is steering it. One hover card,
// anchored to the hovered thing, carries a name and what it is doing.

import { ContactShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BackSide, Color, MeshBasicMaterial, RingGeometry, ShaderMaterial, Vector3, type Mesh, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { EDGES, feed, usd } from '../../feed'
import { body } from './crowd'
import { Flow } from './Flow'
import { LabPlinth } from './Lab'
import { HUB, OPENING, PAL, floorOf, heroFor, isTall, spot, type Framing } from './layout'
import { OfficePlinth } from './Office'
import { pinnedQuality, reducedMotion, ui, useUi } from './store'
import { agentNow, grantStatus, shortItem } from './words'
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
      <sphereGeometry args={[160, 32, 16]} />
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
    <mesh material={mat} position={[0, -3.12, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <planeGeometry args={[160, 160]} />
    </mesh>
  )
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#FFF8EE', '#8A93A0', 0.62]} />
      <directionalLight
        position={[-10, 18, 10]}
        intensity={2.7}
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

// ── Where a node is right now ────────────────────────────────────────────

let KNOWN: Set<string> | null = null
const known = (id: string | null): id is string => {
  if (!KNOWN) KNOWN = new Set(feed.getWorld().nodes.map(n => n.id).concat('x:record'))
  return !!id && KNOWN.has(id)
}
const isPerson = (id: string) => id.startsWith('r:') || id === 'p:grant_manager'
const bodyOf = (id: string) => body(id === 'p:grant_manager' ? 'gm' : id.slice(2))

/** The ground under a node, following people as they walk. */
function floorInto(id: string, out: Vector3) {
  if (isPerson(id)) return out.copy(bodyOf(id).pos).setY(0.012)
  if (id === 'x:record') return out.set(HUB.x, 0.012, HUB.z)
  return out.copy(floorOf(id))
}

/** Just above a node's top, where its hover card points. */
function topInto(id: string, out: Vector3) {
  if (isPerson(id)) return out.copy(bodyOf(id).head).setY(bodyOf(id).head.y + 0.22)
  if (id === 'x:record') return out.set(HUB.x, HUB.y + 0.25, HUB.z)
  const s = spot(id)
  return out.set(s.anchor[0], s.top, s.anchor[2])
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

function focusFor(id: string, hero: Framing) {
  const dir = hero.pos.clone().sub(hero.target).normalize()
  const target = floorInto(id, new Vector3())
  let dist = 14
  if (isPerson(id)) {
    target.y = 0.9
    dist = 11
  } else if (id.startsWith('g:') || id.startsWith('a:') || id === 'x:record') {
    target.y = 0.7
    dist = 12.5
  } else if (id.startsWith('s:')) {
    target.y = 0.4
    dist = 12
  } else {
    target.y = 0.4
    dist = 14
  }
  // A phone's narrow lens needs more distance to hold the same subject.
  if (isTall(hero)) dist *= 1.7
  return { pos: target.clone().addScaledVector(dir, dist), target }
}

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
      if (known(s)) {
        const f = focusFor(s, h)
        glide(f.pos, f.target, 1400, 0.6)
      } else if (!s) glide(h.pos.clone(), h.target.clone(), 1500, 0.6)
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
      if (!ui.get().selected && !tween.current) glide(hero.pos.clone(), hero.target.clone(), 900)
    }
    if (fov.current !== hero.fov) {
      fov.current = hero.fov
      cam.fov = hero.fov
      cam.clearViewOffset()
      cam.updateProjectionMatrix()
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
      zoomSpeed={0.7}
      minDistance={6}
      maxDistance={120}
      minPolarAngle={0.3}
      maxPolarAngle={1.36}
      minAzimuthAngle={-1.95}
      maxAzimuthAngle={1.3}
    />
  )
}

/** A ring on the floor under whatever is hovered or selected, following people as they move. */
const haloGeo = new RingGeometry(0.62, 0.7, 64)
const haloSize = (id: string) =>
  id.startsWith('g:') ? 1.55 : id.startsWith('a:') ? 1.15 : id.startsWith('s:') ? 0.48 : id === 'x:record' ? 1.75 : id.startsWith('v:') || id === 'p:funder' ? 2.1 : 0.85
function Halo() {
  const sel = useRef<Mesh>(null)
  const hov = useRef<Mesh>(null)
  const selMat = useMemo(() => new MeshBasicMaterial({ color: PAL.ink, transparent: true, opacity: 0.85, depthWrite: false }), [])
  const hovMat = useMemo(() => new MeshBasicMaterial({ color: '#F7F9FB', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }), [])
  const still = useMemo(reducedMotion, [])
  useFrame(({ clock }) => {
    const s = ui.get()
    const pairs: [Mesh | null, string | null][] = [
      [sel.current, s.selected],
      [hov.current, s.hovered !== s.selected ? s.hovered : null],
    ]
    for (const [m, id] of pairs) {
      if (!m) continue
      m.visible = known(id)
      if (!known(id)) continue
      floorInto(id, m.position)
      m.position.y += 0.01
      m.scale.setScalar(haloSize(id) * (m === hov.current && !still ? 1 + 0.03 * Math.sin(clock.elapsedTime * 4) : 1))
    }
  })
  return (
    <>
      <mesh ref={sel} geometry={haloGeo} material={selMat} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3} />
      <mesh ref={hov} geometry={haloGeo} material={hovMat} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3} />
    </>
  )
}

// ── The hover card ───────────────────────────────────────────────────────

const card: { el: HTMLDivElement | null; id: string | null; inside: boolean } = { el: null, id: null, inside: false }

/** A name and one plain line on what it is doing now. Never an award number or an internal id. */
function cardText(id: string): { name: string; line: string } {
  const w = feed.getWorld()
  if (id === 'x:record') return { name: 'The shared record', line: 'Every agent reads and writes here. None of them talk to each other directly.' }
  if (id.startsWith('r:')) {
    const r = w.researchers.find(x => `r:${x.id}` === id)
    const name = r?.name ?? 'A lab member'
    const out = w.packets.find(p => p.from === id && (p.kind === 'request' || p.kind === 'pushback' || p.kind === 'paper'))
    const back = w.packets.find(p => p.to === id && p.kind === 'verdict')
    const req = (out ?? back)?.refId ? w.requests.find(q => q.id === (out ?? back)!.refId) : undefined
    const what = req ? shortItem(req.item).toLowerCase() : ''
    if (out?.kind === 'paper') return { name, line: 'Sending a paper for the progress report' }
    if (out?.kind === 'pushback') return { name, line: `Pushing back on the hold on ${what}` }
    if (out && req) return { name, line: `Asking to buy ${what}, ${usd(req.price)}` }
    if (back && req) return { name, line: `Hearing back on ${what}` }
    return { name, line: r ? `${r.role}. ${r.task}` : '' }
  }
  if (id.startsWith('a:') || id === 'p:grant_manager') {
    const n = w.nodes.find(x => x.id === id)
    const now = agentNow(w, id)
    return { name: n?.label ?? 'Agent', line: id === 'p:grant_manager' ? now.line : `${now.word}. ${now.line}` }
  }
  if (id.startsWith('g:')) {
    const g = w.grants.find(x => `g:${x.id}` === id)
    if (!g) return { name: 'Grant', line: '' }
    return { name: g.name, line: `${usd(g.available)} truly available. ${grantStatus(g, w.today).word}.` }
  }
  const n = w.nodes.find(x => x.id === id)
  const edge = EDGES.find(e => e.from === id || e.to === id)
  const line = id.startsWith('s:') ? (edge?.what ?? n?.sub ?? '') : (n?.sub ?? edge?.what ?? '')
  return { name: n?.label ?? '', line }
}

function HoverCard() {
  const hovered = useUi(s => s.hovered)
  const src = useUi(s => s.hoverSrc)
  const sheet = useUi(s => s.sheet)
  const [, tick] = useState(0)
  const show = known(hovered) && src === 'scene' && !sheet
  useEffect(() => {
    if (!show) return
    const i = setInterval(() => tick(x => x + 1), 400)
    return () => clearInterval(i)
  }, [show])
  card.id = show ? hovered : null
  const text = show ? cardText(hovered) : null
  return (
    <div
      ref={el => {
        card.el = el
      }}
      className="a-hover"
      data-float="hover-card"
      aria-hidden="true"
      hidden={!text}
    >
      {text && (
        <>
          <p className="a-hover-name">{text.name}</p>
          {text.line && <p className="a-hover-line">{text.line}</p>}
        </>
      )}
    </div>
  )
}

/** Puts the hover card over its node every frame: above it, flipped below near the top, kept inside the stage, clear of anything else floating. */
const cp = new Vector3()
function CardTracker() {
  const { camera, size } = useThree()
  const st = useRef({ n: 0, below: false, w: 0, h: 0, clear: true })
  useFrame(() => {
    const el = card.el
    if (!el || !card.id || el.hidden || !card.inside) {
      if (el) el.style.visibility = 'hidden'
      return
    }
    const s = st.current
    s.n++
    if (s.n % 10 === 1 || !s.w) {
      s.w = el.offsetWidth
      s.h = el.offsetHeight
    }
    topInto(card.id, cp).project(camera)
    if (cp.z > 1) {
      el.style.visibility = 'hidden'
      return
    }
    const W = size.width, H = size.height
    const ax = (cp.x * 0.5 + 0.5) * W
    const ay = (-cp.y * 0.5 + 0.5) * H
    const place = (below: boolean) => {
      const x = Math.min(Math.max(8, ax - s.w / 2), W - s.w - 8)
      const y = below ? ay + 22 : ay - s.h - 12
      return [x, Math.min(Math.max(8, y), H - s.h - 8)] as const
    }
    let below = ay - s.h - 12 < 8
    let [x, y] = place(below)
    // Every few frames: if it would cover another floating thing, try the other side, else step aside.
    if (s.n % 8 === 1) {
      const host = el.parentElement?.getBoundingClientRect()
      const hit = (px: number, py: number) => {
        if (!host) return false
        const l = host.left + px, t = host.top + py, r = l + s.w, b = t + s.h
        for (const o of document.querySelectorAll<HTMLElement>('[data-float]')) {
          if (o === el || o.contains(el) || el.contains(o) || o.hidden) continue
          const q = o.getBoundingClientRect()
          if (q.width === 0 || getComputedStyle(o).visibility === 'hidden') continue
          if (Math.min(r, q.right) - Math.max(l, q.left) > 0 && Math.min(b, q.bottom) - Math.max(t, q.top) > 0) return true
        }
        return false
      }
      s.clear = true
      if (hit(x, y)) {
        const [x2, y2] = place(!below)
        if (!hit(x2, y2)) s.below = !below
        else s.clear = false
      } else s.below = below
    }
    if (s.below !== below) {
      below = s.below
      ;[x, y] = place(below)
    }
    el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
    el.style.visibility = s.clear ? 'visible' : 'hidden'
  })
  return null
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

const cq = new Vector3()
/** With ?debug3d: counts every draw call in a frame (all passes) for the budget check. */
function DrawCalls() {
  const { gl } = useThree()
  const on = useMemo(() => typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug3d'), [])
  useEffect(() => {
    if (!on) return
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = true
    }
  }, [gl, on])
  useFrame(() => {
    if (on) gl.info.reset()
  }, -100)
  const { camera } = useThree()
  useEffect(() => {
    if (!on) return
    // Where a node is on the page, for scripted hovers; the feed, to stop the story at an exact time.
    const w = window as unknown as { __a3where?: (id: string) => number[]; __a3feed?: typeof feed }
    w.__a3feed = feed
    w.__a3where = (id: string) => {
      const r = gl.domElement.getBoundingClientRect()
      if (id.startsWith('r:') || id === 'p:grant_manager') floorInto(id, cq).setY(0.9).project(camera)
      else floorInto(id, cq).setY(0.45).project(camera)
      return [r.left + (cq.x * 0.5 + 0.5) * r.width, r.top + (-cq.y * 0.5 + 0.5) * r.height]
    }
  }, [on, gl, camera])
  useFrame(() => {
    if (!on) return
    ;(window as unknown as { __a3calls?: number }).__a3calls = gl.info.render.calls
  }, 100)
  return null
}

export default function Scene() {
  return (
    <>
      <Canvas
        className="a-canvas"
        shadows
        dpr={[1, 2]}
        camera={{ fov: 24, near: 0.5, far: 400, position: OPENING.pos.toArray() }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        role="img"
        aria-label="A 3D clay model of the Ortiz Lab beside the grant office's round table. Researchers work at their benches; each thing they ask to buy flies into the shared record at the centre of the table and on to the purchasing agent, then comes back bought, rerouted, sent back, blocked or held. The agents never talk to each other directly; everything passes through the record. Every actor is also listed in the sidebar."
        onPointerEnter={() => {
          card.inside = true
        }}
        onPointerLeave={() => {
          card.inside = false
          const s = ui.get()
          if (s.hoverSrc === 'scene') ui.set({ hovered: null, hoverSrc: null })
        }}
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
        <Effects />
      </Canvas>
      <HoverCard />
    </>
  )
}
