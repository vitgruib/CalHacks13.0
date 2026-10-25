// The people: five lab members and the grant manager, each a jointed clay
// figure with their own clothes, hair and gear. Joints are nested bones
// (pelvis → torso → head and arms, pelvis → legs) and every part is rigidly
// bound to one, so a whole figure is a single skinned mesh and one draw call.
// Lab members follow their feed task from station to station along the
// aisles, work with their hands when they get there, stop to hold up
// whatever they are asking for, and react when the answer lands.

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Bone, BufferAttribute, CapsuleGeometry, Mesh, MeshBasicMaterial, Skeleton, SkinnedMesh, Vector3, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { feed, progress, useFlow } from '../../feed'
import { Kit } from './geo'
import { SPOTS, mapPoint, planFor, walkPath, type Act, type Step, type V2 } from './layout'
import { M } from './mats'
import { Pick } from './Parts'
import { SEND, fx, now, person, reducedMotion } from './store'

// ── Looks ─────────────────────────────────────────────────────────────────

type Hair = 'bun' | 'crop' | 'pony' | 'curls' | 'swept' | 'grey'
interface Look {
  skin: string
  hair: string
  style: Hair
  top: 'coat' | 'cardigan' | 'blazer'
  topColor: string
  shade: string
  under: string
  pants: string
  shoes: string
  vest?: string
  beard?: boolean
  h: number // overall height
  w: number // build
  badge: string
}
const COAT = '#F2EFE9'
const COAT_SHADE = '#DCD8D0'
const LOOKS: Record<string, Look> = {
  ortiz: { skin: '#C68E68', hair: '#3A2A22', style: 'bun', top: 'cardigan', topColor: '#A65B44', shade: '#8C4A37', under: '#EFE8DC', pants: '#2F3540', shoes: '#4A3B33', h: 1.0, w: 0.97, badge: '#3D7FD1' },
  okafor: { skin: '#5A3825', hair: '#17110F', style: 'crop', beard: true, top: 'coat', topColor: COAT, shade: COAT_SHADE, under: '#5E7FA6', pants: '#3B3F47', shoes: '#2A2B2F', h: 1.05, w: 1.07, badge: '#3D7FD1' },
  raman: { skin: '#9C6644', hair: '#141010', style: 'pony', top: 'coat', topColor: COAT, shade: COAT_SHADE, under: '#8C4F6B', pants: '#2C3A52', shoes: '#E8E4DE', h: 0.95, w: 0.93, badge: '#8AAE3B' },
  silva: { skin: '#D7A47C', hair: '#2E1F16', style: 'curls', top: 'coat', topColor: COAT, shade: COAT_SHADE, under: '#5B7A5A', pants: '#4A4F58', shoes: '#6B5A4A', h: 1.0, w: 1.0, badge: '#3D7FD1' },
  park: { skin: '#E8C2A0', hair: '#0F0F12', style: 'swept', top: 'coat', topColor: COAT, shade: COAT_SHADE, vest: '#2E4A66', under: '#C9CDD2', pants: '#3D4450', shoes: '#30343A', h: 0.98, w: 1.0, badge: '#C24F7E' },
  gm: { skin: '#7A4E36', hair: '#CBC6BD', style: 'grey', top: 'blazer', topColor: '#3A4250', shade: '#2A313B', under: '#ECE7DD', pants: '#2B3039', shoes: '#2A2523', h: 1.0, w: 1.03, badge: '#C24F7E' },
}

const HIP = 0.92
const SEAT = 0.5
const TORSO: [number, number][] = [
  [0, 0],
  [0.16, 0],
  [0.168, 0.1],
  [0.182, 0.22],
  [0.19, 0.31],
  [0.178, 0.37],
  [0.14, 0.42],
  [0.07, 0.455],
  [0, 0.46],
]
const rAt = (y: number) => {
  for (let i = 1; i < TORSO.length; i++) if (TORSO[i][1] >= y) {
    const [r0, y0] = TORSO[i - 1]
    const [r1, y1] = TORSO[i]
    return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0)
  }
  return 0
}

interface BodyGeo {
  pelvis: BufferGeometry
  torso: BufferGeometry
  head: BufferGeometry
  glasses: BufferGeometry
  upper: BufferGeometry
  fore: BufferGeometry
  hand: BufferGeometry
  glove: BufferGeometry
  thigh: BufferGeometry
  shin: BufferGeometry
  foot: BufferGeometry
}

