// The Ortiz Lab on the night shift: a wet lab on one plinth with a back wall
// of dusk windows and a lit hallway door. Lena's office and whiteboard on the
// left, the fume hood, biosafety cabinet, incubator and sink along the wall,
// an island bench with reagent shelving down the middle, the confocal bay,
// write-up desks at the front, and Jun's supply shelving and -80 °C freezer on
// the right. All the furniture is a handful of merged meshes; the hover zones
// come from where the pointer lands.

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Color, Group, MeshStandardMaterial, ShaderMaterial, Vector3 } from 'three'
import { BENCH_H, LAB, PAL, WALL_H } from './layout'
import { Kit, made } from './kit'
import { M } from './mats'
import { ZonePick } from './Parts'
import { Researchers, personAt } from './People'
import { fx, reducedMotion } from './store'

type V3 = [number, number, number]
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
/** A point offset (lx, lz) from (x, z) in a frame turned by yaw. */
const off = (x: number, z: number, yaw: number, lx: number, ly: number, lz: number): V3 => [
  x + lx * Math.cos(yaw) + lz * Math.sin(yaw),
  ly,
  z - lx * Math.sin(yaw) + lz * Math.cos(yaw),
]

const CLAY = PAL.clay
const STEEL = PAL.steel
const SLATE = '#2E3540'
const WOOD = '#B9A68A'
const DARK = '#262B33'
const WARM = '#FFC98C'
const SCREEN = '#9DB8FF'

const BOTTLES = ['#8A4A12', '#D8E4EA', '#8A4A12', '#E9E4DA', '#3E6FB0', '#D8E4EA']
const CAPS = ['#1A1B1E', '#3A6FD8', '#C0392B', '#E7B04A', '#2E9C8E']

function bottle(c: Kit, x: number, y: number, z: number, i: number, h = 0.2) {
  const col = BOTTLES[Math.floor(rnd(i) * BOTTLES.length)]
  const r = h * 0.3
  c.lathe([[0.001, 0], [r, 0], [r, h * 0.72], [r * 0.45, h * 0.86], [r * 0.4, h], [0.001, h]], [x, y, z], col, 12)
  c.cyl([x, y + h + 0.02, z], r * 0.45, 0.04, CAPS[Math.floor(rnd(i + 7) * CAPS.length)], 10)
  if (rnd(i + 3) > 0.4) c.cyl([x, y + h * 0.42, z], r + 0.002, h * 0.3, '#F2F1EC', 12)
}
function boxOf(c: Kit, x: number, y: number, z: number, i: number, s = 1) {
  const cols = ['#C49A6C', '#3E7BE0', '#F2F1EC', '#2F67C9', '#C49A6C', '#E3CFA4']
  const w = (0.22 + rnd(i) * 0.16) * s
  const h = (0.14 + rnd(i + 1) * 0.16) * s
  c.box([x, y + h / 2, z], [w, h, 0.26 * s], cols[Math.floor(rnd(i + 2) * cols.length)], 0.01)
  return w
}
function monitor(c: Kit, g: Kit, x: number, z: number, yaw: number, y = 0.765, w = 0.52, on = 1, tint = SCREEN) {
  c.cyl(off(x, z, yaw, 0, y + 0.01, -0.05), 0.09, 0.02, DARK, 14)
  c.slab(off(x, z, yaw, 0, y + 0.15, -0.06), [0.04, 0.26, 0.03], DARK, [0, yaw, 0])
  c.box(off(x, z, yaw, 0, y + 0.33, -0.04), [w, w * 0.6, 0.035], DARK, 0.012, [0, yaw, 0])
  if (on > 0) {
    g.slab(off(x, z, yaw, 0, y + 0.33, -0.02), [w - 0.04, w * 0.6 - 0.04, 0.005], tint, [0, yaw, 0], on)
    for (let i = 0; i < 4; i++) g.slab(off(x, z, yaw, -w * 0.12 + (i % 2) * 0.05, y + 0.42 - i * 0.05, -0.015), [w * 0.5 - (i % 2) * 0.1, 0.012, 0.004], '#E9F0FF', [0, yaw, 0], on * 1.3)
  }
}
function keyboard(c: Kit, x: number, z: number, yaw: number, y = 0.765) {
  c.slab(off(x, z, yaw, 0, y + 0.01, 0.18), [0.42, 0.02, 0.14], '#3A404A', [0, yaw, 0])
  c.slab(off(x, z, yaw, 0.3, y + 0.01, 0.2), [0.06, 0.02, 0.1], '#3A404A', [0, yaw, 0])
}
function chair(c: Kit, x: number, z: number, yaw: number, col = '#3F5E8C') {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    c.slab([x + Math.cos(a) * 0.14, 0.05, z + Math.sin(a) * 0.14], [0.28, 0.03, 0.045], DARK, [0, -a, 0])
  }
  c.cyl([x, 0.25, z], 0.025, 0.4, STEEL, 10)
  c.box([x, 0.47, z], [0.46, 0.07, 0.44], col, 0.03, [0, yaw, 0])
  c.box(off(x, z, yaw, 0, 0.78, -0.24), [0.42, 0.4, 0.06], col, 0.03, [-0.1, yaw, 0])
  c.slab(off(x, z, yaw, 0, 0.6, -0.235), [0.05, 0.22, 0.03], DARK, [0, yaw, 0])
}
function pipetteStand(c: Kit, x: number, z: number, y = BENCH_H) {
  c.cyl([x, y + 0.012, z], 0.09, 0.025, '#E9E7E1', 16)
  c.cyl([x, y + 0.2, z], 0.012, 0.38, '#C9C6BE', 8)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4
    c.capsule([x + Math.cos(a) * 0.06, y + 0.22, z + Math.sin(a) * 0.06], 0.017, 0.15, '#E9E7E1', [0, 0, 0])
    c.cyl([x + Math.cos(a) * 0.06, y + 0.33, z + Math.sin(a) * 0.06], 0.019, 0.02, ['#3A6FD8', '#E7B04A', '#C0392B'][i], 10)
  }
}
function rack(c: Kit, x: number, y: number, z: number, i: number, n = 5) {
  c.box([x, y + 0.03, z], [0.07 * n + 0.04, 0.06, 0.13], ['#E7B04A', '#3FC4DE', '#E15FA6', '#5BC98C'][i % 4], 0.01)
  for (let j = 0; j < n; j++) for (let k = 0; k < 2; k++) c.cyl([x - (0.07 * (n - 1)) / 2 + j * 0.07, y + 0.08, z - 0.03 + k * 0.06], 0.014, 0.08, rnd(i * 9 + j * 2 + k) > 0.5 ? '#F4F1EA' : '#F2D35A', 8)
}
function plates(c: Kit, x: number, y: number, z: number, n: number) {
  for (let i = 0; i < n; i++) {
    c.cyl([x + (i % 2) * 0.01, y + 0.012 + i * 0.024, z], 0.075, 0.022, '#DCE8EC', 18)
    c.cyl([x + (i % 2) * 0.01, y + 0.012 + i * 0.024, z], 0.068, 0.014, '#D9972F', 18)
  }
}

