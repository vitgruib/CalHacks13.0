// The ball engine. Every request is a steel ball: it rides its researcher's
// chute while the request packet is in flight, then steps through the gates
// as 'rule' events arrive, waits on the switch while the agent checks again,
// and drops wherever the answer sends it. Verdicts and every other packet are
// tokens drawn straight from world.packets, so nothing in flight is missed.

import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  BoxGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  Curve,
  CylinderGeometry,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  LineCurve3,
  Matrix4,
  MeshStandardMaterial,
  QuadraticBezierCurve3,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three'
import { feed, progress, R01, useFlow, type FlowEvent, type Outcome, type Packet, type Request, type World } from '../../feed'
import { COL, M, clamp01, easeInOut, fx, gravity, pulse, resetFx, roll, uiStore } from './kit'
import { feedRate } from './Parts'
import {
  BALL_R,
  BIN,
  CRADLE,
  CRADLE_DROP,
  FAIL_LANE,
  FUNNEL_TOP,
  G0,
  GATE_X,
  GATES,
  GM_BIN,
  GRANT_COLOR,
  HOPPER,
  LIFT,
  LIFT_TOP,
  LOOP,
  MERGE,
  RERUN,
  RUN_END,
  SW,
  TO_BIN,
  TO_CRADLE,
  TO_LOOP,
  TO_TRAY,
  UP,
  binSlot,
  cradleToHopper,
  gateOf,
  onTrack,
  reroute,
  rounded,
  routeFor,
  signalLine,
  toHopper,
  trayAt,
  v,
  type Track,
} from './layout'

export const OUTCOME_COLOR: Record<Outcome, Color> = { accept: COL.yellow, refine: COL.cobalt, reject: COL.red, hold: COL.steel }
const grantColor = (g: string) => (GRANT_COLOR[g] === 'yellow' ? COL.yellow : COL.cobalt)

type Phase = 'chute' | 'run' | 'switch' | 'loop' | 'cradle' | 'tray' | 'bin' | 'gone'
type Step = { k: 'gate'; gate: number; pass: boolean; first: boolean } | { k: 'toSwitch' } | { k: 'route'; req: Request } | { k: 'rerun' }
interface Seg {
  curve: Curve<Vector3>
  dur: number
  ease: (t: number) => number
  t: number
  lift?: boolean
  onEnd?: () => void
}
interface Ball {
  id: string
  rid: string
  pos: Vector3
  prevX: number
  phase: Phase
  lane: 0 | 1
  gate: number
  segs: Seg[]
  steps: Step[]
  wait: number
  loopA: number
  scale: number
  grantId: string
  idle: number
}
interface Landed {
  outcome: Outcome
  pos: Vector3
  t: number
}
interface Bead {
  curve: Curve<Vector3>
  t: number
  color: Color
  onEnd: () => void
}

class LoopArc extends Curve<Vector3> {
  constructor(private a0: number, private da: number) {
    super()
  }
  getPoint(t: number, out = new Vector3()) {
    const a = this.a0 + this.da * t
    return out.set(LOOP.c.x + Math.cos(a) * LOOP.r, LOOP.c.y, LOOP.c.z + Math.sin(a) * LOOP.r)
  }
}

const len = (c: Curve<Vector3>) => c.getLength()

class Machine {
  balls = new Map<string, Ball>()
  binMain: string[] = []
  binGm: string[] = []
  landed: Landed[] = []
  beads: Bead[] = []
  frozen: Record<string, boolean> = {}
  pending: Record<string, number> = {}
  synced = false
  syncT = 0

  reset() {
    this.pending = {}
    this.synced = false
    this.balls.clear()
    this.binMain = []
    this.binGm = []
    this.landed = []
    this.beads = []
    this.frozen = {}
    resetFx()
  }

  private make(id: string, rid: string, at: Vector3, phase: Phase): Ball {
    const b: Ball = { id, rid, pos: at.clone(), prevX: at.x, phase, lane: 0, gate: -1, segs: [], steps: [], wait: 0, loopA: Math.PI, scale: 1, grantId: R01, idle: 0 }
    this.balls.set(id, b)
    return b
  }

