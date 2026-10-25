// The wet lab on its clay plinth: the PI's glass-walled office with a
// whiteboard, two bench rows with reagent shelving over the first, a back run
// of fume hood, biosafety cabinet, sink and eyewash, the -80 °C freezer and
// supply shelving, write-up desks along the left wall, a confocal bay at the
// front right, and the intake post where requests leave for the network.
// Static furniture is baked into a handful of meshes (see bake.ts).

import { useFrame } from '@react-three/fiber'
import { memo, useRef } from 'react'
import type { Group } from 'three'
import { LAB, PICKUP, PLINTH_H, PAL } from './layout'
import { Bake, bake, shade } from './bake'
import { CLAY, METAL, M } from './mats'
import { Researchers } from './People'
import { fx, reducedMotion } from './store'

const TOP = '#5F666E' // bench tops: dark epoxy, so the white kit on them reads
const CAB = '#E3DDD3'
const CAB_D = shade(CAB, -0.06)
const STEEL = '#B9C0C8'
const WALL = '#E6E0D6'
const BENCH_H = 0.92

/** A bench: base cabinets with drawers on the camera side, a dark top. */
function bench(b: Bake, x0: number, x1: number, zc: number, d: number, drawersBack = false) {
  const w = x1 - x0
  const xc = (x0 + x1) / 2
  b.box([xc, 0.45, zc], [w - 0.04, 0.82, d - 0.1], CAB, 0.03)
  b.box([xc, 0.04, zc], [w - 0.12, 0.08, d - 0.2], shade(CAB, -0.15), 0.01)
  b.box([xc, BENCH_H - 0.03, zc], [w, 0.06, d], TOP, 0.02)
  const n = Math.max(2, Math.round(w / 0.62))
  for (const side of drawersBack ? [1, -1] : [1]) {
    const z = zc + side * ((d - 0.1) / 2 + 0.006)
    for (let i = 0; i < n; i++) {
      const x = x0 + (w / n) * (i + 0.5)
      b.box([x, 0.66, z], [w / n - 0.05, 0.2, 0.014], CAB_D, 0.008)
      b.box([x, 0.3, z], [w / n - 0.05, 0.44, 0.014], CAB_D, 0.008)
      b.box([x, 0.71, z + side * 0.012], [0.14, 0.022, 0.016], '#8C949D', 0.006)
      b.box([x, 0.47, z + side * 0.012], [0.14, 0.022, 0.016], '#8C949D', 0.006)
    }
  }
}

/** A low reagent shelf over a bench: two uprights, one board, bottles and boxes on it. */
function shelf(b: Bake, x0: number, x1: number, z: number, seed: number) {
  const w = x1 - x0
  for (const x of [x0 + 0.04, x1 - 0.04]) b.box([x, 1.17, z], [0.035, 0.5, 0.035], STEEL, 0.008)
  b.box([(x0 + x1) / 2, 1.42, z], [w, 0.035, 0.26], '#D9D3C8', 0.01)
  const cols = ['#8A4A1E', '#F4F2EC', '#3F6FB5', '#8A4A1E', '#E8C547', '#F4F2EC', '#4F9C80']
  let x = x0 + 0.14
  let i = seed
  while (x < x1 - 0.12) {
    const c = cols[i % cols.length]
    if (i % 4 === 3) {
      b.box([x + 0.04, 1.52, z], [0.16, 0.16, 0.18], i % 8 === 3 ? '#C9A67A' : '#F4F2EC', 0.01)
      x += 0.22
    } else {
      const h = 0.14 + ((i * 37) % 5) * 0.018
      b.cyl([x, 1.44 + h / 2, z], 0.045, h, c, 12)
      b.cyl([x, 1.44 + h + 0.015, z], 0.026, 0.03, i % 2 ? '#22262B' : '#3F6FB5', 10)
      x += 0.12
    }
    i++
  }
}