const bodies = new Map<string, BodyGeo>()
function bodyGeo(id: string): BodyGeo {
  const hit = bodies.get(id)
  if (hit) return hit
  const L = LOOKS[id] ?? LOOKS.silva
  const w = L.w
  const ZK = 0.66 * w
  const front = (y: number) => rAt(y) * ZK + 0.004

  // Hips, seat of the trousers, and the coat's skirt.
  const pelvis = new Kit().box([0, 0.02, 0], [0.3 * w, 0.18, 0.2 * w], L.pants, 0.06)
  if (L.top === 'coat') {
    pelvis.lathe(
      [
        [0.2, -0.37],
        [0.205, -0.36],
        [0.19, -0.18],
        [0.176, 0.0],
        [0.168, 0.12],
      ],
      L.topColor,
      [0, 0, 0],
      { scale: [w, 1, 0.74 * w], seg: 28 },
    )
    for (const sx of [-1, 1]) {
      pelvis.box([0.022 * sx, -0.13, 0.152 * w], [0.012, 0.46, 0.01], L.shade, 0)
      pelvis.box([0.13 * sx * w, -0.13, 0.112 * w], [0.1, 0.075, 0.012], L.shade, 0.004, { rot: [0, 0.62 * sx, 0] })
    }
  } else {
    const hem = L.top === 'cardigan' ? -0.06 : -0.15
    pelvis.lathe(
      [
        [0.176, hem - 0.01],
        [0.18, hem],
        [0.176, 0.0],
        [0.166, 0.12],
      ],
      L.topColor,
      [0, 0, 0],
      { scale: [w, 1, 0.72 * w], seg: 28 },
    )
    if (L.top === 'cardigan')
      pelvis.lathe(
        [
          [0.182, hem],
          [0.186, hem + 0.012],
          [0.182, hem + 0.026],
        ],
        L.shade,
        [0, 0, 0],
        { scale: [w, 1, 0.72 * w], seg: 28 },
      )
  }

  // Chest: coat with collar, lapels, pocket, pens and badge (or a cardigan, or a blazer).
  const torso = new Kit().lathe(TORSO, L.vest ? COAT : L.topColor, [0, 0, 0], { scale: [w, 1, ZK / 0.66 * 0.66], seg: 30 })
  torso.box([0, 0.35, front(0.35) - 0.006], [0.085, 0.15, 0.01], L.under, 0)
  torso.cyl([0, 0.5, 0], 0.044, 0.1, L.skin, { seg: 16 })
  for (const sx of [-1, 1]) torso.sphere([0.19 * sx * w, 0.385, 0], 0.062, L.topColor, { seg: 14 })
  if (L.top === 'coat' || L.top === 'blazer') {
    const lap = L.top === 'blazer' ? L.shade : L.shade
    for (const sx of [-1, 1]) {
      torso.box([0.05 * sx, 0.3, front(0.3) + 0.002], [0.05, 0.25, 0.012], lap, 0.004, { rot: [0, 0, -0.32 * sx] })
      torso.box([0.068 * sx, 0.43, 0.06], [0.075, 0.05, 0.03], L.topColor, 0.01, { rot: [-0.5, 0, -0.5 * sx] })
    }
    torso.box([0.1 * w, 0.27, front(0.27)], [0.075, 0.075, 0.008], L.shade, 0.003, { rot: [0, 0.38, 0] })
    torso.cyl([0.087 * w, 0.315, front(0.3) + 0.003], 0.0065, 0.05, '#2B4A8A', { seg: 8 })
    torso.cyl([0.107 * w, 0.315, front(0.3) + 0.003], 0.0065, 0.05, '#23272C', { seg: 8 })
    for (const y of [0.07, 0.15]) torso.sphere([0.016, y, front(y) + 0.002], 0.009, L.shade, { seg: 8 })
    torso.box([-0.1 * w, 0.255, front(0.255) + 0.002], [0.05, 0.066, 0.006], '#FAFAF7', 0.002, { rot: [0, -0.38, 0] })
    torso.box([-0.1 * w, 0.282, front(0.282) + 0.005], [0.05, 0.014, 0.006], L.badge, 0, { rot: [0, -0.38, 0] })
  } else {
    // A cardigan: V neck, buttons, the badge on a lanyard.
    torso.box([0, 0.33, front(0.33) - 0.004], [0.11, 0.2, 0.012], L.under, 0)
    for (let i = 0; i < 4; i++) {
      const y = 0.05 + i * 0.065
      torso.sphere([0, y, front(y) + 0.002], 0.009, L.shade, { seg: 8 })
    }
    for (const sx of [-1, 1]) torso.box([0.04 * sx, 0.36, front(0.36) + 0.004], [0.008, 0.18, 0.006], '#2E5BA6', 0, { rot: [0, 0, 0.22 * sx] })
    torso.box([0, 0.24, front(0.24) + 0.008], [0.052, 0.07, 0.007], '#FAFAF7', 0.002)
    torso.box([0, 0.268, front(0.268) + 0.012], [0.052, 0.014, 0.006], L.badge, 0)
  }
  if (L.vest) {
    torso.lathe(
      TORSO.slice(0, 7).map(([r, y]) => [r + 0.012, y] as [number, number]),
      L.vest,
      [0, 0.0, 0],
      { scale: [w, 1, 0.68 * w], seg: 30 },
    )
    torso.box([0, 0.2, front(0.2) + 0.012], [0.008, 0.36, 0.006], '#1D2F42', 0)
    torso.box([0.1 * w, 0.255, front(0.255) + 0.012], [0.05, 0.066, 0.006], '#FAFAF7', 0.002, { rot: [0, 0.38, 0] })
    torso.box([0.1 * w, 0.282, front(0.282) + 0.015], [0.05, 0.014, 0.006], L.badge, 0, { rot: [0, 0.38, 0] })
  }

  // Head: face, ears, eyes, brows, nose, mouth, then the hair.
  const head = new Kit()
    .sphere([0, 0.105, 0.0], 0.105, L.skin, { scale: [0.94, 1.07, 1.0], seg: 22 })
    .sphere([0, 0.05, 0.03], 0.072, L.skin, { scale: [0.98, 0.88, 0.92], seg: 16 })
    .box([0, 0.092, 0.104], [0.022, 0.036, 0.03], L.skin, 0.008)
    .box([0, 0.052, 0.094], [0.032, 0.007, 0.008], '#6E4038', 0.002)
  for (const sx of [-1, 1]) {
    head.sphere([0.099 * sx, 0.098, 0.0], 0.024, L.skin, { scale: [0.5, 1, 0.8], seg: 10 })
    head.sphere([0.036 * sx, 0.115, 0.093], 0.011, '#1B1A1A', { seg: 8 })
    head.box([0.037 * sx, 0.142, 0.094], [0.032, 0.008, 0.01], L.hair, 0.003, { rot: [0, 0, 0.08 * sx] })
  }
  const hair = L.hair
  if (L.style === 'crop') head.dome([0, 0.11, -0.008], 0.111, hair, { theta: 1.3, rot: [-0.3, 0, 0] })
  if (L.style === 'bun') {
    head.dome([0, 0.105, -0.01], 0.114, hair, { theta: 1.45, rot: [-0.28, 0, 0] })
    head.sphere([0, 0.2, -0.085], 0.052, hair, { seg: 14 })
    head.box([0.0, 0.18, 0.07], [0.12, 0.03, 0.04], hair, 0.012, { rot: [0.5, 0, 0] })
  }
  if (L.style === 'pony') {
    head.dome([0, 0.105, -0.008], 0.114, hair, { theta: 1.45, rot: [-0.26, 0, 0] })
    head.capsule([0, 0.02, -0.125], 0.032, 0.17, hair, { rot: [0.22, 0, 0] })
    head.torus([0, 0.13, -0.11], 0.026, 0.008, '#C24F7E', { rot: [Math.PI / 2 + 0.3, 0, 0], seg: 14 })
  }
  if (L.style === 'curls') {
    head.dome([0, 0.11, -0.006], 0.113, hair, { theta: 1.32, rot: [-0.22, 0, 0] })
    const curls: [number, number, number][] = [
      [0, 0.215, 0.02],
      [0.06, 0.2, 0.04],
      [-0.06, 0.2, 0.04],
      [0.03, 0.2, 0.08],
      [-0.035, 0.2, 0.08],
      [0.08, 0.17, -0.03],
      [-0.08, 0.17, -0.03],
      [0.0, 0.19, -0.07],
      [0.05, 0.15, -0.08],
      [-0.05, 0.15, -0.08],
    ]
    for (const c of curls) head.sphere(c, 0.038, hair, { seg: 10 })
  }
  if (L.style === 'swept') {
    head.dome([0, 0.11, -0.008], 0.112, hair, { theta: 1.3, rot: [-0.3, 0, 0] })
    head.box([0.025, 0.185, 0.07], [0.16, 0.04, 0.06], hair, 0.016, { rot: [0.55, 0, -0.28] })
  }
  if (L.style === 'grey') {
    head.dome([0, 0.1, -0.03], 0.11, hair, { theta: 1.2, rot: [-0.62, 0, 0] })
    for (const sx of [-1, 1]) head.sphere([0.085 * sx, 0.12, -0.02], 0.035, hair, { scale: [0.6, 1, 1.1], seg: 10 })
  }
  if (L.beard) head.sphere([0, 0.04, 0.035], 0.074, hair, { scale: [1.02, 0.78, 0.92], seg: 14 }).box([0, 0.052, 0.1], [0.03, 0.007, 0.008], '#6E4038', 0.002)

  const glasses = new Kit().box([0, 0.118, 0.106], [0.135, 0.012, 0.012], '#CED6DD', 0.004)
  for (const sx of [-1, 1]) {
    glasses.box([0.037 * sx, 0.112, 0.108], [0.056, 0.04, 0.006], '#E3EAF0', 0.008)
    glasses.box([0.07 * sx, 0.118, 0.055], [0.008, 0.01, 0.1], '#CED6DD', 0)
  }

  const sleeve = L.vest ? COAT : L.topColor
  const upper = new Kit().capsule([0, -0.13, 0], 0.052, 0.2, sleeve)
  const fore = new Kit().capsule([0, -0.11, 0], 0.046, 0.16, sleeve).cyl([0, -0.205, 0], 0.05, 0.035, L.top === 'coat' || L.vest ? COAT_SHADE : L.shade, { seg: 14 })
  const handKit = (c: string, cuff?: string) => {
    const k = new Kit()
      .box([0, -0.04, 0], [0.056, 0.075, 0.034], c, 0.014)
      .box([0, -0.092, 0.008], [0.05, 0.042, 0.026], c, 0.011, { rot: [0.32, 0, 0] })
      .capsule([0, -0.035, 0.026], 0.012, 0.028, c, { rot: [-0.7, 0, 0] })
    if (cuff) k.cyl([0, 0.0, 0], 0.044, 0.05, cuff, { seg: 14 })
    return k.build()
  }
  const thigh = new Kit().capsule([0, -0.21, 0], 0.068 * w, 0.3, L.pants)
  const shin = new Kit().capsule([0, -0.2, 0], 0.056 * w, 0.3, L.pants)
  const foot = new Kit().box([0, -0.035, 0.045], [0.1, 0.075, 0.24], L.shoes, 0.03).box([0, -0.068, 0.045], [0.104, 0.02, 0.246], '#1E2024', 0.008)

  const g: BodyGeo = {
    pelvis: pelvis.build(),
    torso: torso.build(),
    head: head.build(),
    glasses: glasses.build(),
    upper: upper.build(),
    fore: fore.build(),
    hand: handKit(L.skin),
    glove: handKit('#5E8FDA', '#5A89D2'),
    thigh: thigh.build(),
    shin: shin.build(),
    foot: foot.build(),
  }
  bodies.set(id, g)
  return g
}

