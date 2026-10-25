// The Ortiz Lab, a wet lab on one plinth: the PI's glass office with a
// whiteboard, a fume hood, a biosafety cabinet with a lit interior, an
// incubator over a shaker, the −80 °C freezer and the supply shelving
// along the back wall; two bench islands (purification and microbiology,
// then centrifuge, gel imager and gel box) with reagent shelving above, a
// sink and eyewash; the confocal bay; write-up desks; a delivery cart.
// Everything that never moves is merged into one mesh per material.

import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import { Vector3, type Group } from 'three'
import { Batch, roundedBox } from './batch'
import { crowd } from './crowd'
import { LAB_D, LAB_W, LAB_X, type V3 } from './layout'
import { M, tone } from './mats'
import { People } from './People'
import { reducedMotion } from './store'

const TOP = 0.9 // bench top height
const WALL_Z = -3.3

const cream = tone('#E4DED3', 0.86)
const cabinet = tone('#D9D2C6', 0.84)
const grey = tone('#C6CBD0', 0.6)
const white = tone('#F2F0EC', 0.7)
const plastic = tone('#E9ECEE', 0.55)
const blueCap = tone('#3E7CC4', 0.5)
const greenCap = tone('#4F9C80', 0.6)
const redCap = tone('#B4413A', 0.6)
const plant = tone('#5E8A5A', 0.85)
const pot = tone('#C9825F', 0.85)
const foam = tone('#F4F2EE', 0.95)
const ice = tone('#DCE9F1', 0.35)
const ink2 = tone('#2E5BA6', 0.6)
const ink3 = tone('#9C2E2A', 0.6)
const display = M.screen

/** Monitor on a stand, screen facing +z in its own frame. */
function monitor(b: Batch, p: V3, ry: number, w = 0.52) {
  b.at(p, ry, () => {
    b.box([0, 0.035, 0], [0.2, 0.02, 0.15], M.dark, 0.008)
    b.box([0, 0.15, -0.02], [0.04, 0.22, 0.03], M.dark, 0.01)
    b.box([0, 0.3, 0], [w, w * 0.6, 0.035], M.dark, 0.012)
    b.box([0, 0.3, 0.019], [w - 0.04, w * 0.6 - 0.04, 0.004], display, 0.002, undefined, false)
  })
}

/** An office chair; the seat's centre at the origin of its own frame, backrest at -z. */
function chair(b: Batch, p: V3, ry: number, back = true) {
  b.at(p, ry, () => {
    b.cyl([0, 0.03, 0], 0.26, 0.03, M.rubber, 5)
    b.cyl([0, 0.22, 0], 0.025, 0.36, M.steel, 10)
    b.box([0, 0.42, 0], [0.44, 0.07, 0.44], M.slateDeep, 0.03)
    if (back) {
      b.box([0, 0.55, -0.2], [0.04, 0.2, 0.03], M.steel, 0.01)
      b.box([0, 0.78, -0.22], [0.42, 0.36, 0.06], M.slateDeep, 0.03)
    }
  })
}

/** A desk along the left edge with a monitor, keyboard and papers; the user sits at +x. */
function desk(b: Batch, x: number, z: number, cozy = false) {
  b.at([x, 0, z], 0, () => {
    b.box([0, 0.73, 0], [0.62, 0.04, 1.12], M.wood, 0.012)
    for (const dz of [-0.5, 0.5]) b.box([-0.26, 0.36, dz], [0.05, 0.72, 0.05], M.steel, 0.01)
    b.box([-0.26, 0.36, 0], [0.04, 0.5, 1.0], cabinet, 0.01)
    monitor(b, [-0.15, 0.75, 0], Math.PI / 2)
    b.box([0.12, 0.765, 0], [0.16, 0.018, 0.42], M.dark, 0.006)
    b.box([0.14, 0.762, 0.33], [0.07, 0.02, 0.1], M.dark, 0.008)
    b.box([0.05, 0.76, -0.38], [0.22, 0.02, 0.3], M.paper, 0.004, [0, 0.2, 0])
    b.cyl([0.1, 0.8, 0.42], 0.04, 0.09, cozy ? M.glazeRefine : M.porcelain, 14)
    if (cozy) {
      b.cyl([-0.18, 0.82, -0.44], 0.07, 0.14, pot, 14, undefined, 0.055)
      b.ball([-0.18, 0.95, -0.44], 0.1, plant, [1, 0.9, 1])
    }
  })
}

