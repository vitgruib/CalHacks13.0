// Everything in motion. A request is one clay parcel for its whole life: it
// pops from the researcher's bench, arcs to the purchasing desk, squashes on
// landing while the rule pips light, takes a stamp, and flies home to become
// a delivered box (bought), a box from the other grant (rerouted), or a heap
// that deflates (blocked). Held for money, it hovers beside the frozen grant
// until cash lands; held for the grant manager, it waits on their desk.
// Where each parcel is comes from the world every frame, so mounting
// mid-story shows the right picture; feed events only add the moments.

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { feed, progress, useFlow } from '../../feed'
import type { Outcome, Packet } from '../../feed'
import {
  DESK_H,
  DESK_SPOT,
  GLAZE,
  GM_SPOT,
  PAL,
  PARCEL,
  RESERVOIRS,
  STATIONS,
  arcHeight,
  arcPoint,
  groundAt,
  isLab,
  landOf,
  parkOf,
  spot,
} from './layout'
import { liquid } from './mats'
import { fx, now, reducedMotion } from './store'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const sine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
/** 0 → 1.12 → 1: the parcel pops out of the bench. */
const pop = (x: number) => (x < 0.6 ? 1.12 * (1 - (1 - x / 0.6) ** 3) : 1.12 - 0.12 * inOut((x - 0.6) / 0.4))
/** A short squash and spring back on landing; returns how squashed (0 = none). */
const squash = (ms: number) => (ms < 0 || ms > 300 ? 0 : 0.3 * (1 - ms / 300) ** 2 * Math.cos((ms / 300) * Math.PI * 1.6))

const LAUNCH = 0.15 // of a request's flight: the dip, then the pop at the bench
const STAMP = 0.16 // of an answer's flight: the stamp on the desk before it leaves
const CAP = 40

const C = (hex: string) => new Color(hex)
const BISQUE = C(PAL.parcel)
const GL: Record<Outcome, Color> = { accept: C(GLAZE.accept), refine: C(GLAZE.refine), reject: C(GLAZE.reject), hold: C(GLAZE.hold) }
const MONEY = C(PAL.money)
const AMBER = C(PAL.ochre)
const WHITE = C('#FFFFFF')
const SLIP = C('#F4F0E9')
const ALARM = C('#2A313A')
const TRAIL_LIGHT = C('#FFFFFF')

const DESK = new Vector3(...DESK_SPOT)
const GM = new Vector3(...GM_SPOT)

const setAnchor = (id: string, out: Vector3) => out.set(...spot(id).anchor)

// ── Scene-local memory (dropped on 'reset') ──────────────────────────────

type PState = 'out' | 'desk' | 'return' | 'toGm' | 'gm' | 'fromGm' | 'toPark' | 'park'
interface Life {
  state: PState | null
  pos: Vector3
  tween: { from: Vector3; at: number; ms: number } | null
  restAt: number // when it last came to rest (desk or grant manager), for the squash
  tint: Color | null // the last stamp it took
  seen: number
}
interface Landed {
  pos: Vector3
  stack: Vector3
  at: number
  kind: 'bought' | 'rerouted' | 'sentBack' | 'blocked'
}
interface Stream {
  a: Vector3
  b: Vector3
  at: number
  n: number
  ms: number
  gap: number
}
interface Fading {
  a: Vector3
  b: Vector3
  h: number
  color: Color
  width: number
  at: number
}

const lives = new Map<string, Life>()
const landed: Landed[] = []
const streams: Stream[] = []
const fading: Fading[] = []
let frame = 0

function clearAll() {
  fx.clear()
  lives.clear()
  landed.length = 0
  streams.length = 0
  fading.length = 0
}

// ── Paths ────────────────────────────────────────────────────────────────

interface Path {
  a: Vector3
  b: Vector3
  h: number
}

function pathOf(p: Packet, carried: boolean, out: Path) {
  if (carried && p.kind === 'request') {
    landOf(p.from, out.a)
    out.b.copy(DESK)
    out.h = arcHeight(out.a, out.b, true)
  } else if (carried && p.kind === 'verdict') {
    out.a.copy(DESK)
    landOf(p.to, out.b)
    out.h = arcHeight(out.a, out.b, true) * (p.outcome === 'reject' ? 0.7 : 1)
  } else if (carried && p.kind === 'hold') {
    out.a.copy(DESK)
    out.b.copy(GM)
    out.h = 0.9
  } else if (carried && p.kind === 'decision') {
    out.a.copy(GM)
    out.b.copy(DESK)
    out.h = 0.9
  } else {
    setAnchor(p.from, out.a)
    setAnchor(p.to, out.b)
    out.h = arcHeight(out.a, out.b, isLab(p.from) !== isLab(p.to))
  }
  return out
}

