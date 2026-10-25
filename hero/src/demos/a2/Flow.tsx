// Everything in motion. A request is the thing being bought, start to end:
// the researcher holds it up, tosses it to the intake post, and it rides the
// intake thread up to the hook under the purchasing agent, where it hangs
// while the six rules light. Then it changes with the answer: boxed in a
// kraft carton (bought), re-tagged in the other grant's colour (rerouted),
// washed oxblood and dropped back down the thread to deflate (blocked),
// carried along the wires to hang under its frozen grant (waiting for money),
// or down the call line to the grant manager's tray (waiting on a person).
// Papers, invoices, readings and money keep simpler shapes on the same wires.
// Where each thing is comes from the World every frame, so a `?at` jump shows
// the right picture; feed events only add the moments.

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  type Group,
  InstancedMesh,
  LineBasicMaterial,
  type Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three'
import { feed, progress, useFlow } from '../../feed'
import type { ItemKind, Outcome, Packet, Request } from '../../feed'
import { bake } from './bake'
import { CRATE_GEO, IS_METAL, ITEM_GEO, TAG_AT, TAG_GEO } from './Items'
import { GLAZE, GM_TRAY, GRANTS, GRANT_TINT, PAL, PICKUP } from './layout'
import { CLAY, METAL, liquid } from './mats'
import { HANG, P, along, kick, known, pathIds } from './mobile'
import { fx, now, reducedMotion, ui } from './store'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const sine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))

// How big an item is: in a hand, flying, hanging at the hook, back on the bench.
const S_HAND = 0.62
const S_FLY = 2.1
const S_HOOK = 2.0
const S_BENCH = 0.95
const ITEM_MID = 0.2 // an item's middle above its base, at scale 1
const SLOTS = 16
const CAP = 48

const C = (hex: string) => new Color(hex)
const WHITE = C('#FFFFFF')
const WASH: Record<Outcome, Color> = { accept: C(GLAZE.accept), refine: C(GLAZE.refine), reject: C(GLAZE.reject), hold: C(GLAZE.hold) }
const MONEY = C(PAL.money)
const SLIP = C('#F4F0E9')
const KRAFT = C('#E2CFAE')
const ALARM = C('#2A313A')
const TINTS: Record<string, Color> = Object.fromEntries(Object.entries(GRANT_TINT).map(([g, c]) => [g, C(c)]))

/** A FlowNode id as a point on the mobile. */
const node = (id: string) => (id === 'p:grant_manager' ? 'gm' : id)

// ── Points that move with the mobile: parking under each grant, the tray ──

for (const gid of GRANTS) for (let i = 0; i < 4; i++) P.set(`park:${gid}:${i}`, new Vector3())
for (let i = 0; i < 4; i++) P.set(`gm:${i}`, new Vector3())
function placeSlots() {
  for (const gid of GRANTS) {
    const v = P.get(`g:${gid}`)!
    const h = HANG.get(`g:${gid}`)!
    for (let i = 0; i < 4; i++) P.get(`park:${gid}:${i}`)!.set(v.x + (i % 2 ? 0.34 : -0.34) * (i < 2 ? 1 : 1.9), v.y - h.bottom - 0.62 - (i >= 2 ? 0.1 : 0), v.z + 0.05)
  }
  for (let i = 0; i < 4; i++) P.get(`gm:${i}`)!.set(GM_TRAY[0] - 0.36 + i * 0.26, GM_TRAY[1] + 0.05 + ITEM_MID * 0.7, GM_TRAY[2] + 0.02)
}

// ── Scene-local memory (dropped on 'reset') ──────────────────────────────

