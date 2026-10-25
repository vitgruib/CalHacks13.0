// Signals: every packet in the feed becomes a bead that crosses the weights
// on its route, lighting each weight and neuron it touches. A request enters
// at the port, its rule checks fan through the six rule neurons into the
// purchasing decision, then it goes on in its outcome's colour and the answer
// rides the lane back out to the lab. Things that wait (a hold at the gate, a
// request parked by a frozen grant, one being checked) come from the world
// every frame, so mounting mid-story shows the right picture.

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry, Vector3 } from 'three'
import { feed, useFlow } from '../../feed'
import type { Outcome, Packet, Request, World } from '../../feed'
import { NODES, edgeAt, laneFrom, otherGrant, pos, route, ruleSlot, type Seg } from './layout'
import { COL, OUT_COL, clearGlow, touchEdge, touchNode } from './glow'

interface Trip {
  segs: Seg[]
  len: number
  at: number // feed ms
  ms: number
  col: (i: number) => Color
  size: number
  ref?: string
  seg: number // last segment drawn, to light each neuron once as the bead reaches it
  power: number // how bright it lights what it crosses
  tau: number // how long the weights it lights keep glowing
  nodeTau?: (id: string) => number
}

const trips: Trip[] = []
const parkedBefore = new Set<string>()

const NODE_TAU = (id: string) => (id.startsWith('o:') ? 2.6 : id === 'dec' ? 1.2 : 0.9)

function send(ids: string[], at: number, ms: number, col: Color | ((i: number) => Color), o: Partial<Trip> = {}) {
  const segs = route(ids)
  if (!segs.length) return
  const len = segs.reduce((s, x) => s + x.e.len, 0)
  const f = typeof col === 'function' ? col : () => col
  trips.push({ segs, len, at, ms, col: f, size: 1, seg: -1, power: 1, tau: 0.75, ...o })
  if (trips.length > 60) trips.shift()
}

const gNode = (gid: string) => `g:${gid}`
const find = (w: World, id?: string) => (id ? w.requests.find(r => r.id === id) : undefined)
const approved = (w: World, r: Request) => w.holds.some(h => h.kind === 'purchase' && h.refId === r.id && h.decision?.choice === 'approve')
const managerRejected = (w: World, r: Request) => w.holds.some(h => h.kind === 'purchase' && h.refId === r.id && h.decision?.choice === 'reject')

/** Before the verdict, the recheck is going to buy (all rules passed, or the manager said yes) or reroute. */
function goingTo(w: World, r: Request): { outcome: 'accept' | 'refine'; grants: string[] } {
  const ok = r.verdicts.every(v => v.pass) || approved(w, r)
  if (r.split.length > 1) return { outcome: 'accept', grants: r.split.map(s => gNode(s.grantId)) }
  return ok ? { outcome: 'accept', grants: [gNode(r.grantId)] } : { outcome: 'refine', grants: [gNode(otherGrant(r.grantId))] }
}

function readingTone(p: Packet) {
  if (/terminated/.test(p.label)) return COL.alarm
  if (/restored/.test(p.label)) return COL.good
  return COL.reading
}

const AGENT_NODE: Record<string, string> = { 'a:purchasing': 'dec', 'a:bookkeeping': 'book', 'a:payment_report': 'pay' }

function onPacket(p: Packet, t: number) {
  const w = feed.getWorld()
  const r = find(w, p.refId)
  switch (p.kind) {
    case 'request':
    case 'pushback':
      send(['lab', 'port', 'in'], t, p.ms, COL.ink, { ref: p.refId, size: 1.15 })
      return
    case 'paper':
      send(['lab', 'port', 'in', 'pay'], t, p.ms, COL.paper, { ref: p.refId })
      return
    case 'verdict': {
      if (!r || !p.outcome) return
      const o: Outcome = p.outcome
      let head: string[]
      if (o === 'accept' || o === 'refine') {
        const g = r.chargedGrantId ? gNode(r.chargedGrantId) : r.split.length > 1 ? gNode(r.split[0].grantId) : gNode(r.grantId)
        head = r.chargedGrantId || r.verdicts.every(v => v.pass) || approved(w, r) || r.split.length > 1 ? [g] : ['dec', 'book', g]
      } else if (o === 'reject') head = managerRejected(w, r) ? ['gm'] : ['dec']
      else if (p.holdFor === 'grant_manager') head = ['dec', 'gm']
      else head = ['dec', 'book', gNode(r.grantId)]
      const ids = [...head, ...laneFrom(o)]
      // The answer is slower than the feed's packet so it reads at 4x; it lands a moment after the feed says.
      send(ids, t, Math.max(p.ms, 7600), OUT_COL[o], { size: 1.2, power: 1.1, tau: 1.0 })
      return
    }
    case 'recheck': {
      if (!r) return
      const to = goingTo(w, r)
      const c = OUT_COL[to.outcome]
      if (p.from === 'a:purchasing') send(['dec', 'book'], t, p.ms, c, { ref: p.refId })
      else for (const g of to.grants) send(['book', g], t, p.ms, c, { ref: p.refId })
      return
    }
    case 'reading':
      send(['inlet', 'book'], t, p.ms, readingTone(p), { size: 0.7, power: 0.55 })
      return
    case 'payment':
      send(['inlet', 'book'], t, p.ms, COL.money, { size: 1.5, power: 1.5, tau: 1.2 })
      return
    case 'invoice':
      send(['inlet', 'book'], t, p.ms, COL.paper, { size: 1.0 })
      return
    case 'hold': {
      if (r) return // a purchase's answer already carries it to the gate
      const from = AGENT_NODE[p.from]
      if (from) send([from, 'gm'], t, p.ms, OUT_COL.hold, { size: 0.95 })
      return
    }
    case 'decision': {
      const to = AGENT_NODE[p.to]
      if (to) send(['gm', to], t, p.ms, p.outcome === 'reject' ? OUT_COL.reject : OUT_COL.accept, { ref: r ? p.refId : undefined, size: 1.1 })
      return
    }
    case 'payment_request':
      send(['pay', 'funder'], t, p.ms, COL.money, { size: 1.0 })
      return
    case 'follow_up':
      send(['funder', 'pay'], t, p.ms, COL.reading, { size: 0.85 })
      return
  }
}

