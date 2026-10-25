// The things people ask to buy, one shape per ItemKind, built about 0.8 m
// across so each reads at 40 to 60 px on a 1440x900 hero. Each sits on y = 0.
// A request is its item for its whole trip; the tag on it carries the grant's
// colour, and a delivery carton closes round it when it is bought.

import type { BufferGeometry } from 'three'
import type { ItemKind } from '../../feed'
import { made } from './kit'

const KRAFT = '#C49A6C'
const KRAFT_D = '#A57D52'
const TAPE = '#E3CFA4'
const WHITE = '#F2F1EC'
const INK = '#2B2F36'
const STEEL = '#C3C8CE'
const CLEAR = '#D6E6EC'

export const ITEM_GEO: Record<ItemKind, BufferGeometry> = {
  gloves: made(m => {
    m.box([0, 0.18, 0], [0.66, 0.36, 0.38], '#3E7BE0', 0.03)
    m.slab([0, 0.18, 0.192], [0.5, 0.15, 0.006], WHITE)
    m.slab([0, 0.18, 0.196], [0.22, 0.05, 0.004], '#3E7BE0')
    m.box([0, 0.362, 0], [0.34, 0.012, 0.12], '#1D3E7A', 0.005)
    m.sphere([0.0, 0.43, 0.0], 0.11, '#8FB6F5', [1.4, 0.75, 0.7], 12)
    for (const x of [-0.09, -0.03, 0.03, 0.09]) m.capsule([x, 0.53, 0.01], 0.026, 0.07, '#8FB6F5', [0.25, 0, x * 2])
  }),
  plates: made(m => {
    for (let i = 0; i < 4; i++) {
      const y = 0.035 + i * 0.075
      const dx = (i % 2 ? 0.025 : -0.02)
      m.cyl([dx, y, 0], 0.34, 0.07, CLEAR, 28)
      m.cyl([dx, y + 0.008, 0], 0.31, 0.04, '#D9972F', 28)
      m.torus([dx, y + 0.036, 0], 0.335, 0.008, '#EEF6F8', [Math.PI / 2, 0, 0])
    }
  }),
  tips: made(m => {
    m.box([0, 0.08, 0], [0.62, 0.16, 0.44], '#2F67C9', 0.02)
    m.slab([0, 0.165, 0], [0.6, 0.012, 0.42], '#DCE3EA')
    for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) m.cyl([-0.245 + i * 0.07, 0.215, -0.175 + j * 0.07], 0.022, 0.11, '#F2D35A', 6, undefined, 0.008)
    // the clear lid's edges
    for (const s of [-1, 1]) {
      m.slab([s * 0.305, 0.27, 0], [0.012, 0.2, 0.44], '#E8F2F6')
      m.slab([0, 0.27, s * 0.215], [0.6, 0.2, 0.012], '#E8F2F6')
    }
    m.slab([0, 0.372, 0], [0.62, 0.012, 0.44], '#E8F2F6')
  }),
  bottle: made(m => {
    m.lathe([[0.001, 0], [0.2, 0], [0.215, 0.03], [0.215, 0.44], [0.18, 0.52], [0.09, 0.58], [0.085, 0.62], [0.001, 0.62]], [0, 0, 0], '#8A4A12', 22)
    m.cyl([0, 0.66, 0], 0.1, 0.1, '#1A1B1E', 18)
    m.cyl([0, 0.25, 0], 0.218, 0.26, WHITE, 22)
    m.cyl([0, 0.3, 0], 0.219, 0.04, '#E15F4F', 22)
    m.cyl([0, 0.2, 0], 0.219, 0.012, INK, 22)
  }),
  kit: made(m => {
    m.box([0, 0.14, 0], [0.66, 0.28, 0.5], WHITE, 0.02)
    m.slab([0, 0.14, 0.252], [0.66, 0.06, 0.006], '#2E9C8E')
    // the 96-well plate showing through the open lid
    m.slab([0, 0.285, 0.03], [0.5, 0.02, 0.34], '#E9EEF2')
    for (let i = 0; i < 12; i++) for (let j = 0; j < 8; j++) m.cyl([-0.22 + i * 0.04, 0.297, -0.11 + j * 0.035], 0.012, 0.006, j < 3 && i < 7 ? '#E2A23A' : '#9CB3C4', 6)
    m.slab([0, 0.45, -0.3], [0.66, 0.022, 0.5], WHITE, [1.05, 0, 0])
    m.slab([0, 0.47, -0.31], [0.66, 0.008, 0.07], '#2E9C8E', [1.05, 0, 0])
  }),
  dishes: made(m => {
    m.cyl([0, 0.16, 0], 0.16, 0.7, '#E6F0F2', 20, [0, 0, Math.PI / 2])
    for (let i = 0; i < 7; i++) m.cyl([-0.27 + i * 0.09, 0.16, 0], 0.145, 0.05, '#BFD6DE', 20, [0, 0, Math.PI / 2])
    m.cyl([0, 0.16, 0], 0.168, 0.18, '#F3EFE3', 20, [0, 0, Math.PI / 2])
    m.cyl([0, 0.16, 0], 0.169, 0.03, '#5A8BD6', 20, [0, 0, Math.PI / 2])
  }),
  pump: made(m => {
    m.box([0, 0.17, 0], [0.62, 0.34, 0.42], '#3B4450', 0.04)
    m.slab([0.13, 0.25, 0.212], [0.22, 0.12, 0.006], '#9FD8C8')
    m.cyl([-0.14, 0.2, 0.24], 0.13, 0.08, STEEL, 24, [Math.PI / 2, 0, 0])
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      m.cyl([-0.14 + Math.cos(a) * 0.08, 0.2 + Math.sin(a) * 0.08, 0.29], 0.025, 0.04, '#E9ECEF', 10, [Math.PI / 2, 0, 0])
    }
    m.torus([-0.14, 0.2, 0.3], 0.135, 0.018, '#F0C57A', [0, 0, 0], Math.PI * 1.3)
    m.capsule([-0.36, 0.08, 0.3], 0.018, 0.22, '#F0C57A', [0, 0, 0.5])
    m.capsule([0.06, 0.06, 0.3], 0.018, 0.2, '#F0C57A', [0, 0, -0.9])
    for (const x of [0.08, 0.15, 0.22]) m.cyl([x, 0.1, 0.215], 0.018, 0.02, '#D84B3F', 10, [Math.PI / 2, 0, 0])
  }),
  rotor: made(m => {
    m.lathe([[0.001, 0], [0.4, 0], [0.4, 0.08], [0.3, 0.26], [0.08, 0.3], [0.001, 0.3]], [0, 0, 0], '#B9BEC4', 32)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      m.cyl([Math.cos(a) * 0.25, 0.2, Math.sin(a) * 0.25], 0.055, 0.12, '#2B2F35', 12, [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5])
    }
    m.cyl([0, 0.34, 0], 0.06, 0.1, '#8F959C', 14)
    m.torus([0, 0.08, 0], 0.4, 0.01, '#D8DCE0', [Math.PI / 2, 0, 0])
  }),
  espresso: made(m => {
    m.box([0, 0.3, -0.04], [0.48, 0.56, 0.4], '#D7DBE0', 0.05)
    m.slab([0, 0.6, -0.04], [0.5, 0.04, 0.42], '#2C2F35')
    m.box([0, 0.03, 0.08], [0.48, 0.06, 0.38], '#2C2F35', 0.02)
    m.slab([0, 0.07, 0.15], [0.36, 0.01, 0.22], '#8E949B')
    m.cyl([0, 0.38, 0.19], 0.07, 0.08, '#B3B9C0', 16)
    m.capsule([0, 0.36, 0.38], 0.022, 0.2, '#1A1B1E', [Math.PI / 2, 0, 0])
    m.lathe([[0.001, 0], [0.05, 0], [0.065, 0.09], [0.001, 0.09]], [0, 0.09, 0.18], WHITE, 14)
    m.cyl([0.14, 0.44, 0.165], 0.025, 0.02, '#E7B04A', 10, [Math.PI / 2, 0, 0])
    m.cyl([-0.14, 0.44, 0.165], 0.025, 0.02, '#5BC98C', 10, [Math.PI / 2, 0, 0])
  }),
  service: made(m => {
    m.slab([0, 0.04, 0], [0.5, 0.05, 0.66], '#8B6A4A')
    m.slab([0, 0.075, 0.02], [0.44, 0.02, 0.56], WHITE)
    for (let i = 0; i < 6; i++) m.slab([-0.03, 0.088, -0.18 + i * 0.07], [0.32, 0.006, 0.02], i === 0 ? INK : '#9AA3AE')
    m.box([0, 0.1, -0.31], [0.16, 0.06, 0.07], STEEL, 0.01)
    // the wrench
    m.slab([0.05, 0.13, 0.12], [0.07, 0.035, 0.42], '#9BA3AC', [0, 0.6, 0])
    m.torus([0.17, 0.13, 0.29], 0.07, 0.03, '#9BA3AC', [Math.PI / 2, 0, 0], Math.PI * 1.5)
    m.cyl([-0.08, 0.13, -0.05], 0.05, 0.035, '#9BA3AC', 14)
  }),
  food: made(m => {
    m.box([0, 0.06, 0], [0.74, 0.12, 0.74], '#D8B583', 0.012)
    m.slab([0, 0.122, 0], [0.7, 0.004, 0.7], '#E2C394')
    m.cyl([0, 0.126, 0], 0.17, 0.006, '#C8412E', 24)
    m.cyl([0, 0.13, 0], 0.11, 0.006, '#F3E6CF', 24)
    m.slab([0, 0.126, -0.3], [0.5, 0.006, 0.04], '#C8412E')
  }),
  chair: made(m => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      m.slab([Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15], [0.3, 0.035, 0.05], '#2C2F35', [0, -a, 0])
      m.sphere([Math.cos(a) * 0.3, 0.035, Math.sin(a) * 0.3], 0.035, '#1A1B1E', undefined, 8)
    }
    m.cyl([0, 0.2, 0], 0.03, 0.28, STEEL, 12)
    m.box([0, 0.37, 0], [0.48, 0.08, 0.46], '#3F5E8C', 0.035)
    m.slab([0, 0.52, -0.21], [0.05, 0.28, 0.03], '#2C2F35')
    m.box([0, 0.72, -0.24], [0.44, 0.36, 0.07], '#3F5E8C', 0.03, [-0.12, 0, 0])
    for (const s of [-1, 1]) m.slab([s * 0.25, 0.5, -0.02], [0.04, 0.03, 0.3], '#2C2F35')
  }),
  carton: made(m => {
    m.box([0, 0.24, 0], [0.62, 0.48, 0.5], KRAFT, 0.012)
    m.slab([0, 0.482, 0], [0.12, 0.006, 0.505], TAPE)
    m.slab([0, 0.24, 0.252], [0.12, 0.48, 0.006], TAPE)
    m.slab([0.17, 0.3, 0.252], [0.16, 0.1, 0.004], WHITE)
    m.slab([-0.18, 0.12, 0.252], [0.14, 0.012, 0.004], KRAFT_D)
  }),
}

