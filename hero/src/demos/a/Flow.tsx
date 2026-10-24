// Everything in flight. Tokens are drawn from world.packets every frame (so
// nothing is missed), one InstancedMesh per form. Each outcome has its own
// form and motion: a parcel glides (bought), a ring corkscrews (rerouted or
// sent back), a flat tile slides low and slams (blocked), an upright pawn
// stops mid-gap and waits (held). Routes show as paper ribbons.

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
  type QuadraticBezierCurve3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { feed, progress, useFlow } from '../../feed'
import type { Packet } from '../../feed'
import { GLAZE, PAL, STATIONS, anchorOf, floorOf, ribbonKey, routeCurve } from './layout'
import { M } from './mats'
import { fx, now, ui, type Form, type Landing } from './store'

const CAP = 48
const FORMS: Form[] = ['coin', 'bead', 'money', 'slip', 'parcel', 'ring', 'tile', 'pawn']

const tinted = (roughness: number) => new MeshStandardMaterial({ color: '#ffffff', roughness })
const GEO: Record<Form, BufferGeometry> = {
  coin: new CylinderGeometry(0.17, 0.17, 0.075, 32),
  bead: new SphereGeometry(0.085, 20, 14),
  money: new CylinderGeometry(0.15, 0.15, 0.045, 32),
  slip: new BoxGeometry(0.36, 0.022, 0.26),
  parcel: new RoundedBoxGeometry(0.3, 0.3, 0.3, 3, 0.065),
  ring: new TorusGeometry(0.15, 0.058, 16, 40),
  tile: new RoundedBoxGeometry(0.4, 0.09, 0.4, 2, 0.028),
  pawn: new CapsuleGeometry(0.09, 0.2, 6, 16),
}
const MAT: Record<Form, Material> = {
  coin: tinted(0.8),
  bead: tinted(0.7),
  money: M.money,
  slip: tinted(0.65),
  parcel: M.glazeAccept,
  ring: M.glazeRefine,
  tile: M.glazeReject,
  pawn: M.glazeHold,
}
const TINTED = new Set<Form>(['coin', 'bead', 'slip'])

function formOf(p: Packet): Form {
  switch (p.kind) {
    case 'request':
    case 'pushback':
      return 'coin'
    case 'reading':
    case 'recheck':
      return 'bead'
    case 'payment':
    case 'charge':
      return 'money'
    case 'verdict':
      return p.outcome === 'accept' ? 'parcel' : p.outcome === 'refine' ? 'ring' : p.outcome === 'reject' ? 'tile' : 'pawn'
    default:
      return 'slip'
  }
}

const C = (hex: string) => new Color(hex)
const TINT = {
  request: C('#F2F4F6'),
  pushback: C('#7D8A99'),
  reading: C('#E3E8ED'),
  alarm: C('#4A5664'),
  recheck: C('#5E6B7A'),
  paper: C('#F6F7F8'),
  invoice: C('#D3DAE2'),
  hold: C(PAL.cobalt),
  accept: C(PAL.celadon),
  reject: C(PAL.oxblood),
}

function tintOf(p: Packet): Color {
  switch (p.kind) {
    case 'request':
      return TINT.request
    case 'pushback':
      return TINT.pushback
    case 'reading':
      return /no change/.test(p.label) ? TINT.reading : TINT.alarm
    case 'recheck':
      return TINT.recheck
    case 'hold':
      return TINT.hold
    case 'decision':
      return p.outcome === 'reject' ? TINT.reject : TINT.accept
    case 'invoice':
    case 'follow_up':
      return TINT.invoice
    default:
      return TINT.paper
  }
}

const sine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2
const cubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
// Races to the middle of the gap, stops there, then goes on: a held answer.
const plateau = (t: number) => {
  const u = 2 * t - 1
  return 0.5 + 0.5 * Math.sign(u) * Math.abs(u) ** 2.4
}
const backOut = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2

const UP = new Vector3(0, 1, 0)
const tan = new Vector3()
const side = new Vector3()
const nrm = new Vector3()
const off = new Vector3()