type PState = 'out' | 'desk' | 'return' | 'toGm' | 'gm' | 'fromGm' | 'toPark' | 'park'
interface Life {
  state: PState | null
  route: string[]
  from: Vector3 // where it was when this leg began
  slot: number
  tween: { at: number; ms: number } | null
  restAt: number
  seen: number
  crate: number // 0..1, how boxed it is
  wash: Color
  washK: number
  tagA: Color
  tagB: Color | null
  stamped: boolean // the outcome look is fully applied (also after a jump past the stamp)
}
interface Landed {
  reqId: string
  kind: ItemKind
  boxed: boolean
  tagA: Color
  tagB: Color | null
  pos: Vector3
  at: number
}
interface Stream {
  route: string[]
  at: number
  n: number
}

const lives = new Map<string, Life>()
const landed: Landed[] = []
const streams: Stream[] = []
const routes = new Map<string, { ids: string[]; seen: number }>()
/** Where each request's item is right now, for the camera. */
export const itemAt = new Map<string, Vector3>()
let frame = 0

function clearAll() {
  fx.clear()
  lives.clear()
  landed.length = 0
  streams.length = 0
  routes.clear()
  itemAt.clear()
}

// ── Where a researcher's hand, bench and the post are ────────────────────

const hand = (rid: string, out: Vector3) => {
  const b = fx.bodies.get(rid)
  return b ? out.copy(b.hand) : out.set(...PICKUP)
}
const bench = (rid: string, out: Vector3) => {
  const b = fx.bodies.get(rid)
  if (!b) return out.set(...PICKUP)
  return out.set(b.pos.x + Math.sin(b.yaw) * 0.45, b.surf + ITEM_MID * S_BENCH, b.pos.z + Math.cos(b.yaw) * 0.45)
}
const POST = new Vector3(PICKUP[0], PICKUP[1] + 0.12, PICKUP[2])
const arcTo = (a: Vector3, b: Vector3, u: number, h: number, out: Vector3) => {
  out.lerpVectors(a, b, u)
  out.y += 4 * h * u * (1 - u)
  return out
}

/** The wires a packet rides between two nodes (researchers join at the intake post). */
function routeOf(p: Packet): string[] {
  let r = routes.get(p.id)
  if (!r) {
    const a = p.from.startsWith('r:') ? 'pickup' : node(p.from)
    const b = p.to.startsWith('r:') ? 'pickup' : node(p.to)
    r = { ids: known(a) && known(b) ? pathIds(a, b) : [], seen: frame }
    routes.set(p.id, r)
  }
  r.seen = frame
  return r.ids
}

/** A point `k` along a packet's whole trip: the toss from a hand, the wires, the toss to a bench. */
function travel(p: Packet, ids: string[], k: number, still: boolean, out: Vector3) {
  const fromLab = p.from.startsWith('r:')
  const toLab = p.to.startsWith('r:')
  if (fromLab && k < 0.35) {
    hand(p.from.slice(2), va)
    return arcTo(va, POST, still ? k / 0.35 : sine(k / 0.35), still ? 0 : 1.0, out)
  }
  if (toLab && k > 0.65) {
    bench(p.to.slice(2), vb)
    return arcTo(POST, vb, still ? (k - 0.65) / 0.35 : sine((k - 0.65) / 0.35), still ? 0 : 1.0, out)
  }
  const u0 = fromLab ? 0.35 : 0
  const u1 = toLab ? 0.65 : 1
  const u = clamp01((k - u0) / (u1 - u0))
  return along(ids, still ? u : sine(u), out)
}

const va = new Vector3()
const vb = new Vector3()
const vc = new Vector3()

// ── Effects kicked off by feed events ────────────────────────────────────

