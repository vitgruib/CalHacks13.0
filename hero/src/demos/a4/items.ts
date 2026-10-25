// What travels. Every kind of thing a lab member can ask for is modelled so
// it reads at parcel size: a glove box with a cuff out, agar plates, a tip
// rack, an amber bottle, a kit with its plate showing, and so on. Each
// model is normalised to a unit cube standing on its base, so the same
// scale means the same size on screen whatever the item. Papers, invoices,
// readings, charges, holds and decisions keep simpler forms.

import { BufferGeometry } from 'three'
import type { ItemKind } from '../../feed'
import { Kit } from './geo'


const WHITE = '#F4F3EF'
const KRAFT = '#C49A6C'

function normalise(g: BufferGeometry, size = 1) {
  g.computeBoundingBox()
  const b = g.boundingBox!
  const s = size / Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z)
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  g.scale(s, s, s)
  g.computeBoundingSphere()
  return g
}

function gloves() {
  const k = new Kit()
  k.box([0, 0.11, 0], [0.36, 0.22, 0.2], '#4F7FC8', 0.02)
  k.box([0, 0.222, 0], [0.18, 0.006, 0.08], '#284E8C', 0.02)
  k.box([0, 0.11, 0.101], [0.3, 0.07, 0.004], '#F4F3EF', 0)
  k.box([-0.08, 0.11, 0.104], [0.08, 0.04, 0.003], '#2E5BA6', 0)
  // A cuff and two fingers spilling out of the slot.
  k.capsule([0.02, 0.27, 0.0], 0.045, 0.06, '#8DB3EA', { rot: [0, 0, 1.1] })
  k.capsule([-0.03, 0.31, 0.01], 0.018, 0.06, '#8DB3EA', { rot: [0.2, 0, 0.5] })
  k.capsule([0.0, 0.32, -0.015], 0.018, 0.05, '#8DB3EA', { rot: [-0.2, 0, 0.2] })
  return k.build()
}

function plates() {
  const k = new Kit()
  for (let i = 0; i < 4; i++) {
    const y = 0.022 + i * 0.044
    k.cyl([0, y, 0], 0.17, 0.04, '#E6EDF0', { seg: 28 })
    k.cyl([0, y + 0.004, 0], 0.158, 0.03, i === 3 ? '#E3AE4E' : '#D9A441', { seg: 28 })
    k.cyl([0, y + 0.021, 0], 0.172, 0.004, '#C8D6DD', { seg: 28 })
  }
  for (let i = 0; i < 5; i++) k.sphere([-0.07 + i * 0.035, 0.19, 0.03 * Math.sin(i * 2)], 0.012, '#F3E7C6', { seg: 6 })
  return k.build()
}

function tips() {
  const k = new Kit()
  k.box([0, 0.06, 0], [0.34, 0.12, 0.24], '#3D7FD1', 0.015)
  k.box([0, 0.125, 0], [0.32, 0.012, 0.22], '#E7EDF2', 0.004)
  for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) k.cyl([-0.14 + i * 0.04, 0.155, -0.08 + j * 0.04], 0.012, 0.05, '#F1D668', { seg: 6, r2: 0.016 })
  // The hinged lid, tipped open at the back.
  k.box([0, 0.22, -0.14], [0.34, 0.012, 0.2], '#C6D9E8', 0.004, { rot: [1.2, 0, 0] })
  return k.build()
}

function bottle() {
  const k = new Kit()
  k.lathe(
    [
      [0, 0],
      [0.1, 0],
      [0.11, 0.015],
      [0.11, 0.22],
      [0.095, 0.27],
      [0.045, 0.3],
      [0.045, 0.33],
      [0, 0.33],
    ],
    '#8A4B14',
    [0, 0, 0],
    { seg: 24 },
  )
  k.cyl([0, 0.12, 0], 0.113, 0.11, '#F4F1EA', { seg: 24 })
  k.cyl([0, 0.12, 0], 0.114, 0.02, '#2E5BA6', { seg: 24 })
  k.cyl([0, 0.36, 0], 0.052, 0.07, '#1E2125', { seg: 18 })
  return k.build()
}

function kit() {
  const k = new Kit()
  k.box([0, 0.07, 0], [0.36, 0.14, 0.26], WHITE, 0.012)
  k.box([0, 0.07, 0.131], [0.36, 0.04, 0.004], '#2E9C8A', 0)
  k.box([0, 0.131, 0.01], [0.3, 0.012, 0.2], '#E2E6EA', 0.004)
  for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) k.cyl([-0.12 + i * 0.034, 0.139, -0.075 + j * 0.03], 0.011, 0.006, (i + j) % 5 === 0 ? '#E07A5A' : '#B7C4CF', { seg: 8 })
  // Lid ajar, resting at an angle on the back edge.
  k.box([0, 0.23, -0.12], [0.37, 0.012, 0.27], WHITE, 0.006, { rot: [0.95, 0, 0] })
  k.box([0, 0.24, -0.118], [0.37, 0.004, 0.06], '#2E9C8A', 0, { rot: [0.95, 0, 0] })
  return k.build()
}

