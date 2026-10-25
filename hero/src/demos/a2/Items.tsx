// The things researchers ask for, each modelled so it reads at parcel size:
// a glove box with a cuff poking out, agar plates, a tip rack, an amber
// bottle, a kit with its lid ajar, a pump, a rotor, an espresso machine...
// Each is about half a unit across, centred on its middle, sitting on y = 0
// at its base. The tag that hangs off each one is painted in the grant's colour.

import type { BufferGeometry } from 'three'
import type { ItemKind } from '../../feed'
import { bake, shade } from './bake'

const W = '#F4F2EC'
const INK = '#2A2F36'

export const ITEM_GEO: Record<ItemKind, BufferGeometry> = {
  gloves: bake(b => {
    b.box([0, 0.13, 0], [0.5, 0.26, 0.3], '#4E73C8', 0.03)
    b.box([0, 0.262, 0], [0.3, 0.012, 0.11], '#2C3F70', 0.004)
    b.box([0, 0.13, 0.152], [0.34, 0.1, 0.008], W, 0.003)
    b.box([0, 0.13, 0.156], [0.2, 0.025, 0.004], '#4E73C8', 0.002)
    // A glove pulled half out of the slot: cuff, palm and two fingertips.
    b.cap([0, 0.33, 0], 0.065, 0.1, '#8FA4F0', [0, 0, 0.25], 10)
    b.cap([0.06, 0.43, 0], 0.025, 0.06, '#8FA4F0', [0, 0, -0.2], 8)
    b.cap([0.005, 0.445, 0], 0.025, 0.07, '#8FA4F0', [0, 0, 0.1], 8)
  }),
  plates: bake(b => {
    for (let i = 0; i < 3; i++) {
      const y = 0.03 + i * 0.062
      b.cyl([0, y, 0], 0.22, 0.056, '#DCE7EC', 28)
      b.cyl([0, y + 0.004, 0], 0.2, 0.05, '#D9A441', 28)
      b.ring([0, y + 0.029, 0], 0.218, 0.006, '#F4F8FA', [Math.PI / 2, 0, 0], Math.PI * 2, 28)
    }
    b.box([0.17, 0.12, 0.13], [0.07, 0.03, 0.004], W, 0.002, [0, -0.65, 0])
  }),
  tips: bake(b => {
    b.box([0, 0.06, 0], [0.44, 0.12, 0.3], '#3F6FB5', 0.02)
    b.box([0, 0.125, 0], [0.44, 0.012, 0.3], '#EDEBE6', 0.004)
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 4; j++) b.cyl([-0.175 + i * 0.07, 0.165, -0.105 + j * 0.07], 0.004, 0.08, '#E8C547', 6, undefined, 0.016)
    // The hinged lid, tipped open behind.
    b.box([0, 0.24, -0.17], [0.44, 0.22, 0.012], '#CFE0EE', 0.004, [-0.35, 0, 0])
  }),
  bottle: bake(b => {
    b.lathe([0, 0, 0], [[0, 0], [0.12, 0], [0.13, 0.02], [0.13, 0.27], [0.1, 0.33], [0.05, 0.35], [0.05, 0.37], [0, 0.37]], '#8A4A1E', 28)
    b.cyl([0, 0.4, 0], 0.058, 0.07, INK, 20)
    b.cyl([0, 0.15, 0], 0.133, 0.13, W, 28)
    b.cyl([0, 0.18, 0], 0.134, 0.018, '#C25B5B', 28)
  }),
  kit: bake(b => {
    b.box([0, 0.1, 0], [0.48, 0.2, 0.34], W, 0.02)
    b.box([0, 0.2, 0.0], [0.4, 0.012, 0.27], '#E0DED8', 0.003)
    for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) b.cyl([-0.16 + i * 0.045, 0.21, -0.1 + j * 0.05], 0.014, 0.008, ['#E8C547', '#7DB3D6', '#E0DED8'][(i + j) % 3], 8)
    b.box([0.0, 0.3, -0.2], [0.5, 0.03, 0.34], '#2E4A7A', 0.012, [-1.05, 0, 0])
    b.box([0.12, 0.1, 0.171], [0.16, 0.08, 0.004], '#2E4A7A', 0.002)
  }),
  dishes: bake(b => {
    // A clear sleeve of small dishes on its side.
    b.cyl([0, 0.11, 0], 0.11, 0.46, '#DCE7EC', 24, [0, 0, Math.PI / 2])
    for (let i = 0; i < 6; i++) b.ring([-0.19 + i * 0.076, 0.11, 0], 0.1, 0.01, '#F8FBFC', [0, Math.PI / 2, 0], Math.PI * 2, 24)
    b.cyl([0, 0.11, 0], 0.112, 0.12, W, 24, [0, 0, Math.PI / 2])
    b.cyl([0, 0.11, 0], 0.113, 0.02, '#4F9C80', 24, [0, 0, Math.PI / 2])
  }),
  pump: bake(b => {
    b.box([0, 0.13, 0], [0.44, 0.26, 0.32], '#E6E1D8', 0.03)
    b.box([-0.08, 0.19, 0.162], [0.16, 0.07, 0.006], '#22303D', 0.004)
    b.cyl([0.12, 0.15, 0.17], 0.085, 0.06, '#5C6672', 24, [Math.PI / 2, 0, 0])
    b.cyl([0.12, 0.15, 0.2], 0.03, 0.02, '#C8CDD3', 12, [Math.PI / 2, 0, 0])
    b.ring([0.12, 0.15, 0.2], 0.1, 0.014, '#E2C892', [0, 0, 0], Math.PI * 1.3, 24)
    b.cap([0.23, 0.08, 0.2], 0.014, 0.12, '#E2C892', [0, 0, 0.3], 8)
    b.cyl([-0.08, 0.1, 0.165], 0.022, 0.01, '#C98B2E', 10, [Math.PI / 2, 0, 0])
  }),
  rotor: bake(b => {
    b.lathe([0, 0, 0], [[0, 0], [0.18, 0], [0.24, 0.04], [0.25, 0.1], [0.2, 0.17], [0.07, 0.19], [0.04, 0.26], [0, 0.26]], '#B8BEC6', 32)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      b.cyl([Math.cos(a) * 0.15, 0.172, Math.sin(a) * 0.15], 0.035, 0.012, '#3A414A', 14, [Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45])
    }
    b.cyl([0, 0.27, 0], 0.025, 0.03, '#6B737D', 10)
  }),
  espresso: bake(b => {
    b.box([0, 0.03, 0.02], [0.36, 0.06, 0.34], '#9EA6AF', 0.02)
    b.box([0, 0.24, -0.06], [0.34, 0.36, 0.22], '#C4CAD0', 0.04)
    b.box([0, 0.37, 0.07], [0.3, 0.1, 0.12], '#C4CAD0', 0.03)
    b.cyl([0, 0.3, 0.12], 0.045, 0.04, '#3A414A', 16)
    b.box([0, 0.3, 0.2], [0.03, 0.025, 0.12], '#22262B', 0.008)
    b.cyl([0, 0.09, 0.11], 0.045, 0.06, W, 16, undefined, 0.035)
    b.ball([0.1, 0.33, 0.135], 0.018, '#C25B5B', undefined, 8)
  }),
  service: bake(b => {
    b.box([0, 0.15, 0], [0.32, 0.4, 0.02], '#8A6A48', 0.008, [-0.12, 0, 0])
    b.box([0, 0.14, 0.014], [0.27, 0.34, 0.006], W, 0.002, [-0.12, 0, 0])
    for (let i = 0; i < 4; i++) b.box([-0.02, 0.24 - i * 0.055, 0.03 - i * 0.007], [0.18 - (i % 2) * 0.05, 0.016, 0.004], '#9AA4AF', 0.002, [-0.12, 0, 0])
    b.box([0, 0.35, 0.0], [0.12, 0.05, 0.04], '#9AA4AF', 0.01, [-0.12, 0, 0])
    // A small wrench leaning on it.
    b.cap([0.2, 0.12, 0.08], 0.018, 0.2, '#6B737D', [0, 0, -0.4], 8)
    b.ring([0.245, 0.235, 0.08], 0.03, 0.014, '#6B737D', [0, 0, 0.3], Math.PI * 1.4, 12)
  }),
  food: bake(b => {
    b.box([0, 0.04, 0], [0.5, 0.08, 0.5], '#EFE6D4', 0.012)
    b.cyl([0, 0.082, 0], 0.17, 0.004, '#C2403A', 28)
    b.cyl([0, 0.085, 0], 0.11, 0.004, '#EFE6D4', 28)
    b.box([0, 0.06, 0.252], [0.3, 0.03, 0.004], '#C2403A', 0.002)
  }),
  chair: bake(b => {
    b.box([0, 0.28, 0], [0.34, 0.06, 0.32], '#3D4A5C', 0.03)
    b.box([0, 0.5, -0.15], [0.32, 0.34, 0.05], '#3D4A5C', 0.03, [-0.12, 0, 0])
    b.cyl([0, 0.16, 0], 0.025, 0.2, '#9AA4AF', 10)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      b.box([Math.sin(a) * 0.12, 0.05, Math.cos(a) * 0.12], [0.03, 0.025, 0.24], '#5C6672', 0.01, [0, a, 0])
      b.ball([Math.sin(a) * 0.23, 0.025, Math.cos(a) * 0.23], 0.025, INK, undefined, 8)
    }
  }),
  carton: bake(b => {
    b.box([0, 0.15, 0], [0.44, 0.3, 0.34], '#C9A67A', 0.02)
    b.box([0, 0.302, 0], [0.08, 0.006, 0.345], shade('#C9A67A', 0.12), 0.002)
    b.box([0.1, 0.16, 0.172], [0.14, 0.09, 0.004], W, 0.002)
  }),
}