/** The back wall, with holes for the windows and the hallway door. */
const HOLES = [
  { x0: -8.9, x1: -7.4, y0: 0.9, y1: 2.35 },
  { x0: -3.1, x1: -1.1, y0: 1.95, y1: 2.5 },
  { x0: -0.9, x1: 0.2, y0: 0, y1: 2.15 },
  { x0: 1.55, x1: 2.3, y0: 0.9, y1: 2.35 },
]
function wall(c: Kit) {
  const xs = [...new Set([LAB.x0, LAB.x1, ...HOLES.flatMap(h => [h.x0, h.x1])])].sort((a, b) => a - b)
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i]
    const b = xs[i + 1]
    const cut = HOLES.filter(h => h.x0 <= a + 1e-6 && h.x1 >= b - 1e-6).sort((p, q) => p.y0 - q.y0)
    let y = 0
    for (const h of [...cut, { y0: WALL_H, y1: WALL_H }]) {
      if (h.y0 > y + 0.001) c.slab([(a + b) / 2, (y + h.y0) / 2, LAB.z0 + 0.075], [b - a, h.y0 - y, 0.15], PAL.wall)
      y = Math.max(y, h.y1)
    }
  }
  c.slab([(LAB.x0 + LAB.x1) / 2, WALL_H + 0.02, LAB.z0 + 0.075], [LAB.x1 - LAB.x0 + 0.02, 0.04, 0.19], '#A99F92')
  for (const h of HOLES) {
    if (h.y0 === 0) continue
    const cx = (h.x0 + h.x1) / 2
    c.slab([cx, h.y0 - 0.02, LAB.z0 + 0.19], [h.x1 - h.x0 + 0.12, 0.04, 0.12], '#E9E4DC')
    for (const x of [h.x0 + 0.025, h.x1 - 0.025]) c.slab([x, (h.y0 + h.y1) / 2, LAB.z0 + 0.11], [0.05, h.y1 - h.y0, 0.07], '#4A5260')
    c.slab([cx, h.y1 - 0.025, LAB.z0 + 0.11], [h.x1 - h.x0, 0.05, 0.07], '#4A5260')
    c.slab([cx, h.y0 + 0.02, LAB.z0 + 0.11], [h.x1 - h.x0, 0.04, 0.07], '#4A5260')
    const n = Math.max(1, Math.round((h.x1 - h.x0) / 0.7))
    for (let i = 1; i < n; i++) c.slab([h.x0 + ((h.x1 - h.x0) * i) / n, (h.y0 + h.y1) / 2, LAB.z0 + 0.11], [0.035, h.y1 - h.y0, 0.05], '#4A5260')
  }
  // the door's frame and the hallway beyond
  const d = HOLES[2]
  for (const x of [d.x0 + 0.03, d.x1 - 0.03]) c.slab([x, d.y1 / 2, LAB.z0 + 0.1], [0.06, d.y1, 0.2], '#8E8577')
  c.slab([(d.x0 + d.x1) / 2, d.y1 + 0.03, LAB.z0 + 0.1], [d.x1 - d.x0, 0.06, 0.2], '#8E8577')
  c.slab([d.x1 - 0.05, d.y1 / 2 - 0.02, LAB.z0 - 0.52], [0.045, d.y1 - 0.06, 1.0], '#D6CEC2')
  c.slab([d.x1 - 0.09, 1.0, LAB.z0 - 0.9], [0.03, 0.04, 0.14], STEEL)
  // a clock over the door
  c.cyl([(d.x0 + d.x1) / 2, 2.42, LAB.z0 + 0.16], 0.13, 0.025, '#F4F1EA', 24, [Math.PI / 2, 0, 0])
  c.torus([(d.x0 + d.x1) / 2, 2.42, LAB.z0 + 0.175], 0.13, 0.012, DARK)
  c.slab([(d.x0 + d.x1) / 2 + 0.03, 2.44, LAB.z0 + 0.18], [0.07, 0.012, 0.005], DARK, [0, 0, 0.6])
  c.slab([(d.x0 + d.x1) / 2, 2.47, LAB.z0 + 0.18], [0.01, 0.09, 0.005], DARK)
}

