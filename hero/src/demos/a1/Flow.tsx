// Everything in motion. A request is the thing itself: the researcher holds
// it up, it flies to the network's intake and rides the groove to the
// purchasing pod, where the rule pips light. The answer comes back as the
// same object: boxed in a tray when bought, re-tagged in the other grant's
// colour when rerouted, deflating at the researcher's feet when blocked,
// parked by the frozen grant or waiting on the grant manager's desk when
// held. Papers, invoices, readings, charges and payments keep simpler forms.
// Where each thing is comes from the world every frame, so mounting
// mid-story shows the right picture; feed events only add the moments.

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, CylinderGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Object3D, RingGeometry, SphereGeometry, Vector3, type Mesh } from 'three'
import { PACE, feed, progress, useFlow } from '../../feed'
import type { ItemKind, Outcome, Packet, Request } from '../../feed'
import { ITEM_GEO, ITEM_KINDS, SLIP_GEO, TAG_GEO, TRAY_GEO } from './items3d'
import { GLAZE, GRANT_COLOR, GROOVES, NET, PAL, grooveIndex, parkOf } from './layout'
import { CLAY, SHEEN, liquid } from './mats'
import { GLOW, LEG, clearRoutes, dock, groovePoint, grooveAt, handsOf, parkRoute, placeAt, pruneRoutes, routeOf, type Route } from './routes'
import { RULES_MAX, fx, newRun, now, reducedMotion, ui } from './store'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const easeOut = (x: number) => 1 - (1 - x) ** 3
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))

const S_HAND = 0.36
const S_FLY = 1.12
const S_GROOVE = 0.78
const S_DESK = 0.7
const S_GM = 0.55
const S_PARK = 0.68
const LIFT = 0.34 // half an item's height at scale 1
const CAP = 10

const C = (hex: string) => new Color(hex)
const WHITE = C('#FFFFFF')
const HI = new Color(1.35, 1.35, 1.35)
const GL: Record<Outcome, Color> = { accept: C(GLAZE.accept), refine: C(GLAZE.refine), reject: C(GLAZE.reject), hold: C(GLAZE.hold) }
const GRANT: Record<string, Color> = Object.fromEntries(Object.entries(GRANT_COLOR).map(([k, v]) => [k, C(v)]))
const SLIP_TONE: Record<string, Color> = {
  paper: C('#F6F3EC'),
  invoice: C('#E7D6B8'),
  hold: C('#C9D7EE'),
  approve: C('#BFE0D0'),
  reject: C('#EBC3BF'),
  payment_request: C('#CDE8EE'),
  follow_up: C('#E2E6EC'),
  verdict: C('#C9D7EE'),
}
const TRAIL: Record<string, Color> = {
  request: C('#FFF3E0'),
  pushback: C('#FFF3E0'),
  paper: C('#FFF8EC'),
  recheck: C('#CFE0F2'),
  reading: C('#A9C3DD'),
  alarm: C('#E5806F'),
  good: C('#8FD6B5'),
  payment: C('#5EC8DE'),
  charge: C('#F0C463'),
  hold: C('#7FA3E8'),
  invoice: C('#F0D8A8'),
  payment_request: C('#7FD3E3'),
  follow_up: C('#CFE0F2'),
}

// ── Scene-local memory (dropped on 'reset') ──────────────────────────────

type State = 'out' | 'desk' | 'toGm' | 'gm' | 'fromGm' | 'toPark' | 'park' | 'return'
interface Life {
  state: State | null
  pos: Vector3
  tween: { from: Vector3; at: number; ms: number } | null
  seen: number
  park: Route | null
  parkSlot: number
}
interface Landed {
  rid: string
  kind: ItemKind
  outcome: Outcome
  tags: [Color | null, Color | null]
  at: number
}
interface Stream {
  g: number
  dir: number
  at: number
  gid: string
}
interface Ripple {
  pos: Vector3
  color: Color
  at: number
  size: number
}

const lives = new Map<string, Life>()
const landed: Landed[] = []
const streams: Stream[] = []
const ripples: Ripple[] = []
let frame = 0

function clearAll() {
  fx.clear()
  fx.parcels.clear()
  lives.clear()
  landed.length = 0
  streams.length = 0
  ripples.length = 0
  clearRoutes()
}

