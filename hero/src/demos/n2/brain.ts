// The choreography. Feed events never move anything directly: each one adds
// steps to a robot's queue, and the robots work through their queues at
// their own calm pace (a little faster when they fall behind), so nothing
// teleports even at 4x. A vault freezes or thaws when the bookkeeping robot
// delivers the news to it, not the instant the event lands.

import { Color, Vector3 } from 'three'
import { R01, R21, feed } from '../../feed'
import type { FlowEvent, Hold, Packet, World } from '../../feed'
import { GLAZE, PAL } from '../a1/layout'

export type V2 = [number, number]
type Face = V2 | number | (() => V2 | number | null)

// ── Where things are (x, z); the deck top is y = 0 ───────────────────────

export const DECK = { w: 15.6, d: 8.8 }
export const PORT = { mouth: [-7.75, 0.4] as V2, rest: [-6.75, 0.4] as V2, laneR: 1.25, stopX: -6.05 }
export const POSTS: V2[] = [0, 1, 2, 3, 4, 5].map(i => [-4.6 + i * 0.8, -1.4] as V2)
export const VAULT: Record<string, V2> = { [R01]: [2.3, -2.55], [R21]: [5.3, -2.55] }
export const GATE = { mouth: [3.8, -4.25] as V2, rest: [3.8, -3.45] as V2, restR: [4.3, -3.4] as V2, stop: [3.8, -2.75] as V2 }
export const DOCK = { mouth: [7.7, 1.3] as V2, rest: [7.0, 1.3] as V2, stop: [6.3, 1.3] as V2 }
export const DESK = { at: [-1.75, 2.75] as V2, top: 0.6, slots: [2.2, 2.75, 3.3], itemX: -1.5, stopX: -0.82 }
export const GM_AT: V2 = [-2.6, 2.75]

const SPEED = 4.2 // deck units per second
const TURN = 8 // radians per second, for the turn before a move

// ── Colours ──────────────────────────────────────────────────────────────

const C = (h: string) => new Color(h)
export const GL = { accept: C(GLAZE.accept), refine: C(GLAZE.refine), reject: C(GLAZE.reject), hold: C(GLAZE.hold) }
export const TONE = {
  parcel: C(PAL.parcel),
  paper: C('#F7F4EE'),
  invoice: C('#E9D7B6'),
  payreq: C('#CFE7EC'),
  question: C('#E3E7ED'),
  alarm: C('#F1D3CD'),
  court: C('#EFE5CB'),
  seal: C('#3A4451'),
}

// ── The clock: scene seconds, capped per frame like the feed's own clock ──

export const clock = { t: 0 }
const timers: { at: number; fn: () => void }[] = []
const later = (s: number, fn: () => void) => timers.push({ at: clock.t + s, fn })

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
const easeOut = (k: number) => 1 - (1 - k) ** 3
const sine = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * k)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const yawTo = (from: Vector3, to: V2) => Math.atan2(to[0] - from.x, to[1] - from.z)

// ── Things that travel: parcels, slips, money ────────────────────────────

export type Look = 'parcel' | 'slip' | 'money' | 'coin'
export interface Thing {
  id: string
  look: Look
  tone: Color
  tag: Color | null
  pos: Vector3
  yaw: number
  spin: number
  stand: boolean
  holder: Bot | null
  grab: { from: Vector3; t0: number } | null
  tw: { from: Vector3; to: Vector3; t0: number; dur: number; arc: number; then?: () => void } | null
  size: number
  goal: number
  at: string // port | gate | dock | desk | vault:<grant> | ice:<grant> | deck | bot | out
  slot: number
}

export const things = new Map<string, Thing>()
let uid = 0

function spawn(id: string, look: Look, tone: Color, at: V2 | Vector3, where: string, tag: Color | null = null): Thing {
  things.get(id) && (id = `${id}~${uid++}`)
  const pos = Array.isArray(at) ? new Vector3(at[0], restY(look), at[1]) : at.clone()
  const th: Thing = { id, look, tone: tone.clone(), tag: tag && tag.clone(), pos, yaw: 0.3, spin: 0, stand: false, holder: null, grab: null, tw: null, size: 0, goal: 1, at: where, slot: 0 }
  things.set(id, th)
  return th
}

export const restY = (look: Look) => (look === 'parcel' ? 0.17 : look === 'money' ? 0.2 : look === 'coin' ? 0.03 : 0.025)
const v3 = (p: V2, look: Look, y = 0) => new Vector3(p[0], restY(look) + y, p[1])