// ── Props in hand ─────────────────────────────────────────────────────────

type PropName = 'pipette' | 'flask' | 'marker' | 'paper' | 'tube' | 'plate' | 'box' | 'rack'
let propCache: Record<PropName, BufferGeometry> | null = null
const UPZ: [number, number, number] = [Math.PI / 2, 0, 0]
function props() {
  if (propCache) return propCache
  const pipette = new Kit()
    .capsule([0, -0.06, 0.02], 0.017, 0.12, '#ECEFF2', { rot: UPZ })
    .cyl([0, -0.06, 0.11], 0.009, 0.035, '#D9623A', { rot: UPZ, seg: 10 })
    .cyl([0, -0.06, -0.095], 0.004, 0.07, '#F4F1E8', { rot: UPZ, r2: 0.013, seg: 10 })
  const flask = new Kit()
    .lathe(
      [
        [0, 0],
        [0.05, 0],
        [0.053, 0.01],
        [0.021, 0.09],
        [0.017, 0.12],
        [0.02, 0.126],
        [0, 0.126],
      ],
      '#D6E4EA',
      [0, -0.07, -0.11],
      { rot: UPZ, seg: 18 },
    )
    .lathe(
      [
        [0, 0.004],
        [0.047, 0.004],
        [0.032, 0.04],
        [0, 0.04],
      ],
      '#D9A441',
      [0, -0.07, -0.108],
      { rot: UPZ, seg: 18 },
    )
  const marker = new Kit().capsule([0, -0.1, 0.012], 0.012, 0.09, '#2F3540').cyl([0, -0.06, 0.012], 0.0135, 0.025, '#2E5BA6', { seg: 10 })
  const paper = new Kit()
    .box([0, -0.13, 0.025], [0.17, 0.24, 0.008], '#B08B5E', 0.004)
    .box([0, -0.135, 0.031], [0.15, 0.2, 0.004], '#F7F4EE', 0)
    .box([0, -0.24, 0.034], [0.06, 0.02, 0.012], '#8E9AA6', 0.003)
  for (let i = 0; i < 5; i++) paper.box([-0.01, -0.07 - i * 0.03, 0.034], [0.1, 0.006, 0.002], '#B7BEC6', 0)
  const tube = new Kit().cyl([0, -0.06, 0.02], 0.012, 0.075, '#E8DCB0', { rot: UPZ, seg: 10 }).cyl([0, -0.06, 0.062], 0.014, 0.014, '#3D7FD1', { rot: UPZ, seg: 10 })
  const plate = new Kit().box([0, -0.11, 0.025], [0.13, 0.088, 0.016], '#F3F1EC', 0.003)
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) plate.box([-0.05 + i * 0.02, -0.08 - j * 0.02, 0.034], [0.012, 0.012, 0.004], j < 2 ? '#C9A24A' : '#E8DFC5', 0)
  const box = new Kit()
    .box([0, 0.17, 0.3], [0.38, 0.26, 0.3], '#C9A47A', 0.02)
    .box([0, 0.302, 0.3], [0.06, 0.004, 0.302], '#E6D6B8', 0)
    .box([0.1, 0.2, 0.452], [0.12, 0.08, 0.004], '#F5F2EC', 0)
  const rack = new Kit().box([0, 0.12, 0.28], [0.32, 0.1, 0.22], '#3D7FD1', 0.015).box([0, 0.18, 0.28], [0.3, 0.02, 0.2], '#E4ECF2', 0.006)
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) rack.cyl([-0.125 + i * 0.05, 0.2, 0.2 + j * 0.05], 0.011, 0.02, '#F4F1E8', { seg: 8 })
  propCache = {
    pipette: pipette.build(),
    flask: flask.build(),
    marker: marker.build(),
    paper: paper.build(),
    tube: tube.build(),
    plate: plate.build(),
    box: box.build(),
    rack: rack.build(),
  }
  return propCache
}