/** Bench cabinets under a black epoxy top, centred at the origin of the current frame. */
function bench(b: Batch, len: number, depth: number) {
  b.box([0, TOP - 0.47, 0], [len, TOP - 0.12, depth - 0.06], cabinet, 0.02)
  b.box([0, 0.04, 0], [len - 0.06, 0.08, depth - 0.14], M.slateDeep, 0.01)
  b.box([0, TOP - 0.02, 0], [len + 0.04, 0.05, depth + 0.02], M.epoxy, 0.012)
  // Door and drawer seams on both long faces.
  const n = Math.max(2, Math.round(len / 0.6))
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len / n) * (i + 0.5)
    for (const s of [-1, 1]) {
      b.box([x, TOP - 0.2, s * (depth / 2 - 0.025)], [len / n - 0.05, 0.14, 0.012], cream, 0.006, undefined, false)
      b.box([x, TOP - 0.55, s * (depth / 2 - 0.025)], [len / n - 0.05, 0.42, 0.012], cream, 0.006, undefined, false)
      b.box([x, TOP - 0.16, s * (depth / 2 - 0.01)], [0.12, 0.018, 0.02], M.steel, 0.006, undefined, false)
    }
  }
}

function bottle(b: Batch, p: V3, h: number, glass: typeof M.amber, cap: typeof blueCap, r = 0.045) {
  b.cyl([p[0], p[1] + h / 2, p[2]], r, h, glass, 14)
  b.cyl([p[0], p[1] + h + 0.02, p[2]], r * 0.5, 0.04, cap, 10)
}

function rack(b: Batch, p: V3, colors: (typeof blueCap)[]) {
  b.box([p[0], p[1] + 0.03, p[2]], [0.26, 0.05, 0.1], plastic, 0.01)
  colors.forEach((m, i) => b.cyl([p[0] - 0.1 + i * 0.05, p[1] + 0.08, p[2]], 0.012, 0.09, m, 8))
}