  private ball(id: string): Ball {
    return this.balls.get(id) ?? this.make(id, '', G0, 'run')
  }

  onEvent(e: FlowEvent) {
    if (e.type === 'reset') return this.reset()
    if (e.type === 'packet') {
      const p = e.packet
      if (p.kind === 'request' && p.from.startsWith('r:')) {
        const b = fx.bench[p.from.slice(2)]
        if (b) b.send = 1
      }
      if (p.kind === 'pushback' && p.refId) {
        const b = this.balls.get(p.refId)
        if (b && b.phase === 'loop') b.steps.push({ k: 'rerun' })
      }
      if (p.kind === 'payment_request' && p.from === 'a:payment_report') {
        fx.press.stamp = 1
        fx.press.color = COL.yellow.clone()
      }
      if (p.kind === 'charge') {
        const g = p.from.slice(2)
        if (fx.hopper[g]) fx.hopper[g].gulp = Math.max(fx.hopper[g].gulp, 0.6)
      }
      return
    }
    if (e.type === 'arrive') return this.arrive(e.packet)
    if (e.type === 'rule') {
      const b = this.ball(e.requestId)
      b.steps.push({ k: 'gate', gate: gateOf(e.verdict.rule), pass: e.verdict.pass, first: e.index === 0 })
      if (e.index === e.total - 1) b.steps.push({ k: 'toSwitch' })
      return
    }
    if (e.type === 'request') {
      const r = e.request
      if (r.revisionOf) {
        const old = this.balls.get(r.revisionOf)
        if (old && old.phase === 'tray') old.phase = 'gone'
      }
      if (!r.outcome) return
      const b = this.balls.get(r.id) ?? this.make(r.id, r.researcherId, SW, 'switch')
      b.steps.push({ k: 'route', req: r })
      return
    }
    if (e.type === 'grant' && e.event) {
      const g = e.grant.id
      const was = this.frozen[g] ?? fx.lock[g]?.frozen ?? false
      this.frozen[g] = e.grant.frozen
      const kind = e.event.kind
      const color = kind === 'canceled' ? COL.red : kind === 'court_order' ? COL.cobalt : kind === 'payment_received' ? COL.yellow : COL.grey
      if (was && !e.grant.frozen) for (const b of this.balls.values()) if (b.phase === 'loop' && b.grantId === g) b.steps.push({ k: 'rerun' })
      const frozen = e.grant.frozen
      this.pending[g] = (this.pending[g] ?? 0) + 1
      this.beads.push({
        curve: rounded(signalLine(g), 0.3),
        t: 0,
        color,
        onEnd: () => {
          this.pending[g] = Math.max(0, (this.pending[g] ?? 1) - 1)
          const L = fx.lock[g]
          if (!L) return
          const at = v(HOPPER[g].x, FUNNEL_TOP + 0.05, HOPPER[g].z)
          if (kind === 'court_order') L.rattle = 1
          if (L.frozen !== frozen) {
            L.frozen = frozen
            if (!frozen) L.a.v = 6
          }
          pulse(at, color, 1.6)
        },
      })
      return
    }
    if (e.type === 'paper') {
      fx.press.stamp = 1
      fx.press.color = (e.result === 'held' ? COL.red : COL.cobalt).clone()
      fx.press.sheets = Math.min(12, fx.press.sheets + 1)
    }
  }

  private arrive(p: Packet) {
    if (p.to === 'a:bookkeeping') {
      fx.ticker.tick = 1
      fx.ticker.reel += 1.05
    }
    if (p.kind === 'verdict' && p.outcome && p.to.startsWith('r:')) {
      const rid = p.to.slice(2)
      const at = trayAt(rid)
      this.landed.push({ outcome: p.outcome, pos: at, t: 0 })
      if (this.landed.length > 10) this.landed.shift()
      const b = fx.bench[rid]
      if (b) {
        b.recv = 1
        b.color.copy(OUTCOME_COLOR[p.outcome])
      }
      pulse(v(at.x, at.y - 0.17, at.z), OUTCOME_COLOR[p.outcome], 0.9)
    }
    if (p.kind === 'hold' && p.to === 'p:grant_manager') {
      fx.desk.ping = 1
      pulse(v(6.6, 1.12, -6.6), COL.steel, 1.2)
    }
    if (p.kind === 'payment' && p.to === 'a:bookkeeping') pulse(v(0.5, 1.7, -6.4), COL.yellow, 2.2)
  }

