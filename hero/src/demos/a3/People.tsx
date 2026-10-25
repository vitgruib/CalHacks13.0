// The people. Five researchers walk the aisles between the stations their
// feed task puts them at and work there: pipetting, swirling a flask,
// typing, leaning into eyepieces, reaching into the cabinet, logging the
// freezer, writing on the whiteboard, carrying boxes. When one sends a
// request they stop and hold the thing up before it leaves. The grant
// manager stands at the round table.

import { memo, useEffect, useMemo } from 'react'
import { Vector3 } from 'three'
import { feed, useFlow } from '../../feed'
import { body, crowd, legsFor, plan, pointAt, settled, walked, type Seg } from './crowd'
import { Figure, newDrive } from './Figure'
import { GM_POS, TABLE } from './layout'
import { Pick } from './Parts'
import { now, reducedMotion } from './store'

const SHOW_MS = 1150 // stop, take it out, hold it up, let it go
const REACT_MS = 800
export const RECEIVE_MS = 1500 // an answer that comes home is held up this long

interface Mind {
  segs: Seg[]
  pauses: [number, number][] // the plan clock stops while they send something
  react: { kind: string; at: number } | null
  pos: Vector3
  yaw: number
  phase: number
  walk: number
  sit: number
  dist: number // distance walked in the current segment
  offset: number
  glanceAt: number
  glanceTo: string | null
}

const minds = new Map<string, Mind>()
const tmp = new Vector3()
const from = new Vector3()
const TABLE_V = new Vector3(TABLE[0], 0, TABLE[2])
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const damp = (a: number, b: number, k: number) => a + (b - a) * k
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

function planClock(m: Mind, t: number) {
  let c = t
  for (const [a, b] of m.pauses) if (t > a) c -= Math.min(t, b) - a
  return c
}

function segAt(m: Mind, c: number) {
  for (const s of m.segs) if (c < s.t1) return s
  return m.segs[m.segs.length - 1]
}

function freshMind(id: string, task: string): Mind {
  const segs = settled(legsFor(id, task))
  const sp = segs[0].spot
  return { segs, pauses: [], react: null, pos: new Vector3(sp.x, 0, sp.z), yaw: sp.yaw, phase: 0, walk: 0, sit: sp.sit ? 1 : 0, dist: 0, offset: 0, glanceAt: 0, glanceTo: null }
}

function mindOf(id: string) {
  let m = minds.get(id)
  if (!m) {
    m = freshMind(id, feed.getWorld().researchers.find(r => r.id === id)?.task ?? '')
    minds.set(id, m)
  }
  return m
}

// Where the plan puts someone at plan time `c`. A feed jump runs many events with no
// frame between them, so a new plan starts from here, not from the last drawn position.
function whereAt(m: Mind, c: number) {
  const s = segAt(m, c)
  if (s.kind === 'walk' && s.path) pointAt(s.path, walked(c - s.t0, s.t1 - s.t0, s.path.len), from)
  else from.set(s.spot.x, 0, s.spot.z)
  return { s, seated: !!s.spot.sit && s.kind !== 'walk' }
}

function replan(id: string, task: string) {
  const m = mindOf(id)
  const c = planClock(m, now())
  const { s, seated } = whereAt(m, c)
  m.segs = plan(legsFor(id, task), from.x, from.z, seated, s.kind === 'walk' ? null : s.spot, c)
}


/** Stop the plan clock for `ms` while they hold something up. */
function pause(id: string, ms: number) {
  const m = mindOf(id)
  const t = now()
  const last = m.pauses[m.pauses.length - 1]
  if (last && t < last[1]) last[1] = Math.max(last[1], t + ms)
  else m.pauses.push([t, t + ms])
  if (m.pauses.length > 12) {
    // Fold the oldest pause into the plan so the list stays short.
    const [a, z] = m.pauses.shift()!
    for (const s of m.segs) {
      s.t0 += z - a
      s.t1 += z - a
    }
  }
}

