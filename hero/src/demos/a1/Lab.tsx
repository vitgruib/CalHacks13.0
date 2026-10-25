// The lab plinth: an open-plan wet lab. Two island benches with reagent
// shelving, a back wall of fume hood, biosafety cabinet, sink and gel imager,
// the PI's glass office in the far corner, a supply alcove with the −80 °C
// freezer, write-up desks and the confocal bay by the door. All of the static
// furniture merges into three meshes; only a freezer door, a centrifuge lid
// and a shaker platform move.

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { MeshBasicMaterial, type Group } from 'three'
import { kit, type Kit } from './kit'
import { LAB_BOX, LAB_X, PAL, type V3 } from './layout'
import { CLAY, M, SHEEN } from './mats'
import { Researchers } from './People'
import { fx, reducedMotion } from './store'
import { Zone } from './zones'

const PI = Math.PI
const FLOOR = '#E3DDD2'
const SEAM = '#D6CEC2'
const WALL = '#EDE8E0'
const BASE = '#C6BCAE'
const CAB = '#ECE8E1'
const CAB_LINE = '#CFC9C0'
const TOP = '#363B42'
const STEEL = '#B9C0C7'
const STEEL_D = '#8C959E'
const WHITE = '#F4F3EF'
const DARK = '#2C3138'
const WOOD = '#C9AA82'
const WOOD_D = '#A88A66'
const FRAME = '#8F979F'
const SCREEN = '#BFD6E8'

const LIT = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })

// ── Furniture helpers ────────────────────────────────────────────────────

/** Base cabinets with door seams on the face that points `face` (+1 = +z, −1 = −z), and a resin top. */
function cabinets(k: Kit, x0: number, x1: number, z0: number, z1: number, faces: number[], top = TOP, h = 0.88) {
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const w = x1 - x0
  const d = z1 - z0
  k.box([cx, 0.05, cz], [w - 0.08, 0.1, d - 0.08], DARK, 0.01)
  k.box([cx, 0.1 + (h - 0.14) / 2, cz], [w, h - 0.14, d], CAB, 0.02)
  k.box([cx, h - 0.02, cz], [w + 0.04, 0.04, d + 0.04], top, 0.012)
  const n = Math.max(1, Math.round(w / 0.6))
  for (const f of faces) {
    const z = f > 0 ? z1 + 0.002 : z0 - 0.002
    for (let i = 1; i < n; i++) k.box([x0 + (w * i) / n, 0.1 + (h - 0.14) / 2, z], [0.012, h - 0.2, 0.006], CAB_LINE, 0.002)
    for (let i = 0; i < n; i++) k.box([x0 + (w * (i + 0.5)) / n, h - 0.22, z + f * 0.012], [0.14, 0.02, 0.02], STEEL_D, 0.006)
  }
}

/** A counter along the back wall (face toward +z). */
function counter(k: Kit, x0: number, x1: number, d = 0.7, h = 0.9) {
  cabinets(k, x0, x1, -3.62, -3.62 + d, [1], TOP, h)
}

function bottle(k: Kit, x: number, y: number, z: number, h: number, color: string, cap = '#1E2227', r = 0.045) {
  k.cyl([x, y + h * 0.4, z], r, h * 0.8, color, 12)
  k.cyl([x, y + h * 0.86, z], r * 0.55, h * 0.12, color, 10)
  k.cyl([x, y + h * 0.96, z], r * 0.6, h * 0.08, cap, 10)
}

function shelfSpine(k: Kit, x0: number, x1: number, z: number, seed: number) {
  for (const x of [x0 + 0.08, (x0 + x1) / 2, x1 - 0.08]) k.box([x, 1.33, z], [0.04, 0.86, 0.04], STEEL, 0.01)
  for (const y of [1.3, 1.72]) {
    k.box([(x0 + x1) / 2, y, z], [x1 - x0, 0.03, 0.32], '#DCE0E4', 0.01)
    // Reagent bottles and boxes, the same every load.
    let x = x0 + 0.16
    let i = seed
    while (x < x1 - 0.16) {
      const kind = (i * 7 + Math.floor(y * 10)) % 6
      const zz = z + (((i * 5) % 3) - 1) * 0.07
      if (kind === 0) bottle(k, x, y + 0.015, zz, 0.2, '#B8742A')
      else if (kind === 1) bottle(k, x, y + 0.015, zz, 0.24, '#E8EEF2', '#2E5BA6', 0.05)
      else if (kind === 2) k.box([x, y + 0.1, zz], [0.16, 0.17, 0.12], '#F4F1EA', 0.01)
      else if (kind === 3) bottle(k, x, y + 0.015, zz, 0.16, '#E8EEF2', '#C0453A', 0.035)
      else if (kind === 4) k.box([x, y + 0.07, zz], [0.2, 0.11, 0.14], '#4A7FC1', 0.01)
      x += kind === 4 || kind === 2 ? 0.26 : 0.15
      i++
    }
  }
}

