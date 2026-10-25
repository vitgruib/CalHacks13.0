// The studio for a tilt-shift miniature: a seamless grey void, a soft pool
// of light under the two plinths, one warm key that casts every shadow, and
// a lens that keeps a band through the middle sharp while the near and far
// edges soften, so the lab and the transit map read like a model on a table.
// The camera opens close on the lab, cranes back to show both sides, glides
// to whatever is selected and otherwise drifts very slowly.

import { ContactShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, SMAA, TiltShift2, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BackSide, Color, MeshBasicMaterial, RingGeometry, ShaderMaterial, Vector3, type Mesh, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { EDGES, feed, usd, type World } from '../../feed'
import { Flow, itemAt } from './Flow'
import { LabPlinth } from './Lab'
import { OfficePlinth, ruleRun } from './Office'
import { pointer } from './Parts'
import { OPENING, PAL, haloSize, heroFor, staticAnchor, staticFloor, type Framing } from './layout'
import { person, pinnedQuality, reducedMotion, ui } from './store'
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
    <mesh material={mat} position={[0.8, -3.12, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <planeGeometry args={[140, 140]} />
    </mesh>
  )
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#FFF8EE', '#8A93A0', 0.6]} />
      <directionalLight
        position={[-10, 16, 11]}
        intensity={2.6}
        color="#FFF0DC"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <directionalLight position={[16, 7, 8]} intensity={0.5} color="#CFE0F5" />
      <directionalLight position={[4, 9, -16]} intensity={0.8} color="#EAF2FF" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.0} position={[-4, 9, 3]} rotation={[Math.PI / 2, 0, 0]} scale={[16, 8, 1]} color="#FFF6EA" />
        <Lightformer form="rect" intensity={1.0} position={[-12, 4, 6]} rotation={[0, Math.PI / 2.4, 0]} scale={[10, 4, 1]} color="#FFF1E2" />
        <Lightformer form="rect" intensity={0.9} position={[12, 3, -4]} rotation={[0, -Math.PI / 2.2, 0]} scale={[10, 3, 1]} color="#D6E4F2" />
        <Lightformer form="ring" intensity={1.4} position={[6, 6, -12]} scale={4} color="#EAF2FF" />
      </Environment>
    </>
  )
}

// ── Where a node is: anchors for the card and the camera, floors for the halo ─