/** A seated desk with a monitor, keyboard and chair, facing -x (against the left wall). */
function deskLeft(b: Bake, x: number, z: number, screens: Bake) {
  b.box([x, 0.73, z], [0.7, 0.05, 1.25], '#C9B79C', 0.015)
  for (const dz of [-0.56, 0.56]) b.box([x, 0.36, z + dz], [0.62, 0.7, 0.04], '#B9A88D', 0.01)
  b.box([x - 0.2, 0.78, z], [0.06, 0.06, 0.2], '#2A2F36', 0.01)
  b.box([x - 0.2, 1.05, z], [0.04, 0.34, 0.62], '#2A2F36', 0.015)
  screens.box([x - 0.175, 1.05, z], [0.006, 0.29, 0.56], '#FFFFFF', 0.002)
  b.box([x + 0.12, 0.765, z], [0.16, 0.014, 0.42], '#3A414A', 0.004)
  b.box([x + 0.1, 0.765, z + 0.33], [0.1, 0.018, 0.07], '#3A414A', 0.008)
  b.box([x - 0.05, 0.77, z - 0.45], [0.2, 0.03, 0.27], '#F4F2EC', 0.004, [0, 0.2, 0])
  // The chair, pushed toward the desk.
  const cx = x + 0.7
  b.box([cx, 0.47, z], [0.42, 0.07, 0.42], '#3D4A5C', 0.03)
  b.box([cx + 0.2, 0.8, z], [0.06, 0.5, 0.4], '#3D4A5C', 0.03, [0, 0, -0.12])
  b.cyl([cx, 0.25, z], 0.03, 0.4, '#8C949D', 10)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    b.box([cx + Math.sin(a) * 0.15, 0.05, z + Math.cos(a) * 0.15], [0.04, 0.03, 0.3], '#5C6672', 0.01, [0, a, 0])
  }
}

