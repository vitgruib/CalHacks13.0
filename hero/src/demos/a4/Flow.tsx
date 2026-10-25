// Everything in motion. A request is the thing being bought for its whole
// life: the lab member holds it up, throws it to the intake, and a car takes
// it along the request line to the purchasing agent. The answer brings the
// same thing back, changed by the outcome: boxed when it is bought, re-tagged
// in the other grant's colour when it moves, grey and deflating when it is
// turned down. Held for money, it waits on a siding by its frozen grant; held
// for a person, it waits on the grant manager's platform. Everything else
// rides the map as a small token on a car of its line's colour.
// Where each thing is comes from the world every frame, so mounting
// mid-story shows the right picture; feed events only add the moments.

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, MeshStandardMaterial, Object3D, Vector3 } from 'three'
import { feed, progress, useFlow } from '../../feed'
import type { ItemKind, Outcome, Packet, PacketKind, Request } from '../../feed'
import { KINDS, carGeo, itemGeo, tagGeo, tokenGeo, trayGeo, type Token } from './items'
import { DRUM, GLAZE, GM_SLOTS, GRANT_COLOR, LINE, PARK, along, mapPoint, routeBetween, routeFromTail, stopOf, type Family, type Route } from './layout'
import { BACK, SEND, fx, now, person, reducedMotion } from './store'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const sine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const bell = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x))

// Sizes: an item's largest side, in world units (about 44 px a unit at 1440×900).
const HAND = 0.6
const CAR = 1.08
const REST = 1.0
const CS = 1.5 // car scale
const FACE = -0.45 // items turn their front to the hero camera
const CAP_ITEM = 10
const CAP_CAR = 40
const CAP_TOKEN = 24

const FAMILY: Record<PacketKind, Family> = {
  request: 'request',
  verdict: 'request',
  pushback: 'request',
  recheck: 'request',
  paper: 'request',
  payment: 'money',
  charge: 'money',
  invoice: 'money',
  payment_request: 'money',
  follow_up: 'money',
  reading: 'reading',
  hold: 'people',
  decision: 'people',
}
const TOKEN: Record<PacketKind, Token> = {
  request: 'sheet',
  verdict: 'card',
  pushback: 'sheet',
  recheck: 'sheet',
  paper: 'sheet',
  payment: 'drop',
  charge: 'coin',
  invoice: 'slip',
  payment_request: 'sheet',
  follow_up: 'sheet',
  reading: 'bead',
  hold: 'card',
  decision: 'card',
}
const TOKENS: Token[] = ['sheet', 'slip', 'bead', 'drop', 'coin', 'card']

const C = (hex: string) => new Color(hex)
const WHITE = C('#FFFFFF')
const GREY = C('#8E9399')
const ICE = C('#BFD6E6')
const CREAM = C('#FFF8EA')
const LINE_C: Record<Family, Color> = { request: C(LINE.request), money: C(LINE.money), reading: C(LINE.reading), people: C(LINE.people) }
const OUT_C: Record<Outcome, Color> = { accept: C(GLAZE.accept), refine: C(GLAZE.refine), reject: C(GLAZE.reject), hold: C(GLAZE.hold) }
const GRANT_C: Record<string, Color> = Object.fromEntries(Object.entries(GRANT_COLOR).map(([k, v]) => [k, C(v)]))
const grantC = (id: string | undefined) => (id && GRANT_C[id]) || WHITE
const GRANT_AT: Record<string, string> = { R01GM061721: 'G1', R21AI182745: 'G2' }

const itemMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.05 })
const carMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 })
const tokenMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 })
const trayMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 })

// ── Scene-local memory (dropped on 'reset') ──────────────────────────────

type PState = 'out' | 'desk' | 'return' | 'toGm' | 'gm' | 'fromGm' | 'toPark' | 'park'
interface Life {
  state: PState | null
  slot: number
  ride: { route: Route; at: number; ms: number; fam: Family } | null
  seen: number
  pos: Vector3
  has: boolean
}
interface Landed {
  rid: string
  kind: ItemKind
  outcome: Outcome
  tags: string[]
  at: number
}

const lives = new Map<string, Life>()
const landed: Landed[] = []
let frame = 0
const lastAt = new Vector3()
let placed = false

/** Where a request's object is on the map right now, if it is out of the lab. */
export function itemAt(id: string, out: Vector3) {
  const l = lives.get(id)
  if (!l || !l.has) return false
  out.copy(l.pos)
  return true
}

