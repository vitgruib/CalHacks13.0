// One jointed clay figure. The body is a single skinned mesh over a bone
// chain (body, hips, coat, thighs, knees, ankles, spine, head, ponytail,
// shoulders, elbows, wrists), so a whole person costs one draw call; hands
// and whatever they hold hang off the wrist bones as small meshes of their
// own. Each person has their own clothes, hair and skin tone.

import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  Bone,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Uint16BufferAttribute,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cylinder, lathe, merge, placed, roundedBox } from './batch'
import type { Act, Body, Carry, Prop } from './crowd'
import type { V3 } from './layout'
import { M } from './mats'
import { reducedMotion } from './store'

// ── Looks ────────────────────────────────────────────────────────────────

type Hair = 'bob' | 'crop' | 'ponytail' | 'curls' | 'sidepart' | 'short'
interface Look {
  skin: string
  hair: string
  style: Hair
  beard?: boolean
  shirt: string
  trousers: string
  shoes: string
  outer: 'coat' | 'blazer'
  outerColor: string
  scale: number
}

const COAT = '#F1EEE8'
export const LOOKS: Record<string, Look> = {
  ortiz: { skin: '#C68E6A', hair: '#8F8A85', style: 'bob', shirt: '#EDE3D3', trousers: '#3B3A40', shoes: '#2E2A27', outer: 'blazer', outerColor: '#3F5D66', scale: 0.98 },
  okafor: { skin: '#5E3B2A', hair: '#1E1B19', style: 'crop', beard: true, shirt: '#B9CDE0', trousers: '#3A3F47', shoes: '#E6E2DA', outer: 'coat', outerColor: COAT, scale: 1.05 },
  raman: { skin: '#9A6342', hair: '#231A16', style: 'ponytail', shirt: '#D8A945', trousers: '#3D4A63', shoes: '#5B6B7C', outer: 'coat', outerColor: COAT, scale: 0.95 },
  silva: { skin: '#D7A783', hair: '#4A3426', style: 'curls', shirt: '#B35F3E', trousers: '#8E7F66', shoes: '#2E2A27', outer: 'coat', outerColor: COAT, scale: 1.0 },
  park: { skin: '#EBC6A2', hair: '#151517', style: 'sidepart', shirt: '#5F8A6A', trousers: '#2B2B2E', shoes: '#C8CED6', outer: 'coat', outerColor: COAT, scale: 0.99 },
  gm: { skin: '#B07A55', hair: '#C9C4BE', style: 'short', shirt: '#E9EEF2', trousers: '#2E3540', shoes: '#2E2A27', outer: 'blazer', outerColor: '#2F3E58', scale: 1.0 },
}

// ── Parts, painted with vertex colours ───────────────────────────────────

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
const part = (geo: BufferGeometry, hex: string, p: V3, rot?: V3, scale?: V3) => paint(placed(geo, p, rot, scale), hex)
const shade = (hex: string, k: number) => '#' + new Color(hex).offsetHSL(0, 0, k).getHexString()
const sphere = (r: number, w = 18, h = 12, t0 = 0, tl = Math.PI) => new SphereGeometry(r, w, h, 0, Math.PI * 2, t0, tl)
const capsule = (r: number, l: number) => new CapsuleGeometry(r, l, 4, 12)

export const HIP = 0.86
const THIGH = 0.39
const SHIN = 0.4
const SPINE = 0.04
const NECK = 0.6
const SHOULDER: [number, number] = [0.2, 0.46]
const UPPER = 0.27
const FORE = 0.25

function hairParts(L: Look): BufferGeometry[] {
  const hex = L.hair
  // A shell over the skull, tilted back so the hairline sits above the brow.
  const cap = (tl: number, tilt: number) => part(sphere(0.124, 22, 12, 0, tl), hex, [0, 0.118, -0.004], [tilt, 0, 0], [0.97, 1.0, 1.03])
  const out: BufferGeometry[] = []
  switch (L.style) {
    case 'bob':
      out.push(
        cap(1.9, -0.5),
        part(roundedBox([0.05, 0.15, 0.16], 0.024), hex, [0.102, 0.062, -0.02]),
        part(roundedBox([0.05, 0.15, 0.16], 0.024), hex, [-0.102, 0.062, -0.02]),
        part(roundedBox([0.2, 0.15, 0.06], 0.026), hex, [0, 0.07, -0.09]),
        part(roundedBox([0.17, 0.045, 0.05], 0.02), hex, [0.025, 0.205, 0.075], [-0.55, 0, 0.14]),
      )
      break
    case 'crop':
      out.push(cap(1.45, -0.25))
      break
    case 'ponytail':
      out.push(cap(1.75, -0.4), part(sphere(0.034), hex, [0, 0.16, -0.118]))
      break
    case 'curls': {
      out.push(cap(1.55, -0.35))
      const ring: V3[] = [
        [0, 0.238, 0.02],
        [0.062, 0.226, 0.055],
        [-0.062, 0.226, 0.055],
        [0.088, 0.205, -0.03],
        [-0.088, 0.205, -0.03],
        [0, 0.22, -0.075],
        [0.035, 0.196, 0.096],
        [-0.035, 0.196, 0.096],
        [0.06, 0.15, -0.1],
        [-0.06, 0.15, -0.1],
      ]
      for (const p of ring) out.push(part(sphere(0.046, 10, 8), hex, p))
      break
    }
    case 'sidepart':
      out.push(cap(1.5, -0.3), part(roundedBox([0.19, 0.05, 0.15], 0.024), hex, [0.018, 0.218, 0.035], [-0.12, 0, 0.18]))
      break
    case 'short':
      out.push(cap(1.42, -0.3))
      break
  }
  if (L.beard) out.push(part(roundedBox([0.16, 0.075, 0.085], 0.032), hex, [0, 0.042, 0.066]))
  return out
}