/** Pose a token along its route; writes into `o`. */
function pose(o: Object3D, curve: QuadraticBezierCurve3, k: number, t: number, form: Form) {
  o.rotation.set(0, 0, 0)
  o.scale.setScalar(1)
  let u = k
  if (form === 'parcel') u = cubic(k)
  else if (form === 'tile') u = k
  else if (form === 'pawn') u = plateau(k)
  else if (form === 'money') u = k ** 1.5
  else u = sine(k)
  curve.getPoint(u, o.position)
  curve.getTangent(u, tan)
  const yaw = Math.atan2(tan.x, tan.z)
  const arc = Math.sin(Math.PI * k)
  switch (form) {
    case 'parcel':
      o.position.y += 0.16 * arc
      o.rotation.set(0.25 * arc, yaw + k * Math.PI * 1.5, 0)
      break
    case 'ring': {
      side.crossVectors(tan, UP)
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0)
      side.normalize()
      nrm.crossVectors(side, tan).normalize()
      const a = k * Math.PI * 6
      off.copy(side).multiplyScalar(Math.cos(a)).addScaledVector(nrm, Math.sin(a)).multiplyScalar(0.3 * arc)
      o.position.add(off)
      o.rotation.set(a, yaw, 0)
      break
    }
    case 'tile':
      o.position.y -= 0.55 * arc
      o.rotation.set(0, yaw, 0)
      break
    case 'pawn':
      o.position.y += 0.07 * Math.sin(t * 0.006) * arc
      o.rotation.set(0, 0, 0.12 * Math.sin(t * 0.004) * arc)
      break
    case 'coin':
      o.rotation.set(Math.PI / 2 - 0.5 + 0.3 * Math.sin(k * Math.PI * 2), yaw, 0)
      break
    case 'slip':
      o.rotation.set(0.25 * Math.sin(k * Math.PI * 5), yaw, 0.2 * Math.sin(k * Math.PI * 3))
      break
    case 'money':
      o.rotation.set(0.4 * arc, k * Math.PI * 3, 0)
      break
    default:
      break
  }
  const pop = Math.min(1, k / 0.07)
  o.scale.multiplyScalar(0.4 + 0.6 * backOut(pop))
}

/** The landing moment after a verdict reaches the researcher. */
function poseLanding(o: Object3D, l: Landing, t: number): boolean {
  const ms = l.outcome === 'hold' ? 1100 : l.outcome === 'reject' ? 520 : 760
  const k = (t - l.at) / ms
  if (k < 0 || k >= 1) return false
  o.position.copy(l.pos)
  o.rotation.set(0, 0, 0)
  o.scale.setScalar(1)
  const fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1
  if (l.outcome === 'reject') {
    const drop = Math.min(1, k / 0.25)
    o.position.y -= 0.5 * drop * drop
    const squash = k > 0.25 ? Math.sin(Math.min(1, (k - 0.25) / 0.3) * Math.PI) : 0
    o.scale.set(1 + 0.45 * squash, 1 - 0.55 * squash, 1 + 0.45 * squash)
  } else if (l.outcome === 'hold') {
    o.position.y += 0.05 * Math.sin(k * Math.PI * 4)
    o.scale.setScalar(1 + 0.12 * Math.sin(k * Math.PI * 3))
  } else if (l.outcome === 'refine') {
    o.rotation.set(Math.PI / 2, k * Math.PI * 2, 0)
  } else {
    const b = Math.abs(Math.sin(k * Math.PI * 2.2)) * (1 - k)
    o.position.y += 0.22 * b - 0.25 * k
    const sq = Math.sin(Math.min(1, k * 2.2) * Math.PI) * (1 - k)
    o.scale.set(1 + 0.2 * sq, 1 - 0.25 * sq, 1 + 0.2 * sq)
  }
  o.scale.multiplyScalar(Math.max(0.001, fade))
  return true
}

// ── Labels for tokens in flight (pooled DOM, positioned each frame) ──────

const LABELED = new Set(['request', 'verdict', 'pushback', 'hold', 'decision', 'paper', 'invoice', 'payment_request', 'follow_up', 'payment', 'reading', 'charge'])