function monitor(k: Kit, lit: Kit, x: number, y: number, z: number, yaw: number, w = 0.52) {
  const dx = Math.sin(yaw)
  const dz = Math.cos(yaw)
  k.box([x, y + 0.008, z], [0.18, 0.016, 0.14], DARK, 0.006, { rot: [0, yaw, 0] })
  k.box([x, y + 0.12, z], [0.035, 0.22, 0.03], DARK, 0.008, { rot: [0, yaw, 0] })
  k.box([x + dx * 0.03, y + 0.36, z + dz * 0.03], [w, w * 0.6, 0.03], DARK, 0.01, { rot: [0, yaw, 0] })
  lit.box([x + dx * 0.047, y + 0.36, z + dz * 0.047], [w - 0.04, w * 0.6 - 0.04, 0.004], SCREEN, 0.002, { rot: [0, yaw, 0] })
}

function officeChair(k: Kit, x: number, z: number, yaw: number, color = '#3E4C5E') {
  const bx = -Math.sin(yaw) * 0.24
  const bz = -Math.cos(yaw) * 0.24
  k.box([x, 0.47, z], [0.46, 0.07, 0.44], color, 0.03, { rot: [0, yaw, 0] })
  k.box([x + bx, 0.78, z + bz], [0.42, 0.5, 0.06], color, 0.03, { rot: [-0.08, yaw, 0] })
  k.cyl([x, 0.25, z], 0.03, 0.4, STEEL_D, 10)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2 + yaw
    k.box([x + Math.cos(a) * 0.14, 0.05, z + Math.sin(a) * 0.14], [0.28, 0.03, 0.045], DARK, 0.01, { rot: [0, -a, 0] })
  }
}

function desk(k: Kit, cx: number, cz: number, w: number, d: number, alongZ = false) {
  const sx = alongZ ? d : w
  const sz = alongZ ? w : d
  k.box([cx, 0.74, cz], [sx, 0.04, sz], WOOD, 0.012)
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.box([cx + ox * (sx / 2 - 0.05), 0.36, cz + oz * (sz / 2 - 0.05)], [0.04, 0.72, 0.04], WOOD_D, 0.01)
}

// ── The static lab ───────────────────────────────────────────────────────