// ── The rig ───────────────────────────────────────────────────────────────

const BONES = [
  ['root', null],
  ['pelvis', 'root'],
  ['torso', 'pelvis'],
  ['head', 'torso'],
  ['glasses', 'head'],
  ['shR', 'torso'],
  ['elR', 'shR'],
  ['haR', 'elR'],
  ['skinR', 'haR'],
  ['gloveR', 'haR'],
  ['shL', 'torso'],
  ['elL', 'shL'],
  ['haL', 'elL'],
  ['skinL', 'haL'],
  ['gloveL', 'haL'],
  ['hipR', 'pelvis'],
  ['knR', 'hipR'],
  ['anR', 'knR'],
  ['hipL', 'pelvis'],
  ['knL', 'hipL'],
  ['anL', 'knL'],
  ['pipette', 'haR'],
  ['flask', 'haR'],
  ['marker', 'haR'],
  ['paper', 'haL'],
  ['tube', 'haL'],
  ['plate', 'haL'],
  ['box', 'torso'],
  ['rack', 'torso'],
] as const
type BoneName = (typeof BONES)[number][0]
type Rig = Record<BoneName, Bone>

/** Each bone's offset from its parent. The figure faces +z, so its right side is -x. */
function offsets(w: number): Record<BoneName, [number, number, number]> {
  const o = {} as Record<BoneName, [number, number, number]>
  for (const [n] of BONES) o[n] = [0, 0, 0]
  o.pelvis = [0, HIP, 0]
  o.torso = [0, 0.1, 0]
  o.head = [0, 0.5, 0]
  o.shR = [-0.19 * w, 0.385, 0]
  o.shL = [0.19 * w, 0.385, 0]
  o.elR = o.elL = [0, -0.27, 0]
  o.haR = o.haL = [0, -0.235, 0]
  o.hipR = [-0.095 * w, -0.03, 0]
  o.hipL = [0.095 * w, -0.03, 0]
  o.knR = o.knL = [0, -0.42, 0]
  o.anR = o.anL = [0, -0.4, 0]
  return o
}

const skinned = new Map<string, BufferGeometry>()
/** All of a look's parts in one geometry, each vertex bound wholly to its bone. */
function figureGeo(look: string) {
  const hit = skinned.get(look)
  if (hit) return hit
  const L = LOOKS[look] ?? LOOKS.silva
  const g = bodyGeo(look)
  const p = props()
  const off = offsets(L.w)
  const at = {} as Record<BoneName, [number, number, number]>
  BONES.forEach(([n, parent], i) => {
    const o = off[n]
    const q = parent ? at[parent] : [0, 0, 0]
    at[n] = [q[0] + o[0], q[1] + o[1], q[2] + o[2]]
    void i
  })
  const parts: BufferGeometry[] = []
  const put = (b: BoneName, geo: BufferGeometry) => {
    const x = geo.clone()
    x.translate(at[b][0], at[b][1], at[b][2])
    const n = x.attributes.position.count
    const si = new Uint16Array(n * 4)
    const sw = new Float32Array(n * 4)
    const idx = BONES.findIndex(([k]) => k === b)
    for (let i = 0; i < n; i++) {
      si[i * 4] = idx
      sw[i * 4] = 1
    }
    x.setAttribute('skinIndex', new BufferAttribute(si, 4))
    x.setAttribute('skinWeight', new BufferAttribute(sw, 4))
    parts.push(x)
  }
  put('pelvis', g.pelvis)
  put('torso', g.torso)
  put('head', g.head)
  put('glasses', g.glasses)
  for (const s of ['R', 'L'] as const) {
    put(`sh${s}`, g.upper)
    put(`el${s}`, g.fore)
    put(`skin${s}`, g.hand)
    put(`glove${s}`, g.glove)
    put(`hip${s}`, g.thigh)
    put(`kn${s}`, g.shin)
    put(`an${s}`, g.foot)
  }
  for (const k of ALL_PROPS) put(k, p[k])
  const out = mergeGeometries(parts, false)
  for (const x of parts) x.dispose()
  out.computeBoundingSphere()
  skinned.set(look, out)
  return out
}

const HIT_GEO = new CapsuleGeometry(0.25, 1.12, 2, 8)
const HIT_MAT = new MeshBasicMaterial({ visible: false })