  // ── Per-frame ────────────────────────────────────────────────────────

  /** Persistent state comes from the world, so a mount mid-story (or a missed
   *  event) still shows the right padlocks, parked balls and bin contents.
   *  Events only add the motion on top. */
  sync(w: World, dt: number) {
    for (const g of w.grants) {
      const L = fx.lock[g.id]
      if (!L) continue
      if (!this.synced) {
        L.frozen = g.frozen
        L.a.x = g.frozen ? 0 : 1.62
        L.a.v = 0
        this.frozen[g.id] = g.frozen
      } else if (!this.pending[g.id] && L.frozen !== g.frozen) {
        L.frozen = g.frozen
        if (!g.frozen) L.a.v = 6
      }
    }
    this.syncT -= dt
    if (this.synced && this.syncT > 0) return
    this.syncT = 0.3
    const first = !this.synced
    this.synced = true
    for (const r of w.requests) {
      const where: Phase | undefined =
        r.state === 'waiting_on_manager' ? 'cradle' : r.state === 'submitted' && r.outcome === 'hold' && r.holdFor === 'payment' ? 'loop' : undefined
      const b = this.balls.get(r.id)
      if (where && !b) {
        const nb = this.make(r.id, r.researcherId, where === 'loop' ? LOOP.c : CRADLE, where)
        nb.grantId = r.grantId
        nb.loopA = Math.PI * (0.5 + this.balls.size * 0.7)
        continue
      }
      if (b && (b.phase === 'loop' || b.phase === 'cradle') && b.phase !== where && !b.segs.length && !b.steps.length && b.wait <= 0 && b.idle > 4) b.phase = 'gone'
      const binned = (r.state === 'blocked' && r.outcome === 'reject') || r.state === 'rejected'
      if (first && !b && binned) {
        const gm = r.state === 'rejected'
        const list = gm ? this.binGm : this.binMain
        if (list.length >= 9) continue
        list.push(r.id)
        this.make(r.id, r.researcherId, binSlot(list.length - 1, gm ? GM_BIN : BIN), 'bin')
      }
    }
  }

  update(dt: number, packets: Packet[]) {
    for (const p of packets) {
      if (p.kind !== 'request' || !p.refId) continue
      let b = this.balls.get(p.refId)
      if (!b) b = this.make(p.refId, p.from.slice(2), G0, 'chute')
      if (b.phase !== 'chute') continue
      routeFor(p.from, p.to).getPointAt(gravity(progress(p)), b.pos)
    }
    for (const b of this.balls.values()) {
      if (b.phase === 'gone') {
        this.balls.delete(b.id)
        continue
      }
      b.prevX = b.pos.x
      if (b.phase === 'chute') {
        if (!packets.some(p => p.kind === 'request' && p.refId === b.id)) {
          b.phase = 'run'
          b.pos.copy(G0)
          b.gate = -1
          b.lane = 0
        }
        continue
      }
      if (b.wait > 0) {
        b.wait -= dt
        continue
      }
      if (b.segs.length) {
        const s = b.segs[0]
        s.t += dt / s.dur
        s.curve.getPointAt(s.ease(clamp01(s.t)), b.pos)
        if (s.lift) {
          fx.lift.active = true
          fx.lift.y = b.pos.y
        }
        if (s.t >= 1) {
          b.segs.shift()
          if (s.lift) fx.lift.active = false
          s.onEnd?.()
        }
        this.flaps(b)
        continue
      }
      const step = b.steps.shift()
      if (step) {
        this.start(b, step)
        continue
      }
      b.idle += dt
      if (b.phase === 'loop') {
        b.loopA += dt * 2.4
        b.pos.set(LOOP.c.x + Math.cos(b.loopA) * LOOP.r, LOOP.c.y, LOOP.c.z + Math.sin(b.loopA) * LOOP.r)
      } else if (b.phase === 'cradle') {
        b.pos.set(CRADLE.x + Math.sin(b.idle * 2.2) * 0.05, CRADLE.y, CRADLE.z)
      } else if (b.phase === 'tray' && b.idle > 45) {
        b.phase = 'gone'
      }
    }
    for (const l of this.landed) l.t += dt
    this.landed = this.landed.filter(l => l.t < 3.6)
    for (const bd of this.beads) {
      bd.t += dt / 0.9
      if (bd.t >= 1) bd.onEnd()
    }
    this.beads = this.beads.filter(bd => bd.t < 1)
  }