function Researcher({ id }: { id: string }) {
  const still = useMemo(reducedMotion, [])
  const b = useMemo(() => body(id), [id])
  const drive = useMemo(() => {
    const d = newDrive()
    const reactObj = { kind: '', k: 0 }
    return (dt: number) => {
      const m = mindOf(id)
      const t = now()
      const c = planClock(m, t)
      const s = segAt(m, c)
      const sp = s.spot
      let walking = false
      let yawGoal = sp.yaw
      d.act = s.leg.act
      d.prop = s.leg.prop ?? null
      d.carry = null
      d.u = 0
      if (s.kind === 'walk' && s.path) {
        const total = s.t1 - s.t0
        const dist = walked(c - s.t0, total, s.path.len)
        if (still) {
          // Reduced motion: nobody walks. They appear at the next station.
          m.pos.set(sp.x, 0, sp.z)
        } else {
          pointAt(s.path, dist, m.pos)
          pointAt(s.path, Math.min(s.path.len, dist + 0.35), tmp)
          tmp.sub(m.pos)
          if (tmp.lengthSq() > 1e-5) yawGoal = Math.atan2(tmp.x, tmp.z)
          m.phase += (Math.max(0, dist - m.dist) / 0.62) * Math.PI
          walking = c - s.t0 < total - 60
        }
        m.dist = dist
        d.act = 'idle'
        d.prop = s.leg.prop === 'clipboard' ? 'clipboard' : null
        d.carry = s.leg.carry ?? null
      } else {
        m.dist = 0
        m.pos.set(sp.x, 0, sp.z)
        if (s.kind === 'act' && Number.isFinite(s.t1)) d.u = clamp01((c - s.t0) / (s.t1 - s.t0))
        if (s.kind === 'act' && s.leg.holds) d.carry = s.leg.act === 'pick' ? (d.u > 0.55 ? s.leg.holds : null) : d.u < 0.6 ? s.leg.holds : null
        if (s.kind !== 'act') d.act = 'idle'
      }
      const sitGoal = sp.sit ? (s.kind === 'act' ? 1 : s.kind === 'sit' ? clamp01((c - s.t0) / (s.t1 - s.t0)) : s.kind === 'stand' ? 1 - clamp01((c - s.t0) / (s.t1 - s.t0)) : 0) : 0
      m.sit = still ? (sitGoal > 0.5 ? 1 : 0) : sitGoal

      // Sending: they stop, take the thing out and hold it up toward the table.
      let show = 0
      for (const [a, e] of m.pauses) if (t >= a && t < e) show = Math.sin(Math.PI * Math.min(1, ((t - a) / (e - a)) * 1.25)) ** 0.5
      b.showing = show > 0.2
      if (show > 0) {
        tmp.subVectors(TABLE_V, m.pos)
        yawGoal = sp.yaw + wrap(Math.atan2(tmp.x, tmp.z) - sp.yaw) * 0.55
        walking = false
      }

      // A short reaction when an answer comes home.
      let react: { kind: string; k: number } | null = null
      if (m.react) {
        const k = (t - m.react.at) / REACT_MS
        if (k >= 0 && k < 1) {
          reactObj.kind = m.react.kind
          reactObj.k = k
          react = reactObj
        }
      }

      // Now and then a glance at the nearest colleague.
      let look: number | null = null
      if (!still && !walking) {
        if (t > m.glanceAt) {
          m.glanceAt = t + 7000 + ((id.charCodeAt(0) * 977) % 6000)
          let best: string | null = null
          let bd = 3.2
          for (const [oid, ob] of crowd) {
            if (oid === id || oid === 'gm') continue
            const dd = ob.pos.distanceTo(m.pos)
            if (dd < bd) {
              bd = dd
              best = oid
            }
          }
          m.glanceTo = best
        }
        const left = m.glanceAt - t
        if (m.glanceTo && left > 7000 - 1800 && left < 7000 + 3000) {
          const ob = crowd.get(m.glanceTo)
          if (ob) {
            tmp.subVectors(ob.pos, m.pos)
            const rel = wrap(Math.atan2(tmp.x, tmp.z) - m.yaw)
            if (Math.abs(rel) < 1.6) look = Math.max(-0.95, Math.min(0.95, rel))
          }
        }
      }

      // Passing politely: a step to one side when someone is close ahead.
      let off = 0
      if (walking) {
        const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw)
        for (const [oid, ob] of crowd) {
          if (oid === id || oid === 'gm') continue
          const dx = ob.pos.x - m.pos.x, dz = ob.pos.z - m.pos.z
          const dd = Math.hypot(dx, dz)
          if (dd > 1.1 || dd < 1e-4) continue
          const ahead = (dx * fx + dz * fz) / dd
          if (ahead < -0.2) continue
          const side = dx * fz - dz * fx // > 0: they're on our left
          off += (side >= 0 ? 1 : -1) * 0.3 * (1 - dd / 1.1) * (0.5 + 0.5 * ahead) * (ob.walking ? 1 : 1.3)
        }
      }
      m.offset = damp(m.offset, Math.max(-0.32, Math.min(0.32, off)), 1 - Math.exp(-dt * 4))

      m.walk = damp(m.walk, walking ? 1 : 0, 1 - Math.exp(-dt * (walking ? 8 : 6)))
      if (!walking && m.walk < 0.05) m.phase = Math.round(m.phase / Math.PI) * Math.PI
      m.yaw += wrap(yawGoal - m.yaw) * (still ? 1 : 1 - Math.exp(-dt * (walking ? 7 : 5)))

      d.pos.copy(m.pos)
      d.yaw = m.yaw
      d.walk = still ? 0 : m.walk
      d.phase = m.phase
      d.sit = m.sit
      d.show = show
      d.react = react
      d.look = look
      d.offset = still ? 0 : m.offset
      return d
    }
  }, [id, still, b])

  return (
    <Pick id={`r:${id}`}>
      <Figure id={id} drive={drive} b={b} />
    </Pick>
  )
}

