// The things researchers buy, modelled so each reads at parcel size: a blue
// glove box with a cuff poking out, a stack of agar plates, a tip rack with
// its lid open, an amber reagent bottle, a kit with a 96-well plate, a
// sleeve of glass-bottom dishes, a peristaltic pump, a titanium rotor, a
// chrome espresso machine, a service contract with a wrench, a pizza box,
// an office chair and a plain carton. Each is built once, in world size,
// bottom at y = -ITEM_BOTTOM, as one vertex-coloured matte geometry plus
// an optional metal one. Also here: the grant tag, the delivery crate, the
// frost shell for a held item, and the puddle a blocked one leaves.

import { CapsuleGeometry, Color, DoubleSide, Float32BufferAttribute, MeshPhysicalMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three'
import type { ItemKind } from '../../feed'
import { cylinder, lathe, merge, placed, roundedBox } from './batch'
import { PAL, type V3 } from './layout'

export const ITEM_BOTTOM = 0.33

const c = new Color()
function paint(g: BufferGeometry, hex: string) {
  c.set(hex).convertSRGBToLinear()
  const n = g.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r
    a[i * 3 + 1] = c.g
    a[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new Float32BufferAttribute(a, 3))
  return g
}
const P = (geo: BufferGeometry, hex: string, p: V3, rot?: V3, scale?: V3) => paint(placed(geo, p, rot, scale), hex)
const box = (s: V3, r: number, hex: string, p: V3, rot?: V3) => P(roundedBox(s, r), hex, p, rot)
const cyl = (r: number, h: number, hex: string, p: V3, rot?: V3, seg = 20, r2?: number) => P(cylinder(r, h, seg, r2), hex, p, rot)
const ball = (r: number, hex: string, p: V3, scale?: V3) => P(new SphereGeometry(r, 14, 10), hex, p, undefined, scale)
const B0 = -ITEM_BOTTOM

export interface ItemModel {
  matte: BufferGeometry
  metal?: BufferGeometry
  /** Where the grant tag hangs, relative to the item's centre. */
  tag: V3
}

function gloves(): ItemModel {
  const g: BufferGeometry[] = [
    box([0.62, 0.34, 0.36], 0.03, '#3E7CC4', [0, B0 + 0.17, 0]),
    box([0.3, 0.012, 0.11], 0.005, '#1E3F66', [0, B0 + 0.343, 0]),
    box([0.32, 0.1, 0.006], 0.003, '#F4F2EE', [-0.08, B0 + 0.16, 0.181]),
    box([0.14, 0.03, 0.006], 0.003, '#6E9FD6', [-0.08, B0 + 0.16, 0.185]),
    // The cuff and fingers of one glove, pulled half out of the slot.
    box([0.2, 0.16, 0.05], 0.024, '#7FB0E2', [0, B0 + 0.43, 0], [0.12, 0, -0.18]),
    ...[-0.06, -0.02, 0.02, 0.06].map((x, i) => P(new CapsuleGeometry(0.018, 0.07 + (i % 2) * 0.02, 3, 8), '#7FB0E2', [x - 0.03, B0 + 0.55 + (i % 2) * 0.01, 0.01], [0.15, 0, -0.18 + x])),
  ]
  return { matte: merge(g), tag: [0.33, -0.02, 0.1] }
}

function plates(): ItemModel {
  const g: BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const y = B0 + 0.035 + i * 0.072
    const dx = (i % 2 ? 0.012 : -0.01) * (i % 3)
    g.push(cyl(0.27, 0.066, '#E4ECF0', [dx, y, 0], undefined, 28))
    g.push(cyl(0.245, 0.03, '#D9A441', [dx, y + 0.012, 0], undefined, 28))
  }
  g.push(cyl(0.272, 0.012, '#F2F6F8', [0, B0 + 0.36, 0], undefined, 28))
  return { matte: merge(g), tag: [0.3, 0.05, 0.08] }
}

function tips(): ItemModel {
  const g: BufferGeometry[] = [box([0.5, 0.2, 0.34], 0.025, '#2A313A', [0, B0 + 0.1, 0]), box([0.48, 0.02, 0.32], 0.006, '#E9ECEE', [0, B0 + 0.21, 0])]
  for (let x = 0; x < 6; x++) for (let z = 0; z < 4; z++) g.push(cyl(0.012, 0.09, '#E9D58A', [-0.19 + x * 0.076, B0 + 0.26, -0.11 + z * 0.074], undefined, 8, 0.024))
  // The teal lid, hinged open at the back.
  g.push(box([0.52, 0.14, 0.36], 0.02, '#3D9C8F', [0, B0 + 0.33, -0.25], [-1.25, 0, 0]))
  return { matte: merge(g), tag: [0.3, -0.05, 0.12] }
}