function labelFor(p: Packet, mine: string[]): string | null {
  if (!LABELED.has(p.kind)) return null
  if (p.kind === 'reading' && /no change/.test(p.label)) return null
  const you = p.refId && mine.includes(p.refId) ? 'Yours · ' : ''
  return you + p.label
}

const rank = (p: Packet) => (p.kind === 'verdict' ? 0 : p.kind === 'request' || p.kind === 'pushback' ? 1 : p.kind === 'charge' ? 3 : 2)

interface Slot {
  el: HTMLDivElement
  text: string
  tone: string
}

// ── Ribbons ──────────────────────────────────────────────────────────────

function ribbonGeometry(curve: QuadraticBezierCurve3, width: number, segs = 72) {
  const pos = new Float32Array((segs + 1) * 2 * 3)
  const nor = new Float32Array((segs + 1) * 2 * 3)
  const idx: number[] = []
  const p = new Vector3()
  const T = new Vector3()
  const S = new Vector3()
  const N = new Vector3()
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    curve.getPoint(t, p)
    curve.getTangent(t, T)
    S.crossVectors(T, UP)
    if (S.lengthSq() < 1e-6) S.set(1, 0, 0)
    S.normalize()
    N.crossVectors(S, T).normalize()
    const w = (width / 2) * (0.35 + 0.65 * Math.sin(Math.PI * t))
    pos.set([p.x - S.x * w, p.y - S.y * w, p.z - S.z * w, p.x + S.x * w, p.y + S.y * w, p.z + S.z * w], i * 6)
    nor.set([N.x, N.y, N.z, N.x, N.y, N.z], i * 6)
    if (i < segs) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('normal', new BufferAttribute(nor, 3))
  g.setIndex(idx)
  return g
}

interface Ribbon {
  mesh: Mesh
  mat: MeshStandardMaterial
  level: number
  base: number
}

const ribbonWhite = new Color(PAL.porcelain)
const glazeColor = Object.fromEntries(Object.entries(GLAZE).map(([k, v]) => [k, new Color(v)])) as Record<string, Color>

function Ribbons() {
  const group = useRef<Group>(null)
  const items = useRef(new Map<string, Ribbon>())

  const ensure = (a: string, b: string, base = 0) => {
    const key = ribbonKey(a, b)
    let r = items.current.get(key)
    if (!r && group.current) {
      const [x, y] = key.split('|')
      const mat = new MeshStandardMaterial({ color: PAL.porcelain, roughness: 0.55, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false })
      const mesh = new Mesh(ribbonGeometry(routeCurve(x, y), 0.075), mat)
      mesh.renderOrder = 1
      group.current.add(mesh)
      r = { mesh, mat, level: base, base }
      items.current.set(key, r)
    }
    return r
  }

  useEffect(() => {
    for (const id of Object.keys(STATIONS)) ensure(`r:${id}`, 'a:purchasing', 0.42)
    const map = items.current
    return () => {
      for (const r of map.values()) {
        r.mesh.removeFromParent()
        r.mesh.geometry.dispose()
        r.mat.dispose()
      }
      map.clear()
    }
  }, [])

  const active = useMemo(() => new Map<string, string | undefined>(), [])
  useFrame((_, dt) => {
    active.clear()
    for (const p of feed.getWorld().packets) {
      ensure(p.from, p.to)
      const key = ribbonKey(p.from, p.to)
      const prev = active.get(key)
      active.set(key, p.kind === 'verdict' ? p.outcome : prev)
    }
    const k = Math.min(1, dt * 4)
    for (const [key, r] of items.current) {
      const on = active.has(key)
      r.level += ((on ? 1 : r.base) - r.level) * k
      r.mat.opacity = r.level * 0.82
      r.mesh.visible = r.level > 0.015
      const glaze = active.get(key)
      r.mat.color.lerp(glaze ? glazeColor[glaze] : ribbonWhite, k)
    }
  })

  return <group ref={group} />
}

// ── Ripples ──────────────────────────────────────────────────────────────