function clearAll() {
  fx.clear()
  lives.clear()
  landed.length = 0
}

/** The grant colours on an item's tag(s): where it is charged now. */
function tagsOf(r: Request, outcome?: Outcome): string[] {
  if (r.split.length > 1) return r.split.map(s => s.grantId)
  if (r.chargedGrantId) return [r.chargedGrantId]
  if (outcome === 'refine') {
    if (r.sharedWith.length > 1) return r.sharedWith.slice(0, 2)
    const other = feed.getWorld().grants.find(g => g.id !== r.grantId)
    return [other ? other.id : r.grantId]
  }
  return [r.grantId]
}

// ── Feed events: reactions and landings ──────────────────────────────────

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
      if (p.kind === 'verdict' && p.to.startsWith('r:') && p.outcome) {
        const rid = p.to.slice(2)
        fx.reactions.set(rid, { kind: p.outcome, at: t })
        const r = p.refId ? feed.getWorld().requests.find(q => q.id === p.refId) : undefined
        if (r) {
          for (let i = landed.length - 1; i >= 0; i--) if (landed[i].rid === rid) landed.splice(i, 1)
          landed.push({ rid, kind: r.kind, outcome: p.outcome, tags: tagsOf(r, p.outcome), at: t })
        }
      }
    }
  })
  return null
}

// ── The moving parts ─────────────────────────────────────────────────────

const o = new Object3D()
const pa = new Vector3()
const pb = new Vector3()
const dir = new Vector3()
const col = new Color()
const tA = new Color()

interface Pools {
  items: Record<ItemKind, InstancedMesh | null>
  tokens: Record<Token, InstancedMesh | null>
  tag: InstancedMesh | null
  tray: InstancedMesh | null
  car: InstancedMesh | null
}