/** A fresh skeleton for one figure, bound to its look's shared geometry. */
function makeFigure(look: string) {
  const L = LOOKS[look] ?? LOOKS.silva
  const off = offsets(L.w)
  const rig = {} as Rig
  for (const [n, parent] of BONES) {
    const b = new Bone()
    b.name = n
    b.position.set(off[n][0], off[n][1], off[n][2])
    rig[n] = b
    if (parent) rig[parent].add(b)
  }
  const mesh = new SkinnedMesh(figureGeo(look), M.clay)
  mesh.add(rig.root)
  mesh.bind(new Skeleton(BONES.map(([n]) => rig[n])))
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.raycast = () => {}
  mesh.scale.setScalar(L.h)
  const hitbox = new Mesh(HIT_GEO, HIT_MAT)
  hitbox.position.y = 0.86
  mesh.add(hitbox)
  return { mesh, rig }
}

function useFigure(look: string) {
  const f = useMemo(() => makeFigure(look), [look])
  useEffect(() => () => f.mesh.skeleton.dispose(), [f])
  return f
}

// ── Poses ─────────────────────────────────────────────────────────────────

const N = 25
const Y = 0, PZ = 1, PY = 2, TX = 3, TY = 4, TZ = 5, HX = 6, HY = 7, HZ = 8
const SRX = 9, SRZ = 10, ERX = 11, HRX = 12, HRZ = 13
const SLX = 14, SLZ = 15, ELX = 16, HLX = 17, HLZ = 18
const LRX = 19, KR = 20, AR = 21, LLX = 22, KL = 23, AL = 24

const TAU = Math.PI * 2
const wave = (s: number, period: number, ph = 0) => Math.sin((s / period) * TAU + ph)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const bell = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x))
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

function base(o: Float32Array) {
  o.fill(0)
  o[SRX] = 0.05
  o[SRZ] = -0.07
  o[ERX] = -0.16
  o[SLX] = 0.05
  o[SLZ] = 0.07
  o[ELX] = -0.16
  o[KR] = 0.04
  o[KL] = 0.04
}

function seated(o: Float32Array) {
  o[Y] = SEAT - HIP
  o[LRX] = o[LLX] = -1.48
  o[KR] = o[KL] = 1.5
  o[AR] = o[AL] = 0.02
}

function carry(o: Float32Array) {
  o[SRX] = -0.72
  o[ERX] = -0.95
  o[SRZ] = 0.2
  o[SLX] = -0.72
  o[ELX] = -0.95
  o[SLZ] = -0.2
  o[HRZ] = -0.3
  o[HLZ] = 0.3
}

function walk(o: Float32Array, ph: number, holding: boolean) {
  const sn = Math.sin(ph)
  const cs = Math.cos(ph)
  o[LRX] = -0.42 * sn
  o[LLX] = 0.42 * sn
  o[KR] = 0.06 + 0.82 * Math.max(0, cs) ** 1.5
  o[KL] = 0.06 + 0.82 * Math.max(0, -cs) ** 1.5
  o[AR] = -0.26 * Math.max(0, sn) + 0.32 * Math.max(0, -sn) * Math.max(0, cs)
  o[AL] = -0.26 * Math.max(0, -sn) + 0.32 * Math.max(0, sn) * Math.max(0, -cs)
  o[Y] = 0.024 * cs * cs - 0.02
  o[PZ] = 0.035 * sn
  o[PY] = 0.08 * sn
  o[TY] = -0.07 * sn
  o[TX] = 0.05
  if (holding) carry(o)
  else {
    o[SRX] = 0.34 * sn
    o[SLX] = -0.34 * sn
    o[ERX] = -0.22 - 0.16 * Math.max(0, -sn)
    o[ELX] = -0.22 - 0.16 * Math.max(0, sn)
  }
}

