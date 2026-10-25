// The mobile's live pose. Every arm's tilt rides a damped spring toward the
// balance its load asks for; arrivals give it a little push. The positions
// of every pivot, arm end and hanging thing are solved here once a frame, so
// the drawn mobile and the packets riding it always agree.

import { Vector3 } from 'three'
import { ARMS, GM_TRAY, HANGS, HOOK, HOOK_DROP, PICKUP, restOf, type ArmSpec, type HangSpec } from './layout'

interface ArmState {
  spec: ArmSpec
  tilt: number
  vel: number
  target: number
  yawW: number
  phase: number
  period: number
}

export const arms = new Map<string, ArmState>()
/** Every named point in world space: hook, pivots (A0…), ends (A0.L…), things (a:purchasing…), 'pk', 'pickup', 'gm'. */
export const P = new Map<string, Vector3>()
/** World yaw of each arm, and of each hanging thing (it turns with the arm it hangs from). */
export const YAW = new Map<string, number>()
const PARENT = new Map<string, string>()
export const HANG = new Map<string, HangSpec>(HANGS.map(h => [h.id, h]))

ARMS.forEach((a, i) => {
  arms.set(a.id, { spec: a, tilt: 0, vel: 0, target: 0, yawW: 0, phase: i * 1.7, period: 11 + i * 2.3 })
  PARENT.set(a.id, a.parent)
  PARENT.set(`${a.id}.L`, a.id)
  PARENT.set(`${a.id}.R`, a.id)
  if (a.id === 'AS') for (let k = 0; k < 5; k++) PARENT.set(`AS.${k}`, 'AS')
})
for (const h of HANGS) PARENT.set(h.id, h.parent)
PARENT.set('pk', 'a:purchasing')
PARENT.set('pickup', 'pk')
PARENT.set('gm', 'A0')
for (const id of [...PARENT.keys(), 'hook']) P.set(id, restOf(id).clone())
P.set('hook', new Vector3(...HOOK))
P.set('pickup', new Vector3(...PICKUP))
P.set('gm', new Vector3(...GM_TRAY))
P.get('pk')!.copy(restOf('a:purchasing')).y -= HOOK_DROP

/** The arm end (and side) a node finally hangs from, walking up through pendants and chains. */
function armSideOf(id: string): { arm: string; side: number; next: string } | null {
  let cur = id
  for (let guard = 0; guard < 8; guard++) {
    const p = PARENT.get(cur)
    if (!p || p === 'hook') return null
    const m = /^(A\w)\.(L|R|\d)$/.exec(p)
    if (m) {
      const side = m[2] === 'L' ? 1 : m[2] === 'R' ? -1 : (2 - Number(m[2])) / 2
      return { arm: m[1], side, next: m[1] }
    }
    cur = p
  }
  return null
}

/** Something reached `id`: its side of every arm above it dips a little, less the higher up. */
export function kick(id: string, amount = 0.32) {
  let cur = id
  let k = amount
  for (let guard = 0; guard < 6; guard++) {
    const a = armSideOf(cur)
    if (!a) return
    const s = arms.get(a.arm)
    if (s) s.vel += a.side * k
    k *= 0.45
    cur = a.next
  }
}

/** Ids of the things hanging under each side of each arm (for load balance). */
export const UNDER = new Map<string, string[]>()
for (const a of ARMS)
  for (const side of ['L', 'R']) {
    const end = `${a.id}.${side}`
    UNDER.set(
      end,
      HANGS.filter(h => {
        let cur: string | undefined = h.id
        for (let g = 0; g < 8 && cur; g++) {
          if (cur === end) return true
          cur = PARENT.get(cur)
        }
        return false
      }).map(h => h.id),
    )
  }

/** Each arm's ends and how far out they sit; the arm that owns each point. */
const ENDS = new Map<string, [string, number][]>()
const OWNER = new Map<string, string>()
for (const a of ARMS) {
  const ends: [string, number][] = [[`${a.id}.L`, -a.l], [`${a.id}.R`, a.r]]
  if (a.id === 'AS') for (let k = 0; k < 5; k++) ends.push([`AS.${k}`, -a.l + ((a.l + a.r) * k) / 4])
  ENDS.set(a.id, ends)
  OWNER.set(a.id, a.id)
  for (const [id] of ends) OWNER.set(id, a.id)
}
for (const h of HANGS) if (!OWNER.has(h.id)) OWNER.set(h.id, OWNER.get(h.parent) ?? h.parent)

export function setTarget(arm: string, v: number) {
  const s = arms.get(arm)
  if (s) s.target = v
}