/** All five researchers, the grant manager, and the pauses and reactions feed events cause. */
export const People = memo(function People() {
  const ids = useMemo(() => feed.getWorld().researchers.map(r => r.id), [])
  useEffect(() => () => minds.clear(), [])
  useFlow(e => {
    if (e.type === 'reset') {
      // The fresh world holds everyone's first task: start from there.
      minds.clear()
      for (const r of feed.getWorld().researchers) minds.set(r.id, freshMind(r.id, r.task))
      return
    }
    if (e.type === 'task') replan(e.researcherId, e.task)
    else if (e.type === 'packet' && e.packet.from.startsWith('r:') && (e.packet.kind === 'request' || e.packet.kind === 'pushback' || e.packet.kind === 'paper')) {
      pause(e.packet.from.slice(2), e.packet.kind === 'paper' ? 800 : SHOW_MS)
    } else if (e.type === 'arrive' && e.packet.kind === 'verdict' && e.packet.to.startsWith('r:') && e.packet.outcome) {
      const id = e.packet.to.slice(2)
      mindOf(id).react = { kind: e.packet.outcome, at: now() }
      // A delivered or sent-back item comes home into their hands: they stop and hold it up.
      if (e.packet.outcome === 'accept' || e.packet.outcome === 'refine') pause(id, RECEIVE_MS)
    }
  })
  return (
    <group>
      {ids.map(id => (
        <Researcher key={id} id={id} />
      ))}
      <GrantManager />
    </group>
  )
})

// ── The grant manager, at the round table ────────────────────────────────

function GrantManager() {
  const b = useMemo(() => body('gm'), [])
  const drive = useMemo(() => {
    const d = newDrive()
    d.pos.set(...GM_POS)
    const reactObj = { kind: 'accept', k: 0 }
    let decided = -1e9
    let seen = -1
    return () => {
      const w = feed.getWorld()
      const t = now()
      const waiting = w.holds.some(h => h.open)
      const dec = w.packets.find(p => p.kind === 'decision' && p.from === 'p:grant_manager')
      if (dec && dec.sentAt !== seen) {
        seen = dec.sentAt
        decided = dec.sentAt
      }
      const k = (t - decided) / 900
      d.act = waiting ? 'read' : 'idle'
      d.prop = waiting ? 'papers' : null
      reactObj.k = k
      d.react = k >= 0 && k < 1 ? reactObj : null
      // A glance toward whichever agent is talking to the grant manager.
      const pk = w.packets.find(p => p.to === 'p:grant_manager' || p.from === 'p:grant_manager')
      const other = pk ? (pk.to === 'p:grant_manager' ? pk.from : pk.to) : null
      d.look = other === 'a:purchasing' ? -0.75 : other === 'a:payment_report' ? 0.75 : other === 'a:bookkeeping' ? 0 : null
      return d
    }
  }, [])
  return (
    <Pick id="p:grant_manager">
      <Figure id="gm" drive={drive} b={b} />
    </Pick>
  )
}
