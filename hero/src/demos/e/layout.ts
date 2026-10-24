// Where every part of the machine sits, and the paths balls and tokens ride.
// All route curves trace the centre of a 0.22-radius ball; rails sit below.

import { CatmullRomCurve3, Curve, CurvePath, LineCurve3, QuadraticBezierCurve3, Vector3 } from 'three'
import { R01, R21 } from '../../feed'

export const v = (x: number, y: number, z: number) => new Vector3(x, y, z)
export const BALL_R = 0.22
export const UP = new Vector3(0, 1, 0)

// ── The six rule gates ────────────────────────────────────────────────────

export const GATES = [
  { short: 'Active', name: 'Grant active, not frozen', match: /^(Grant is active|Grant exists)/ },
  { short: '90 days', name: "Not in the grant's last 90 days", match: /^Not in the grant/ },
  { short: 'Available', name: 'Enough truly available money', match: /^Enough truly available/ },
  { short: 'Category', name: 'Category allowed', match: /^Category allowed/ },
  { short: 'Card limit', name: 'Under the $5,000 card limit', match: /^Under the card limit/ },
  { short: 'Split', name: 'Shared cost split across grants', match: /^Shared cost split/ },
]
export const gateOf = (rule: string) => Math.max(0, GATES.findIndex(g => g.match.test(rule)))

// ── The lab ───────────────────────────────────────────────────────────────

export const RESEARCHER_IDS = ['ortiz', 'okafor', 'raman', 'silva', 'park']
export const BENCH_Z: Record<string, number> = { ortiz: -6.4, okafor: -3.6, raman: -0.8, silva: 2.0, park: 4.8 }
export const BENCH_X = -16
const bz = (id: string) => BENCH_Z[id] ?? 0
export const releaseAt = (id: string) => v(-14.3, 4.5, bz(id) - 0.25)
export const trayAt = (id: string) => v(-13.9, 1.42, bz(id) + 0.45)
export const figureAt = (id: string) => v(BENCH_X - 0.5, 0, bz(id) - 1.0)

// ── The purchasing agent's gate run ──────────────────────────────────────

export const GATE_X = [-7.6, -5.4, -3.2, -1.0, 1.2, 3.4]
export const LANE_Z = [0, 1.0]
export const ballY = (x: number, lane = 0) => 4.08 - (x + 8.6) * 0.025 - lane * 0.3
export const onTrack = (x: number, lane = 0) => v(x, ballY(x, lane), LANE_Z[lane])
export const G0 = onTrack(-8.6)
export const MERGE = v(-10.0, 4.14, 0)
export const SW = v(5.4, ballY(5.4), 0.5)
export const RUN_END = 4.4 // where both lanes leave the gates for the switch

// ── Destinations after the switch ────────────────────────────────────────

export const HOPPER: Record<string, Vector3> = { [R01]: v(10.6, 0, -2.6), [R21]: v(10.6, 0, 2.0) }
export const GRANT_COLOR: Record<string, string> = { [R01]: 'cobalt', [R21]: 'yellow' }
const hop = (g: string) => HOPPER[g] ?? HOPPER[R01]
const above = (g: string) => v(hop(g).x, 2.85, hop(g).z)
const into = (g: string) => v(hop(g).x, 1.95, hop(g).z)
export const FUNNEL_TOP = 2.32
export const LOOP = { c: v(8.0, 3.45, -0.1), r: 0.7 }
export const LIFT = v(LOOP.c.x, LOOP.c.y, LOOP.c.z - LOOP.r)
export const LIFT_TOP = v(LIFT.x, 4.95, LIFT.z)
export const CRADLE = v(5.6, 3.15, -4.3)
export const BIN = v(6.7, 0, 3.6)
export const GM_BIN = v(CRADLE.x, 0, CRADLE.z)
export const TRAY_BACK = v(5.0, 3.42, 2.35)
export const DISPENSER = v(3.6, 3.2, 2.9)