const tagsFor = (r: Request, outcome: Outcome | undefined, out: [Color | null, Color | null]) => {
  out[0] = null
  out[1] = null
  if (!outcome) return out
  if (outcome === 'accept') {
    if (r.split.length > 1) {
      out[0] = GRANT[r.split[0].grantId] ?? GL.accept
      out[1] = GRANT[r.split[1].grantId] ?? GL.accept
    } else out[0] = GL.accept
  } else if (outcome === 'refine') {
    if (r.chargedGrantId && r.chargedGrantId !== r.grantId) out[0] = GRANT[r.chargedGrantId] ?? GL.refine
    else if (r.sharedWith.length > 1) {
      out[0] = GRANT[r.sharedWith[0]] ?? GL.refine
      out[1] = GRANT[r.sharedWith[1]] ?? GL.refine
    } else out[0] = GL.refine
  } else out[0] = GL[outcome]
  return out
}

function readingTone(p: Packet) {
  if (/terminated/.test(p.label)) return TRAIL.alarm
  if (/restored|arrives/.test(p.label)) return TRAIL.good
  return TRAIL.reading
}

// ── Events: the moments ──────────────────────────────────────────────────

/** A request's rule check begins: the pips and the parcel on the pod both read it from fx. */
function startRun(id: string, total: number, start: number) {
  const r = newRun(id, start, total)
  fx.runs.set(id, r)
  fx.runId = id
  if (fx.runs.size > 12) for (const k of fx.runs.keys()) if (k !== id) {
    fx.runs.delete(k)
    break
  }
  return r
}

function FlowFx() {
  useFlow(e => {
    const t = now()
    if (e.type === 'reset') {
      clearAll()
      return
    }
    if (e.type === 'request' && !e.request.outcome && e.request.verdicts.length) startRun(e.request.id, e.request.verdicts.length, t)
    if (e.type === 'rule') {
      let r = fx.runs.get(e.requestId)
      if (!r || (e.index === 0 && r.at[0] >= 0)) r = startRun(e.requestId, e.total, t - PACE.rule * (e.index + 1))
      if (e.index < RULES_MAX) {
        r.at[e.index] = t
        r.pass[e.index] = e.verdict.pass ? 1 : 0
      }
      r.last = t
      fx.runId = e.requestId
    }
    if (e.type === 'packet') {
      fx.pulses.set(e.packet.from, t)
      if (e.packet.from.startsWith('r:')) fx.reactions.set(e.packet.from.slice(2), { kind: 'send', at: t })
    }
    if (e.type === 'arrive') {
      const p = e.packet
      fx.pulses.set(p.to, t)
      if (p.kind === 'request' && p.to === 'a:purchasing') ripples.push({ pos: dock('a:purchasing', new Vector3()), color: TRAIL.request, at: t, size: 0.9 })
      if (p.kind === 'verdict' && p.to.startsWith('r:') && p.outcome) {
        const rid = p.to.slice(2)
        fx.reactions.set(rid, { kind: p.outcome, at: t })
        const r = feed.getWorld().requests.find(q => q.id === p.refId)
        if (r && p.outcome !== 'hold') {
          landed.push({ rid, kind: r.kind, outcome: p.outcome, tags: tagsFor(r, p.outcome, [null, null]), at: t })
          if (p.outcome !== 'reject') fx.holding.set(rid, t + 1500)
        }
      }
    }
    if (e.type === 'grant' && e.event?.kind === 'payment_received') {
      const g = grooveIndex('a:bookkeeping', `g:${e.grant.id}`)
      if (g >= 0) streams.push({ g, dir: GROOVES[g].a === 'a:bookkeeping' ? 1 : -1, at: t, gid: e.grant.id })
      fx.slosh.set(e.grant.id, { at: t + 900, amp: 1 })
      const n = NET[`g:${e.grant.id}`]
      if (n) ripples.push({ pos: new Vector3(n.at[0], 0.62, n.at[1]), color: TRAIL.payment, at: t + 900, size: 1.0 })
    }
  })
  return null
}

// ── Geometry and materials ───────────────────────────────────────────────

const beadGeo = new SphereGeometry(0.1, 18, 12)
const beadMat = new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.45 })
const coinGeo = new CylinderGeometry(0.14, 0.14, 0.04, 22)
const coinMat = new MeshStandardMaterial({ color: '#E2B24F', roughness: 0.32, metalness: 0.4 })
const dropGeo = new SphereGeometry(0.08, 16, 12)
const dropMat = liquid(PAL.money)
const ringGeo = new RingGeometry(0.86, 1, 56)
const RIPPLES = 8

