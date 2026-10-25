// Everything in motion. A request is the thing being bought, for its whole
// life: the researcher holds it up, it flies into the shared record and on
// to the purchasing tray, waits while the rules run, and comes back the
// same way. Bought, it rides home in a delivery crate; rerouted, the record
// re-tags it in the other grant's colour on the way; sent back to split, it
// comes home with its tag unchanged and returns with a two-colour tag;
// blocked, it falls away into the gap and deflates. Held for money it waits
// frosted beside its frozen grant; held for the grant manager it waits on
// their desk. Every packet goes from its sender into the record and out to
// its receiver. Where each item is comes from the world every frame, so a
// jump lands on the right picture; feed events only add the moments.

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
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
} from 'three'
import { feed, progress, useFlow } from '../../feed'
import type { ItemKind, Packet, Request } from '../../feed'
import { roundedBox } from './batch'
import { TINT, trailColor } from './colors'
import { body } from './crowd'
import { ITEM_BOTTOM, crateGeo, crateMat, frostGeo, frostMat, itemMatte, itemMetal, itemModels, tagGeo, tagHalfGeo } from './Items'
import { DESK_SPOT, GLAZE, GM_DESK, GRANT_HUE, PAL, RESERVOIRS, parkOf } from './layout'
import { liquid } from './mats'
import { RECEIVE_MS } from './People'
import { IN_HAND, anchorInto, handHeld, newRoute, routePoint, travel, viaHub, type Route } from './routes'
import { fx, now, reducedMotion, ui } from './store'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const sine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
/** 0 → 1.12 → 1: popping into being. */
const pop = (x: number) => (x <= 0 ? 0 : x < 0.6 ? 1.12 * (1 - (1 - x / 0.6) ** 3) : x >= 1 ? 1 : 1.12 - 0.12 * inOut((x - 0.6) / 0.4))
/** A short squash and spring back on landing; returns how squashed (0 = none). */
const squash = (ms: number) => (ms < 0 || ms > 320 ? 0 : 0.26 * (1 - ms / 320) ** 2 * Math.cos((ms / 320) * Math.PI * 1.6))

const SCALE = 1.45 // an item in flight or at rest on the table
const HAND_S = 0.55 // an item in someone's hand
const TRAY_Y = 0.18
const REST = ITEM_BOTTOM * SCALE
const DESK = new Vector3(DESK_SPOT[0], TRAY_Y + REST, DESK_SPOT[2])
const GM = new Vector3(GM_DESK[0] + 0.05, 0.73 + REST, GM_DESK[2] + 0.02)
const STAMP = 0.14 // of an answer's flight: the moment on the tray before it leaves
const SLOTS = 16
const CAP = 40
const CARRY_W = 0.22

const HUE: Record<string, Color> = Object.fromEntries(Object.entries(GRANT_HUE).map(([k, v]) => [k, new Color(v)]))
const NO_HUE = new Color(PAL.clay)
const hue = (gid?: string) => (gid && HUE[gid]) || NO_HUE
const WHITE = new Color('#FFFFFF')
const SLIP = new Color('#F4F0E9')

// ── Scene-local memory (dropped on 'reset') ──────────────────────────────