function tagsFor(r: Request, base: boolean): [Color, Color | null] {
  const home = TINTS[r.grantId] ?? WHITE
  if (base) return [home, null]
  if (r.split.length > 1) return [TINTS[r.split[0].grantId] ?? home, TINTS[r.split[1].grantId] ?? home]
  if (r.chargedGrantId && r.chargedGrantId !== r.grantId) return [TINTS[r.chargedGrantId] ?? home, null]
  if (r.outcome === 'refine') return [WASH.refine, null]
  return [home, null]
}

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
      if (known(node(p.to))) {
        fx.kicks.set(p.to, t)
        kick(node(p.to), p.kind === 'reading' || p.kind === 'recheck' ? 0.16 : 0.3)
      }
      if (p.kind === 'verdict' && p.to.startsWith('r:') && p.outcome) {
        const rid = p.to.slice(2)
        fx.reactions.set(rid, { kind: p.outcome, at: t })
        const req = p.refId ? feed.getWorld().requests.find(r => r.id === p.refId) : undefined
        if (req && p.outcome !== 'hold' && p.outcome !== 'reject') {
          const [a, b] = tagsFor(req, false)
          landed.push({ reqId: req.id, kind: req.kind, boxed: p.outcome === 'accept', tagA: a, tagB: b, pos: bench(rid, new Vector3()), at: t })
          if (landed.length > 8) landed.shift()
          fx.ripples.push({ pos: bench(rid, new Vector3()).setY((fx.bodies.get(rid)?.surf ?? 0.92) + 0.01), color: GLAZE[p.outcome], at: t, size: 0.55, ms: 700 })
        }
      }
    }
    if (e.type === 'grant' && e.event?.kind === 'payment_received') {
      // The money itself: drops run from the bookkeeping agent into the grant.
      const gid = `g:${e.grant.id}`
      if (known(gid)) {
        streams.push({ route: pathIds('a:bookkeeping', gid), at: t, n: 12 })
        fx.kicks.set(gid, t + 900)
        window.setTimeout(() => kick(gid, 0.45), 900)
      }
    }
  })
  return null
}

// ── Ripples on the lab benches and the intake post ───────────────────────

const RIPPLES = 10
const ringGeo = new RingGeometry(0.86, 1, 48)

function Ripples() {
  const meshes = useRef<(Mesh | null)[]>([])
  const mats = useMemo(() => Array.from({ length: RIPPLES }, () => new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })), [])
  useFrame(() => {
    const t = now()
    for (let i = fx.ripples.length - 1; i >= 0; i--) if (t - fx.ripples[i].at > fx.ripples[i].ms) fx.ripples.splice(i, 1)
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
            meshes.current[i] = el
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

// ── The item carriers: one group per request in view ─────────────────────

interface Carrier {
  g: Group | null
  item: Mesh | null
  tagA: Mesh | null
  tagB: Mesh | null
  crate: Mesh | null
  clay: MeshStandardMaterial
  metal: MeshStandardMaterial
  tA: MeshStandardMaterial
  tB: MeshStandardMaterial
  owner: string | null
  used: number
}

function makeCarrier(): Carrier {
  const clay = CLAY.clone()
  const metal = METAL.clone()
  return { g: null, item: null, tagA: null, tagB: null, crate: null, clay, metal, tA: new MeshStandardMaterial({ roughness: 0.6 }), tB: new MeshStandardMaterial({ roughness: 0.6 }), owner: null, used: -1 }
}

/** Dress a carrier: which item, how boxed, the wash and the tags. */
function dress(c: Carrier, kind: ItemKind, scale: number, crate: number, wash: Color, washK: number, tagA: Color, tagB: Color | null, lift: number) {
  const g = c.g!, item = c.item!, cr = c.crate!
  g.visible = true
  g.scale.setScalar(scale * lift)
  if (item.geometry !== ITEM_GEO[kind]) item.geometry = ITEM_GEO[kind]
  const m = IS_METAL[kind] ? c.metal : c.clay
  if (item.material !== m) item.material = m
  m.color.copy(WHITE).lerp(wash, washK)
  const s = 1 - crate
  item.visible = s > 0.02
  item.scale.setScalar(Math.max(0.001, s))
  cr.visible = crate > 0.02
  cr.scale.setScalar(Math.max(0.001, crate))
  // The tag hangs from the item's own edge (the carton's, once boxed).
  const at = TAG_AT[crate > 0.5 ? 'crate' : kind]
  c.tA.color.copy(tagA)
  c.tagA!.visible = true
  c.tagA!.position.set(at[0], at[1], at[2])
  c.tagB!.visible = !!tagB
  if (tagB) {
    c.tB.color.copy(tagB)
    c.tagB!.position.set(-at[0], at[1], at[2])
  }
}

// ── Simple forms for everything else ─────────────────────────────────────

const beadGeo = new SphereGeometry(0.1, 16, 12)
const beadMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 })
const slipGeo = bake(b => {
  b.box([0, 0, 0], [0.42, 0.3, 0.025], '#FFFFFF', 0.01)
  b.box([0, 0.07, 0.014], [0.28, 0.025, 0.004], '#B8BEC6', 0.002)
  b.box([-0.03, 0.01, 0.014], [0.22, 0.02, 0.004], '#B8BEC6', 0.002)
  b.box([0, -0.05, 0.014], [0.28, 0.02, 0.004], '#B8BEC6', 0.002)
})
const slipMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.62 })
const dropGeo = new SphereGeometry(0.085, 16, 12)
const dropMat = liquid('#ffffff')

