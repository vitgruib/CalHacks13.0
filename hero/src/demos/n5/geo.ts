// Where the board's parts sit, and the shared clay. One unit is about a
// hand's width of table. Lanes run left (the lab) to right (the outside);
// the grants and the funder's slot sit at the head of the table, at the back.

import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, LatheGeometry, MeshStandardMaterial, SphereGeometry, Vector2 } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { R01, R21 } from '../../feed'
import { GLAZE, GRANT_COLOR, PAL } from '../a1/layout'

export { GLAZE, GRANT_COLOR, PAL }

// Lanes (z of each lane's centre line)
export const PZ = 2.3 // purchasing, nearest the camera
export const BZ = 0.3 // bookkeeping
export const RZ = -1.7 // payment & report
export const LANE_D = 1.3

export const TABLE = { x0: -8.3, x1: 8.3, z0: -4.75, z1: 3.75 }

// Purchasing: six rule stamps, then four outcome trays
export const SLOT_X = [-5.0, -3.8, -2.6, -1.4, -0.2, 1.0]
export const TRAY_X = [2.6, 3.9, 5.2, 6.5]
export const TRAY_NAME = ['Bought', 'Rerouted', 'Blocked', 'Held']
export const TRAY_GLAZE = [GLAZE.accept, GLAZE.refine, GLAZE.reject, GLAZE.hold]
export const STAGE_X = -6.3 // where a new card waits before the first stamp
export const LAB_X = -7.9 // under the "From the lab" hood
export const OUT_X = 7.9 // under the outside hood (vendors, sources)
export const REPLY_Z = PZ + 1.05 // the rail answers ride back to the lab

// Card sizes; marks sit in a row along a card's front edge
export const CARD = { w: 1.1, h: 0.14, d: 0.82 }
export const DOC = { w: 0.98, h: 0.12, d: 0.7 }
export const MARK_Z = 0.24
export const markX = (i: number) => -0.4 + i * 0.16
export const DOC_MARK = { x: 0.28, z: 0.17 }

// Bookkeeping and payment & report stations
export const BK_X = 2.6
export const BK_HOLD_X = 0.9
export const BK_FILED_X = -3.6
export const RP_X = -3.6
export const RP_HOLD_X = -2.0
export const RP_PILE_X = -0.3
export const PR_X = 3.2

// Grants and the funder's slot, at the head of the table
export const GZ = -3.45
export const GRANT_X: Record<string, number> = { [R01]: -1.8, [R21]: 1.8 }
export const COIN_H = 0.075
export const COIN_R = 0.34
export const PLATE_TOP = 0.08
export const FUNDER = { x: 0, y: 0.55, z: -4.2 } // a clay box on the table's back edge
export const SLOT_OUT = { x: 0, y: 0.72, z: -3.8 } // where coins drop out and payment requests go in
export const coinsFor = (received: number) => Math.max(1, Math.min(30, Math.round(received / 7000)))

// Feed-time durations (ms). The story plays at 4x, so these run a quarter as long on screen.
export const T = {
  enter: 2800,
  step: 600,
  press: 620,
  toTray: 2000,
  back: 2600,
  reply: 3800,
  side: 2900,
  hold: 1300,
  weight: 900,
  cloche: 3200,
  coinFall: 2000,
  coinGap: 380,
  coinStart: 1600,
  charge: 3400,
  notice: 3000,
  file: 1900,
  toFunder: 3000,
}

// ── Clay ──────────────────────────────────────────────────────────────────

const mats = new Map<string, MeshStandardMaterial>()
/** One matte clay material per colour, made once. */
export function clay(hex: string, roughness = 0.86) {
  const k = `${hex}:${roughness}`
  let m = mats.get(k)
  if (!m) {
    m = new MeshStandardMaterial({ color: new Color(hex), roughness, metalness: 0 })
    mats.set(k, m)
  }
  return m
}
/** Glazed ceramic: the outcome trays and the paperweights. */
export const glaze = (hex: string) => clay(hex, 0.38)

export const TONE = {
  table: '#E8E2D8',
  tableBody: '#D6CDBF',
  lane: '#D8CCBA',
  rail: '#CFC5B6',
  card: '#F5F1EB',
  invoice: '#E9DABD',
  paper: '#F3EFE6',
  pr: '#D3E6EA',
  canceled: '#DDB1AA',
  court: '#E6D3A6',
  coin: '#D8B255',
  wood: '#B8AD9F',
  slate: PAL.slate,
  ink: PAL.ink,
}

// ── Shared geometry ──────────────────────────────────────────────────────

const lifted = (g: BufferGeometry, y: number) => {
  g.translate(0, y, 0)
  return g
}
export const CARD_GEO = lifted(new RoundedBoxGeometry(CARD.w, CARD.h, CARD.d, 3, 0.05), CARD.h / 2)
export const DOC_GEO = lifted(new RoundedBoxGeometry(DOC.w, DOC.h, DOC.d, 3, 0.045), DOC.h / 2)
export const SLIP_GEO = lifted(new RoundedBoxGeometry(0.42, 0.07, 0.3, 2, 0.03), 0.035)
export const COIN_GEO = new CylinderGeometry(COIN_R, COIN_R, COIN_H * 0.92, 28)
export const BAR_GEO = new BoxGeometry(1, 1, 1)
export const DOME_GEO = (() => {
  const g = new SphereGeometry(0.2, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  g.scale(1, 0.7, 1)
  return g
})()
export const KNOB_GEO = new SphereGeometry(0.06, 14, 10)

/** A stroke lying flat on a card, from (x0, z0) to (x1, z1). */
function stroke(x0: number, z0: number, x1: number, z1: number, w = 0.032, h = 0.022) {
  const dx = x1 - x0
  const dz = z1 - z0
  const L = Math.hypot(dx, dz) + w * 0.6
  const g = new BoxGeometry(L, h, w)
  g.rotateY(Math.atan2(-dz, dx))
  g.translate((x0 + x1) / 2, h / 2, (z0 + z1) / 2)
  return g
}
export const TICK_GEO = mergeGeometries([stroke(-0.058, -0.004, -0.018, 0.042), stroke(-0.018, 0.042, 0.062, -0.052)])!
export const CROSS_GEO = mergeGeometries([stroke(-0.05, -0.05, 0.05, 0.05), stroke(-0.05, 0.05, 0.05, -0.05)])!

/** The bell jar over a frozen grant: straight sides, a rounded top, open at the bottom. */
export const CLOCHE_GEO = (() => {
  const pts: Vector2[] = []
  const r = 0.66
  const side = 1.55
  for (let i = 0; i <= 6; i++) pts.push(new Vector2(r, (side * i) / 6))
  for (let i = 1; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2)
    pts.push(new Vector2(Math.max(0.001, r * Math.cos(a)), side + 0.5 * Math.sin(a)))
  }
  return new LatheGeometry(pts, 40)
})()

export const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
export const easeOut = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - (1 - x) ** 3)
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