/** Line segments joined by quadratic fillets; arc-length parameterised. */
export function rounded(pts: Vector3[], r = 0.5): CurvePath<Vector3> {
  const path = new CurvePath<Vector3>()
  let cur = pts[0].clone()
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const din = b.clone().sub(a)
    const dout = c.clone().sub(b)
    const rr = Math.min(r, din.length() / 2, dout.length() / 2)
    const p1 = b.clone().addScaledVector(din.normalize(), -rr)
    const p2 = b.clone().addScaledVector(dout.normalize(), rr)
    if (p1.distanceTo(cur) > 1e-4) path.add(new LineCurve3(cur, p1))
    path.add(new QuadraticBezierCurve3(p1, b.clone(), p2))
    cur = p2
  }
  path.add(new LineCurve3(cur, pts[pts.length - 1].clone()))
  return path
}

export class Reversed extends Curve<Vector3> {
  constructor(private base: Curve<Vector3>) {
    super()
  }
  getPoint(t: number, out = new Vector3()) {
    return this.base.getPointAt(1 - t, out)
  }
}

/** A route: the ball-centre path, and the part of it that has rails under it. */
export interface Track {
  path: CurvePath<Vector3> | CatmullRomCurve3
  rail: Vector3[] | null
}
const track = (pts: Vector3[], railTo = pts.length - 1, r = 0.5): Track => ({ path: rounded(pts, r), rail: railTo > 0 ? pts.slice(0, railTo + 1) : null })

export const chute = (id: string) => {
  const z = bz(id)
  return new CatmullRomCurve3([releaseAt(id), v(-12.9, 4.42, z * 0.72 - 0.1), v(-11.4, 4.25, z * 0.3), MERGE, G0], false, 'centripetal')
}
export const chuteRail = (id: string) => {
  const z = bz(id)
  return [releaseAt(id).add(v(0.25, 0, 0)), v(-12.9, 4.42, z * 0.72 - 0.1), v(-11.4, 4.25, z * 0.3), MERGE]
}

const returnPts = (id: string) => {
  const zt = bz(id) + 0.45
  return [DISPENSER, v(-9.8, 2.5, 2.9), v(-11.6, 2.2, zt), v(-12.9, 1.75, zt), trayAt(id)]
}
export const returnTrack = (id: string): Track => track(returnPts(id), 4, 0.9)

export const MAIN_LANE = [G0, onTrack(RUN_END, 0), SW]
export const FAIL_LANE = [onTrack(-8.0, 1), onTrack(RUN_END, 1), v(5.0, ballY(5.0) - 0.04, 0.8), SW]

export const toHopper = (g: string): Track => {
  const s = g === R21 ? 1 : -1
  return track([SW, v(7.4, 3.55, s > 0 ? 1.45 : -1.45), v(9.4, 3.05, hop(g).z + (s > 0 ? -0.05 : 0.15)), above(g), into(g)], 3)
}
export const reroute = (fromG: string, toG: string): Track => {
  const s = fromG === R21 ? 1 : -1
  return track([SW, v(7.4, 3.55, s * 1.45), v(8.6, 3.3, s * 1.8), v(9.6, 3.0, hop(toG).z - s * 0.3), above(toG), into(toG)], 4)
}
export const CROSSOVERS = [
  [v(8.6, 3.3, 1.8), v(9.6, 3.0, HOPPER[R01].z + 0.3), above(R01)],
  [v(8.6, 3.3, -1.8), v(9.6, 3.0, HOPPER[R21].z - 0.3), above(R21)],
]
export const TO_BIN = track([SW, v(6.2, 3.55, 1.9), v(6.6, 2.5, 3.1), v(6.7, 1.5, BIN.z), v(BIN.x, 0.5, BIN.z)], 2)
export const TO_LOOP = track([SW, v(6.6, 3.6, 0.1), v(LOOP.c.x - LOOP.r, LOOP.c.y, LOOP.c.z)], 2)
export const TO_CRADLE = track([SW, v(5.1, 3.6, -1.0), v(5.3, 3.35, -2.8), CRADLE], 3)
export const TO_TRAY = track([SW, v(5.25, 3.6, 1.5), TRAY_BACK], 2)
export const cradleToHopper = (g: string): Track =>
  g === R21
    ? track([CRADLE, v(8.4, 3.05, -2.2), v(9.3, 2.95, 1.2), above(g), into(g)], 3)
    : track([CRADLE, v(8.0, 3.05, -3.4), v(9.4, 2.95, -2.65), above(g), into(g)], 3)