function dishes() {
  const k = new Kit()
  k.cyl([0, 0.08, 0], 0.08, 0.36, '#D4E2EA', { seg: 20, rot: [0, 0, Math.PI / 2] })
  for (let i = 0; i < 7; i++) k.cyl([-0.15 + i * 0.05, 0.08, 0], 0.076, 0.012, '#9FB4C2', { seg: 20, rot: [0, 0, Math.PI / 2] })
  k.cyl([0.185, 0.08, 0], 0.083, 0.02, '#F4F3EF', { seg: 20, rot: [0, 0, Math.PI / 2] })
  k.box([0, 0.08, 0.081], [0.14, 0.05, 0.004], '#F4F1EA', 0)
  return k.build()
}

function pump() {
  const k = new Kit()
  k.box([0, 0.09, 0], [0.32, 0.18, 0.22], '#E6E8EA', 0.02)
  k.box([0.08, 0.12, 0.111], [0.1, 0.05, 0.004], '#2B3A44', 0)
  k.cyl([-0.07, 0.11, 0.13], 0.075, 0.04, '#A9B0B7', { seg: 22, rot: [Math.PI / 2, 0, 0] })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    k.cyl([-0.07 + Math.cos(a) * 0.05, 0.11 + Math.sin(a) * 0.05, 0.155], 0.014, 0.02, '#6E767E', { seg: 10, rot: [Math.PI / 2, 0, 0] })
  }
  // A loop of amber silicone tubing round the head and off over the top.
  k.torus([-0.07, 0.11, 0.155], 0.084, 0.012, '#E2B26E', { arc: Math.PI * 1.25, rot: [0, 0, -0.2], seg: 22 })
  k.torus([-0.1, 0.21, 0.13], 0.08, 0.012, '#E2B26E', { arc: Math.PI, rot: [0, 0, 1.3], seg: 18 })
  return k.build()
}

function rotor() {
  const k = new Kit()
  k.lathe(
    [
      [0, 0],
      [0.2, 0],
      [0.21, 0.02],
      [0.19, 0.09],
      [0.12, 0.13],
      [0.04, 0.14],
      [0, 0.14],
    ],
    '#A3ABB3',
    [0, 0, 0],
    { seg: 36 },
  )
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    k.cyl([Math.cos(a) * 0.15, 0.106, Math.sin(a) * 0.15], 0.028, 0.03, '#4A5057', { seg: 12, rot: [Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45] })
  }
  k.cyl([0, 0.16, 0], 0.035, 0.05, '#7E868E', { seg: 14 })
  k.torus([0, 0.13, 0], 0.08, 0.006, '#C9CFD4', { rot: [Math.PI / 2, 0, 0], seg: 28 })
  return k.build()
}

function espresso() {
  const k = new Kit()
  k.box([0, 0.17, -0.02], [0.24, 0.34, 0.24], '#C7CDD2', 0.025)
  k.box([0, 0.345, -0.02], [0.22, 0.01, 0.22], '#9EA6AE', 0.004)
  k.box([0, 0.015, 0.05], [0.24, 0.03, 0.14], '#5E666E', 0.008)
  k.cyl([0, 0.22, 0.11], 0.05, 0.05, '#8D959D', { seg: 18 })
  k.capsule([0, 0.2, 0.2], 0.014, 0.1, '#1E2125', { rot: [Math.PI / 2, 0, 0] })
  k.cyl([0, 0.07, 0.1], 0.03, 0.05, WHITE, { seg: 14, r2: 0.035 })
  k.cyl([0.08, 0.28, 0.101], 0.025, 0.01, '#1E2125', { seg: 14, rot: [Math.PI / 2, 0, 0] })
  k.cyl([0.08, 0.28, 0.107], 0.019, 0.004, '#F4F3EF', { seg: 14, rot: [Math.PI / 2, 0, 0] })
  return k.build()
}

function service() {
  const k = new Kit()
  const tilt: [number, number, number] = [-0.3, 0, 0]
  k.box([0, 0.17, 0], [0.26, 0.34, 0.016], '#B08B5E', 0.006, { rot: tilt })
  k.box([0, 0.16, 0.012], [0.22, 0.28, 0.004], '#F7F4EE', 0, { rot: tilt })
  for (let i = 0; i < 6; i++) k.box([-0.02, 0.26 - i * 0.035, 0.016 + i * 0.011], [0.14, 0.008, 0.002], '#AEB7C0', 0, { rot: tilt })
  k.box([0, 0.33, -0.04], [0.09, 0.03, 0.03], '#8E9AA6', 0.008, { rot: tilt })
  // A wrench laid across the sheet.
  k.capsule([0.03, 0.12, 0.07], 0.014, 0.2, '#9EA6AE', { rot: [-0.3, 0, -0.9] })
  k.torus([0.12, 0.19, 0.04], 0.03, 0.012, '#9EA6AE', { arc: Math.PI * 1.5, rot: [-0.3, 0, 0.4], seg: 14 })
  return k.build()
}