function bottle(): ItemModel {
  const body = lathe(
    [
      [0.001, 0],
      [0.16, 0],
      [0.17, 0.02],
      [0.17, 0.36],
      [0.15, 0.42],
      [0.08, 0.47],
      [0.072, 0.52],
      [0.001, 0.52],
    ],
    28,
  )
  const g: BufferGeometry[] = [
    P(body, '#A8641E', [0, B0, 0]),
    cyl(0.173, 0.17, '#FBF9F5', [0, B0 + 0.19, 0], undefined, 28),
    box([0.12, 0.022, 0.01], 0.004, '#4E5967', [0, B0 + 0.22, 0.172]),
    box([0.08, 0.016, 0.01], 0.004, '#9C2E2A', [0, B0 + 0.17, 0.172]),
    cyl(0.088, 0.11, '#1E2126', [0, B0 + 0.57, 0], undefined, 20),
  ]
  return { matte: merge(g), tag: [0.22, 0.05, 0.08] }
}

function kit(): ItemModel {
  const g: BufferGeometry[] = [
    box([0.62, 0.26, 0.44], 0.02, '#F7F5F1', [0, B0 + 0.13, 0]),
    box([0.625, 0.05, 0.445], 0.006, '#2E5BA6', [0, B0 + 0.08, 0]),
    // The lid, lifted at the back and pushed aside.
    box([0.64, 0.04, 0.46], 0.012, '#F1EEE8', [0.08, B0 + 0.33, -0.08], [-0.42, 0.12, 0]),
    // A 96-well plate showing inside.
    box([0.4, 0.04, 0.27], 0.008, '#E5ECF1', [-0.04, B0 + 0.27, 0.05]),
  ]
  for (let x = 0; x < 12; x++) for (let z = 0; z < 8; z++) g.push(cyl(0.009, 0.006, '#7E95A8', [-0.04 - 0.165 + x * 0.03, B0 + 0.292, 0.05 - 0.105 + z * 0.03], undefined, 6))
  return { matte: merge(g), tag: [0.34, -0.05, 0.14] }
}

function dishes(): ItemModel {
  // A clear sleeve lying on its side, small dishes inside, a white cap at each end.
  const g: BufferGeometry[] = [P(cylinder(0.17, 0.6, 24, 0.17, true), '#DCE7EE', [0, B0 + 0.17, 0], [0, 0, Math.PI / 2])]
  for (let i = 0; i < 7; i++) {
    g.push(cyl(0.15, 0.05, '#F2F5F7', [-0.24 + i * 0.08, B0 + 0.17, 0], [0, 0, Math.PI / 2], 22))
    g.push(cyl(0.07, 0.052, '#9EC1DA', [-0.24 + i * 0.08, B0 + 0.17, 0], [0, 0, Math.PI / 2], 16))
  }
  g.push(cyl(0.176, 0.03, '#F7F5F1', [-0.31, B0 + 0.17, 0], [0, 0, Math.PI / 2], 24), cyl(0.176, 0.03, '#F7F5F1', [0.31, B0 + 0.17, 0], [0, 0, Math.PI / 2], 24))
  g.push(box([0.2, 0.08, 0.006], 0.003, '#FBF9F5', [0, B0 + 0.2, 0.172]))
  return { matte: merge(g), tag: [0.34, 0.02, 0.1] }
}

function pump(): ItemModel {
  const g: BufferGeometry[] = [
    box([0.52, 0.3, 0.38], 0.04, '#4E5967', [0, B0 + 0.17, 0]),
    box([0.5, 0.02, 0.36], 0.006, '#3A4451', [0, B0 + 0.01, 0]),
    box([0.14, 0.07, 0.01], 0.004, '#CFE3F2', [0.13, B0 + 0.24, 0.192]),
    cyl(0.025, 0.02, '#C98B2E', [0.13, B0 + 0.14, 0.195], [Math.PI / 2, 0, 0], 12),
    // The roller head on the front with its loop of tubing.
    cyl(0.12, 0.1, '#2B2F35', [-0.1, B0 + 0.2, 0.23], [Math.PI / 2, 0, 0], 24),
    cyl(0.03, 0.12, '#B9BEC4', [-0.1, B0 + 0.2, 0.24], [Math.PI / 2, 0, 0], 12),
    P(new TorusGeometry(0.135, 0.018, 8, 28, Math.PI * 1.3), '#E8D9B8', [-0.1, B0 + 0.2, 0.25], [0, 0, -0.65]),
    P(new CapsuleGeometry(0.018, 0.22, 3, 8), '#E8D9B8', [-0.26, B0 + 0.06, 0.25], [0, 0, 0.5]),
    P(new CapsuleGeometry(0.018, 0.22, 3, 8), '#E8D9B8', [0.07, B0 + 0.06, 0.25], [0, 0, -0.5]),
  ]
  return { matte: merge(g), tag: [0.33, 0.0, 0.12] }
}

