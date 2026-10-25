// Everything in motion. A request is the thing itself for its whole trip:
// the researcher holds it up, it crosses the gap to the network's intake and
// runs the line to the purchasing agent, sits there while the six rules run,
// then comes home boxed (bought), re-tagged in the other grant's colour
// (rerouted), with an amber tag (sent back to fix), or falls away (blocked).
// Held, it parks by its frozen grant or waits on the grant manager's desk.
// Where each thing is comes from the world every frame; feed events only add
// the moments (landings, ripples, money pouring in).

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, RingGeometry, ShaderMaterial, SphereGeometry, Vector3 } from 'three'
import { feed, progress, useFlow } from '../../feed'
import type { ItemKind, Outcome, Packet, PacketKind, Request } from '../../feed'
import { CRATE_GEO, ITEM_GEO, ITEM_H, SLIP_GEO, TAG_GEO } from './Items'
import { DESK_SPOT, GLAZE, GM_SPOT, GRANT_COLOR, NODE_AT, groundAt, parkOf } from './layout'
import { attachY, edgeOf, pulseN, pulses, PULSES, travel } from './net'
import { fx, now, reducedMotion, ui } from './store'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const sine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

const LAUNCH = 0.32 // of a request's trip: held up in the hand before it leaves
const STAMP = 0.18 // of an answer's trip: the stamp at the agent before it leaves
const ARC = 0.46 // of a lab trip: the hop over the gap
const HAND = 0.42 // an item's size in a hand
const NET_S = 0.82 // and on the network's lines
const RIDE = 0.03

const KINDS = Object.keys(ITEM_GEO) as ItemKind[]
const C = (hex: string) => new Color(hex)
const GL: Record<Outcome, Color> = { accept: C(GLAZE.accept), refine: C(GLAZE.refine), reject: C(GLAZE.reject), hold: C(GLAZE.hold) }
const GRANT: Record<string, Color> = Object.fromEntries(Object.entries(GRANT_COLOR).map(([k, v]) => [k, C(v)]))
const WHITE = C('#FFFFFF')
const GREY = C('#5C6068')
const PAPER = C('#F4F1EA')
const GOLD = C('#F5C65A').multiplyScalar(2.2)
const ALERT = C('#FF7A5C').multiplyScalar(2.4)
const CALM = C('#CFE0FF').multiplyScalar(1.4)
const PULSE_WHITE = C('#DDE8FF')

const DESK = new Vector3(...DESK_SPOT)
const GM = new Vector3(...GM_SPOT)
const INTAKE = new Vector3(NODE_AT.intake[0], attachY('intake'), NODE_AT.intake[2])

// ── Scene-local memory (dropped on 'reset') ──────────────────────────────

type PState = 'out' | 'desk' | 'return' | 'toGm' | 'gm' | 'fromGm' | 'toPark' | 'park'
interface Life {
  state: PState | null
  pos: Vector3
  launch: Vector3 | null
  tween: { from: Vector3; at: number; ms: number } | null
  seen: number
}
interface Caught {
  rid: string
  kind: ItemKind
  at: number
  crate: boolean
  tag: Color
}
interface Stream {
  edge: string
  to: string
  color: Color
  at: number
  n: number
  ms: number
  gap: number
}

const lives = new Map<string, Life>()
const caught: Caught[] = []
const streams: Stream[] = []
let frame = 0

function clearAll() {
  fx.clear()
  lives.clear()
  caught.length = 0
  streams.length = 0
}

// ── Paths ────────────────────────────────────────────────────────────────

/**
 * Where a packet between the lab and the network is at u (0 = sender, 1 = receiver):
 * an arc between a hand and the intake, then the line to the agent. Returns how
 * far along the lab end it is (0 at the person, 1 once on the network).
 */
function labTrip(p: Packet, u: number, launch: Vector3 | null, still: boolean, out: Vector3) {
  const outbound = p.from.startsWith('r:')
  const rid = (outbound ? p.from : p.to).slice(2)
  const net = outbound ? p.to : p.from
  const v = outbound ? u : 1 - u // distance from the lab end
  if (v < ARC) {
    const a = launch ?? (outbound ? fx.hand.get(rid) : fx.chest.get(rid)) ?? INTAKE
    const s = v / ARC
    const e = still ? s : sine(s)
    out.lerpVectors(a, INTAKE, e)
    if (!still) out.y += 4 * (0.9 + 0.12 * a.distanceTo(INTAKE)) * e * (1 - e)
    return s
  }
  const s = (v - ARC) / (1 - ARC)
  travel('intake', net, still ? s : sine(s), out)
  return 1
}