function food() {
  const k = new Kit()
  k.box([0, 0.03, 0], [0.38, 0.06, 0.38], '#D2AE80', 0.008)
  k.box([0, 0.061, 0], [0.36, 0.003, 0.36], '#C9A47A', 0)
  k.cyl([0, 0.064, 0], 0.11, 0.004, '#B5402F', { seg: 28 })
  k.cyl([0, 0.066, 0], 0.07, 0.004, '#F4F1EA', { seg: 28 })
  k.cyl([0, 0.068, 0], 0.035, 0.004, '#4F8A4F', { seg: 18 })
  return k.build()
}

function chair() {
  const k = new Kit()
  k.box([0, 0.2, 0], [0.24, 0.04, 0.23], '#3A4250', 0.016)
  k.box([0, 0.36, -0.11], [0.22, 0.24, 0.03], '#3A4250', 0.016, { rot: [-0.12, 0, 0] })
  k.box([0, 0.22, -0.1], [0.04, 0.12, 0.02], '#252A31')
  for (const s of [-1, 1]) {
    k.box([0.13 * s, 0.27, 0], [0.02, 0.012, 0.15], '#252A31', 0.004)
    k.box([0.13 * s, 0.24, -0.02], [0.015, 0.06, 0.015], '#252A31')
  }
  k.cyl([0, 0.12, 0], 0.016, 0.16, '#9EA6AE', { seg: 10 })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    k.box([Math.sin(a) * 0.07, 0.035, Math.cos(a) * 0.07], [0.022, 0.018, 0.15], '#252A31', 0.006, { rot: [0, a, 0] })
    k.sphere([Math.sin(a) * 0.14, 0.017, Math.cos(a) * 0.14], 0.018, '#1E2125', { seg: 8 })
  }
  return k.build()
}

function carton() {
  const k = new Kit()
  k.box([0, 0.13, 0], [0.34, 0.26, 0.28], KRAFT, 0.012)
  k.box([0, 0.261, 0], [0.06, 0.003, 0.28], '#E3D2B0', 0)
  k.box([0, 0.13, 0.141], [0.06, 0.26, 0.003], '#E3D2B0', 0)
  k.box([0.1, 0.18, 0.142], [0.09, 0.06, 0.002], WHITE, 0)
  return k.build()
}

const MAKERS: Record<ItemKind, () => BufferGeometry> = { gloves, plates, tips, bottle, kit, dishes, pump, rotor, espresso, service, food, chair, carton }
export const KINDS = Object.keys(MAKERS) as ItemKind[]

let items: Record<ItemKind, BufferGeometry> | null = null
/** Each item kind, normalised to a unit cube on its base. */
export function itemGeo() {
  if (!items) {
    items = {} as Record<ItemKind, BufferGeometry>
    for (const k of KINDS) items[k] = normalise(MAKERS[k]())
  }
  return items
}

// ── Simpler forms ─────────────────────────────────────────────────────────

export type Token = 'sheet' | 'slip' | 'bead' | 'drop' | 'coin' | 'card'

function sheet() {
  const k = new Kit()
  for (let i = 0; i < 3; i++) k.box([0.004 * i, 0.006 + i * 0.012, -0.004 * i], [0.26, 0.01, 0.34], i === 2 ? '#FBFAF7' : '#ECEAE4', 0.003)
  for (let i = 0; i < 6; i++) k.box([-0.02, 0.043, -0.12 + i * 0.045], [0.18, 0.003, 0.012], '#B7BEC6', 0)
  k.box([-0.11, 0.043, -0.15], [0.04, 0.004, 0.04], '#F4F3EF', 0)
  return k.build()
}

function slip() {
  const k = new Kit()
  k.box([0, 0.006, 0], [0.22, 0.012, 0.3], '#F6EFD9', 0.003)
  for (let i = 0; i < 5; i++) k.box([-0.03, 0.013, -0.09 + i * 0.04], [0.12, 0.002, 0.01], '#B7AE96', 0)
  k.box([0.06, 0.013, 0.11], [0.06, 0.002, 0.02], '#5E6771', 0)
  for (let i = 0; i < 9; i++) k.box([-0.1 + i * 0.025, 0.013, -0.135], [0.012, 0.002, 0.006], '#D8CFB5', 0)
  return k.build()
}