function rotor(): ItemModel {
  const shell = lathe(
    [
      [0.001, 0],
      [0.27, 0],
      [0.3, 0.03],
      [0.3, 0.17],
      [0.24, 0.27],
      [0.08, 0.31],
      [0.001, 0.31],
    ],
    40,
  )
  const metal = merge([P(shell, '#A9B0B8', [0, B0, 0]), cyl(0.05, 0.1, '#C9CED4', [0, B0 + 0.34, 0], undefined, 16)])
  const g: BufferGeometry[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    g.push(cyl(0.055, 0.03, '#2E343C', [Math.cos(a) * 0.17, B0 + 0.29 - 0.02, Math.sin(a) * 0.17], [0, 0, (Math.cos(a) * 0.17) / 0.6], 16))
  }
  g.push(cyl(0.015, 0.02, '#1C232C', [0, B0 + 0.4, 0], undefined, 8))
  return { matte: merge(g), metal, tag: [0.34, -0.05, 0.08] }
}

function espresso(): ItemModel {
  const metal = merge([
    box([0.36, 0.44, 0.3], 0.04, '#B9C0C7', [0, B0 + 0.24, -0.02]),
    box([0.38, 0.03, 0.34], 0.01, '#C9CED4', [0, B0 + 0.015, 0.02]),
    box([0.3, 0.02, 0.12], 0.008, '#B9C0C7', [0, B0 + 0.04, 0.16]),
    cyl(0.06, 0.06, '#C9CED4', [0, B0 + 0.33, 0.17], undefined, 16),
    cyl(0.012, 0.12, '#C9CED4', [0.13, B0 + 0.28, 0.17], [0.3, 0, 0], 8),
  ])
  const g: BufferGeometry[] = [
    box([0.04, 0.03, 0.2], 0.012, '#1E2126', [0, B0 + 0.29, 0.28], [0.2, 0, 0]),
    cyl(0.05, 0.06, '#F5F1EB', [0, B0 + 0.08, 0.16], undefined, 16, 0.04),
    cyl(0.03, 0.03, '#1E2126', [-0.1, B0 + 0.47, 0.1], undefined, 10),
    cyl(0.03, 0.03, '#1E2126', [0.1, B0 + 0.47, 0.1], undefined, 10),
    box([0.16, 0.05, 0.01], 0.004, '#2E5BA6', [0, B0 + 0.4, 0.132]),
  ]
  return { matte: merge(g), metal, tag: [0.26, 0.05, 0.12] }
}

function service(): ItemModel {
  // A clipped document standing tilted back, a wrench leaning against it.
  const g: BufferGeometry[] = [
    box([0.42, 0.56, 0.03], 0.008, '#B98F66', [0, B0 + 0.29, -0.02], [-0.3, 0, 0]),
    box([0.37, 0.5, 0.01], 0.003, '#F7F4EF', [0, B0 + 0.28, 0.0], [-0.3, 0, 0]),
    box([0.16, 0.05, 0.04], 0.01, '#1E2126', [0, B0 + 0.55, -0.08], [-0.3, 0, 0]),
  ]
  for (let i = 0; i < 5; i++) g.push(box([i === 0 ? 0.22 : 0.28 - (i % 2) * 0.06, 0.018, 0.004], 0.002, '#9AA3AD', [i === 0 ? -0.04 : -0.01, B0 + 0.44 - i * 0.07, 0.022 + i * 0.021], [-0.3, 0, 0]))
  const metal = merge([
    box([0.05, 0.4, 0.025], 0.012, '#9EA6AF', [0.06, B0 + 0.2, 0.17], [-0.15, 0, 0.55]),
    P(new TorusGeometry(0.055, 0.022, 8, 20, Math.PI * 1.45), '#9EA6AF', [0.17, B0 + 0.38, 0.14], [-0.15, 0, 0.55 + 0.8]),
    P(new TorusGeometry(0.04, 0.02, 8, 18), '#9EA6AF', [-0.05, B0 + 0.02, 0.2], [Math.PI / 2 - 0.15, 0, 0]),
  ])
  return { matte: merge(g), metal, tag: [0.3, 0.1, 0.06] }
}

function food(): ItemModel {
  const g: BufferGeometry[] = [
    box([0.66, 0.1, 0.66], 0.015, '#C9A06A', [0, B0 + 0.05, 0]),
    box([0.665, 0.012, 0.665], 0.004, '#B58C58', [0, B0 + 0.07, 0]),
    box([0.64, 0.012, 0.64], 0.004, '#D8B47F', [0, B0 + 0.104, 0]),
    cyl(0.12, 0.006, '#9C2E2A', [0, B0 + 0.112, 0], undefined, 24),
    cyl(0.08, 0.008, '#E9DFC9', [0, B0 + 0.114, 0], undefined, 20),
  ]
  return { matte: merge(g), tag: [0.36, -0.15, 0.2] }
}