// ── The moving parts ─────────────────────────────────────────────────────

const o = new Object3D()
const m4 = new Matrix4()
const TAG_LOCAL = [new Matrix4().makeTranslation(0.36, 0.2, 0.34), new Matrix4().makeTranslation(-0.3, 0.22, 0.36)]
const pa = new Vector3()
const pb = new Vector3()
const tags: [Color | null, Color | null] = [null, null]
const KIND_I = Object.fromEntries(ITEM_KINDS.map((k, i) => [k, i])) as Record<ItemKind, number>
const live = new Set<string>()
const parkCount: Record<string, number> = {}

function Moving() {
  const items = useRef<(InstancedMesh | null)[]>([])
  const tagM = useRef<InstancedMesh>(null)
  const trayM = useRef<InstancedMesh>(null)
  const slipM = useRef<InstancedMesh>(null)
  const beadM = useRef<InstancedMesh>(null)
  const coinM = useRef<InstancedMesh>(null)
  const dropM = useRef<InstancedMesh>(null)
  const rip = useRef<(Mesh | null)[]>([])
  const ripMats = useMemo(() => Array.from({ length: RIPPLES }, () => new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false, toneMapped: false })), [])
  const still = useMemo(reducedMotion, [])
  const counts = useMemo(() => new Int32Array(ITEM_KINDS.length), [])

  useEffect(() => {
    for (const m of [...items.current, tagM.current, trayM.current, slipM.current, beadM.current]) {
      if (!m) continue
      m.setColorAt(0, WHITE)
      m.count = 0
    }
    return () => clearAll()
  }, [])

  useFrame(({ clock }, delta) => {
    const Tg = tagM.current, Tr = trayM.current, Sl = slipM.current, Bd = beadM.current, Cn = coinM.current, Dr = dropM.current
    if (!Tg || !Tr || !Sl || !Bd || !Cn || !Dr) return
    const w = feed.getWorld()
    const t = now()
    const s = ui.get()
    const wall = clock.elapsedTime
    frame++
    counts.fill(0)
    let nt = 0, ntr = 0, ns = 0, nb = 0, nc = 0, nd = 0
    GLOW.live.fill(0)

    const item = (kind: ItemKind, pos: Vector3, scale: number, yaw: number, tilt: number, hi: boolean, tray: boolean, squash = 1) => {
      const ki = KIND_I[kind]
      const M = items.current[ki]
      if (!M || counts[ki] >= CAP || scale < 0.01) return
      o.position.copy(pos)
      o.rotation.set(tilt, yaw, 0)
      o.scale.set(scale * (2 - squash), scale * squash, scale * (2 - squash))
      o.updateMatrix()
      M.setMatrixAt(counts[ki], o.matrix)
      M.setColorAt(counts[ki], hi ? HI : WHITE)
      counts[ki]++
      if (tray && ntr < CAP) Tr.setMatrixAt(ntr++, o.matrix)
      for (let i = 0; i < 2; i++) {
        const c = tags[i]
        if (!c || nt >= CAP * 2) continue
        m4.multiplyMatrices(o.matrix, TAG_LOCAL[i])
        Tg.setMatrixAt(nt, m4)
        Tg.setColorAt(nt++, c)
      }
    }
    const slip = (pos: Vector3, scale: number, yaw: number, c: Color) => {
      if (ns >= CAP * 2) return
      o.position.copy(pos)
      o.rotation.set(still ? 0 : 0.25 * Math.sin(wall * 3 + pos.x), yaw, 0)
      o.scale.setScalar(scale)
      o.updateMatrix()
      Sl.setMatrixAt(ns, o.matrix)
      Sl.setColorAt(ns++, c)
    }
    const glow = (r: Route, k: number, c: Color) => {
      const g = grooveAt(r, k)
      if (!g) return
      GLOW.head[g.g] = g.u
      GLOW.dir[g.g] = g.dir
      GLOW.col[g.g].copy(c)
      GLOW.live[g.g] = 1
    }
    /** Scale and lift for a thing riding a route: small in the hands, big in the air, medium in a groove. */
    const sizeOn = (phase: string, out: boolean, base: number) => {
      const u = LEG.u
      if (phase === 'hands') return base * S_HAND
      if (phase === 'air') {
        if (out) return base * (u < 0.25 ? lerp(S_HAND, S_FLY, easeOut(u / 0.25)) : u > 0.8 ? lerp(S_FLY, S_GROOVE, (u - 0.8) / 0.2) : S_FLY)
        if (LEG.last) return base * (u < 0.2 ? lerp(S_GROOVE, S_FLY, u / 0.2) : u > 0.75 ? lerp(S_FLY, S_HAND, (u - 0.75) / 0.25) : S_FLY)
        return base * S_GROOVE
      }
      return base * S_GROOVE
    }
    const liftOn = (phase: string, out: boolean, scale: number) => {
      const u = LEG.u
      if (phase === 'hands') return 0.1
      if (phase === 'air') return LIFT * scale * (out ? clamp01((u - 0.8) / 0.2) : LEG.last ? clamp01(1 - u / 0.2) : 1)
      return LIFT * scale
    }
    const wob = (k: number) => (still ? 0 : 0.18 * Math.sin(k * 9))

    // ── Packets that aren't a request's own item ──
    live.clear()
    for (const p of w.packets) {
      live.add(p.id)
      const r = routeOf(p)
      const k = progress(p, t)
      let req: Request | undefined
      if (p.refId) for (const q of w.requests) if (q.id === p.refId) req = q
      const color =
        p.kind === 'verdict' && p.outcome ? GL[p.outcome]
        : p.kind === 'decision' ? (p.outcome === 'reject' ? GL.reject : GL.accept)
        : p.kind === 'reading' ? readingTone(p)
        : TRAIL[p.kind] ?? WHITE
      glow(r, k, color)
      if (p.kind === 'request') continue
      if (req && (p.kind === 'hold' || p.kind === 'decision')) continue
      if (req && p.kind === 'verdict' && !(p.outcome === 'hold' && p.holdFor === 'grant_manager')) continue
      const ph = placeAt(r, k, pa, still)
      const out = p.from.startsWith('r:')
      if (p.kind === 'pushback' && req) {
        const sc = sizeOn(ph, out, 1)
        pa.y += liftOn(ph, out, sc)
        tags[0] = null
        tags[1] = null
        item(req.kind, pa, sc, 0.5 + wob(k), 0, s.hovered === req.id, false)
        continue
      }
      if (p.kind === 'recheck' || p.kind === 'reading') {
        if (nb >= CAP * 2) continue
        o.position.copy(pa)
        o.position.y += 0.12
        o.rotation.set(0, 0, 0)
        o.scale.setScalar(1)
        o.updateMatrix()
        Bd.setMatrixAt(nb, o.matrix)
        Bd.setColorAt(nb++, color)
        continue
      }
      if (p.kind === 'charge') {
        if (nc >= CAP) continue
        o.position.copy(pa)
        o.position.y += 0.14
        o.rotation.set(still ? 0 : 0.5 * Math.sin(k * 12), 0, 0)
        o.scale.setScalar(ph === 'air' ? 1.5 : 1)
        o.updateMatrix()
        Cn.setMatrixAt(nc++, o.matrix)
        continue
      }
      if (p.kind === 'payment') {
        if (nd >= CAP * 3) continue
        o.position.copy(pa)
        o.position.y += 0.12
        o.rotation.set(0, 0, 0)
        o.scale.setScalar(1.4)
        o.updateMatrix()
        Dr.setMatrixAt(nd++, o.matrix)
        continue
      }
      // Paper of every sort.
      const tone =
        p.kind === 'decision' ? (p.outcome === 'reject' ? SLIP_TONE.reject : SLIP_TONE.approve)
        : p.kind === 'verdict' ? SLIP_TONE.verdict
        : SLIP_TONE[p.kind] ?? SLIP_TONE.paper
      const sc = ph === 'hands' ? 0.5 : ph === 'air' ? 0.95 : 0.8
      pa.y += ph === 'hands' ? 0.12 : 0.06
      slip(pa, sc, 0.4 + wob(k), tone)
    }
    pruneRoutes(live)

    // ── Each request's item, wherever it is in its life ──
    parkCount[Object.keys(GRANT_COLOR)[0]] = 0
    parkCount[Object.keys(GRANT_COLOR)[1]] = 0
    for (let i = w.requests.length - 1; i >= 0; i--) {
      const r = w.requests[i]
      if (r.outcome === 'hold' && r.holdFor === 'payment') {
        const l = lives.get(r.id)
        const n = parkCount[r.grantId] ?? 0
        if (l) l.parkSlot = n
        parkCount[r.grantId] = n + 1
      }
    }
    let atDesk = 0
    let atGm = 0
    const N = Math.min(w.requests.length, 40)
    for (let ri = 0; ri < N; ri++) {
      const r = w.requests[ri]
      let pReq: Packet | undefined, pHold: Packet | undefined, pDec: Packet | undefined, pVer: Packet | undefined
      let busy = false
      for (const p of w.packets) {
        if (p.refId !== r.id) continue
        if (p.kind === 'request') pReq = p
        else if (p.kind === 'hold') pHold = p
        else if (p.kind === 'decision') pDec = p
        else if (p.kind === 'verdict') pVer = p
        else if (p.kind === 'recheck' || p.kind === 'reading') busy = true
      }
      let open = false
      for (const h of w.holds) if (h.open && h.kind === 'purchase' && h.refId === r.id) open = true
      let state: State | null = null
      if (pReq) state = 'out'
      else if (pHold) state = 'toGm'
      else if (pDec) state = 'fromGm'
      else if (open) state = 'gm'
      else if (pVer && pVer.outcome === 'hold' && pVer.holdFor === 'payment') state = 'toPark'
      else if (pVer && pVer.outcome !== 'hold') state = 'return'
      else if (busy) state = 'desk'
      else if (r.outcome === 'hold' && r.holdFor === 'payment') state = 'park'
      else if (!r.outcome) state = 'desk'
      if (!state) {
        if (lives.has(r.id)) {
          lives.delete(r.id)
          fx.parcels.delete(r.id)
        }
        continue
      }
      let life = lives.get(r.id)
      const first = !life
      if (!life) {
        life = { state: null, pos: new Vector3(), tween: null, seen: frame, park: null, parkSlot: 0 }
        lives.set(r.id, life)
        let n = 0
        for (let j = w.requests.length - 1; j > ri; j--) {
          const q = w.requests[j]
          if (q.outcome === 'hold' && q.holdFor === 'payment' && q.grantId === r.grantId) n++
        }
        life.parkSlot = n
      }
      life.seen = frame
      if (state === 'toPark' && life.state === 'park') state = 'park'
      if (life.state !== state) {
        const restful = (x: State | null) => x === 'desk' || x === 'gm' || x === 'park'
        life.tween = !first && restful(life.state) && restful(state) ? { from: life.pos.clone(), at: t, ms: still ? 0 : 1000 } : null
        if (state === 'toPark' && pVer) life.park = parkRoute(r.grantId, life.parkSlot)
        if (!first && state === 'return' && pVer?.outcome) ripples.push({ pos: dock('a:purchasing', new Vector3()), color: GL[pVer.outcome], at: t, size: 1.1 })
        life.state = state
      }
      const hi = s.hovered === r.id || s.selected === r.id
      let scale = S_DESK
      let yaw = 0.5
      let tilt = 0
      let tray = false
      tags[0] = null
      tags[1] = null

      const rest = (target: Vector3) => {
        const tw = life!.tween
        if (tw) {
          const k = tw.ms <= 0 ? 1 : clamp01((t - tw.at) / tw.ms)
          pb.lerpVectors(tw.from, target, still ? k : expoOut(k))
          if (!still) pb.y += Math.sin(Math.PI * k) * 0.9
          if (k >= 1) life!.tween = null
          return pb
        }
        return target
      }

      if (state === 'out' && pReq) {
        const k = progress(pReq, t)
        const rt = routeOf(pReq)
        const ph = placeAt(rt, k, pa, still)
        scale = sizeOn(ph, true, 1)
        if (ph === 'hands') scale *= clamp01(k / 0.04)
        pa.y += liftOn(ph, true, scale)
        yaw = 0.5 + wob(k)
        tilt = ph === 'air' && !still ? 0.12 * Math.sin(k * 7) : 0
        life.pos.copy(pa)
      } else if ((state === 'toGm' && pHold) || (state === 'fromGm' && pDec)) {
        const p = (pHold ?? pDec)!
        const k = progress(p, t)
        placeAt(routeOf(p), k, pa, still)
        scale = lerp(state === 'toGm' ? S_DESK : S_GM, state === 'toGm' ? S_GM : S_DESK, k)
        pa.y += LIFT * scale + (still ? 0 : Math.sin(Math.PI * k) * 0.5)
        tags[0] = state === 'toGm' ? GL.hold : pDec?.outcome === 'reject' ? GL.reject : GL.accept
        life.pos.copy(pa)
      } else if (state === 'toPark' && pVer && life.park) {
        const k = progress(pVer, t)
        const ph = placeAt(life.park, k, pa, still)
        scale = ph === 'air' ? lerp(S_GROOVE, S_PARK, LEG.u) : S_GROOVE
        pa.y += ph === 'air' ? LIFT * scale * (1 - LEG.u) : LIFT * scale
        tags[0] = GL.hold
        life.pos.copy(pa)
      } else if (state === 'return' && pVer) {
        const k = progress(pVer, t)
        const ph = placeAt(routeOf(pVer), k, pa, still)
        scale = ph === 'dock' && k < 0.2 ? S_DESK * (1 + (still ? 0 : 0.18 * Math.sin(Math.min(1, k / 0.14) * Math.PI))) : sizeOn(ph, false, 1)
        pa.y += ph === 'dock' && k < 0.2 ? LIFT * scale : liftOn(ph, false, scale)
        tagsFor(r, pVer.outcome, tags)
        tray = pVer.outcome === 'accept'
        if (pVer.outcome === 'reject' && !still) tilt = 0.25 * Math.sin(k * 10)
        life.pos.copy(pa)
      } else if (state === 'gm') {
        const n = NET['p:grant_manager']
        pa.set(n.at[0] - 0.28 + atGm * 0.3, 0.77, n.at[1] + 0.12 - atGm * 0.05)
        atGm++
        scale = S_GM
        pa.y += LIFT * scale
        tags[0] = GL.hold
        life.pos.copy(rest(pa))
      } else if (state === 'park') {
        parkOf(r.grantId, life.parkSlot, pa)
        if (!still) pa.y += 0.05 * Math.sin(wall * 1.4 + life.parkSlot)
        scale = S_PARK
        tags[0] = GL.hold
        life.pos.copy(rest(pa))
      } else {
        // On the purchasing pod while the rules run (or the grant is checked again).
        dock('a:purchasing', pa)
        const slot = atDesk++
        if (slot > 0) {
          const a = slot * 2.1
          pa.x += Math.cos(a) * 0.42
          pa.z += Math.sin(a) * 0.42
        }
        scale = S_DESK
        pa.y += LIFT * scale
        life.pos.copy(rest(pa))
      }
      if (hi) scale *= 1.12
      item(r.kind, life.pos, scale, yaw, tilt, hi, tray)
      fx.parcels.set(r.id, life.pos)
    }
    for (const [id, l] of lives)
      if (l.seen !== frame) {
        lives.delete(id)
        fx.parcels.delete(id)
      }

    // ── Answers in the hands: held a moment, or dropped and deflating ──
    for (let i = landed.length - 1; i >= 0; i--) {
      const L = landed[i]
      const age = t - L.at
      if (age < 0 || age > 1700) {
        if (age > 1700 || age < -5000) landed.splice(i, 1)
        continue
      }
      tags[0] = L.tags[0]
      tags[1] = L.tags[1]
      handsOf(L.rid, pa)
      if (L.outcome === 'reject') {
        const f = fx.figs.get(L.rid)
        const fall = clamp01(age / 380)
        pb.copy(f ? f.pos : pa)
        if (f) {
          pb.x += Math.sin(f.yaw) * 0.45
          pb.z += Math.cos(f.yaw) * 0.45
        }
        pb.y = LIFT * S_HAND
        pa.lerp(pb, still ? 1 : fall * fall)
        const def = clamp01((age - 380) / 900)
        const sq = still ? 1 : 1 - 0.8 * easeOut(def)
        const sc = S_HAND * 1.2 * (age > 1300 ? 1 - (age - 1300) / 400 : 1)
        item(L.kind, pa, sc, 0.5, 0, false, false, sq)
      } else {
        pa.y += 0.08
        const sc = S_HAND * 1.15 * (age > 1300 ? Math.max(0, 1 - (age - 1300) / 400) : 1)
        item(L.kind, pa, sc, 0.5, 0, false, L.outcome === 'accept')
      }
    }

    // ── Money arriving: drops along the groove from bookkeeping into the grant ──
    for (let i = streams.length - 1; i >= 0; i--) {
      const S = streams[i]
      const age = t - S.at
      if (age > 1400 || age < -5000) {
        streams.splice(i, 1)
        continue
      }
      for (let j = 0; j < 9; j++) {
        const u = (age - j * 60) / 800
        if (u < 0 || u > 1 || nd >= CAP * 3) continue
        groovePoint(S.g, S.dir > 0 ? u : 1 - u, pa)
        pa.y = 0.12 + (still ? 0 : Math.max(0, (u - 0.85) / 0.15) * 0.5)
        o.position.copy(pa)
        o.rotation.set(0, 0, 0)
        o.scale.setScalar(1.2)
        o.updateMatrix()
        Dr.setMatrixAt(nd++, o.matrix)
      }
      GLOW.head[S.g] = S.dir > 0 ? clamp01(age / 800) : 1 - clamp01(age / 800)
      GLOW.dir[S.g] = S.dir
      GLOW.col[S.g].copy(TRAIL.payment)
      GLOW.live[S.g] = 1
    }

    // Grooves fade in and out, at the same speed whatever the frame rate.
    const k = still ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * 7)
    for (let g = 0; g < GLOW.on.length; g++) GLOW.on[g] += ((GLOW.live[g] ? 1 : 0) - GLOW.on[g]) * k

    // ── Ripples ──
    for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].at > 800 || t - ripples[i].at < -5000) ripples.splice(i, 1)
    for (let i = 0; i < RIPPLES; i++) {
      const m = rip.current[i]
      if (!m) continue
      const R = ripples[ripples.length - 1 - i]
      const f = R ? (t - R.at) / 800 : -1
      if (!R || f < 0 || still) {
        m.visible = false
        continue
      }
      m.visible = true
      m.position.copy(R.pos)
      m.scale.setScalar(0.2 + expoOut(f) * R.size)
      ripMats[i].color.copy(R.color)
      ripMats[i].opacity = 0.75 * (1 - f) ** 1.5
    }

    for (let i = 0; i < ITEM_KINDS.length; i++) {
      const M = items.current[i]
      if (!M) continue
      M.count = counts[i]
      M.visible = counts[i] > 0
      M.instanceMatrix.needsUpdate = true
      if (M.instanceColor) M.instanceColor.needsUpdate = true
    }
    for (const [M, n] of [[Tg, nt], [Tr, ntr], [Sl, ns], [Bd, nb], [Cn, nc], [Dr, nd]] as const) {
      M.count = n
      M.visible = n > 0
      M.instanceMatrix.needsUpdate = true
      if (M.instanceColor) M.instanceColor.needsUpdate = true
    }
  })

  const noRay = () => {}
  return (
    <group>
      {ITEM_KINDS.map((kind, i) => (
        <instancedMesh
          key={kind}
          ref={el => {
            items.current[i] = el
          }}
          args={[ITEM_GEO[kind], SHEEN, CAP]}
          castShadow
          frustumCulled={false}
          raycast={noRay}
        />
      ))}
      <instancedMesh ref={tagM} args={[TAG_GEO, CLAY, CAP * 2]} frustumCulled={false} raycast={noRay} />
      <instancedMesh ref={trayM} args={[TRAY_GEO, CLAY, CAP]} castShadow frustumCulled={false} raycast={noRay} />
      <instancedMesh ref={slipM} args={[SLIP_GEO, CLAY, CAP * 2]} castShadow frustumCulled={false} raycast={noRay} />
      <instancedMesh ref={beadM} args={[beadGeo, beadMat, CAP * 2]} frustumCulled={false} raycast={noRay} />
      <instancedMesh ref={coinM} args={[coinGeo, coinMat, CAP]} castShadow frustumCulled={false} raycast={noRay} />
      <instancedMesh ref={dropM} args={[dropGeo, dropMat, CAP * 3]} frustumCulled={false} raycast={noRay} />
      {ripMats.map((m, i) => (
        <mesh
          key={i}
          ref={el => {
            rip.current[i] = el
          }}
          geometry={ringGeo}
          material={m}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
          renderOrder={3}
          raycast={noRay}
        />
      ))}
    </group>
  )
}

export function Flow() {
  return (
    <>
      <FlowFx />
      <Moving />
    </>
  )
}