const RIPPLES = 16
const ringGeo = new RingGeometry(0.86, 1, 64)

function Ripples() {
  const meshes = useRef<Mesh[]>([])
  const mats = useMemo(() => Array.from({ length: RIPPLES }, () => new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })), [])
  useFrame(() => {
    const t = now()
    fx.ripples = fx.ripples.filter(r => t - r.at < r.ms)
    for (let i = 0; i < RIPPLES; i++) {
      const m = meshes.current[i]
      if (!m) continue
      const r = fx.ripples[fx.ripples.length - 1 - i]
      const k = r ? (t - r.at) / r.ms : -1
      if (!r || k < 0) {
        m.visible = false
        continue
      }
      m.visible = true
      m.position.copy(r.pos)
      const e = 1 - (1 - k) ** 3
      m.scale.setScalar(0.15 + e * r.size)
      mats[i].color.set(r.color)
      mats[i].opacity = 0.85 * (1 - k)
    }
  })
  return (
    <group>
      {mats.map((m, i) => (
        <mesh
          key={i}
          ref={el => {
            if (el) meshes.current[i] = el
          }}
          geometry={ringGeo}
          material={m}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
          renderOrder={3}
        />
      ))}
    </group>
  )
}

// ── Effects kicked off by feed events ────────────────────────────────────

function arrivalColor(p: Packet): string {
  if (p.kind === 'verdict' && p.outcome) return GLAZE[p.outcome]
  if (p.kind === 'hold') return PAL.cobalt
  if (p.kind === 'decision') return p.outcome === 'reject' ? PAL.oxblood : PAL.celadon
  if (p.kind === 'payment') return PAL.money
  return '#F4F6F8'
}

function FlowFx() {
  useFlow(e => {
    const t = now()
    if (e.type === 'reset') {
      fx.clear()
      pours.length = 0
      return
    }
    if (e.type === 'rule') fx.pulses.set('a:purchasing', t)
    if (e.type === 'packet') {
      fx.pulses.set(e.packet.from, t)
      if (e.packet.from.startsWith('r:')) fx.reactions.set(e.packet.from.slice(2), { kind: 'send', at: t })
    }
    if (e.type === 'arrive') {
      const p = e.packet
      fx.pulses.set(p.to, t)
      const verdict = p.kind === 'verdict'
      const size = verdict ? (p.outcome === 'reject' ? 1.6 : 1.25) : p.kind === 'request' || p.kind === 'payment' ? 1.0 : 0.6
      fx.ripples.push({ pos: floorOf(p.to), color: arrivalColor(p), at: t, size, ms: verdict ? 1100 : 800 })
      if (verdict && p.to.startsWith('r:')) {
        fx.landings.push({ form: formOf(p), color: arrivalColor(p), pos: anchorOf(p.to), at: t, outcome: p.outcome })
        if (p.outcome) fx.reactions.set(p.to.slice(2), { kind: p.outcome, at: t })
      }
    }
    if (e.type === 'grant' && e.event?.kind === 'payment_received') {
      // The cash travels on from the bookkeeping agent into the reservoir.
      pours.push({ from: anchorOf('a:bookkeeping'), to: anchorOf(`g:${e.grant.id}`).setY(0.9), at: t, ms: 700 })
    }
  })
  return null
}

interface Pour {
  from: Vector3
  to: Vector3
  at: number
  ms: number
}
const pours: Pour[] = []

// ── Tokens ───────────────────────────────────────────────────────────────

