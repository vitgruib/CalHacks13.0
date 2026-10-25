// Scene-local memory for the plumbing, fed by the story's events. Times are
// feed time in seconds at the default 4x (one unit is a real second there), so
// moves pause and speed up with the story and stay in step with its events.
// Anything that must survive a mid-story mount (levels, freezes, holds) is
// read from the world every frame instead; events only add the moments.

import type { CurvePath, Vector3 } from 'three'
import { feed } from '../../feed'
import type { FlowEvent, Grant, Outcome } from '../../feed'
import { startGrants } from '../../feed/world'
import { DRAW, FROM_GM, OUT, TO_GM, gaugeFor } from './layout'

export const clock = () => feed.now() / 4000
/** This frame's step on that clock, written once a frame by tick(). */
export const frame = { t: 0, dt: 0 }
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

type After = 'wait' | 'gm' | 'gone'
export interface Blob {
  key: string
  rid: string
  gid: string
  path: CurvePath<Vector3>
  u0: number
  u1: number
  t0: number
  dur: number
  then: After
  rest: After | null // where it is once the move ends
  next?: { path: CurvePath<Vector3>; then: After } // the leg after this one
}

export interface Pour {
  gid: string
  amount: number
  t0: number
}

export interface Glow {
  color: string
  t: number
}

/** Liquid speed along a pipe, in world units per real second. */
const SPEED = 4.5
const durFor = (len: number) => 0.35 + len / SPEED

export const POUR_TRAVEL = 1.1 // capsules from NIH along the header and down into the vault
export const POUR_FALL = 1.4 // the vault glows and its bar rises

export const st = {
  blobs: new Map<string, Blob>(),
  run: { rid: '', at: new Float64Array(6).fill(-1), pass: new Int8Array(6).fill(-1), last: -99 },
  docked: new Map<string, number>(), // request id → when it reached the purchasing valve (checking)
  pours: [] as Pour[],
  glow: new Map<string, Glow>(), // agent id → last outcome tint on its rim
  valveTurn: 0, // target angle of the purchasing wheel
  gmTurn: 0,
  pumpKick: -99,
}

function clear() {
  st.blobs.clear()
  st.run = { rid: '', at: new Float64Array(6).fill(-1), pass: new Int8Array(6).fill(-1), last: -99 }
  st.docked.clear()
  st.pours.length = 0
  st.glow.clear()
}

export function uNow(b: Blob, t = clock()) {
  const k = b.dur <= 0 ? 1 : clamp01((t - b.t0) / b.dur)
  return b.u0 + (b.u1 - b.u0) * ease(k)
}

function move(b: Blob, path: CurvePath<Vector3>, u0: number, u1: number, then: After, t: number) {
  b.path = path
  b.u0 = u0
  b.u1 = u1
  b.t0 = t
  b.dur = durFor(path.getLength() * Math.abs(u1 - u0))
  b.then = then
  b.rest = null
  b.next = undefined
}

/** Start a leg now, or right after the one in progress so the pulse never jumps. */
function then(b: Blob, path: CurvePath<Vector3>, after: After, t: number) {
  if (t < b.t0 + b.dur && b.then !== 'gone') b.next = { path, then: after }
  else move(b, path, 0, 1, after, t)
}

function draw(rid: string, gid: string, t: number) {
  const key = `${rid}:${gid}`
  if (st.blobs.has(key) || !DRAW[gid]) return
  const b = { key, rid, gid } as Blob
  move(b, DRAW[gid], 0, 1, 'wait', t)
  st.blobs.set(key, b)
}

/** The valve shuts: the pulse runs back up into its tank (or, past the valve, simply ends). */
function drain(b: Blob, t: number) {
  if (b.path === DRAW[b.gid]) move(b, b.path, uNow(b, t), 0, 'gone', t)
  else move(b, b.path, uNow(b, t), Math.max(0, uNow(b, t) - 0.15), 'gone', t)
}