/** Where on which line a packet is, for the light that runs along it. */
function pulseAt(p: Packet, u: number, c: Color, k = 1) {
  if (pulseN.n >= PULSES) return
  let edge: { i: number; back: boolean } | null
  let s = u
  if (p.from.startsWith('r:') || p.to.startsWith('r:')) {
    const outbound = p.from.startsWith('r:')
    const v = outbound ? u : 1 - u
    if (v < ARC) return
    edge = edgeOf('intake', outbound ? p.to : p.from)
    s = (v - ARC) / (1 - ARC)
    if (edge?.back) s = 1 - s
  } else {
    edge = edgeOf(p.from, p.to)
    if (edge?.back) s = 1 - u
  }
  if (!edge) return
  const q = pulses[pulseN.n++]
  q.edge = edge.i
  q.u = s
  q.r = c.r
  q.g = c.g
  q.b = c.b
  q.k = k
}

function slipColor(kind: PacketKind, outcome?: Outcome): Color {
  if (kind === 'verdict' && outcome) return GL[outcome]
  if (kind === 'hold') return GL.hold
  if (kind === 'decision') return outcome === 'reject' ? GL.reject : GL.accept
  if (kind === 'pushback') return GL.refine
  return PAPER
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
      if (p.kind === 'request' && p.to === 'a:purchasing') fx.ripples.push({ pos: new Vector3(DESK.x, DESK.y + 0.01, DESK.z), color: '#DCE8FF', at: t, size: 0.9, ms: 700 })
      if (p.kind === 'verdict' && p.to.startsWith('r:') && p.outcome) {
        const rid = p.to.slice(2)
        fx.reactions.set(rid, { kind: p.outcome, at: t })
        if (req && p.outcome !== 'hold' && p.outcome !== 'reject') {
          caught.push({ rid, kind: req.kind, at: t, crate: p.outcome === 'accept', tag: tagAfter(req, p.outcome).clone() })
        }
      }
    }
    if (e.type === 'grant' && e.event?.kind === 'payment_received') {
      // The money itself: a run of drops from the bookkeeping agent into the grant.
      const color = (GRANT[e.grant.id] ?? GOLD).clone().multiplyScalar(2)
      streams.push({ edge: 'a:bookkeeping', to: `g:${e.grant.id}`, color, at: t, n: 12, ms: 900, gap: 60 })
      fx.slosh.set(e.grant.id, { at: t + 900, amp: 1 })
      const g = NODE_AT[`g:${e.grant.id}`]
      if (g) fx.ripples.push({ pos: new Vector3(g[0], 0.02, g[2]), color: GRANT_COLOR[e.grant.id] ?? '#F5C65A', at: t + 900, size: 1.4, ms: 1000 })
    }
  })
  return null
}

/** The tag an answer leaves with. */
function tagAfter(r: Request, o: Outcome): Color {
  if (o === 'hold') return GL.hold
  if (o === 'reject') return GL.reject
  const charged = r.chargedGrantId ?? r.grantId
  if (o === 'refine' && !(r.state === 'rerouted' || (r.chargedGrantId && r.chargedGrantId !== r.grantId))) return GL.refine
  return GRANT[charged] ?? WHITE
}

// ── Ripples ──────────────────────────────────────────────────────────────

const RIPPLES = 12
const ringGeo = new RingGeometry(0.88, 1, 64)

function Ripples() {
  const meshes = useRef<Mesh[]>([])
  const mats = useMemo(() => Array.from({ length: RIPPLES }, () => new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false })), [])
  useEffect(() => () => mats.forEach(m => m.dispose()), [mats])
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
      mats[i].opacity = 0.75 * (1 - k) ** 1.5
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

// ── Geometry and materials ───────────────────────────────────────────────

const itemMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05 })
const tagMat = new MeshStandardMaterial({ roughness: 0.4, emissive: '#000000' })
const crateMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
const slipMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
const beadGeo = new SphereGeometry(0.09, 16, 10)
const beadMat = new MeshBasicMaterial({ toneMapped: false })
const blobGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
const blobMat = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uColor: { value: C('#03050B') } },
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