function travel(th: Thing, to: Vector3, dur: number, arc = 0, then?: () => void) {
  th.tw = { from: th.pos.clone(), to, t0: clock.t, dur, arc, then }
}

function fade(id: string) {
  const th = things.get(id)
  if (!th) return
  th.goal = 0
  if (th.holder) {
    if (th.holder.carry === th) th.holder.carry = null
    th.holder = null
  }
  th.at = 'out'
}

function tag(id: string, c: Color | null) {
  const th = things.get(id)
  if (th) th.tag = c && c.clone()
}

/** Things slide in from a mouth (the lab tube, the gate, the dock) and wait at a rest spot. */
function arrive(id: string, look: Look, tone: Color, mouth: V2, rest: V2, where: string, tagC: Color | null = null, dur = 1.5) {
  const th = spawn(id, look, tone, mouth, where, tagC)
  th.size = 0.2
  travel(th, v3(rest, look), dur)
  return th
}

// ── The robots ───────────────────────────────────────────────────────────

interface Step {
  job?: boolean // marks where one event's work begins, to count the backlog
  start?: () => void
  run: () => boolean
}

export class Bot {
  pos: Vector3
  yaw: number
  heading = 0
  moving = false
  face: number | null = null
  q: Step[] = []
  cur: Step | null = null
  carry: Thing | null = null
  t = 0
  speed = 0
  idle = 0
  ping = -9
  last = new Vector3()
  constructor(
    public id: 'p' | 'b' | 'r',
    public home: V2,
    public homeYaw: number,
    public hand: Vector3,
  ) {
    this.pos = new Vector3(home[0], 0, home[1])
    this.yaw = homeYaw
    this.last.copy(this.pos)
  }
  /** One event's work, as a single job. */
  add(...s: Step[]) {
    this.q.push({ job: true, run: () => true }, ...s)
  }
  handAt(out: Vector3) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw)
    return out.set(this.pos.x + this.hand.x * c + this.hand.z * s, this.hand.y, this.pos.z - this.hand.x * s + this.hand.z * c)
  }
}

export const P = new Bot('p', [-5.3, 0.55], Math.PI / 2, new Vector3(0, 0.74, 0.67))
export const B = new Bot('b', [3.8, -1.0], 0.15, new Vector3(0, 1.15, 0))
export const R = new Bot('r', [1.7, 2.65], -0.5, new Vector3(0, 0.96, 0.53))
export const BOTS = [P, B, R]

const act = (fn: () => void): Step => ({ run: () => (fn(), true) })
function wait(b: Bot, s: number): Step {
  let t0 = 0
  return { start: () => (t0 = b.t), run: () => b.t - t0 >= s }
}
function until(b: Bot, ok: () => boolean, max = 6): Step {
  let t0 = 0
  return { start: () => (t0 = b.t), run: () => ok() || b.t - t0 > max }
}

/** Turn toward the destination, then roll there on an eased curve; face something on arrival. */
function go(b: Bot, to: V2 | (() => V2 | null), face?: Face): Step {
  const from = new Vector3()
  const dest = new Vector3()
  let t0 = 0, turn = 0, dur = 0
  return {
    start: () => {
      const p = typeof to === 'function' ? to() : to
      from.copy(b.pos)
      dest.copy(b.pos)
      dur = 0
      t0 = b.t
      if (!p) return
      dest.set(p[0], 0, p[1])
      const d = from.distanceTo(dest)
      if (d < 0.03) return
      b.heading = Math.atan2(dest.x - from.x, dest.z - from.z)
      turn = Math.min(0.32, Math.abs(wrap(b.heading - b.yaw)) / TURN)
      dur = Math.max(0.45, d / SPEED)
      b.face = null
    },
    run: () => {
      const e = b.t - t0
      if (dur > 0 && e < turn) {
        b.face = b.heading
        return false
      }
      const k = dur <= 0 ? 1 : Math.min(1, (e - turn) / dur)
      b.moving = k < 1 && dur > 0
      b.pos.lerpVectors(from, dest, ease(k))
      if (k < 1) return false
      const f = typeof face === 'function' ? face() : face
      b.face = f === undefined || f === null ? null : typeof f === 'number' ? f : yawTo(b.pos, f)
      b.moving = false
      return true
    },
  }
}