function buildLab() {
  const screens = new Bake()
  const glass = new Bake()
  const lit = new Bake()
  const metal = new Bake()

  const clay = bake(b => {
    // The plinth and its floor.
    b.box([LAB.x, -PLINTH_H / 2, LAB.z], [LAB.w, PLINTH_H, LAB.d], PAL.labBody, 0.14)
    b.box([LAB.x, -0.008, LAB.z], [LAB.w - 0.24, 0.02, LAB.d - 0.24], PAL.labTop, 0.01)
    // A paler walkway runs down the aisles.
    b.box([-3.3, 0.004, -1.78], [6.6, 0.006, 0.62], shade(PAL.labTop, 0.035), 0.002)
    b.box([-3.3, 0.004, 0.6], [6.6, 0.006, 0.62], shade(PAL.labTop, 0.035), 0.002)
    b.box([-3.3, 0.004, 2.95], [6.6, 0.006, 0.62], shade(PAL.labTop, 0.035), 0.002)

    // Walls: tall at the back, a half wall on the left.
    b.box([-3.4, 1.0, -3.3], [11.8, 2.0, 0.12], WALL, 0.03)
    b.box([-3.4, 2.02, -3.3], [11.86, 0.05, 0.18], shade(WALL, -0.05), 0.01)
    b.box([-9.32, 0.45, 0.25], [0.12, 0.9, 7.0], WALL, 0.03)
    b.box([-9.32, 0.92, 0.25], [0.18, 0.05, 7.06], shade(WALL, -0.05), 0.01)

    // ── The PI office: glass partition, rug, desk, bookshelf, whiteboard ──
    b.box([-6.72, 1.0, -2.35], [0.07, 2.0, 0.07], '#8C949D', 0.01)
    b.box([-6.72, 1.0, -1.38], [0.07, 2.0, 0.07], '#8C949D', 0.01)
    b.box([-6.72, 1.98, -2.33], [0.07, 0.06, 1.94], '#8C949D', 0.01)
    b.box([-6.72, 0.05, -2.33], [0.07, 0.1, 1.94], '#8C949D', 0.01)
    glass.box([-6.72, 1.0, -2.33], [0.02, 1.86, 1.88], '#FFFFFF', 0.002)
    b.box([-8.0, 0.006, -1.95], [2.3, 0.008, 1.9], '#B7A58C', 0.004)
    b.box([-8.0, 0.012, -1.95], [2.1, 0.008, 1.7], '#C8B89F', 0.004)
    // Whiteboard on the back wall, a few lines of marker, a tray.
    b.box([-8.0, 1.35, -3.22], [1.7, 1.0, 0.04], '#9AA4AF', 0.01)
    b.box([-8.0, 1.35, -3.195], [1.6, 0.9, 0.02], '#F7F8F8', 0.004)
    for (let i = 0; i < 4; i++) b.box([-8.35 + (i % 2) * 0.12, 1.65 - i * 0.14, -3.18], [0.6 - i * 0.08, 0.018, 0.004], i === 1 ? '#C2403A' : '#2E4A7A', 0.002)
    b.ring([-7.55, 1.42, -3.18], 0.14, 0.01, '#2E4A7A', [0, 0, 0], Math.PI * 1.6, 20)
    b.box([-7.55, 1.1, -3.18], [0.4, 0.012, 0.004], '#4F9C80', 0.002)
    b.box([-8.0, 0.86, -3.16], [1.3, 0.03, 0.08], '#9AA4AF', 0.008)
    // The PI's desk faces the room; a bookshelf behind it, a plant.
    b.box([-8.85, 0.74, -1.6], [0.8, 0.05, 1.4], '#A07B58', 0.015)
    b.box([-8.85, 0.37, -2.22], [0.74, 0.72, 0.06], '#8E6B4C', 0.01)
    b.box([-8.85, 0.37, -0.98], [0.74, 0.72, 0.06], '#8E6B4C', 0.01)
    b.box([-9.05, 0.79, -1.6], [0.06, 0.06, 0.2], '#2A2F36', 0.01)
    b.box([-9.05, 1.06, -1.6], [0.04, 0.34, 0.6], '#2A2F36', 0.015)
    screens.box([-9.025, 1.06, -1.6], [0.006, 0.29, 0.54], '#FFFFFF', 0.002)
    b.box([-8.7, 0.775, -1.6], [0.16, 0.014, 0.42], '#3A414A', 0.004)
    b.box([-8.7, 0.79, -1.0], [0.24, 0.05, 0.3], '#F4F2EC', 0.006, [0, 0.3, 0])
    b.cyl([-8.75, 0.8, -2.1], 0.04, 0.09, '#C25B5B', 12)
    b.box([-9.05, 1.0, -2.85], [0.4, 2.0 - 0.1, 0.7], '#A07B58', 0.02)
    for (let s = 0; s < 4; s++) {
      b.box([-8.86, 0.3 + s * 0.45, -2.85], [0.03, 0.03, 0.64], '#8E6B4C', 0.004)
      for (let k = 0; k < 6; k++)
        b.box([-8.92, 0.42 + s * 0.45, -3.1 + k * 0.1 + ((k * s) % 3) * 0.01], [0.18, 0.2 + ((k + s) % 3) * 0.03, 0.07], ['#2E4A7A', '#C25B7A', '#E8E2D8', '#4F9C80', '#C98B2E', '#6F62B0'][(k + s) % 6], 0.008)
    }
    b.cyl([-7.1, 0.2, -2.95], 0.17, 0.4, '#B8AD9F', 16, undefined, 0.14)
    for (let k = 0; k < 7; k++) b.ball([-7.1 + Math.sin(k * 2.4) * 0.14, 0.62 + (k % 3) * 0.12, -2.95 + Math.cos(k * 2.4) * 0.14], 0.13, k % 2 ? '#5E8A5A' : '#6E9C66', [1, 0.8, 1], 10)

    // ── Bench row 1 (Sam's purification half, Priya's microbiology half) ──
    bench(b, -6.0, -1.2, -0.55, 1.1, true)
    shelf(b, -5.95, -1.25, -0.55, 0)
    // FPLC at the left end: a tall unit, a glass column, fraction rack.
    b.box([-5.72, 1.27, -0.72], [0.46, 0.7, 0.42], '#ECEAE4', 0.03)
    b.box([-5.72, 1.62, -0.72], [0.46, 0.02, 0.42], '#3F6FB5', 0.004)
    screens.box([-5.72, 1.38, -0.505], [0.28, 0.16, 0.006], '#FFFFFF', 0.003)
    glass.cyl([-5.38, 1.27, -0.86], 0.035, 0.52, '#FFFFFF', 12)
    b.cyl([-5.38, 1.12, -0.86], 0.03, 0.2, '#6F62B0', 12)
    b.cyl([-5.38, 1.55, -0.86], 0.04, 0.04, '#9AA4AF', 12)
    b.box([-5.45, BENCH_H + 0.04, -0.3], [0.32, 0.08, 0.22], '#E8C547', 0.01)
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) b.cyl([-5.57 + i * 0.06, BENCH_H + 0.11, -0.37 + j * 0.07], 0.012, 0.07, '#F4F8FA', 6)
    // Ice bucket with tubes, tube racks, the gel tank and power supply.
    b.cyl([-5.05, BENCH_H + 0.07, -0.85], 0.15, 0.14, '#4F7FB8', 18, undefined, 0.13)
    b.cyl([-5.05, BENCH_H + 0.13, -0.85], 0.135, 0.02, '#F2F6FA', 18)
    for (let i = 0; i < 5; i++) b.cyl([-5.1 + (i % 3) * 0.05, BENCH_H + 0.17, -0.88 + Math.floor(i / 3) * 0.06], 0.012, 0.06, ['#E8C547', '#C25B7A', '#F4F8FA'][i % 3], 6)
    b.box([-4.75, BENCH_H + 0.04, -0.75], [0.26, 0.07, 0.12], '#C25B7A', 0.01)
    for (let i = 0; i < 6; i++) b.cyl([-4.85 + i * 0.04, BENCH_H + 0.1, -0.75], 0.011, 0.07, '#F4F8FA', 6)
    b.box([-4.42, BENCH_H + 0.07, -0.82], [0.36, 0.14, 0.2], '#DCE7EC', 0.02)
    b.box([-4.42, BENCH_H + 0.15, -0.82], [0.38, 0.02, 0.22], '#3A414A', 0.006)
    b.box([-4.0, BENCH_H + 0.08, -0.35], [0.26, 0.16, 0.22], '#3A414A', 0.02)
    screens.box([-4.0, BENCH_H + 0.11, -0.238], [0.14, 0.05, 0.004], '#FFFFFF', 0.002)
    // Priya's half: plates, an inoculating loop stand, a small incubator, the chip rig.
    for (let s = 0; s < 3; s++) b.cyl([-2.55 + s * 0.2, BENCH_H + 0.03, -0.85], 0.085, 0.05 + 0.04 * (s % 2), '#D9A441', 16)
    for (let s = 0; s < 4; s++) b.cyl([-2.38, BENCH_H + 0.025 + s * 0.035, -0.62], 0.08, 0.03, s % 2 ? '#DCE7EC' : '#E4C27A', 16)
    b.box([-2.9, BENCH_H + 0.05, -0.7], [0.18, 0.1, 0.18], '#F4F2EC', 0.01)
    b.cyl([-2.9, BENCH_H + 0.12, -0.7], 0.06, 0.04, '#3F6FB5', 10)
    b.cyl([-3.25, BENCH_H + 0.09, -0.85], 0.04, 0.18, '#B8AD9F', 10)
    b.box([-1.45, BENCH_H + 0.24, -0.62], [0.42, 0.48, 0.42], '#ECEAE4', 0.03)
    b.box([-1.45, BENCH_H + 0.24, -0.405], [0.34, 0.38, 0.014], '#D9D3C8', 0.01)
    screens.box([-1.45, BENCH_H + 0.42, -0.396], [0.12, 0.05, 0.004], '#FFFFFF', 0.002)
    b.box([-1.82, BENCH_H + 0.04, -0.9], [0.3, 0.06, 0.2], '#3A414A', 0.01)
    b.box([-1.82, BENCH_H + 0.08, -0.9], [0.16, 0.02, 0.09], '#7DB3D6', 0.004)
    b.cyl([-1.82, BENCH_H + 0.23, -1.0], 0.025, 0.3, '#5C6672', 10)
    b.cyl([-1.82, BENCH_H + 0.36, -0.93], 0.04, 0.1, '#5C6672', 10, [0.6, 0, 0])

    // ── Bench row 2: centrifuge, gel imager, shaker, pipette stands ──
    bench(b, -6.0, -1.8, 1.75, 1.1)
    b.box([-5.4, BENCH_H + 0.17, 1.65], [0.56, 0.34, 0.56], '#ECEAE4', 0.08)
    b.cyl([-5.4, BENCH_H + 0.345, 1.65], 0.22, 0.02, '#9AA4AF', 24)
    screens.box([-5.4, BENCH_H + 0.12, 1.935], [0.16, 0.06, 0.004], '#FFFFFF', 0.002)
    b.box([-4.3, BENCH_H + 0.3, 1.7], [0.6, 0.6, 0.55], '#3A414A', 0.04)
    b.box([-4.3, BENCH_H + 0.27, 1.98], [0.44, 0.42, 0.016], '#2A2F36', 0.01)
    b.box([-4.3, BENCH_H + 0.07, 1.99], [0.24, 0.03, 0.02], '#9AA4AF', 0.006)
    b.box([-3.75, BENCH_H + 0.25, 1.5], [0.04, 0.3, 0.42], '#2A2F36', 0.01)
    screens.box([-3.775, BENCH_H + 0.25, 1.5], [0.006, 0.26, 0.38], '#FFFFFF', 0.002)
    b.box([-3.0, BENCH_H + 0.12, 1.7], [0.7, 0.24, 0.55], '#E6E1D8', 0.03)
    b.box([-3.0, BENCH_H + 0.25, 1.7], [0.64, 0.02, 0.5], '#9AA4AF', 0.004)
    for (let i = 0; i < 3; i++) {
      b.lathe([-3.2 + i * 0.2, BENCH_H + 0.26, 1.7], [[0, 0], [0.07, 0], [0.075, 0.015], [0.022, 0.13], [0.022, 0.17], [0, 0.17]], '#E4ECF0', 14)
      b.lathe([-3.2 + i * 0.2, BENCH_H + 0.262, 1.7], [[0, 0], [0.066, 0], [0.068, 0.015], [0.045, 0.05], [0, 0.05]], i === 1 ? '#D9A441' : '#C9B26A', 14)
    }
    b.cyl([-2.3, BENCH_H + 0.03, 1.55], 0.13, 0.04, '#3A414A', 16)
    b.cyl([-2.3, BENCH_H + 0.25, 1.55], 0.018, 0.44, '#9AA4AF', 8)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      b.cap([-2.3 + Math.sin(a) * 0.08, BENCH_H + 0.3, 1.55 + Math.cos(a) * 0.08], 0.018, 0.17, ['#C25B5B', '#E8C547', '#3F6FB5', '#4F9C80'][i], undefined, 8)
    }
    b.box([-2.0, BENCH_H + 0.04, 1.95], [0.3, 0.08, 0.2], '#3F6FB5', 0.01)
    b.box([-2.0, BENCH_H + 0.085, 1.95], [0.3, 0.008, 0.2], '#E8C547', 0.002)

    // ── The back run ──
    // Fume hood.
    b.box([-5.75, 0.43, -2.85], [1.3, 0.84, 0.78], CAB, 0.03)
    b.box([-5.75, 0.9, -2.85], [1.3, 0.06, 0.78], TOP, 0.02)
    b.box([-6.37, 1.45, -2.85], [0.06, 1.1, 0.78], '#ECEAE4', 0.015)
    b.box([-5.13, 1.45, -2.85], [0.06, 1.1, 0.78], '#ECEAE4', 0.015)
    b.box([-5.75, 2.15, -2.85], [1.36, 0.36, 0.84], '#ECEAE4', 0.03)
    b.box([-5.75, 1.45, -3.2], [1.2, 1.1, 0.04], '#DCD8D0', 0.01)
    b.box([-5.75, 1.82, -2.45], [1.18, 0.05, 0.03], '#9AA4AF', 0.008)
    glass.box([-5.75, 1.62, -2.46], [1.16, 0.36, 0.01], '#FFFFFF', 0.002)
    b.cyl([-5.95, 1.0, -2.9], 0.06, 0.16, '#8A4A1E', 10)
    b.cyl([-5.6, 0.98, -2.95], 0.08, 0.1, '#E4ECF0', 12)
    // Biosafety cabinet: a lit interior behind a sloped sash.
    b.box([-4.0, 0.36, -2.85], [1.3, 0.72, 0.7], '#8C949D', 0.02)
    b.box([-4.0, 1.4, -2.85], [1.36, 1.36, 0.8], '#ECEAE4', 0.04)
    b.box([-4.0, 1.3, -2.48], [1.1, 0.86, 0.1], '#2A2F36', 0.01)
    lit.box([-4.0, 1.3, -2.53], [1.08, 0.84, 0.02], '#FFFFFF', 0.004)
    b.box([-4.0, 0.98, -2.45], [1.2, 0.08, 0.08], '#9AA4AF', 0.01)
    glass.box([-4.0, 1.5, -2.42], [1.1, 0.5, 0.012], '#FFFFFF', 0.002, [-0.22, 0, 0])
    b.box([-4.0, 1.98, -2.44], [1.2, 0.14, 0.04], '#3A414A', 0.01)
    screens.box([-3.7, 1.98, -2.415], [0.2, 0.06, 0.004], '#FFFFFF', 0.002)
    // Sink and eyewash.
    b.box([-2.3, 0.43, -2.85], [1.0, 0.84, 0.72], CAB, 0.03)
    b.box([-2.3, 0.9, -2.85], [1.0, 0.06, 0.72], TOP, 0.02)
    b.box([-2.45, 0.9, -2.82], [0.5, 0.07, 0.42], '#3A414A', 0.03)
    metal.cyl([-2.45, 1.08, -3.08], 0.02, 0.3, STEEL, 10)
    metal.cap([-2.45, 1.24, -2.98], 0.018, 0.16, STEEL, [Math.PI / 2, 0, 0], 8)
    metal.cyl([-1.98, 1.12, -3.05], 0.022, 0.38, STEEL, 10)
    b.cyl([-1.98, 1.32, -2.95], 0.1, 0.06, '#4F9C80', 16, undefined, 0.07)
    b.box([-1.98, 1.72, -3.23], [0.24, 0.24, 0.012], '#4F9C80', 0.01)
    b.box([-1.98, 1.72, -3.222], [0.12, 0.04, 0.004], '#F4F2EC', 0.002)
    b.box([-1.98, 1.72, -3.222], [0.04, 0.12, 0.004], '#F4F2EC', 0.002)
    // The -80 °C freezer body (its door swings, see Freezer below).
    b.box([-0.85, 0.98, -2.88], [0.86, 1.96, 0.74], '#F1EFEA', 0.05)
    b.box([-0.85, 1.85, -2.5], [0.3, 0.1, 0.02], '#2A2F36', 0.01)
    screens.box([-0.85, 1.85, -2.488], [0.22, 0.06, 0.004], '#FFFFFF', 0.002)
    // Supply shelving: uprights, four shelves of boxes and bins.
    for (const sx of [0.75, 1.95]) {
      for (const dx of [-0.5, 0.5]) for (const dz of [-0.28, 0.28]) b.box([sx + dx, 0.95, -2.85 + dz], [0.04, 1.9, 0.04], '#8C949D', 0.008)
      for (let s = 0; s < 4; s++) {
        const y = 0.12 + s * 0.52
        b.box([sx, y, -2.85], [1.04, 0.03, 0.6], '#B9C0C8', 0.006)
        let x = sx - 0.42
        let k = s + (sx > 1 ? 3 : 0)
        while (x < sx + 0.4) {
          const big = k % 3 === 0
          const w = big ? 0.3 : 0.2
          const h = big ? 0.28 : 0.18 + (k % 2) * 0.06
          const c = ['#C9A67A', '#F4F2EC', '#4E73C8', '#3F6FB5', '#C9A67A', '#E8C547', '#F4F2EC'][k % 7]
          b.box([x + w / 2, y + 0.015 + h / 2, -2.85 + ((k * 7) % 3) * 0.03], [w - 0.03, h, 0.42], c, 0.015)
          x += w
          k++
        }
      }
    }
    // Waste: a biohazard bin and a sharps box, a recycling bin.
    b.cyl([-0.95, 0.3, -0.25], 0.17, 0.6, '#C2403A', 16, undefined, 0.15)
    b.cyl([-0.95, 0.61, -0.25], 0.18, 0.03, '#9C2E2A', 16)
    b.box([-6.3, 0.3, -1.25], [0.32, 0.6, 0.3], '#E8C547', 0.03)
    b.box([-6.3, 0.61, -1.25], [0.34, 0.03, 0.32], '#C98B2E', 0.01)
    b.cyl([-1.5, 0.28, 2.45], 0.16, 0.56, '#3F6FB5', 16, undefined, 0.14)

    // ── Write-up desks along the left wall ──
    deskLeft(b, -8.85, 1.05, screens)
    deskLeft(b, -8.85, 2.6, screens)

    // ── The confocal bay: a table, the microscope, two monitors ──
    b.box([0.85, 0.77, 2.55], [2.2, 0.06, 0.85], '#9AA4AF', 0.02)
    for (const [dx, dz] of [[-1.0, -0.36], [1.0, -0.36], [-1.0, 0.36], [1.0, 0.36]]) b.box([0.85 + dx, 0.38, 2.55 + dz], [0.06, 0.76, 0.06], '#5C6672', 0.01)
    // Microscope: base, pillar, stage, head, eyepieces toward the operator (-z).
    b.box([1.3, 0.86, 2.55], [0.5, 0.12, 0.6], '#E6E8EB', 0.03)
    b.box([1.3, 1.15, 2.78], [0.16, 0.5, 0.16], '#E6E8EB', 0.03)
    b.box([1.3, 1.1, 2.5], [0.36, 0.04, 0.32], '#3A414A', 0.01)
    b.box([1.3, 1.42, 2.6], [0.24, 0.16, 0.48], '#E6E8EB', 0.04)
    b.cap([1.25, 1.5, 2.33], 0.025, 0.1, '#2A2F36', [1.0, 0, 0], 8)
    b.cap([1.35, 1.5, 2.33], 0.025, 0.1, '#2A2F36', [1.0, 0, 0], 8)
    b.cyl([1.3, 1.24, 2.5], 0.04, 0.12, '#2A2F36', 10)
    b.box([1.7, 0.86, 2.75], [0.3, 0.12, 0.3], '#3A414A', 0.02)
    b.box([2.0, 1.0, 2.7], [0.38, 0.46, 0.4], '#5C6672', 0.03)
    for (const mx of [0.0, 0.5]) {
      b.box([mx, 0.83, 2.75], [0.06, 0.06, 0.2], '#2A2F36', 0.01)
      b.box([mx, 1.1, 2.78], [0.48, 0.32, 0.04], '#2A2F36', 0.015)
      screens.box([mx, 1.1, 2.757], [0.43, 0.27, 0.006], '#FFFFFF', 0.002)
    }
    b.box([0.25, 0.81, 2.35], [0.42, 0.014, 0.15], '#3A414A', 0.004)
    b.box([0.5, 0.47, 1.6], [0.42, 0.07, 0.42], '#3D4A5C', 0.03)
    b.cyl([0.5, 0.25, 1.6], 0.03, 0.4, '#8C949D', 10)

    // ── The intake post: requests leave the lab from here. ──
    b.cyl([PICKUP[0], 0.04, PICKUP[2]], 0.22, 0.08, '#3A414A', 24)
    b.cyl([PICKUP[0], 0.62, PICKUP[2]], 0.045, 1.12, '#5C6672', 12)
    b.cyl([PICKUP[0], 1.2, PICKUP[2]], 0.17, 0.06, '#3A414A', 24, undefined, 0.12)
  })

  const fin = (k: Bake) => (k.empty ? null : k.build())
  return { clay, screens: fin(screens), glass: fin(glass), lit: fin(lit), metal: fin(metal) }
}