function FlowFx() {
  const frozen = useRef(new Map<string, boolean>())
  useFlow(e => {
    const t = feed.now()
    if (e.type === 'reset') {
      trips.length = 0
      parkedBefore.clear()
      frozen.current.clear()
      clearGlow()
      return
    }
    if (e.type === 'packet') onPacket(e.packet, t)
    if (e.type === 'rule') {
      const k = ruleSlot(e.verdict.rule, e.index)
      const c = e.verdict.pass ? COL.pass : COL.fail
      touchEdge(`in|r${k}`, c, 0.8, 1.4)
      touchNode(`r${k}`, c, e.verdict.pass ? 1 : 1.5, e.verdict.pass ? 1.8 : 3.2)
      send([`r${k}`, 'dec'], t, 700, c, { tau: e.verdict.pass ? 1.2 : 2.4, power: e.verdict.pass ? 0.9 : 1.3, size: 0.8 })
    }
    if (e.type === 'request') {
      const r = e.request
      // A parked request goes again once money lands: it travels back from the grant to be re-checked.
      if (!r.outcome && r.verdicts.length && parkedBefore.has(r.id)) {
        parkedBefore.delete(r.id)
        send([gNode(r.grantId), 'book', 'dec'], t, 1800, COL.ink, { ref: r.id, size: 1.15 })
      }
    }
    if (e.type === 'grant') {
      const id = gNode(e.grant.id)
      const was = frozen.current.get(id)
      frozen.current.set(id, e.grant.frozen)
      const kind = e.event?.kind
      if (kind === 'payment_received') {
        // A strong pulse: a stream of money down the bookkeeping weight into the grant.
        // A pulse of beads down the bookkeeping weight; the grant node glows teal for a moment. No ripple or swell: nothing fills.
        for (let i = 0; i < 9; i++) send(['book', id], t + i * 110, 1300, COL.money, { size: 1.6 - i * 0.06, power: 1.8, tau: 1.6, nodeTau: () => 1.4 })
      } else if (kind === 'canceled') {
        touchNode(id, COL.fail, 1.2, 2.5)
      } else if (kind === 'court_order') {
        touchNode(id, COL.good, 0.9, 2)
      }
      if (was && !e.grant.frozen) touchNode(id, COL.ice, 1, 1.5)
    }
    if (e.type === 'invoice') touchNode('book', e.matched ? COL.pass : COL.fail, 1.3, 3)
    if (e.type === 'paper') touchNode('pay', e.result === 'ok' ? COL.pass : e.result === 'note' ? OUT_COL.refine : COL.fail, 1.3, 3)
    if (e.type === 'hold' && !e.hold.open && e.hold.decision) touchNode('gm', e.hold.decision.choice === 'approve' ? OUT_COL.accept : OUT_COL.reject, 1.4, 2)
  })
  return null
}

// ── Drawing ──────────────────────────────────────────────────────────────

const CAP = 96
const beadGeo = new SphereGeometry(0.13, 18, 12)
const beadMat = new MeshBasicMaterial({ color: '#FFFFFF' })
const o = new Object3D()
const p = new Vector3()
const q = new Vector3()
const WHITE = new Color('#FFFFFF')
const tint = new Color()
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2)