const isTall = (aspect: number) => aspect < 0.85
// A request (hovered from the sidebar) points at its object while it is out,
// otherwise at the researcher who asked for it.
function requester(id: string) {
  for (const r of feed.getWorld().requests) if (r.id === id) return r.researcherId
  return null
}
function anchorFor(id: string, out: Vector3): Vector3 {
  if (id.startsWith('r:')) return out.copy(person(id.slice(2)).head)
  if (id === 'p:grant_manager' && person('gm').head.lengthSq() > 0) return out.copy(person('gm').head)
  if (!id.includes(':')) {
    if (itemAt(id, out)) return out.setY(out.y + 0.6)
    const who = requester(id)
    if (who) return out.copy(person(who).head)
  }
  return staticAnchor(id, out)
}
function floorFor(id: string, out: Vector3): Vector3 {
  if (id.startsWith('r:')) return out.copy(person(id.slice(2)).pos).setY(0.012)
  if (!id.includes(':')) {
    if (itemAt(id, out)) return out.setY(out.y - 0.01)
    const who = requester(id)
    if (who) return out.copy(person(who).pos).setY(0.012)
  }
  return staticFloor(id, out)
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
  hero?: boolean
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const UP = new Vector3(0, 1, 0)
const DRIFT = (1.5 * Math.PI) / 180 // ±1.5°
const DRIFT_S = 20 // one slow sway every 20 s
const off = new Vector3()

function focusFor(id: string, hero: Framing, aspect: number) {
  const dir = hero.pos.clone().sub(hero.target).normalize()
  const target = new Vector3()
  let dist = 10
  if (id.startsWith('r:')) {
    floorFor(id, target).setY(0.85)
    dist = 8.5
  } else if (id.startsWith('g:')) {
    floorFor(id, target).setY(0.7)
    dist = 9
  } else if (id.startsWith('a:') || id === 'p:grant_manager') {
    floorFor(id, target).setY(0.5)
    dist = 9
  } else anchorFor(id, target).setY(Math.max(0.3, target.y - 0.4))
  // A phone's narrow frame needs more distance to hold the same subject.
  if (isTall(aspect)) dist *= 1.9
  return { pos: target.clone().addScaledVector(dir, dist), target }
}

/** Where the lens keeps things sharp: a band across the screen at this height (0 bottom, 1 top). */
const lens = { y: 0.5, tall: false }

function Rig() {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, size } = useThree()
  const tween = useRef<Tween | null>(null)
  const applied = useRef({ fov: 0 })
  const still = useMemo(reducedMotion, [])
  const heroRef = useRef<Framing>(heroFor(size.width / size.height))
  const drift = useRef({ t: 0, a: 0, drag: false })
  const focus = useMemo(() => new Vector3(), [])

  const glide = (toP: Vector3, toT: Vector3, ms: number, lift = 0) => {
    const c = controls.current
    if (!c) return
    tween.current = { fromP: camera.position.clone(), toP, fromT: c.target.clone(), toT, t0: performance.now(), ms: still ? 0 : ms, lift }
  }

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const hero = heroRef.current
    const sel = ui.get().selected
    if (still || sel) {
      const f = sel ? focusFor(sel, hero, size.width / size.height) : hero
      camera.position.copy(f.pos)
      c.target.copy(f.target)
    } else {
      camera.position.copy(OPENING.pos)
      c.target.copy(OPENING.target)
      tween.current = { fromP: OPENING.pos.clone(), toP: hero.pos.clone(), fromT: OPENING.target.clone(), toT: hero.target.clone(), t0: performance.now() + 350, ms: 4600, lift: 2.2, hero: true }
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
    let last: string | null = sel
    const unsub = ui.subscribe(() => {
      const s = ui.get().selected
      if (s === last) return
      last = s
      const h = heroRef.current
      if (s) {
        const f = focusFor(s, h, size.width / size.height)
        glide(f.pos, f.target, 1400, 0.4)
      } else {
        glide(h.pos.clone(), h.target.clone(), 1500, 0.4)
        if (tween.current) tween.current.hero = true
      }
    })
    return () => {
      c.removeEventListener('start', stop)
      c.removeEventListener('end', end)
      unsub()
    }
    // The subscription reads the latest size through heroRef; mount once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    const cam = camera as PerspectiveCamera
    const aspect = size.width / size.height
    const hero = heroFor(aspect)
    if (hero !== heroRef.current) {
      heroRef.current = hero
      // The stage changed shape: a move already heading for the hero shot heads for the new one.
      const tw = tween.current
      if (tw?.hero) {
        tw.toP.copy(hero.pos)
        tw.toT.copy(hero.target)
      } else if (!ui.get().selected && !tw) {
        glide(hero.pos.clone(), hero.target.clone(), 900)
        if (tween.current) tween.current.hero = true
      }
    }
    if (applied.current.fov !== hero.fov) {
      cam.fov = hero.fov
      cam.updateProjectionMatrix()
      applied.current.fov = hero.fov
    }

    // The lens follows the selection, and otherwise rests on the middle of the frame.
    const s = ui.get()
    let ly = 0.5
    if (s.selected) {
      anchorFor(s.selected, focus).project(cam)
      ly = Math.min(0.8, Math.max(0.2, (focus.y + 1) / 2))
    }
    lens.y += (ly - lens.y) * (1 - Math.exp(-Math.min(dt, 0.1) * 3))
    lens.tall = isTall(aspect)

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
      zoomSpeed={0.7}
      minDistance={5}
      maxDistance={110}
      minPolarAngle={0.35}
      maxPolarAngle={1.42}
      minAzimuthAngle={-1.95}
      maxAzimuthAngle={1.3}
    />
  )
}

