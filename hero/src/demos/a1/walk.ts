// Where each researcher should be, and how they get there. A researcher's
// feed task picks a short loop of stations; feed time picks the step, so a
// jump (?at, a chapter) lands everyone where their task puts them. Walking
// follows the aisle graph, keeps right, and steps aside for whoever is near.

import { NEXT, NODES_XZ, SPOTS, type Action } from './layout'

export type Carry = 'box' | 'rack' | null
export interface Step {
  spot: string
  act: Action
  carry?: Carry
}

type Plan = [RegExp, Step[]][]
const PLANS: Record<string, Plan> = {
  ortiz: [
    [/progress report/i, [{ spot: 'pidesk', act: 'type' }]],
    [/gel images/i, [{ spot: 'samside', act: 'look' }]],
    [/whiteboard/i, [{ spot: 'wb', act: 'write' }, { spot: 'wb', act: 'write' }, { spot: 'wb', act: 'look' }]],
    [/reviewer/i, [{ spot: 'pidesk', act: 'read' }]],
  ],
  okafor: [
    [/Ni-NTA/i, [{ spot: 'fplc', act: 'pipette' }, { spot: 'fplc', act: 'adjust' }]],
    [/SDS-PAGE/i, [{ spot: 'gelrig', act: 'pipette' }]],
    [/membranes/i, [{ spot: 'centrifuge', act: 'load' }, { spot: 'fplc', act: 'swirl' }]],
    [/folding/i, [{ spot: 'fplc', act: 'pipette' }, { spot: 'centrifuge', act: 'load' }]],
  ],
  raman: [
    [/Plating/i, [{ spot: 'bsc', act: 'cabinet' }]],
    [/MIC/i, [{ spot: 'micro', act: 'read' }]],
    [/microfluidic/i, [{ spot: 'micro', act: 'pipette' }]],
    [/Logging assay/i, [{ spot: 'desk2', act: 'type' }]],
  ],
  silva: [
    [/Imaging/i, [{ spot: 'scope', act: 'scope' }]],
    [/Calibrating/i, [{ spot: 'scope', act: 'adjust' }]],
    [/Stitching/i, [{ spot: 'baypc', act: 'type' }]],
    [/Exporting/i, [{ spot: 'desk1', act: 'type' }]],
  ],
  park: [
    [/reagent stock/i, [{ spot: 'shelves', act: 'reach' }, { spot: 'restockA', act: 'reach' }]],
    [/freezer/i, [{ spot: 'freezer', act: 'freezer' }]],
    [/delivery/i, [{ spot: 'door', act: 'pickup' }, { spot: 'shelves', act: 'place', carry: 'box' }]],
    [/pipette tips/i, [{ spot: 'shelves', act: 'reach' }, { spot: 'restockB', act: 'place', carry: 'rack' }, { spot: 'restockA', act: 'place', carry: 'rack' }]],
  ],
}
const STEP_MS: Record<string, number> = { ortiz: 9000, okafor: 7500, raman: 8000, silva: 8000, park: 5600 }
const PHASE: Record<string, number> = { ortiz: 0, okafor: 2100, raman: 4300, silva: 1300, park: 3100 }
const HOME_STEP: Record<string, Step> = {
  ortiz: { spot: 'pidesk', act: 'type' },
  okafor: { spot: 'fplc', act: 'pipette' },
  raman: { spot: 'bsc', act: 'cabinet' },
  silva: { spot: 'scope', act: 'scope' },
  park: { spot: 'shelves', act: 'reach' },
}

/** The station and action a task puts this researcher at, at feed time t. */
export function planFor(id: string, task: string, t: number): Step {
  const plan = PLANS[id]
  const steps = plan?.find(([re]) => re.test(task))?.[1]
  if (!steps) return HOME_STEP[id] ?? { spot: 'fplc', act: 'stand' }
  const n = Math.floor((t + (PHASE[id] ?? 0)) / (STEP_MS[id] ?? 8000))
  return steps[((n % steps.length) + steps.length) % steps.length]
}

// ── The walker ───────────────────────────────────────────────────────────

const MAXP = 16
export interface Walker {
  id: string
  x: number
  z: number
  yaw: number
  spot: string
  act: Action
  carry: Carry
  carryUntil: number // feed time the carried thing is put down
  px: Float32Array // path points
  pz: Float32Array
  pn: Int16Array // the junction each point is (-1 for a spot or the start)
  n: number
  i: number // heading to point i
  moving: boolean
  arrivedAt: number
  side: number // lateral offset, smoothed
  gait: number // walk cycle phase, radians
  speed: number // current speed, smoothed (m/s)
  sit: number // 0 standing .. 1 seated
  ready: boolean
}

export function makeWalker(id: string): Walker {
  return {
    id,
    x: 0,
    z: 0,
    yaw: 0,
    spot: '',
    act: 'stand',
    carry: null,
    carryUntil: 0,
    px: new Float32Array(MAXP),
    pz: new Float32Array(MAXP),
    pn: new Int16Array(MAXP),
    n: 0,
    i: 0,
    moving: false,
    arrivedAt: -1e9,
    side: 0,
    gait: 0,
    speed: 0,
    sit: 0,
    ready: false,
  }
}

function push(w: Walker, x: number, z: number, node: number) {
  if (w.n >= MAXP) return
  w.px[w.n] = x
  w.pz[w.n] = z
  w.pn[w.n] = node
  w.n++
}