function office(c: Kit, _s: Kit, g: Kit, gl: Kit) {
  // carpet, partitions, the door gap
  c.slab([-7.85, 0.006, -1.9], [2.7, 0.01, 2.55], '#6E6B7E')
  c.slab([-8.25, 0.5, -0.6], [1.9, 1.0, 0.08], CLAY)
  c.slab([-8.25, 1.02, -0.6], [1.94, 0.04, 0.12], '#A99F92')
  gl.slab([-8.25, 1.6, -0.6], [1.9, 1.12, 0.02], '#FFFFFF')
  c.slab([-8.25, 2.18, -0.6], [1.94, 0.05, 0.1], '#4A5260')
  for (const x of [-7.32, -6.58]) c.slab([x, 1.1, -0.6], [0.06, 2.2, 0.1], '#4A5260')
  c.slab([-6.95, 2.18, -0.6], [0.8, 0.05, 0.1], '#4A5260')
  c.slab([-6.5, 1.05, -1.9], [0.1, 2.1, 2.6], CLAY)
  c.slab([-6.5, 2.12, -1.9], [0.14, 0.04, 2.64], '#A99F92')
  // the whiteboard on the partition, and what Lena has drawn on it
  c.slab([-6.565, 1.45, -1.75], [0.03, 1.02, 1.42], '#C9CED6')
  c.slab([-6.585, 1.45, -1.75], [0.01, 0.94, 1.34], '#F7F7F4')
  c.slab([-6.62, 0.93, -1.75], [0.08, 0.03, 1.0], '#C9CED6')
  for (const [z, col] of [[-1.55, '#2D5BD0'], [-1.68, '#C0392B'], [-1.81, '#1E2229']] as const) c.cyl([-6.62, 0.955, z], 0.011, 0.11, col, 8, [Math.PI / 2, 0, 0])
  const ink = (y: number, z: number, w: number, h: number, col = '#2D3A55', r = 0) => c.slab([-6.592, y, z], [0.004, h, w], col, [r, 0, 0])
  ink(1.82, -2.05, 0.5, 0.025)
  ink(1.74, -2.12, 0.36, 0.018)
  ink(1.66, -2.1, 0.4, 0.018)
  for (const [y, z] of [[1.42, -2.2], [1.42, -1.75], [1.42, -1.3]]) {
    ink(y + 0.11, z, 0.26, 0.012)
    ink(y - 0.11, z, 0.26, 0.012)
    ink(y, z - 0.13, 0.012, 0.22)
    ink(y, z + 0.13, 0.012, 0.22)
  }
  ink(1.42, -1.975, 0.15, 0.012, '#C0392B')
  ink(1.42, -1.525, 0.15, 0.012, '#C0392B')
  ink(1.13, -1.75, 0.8, 0.012, '#2D5BD0')
  ink(1.05, -1.9, 0.4, 0.012, '#2D5BD0')
  // the PI's desk
  c.slab([-8.78, 0.74, -1.35], [0.66, 0.05, 1.15], WOOD)
  c.box([-8.78, 0.36, -0.95], [0.6, 0.7, 0.4], '#A79479', 0.01)
  for (const z of [-1.88, -0.82]) c.slab([-8.5, 0.36, z], [0.04, 0.72, 0.04], DARK)
  for (let i = 0; i < 3; i++) c.slab([-8.47, 0.18 + i * 0.22, -0.95], [0.01, 0.015, 0.14], STEEL)
  monitor(c, g, -8.95, -1.45, Math.PI / 2, 0.765, 0.58, 1.0)
  keyboard(c, -8.95, -1.45, Math.PI / 2)
  c.cyl([-8.9, 0.8, -0.95], 0.04, 0.08, '#E15F4F', 12)
  for (let i = 0; i < 4; i++) c.slab([-8.85, 0.775 + i * 0.012, -1.92 + rnd(i) * 0.04], [0.22, 0.01, 0.3], '#F4F1EA', [0, rnd(i + 3) * 0.3, 0])
  // the desk lamp
  c.cyl([-8.95, 0.78, -1.95], 0.07, 0.025, DARK, 14)
  c.capsule([-8.9, 1.0, -1.9], 0.012, 0.42, DARK, [0, 0, -0.35])
  c.cap([-8.78, 1.2, -1.85], 0.09, 1.3, DARK, [1, 0.8, 1], [0, 0, 0.6])
  g.sphere([-8.75, 1.15, -1.85], 0.04, WARM, undefined, 10, 3)
  chair(c, -8.0, -1.3, -Math.PI / 2, '#5A4A6A')
  // bookshelf, filing cabinet, a plant
  c.box([-7.0, 0.9, -2.9], [0.7, 1.8, 0.3], '#8E7A5E', 0.01)
  for (let r = 0; r < 4; r++) {
    c.slab([-7.0, 0.3 + r * 0.42, -2.82], [0.64, 0.025, 0.28], '#6E5C44')
    let x = -7.3
    for (let i = 0; x < -6.72 && i < 12; i++) {
      const w = 0.035 + rnd(r * 13 + i) * 0.04
      const h = 0.22 + rnd(r * 7 + i) * 0.1
      c.slab([x + w / 2, 0.315 + r * 0.42 + h / 2, -2.8], [w, h, 0.2], ['#7D3B3B', '#3E5A7A', '#D8C9A8', '#4C6A55', '#B9894A', '#5A4A6A'][Math.floor(rnd(r * 3 + i) * 6)])
      x += w + 0.008
    }
  }
  c.box([-8.95, 0.55, -2.8], [0.42, 1.1, 0.5], '#8D939B', 0.01)
  for (let i = 0; i < 3; i++) c.slab([-8.95, 0.25 + i * 0.35, -2.545], [0.12, 0.025, 0.02], STEEL)
  c.lathe([[0.001, 0], [0.14, 0], [0.17, 0.32], [0.001, 0.32]], [-7.75, 0, -2.85], '#B9653C', 16)
  for (let i = 0; i < 7; i++) c.sphere([-7.75 + (rnd(i) - 0.5) * 0.22, 0.48 + rnd(i + 5) * 0.4, -2.85 + (rnd(i + 9) - 0.5) * 0.22], 0.11, '#3E6B4A', [1, 1.3, 1], 10)
}