/** The rule run: roll along the row of posts in one calm glide; each post lights as the tray reaches it. */
function cruise(b: Bot, n: number, light: (i: number) => void): Step {
  let t0 = 0, x0 = 0, x1 = 0, dur = 0, lit = 0
  return {
    start: () => {
      t0 = b.t
      x0 = b.pos.x
      x1 = POSTS[n - 1][0] + 0.5
      dur = 0.4 * n + 0.5
      lit = 0
      b.heading = Math.PI / 2
    },
    run: () => {
      const k = Math.min(1, (b.t - t0) / dur)
      b.moving = k < 1
      b.pos.x = x0 + (x1 - x0) * sine(k)
      while (lit < n && b.pos.x >= POSTS[lit][0] - 0.35) light(lit++)
      if (k < 1) return false
      b.face = Math.PI / 2
      return true
    },
  }
}

function hold(b: Bot, th: Thing) {
  if (b.carry && b.carry !== th) setDown(b)
  th.grab = { from: th.pos.clone(), t0: clock.t }
  th.holder = b
  th.tw = null
  th.stand = false
  th.at = 'bot'
  b.carry = th
  const i = gateQ.indexOf(th)
  if (i >= 0) gateQ.splice(i, 1)
}

/** Something else in hand: set it down beside the robot, to be fetched when its answer comes. */
function setDown(b: Bot) {
  const th = b.carry
  if (!th) return
  b.carry = null
  th.holder = null
  const s = Math.sin(b.yaw + Math.PI / 2), c = Math.cos(b.yaw + Math.PI / 2)
  travel(th, new Vector3(b.pos.x + s * 0.62, restY(th.look), b.pos.z + c * 0.62), 0.45, 0.3)
  th.at = 'deck'
}

function stopFor(b: Bot, th: Thing): V2 {
  if (th.at === 'port') return [PORT.stopX, th.pos.z]
  if (th.at === 'desk') return [DESK.stopX, th.pos.z]
  if (th.at.startsWith('vault:') || th.at.startsWith('ice:')) return [th.pos.x, -1.05]
  if (th.at === 'gate') return [th.pos.x, GATE.stop[1]]
  if (th.at === 'dock') return DOCK.stop
  const d = new Vector3(b.pos.x - th.pos.x, 0, b.pos.z - th.pos.z)
  if (d.lengthSq() < 1e-4) d.set(0, 0, 1)
  d.normalize().multiplyScalar(0.66)
  return [th.pos.x + d.x, th.pos.z + d.z]
}

/** Go to a thing wherever it rests and pick it up; if it doesn't exist (mounted mid-story), it appears in hand. */
function fetch(b: Bot, id: string, make?: () => Thing): Step[] {
  return [
    until(b, () => {
      const th = things.get(id)
      return !th || !th.tw
    }, 4),
    go(
      b,
      () => {
        const th = things.get(id)
        return !th || th.holder === b ? null : stopFor(b, th)
      },
      () => {
        const th = things.get(id)
        return th && th.holder !== b ? [th.pos.x, th.pos.z] : null
      },
    ),
    act(() => {
      let th = things.get(id)
      if (th && th.holder === b) return
      if (!th) {
        th = make ? make() : spawn(id, 'parcel', TONE.parcel, b.handAt(new Vector3()), 'bot')
        th.pos.copy(b.handAt(new Vector3()))
      }
      if (th.holder && th.holder !== b) th.holder.carry = null
      hold(b, th)
    }),
    wait(b, 0.15),
  ]
}

/** Put what's in hand at a resting place. */
function put(b: Bot, where: () => { pos: Vector3; at: string; slot?: number; stand?: boolean }): Step[] {
  return [
    act(() => {
      const th = b.carry
      if (!th) return
      const w = where()
      b.carry = null
      th.holder = null
      th.at = w.at
      th.slot = w.slot ?? 0
      th.stand = !!w.stand
      travel(th, w.pos, 0.45, 0.35)
    }),
    wait(b, 0.3),
  ]
}

/** Push what's in hand out through a mouth; it shrinks away there. */
function sendOut(b: Bot, mouth: V2): Step[] {
  return [
    act(() => {
      const th = b.carry
      if (!th) return
      b.carry = null
      th.holder = null
      th.at = 'out'
      travel(th, v3(mouth, th.look), 1.3, 0.05, () => (th.goal = 0))
    }),
    wait(b, 0.35),
  ]
}