  /** Swing each flap open as a ball on the main lane passes under it. */
  private flaps(b: Ball) {
    if (b.lane !== 0 || Math.abs(b.pos.z) > 0.25 || b.pos.x <= b.prevX) return
    for (let g = 0; g < GATE_X.length; g++) {
      const edge = GATE_X[g] - 0.28
      if (b.prevX < edge && b.pos.x >= edge) {
        fx.gates[g].flap.v = Math.max(fx.gates[g].flap.v, 11)
        if (g > b.gate && fx.gates[g].lamp === 'idle') fx.gates[g].lamp = 'skip'
      }
    }
  }

  private seg(b: Ball, curve: Curve<Vector3>, dur: number, ease = roll, onEnd?: () => void, lift = false) {
    b.segs.push({ curve, dur: Math.max(0.08, dur), ease, t: 0, onEnd, lift })
  }

  private start(b: Ball, step: Step) {
    if (step.k === 'gate') {
      if (b.phase !== 'run') {
        b.steps.unshift(step)
        this.rerun(b)
        return
      }
      if (step.first) for (const g of fx.gates) g.lamp = 'idle'
      if (step.gate <= b.gate) {
        this.trigger(b, step.gate, step.pass)
        b.wait = 0.12
        return
      }
      const to = onTrack(GATE_X[step.gate] - 0.5, b.lane)
      const d = b.pos.distanceTo(to)
      this.seg(b, new LineCurve3(b.pos.clone(), to), 0.14 + d / 7.5, roll, () => this.trigger(b, step.gate, step.pass))
      return
    }
    if (step.k === 'toSwitch') {
      for (let g = b.gate + 1; g < GATES.length; g++) if (fx.gates[g].lamp === 'idle') fx.gates[g].lamp = 'skip'
      const pts = [b.pos.clone()]
      if (b.pos.x < RUN_END - 0.3) pts.push(onTrack(RUN_END, b.lane))
      if (b.lane === 1) pts.push(FAIL_LANE[2])
      pts.push(SW.clone())
      const c = rounded(pts, 0.5)
      b.phase = 'run'
      this.seg(b, c, 0.25 + len(c) / 8, roll, () => {
        b.phase = 'switch'
        fx.sw.deciding = 1
      })
      return
    }
    if (step.k === 'route') return this.route(b, step.req)
    this.rerun(b)
  }

  private trigger(b: Ball, g: number, pass: boolean) {
    const gate = fx.gates[g]
    if (!pass) gate.lamp = 'fail'
    else if (gate.lamp !== 'fail') gate.lamp = 'pass'
    gate.flash = 1
    b.gate = Math.max(b.gate, g)
    if (pass) return
    if (b.lane === 0) {
      gate.kick = 1
      const from = b.pos.clone()
      const to = onTrack(from.x + 0.18, 1)
      const mid = from.clone().add(to).multiplyScalar(0.5).add(v(0, 0.5, 0))
      b.lane = 1
      this.seg(b, new QuadraticBezierCurve3(from, mid, to), 0.32, easeInOut)
    } else gate.shake = 1
  }