function backWall(c: Kit, s: Kit, g: Kit, gl: Kit) {
  // Fume hood
  c.box([-5.6, 0.45, -2.65], [1.4, 0.9, 0.8], CLAY, 0.02)
  for (const x of [-5.95, -5.25]) c.slab([x, 0.47, -2.245], [0.62, 0.74, 0.012], '#C2B8AA')
  for (const x of [-5.7, -5.5]) c.slab([x, 0.7, -2.235], [0.12, 0.025, 0.02], STEEL)
  s.slab([-5.6, 0.93, -2.65], [1.4, 0.05, 0.8], SLATE)
  for (const x of [-6.27, -4.93]) c.slab([x, 1.65, -2.65], [0.06, 1.4, 0.8], CLAY)
  c.box([-5.6, 2.17, -2.65], [1.4, 0.36, 0.8], CLAY, 0.02)
  c.slab([-5.6, 1.6, -3.0], [1.3, 1.3, 0.04], '#9AA0A8')
  g.slab([-5.6, 1.97, -2.6], [1.2, 0.02, 0.5], '#EAF0FF', undefined, 1.6)
  gl.slab([-5.6, 1.66, -2.26], [1.3, 0.56, 0.02], '#FFFFFF')
  s.slab([-5.6, 1.37, -2.24], [1.3, 0.035, 0.04], STEEL)
  s.slab([-5.6, 1.95, -2.24], [1.3, 0.035, 0.04], STEEL)
  g.slab([-4.96, 1.55, -2.24], [0.05, 0.08, 0.01], '#5BC98C', undefined, 1.6)
  s.cyl([-5.6, 2.52, -2.75], 0.17, 0.36, STEEL, 16)
  for (let i = 0; i < 4; i++) bottle(c, -6.05 + i * 0.22, 0.955, -2.75 + (i % 2) * 0.12, 40 + i, 0.2 + rnd(i) * 0.08)
  rack(c, -5.2, 0.955, -2.55, 3, 4)
  // Biosafety cabinet, its sash down to the working height and its work light on
  for (const [x, z] of [[-4.62, -2.38], [-3.38, -2.38], [-4.62, -2.98], [-3.38, -2.98]]) s.slab([x, 0.35, z], [0.05, 0.7, 0.05], STEEL)
  s.slab([-4.0, 0.12, -2.68], [1.3, 0.04, 0.65], STEEL)
  c.box([-4.0, 0.84, -2.68], [1.4, 0.28, 0.75], '#D9DCDF', 0.02)
  s.slab([-4.0, 0.985, -2.7], [1.28, 0.02, 0.62], '#C9CED4')
  for (const x of [-4.67, -3.33]) c.slab([x, 1.56, -2.68], [0.06, 1.2, 0.75], '#D9DCDF')
  c.box([-4.0, 2.05, -2.68], [1.4, 0.34, 0.75], '#D9DCDF', 0.02)
  c.slab([-4.0, 1.5, -3.02], [1.3, 1.1, 0.04], '#B9BEC4')
  g.slab([-4.0, 1.86, -2.68], [1.25, 0.02, 0.6], '#FFE7C4', undefined, 1.9)
  g.slab([-4.0, 1.5, -2.995], [1.2, 0.68, 0.005], '#FFE7C4', undefined, 0.55)
  gl.slab([-4.0, 1.55, -2.31], [1.3, 0.62, 0.02], '#FFFFFF', [-0.16, 0, 0])
  s.slab([-4.0, 1.24, -2.27], [1.3, 0.03, 0.05], STEEL)
  c.slab([-4.0, 1.0, -2.3], [1.32, 0.04, 0.04], DARK)
  g.slab([-3.6, 2.1, -2.3], [0.2, 0.06, 0.005], '#7CE0B8', undefined, 1.4)
  plates(c, -4.25, 1.0, -2.75, 5)
  plates(c, -4.05, 1.0, -2.85, 3)
  c.cyl([-3.7, 1.04, -2.75], 0.06, 0.08, '#E9E4DA', 14)
  rack(c, -3.85, 1.0, -2.6, 1, 3)
  // a biohazard bin beside it
  c.lathe([[0.001, 0], [0.16, 0], [0.18, 0.55], [0.001, 0.55]], [-4.88, 0, -2.0], '#D9DCDF', 16)
  c.cyl([-4.88, 0.57, -2.0], 0.19, 0.04, '#C0392B', 16)
  // Incubator over an orbital shaker
  c.box([-2.7, 0.4, -2.68], [0.8, 0.8, 0.72], '#DADDE0', 0.02)
  c.slab([-2.7, 0.4, -2.315], [0.66, 0.5, 0.01], '#C9CED4')
  g.slab([-2.95, 0.68, -2.31], [0.14, 0.05, 0.005], '#E8B04A', undefined, 1.5)
  c.box([-2.7, 1.38, -2.68], [0.8, 1.0, 0.72], '#E4E6E8', 0.02)
  c.slab([-2.7, 1.36, -2.31], [0.7, 0.88, 0.02], '#D2D6DA')
  gl.slab([-2.72, 1.36, -2.295], [0.5, 0.66, 0.01], '#FFFFFF')
  for (let i = 0; i < 3; i++) s.slab([-2.72, 1.08 + i * 0.2, -2.6], [0.52, 0.015, 0.5], STEEL)
  for (let i = 0; i < 4; i++) c.cyl([-2.85 + i * 0.1, 1.15 + (i % 2) * 0.2, -2.55], 0.035, 0.12, '#E6EEF0', 10)
  g.slab([-2.45, 1.8, -2.3], [0.16, 0.06, 0.005], '#FF8A5C', undefined, 1.4)
  s.slab([-2.36, 1.36, -2.28], [0.03, 0.3, 0.04], STEEL)
  // Sink, eyewash, towels
  c.box([-1.6, 0.45, -2.78], [1.0, 0.9, 0.55], CLAY, 0.02)
  c.slab([-1.6, 0.47, -2.5], [0.9, 0.76, 0.012], '#C2B8AA')
  s.slab([-1.6, 0.92, -2.78], [1.02, 0.04, 0.58], SLATE)
  c.slab([-1.65, 0.943, -2.78], [0.56, 0.008, 0.36], '#151A20')
  s.cyl([-1.65, 1.1, -2.98], 0.02, 0.32, STEEL, 10)
  s.torus([-1.65, 1.26, -2.9], 0.08, 0.02, STEEL, [0, Math.PI / 2, 0], Math.PI)
  s.cyl([-1.25, 1.02, -2.9], 0.07, 0.03, '#E7B04A', 14)
  s.cyl([-1.25, 0.95, -2.95], 0.015, 0.14, STEEL, 8)
  g.slab([-1.25, 1.55, -3.04], [0.22, 0.22, 0.008], '#3FBF6F', undefined, 1.2)
  g.slab([-1.25, 1.55, -3.035], [0.06, 0.16, 0.008], '#F4F1EA', undefined, 1.0)
  c.box([-1.95, 1.45, -3.0], [0.28, 0.34, 0.1], '#E9E4DC', 0.02)
  // -80 °C freezer (its door moves; see Freezer)
  c.box([0.9, 0.98, -2.65], [0.9, 1.95, 0.8], '#E4E6E8', 0.03)
  c.slab([0.9, 1.88, -2.24], [0.86, 0.12, 0.02], '#C9CED4')
  g.slab([0.7, 1.88, -2.225], [0.26, 0.06, 0.005], '#7FB4FF', undefined, 1.6)
  g.sphere([1.2, 1.88, -2.225], 0.015, '#5BC98C', undefined, 8, 2)
  // the hallway beyond the door: warm light on its floor and far wall
  const d = HOLES[2]
  g.slab([(d.x0 + d.x1) / 2, 0.004, LAB.z0 - 0.6], [d.x1 - d.x0 + 0.6, 0.008, 1.2], '#FFC98C', undefined, 0.8)
  g.slab([(d.x0 + d.x1) / 2, 1.2, LAB.z0 - 1.2], [d.x1 - d.x0 + 0.6, 2.4, 0.02], '#E8B987', undefined, 0.55)
  g.slab([(d.x0 + d.x1) / 2 - 0.3, 2.3, LAB.z0 - 0.9], [0.5, 0.03, 0.12], '#FFF1DC', undefined, 2.2)
}

