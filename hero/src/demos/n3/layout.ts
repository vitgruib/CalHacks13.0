// Where everything sits on the deck, plus the paths marbles and beads roll
// along. One unit is about a marble and a half. y is up, the deck top is y = 0,
// the lab is off screen to the left (-x) and the funder behind (-z).

import { Vector3 } from 'three'
import { R01, R21 } from '../../feed'

export const v = (x: number, y: number, z: number) => new Vector3(x, y, z)

export const MR = 0.2 // marble radius
export const MY = 0.32 // marble centre resting on a track
export const DECK = { x0: -9.4, x1: 9.4, z0: -4.7, z1: 4.4 }

export const LANE_Z = 0 // the main run, lab to cups
export const RET_Z = 3.4 // the way back to the lab
export const PORT_X = -8.9 // the arch the lab's requests come through
export const OFF_X = -10.6 // where things leave the picture

/** The purchasing agent's run: a marble is at gate i when rule i fires (t0 + rule * (i + 1)). */
export const RUN_X0 = -7.0
export const RUN_X1 = 0.0
export const GATE_X = [-6, -5, -4, -3, -2, -1]
export const JUNCTION = v(1.15, MY, LANE_Z)

/** The four cups fan out from the switch; the held cup is a cradle with the grant manager's latch. */
export const CUP: Record<'accept' | 'refine' | 'reject' | 'hold', Vector3> = {
  accept: v(3.25, 0, -1.75),
  refine: v(3.8, 0, -0.6),
  reject: v(3.8, 0, 0.6),
  hold: v(3.25, 0, 1.75),
}
export const COLLECT_X = 4.85 // the lane behind the cups that tips into the way back
export const GM = v(2.2, 0, 2.55) // the grant manager, beside her latch

export const GRANT_AT: Record<string, Vector3> = { [R01]: v(-4.4, 0, -3.0), [R21]: v(-1.4, 0, -3.0) }
export const GRANT_IDS = [R01, R21]
/** A held-for-money marble waits in a notch beside its grant, under the same latch as the freeze. */
export const notchOf = (gid: string, out = new Vector3()) => out.copy(GRANT_AT[gid] ?? GRANT_AT[R01]).add(NOTCH_OFF)
const NOTCH_OFF = v(1.12, MY - 0.06, 0.62)
export const BLOCK_H = 1.1 // a grant is a solid clay block, this tall

export const BOOK = v(2.0, 0, -3.1) // bookkeeping agent
export const BOOK_NOTCH = v(2.95, MY, -2.55)
export const PR = v(-7.3, 0, -3.0) // payment & report agent
export const PR_NOTCH = v(-6.3, MY, -2.45)

// ── Paths ────────────────────────────────────────────────────────────────

/** A polyline walked by arc length. */
export class Path {
  pts: Vector3[]
  cum: number[] = [0]
  len = 0
  constructor(pts: Vector3[]) {
    this.pts = pts
    for (let i = 1; i < pts.length; i++) {
      this.len += pts[i].distanceTo(pts[i - 1])
      this.cum.push(this.len)
    }
  }
  at(u: number, out: Vector3) {
    const d = Math.min(1, Math.max(0, u)) * this.len
    let i = 1
    while (i < this.cum.length - 1 && this.cum[i] < d) i++
    const a = this.cum[i - 1]
    const seg = this.cum[i] - a || 1
    return out.lerpVectors(this.pts[i - 1], this.pts[i], (d - a) / seg)
  }
}

/** A lifted hop from a to b: carried over whatever is between. */
export function hop(a: Vector3, b: Vector3, u: number, h: number, out: Vector3) {
  out.lerpVectors(a, b, u)
  out.y += Math.sin(Math.PI * u) * h
  return out
}

/** In from the lab: down the chute, under the arch, onto the start of the run. */
export const ENTRY = new Path([v(OFF_X, 1.25, LANE_Z), v(-8.3, MY + 0.02, LANE_Z), v(RUN_X0, MY, LANE_Z)])
export const RUN_START = v(RUN_X0, MY, LANE_Z)

const IN_CUP_Y = 0.46
/** From the switch into each cup. */
export const TO_CUP = Object.fromEntries(
  (Object.keys(CUP) as (keyof typeof CUP)[]).map(k => {
    const c = CUP[k]
    const mid = v((JUNCTION.x + c.x) / 2 + 0.2, MY, (JUNCTION.z + c.z) / 2)
    return [k, new Path([JUNCTION.clone(), mid, v(c.x - 0.5, MY + 0.06, c.z), v(c.x, IN_CUP_Y, c.z)])]
  }),
) as Record<keyof typeof CUP, Path>

/** Out of a cup: tipped over its back rim, down the collector, then all the way back to the lab. */
export const FROM_CUP = Object.fromEntries(
  (Object.keys(CUP) as (keyof typeof CUP)[]).map(k => {
    const c = CUP[k]
    return [
      k,
      new Path([
        v(c.x, IN_CUP_Y, c.z),
        v(c.x + 0.5, 0.72, c.z),
        v(COLLECT_X, MY, c.z),
        v(COLLECT_X, MY, RET_Z - 0.4),
        v(COLLECT_X - 0.4, MY, RET_Z),
        v(-8.3, MY, RET_Z),
        v(OFF_X, 1.25, RET_Z),
      ]),
    ]
  }),
) as Record<keyof typeof CUP, Path>

/** Bookkeeping's side track: readings and invoices roll in from the right edge. */
export const BOOK_IN = new Path([v(9.9, 0.9, BOOK.z), v(8.9, MY - 0.08, BOOK.z), v(BOOK.x + 0.75, MY - 0.08, BOOK.z)])
/** "Check again before money moves": the switch asks bookkeeping and hears back. */
export const RECHECK = new Path([v(JUNCTION.x + 0.05, MY + 0.12, -0.2), v(BOOK.x - 0.15, MY + 0.12, BOOK.z + 0.62)])

/** Payment & report's side track: papers come in from the lab; payment requests go out to the funder. */
export const PAPER_IN = new Path([v(OFF_X, 1.25, -1.2), v(-8.3, MY - 0.08, -1.2), v(-7.3, MY - 0.08, -1.2), v(PR.x, MY - 0.08, PR.z + 0.72)])
export const PR_OUT = new Path([v(PR.x, MY - 0.08, PR.z - 0.7), v(PR.x, MY - 0.08, DECK.z0 + 0.3), v(PR.x, 0.8, -5.7)])

/** The funder's chute onto each grant's block. */
export const FUND_CHUTE = Object.fromEntries(
  GRANT_IDS.map(gid => {
    const g = GRANT_AT[gid]
    return [gid, new Path([v(g.x, 2.2, -5.9), v(g.x, BLOCK_H + 0.45, g.z - 0.75), v(g.x, BLOCK_H + 0.3, g.z - 0.35)])]
  }),
) as Record<string, Path>

/** What each part is, for the few labels. */
export const LABEL_AT = {
  purchasing: v(-3.5, 0, 1.0),
  bookkeeping: v(BOOK.x, 1.15, BOOK.z),
  payment_report: v(PR.x, 1.15, PR.z),
  lab: v(PORT_X, 2.05, 1.2),
}

export const ease = (t: number) => {
  const k = Math.min(1, Math.max(0, t))
  return k * k * (3 - 2 * k)
}
/** A roll that starts with a push and settles: quick out of the gate, no bounce at the end. */
export const roll = (t: number) => {
  const k = Math.min(1, Math.max(0, t))
  return 1 - (1 - k) ** 2.4
}
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