/** Plan a route from where the walker is to `spot` along the aisles. */
function route(w: Walker, spot: string) {
  const to = SPOTS[spot]
  let from = -1
  if (w.moving && w.i < w.n) {
    // Mid-walk: carry on to the junction ahead (or back to the last one), then re-route.
    for (let k = w.i; k < w.n; k++)
      if (w.pn[k] >= 0) {
        from = w.pn[k]
        break
      }
    if (from < 0) for (let k = w.i - 1; k >= 0; k--) if (w.pn[k] >= 0) {
      from = w.pn[k]
      break
    }
  }
  if (from < 0) from = SPOTS[w.spot]?.node ?? to.node
  w.n = 0
  w.i = 1
  push(w, w.x, w.z, -1)
  let cur = from
  push(w, NODES_XZ[cur][0], NODES_XZ[cur][1], cur)
  let guard = 0
  while (cur !== to.node && guard++ < 20) {
    cur = NEXT[cur][to.node]
    if (cur < 0) break
    push(w, NODES_XZ[cur][0], NODES_XZ[cur][1], cur)
  }
  push(w, to.at[0], to.at[1], -1)
  w.moving = true
}

function snap(w: Walker, spot: string) {
  const s = SPOTS[spot]
  w.x = s.at[0]
  w.z = s.at[1]
  w.yaw = s.yaw
  w.moving = false
  w.n = 0
  w.side = 0
  w.speed = 0
  w.sit = s.sit ? 1 : 0
}

const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const STRIDE = 0.66 // metres per step

/**
 * Advance one walker by dt feed ms toward `step`. `halt` freezes it in place (sending something).
 * `jump` puts it straight there (first frame, a time jump, or reduced motion).
 */
export function stepWalker(w: Walker, step: Step, t: number, dt: number, others: Walker[], halt: boolean, jump: boolean) {
  const target = SPOTS[step.spot] ? step.spot : 'fplc'
  if (!w.ready || jump) {
    w.ready = true
    w.spot = target
    w.act = step.act
    w.carry = null
    snap(w, target)
    w.arrivedAt = t - 5000
    return
  }
  if (target !== w.spot) {
    const prevSit = SPOTS[w.spot]?.sit
    if (step.carry) {
      w.carry = step.carry
      w.carryUntil = Infinity
    }
    route(w, target)
    w.spot = target
    if (prevSit) w.speed = 0
  }
  w.act = step.act
  const s = SPOTS[w.spot]
  const sec = Math.min(dt, 100) / 1000

  // Stand up before walking off; sit once there.
  const wantSit = !w.moving && !!s.sit
  w.sit += ((wantSit ? 1 : 0) - w.sit) * Math.min(1, sec * 4.5)
  if (w.moving && w.sit > 0.08) return

  if (w.moving && !halt) {
    // Polite passing: slow behind someone, step aside for anyone close.
    let slow = 1
    let push = 0.16 // keep right
    const hx = w.px[w.i] - w.x
    const hz = w.pz[w.i] - w.z
    const hl = Math.hypot(hx, hz) || 1
    const dx = hx / hl
    const dz = hz / hl
    for (const o of others) {
      if (o === w) continue
      const ox = o.x - w.x
      const oz = o.z - w.z
      const d = Math.hypot(ox, oz)
      if (d > 1.1 || d < 1e-4) continue
      const ahead = (ox * dx + oz * dz) / d
      if (ahead < -0.2) continue
      const cross = dx * oz - dz * ox // > 0: they are on our right, so step left
      push += (cross > 0 ? -1 : 1) * (1.1 - d) * 0.55
      if (ahead > 0.8 && d < 0.75 && (!o.moving || o.speed < w.speed)) slow = Math.min(slow, 0.35)
    }
    push = Math.max(-0.42, Math.min(0.42, push))
    const want = (w.id === 'park' ? 1.3 : 1.12) * slow
    w.speed += (want - w.speed) * Math.min(1, sec * 3)
    let left = w.speed * sec
    while (left > 0 && w.i < w.n) {
      const ax = w.px[w.i] - w.x
      const az = w.pz[w.i] - w.z
      const l = Math.hypot(ax, az)
      if (l <= left) {
        w.x = w.px[w.i]
        w.z = w.pz[w.i]
        left -= l
        w.i++
      } else {
        w.x += (ax / l) * left
        w.z += (az / l) * left
        left = 0
      }
    }
    w.gait += ((w.speed * sec) / STRIDE) * Math.PI
    // Fade the sideways step out near the end of the walk.
    let rem = 0
    for (let k = w.i; k < w.n; k++) rem += Math.hypot(w.px[k] - (k === w.i ? w.x : w.px[k - 1]), w.pz[k] - (k === w.i ? w.z : w.pz[k - 1]))
    const fade = Math.min(1, rem / 0.8)
    w.side += (push * fade - w.side) * Math.min(1, sec * 4)
    w.yaw += angle(Math.atan2(dx, dz) - w.yaw) * Math.min(1, sec * 7)
    if (w.i >= w.n) {
      w.moving = false
      w.arrivedAt = t
      w.speed = 0
    }
  } else if (!w.moving) {
    w.side *= 1 - Math.min(1, sec * 4)
    w.yaw += angle(s.yaw - w.yaw) * Math.min(1, sec * 5)
    w.speed = 0
  } else {
    w.speed *= 1 - Math.min(1, sec * 8)
  }
  // Put down what was carried a moment after arriving.
  if (w.carry && !w.moving && w.carryUntil === Infinity) w.carryUntil = t + 1600
  if (w.carry && t > w.carryUntil) w.carry = null
}

/** The walker's position with its sideways step applied (right of its heading). */
export function placeOf(w: Walker): [number, number] {
  const rx = -Math.cos(w.yaw)
  const rz = Math.sin(w.yaw)
  return [w.x + rx * w.side, w.z + rz * w.side]
}