// Parking slots: the front of each vault, and the grant manager's desk.
const taken = new Map<string, string>()
function slotIn(place: string, n: number, id: string) {
  for (const [k, v] of taken) if (v === id) taken.delete(k)
  for (let i = 0; i < n; i++) {
    const k = `${place}#${i}`
    const occupant = taken.get(k)
    const th = occupant ? things.get(occupant) : undefined
    if (!th || th.goal === 0 || (th.at !== place && th.at !== 'bot')) {
      taken.set(k, id)
      return i
    }
  }
  return n - 1
}
const vaultPark = (gid: string, i: number) => {
  const v = VAULT[gid] ?? VAULT[R01]
  return new Vector3(v[0] - 0.46 + 0.46 * (i % 3), restY('parcel'), v[1] + 1.02)
}
const deskPark = (i: number, look: Look) => new Vector3(DESK.itemX, DESK.top + restY(look), DESK.slots[i % 3])
const vaultStop = (gid: string): V2 => [(VAULT[gid] ?? VAULT[R01])[0], -1.05]
const deskStop = (i: number): V2 => [DESK.stopX, DESK.slots[i % 3]]

function toDesk(b: Bot): Step[] {
  let slot = 0
  return [
    go(b, () => {
      slot = slotIn('desk', 3, b.carry?.id ?? '')
      return deskStop(slot)
    }, -Math.PI / 2),
    ...put(b, () => ({ pos: deskPark(slot, b.carry?.look ?? 'slip'), at: 'desk', slot })),
  ]
}

function toVault(b: Bot, gid: string): Step[] {
  let slot = 0
  return [
    go(b, () => {
      slot = slotIn(`vault:${gid}`, 3, b.carry?.id ?? '')
      const p = vaultPark(gid, slot)
      return [p.x, -1.05]
    }, Math.PI),
    ...put(b, () => ({ pos: vaultPark(gid, slot), at: `vault:${gid}`, slot })),
  ]
}

// ── What the scenery shows ───────────────────────────────────────────────

export const posts = POSTS.map(() => ({ state: 0, at: -9 })) // 0 idle, 1 pass, 2 fail
export const vaults: Record<string, { frozen: boolean; level: number; pulse: number; check: number }> = {
  [R01]: { frozen: false, level: 0.75, pulse: -9, check: -9 },
  [R21]: { frozen: false, level: 0.48, pulse: -9, check: -9 },
}
export const gm = { nod: -9 }
const gateQ: Thing[] = []

const grantOf = (gid: string, w: World = feed.getWorld()) => w.grants.find(g => g.id === gid)
function showGrant(gid: string, frozenToo = true) {
  const g = grantOf(gid)
  const v = vaults[gid]
  if (!g || !v) return
  v.level = Math.max(0.08, Math.min(1, g.available / g.awarded))
  if (frozenToo) {
    if (v.frozen && !g.frozen) for (const th of things.values()) if (th.at === `ice:${gid}`) fade(th.id)
    v.frozen = g.frozen
  }
}
const gidIn = (label: string, fallback: string) => (/mitochondria/i.test(label) ? R01 : /antibiotic/i.test(label) ? R21 : fallback)

// ── Feed events → robot steps ────────────────────────────────────────────

const reqOf = (id: string) => feed.getWorld().requests.find(r => r.id === id)