  private rerun(b: Ball) {
    const from = b.pos.clone()
    if (b.phase === 'loop') {
      const target = -Math.PI / 2
      const da = (((target - b.loopA) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      this.seg(b, new LoopArc(b.loopA, da), 0.15 + da * 0.12, t => t)
      this.seg(b, new LineCurve3(LIFT.clone(), LIFT_TOP.clone()), 0.6, easeInOut, undefined, true)
      this.seg(b, RERUN.path, 1.9, roll)
    } else {
      const c = new CatmullRomCurve3([from, from.clone().add(v(0, 1.4, 0)), v(-2, 5.6, -1.5), v(-9.4, 4.6, -1.0), MERGE.clone(), G0.clone()])
      this.seg(b, c, 2.2, easeInOut)
    }
    b.phase = 'run'
    b.gate = -1
    b.lane = 0
  }

  private route(b: Ball, req: Request) {
    const o = req.outcome
    const g = req.chargedGrantId ?? req.grantId
    if (b.phase === 'cradle') {
      if (o === 'accept') this.go(b, cradleToHopper(g), 'hopper', g, 0)
      else if (o === 'reject') this.go(b, CRADLE_DROP, 'gmbin', g, 0)
      return
    }
    if (b.phase === 'run' || b.phase === 'chute') {
      b.steps.unshift({ k: 'route', req })
      b.steps.unshift({ k: 'toSwitch' })
      return
    }
    if (b.phase !== 'switch') {
      const c = new CatmullRomCurve3([b.pos.clone(), b.pos.clone().add(v(0, 1.2, 0)), SW.clone().add(v(0, 1, 0)), SW.clone()])
      this.seg(b, c, 1.1, easeInOut, () => (b.phase = 'switch'))
      b.steps.unshift({ k: 'route', req })
      b.phase = 'run'
      return
    }
    b.grantId = req.grantId
    if (o === 'accept') {
      if (req.split.length > 1) {
        b.scale = 0.8
        req.split.slice(1).forEach((s, i) => {
          const twin = this.make(`${b.id}~${i}`, b.rid, b.pos, 'switch')
          twin.scale = 0.8
          twin.wait = 0.45 + i * 0.2
          this.go(twin, toHopper(s.grantId), 'hopper', s.grantId, 0)
        })
        return this.go(b, toHopper(req.split[0].grantId), 'hopper', req.split[0].grantId)
      }
      return this.go(b, toHopper(g), 'hopper', g)
    }
    if (o === 'refine') {
      if (req.chargedGrantId && req.chargedGrantId !== req.grantId) return this.go(b, reroute(req.grantId, req.chargedGrantId), 'hopper', req.chargedGrantId)
      return this.go(b, TO_TRAY, 'tray', g)
    }
    if (o === 'reject') return this.go(b, TO_BIN, 'bin', g)
    if (req.holdFor === 'payment') return this.go(b, TO_LOOP, 'loop', req.grantId)
    return this.go(b, TO_CRADLE, 'cradle', g)
  }

  private go(b: Ball, t: Track, end: 'hopper' | 'bin' | 'gmbin' | 'tray' | 'loop' | 'cradle', g: string, throwWait = 0.3) {
    if (b.phase === 'switch') {
      const p1 = t.path.getPointAt(0.06)
      fx.sw.target = Math.atan2(-(p1.z - SW.z), p1.x - SW.x)
      fx.sw.deciding = 0
      b.wait = Math.max(b.wait, throwWait)
    }
    b.phase = 'run'
    b.lane = 0
    const L = len(t.path)
    this.seg(b, t.path, 0.35 + L / 6.5, gravity, () => this.land(b, end, g))
  }

  private land(b: Ball, end: string, g: string) {
    b.idle = 0
    if (end === 'hopper') {
      b.phase = 'gone'
      if (fx.hopper[g]) fx.hopper[g].gulp = 1
      pulse(v(HOPPER[g]?.x ?? 10.6, FUNNEL_TOP + 0.02, HOPPER[g]?.z ?? 0), grantColor(g), 1.6)
      return
    }
    if (end === 'bin' || end === 'gmbin') {
      const list = end === 'bin' ? this.binMain : this.binGm
      const base = end === 'bin' ? BIN : GM_BIN
      list.push(b.id)
      while (list.length > 9) {
        const old = this.balls.get(list.shift()!)
        if (old) old.phase = 'gone'
      }
      b.phase = 'bin'
      const slot = binSlot(list.length - 1, base)
      this.seg(b, new LineCurve3(b.pos.clone(), slot), 0.18, easeInOut)
      pulse(v(base.x, 1.12, base.z), COL.red, 1.3)
      return
    }
    b.phase = end as Phase
    if (end === 'loop') {
      b.loopA = Math.PI
      pulse(v(LOOP.c.x, LOOP.c.y - 0.38, LOOP.c.z), COL.yellow, 1.5)
    }
    if (end === 'cradle') pulse(v(CRADLE.x, CRADLE.y - 0.3, CRADLE.z), COL.steel, 1.0)
    if (end === 'tray') pulse(v(b.pos.x, b.pos.y - 0.25, b.pos.z), COL.cobalt, 0.9)
  }

  followState(id: string | undefined) {
    const b = id ? this.balls.get(id) : undefined
    if (!b) {
      fx.follow.settled = true
      return
    }
    fx.follow.has = true
    fx.follow.pos.copy(b.pos)
    fx.follow.settled = b.segs.length === 0 && b.steps.length === 0 && b.wait <= 0 && ['bin', 'tray', 'loop', 'cradle'].includes(b.phase)
  }
}

// ── Instanced pools ────────────────────────────────────────────────────────

class Pool {
  mesh: InstancedMesh
  n = 0
  constructor(geo: BufferGeometry, mat: Material, max: number, shadow = true) {
    this.mesh = new InstancedMesh(geo, mat, max)
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.castShadow = shadow
  }
  put(p: Vector3, q: Quaternion, s: Vector3, c: Color) {
    if (this.n >= this.mesh.instanceMatrix.count) return
    M4.compose(p, q, s)
    this.mesh.setMatrixAt(this.n, M4)
    this.mesh.setColorAt(this.n, c)
    this.n++
  }
  flush() {
    this.mesh.count = this.n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    this.n = 0
  }
}

const M4 = new Matrix4()
const Q = new Quaternion()
const Q2 = new Quaternion()
const S = new Vector3()
const P = new Vector3()
const T = new Vector3()
const LAT = new Vector3()
const E = new Euler()
const X_AXIS = new Vector3(1, 0, 0)
const ONE = new Vector3(1, 1, 1)

const yaw = (t: Vector3, out: Quaternion) => out.setFromAxisAngle(UP, Math.atan2(-t.z, t.x))
const lateral = (t: Vector3) => {
  LAT.crossVectors(t, UP)
  if (LAT.lengthSq() < 1e-6) LAT.set(0, 0, 1)
  return LAT.normalize()
}

function cardColor(p: Packet): Color {
  if (p.kind === 'reading') return p.label.includes('terminated') ? COL.red : p.label.includes('restored') ? COL.cobalt : COL.card
  if (p.kind === 'payment_request') return COL.yellow
  if (p.kind === 'follow_up') return COL.cobalt
  if (p.kind === 'invoice') return COL.grey
  return COL.card
}

export function Engine() {
  const machine = useMemo(() => new Machine(), [])
  useFlow(e => machine.onEvent(e))

  const pools = useMemo((): Pools => {
    const painted = (rough = 0.38) => new MeshStandardMaterial({ color: '#ffffff', roughness: rough, metalness: 0.05 })
    return {
      balls: new Pool(new SphereGeometry(BALL_R, 32, 20), M.chrome, 48),
      sphere: new Pool(new SphereGeometry(0.17, 24, 16), painted(0.32), 24),
      ring: new Pool(new TorusGeometry(0.16, 0.055, 12, 32), painted(0.35), 24),
      cube: new Pool(new BoxGeometry(0.26, 0.26, 0.26), painted(0.45), 24),
      prism: new Pool(new CylinderGeometry(0.2, 0.2, 0.15, 3), new MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.5 }), 24),
      card: new Pool(new BoxGeometry(0.46, 0.035, 0.3), painted(0.7), 40),
      coin: new Pool(new CylinderGeometry(0.15, 0.15, 0.06, 28), new MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.6 }), 24),
      capsule: new Pool(new CapsuleGeometry(0.085, 0.2, 6, 12), painted(0.3), 12),
      note: new Pool(new BoxGeometry(0.16, 0.16, 0.16), painted(0.6), 12),
      bead: new Pool(new SphereGeometry(0.1, 12, 8), new MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.4 }), 12, false),
    }
  }, [])
  const marker = useMemo(() => {
    const m = new InstancedMesh(new TorusGeometry(0.34, 0.035, 8, 40), M.yellow, 1)
    m.count = 0
    m.frustumCulled = false
    return m
  }, [])

  useFrame((st, dt) => {
    const w = feed.getWorld()
    machine.sync(w, Math.min(dt, 0.1))
    const d = Math.min(dt, 0.1) * feedRate()
    machine.update(d, w.packets)
    const follow = uiStore.get().follow
    machine.followState(follow)

    // balls
    for (const b of machine.balls.values()) {
      if (b.phase === 'gone') continue
      S.setScalar(b.scale)
      pools.balls.put(b.pos, Q.identity(), S, COL.white)
    }
    const fb = follow ? machine.balls.get(follow) : undefined
    if (fb) {
      P.copy(fb.pos).add(T.set(0, 0.5 + Math.sin(st.clock.elapsedTime * 5) * 0.04, 0))
      M4.compose(P, Q.setFromAxisAngle(X_AXIS, Math.PI / 2), ONE)
      marker.setMatrixAt(0, M4)
      marker.count = 1
      marker.instanceMatrix.needsUpdate = true
    } else marker.count = 0

    // packets in flight
    const time = st.clock.elapsedTime
    for (const p of w.packets) {
      if (p.kind === 'request') continue
      const curve = routeFor(p.from, p.to)
      const u = progress(p)
      if (p.kind === 'verdict') {
        verdictToken(pools, p.outcome ?? 'hold', curve, u, time)
        continue
      }
      if (p.kind === 'pushback') {
        curve.getPointAt(gravity(u), P)
        P.y -= 0.06
        Q.setFromEuler(E.set(u * 9, 0, u * 6))
        pools.note.put(P, Q, ONE, COL.ash)
        continue
      }
      if (p.kind === 'recheck') {
        curve.getPointAt(easeInOut(u), P)
        curve.getTangentAt(easeInOut(u), T)
        Q.setFromUnitVectors(UP, T)
        pools.capsule.put(P, Q, ONE, COL.cobalt)
        continue
      }
      if (p.kind === 'payment' || p.kind === 'charge' || p.kind === 'decision') {
        curve.getPointAt(easeInOut(u), P)
        Q.setFromEuler(E.set(Math.PI / 2, time * 3, 0))
        const c = p.kind === 'payment' ? COL.yellow : p.kind === 'charge' ? COL.steel : p.outcome === 'reject' ? COL.red : COL.yellow
        S.setScalar(p.kind === 'payment' ? 1.9 : 1)
        pools.coin.put(P, Q, S, c)
        continue
      }
      if (p.kind === 'hold') {
        curve.getPointAt(easeInOut(u), P)
        pools.prism.put(P, Q.identity(), ONE, COL.steel)
        continue
      }
      curve.getPointAt(easeInOut(u), P)
      curve.getTangentAt(easeInOut(u), T)
      yaw(T, Q)
      pools.card.put(P, Q, ONE, cardColor(p))
    }

    // verdict tokens that just landed in a tray
    for (const l of machine.landed) landedToken(pools, l)

    // signal beads from the ticker to the padlocks
    for (const bd of machine.beads) {
      bd.curve.getPointAt(easeInOut(bd.t), P)
      pools.bead.put(P, Q.identity(), ONE, bd.color)
    }

    for (const pool of Object.values(pools)) pool.flush()
  })

  return (
    <group>
      {Object.entries(pools).map(([k, p]) => (
        <primitive key={k} object={p.mesh} />
      ))}
      <primitive object={marker} />
    </group>
  )
}