export const CRADLE_DROP = track([CRADLE, v(CRADLE.x, 0.45, CRADLE.z)], 0)
export const RERUN = track([LIFT_TOP, v(7.0, 4.9, -1.5), v(-9.2, 4.45, -1.5), v(-9.9, 4.25, -0.6), MERGE, G0], 4, 0.7)

export const binSlot = (i: number, base: Vector3) => {
  const a = i * 2.39996
  const ring = i === 0 ? 0 : 0.3
  return v(base.x + Math.cos(a) * ring, base.y + 0.32 + Math.floor(i / 5) * 0.3, base.z + Math.sin(a) * ring)
}

// ── The rest of the grant office ─────────────────────────────────────────

export const TICKER = v(0.5, 0, -6.4)
export const SOURCES: { id: string; label: string; x: number; cap: string }[] = [
  { id: 's:reporter', label: 'NIH RePORTER', x: -7, cap: 'ash' },
  { id: 's:usaspending', label: 'USAspending', x: -3.5, cap: 'ash' },
  { id: 's:cancellations', label: 'Cancellation list', x: 0, cap: 'red' },
  { id: 's:court', label: 'Court notice', x: 3.5, cap: 'cobalt' },
  { id: 's:payments', label: 'Payment system', x: 7, cap: 'yellow' },
]
export const SOURCE_Z = -11.4
export const PRESS = v(12.8, 0, -6.8)
export const FUNDER = v(16.8, 0, -8.8)
export const VENDORS = v(15.6, 0, 3.4)
export const DESK = v(6.6, 0, -6.6)
export const CABLE_Y = 6.2

const tapeEnd = (x: number) => v(TICKER.x + x * 0.16, 1.3, TICKER.z - 0.8)
export const tape = (id: string) => {
  const s = SOURCES.find(x => x.id === id) ?? SOURCES[0]
  return [v(s.x, 1.3, SOURCE_Z + 0.55), tapeEnd(s.x)]
}

export const RECHECK = new CatmullRomCurve3([v(5.55, 4.55, -0.2), v(4.6, 5.5, -1.2), v(2.4, 5.4, -4.8), v(1.4, 2.6, -5.9)], false, 'centripetal')
export const holdLine = (from: string) => {
  if (from === 'a:bookkeeping') return [v(2.0, 2.3, -6.4), v(2.0, 3.6, -6.4), v(6.0, 3.6, -6.6), v(6.0, 1.25, -6.6)]
  if (from === 'a:payment_report') return [v(11.6, 2.6, -6.8), v(11.6, 4.3, -6.8), v(7.2, 4.3, -6.6), v(7.2, 1.25, -6.6)]
  return [v(5.55, 4.55, -0.2), v(5.55, 5.7, -0.2), v(5.55, 5.7, -6.0), v(6.6, 5.7, -6.6), v(6.6, 1.25, -6.6)]
}
export const docLine = (id: string) => {
  const z = bz(id)
  return [v(-17.6, 1.15, z), v(-17.6, CABLE_Y, z), v(-17.6, CABLE_Y, -9.8), v(11.2, CABLE_Y, -9.8), v(11.2, CABLE_Y, -6.8), v(11.2, 1.05, -6.8)]
}
export const INVOICE = [v(15.0, 1.0, 3.4), v(15.0, 5.0, 3.4), v(15.0, 5.0, -5.1), v(1.4, 5.0, -5.1), v(1.4, 2.4, -5.9)]
export const FUNDER_LINE = [v(13.9, 2.1, -6.8), v(14.5, 3.7, -7.4), v(16.1, 3.7, -8.1), v(16.4, 3.0, -8.1)]
export const chargeLine = (g: string) => [v(hop(g).x + 1.0, 0.12, hop(g).z), v(13.6, 0.12, hop(g).z), v(14.2, 0.12, VENDORS.z), v(14.4, 0.5, VENDORS.z)]
export const signalLine = (g: string) => [v(2.2, 0.06, -6.0), v(9.1, 0.06, -6.0), v(9.1, 0.06, hop(g).z), v(9.6, 0.06, hop(g).z), v(9.6, 2.3, hop(g).z)]