function onPacket(p: Packet) {
  const id = p.refId ?? p.id
  switch (p.kind) {
    case 'request':
      arrive(id, 'parcel', TONE.parcel, PORT.mouth, PORT.rest, 'port', null, 1.6)
      break
    case 'pushback':
      arrive(`pb:${id}`, 'slip', TONE.paper, PORT.mouth, [PORT.rest[0], PORT.rest[1] - 0.55], 'port', TONE.seal, 1.4)
      break
    case 'paper': {
      arrive(id, 'slip', TONE.paper, [PORT.mouth[0], PORT.laneR], [PORT.rest[0], PORT.laneR], 'port', null, 1.6)
      R.add(...fetch(R, id), go(R, R.home, R.homeYaw))
      break
    }
    case 'verdict': {
      if (p.from !== 'a:purchasing' || !p.outcome) break
      const o = p.outcome
      const gid = reqOf(id)?.grantId ?? R01
      const then =
        o === 'hold' && p.holdFor === 'payment' ? toVault(P, gid)
        : o === 'hold' ? toDesk(P)
        : [go(P, [PORT.stopX, PORT.rest[1]], -Math.PI / 2), ...sendOut(P, PORT.mouth)]
      P.add(...fetch(P, id), act(() => tag(id, GL[o])), ...then)
      break
    }
    case 'reading':
      // A request's last check before money moves: the bookkeeping robot looks at that grant's vault.
      if (p.refId && p.from === 's:reporter') {
        const gid = gidIn(p.label, reqOf(p.refId)?.grantId ?? R01)
        B.add(go(B, vaultStop(gid), VAULT[gid]), act(() => ((vaults[gid].check = clock.t), (B.ping = clock.t))), wait(B, 0.45))
      } else if (/terminated|restored|changed/.test(p.label)) {
        const bad = /terminated/.test(p.label)
        gateQ.push(arrive(`gate:${p.id}`, 'slip', bad ? TONE.alarm : TONE.court, GATE.mouth, GATE.rest, 'gate', bad ? GL.reject : TONE.seal, 1.7))
      }
      break
    case 'payment':
      gateQ.push(arrive(`gate:${p.id}`, 'money', TONE.paper, GATE.mouth, GATE.rest, 'gate', null, 1.8))
      break
    case 'charge': {
      // Money leaves a vault for the vendors: a coin rolls across the deck to the dock.
      const gid = p.from.slice(2)
      const v = VAULT[gid]
      if (!v) break
      const coin = spawn(`coin:${p.id}`, 'coin', TONE.paper, [v[0] + 0.5, v[1] + 0.7], 'out')
      later(0.1, () => travel(coin, v3(DOCK.mouth, 'coin'), 2.2, 0.6, () => (coin.goal = 0)))
      break
    }
    case 'invoice':
      arrive(id, 'slip', TONE.invoice, DOCK.mouth, DOCK.rest, 'dock', null, 1.6)
      B.add(...fetch(B, id), go(B, B.home, B.homeYaw), wait(B, 0.3))
      break
    case 'hold': {
      if (p.from === 'a:purchasing') break // the purchasing verdict carries the parcel to the desk
      const b = p.from === 'a:bookkeeping' ? B : R
      const make = () => spawn(id, 'slip', b === R ? TONE.payreq : TONE.paper, b.handAt(new Vector3()), 'bot')
      b.add(...fetch(b, id, make), act(() => tag(id, GL.hold)), ...toDesk(b))
      break
    }
    case 'payment_request': {
      const fu = `fu:${id}`
      const tid = things.has(fu) ? fu : id
      R.add(
        ...fetch(R, tid, () => spawn(tid, 'slip', TONE.payreq, R.handAt(new Vector3()), 'bot')),
        act(() => tag(tid, null)),
        go(R, GATE.stop, Math.PI),
        ...sendOut(R, GATE.mouth),
      )
      break
    }
    case 'follow_up': {
      const fu = `fu:${id}`
      arrive(fu, 'slip', TONE.question, GATE.mouth, GATE.restR, 'gate', null, 1.6)
      R.add(
        ...fetch(R, fu),
        go(R, R.home, R.homeYaw),
        wait(R, 0.5),
        act(() => {
          const th = things.get(fu)
          if (th) th.tone.copy(TONE.payreq)
          R.ping = clock.t
        }),
      )
      break
    }
  }
}

function onHoldClosed(h: Hold) {
  const th = things.get(h.refId)
  if (!th || !h.decision) return
  const ok = h.decision.choice === 'approve'
  gm.nod = clock.t
  later(0.25, () => tag(th.id, ok ? GL.accept : GL.reject))
  if (h.kind === 'purchase') return // the verdict that follows sends it on
  if (h.kind === 'invoice' && !ok) {
    B.add(wait(B, 0.5), ...fetch(B, th.id), go(B, DOCK.stop, Math.PI / 2), ...sendOut(B, DOCK.mouth))
    return
  }
  if (h.kind === 'payment_request' && ok) return // the payment & report robot takes it to the funder
  later(1.6, () => fade(th.id))
}