/** What the hands do at a station. `s` is feed seconds; `e` ms since arriving. */
function work(o: Float32Array, act: Act, s: number, e: number, ph: number, still: boolean, ms = 1200) {
  const w = (p: number, q = 0) => (still ? 0 : wave(s, p, ph + q))
  switch (act) {
    case 'pipette': {
      const press = still ? 0 : Math.max(0, wave(s, 1.7, ph)) ** 8
      o[SRX] = -0.6
      o[SRZ] = -0.08
      o[ERX] = -1.12 + 0.18 * press
      o[HRX] = 0.12 - 0.22 * press
      o[SLX] = -0.45
      o[SLZ] = 0.24
      o[ELX] = -1.25
      o[HLX] = 0.2
      o[TX] = 0.13
      o[HX] = 0.36 + 0.03 * w(5.3)
      o[HY] = 0.07 * w(7.1)
      break
    }
    case 'swirl':
      o[SRX] = -0.72
      o[SRZ] = -0.04
      o[ERX] = -1.1
      o[HRX] = still ? 0 : 0.24 * Math.sin(s * TAU * 1.5)
      o[HRZ] = still ? 0 : 0.24 * Math.cos(s * TAU * 1.5)
      o[SLX] = -0.5
      o[ELX] = -0.62
      o[TX] = 0.08
      o[HX] = 0.32
      break
    case 'type': {
      const tap = (q: number) => (still ? 0 : 0.07 * Math.max(0, Math.sin(s * TAU * 3.1 + q)) * (wave(s, 6, 0) > -0.6 ? 1 : 0))
      o[SRX] = -0.55
      o[ERX] = -0.95
      o[HRX] = 0.14 + tap(0)
      o[SLX] = -0.55
      o[ELX] = -0.95
      o[HLX] = 0.14 + tap(2.1)
      o[SRZ] = -0.1
      o[SLZ] = 0.1
      o[TX] = 0.07
      o[HX] = 0.13 + 0.04 * w(9)
      o[HY] = 0.12 * w(13, 1)
      break
    }
    case 'read':
      o[SRX] = -0.42
      o[ERX] = -1.4
      o[SRZ] = 0.16
      o[SLX] = -0.46
      o[ELX] = -1.36
      o[SLZ] = -0.14
      o[HLZ] = 0.1 * w(7)
      o[HX] = 0.44
      o[HY] = 0.05 * w(6)
      break
    case 'scope':
      o[TX] = 0.44
      o[HX] = 0.32
      o[SRX] = -0.7
      o[ERX] = -0.55
      o[SLX] = -0.7
      o[ELX] = -0.55
      o[HRZ] = 0.22 * w(2.4)
      o[HLZ] = -0.12 * w(3.1, 1)
      o[LRX] = -0.06
      break
    case 'adjust':
      o[SRX] = -1.2 + 0.1 * w(3.2)
      o[ERX] = -0.5
      o[HRX] = -0.2
      o[HRZ] = 0.3 * w(1.6)
      o[SLX] = -0.35
      o[ELX] = -0.55
      o[TX] = 0.08
      o[HX] = 0.16 + 0.08 * w(4.4)
      break
    case 'cabinet':
      o[SRX] = -1.18
      o[ERX] = -0.32 + 0.1 * w(1.3)
      o[SLX] = -1.12
      o[ELX] = -0.38
      o[SRZ] = 0.06
      o[SLZ] = -0.06
      o[HRZ] = 0.26 * w(1.1)
      o[TX] = 0.2
      o[HX] = 0.28
      break
    case 'freezer': {
      const look = still ? 0 : clamp01(wave(s, 5, ph) * 2)
      o[SRX] = -1.42 + 0.14 * w(2.6)
      o[ERX] = -0.3
      o[SLX] = -0.6
      o[ELX] = -1.2
      o[SLZ] = -0.08
      o[TX] = 0.1
      o[HX] = 0.05 + 0.38 * look
      break
    }
    case 'write':
      o[SRX] = -2.02 + 0.08 * w(0.9)
      o[SRZ] = -0.14 + 0.16 * w(2.3)
      o[ERX] = -0.35
      o[HRX] = -0.3
      o[SLX] = -0.1
      o[ELX] = -0.6
      o[HX] = -0.12
      o[PZ] = 0.03 * w(8)
      break
    case 'reach':
      o[SRX] = -1.35 + 0.1 * w(2.2)
      o[ERX] = -0.3
      o[SLX] = -0.2
      o[ELX] = -0.3
      o[TX] = 0.05
      o[HX] = -0.04
      break
    case 'count':
      o[SRX] = -1.3
      o[SRZ] = -0.25 + 0.32 * w(3)
      o[ERX] = -0.2
      o[SLX] = -0.55
      o[ELX] = -1.15
      o[SLZ] = -0.06
      o[HY] = -0.3 * w(3)
      o[HX] = -0.05
      break
    case 'look':
      o[TX] = 0.1
      o[HX] = 0.18 + 0.06 * Math.max(0, w(3.4))
      o[SRX] = -0.95
      o[SRZ] = 0.1
      o[ERX] = -2.0
      o[SLX] = -0.5
      o[SLZ] = -0.16
      o[ELX] = -1.55
      break
    case 'pickup':
    case 'place': {
      // A bend at the knees and hips, down to the floor or the shelf, and back up.
      const span = act === 'pickup' ? ms * 0.9 : 900
      const k = still ? 0 : bell(e / span)
      o[TX] = 0.62 * k
      o[LRX] = o[LLX] = -0.5 * k
      o[KR] = o[KL] = 0.04 + 0.9 * k
      o[AR] = o[AL] = -0.35 * k
      o[Y] = -0.17 * k
      o[SRX] = -0.9 * k
      o[SLX] = -0.9 * k
      o[ERX] = o[ELX] = -0.3
      o[HX] = 0.25 * k
      break
    }
    default:
      break
  }
}

/** Gloves and safety glasses go on for bench work. */
const GLOVES = new Set<Act>(['pipette', 'swirl', 'cabinet', 'adjust', 'freezer'])
const GLASSES = new Set<Act>(['pipette', 'swirl', 'cabinet', 'adjust', 'reach'])
const HAND_PROP: Partial<Record<Act, PropName[]>> = {
  pipette: ['pipette', 'tube'],
  swirl: ['flask'],
  write: ['marker'],
  read: ['paper'],
  count: ['paper'],
  freezer: ['paper'],
}

const ALL_PROPS: PropName[] = ['pipette', 'flask', 'marker', 'paper', 'tube', 'plate', 'box', 'rack']

function applyPose(r: Rig, P: Float32Array) {
  r.pelvis.position.y = HIP + P[Y]
  r.pelvis.rotation.set(0, P[PY], P[PZ])
  r.torso.rotation.set(P[TX], P[TY], P[TZ])
  r.head.rotation.set(P[HX], P[HY], P[HZ])
  r.shR.rotation.set(P[SRX], 0, P[SRZ])
  r.elR.rotation.x = P[ERX]
  r.haR.rotation.set(P[HRX], 0, P[HRZ])
  r.shL.rotation.set(P[SLX], 0, P[SLZ])
  r.elL.rotation.x = P[ELX]
  r.haL.rotation.set(P[HLX], 0, P[HLZ])
  r.hipR.rotation.x = P[LRX]
  r.knR.rotation.x = P[KR]
  r.anR.rotation.x = P[AR]
  r.hipL.rotation.x = P[LLX]
  r.knL.rotation.x = P[KL]
  r.anL.rotation.x = P[AL]
}

/** Parts that come and go (gloves, glasses, props) are bones scaled to nothing when not in use. */
function gear(r: Rig, gloves: boolean, glasses: boolean, shown: ReadonlySet<PropName>) {
  r.skinR.scale.setScalar(gloves ? 0 : 1)
  r.skinL.scale.setScalar(gloves ? 0 : 1)
  r.gloveR.scale.setScalar(gloves ? 1 : 0)
  r.gloveL.scale.setScalar(gloves ? 1 : 0)
  r.glasses.scale.setScalar(glasses ? 1 : 0)
  for (const k of ALL_PROPS) r[k].scale.setScalar(shown.has(k) ? 1 : 0)
}

// ── Lab members ───────────────────────────────────────────────────────────

const SPEED = 0.00118 // units per feed ms, an unhurried walk
const STRIDE = 1.25
const INTAKE = mapPoint('I')

interface Walker {
  task: string
  plan: Step[]
  step: number
  stepAt: number
  path: V2[] | null
  seg: number
  segS: number
  x: number
  z: number
  yaw: number
  side: number
  phase: number
  last: number
}

const sendKinds = new Set(['request', 'pushback', 'paper'])
const shownSet = new Set<PropName>()
const hv = new Vector3()