const o = new Object3D()
const openGm = new Set<string>()
const parkN: Record<string, number> = {}
function commit(m: InstancedMesh, n: number) {
  m.count = n
  m.instanceMatrix.needsUpdate = true
  if (m.instanceColor) m.instanceColor.needsUpdate = true
}

function Moving() {
  const carriers = useMemo(() => Array.from({ length: SLOTS }, makeCarrier), [])
  const beads = useRef<InstancedMesh>(null)
  const slips = useRef<InstancedMesh>(null)
  const drops = useRef<InstancedMesh>(null)
  const threads = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(SLOTS * 6), 3))
    return g
  }, [])
  const threadMat = useMemo(() => new LineBasicMaterial({ color: '#4A5360' }), [])
  const still = useMemo(reducedMotion, [])

  useEffect(() => {
    for (const m of [beads.current, slips.current, drops.current]) {
      if (!m) continue
      m.setColorAt(0, WHITE)
      m.count = 0
    }
  }, [])

  useFrame(() => {
    const Bd = beads.current, S = slips.current, D = drops.current
    if (!Bd || !S || !D) return
    placeSlots()
    const w = feed.getWorld()
    const t = now()
    frame++
    let nb = 0, ns = 0, nd = 0, nt = 0
    const th = threads.getAttribute('position') as BufferAttribute
    const tha = th.array as Float32Array
    const thread = (a: Vector3, b: Vector3) => {
      if (nt >= SLOTS) return
      const j = nt * 6
      tha[j] = a.x
      tha[j + 1] = a.y
      tha[j + 2] = a.z
      tha[j + 3] = b.x
      tha[j + 4] = b.y
      tha[j + 5] = b.z
      nt++
    }
    const put = (m: InstancedMesh, i: number, c: Color) => {
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, c)
    }
    for (const c of carriers) if (c.g) c.g.visible = false
    const hv = ui.get().hovered
    const sel = ui.get().selected

    // Requests in flight, by state, each owning a carrier.
    openGm.clear()
    for (const h of w.holds) if (h.open && h.kind === 'purchase') openGm.add(h.refId)
    for (const g of GRANTS) parkN[g] = 0
    let atHook = 0
    let atGm = 0
    let used = 0
    const reqs = w.requests.length > 40 ? w.requests.slice(0, 40) : w.requests
    for (const r of reqs) {
      let pReq: Packet | undefined, pHold: Packet | undefined, pDec: Packet | undefined, pVer: Packet | undefined
      let busy = false
      for (const p of w.packets) {
        if (p.refId !== r.id) continue
        if (p.kind === 'request') pReq = p
        else if (p.kind === 'hold') pHold = p
        else if (p.kind === 'decision') pDec = p
        else if (p.kind === 'verdict') pVer = p
        else if (p.kind === 'recheck' || p.kind === 'reading' || p.kind === 'pushback') busy = true
      }
      let state: PState | null = null
      if (pReq) state = 'out'
      else if (pHold) state = 'toGm'
      else if (pDec) state = 'fromGm'
      else if (openGm.has(r.id)) state = 'gm'
      else if (pVer && pVer.outcome === 'hold' && pVer.holdFor === 'payment') state = 'toPark'
      else if (pVer && pVer.outcome !== 'hold') state = 'return'
      else if (busy) state = 'desk'
      else if (r.outcome === 'hold' && r.holdFor === 'payment') state = 'park'
      else if (r.outcome === undefined) state = 'desk'
      if (!state || used >= SLOTS) {
        lives.delete(r.id)
        itemAt.delete(r.id)
        continue
      }

      let life = lives.get(r.id)
      const first = !life
      if (!life) {
        const [a] = tagsFor(r, true)
        life = { state: null, route: [], from: new Vector3(), slot: -1, tween: null, restAt: -1e9, seen: frame, crate: 0, wash: WHITE.clone(), washK: 0, tagA: a.clone(), tagB: null, stamped: false }
        lives.set(r.id, life)
      }
      life.seen = frame

      // Its resting place, if it rests: the hook, under its grant, or the tray.
      const parkI = parkN[r.grantId] ?? 0
      const restId = state === 'desk' ? 'pk' : state === 'park' || state === 'toPark' ? `park:${r.grantId}:${Math.min(3, parkI)}` : state === 'gm' || state === 'toGm' ? `gm:${Math.min(3, atGm)}` : null
      if (state === 'park' || state === 'toPark') parkN[r.grantId] = parkI + 1
      if (state === 'gm' || state === 'toGm') atGm++

      if (life.state !== state) {
        const prev = life.state
        const cur = itemAt.get(r.id)
        life.from.copy(cur ?? P.get('pk')!)
        life.tween = !first && (prev === 'desk' || prev === 'gm' || prev === 'park') && (state === 'desk' || state === 'gm' || state === 'park') ? { at: t, ms: still ? 0 : 900 } : null
        if (state === 'toPark') life.route = [...pathIds('pk', `g:${r.grantId}`), restId!]
        else if (state === 'toGm') life.route = [...pathIds('pk', 'gm'), restId!]
        else if (state === 'fromGm') life.route = [prev === 'gm' && restId ? restId : 'gm', ...pathIds('gm', 'pk')]
        else if (state === 'return') life.route = prev === 'park' ? [...pathIds(`g:${r.grantId}`, 'pickup')] : pathIds('pk', 'pickup')
        else life.route = []
        if (state === 'out') {
          life.crate = 0
          life.washK = 0
          const [a] = tagsFor(r, true)
          life.tagA.copy(a)
          life.tagB = null
        }
        if (!first && (state === 'desk' || state === 'gm' || state === 'park')) life.restAt = t
        life.stamped = false
        life.state = state
      }

      const c = carriers[used++]
      if (!c.g) continue
      let scale = S_HOOK
      const pos = c.g.position
      let wobble = 0

      if (state === 'out' && pReq) {
        const k = progress(pReq, t)
        if (k < 0.3) {
          hand(r.researcherId, pos)
          pos.y += 0.08
          scale = S_HAND
        } else if (k < 0.55) {
          const u = (k - 0.3) / 0.25
          hand(r.researcherId, va)
          arcTo(va, POST, still ? u : sine(u), still ? 0 : 1.2, pos)
          scale = S_HAND + (S_FLY - S_HAND) * sine(u)
          wobble = u
        } else {
          const u = (k - 0.55) / 0.45
          along(['pickup', 'pk'], still ? u : inOut(u), pos)
          scale = S_FLY + (S_HOOK - S_FLY) * u
        }
      } else if (state === 'desk' || state === 'gm' || state === 'park') {
        const rest = state === 'desk' ? vc.copy(P.get('pk')!) : vc.copy(P.get(restId!)!)
        if (state === 'desk') {
          rest.x += atHook === 0 ? 0 : (atHook % 2 ? -0.62 : 0.62) * Math.ceil(atHook / 2)
          rest.y -= ITEM_MID * S_HOOK + 0.12
          atHook++
        }
        const tw = life.tween
        if (tw) {
          const k = tw.ms <= 0 ? 1 : clamp01((t - tw.at) / tw.ms)
          arcTo(life.from, rest, still ? k : expoOut(k), still ? 0 : 0.6, pos)
          if (k >= 1) life.tween = null
        } else pos.copy(rest)
        if (state === 'gm') {
          life.wash.copy(WASH.hold)
          life.washK += (0.45 - life.washK) * 0.1
          scale = 0.85
        }
        if (state === 'park') {
          life.wash.copy(WASH.hold)
          life.washK += (0.35 - life.washK) * 0.1
          scale = 1.1
          if (!still) pos.y += 0.05 * Math.sin((t / 2400) * Math.PI * 2 + r.id.length)
          const v = P.get(`g:${r.grantId}`)!
          vb.set(pos.x, v.y - (HANG.get(`g:${r.grantId}`)?.bottom ?? 0.6), pos.z)
          va.set(pos.x, pos.y + ITEM_MID * scale * 1.2, pos.z)
          vb.x = pos.x * 0.5 + v.x * 0.5
          thread(vb, va)
        }
        if (state === 'desk') {
          const since = t - life.restAt
          if (!still && since >= 0 && since < 600) pos.y -= 0.08 * Math.sin((since / 600) * Math.PI) * (1 - since / 600)
          va.set(pos.x, pos.y + ITEM_MID * scale + 0.1, pos.z)
          vb.copy(P.get('pk')!)
          if (atHook > 1) thread(vb, va)
        }
      } else {
        // A leg along the wires: stamp first (at the hook), then travel.
        const p = (state === 'toGm' ? pHold : state === 'fromGm' ? pDec : pVer)!
        const k = progress(p, t)
        const out: Outcome = state === 'fromGm' ? (p.outcome === 'reject' ? 'reject' : 'accept') : state === 'return' ? (p.outcome ?? 'accept') : 'hold'
        const stamp = state === 'return' || state === 'toPark' ? 0.16 : 0
        // Past the stamp (or jumped past it by ?at or a chapter jump): the outcome's full look, once.
        if (k >= stamp && stamp > 0 && !life.stamped) {
          life.stamped = true
          life.wash.copy(WASH[out])
          if (out === 'accept') life.crate = 1
          else if (out === 'reject') life.washK = 0.75
          else if (out === 'hold') life.washK = 0.4
          else {
            const [a, b] = tagsFor(r, false)
            life.tagA.copy(a)
            life.tagB = b
          }
        }
        if (k < stamp) {
          const s = k / stamp
          pos.copy(life.from)
          scale = S_HOOK * (still ? 1 : 1 + 0.18 * Math.sin(Math.PI * s))
          life.wash.copy(WASH[out])
          if (out === 'accept') life.crate = still ? 1 : sine(clamp01((s - 0.2) / 0.7))
          else if (out === 'reject') life.washK = 0.75 * sine(s)
          else if (out === 'hold') life.washK = 0.4 * sine(s)
          else {
            const [a, b] = tagsFor(r, false)
            life.tagA.lerp(a, s)
            life.tagB = b
          }
        } else if (state === 'return' && out === 'reject') {
          // Blocked: it drops back down the thread, lands on the post and gives way.
          life.washK = 0.75
          const u = clamp01((k - stamp) / 0.32)
          const top = P.get('pk')!
          pos.set(top.x, top.y + (POST.y + ITEM_MID * 1.2 - top.y) * (still ? u : u * u), top.z)
          scale = 1.2
          const d = clamp01((k - stamp - 0.32) / 0.3)
          const gone = clamp01((k - stamp - 0.55) / 0.25)
          c.g.scale.set(1, 1, 1)
          dress(c, r.kind, scale, 0, life.wash, life.washK, life.tagA, life.tagB, 1)
          c.g.scale.set(scale * (1 + 0.5 * d) * (1 - gone), scale * Math.max(0.05, 1 - 0.85 * d) * (1 - gone) + 1e-4, scale * (1 + 0.5 * d) * (1 - gone))
          if (gone >= 1) c.g.visible = false
          c.owner = r.id
          itemAt.set(r.id, (itemAt.get(r.id) ?? new Vector3()).copy(pos))
          continue
        } else {
          const u = clamp01((k - stamp) / (1 - stamp))
          if (state === 'return') {
            // Down the intake, then a toss back to the bench.
            if (u < 0.55) {
              const v = u / 0.55
              along(life.route, still ? v : inOut(v), pos)
              scale = S_HOOK + (S_FLY - S_HOOK) * v
            } else {
              const v = (u - 0.55) / 0.45
              bench(r.researcherId, vb)
              arcTo(POST, vb, still ? v : sine(v), still ? 0 : 1.3, pos)
              scale = S_FLY + (S_BENCH - S_FLY) * sine(v)
              wobble = v
            }
          } else {
            along(life.route, still ? u : inOut(u), pos)
            scale = state === 'toGm' ? S_HOOK + (0.85 - S_HOOK) * u : state === 'toPark' ? S_HOOK + (1.1 - S_HOOK) * u : 0.85 + (S_HOOK - 0.85) * u
            if (state === 'fromGm') {
              life.wash.copy(WASH[out])
              life.washK = 0.45
            }
          }
        }
      }
      const lift = hv === r.id || sel === r.id ? 1.18 : 1
      dress(c, r.kind, scale, life.crate, life.wash, life.washK, life.tagA, life.tagB, lift)
      c.g.rotation.set(0, still ? 0 : 0.5 * Math.sin(wobble * Math.PI), 0)
      c.owner = r.id
      itemAt.set(r.id, (itemAt.get(r.id) ?? new Vector3()).copy(pos))
    }
    for (const [id, l] of lives) if (frame - l.seen > 2) lives.delete(id)

    // Answers that came home: boxed or re-tagged, set down on the bench, then put away.
    for (let i = landed.length - 1; i >= 0; i--) {
      const l = landed[i]
      const e = t - l.at
      if (e < 0 || e > 4600) {
        if (e > 4600) landed.splice(i, 1)
        continue
      }
      if (used >= SLOTS) continue
      const c = carriers[used++]
      if (!c.g) continue
      const away = clamp01((e - 4000) / 600)
      c.g.position.copy(l.pos)
      dress(c, l.kind, S_BENCH * (1 - (still ? Math.round(away) : inOut(away))) + 1e-4, l.boxed ? 1 : 0, WHITE, 0, l.tagA, l.tagB, 1)
      c.g.rotation.set(0, 0.3, 0)
      c.owner = l.reqId
    }

    // Everything else that travels: beads, slips and drops.
    for (const p of w.packets) {
      const carried = p.refId && lives.has(p.refId) && (p.kind === 'request' || p.kind === 'verdict' || p.kind === 'hold' || p.kind === 'decision')
      if (carried) continue
      const ids = routeOf(p)
      if (!ids.length && !p.from.startsWith('r:') && !p.to.startsWith('r:')) continue
      const k = progress(p, t)
      o.rotation.set(0, 0, 0)
      o.scale.setScalar(1)
      if (p.kind === 'charge') {
        // An order paid: a short run of drops from the grant to the vendors.
        for (let i = 0; i < 6; i++) {
          const u = clamp01((k - i * 0.07) / 0.6)
          if (u <= 0 || u >= 1 || nd >= CAP) continue
          along(ids, sine(u), o.position)
          o.scale.setScalar(1.3 - i * 0.08)
          put(D, nd++, MONEY)
        }
        continue
      }
      travel(p, ids, k, still, o.position)
      if (p.kind === 'payment') {
        o.scale.setScalar(1.8)
        if (nd < CAP) put(D, nd++, MONEY)
        continue
      }
      if (p.kind === 'reading' || p.kind === 'recheck') {
        const alarm = p.kind === 'reading' && !/no change/.test(p.label)
        o.scale.setScalar(alarm ? 1.3 : 0.8)
        if (nb < CAP) put(Bd, nb++, alarm ? ALARM : SLIP)
        continue
      }
      // Papers, invoices, payment requests, questions, other holds and answers.
      if (!still) o.rotation.set(0, 0.4 * Math.sin(k * Math.PI * 2), 0.15 * Math.sin(k * Math.PI * 3))
      o.scale.setScalar(1.3)
      const col =
        p.kind === 'verdict' && p.outcome
          ? WASH[p.outcome]
          : p.kind === 'hold'
            ? WASH.hold
            : p.kind === 'decision'
              ? p.outcome === 'reject'
                ? WASH.reject
                : WASH.accept
              : p.kind === 'invoice'
                ? KRAFT
                : SLIP
      if (ns < CAP) put(S, ns++, col)
    }
    for (const [id, r] of routes) if (frame - r.seen > 2) routes.delete(id)

    // Money landing in a grant: drops from the bookkeeping agent.
    for (let i = streams.length - 1; i >= 0; i--) {
      const s = streams[i]
      const e = t - s.at
      if (e > 900 + s.n * 60) {
        streams.splice(i, 1)
        continue
      }
      for (let j = 0; j < s.n; j++) {
        const u = clamp01((e - j * 60) / 900)
        if (u <= 0 || u >= 1 || nd >= CAP) continue
        along(s.route, still ? u : sine(u), o.position)
        o.rotation.set(0, 0, 0)
        o.scale.setScalar(1.4)
        put(D, nd++, MONEY)
      }
    }

    commit(Bd, nb)
    commit(S, ns)
    commit(D, nd)
    for (let i = nt; i < SLOTS; i++) tha.fill(0, i * 6, i * 6 + 6)
    th.needsUpdate = true
    threads.setDrawRange(0, nt * 2)
  })

  return (
    <>
      {carriers.map((c, i) => (
        <group
          key={i}
          ref={el => {
            c.g = el
          }}
          visible={false}
        >
          <group position={[0, -ITEM_MID, 0]}>
            <mesh
              ref={el => {
                c.item = el
              }}
              geometry={ITEM_GEO.carton}
              material={c.clay}
              castShadow
            />
            <mesh
              ref={el => {
                c.crate = el
              }}
              geometry={CRATE_GEO}
              material={CLAY}
              castShadow
              visible={false}
            />
            <mesh
              ref={el => {
                c.tagA = el
              }}
              geometry={TAG_GEO}
              material={c.tA}
            />
            <mesh
              ref={el => {
                c.tagB = el
              }}
              geometry={TAG_GEO}
              material={c.tB}
              visible={false}
            />
          </group>
        </group>
      ))}
      <instancedMesh ref={beads} args={[beadGeo, beadMat, CAP]} frustumCulled={false} castShadow />
      <instancedMesh ref={slips} args={[slipGeo, slipMat, CAP]} frustumCulled={false} castShadow />
      <instancedMesh ref={drops} args={[dropGeo, dropMat, CAP]} frustumCulled={false} />
      <lineSegments geometry={threads} material={threadMat} frustumCulled={false} />
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