/** A ring on the floor under whatever is hovered or selected; also tells the map what is hovered. */
const haloGeo = new RingGeometry(0.88, 1, 64)
const hv = new Vector3()
function Halo() {
  const sel = useRef<Mesh>(null)
  const hov = useRef<Mesh>(null)
  const selMat = useMemo(() => new MeshBasicMaterial({ color: PAL.ink, transparent: true, opacity: 0.85, depthWrite: false }), [])
  const hovMat = useMemo(() => new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.95, depthWrite: false }), [])
  const still = useMemo(reducedMotion, [])
  useFrame(({ clock, scene }) => {
    const s = ui.get()
    scene.userData.hovered = s.hovered
    for (const [m, id] of [
      [sel.current, s.selected],
      [hov.current, s.hovered !== s.selected ? s.hovered : null],
    ] as const) {
      if (!m) continue
      m.visible = !!id
      if (!id) continue
      floorFor(id, hv)
      m.position.set(hv.x, hv.y + 0.012, hv.z)
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

// ── The hover card: one at a time, anchored to the hovered thing ─────────

const card = { el: null as HTMLDivElement | null, name: null as HTMLElement | null, line: null as HTMLElement | null }

const AGENT_ROLE: Record<string, string> = { 'a:purchasing': 'purchasing', 'a:bookkeeping': 'bookkeeping', 'a:payment_report': 'payment_report' }

/** The name and one plain line on what the thing is doing now. Never an id or a packet label. */
function describe(id: string, w: World): [string, string] {
  const node = w.nodes.find(n => n.id === id)
  if (id.startsWith('r:')) {
    const r = w.researchers.find(x => x.id === id.slice(2))
    if (!r) return ['', '']
    const out = w.packets.find(p => p.from === id && (p.kind === 'request' || p.kind === 'pushback'))
    const req = out?.refId ? w.requests.find(q => q.id === out.refId) : undefined
    if (out && req) return [r.name, `${out.kind === 'pushback' ? 'Pushing back on' : 'Asking for'} ${req.item.toLowerCase()}`]
    const back = w.packets.find(p => p.to === id && p.kind === 'verdict')
    const got = back?.refId ? w.requests.find(q => q.id === back.refId) : undefined
    if (back && got) return [r.name, `Waiting on an answer about ${got.item.toLowerCase()}`]
    if (w.packets.some(p => p.from === id && p.kind === 'paper')) return [r.name, 'Sending a paper for the progress report']
    return [r.name, `${r.role}. ${r.task}`]
  }
  if (id.startsWith('a:')) {
    const role = AGENT_ROLE[id]
    const a = w.agents.find(x => x.role === role)
    const name = a?.name ?? node?.label ?? ''
    const into = (k: string) => w.packets.some(p => p.to === id && p.kind === k)
    const from = (k: string) => w.packets.some(p => p.from === id && p.kind === k)
    const waiting = w.holds.some(h => h.open && h.raisedBy === role)
    if (role === 'purchasing') {
      const desk = w.requests.find(r => r.outcome === undefined && !w.packets.some(p => p.refId === r.id && p.kind === 'request'))
      if (desk) {
        const n = ruleRun.id === desk.id ? ruleRun.results.length : 0
        return [name, n > 0 && n < 6 ? `Checking ${desk.item.toLowerCase()}: rule ${n + 1} of 6` : `Checking ${desk.item.toLowerCase()} against the six rules`]
      }
      if (into('request')) return [name, 'A request is on its way in']
      if (from('verdict')) return [name, 'Sending an answer back to the lab']
      if (waiting) return [name, 'Waiting on the grant manager']
      return [name, 'Waiting for the next request']
    }
    if (role === 'bookkeeping') {
      if (into('payment')) return [name, 'Recording money that just arrived']
      if (into('invoice')) return [name, 'Checking an invoice against its order']
      if (into('reading')) return [name, 'Reading a status update on a grant']
      if (into('recheck')) return [name, 'Checking the grant again before money moves']
      if (waiting) return [name, 'Waiting on the grant manager']
      return [name, 'Keeping the books on both grants']
    }
    if (into('paper')) return [name, 'Checking a paper for the progress report']
    if (from('payment_request')) return [name, 'Sending a payment request to the funder']
    if (into('follow_up')) return [name, 'Answering a question from the funder']
    if (waiting) return [name, 'Waiting on the grant manager']
    return [name, 'Watching for papers and payment requests']
  }
  if (id.startsWith('g:')) {
    const g = w.grants.find(x => `g:${x.id}` === id)
    if (!g) return ['', '']
    const st = g.frozen
      ? g.status === 'restored_by_court'
        ? 'frozen until the money arrives'
        : g.status === 'canceled'
          ? 'frozen, canceled'
          : 'frozen'
      : g.status === 'ended'
        ? 'ended'
        : 'open for spending'
    return [g.name, `${usd(g.available)} truly available, ${st}`]
  }
  if (id === 'p:grant_manager') {
    const n = w.holds.filter(h => h.open).length
    return [node?.label ?? 'Grant manager', n ? `${n} decision${n > 1 ? 's' : ''} waiting` : 'Nothing waiting for a decision']
  }
  const e = EDGES.find(x => x.from === id || x.to === id)
  return [node?.label ?? '', node?.sub ?? e?.what ?? '']
}

const GAP = 14
const PAD = 8
const ap = new Vector3()
interface Box {
  l: number
  t: number
  r: number
  b: number
}
const hits = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b

/** Inside the Canvas: projects the hovered thing every frame and moves the card beside it. */
function CardTracker() {
  const { camera, size, gl } = useThree()
  const st = useRef({ id: null as string | null, at: 0, w: 0, h: 0, others: [] as Box[], othersAt: 0 })
  useFrame(() => {
    const el = card.el
    if (!el || !card.name || !card.line) return
    const id = pointer.id
    const s = st.current
    if (!id) {
      if (!el.hidden) el.hidden = true
      s.id = null
      return
    }
    const t = performance.now()
    if (id !== s.id || t - s.at > 300) {
      const [name, line] = describe(id, feed.getWorld())
      if (card.name.textContent !== name) card.name.textContent = name
      if (card.line.textContent !== line) card.line.textContent = line
      if (el.hidden) el.hidden = false
      s.w = el.offsetWidth
      s.h = el.offsetHeight
      s.id = id
      s.at = t
    }
    if (!hasText(card.name)) {
      el.hidden = true
      return
    }
    // Other floating things in the stage, re-read now and then.
    if (t - s.othersAt > 400) {
      s.othersAt = t
      s.others.length = 0
      const host = gl.domElement.getBoundingClientRect()
      document.querySelectorAll<HTMLElement>('[data-float]').forEach(n => {
        if (n === el) return
        const r = n.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return
        s.others.push({ l: r.left - host.left, t: r.top - host.top, r: r.right - host.left, b: r.bottom - host.top })
      })
    }
    anchorFor(id, ap).project(camera)
    const x = ((ap.x + 1) / 2) * size.width
    const y = ((1 - ap.y) / 2) * size.height
    const W = size.width
    const H = size.height
    const cw = s.w
    const ch = s.h
    const clampX = (v: number) => Math.min(W - cw - PAD, Math.max(PAD, v))
    const clampY = (v: number) => Math.min(H - ch - PAD, Math.max(PAD, v))
    // Right of the anchor and a little above; flip left near the right edge, below near the top.
    const right = x + GAP + cw <= W - PAD
    const above = y - GAP - ch >= PAD
    const tries: [number, number][] = [
      [right ? x + GAP : x - GAP - cw, above ? y - ch - GAP * 0.5 : y + GAP],
      [right ? x - GAP - cw : x + GAP, above ? y - ch - GAP * 0.5 : y + GAP],
      [right ? x + GAP : x - GAP - cw, above ? y + GAP : y - ch - GAP * 0.5],
      [x - cw / 2, y + GAP * 2],
    ]
    let px = clampX(tries[0][0])
    let py = clampY(tries[0][1])
    for (const [tx, ty] of tries) {
      const bx = clampX(tx)
      const by = clampY(ty)
      const box = { l: bx, t: by, r: bx + cw, b: by + ch }
      if (!s.others.some(o => hits(box, o))) {
        px = bx
        py = by
        break
      }
    }
    el.style.transform = `translate3d(${Math.round(px)}px, ${Math.round(py)}px, 0)`
  })
  return null
}
const hasText = (n: HTMLElement) => !!n.textContent

function HoverCard() {
  return (
    <div
      className="s4-card"
      data-float="hover-card"
      role="status"
      aria-live="polite"
      hidden
      ref={el => {
        card.el = el
        card.name = el?.querySelector('.s4-card-name') ?? null
        card.line = el?.querySelector('.s4-card-line') ?? null
      }}
    >
      <strong className="s4-card-name" />
      <span className="s4-card-line" />
    </div>
  )
}

// ── Lens and finish ──────────────────────────────────────────────────────

type Tilt = { start: [number, number]; end: [number, number]; blur: number; taper: number }

/** The tilt-shift band, two passes (across, then up and down), kept on the lens line. */
function useLens() {
  const a = useRef<Tilt>(null)
  const b = useRef<Tilt>(null)
  const last = useRef({ y: -1, tall: false })
  useFrame(() => {
    const l = last.current
    if (Math.abs(l.y - lens.y) < 0.002 && l.tall === lens.tall) return
    l.y = lens.y
    l.tall = lens.tall
    for (const e of [a.current, b.current]) {
      if (!e) continue
      e.start = [0, lens.y]
      e.end = [1, lens.y]
      e.blur = lens.tall ? 0.06 : 0.08
      e.taper = lens.tall ? 0.45 : 0.36
    }
  })
  return [a, b] as const
}

/** Full quality on a real GPU; steps down (MSAA, then AO) if the frame rate can't hold. */
function Effects() {
  const [level, setLevel] = useState(2)
  const t0 = useRef(performance.now())
  const pinned = useMemo(pinnedQuality, [])
  const decline = () => {
    if (!pinned && performance.now() - t0.current > 4000) setLevel(l => Math.max(0, l - 1))
  }
  const [a, b] = useLens()
  return (
    <>
      <PerformanceMonitor ms={250} iterations={4} onDecline={decline} />
      {level === 2 ? (
        <EffectComposer key="fx2" multisampling={4}>
          <N8AO halfRes quality="low" aoRadius={0.6} distanceFalloff={0.7} intensity={2.0} color="#26303B" />
          <TiltShift2 ref={a as never} blur={0.11} taper={0.3} start={[0, 0.5]} end={[1, 0.5]} direction={[1, 0]} samples={10} />
          <TiltShift2 ref={b as never} blur={0.11} taper={0.3} start={[0, 0.5]} end={[1, 0.5]} direction={[0, 1]} samples={10} />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      ) : level === 1 ? (
        <EffectComposer key="fx1" multisampling={0}>
          <N8AO halfRes quality="performance" aoRadius={0.6} distanceFalloff={0.7} intensity={2.0} color="#26303B" />
          <TiltShift2 ref={a as never} blur={0.11} taper={0.3} start={[0, 0.5]} end={[1, 0.5]} direction={[1, 0]} samples={8} />
          <TiltShift2 ref={b as never} blur={0.11} taper={0.3} start={[0, 0.5]} end={[1, 0.5]} direction={[0, 1]} samples={8} />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          <SMAA />
        </EffectComposer>
      ) : (
        <EffectComposer key="fx0" multisampling={0}>
          <TiltShift2 ref={a as never} blur={0.09} taper={0.32} start={[0, 0.5]} end={[1, 0.5]} direction={[1, 0]} samples={6} />
          <TiltShift2 ref={b as never} blur={0.09} taper={0.32} start={[0, 0.5]} end={[1, 0.5]} direction={[0, 1]} samples={6} />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          <SMAA />
        </EffectComposer>
      )}
    </>
  )
}
/** Counts draw calls across every pass of a frame; readable as window.__a4stats. */
const stats = { calls: 0, triangles: 0, frames: 0, cam: [0, 0, 0], fov: 0, w: 0, h: 0, where: (id: string): number[] => [id.length] }
const wp = new Vector3()
function Calls() {
  const { gl, camera, size } = useThree()
  useEffect(() => {
    gl.info.autoReset = false
    ;(window as unknown as { __a4stats: typeof stats }).__a4stats = stats
    // Where a node is on the page, for scripted hover checks.
    stats.where = (id: string) => {
      const r = gl.domElement.getBoundingClientRect()
      const fl = floorFor(id, wp)
      const y0 = fl.y
      anchorFor(id, wp)
      wp.y = (wp.y + y0) / 2
      wp.project(camera)
      return [Math.round(r.left + ((wp.x + 1) / 2) * r.width), Math.round(r.top + ((1 - wp.y) / 2) * r.height)]
    }
    return () => {
      gl.info.autoReset = true
    }
  }, [gl, camera])
  useFrame(() => {
    stats.calls = gl.info.render.calls
    stats.triangles = gl.info.render.triangles
    stats.frames++
    stats.cam[0] = camera.position.x
    stats.cam[1] = camera.position.y
    stats.cam[2] = camera.position.z
    stats.fov = (camera as PerspectiveCamera).fov
    stats.w = size.width
    stats.h = size.height
    gl.info.reset()
  })
  return null
}

export default function Scene() {
  return (
    <div className="s4-wrap">
      <Canvas
        className="s4-canvas"
        shadows="soft"
        dpr={[1, 2]}
        camera={{ fov: 24, near: 0.5, far: 300, position: OPENING.pos.toArray() }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        role="img"
        aria-label="A miniature model of the Ortiz Lab beside a raised transit map of the grant office. Each request rides the map as the thing being bought, from a lab member to the purchasing agent and back, boxed when it is bought, re-tagged when it moves to the other grant, and deflated when it is turned down. Everything in the scene is also listed in the sidebar."
        onPointerMissed={() => {
          pointer.id = null
        }}
      >
        <Backdrop />
        <Ground />
        <Lights />
        <LabPlinth />
        <OfficePlinth />
        <Flow />
        <Halo />
        <ContactShadows position={[0.8, -3.1, 0]} scale={[38, 16]} blur={3} far={4.5} opacity={0.28} resolution={512} frames={1} color="#3A3530" />
        <Rig />
        <CardTracker />
        <Calls />
        <Effects />
      </Canvas>
      <HoverCard />
    </div>
  )
}