function build() {
  const k = kit()
  const lit = kit()
  const glass = kit()
  const W = LAB_BOX.x1 - LAB_BOX.x0
  const D = LAB_BOX.z1 - LAB_BOX.z0

  // Plinth and floor, with faint tile seams.
  k.box([LAB_X, -0.56, 0], [W, 1.1, D], PAL.labBody, 0.08)
  k.box([LAB_X, -0.008, 0], [W - 0.1, 0.03, D - 0.1], FLOOR, 0.01)
  for (let x = LAB_BOX.x0 + 0.9; x < LAB_BOX.x1 - 0.2; x += 0.9) k.box([x, 0.008, 0], [0.012, 0.004, D - 0.14], SEAM, 0.001)
  for (let z = LAB_BOX.z0 + 0.9; z < LAB_BOX.z1 - 0.2; z += 0.9) k.box([LAB_X, 0.008, z], [W - 0.14, 0.004, 0.012], SEAM, 0.001)

  // Walls: the back wall, and the right wall with the lab door.
  k.box([LAB_X, 1.15, -3.69], [W, 2.3, 0.12], WALL, 0.03)
  k.box([LAB_X, 0.06, -3.62], [W - 0.1, 0.12, 0.02], BASE, 0.004)
  k.box([-1.47, 1.05, -2.5], [0.1, 2.1, 2.4], WALL, 0.03)
  k.box([-1.47, 1.05, 1.7], [0.1, 2.1, 4.2], WALL, 0.03)
  k.box([-1.47, 1.95, -0.85], [0.1, 0.3, 0.9], WALL, 0.02)
  k.box([-1.52, 0.95, -1.32], [0.06, 1.9, 0.06], FRAME, 0.01)
  k.box([-1.52, 0.95, -0.38], [0.06, 1.9, 0.06], FRAME, 0.01)
  k.box([-1.52, 1.82, -0.85], [0.06, 0.06, 1.0], FRAME, 0.01)
  k.box([-1.53, 0.06, 0.8], [0.02, 0.12, 2.3], BASE, 0.004)
  // Deliveries left at the door.
  k.box([-1.75, 0.18, -1.12], [0.42, 0.36, 0.34], '#C9A47A', 0.02)
  k.box([-1.75, 0.362, -1.12], [0.42, 0.006, 0.08], '#E7D8BC', 0.002)
  k.box([-1.78, 0.13, -0.62], [0.34, 0.26, 0.3], '#BE9767', 0.02)

  // ── PI office: wood floor, glass on two sides, a desk, a whiteboard ──
  const OX0 = -12.1
  const OX1 = -9.5
  const OZ1 = -0.9
  k.box([(OX0 + OX1) / 2, 0.012, (-3.62 + OZ1) / 2], [OX1 - OX0, 0.012, OZ1 + 3.62], '#D8C3A3', 0.004)
  const sill = (x: number, z: number, sx: number, sz: number) => {
    k.box([x, 0.05, z], [sx, 0.1, sz], FRAME, 0.01)
    k.box([x, 2.0, z], [sx, 0.06, sz], FRAME, 0.01)
  }
  sill((OX0 + OX1) / 2, OZ1, OX1 - OX0, 0.07)
  for (let x = OX0 + 0.03; x <= OX1 + 0.01; x += (OX1 - OX0 - 0.06) / 3) k.box([x, 1.02, OZ1], [0.05, 1.96, 0.07], FRAME, 0.01)
  glass.box([(OX0 + OX1) / 2, 1.05, OZ1], [OX1 - OX0 - 0.04, 1.86, 0.02], '#FFFFFF', 0.004)
  // Right glass wall, with the door gap between z −2.15 and −1.4.
  sill(OX1, -2.9, 0.07, 1.44)
  sill(OX1, -1.15, 0.07, 0.5)
  for (const z of [-3.6, -2.9, -2.18, -1.38, -0.92]) k.box([OX1, 1.02, z], [0.07, 1.96, 0.05], FRAME, 0.01)
  k.box([OX1, 2.0, -1.77], [0.07, 0.06, 0.8], FRAME, 0.01)
  glass.box([OX1, 1.05, -2.9], [0.02, 1.86, 1.4], '#FFFFFF', 0.004)
  glass.box([OX1, 1.05, -1.15], [0.02, 1.86, 0.44], '#FFFFFF', 0.004)
  // Desk, monitor, keyboard, a mug and papers; the chair waits behind.
  desk(k, -11.2, -2.88, 1.15, 0.56)
  k.box([-11.62, 0.36, -2.88], [0.36, 0.7, 0.5], WOOD_D, 0.02)
  monitor(k, lit, -11.2, 0.76, -3.04, 0)
  k.box([-11.2, 0.77, -2.74], [0.42, 0.018, 0.13], '#D9DCDF', 0.006)
  k.lathe([-10.78, 0.76, -2.8], [[0, 0], [0.04, 0], [0.042, 0.1], [0, 0.1]], '#2E5BA6', {}, 14)
  k.box([-10.86, 0.765, -3.0], [0.22, 0.01, 0.28], '#F6F3EC', 0.003, { rot: [0, 0.2, 0] })
  officeChair(k, -11.2, -2.12, PI, '#5A4A3E')
  // Whiteboard on the back wall: a diagram of the aims, in marker.
  k.box([-10.15, 1.33, -3.62], [1.16, 0.84, 0.03], FRAME, 0.01)
  k.box([-10.15, 1.33, -3.6], [1.1, 0.78, 0.01], '#FBFBF8', 0.003)
  k.box([-10.15, 0.92, -3.57], [1.0, 0.03, 0.07], FRAME, 0.006)
  const ink = (x: number, y: number, w: number, h: number, c: string, r = 0) => k.box([x, y, -3.592], [w, h, 0.004], c, 0.001, { rot: [0, 0, r] })
  ink(-10.5, 1.55, 0.26, 0.014, '#2E5BA6')
  ink(-10.5, 1.4, 0.26, 0.014, '#2E5BA6')
  ink(-10.63, 1.475, 0.014, 0.16, '#2E5BA6')
  ink(-10.37, 1.475, 0.014, 0.16, '#2E5BA6')
  ink(-10.15, 1.48, 0.22, 0.012, '#2A2D33', 0.3)
  ink(-9.85, 1.6, 0.2, 0.014, '#B5452F')
  ink(-9.85, 1.36, 0.2, 0.014, '#B5452F')
  ink(-9.95, 1.48, 0.014, 0.24, '#B5452F')
  ink(-9.75, 1.48, 0.014, 0.24, '#B5452F')
  ink(-10.2, 1.17, 0.5, 0.012, '#2A2D33')
  ink(-10.3, 1.1, 0.3, 0.012, '#2A2D33')
  k.cyl([-10.4, 0.95, -3.55], 0.012, 0.11, '#2E5BA6', 8, { rot: [0, 0, PI / 2] })
  k.cyl([-10.2, 0.95, -3.55], 0.012, 0.11, '#B5452F', 8, { rot: [0, 0, PI / 2] })
  // A low bookcase (kept under eye level so Lena stays in view) and a plant.
  k.box([-11.9, 0.25, -1.4], [0.32, 0.5, 0.8], WOOD_D, 0.02)
  for (let i = 0; i < 6; i++) {
    const h = 0.24 - (i % 3) * 0.03
    k.box([-11.9, 0.5 + h / 2, -1.7 + i * 0.11], [0.22, h, 0.08], ['#3E6FB0', '#C98B2E', '#6E8F7C', '#9C2E2A', '#E8E2D8', '#4C6274'][i], 0.006)
  }
  k.lathe([-9.8, 0, -1.15], [[0, 0], [0.16, 0], [0.19, 0.32], [0, 0.32]], '#B66A45', {}, 18)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2
    k.sphere([-9.8 + Math.cos(a) * 0.12, 0.55 + (i % 3) * 0.1, -1.15 + Math.sin(a) * 0.12], 0.13, i % 2 ? '#5E8C5A' : '#6F9E66', {}, 10, 8)
  }

  // ── Back wall: fume hood, biosafety cabinet, sink and eyewash, gel imager ──
  // Fume hood.
  counter(k, -9.0, -7.5, 0.75)
  k.box([-8.98, 1.6, -3.25], [0.06, 1.38, 0.75], '#E6E2DA', 0.02)
  k.box([-7.52, 1.6, -3.25], [0.06, 1.38, 0.75], '#E6E2DA', 0.02)
  k.box([-8.25, 2.22, -3.25], [1.5, 0.12, 0.75], '#E6E2DA', 0.02)
  k.box([-8.25, 1.9, -2.9], [1.46, 0.5, 0.05], '#E6E2DA', 0.02)
  k.box([-8.25, 1.4, -3.58], [1.4, 1.0, 0.02], '#C9CDD1', 0.004)
  glass.box([-8.25, 1.3, -2.9], [1.4, 0.64, 0.02], '#FFFFFF', 0.004)
  k.box([-8.25, 0.98, -2.9], [1.4, 0.04, 0.06], STEEL, 0.01)
  lit.box([-8.25, 2.05, -3.0], [1.2, 0.03, 0.2], '#FFF6E4', 0.004)
  bottle(k, -8.6, 0.9, -3.3, 0.28, '#E8EEF2', '#2E5BA6', 0.06)
  bottle(k, -8.35, 0.9, -3.35, 0.22, '#B8742A')
  k.lathe([-7.95, 0.9, -3.2], [[0, 0], [0.08, 0], [0.08, 0.16], [0.09, 0.17], [0, 0.17]], '#DCE8EE', {}, 14)
  // Biosafety cabinet: on a steel stand, lit inside, sloped sash, blue stripe.
  for (const [x, z] of [[-7.15, -3.55], [-5.95, -3.55], [-7.15, -2.95], [-5.95, -2.95]] as const) k.box([x, 0.35, z], [0.05, 0.7, 0.05], STEEL, 0.01)
  k.box([-6.55, 0.72, -3.25], [1.3, 0.06, 0.78], STEEL_D, 0.012)
  k.box([-6.55, 0.98, -3.25], [1.3, 0.46, 0.78], '#ECEDEE', 0.025)
  k.box([-7.17, 1.55, -3.25], [0.06, 0.7, 0.78], '#ECEDEE', 0.02)
  k.box([-5.93, 1.55, -3.25], [0.06, 0.7, 0.78], '#ECEDEE', 0.02)
  k.box([-6.55, 2.05, -3.25], [1.3, 0.3, 0.78], '#ECEDEE', 0.025)
  k.box([-6.55, 2.05, -2.855], [1.24, 0.06, 0.012], '#2E5BA6', 0.004)
  lit.box([-6.55, 1.48, -3.55], [1.18, 0.62, 0.02], '#EEF4FA', 0.004)
  lit.box([-6.55, 1.215, -3.25], [1.18, 0.02, 0.6], '#E4ECF4', 0.004)
  lit.box([-6.2, 2.05, -2.85], [0.16, 0.06, 0.006], '#8FE0B0', 0.002)
  glass.box([-6.55, 1.62, -2.93], [1.2, 0.46, 0.02], '#FFFFFF', 0.004, { rot: [-0.22, 0, 0] })
  k.box([-6.55, 1.39, -2.88], [1.2, 0.03, 0.04], STEEL, 0.008)
  k.cyl([-6.85, 1.29, -3.2], 0.03, 0.14, '#E2B24F', 10)
  for (let i = 0; i < 3; i++) k.cyl([-6.45 + i * 0.02, 1.24 + i * 0.022, -3.15], 0.09, 0.02, '#D9A441', 18)
  // Biohazard bin.
  k.cyl([-5.72, 0.26, -3.38], 0.15, 0.52, '#C0453A', 16, {}, 0.17)
  k.cyl([-5.72, 0.53, -3.38], 0.18, 0.04, '#A33A30', 16)
  // Sink with an eyewash station and its sign.
  counter(k, -5.5, -4.6, 0.7)
  k.box([-5.05, 0.885, -3.27], [0.5, 0.012, 0.38], STEEL_D, 0.004)
  k.box([-5.05, 0.84, -3.27], [0.44, 0.1, 0.32], '#A8B0B7', 0.01)
  k.cyl([-5.05, 1.06, -3.52], 0.018, 0.34, STEEL, 10)
  k.torus([-5.05, 1.23, -3.42], 0.1, 0.018, STEEL, { rot: [0, PI / 2, 0] }, PI, 12)
  k.cyl([-4.76, 1.0, -3.5], 0.02, 0.2, '#3E9B5A', 10)
  k.lathe([-4.76, 1.1, -3.5], [[0, 0], [0.04, 0], [0.09, 0.05], [0, 0.04]], '#3E9B5A', {}, 14)
  k.box([-4.78, 1.62, -3.62], [0.24, 0.24, 0.012], '#2E8B57', 0.006)
  k.box([-4.78, 1.62, -3.612], [0.14, 0.035, 0.004], '#FFFFFF', 0.001)
  k.box([-4.78, 1.62, -3.612], [0.035, 0.14, 0.004], '#FFFFFF', 0.001)
  // Gel imager on its counter, with its monitor.
  counter(k, -4.45, -3.45, 0.7)
  k.box([-4.12, 1.15, -3.3], [0.44, 0.5, 0.44], '#3A4048', 0.03)
  k.box([-4.12, 1.0, -3.075], [0.36, 0.1, 0.012], '#2A3038', 0.004)
  lit.box([-4.0, 1.34, -3.076], [0.1, 0.04, 0.004], '#E58C6B', 0.002)
  monitor(k, lit, -3.7, 0.9, -3.3, 0, 0.42)
  // Open shelf over the sink and imager.
  k.box([-4.5, 1.86, -3.48], [1.9, 0.03, 0.26], '#DCE0E4', 0.01)
  for (let i = 0; i < 7; i++) bottle(k, -5.35 + i * 0.26, 1.875, -3.48, 0.18 + (i % 3) * 0.04, i % 2 ? '#B8742A' : '#E8EEF2', i % 3 ? '#1E2227' : '#2E5BA6')

  // ── Supply alcove: the −80 °C freezer and wire shelving ──
  k.box([-3.35, 1.05, -3.1], [0.1, 2.1, 1.1], WALL, 0.02)
  k.box([-2.85, 0.98, -3.25], [0.78, 1.96, 0.72], WHITE, 0.04)
  k.box([-2.85, 0.08, -2.88], [0.66, 0.12, 0.02], '#9AA3AD', 0.004)
  for (const [x, z] of [[-2.15, -3.6], [-1.6, -3.6], [-2.15, -3.18], [-1.6, -3.18]] as const) k.box([x, 0.95, z], [0.03, 1.9, 0.03], STEEL, 0.006)
  const SUP: [string, number, number][] = [
    ['#4A7FC1', 0.28, 0.16], ['#4A7FC1', 0.28, 0.16], ['#C9A47A', 0.3, 0.26], ['#F4F1EA', 0.22, 0.2],
    ['#3F70B8', 0.26, 0.1], ['#3F70B8', 0.26, 0.1], ['#C9A47A', 0.24, 0.3], ['#F4F1EA', 0.3, 0.16],
  ]
  for (let s = 0; s < 4; s++) {
    const y = 0.12 + s * 0.5
    k.box([-1.875, y, -3.39], [0.6, 0.025, 0.46], STEEL, 0.006)
    let x = -2.11
    for (let i = 0; i < 2; i++) {
      const [c, w, h] = SUP[(s * 2 + i) % SUP.length]
      k.box([x + w / 2, y + 0.012 + h / 2, -3.39], [w, h, 0.3], c, 0.01)
      x += w + 0.03
    }
  }

  // ── Bench A: protein purification (front) and prep (back) ──
  cabinets(k, -8.4, -4.4, -1.25, -0.05, [1, -1])
  shelfSpine(k, -8.4, -4.4, -0.65, 1)
  // FPLC: the instrument, its column and a fraction collector.
  k.box([-7.3, 1.2, -0.4], [0.55, 0.6, 0.42], '#E9ECEE', 0.03)
  k.box([-7.3, 1.24, -0.188], [0.46, 0.44, 0.012], '#D5DADF', 0.006)
  lit.box([-7.42, 1.38, -0.18], [0.16, 0.1, 0.004], '#9FD1F0', 0.002)
  for (let i = 0; i < 3; i++) k.cyl([-7.18 + i * 0.07, 1.16, -0.176], 0.018, 0.012, ['#C0453A', '#3E9B5A', '#2E5BA6'][i], 10, { rot: [PI / 2, 0, 0] })
  k.cyl([-6.98, 1.3, -0.3], 0.035, 0.36, '#D7E6EE', 14)
  k.cyl([-6.98, 1.26, -0.3], 0.03, 0.22, '#3E6FB0', 14)
  k.torus([-7.05, 1.52, -0.3], 0.08, 0.008, '#D98C5F', {}, PI, 12)
  k.cyl([-6.85, 0.95, -0.3], 0.13, 0.1, '#D9DDE1', 22)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2
    k.cyl([-6.85 + Math.cos(a) * 0.09, 1.04, -0.3 + Math.sin(a) * 0.09], 0.012, 0.08, '#EEF3F6', 8)
  }
  // Pipettes on a carousel stand.
  k.cyl([-7.85, 0.91, -0.35], 0.09, 0.02, DARK, 18)
  k.cyl([-7.85, 1.1, -0.35], 0.012, 0.38, STEEL_D, 8)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2
    const x = -7.85 + Math.cos(a) * 0.075
    const z = -0.35 + Math.sin(a) * 0.075
    k.cyl([x, 1.1, z], 0.014, 0.22, '#F2F0EC', 8)
    k.cyl([x, 1.23, z], 0.01, 0.04, ['#2E5BA6', '#C98B2E', '#C0453A', '#3E9B5A'][i], 8)
  }
  // Ice bucket with tubes, and two tube racks.
  k.lathe([-6.5, 0.9, -0.32], [[0, 0], [0.13, 0], [0.16, 0.16], [0.15, 0.16], [0, 0.15]], '#E07A3A', {}, 18)
  for (let i = 0; i < 5; i++) k.cyl([-6.55 + (i % 3) * 0.05, 1.08, -0.36 + Math.floor(i / 3) * 0.07], 0.012, 0.06, ['#E8C84A', '#F2F0EC', '#4A7FC1'][i % 3], 8)
  k.box([-6.15, 0.95, -0.3], [0.3, 0.06, 0.12], '#E3B43C', 0.01)
  for (let i = 0; i < 6; i++) k.cyl([-6.27 + i * 0.048, 1.01, -0.3], 0.012, 0.08, '#F2F0EC', 8)
  k.box([-5.78, 0.95, -0.3], [0.26, 0.06, 0.12], '#4A7FC1', 0.01)
  for (let i = 0; i < 5; i++) k.cyl([-5.88 + i * 0.05, 1.0, -0.3], 0.012, 0.07, '#E58C9C', 8)
  // Tip boxes waiting to be restocked.
  for (let i = 0; i < 3; i++) k.box([-4.85, 0.96 + i * 0.075, -0.32], [0.24, 0.07, 0.16], '#3F70B8', 0.008)
  // Back side: a balance, a vortexer, a stir plate.
  k.box([-7.7, 0.95, -1.0], [0.26, 0.08, 0.3], '#E9ECEE', 0.02)
  k.box([-7.7, 1.0, -1.0], [0.18, 0.012, 0.18], STEEL, 0.004)
  k.box([-6.9, 0.97, -0.98], [0.14, 0.12, 0.16], '#3E6FB0', 0.02)
  k.box([-6.1, 0.94, -1.0], [0.26, 0.05, 0.26], '#E9ECEE', 0.015)
  k.lathe([-6.1, 0.965, -1.0], [[0, 0], [0.06, 0], [0.06, 0.13], [0.065, 0.135], [0, 0.13]], '#DCE8EE', {}, 14)
  k.cyl([-6.1, 1.02, -1.0], 0.058, 0.08, '#E2B24F', 14)
  k.box([-5.0, 0.98, -1.0], [0.34, 0.14, 0.28], '#E9ECEE', 0.02)

  // ── Bench B: microbiology (back) and the centrifuge row (front) ──
  cabinets(k, -8.4, -4.4, 1.35, 2.55, [1, -1])
  shelfSpine(k, -8.4, -4.4, 1.95, 4)
  // Incubator with plates behind its glass door.
  k.box([-6.9, 1.18, 1.65], [0.6, 0.56, 0.5], '#EFEBE3', 0.03)
  k.box([-6.9, 1.18, 1.395], [0.5, 0.44, 0.012], '#D6D1C8', 0.004)
  glass.box([-6.9, 1.18, 1.385], [0.46, 0.4, 0.01], '#FFFFFF', 0.002)
  for (let i = 0; i < 3; i++) k.cyl([-6.9, 1.02 + i * 0.12, 1.65], 0.09, 0.03, '#D9A441', 16)
  lit.box([-6.72, 1.42, 1.388], [0.1, 0.035, 0.004], '#8FE0B0', 0.002)
  // Shaker base (its platform moves).
  k.box([-6.05, 0.96, 1.72], [0.5, 0.12, 0.44], '#D5DADF', 0.02)
  // Plates on a light box, and the microfluidic chip.
  k.box([-5.2, 0.93, 1.7], [0.44, 0.05, 0.34], '#2F343B', 0.012)
  lit.box([-5.2, 0.957, 1.7], [0.38, 0.004, 0.28], '#F3F6EE', 0.002)
  for (let i = 0; i < 2; i++) k.cyl([-5.3 + i * 0.2, 0.975, 1.7], 0.08, 0.025, '#E8C890', 18)
  for (let i = 0; i < 4; i++) k.cyl([-4.75, 0.93 + i * 0.03, 1.62], 0.085, 0.025, i % 2 ? '#D9A441' : '#E4D29A', 18)
  k.box([-5.65, 0.915, 1.58], [0.16, 0.012, 0.08], '#BFD6E2', 0.003)
  // Front side: centrifuge (its lid moves), water bath, gel rig and power supply.
  k.box([-7.65, 1.12, 2.28], [0.6, 0.42, 0.5], WHITE, 0.05)
  lit.box([-7.65, 1.2, 2.534], [0.14, 0.05, 0.004], '#9FD1F0', 0.002)
  k.box([-6.4, 1.0, 2.28], [0.5, 0.2, 0.36], STEEL, 0.02)
  k.box([-6.4, 1.1, 2.28], [0.44, 0.012, 0.3], '#6FA8D6', 0.004)
  for (let i = 0; i < 3; i++) k.cyl([-6.5 + i * 0.1, 1.13, 2.28], 0.02, 0.08, '#F2F0EC', 8)
  glass.box([-5.35, 0.98, 2.28], [0.34, 0.14, 0.18], '#FFFFFF', 0.008)
  k.box([-5.35, 0.94, 2.28], [0.32, 0.06, 0.16], '#7FB0D8', 0.006)
  k.box([-5.35, 1.06, 2.28], [0.36, 0.02, 0.2], '#E4EEF6', 0.006)
  k.box([-4.85, 1.0, 2.25], [0.26, 0.18, 0.24], '#3A4048', 0.02)
  lit.box([-4.85, 1.04, 2.372], [0.12, 0.04, 0.004], '#E58C6B', 0.002)
  k.torus([-5.1, 1.08, 2.32], 0.12, 0.008, '#C0453A', {}, PI, 10)
  k.torus([-5.1, 1.08, 2.26], 0.12, 0.008, '#1E2227', {}, PI, 10)
  // Waste bins at the island ends.
  k.cyl([-8.62, 0.24, -0.65], 0.15, 0.48, '#8C959E', 16, {}, 0.16)
  k.cyl([-8.62, 0.24, 1.95], 0.15, 0.48, '#C0453A', 16, {}, 0.16)
  k.cyl([-8.62, 0.49, 1.95], 0.17, 0.03, '#A33A30', 16)

  // ── Write-up desks along the open side ──
  for (const z of [0.85, 2.4]) {
    desk(k, -11.62, z, 1.25, 0.66, true)
    monitor(k, lit, -11.78, 0.76, z, PI / 2, 0.46)
    k.box([-11.45, 0.77, z], [0.13, 0.018, 0.4], '#D9DCDF', 0.006)
    officeChair(k, -10.82, z, -PI / 2)
  }
  k.box([-11.6, 0.79, 1.3], [0.24, 0.04, 0.3], '#4C6274', 0.006)
  k.lathe([-11.75, 0.76, 2.85], [[0, 0], [0.07, 0], [0.08, 0.12], [0, 0.12]], '#B66A45', {}, 14)
  k.sphere([-11.75, 0.95, 2.85], 0.1, '#6F9E66', {}, 10, 8)

  // ── Confocal bay: dark mat, isolation table, the scope, its PC desk ──
  k.box([-2.56, 0.012, 1.68], [1.9, 0.012, 3.8], '#858C95', 0.004)
  for (let i = 0; i < 5; i++) k.capsule([-3.6, 1.0, 2.55 + i * 0.24], 0.07, 1.86, '#4A505A', {}, 10)
  k.box([-3.6, 2.02, 3.05], [0.05, 0.04, 1.3], FRAME, 0.006)
  k.box([-2.55, 0.8, 1.8], [1.3, 0.1, 1.0], '#2F343B', 0.02)
  for (const [x, z] of [[-3.08, 1.42], [-2.02, 1.42], [-3.08, 2.18], [-2.02, 2.18]] as const) k.cyl([x, 0.38, z], 0.07, 0.74, '#9AA3AD', 14)
  // The inverted microscope: body, stage, condenser pillar and lamp arm, eyepieces toward Mateo.
  k.box([-2.65, 1.0, 1.8], [0.5, 0.3, 0.4], '#E6E8EA', 0.04)
  k.box([-2.62, 1.17, 1.8], [0.34, 0.03, 0.36], '#3A4048', 0.01)
  k.cyl([-2.62, 1.11, 1.8], 0.06, 0.06, '#8E979F', 14)
  k.box([-2.4, 1.45, 1.8], [0.08, 0.6, 0.12], '#E6E8EA', 0.02)
  k.box([-2.55, 1.74, 1.8], [0.32, 0.08, 0.12], '#E6E8EA', 0.02)
  k.cyl([-2.65, 1.62, 1.8], 0.05, 0.16, '#3A4048', 14)
  k.box([-2.98, 1.24, 1.8], [0.2, 0.12, 0.2], '#E6E8EA', 0.03, { rot: [0, 0, 0.5] })
  k.cyl([-3.1, 1.33, 1.75], 0.025, 0.14, DARK, 10, { rot: [0, 0, 0.9] })
  k.cyl([-3.1, 1.33, 1.85], 0.025, 0.14, DARK, 10, { rot: [0, 0, 0.9] })
  k.box([-2.1, 1.0, 2.05], [0.4, 0.3, 0.36], '#30353C', 0.03)
  k.box([-2.2, 0.98, 1.45], [0.34, 0.26, 0.24], '#3A4048', 0.03)
  lit.box([-2.1, 1.08, 2.232], [0.06, 0.02, 0.004], '#8FE0B0', 0.002)
  k.torus([-2.3, 0.93, 1.8], 0.15, 0.012, DARK, { rot: [PI / 2, 0, 0] }, PI, 10)
  // Bay PC desk with two monitors toward the room.
  desk(k, -2.55, 0.05, 1.5, 0.6)
  monitor(k, lit, -2.82, 0.76, -0.1, 0, 0.5)
  monitor(k, lit, -2.28, 0.76, -0.1, 0, 0.5)
  k.box([-2.55, 0.77, 0.18], [0.42, 0.018, 0.13], '#D9DCDF', 0.006)
  officeChair(k, -2.55, 0.8, PI)

  return { clay: k.build(), lit: lit.build(), glass: glass.build() }
}

