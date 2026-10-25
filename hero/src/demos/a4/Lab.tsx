// The wet lab, as a miniature: the PI's glass-walled office with its
// whiteboard, a back wall of fume hood, biosafety cabinet, incubator over a
// shaker, sink and eyewash, supply shelving and the -80 °C freezer; an epoxy
// island with the purification and gel kit and a reagent shelf above; the
// gel imager; the confocal bay; and the write-up desks. Everything that
// never moves is merged into one mesh per material, so the room costs a
// handful of draw calls however much is on the benches.

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { BufferGeometry, Group, Mesh } from 'three'
import { Kit, type P3 } from './geo'
import { LAB, PLINTH_H } from './layout'
import { M } from './mats'
import { LabPeople } from './People'
import { fx, reducedMotion } from './store'

const C = {
  body: '#CEC5B7',
  floor: '#E7E2D9',
  seam: '#DCD6CB',
  wood: '#C9A47E',
  woodSeam: '#B99573',
  walnut: '#A9805C',
  wall: '#EFEBE4',
  wallCap: '#DAD4CA',
  skirt: '#B5AD9F',
  lam: '#EDEBE6',
  lamLine: '#D3CFC7',
  resin: '#24292F',
  steel: '#BAC1C7',
  steelDk: '#7E868E',
  frame: '#5E6771',
  white: '#F4F3F0',
  grey: '#C8CCD0',
  dark: '#3A4048',
  black: '#202429',
  amber: '#94561C',
  clear: '#DCE6EA',
  label: '#F4F1EA',
  blue: '#3E6FB8',
  tipBlue: '#3D7FD1',
  yellow: '#D8B24A',
  green: '#3E9A5B',
  red: '#B5402F',
  kraft: '#C49A6C',
  seat: '#3E4652',
  screen: '#C3D1DB',
  bsc: '#EEF5F9',
  led: '#7FD3A6',
}

let seed = 7
const rand = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]

/** A box given by its extents rather than its centre. */
function bx(k: Kit, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: string, r = 0, rot?: P3) {
  return k.box([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [x1 - x0, y1 - y0, z1 - z0], c, r, rot ? { rot } : {})
}

interface K {
  clay: Kit
  epoxy: Kit
  steel: Kit
  glow: Kit
  glass: Kit
}

/** Base cabinets with door seams and pulls on the given faces, an epoxy top over them. */
function bench(k: K, x0: number, x1: number, z0: number, z1: number, faces: ('+z' | '-z' | '-x')[], body = C.lam, h = 0.86) {
  bx(k.clay, x0, x1, 0.08, h, z0, z1, body, 0.012)
  bx(k.clay, x0 + 0.05, x1 - 0.05, 0, 0.08, z0 + 0.06, z1 - 0.06, C.dark)
  bx(k.epoxy, x0 - 0.03, x1 + 0.03, h, h + 0.06, z0 - 0.03, z1 + 0.03, C.resin, 0.01)
  for (const f of faces) {
    const alongX = f !== '-x'
    const a0 = alongX ? x0 : z0
    const a1 = alongX ? x1 : z1
    const n = Math.max(1, Math.round((a1 - a0) / 0.52))
    const w = (a1 - a0) / n
    const face = f === '+z' ? z1 + 0.003 : f === '-z' ? z0 - 0.003 : x0 - 0.003
    for (let i = 0; i <= n; i++) {
      const a = a0 + i * w
      if (i > 0 && i < n) {
        if (alongX) bx(k.clay, a - 0.004, a + 0.004, 0.1, h - 0.03, face - 0.003, face + 0.003, C.lamLine)
        else bx(k.clay, face - 0.003, face + 0.003, 0.1, h - 0.03, a - 0.004, a + 0.004, C.lamLine)
      }
      if (i < n) {
        const m = a + w / 2 + (i % 2 ? -1 : 1) * (w / 2 - 0.07)
        if (alongX) k.steel.box([m, h - 0.12, face + (f === '+z' ? 0.012 : -0.012)], [0.016, 0.1, 0.018], C.steel, 0.006)
        else k.steel.box([face - 0.012, h - 0.12, m], [0.018, 0.1, 0.016], C.steel, 0.006)
      }
    }
    // A drawer line under the top.
    if (alongX) bx(k.clay, x0 + 0.02, x1 - 0.02, h - 0.2, h - 0.192, face - 0.003, face + 0.003, C.lamLine)
    else bx(k.clay, face - 0.003, face + 0.003, h - 0.2, h - 0.192, z0 + 0.02, z1 - 0.02, C.lamLine)
  }
}

function bottle(k: Kit, x: number, y: number, z: number, h: number, r: number, body: string, cap: string) {
  k.cyl([x, y + h * 0.36, z], r, h * 0.72, body, { seg: 14 })
  k.cyl([x, y + h * 0.36, z], r * 1.03, h * 0.3, C.label, { seg: 14 })
  k.cyl([x, y + h * 0.78, z], r * 0.5, h * 0.12, body, { seg: 10, r2: r * 0.42 })
  k.cyl([x, y + h * 0.9, z], r * 0.5, h * 0.14, cap, { seg: 10 })
}

function shelfBottles(k: Kit, x0: number, x1: number, y: number, z: number) {
  let x = x0 + 0.05
  while (x < x1 - 0.05) {
    const h = 0.14 + rand() * 0.12
    const r = 0.028 + rand() * 0.02
    const body = pick([C.amber, C.amber, C.clear, '#E9ECEE', '#6E8FA8'])
    const cap = pick([C.blue, C.black, C.red, C.white, C.yellow])
    if (rand() > 0.18) bottle(k, x + r, y, z + (rand() - 0.5) * 0.08, h, r, body, cap)
    x += r * 2 + 0.03 + rand() * 0.05
  }
}

function monitor(k: K, p: P3, facing: '+x' | '-x' | '+z', screen: (g: Kit, c: P3) => void) {
  const [x, y, z] = p
  if (facing === '+z') {
    bx(k.clay, x - 0.09, x + 0.09, y, y + 0.015, z - 0.08, z + 0.06, C.dark, 0.006)
    bx(k.clay, x - 0.022, x + 0.022, y, y + 0.22, z - 0.05, z - 0.02, C.dark, 0.008)
    k.clay.box([x, y + 0.3, z - 0.04], [0.6, 0.36, 0.035], C.black, 0.012)
    screen(k.glow, [x, y + 0.3, z - 0.021])
  } else {
    const s = facing === '+x' ? 1 : -1
    bx(k.clay, x - 0.06, x + 0.08, y, y + 0.015, z - 0.09, z + 0.09, C.dark, 0.006)
    bx(k.clay, x - s * 0.05 - 0.015, x - s * 0.05 + 0.015, y, y + 0.22, z - 0.022, z + 0.022, C.dark, 0.008)
    k.clay.box([x - s * 0.035, y + 0.3, z], [0.035, 0.36, 0.6], C.black, 0.012)
    screen(k.glow, [x - s * 0.016, y + 0.3, z])
  }
}

function chair(k: Kit, x: number, z: number, yaw: number) {
  // Seat, back and a five-star base; `yaw` 0 faces +z.
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  k.box([x - fx * 0.02, 0.45, z - fz * 0.02], [0.46, 0.07, 0.46], C.seat, 0.03, { rot: [0, yaw, 0] })
  k.box([x - fx * 0.25, 0.8, z - fz * 0.25], [0.42, 0.46, 0.06], C.seat, 0.03, { rot: [-0.1 * Math.cos(0), yaw, 0] })
  k.box([x - fx * 0.235, 0.56, z - fz * 0.235], [0.05, 0.2, 0.03], C.dark, 0.01, { rot: [0, yaw, 0] })
  k.cyl([x, 0.25, z], 0.024, 0.36, C.steelDk, { seg: 10 })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + yaw
    k.box([x + Math.sin(a) * 0.13, 0.07, z + Math.cos(a) * 0.13], [0.04, 0.03, 0.27], C.dark, 0.01, { rot: [0, a, 0] })
    k.sphere([x + Math.sin(a) * 0.26, 0.03, z + Math.cos(a) * 0.26], 0.03, C.black, { seg: 8 })
  }
}