// ── The rig ──────────────────────────────────────────────────────────────

export interface Rig {
  root: Group
  body: Bone
  hips: Bone
  coat: Bone
  thighL: Bone
  thighR: Bone
  kneeL: Bone
  kneeR: Bone
  ankleL: Bone
  ankleR: Bone
  spine: Bone
  head: Bone
  pony: Bone | null
  shR: Bone
  shL: Bone
  elR: Bone
  elL: Bone
  wrR: Bone
  wrL: Bone
  handR: Mesh
  handL: Mesh
  specs: Mesh
  props: Record<Exclude<Prop, null> | 'box' | 'rack', Object3D>
}

const skinMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: DoubleSide })
const specsMat = new MeshStandardMaterial({ color: '#D9E6EF', roughness: 0.15, transparent: true, opacity: 0.7 })
const specsGeo = merge([placed(roundedBox([0.205, 0.05, 0.016], 0.008), [0, 0.125, 0.108]), placed(roundedBox([0.008, 0.012, 0.11], 0.003), [0.102, 0.128, 0.052]), placed(roundedBox([0.008, 0.012, 0.11], 0.003), [-0.102, 0.128, 0.052])])
const proxyGeo = new CylinderGeometry(0.3, 0.3, 1.8, 8).translate(0, 0.9, 0)

// Things people hold, shared by everyone.
const PROP = {
  pipette: merge([part(cylinder(0.015, 0.15, 10), '#E8EDF1', [0, -0.07, 0]), part(cylinder(0.019, 0.024, 10), '#5B8FC9', [0, 0.016, 0]), part(cylinder(0.002, 0.055, 8, 0.008), '#E9D58A', [0, -0.172, 0])]),
  flask: merge([
    part(
      lathe(
        [
          [0.001, 0],
          [0.056, 0],
          [0.058, 0.012],
          [0.022, 0.1],
          [0.018, 0.14],
          [0.021, 0.152],
        ],
        18,
      ),
      '#DCE7EE',
      [0, 0, 0],
    ),
    part(cylinder(0.046, 0.034, 16, 0.03), '#E3C46A', [0, 0.02, 0]),
  ]),
  marker: merge([part(cylinder(0.011, 0.1, 10), '#2E5BA6', [0, 0, 0]), part(cylinder(0.012, 0.03, 10), '#1C232C', [0, 0.06, 0])]),
  plate: merge([part(cylinder(0.062, 0.016, 20), '#E8EEF2', [0, 0, 0]), part(cylinder(0.056, 0.01, 20), '#D9A441', [0, 0.002, 0])]),
  clipboard: merge([part(roundedBox([0.17, 0.23, 0.012], 0.005), '#B98F66', [0, 0, 0]), part(roundedBox([0.145, 0.19, 0.004], 0.002), '#F7F4EF', [0, -0.01, 0.008]), part(roundedBox([0.06, 0.02, 0.012], 0.004), '#9AA3AD', [0, 0.11, 0.01])]),
  papers: merge([part(roundedBox([0.15, 0.2, 0.004], 0.002), '#F7F4EF', [0, 0, 0]), part(roundedBox([0.15, 0.2, 0.004], 0.002), '#ECE7DF', [0.01, -0.006, -0.006], [0, 0, 0.08])]),
  box: merge([part(roundedBox([0.36, 0.24, 0.3], 0.02), '#C49A6C', [0, 0, 0]), part(roundedBox([0.07, 0.008, 0.302], 0.002), '#D9C29A', [0, 0.121, 0])]),
  rack: merge([part(roundedBox([0.24, 0.08, 0.15], 0.012), '#2A313A', [0, 0, 0]), part(roundedBox([0.245, 0.03, 0.155], 0.01), '#3D9C8F', [0, 0.05, 0])]),
}
const propMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })

interface Kit {
  geo: BufferGeometry
  hand: BufferGeometry
  glove: BufferGeometry
  pony: boolean
}
const kits = new Map<string, Kit>()

// Bone indices into the skeleton, in the order they're created.
const B = { body: 0, hips: 1, coat: 2, thighL: 3, kneeL: 4, ankleL: 5, thighR: 6, kneeR: 7, ankleR: 8, spine: 9, head: 10, pony: 11, shL: 12, elL: 13, wrL: 14, shR: 15, elR: 16, wrR: 17 }
// Rest positions in the figure's space, with every joint straight.
const REST: Record<keyof typeof B, V3> = (() => {
  const hy = HIP
  const sy = HIP + SPINE
  return {
    body: [0, hy, 0],
    hips: [0, hy, 0],
    coat: [0, hy, 0],
    thighL: [0.09, hy - 0.02, 0],
    kneeL: [0.09, hy - 0.02 - THIGH, 0],
    ankleL: [0.09, hy - 0.02 - THIGH - SHIN, 0],
    thighR: [-0.09, hy - 0.02, 0],
    kneeR: [-0.09, hy - 0.02 - THIGH, 0],
    ankleR: [-0.09, hy - 0.02 - THIGH - SHIN, 0],
    spine: [0, sy, 0],
    head: [0, sy + NECK, 0],
    pony: [0, sy + NECK + 0.16, -0.125],
    shL: [SHOULDER[0], sy + SHOULDER[1], 0],
    elL: [SHOULDER[0], sy + SHOULDER[1] - UPPER, 0],
    wrL: [SHOULDER[0], sy + SHOULDER[1] - UPPER - FORE, 0],
    shR: [-SHOULDER[0], sy + SHOULDER[1], 0],
    elR: [-SHOULDER[0], sy + SHOULDER[1] - UPPER, 0],
    wrR: [-SHOULDER[0], sy + SHOULDER[1] - UPPER - FORE, 0],
  }
})()

/** Parts given in a bone's own space, moved to the rest pose and tied to that bone. */
function bound(bone: keyof typeof B, parts: BufferGeometry[]) {
  const [x, y, z] = REST[bone]
  return parts.map(g => {
    g.translate(x, y, z)
    const n = g.attributes.position.count
    const idx = new Uint16Array(n * 4)
    const w = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      idx[i * 4] = B[bone]
      w[i * 4] = 1
    }
    g.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4))
    g.setAttribute('skinWeight', new Float32BufferAttribute(w, 4))
    return g
  })
}