function build(): ReturnType<Batch['build']> {
  const b = new Batch()

  // ── Plinth, floor, back wall ───────────────────────────────────────────
  b.box([LAB_X, -0.55, 0], [LAB_W, 1.1, LAB_D], M.labBody, 0.06)
  b.box([LAB_X, -0.005, 0], [LAB_W - 0.12, 0.02, LAB_D - 0.12], M.floor, 0.008, undefined, false)
  b.box([LAB_X, 1.15, WALL_Z], [LAB_W, 2.3, 0.1], M.wall, 0.03)
  b.box([LAB_X, 0.05, WALL_Z + 0.06], [LAB_W - 0.05, 0.1, 0.03], M.clayDeep, 0.01, undefined, false)

  // ── PI office: glass partitions, whiteboard, desk, bookcase ─────────────
  b.box([-8.92, 0.006, -2.42], [2.3, 0.012, 1.72], tone('#D8D0C2', 0.95), 0.004, undefined, false)
  b.box([-7.75, 0.97, -2.42], [0.035, 1.86, 1.66], M.window, 0.008, undefined, false)
  b.box([-9.48, 0.97, -1.56], [1.1, 1.86, 0.035], M.window, 0.008, undefined, false)
  for (const p of [
    [-7.75, -1.56],
    [-7.75, -3.24],
    [-8.93, -1.56],
    [-10.02, -1.56],
  ] as const)
    b.box([p[0], 0.97, p[1]], [0.05, 1.94, 0.05], M.steel, 0.01)
  b.box([-7.75, 1.93, -2.42], [0.06, 0.05, 1.7], M.steel, 0.01)
  b.box([-9.48, 1.93, -1.56], [1.12, 0.05, 0.06], M.steel, 0.01)
  // Whiteboard with aim 3 sketched on it: boxes, arrows and lines, no words.
  b.box([-8.72, 1.45, WALL_Z + 0.07], [1.44, 0.92, 0.03], M.steel, 0.01)
  b.box([-8.72, 1.45, WALL_Z + 0.085], [1.38, 0.86, 0.01], M.board, 0.004, undefined, false)
  b.box([-8.72, 0.99, WALL_Z + 0.12], [1.1, 0.025, 0.06], M.steel, 0.006)
  for (const [x, y, w, m] of [
    [-9.18, 1.72, 0.3, M.ink],
    [-9.2, 1.62, 0.22, M.ink],
    [-8.62, 1.7, 0.36, ink2],
    [-8.72, 1.46, 0.6, M.ink],
    [-9.05, 1.3, 0.28, ink3],
    [-8.4, 1.3, 0.3, ink2],
    [-8.75, 1.15, 0.44, M.ink],
  ] as const)
    b.box([x, y, WALL_Z + 0.093], [w, 0.012, 0.004], m, 0.002, undefined, false)
  for (const [x, y] of [
    [-9.2, 1.5],
    [-8.28, 1.52],
    [-8.75, 1.62],
  ] as const) {
    b.box([x, y, WALL_Z + 0.093], [0.2, 0.012, 0.004], M.ink, 0.002, undefined, false)
    b.box([x, y - 0.1, WALL_Z + 0.093], [0.2, 0.012, 0.004], M.ink, 0.002, undefined, false)
    b.box([x - 0.1, y - 0.05, WALL_Z + 0.093], [0.012, 0.1, 0.004], M.ink, 0.002, undefined, false)
    b.box([x + 0.1, y - 0.05, WALL_Z + 0.093], [0.012, 0.1, 0.004], M.ink, 0.002, undefined, false)
  }
  b.at([-9.72, 0, -2.42], 0, () => {
    b.box([0, 0.73, 0], [0.62, 0.04, 1.12], M.wood, 0.012)
    for (const dx of [-0.26, 0.26]) for (const dz of [-0.5, 0.5]) b.box([dx, 0.36, dz], [0.04, 0.72, 0.04], M.steel, 0.008)
    monitor(b, [-0.16, 0.75, 0.05], Math.PI / 2)
    b.box([0.12, 0.765, 0.05], [0.16, 0.018, 0.42], M.dark, 0.006)
    b.box([0.04, 0.765, -0.38], [0.24, 0.03, 0.32], M.paper, 0.004, [0, -0.15, 0])
    b.box([0.06, 0.79, -0.4], [0.2, 0.02, 0.28], tone('#E8E2D5', 0.8), 0.004, [0, 0.1, 0])
    b.cyl([0.12, 0.8, 0.44], 0.04, 0.09, M.glazeHold, 14)
    b.cyl([-0.2, 0.82, 0.44], 0.07, 0.14, pot, 14, undefined, 0.055)
    b.ball([-0.2, 0.96, 0.44], 0.11, plant, [1, 0.9, 1])
  })
  chair(b, [-9.2, 0, -2.42], -Math.PI / 2)
  b.at([-9.82, 0, -3.06], 0, () => {
    b.box([0, 0.7, 0], [0.42, 1.4, 0.32], M.wood, 0.02)
    for (const y of [0.42, 0.82, 1.2]) {
      b.box([0, y, 0.03], [0.36, 0.3, 0.28], tone('#9A7552', 0.85), 0.01, undefined, false)
      const cols = [ink2, M.clayDeep, ink3, M.slate, greenCap]
      for (let i = 0; i < 5; i++) b.box([-0.14 + i * 0.065, y - 0.02 + (i % 2) * 0.02, 0.06], [0.05, 0.22 + (i % 3) * 0.03, 0.2], cols[(i + Math.round(y * 10)) % 5], 0.008)
    }
  })

  // ── Back wall equipment ────────────────────────────────────────────────
  // Fume hood: base cabinet, lit work chamber behind a sash, exhaust duct.
  b.at([-6.85, 0, -2.83], 0, () => {
    b.box([0, 0.44, 0], [1.4, 0.88, 0.8], cabinet, 0.02)
    b.box([0, 0.9, 0], [1.42, 0.05, 0.82], M.epoxy, 0.01)
    b.box([-0.68, 1.55, 0], [0.06, 1.3, 0.84], white, 0.02)
    b.box([0.68, 1.55, 0], [0.06, 1.3, 0.84], white, 0.02)
    b.box([0, 1.55, -0.38], [1.32, 1.3, 0.05], M.cabinetLight, 0.01)
    b.box([0, 2.07, 0.02], [1.42, 0.28, 0.82], white, 0.02)
    b.box([0, 1.6, 0.39], [1.3, 0.62, 0.025], M.window, 0.006, undefined, false)
    b.box([0, 1.29, 0.4], [1.3, 0.04, 0.04], M.steel, 0.01)
    b.box([0, 2.3, -0.2], [0.3, 0.2, 0.3], M.steel, 0.02)
    b.box([0, 0.2, 0.405], [1.2, 0.02, 0.02], M.steel, 0.005, undefined, false)
    bottle(b, [-0.4, 0.92, -0.1], 0.22, M.amber, M.cap)
    bottle(b, [-0.25, 0.92, -0.15], 0.18, M.clear, redCap, 0.05)
    b.box([0.25, 0.97, -0.05], [0.3, 0.1, 0.22], plastic, 0.01)
  })
  // Biosafety cabinet: on a stand, lit work surface, sloped sash.
  b.at([-5.3, 0, -2.85], 0, () => {
    for (const dx of [-0.62, 0.62]) for (const dz of [-0.3, 0.3]) b.box([dx, 0.37, dz], [0.06, 0.74, 0.06], M.steel, 0.01)
    b.box([0, 0.7, 0], [1.38, 0.06, 0.74], M.steel, 0.01)
    b.box([0, 0.78, -0.02], [1.4, 0.12, 0.78], white, 0.02)
    b.box([0, 0.86, 0], [1.26, 0.02, 0.66], M.steel, 0.006)
    b.box([-0.67, 1.32, 0], [0.06, 0.96, 0.78], white, 0.02)
    b.box([0.67, 1.32, 0], [0.06, 0.96, 0.78], white, 0.02)
    b.box([0, 1.32, -0.37], [1.28, 0.96, 0.04], M.cabinetLight, 0.01)
    b.box([0, 1.96, 0], [1.4, 0.34, 0.8], white, 0.02)
    b.box([0, 1.6, 0.35], [1.28, 0.48, 0.02], M.window, 0.006, [-0.22, 0, 0], false)
    b.box([0, 1.84, 0.41], [1.3, 0.05, 0.03], M.steel, 0.01)
    b.box([0.45, 1.96, 0.405], [0.24, 0.07, 0.01], display, 0.004, undefined, false)
    // Plates in a stack, a bottle of broth, a pipette aid.
    for (let i = 0; i < 4; i++) b.cyl([-0.32, 0.885 + i * 0.018, -0.05], 0.06, 0.016, M.agar, 18)
    bottle(b, [0.05, 0.87, -0.15], 0.2, M.clear, blueCap, 0.05)
    b.cyl([0.32, 0.9, 0.05], 0.03, 0.05, plastic, 10)
  })
  // Incubator over a shaker.
  b.at([-4.05, 0, -2.88], 0, () => {
    b.box([0, 0.42, 0], [0.76, 0.84, 0.72], white, 0.03)
    b.box([0, 0.72, 0.36], [0.6, 0.16, 0.02], M.window, 0.006, undefined, false)
    b.box([0.24, 0.3, 0.365], [0.14, 0.05, 0.01], display, 0.004, undefined, false)
    b.box([0, 1.3, 0], [0.76, 0.9, 0.72], grey, 0.03)
    b.box([0, 1.3, 0.37], [0.66, 0.78, 0.025], white, 0.02)
    b.box([0.3, 1.3, 0.39], [0.03, 0.34, 0.03], M.steel, 0.01)
    b.box([-0.18, 1.62, 0.385], [0.2, 0.07, 0.01], display, 0.004, undefined, false)
  })
  // −80 °C freezer body (the door moves, below).
  b.at([-3.05, 0, -2.86], 0, () => {
    b.box([0, 0.98, 0], [0.9, 1.96, 0.78], white, 0.03)
    b.box([0, 0.08, 0.38], [0.8, 0.1, 0.03], M.slateDeep, 0.01)
    b.box([0, 1.88, 0.395], [0.3, 0.1, 0.012], M.dark, 0.006)
    b.box([0.06, 1.88, 0.402], [0.12, 0.05, 0.004], tone('#9CE0B5', 0.4), 0.002, undefined, false)
  })
  // Supply shelving: gloves, tips, cartons, bottles.
  b.at([-1.88, 0, -3.0], 0, () => {
    for (const dx of [-0.56, 0.56]) for (const dz of [-0.22, 0.22]) b.box([dx, 1.0, dz], [0.035, 2.0, 0.035], M.steel, 0.008)
    const shelves = [0.12, 0.55, 0.98, 1.41, 1.84]
    for (const y of shelves) b.box([0, y, 0], [1.16, 0.03, 0.5], M.steel, 0.008)
    for (let i = 0; i < 4; i++) b.box([-0.4 + i * 0.25, 0.63, 0.04], [0.22, 0.12, 0.13], M.glovesBox, 0.01)
    for (let i = 0; i < 4; i++) {
      b.box([-0.4 + i * 0.25, 1.03, 0.05], [0.2, 0.07, 0.13], M.dark, 0.01)
      b.box([-0.4 + i * 0.25, 1.08, 0.05], [0.205, 0.03, 0.135], M.tipLid, 0.008)
    }
    b.box([-0.3, 1.58, 0.0], [0.42, 0.3, 0.36], M.carton, 0.02)
    b.box([0.22, 1.54, 0.02], [0.36, 0.22, 0.32], M.carton, 0.02)
    b.box([-0.25, 0.3, 0.0], [0.5, 0.3, 0.38], M.carton, 0.02)
    for (let i = 0; i < 3; i++) bottle(b, [0.2 + i * 0.12, 0.14, 0.05], 0.24, M.amber, M.cap, 0.05)
    for (let i = 0; i < 4; i++) bottle(b, [-0.42 + i * 0.1, 1.86, 0.06], 0.16, M.clear, [blueCap, greenCap, redCap, blueCap][i], 0.04)
  })

  // ── Island A: purification (Sam) and microbiology (Priya), sink at the left end ──
  b.at([-5.2, 0, -0.55], 0, () => {
    bench(b, 3.6, 0.8)
    // Reagent shelving above the bench.
    for (const dx of [-1.72, 0, 1.72]) b.box([dx, 1.36, 0], [0.04, 0.92, 0.04], M.steel, 0.008)
    for (const y of [1.38, 1.72]) b.box([0, y, 0], [3.5, 0.03, 0.28], M.steel, 0.008)
    const glass = [M.amber, M.clear, M.amber, M.clear, M.clear, M.amber]
    const caps = [M.cap, blueCap, M.cap, redCap, greenCap, M.cap]
    for (let i = 0; i < 14; i++) {
      const x = -1.6 + i * 0.235
      const y = i % 2 ? 1.395 : 1.735
      bottle(b, [x, y, (i % 3) * 0.04 - 0.04], 0.13 + (i % 3) * 0.03, glass[i % 6], caps[i % 6], 0.036)
    }
    // Sam's FPLC: the pump and display tower, a glass column, a fraction collector.
    b.at([-1.25, TOP, -0.12], 0, () => {
      b.box([0, 0.22, 0], [0.5, 0.42, 0.32], white, 0.03)
      b.box([0, 0.36, 0.165], [0.3, 0.12, 0.01], display, 0.004, undefined, false)
      b.box([-0.12, 0.16, 0.165], [0.12, 0.1, 0.01], M.dark, 0.004, undefined, false)
      b.cyl([0.33, 0.25, 0.05], 0.03, 0.42, M.clear, 14)
      b.cyl([0.33, 0.2, 0.05], 0.022, 0.24, tone('#B9D4E8', 0.3), 12)
      b.box([0.33, 0.48, 0.05], [0.1, 0.03, 0.06], M.steel, 0.01)
      b.box([0.33, 0.02, 0.05], [0.12, 0.03, 0.08], M.steel, 0.01)
      b.cyl([0.62, 0.06, 0.02], 0.13, 0.1, plastic, 20)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        b.cyl([0.62 + Math.cos(a) * 0.09, 0.13, 0.02 + Math.sin(a) * 0.09], 0.012, 0.06, M.clear, 8)
      }
    })
    // Ice bucket with tubes, tube racks, a pipette box.
    b.at([-0.55, TOP, -0.2], 0, () => {
      b.box([0, 0.07, 0], [0.3, 0.14, 0.24], foam, 0.03)
      b.box([0, 0.14, 0], [0.26, 0.012, 0.2], ice, 0.01)
      for (let i = 0; i < 5; i++) b.cyl([-0.09 + i * 0.045, 0.17, -0.02 + (i % 2) * 0.05], 0.011, 0.07, [blueCap, plastic, redCap, plastic, greenCap][i], 8)
    })
    rack(b, [-0.95, TOP, -0.28], [blueCap, blueCap, plastic, redCap, plastic])
    rack(b, [-0.2, TOP, -0.3], [plastic, greenCap, plastic, plastic, blueCap])
    // Priya's side: syringe pump and chip stage, agar plates, a tip box, a 96-well plate.
    b.at([0.95, TOP, -0.18], 0, () => {
      b.box([0, 0.06, 0], [0.32, 0.12, 0.18], white, 0.02)
      b.cyl([0, 0.15, 0], 0.018, 0.26, M.clear, 10, [0, 0, Math.PI / 2])
      b.box([0.3, 0.02, 0], [0.18, 0.02, 0.1], M.clear, 0.005)
      b.box([0.3, 0.034, 0], [0.12, 0.006, 0.06], tone('#B9D4E8', 0.3), 0.002)
    })
    for (let i = 0; i < 3; i++) b.cyl([0.35 + i * 0.13, TOP + 0.01 + (i === 1 ? 0.016 : 0), -0.3], 0.055, 0.016, M.agar, 18)
    b.box([1.5, TOP + 0.04, -0.25], [0.2, 0.07, 0.13], M.dark, 0.01)
    b.box([1.5, TOP + 0.09, -0.25], [0.205, 0.03, 0.135], M.tipLid, 0.008)
    b.box([1.2, TOP + 0.015, -0.3], [0.13, 0.02, 0.09], M.wellPlate, 0.004)
    bottle(b, [1.6, TOP, 0.05], 0.18, M.clear, blueCap, 0.05)
  })
  // Sink cabinet with a gooseneck tap and an eyewash on the left end of island A.
  b.at([-7.3, 0, -0.55], 0, () => {
    b.box([0, 0.43, 0], [0.58, 0.86, 0.74], cabinet, 0.02)
    b.box([0, TOP - 0.02, 0], [0.62, 0.05, 0.82], M.epoxy, 0.012)
    b.box([0, TOP - 0.01, 0], [0.42, 0.04, 0.5], M.dark, 0.01, undefined, false)
    b.cyl([0, TOP + 0.18, -0.3], 0.018, 0.36, M.chrome, 10)
    b.ring([0, TOP + 0.36, -0.22], 0.08, 0.016, M.chrome, [0, Math.PI / 2, 0], Math.PI)
    b.cyl([0.2, TOP + 0.12, -0.3], 0.018, 0.24, M.eyewash, 10)
    b.cyl([0.2, TOP + 0.26, -0.27], 0.05, 0.04, M.eyewash, 14, undefined, 0.035)
    b.box([0.2, TOP + 0.38, -0.36], [0.16, 0.16, 0.01], M.eyewash, 0.004)
    b.box([-0.2, TOP + 0.38, -0.36], [0.12, 0.2, 0.06], white, 0.01)
  })

  // ── Island B: centrifuge, gel imager, gel box, pipettes ─────────────────
  b.at([-5.85, 0, 1.5], 0, () => {
    bench(b, 2.9, 0.8)
    // Centrifuge body (its lid moves, below).
    b.at([-1.13, TOP, -0.12], 0, () => {
      b.box([0, 0.13, 0], [0.5, 0.26, 0.5], white, 0.06)
      b.box([0, 0.12, 0.252], [0.24, 0.07, 0.01], display, 0.004, undefined, false)
    })
    // Gel imager: a dark hood with a viewing screen.
    b.at([-0.15, TOP, -0.05], 0, () => {
      b.box([0, 0.24, 0], [0.5, 0.48, 0.46], M.slate, 0.03)
      b.box([0, 0.3, -0.24], [0.42, 0.28, 0.03], M.dark, 0.01)
      b.box([0, 0.3, -0.256], [0.38, 0.24, 0.004], display, 0.002, undefined, false)
      b.box([0, 0.08, 0.235], [0.36, 0.06, 0.01], M.dark, 0.004, undefined, false)
    })
    // Gel tank and power supply.
    b.at([0.65, TOP, -0.15], 0, () => {
      b.box([0, 0.05, 0], [0.32, 0.1, 0.16], M.gelBlue, 0.01)
      b.box([0, 0.105, 0], [0.34, 0.02, 0.18], M.clear, 0.006)
      b.cyl([-0.1, 0.13, 0.06], 0.008, 0.04, redCap, 6)
      b.cyl([0.1, 0.13, 0.06], 0.008, 0.04, M.cap, 6)
      b.box([0.06, 0.08, 0.27], [0.24, 0.16, 0.18], grey, 0.02)
      b.box([0.06, 0.1, 0.362], [0.14, 0.05, 0.005], display, 0.002, undefined, false)
    })
    // Pipettes on a carousel stand.
    b.at([1.1, TOP, -0.1], 0, () => {
      b.cyl([0, 0.02, 0], 0.12, 0.03, plastic, 18)
      b.cyl([0, 0.2, 0], 0.012, 0.36, M.steel, 8)
      b.cyl([0, 0.34, 0], 0.09, 0.02, plastic, 18)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        b.cyl([Math.cos(a) * 0.08, 0.22, Math.sin(a) * 0.08], 0.013, 0.24, M.porcelain, 8)
        b.cyl([Math.cos(a) * 0.08, 0.35, Math.sin(a) * 0.08], 0.017, 0.03, [blueCap, greenCap, M.yellow, redCap, blueCap][i], 8)
      }
    })
    rack(b, [0.3, TOP, 0.22], [plastic, blueCap, plastic, greenCap, plastic])
    b.box([-0.62, TOP + 0.05, 0.2], [0.12, 0.1, 0.12], white, 0.03)
    b.cyl([-0.62, TOP + 0.12, 0.2], 0.03, 0.03, M.rubber, 12)
  })
  // Waste: a red biohazard bin by island B, a white bin between the desks.
  b.cyl([-7.56, 0.3, 1.5], 0.15, 0.6, M.bioRed, 18, undefined, 0.17)
  b.cyl([-7.56, 0.62, 1.5], 0.18, 0.04, M.bioRed, 18)
  b.cyl([-9.75, 0.25, 1.6], 0.13, 0.5, white, 16, undefined, 0.14)

  // ── Confocal bay ───────────────────────────────────────────────────────
  b.at([-3.05, 0, 1.45], 0, () => {
    for (const dx of [-0.48, 0.48]) for (const dz of [-0.38, 0.38]) b.box([dx, 0.38, dz], [0.1, 0.76, 0.1], M.slateDeep, 0.02)
    b.box([0, 0.8, 0], [1.1, 0.1, 0.9], M.slate, 0.02)
    b.box([0, 0.86, 0], [1.06, 0.02, 0.86], tone('#5B6672', 0.5), 0.006, undefined, false)
    // Inverted microscope: base, pillar, stage, turret, eyepieces toward the stool.
    b.at([0, 0.87, -0.12], 0, () => {
      b.box([0, 0.08, 0], [0.42, 0.16, 0.34], white, 0.03)
      b.box([-0.14, 0.34, 0], [0.12, 0.4, 0.16], white, 0.03)
      b.box([0.02, 0.22, 0], [0.3, 0.025, 0.26], M.dark, 0.006)
      b.cyl([0.02, 0.17, 0], 0.035, 0.07, M.chrome, 12)
      b.box([0.12, 0.42, 0], [0.24, 0.1, 0.12], white, 0.03, [0, 0, -0.3])
      for (const dz of [-0.035, 0.035]) b.cyl([0.27, 0.48, dz], 0.018, 0.1, M.dark, 10, [0, 0, -1.0])
      b.box([-0.32, 0.36, 0], [0.24, 0.24, 0.3], M.slateDeep, 0.03)
    })
    // Scan head controller and a monitor turned toward the stool.
    b.box([-0.38, 0.97, 0.28], [0.22, 0.18, 0.24], M.slateDeep, 0.02)
    monitor(b, [0.15, 0.85, 0.3], -2.0, 0.42)
    b.box([0.35, 0.865, 0.22], [0.14, 0.016, 0.3], M.dark, 0.006, [0, 0.3, 0])
  })
  // Mateo's stool.
  b.at([-2.12, 0, 1.45], 0, () => {
    b.cyl([0, 0.03, 0], 0.22, 0.03, M.rubber, 5)
    b.cyl([0, 0.24, 0], 0.025, 0.42, M.steel, 10)
    b.cyl([0, 0.46, 0], 0.19, 0.07, M.slateDeep, 18)
  })

  // ── Write-up desks along the left edge ─────────────────────────────────
  desk(b, -9.75, 0.9, true)
  desk(b, -9.75, 2.3)
  chair(b, [-9.16, 0, 0.9], -Math.PI / 2)
  chair(b, [-9.16, 0, 2.3], -Math.PI / 2)

  // ── Delivery cart in the front-right corner ────────────────────────────
  b.at([-1.38, 0, 2.95], 0, () => {
    for (const dx of [-0.18, 0.18]) for (const dz of [-0.3, 0.3]) b.cyl([dx, 0.05, dz], 0.05, 0.03, M.rubber, 10, [Math.PI / 2, 0, 0])
    b.box([0, 0.16, 0], [0.46, 0.05, 0.72], M.slate, 0.01)
    b.box([0.2, 0.55, 0], [0.03, 0.8, 0.5], M.steel, 0.01)
    b.box([-0.02, 0.33, -0.08], [0.38, 0.28, 0.34], M.carton, 0.02)
    b.box([-0.02, 0.6, -0.1], [0.3, 0.26, 0.28], M.carton, 0.02, [0, 0.2, 0])
    b.box([-0.02, 0.476, -0.08], [0.07, 0.008, 0.342], M.tape, 0.002, undefined, false)
    b.box([0, 0.27, 0.2], [0.3, 0.18, 0.24], M.glovesBox, 0.015)
  })

  // Lab-wide: a floor drain and a hazard stripe in front of the freezer.
  b.box([-3.05, 0.004, -2.18], [0.9, 0.006, 0.06], M.yellow, 0.002, undefined, false)
  return b.build()
}