function Tokens() {
  const meshes = useRef<Partial<Record<Form, InstancedMesh>>>({})
  const { camera, size, gl } = useThree()
  const slots = useRef<Slot[]>([])
  const dummy = useMemo(() => new Object3D(), [])
  const v = useMemo(() => new Vector3(), [])

  useEffect(() => {
    const host = gl.domElement.parentElement
    if (!host) return
    const layer = document.createElement('div')
    layer.className = 'a-tokenlabels'
    layer.setAttribute('aria-hidden', 'true')
    host.appendChild(layer)
    slots.current = Array.from({ length: 10 }, () => {
      const el = document.createElement('div')
      el.className = 'a-tl'
      el.style.display = 'none'
      layer.appendChild(el)
      return { el, text: '', tone: '' }
    })
    return () => {
      layer.remove()
      slots.current = []
    }
  }, [gl])

  const labeled = useMemo<{ p: Packet; pos: Vector3; text: string }[]>(() => [], [])

  useFrame(() => {
    const w = feed.getWorld()
    const t = now()
    const counts: Record<Form, number> = { coin: 0, bead: 0, money: 0, slip: 0, parcel: 0, ring: 0, tile: 0, pawn: 0 }
    const mine = ui.get().mine
    labeled.length = 0

    const put = (form: Form, color?: Color) => {
      const m = meshes.current[form]
      if (!m || counts[form] >= CAP) return
      dummy.updateMatrix()
      m.setMatrixAt(counts[form], dummy.matrix)
      if (color && TINTED.has(form)) m.setColorAt(counts[form], color)
      counts[form]++
    }

    for (const p of w.packets) {
      const form = formOf(p)
      const k = progress(p, t)
      pose(dummy, routeCurve(p.from, p.to), k, t, form)
      put(form, tintOf(p))
      if (form === 'money' && (p.amount ?? 0) >= 10000) {
        // A big payment travels as a short stack of coins.
        dummy.position.y += 0.055
        put(form)
        dummy.position.y += 0.055
        put(form)
      }
      const text = labelFor(p, mine)
      if (text) labeled.push({ p, pos: dummy.position.clone(), text })
    }

    fx.landings = fx.landings.filter(l => t - l.at < 1200)
    for (const l of fx.landings) if (poseLanding(dummy, l, t)) put(l.form)

    for (let i = pours.length - 1; i >= 0; i--) {
      const pr = pours[i]
      const k = (t - pr.at) / pr.ms
      if (k >= 1 || k < -0.01) {
        if (k >= 1) {
          fx.ripples.push({ pos: new Vector3(pr.to.x, 0.02, pr.to.z), color: PAL.money, at: t, size: 1.0, ms: 900 })
          pours.splice(i, 1)
        }
        continue
      }
      dummy.position.lerpVectors(pr.from, pr.to, k)
      dummy.position.y += Math.sin(Math.PI * k) * 0.9
      dummy.rotation.set(0.4, k * 6, 0)
      dummy.scale.setScalar(1)
      for (let j = 0; j < 3; j++) {
        put('money')
        dummy.position.y += 0.055
      }
    }

    for (const f of FORMS) {
      const m = meshes.current[f]
      if (!m) continue
      m.count = counts[f]
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }

    // Labels: verdicts first, then requests, then the rest.
    labeled.sort((a, b) => rank(a.p) - rank(b.p))
    const narrow = size.width < 640
    let n = 0
    for (const item of labeled) {
      if (n >= slots.current.length) break
      if (narrow && rank(item.p) > 1) continue
      v.copy(item.pos).project(camera)
      if (v.z > 1) continue
      const s = slots.current[n++]
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      const tone = item.p.kind === 'verdict' ? (item.p.outcome ?? '') : item.p.kind
      if (s.text !== item.text) {
        s.el.textContent = item.text
        s.text = item.text
      }
      if (s.tone !== tone) {
        s.el.dataset.tone = tone
        s.tone = tone
      }
      s.el.style.display = ''
      s.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    }
    for (let i = n; i < slots.current.length; i++) slots.current[i].el.style.display = 'none'
  })

  return (
    <>
      {FORMS.map(f => (
        <instancedMesh
          key={f}
          ref={el => {
            if (el && !meshes.current[f]) {
              meshes.current[f] = el
              if (TINTED.has(f)) el.setColorAt(0, TINT.request)
              el.count = 0
            }
          }}
          args={[GEO[f], MAT[f], CAP]}
          castShadow
          frustumCulled={false}
        />
      ))}
    </>
  )
}

export function Flow() {
  useEffect(() => () => {
    pours.length = 0
  }, [])
  return (
    <>
      <FlowFx />
      <Ribbons />
      <Ripples />
      <Tokens />
    </>
  )
}