// ── The moving equipment ─────────────────────────────────────────────────

const PARTS = (() => {
  const k = kit()
  // Freezer door, hinged on its left edge (the group sits at the hinge).
  k.box([0.38, 0, 0.04], [0.76, 1.86, 0.08], '#F7F6F2', 0.03)
  k.box([0.68, 0.15, 0.1], [0.04, 0.5, 0.05], STEEL_D, 0.012)
  k.box([0.38, 0.72, 0.085], [0.3, 0.12, 0.01], '#2A3038', 0.004)
  const door = k.build()
  const l = kit()
  l.box([0.38, 0.72, 0.092], [0.2, 0.06, 0.004], '#7FE3B8', 0.002)
  const doorLit = l.build()
  // Centrifuge lid, hinged at its back edge.
  k.box([0, 0.03, 0.24], [0.56, 0.06, 0.48], '#C8CED4', 0.025)
  k.box([0, 0.065, 0.42], [0.18, 0.02, 0.04], STEEL_D, 0.006)
  const lid = k.build()
  // Shaker platform with three flasks.
  k.box([0, 0.02, 0], [0.46, 0.04, 0.4], '#A9B1B9', 0.012)
  for (let i = 0; i < 3; i++) {
    const x = -0.14 + i * 0.14
    k.lathe([x, 0.04, (i % 2) * 0.08 - 0.04], [[0, 0], [0.07, 0], [0.07, 0.02], [0.025, 0.13], [0.022, 0.2], [0, 0.2]], '#DCE8EE', {}, 14)
    k.lathe([x, 0.045, (i % 2) * 0.08 - 0.04], [[0, 0], [0.065, 0], [0.05, 0.05], [0, 0.05]], '#E2B24F', {}, 14)
  }
  const shaker = k.build()
  return { door, doorLit, lid, shaker }
})()