// ── Moving parts ─────────────────────────────────────────────────────────

const FREEZER_SPOT = new Vector3(-2.86, 0, -1.9)
const SPIN_SPOT = new Vector3(-6.98, 0, 0.7)
const doorGeo = roundedBox([0.86, 1.58, 0.08], 0.03)
const handleGeo = roundedBox([0.04, 0.42, 0.05], 0.015)
const lidGeo = roundedBox([0.48, 0.05, 0.46], 0.02)
const shakerGeo = roundedBox([0.56, 0.03, 0.5], 0.01)
const flaskGeo = roundedBox([0.1, 0.12, 0.1], 0.045)

/** Equipment that answers to the people using it: the freezer door, the centrifuge lid, the shaker. */
function Moving() {
  const door = useRef<Group>(null)
  const lid = useRef<Group>(null)
  const shaker = useRef<Group>(null)
  const still = useMemo(reducedMotion, [])
  const state = useMemo(() => ({ door: 0, lid: 0, t: 0 }), [])
  useFrame((_, rdt) => {
    const dt = Math.min(rdt, 0.05)
    state.t += dt
    const jun = crowd.get('park')
    const sam = crowd.get('okafor')
    const k = still ? 1 : 1 - Math.exp(-dt * 3)
    // The freezer opens while Jun logs it, a little at a time (cold air), and shuts after.
    const openD = jun && jun.act === 'freezer' && !jun.walking && jun.pos.distanceTo(FREEZER_SPOT) < 0.4 ? 1.05 : 0
    state.door += (openD - state.door) * k
    if (door.current) door.current.rotation.y = -state.door
    const openL = sam && sam.act === 'load' && !sam.walking && sam.pos.distanceTo(SPIN_SPOT) < 0.4 ? 1.15 : 0
    state.lid += (openL - state.lid) * k
    if (lid.current) lid.current.rotation.x = -state.lid
    if (shaker.current && !still) {
      shaker.current.position.x = 0.012 * Math.sin(state.t * 9)
      shaker.current.position.z = 0.012 * Math.cos(state.t * 9)
    }
  })
  return (
    <>
      <group ref={door} position={[-3.5, 0.98, -2.47]}>
        <mesh geometry={doorGeo} material={M.porcelain} position={[0.44, -0.04, 0]} castShadow />
        <mesh geometry={handleGeo} material={M.steel} position={[0.8, 0.1, 0.06]} />
      </group>
      <group ref={lid} position={[-6.98, TOP + 0.26, 1.15]}>
        <mesh geometry={lidGeo} material={grey} position={[0, 0.02, 0.23]} castShadow />
      </group>
      <group position={[-4.05, 0.62, -2.82]}>
        <group ref={shaker}>
          <mesh geometry={shakerGeo} material={M.steel} />
          {[-0.16, 0, 0.16].map(x => (
            <mesh key={x} geometry={flaskGeo} material={M.clear} position={[x, 0.075, 0.02]} />
          ))}
        </group>
      </group>
    </>
  )
}


export const LabPlinth = memo(function LabPlinth() {
  const parts = useMemo(build, [])
  return (
    <group>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geo} material={p.mat} castShadow={p.shadow} receiveShadow />
      ))}
      <Moving />
      <People />
    </group>
  )
})