type Pools = Record<'balls' | 'sphere' | 'ring' | 'cube' | 'prism' | 'card' | 'coin' | 'capsule' | 'note' | 'bead', Pool>

/** Four outcomes, four bodies, four ways of moving. */
function verdictToken(pools: Pools, outcome: Outcome, curve: Curve<Vector3>, u: number, time: number) {
  const L = curve.getLength()
  if (outcome === 'accept') {
    // a yellow ball: rolls smooth and quick
    const k = roll(u)
    curve.getPointAt(k, P)
    curve.getTangentAt(k, T)
    P.y -= 0.05
    Q.setFromAxisAngle(lateral(T), -(k * L) / 0.17)
    pools.sphere.put(P, Q, ONE, COL.yellow)
  } else if (outcome === 'refine') {
    // a cobalt hoop: rolls on its edge and wobbles
    const k = roll(u)
    curve.getPointAt(k, P)
    curve.getTangentAt(k, T)
    P.y -= 0.01
    yaw(T, Q)
    Q2.setFromEuler(E.set(0.14 * Math.sin(time * 9), 0, -(k * L) / 0.2))
    Q.multiply(Q2)
    pools.ring.put(P, Q, ONE, COL.cobalt)
  } else if (outcome === 'reject') {
    // a red cube: tumbles edge over edge, heavy
    const step = 0.26
    const s = u * L
    const n = Math.floor(s / step)
    const f = easeInOut(s / step - n)
    const k = Math.min(1, ((n + f) * step) / L)
    curve.getPointAt(k, P)
    curve.getTangentAt(k, T)
    P.y += -0.09 + 0.054 * Math.sin(Math.PI * f)
    yaw(T, Q)
    Q2.setFromAxisAngle(new Vector3(0, 0, 1), -(n + f) * (Math.PI / 2))
    Q.multiply(Q2)
    pools.cube.put(P, Q, ONE, COL.red)
  } else {
    // a black triangle: slides in ratchet steps, waiting between each
    const N = 7
    const n = Math.min(N - 1, Math.floor(u * N))
    const f = Math.min(1, (u * N - n) / 0.55)
    const k = (n + easeInOut(f)) / N
    curve.getPointAt(k, P)
    curve.getTangentAt(k, T)
    P.y -= 0.1
    yaw(T, Q)
    pools.prism.put(P, Q, ONE, COL.steel)
  }
}