const tmp = new Vector3()

/** Step the springs and place every point. `t` in seconds (for sway), `dt` in seconds. */
export function solve(t: number, dt: number, still: boolean) {
  const h = Math.min(dt, 1 / 30)
  for (const s of arms.values()) {
    if (still) {
      s.tilt = s.target
      s.vel = 0
      continue
    }
    // Two half steps keep the spring stable on a slow frame.
    for (let i = 0; i < 2; i++) {
      const acc = -7 * (s.tilt - s.target) - 2.1 * s.vel
      s.vel += acc * (h / 2)
      s.tilt += s.vel * (h / 2)
    }
    s.tilt = Math.max(-0.4, Math.min(0.4, s.tilt))
  }
  YAW.set('hook', 0)
  for (const s of arms.values()) {
    const a = s.spec
    const parentPos = P.get(a.parent)!
    const parentYaw = YAW.get(OWNER.get(a.parent) ?? 'hook') ?? 0
    s.yawW = parentYaw + a.yaw + (still ? 0 : a.sway * Math.sin((t / s.period) * Math.PI * 2 + s.phase))
    YAW.set(a.id, s.yawW)
    const pivot = P.get(a.id)!
    pivot.copy(parentPos)
    pivot.y -= a.drop
    const ends = ENDS.get(a.id)!
    for (let k = 0; k < ends.length; k++) {
      const [id, reach] = ends[k]
      P.get(id)!.set(pivot.x + reach * Math.cos(s.tilt) * Math.cos(s.yawW), pivot.y + reach * Math.sin(s.tilt), pivot.z - reach * Math.cos(s.tilt) * Math.sin(s.yawW))
    }
  }
  for (const n of HANGS) {
    const parent = P.get(n.parent)!
    const ph = HANG.get(n.parent)
    const p = P.get(n.id)!
    p.copy(parent)
    p.y -= (ph ? ph.bottom : 0) + n.drop + n.top
    YAW.set(n.id, YAW.get(OWNER.get(n.parent) ?? n.parent) ?? 0)
  }
  P.get('pk')!.copy(P.get('a:purchasing')!).y -= HOOK_DROP
}

// ── Paths along the wires ─────────────────────────────────────────────────

const chains = new Map<string, string[]>()
function chain(id: string) {
  let c = chains.get(id)
  if (c) return c
  c = [id]
  let cur = id
  for (let g = 0; g < 16; g++) {
    const p = PARENT.get(cur)
    if (!p) break
    c.push(p)
    cur = p
  }
  chains.set(id, c)
  return c
}

const paths = new Map<string, string[]>()
/** The points a packet passes from `a` to `b`: up to where their branches meet, then down. */
export function pathIds(a: string, b: string): string[] {
  const key = `${a}>${b}`
  let r = paths.get(key)
  if (r) return r
  const ca = chain(a)
  const cb = chain(b)
  const meet = ca.find(x => cb.includes(x)) ?? 'hook'
  r = [...ca.slice(0, ca.indexOf(meet) + 1), ...cb.slice(0, cb.indexOf(meet)).reverse()]
  paths.set(key, r)
  return r
}

export const known = (id: string) => P.has(id)

const lens = new Float32Array(40)
/** A point `u` (0..1) of the way along a path, by length. Returns the direction of travel in `dir` if given. */
export function along(ids: string[], u: number, out: Vector3, dir?: Vector3) {
  const n = Math.min(ids.length, 40)
  if (n === 0) return out.set(0, 4, 0)
  if (n === 1) return out.copy(P.get(ids[0]) ?? out)
  let total = 0
  lens[0] = 0
  for (let i = 1; i < n; i++) {
    total += P.get(ids[i - 1])!.distanceTo(P.get(ids[i])!)
    lens[i] = total
  }
  const d = Math.max(0, Math.min(1, u)) * total
  let i = 1
  while (i < n - 1 && lens[i] < d) i++
  const a = P.get(ids[i - 1])!, b = P.get(ids[i])!
  const seg = lens[i] - lens[i - 1]
  const k = seg > 1e-6 ? (d - lens[i - 1]) / seg : 1
  out.lerpVectors(a, b, k)
  if (dir) dir.subVectors(b, a).normalize()
  return out
}

/** Length of a path right now. */
export function lengthOf(ids: string[]) {
  let total = 0
  for (let i = 1; i < ids.length; i++) total += P.get(ids[i - 1])!.distanceTo(P.get(ids[i])!)
  return total
}

export function pointOf(id: string, out = tmp) {
  return out.copy(P.get(id) ?? restOf(id))
}