function Beads() {
  const ref = useRef<InstancedMesh>(null)
  const busy = useMemo(() => new Set<string>(), [])
  useEffect(() => {
    const m = ref.current
    if (m) {
      m.setColorAt(0, WHITE)
      m.count = 0
    }
    return () => {
      trips.length = 0
      clearGlow()
    }
  }, [])

  useFrame(({ clock }) => {
    const M = ref.current
    if (!M) return
    const w = feed.getWorld()
    const t = feed.now()
    const wall = clock.elapsedTime
    let n = 0
    const bead = (at: Vector3, c: Color, size: number) => {
      if (n >= CAP) return
      o.position.copy(at)
      o.scale.setScalar(size)
      o.updateMatrix()
      M.setMatrixAt(n, o.matrix)
      // A touch lighter than the colour it carries, so beads read as light against the clay.
      M.setColorAt(n++, c === COL.ink ? c : tint.copy(c).lerp(WHITE, 0.15))
    }

    busy.clear()
    for (const pk of w.packets) if (pk.refId && pk.kind !== 'reading' && pk.kind !== 'hold' && pk.kind !== 'charge') busy.add(pk.refId)

    // ── Trips ──
    for (let i = trips.length - 1; i >= 0; i--) {
      const T = trips[i]
      const k = (t - T.at) / T.ms
      if (k < 0) {
        if (k < -50) trips.splice(i, 1) // the clock went back (a restart)
        continue
      }
      const done = k >= 1
      // Over before it was ever drawn (the story jumped ahead): drop it quietly rather than light its whole route at once.
      if (T.seg < 0 && k > 1.3) {
        trips.splice(i, 1)
        continue
      }
      const d = ease(Math.min(1, k)) * T.len
      let acc = 0
      let s = 0
      while (s < T.segs.length - 1 && acc + T.segs[s].e.len < d) acc += T.segs[s++].e.len
      const seg = T.segs[s]
      const c = T.col(s)
      // Light every neuron passed since the last frame, and the weight underfoot.
      const nt = T.nodeTau ?? NODE_TAU
      for (let j = T.seg + 1; j <= s; j++) {
        const sg = T.segs[j]
        const id = sg.fwd ? sg.e.a : sg.e.b
        if (NODES[id]?.r) touchNode(id, T.col(j), T.power, nt(id))
      }
      T.seg = s
      touchEdge(seg.e.key, c, T.power, T.tau)
      if (done) {
        const last = T.segs[T.segs.length - 1]
        const id = last.fwd ? last.e.b : last.e.a
        if (NODES[id]?.r) touchNode(id, c, T.power, nt(id))
        trips.splice(i, 1)
        continue
      }
      if (T.ref) busy.add(T.ref)
      edgeAt(seg, d - acc, p)
      bead(p, c, T.size)
    }

    // ── What is waiting, from the world ──
    // Being checked: sits on the purchasing decision neuron, breathing.
    let desk = 0
    for (const r of w.requests) {
      if (desk > 3) break
      if (r.outcome || !r.verdicts.length || busy.has(r.id)) continue
      const reading = w.packets.some(x => x.kind === 'reading' && x.refId === r.id)
      const at = NODES[reading ? 'book' : 'dec']
      p.copy(at.at)
      p.y += at.r + 0.14 + 0.03 * Math.sin(wall * 3)
      p.x += desk * 0.28
      bead(p, COL.ink, 1.1)
      desk++
    }
    // Parked by a frozen grant, waiting on money: queued just outside its frost.
    const slots: Record<string, number> = {}
    for (let i = w.requests.length - 1; i >= 0; i--) {
      const r = w.requests[i]
      if (r.outcome !== 'hold' || r.holdFor !== 'payment') continue
      parkedBefore.add(r.id)
      if (busy.has(r.id)) continue
      const g = gNode(r.grantId)
      const sl = (slots[g] = (slots[g] ?? -1) + 1)
      const gn = NODES[g]
      q.subVectors(pos('book'), gn.at).normalize()
      p.copy(gn.at).addScaledVector(q, gn.r + 0.62 + sl * 0.3)
      p.y += 0.02 * Math.sin(wall * 1.6 + sl)
      bead(p, OUT_COL.hold, 1.15)
    }
    // At the grant manager's gate: queued on the weight each hold came in on.
    const gate: Record<string, number> = {}
    for (const h of w.holds) {
      if (!h.open) continue
      const from = h.kind === 'purchase' ? 'dec' : h.raisedBy === 'bookkeeping' ? 'book' : 'pay'
      if (h.kind === 'purchase' && busy.has(h.refId)) continue
      const sl = (gate[from] = (gate[from] ?? -1) + 1)
      q.subVectors(pos(from), pos('gm')).normalize()
      p.copy(pos('gm')).addScaledVector(q, 0.98 + sl * 0.3)
      p.y += 0.02 * Math.sin(wall * 1.6 + sl)
      bead(p, h.kind === 'purchase' ? OUT_COL.hold : COL.paper, 1.2)
    }

    M.count = n
    M.visible = n > 0
    M.instanceMatrix.needsUpdate = true
    if (M.instanceColor) M.instanceColor.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[beadGeo, beadMat, CAP]} frustumCulled={false} />
}

export function Signals() {
  return (
    <>
      <FlowFx />
      <Beads />
    </>
  )
}