function kitFor(id: string): Kit {
  let k = kits.get(id)
  if (k) return k
  const L = LOOKS[id] ?? LOOKS.park
  const coat = L.outer === 'coat'
  const outer = L.outerColor
  const seam = shade(outer, -0.07)
  const cuff = shade(outer, -0.045)
  const all: BufferGeometry[] = []

  all.push(...bound('hips', [part(roundedBox([0.3, 0.17, 0.2], 0.06), L.trousers, [0, 0.02, 0]), part(roundedBox([0.31, 0.03, 0.21], 0.012), shade(L.trousers, -0.05), [0, 0.1, 0])]))

  // A lab coat falls to the knee and hangs open at the front; a blazer stops at the hip.
  const hem = coat ? -0.44 : -0.13
  const skirt = [
    part(
      lathe(
        [
          [0.157, 0.11],
          [0.166, 0.02],
          [0.18, hem * 0.45],
          [0.196, hem],
        ],
        28,
      ),
      outer,
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 0.8],
    ),
  ]
  if (coat) {
    skirt.push(
      part(roundedBox([0.09, 0.085, 0.014], 0.006), seam, [0.105, -0.19, 0.142], [0.08, 0.42, 0]),
      part(roundedBox([0.09, 0.085, 0.014], 0.006), seam, [-0.105, -0.19, 0.142], [0.08, -0.42, 0]),
      part(roundedBox([0.012, -hem - 0.02, 0.012], 0.004), seam, [0, hem / 2 + 0.03, 0.155], [0.05, 0, 0]),
    )
  }
  all.push(...bound('coat', skirt))

  for (const side of ['L', 'R'] as const) {
    all.push(...bound(`thigh${side}`, [part(capsule(0.068, THIGH - 0.12), L.trousers, [0, -THIGH / 2, 0])]))
    all.push(...bound(`knee${side}`, [part(capsule(0.056, SHIN - 0.09), L.trousers, [0, -SHIN / 2, 0])]))
    all.push(...bound(`ankle${side}`, [part(roundedBox([0.105, 0.075, 0.25], 0.034), L.shoes, [0, -0.03, 0.05]), part(roundedBox([0.108, 0.02, 0.254], 0.008), shade(L.shoes, -0.12), [0, -0.062, 0.05])]))
  }

  const torso = [
    part(
      lathe(
        [
          [0, 0],
          [0.158, 0],
          [0.166, 0.16],
          [0.19, 0.36],
          [0.186, 0.44],
          [0.12, 0.52],
          [0, 0.535],
        ],
        28,
      ),
      outer,
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 0.68],
    ),
    // Shirt in the open neck, lapels either side, a collar, a breast pocket with a pen, and an ID badge.
    part(roundedBox([0.09, 0.15, 0.012], 0.005), L.shirt, [0, 0.43, 0.112], [0.16, 0, 0]),
    part(roundedBox([0.055, 0.23, 0.02], 0.008), seam, [0.056, 0.37, 0.118], [0.14, 0, 0.3]),
    part(roundedBox([0.055, 0.23, 0.02], 0.008), seam, [-0.056, 0.37, 0.118], [0.14, 0, -0.3]),
    part(new TorusGeometry(0.074, 0.022, 6, 18), outer, [0, 0.505, -0.004], [Math.PI / 2 + 0.25, 0, 0], [1, 0.82, 1]),
    part(roundedBox([0.075, 0.062, 0.012], 0.005), seam, [0.088, 0.29, 0.122]),
    part(cylinder(0.007, 0.065, 8), '#2B3440', [0.1, 0.33, 0.127]),
    part(roundedBox([0.05, 0.068, 0.008], 0.004), '#DCE8F2', [-0.088, 0.3, 0.126]),
    part(roundedBox([0.05, 0.016, 0.009], 0.003), '#2E5BA6', [-0.088, 0.325, 0.128]),
  ]
  if (coat) torso.push(part(cylinder(0.012, 0.006, 10), seam, [0, 0.17, 0.124], [Math.PI / 2, 0, 0]), part(cylinder(0.012, 0.006, 10), seam, [0, 0.07, 0.118], [Math.PI / 2, 0, 0]))
  else torso.push(part(cylinder(0.013, 0.006, 10), '#1C232C', [0, 0.14, 0.12], [Math.PI / 2, 0, 0]))
  all.push(...bound('spine', torso))

  const eye = shade(L.skin, -0.45)
  all.push(
    ...bound('head', [
      part(cylinder(0.046, 0.12, 14), L.skin, [0, -0.02, 0]),
      part(sphere(0.112, 24, 16), L.skin, [0, 0.11, 0], [0, 0, 0], [0.94, 1.06, 1]),
      part(sphere(0.026, 10, 8), L.skin, [0.106, 0.1, -0.006], [0, 0, 0], [0.55, 1, 0.9]),
      part(sphere(0.026, 10, 8), L.skin, [-0.106, 0.1, -0.006], [0, 0, 0], [0.55, 1, 0.9]),
      part(sphere(0.021, 10, 8), shade(L.skin, -0.03), [0, 0.09, 0.108], [0, 0, 0], [0.8, 1.1, 0.9]),
      part(sphere(0.012, 8, 6), eye, [0.04, 0.122, 0.098]),
      part(sphere(0.012, 8, 6), eye, [-0.04, 0.122, 0.098]),
      ...hairParts(L),
    ]),
  )
  const pony = L.style === 'ponytail'
  if (pony) all.push(...bound('pony', [part(capsule(0.034, 0.16), L.hair, [0, -0.1, 0]), part(sphere(0.03, 10, 8), shade(L.hair, 0.05), [0, -0.005, 0])]))

  for (const side of ['L', 'R'] as const) {
    all.push(...bound(`sh${side}`, [part(capsule(0.052, UPPER - 0.1), outer, [0, -UPPER / 2, 0])]))
    all.push(...bound(`el${side}`, [part(capsule(0.046, FORE - 0.1), outer, [0, -FORE / 2 + 0.01, 0]), part(new TorusGeometry(0.045, 0.014, 6, 16), cuff, [0, -FORE + 0.035, 0], [Math.PI / 2, 0, 0])]))
  }

  const geo = mergeGeometries(all, false)
  if (!geo) throw new Error('figure merge failed')
  for (const g of all) g.dispose()
  geo.computeBoundingSphere()

  const hand = (hex: string) => merge([part(sphere(0.043, 14, 10), hex, [0, -0.045, 0.004], [0, 0, 0], [0.82, 1.12, 0.56]), part(capsule(0.014, 0.03), hex, [0, -0.035, 0.03], [0.6, 0, 0])])
  k = { geo, hand: hand(L.skin), glove: hand('#6E9FD6'), pony }
  kits.set(id, k)
  return k
}