const trailed = (p: Packet) =>
  p.kind !== 'recheck' && p.kind !== 'charge' && p.kind !== 'payment' && !(p.kind === 'reading' && /no change/.test(p.label))

function trailColor(p: Packet): Color {
  if (p.kind === 'verdict' && p.outcome) return GL[p.outcome]
  if (p.kind === 'hold') return GL.hold
  if (p.kind === 'decision') return p.outcome === 'reject' ? GL.reject : GL.accept
  if (p.kind === 'reading') return ALARM
  return TRAIL_LIGHT
}

// ── Effects kicked off by feed events ────────────────────────────────────

function FlowFx() {
  useFlow(e => {
    const t = now()
    if (e.type === 'reset') {
      clearAll()
      return
    }
    if (e.type === 'packet') {
      fx.pulses.set(e.packet.from, t)
      if (e.packet.from.startsWith('r:')) fx.reactions.set(e.packet.from.slice(2), { kind: 'send', at: t })
    }
    if (e.type === 'arrive') {
      const p = e.packet
      fx.pulses.set(p.to, t)
      const w = feed.getWorld()
      const req = p.refId ? w.requests.find(r => r.id === p.refId) : undefined
      const carried = !!req && (p.kind === 'request' || (p.kind === 'verdict' && p.outcome !== 'hold') || p.kind === 'hold' || p.kind === 'decision')
      if (trailed(p)) {
        const path = pathOf(p, carried, { a: new Vector3(), b: new Vector3(), h: 0 })
        fading.push({ ...path, color: trailColor(p), width: carried ? 0.16 : 0.07, at: t })
      }
      if (p.kind === 'request' && p.to === 'a:purchasing') {
        fx.ripples.push({ pos: new Vector3(DESK.x, DESK_H + 0.012, DESK.z), color: '#F3F8FF', at: t, size: 0.95, ms: 700 })
      }
      if (p.kind === 'verdict' && p.to.startsWith('r:') && p.outcome) {
        fx.reactions.set(p.to.slice(2), { kind: p.outcome, at: t })
        if (req && p.outcome !== 'hold') {
          const s = STATIONS[p.to.slice(2)]
          const kind = p.outcome === 'reject' ? 'blocked' : p.outcome === 'accept' ? 'bought' : req.state === 'rerouted' || req.chargedGrantId ? 'rerouted' : 'sentBack'
          landed.push({ pos: landOf(p.to), stack: s ? new Vector3(s.stack[0], 0.5, s.stack[2]) : landOf(p.to), at: t, kind })
          fx.ripples.push({ pos: landOf(p.to).setY(0.015), color: GLAZE[p.outcome], at: t, size: 0.7, ms: 700 })
        }
      }
    }
    if (e.type === 'grant' && e.event?.kind === 'payment_received') {
      // The money itself: a stream of drops from the funder into the grant.
      const r = RESERVOIRS[e.grant.id]
      if (r) {
        const a = new Vector3(...spot('p:funder').anchor)
        const b = new Vector3(r[0], 0.95, r[2])
        streams.push({ a, b, at: t, n: 12, ms: 650, gap: 55 })
        fx.slosh.set(e.grant.id, { at: t + 650, amp: 1 })
        fx.ripples.push({ pos: new Vector3(r[0], 1.0, r[2]), color: PAL.money, at: t + 650, size: 0.8, ms: 900 })
      }
    }
  })
  return null
}

// ── Ripples ──────────────────────────────────────────────────────────────

const RIPPLES = 14
const ringGeo = new RingGeometry(0.88, 1, 64)

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
      m.scale.setScalar(0.15 + expoOut(k) * r.size)
      mats[i].color.set(r.color)
      mats[i].opacity = 0.8 * (1 - k) ** 1.5
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

// ── Trails: drawn only while something travels, gone soon after ─────────

const TRAILS = 14
const SEG = 32

interface TrailSlot {
  mesh: Mesh
  mat: MeshBasicMaterial
  pos: Float32Array
  col: Float32Array
}