type PState = 'out' | 'desk' | 'return' | 'toGm' | 'gm' | 'fromGm' | 'toPark' | 'park'
interface Life {
  state: PState | null
  prev: PState | null
  pos: Vector3
  tween: { from: Vector3; at: number; ms: number } | null
  restAt: number
  seen: number
  launch: Vector3
  launched: string | null
}
interface Landed {
  rid: string
  kind: ItemKind
  how: 'bought' | 'rerouted' | 'sentBack'
  at: number
  a: Color
  b: Color | null
}
interface Stream {
  r: Route
  at: number
  n: number
  ms: number
  gap: number
}
interface Fading {
  r: Route
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

// ── Tags: the grant an item is charged to, in that grant's colour ───────

let tagA: Color = NO_HUE
let tagB: Color | null = null
function tagsFor(r: Request, charged: boolean) {
  if (r.split.length > 1) {
    tagA = hue(r.split[0].grantId)
    tagB = hue(r.split[1].grantId)
    return
  }
  tagA = hue(charged ? (r.chargedGrantId ?? r.grantId) : r.grantId)
  tagB = null
}

// ── Where carried things go ──────────────────────────────────────────────

const ea = new Vector3()
const eb = new Vector3()
const handInto = (rid: string, s: number, out: Vector3) => {
  out.copy(body(rid).hand)
  out.y += ITEM_BOTTOM * s
  return out
}
/** A blocked item falls away into the gap between the table and the lab. */
const gapInto = (rid: string, out: Vector3) => out.set(-0.2, -1.6, (DESK.z + body(rid).pos.z) * 0.5)

/** The route a packet takes, drawn from sender to the record to receiver. */
function routeOf(p: Packet, carried: boolean, out: Route, low: number) {
  if (carried && (p.kind === 'request' || p.kind === 'pushback')) {
    handInto(p.from.slice(2), HAND_S, ea)
    eb.copy(DESK)
  } else if (carried && p.kind === 'verdict') {
    ea.copy(DESK)
    if (p.outcome === 'hold') parkOf(feed.getWorld().requests.find(r => r.id === p.refId)?.grantId ?? '', 0, eb).setY(REST + 0.02)
    else if (p.outcome === 'reject') gapInto(p.to.slice(2), eb)
    else handInto(p.to.slice(2), HAND_S, eb)
  } else if (carried && p.kind === 'hold') {
    ea.copy(DESK)
    eb.copy(GM)
  } else if (carried && p.kind === 'decision') {
    ea.copy(GM)
    eb.copy(DESK)
  } else {
    anchorInto(p.from, ea)
    anchorInto(p.to, eb)
  }
  return viaHub(ea, eb, out, low)
}

const trailed = (p: Packet) => p.kind !== 'recheck' && p.kind !== 'charge' && p.kind !== 'payment' && !(p.kind === 'reading' && /no change/.test(p.label))
const isCarried = (p: Packet, w = feed.getWorld()) =>
  !!p.refId &&
  (p.kind === 'request' || p.kind === 'pushback' || (p.kind === 'verdict' && !(p.outcome === 'hold' && p.holdFor === 'grant_manager')) || p.kind === 'hold' || p.kind === 'decision') &&
  w.requests.some(r => r.id === p.refId)

// ── Effects kicked off by feed events ────────────────────────────────────

function FlowFx() {
  const still = useMemo(reducedMotion, [])
  useFlow(e => {
    const t = now()
    if (e.type === 'reset') {
      clearAll()
      return
    }
    if (e.type === 'packet') {
      const p = e.packet
      fx.pulses.set(p.from, t)
      if (p.kind === 'verdict' && p.outcome && p.refId && p.from === 'a:purchasing')
        fx.ripples.push({ pos: new Vector3(DESK.x, TRAY_Y + 0.012, DESK.z), color: GLAZE[p.outcome], at: t, size: 1.0, ms: 650 })
      if (p.kind === 'decision') fx.ripples.push({ pos: new Vector3(GM.x, 0.735, GM.z), color: p.outcome === 'reject' ? PAL.oxblood : PAL.celadon, at: t, size: 0.8, ms: 650 })
    }
    if (e.type === 'arrive') {
      const p = e.packet
      fx.pulses.set(p.to, t)
      const w = feed.getWorld()
      const carried = isCarried(p, w)
      if (trailed(p)) fading.push({ r: routeOf(p, carried, newRoute(), still ? 0 : 1), color: trailColor(p), width: carried ? CARRY_W : 0.06, at: t })
      if ((p.kind === 'request' || p.kind === 'pushback') && p.to === 'a:purchasing') fx.ripples.push({ pos: new Vector3(DESK.x, TRAY_Y + 0.012, DESK.z), color: '#F3F8FF', at: t, size: 0.9, ms: 700 })
      if (p.kind === 'hold' && p.to === 'p:grant_manager') fx.ripples.push({ pos: new Vector3(GM.x, 0.735, GM.z), color: '#9DB6E3', at: t, size: 0.8, ms: 800 })
      const req = p.refId ? w.requests.find(r => r.id === p.refId) : undefined
      if (p.kind === 'verdict' && p.to.startsWith('r:') && req && (p.outcome === 'accept' || p.outcome === 'refine')) {
        const rerouted = !!req.chargedGrantId && req.chargedGrantId !== req.grantId
        tagsFor(req, true)
        landed.push({ rid: p.to.slice(2), kind: req.kind, how: p.outcome === 'accept' ? 'bought' : rerouted ? 'rerouted' : 'sentBack', at: t, a: tagA, b: tagB })
        if (landed.length > 12) landed.shift()
      }
    }
    if (e.type === 'grant' && e.event?.kind === 'payment_received') {
      // The money itself: drops from the funder, through the record, into the grant.
      const g = RESERVOIRS[e.grant.id]
      if (g) {
        const r = viaHub(anchorInto('p:funder', ea), eb.set(g[0], 0.95, g[2]), newRoute(), still ? 0 : 1)
        streams.push({ r, at: t, n: 12, ms: 1100, gap: 60 })
        fx.slosh.set(e.grant.id, { at: t + 1100, amp: 1 })
        fx.ripples.push({ pos: new Vector3(g[0], 0.7, g[2]), color: PAL.money, at: t + 1100, size: 0.7, ms: 900 })
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
    for (let i = fx.ripples.length - 1; i >= 0; i--) if (t - fx.ripples[i].at >= fx.ripples[i].ms) fx.ripples.splice(i, 1)
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
const SEG = 40

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
  const mat = new MeshBasicMaterial({ color: '#ffffff', vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false })
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

function writeTrail(s: TrailSlot, r: Route, u0: number, u1: number, width: number, cam: Vector3) {
  const P = s.pos
  const C = s.col
  for (let i = 0; i <= SEG; i++) {
    const f = i / SEG
    const u = u0 + (u1 - u0) * f
    routePoint(r, u, tp)
    routePoint(r, Math.min(1, u + 0.01), tq)
    tt.subVectors(tq, tp)
    if (tt.lengthSq() < 1e-10) {
      routePoint(r, Math.max(0, u - 0.01), tq)
      tt.subVectors(tp, tq)
    }
    if (tt.lengthSq() < 1e-10) tt.set(1, 0, 0)
    tv.subVectors(cam, tp)
    ts.crossVectors(tt, tv).normalize()
    const w = (width / 2) * f ** 1.3
    const j = i * 6
    P[j] = tp.x - ts.x * w
    P[j + 1] = tp.y - ts.y * w
    P[j + 2] = tp.z - ts.z * w
    P[j + 3] = tp.x + ts.x * w
    P[j + 4] = tp.y + ts.y * w
    P[j + 5] = tp.z + ts.z * w
    const a = f ** 0.9
    const c = i * 8
    C[c] = C[c + 1] = C[c + 2] = C[c + 4] = C[c + 5] = C[c + 6] = 1
    C[c + 3] = C[c + 7] = a
  }
  const g = s.mesh.geometry
  g.attributes.position.needsUpdate = true
  g.attributes.color.needsUpdate = true
}

// ── The item pool: one slot per item on screen ──────────────────────────

interface Slot {
  g: Group
  matte: Mesh
  metal: Mesh
  tag: Mesh
  half: Mesh
  crate: Mesh
  frost: Mesh
  ring: Mesh
  tagMat: MeshStandardMaterial
  halfMat: MeshStandardMaterial
}

const holdRingGeo = new TorusGeometry(0.5, 0.016, 8, 48).rotateX(Math.PI / 2)
const holdRingMat = new MeshBasicMaterial({ color: '#7FA0DA', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false })

function makeSlot(): Slot {
  const g = new Group()
  g.visible = false
  const matte = new Mesh(undefined, itemMatte)
  matte.castShadow = true
  const metal = new Mesh(undefined, itemMetal)
  metal.castShadow = true
  const tagMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 })
  const halfMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 })
  const tag = new Mesh(tagGeo, tagMat)
  tag.rotation.set(0, 0, 0.12)
  const half = new Mesh(tagHalfGeo, halfMat)
  tag.add(half)
  const crate = new Mesh(crateGeo, crateMat)
  crate.castShadow = true
  const frost = new Mesh(frostGeo, frostMat)
  frost.renderOrder = 2
  const ring = new Mesh(holdRingGeo, holdRingMat)
  ring.position.y = -ITEM_BOTTOM + 0.012
  ring.renderOrder = 2
  g.add(matte, metal, tag, crate, frost, ring)
  return { g, matte, metal, tag, half, crate, frost, ring, tagMat, halfMat }
}

// ── Simple forms for everything that isn't a bought thing ───────────────

const sheetGeo = roundedBox([0.3, 0.018, 0.4], 0.006)
const sheetMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.66 })
const beadGeo = new SphereGeometry(0.085, 20, 14)
const beadMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 })
const dropGeo = new SphereGeometry(0.075, 18, 12)
const dropMat = liquid('#ffffff')