// ── Node anchors (labels, generic routes, hover rings) ───────────────────

export const ANCHOR: Record<string, Vector3> = {
  ...Object.fromEntries(RESEARCHER_IDS.map(id => [`r:${id}`, v(BENCH_X - 0.5, 2.25, bz(id) - 1.0)])),
  'a:purchasing': v(-2.1, 0.9, 3.7),
  'a:bookkeeping': v(TICKER.x, 3.25, TICKER.z),
  'a:payment_report': v(PRESS.x, 4.45, PRESS.z),
  'p:grant_manager': v(DESK.x, 2.75, DESK.z - 0.8),
  'p:funder': v(FUNDER.x, 4.6, FUNDER.z),
  'v:vendors': v(VENDORS.x, 1.9, VENDORS.z),
  [`g:${R01}`]: v(HOPPER[R01].x, 3.35, HOPPER[R01].z),
  [`g:${R21}`]: v(HOPPER[R21].x, 3.35, HOPPER[R21].z),
  ...Object.fromEntries(SOURCES.map(s => [s.id, v(s.x, 3.1, SOURCE_Z)])),
}
/** Ground point under a node, for the hover ring. */
export const FOOT: Record<string, Vector3> = {
  ...Object.fromEntries(RESEARCHER_IDS.map(id => [`r:${id}`, v(BENCH_X, 0.02, bz(id) - 0.2)])),
  'a:purchasing': v(-1.4, 0.02, 0.5),
  'a:bookkeeping': v(TICKER.x, 0.02, TICKER.z),
  'a:payment_report': v(PRESS.x, 0.02, PRESS.z),
  'p:grant_manager': v(DESK.x, 0.02, DESK.z - 0.3),
  'p:funder': v(FUNDER.x, 0.02, FUNDER.z),
  'v:vendors': v(VENDORS.x, 0.02, VENDORS.z),
  [`g:${R01}`]: v(HOPPER[R01].x, 0.02, HOPPER[R01].z),
  [`g:${R21}`]: v(HOPPER[R21].x, 0.02, HOPPER[R21].z),
  ...Object.fromEntries(SOURCES.map(s => [s.id, v(s.x, 0.02, SOURCE_Z)])),
}
export const FOOT_SIZE: Record<string, number> = { 'a:purchasing': 8.4, 'a:bookkeeping': 2.2, 'a:payment_report': 1.8 }
export const anchor = (id: string) => ANCHOR[id] ?? v(0, 3, 0)

// ── Packet routes (from → to), built once and cached ─────────────────────

const cache = new Map<string, Curve<Vector3>>()

function build(from: string, to: string): Curve<Vector3> | undefined {
  if (from.startsWith('r:') && to === 'a:purchasing') return chute(from.slice(2))
  if (from === 'a:purchasing' && to.startsWith('r:')) return returnTrack(to.slice(2)).path
  if (from.startsWith('s:') && to === 'a:bookkeeping') return rounded(tape(from))
  if (from === 'a:purchasing' && to === 'a:bookkeeping') return RECHECK
  if (from.startsWith('g:') && to === 'v:vendors') return rounded(chargeLine(from.slice(2)), 0.4)
  if (from.startsWith('a:') && to === 'p:grant_manager') return rounded(holdLine(from), 0.5)
  if (from.startsWith('r:') && to === 'a:payment_report') return rounded(docLine(from.slice(2)), 0.6)
  if (from === 'v:vendors' && to === 'a:bookkeeping') return rounded(INVOICE, 0.6)
  if (from === 'a:payment_report' && to === 'p:funder') return rounded(FUNDER_LINE, 0.4)
  return undefined
}

export function routeFor(from: string, to: string): Curve<Vector3> {
  const key = `${from}>${to}`
  const hit = cache.get(key)
  if (hit) return hit
  const back = build(to, from)
  let c = build(from, to) ?? (back ? new Reversed(back) : undefined)
  if (!c) {
    const a = anchor(from)
    const b = anchor(to)
    const top = Math.max(a.y, b.y) + 2.5 + a.distanceTo(b) * 0.06
    c = new CatmullRomCurve3([a, v(a.x, top, a.z), v(b.x, top, b.z), b])
  }
  cache.set(key, c)
  return c
}