function pipetteStand(k: Kit, x: number, z: number) {
  k.cyl([x, 0.93, z], 0.075, 0.02, C.dark, { seg: 16 })
  k.cyl([x, 1.12, z], 0.011, 0.38, C.grey, { seg: 8 })
  k.cyl([x, 1.31, z], 0.06, 0.015, C.dark, { seg: 16 })
  ;[C.red, C.yellow, C.blue].forEach((c, i) => {
    const a = (i / 3) * Math.PI * 2 + 0.4
    const px = x + Math.sin(a) * 0.065
    const pz = z + Math.cos(a) * 0.065
    k.capsule([px, 1.19, pz], 0.017, 0.15, '#ECEFF2')
    k.cyl([px, 1.29, pz], 0.01, 0.03, c, { seg: 8 })
    k.cyl([px, 1.06, pz], 0.006, 0.05, '#F2EFE6', { seg: 8, r2: 0.012 })
  })
}

function tipBox(k: Kit, x: number, y: number, z: number, c = C.tipBlue) {
  bx(k, x - 0.07, x + 0.07, y, y + 0.06, z - 0.05, z + 0.05, c, 0.008)
  bx(k, x - 0.066, x + 0.066, y + 0.06, y + 0.066, z - 0.046, z + 0.046, '#E8EEF2')
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) k.cyl([x - 0.05 + i * 0.02, y + 0.072, z - 0.03 + j * 0.02], 0.006, 0.014, '#F1E6B8', { seg: 6 })
}

function cartons(k: Kit, x0: number, x1: number, y: number, z: number, depth: number) {
  let x = x0 + 0.03
  while (x < x1 - 0.12) {
    const w = 0.14 + rand() * 0.16
    if (x + w > x1 - 0.02) break
    const h = 0.12 + rand() * 0.18
    const kind = rand()
    if (kind < 0.3) {
      // A glove box, cuff showing.
      bx(k, x, x + w, y, y + 0.1, z - depth / 2, z + depth / 2, '#4F7FC8', 0.01)
      k.box([x + w / 2, y + 0.105, z + depth / 2 - 0.03], [w * 0.5, 0.012, 0.04], '#9DBCE8', 0.005)
    } else if (kind < 0.55) tipBox(k, x + 0.07, y, z)
    else {
      bx(k, x, x + w, y, y + h, z - depth / 2, z + depth / 2, pick([C.kraft, '#B88C5E', '#D2AE80']), 0.01)
      bx(k, x + w / 2 - 0.02, x + w / 2 + 0.02, y + h, y + h + 0.002, z - depth / 2, z + depth / 2, '#E3D2B0')
    }
    x += w + 0.03 + rand() * 0.04
  }
}