function startStep(w: Walker, i: number, t: number, still: boolean) {
  w.step = i
  const s = SPOTS[w.plan[i]?.at]
  if (!s) {
    w.path = null
    w.stepAt = t
    return
  }
  const d = Math.hypot(s.p[0] - w.x, s.p[1] - w.z)
  if (d < 0.04 || still) {
    w.x = s.p[0]
    w.z = s.p[1]
    w.path = null
    w.stepAt = t
  } else {
    w.path = walkPath([w.x, w.z], s.p)
    w.seg = 1
    w.segS = 0
  }
}

function Researcher({ id }: { id: string }) {
  const { mesh, rig } = useFigure(id)
  const st = useRef<Walker | null>(null)
  const P = useMemo(() => new Float32Array(N), [])
  const T = useMemo(() => new Float32Array(N), [])
  const still = useMemo(reducedMotion, [])
  const ph = useMemo(() => (id.charCodeAt(0) * 1.37) % TAU, [id])
  const breath = useRef(0)
  useFlow(e => {
    if (e.type === 'reset') st.current = null
  })

  useFrame((_, dt) => {
    const t = now()
    const w0 = feed.getWorld()
    const me = w0.researchers.find(r => r.id === id)
    if (!me) return
    let w = st.current
    if (!w) {
      // Arriving mid-story: already at the last step of whatever they are doing.
      const plan = planFor(id, me.task)
      const last = plan[plan.length - 1]
      const s = SPOTS[last.at]
      w = { task: me.task, plan, step: plan.length - 1, stepAt: t - 60000, path: null, seg: 1, segS: 0, x: s.p[0], z: s.p[1], yaw: s.yaw, side: 0, phase: 0, last: t }
      st.current = w
    }
    const fdt = Math.min(120, Math.max(0, t - w.last))
    w.last = t
    if (me.task !== w.task) {
      w.task = me.task
      w.plan = planFor(id, me.task)
      startStep(w, 0, t, still)
    }

    // Sending: stop, hold the thing up, throw it.
    let present = -1
    for (const p of w0.packets) {
      if (p.from !== `r:${id}` || !sendKinds.has(p.kind)) continue
      const k = progress(p, t)
      if (k < SEND.hold + 0.12) present = Math.max(present, k)
    }

    const step = w.plan[w.step]
    const spot = SPOTS[step?.at] ?? SPOTS['park.shelf']
    let walking = false
    let heading = w.yaw
    if (w.path && present < 0) {
      let left = SPEED * fdt
      while (left > 0 && w.path) {
        const a = w.path[w.seg - 1]
        const b = w.path[w.seg]
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (len < 1e-4 || w.segS + left >= len) {
          left -= Math.max(0, len - w.segS)
          w.seg++
          w.segS = 0
          if (w.seg >= w.path.length) {
            w.x = b[0]
            w.z = b[1]
            w.path = null
            w.stepAt = t
            break
          }
        } else {
          w.segS += left
          left = 0
          const u = w.segS / len
          w.x = a[0] + (b[0] - a[0]) * u
          w.z = a[1] + (b[1] - a[1]) * u
          heading = Math.atan2(b[0] - a[0], b[1] - a[1])
        }
      }
      if (w.path) {
        walking = true
        w.phase += ((SPEED * fdt) / STRIDE) * TAU
        const a = w.path[w.seg - 1]
        const b = w.path[Math.min(w.seg, w.path.length - 1)]
        heading = Math.atan2(b[0] - a[0], b[1] - a[1])
      }
    } else if (w.path) {
      const a = w.path[w.seg - 1]
      const b = w.path[Math.min(w.seg, w.path.length - 1)]
      heading = Math.atan2(b[0] - a[0], b[1] - a[1])
    }
    const arrived = !w.path
    const e = t - w.stepAt
    if (arrived && step?.ms !== undefined && w.step < w.plan.length - 1 && e > step.ms) startStep(w, w.step + 1, t, still)

    // Passing politely: anyone walking keeps to their right when someone is close.
    let sideT = 0
    if (walking) {
      for (const [oid, o] of fx.people) {
        if (oid === id) continue
        const d = Math.hypot(o.pos.x - w.x, o.pos.z - w.z)
        if (d < 0.9) sideT = Math.max(sideT, 0.3 * (1 - d / 0.9))
      }
    }
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 10)
    w.side += (sideT - w.side) * k

    // Facing: along the walk, toward the station on arrival, half toward the map while sending.
    let yawT = walking ? heading : spot.yaw
    if (present >= 0) yawT = spot.yaw + wrap(Math.atan2(INTAKE[0] - w.x, INTAKE[2] - w.z) - spot.yaw) * 0.45
    w.yaw += wrap(yawT - w.yaw) * (still ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * (walking ? 7 : 4)))

    // Target pose.
    const s = t / 1000
    base(T)
    const sit = arrived && !!spot.sit
    const holdProp = step?.hold && (walking || (arrived && e < 650)) ? step.hold : step?.gets && arrived && e > (step.ms ?? 1200) * 0.5 ? step.gets : undefined
    const act: Act = arrived ? (step?.act ?? 'stand') : 'stand'
    if (walking) walk(T, w.phase, !!holdProp)
    else {
      if (sit) seated(T)
      work(T, act, s, e, ph, still, step?.ms)
      if (holdProp && act !== 'place' && act !== 'pickup') carry(T)
      if (holdProp && act === 'pickup' && e > (step?.ms ?? 1200) * 0.55) carry(T)
      if (!still && !sit) {
        // Weight shifts, and the odd glance at a colleague.
        T[PZ] += 0.03 * wave(s, 7.5, ph)
        T[LRX] += 0.03 * wave(s, 7.5, ph)
        T[LLX] -= 0.03 * wave(s, 7.5, ph)
      }
      if (!still && act !== 'scope' && act !== 'write') {
        const glance = Math.max(0, wave(s, 11, ph * 2)) ** 4
        if (glance > 0.01) {
          let best = 5.0
          let rel = 0
          for (const [oid, o] of fx.people) {
            if (oid === id || oid === 'gm') continue
            const d = Math.hypot(o.pos.x - w.x, o.pos.z - w.z)
            if (d < best) {
              best = d
              rel = wrap(Math.atan2(o.pos.x - w.x, o.pos.z - w.z) - w.yaw)
            }
          }
          if (best < 5) {
            T[HY] += (Math.max(-1.1, Math.min(1.1, rel)) * 0.8 - T[HY]) * glance
            T[HX] *= 1 - glance * 0.7
          }
        }
      }
    }

    if (present >= 0) {
      // Take it out, hold it up, throw it toward the map.
      const up = clamp01(present / SEND.hold)
      T[SRX] = -0.4 - 1.9 * up
      T[SRZ] = -0.12
      T[ERX] = -0.9 + 0.55 * up
      T[HRX] = -0.3
      T[HX] = -0.2 * up
      T[TX] = sit ? T[TX] : -0.04
      if (present > SEND.hold) T[SRX] = -2.5
    }
    const re = fx.reactions.get(id)
    if (re && re.kind !== 'send' && present < 0) {
      const el = t - re.at
      if ((re.kind === 'accept' || re.kind === 'refine') && el >= 0 && el < (re.kind === 'accept' ? 2300 : 1800)) {
        T[SRX] = -0.78
        T[ERX] = -0.95
        T[SLX] = -0.78
        T[ELX] = -0.95
        T[SRZ] = 0.14
        T[SLZ] = -0.14
        T[HX] = 0.28 + (re.kind === 'accept' && !still ? 0.1 * bell(el / 500) : 0)
        T[HZ] = re.kind === 'refine' ? 0.18 * bell(el / 1400) : 0
      } else if (re.kind === 'reject' && el >= 0 && el < 1900) {
        const sl = clamp01((el - 350) / 300)
        T[HX] = 0.5 * sl
        T[TX] += 0.08 * sl
        T[SRX] = 0.08
        T[SLX] = 0.08
        T[HY] = still ? 0 : 0.22 * Math.sin(el / 110) * (1 - clamp01(el / 1500)) * sl
      } else if (re.kind === 'hold' && el >= 0 && el < 1500) {
        T[HY] = wrap(Math.atan2(INTAKE[0] - w.x, INTAKE[2] - w.z) - w.yaw) * 0.6
        T[HX] = -0.1
      }
    }

    // Ease toward the target; the legs follow faster so the walk keeps its swing.
    const kb = still ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 11)
    const kl = still ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 20)
    for (let i = 0; i < N; i++) P[i] += (T[i] - P[i]) * (i >= LRX || i === Y ? kl : kb)
    applyPose(rig, P)

    breath.current += Math.min(dt, 0.05)
    const b = still ? 0 : Math.sin((breath.current * TAU) / 4.2 + ph)
    rig.torso.scale.set(1 + 0.008 * b, 1 + 0.012 * b, 1 + 0.008 * b)

    const rx = -Math.cos(w.yaw)
    const rz = Math.sin(w.yaw)
    mesh.position.set(w.x + rx * w.side, 0, w.z + rz * w.side)
    mesh.rotation.y = w.yaw

    shownSet.clear()
    const gloves = GLOVES.has(act) && !walking
    for (const n of (!walking && HAND_PROP[act]) || []) shownSet.add(n)
    if (holdProp) {
      shownSet.delete('paper')
      shownSet.add(holdProp)
    }
    if (present >= 0 || (re && re.kind !== 'send' && t - re.at < 2300)) {
      shownSet.delete('pipette')
      shownSet.delete('flask')
      shownSet.delete('marker')
    }
    gear(rig, gloves, GLASSES.has(act) && !walking, shownSet)
    if (id === 'park') fx.freezerOpen = arrived && act === 'freezer' ? 1 : 0

    const me3 = person(id)
    me3.pos.set(mesh.position.x, 0, mesh.position.z)
    me3.yaw = w.yaw
    me3.walking = walking
    me3.seated = sit
    rig.haR.getWorldPosition(me3.hand)
    rig.head.getWorldPosition(hv)
    me3.head.set(hv.x, hv.y + 0.16, hv.z)
  })

  return (
    <Pick id={`r:${id}`}>
      <primitive object={mesh} />
    </Pick>
  )
}