function Moving() {
  const still = useMemo(reducedMotion, [])
  const geo = useMemo(() => ({ items: itemGeo(), tokens: tokenGeo(), tag: tagGeo(), tray: trayGeo(), car: carGeo() }), [])
  const pools = useRef<Pools>({
    items: Object.fromEntries(KINDS.map(k => [k, null])) as Record<ItemKind, InstancedMesh | null>,
    tokens: Object.fromEntries(TOKENS.map(k => [k, null])) as Record<Token, InstancedMesh | null>,
    tag: null,
    tray: null,
    car: null,
  })
  const counts = useMemo(
    () => ({
      items: Object.fromEntries(KINDS.map(k => [k, 0])) as Record<ItemKind, number>,
      tokens: Object.fromEntries(TOKENS.map(k => [k, 0])) as Record<Token, number>,
      tag: 0,
      tray: 0,
      car: 0,
    }),
    [],
  )

  useEffect(() => {
    const pl = pools.current
    for (const m of [...Object.values(pl.items), ...Object.values(pl.tokens), pl.tag, pl.tray, pl.car]) {
      if (!m) continue
      m.setColorAt(0, WHITE)
      m.count = 0
      m.visible = false
    }
  }, [])

  useFrame(() => {
    const pl = pools.current
    if (!pl.tag || !pl.tray || !pl.car) return
    const w = feed.getWorld()
    const t = now()
    frame++
    const n = counts
    for (const k of KINDS) n.items[k] = 0
    for (const k of TOKENS) n.tokens[k] = 0
    n.tag = 0
    n.tray = 0
    n.car = 0

    const put = (m: InstancedMesh, i: number, c: Color) => {
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, c)
    }
    /** A car on the map, `u` of the way along a route; leaves its top in `pa`. */
    const car = (route: Route, u: number, fam: Family, life = 1) => {
      along(route, u * route.len, o.position, dir)
      const flat = Math.hypot(dir.x, dir.z)
      o.rotation.set(flat > 1e-5 ? -Math.atan2(dir.y, flat) : 0, flat > 1e-5 ? Math.atan2(dir.x, dir.z) : 0, 0, 'YXZ')
      const s = still ? CS : CS * Math.max(0.001, Math.min(1, life))
      o.scale.setScalar(s)
      if (n.car < CAP_CAR) put(pl.car!, n.car++, LINE_C[fam])
      pa.set(o.position.x, o.position.y + 0.128 * s, o.position.z)
      return pa
    }
    /** An item with its grant tag(s) and, when bought, the box it rides home in. */
    const item = (kind: ItemKind, pos: Vector3, size: number, yaw: number, tint: Color, tags: string[], tagMix: number, oldTags: string[] | null, tray = 0, sx = 1, sy = 1, spin = 0) => {
      const m = pl.items[kind]
      if (!m || n.items[kind] >= CAP_ITEM || size <= 0.001) return
      o.position.copy(pos)
      lastAt.copy(pos)
      placed = true
      o.rotation.set(0, yaw + spin, 0)
      o.scale.set(size * sx, size * sy, size * sx)
      put(m, n.items[kind]++, tint)
      if (tray > 0.01 && n.tray < CAP_ITEM) {
        o.position.copy(pos)
        o.position.y -= 0.03 * size
        o.rotation.set(0, yaw + spin, 0)
        o.scale.set(size * tray * 1.02, size * tray * 0.9, size * tray * 1.02)
        put(pl.tray!, n.tray++, WHITE)
      }
      // Tags hang off the item's right shoulder, toward the camera.
      const ts = 0.6 + size * 1.5
      for (let i = 0; i < tags.length && i < 2; i++) {
        if (n.tag >= CAP_TOKEN) break
        const a = yaw + spin + 0.8 - i * 0.5
        const r = 0.5 * size * sx + 0.06
        o.position.set(pos.x + Math.sin(a) * r, pos.y + (0.62 - i * 0.2) * size * sy, pos.z + Math.cos(a) * r)
        o.rotation.set(0, yaw + spin + 0.3, 0.25 - i * 0.2)
        o.scale.setScalar(ts)
        col.copy(oldTags && oldTags[i] ? grantC(oldTags[i]) : grantC(tags[i]))
        if (oldTags) col.lerp(grantC(tags[i]), tagMix)
        put(pl.tag!, n.tag++, col)
      }
    }
    const token = (k: Token, pos: Vector3, yaw: number, c: Color, s = 1) => {
      const m = pl.tokens[k]
      if (!m || n.tokens[k] >= CAP_TOKEN) return
      o.position.copy(pos)
      o.rotation.set(0, yaw, 0)
      o.scale.setScalar(s)
      put(m, n.tokens[k]++, c)
    }
    /** A throw between two points; flat and spinless under reduced motion. */
    const arc = (a: Vector3, b: Vector3, u: number, out: Vector3) => {
      out.lerpVectors(a, b, u)
      if (!still) out.y += Math.min(2.2, 0.16 * a.distanceTo(b)) * 4 * u * (1 - u)
      return out
    }
    const handOf = (rid: string, out: Vector3) => out.copy(person(rid).hand)

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
    const gmSlot = new Map<string, number>()
    for (const h of w.holds) if (h.open && h.kind === 'purchase' && !gmSlot.has(h.refId)) gmSlot.set(h.refId, gmSlot.size % GM_SLOTS.length)
    const parkSlot = new Map<string, number>()
    const parkCount: Record<string, number> = {}
    for (let i = w.requests.length - 1; i >= 0; i--) {
      const r = w.requests[i]
      if (r.outcome === 'hold' && r.holdFor === 'payment') {
        const k = parkCount[r.grantId] ?? 0
        parkSlot.set(r.id, k % 2)
        parkCount[r.grantId] = k + 1
      }
    }
    const P = mapPoint('P')
    let atDesk = 0

    for (const r of w.requests.slice(0, 40)) {
      const ps = byRef.get(r.id) ?? []
      const pReq = ps.find(p => p.kind === 'request' || p.kind === 'pushback')
      const pHold = ps.find(p => p.kind === 'hold')
      const pDec = ps.find(p => p.kind === 'decision')
      const pVer = ps.find(p => p.kind === 'verdict')
      const busy = ps.some(p => p.kind === 'recheck' || p.kind === 'reading')
      let state: PState | null = null
      if (pReq) state = 'out'
      else if (pHold) state = 'toGm'
      else if (pDec) state = 'fromGm'
      else if (gmSlot.has(r.id)) state = 'gm'
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
        life = { state: null, slot: 0, ride: null, seen: frame, pos: new Vector3(), has: false }
        lives.set(r.id, life)
      }
      life.seen = frame
      const G = GRANT_AT[r.grantId] ?? 'G1'
      if (life.state !== state) {
        // Back from a siding or the grant manager to the purchasing agent: a short ride.
        const slots = life.state === 'park' ? PARK[r.grantId] : life.state === 'gm' ? GM_SLOTS : null
        if (!first && state === 'desk' && slots) {
          const tail = slots[life.slot % slots.length]
          life.ride = { route: routeFromTail(tail, 'P', life.state === 'park' ? G : 'GM'), at: t, ms: still ? 0 : 1300, fam: life.state === 'park' ? 'money' : 'people' }
        } else life.ride = null
        if (state === 'gm' || state === 'toGm') life.slot = gmSlot.get(r.id) ?? gmSlot.size
        if (state === 'park' || state === 'toPark') life.slot = parkSlot.get(r.id) ?? 0
        life.state = state
      }

      const rid = r.researcherId
      const tags = tagsOf(r)
      const base = [r.grantId]
      placed = false

      if (state === 'out' && pReq) {
        const k = progress(pReq, t)
        const route = routeBetween('I', 'P')
        if (k < SEND.hold) {
          // Held up overhead.
          const up = still ? 1 : smooth(0, 0.6, k / SEND.hold)
          handOf(rid, pb)
          pb.y += 0.03
          item(r.kind, pb, HAND * (0.3 + 0.7 * up), FACE, WHITE, tags, 0, null)
          car(route, 0, 'request', still ? 1 : smooth(0, 0.25, k))
        } else if (k < SEND.fly) {
          const u = (k - SEND.hold) / (SEND.fly - SEND.hold)
          handOf(rid, pb)
          const top = car(route, 0, 'request')
          dir.copy(top)
          arc(pb, dir, still ? u : sine(u), pa)
          item(r.kind, pa, HAND + (CAR - HAND) * u, FACE, WHITE, tags, 0, null, 0, 1, 1, still ? 0 : u * Math.PI * 2)
        } else {
          const u = (k - SEND.fly) / (1 - SEND.fly)
          const top = car(route, still ? u : inOut(u), 'request', still ? 1 : (1 - u) / 0.12)
          item(r.kind, top, CAR, FACE, WHITE, tags, 0, null)
        }
      } else if (state === 'desk') {
        let k = 1
        if (life.ride) {
          k = life.ride.ms <= 0 ? 1 : clamp01((t - life.ride.at) / life.ride.ms)
          if (k >= 1) life.ride = null
        }
        if (k < 1 && life.ride) {
          const top = car(life.ride.route, inOut(k), life.ride.fam)
          item(r.kind, top, CAR, FACE, WHITE, tags, 0, null)
        } else {
          const i = atDesk++
          if (i === 0) pa.set(P[0], DRUM.h + 0.005, P[2])
          else pa.set(P[0] + (i % 2 ? -0.95 : 0.95) * Math.ceil(i / 2), 0.04, P[2] + 0.55)
          // Being checked: a slow turn under the rule lamps.
          item(r.kind, pa, REST, FACE + (still ? 0 : 0.18 * Math.sin(t / 900)), WHITE, tags, 0, null)
        }
      } else if (state === 'return' && pVer) {
        const k = progress(pVer, t)
        const out = pVer.outcome ?? 'accept'
        const after = tagsOf(r, out)
        const moved = after.join() !== base.join()
        const stamp = smooth(0, BACK.stamp, k)
        const tintC = tA.copy(WHITE)
        if (out === 'reject') tintC.lerp(GREY, stamp)
        const tray = out === 'accept' ? stamp : 0
        const route = routeBetween('P', 'I')
        const end = BACK.stamp + BACK.ride
        if (k < BACK.stamp) {
          pa.set(P[0], DRUM.h + 0.005, P[2])
          const pop = still ? 1 : 1 + 0.18 * bell(k / BACK.stamp)
          item(r.kind, pa, REST * pop, FACE, tintC, after, stamp, moved ? base : null, tray)
        } else if (k < end) {
          const u = (k - BACK.stamp) / BACK.ride
          const top = car(route, still ? u : inOut(u), 'request')
          item(r.kind, top, CAR, FACE, tintC, after, 1, moved ? base : null, tray)
        } else {
          const u = (k - end) / (1 - end)
          const top = car(route, 1, 'request', still ? 1 : (1 - u) / 0.3)
          dir.copy(top)
          handOf(rid, pb)
          arc(dir, pb, still ? u : sine(u), pa)
          item(r.kind, pa, CAR + (HAND - CAR) * u, FACE, tintC, after, 1, moved ? base : null, tray)
        }
      } else if (state === 'toPark' && pVer) {
        const k = progress(pVer, t)
        const slots = PARK[r.grantId] ?? PARK.R01GM061721
        const route = routeBetween('P', G, slots[life.slot % slots.length])
        const frost = smooth(0, BACK.stamp, k)
        const tint = tA.copy(WHITE).lerp(ICE, frost)
        if (k < BACK.stamp) {
          pa.set(P[0], DRUM.h + 0.005, P[2])
          item(r.kind, pa, REST, FACE, tint, tags, 0, null)
        } else {
          const u = clamp01((k - BACK.stamp) / BACK.ride)
          const top = car(route, still ? u : inOut(u), 'money')
          item(r.kind, top, REST, FACE, tint, tags, 0, null)
        }
        holdSlip(rid, k)
      } else if (state === 'park') {
        const slots = PARK[r.grantId] ?? PARK.R01GM061721
        const route = routeBetween('P', G, slots[life.slot % slots.length])
        const top = car(route, 1, 'money')
        if (!still) top.y += 0.025 * Math.sin(t / 700 + r.id.length)
        item(r.kind, top, REST, FACE, ICE, tags, 0, null)
      } else if (state === 'toGm' && pHold) {
        const k = progress(pHold, t)
        const route = routeBetween('P', 'GM', GM_SLOTS[life.slot % GM_SLOTS.length])
        const top = car(route, still ? k : inOut(k), 'people')
        item(r.kind, top, REST, FACE, WHITE, tags, 0, null)
        cardBeside(top, REST, OUT_C.hold)
        if (pVer) holdSlip(rid, progress(pVer, t))
      } else if (state === 'gm') {
        const s = GM_SLOTS[life.slot % GM_SLOTS.length]
        pa.set(s[0], 0.05, s[1])
        const breathe = still ? 1 : 1 + 0.04 * Math.sin(t / 650 + life.slot)
        item(r.kind, pa, REST * breathe, FACE, WHITE, tags, 0, null)
        cardBeside(pa, REST, LINE_C.people)
      } else if (state === 'fromGm' && pDec) {
        const k = progress(pDec, t)
        const s = GM_SLOTS[life.slot % GM_SLOTS.length]
        const route = routeFromTail(s, 'P', 'GM')
        const top = car(route, still ? k : inOut(k), 'people')
        const ok = pDec.outcome !== 'reject'
        item(r.kind, top, REST, FACE, ok ? WHITE : tA.copy(WHITE).lerp(GREY, 0.6), tags, 0, null)
        cardBeside(top, REST, ok ? OUT_C.accept : OUT_C.reject)
      }
      life.has = placed
      if (placed) life.pos.copy(lastAt)
    }
    for (const [id, l] of lives) if (frame - l.seen > 2) lives.delete(id)

    function cardBeside(at: Vector3, size: number, c: Color) {
      pb.set(at.x + Math.sin(FACE - 0.9) * size * 0.62, at.y, at.z + Math.cos(FACE - 0.9) * size * 0.62)
      token('card', pb, FACE - 0.3, c, 0.7)
    }
    /** A hold answer: a small slip goes home while the item itself waits. */
    function holdSlip(rid: string, k: number) {
      const route = routeBetween('P', 'I')
      const end = BACK.stamp + BACK.ride
      if (k < BACK.stamp) return
      if (k < end) {
        const u = (k - BACK.stamp) / BACK.ride
        const top = car(route, still ? u : inOut(u), 'request')
        token('card', top, FACE, OUT_C.hold, 0.75)
      } else {
        const u = (k - end) / (1 - end)
        const top = car(route, 1, 'request', still ? 1 : (1 - u) / 0.3)
        dir.copy(top)
        handOf(rid, pb)
        arc(dir, pb, still ? u : sine(u), pa)
        token('card', pa, FACE, OUT_C.hold, 0.75 - 0.3 * u)
      }
    }

    // Answers that came home, in the lab member's hands.
    for (let i = landed.length - 1; i >= 0; i--) {
      const l = landed[i]
      const e = t - l.at
      const life = l.outcome === 'accept' ? 2300 : l.outcome === 'reject' ? 1900 : l.outcome === 'refine' ? 1800 : 1500
      if (e > life + 400 || e < 0) {
        if (e > life + 400) landed.splice(i, 1)
        continue
      }
      handOf(l.rid, pb)
      const gone = still ? (e > life ? 1 : 0) : smooth(life, life + 400, e)
      if (l.outcome === 'hold') {
        token('card', pb, FACE, OUT_C.hold, 0.45 * (1 - gone))
        continue
      }
      let sx = 1
      let sy = 1
      const tint = l.outcome === 'reject' ? GREY : WHITE
      if (l.outcome === 'reject') {
        // It deflates, then drops to the floor and is gone.
        const d = smooth(250, 1000, e)
        sy = 1 - 0.8 * d
        sx = 1 + 0.4 * d
        const fall = smooth(1000, 1500, e)
        pb.y *= 1 - fall
      }
      const s = HAND * (1 - gone)
      item(l.kind, pb, s, FACE, tint, l.tags, 1, null, l.outcome === 'accept' ? 1 : 0, sx, sy)
    }

    // Everything else that travels: tokens on cars.
    for (const p of w.packets) {
      const req = p.refId && known.has(p.refId)
      if (req && (p.kind === 'request' || p.kind === 'pushback' || p.kind === 'verdict' || p.kind === 'hold' || p.kind === 'decision')) continue
      const k = progress(p, t)
      const fam = FAMILY[p.kind]
      const c = p.kind === 'reading' ? LINE_C.reading : p.kind === 'payment' || p.kind === 'charge' ? LINE_C.money : p.kind === 'invoice' ? CREAM : p.kind === 'hold' ? LINE_C.people : p.kind === 'decision' ? (p.outcome === 'reject' ? OUT_C.reject : OUT_C.accept) : WHITE
      const tk = TOKEN[p.kind]
      if (p.from.startsWith('r:')) {
        // A paper: held up, thrown to the intake, then a car to its agent.
        const route = routeBetween('I', stopOf(p.to))
        const rid = p.from.slice(2)
        if (k < SEND.hold) {
          handOf(rid, pb)
          token(tk, pb, FACE, c, 0.5)
          car(route, 0, fam, still ? 1 : smooth(0, 0.25, k))
        } else if (k < SEND.fly) {
          const u = (k - SEND.hold) / (SEND.fly - SEND.hold)
          handOf(rid, pb)
          dir.copy(car(route, 0, fam))
          arc(pb, dir, still ? u : sine(u), pa)
          token(tk, pa, FACE + (still ? 0 : u * 6), c, 0.5 + 0.3 * u)
        } else {
          const u = (k - SEND.fly) / (1 - SEND.fly)
          token(tk, car(route, still ? u : inOut(u), fam, still ? 1 : (1 - u) / 0.12), FACE, c, 0.8)
        }
        continue
      }
      if (p.to.startsWith('r:')) continue
      const route = routeBetween(stopOf(p.from), stopOf(p.to))
      const u = still ? k : inOut(k)
      const top = car(route, u, fam, still ? 1 : Math.min(k / 0.08, (1 - k) / 0.08))
      token(tk, top, FACE, c, 0.8)
    }

    const all: [InstancedMesh | null, number][] = [
      ...KINDS.map(k => [pl.items[k], n.items[k]] as [InstancedMesh | null, number]),
      ...TOKENS.map(k => [pl.tokens[k], n.tokens[k]] as [InstancedMesh | null, number]),
      [pl.tag, n.tag],
      [pl.tray, n.tray],
      [pl.car, n.car],
    ]
    for (const [m, c] of all) {
      if (!m) continue
      m.count = c
      m.visible = c > 0
      if (c > 0) {
        m.instanceMatrix.needsUpdate = true
        if (m.instanceColor) m.instanceColor.needsUpdate = true
      }
    }
  })

  const setRef = (put: (m: InstancedMesh) => void) => (m: InstancedMesh | null) => {
    if (m) put(m)
  }
  return (
    <>
      {KINDS.map(k => (
        <instancedMesh key={k} ref={setRef(m => (pools.current.items[k] = m))} args={[geo.items[k], itemMat, CAP_ITEM]} frustumCulled={false} castShadow />
      ))}
      {TOKENS.map(k => (
        <instancedMesh key={k} ref={setRef(m => (pools.current.tokens[k] = m))} args={[geo.tokens[k], tokenMat, CAP_TOKEN]} frustumCulled={false} />
      ))}
      <instancedMesh ref={setRef(m => (pools.current.tag = m))} args={[geo.tag, tokenMat, CAP_TOKEN]} frustumCulled={false} />
      <instancedMesh ref={setRef(m => (pools.current.tray = m))} args={[geo.tray, trayMat, CAP_ITEM]} frustumCulled={false} castShadow />
      <instancedMesh ref={setRef(m => (pools.current.car = m))} args={[geo.car, carMat, CAP_CAR]} frustumCulled={false} castShadow />
    </>
  )
}

export function Flow() {
  useEffect(() => () => clearAll(), [])
  return (
    <>
      <FlowFx />
      <Moving />
    </>
  )
}