function build() {
  seed = 7
  const k: K = { clay: new Kit(), epoxy: new Kit(), steel: new Kit(), glow: new Kit(), glass: new Kit() }
  const { clay, steel, glow, glass } = k

  // ── The plinth, floor and back wall ──
  bx(clay, LAB.x0, LAB.x1, -PLINTH_H, -0.012, LAB.z0, LAB.z1, C.body, 0.05)
  bx(clay, LAB.x0 + 0.06, LAB.x1 - 0.06, -0.03, 0, LAB.z0 + 0.06, LAB.z1 - 0.06, C.floor)
  for (let z = LAB.z0 + 0.66; z < LAB.z1 - 0.1; z += 0.6) bx(clay, LAB.x0 + 0.06, LAB.x1 - 0.06, 0, 0.0015, z - 0.006, z + 0.006, C.seam)
  for (let x = LAB.x0 + 0.66; x < LAB.x1 - 0.1; x += 0.6) bx(clay, x - 0.006, x + 0.006, 0, 0.0015, LAB.z0 + 0.06, LAB.z1 - 0.06, C.seam)
  bx(clay, LAB.x0, LAB.x1, 0, 2.4, LAB.z0, -3.62, C.wall, 0.02)
  bx(clay, LAB.x0 - 0.01, LAB.x1 + 0.01, 2.4, 2.45, LAB.z0 - 0.01, -3.61, C.wallCap, 0.012)
  bx(clay, LAB.x0, LAB.x1, 0, 0.09, -3.625, -3.6, C.skirt)

  // ── PI office ──
  bx(clay, -11.44, -8.6, 0, 0.012, -3.6, -0.9, C.wood)
  for (let z = -3.48; z < -0.95; z += 0.18) bx(clay, -11.44, -8.6, 0.012, 0.0135, z - 0.004, z + 0.004, C.woodSeam)
  bx(clay, -10.95, -9.45, 0.012, 0.02, -2.95, -1.35, '#8D9BAA', 0.004)
  // Desk, drawers, monitor, keyboard, papers, mug and lamp.
  bx(clay, -11.38, -10.7, 0.7, 0.745, -2.78, -1.42, C.walnut, 0.012)
  bx(clay, -11.34, -10.74, 0.03, 0.7, -2.74, -2.3, C.lam, 0.012)
  for (const y of [0.26, 0.48]) bx(clay, -10.745, -10.74, y, y + 0.008, -2.72, -2.32, C.lamLine)
  for (const y of [0.16, 0.38, 0.6]) steel.box([-10.73, y, -2.52], [0.016, 0.016, 0.12], C.steel, 0.006)
  for (const z of [-1.5]) for (const x of [-11.33, -10.75]) bx(clay, x - 0.02, x + 0.02, 0, 0.7, z - 0.02, z + 0.02, C.dark, 0.008)
  monitor(k, [-11.16, 0.745, -2.12], '+x', (g, c) => {
    g.box([c[0], c[1], c[2]], [0.004, 0.31, 0.55], '#D7E0E6')
    for (let i = 0; i < 8; i++) g.box([c[0] + 0.001, c[1] + 0.11 - i * 0.03, c[2] - 0.04], [0.004, 0.008, i % 3 === 2 ? 0.26 : 0.4], '#93A6B5')
  })
  clay.box([-10.9, 0.755, -2.12], [0.15, 0.016, 0.42], '#D9DCDF', 0.005)
  clay.box([-10.9, 0.758, -1.8], [0.06, 0.02, 0.04], '#D9DCDF', 0.01)
  bx(clay, -11.12, -10.86, 0.745, 0.765, -1.78, -1.48, '#F7F4EE', 0.003, [0, 0.12, 0])
  bx(clay, -11.08, -10.84, 0.765, 0.775, -1.74, -1.46, '#EEF1F4', 0.003, [0, -0.08, 0])
  clay.cyl([-10.86, 0.79, -2.6], 0.04, 0.09, C.blue, { seg: 14 })
  clay.torus([-10.82, 0.79, -2.6], 0.025, 0.008, C.blue, { rot: [0, 0, 0], seg: 12 })
  clay.cyl([-11.25, 0.76, -1.6], 0.06, 0.02, C.dark, { seg: 14 })
  clay.capsule([-11.22, 0.95, -1.62], 0.01, 0.34, C.dark, { rot: [0.2, 0, -0.1] })
  clay.cyl([-11.16, 1.12, -1.68], 0.03, 0.1, C.dark, { seg: 14, r2: 0.09, rot: [0.5, 0, 0] })
  chair(clay, -10.32, -2.1, Math.PI / 2 + Math.PI)
  // Whiteboard with aim 3 sketched on it.
  bx(clay, -10.9, -9.1, 0.93, 1.97, -3.62, -3.59, '#C9CED3', 0.01)
  bx(clay, -10.86, -9.14, 0.97, 1.93, -3.59, -3.586, '#FBFBF9')
  bx(clay, -10.6, -9.4, 0.92, 0.945, -3.6, -3.54, '#C9CED3', 0.006)
  ;[C.blue, C.red, C.black].forEach((c, i) => clay.capsule([-10.4 + i * 0.12, 0.952, -3.565], 0.008, 0.07, c, { rot: [0, 0, Math.PI / 2] }))
  const ink = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    const len = Math.hypot(x1 - x0, y1 - y0)
    clay.box([(x0 + x1) / 2, (y0 + y1) / 2, -3.5845], [len, 0.011, 0.002], c, 0, { rot: [0, 0, Math.atan2(y1 - y0, x1 - x0)] })
  }
  const rect = (cx: number, cy: number, w: number, h: number, c: string) => {
    ink(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, c)
    ink(cx - w / 2, cy + h / 2, cx + w / 2, cy + h / 2, c)
    ink(cx - w / 2, cy - h / 2, cx - w / 2, cy + h / 2, c)
    ink(cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2, c)
  }
  for (const [i, cx] of [-10.48, -10.0, -9.52].entries()) {
    rect(cx, 1.72, 0.3, 0.14, '#2F3540')
    ink(cx - 0.09, 1.72, cx + 0.09, 1.72, '#2F3540')
    ink(cx, 1.65, cx, 1.5, i === 2 ? C.red : C.blue)
    for (let j = 0; j < 3; j++) ink(cx - 0.12, 1.44 - j * 0.06, cx + 0.12 - j * 0.05, 1.44 - j * 0.06, C.blue)
  }
  clay.torus([-9.52, 1.72, -3.584], 0.2, 0.006, C.red, { scale: [1.15, 0.65, 0.3], seg: 32 })
  ink(-10.48, 1.86, -9.52, 1.86, '#2F3540')
  for (let i = 0; i < 4; i++) ink(-10.75 + i * 0.07, 1.04, -10.75 + i * 0.07, 1.08 + [0.06, 0.12, 0.09, 0.15][i], C.blue)
  // Bookshelf.
  bx(clay, -9.47, -9.44, 0, 1.85, -3.6, -3.28, C.walnut)
  bx(clay, -8.75, -8.72, 0, 1.85, -3.6, -3.28, C.walnut)
  bx(clay, -9.44, -8.75, 0, 1.85, -3.6, -3.585, '#987252')
  for (const y of [0.03, 0.47, 0.91, 1.35, 1.82]) bx(clay, -9.44, -8.75, y, y + 0.03, -3.585, -3.28, C.walnut)
  for (const y of [0.06, 0.5, 0.94, 1.38]) {
    let x = -9.42
    while (x < -8.8) {
      const w = 0.03 + rand() * 0.035
      const h = 0.22 + rand() * 0.14
      if (rand() < 0.12) {
        x += 0.06
        continue
      }
      bx(clay, x, Math.min(x + w, -8.77), y, y + h, -3.56, -3.33 - rand() * 0.04, pick(['#3E5C7A', '#8C4A37', '#5E7F5A', '#C9A24A', '#6B5A8C', '#D8D2C6', '#2F3540', '#A4573E']), 0.004)
      x += w + 0.004
    }
  }
  // Plant, partitions, open glass door.
  clay.cyl([-11.15, 0.16, -1.22], 0.15, 0.3, '#C9B8A4', { seg: 18, r2: 0.17 })
  clay.cyl([-11.15, 0.31, -1.22], 0.155, 0.02, '#5A4636', { seg: 18 })
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4
    clay.sphere([-11.15 + Math.sin(a) * 0.09, 0.5 + i * 0.06, -1.22 + Math.cos(a) * 0.09], 0.1 - i * 0.004, pick(['#5E8C61', '#4F7D55', '#6C9A6A']), { scale: [0.7, 1.4, 0.7], seg: 10 })
  }
  bx(clay, -8.63, -8.57, 0, 0.06, -3.62, -0.9, C.frame)
  bx(clay, -8.63, -8.57, 2.12, 2.18, -3.62, -0.9, C.frame)
  for (const z of [-3.6, -2.7, -1.8, -0.92]) bx(clay, -8.63, -8.57, 0, 2.18, z - 0.025, z + 0.025, C.frame)
  bx(glass, -8.605, -8.595, 0.06, 2.12, -3.58, -0.95, C.white)
  bx(clay, -11.44, -9.7, 0, 0.06, -0.93, -0.87, C.frame)
  bx(clay, -11.44, -8.6, 2.12, 2.18, -0.93, -0.87, C.frame)
  for (const x of [-11.42, -10.56, -9.7]) bx(clay, x - 0.025, x + 0.025, 0, 2.18, -0.93, -0.87, C.frame)
  bx(glass, -11.4, -9.73, 0.06, 2.12, -0.905, -0.895, C.white)
  bx(clay, -9.72, -9.69, 0.02, 2.08, -1.78, -0.94, C.frame)
  bx(glass, -9.71, -9.7, 0.06, 2.04, -1.76, -0.96, C.white)
  steel.box([-9.68, 1.0, -1.65], [0.03, 0.26, 0.025], C.steel, 0.008)

  // ── Back wall: fume hood ──
  bench(k, -8.35, -7.05, -3.6, -2.87, ['+z'], C.yellow)
  bx(clay, -8.37, -8.25, 0.92, 2.22, -3.62, -2.84, C.white, 0.012)
  bx(clay, -7.15, -7.03, 0.92, 2.22, -3.62, -2.84, C.white, 0.012)
  bx(clay, -8.25, -7.15, 0.92, 2.0, -3.62, -3.5, '#D7DBDF')
  bx(clay, -8.37, -7.03, 1.96, 2.24, -3.62, -2.84, C.white, 0.014)
  bx(glass, -8.25, -7.15, 1.32, 1.95, -2.9, -2.88, C.white)
  bx(steel, -8.25, -7.15, 1.29, 1.33, -2.92, -2.86, C.steel, 0.008)
  bx(steel, -8.25, -7.15, 0.92, 0.95, -2.92, -2.84, C.steel, 0.006)
  glow.box([-7.09, 1.62, -2.835], [0.06, 0.1, 0.01], C.led)
  steel.cyl([-7.7, 2.33, -3.3], 0.12, 0.18, C.steel, { seg: 18 })
  bottle(clay, -8.05, 0.92, -3.3, 0.26, 0.05, C.amber, C.black)
  bottle(clay, -7.9, 0.92, -3.38, 0.22, 0.045, C.clear, C.red)
  bx(clay, -7.55, -7.3, 0.92, 0.98, -3.3, -3.1, '#E3E5E8', 0.01)
  clay.cyl([-7.42, 1.06, -3.2], 0.05, 0.14, '#D3E2EA', { seg: 14 })
  clay.cyl([-7.42, 1.02, -3.2], 0.046, 0.06, '#D9B65A', { seg: 14 })

  // ── Biosafety cabinet: lit inside, angled sash ──
  for (const x of [-6.66, -5.44]) for (const z of [-3.56, -2.89]) bx(steel, x - 0.02, x + 0.02, 0, 0.72, z - 0.02, z + 0.02, C.steelDk)
  bx(clay, -6.7, -5.4, 0.72, 0.95, -3.6, -2.85, C.white, 0.014)
  bx(clay, -6.6, -5.5, 0.88, 0.94, -2.86, -2.84, C.dark)
  bx(steel, -6.58, -5.52, 0.95, 0.975, -3.48, -2.88, C.steel)
  bx(clay, -6.7, -6.58, 0.95, 2.2, -3.6, -2.85, C.white, 0.012)
  bx(clay, -5.52, -5.4, 0.95, 2.2, -3.6, -2.85, C.white, 0.012)
  bx(glow, -6.58, -5.52, 0.975, 1.72, -3.5, -3.47, C.bsc)
  bx(glow, -6.58, -5.52, 1.68, 1.72, -3.47, -2.98, C.bsc)
  bx(clay, -6.7, -5.4, 1.72, 2.2, -3.6, -2.95, C.white, 0.015)
  bx(clay, -6.66, -5.44, 1.74, 2.18, -2.97, -2.94, '#E6E6E2', 0.01)
  glass.box([-6.05, 1.5, -2.94], [1.06, 0.44, 0.01], C.white, 0, { rot: [-0.23, 0, 0] })
  steel.box([-6.05, 1.29, -2.89], [1.06, 0.035, 0.03], C.steel, 0.008)
  bx(clay, -6.58, -5.52, 0.95, 0.99, -2.9, -2.84, '#D5D9DD', 0.012)
  bx(clay, -6.3, -5.8, 1.86, 1.98, -2.945, -2.93, C.dark, 0.004)
  glow.box([-6.18, 1.92, -2.928], [0.05, 0.03, 0.004], C.led)
  glow.box([-6.08, 1.92, -2.928], [0.05, 0.03, 0.004], '#F2C66B')
  for (let i = 0; i < 4; i++) clay.cyl([-6.35, 0.99 + i * 0.022, -3.25], 0.06, 0.018, i % 2 ? '#E9EEF0' : '#D9A441', { seg: 16 })
  clay.capsule([-5.75, 1.03, -3.2], 0.025, 0.12, '#5B8BD9', { rot: [0, 0, Math.PI / 2] })
  clay.cyl([-5.75, 1.04, -3.38], 0.045, 0.12, '#E1E9EC', { seg: 14 })
  clay.cyl([-5.25, 0.21, -3.3], 0.12, 0.42, '#C2412F', { seg: 16 })
  clay.cyl([-5.25, 0.435, -3.3], 0.126, 0.03, '#8E2C22', { seg: 16 })
  clay.cyl([-5.25, 0.3, -3.178], 0.04, 0.002, '#F2E9DE', { seg: 12, rot: [Math.PI / 2, 0, 0] })

  // ── Incubator over a shaker ──
  bx(clay, -5.06, -4.14, 0, 0.5, -3.56, -2.9, '#DAD8D3', 0.03)
  glow.box([-4.6, 0.38, -2.895], [0.16, 0.05, 0.004], C.led)
  clay.cyl([-4.36, 0.38, -2.89], 0.025, 0.02, C.dark, { seg: 12, rot: [Math.PI / 2, 0, 0] })
  bx(clay, -5.1, -4.1, 0.56, 1.78, -3.6, -2.86, C.white, 0.02)
  bx(clay, -5.06, -4.14, 0.6, 1.74, -2.87, -2.84, '#E5E4E0', 0.015)
  bx(clay, -4.98, -4.3, 0.74, 1.58, -2.842, -2.835, '#C7D2D9')
  for (const y of [0.98, 1.22, 1.46]) {
    bx(clay, -4.97, -4.31, y, y + 0.01, -2.836, -2.832, '#A9B4BD')
    for (let i = 0; i < 3; i++) bx(clay, -4.9 + i * 0.2, -4.78 + i * 0.2, y + 0.01, y + 0.05, -2.834, -2.83, '#E9E2CC')
  }
  steel.box([-4.2, 1.17, -2.82], [0.025, 0.4, 0.03], C.steel, 0.01)
  glow.box([-4.62, 1.67, -2.836], [0.2, 0.05, 0.004], C.led)

  // ── Sink and eyewash ──
  bench(k, -4.0, -3.1, -3.58, -2.87, ['+z'])
  bx(steel, -3.82, -3.3, 0.905, 0.925, -3.46, -3.0, C.steelDk)
  steel.cyl([-3.56, 1.05, -3.5], 0.015, 0.26, C.steel, { seg: 10 })
  steel.torus([-3.56, 1.18, -3.42], 0.08, 0.013, C.steel, { arc: Math.PI, rot: [0, Math.PI / 2, 0], seg: 14 })
  steel.box([-3.7, 0.95, -3.5], [0.03, 0.03, 0.06], C.steel, 0.008)
  steel.cyl([-3.2, 1.02, -3.45], 0.015, 0.2, C.steel, { seg: 10 })
  clay.cyl([-3.2, 1.13, -3.42], 0.06, 0.035, C.green, { seg: 16, r2: 0.08 })
  clay.box([-3.12, 1.0, -3.36], [0.02, 0.1, 0.06], C.green, 0.006)
  bx(clay, -3.3, -3.12, 1.62, 1.8, -3.62, -3.6, C.green, 0.004)
  bx(clay, -3.27, -3.15, 1.65, 1.77, -3.6, -3.598, C.white)
  bx(clay, -3.24, -3.18, 1.67, 1.75, -3.598, -3.596, C.green)
  bottle(clay, -3.88, 0.92, -3.5, 0.16, 0.035, '#E9ECEE', C.blue)
  for (const y of [1.46, 1.84]) {
    bx(clay, -4.0, -3.36, y, y + 0.025, -3.62, -3.38, C.white, 0.006)
    shelfBottles(clay, -4.0, -3.4, y + 0.025, -3.5)
  }

  // ── Supply shelving ──
  for (const x of [-3.04, -2.06]) for (const z of [-3.59, -3.11]) steel.cyl([x, 0.95, z], 0.013, 1.9, C.steel, { seg: 8 })
  for (const y of [0.1, 0.55, 1.0, 1.45, 1.88]) {
    bx(steel, -3.05, -2.05, y, y + 0.02, -3.6, -3.1, C.steel)
    bx(steel, -3.05, -2.05, y + 0.02, y + 0.045, -3.115, -3.1, C.steel)
    if (y < 1.8) cartons(clay, -3.05, -2.05, y + 0.02, -3.36, 0.36)
  }

  // ── The -80 °C freezer (the door is its own mesh) ──
  bx(clay, -1.84, -1.1, 0.06, 1.95, -3.6, -3.52, C.white, 0.01)
  bx(clay, -1.84, -1.78, 0.06, 1.95, -3.6, -2.82, C.white, 0.01)
  bx(clay, -1.16, -1.1, 0.06, 1.95, -3.6, -2.82, C.white, 0.01)
  bx(clay, -1.84, -1.1, 1.84, 1.98, -3.6, -2.82, C.white, 0.012)
  bx(clay, -1.84, -1.1, 0.06, 0.22, -3.6, -2.82, C.white, 0.01)
  bx(clay, -1.82, -1.12, 0, 0.06, -3.58, -2.84, C.dark)
  bx(clay, -1.78, -1.16, 0.22, 1.84, -3.52, -3.5, '#D8E2E9')
  bx(clay, -1.8, -1.14, 1.87, 1.95, -2.825, -2.815, C.grey)
  for (const y of [0.62, 1.02, 1.42]) {
    bx(clay, -1.78, -1.16, y, y + 0.02, -3.5, -2.86, '#9AA5AF')
    for (let i = 0; i < 3; i++) bx(clay, -1.76 + i * 0.2, -1.6 + i * 0.2, y + 0.02, y + 0.3, -3.46, -2.95, i === 1 ? '#C9D6E0' : '#E3EAF0', 0.01)
  }
  bx(clay, -1.76, -1.18, 0.24, 0.6, -3.46, -2.95, '#E3EAF0', 0.01)

  // ── The island: cabinets, epoxy top, reagent shelf and the purification kit ──
  bench(k, -7.6, -3.2, -1.03, 0.33, ['+z', '-z'])
  for (const x of [-7.45, -5.4, -3.35]) bx(steel, x - 0.02, x + 0.02, 0.92, 1.58, -0.37, -0.33, C.steel)
  for (const y of [1.2, 1.52]) {
    bx(clay, -7.55, -3.25, y, y + 0.025, -0.5, -0.2, C.white, 0.006)
    shelfBottles(clay, -7.5, -3.3, y + 0.025, -0.35)
  }
  bx(clay, -7.4, -3.4, 1.0, 1.04, -0.37, -0.33, C.grey, 0.008)
  // Centrifuge.
  bx(clay, -7.45, -6.95, 0.92, 1.18, -0.98, -0.5, '#E4E6E9', 0.05)
  clay.dome([-7.2, 1.18, -0.74], 0.2, '#BFC6CD', { theta: 1.0, scale: [1, 0.45, 1] })
  glow.box([-7.2, 1.08, -0.984], [0.12, 0.045, 0.004], C.led)
  // FPLC with its column, valves, screen and fraction collector.
  bx(clay, -6.72, -6.12, 0.92, 1.46, -0.98, -0.55, '#EEEFF1', 0.03)
  bx(clay, -6.68, -6.16, 1.0, 1.42, -0.99, -0.978, '#D4D8DC')
  clay.cyl([-6.58, 1.2, -1.02], 0.026, 0.34, '#CFDDE6', { seg: 12 })
  clay.cyl([-6.58, 1.15, -1.02], 0.021, 0.2, '#6CA9B9', { seg: 12 })
  for (let i = 0; i < 3; i++) clay.cyl([-6.42 + i * 0.08, 1.3, -1.0], 0.022, 0.04, C.dark, { seg: 12, rot: [Math.PI / 2, 0, 0] })
  glow.box([-6.38, 1.12, -0.992], [0.2, 0.08, 0.004], '#A9C7DA')
  clay.capsule([-6.5, 1.36, -1.01], 0.006, 0.12, '#E8DCC0', { rot: [0, 0, 1.2] })
  bx(clay, -6.1, -5.84, 0.92, 0.98, -0.94, -0.58, '#D9DCE0', 0.012)
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) clay.cyl([-6.06 + i * 0.06, 1.01, -0.9 + j * 0.065], 0.012, 0.06, '#EDE6CF', { seg: 8 })
  pipetteStand(clay, -5.98, -0.44)
  // Ice bucket and tube racks.
  clay.cyl([-5.6, 1.0, -0.78], 0.14, 0.16, C.blue, { seg: 20, r2: 0.16 })
  clay.cyl([-5.6, 1.075, -0.78], 0.15, 0.012, '#F4F8FA', { seg: 20 })
  for (let i = 0; i < 9; i++) clay.sphere([-5.6 + (rand() - 0.5) * 0.2, 1.085, -0.78 + (rand() - 0.5) * 0.2], 0.03, '#FBFDFE', { seg: 8 })
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3
    clay.cyl([-5.6 + Math.sin(a) * 0.07, 1.11, -0.78 + Math.cos(a) * 0.07], 0.012, 0.07, '#EADFB4', { seg: 8 })
    clay.cyl([-5.6 + Math.sin(a) * 0.07, 1.15, -0.78 + Math.cos(a) * 0.07], 0.014, 0.012, pick([C.blue, C.red, C.yellow]), { seg: 8 })
  }
  for (const [x, z] of [
    [-5.25, -0.72],
    [-4.0, -0.75],
  ]) {
    bx(clay, x - 0.13, x + 0.13, 0.92, 0.97, z - 0.07, z + 0.07, '#E8C547', 0.01)
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) clay.cyl([x - 0.1 + i * 0.05, 1.0, z - 0.03 + j * 0.06], 0.012, 0.08, j ? '#E8EEF2' : '#EADFB4', { seg: 8 })
  }
  // Gel tank on its power supply.
  bx(clay, -4.88, -4.62, 0.92, 1.07, -0.9, -0.66, '#BFD6E6', 0.012)
  bx(clay, -4.9, -4.6, 1.07, 1.1, -0.92, -0.64, '#DADDE0', 0.01)
  clay.cyl([-4.86, 1.12, -0.88], 0.012, 0.03, C.red, { seg: 8 })
  clay.cyl([-4.64, 1.12, -0.88], 0.012, 0.03, C.black, { seg: 8 })
  clay.capsule([-4.6, 1.13, -0.86], 0.006, 0.26, C.red, { rot: [0, 0, Math.PI / 2 - 0.2] })
  clay.capsule([-4.55, 1.1, -0.86], 0.006, 0.18, C.black, { rot: [0, 0, Math.PI / 2 + 0.3] })
  bx(clay, -4.52, -4.26, 0.92, 1.04, -0.92, -0.66, '#E6E8EA', 0.02)
  glow.box([-4.39, 1.0, -0.924], [0.14, 0.05, 0.004], '#F2C66B')
  pipetteStand(clay, -5.1, -0.44)
  // Front side: the microfluidic rig, a notebook, tip boxes, a vortexer.
  bx(clay, -4.3, -4.04, 0.92, 1.02, -0.06, 0.16, '#E9EBED', 0.015)
  clay.cyl([-4.12, 1.045, 0.05], 0.02, 0.2, '#DCE8EE', { seg: 12, rot: [0, 0, Math.PI / 2] })
  bx(clay, -3.98, -3.74, 0.92, 0.95, -0.02, 0.14, '#C9CED3', 0.008)
  bx(clay, -3.93, -3.79, 0.95, 0.958, 0.02, 0.1, '#D2E6EF', 0.003)
  clay.capsule([-3.98, 0.98, 0.07], 0.005, 0.12, '#E8C9A0', { rot: [0, 0, 1.3] })
  bx(clay, -3.6, -3.4, 0.92, 0.96, -0.12, 0.08, C.dark, 0.01)
  clay.cyl([-3.5, 1.15, -0.08], 0.018, 0.4, C.grey, { seg: 8 })
  bx(clay, -3.62, -3.38, 1.24, 1.34, -0.08, 0.08, '#ECEDEF', 0.02)
  for (const dx of [-0.03, 0.03]) clay.cyl([-3.5 + dx, 1.38, 0.08], 0.016, 0.1, C.black, { seg: 10, rot: [0.7, 0, 0] })
  pipetteStand(clay, -4.55, 0.14)
  bx(clay, -6.95, -6.7, 0.92, 0.94, -0.05, 0.2, '#2E5BA6', 0.006, [0, 0.15, 0])
  bx(clay, -6.94, -6.71, 0.94, 0.945, -0.04, 0.19, '#F4F1EA', 0, [0, 0.15, 0])
  tipBox(clay, -6.2, 0.92, 0.12)
  tipBox(clay, -6.02, 0.92, 0.12, '#8AAE3B')
  bx(clay, -5.5, -5.34, 0.92, 1.0, 0.04, 0.2, '#E6E8EA', 0.03)
  clay.cyl([-5.42, 1.02, 0.12], 0.04, 0.03, C.dark, { seg: 12 })
  clay.cyl([-3.02, 0.2, -0.8], 0.13, 0.4, '#5B6470', { seg: 16, r2: 0.14 })
  clay.cyl([-3.02, 0.41, -0.8], 0.145, 0.025, '#4A525C', { seg: 16 })

  // ── Gel imager bench ──
  bench(k, -1.6, -1.0, -0.58, 0.58, ['-x'])
  bx(clay, -1.5, -1.05, 0.92, 1.4, -0.5, 0.02, '#353B43', 0.03)
  bx(clay, -1.512, -1.5, 1.0, 1.14, -0.44, -0.04, '#4A515A', 0.004)
  glow.box([-1.512, 1.32, -0.42], [0.004, 0.025, 0.04], C.led)
  monitor(k, [-1.26, 0.92, 0.32], '-x', (g, c) => {
    g.box([c[0], c[1], c[2]], [0.004, 0.31, 0.55], '#27313B')
    for (let lane = 0; lane < 7; lane++)
      for (let b = 0; b < 5; b++) {
        if ((lane * 3 + b) % 4 === 1) continue
        g.box([c[0] - 0.001, c[1] + 0.1 - b * 0.05 - (lane % 2) * 0.012, c[2] - 0.21 + lane * 0.07], [0.004, 0.012, 0.05], b === 0 ? '#F4F8FA' : '#B9CAD6')
      }
  })

  // ── Confocal bay ──
  for (const x of [-10.95, -9.65]) for (const z of [1.6, 2.4]) clay.cyl([x, 0.33, z], 0.085, 0.66, '#5B636C', { seg: 16 })
  bx(clay, -11.1, -9.5, 0.66, 0.78, 1.45, 2.55, '#3B4048', 0.012)
  for (let i = 0; i < 15; i++) for (let j = 0; j < 10; j++) bx(clay, -11.02 + i * 0.1, -11.008 + i * 0.1, 0.78, 0.7815, 1.52 + j * 0.1, 1.532 + j * 0.1, '#2A2E34')
  bx(clay, -10.45, -9.85, 0.78, 0.96, 1.75, 2.25, '#ECEDEF', 0.03)
  bx(clay, -10.45, -10.3, 0.96, 1.56, 1.9, 2.1, '#ECEDEF', 0.02)
  bx(clay, -10.45, -9.98, 1.49, 1.57, 1.93, 2.07, '#ECEDEF', 0.015)
  clay.cyl([-10.04, 1.4, 2.0], 0.03, 0.16, '#D7DBDF', { seg: 12 })
  bx(steel, -10.26, -9.84, 1.08, 1.1, 1.8, 2.2, C.steel, 0.006)
  steel.cyl([-10.04, 1.03, 2.0], 0.05, 0.06, C.steel, { seg: 14 })
  for (let i = 0; i < 3; i++) steel.cyl([-10.04 + Math.sin(i * 2.1) * 0.035, 0.985, 2.0 + Math.cos(i * 2.1) * 0.035], 0.012, 0.05, i ? C.steel : '#C9A24A', { seg: 8 })
  bx(clay, -10.02, -9.66, 1.12, 1.24, 1.9, 2.1, '#ECEDEF', 0.02)
  for (const z of [1.965, 2.035]) {
    clay.cyl([-9.6, 1.29, z], 0.022, 0.13, '#ECEDEF', { seg: 12, rot: [0, 0, -0.75] })
    clay.cyl([-9.55, 1.335, z], 0.024, 0.03, C.black, { seg: 12, rot: [0, 0, -0.75] })
  }
  bx(clay, -10.76, -10.45, 0.96, 1.26, 1.85, 2.15, '#2F353C', 0.02)
  bx(clay, -11.02, -10.6, 0.78, 0.95, 1.5, 1.82, '#2A2F35', 0.02)
  glow.box([-10.81, 0.9, 1.825], [0.03, 0.03, 0.004], '#E26B5A')
  clay.capsule([-10.62, 1.0, 1.85], 0.012, 0.3, '#F2C66B', { rot: [0.9, 0, 0.6] })
  monitor(k, [-10.9, 0.78, 2.36], '+x', (g, c) => {
    g.box([c[0], c[1], c[2]], [0.004, 0.31, 0.55], '#121820')
    for (let i = 0; i < 9; i++) g.sphere([c[0] + 0.002, c[1] + (rand() - 0.5) * 0.22, c[2] + (rand() - 0.5) * 0.44], 0.02 + rand() * 0.025, i % 3 ? '#57C27A' : '#C25A9E', { scale: [0.1, 1, 1.4], seg: 8 })
  })

  // ── Write-up desks ──
  bx(clay, -6.32, -3.78, 0.72, 0.755, 1.84, 2.36, '#D9CDBB', 0.012)
  for (const x of [-6.28, -5.05, -3.82]) bx(clay, x - 0.02, x + 0.02, 0, 0.72, 1.88, 2.32, C.white, 0.006)
  bx(clay, -6.26, -3.84, 0.3, 0.72, 1.87, 1.89, C.white)
  monitor(k, [-5.7, 0.755, 1.98], '+z', (g, c) => {
    g.box(c, [0.55, 0.31, 0.004], '#141A20')
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) g.box([c[0] - 0.22 + i * 0.088, c[1] - 0.11 + j * 0.07, c[2] + 0.001], [0.08, 0.062, 0.004], pick(['#2B4F3A', '#3F7D55', '#57C27A', '#24382C']))
  })
  monitor(k, [-4.4, 0.755, 1.98], '+z', (g, c) => {
    g.box(c, [0.55, 0.31, 0.004], '#E4EAEE')
    for (let j = 0; j < 7; j++) g.box([c[0], c[1] + 0.12 - j * 0.04, c[2] + 0.001], [0.5, 0.004, 0.004], '#A3B4C1')
    for (let i = 0; i < 5; i++) g.box([c[0] - 0.24 + i * 0.12, c[1], c[2] + 0.001], [0.004, 0.27, 0.004], '#A3B4C1')
    g.box([c[0] - 0.18, c[1] + 0.12, c[2] + 0.002], [0.12, 0.03, 0.004], '#8AAE3B')
  })
  for (const x of [-5.7, -4.4]) {
    clay.box([x, 0.765, 2.2], [0.42, 0.016, 0.14], '#D9DCDF', 0.005)
    clay.box([x + 0.3, 0.768, 2.2], [0.05, 0.02, 0.08], '#D9DCDF', 0.01)
    chair(clay, x, 2.8, Math.PI)
  }
  bx(clay, -6.2, -5.98, 0.755, 0.775, 2.0, 2.3, '#F7F4EE', 0.003, [0, 0.2, 0])
  clay.cyl([-5.12, 0.8, 2.12], 0.04, 0.09, '#D9623A', { seg: 14 })
  clay.cyl([-3.96, 0.82, 2.02], 0.06, 0.12, '#E9E3D6', { seg: 14 })
  for (let i = 0; i < 4; i++) clay.sphere([-3.96 + Math.sin(i * 1.6) * 0.04, 0.95 + i * 0.03, 2.02 + Math.cos(i * 1.6) * 0.04], 0.05, '#5E8C61', { scale: [0.8, 1.3, 0.8], seg: 8 })

  // ── Odds and ends: cart, coat rack, bins, the delivery dolly, a clock ──
  for (const x of [-8.18, -7.62]) for (const z of [2.72, 3.08]) steel.cyl([x, 0.48, z], 0.012, 0.86, C.steel, { seg: 8 })
  for (const y of [0.18, 0.86]) bx(steel, -8.2, -7.6, y, y + 0.025, 2.7, 3.1, C.steel, 0.006)
  for (const x of [-8.18, -7.62]) for (const z of [2.72, 3.08]) clay.sphere([x, 0.035, z], 0.035, C.black, { seg: 8 })
  bx(clay, -8.12, -7.84, 0.885, 1.05, 2.76, 3.0, C.kraft, 0.01)
  for (let i = 0; i < 4; i++) clay.cyl([-7.72, 0.9 + i * 0.022, 2.92], 0.06, 0.018, i % 2 ? '#E9EEF0' : '#D9A441', { seg: 16 })
  bx(clay, -8.1, -7.7, 0.205, 0.33, 2.76, 3.04, '#E8E4DE', 0.01)
  clay.cyl([-11.15, 0.02, 0.55], 0.18, 0.04, C.dark, { seg: 18 })
  clay.cyl([-11.15, 0.92, 0.55], 0.02, 1.8, C.dark, { seg: 10 })
  for (let i = 0; i < 3; i++) clay.capsule([-11.15 + Math.sin(i * 2.1) * 0.06, 1.74, 0.55 + Math.cos(i * 2.1) * 0.06], 0.008, 0.06, C.dark, { rot: [Math.cos(i * 2.1) * 0.9, 0, -Math.sin(i * 2.1) * 0.9] })
  for (const [dx, a] of [
    [0.09, 0.3],
    [-0.08, -0.5],
  ]) {
    clay.box([-11.15 + dx, 1.36, 0.55 + 0.05], [0.3, 0.62, 0.1], '#F2EFE9', 0.04, { rot: [0.05, a, 0] })
    clay.box([-11.15 + dx, 1.66, 0.58], [0.2, 0.06, 0.12], '#E3DFD7', 0.02, { rot: [0, a, 0] })
  }
  clay.cyl([-11.15, 0.2, -0.52], 0.13, 0.4, '#5B6470', { seg: 16, r2: 0.14 })
  clay.cyl([-11.15, 0.41, -0.52], 0.145, 0.025, '#4A525C', { seg: 16 })
  clay.cyl([-10.82, 0.2, -0.52], 0.13, 0.4, C.blue, { seg: 16, r2: 0.14 })
  clay.cyl([-10.82, 0.41, -0.52], 0.145, 0.025, '#2F5896', { seg: 16 })
  bx(steel, -1.45, -1.05, 0.03, 0.06, 3.18, 3.56, C.steel, 0.006)
  for (const x of [-1.42, -1.08]) bx(steel, x - 0.015, x + 0.015, 0.06, 1.1, 3.53, 3.56, C.steelDk, 0.006)
  bx(steel, -1.42, -1.08, 1.06, 1.09, 3.53, 3.56, C.steelDk, 0.006)
  for (const x of [-1.42, -1.08]) clay.cyl([x, 0.07, 3.56], 0.065, 0.04, C.black, { seg: 14, rot: [0, 0, Math.PI / 2] })
  bx(clay, -1.42, -1.08, 0.06, 0.38, 3.2, 3.52, C.kraft, 0.015)
  bx(clay, -1.27, -1.23, 0.38, 0.382, 3.2, 3.52, '#E3D2B0')
  bx(clay, -1.38, -1.12, 0.38, 0.6, 3.24, 3.48, '#B88C5E', 0.015)
  bx(clay, -1.27, -1.23, 0.6, 0.602, 3.24, 3.48, '#E3D2B0')
  bx(clay, -1.36, -1.2, 0.46, 0.53, 3.239, 3.24, C.white)
  clay.cyl([-5.25, 2.05, -3.6], 0.14, 0.03, C.white, { seg: 28, rot: [Math.PI / 2, 0, 0] })
  clay.torus([-5.25, 2.05, -3.585], 0.14, 0.012, C.dark, { seg: 28 })
  clay.box([-5.25, 2.09, -3.582], [0.012, 0.08, 0.004], C.dark)
  clay.box([-5.22, 2.05, -3.581], [0.06, 0.01, 0.004], C.dark)

  return {
    clay: clay.build(),
    epoxy: k.epoxy.build(),
    steel: steel.build(),
    glow: glow.build(),
    glass: glass.build(),
    ...moving(),
  }
}