const o = new Object3D()
const v1 = new Vector3()
const v2 = new Vector3()
const R = newRoute()
const R2 = newRoute()
const col = new Color()
const parkSlot = new Map<string, number>()
const parkN = new Map<string, number>()

function Moving() {
  const { camera } = useThree()
  const sheets = useRef<InstancedMesh>(null)
  const beads = useRef<InstancedMesh>(null)
  const drops = useRef<InstancedMesh>(null)
  const trails = useMemo(() => Array.from({ length: TRAILS }, makeTrail), [])
  const slots = useMemo(() => Array.from({ length: SLOTS }, makeSlot), [])
  const models = useMemo(itemModels, [])
  const still = useMemo(reducedMotion, [])
  const low = still ? 0 : 1

  useEffect(() => {
    for (const m of [sheets.current, beads.current, drops.current]) {
      if (!m) continue
      m.setColorAt(0, WHITE)
      m.count = 0
    }
    return () => {
      for (const s of trails) {
        s.mesh.geometry.dispose()
        s.mat.dispose()
      }
      for (const s of slots) {
        s.tagMat.dispose()
        s.halfMat.dispose()
      }
    }
  }, [trails, slots])

  useFrame(() => {
    const S = sheets.current, Bd = beads.current, D = drops.current
    if (!S || !Bd || !D) return
    const w = feed.getWorld()
    const t = now()
    frame++
    let ni = 0, nsh = 0, nb = 0, nd = 0, ntr = 0
    const hovered = ui.get().hovered
    const cam = camera.position

    const put = (m: InstancedMesh, i: number, c: Color) => {
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, c)
    }
    const trail = (r: Route, u0: number, u1: number, c: Color, width: number, alpha: number) => {
      if (ntr >= TRAILS || u1 <= u0 + 0.001) return
      const s = trails[ntr++]
      writeTrail(s, r, u0, u1, width, cam)
      s.mat.color.copy(c)
      s.mat.opacity = alpha
      s.mesh.visible = true
    }
    /** Turn an item three-quarters toward the camera, so it reads. */
    const face = (x: number, z: number) => Math.atan2(cam.x - x, cam.z - z) + 0.45
    /** Take a slot and dress it as `kind`, tagged with the current tag colours. */
    const item = (kind: ItemKind, pos: Vector3, scale: number, sx = 1, sy = 1, wobble = 0): Slot | null => {
      if (ni >= SLOTS) return null
      const s = slots[ni++]
      const m = models[kind]
      s.matte.geometry = m.matte
      s.metal.visible = !!m.metal
      if (m.metal) s.metal.geometry = m.metal
      s.tag.position.set(m.tag[0], m.tag[1], m.tag[2])
      s.tagMat.color.copy(tagA)
      s.half.visible = !!tagB
      if (tagB) s.halfMat.color.copy(tagB)
      s.crate.visible = false
      s.frost.visible = false
      s.ring.visible = false
      s.g.visible = true
      s.g.position.copy(pos)
      s.g.position.y -= ITEM_BOTTOM * scale * (1 - sy)
      s.g.rotation.set(still ? 0 : wobble * 0.18, face(pos.x, pos.z) + (still ? 0 : wobble * 0.5), still ? 0 : wobble * 0.12, 'YXZ')
      s.g.scale.set(Math.max(1e-4, scale * sx), Math.max(1e-4, scale * sy), Math.max(1e-4, scale * sx))
      return s
    }
    const crate = (s: Slot | null, k: number) => {
      if (!s || k <= 0.001) return
      s.crate.visible = true
      s.crate.scale.setScalar(Math.max(1e-4, still ? 1 : pop(k)))
    }
    const frost = (s: Slot | null, k: number) => {
      if (!s || k <= 0.001) return
      s.frost.visible = true
      s.frost.scale.setScalar(Math.max(1e-4, 0.6 + 0.4 * (still ? 1 : expoOut(k))))
    }
    const ring = (s: Slot | null, phase: number) => {
      if (!s) return
      s.ring.visible = true
      s.ring.scale.setScalar(still ? 1 : 1 + 0.06 * Math.sin(phase))
    }

    // Parked items keep a place per grant, oldest first.
    parkSlot.clear()
    parkN.clear()
    for (let i = w.requests.length - 1; i >= 0; i--) {
      const r = w.requests[i]
      if (r.outcome === 'hold' && r.holdFor === 'payment') {
        const n = parkN.get(r.grantId) ?? 0
        parkSlot.set(r.id, n)
        parkN.set(r.grantId, n + 1)
      }
    }

    let atDesk = 0
    const nReq = Math.min(36, w.requests.length)
    for (let ri = 0; ri < nReq; ri++) {
      const r = w.requests[ri]
      let pOut: Packet | undefined, pHold: Packet | undefined, pDec: Packet | undefined, pVer: Packet | undefined
      let busy = false
      for (const p of w.packets) {
        if (p.refId !== r.id) continue
        if (p.kind === 'request' || p.kind === 'pushback') pOut = p
        else if (p.kind === 'hold') pHold = p
        else if (p.kind === 'decision') pDec = p
        else if (p.kind === 'verdict') pVer = p
        else busy = true
      }
      let openHold = false
      for (const h of w.holds) if (h.open && h.kind === 'purchase' && h.refId === r.id) openHold = true

      let state: PState | null = null
      if (pOut) state = 'out'
      else if (pHold) state = 'toGm'
      else if (pDec) state = 'fromGm'
      else if (openHold) state = 'gm'
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
        life = { state: null, prev: null, pos: new Vector3(), tween: null, restAt: -1e9, seen: frame, launch: new Vector3(), launched: null }
        lives.set(r.id, life)
      }
      life.seen = frame
      if (life.state !== state) {
        const restful = (s: PState | null) => s === 'desk' || s === 'gm' || s === 'park'
        life.tween = !first && restful(life.state) && restful(state) ? { from: life.pos.clone(), at: t, ms: still ? 0 : 1300 } : null
        if (!first && (state === 'desk' || state === 'gm' || state === 'park') && !life.tween) life.restAt = t
        life.prev = life.state
        life.state = state
      }
      const lift = hovered === r.id ? 0.14 : 0
      tagsFor(r, false)

      /** Resting: a hop through the record covers a move between rests. */
      const rest = (target: Vector3, out: Vector3) => {
        const tw = life!.tween
        if (tw) {
          const k = tw.ms <= 0 ? 1 : clamp01((t - tw.at) / tw.ms)
          viaHub(tw.from, target, R2, low)
          routePoint(R2, still ? k : inOut(k), out)
          if (k >= 1) {
            life!.tween = null
            life!.restAt = t
          }
          return k
        }
        out.copy(target)
        return 1
      }

      let s: Slot | null = null
      if (state === 'out' && pOut) {
        const k = clamp01((t - pOut.sentAt) / pOut.ms)
        const rid = pOut.from.slice(2)
        if (handHeld(pOut) && k < IN_HAND) {
          // Held up in the researcher's hand before it goes.
          handInto(rid, HAND_S, v1)
          s = item(r.kind, v1, HAND_S * (still ? 1 : pop(k / (IN_HAND * 0.45))))
          life.launched = null
        } else {
          if (life.launched !== pOut.id) {
            life.launched = pOut.id
            handInto(rid, HAND_S, life.launch)
          }
          const raw = travel(pOut, t)
          const u = still ? raw : inOut(raw)
          viaHub(life.launch, DESK, R, low)
          routePoint(R, u, v1)
          const sc = HAND_S + (SCALE - HAND_S) * smooth(0, 0.3, u)
          s = item(r.kind, v1, sc, 1, 1, Math.sin(u * Math.PI))
          trail(R, Math.max(0, u - 0.4), u, TINT.sent, CARRY_W, 0.85)
        }
      } else if (state === 'desk') {
        v2.copy(DESK)
        if (atDesk > 0) {
          v2.z += (atDesk % 2 ? -1 : 1) * 0.95 * Math.ceil(atDesk / 2)
          v2.y = REST
        }
        atDesk++
        const k = rest(v2, v1)
        const q = still || k < 1 ? 0 : squash(t - life.restAt)
        v1.y += lift
        s = item(r.kind, v1, SCALE, 1 + q * 0.6, 1 - q)
        if (life.tween && life.prev === 'park') frost(s, 1 - k * 3)
      } else if ((state === 'return' || state === 'toPark' || state === 'toGm' || state === 'fromGm') && (pVer || pHold || pDec)) {
        const p = (state === 'toGm' ? pHold : state === 'fromGm' ? pDec : pVer)!
        const k = progress(p, t)
        const rid = p.to.slice(2)
        const stampEnd = state === 'toGm' || state === 'fromGm' ? 0.22 : STAMP
        const start = state === 'fromGm' ? GM : DESK
        const boxed = state === 'return' && (p.outcome === 'accept' || (p.outcome === 'refine' && !!r.chargedGrantId && r.chargedGrantId !== r.grantId))
        if (state === 'toPark') parkOf(r.grantId, parkSlot.get(r.id) ?? 0, v2).setY(REST + 0.02)
        else if (state === 'toGm') v2.copy(GM)
        else if (state === 'fromGm') v2.copy(DESK)
        else if (p.outcome === 'reject') gapInto(rid, v2)
        else handInto(rid, HAND_S, v2)
        if (k < stampEnd) {
          // The answer lands on it: a small punch, and the crate if it was bought.
          const x = k / stampEnd
          tagsFor(r, false)
          s = item(r.kind, start, SCALE * (still ? 1 : 1 + 0.12 * Math.sin(Math.PI * x)))
          if (boxed) crate(s, smooth(0.2, 0.9, x))
        } else {
          const raw = clamp01((k - stampEnd) / (1 - stampEnd))
          const u = still ? raw : inOut(raw)
          viaHub(start, v2, R, low)
          routePoint(R, u, v1)
          if (state === 'return') tagsFor(r, u > R.s)
          let sc = SCALE, sx = 1, sy = 1
          if (state === 'return' && p.outcome === 'reject') {
            // Falls away from the record and gives way as it goes.
            const d = smooth(0.55, 1, u)
            sy = 1 - 0.7 * d
            sx = 1 + 0.35 * d
            sc = SCALE * (1 - smooth(0.8, 1, u))
          } else if (state === 'return') sc = SCALE + (HAND_S - SCALE) * smooth(0.7, 1, u)
          s = item(r.kind, v1, sc, sx, sy, state === 'return' ? Math.sin(u * Math.PI) : 0)
          if (boxed) crate(s, 1)
          const c = state === 'return' ? TINT[p.outcome ?? 'accept'] : state === 'fromGm' ? (p.outcome === 'reject' ? TINT.reject : TINT.accept) : TINT.hold
          if (state !== 'toPark') trail(R, Math.max(0, u - 0.4), u, c, CARRY_W, 0.85)
        }
      } else if (state === 'gm') {
        const k = rest(GM, v1)
        const e = t - life.restAt
        const q = still || k < 1 ? 0 : squash(e)
        const breathe = still ? 1 : 1 + 0.03 * Math.sin((e / 1600) * Math.PI * 2)
        v1.y += lift
        s = item(r.kind, v1, SCALE * breathe, 1 + q * 0.6, 1 - q)
        ring(s, (e / 1600) * Math.PI * 2)
      } else if (state === 'park') {
        parkOf(r.grantId, parkSlot.get(r.id) ?? 0, v2).setY(REST + 0.02)
        const k = rest(v2, v1)
        const e = t - life.restAt
        if (!still && k >= 1) v1.y += 0.04 * Math.sin((t / 2400) * Math.PI * 2 + r.id.length)
        v1.y += lift
        s = item(r.kind, v1, SCALE)
        frost(s, k < 1 ? 0 : first ? 1 : clamp01(e / 700))
        ring(s, (t / 2400) * Math.PI * 2)
      }
      if (s) life.pos.copy(s.g.position)
    }
    for (const [id, l] of lives) if (frame - l.seen > 2) lives.delete(id)

    // Answers that came home: held up in the researcher's hands, then put away.
    for (let i = landed.length - 1; i >= 0; i--) {
      const l = landed[i]
      const e = t - l.at
      const hold = l.how === 'sentBack' ? 1100 : RECEIVE_MS
      if (e > hold + 450 || e < 0) {
        if (e > hold + 450) landed.splice(i, 1)
        continue
      }
      handInto(l.rid, HAND_S, v1)
      tagA = l.a
      tagB = l.b
      const g = e > hold ? (still ? 1 : clamp01((e - hold) / 450)) : 0
      const s = item(l.kind, v1, HAND_S * (1 - inOut(g)))
      if (l.how !== 'sentBack') crate(s, 1)
    }
    for (let i = ni; i < SLOTS; i++) slots[i].g.visible = false

    // Everything else that travels: sheets, beads and drops.
    for (const p of w.packets) {
      if (isCarried(p, w)) continue
      const k = progress(p, t)
      if (p.kind === 'charge') {
        // An order: money leaves the grant as a short stream of drops, through the record to the vendor.
        const rq = p.refId ? w.requests.find(q => q.id === p.refId) : undefined
        routeOf(p, false, R, low)
        const c = rq && rq.chargedGrantId && rq.chargedGrantId !== rq.grantId ? TINT.refine : TINT.money
        for (let i = 0; i < 7; i++) {
          const u = clamp01((k - i * 0.06) / 0.62)
          if (u <= 0 || u >= 1 || nd >= CAP) continue
          routePoint(R, sine(u), o.position)
          o.rotation.set(0, 0, 0)
          o.scale.setScalar(1.5 - i * 0.08)
          put(D, nd++, c)
        }
        continue
      }
      if (handHeld(p) && (t - p.sentAt) / p.ms < IN_HAND) {
        // A paper held up before it goes.
        handInto(p.from.slice(2), 0.1, o.position)
        o.rotation.set(-1.1, body(p.from.slice(2)).yaw, 0, 'YXZ')
        o.scale.setScalar(0.7)
        if (nsh < CAP) put(S, nsh++, SLIP)
        continue
      }
      const raw = travel(p, t)
      const u = still ? raw : sine(raw)
      routeOf(p, false, R, low)
      routePoint(R, u, o.position)
      if (p.kind === 'payment') {
        o.rotation.set(0, 0, 0)
        o.scale.setScalar(2.2)
        if (nd < CAP) put(D, nd++, TINT.money)
        continue
      }
      if (p.kind === 'reading' || p.kind === 'recheck') {
        const alarm = p.kind === 'reading' && !/no change/.test(p.label)
        o.rotation.set(0, 0, 0)
        o.scale.setScalar(alarm ? 1.35 : 0.75)
        col.copy(alarm ? TINT.alarm : SLIP)
        if (nb < CAP) put(Bd, nb++, col)
        if (alarm) trail(R, Math.max(0, u - 0.4), u, TINT.alarm, 0.06, 0.6)
        continue
      }
      // Messages: papers, invoices, payment requests, holds and answers.
      routePoint(R, Math.min(1, u + 0.02), v1)
      o.rotation.set(0, Math.atan2(v1.x - o.position.x, v1.z - o.position.z), still ? 0 : 0.25 * Math.sin(raw * Math.PI * 4), 'YXZ')
      o.scale.setScalar(1)
      const c = p.kind === 'paper' || p.kind === 'invoice' || p.kind === 'payment_request' || p.kind === 'follow_up' ? SLIP : trailColor(p)
      if (nsh < CAP) put(S, nsh++, c)
      if (trailed(p)) trail(R, Math.max(0, u - 0.4), u, trailColor(p), 0.06, 0.6)
    }

    // Money landing in a grant: drops from the funder through the record.
    for (let i = streams.length - 1; i >= 0; i--) {
      const st = streams[i]
      const e = t - st.at
      if (e > st.ms + st.n * st.gap || e < -1) {
        if (e > 0) streams.splice(i, 1)
        continue
      }
      for (let j = 0; j < st.n; j++) {
        const u = clamp01((e - j * st.gap) / st.ms)
        if (u <= 0 || u >= 1 || nd >= CAP) continue
        routePoint(st.r, still ? u : u * u * (3 - 2 * u), o.position)
        o.rotation.set(0, 0, 0)
        o.scale.setScalar(1.6)
        put(D, nd++, TINT.money)
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
      trail(f.r, 0.6 + 0.4 * e, 1, f.color, f.width, (f.width > 0.1 ? 0.85 : 0.6) * (1 - e))
    }

    for (const [m, n] of [
      [S, nsh],
      [Bd, nb],
      [D, nd],
    ] as const) {
      m.count = n
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    for (let i = ntr; i < TRAILS; i++) trails[i].mesh.visible = false
  })

  return (
    <>
      {slots.map((s, i) => (
        <primitive key={i} object={s.g} />
      ))}
      <instancedMesh ref={sheets} args={[sheetGeo, sheetMat, CAP]} frustumCulled={false} castShadow />
      <instancedMesh ref={beads} args={[beadGeo, beadMat, CAP]} frustumCulled={false} />
      <instancedMesh ref={drops} args={[dropGeo, dropMat, CAP]} frustumCulled={false} />
      {trails.map((s, i) => (
        <primitive key={`t${i}`} object={s.mesh} />
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