const blobsOf = (rid: string) => [...st.blobs.values()].filter(b => b.rid === rid)
const grantOf = (id: string): Grant | undefined => feed.getWorld().grants.find(g => g.id === id)
const glow = (id: string, color: string, t: number) => st.glow.set(id, { color, t })

export function onFlow(e: FlowEvent, GL: Record<Outcome, string>) {
  const t = clock()
  if (e.type === 'reset') return clear()

  if (e.type === 'request') {
    const r = e.request
    if (!r.outcome && r.verdicts.length) {
      // Checking starts: fresh gauges, and a draw from each grant it would charge (none from a frozen tank).
      st.run = { rid: r.id, at: new Float64Array(6).fill(-1), pass: new Int8Array(6).fill(-1), last: t }
      st.docked.set(r.id, t)
      const gids = r.split.length ? r.split.map(s => s.grantId) : [r.grantId]
      // A tank still being filled opens once the money has landed in it.
      for (const gid of gids) if (!grantOf(gid)?.frozen) draw(r.id, gid, Math.max(t, ...st.pours.filter(p => p.gid === gid).map(p => p.t0 + POUR_TRAVEL + 0.5)))
      return
    }
    if (!r.outcome) return
    if (r.outcome === 'reject' || (r.outcome === 'refine' && !r.chargedGrantId) || (r.outcome === 'hold' && r.holdFor === 'payment')) {
      for (const b of blobsOf(r.id)) drain(b, t)
      st.valveTurn -= Math.PI * 0.5
      glow('a:purchasing', GL[r.outcome], t)
    }
    if (r.state === 'waiting_on_manager') {
      // On through the bypass to the grant manager's shut valve.
      for (const b of blobsOf(r.id)) if (b.path !== TO_GM) then(b, TO_GM, 'gm', t)
      glow('a:purchasing', GL.hold, t)
    }
    if (r.state === 'bought' || r.state === 'rerouted') glow('a:purchasing', GL[r.outcome], t)
    return
  }

  if (e.type === 'rule') {
    const i = gaugeFor(e.verdict.rule)
    if (st.run.rid !== e.requestId) st.run = { rid: e.requestId, at: new Float64Array(6).fill(-1), pass: new Int8Array(6).fill(-1), last: t }
    st.run.at[i] = t
    st.run.pass[i] = e.verdict.pass ? 1 : 0
    st.run.last = t
    return
  }

  if (e.type === 'log' && e.row.action === 'act_on_request: reroute' && e.row.refId) {
    // Rerouted: the first draw runs back and the other grant's tank opens instead.
    const r = feed.getWorld().requests.find(q => q.id === e.row.refId)
    const other = r && feed.getWorld().grants.find(g => g.id !== r.grantId)
    if (!r || !other || st.blobs.has(`${r.id}:${other.id}`)) return
    const first = st.blobs.get(`${r.id}:${r.grantId}`)
    if (first) drain(first, t)
    draw(r.id, other.id, t + 0.35)
    return
  }

  if (e.type === 'packet') {
    const p = e.packet
    if (p.kind === 'charge' && p.refId) {
      const gid = p.from.slice(2)
      const key = `${p.refId}:${gid}`
      let b = st.blobs.get(key)
      if (!b) {
        b = { key, rid: p.refId, gid } as Blob
        st.blobs.set(key, b)
        move(b, OUT, 0, 0, 'wait', t)
      }
      // A pulse still arriving finishes its leg first.
      const start = Math.max(t, b.t0 + b.dur)
      then(b, b.path === TO_GM || b.next?.path === TO_GM ? FROM_GM : OUT, 'gone', t)
      st.valveTurn += Math.PI * 0.75
      st.pumpKick = start
      glow('a:payment_report', GL.accept, start + 0.9)
    }
    if (p.kind === 'payment_request' || p.kind === 'follow_up') glow('a:payment_report', '#7FD3E3', t)
    return
  }

  if (e.type === 'arrive') {
    const p = e.packet
    if ((p.kind === 'request' || p.kind === 'pushback') && p.refId) st.docked.set(p.refId, t)
    if (p.kind === 'reading' || p.kind === 'payment') {
      const tone = /terminated/.test(p.label) ? GL.reject : /restored|arrives/.test(p.label) ? GL.accept : '#A9C3DD'
      if (tone !== '#A9C3DD') glow('a:bookkeeping', tone, t)
    }
    if (p.kind === 'recheck' && p.to === 'a:bookkeeping') glow('a:bookkeeping', '#A9C3DD', t)
    return
  }

  if (e.type === 'grant' && e.event?.kind === 'payment_received') {
    st.pours.push({ gid: e.grant.id, amount: e.event.amount ?? 0, t0: t })
    return
  }

  if (e.type === 'invoice') return void glow('a:bookkeeping', e.matched ? GL.accept : GL.hold, t)
  if (e.type === 'paper') return void glow('a:payment_report', e.result === 'ok' ? GL.accept : e.result === 'note' ? GL.refine : GL.hold, t)

  if (e.type === 'hold') {
    if (e.hold.open) glow('p:grant_manager', GL.hold, t)
    else {
      st.gmTurn += e.hold.decision?.choice === 'approve' ? Math.PI : -Math.PI * 0.5
      glow('p:grant_manager', e.hold.decision?.choice === 'approve' ? GL.accept : GL.reject, t)
      if (e.hold.kind === 'purchase' && e.hold.decision?.choice === 'reject') for (const b of blobsOf(e.hold.refId)) drain(b, t)
    }
  }
}