/** Rotor and espresso machine are metal; everything else is clay. */
export const IS_METAL: Partial<Record<ItemKind, boolean>> = { rotor: true, espresso: true }

/** The hanging tag, its string tied to the item's top corner. */
export const TAG_GEO = bake(b => {
  b.box([0, -0.07, 0], [0.12, 0.15, 0.012], '#FFFFFF', 0.012)
  b.cyl([0, -0.025, 0.007], 0.012, 0.004, '#FFFFFF', 8, [Math.PI / 2, 0, 0])
})

/** Bought: the item goes home boxed, a kraft carton with the celadon delivery band. */
export const CRATE_GEO = bake(b => {
  b.box([0, 0.2, 0], [0.62, 0.4, 0.48], '#C9A67A', 0.03)
  b.box([0, 0.401, 0], [0.1, 0.006, 0.49], shade('#C9A67A', 0.12), 0.002)
  b.box([0, 0.2, 0], [0.632, 0.07, 0.492], '#4F9C80', 0.01)
  b.box([-0.16, 0.3, 0.243], [0.18, 0.11, 0.004], '#F4F2EC', 0.002)
})

/** Where a grant tag hangs on each item: its right edge, high up, a little forward. */
export const TAG_AT = {} as Record<ItemKind | 'crate', [number, number, number]>
for (const [k, g] of [...Object.entries(ITEM_GEO), ['crate', CRATE_GEO] as const]) {
  g.computeBoundingBox()
  const b = g.boundingBox!
  TAG_AT[k as ItemKind | 'crate'] = [b.max.x + 0.01, b.min.y + (b.max.y - b.min.y) * 0.8, (b.min.z + b.max.z) / 2 + 0.03]
}
