// Where the plumbing sits. One plinth, viewed from the front: two grant tanks
// at the back, the money manifold in front of them running right into the
// purchasing valve, on through the payment & report pump and out to vendors.
// Grants are closed vaults (no pools of money): a thin bar shows what's left.
// A bypass loop carries exceptions past the grant manager's valve. Money from
// NIH arrives as capsules along an overhead header, down into a vault's inlet.

import { CurvePath, LineCurve3, QuadraticBezierCurve3, Vector3 } from 'three'
import { R01, R21 } from '../../feed'

export const v = (x: number, y: number, z: number) => new Vector3(x, y, z)

/** A pipe run through `pts`: straight legs with rounded elbows, sampled by arc length. */
export function run(pts: Vector3[], r = 0.3): CurvePath<Vector3> {
  const path = new CurvePath<Vector3>()
  let prev = pts[0].clone()
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const din = b.clone().sub(a)
    const dout = c.clone().sub(b)
    const k = Math.min(r, din.length() / 2, dout.length() / 2)
    const p1 = b.clone().addScaledVector(din.normalize(), -k)
    const p2 = b.clone().addScaledVector(dout.normalize(), k)
    if (prev.distanceTo(p1) > 1e-4) path.add(new LineCurve3(prev, p1))
    path.add(new QuadraticBezierCurve3(p1, b.clone(), p2))
    prev = p2
  }
  path.add(new LineCurve3(prev, pts[pts.length - 1].clone()))
  return path
}

export const H = 0.5 // money pipes run at this height
export const PIPE_R = 0.11
export const MAIN_Z = 0.55

/** A grant is a closed clay vault; r is half its depth (its front face sits at z + r). */
export const TANK = { r: 0.7, w: 1.8, h: 1.5 }
export const TANK_AT: Record<string, Vector3> = { [R01]: v(-4.3, 0, -0.9), [R21]: v(-1.6, 0, -0.9) }
export const GRANT_IDS = [R01, R21]

export const VALVE = v(1.0, 0.86, MAIN_Z) // purchasing: a big round valve face, axis toward the camera
export const VALVE_R = 0.7
export const PUMP = v(4.75, 0.8, MAIN_Z) // payment & report
export const PUMP_R = 0.6
export const METER = v(4.75, 2.25, -1.15) // bookkeeping
export const METER_R = 0.62
export const GM = v(2.85, H, 1.6) // grant manager's valve on the bypass
export const HEADER_Y = 4.05
export const HEADER_Z = -0.9

// Money paths (the liquid rides these)
const IN_X = VALVE.x - VALVE_R + 0.02
const OUT_X = VALVE.x + VALVE_R - 0.02
export const DRAW: Record<string, CurvePath<Vector3>> = Object.fromEntries(
  GRANT_IDS.map(id => {
    const t = TANK_AT[id]
    return [id, run([v(t.x, H, t.z + TANK.r - 0.12), v(t.x, H, MAIN_Z), v(IN_X - 0.16, H, MAIN_Z)])]
  }),
)
export const VENDOR_X = 6.95
export const NIH_X = 7.55
export const OUT = run([v(OUT_X, H, MAIN_Z), v(VENDOR_X, H, MAIN_Z)])
export const TO_GM = run([v(OUT_X, H, MAIN_Z), v(2.25, H, MAIN_Z), v(2.25, H, GM.z), v(GM.x - 0.32, H, GM.z)])
export const FROM_GM = run([v(GM.x + 0.3, H, GM.z), v(3.45, H, GM.z), v(3.45, H, MAIN_Z), v(VENDOR_X, H, MAIN_Z)])