function chair(): ItemModel {
  const g: BufferGeometry[] = [
    box([0.36, 0.06, 0.34], 0.025, '#4E5967', [0, B0 + 0.3, 0]),
    box([0.34, 0.3, 0.05], 0.025, '#4E5967', [0, B0 + 0.5, -0.17], [-0.12, 0, 0]),
    box([0.04, 0.14, 0.03], 0.01, '#3A4451', [0, B0 + 0.34, -0.17]),
  ]
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    g.push(box([0.2, 0.025, 0.04], 0.01, '#2B2F35', [Math.cos(a) * 0.1, B0 + 0.04, Math.sin(a) * 0.1], [0, -a, 0]))
    g.push(ball(0.025, '#1E2126', [Math.cos(a) * 0.2, B0 + 0.025, Math.sin(a) * 0.2]))
  }
  const metal = merge([cyl(0.022, 0.24, '#C9CED4', [0, B0 + 0.16, 0], undefined, 12)])
  return { matte: merge(g), metal, tag: [0.24, 0.1, 0.1] }
}

function carton(): ItemModel {
  const g: BufferGeometry[] = [
    box([0.52, 0.4, 0.42], 0.02, '#C49A6C', [0, B0 + 0.2, 0]),
    box([0.1, 0.006, 0.425], 0.002, '#D9C29A', [0, B0 + 0.402, 0]),
    box([0.1, 0.2, 0.006], 0.002, '#D9C29A', [0, B0 + 0.3, 0.212]),
    box([0.525, 0.006, 0.006], 0.002, '#A9845A', [0, B0 + 0.402, 0.0]),
    box([0.12, 0.08, 0.004], 0.002, '#F4F2EE', [-0.14, B0 + 0.14, 0.212]),
  ]
  return { matte: merge(g), tag: [0.31, 0.05, 0.12] }
}

const BUILD: Record<ItemKind, () => ItemModel> = { gloves, plates, tips, bottle, kit, dishes, pump, rotor, espresso, service, food, chair, carton }
export const KINDS = Object.keys(BUILD) as ItemKind[]

let models: Record<ItemKind, ItemModel> | null = null
export function itemModels() {
  if (!models) models = Object.fromEntries(KINDS.map(k => [k, BUILD[k]()])) as Record<ItemKind, ItemModel>
  return models
}

export const itemMatte = new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: DoubleSide })
export const itemMetal = new MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.85, envMapIntensity: 1.3 })

// ── The grant tag, the crate, the frost shell, the puddle ───────────────

/** A paper tag on a short string; the coloured face takes the grant's colour per instance. */
export const tagGeo = merge([placed(roundedBox([0.15, 0.2, 0.014], 0.03), [0, -0.1, 0]), placed(cylinder(0.022, 0.016, 12), [0, -0.03, 0], [Math.PI / 2, 0, 0])])
export const tagHalfGeo = merge([placed(roundedBox([0.075, 0.2, 0.016], 0.02), [0.0375, -0.1, 0])])
export const stringGeo = merge([placed(cylinder(0.004, 0.12, 6), [0, 0.06, 0])])
export const tagMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 })

/** The delivery crate a bought item drops into: slatted walls, open top. */
export const crateGeo = merge([
  placed(roundedBox([0.86, 0.05, 0.62], 0.01), [0, -0.33, 0]),
  ...[-0.3, 0.3].map(z => placed(roundedBox([0.86, 0.3, 0.04], 0.012), [0, -0.19, z])),
  ...[-0.41, 0.41].map(x => placed(roundedBox([0.04, 0.3, 0.62], 0.012), [x, -0.19, 0])),
  ...[-0.3, 0.3].map(z => placed(roundedBox([0.88, 0.04, 0.05], 0.01), [0, -0.05, z])),
])
export const crateMat = new MeshPhysicalMaterial({ color: PAL.celadon, roughness: 0.35, clearcoat: 0.6 })
export const frostGeo = roundedBox([0.86, 0.8, 0.66], 0.18, 3)
export const frostMat = new MeshPhysicalMaterial({ color: '#EAF2F8', roughness: 0.45, transparent: true, opacity: 0.5, depthWrite: false, clearcoat: 0.6 })
export const puddleGeo = cylinder(0.34, 0.02, 32)
export const puddleMat = new MeshPhysicalMaterial({ color: PAL.oxblood, roughness: 0.25, clearcoat: 0.8 })