function mesh(geo: BufferGeometry, mat: Material, parent: Object3D, p: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], visible = true) {
  const m = new Mesh(geo, mat)
  m.position.set(...p)
  m.rotation.set(...rot)
  m.visible = visible
  m.castShadow = true
  parent.add(m)
  return m
}

export function buildRig(id: string): Rig {
  const kit = kitFor(id)
  const L = LOOKS[id] ?? LOOKS.park
  const root = new Group()
  const scaled = new Group()
  scaled.scale.setScalar(L.scale)
  root.add(scaled)

  const bones: Bone[] = []
  const names = Object.keys(B) as (keyof typeof B)[]
  const parent: Record<keyof typeof B, keyof typeof B | null> = {
    body: null,
    hips: 'body',
    coat: 'hips',
    thighL: 'hips',
    kneeL: 'thighL',
    ankleL: 'kneeL',
    thighR: 'hips',
    kneeR: 'thighR',
    ankleR: 'kneeR',
    spine: 'body',
    head: 'spine',
    pony: 'head',
    shL: 'spine',
    elL: 'shL',
    wrL: 'elL',
    shR: 'spine',
    elR: 'shR',
    wrR: 'elR',
  }
  for (const n of names) {
    const b = new Bone()
    const p = parent[n]
    const [x, y, z] = REST[n]
    if (p) {
      const [px, py, pz] = REST[p]
      b.position.set(x - px, y - py, z - pz)
      bones[B[p]].add(b)
    } else {
      b.position.set(x, y, z)
      scaled.add(b)
    }
    bones[B[n]] = b
  }
  const skin = new SkinnedMesh(kit.geo, skinMat)
  skin.castShadow = true
  skin.frustumCulled = false
  skin.raycast = () => {}
  scaled.add(skin)
  root.updateMatrixWorld(true)
  skin.bind(new Skeleton(bones))

  const bone = (n: keyof typeof B) => bones[B[n]]
  const wrR = bone('wrR')
  const wrL = bone('wrL')
  const spine = bone('spine')
  const handR = mesh(kit.hand, skinMat, wrR)
  const handL = mesh(kit.hand, skinMat, wrL)
  const specs = mesh(specsGeo, specsMat, bone('head'), [0, 0, 0], [0, 0, 0], false)
  specs.castShadow = false
  const props = {
    pipette: mesh(PROP.pipette, propMat, wrR, [0, -0.05, 0.03], [0, 0, 0], false),
    flask: mesh(PROP.flask, propMat, wrR, [0, -0.13, 0.04], [0, 0, 0], false),
    marker: mesh(PROP.marker, propMat, wrR, [0, -0.06, 0.03], [0.5, 0, 0], false),
    plate: mesh(PROP.plate, propMat, wrR, [0, -0.08, 0.05], [1.2, 0, 0], false),
    clipboard: mesh(PROP.clipboard, propMat, wrL, [0, -0.06, 0.06], [1.1, 0, 0], false),
    papers: mesh(PROP.papers, propMat, wrL, [0, -0.06, 0.06], [1.0, 0, 0], false),
    box: mesh(PROP.box, propMat, spine, [0, 0.16, 0.31], [0, 0, 0], false),
    rack: mesh(PROP.rack, propMat, spine, [0, 0.2, 0.3], [0, 0, 0], false),
  }
  // An invisible column to point at: easier to hover than a thin arm.
  const proxy = new Mesh(proxyGeo, M.hidden)
  root.add(proxy)

  return {
    root,
    body: bone('body'),
    hips: bone('hips'),
    coat: bone('coat'),
    thighL: bone('thighL'),
    thighR: bone('thighR'),
    kneeL: bone('kneeL'),
    kneeR: bone('kneeR'),
    ankleL: bone('ankleL'),
    ankleR: bone('ankleR'),
    spine,
    head: bone('head'),
    pony: kit.pony ? bone('pony') : null,
    shR: bone('shR'),
    shL: bone('shL'),
    elR: bone('elR'),
    elL: bone('elL'),
    wrR,
    wrL,
    handR,
    handL,
    specs,
    props,
  }
}

// ── Poses ────────────────────────────────────────────────────────────────

interface J {
  lean: number
  twist: number
  hx: number
  hy: number
  sRx: number
  sRz: number
  sLx: number
  sLz: number
  eR: number
  eL: number
  wR: number
  wL: number
}
const zeroJ = (): J => ({ lean: 0, twist: 0, hx: 0, hy: 0, sRx: 0, sRz: 0, sLx: 0, sLz: 0, eR: 0, eL: 0, wR: 0, wL: 0 })
const JK = Object.keys(zeroJ()) as (keyof J)[]