const ICAP = 14
const CAP = 40

// ── The moving parts ─────────────────────────────────────────────────────

const o = new Object3D()
const pa = new Vector3()
const pb = new Vector3()
const col = new Color()
const tcol = new Color()
const counts: Record<string, number> = {}

function Moving() {
  const items = useRef<Partial<Record<ItemKind, InstancedMesh>>>({})
  const tags = useRef<InstancedMesh>(null)
  const crates = useRef<InstancedMesh>(null)
  const slips = useRef<InstancedMesh>(null)
  const beads = useRef<InstancedMesh>(null)
  const blobs = useRef<InstancedMesh>(null)
  const still = useMemo(reducedMotion, [])

  useEffect(() => {
    for (const m of [...Object.values(items.current), tags.current, crates.current, slips.current, beads.current, blobs.current]) {
      if (!m) continue
      m.setColorAt(0, WHITE)
      m.count = 0
    }
  }, [])

  useFrame(() => {
    const T = tags.current, Cr = crates.current, S = slips.current, Bd = beads.current, Bl = blobs.current
    if (!T || !Cr || !S || !Bd || !Bl) return
    const w = feed.getWorld()
    const t = now()
    const s = ui.get()
    frame++
    for (const k of KINDS) counts[k] = 0
    let nt = 0, nc = 0, ns = 0, nb = 0, nbl = 0
    pulseN.n = 0

    const put = (m: InstancedMesh, i: number, c: Color) => {
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, c)
    }
    const blob = (x: number, y: number, z: number, height: number, size: number) => {
      if (nbl >= CAP) return
      const strength = 0.55 * clamp01(1 - height / 4.5)
      if (strength <= 0.01) return
      o.position.set(x, y + 0.008, z)
      o.rotation.set(0, 0, 0)
      o.scale.setScalar(size * (1 + height * 0.14))
      col.setRGB(strength, strength, strength)
      put(Bl, nbl++, col)
    }
    const ground = (p: Vector3, size: number) => {
      const g = groundAt(p.x, p.z)
      if (g !== null) blob(p.x, g, p.z, p.y - g, size)
    }
    /** One item, its tag (or two, for a split), and the carton when it's bought. */
    const item = (r: Request, pos: Vector3, yaw: number, scale: number, tint: Color, tag: Color | null, crate: number, roll = 0, pitch = 0) => {
      const kind = r.kind
      const m = items.current[kind]
      const h = ITEM_H[kind]
      const lit = s.hovered === r.id || s.selected === r.id ? 1.18 : 1
      const sc = scale * lit
      if (m && counts[kind] < ICAP && crate < 0.98) {
        o.position.copy(pos)
        o.rotation.set(pitch, yaw, roll, 'YXZ')
        o.scale.setScalar(sc)
        put(m, counts[kind]++, tint)
      }
      if (crate > 0.01 && nc < CAP) {
        o.position.copy(pos)
        o.rotation.set(pitch, yaw, roll, 'YXZ')
        o.scale.set(0.78 * sc, (h + 0.08) * sc * crate, 0.66 * sc)
        put(Cr, nc++, WHITE)
      }
      if (tag && nt < CAP - 1) {
        const two = r.split.length > 1 && tag !== GL.hold && tag !== GL.reject && tag !== GL.refine
        for (let i = 0; i < (two ? 2 : 1); i++) {
          const ox = 0.36 + i * 0.05
          const oz = 0.12 - i * 0.2
          o.position.set(pos.x + (Math.cos(yaw) * ox + Math.sin(yaw) * oz) * sc, pos.y + (h * 0.62 + 0.04) * sc, pos.z + (-Math.sin(yaw) * ox + Math.cos(yaw) * oz) * sc)
          o.rotation.set(0.2, yaw + Math.PI / 2, still ? 0 : 0.18 * Math.sin(t / 380 + i), 'YXZ')
          o.scale.setScalar(sc * 1.05)
          put(T, nt++, two ? (GRANT[r.split[i].grantId] ?? tag) : tag)
        }
      }
      ground(pos, 0.75 * sc)
    }
    const heading = (from: Vector3, to: Vector3) => Math.atan2(to.x - from.x, to.z - from.z)

    const find = (kind: PacketKind, ref: string) => {
      for (const p of w.packets) if (p.kind === kind && p.refId === ref) return p
      return undefined
    }
    const busyOn = (ref: string) => {
      for (const p of w.packets) if (p.refId === ref && (p.kind === 'recheck' || p.kind === 'reading' || p.kind === 'pushback')) return true
      return false
    }
    let atDesk = 0
    let atGm = 0
    const parkCount: Record<string, number> = {}

    // Oldest first, so parked and waiting things keep their slots.
    const n = Math.min(36, w.requests.length)
    for (let ri = n - 1; ri >= 0; ri--) {
      const r = w.requests[ri]
      const pReq = find('request', r.id)
      const pHold = find('hold', r.id)
      const pDec = find('decision', r.id)
      const pVer = find('verdict', r.id)
      let openHold = false
      for (const h of w.holds) if (h.open && h.kind === 'purchase' && h.refId === r.id) openHold = true
      let state: PState | null = null
      if (pReq) state = 'out'
      else if (pHold) state = 'toGm'
      else if (pDec) state = 'fromGm'
      else if (openHold) state = 'gm'
      else if (pVer && pVer.outcome === 'hold' && pVer.holdFor === 'payment') state = 'toPark'
      else if (pVer && pVer.outcome !== 'hold') state = 'return'
      else if (busyOn(r.id)) state = 'desk'
      else if (r.outcome === 'hold' && r.holdFor === 'payment') state = 'park'
      else if (r.outcome === undefined) state = 'desk'
      if (!state) {
        lives.delete(r.id)
        continue
      }
      let life = lives.get(r.id)
      const first = !life
      if (!life) {
        life = { state: null, pos: new Vector3(), launch: null, tween: null, seen: frame }
        lives.set(r.id, life)
      }
      life.seen = frame
      if (life.state !== state) {
        const restful = (x: PState | null) => x === 'desk' || x === 'gm' || x === 'park'
        life.tween = !first && restful(life.state) && restful(state) ? { from: life.pos.clone(), at: t, ms: still ? 0 : 900 } : null
        if (state === 'out') life.launch = null
        if (!first && state === 'return' && pVer?.outcome) fx.ripples.push({ pos: new Vector3(DESK.x, DESK.y + 0.01, DESK.z), color: GLAZE[pVer.outcome], at: t, size: 1.0, ms: 650 })
        if (!first && state === 'fromGm' && pDec) fx.ripples.push({ pos: new Vector3(GM.x, GM.y + 0.01, GM.z), color: pDec.outcome === 'reject' ? GLAZE.reject : GLAZE.accept, at: t, size: 0.8, ms: 650 })
        life.state = state
      }
      const billed = GRANT[r.grantId] ?? WHITE
      const rest = (target: Vector3) => {
        const tw = life!.tween
        if (tw) {
          const k = tw.ms <= 0 ? 1 : clamp01((t - tw.at) / tw.ms)
          o.position.lerpVectors(tw.from, target, still ? k : expoOut(k))
          if (!still) o.position.y += 0.6 * Math.sin(Math.PI * k)
          if (k >= 1) life!.tween = null
          pa.copy(o.position)
          return
        }
        pa.copy(target)
      }

      if (state === 'out' && pReq) {
        const k = progress(pReq, t)
        const rid = pReq.from.slice(2)
        if (k < LAUNCH) {
          // Held up in the hand while the researcher turns to send it.
          const hand = fx.hand.get(rid)
          if (hand) pa.copy(hand)
          const g = still ? 1 : smooth(0, 0.45, k / LAUNCH)
          item(r, pa.setY(pa.y - 0.05), 0, HAND * Math.max(0.02, g), WHITE, billed, 0)
        } else {
          if (!life.launch) life.launch = (fx.hand.get(rid) ?? INTAKE).clone()
          const u = (k - LAUNCH) / (1 - LAUNCH)
          const lab = labTrip(pReq, u, life.launch, still, pa)
          const sc = HAND + (NET_S - HAND) * smooth(0, 1, lab)
          // The last stretch climbs from the line onto the agent's desk.
          if (u > 0.9) pa.lerp(DESK, smooth(0.9, 1, u))
          labTrip(pReq, Math.min(1, u + 0.02), life.launch, still, pb)
          item(r, pa.setY(pa.y + RIDE), heading(pa, pb), sc, WHITE, billed, 0)
          pulseAt(pReq, u, PULSE_WHITE)
        }
      } else if (state === 'desk') {
        pb.copy(DESK)
        if (atDesk) {
          pb.x += (atDesk % 2 ? -0.5 : 0.5) * Math.ceil(atDesk / 2)
          pb.y -= 0.1
        }
        atDesk++
        rest(pb)
        item(r, pa, 0.5, NET_S, WHITE, billed, 0)
      } else if ((state === 'return' && pVer) || (state === 'toGm' && pHold) || (state === 'fromGm' && pDec) || (state === 'toPark' && pVer)) {
        const p = (state === 'toGm' ? pHold : state === 'fromGm' ? pDec : pVer)!
        const k = progress(p, t)
        const out: Outcome = state === 'fromGm' ? (p.outcome === 'reject' ? 'reject' : 'accept') : state === 'toGm' || state === 'toPark' ? 'hold' : (p.outcome ?? 'accept')
        const tagTo = state === 'fromGm' ? (out === 'reject' ? GL.reject : billed) : tagAfter(r, out)
        const from = state === 'fromGm' ? GL.hold : billed
        const stampEnd = state === 'toGm' || state === 'fromGm' ? 0.24 : STAMP
        const startAt = state === 'fromGm' ? GM : DESK
        if (k < stampEnd) {
          // The stamp: a short punch, and the tag changes colour.
          const sp = k / stampEnd
          tcol.copy(from).lerp(tagTo, smooth(0.2, 0.8, sp))
          const crate = state === 'return' && out === 'accept' ? smooth(0.25, 0.95, sp) : 0
          col.copy(WHITE)
          if (out === 'reject' && state === 'return') col.lerp(GREY, smooth(0.1, 0.9, sp))
          item(r, startAt, 0.5, NET_S * (still ? 1 : 1 + 0.18 * Math.sin(Math.PI * sp)), col, tcol, crate)
        } else if (state === 'return' && out === 'reject') {
          // Blocked: the thing tips off the agent's desk and falls away; a red slip goes home.
          const f = clamp01((k - stampEnd) / 0.4)
          if (f < 1) {
            pa.copy(DESK)
            pa.x += 0.6 * f
            pa.z += 0.9 * f
            pa.y -= still ? 0 : 6 * f * f
            item(r, pa, 0.5, NET_S * (1 - 0.6 * f), GREY, null, 0, still ? 0 : 2.2 * f, still ? 0 : 1.4 * f)
          }
          const u = (k - stampEnd) / (1 - stampEnd)
          labTrip(p, u, null, still, pa)
          labTrip(p, Math.min(1, u + 0.02), null, still, pb)
          if (ns < CAP) {
            o.position.copy(pa)
            o.rotation.set(0, heading(pa, pb), 0)
            o.scale.setScalar(0.8)
            put(S, ns++, GL.reject)
          }
          pulseAt(p, u, GL.reject)
        } else {
          const raw = clamp01((k - stampEnd) / (state === 'toPark' ? 0.45 : 1 - stampEnd))
          const u = still ? raw : inOut(raw)
          let sc = NET_S
          if (state === 'return') {
            const lab = labTrip(p, u, null, still, pa)
            labTrip(p, Math.min(1, u + 0.02), null, still, pb)
            sc = HAND + (NET_S - HAND) * smooth(0, 1, lab)
            if (u < 0.1) pa.lerpVectors(DESK, pa, smooth(0, 0.1, u))
            pulseAt(p, u, tagTo)
          } else if (state === 'toPark') {
            parkOf(r.grantId, parkCount[r.grantId] ?? 0, pb)
            pa.lerpVectors(DESK, pb, u)
            if (!still) pa.y += 4 * 0.9 * u * (1 - u)
            if (raw >= 1 && !still) pa.y += 0.06 * Math.sin((t / 2400) * Math.PI * 2 + ri)
          } else {
            // Along the agent ↔ grant manager line, then onto or off the desk.
            travel(p.from, p.to, u, pa)
            travel(p.from, p.to, Math.min(1, u + 0.02), pb)
            if (state === 'toGm') pa.lerp(GM, smooth(0.85, 1, u))
            else pa.lerp(DESK, smooth(0.85, 1, u))
            if (state === 'toGm') pa.lerpVectors(DESK, pa, smooth(0, 0.12, u))
            else pa.lerpVectors(GM, pa, smooth(0, 0.12, u))
            pulseAt(p, u, tagTo)
          }
          item(r, pa.setY(pa.y + RIDE), heading(pa, pb), sc, WHITE, tagTo, state === 'return' && out === 'accept' ? 1 : 0)
        }
        if (state === 'toPark') parkCount[r.grantId] = (parkCount[r.grantId] ?? 0) + 1
      } else if (state === 'gm') {
        pb.copy(GM)
        pb.x += (atGm % 3) * 0.5 - 0.5
        pb.z += Math.floor(atGm / 3) * 0.45
        atGm++
        rest(pb)
        if (!still) pa.y += 0.03 * Math.sin(t / 900 + ri)
        item(r, pa, -0.4, NET_S * 0.8, WHITE, GL.hold, 0)
      } else if (state === 'park') {
        const i = parkCount[r.grantId] ?? 0
        parkCount[r.grantId] = i + 1
        parkOf(r.grantId, i, pb)
        rest(pb)
        if (!still) pa.y += 0.06 * Math.sin((t / 2400) * Math.PI * 2 + ri)
        item(r, pa, 0.3, NET_S * 0.85, WHITE, GL.hold, 0)
      }
      life.pos.copy(pa)
    }
    for (const [id, l] of lives) if (frame - l.seen > 2) lives.delete(id)

    // Answers that came home: held in the researcher's hands a moment, then put away.
    for (let i = caught.length - 1; i >= 0; i--) {
      const c = caught[i]
      const e = t - c.at
      if (e < 0 || e > 3000) {
        caught.splice(i, 1)
        continue
      }
      const hand = fx.chest.get(c.rid)
      if (!hand) continue
      pa.copy(hand)
      pa.y -= 0.42
      const g = e > 2400 ? 1 - (e - 2400) / 600 : 1
      const kind = c.kind
      const m = items.current[kind]
      const sc = HAND * (still ? g : inOut(clamp01(g)))
      if (c.crate) {
        if (nc < CAP) {
          o.position.copy(pa)
          o.rotation.set(0, 0.3, 0)
          o.scale.set(0.78 * sc, (ITEM_H[kind] + 0.08) * sc, 0.66 * sc)
          put(Cr, nc++, WHITE)
        }
      } else if (m && counts[kind] < ICAP) {
        o.position.copy(pa)
        o.rotation.set(0, 0.3, 0)
        o.scale.setScalar(sc)
        put(m, counts[kind]++, WHITE)
      }
      if (nt < CAP) {
        o.position.set(pa.x + 0.3 * sc, pa.y + ITEM_H[kind] * 0.6 * sc, pa.z + 0.1 * sc)
        o.rotation.set(0.2, 0.3 + Math.PI / 2, 0)
        o.scale.setScalar(sc)
        put(T, nt++, c.tag)
      }
    }

    // Everything else: papers, invoices, slips, readings, money.
    for (const p of w.packets) {
      const req = p.refId ? lives.has(p.refId) : false
      const carried = req && (p.kind === 'request' || (p.kind === 'verdict' && p.outcome !== 'hold') || p.kind === 'hold' || p.kind === 'decision')
      if (carried) continue
      const k = progress(p, t)
      const lab = p.from.startsWith('r:') || p.to.startsWith('r:')
      if (p.kind === 'charge') {
        // An order: money leaves the grant as a short run of drops toward the vendors.
        const gid = p.from.slice(2)
        tcol.copy(GRANT[gid] ?? GOLD).multiplyScalar(2.2)
        for (let i = 0; i < 6; i++) {
          const u = clamp01((k - i * 0.07) / 0.6)
          if (u <= 0 || u >= 1 || nb >= CAP) continue
          travel(p.from, p.to, sine(u), o.position)
          o.rotation.set(0, 0, 0)
          o.scale.setScalar(0.9 - i * 0.06)
          put(Bd, nb++, tcol)
        }
        pulseAt(p, sine(clamp01(k / 0.6)), tcol, 0.7)
        continue
      }
      if (p.kind === 'payment' || p.kind === 'reading' || p.kind === 'recheck') {
        const alarm = p.kind === 'reading' && !/no change/i.test(p.label)
        const c = p.kind === 'payment' ? GOLD : alarm ? ALERT : CALM
        const u = still ? k : sine(k)
        travel(p.from, p.to, u, o.position)
        o.rotation.set(0, 0, 0)
        o.scale.setScalar(p.kind === 'payment' ? 1.9 : alarm ? 1.25 : 0.75)
        if (nb < CAP) put(Bd, nb++, c)
        pulseAt(p, u, c, alarm || p.kind === 'payment' ? 1 : 0.5)
        continue
      }
      // Messages: papers, invoices, pushback, holds and answers ride the lines as a sheet.
      const c = slipColor(p.kind, p.outcome)
      if (lab) {
        const u = p.from.startsWith('r:') ? clamp01((k - 0.2) / 0.8) : k
        if (p.from.startsWith('r:') && k < 0.2) {
          const hand = fx.hand.get(p.from.slice(2))
          if (hand) o.position.copy(hand)
        } else labTrip(p, u, null, still, o.position)
        labTrip(p, Math.min(1, u + 0.02), null, still, pb)
        o.rotation.set(0, heading(o.position, pb), still ? 0 : 0.2 * Math.sin(k * Math.PI * 4))
        pulseAt(p, u, c, 0.8)
      } else {
        const u = still ? k : sine(k)
        travel(p.from, p.to, u, o.position)
        travel(p.from, p.to, Math.min(1, u + 0.02), pb)
        o.position.y += RIDE + 0.05
        o.rotation.set(0, heading(o.position, pb), still ? 0 : 0.2 * Math.sin(k * Math.PI * 4))
        pulseAt(p, u, c, 0.8)
      }
      o.scale.setScalar(p.kind === 'invoice' || p.kind === 'payment_request' ? 1 : 0.85)
      if (ns < CAP) put(S, ns++, c)
      pa.copy(o.position)
      ground(pa, 0.45)
    }

    // Money landing in a grant: drops running the bookkeeping line into it.
    for (let i = streams.length - 1; i >= 0; i--) {
      const st = streams[i]
      const e = t - st.at
      if (e > st.ms + st.n * st.gap || e < 0) {
        if (e > 0) streams.splice(i, 1)
        continue
      }
      for (let j = 0; j < st.n; j++) {
        const u = clamp01((e - j * st.gap) / st.ms)
        if (u <= 0 || u >= 1 || nb >= CAP) continue
        travel(st.edge, st.to, still ? u : sine(u), o.position)
        o.rotation.set(0, 0, 0)
        o.scale.setScalar(1.1)
        put(Bd, nb++, st.color)
        if (j === 0) {
          const ed = edgeOf(st.edge, st.to)
          if (ed && pulseN.n < PULSES) {
            const q = pulses[pulseN.n++]
            q.edge = ed.i
            q.u = ed.back ? 1 - u : u
            q.r = st.color.r
            q.g = st.color.g
            q.b = st.color.b
            q.k = 1
          }
        }
      }
    }

    for (const k of KINDS) {
      const m = items.current[k]
      if (!m) continue
      m.count = counts[k]
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    for (const [m, c] of [
      [T, nt],
      [Cr, nc],
      [S, ns],
      [Bd, nb],
      [Bl, nbl],
    ] as const) {
      m.count = c
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  })

  return (
    <>
      {KINDS.map(k => (
        <instancedMesh
          key={k}
          ref={el => {
            if (el) items.current[k] = el
          }}
          args={[ITEM_GEO[k], itemMat, ICAP]}
          frustumCulled={false}
          castShadow
        />
      ))}
      <instancedMesh ref={tags} args={[TAG_GEO, tagMat, CAP]} frustumCulled={false} />
      <instancedMesh ref={crates} args={[CRATE_GEO, crateMat, CAP]} frustumCulled={false} castShadow />
      <instancedMesh ref={slips} args={[SLIP_GEO, slipMat, CAP]} frustumCulled={false} />
      <instancedMesh ref={beads} args={[beadGeo, beadMat, CAP]} frustumCulled={false} />
      <instancedMesh ref={blobs} args={[blobGeo, blobMat, CAP]} frustumCulled={false} renderOrder={1} />
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