const GEO = buildLab()

const doorGeo = bake(b => {
  // Built with its hinge at the origin, extending toward -x.
  b.box([-0.42, 0, 0.03], [0.84, 1.86, 0.06], '#F4F2EC', 0.03)
  b.box([-0.76, 0.1, 0.075], [0.04, 0.5, 0.04], '#9AA4AF', 0.01)
  b.box([-0.42, 0.65, 0.065], [0.3, 0.16, 0.006], '#2E5BA6', 0.003)
})

/** The freezer door swings open while Jun logs the freezer. */
function Freezer() {
  const door = useRef<Group>(null)
  const still = reducedMotion()
  useFrame((_, dt) => {
    const d = door.current
    if (!d) return
    const want = 1.3 * fx.freezer
    d.rotation.y = still ? want : d.rotation.y + (want - d.rotation.y) * Math.min(1, dt * 6)
  })
  return (
    <group ref={door} position={[-0.43, 0.99, -2.51]}>
      <mesh geometry={doorGeo} material={CLAY} castShadow receiveShadow />
    </group>
  )
}

export const LabPlinth = memo(function LabPlinth() {
  return (
    <group>
      <mesh geometry={GEO.clay} material={CLAY} castShadow receiveShadow />
      {GEO.metal && <mesh geometry={GEO.metal} material={METAL} castShadow />}
      {GEO.screens && <mesh geometry={GEO.screens} material={M.screen} />}
      {GEO.lit && <mesh geometry={GEO.lit} material={M.cabinetLight} />}
      {GEO.glass && <mesh geometry={GEO.glass} material={M.window} renderOrder={2} />}
      <Freezer />
      <Researchers />
    </group>
  )
})