// The figure faces +z, so its right hand is at -x. A negative x turn at a shoulder
// or elbow brings the hand forward and up. A shoulder's z turn spreads the right arm
// with a negative value and the left with a positive one.
function poseFor(act: Act, t: number, u: number, j: J) {
  const s = Math.sin
  j.lean = 0.02
  j.twist = 0
  j.hx = 0.05
  j.hy = 0
  j.sRx = 0.04
  j.sRz = -0.07
  j.sLx = 0.04
  j.sLz = 0.07
  j.eR = -0.16
  j.eL = -0.16
  j.wR = 0
  j.wL = 0
  switch (act) {
    case 'pipette': {
      // The thumb presses the plunger every couple of seconds.
      const press = Math.max(0, s(t * 2.4)) ** 6
      j.lean = 0.14
      j.hx = 0.42
      j.sRx = -0.62
      j.sRz = 0.12
      j.eR = -1.3 + 0.1 * press
      j.wR = 0.25 * press
      j.sLx = -0.5
      j.sLz = -0.18
      j.eL = -1.15
      break
    }
    case 'swirl':
      j.lean = 0.08
      j.hx = 0.25
      j.sRx = -0.55 + 0.07 * s(t * 4.4)
      j.sRz = 0.1 + 0.07 * Math.cos(t * 4.4)
      j.eR = -1.25
      j.wR = 0.15 * s(t * 4.4 + 1)
      break
    case 'type':
      j.lean = 0.1
      j.hx = 0.08
      j.sRx = -0.42
      j.sLx = -0.42
      j.sRz = 0.12
      j.sLz = -0.12
      j.eR = -1.08 + 0.05 * Math.max(0, s(t * 11))
      j.eL = -1.08 + 0.05 * Math.max(0, s(t * 9.7 + 1.3))
      j.wR = 0.2
      j.wL = 0.2
      j.hy = 0.06 * s(t * 0.37)
      break
    case 'read':
      j.lean = 0.06
      j.hx = 0.42 + 0.04 * s(t * 0.6)
      j.sRx = -0.52
      j.sRz = 0.26 + 0.08 * Math.max(0, s(t * 0.45)) ** 8
      j.sLx = -0.56
      j.sLz = -0.24
      j.eR = -1.25
      j.eL = -1.3
      break
    case 'scope':
      j.lean = 0.42
      j.hx = 0.34
      j.sRx = -0.62
      j.sLx = -0.62
      j.sRz = 0.05
      j.sLz = -0.05
      j.eR = -0.85
      j.eL = -0.85
      j.wR = 0.25 * s(t * 1.3)
      j.wL = 0.1 * s(t * 0.9 + 1)
      break
    case 'cabinet':
      j.lean = 0.2
      j.hx = 0.24
      j.sRx = -1.28 + 0.07 * s(t * 1.8)
      j.sLx = -1.28 + 0.07 * s(t * 1.8 + 1.4)
      j.sRz = 0.1
      j.sLz = -0.1
      j.eR = -0.3
      j.eL = -0.3
      break
    case 'freezer':
      j.hx = -0.08 + 0.18 * Math.max(0, s(t * 0.7))
      j.sLx = -0.55
      j.sLz = -0.22
      j.eL = -1.35
      j.sRx = -0.55 + 0.05 * s(t * 6)
      j.sRz = 0.2
      j.eR = -1.3 + 0.06 * s(t * 7)
      break
    case 'count':
      j.hy = 0.38 * s(t * 0.8)
      j.hx = -0.1 + 0.2 * s(t * 0.47)
      j.sLx = -0.5
      j.sLz = -0.2
      j.eL = -1.35
      j.sRx = -1.25 + 0.22 * s(t * 0.8)
      j.sRz = -0.05 + 0.12 * s(t * 0.8)
      j.eR = -0.25
      break
    case 'write':
      j.hx = -0.14
      j.hy = 0.05 * s(t * 0.9)
      j.sRx = -2.15 + 0.08 * s(t * 3.1)
      j.sRz = -0.1 + 0.2 * s(t * 1.6)
      j.eR = -0.42
      j.wR = -0.2
      break
    case 'calibrate':
      j.lean = 0.26
      j.hx = 0.42
      j.sRx = -1.1
      j.sRz = 0.08
      j.eR = -0.55
      j.wR = 0.3 * s(t * 2.2)
      j.sLx = -0.45
      j.sLz = -0.12
      j.eL = -0.95
      break
    case 'look': {
      // Hand to chin, now and then pointing at the screen.
      const point = Math.max(0, s(t * 0.55)) ** 3
      j.hx = 0.16
      j.sLx = -1.2
      j.sLz = -0.38
      j.eL = -2.05
      j.sRx = -0.2 - 0.85 * point
      j.sRz = 0.05
      j.eR = -0.25 - 0.3 * point
      break
    }
    case 'load':
      j.lean = 0.32
      j.hx = 0.45
      j.sRx = -1.0 + 0.08 * s(t * 1.6)
      j.sLx = -1.0 + 0.08 * s(t * 1.6 + 1.2)
      j.sRz = 0.08
      j.sLz = -0.08
      j.eR = -0.42
      j.eL = -0.42
      break
    case 'pick':
    case 'place': {
      // Down to the shelf or cart, then back up.
      const down = Math.sin(Math.PI * Math.min(1, u * (act === 'pick' ? 1.25 : 1.1)))
      j.lean = 0.42 * down
      j.hx = 0.3 + 0.2 * down
      j.sRx = -0.58 - 0.3 * down
      j.sLx = -0.58 - 0.3 * down
      j.sRz = 0.22
      j.sLz = -0.22
      j.eR = -1.15 + 0.75 * down
      j.eL = -1.15 + 0.75 * down
      break
    }
    case 'idle':
      j.hy = 0.35 * s(t * 0.31) * Math.max(0, s(t * 0.13))
      break
  }
}