export function LabPeople() {
  return (
    <>
      {['ortiz', 'okafor', 'raman', 'silva', 'park'].map(id => (
        <Researcher key={id} id={id} />
      ))}
    </>
  )
}

// ── The grant manager, standing at their station on the map ─────────────

export function GrantManagerFigure({ at }: { at: [number, number, number] }) {
  const { mesh, rig } = useFigure('gm')
  const P = useMemo(() => new Float32Array(N), [])
  const T = useMemo(() => new Float32Array(N), [])
  const still = useMemo(reducedMotion, [])
  useFrame((_, dt) => {
    const t = now()
    const w = feed.getWorld()
    const s = t / 1000
    base(T)
    const waiting = w.holds.some(h => h.open)
    let stamp = -1
    for (const p of w.packets) if (p.kind === 'decision' && p.from === 'p:grant_manager') stamp = Math.max(stamp, progress(p, t))
    if (waiting) {
      work(T, 'read', s, 0, 0.7, still)
      T[HY] = still ? 0 : 0.35 * wave(s, 9, 1)
    } else if (!still) {
      T[PZ] = 0.03 * wave(s, 8, 2)
      T[HY] = -0.5 * Math.max(0, wave(s, 10, 0.5)) ** 3
    }
    if (stamp >= 0 && stamp < 0.4) {
      const k = stamp / 0.4
      T[SRX] = -1.2 + 0.8 * bell(k)
      T[ERX] = -0.6
      T[HX] = 0.35
    }
    const kb = still ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 9)
    for (let i = 0; i < N; i++) P[i] += (T[i] - P[i]) * kb
    applyPose(rig, P)
    mesh.position.set(at[0], at[1], at[2])
    mesh.rotation.y = 0
    shownSet.clear()
    if (waiting) shownSet.add('paper')
    gear(rig, false, false, shownSet)
    const me = person('gm')
    me.pos.set(at[0], at[1], at[2])
    rig.head.getWorldPosition(hv)
    me.head.set(hv.x, hv.y + 0.16, hv.z)
  })
  return (
    <Pick id="p:grant_manager">
      <primitive object={mesh} />
    </Pick>
  )
}