function landedToken(pools: Pools, l: Landed) {
  const t = l.t
  const shrink = t > 3.1 ? Math.max(0, 1 - (t - 3.1) / 0.5) : 1
  S.setScalar(shrink)
  P.copy(l.pos)
  if (l.outcome === 'accept') {
    P.y += -0.05 + 0.3 * Math.abs(Math.sin(t * 9)) * Math.exp(-t * 3.2)
    pools.sphere.put(P, Q.identity(), S, COL.yellow)
  } else if (l.outcome === 'refine') {
    const lean = Math.pow(Math.min(1, t / 1.3), 2) * (Math.PI / 2)
    const spin = t * 16 * Math.max(0, 1 - t / 1.6)
    P.y += -0.01 - 0.12 * (lean / (Math.PI / 2))
    Q.setFromEuler(E.set(lean, spin, 0, 'YXZ'))
    pools.ring.put(P, Q, S, COL.cobalt)
  } else if (l.outcome === 'reject') {
    const sq = 0.24 * Math.exp(-t * 8) * Math.cos(t * 30)
    S.set(shrink * (1 + sq * 0.5), shrink * (1 - sq), shrink * (1 + sq * 0.5))
    P.y += -0.09 - sq * 0.03
    pools.cube.put(P, Q.identity(), S, COL.red)
  } else {
    P.y -= 0.1
    Q.setFromEuler(E.set(0, 0, 0.25 * Math.sin(t * 6) * Math.exp(-t * 2.2)))
    pools.prism.put(P, Q, S, COL.steel)
  }
}