export function onEvent(e: FlowEvent) {
  switch (e.type) {
    case 'reset':
      clear()
      sync(feed.getWorld())
      return
    case 'packet':
      onPacket(e.packet)
      return
    case 'request': {
      const r = e.request
      if (r.outcome || !r.verdicts.length) return
      // The rules start: fetch the parcel (and read any pushback note), then roll past the six posts.
      const note = `pb:${r.id}`
      const read = things.has(note) ? [...fetch(P, note), act(() => ((P.ping = clock.t), fade(note))), wait(P, 0.3)] : []
      const n = Math.min(POSTS.length, r.verdicts.length)
      const tour = [
        go(P, [POSTS[0][0] - 0.75, -0.5], Math.PI / 2),
        cruise(P, n, i => {
          posts[i].state = r.verdicts[i].pass ? 1 : 2
          posts[i].at = clock.t
        }),
        wait(P, 0.2),
      ]
      P.add(
        ...read,
        // Parked by a vault the world has thawed? Wait until the money has visibly arrived.
        until(P, () => {
          const at = things.get(r.id)?.at ?? ''
          const gid = at.startsWith('vault:') ? at.slice(6) : ''
          return !gid || !!grantOf(gid)?.frozen || !vaults[gid].frozen
        }, 8),
        ...fetch(P, r.id),
        act(() => {
          for (const s of posts) s.state = 0
        }),
        ...tour,
      )
      return
    }
    case 'grant': {
      const gid = e.grant.id
      if (!e.event) {
        showGrant(gid, false)
        return
      }
      // News for a vault comes in through the gate; the bookkeeping robot carries it over.
      const kind = e.event.kind
      B.add(
        go(B, GATE.stop, Math.PI),
        until(B, () => gateQ.length > 0 && !gateQ[0].tw, 3),
        act(() => {
          const th = gateQ[0] ?? spawn(`gate:${uid++}`, kind === 'payment_received' ? 'money' : 'slip', kind === 'canceled' ? TONE.alarm : TONE.court, B.handAt(new Vector3()), 'gate')
          hold(B, th)
        }),
        wait(B, 0.2),
        go(B, vaultStop(gid), VAULT[gid]),
        act(() => {
          const th = B.carry
          B.carry = null
          const v = VAULT[gid]
          if (th) {
            th.holder = null
            const still = grantOf(gid)?.frozen
            if (kind === 'court_order' && still) {
              // A court order isn't cash: the notice sticks to the ice and the vault stays frozen.
              th.stand = true
              th.at = `ice:${gid}`
              travel(th, new Vector3(v[0], 0.95, v[1] + 0.72), 0.6, 0.3)
            } else {
              th.at = 'out'
              travel(th, new Vector3(v[0], 1.45, v[1]), 0.65, 0.5, () => (th.goal = 0))
            }
          }
          later(0.55, () => {
            vaults[gid].pulse = clock.t
            showGrant(gid)
          })
        }),
        wait(B, 0.7),
      )
      return
    }
    case 'paper': {
      const id = e.paperId
      const file = e.result !== 'held' ? [wait(R, 0.9), act(() => fade(id))] : []
      R.add(act(() => ((R.ping = clock.t), tag(id, e.result === 'ok' ? GL.accept : e.result === 'note' ? GL.refine : GL.hold))), ...file)
      return
    }
    case 'invoice': {
      const id = e.invoiceId
      const file = e.matched ? [wait(B, 0.8), act(() => fade(id))] : []
      B.add(act(() => ((B.ping = clock.t), tag(id, e.matched ? GL.accept : GL.hold))), ...file)
      return
    }
    case 'hold':
      if (!e.hold.open) onHoldClosed(e.hold)
      return
  }
}

// ── Mounting mid-story, and restarts ─────────────────────────────────────

export function clear() {
  things.clear()
  taken.clear()
  gateQ.length = 0
  timers.length = 0
  for (const b of BOTS) {
    b.q.length = 0
    b.cur = null
    b.carry = null
    b.moving = false
    b.face = null
    b.pos.set(b.home[0], 0, b.home[1])
    b.yaw = b.homeYaw
  }
  for (const s of posts) s.state = 0
}