function island(c: Kit, s: Kit, g: Kit) {
  const x0 = -5.8, x1 = -0.4, z0 = -0.8, z1 = 0.7
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
  c.box([cx, 0.44, cz], [x1 - x0 - 0.1, 0.84, z1 - z0 - 0.1], CLAY, 0.02)
  c.slab([cx, 0.05, cz], [x1 - x0 - 0.2, 0.1, z1 - z0 - 0.2], '#8E8577')
  for (let i = 0; i < 9; i++) {
    const x = x0 + 0.35 + i * 0.6
    for (const z of [z0 + 0.045, z1 - 0.045]) {
      c.slab([x, 0.5, z], [0.56, 0.7, 0.012], '#C2B8AA')
      c.slab([x, 0.78, z + (z > 0 ? 0.008 : -0.008)], [0.14, 0.02, 0.012], STEEL)
    }
  }
  s.slab([cx, 0.9, cz], [x1 - x0, 0.05, z1 - z0], SLATE)
  // reagent shelving down the middle, with a warm strip light under it
  for (const x of [x0 + 0.2, cx, x1 - 0.2]) s.slab([x, 1.34, cz], [0.04, 0.82, 0.04], STEEL)
  for (const y of [1.3, 1.7]) s.slab([cx, y, cz], [x1 - x0 - 0.3, 0.03, 0.3], '#C9CED4')
  g.slab([cx, 1.28, cz], [x1 - x0 - 0.5, 0.012, 0.05], WARM, undefined, 2.2)
  let n = 0
  for (const y of [1.315, 1.715]) {
    let x = x0 + 0.35
    while (x < x1 - 0.4) {
      if (rnd(n) > 0.35) {
        bottle(c, x, y, cz + (rnd(n + 4) - 0.5) * 0.12, n, 0.16 + rnd(n + 1) * 0.12)
        x += 0.14
      } else x += boxOf(c, x + 0.1, y, cz, n, 0.8) + 0.06
      n++
    }
  }
  const T = BENCH_H
  // Sam's purification bench: FPLC with its column, fraction collector, ice bucket, racks
  c.box([-5.35, T + 0.38, -0.5], [0.5, 0.76, 0.4], '#DADDE0', 0.03)
  g.slab([-5.35, T + 0.62, -0.29], [0.34, 0.2, 0.01], '#8FD3FF', [-0.15, 0, 0], 1.3)
  for (let i = 0; i < 4; i++) c.cyl([-5.5 + i * 0.1, T + 0.2, -0.29], 0.025, 0.02, ['#5BC98C', '#E8B04A', '#3A6FD8', '#C0392B'][i], 10, [Math.PI / 2, 0, 0])
  s.cyl([-5.68, T + 0.42, -0.4], 0.035, 0.5, '#DCEAF0', 14)
  c.cyl([-5.68, T + 0.36, -0.4], 0.028, 0.32, '#3F6FD0', 12)
  c.torus([-5.6, T + 0.72, -0.4], 0.1, 0.008, '#F0C57A', [0, 0, 0], Math.PI)
  c.box([-4.95, T + 0.09, -0.45], [0.34, 0.18, 0.34], '#C9CED4', 0.02)
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) c.cyl([-5.06 + i * 0.075, T + 0.21, -0.56 + j * 0.075], 0.014, 0.07, '#F4F1EA', 6)
  c.lathe([[0.001, 0], [0.13, 0], [0.17, 0.2], [0.16, 0.2], [0.001, 0.02]], [-4.6, T, -0.5], '#E07A3A', 18)
  for (let i = 0; i < 6; i++) c.sphere([-4.6 + (rnd(i) - 0.5) * 0.2, T + 0.18, -0.5 + (rnd(i + 3) - 0.5) * 0.2], 0.05, '#F4F8FA', undefined, 8)
  for (let i = 0; i < 5; i++) c.cyl([-4.66 + (i % 3) * 0.06, T + 0.22, -0.52 + Math.floor(i / 3) * 0.07], 0.012, 0.07, ['#E15FA6', '#3FC4DE', '#F2D35A'][i % 3], 8)
  rack(c, -4.25, T, -0.45, 0, 5)
  c.slab([-4.3, T + 0.015, -0.2], [0.13, 0.02, 0.09], '#E9EEF2')
  pipetteStand(c, -4.85, -0.2)
  // Priya's micro bench: plates under a lamp, a light box, the microfluidic setup
  plates(c, -2.65, T, -0.5, 6)
  plates(c, -2.45, T, -0.45, 3)
  g.slab([-2.55, T + 0.015, -0.25], [0.3, 0.02, 0.2], '#F4F8FF', undefined, 1.3)
  c.cyl([-2.15, T + 0.02, -0.6], 0.07, 0.03, DARK, 14)
  c.capsule([-2.18, T + 0.24, -0.5], 0.012, 0.4, DARK, [0.5, 0, 0])
  c.cap([-2.2, T + 0.45, -0.38], 0.08, 1.3, DARK, undefined, [0.9, 0, 0])
  g.sphere([-2.2, T + 0.41, -0.35], 0.035, WARM, undefined, 10, 3)
  c.box([-1.6, T + 0.06, -0.45], [0.36, 0.12, 0.3], '#DADDE0', 0.02)
  c.slab([-1.72, T + 0.3, -0.5], [0.06, 0.4, 0.06], '#DADDE0')
  c.cyl([-1.6, T + 0.42, -0.5], 0.05, 0.12, '#3A404A', 12)
  c.slab([-1.6, T + 0.135, -0.45], [0.16, 0.01, 0.08], '#BFE3F0')
  c.box([-1.2, T + 0.07, -0.5], [0.28, 0.14, 0.18], '#3A4450', 0.02)
  c.cyl([-1.2, T + 0.17, -0.5], 0.015, 0.2, '#E6EEF0', 8, [0, 0, Math.PI / 2])
  pipetteStand(c, -1.95, -0.2)
  // the front side: microcentrifuge, vortex, gel box with its power supply, gel imager, tip boxes
  c.lathe([[0.001, 0], [0.16, 0], [0.16, 0.1], [0.12, 0.17], [0.001, 0.18]], [-4.7, T, 0.38], '#E4E6E8', 20)
  c.cyl([-4.35, T + 0.05, 0.42], 0.06, 0.1, '#3A4450', 14)
  c.box([-3.85, T + 0.07, 0.38], [0.36, 0.14, 0.2], '#BFD6E8', 0.02)
  c.slab([-3.85, T + 0.12, 0.38], [0.3, 0.02, 0.14], '#5A8BD6')
  c.box([-3.42, T + 0.08, 0.42], [0.24, 0.16, 0.2], DARK, 0.02)
  g.slab([-3.42, T + 0.11, 0.525], [0.14, 0.05, 0.005], '#FF6A4A', undefined, 1.6)
  c.capsule([-3.62, T + 0.04, 0.44], 0.008, 0.2, '#C0392B', [0, 0, Math.PI / 2])
  c.capsule([-3.62, T + 0.03, 0.4], 0.008, 0.2, '#1A1B1E', [0, 0, Math.PI / 2])
  c.box([-1.2, T + 0.23, 0.35], [0.55, 0.46, 0.42], '#3A404A', 0.03)
  c.slab([-1.2, T + 0.18, 0.565], [0.4, 0.3, 0.01], '#2A2F36')
  g.slab([-1.2, T + 0.38, 0.57], [0.3, 0.1, 0.005], '#E3A0FF', undefined, 0.9)
  for (let i = 0; i < 5; i++) g.slab([-1.32 + i * 0.06, T + 0.38, 0.574], [0.012, 0.07, 0.003], '#FFE3FF', undefined, 1.3)
  for (const [x, i] of [[-5.5, 0], [-2.95, 1], [-0.75, 2]] as const) {
    c.box([x, T + 0.05, 0.42], [0.26, 0.1, 0.18], '#2F67C9', 0.012)
    for (let a = 0; a < 6; a++) for (let b = 0; b < 3; b++) c.cyl([x - 0.1 + a * 0.04, T + 0.12, 0.37 + b * 0.05], 0.009, 0.05, i === 1 ? '#F4F1EA' : '#F2D35A', 5, undefined, 0.004)
  }
}