function makeTrail(): TrailSlot {
  const pos = new Float32Array((SEG + 1) * 2 * 3)
  const col = new Float32Array((SEG + 1) * 2 * 4)
  const idx: number[] = []
  for (let i = 0; i < SEG; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('color', new BufferAttribute(col, 4))
  g.setIndex(idx)
  const mat = new MeshBasicMaterial({ color: '#ffffff', vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide })
  const mesh = new Mesh(g, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  mesh.visible = false
  return { mesh, mat, pos, col }
}

const tp = new Vector3()
const tq = new Vector3()
const tt = new Vector3()
const ts = new Vector3()
const tv = new Vector3()

function writeTrail(s: TrailSlot, path: Path, u0: number, u1: number, width: number, cam: Vector3) {
  for (let i = 0; i <= SEG; i++) {
    const f = i / SEG
    const u = u0 + (u1 - u0) * f
    arcPoint(path.a, path.b, u, path.h, tp)
    arcPoint(path.a, path.b, Math.min(1, u + 0.01), path.h, tq)
    tt.subVectors(tq, tp)
    if (tt.lengthSq() < 1e-10) tt.set(1, 0, 0)
    tv.subVectors(cam, tp)
    ts.crossVectors(tt, tv).normalize()
    const w = (width / 2) * f ** 1.3
    s.pos.set([tp.x - ts.x * w, tp.y - ts.y * w, tp.z - ts.z * w, tp.x + ts.x * w, tp.y + ts.y * w, tp.z + ts.z * w], i * 6)
    const a = f ** 0.9
    s.col.set([1, 1, 1, a, 1, 1, 1, a], i * 8)
  }
  const g = s.mesh.geometry
  g.attributes.position.needsUpdate = true
  g.attributes.color.needsUpdate = true
}

// ── Geometry and materials ───────────────────────────────────────────────

const parcelGeo = new RoundedBoxGeometry(PARCEL, PARCEL * 0.84, PARCEL, 4, 0.085)
const parcelMat = new MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.4 })
const beadGeo = new SphereGeometry(0.09, 20, 14)
const beadMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 })
const slipGeo = new BoxGeometry(0.36, 0.026, 0.26)
const slipMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.62 })
const dropGeo = new SphereGeometry(0.075, 18, 12)
const dropMat = liquid('#ffffff')
const blobGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
const blobMat = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uColor: { value: C('#1F2630') } },
  vertexShader: [
    'varying vec2 vUv; varying float vS;',
    'void main() {',
    '  vUv = uv;',
    '  vS = 1.0;',
    '  vec4 p = vec4(position, 1.0);',
    '  #ifdef USE_INSTANCING_COLOR',
    '  vS = instanceColor.r;',
    '  #endif',
    '  #ifdef USE_INSTANCING',
    '  p = instanceMatrix * p;',
    '  #endif',
    '  gl_Position = projectionMatrix * modelViewMatrix * p;',
    '}',
  ].join('\n'),
  fragmentShader: [
    'uniform vec3 uColor; varying vec2 vUv; varying float vS;',
    'void main() {',
    '  float d = length(vUv - 0.5) * 2.0;',
    '  float a = 1.0 - smoothstep(0.0, 1.0, d);',
    '  gl_FragColor = vec4(uColor, a * a * vS);',
    '}',
  ].join('\n'),
})

// ── The moving parts ─────────────────────────────────────────────────────

const o = new Object3D()
const pa = new Vector3()
const pb = new Vector3()
const pc = new Vector3()
const col = new Color()
const path: Path = { a: new Vector3(), b: new Vector3(), h: 0 }