/** Each frame: retire finished moves, and seed what a mid-story mount missed. */
export function tick(t: number) {
  frame.dt = Math.min(0.25, Math.max(0, t - frame.t))
  frame.t = t
  for (const [k, b] of st.blobs) {
    if (t < b.t0 + b.dur) continue
    if (b.next) move(b, b.next.path, 0, 1, b.next.then, t)
    else if (b.then === 'gone') st.blobs.delete(k)
    else b.rest = b.then
  }
  const w = feed.getWorld()
  for (const h of w.holds) {
    if (!h.open || h.kind !== 'purchase') continue
    const r = w.requests.find(q => q.id === h.refId)
    if (!r || blobsOf(r.id).length) continue
    const b = { key: `${r.id}:${r.grantId}`, rid: r.id, gid: r.grantId } as Blob
    move(b, TO_GM, 1, 1, 'gm', t - 1)
    st.blobs.set(b.key, b)
  }
  // Checking ends with the answer leaving; a held request keeps its place (drawn from the world).
  for (const [rid, at] of st.docked) {
    const r = w.requests.find(q => q.id === rid)
    if (!r || (r.outcome && t - at > 0.2) || t - at > 30) st.docked.delete(rid)
  }
  st.pours = st.pours.filter(p => t - p.t0 < POUR_TRAVEL + POUR_FALL + 0.6)
}

// ── Money levels ─────────────────────────────────────────────────────────

const START = new Map(startGrants().map(g => [g.id, g]))
const L0: Record<string, number> = { R01GM061721: 0.5, R21AI182745: 0.42 }
/** Dollars per full bar: not to scale with the award, so a single order shows. */
export const PER_TANK = 50000

/** The bar the books say: money in raises it, every order lowers it. */
export function bookLevel(g: Grant) {
  const s = START.get(g.id)
  if (!s) return 0.5
  const d = g.received - s.received - (g.spent + g.promised - s.spent - s.promised)
  return Math.min(0.96, Math.max(0.06, (L0[g.id] ?? 0.5) + d / PER_TANK))
}

/** How much of a landing payment hasn't reached the vault yet (in bar fractions). */
export function pending(gid: string, t: number) {
  let n = 0
  for (const p of st.pours) if (p.gid === gid) n += (p.amount / PER_TANK) * (1 - clamp01((t - p.t0 - POUR_TRAVEL) / POUR_FALL))
  return n
}