function confocal(c: Kit, s: Kit, g: Kit) {
  c.slab([-7.9, 0.006, 1.9], [2.55, 0.01, 3.3], '#4E5563')
  // anti-vibration table and the microscope on it
  s.slab([-8.38, 0.78, 1.3], [1.05, 0.08, 1.6], '#2B2F36')
  for (const [x, z] of [[-8.8, 0.6], [-7.95, 0.6], [-8.8, 2.0], [-7.95, 2.0]]) c.cyl([x, 0.37, z], 0.07, 0.74, '#8D939B', 14)
  c.box([-8.3, 0.88, 1.5], [0.6, 0.12, 0.55], '#E4E6E8', 0.03)
  c.box([-8.5, 1.25, 1.5], [0.22, 0.75, 0.4], '#E4E6E8', 0.03)
  c.box([-8.2, 1.58, 1.5], [0.6, 0.18, 0.36], '#E4E6E8', 0.04)
  s.slab([-8.05, 1.08, 1.5], [0.32, 0.03, 0.34], '#3A404A')
  c.cyl([-8.05, 1.25, 1.5], 0.045, 0.22, '#3A404A', 12)
  for (const dz of [-0.04, 0.04]) c.cyl([-7.88, 1.42, 1.5 + dz], 0.022, 0.16, DARK, 10, [0, 0, -1.0])
  c.box([-7.98, 1.36, 1.5], [0.12, 0.08, 0.14], '#E4E6E8', 0.02)
  c.box([-8.65, 1.0, 0.85], [0.42, 0.36, 0.38], '#F2F1EC', 0.03)
  c.slab([-8.65, 1.1, 1.042], [0.32, 0.04, 0.005], '#5BC98C')
  c.torus([-8.55, 1.2, 1.12], 0.18, 0.012, DARK, [Math.PI / 2, 0, 0], Math.PI)
  c.box([-7.98, 0.86, 0.92], [0.16, 0.08, 0.16], DARK, 0.02)
  c.cyl([-7.98, 0.95, 0.92], 0.015, 0.1, '#5A667A', 8)
  // the imaging computer
  c.slab([-8.43, 0.74, 2.95], [0.95, 0.05, 0.9], WOOD)
  for (const [x, z] of [[-8.85, 2.55], [-8.0, 2.55], [-8.85, 3.35], [-8.0, 3.35]]) c.slab([x, 0.36, z], [0.04, 0.72, 0.04], DARK)
  monitor(c, g, -8.75, 2.72, Math.PI / 2, 0.765, 0.5, 1.0, '#2A3A5A')
  monitor(c, g, -8.75, 3.2, Math.PI / 2, 0.765, 0.5, 1.0, '#2A3A5A')
  for (let i = 0; i < 9; i++) g.sphere([-8.71, 1.0 + rnd(i) * 0.2, 2.6 + rnd(i + 11) * 0.24], 0.012, i % 2 ? '#5BFFB0' : '#FF6AD5', undefined, 6, 1.8)
  keyboard(c, -8.75, 2.95, Math.PI / 2)
  chair(c, -7.55, 2.95, -Math.PI / 2, '#3A3F4A')
  // a blackout curtain on a rail, pulled back while the scope is in use
  s.slab([-6.6, 2.32, 2.4], [0.04, 0.04, 2.0], STEEL)
  for (let i = 0; i < 4; i++) c.slab([-6.6 + (i % 2 ? 0.03 : -0.03), 1.17, 3.05 + i * 0.1], [0.03, 2.3, 0.12], '#2C3140', [0, (i % 2 ? 0.35 : -0.35), 0])
}

