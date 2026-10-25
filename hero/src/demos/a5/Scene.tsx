// Night shift: the lab after dark under deep blue ambient light, warm bench
// lamps and screens, moonlight through the windows (the only light that casts
// shadows), and the finance network glowing on its own dark plinth. The camera
// opens close on the benches, cranes back to show both, then drifts very
// slowly while nobody is steering it. One hover card, in the DOM, follows
// whatever the pointer is over.

import { Bvh, ContactShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BackSide, Color, MeshBasicMaterial, RingGeometry, ShaderMaterial, Vector3, type Mesh, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { feed, usd } from '../../feed'
import type { AgentRole, PacketKind } from '../../feed'
import { Flow } from './Flow'
import { LabLights, LabPlinth } from './Lab'
import { HERO_TALL, NODE_AT, OPENING, PAL, anchorOf, floorOf, heroFor, type Framing } from './layout'
import { OfficePlinth, agentState, run } from './Office'
import { personAt } from './People'
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
          'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main() { float h = smoothstep(-0.3, 0.6, vP.y); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
      }),
    [],
  )
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[150, 32, 16]} />
    </mesh>
  )
}

/** The floor far below the plinths: a faint pool of blue falling off into the dark. */
function Ground() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        depthWrite: false,
        uniforms: { inner: { value: new Color(PAL.ground) }, outer: { value: new Color(PAL.void) } },
        vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 inner; uniform vec3 outer; varying vec2 vP; void main() { float d = length(vP * vec2(0.6, 1.0)) / 22.0; float k = 1.0 - smoothstep(0.0, 1.0, d); gl_FragColor = vec4(mix(outer, inner, k * k), 1.0); }',
      }),
    [],
  )
  return (
    <mesh material={mat} position={[1.5, -2.6, -1.0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <planeGeometry args={[160, 160]} />
    </mesh>
  )
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#4A5F9E', '#0B0F1C', 1.05]} />
      {/* the moon, low behind the back wall: through the windows, and all over the network */}
      <directionalLight
        position={[-4, 13, -17]}
        intensity={1.5}
        color="#9DB2F0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <directionalLight position={[-14, 10, 16]} intensity={0.28} color="#7F95D6" />
      <LabLights />
      <pointLight position={[7.8, 3.4, -3.0]} intensity={3.4} distance={9} decay={1.3} color="#8EA6F0" />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={0.5} position={[-4, 8, 3]} rotation={[Math.PI / 2, 0, 0]} scale={[16, 8, 1]} color="#6E84C8" />
        <Lightformer form="rect" intensity={0.6} position={[-10, 3, 6]} rotation={[0, Math.PI / 2.4, 0]} scale={[8, 3, 1]} color="#FFC98C" />
        <Lightformer form="ring" intensity={0.8} position={[6, 6, -12]} scale={4} color="#B9CCFF" />
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
  hero: boolean
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const UP = new Vector3(0, 1, 0)
const DRIFT = (1.5 * Math.PI) / 180
const DRIFT_S = 20
const off = new Vector3()

function focusFor(id: string, hero: Framing) {
  const dir = hero.pos.clone().sub(hero.target).normalize()
  let target: Vector3
  let dist = 24
  if (id.startsWith('r:')) {
    target = personAt(id.slice(2), new Vector3()).setY(0.9)
    dist = 19
  } else if (id.startsWith('g:')) {
    target = floorOf(id).setY(0.9)
    dist = 21
  } else if (id.startsWith('a:') || id === 'p:grant_manager') {
    target = anchorOf(id).setY(0.9)
    dist = 21
  } else target = anchorOf(id).setY(0.6)
  if (hero === HERO_TALL) dist *= 1.7
  return { pos: target.clone().addScaledVector(dir, dist), target }
}

function Rig() {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, size } = useThree()
  const tween = useRef<Tween | null>(null)
  const applied = useRef({ w: 0, h: 0, fov: 0 })
  const still = useMemo(reducedMotion, [])
  const heroRef = useRef<Framing>(heroFor(size.width / size.height))
  const drift = useRef({ t: 0, a: 0, drag: false })

  const glide = (toP: Vector3, toT: Vector3, ms: number, lift = 0) => {
    const c = controls.current
    if (!c) return
    tween.current = { fromP: camera.position.clone(), toP, fromT: c.target.clone(), toT, t0: performance.now(), ms: still ? 0 : ms, lift, hero: !ui.get().selected }
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
      tween.current = { fromP: OPENING.pos.clone(), toP: hero.pos.clone(), fromT: OPENING.target.clone(), toT: hero.target.clone(), t0: performance.now() + 350, ms: 4600, lift: 2.5, hero: true }
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
    const hero = heroFor(size.width / size.height)
    if (hero !== heroRef.current) {
      // The stage settles its size after the first frames; aim any move to the old framing at the new one.
      heroRef.current = hero
      const tw = tween.current
      if (tw?.hero) {
        tw.toP.copy(hero.pos)
        tw.toT.copy(hero.target)
      } else if (!ui.get().selected && !tw) glide(hero.pos.clone(), hero.target.clone(), 900)
    }
    const a = applied.current
    if (a.w !== size.width || a.h !== size.height || a.fov !== hero.fov) {
      cam.fov = hero.fov
      cam.updateProjectionMatrix()
      Object.assign(a, { w: size.width, h: size.height, fov: hero.fov })
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
    const d = drift.current
    if (!still && !d.drag && !ui.get().selected && document.visibilityState === 'visible') {
      d.t += Math.min(dt, 0.05)
      const an = DRIFT * Math.sin((d.t / DRIFT_S) * Math.PI * 2)
      const da = an - d.a
      d.a = an
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
      minAzimuthAngle={-1.95}
      maxAzimuthAngle={1.3}
    />
  )
}

/** A ring on the floor under whatever is hovered or selected. */
const haloGeo = new RingGeometry(0.62, 0.7, 64)
const hp = new Vector3()
function Halo() {
  const sel = useRef<Mesh>(null)
  const hov = useRef<Mesh>(null)
  const selMat = useMemo(() => new MeshBasicMaterial({ color: '#DCE6FF', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }), [])
  const hovMat = useMemo(() => new MeshBasicMaterial({ color: '#9FB6E8', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }), [])
  useFrame(({ clock }) => {
    const s = ui.get()
    for (const [m, id] of [
      [sel.current, s.selected],
      [hov.current, s.hovered !== s.selected ? s.hovered : null],
    ] as const) {
      if (!m) continue
      const known = !!id && (id.startsWith('r:') || !!NODE_AT[id])
      m.visible = known
      if (!known || !id) continue
      if (id.startsWith('r:')) personAt(id.slice(2), hp).setY(0.014)
      else floorOf(id, hp).setY(hp.y + 0.16)
      m.position.copy(hp)
      const big = id.startsWith('g:') ? 1.3 : id.startsWith('a:') ? 1.05 : id.startsWith('s:') ? 0.5 : id === 'p:grant_manager' ? 1.3 : 0.75
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

function Effects() {
  const [level, setLevel] = useState(2)
  const t0 = useRef(performance.now())
  const pinned = useMemo(pinnedQuality, [])
  const decline = () => {
    if (!pinned && performance.now() - t0.current > 4000) setLevel(l => Math.max(0, l - 1))
  }
  const bloom = <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.25} intensity={0.85} radius={0.65} />
  return (
    <>
      <PerformanceMonitor ms={250} iterations={4} onDecline={decline} />
      {level === 2 ? (
        <EffectComposer key="fx2" multisampling={4}>
          <N8AO halfRes quality="low" aoRadius={0.7} distanceFalloff={0.7} intensity={1.6} color="#05070D" />
          {bloom}
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      ) : level === 1 ? (
        <EffectComposer key="fx1" multisampling={0}>
          {bloom}
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          <SMAA />
        </EffectComposer>
      ) : (
        <EffectComposer key="fx0" multisampling={0}>
          {bloom}
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      )}
    </>
  )
}

// ── The hover card: one at a time, pinned to the thing under the pointer ──

const card = { el: null as HTMLDivElement | null, name: null as HTMLElement | null, line: null as HTMLElement | null, key: '' }

const DOING: Partial<Record<PacketKind, string>> = {
  request: 'Taking in a request from the lab',
  verdict: 'Sending an answer back to the lab',
  pushback: 'Hearing a researcher out',
  recheck: 'Checking again before money moves',
  reading: 'Reading a public record',
  payment: 'Logging money that arrived',
  hold: 'Asking the grant manager to decide',
  decision: 'Hearing back from the grant manager',
  paper: 'Checking a paper for the progress report',
  invoice: 'Checking an invoice against its order',
  payment_request: 'Sending a payment request to the funder',
  follow_up: 'Answering a question from the funder',
  charge: 'Placing an order',
}
const ACT_WORDS: Record<string, string> = { walking: 'On the way: ' }

function describe(id: string): [string, string] | null {
  const w = feed.getWorld()
  const t = feed.now()
  if (id.startsWith('r:')) {
    const r = w.researchers.find(x => x.id === id.slice(2))
    if (!r) return null
    for (const p of w.packets) {
      if (p.from === id && p.kind === 'request') return [r.name, `Sending a request: ${p.label}`]
      if (p.from === id && p.kind === 'paper') return [r.name, 'Sending a paper for the progress report']
      if (p.to === id && p.kind === 'verdict') return [r.name, 'Hearing back from the purchasing agent']
    }
    return [r.name, `${ACT_WORDS[fx.doing.get(r.id) ?? ''] ?? ''}${r.task}`]
  }
  if (id.startsWith('a:')) {
    const role = id.slice(2) as AgentRole
    const a = w.agents.find(x => x.role === role)
    const name = a?.name ?? 'Agent'
    const st = agentState(role, w, t)
    if (role === 'purchasing' && run.cur && t - run.cur.last < 2600) {
      const done = run.cur.lit.filter(x => x !== null).length
      const failed = run.cur.lit.filter(x => x === false).length
      return [name, `Checking a request against the spending rules: ${done} of 6 checked${failed ? `, ${failed} failed` : ''}`]
    }
    if (st === 'working') {
      for (const p of w.packets) if (p.from === id || p.to === id) return [name, DOING[p.kind] ?? 'Working']
      return [name, 'Working']
    }
    if (st === 'waiting') return [name, 'Waiting on the grant manager']
    return [name, 'Idle, waiting for work']
  }
  if (id.startsWith('g:')) {
    const g = w.grants.find(x => `g:${x.id}` === id)
    if (!g) return null
    if (g.frozen) return [g.name, g.status === 'restored_by_court' ? 'Frozen until the restored money arrives' : 'Frozen: no spending until it is restored']
    return [g.name, `${usd(g.available)} truly available of ${usd(g.awarded)}`]
  }
  if (id === 'p:grant_manager') {
    const open = w.holds.filter(h => h.open).length
    return ['Grant manager', open ? `Reviewing ${open} ${open === 1 ? 'decision' : 'decisions'} the agents asked for` : 'Nothing waiting on a decision']
  }
  const node = w.nodes.find(n => n.id === id)
  if (!node) return null
  let line = node.sub ?? ''
  for (const p of w.packets) {
    if (p.from === id || p.to === id) {
      line = p.kind === 'reading' ? (/no change/i.test(p.label) ? 'Sending a reading: no change' : 'Reporting a change') : (DOING[p.kind] ?? line)
      break
    }
  }
  if (!line) line = id.startsWith('s:') ? 'Watched by the bookkeeping agent' : id === 'v:vendors' ? 'Ships orders and sends invoices' : 'Pays the grants'
  return [node.label, line]
}

const anc = new Vector3()
function Projector() {
  const { camera, size } = useThree()
  const lastText = useRef(0)
  useFrame(() => {
    const el = card.el
    if (!el) return
    const s = ui.get()
    const id = s.hovered
    const show = !!id && fx.pointer.inside && fx.pointer.mouse && fx.sceneHover === id && (id.startsWith('r:') || !!NODE_AT[id])
    if (!show || !id) {
      if (el.dataset.on !== '0') {
        el.dataset.on = '0'
        el.style.visibility = 'hidden'
      }
      card.key = ''
      return
    }
    const now = performance.now()
    if (card.key !== id || now - lastText.current > 300) {
      const d = describe(id)
      lastText.current = now
      if (d && card.name && card.line) {
        if (card.name.textContent !== d[0]) card.name.textContent = d[0]
        if (card.line.textContent !== d[1]) card.line.textContent = d[1]
      }
      card.key = id
    }
    if (id.startsWith('r:')) personAt(id.slice(2), anc).setY(2.0)
    else {
      anchorOf(id, anc)
      anc.y += id.startsWith('g:') ? 0.75 : id.startsWith('a:') ? 0.75 : id === 'p:grant_manager' ? 0.4 : 0.5
    }
    anc.project(camera)
    const x = ((anc.x + 1) / 2) * size.width
    const y = ((1 - anc.y) / 2) * size.height
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = x - w / 2
    let top = y - h - 14
    if (top < 8) top = Math.min(size.height - h - 8, y + 34)
    left = Math.max(8, Math.min(size.width - w - 8, left))
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    if (el.dataset.on !== '1') {
      el.dataset.on = '1'
      el.style.visibility = 'visible'
    }
  })
  return null
}

function HoverCard() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    const stage = el?.parentElement
    if (!el || !stage) return
    card.el = el
    card.name = el.querySelector('.s5-name')
    card.line = el.querySelector('.s5-line')
    const move = (e: PointerEvent) => {
      fx.pointer.inside = true
      fx.pointer.mouse = e.pointerType === 'mouse' || e.pointerType === 'pen'
    }
    const leave = () => {
      fx.pointer.inside = false
    }
    stage.addEventListener('pointermove', move)
    stage.addEventListener('pointerdown', move)
    stage.addEventListener('pointerleave', leave)
    return () => {
      stage.removeEventListener('pointermove', move)
      stage.removeEventListener('pointerdown', move)
      stage.removeEventListener('pointerleave', leave)
      card.el = card.name = card.line = null
    }
  }, [])
  return (
    <div ref={ref} className="s5-card" data-float="hover-card" role="status" aria-live="polite" style={{ visibility: 'hidden' }} data-on="0">
      <span className="s5-name" />
      <span className="s5-line" />
    </div>
  )
}

export default function Scene() {
  return (
    <>
      <Canvas
        className="a-canvas"
        shadows="soft"
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.5, far: 400, position: OPENING.pos.toArray() }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        role="img"
        aria-label="A 3D model of the Ortiz Lab at night on one plinth and the finance network on another. Researchers move between their stations; when one asks to buy something, the thing itself travels to the purchasing agent, where six spending rules light up, and comes back boxed, re-tagged to the other grant, sent back, blocked or held. Everything in the scene is also listed in the sidebar."
      >
        <Backdrop />
        <Ground />
        <Lights />
        <Bvh firstHitOnly>
          <LabPlinth />
          <OfficePlinth />
        </Bvh>
        <Flow />
        <Halo />
        <ContactShadows position={[1.5, -2.58, -1]} scale={[40, 22]} blur={3} far={3} opacity={0.5} resolution={512} frames={1} color="#000000" />
        <Rig />
        <Projector />
        <Effects />
      </Canvas>
      <HoverCard />
    </>
  )
}