/** Put on the deck whatever the world says is waiting right now. */
export function sync(w: World) {
  for (const gid of [R01, R21]) {
    const g = grantOf(gid, w)
    if (!g) continue
    vaults[gid].frozen = g.frozen
    vaults[gid].level = Math.max(0.08, Math.min(1, g.available / g.awarded))
    if (g.frozen && g.status === 'restored_by_court') {
      const v = VAULT[gid]
      const th = spawn(`court:${gid}`, 'slip', TONE.court, new Vector3(v[0], 0.95, v[1] + 0.72), `ice:${gid}`, TONE.seal)
      th.stand = true
    }
  }
  for (const r of [...w.requests].reverse()) {
    if (r.outcome === 'hold' && r.holdFor === 'payment' && r.state === 'submitted') {
      const slot = slotIn(`vault:${r.grantId}`, 3, r.id)
      const th = spawn(r.id, 'parcel', TONE.parcel, vaultPark(r.grantId, slot), `vault:${r.grantId}`, GL.hold)
      th.slot = slot
    } else if (r.state === 'waiting_on_manager') {
      const slot = slotIn('desk', 3, r.id)
      spawn(r.id, 'parcel', TONE.parcel, deskPark(slot, 'parcel'), 'desk', GL.hold).slot = slot
    }
  }
  for (const h of w.holds) {
    if (!h.open || h.kind === 'purchase') continue
    const slot = slotIn('desk', 3, h.refId)
    spawn(h.refId, 'slip', h.kind === 'payment_request' ? TONE.payreq : h.kind === 'invoice' ? TONE.invoice : TONE.paper, deskPark(slot, 'slip'), 'desk', GL.hold).slot = slot
  }
  for (const p of w.packets) if (p.kind === 'request' && p.refId) arrive(p.refId, 'parcel', TONE.parcel, PORT.mouth, PORT.rest, 'port', null, 1.2)
}

// ── The frame ────────────────────────────────────────────────────────────

const tmp = new Vector3()

function stepBot(b: Bot, dt: number) {
  // Behind on work (more events queued after this one)? Hurry a little, never frantic.
  let jobs = 0
  for (const s of b.q) if (s.job) jobs++
  const hurry = 1 + Math.min(1.3, jobs * 0.45)
  b.t += dt * hurry
  for (let guard = 0; guard < 24; guard++) {
    if (!b.cur) {
      b.cur = b.q.shift() ?? null
      if (!b.cur) break
      b.cur.start?.()
    }
    if (!b.cur.run()) break
    b.cur = null
  }
  if (!b.cur && !b.q.length) {
    b.idle += dt
    const away = Math.hypot(b.pos.x - b.home[0], b.pos.z - b.home[1]) > 0.05
    if (b.idle > 0.9 && away) b.add(go(b, b.home, b.homeYaw))
    else if (b.idle > 1.6 && !away) b.face = b.homeYaw
  } else b.idle = 0
  const target = b.moving ? b.heading : (b.face ?? b.yaw)
  b.yaw += wrap(target - b.yaw) * (1 - Math.exp(-dt * 10))
  const v = dt > 0 ? b.pos.distanceTo(b.last) / dt : 0
  b.speed += (v - b.speed) * (1 - Math.exp(-dt * 8))
  b.last.copy(b.pos)
}

function stepThing(th: Thing, dt: number) {
  th.size += (th.goal - th.size) * (1 - Math.exp(-dt * (th.goal ? 6 : 9)))
  if (th.holder) {
    th.holder.handAt(tmp)
    if (th.grab) {
      const k = Math.min(1, (clock.t - th.grab.t0) / 0.32)
      th.pos.lerpVectors(th.grab.from, tmp, easeOut(k))
      th.pos.y += Math.sin(Math.PI * k) * 0.22
      if (k >= 1) th.grab = null
    } else th.pos.copy(tmp)
    th.yaw += wrap(th.holder.yaw - th.yaw) * (1 - Math.exp(-dt * 12))
  } else if (th.tw) {
    const w = th.tw
    const k = Math.min(1, (clock.t - w.t0) / w.dur)
    th.pos.lerpVectors(w.from, w.to, ease(k))
    th.pos.y += Math.sin(Math.PI * k) * w.arc
    if (th.look === 'money' || th.look === 'coin') th.spin += dt * 7
    if (k >= 1) {
      th.tw = null
      w.then?.()
    }
  }
  if (th.goal === 0 && th.size < 0.02) {
    things.delete(th.id)
    for (const [k, v] of taken) if (v === th.id) taken.delete(k)
  }
}

export function update(dt: number) {
  clock.t += dt
  for (let i = timers.length - 1; i >= 0; i--)
    if (timers[i].at <= clock.t) {
      const [t] = timers.splice(i, 1)
      t.fn()
    }
  for (const b of BOTS) stepBot(b, dt)
  for (const th of things.values()) stepThing(th, dt)
}