function desks(c: Kit, _s: Kit, g: Kit) {
  const top = 0.74
  for (const [x0, x1] of [[-5.6, -2.55], [-2.15, -0.5]]) {
    const cx = (x0 + x1) / 2
    c.slab([cx, top, 2.4], [x1 - x0, 0.05, 0.7], WOOD)
    c.slab([cx, 0.42, 2.07], [x1 - x0 - 0.1, 0.5, 0.03], '#A79479')
    for (const x of [x0 + 0.04, x1 - 0.04]) c.slab([x, 0.36, 2.4], [0.04, 0.72, 0.66], '#A79479')
  }
  monitor(c, g, -4.9, 2.2, 0, 0.765, 0.56, 1.0)
  monitor(c, g, -5.35, 2.22, 0.35, 0.765, 0.44, 0.0)
  monitor(c, g, -3.25, 2.2, 0, 0.765, 0.56, 1.0, '#B4C3E8')
  monitor(c, g, -1.4, 2.2, 0, 0.765, 0.52, 0.25, '#2C3B66')
  for (const x of [-4.9, -3.25, -1.4]) keyboard(c, x, 2.2, 0)
  for (const [x, z] of [[-4.4, 2.5], [-2.85, 2.35], [-0.9, 2.55]]) {
    c.cyl([x, top + 0.06, z], 0.04, 0.1, ['#E9E4DA', '#3E5A7A', '#E15F4F'][Math.floor(rnd(x) * 3)], 12)
  }
  for (let i = 0; i < 5; i++) c.slab([-3.9 + rnd(i) * 0.1, top + 0.03 + i * 0.01, 2.5], [0.24, 0.008, 0.3], '#F4F1EA', [0, rnd(i + 1) * 0.4 - 0.2, 0])
  for (let i = 0; i < 4; i++) c.slab([-2.75, top + 0.05 + i * 0.045, 2.25], [0.3, 0.04, 0.22], ['#7D3B3B', '#3E5A7A', '#D8C9A8', '#4C6A55'][i], [0, 0.1 * i, 0])
  // desk lamps
  for (const [x, z] of [[-4.15, 2.15], [-0.75, 2.15]]) {
    c.cyl([x, top + 0.04, z], 0.07, 0.03, DARK, 14)
    c.capsule([x + 0.04, top + 0.24, z + 0.02], 0.012, 0.36, DARK, [0.25, 0, -0.2])
    c.cap([x + 0.1, top + 0.44, z + 0.1], 0.085, 1.3, DARK, undefined, [0.8, 0, 0])
    g.sphere([x + 0.1, top + 0.4, z + 0.13], 0.035, WARM, undefined, 10, 3)
  }
  // a plant, chairs, a bin
  c.lathe([[0.001, 0], [0.09, 0], [0.11, 0.18], [0.001, 0.18]], [-5.4, top + 0.025, 2.6], '#E9E4DC', 14)
  for (let i = 0; i < 6; i++) c.capsule([-5.4 + (rnd(i) - 0.5) * 0.1, top + 0.32, 2.6 + (rnd(i + 2) - 0.5) * 0.1], 0.025, 0.2, '#4C7A55', [(rnd(i + 4) - 0.5) * 0.8, 0, (rnd(i + 6) - 0.5) * 0.8])
  chair(c, -4.9, 3.12, Math.PI)
  chair(c, -3.25, 3.12, Math.PI)
  chair(c, -1.35, 3.1, Math.PI + 0.4, '#5A6A80')
  c.lathe([[0.001, 0], [0.14, 0], [0.16, 0.38], [0.001, 0.38]], [-0.25, 0, 2.45], '#4E5967', 16)
  // Sam's ultracentrifuge
  c.box([1.5, 0.45, 2.85], [0.8, 0.9, 0.7], '#E4E6E8', 0.05)
  c.cap([1.5, 0.9, 2.85], 0.36, 1.2, '#D2D6DA', [1, 0.35, 0.9])
  c.slab([1.5, 0.47, 2.495], [0.7, 0.75, 0.01], '#D2D6DA')
  g.slab([1.3, 0.83, 2.55], [0.22, 0.12, 0.01], '#8FD3FF', [-0.7, 0, 0], 1.4)
}

function supply(c: Kit, s: Kit) {
  const x0 = 1.85, x1 = 2.3, z0 = -2.0, z1 = 0.2
  const cx = (x0 + x1) / 2
  for (const x of [x0, x1]) for (const z of [z0, z1]) s.slab([x, 0.8, z], [0.03, 1.6, 0.03], STEEL)
  let n = 100
  for (const y of [0.15, 0.6, 1.05, 1.5]) {
    s.slab([cx, y, (z0 + z1) / 2], [x1 - x0, 0.025, z1 - z0], '#BFC5CC')
    let z = z0 + 0.1
    while (z < z1 - 0.15) {
      if (rnd(n) > 0.7) {
        bottle(c, cx, y + 0.012, z + 0.05, n, 0.2)
        z += 0.14
      } else {
        const w = 0.18 + rnd(n) * 0.2
        const h = 0.14 + rnd(n + 1) * 0.2
        c.box([cx, y + 0.012 + h / 2, z + w / 2], [0.36, h, w], ['#C49A6C', '#3E7BE0', '#F2F1EC', '#2F67C9', '#C49A6C', '#E3CFA4'][Math.floor(rnd(n + 2) * 6)], 0.01)
        z += w + 0.04
      }
      n++
    }
  }
  // cartons waiting by the door, and a cart
  c.box([0.55, 0.2, -1.35], [0.5, 0.4, 0.4], '#C49A6C', 0.01)
  c.box([0.6, 0.55, -1.3], [0.38, 0.3, 0.32], '#B88C5E', 0.01)
  c.slab([0.55, 0.402, -1.35], [0.08, 0.005, 0.41], '#E3CFA4')
}