export const ITEM_H: Record<ItemKind, number> = {
  gloves: 0.58, plates: 0.33, tips: 0.38, bottle: 0.71, kit: 0.5, dishes: 0.33, pump: 0.34,
  rotor: 0.39, espresso: 0.62, service: 0.17, food: 0.13, chair: 0.92, carton: 0.49,
}

/** A luggage tag in the grant's (or the answer's) colour, hung on every item in flight. */
export const TAG_GEO = made(m => {
  m.box([0, 0, 0], [0.24, 0.16, 0.025], '#FFFFFF', 0.02)
  m.torus([-0.08, 0.0, 0.0], 0.022, 0.008, '#FFFFFF', [0, 0, 0])
})

/** The delivery carton that closes round a bought item. */
export const CRATE_GEO = made(m => {
  m.box([0, 0.5, 0], [1, 1, 1], KRAFT, 0.02)
  m.slab([0, 1.003, 0], [0.18, 0.008, 1.01], TAPE)
  m.slab([0, 0.5, 0.503], [0.18, 1.0, 0.008], TAPE)
  m.slab([0.26, 0.62, 0.505], [0.26, 0.16, 0.006], WHITE)
  m.slab([0.26, 0.62, 0.509], [0.18, 0.03, 0.004], '#5BC98C')
})

/** A sheet of paper: papers, invoices, answers, holds and decisions. */
export const SLIP_GEO = made(m => {
  m.slab([0, 0, 0], [0.36, 0.02, 0.46], '#FFFFFF')
  for (let i = 0; i < 4; i++) m.slab([-0.03, 0.012, -0.14 + i * 0.08], [0.24, 0.004, 0.025], '#B4BAC2')
})