function Moving() {
  const { camera } = useThree()
  const parcels = useRef<InstancedMesh>(null)
  const beads = useRef<InstancedMesh>(null)
  const slips = useRef<InstancedMesh>(null)
  const drops = useRef<InstancedMesh>(null)
  const blobs = useRef<InstancedMesh>(null)
  const trails = useMemo(() => Array.from({ length: TRAILS }, makeTrail), [])
  const still = useMemo(reducedMotion, [])

  useEffect(() => {
    for (const m of [parcels.current, beads.current, slips.current, drops.current, blobs.current]) {
      if (!m) continue
      m.setColorAt(0, WHITE)
      m.count = 0
    }
    return () => {
      for (const s of trails) {
        s.mesh.geometry.dispose()
        s.mat.dispose()
      }
    }
  }, [trails])

  useFrame(() => {
    const P = parcels.current, Bd = beads.current, S = slips.current, D = drops.current, Bl = blobs.current
    if (!P || !Bd || !S || !D || !Bl) return
    const w = feed.getWorld()
    const t = now()
    frame++
    let np = 0, nb = 0, ns = 0, nd = 0, nbl = 0, ntr = 0

    const put = (m: InstancedMesh, i: number, c: Color) => {
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, c)
    }
    const blob = (x: number, y: number, z: number, height: number, size = 0.62) => {
      if (nbl >= CAP) return
      const strength = 0.42 * clamp01(1 - height / 4.2)
      if (strength <= 0.01) return
      o.position.set(x, y + 0.008, z)
      o.rotation.set(0, 0, 0)
      o.scale.setScalar(size * (1 + height * 0.16))
      col.setRGB(strength, strength, strength)
      put(Bl, nbl++, col)
    }
    const ground = (x: number, y: number, z: number, h = 0) => {
      const g = groundAt(x, z)
      if (g !== null) blob(x, g, z, y - g, h || 0.62)
    }
    const trail = (pth: Path, u0: number, u1: number, c: Color, width: number, alpha: number) => {
      if (ntr >= TRAILS || u1 <= u0 + 0.001) return
      const s = trails[ntr++]
      writeTrail(s, pth, u0, u1, width, camera.position)
      s.mat.color.copy(c)
      s.mat.opacity = alpha
      s.mesh.visible = true
    }
    /** Orient along the travel direction, pitched with the arc, rolled a little: the spin. */
    const orient = (pth: Path, u: number, roll: number) => {
      arcPoint(pth.a, pth.b, Math.min(1, u + 0.02), pth.h, pc)
      arcPoint(pth.a, pth.b, Math.max(0, u - 0.02), pth.h, pb)
      pc.sub(pb)
      const yaw = Math.atan2(pc.x, pc.z)
      const pitch = -Math.atan2(pc.y, Math.hypot(pc.x, pc.z))
      o.rotation.set(still ? 0 : pitch * 0.6, yaw, still ? 0 : roll, 'YXZ')
    }

    // Index what's in flight by the request it belongs to.
    const byRef = new Map<string, Packet[]>()
    for (const p of w.packets) {
      if (!p.refId) continue
      const l = byRef.get(p.refId)
      if (l) l.push(p)
      else byRef.set(p.refId, [p])
    }
    const known = new Set<string>()
    for (const r of w.requests) known.add(r.id)
    const openHolds = new Set<string>()
    for (const h of w.holds) if (h.open && h.kind === 'purchase') openHolds.add(h.refId)

    // Parked parcels keep a slot per grant, oldest first.
    const parkSlot = new Map<string, number>()
    const parkCount: Record<string, number> = {}
    for (let i = w.requests.length - 1; i >= 0; i--) {
      const r = w.requests[i]
      if (r.outcome === 'hold' && r.holdFor === 'payment') {
        const n = parkCount[r.grantId] ?? 0
        parkSlot.set(r.id, n)
        parkCount[r.grantId] = n + 1
      }
    }

    let atDesk = 0
    const reqs = w.requests.slice(0, 36)
    for (const r of reqs) {
      const ps = byRef.get(r.id) ?? []
      const pReq = ps.find(p => p.kind === 'request')
      const pHold = ps.find(p => p.kind === 'hold')
      const pDec = ps.find(p => p.kind === 'decision')
      const pVer = ps.find(p => p.kind === 'verdict')
      const busy = ps.some(p => p.kind === 'recheck' || p.kind === 'reading' || p.kind === 'pushback')
      let state: PState | null = null
      if (pReq) state = 'out'
      else if (pHold) state = 'toGm'
      else if (pDec) state = 'fromGm'
      else if (openHolds.has(r.id)) state = 'gm'
      else if (pVer && pVer.outcome === 'hold' && pVer.holdFor === 'payment') state = 'toPark'
      else if (pVer && pVer.outcome !== 'hold') state = 'return'
      else if (busy) state = 'desk'
      else if (r.outcome === 'hold' && r.holdFor === 'payment') state = 'park'
      else if (r.outcome === undefined) state = 'desk'
      if (!state) {
        lives.delete(r.id)
        continue
      }

      let life = lives.get(r.id)
      const first = !life
      if (!life) {
        life = { state: null, pos: new Vector3(), tween: null, restAt: -1e9, tint: null, seen: frame }
        lives.set(r.id, life)
      }
      life.seen = frame
      const prev = life.state
      if (prev !== state) {
        const restful = (s: PState | null) => s === 'desk' || s === 'gm' || s === 'park'
        if (!first && restful(prev) && restful(state)) life.tween = { from: life.pos.clone(), at: t, ms: still ? 0 : 900 }
        else life.tween = null
        if (state === 'out') life.tint = null
        if (!first && (state === 'desk' || state === 'gm') && !life.tween) life.restAt = t
        if (!first && state === 'return' && pVer?.outcome) fx.ripples.push({ pos: new Vector3(DESK.x, DESK_H + 0.012, DESK.z), color: GLAZE[pVer.outcome], at: t, size: 1.1, ms: 650 })
        if (!first && state === 'fromGm' && pDec) fx.ripples.push({ pos: new Vector3(GM.x, DESK_H + 0.012, GM.z), color: pDec.outcome === 'reject' ? PAL.oxblood : PAL.celadon, at: t, size: 0.9, ms: 650 })
        life.state = state
      }

      o.rotation.set(0, 0, 0)
      o.scale.setScalar(1)
      col.copy(life.tint ?? BISQUE)
      let shadowY: number | null = null // a surface the parcel rests on, if not the plinth

      // Parcels resting where they were: a tween covers the hop between rests.
      const rest = (target: Vector3) => {
        const tw = life!.tween
        if (tw) {
          const k = tw.ms <= 0 ? 1 : clamp01((t - tw.at) / tw.ms)
          arcPoint(tw.from, target, still ? k : expoOut(k), 0.8, o.position)
          if (k >= 1) {
            life!.tween = null
            life!.restAt = t
          }
          return false
        }
        o.position.copy(target)
        return true
      }

      if (state === 'out' && pReq) {
        const k = progress(pReq, t)
        pathOf(pReq, true, path)
        if (k < LAUNCH && !still) {
          o.position.copy(path.a)
          const x = (k / LAUNCH - 0.28) / 0.72
          o.scale.setScalar(x <= 0 ? 0.0001 : pop(x))
        } else {
          const u = still ? k : inOut((k - LAUNCH) / (1 - LAUNCH))
          arcPoint(path.a, path.b, u, path.h, o.position)
          orient(path, u, u * Math.PI * 0.75)
          trail(path, Math.max(0, u - 0.5), u, TRAIL_LIGHT, 0.16, 0.7)
        }
      } else if (state === 'desk') {
        pa.copy(DESK)
        pa.x += atDesk === 0 ? 0 : (atDesk % 2 ? -0.48 : 0.48)
        atDesk++
        if (rest(pa)) {
          const q = still ? 0 : squash(t - life.restAt)
          o.scale.set(1 + q * 0.6, 1 - q, 1 + q * 0.6)
          o.position.y -= (q * PARCEL * 0.84) / 2
        }
        shadowY = DESK_H
      } else if ((state === 'return' && pVer) || (state === 'toGm' && pHold) || (state === 'fromGm' && pDec) || (state === 'toPark' && pVer)) {
        const p = (state === 'toGm' ? pHold : state === 'fromGm' ? pDec : pVer)!
        const k = progress(p, t)
        const to: Outcome = state === 'fromGm' ? (p.outcome === 'reject' ? 'reject' : 'accept') : state === 'toGm' || state === 'toPark' ? 'hold' : (p.outcome ?? 'accept')
        const stampEnd = state === 'toGm' || state === 'fromGm' ? 0.28 : STAMP
        const from = life.tint ?? BISQUE
        if (state === 'toPark') {
          path.a.copy(DESK)
          parkOf(r.grantId, parkSlot.get(r.id) ?? 0, path.b)
          path.h = 0.7
        } else pathOf(p, true, path)
        if (k < stampEnd) {
          // The stamp: a punch of scale and the outcome's colour washing over it.
          const s = k / stampEnd
          o.position.copy(path.a)
          if (!still) o.scale.setScalar(1 + 0.3 * Math.sin(Math.PI * s))
          col.copy(from).lerp(GL[to], smooth(0.15, 0.8, s))
          shadowY = DESK_H
        } else {
          const span = state === 'toPark' ? 0.4 : 1 - stampEnd
          const raw = clamp01((k - stampEnd) / span)
          const u = still ? raw : inOut(raw)
          arcPoint(path.a, path.b, u, path.h, o.position)
          orient(path, u, state === 'return' ? u * Math.PI * 0.75 : 0)
          col.copy(GL[to])
          if (state !== 'toPark') trail(path, Math.max(0, u - 0.5), u, GL[to], 0.16, 0.75)
          if (state === 'toPark' && raw >= 1 && !still) o.position.y += 0.06 * Math.sin((t / 2400) * Math.PI * 2 + r.id.length)
        }
        if (k >= stampEnd) life.tint = GL[to]
      } else if (state === 'gm') {
        if (rest(GM) && !still) {
          const q = squash(t - life.restAt)
          const breathe = 1 + 0.06 * Math.sin(((t - life.restAt) / 1600) * Math.PI * 2)
          o.scale.set(breathe * (1 + q * 0.6), breathe * (1 - q), breathe * (1 + q * 0.6))
        }
        col.copy(GL.hold)
        shadowY = DESK_H
      } else if (state === 'park') {
        parkOf(r.grantId, parkSlot.get(r.id) ?? 0, pa)
        if (rest(pa) && !still) o.position.y += 0.06 * Math.sin((t / 2400) * Math.PI * 2 + r.id.length)
        col.copy(GL.hold)
      }

      life.pos.copy(o.position)
      if (np < CAP) put(P, np++, col)
      if (shadowY !== null) blob(o.position.x, shadowY, o.position.z, 0, 0.6)
      else ground(o.position.x, o.position.y, o.position.z)
    }
    for (const [id, l] of lives) if (frame - l.seen > 2) lives.delete(id)

    // Answers that came home: a delivered box, or a heap that gives way.
    for (let i = landed.length - 1; i >= 0; i--) {
      const l = landed[i]
      const e = t - l.at
      const hold = l.kind === 'blocked' ? 1500 : l.kind === 'sentBack' ? 900 : 3400
      if (e > hold + 500 || e < 0) {
        if (e > hold + 500) landed.splice(i, 1)
        continue
      }
      o.rotation.set(0, 0.4, 0)
      o.position.copy(l.pos)
      const q = still ? 0 : squash(e)
      let sx = 1 + q * 0.6, sy = 1 - q
      if (l.kind === 'blocked') {
        const d = clamp01((e - 260) / 900)
        const dd = still ? d : inOut(d)
        sy *= 1 - 0.85 * dd
        sx *= 1 + 0.45 * dd
        const gone = clamp01((e - 1100) / 400)
        sx *= 1 - gone
        sy *= 1 - gone
        col.copy(GL.reject)
      } else {
        col.copy(l.kind === 'bought' ? GL.accept : GL.refine)
        if (e > hold) {
          // Shrinks into the researcher's stack.
          const g = still ? 1 : clamp01((e - hold) / 450)
          o.position.lerp(l.stack, inOut(g))
          sx *= 1 - g
          sy *= 1 - g
        }
      }
      o.scale.set(Math.max(1e-4, sx), Math.max(1e-4, sy), Math.max(1e-4, sx))
      o.position.y = l.pos.y - ((1 - sy) * PARCEL * 0.84) / 2 + (o.position.y - l.pos.y)
      if (np < CAP) put(P, np++, col)
      if (sx > 0.05) blob(l.pos.x, 0, l.pos.z, 0, 0.62 * sx)
    }

    // Everything else that travels: beads, slips and drops.
    for (const p of w.packets) {
      const req = p.refId && known.has(p.refId)
      const carried = req && (p.kind === 'request' || (p.kind === 'verdict' && p.outcome !== 'hold') || p.kind === 'hold' || p.kind === 'decision')
      if (carried) continue
      const k = progress(p, t)
      pathOf(p, false, path)
      if (p.kind === 'charge') {
        // An order: money leaves the grant as a short stream of drops.
        const rq = p.refId ? w.requests.find(q => q.id === p.refId) : undefined
        const c = rq && (rq.state === 'rerouted' || (rq.chargedGrantId && rq.chargedGrantId !== rq.grantId)) ? AMBER : MONEY
        for (let i = 0; i < 7; i++) {
          const u = clamp01((k - i * 0.065) / 0.58)
          if (u <= 0 || u >= 1 || nd >= CAP) continue
          arcPoint(path.a, path.b, sine(u), path.h, o.position)
          orient(path, sine(u), 0)
          const sz = 1.6 - i * 0.08
          o.scale.set(sz, sz, sz * (still ? 1 : 1.5))
          put(D, nd++, c)
        }
        continue
      }
      const u = still ? k : sine(k)
      arcPoint(path.a, path.b, u, path.h, o.position)
      if (p.kind === 'payment') {
        orient(path, u, 0)
        o.scale.set(2, 2, still ? 2 : 2.8)
        if (nd < CAP) put(D, nd++, MONEY)
        continue
      }
      if (p.kind === 'reading' || p.kind === 'recheck') {
        const alarm = p.kind === 'reading' && !/no change/.test(p.label)
        o.scale.setScalar(alarm ? 1.35 : 0.85)
        if (nb < CAP) put(Bd, nb++, alarm ? ALARM : SLIP)
        if (alarm) trail(path, Math.max(0, u - 0.45), u, ALARM, 0.06, 0.5)
        continue
      }
      // Messages: papers, invoices, pushback, holds and answers.
      orient(path, u, still ? 0 : 0.25 * Math.sin(k * Math.PI * 4))
      const c =
        p.kind === 'verdict' && p.outcome
          ? GL[p.outcome]
          : p.kind === 'hold'
            ? GL.hold
            : p.kind === 'decision'
              ? p.outcome === 'reject'
                ? GL.reject
                : GL.accept
              : SLIP
      if (ns < CAP) put(S, ns++, c)
      if (trailed(p)) trail(path, Math.max(0, u - 0.45), u, c === SLIP ? TRAIL_LIGHT : c, 0.07, 0.6)
      ground(o.position.x, o.position.y, o.position.z, 0.4)
    }

    // Money landing in a grant: drops from the funder.
    for (let i = streams.length - 1; i >= 0; i--) {
      const s = streams[i]
      const e = t - s.at
      if (e > s.ms + s.n * s.gap) {
        streams.splice(i, 1)
        continue
      }
      path.a.copy(s.a)
      path.b.copy(s.b)
      path.h = arcHeight(s.a, s.b, true) * 0.8
      for (let j = 0; j < s.n; j++) {
        const u = clamp01((e - j * s.gap) / s.ms)
        if (u <= 0 || u >= 1 || nd >= CAP) continue
        const v = still ? u : u * u * (3 - 2 * u)
        arcPoint(path.a, path.b, v, path.h, o.position)
        orient(path, v, 0)
        o.scale.set(1.6, 1.6, still ? 1.6 : 2.4)
        put(D, nd++, MONEY)
      }
    }

    // Trails that just arrived fade over about 0.6 s, the tail catching up with the head.
    for (let i = fading.length - 1; i >= 0; i--) {
      const f = fading[i]
      const e = (t - f.at) / 600
      if (e >= 1 || e < 0) {
        if (e >= 1) fading.splice(i, 1)
        continue
      }
      trail(f, 0.5 + 0.5 * e, 1, f.color, f.width, (f.width > 0.1 ? 0.75 : 0.6) * (1 - e))
    }

    for (const [m, n] of [
      [P, np],
      [Bd, nb],
      [S, ns],
      [D, nd],
      [Bl, nbl],
    ] as const) {
      m.count = n
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    for (let i = ntr; i < TRAILS; i++) trails[i].mesh.visible = false
  })

  return (
    <>
      <instancedMesh ref={parcels} args={[parcelGeo, parcelMat, CAP]} frustumCulled={false} />
      <instancedMesh ref={beads} args={[beadGeo, beadMat, CAP]} frustumCulled={false} />
      <instancedMesh ref={slips} args={[slipGeo, slipMat, CAP]} frustumCulled={false} />
      <instancedMesh ref={drops} args={[dropGeo, dropMat, CAP]} frustumCulled={false} />
      <instancedMesh ref={blobs} args={[blobGeo, blobMat, CAP]} frustumCulled={false} renderOrder={1} />
      {trails.map((s, i) => (
        <primitive key={i} object={s.mesh} />
      ))}
    </>
  )
}

export function Flow() {
  useEffect(() => () => clearAll(), [])
  return (
    <>
      <FlowFx />
      <Ripples />
      <Moving />
    </>
  )
}