const DUSK = new ShaderMaterial({
  vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: [
    'varying vec3 vW;',
    'float h1(float x) { return fract(sin(x * 91.7) * 43758.5453); }',
    'void main() {',
    '  float h = clamp((vW.y - 0.85) / 1.75, 0.0, 1.0);',
    '  vec3 c = mix(vec3(0.95, 0.52, 0.3), vec3(0.42, 0.26, 0.5), smoothstep(0.0, 0.32, h));',
    '  c = mix(c, vec3(0.07, 0.1, 0.27), smoothstep(0.28, 0.95, h));',
    '  float b = floor(vW.x * 2.6);',
    '  float top = 1.0 + 0.42 * h1(b) + 0.25 * step(0.8, h1(b + 3.1));',
    '  if (vW.y < top) {',
    '    c = vec3(0.045, 0.055, 0.1);',
    '    vec2 g = vec2(vW.x * 15.0, vW.y * 13.0);',
    '    vec2 f = fract(g);',
    '    float lit = step(0.72, h1(dot(floor(g), vec2(1.0, 57.0))));',
    '    if (f.x > 0.3 && f.x < 0.72 && f.y > 0.32 && f.y < 0.7) c += vec3(1.0, 0.72, 0.38) * lit * 0.85;',
    '  }',
    '  float star = step(0.995, h1(dot(floor(vW.xy * 30.0), vec2(1.0, 113.0)))) * smoothstep(0.55, 0.9, h);',
    '  c += vec3(0.8, 0.85, 1.0) * star;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}',
  ].join('\n'),
  toneMapped: false,
})
const paneGeo = made(m => {
  for (const h of HOLES) if (h.y0 > 0) m.slab([(h.x0 + h.x1) / 2, (h.y0 + h.y1) / 2, LAB.z0 + 0.04], [h.x1 - h.x0, h.y1 - h.y0, 0.01], '#FFFFFF')
})
// Warm light falling through the hallway door onto the lab floor.
const spillGeo = (() => {
  const d = HOLES[2]
  const z0 = LAB.z0 + 0.16
  const p = [d.x0, 0.012, z0, d.x1, 0.012, z0, d.x1 + 0.7, 0.012, z0 + 1.7, d.x0 - 0.5, 0.012, z0 + 1.7]
  const near = new Color('#FFB86E').multiplyScalar(0.4)
  const c = [near.r, near.g, near.b, near.r, near.g, near.b, 0, 0, 0, 0, 0, 0]
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(c), 3))
  g.setIndex([0, 2, 1, 0, 3, 2])
  return g
})()
// Moonlight through the windows, laid on the floor as soft patches.
const moonGeo = (() => {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const k = new Color('#5E7BD8').multiplyScalar(0.22)
  for (const h of HOLES) {
    if (h.y0 === 0) continue
    const a = pos.length / 3
    const z1 = LAB.z0 + 0.2 + h.y0 * 0.75
    const z2 = LAB.z0 + 0.2 + h.y1 * 0.75
    pos.push(h.x0 + 0.3, 0.011, z1, h.x1 + 0.3, 0.011, z1, h.x1 + 0.6, 0.011, z2, h.x0 + 0.6, 0.011, z2)
    for (let i = 0; i < 2; i++) col.push(k.r * 0.4, k.g * 0.4, k.b * 0.4)
    for (let i = 0; i < 2; i++) col.push(k.r, k.g, k.b)
    idx.push(a, a + 2, a + 1, a, a + 3, a + 2)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  g.setIndex(idx)
  return g
})()

const glassMat = new MeshStandardMaterial({ color: '#BFD6E8', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false })

const built = (() => {
  const c = new Kit()
  const s = new Kit()
  const g = new Kit()
  const gl = new Kit()
  const W = LAB.x1 - LAB.x0
  const D = LAB.z1 - LAB.z0
  c.box([(LAB.x0 + LAB.x1) / 2, -0.26, (LAB.z0 + LAB.z1) / 2], [W, 0.52, D], PAL.labBody, 0.05)
  c.slab([(LAB.x0 + LAB.x1) / 2, 0.002, (LAB.z0 + LAB.z1) / 2], [W - 0.04, 0.008, D - 0.04], PAL.floor)
  for (let i = 1; i < 12; i++) c.slab([LAB.x0 + i * (W / 12), 0.0065, (LAB.z0 + LAB.z1) / 2], [0.008, 0.002, D - 0.06], '#B8B0A3')
  for (let i = 1; i < 7; i++) c.slab([(LAB.x0 + LAB.x1) / 2, 0.0065, LAB.z0 + i * (D / 7)], [W - 0.06, 0.002, 0.008], '#B8B0A3')
  wall(c)
  office(c, s, g, gl)
  backWall(c, s, g, gl)
  island(c, s, g)
  confocal(c, s, g)
  desks(c, s, g)
  supply(c, s)
  return { clay: c.build(), sheen: s.build(), glow: g.build(), glass: gl.build() }
})()

// ── Moving furniture: the freezer door and the shaker's platform ─────────

const doorGeo = made(m => {
  m.box([-0.44, 0.92, 0.045], [0.86, 1.62, 0.09], '#ECEEF0', 0.03)
  m.slab([-0.8, 1.0, 0.1], [0.04, 0.42, 0.04], STEEL)
  m.slab([-0.44, 1.5, 0.092], [0.4, 0.12, 0.004], '#5A8BD6')
})
const shakerGeo = made(m => {
  m.slab([0, 0, 0], [0.66, 0.03, 0.6], STEEL)
  for (const [x, z] of [[-0.16, -0.14], [0.16, -0.14], [-0.16, 0.15], [0.16, 0.15]]) {
    m.lathe([[0.001, 0], [0.09, 0], [0.095, 0.02], [0.04, 0.13], [0.025, 0.16], [0.025, 0.2], [0.001, 0.2]], [x, 0.015, z], '#DCE8EC', 14)
    m.lathe([[0.001, 0.005], [0.088, 0.005], [0.09, 0.02], [0.06, 0.06], [0.001, 0.06]], [x, 0.015, z], '#E2B157', 14)
  }
})

const jun = new Vector3()

function Moving() {
  const door = useRef<Group>(null)
  const shaker = useRef<Group>(null)
  const still = useMemo(reducedMotion, [])
  const open = useRef(0)
  useFrame((st, dt) => {
    const p = personAt('park', jun)
    const want = fx.doing.get('park') === 'freezer' && Math.hypot(p.x - 0.9, p.z + 1.85) < 0.4 ? 1 : 0
    open.current += (want - open.current) * (still ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 3))
    if (door.current) door.current.rotation.y = 1.55 * open.current
    if (shaker.current && !still) {
      const t = st.clock.elapsedTime * 9
      shaker.current.position.set(-2.7 + Math.cos(t) * 0.012, 0.815, -2.68 + Math.sin(t) * 0.012)
    }
  })
  return (
    <>
      <group ref={door} position={[1.35, 0.06, -2.25]}>
        <mesh geometry={doorGeo} material={M.clay} castShadow receiveShadow />
      </group>
      <group ref={shaker} position={[-2.7, 0.815, -2.68]}>
        <mesh geometry={shakerGeo} material={M.clay} castShadow />
      </group>
    </>
  )
}

export function LabPlinth() {
  return (
    <group>
      <ZonePick>
        <mesh geometry={built.clay} material={M.clay} castShadow receiveShadow />
        <mesh geometry={built.sheen} material={M.sheen} castShadow receiveShadow />
      </ZonePick>
      <mesh geometry={built.glow} material={M.glow} />
      <mesh geometry={built.glass} material={glassMat} renderOrder={2} />
      <mesh geometry={paneGeo} material={DUSK} />
      <mesh geometry={spillGeo} material={M.spill} renderOrder={2} />
      <mesh geometry={moonGeo} material={M.spill} renderOrder={2} />
      <Moving />
      <Researchers />
    </group>
  )
}

/** The lab's practical lights: warm lamps and screens, a cool fume hood, the hallway. */
export function LabLights() {
  const L: [V3, string, number, number][] = [
    [[-8.65, 1.25, -1.7], '#FFC98C', 3.2, 4.5],
    [[-5.6, 1.8, -2.55], '#E4ECFF', 2.0, 3.2],
    [[-4.0, 1.7, -2.5], '#FFE2B8', 3.0, 3.6],
    [[-4.6, 1.2, -0.05], '#FFC27A', 3.2, 4.2],
    [[-1.7, 1.2, -0.05], '#FFC27A', 3.2, 4.2],
    [[-8.3, 1.3, 2.7], '#8FB0FF', 2.0, 3.6],
    [[-4.05, 1.3, 2.3], '#FFC98C', 3.2, 4.4],
    [[-0.65, 1.3, 2.3], '#FFC98C', 2.6, 4.0],
    [[-0.35, 2.0, -2.85], '#FFD3A0', 4.0, 5.0],
    [[1.3, 2.1, -1.0], '#CFE0FF', 1.4, 4.0],
  ]
  return (
    <>
      {L.map(([p, c, i, d], k) => (
        <pointLight key={k} position={p} color={c} intensity={i} distance={d} decay={1.6} />
      ))}
    </>
  )
}