/** The parts that move: the shaker's platform and flasks, and the freezer door (built about its hinge). */
function moving() {
  const shaker = new Kit()
  bx(shaker, -5.0, -4.2, 0.5, 0.53, -3.5, -2.96, C.steel, 0.008)
  for (let i = 0; i < 3; i++) {
    const x = -4.86 + i * 0.26
    shaker.lathe(
      [
        [0, 0],
        [0.075, 0],
        [0.078, 0.01],
        [0.03, 0.13],
        [0.024, 0.18],
        [0.028, 0.19],
        [0, 0.19],
      ],
      '#D6E3E8',
      [x, 0.53, -3.22],
      { seg: 16 },
    )
    shaker.cyl([x, 0.555, -3.22], 0.07, 0.05, '#D9B65A', { seg: 16, r2: 0.05 })
    shaker.cyl([x, 0.73, -3.22], 0.03, 0.03, '#E8DFC5', { seg: 10 })
  }
  const door = new Kit()
  const doorGlow = new Kit()
  bx(door, -0.74, 0, 0.22, 1.84, 0, 0.07, C.white, 0.015)
  bx(door, -0.7, -0.04, 0.27, 1.79, -0.006, 0.002, '#C8CDD2')
  door.box([-0.66, 1.16, 0.09], [0.03, 0.34, 0.03], C.steel, 0.01)
  for (const y of [1.0, 1.32]) door.box([-0.66, y, 0.078], [0.02, 0.02, 0.02], C.steel)
  door.box([-0.2, 1.65, 0.072], [0.1, 0.07, 0.006], C.dark, 0.006)
  doorGlow.box([-0.42, 1.65, 0.073], [0.18, 0.055, 0.004], C.led)
  return { shaker: shaker.build(), door: door.build(), doorGlow: doorGlow.build() }
}