function bead() {
  const k = new Kit()
  k.sphere([0, 0.16, 0], 0.16, WHITE, { seg: 22 })
  k.torus([0, 0.16, 0], 0.17, 0.018, '#E9E3F4', { rot: [Math.PI / 2, 0, 0], seg: 28 })
  return k.build()
}

function drop() {
  const k = new Kit()
  k.lathe(
    [
      [0, 0],
      [0.09, 0.02],
      [0.14, 0.09],
      [0.13, 0.17],
      [0.07, 0.27],
      [0, 0.36],
    ],
    WHITE,
    [0, 0, 0],
    { seg: 24 },
  )
  return k.build()
}

function coin() {
  const k = new Kit()
  k.cyl([0, 0.03, 0], 0.17, 0.06, WHITE, { seg: 30 })
  k.cyl([0, 0.09, 0.02], 0.17, 0.06, WHITE, { seg: 30 })
  k.torus([0, 0.12, 0.02], 0.13, 0.01, '#E6F2F5', { rot: [Math.PI / 2, 0, 0], seg: 28 })
  return k.build()
}

function card() {
  const k = new Kit()
  k.box([0, 0.012, 0], [0.3, 0.024, 0.22], WHITE, 0.006)
  k.box([0, 0.026, -0.06], [0.24, 0.004, 0.03], '#F4F3EF', 0)
  k.cyl([0.06, 0.03, 0.04], 0.05, 0.012, '#F4F3EF', { seg: 20 })
  return k.build()
}

const TOKENS: Record<Token, () => BufferGeometry> = { sheet, slip, bead, drop, coin, card }
let tokens: Record<Token, BufferGeometry> | null = null
export function tokenGeo() {
  if (!tokens) {
    tokens = {} as Record<Token, BufferGeometry>
    for (const k of Object.keys(TOKENS) as Token[]) tokens[k] = normalise(TOKENS[k](), 0.6)
  }
  return tokens
}

// ── Around the item: its grant tag, the delivery tray, the outcome stamp ──

/** A luggage tag on a short string: white card, coloured by the grant via the material. */
export function tagGeo() {
  const k = new Kit()
  k.box([0, 0, 0], [0.16, 0.1, 0.012], WHITE, 0.012)
  k.cyl([-0.055, 0.0, 0.007], 0.012, 0.004, '#9AA2AA', { seg: 10, rot: [Math.PI / 2, 0, 0] })
  k.capsule([-0.1, 0.03, 0], 0.004, 0.07, '#9AA2AA', { rot: [0, 0, 1.0] })
  return k.build()
}

/** An open kraft box the item settles into when it is bought. */
export function trayGeo() {
  const k = new Kit()
  k.box([0, 0.02, 0], [1.16, 0.04, 1.16], KRAFT, 0.01)
  for (const [x, z, w, d] of [
    [0, 0.57, 1.16, 0.04],
    [0, -0.57, 1.16, 0.04],
    [0.57, 0, 0.04, 1.16],
    [-0.57, 0, 0.04, 1.16],
  ])
    k.box([x, 0.2, z], [w, 0.4, d], KRAFT, 0.01)
  // Flaps folded out.
  k.box([0, 0.42, 0.72], [1.1, 0.02, 0.3], '#B88C5E', 0.006, { rot: [-0.7, 0, 0] })
  k.box([0, 0.42, -0.72], [1.1, 0.02, 0.3], '#B88C5E', 0.006, { rot: [0.7, 0, 0] })
  k.box([0.3, 0.2, 0.592], [0.22, 0.14, 0.004], WHITE, 0)
  return k.build()
}

/** A round stamp disc; the outcome colours it. */
export function stampGeo() {
  const k = new Kit()
  k.cyl([0, 0, 0], 0.13, 0.02, WHITE, { seg: 24, rot: [Math.PI / 2, 0, 0] })
  k.torus([0, 0, 0.011], 0.1, 0.012, '#FFFFFF', { seg: 24 })
  return k.build()
}

/** A car on the transit map: a rounded body and a darker band, tinted by its line. */
export function carGeo() {
  const k = new Kit()
  k.box([0, 0.07, 0], [0.34, 0.1, 0.78], WHITE, 0.045)
  k.box([0, 0.075, 0], [0.346, 0.03, 0.66], '#B7BDC4', 0.01)
  k.box([0, 0.123, 0], [0.26, 0.008, 0.62], '#E9ECEF', 0.004)
  for (const z of [-0.26, 0.26]) for (const x of [-0.15, 0.15]) k.cyl([x, 0.03, z], 0.035, 0.03, '#2A3038', { seg: 12, rot: [0, 0, Math.PI / 2] })
  return k.build()
}