const damp = (a: number, b: number, k: number) => a + (b - a) * k
const BENCH: Partial<Record<Act, true>> = { pipette: true, swirl: true, cabinet: true, load: true, freezer: true, calibrate: true }

/** What drives a figure this frame. */
export interface Drive {
  pos: Vector3
  yaw: number
  act: Act
  prop: Prop
  carry: Carry
  walk: number // 0..1 walking weight
  phase: number // walk cycle phase
  sit: number // 0..1
  u: number // 0..1 through the current work, for pick and place
  show: number // 0..1 holding something up to send
  react: { kind: string; k: number } | null
  look: number | null // head yaw to glance at someone
  offset: number // sideways step to let someone pass
}

export const newDrive = (): Drive => ({ pos: new Vector3(), yaw: 0, act: 'idle', prop: null, carry: null, walk: 0, phase: 0, sit: 0, u: 0, show: 0, react: null, look: null, offset: 0 })

const tmp = new Vector3()

export function Figure({ id, drive, b }: { id: string; drive: (dt: number) => Drive; b: Body }) {
  const r = useMemo(() => buildRig(id), [id])
  const kit = useMemo(() => kitFor(id), [id])
  const L = LOOKS[id] ?? LOOKS.park
  const j = useMemo(zeroJ, [])
  const goal = useMemo(zeroJ, [])
  const still = useMemo(reducedMotion, [])
  const life = useMemo(() => ({ t: id.length * 3.1 }), [id])

  useFrame((_, rdt) => {
    const dt = Math.min(rdt, 0.05)
    life.t += dt
    const t = still ? 0 : life.t
    const d = drive(dt)

    poseFor(d.act, t, d.u, goal)
    // Holding something up to send: the right arm rises with it and the head follows.
    if (d.show > 0) {
      const k = d.show
      goal.sRx = damp(goal.sRx, -2.55, k)
      goal.sRz = damp(goal.sRz, -0.12, k)
      goal.eR = damp(goal.eR, -0.3, k)
      goal.hx = damp(goal.hx, -0.3, k)
      goal.lean = damp(goal.lean, -0.04, k)
    }
    if (d.carry && d.walk > 0.2) {
      goal.sRx = goal.sLx = -0.6
      goal.sRz = 0.22
      goal.sLz = -0.22
      goal.eR = goal.eL = -1.15
      goal.hx = 0.05
      goal.lean = 0.03
    }
    if (d.look !== null && d.walk < 0.5 && d.show <= 0) goal.hy = damp(goal.hy, d.look, 0.85)
    if (d.react && !still) {
      const bell = Math.sin(Math.PI * d.react.k)
      if (d.react.kind === 'accept') goal.hx = damp(goal.hx, -0.25, bell)
      else if (d.react.kind === 'reject') {
        goal.lean = damp(goal.lean, -0.12, bell)
        goal.hx = damp(goal.hx, 0.55, bell)
        goal.sRz = damp(goal.sRz, -0.25, bell)
        goal.sLz = damp(goal.sLz, 0.25, bell)
      } else if (d.react.kind === 'hold') goal.hy = damp(goal.hy, 0.5, bell)
      else if (d.react.kind === 'refine') goal.hx = damp(goal.hx, 0.3, bell)
    }

    const k = still ? 1 : 1 - Math.exp(-dt * 9)
    for (const key of JK) j[key] = damp(j[key], goal[key], k)

    // Walk: legs swing from the hips, knees fold on the swing, heels strike, arms counter-swing.
    const w = d.walk
    const ph = d.phase
    const sw = Math.sin(ph)
    const A = 0.46 * w
    let hipL = -A * sw
    let hipR = A * sw
    let kneeL = w * (0.1 + 0.85 * Math.max(0, Math.cos(ph)) ** 1.5)
    let kneeR = w * (0.1 + 0.85 * Math.max(0, -Math.cos(ph)) ** 1.5)
    let ankL = w * (-0.28 * Math.max(0, sw) ** 2 + 0.32 * Math.max(0, -sw) ** 3)
    let ankR = w * (-0.28 * Math.max(0, -sw) ** 2 + 0.32 * Math.max(0, sw) ** 3)
    let bob = w * 0.024 * Math.cos(2 * ph)
    // Standing: the weight drifts from one leg to the other.
    const shift = still ? 0 : Math.sin(t * 0.42 + id.length) * (1 - w) * (1 - d.sit)
    kneeL += Math.max(0, shift) * 0.12
    kneeR += Math.max(0, -shift) * 0.12
    // Sitting: thighs forward, shins down, the body lowered onto the seat.
    const st = d.sit
    hipL = damp(hipL, -1.5, st)
    hipR = damp(hipR, -1.5, st)
    kneeL = damp(kneeL, 1.48, st)
    kneeR = damp(kneeR, 1.48, st)
    ankL = damp(ankL, 0.02, st)
    ankR = damp(ankR, 0.02, st)
    bob = damp(bob, -0.35, st)

    const swing = d.carry ? 0 : 0.42 * w * sw
    r.thighL.rotation.x = hipL
    r.thighR.rotation.x = hipR
    r.kneeL.rotation.x = kneeL
    r.kneeR.rotation.x = kneeR
    r.ankleL.rotation.x = ankL
    r.ankleR.rotation.x = ankR
    r.hips.rotation.y = 0.09 * w * sw
    // The coat skirt rides up over the thighs when seated and flares a little in a stride.
    r.coat.scale.set(1 + 0.08 * st, 1 - 0.6 * st, 1 + 0.25 * w + 0.7 * st)
    r.coat.position.z = 0.05 * st
    r.spine.rotation.set(j.lean + 0.05 * w, j.twist - 0.12 * w * sw, 0)
    const breath = still ? 0 : Math.sin(t * 1.5)
    r.spine.scale.set(1 + 0.006 * breath, 1 + 0.01 * breath, 1 + 0.006 * breath)
    r.head.rotation.set(j.hx, j.hy, 0)
    r.shR.rotation.set(j.sRx + swing * (1 - d.show), 0, j.sRz - 0.04 * w)
    r.shL.rotation.set(j.sLx - swing, 0, j.sLz + 0.04 * w)
    const fold = d.carry ? 0 : 0.25 * w
    r.elR.rotation.x = j.eR - fold
    r.elL.rotation.x = j.eL - fold
    r.wrR.rotation.x = j.wR
    r.wrL.rotation.x = j.wL
    if (r.pony) r.pony.rotation.x = 0.35 - j.hx * 0.8 + (still ? 0 : 0.12 * w * Math.sin(2 * ph + 0.6))

    const hop = d.react?.kind === 'accept' && !still ? 0.06 * Math.sin(Math.PI * d.react.k) : 0
    r.body.position.y = HIP + bob + hop
    r.body.position.x = still ? 0 : 0.012 * shift
    r.body.rotation.z = still ? 0 : -0.012 * shift
    r.root.position.copy(d.pos)
    r.root.rotation.y = d.yaw
    if (d.offset) {
      tmp.set(Math.cos(d.yaw), 0, -Math.sin(d.yaw)).multiplyScalar(-d.offset)
      r.root.position.add(tmp)
    }

    // Gloves and safety glasses at the bench.
    const bench = !!BENCH[d.act] && d.walk < 0.5
    const hand = bench && L.outer === 'coat' ? kit.glove : kit.hand
    r.handR.geometry = hand
    r.handL.geometry = hand
    r.specs.visible = bench && L.outer === 'coat'
    const P = r.props
    const working = d.walk < 0.5 && d.show <= 0.05
    P.pipette.visible = working && d.prop === 'pipette'
    P.flask.visible = working && d.prop === 'flask'
    P.marker.visible = working && d.prop === 'marker'
    P.plate.visible = working && d.prop === 'plate' && (d.act !== 'pick' || d.u > 0.5)
    P.clipboard.visible = d.prop === 'clipboard' && d.show <= 0.05
    P.papers.visible = working && d.prop === 'papers'
    P.box.visible = d.carry === 'box'
    P.rack.visible = d.carry === 'rack'

    b.pos.copy(r.root.position)
    b.yaw = d.yaw
    b.act = d.act
    b.walking = w > 0.5
    b.seated = st
    r.root.updateMatrixWorld()
    r.wrR.getWorldPosition(b.hand)
    r.head.getWorldPosition(tmp)
    b.head.copy(tmp).setY(tmp.y + 0.3 * L.scale)
  })

  return <primitive object={r.root} />
}