let geo: ReturnType<typeof build> | null = null
const ease = (x: number) => x * x * (3 - 2 * x)

export function LabPlinth() {
  const g = useMemo(() => (geo ??= build()), [])
  const door = useRef<Group>(null)
  const shaker = useRef<Mesh>(null)
  const still = useMemo(reducedMotion, [])
  const open = useRef(0)
  useFrame((st, dt) => {
    const k = still ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 3.2)
    open.current += (fx.freezerOpen - open.current) * k
    if (door.current) door.current.rotation.y = 1.7 * ease(Math.min(1, Math.max(0, open.current)))
    if (shaker.current && !still) {
      const a = st.clock.elapsedTime * Math.PI * 2 * 2.2
      shaker.current.position.set(0.012 * Math.cos(a), 0, 0.012 * Math.sin(a))
    }
  })
  const solid = (geom: BufferGeometry, m: typeof M.clay | typeof M.epoxy) => <mesh geometry={geom} material={m} castShadow receiveShadow />
  return (
    <group>
      {solid(g.clay, M.clay)}
      {solid(g.epoxy, M.epoxy)}
      {solid(g.steel, M.steel)}
      <mesh geometry={g.glow} material={M.glow} />
      <mesh geometry={g.glass} material={M.glass} renderOrder={2} />
      <mesh ref={shaker} geometry={g.shaker} material={M.clay} castShadow />
      <group ref={door} position={[-1.1, 0, -2.8]}>
        <mesh geometry={g.door} material={M.clay} castShadow receiveShadow />
        <mesh geometry={g.doorGlow} material={M.glow} />
      </group>
      <LabPeople />
    </group>
  )
}