function Equipment() {
  const door = useRef<Group>(null)
  const lid = useRef<Group>(null)
  const shaker = useRef<Group>(null)
  const still = useMemo(reducedMotion, [])
  const st = useMemo(() => ({ door: 0, lid: 0, t: 0 }), [])
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1)
    st.t += d
    const jun = fx.figs.get('park')
    const sam = fx.figs.get('okafor')
    const wantDoor = jun && jun.arrived && jun.spot === 'freezer' && jun.action === 'freezer' ? 1 : 0
    const wantLid = sam && sam.arrived && sam.spot === 'centrifuge' ? 1 : 0
    const k = still ? 1 : Math.min(1, d * 3)
    st.door += (wantDoor - st.door) * k
    st.lid += (wantLid - st.lid) * k
    if (door.current) door.current.rotation.y = -st.door * 1.6
    if (lid.current) lid.current.rotation.x = -st.lid * 1.25
    if (shaker.current) shaker.current.position.x = -6.05 + (still ? 0 : 0.012 * Math.sin(st.t * 14))
  })
  return (
    <>
      <group ref={door} position={[-3.24, 0.98, -2.89] as V3}>
        <mesh geometry={PARTS.door} material={CLAY} castShadow receiveShadow />
        <mesh geometry={PARTS.doorLit} material={LIT} />
      </group>
      <group ref={lid} position={[-7.65, 1.33, 2.04] as V3}>
        <mesh geometry={PARTS.lid} material={CLAY} castShadow receiveShadow />
      </group>
      <group ref={shaker} position={[-6.05, 1.02, 1.72] as V3}>
        <mesh geometry={PARTS.shaker} material={SHEEN} castShadow receiveShadow />
      </group>
    </>
  )
}

export function LabPlinth() {
  const g = useMemo(build, [])
  return (
    <group>
      <mesh geometry={g.clay} material={CLAY} castShadow receiveShadow />
      <mesh geometry={g.lit} material={LIT} />
      <mesh geometry={g.glass} material={M.window} renderOrder={2} />
      <Equipment />
      <Researchers />
      <Zone id="lab" geo={g.clay} />
    </group>
  )
}