// Static pipes (drawn, not ridden)
export const PIPES: { path: CurvePath<Vector3>; r: number }[] = [
  { path: DRAW[R01], r: PIPE_R },
  { path: run([v(TANK_AT[R21].x, H, TANK_AT[R21].z + TANK.r - 0.12), v(TANK_AT[R21].x, H, MAIN_Z)], 0.01), r: PIPE_R },
  { path: run([v(IN_X - 0.4, H, MAIN_Z), v(VALVE.x, H, MAIN_Z)]), r: PIPE_R },
  { path: run([v(OUT_X - 0.1, H, MAIN_Z), v(VENDOR_X, H, MAIN_Z)]), r: PIPE_R },
  { path: run([v(2.25, H, MAIN_Z), v(2.25, H, GM.z), v(3.45, H, GM.z), v(3.45, H, MAIN_Z)]), r: PIPE_R * 0.8 },
  // the overhead header from NIH, with a drop over each tank
  { path: run([v(NIH_X, HEADER_Y, HEADER_Z), v(TANK_AT[R01].x - 0.3, HEADER_Y, HEADER_Z)]), r: PIPE_R },
  ...GRANT_IDS.map(id => ({ path: run([v(TANK_AT[id].x, HEADER_Y, HEADER_Z), v(TANK_AT[id].x, TANK.h + 0.05, HEADER_Z)]), r: PIPE_R * 0.85 })),
]
/** Collars where pipes join or meet a body. */
export const COLLARS: [Vector3, 'x' | 'y' | 'z'][] = [
  [v(TANK_AT[R21].x, H, MAIN_Z), 'x'],
  [v(2.25, H, MAIN_Z), 'x'],
  [v(3.45, H, MAIN_Z), 'x'],
  [v(IN_X - 0.08, H, MAIN_Z), 'x'],
  [v(OUT_X + 0.08, H, MAIN_Z), 'x'],
  [v(PUMP.x - PUMP_R - 0.06, H, MAIN_Z), 'x'],
  [v(PUMP.x + PUMP_R + 0.06, H, MAIN_Z), 'x'],
  ...GRANT_IDS.map(id => [v(TANK_AT[id].x, H, TANK_AT[id].z + TANK.r - 0.02), 'z'] as [Vector3, 'z']),
  ...GRANT_IDS.map(id => [v(TANK_AT[id].x, TANK.h + 0.62, HEADER_Z), 'y'] as [Vector3, 'y']),
]

// The lab's request line: thin, along the front, ending at the purchasing valve.
export const LAB_X = -6.35
export const LAB = run([v(LAB_X, 0.3, 1.95), v(-0.2, 0.3, 1.95), v(0.3, 0.3, 1.32)], 0.5)
export const LAB_R = 0.045
export const DOCK = v(0.3, 0.3, 1.32)

/** Six rule gauges in an arc over the purchasing valve, left to right in the order rules run. */
export const GAUGES: Vector3[] = Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI * (0.88 - (i / 5) * 0.76)
  return v(VALVE.x + Math.cos(a) * (VALVE_R + 0.28), VALVE.y + Math.sin(a) * (VALVE_R + 0.28), VALVE.z + 0.18)
})
export const GAUGE_R = 0.18

/** Which gauge a rule lights, so one gauge always means one rule. */
export function gaugeFor(rule: string) {
  if (rule.startsWith('Grant is active')) return 0
  if (rule.startsWith('Not in the grant')) return 1
  if (rule.startsWith('Enough')) return 2
  if (rule.startsWith('Category')) return 3
  if (rule.startsWith('Under the card limit (')) return 4
  return 5
}

/** Where a packet that isn't money leaves or lands. */
export function anchor(id: string, out: Vector3) {
  if (id === 'a:purchasing') return out.set(VALVE.x, VALVE.y + VALVE_R + 0.5, VALVE.z)
  if (id === 'a:bookkeeping') return out.set(METER.x, METER.y + METER_R + 0.1, METER.z + 0.1)
  if (id === 'a:payment_report') return out.set(PUMP.x, PUMP.y + PUMP_R + 0.15, PUMP.z)
  if (id === 'p:grant_manager') return out.set(GM.x, GM.y + 0.7, GM.z)
  if (id === 'v:vendors') return out.set(6.9, H + 0.35, MAIN_Z)
  if (id === 'p:funder') return out.set(7.3, HEADER_Y + 0.25, HEADER_Z)
  if (id.startsWith('s:')) return out.set(METER.x, HEADER_Y - 0.1, HEADER_Z)
  if (id.startsWith('g:')) {
    const t = TANK_AT[id.slice(2)]
    return t ? out.set(t.x, TANK.h + 0.3, t.z) : out.set(0, 3, 0)
  }
  return out.set(-6.6, 0.55, 1.95) // the lab
}
