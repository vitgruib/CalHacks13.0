// The lab members (and the grant manager): jointed clay figures in lab coats
// or blazers. Each limb is one vertex-coloured mesh on a nested group, so a
// figure is about sixteen draw calls. Walking, work actions, sending and
// receiving all come from the walker in walk.ts and the feed.

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { BufferGeometry, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three'
import { feed, progress } from '../../feed'
import { kit } from './kit'
import { CLAY } from './mats'
import { SPOTS, type Action } from './layout'
import { makeWalker, placeOf, planFor, stepWalker, type Carry, type Walker } from './walk'
import { Pick } from './Parts'
import { SEND_HOLD } from './routes'
import { fx, now, reducedMotion, ui } from './store'

type Hair = 'bun' | 'crop' | 'braid' | 'curls' | 'fringe' | 'side'
interface Look {
  skin: string
  hair: string
  style: Hair
  beard?: boolean
  top: 'coat' | 'blazer'
  topColor: string
  shirt: string
  trousers: string
  shoes: string
  h: number
  specs?: boolean // wears reading glasses all the time
}

const COAT = '#F3F0EA'
export const LOOKS: Record<string, Look> = {
  ortiz: { skin: '#C68E63', hair: '#B9B3AA', style: 'bun', top: 'blazer', topColor: '#4C6274', shirt: '#EFE7DA', trousers: '#2F343C', shoes: '#3B302A', h: 0.98, specs: true },
  okafor: { skin: '#6A4330', hair: '#1D1916', style: 'crop', beard: true, top: 'coat', topColor: COAT, shirt: '#B4643E', trousers: '#3A4049', shoes: '#26221F', h: 1.04 },
  raman: { skin: '#A56C4A', hair: '#1A1613', style: 'braid', top: 'coat', topColor: COAT, shirt: '#6F8F7D', trousers: '#2E3540', shoes: '#ECE7E0', h: 0.95 },
  silva: { skin: '#D4A07A', hair: '#4B3425', style: 'curls', top: 'coat', topColor: COAT, shirt: '#C8A03C', trousers: '#3F5068', shoes: '#2A2725', h: 1.0 },
  park: { skin: '#E7C29E', hair: '#24211F', style: 'fringe', top: 'coat', topColor: COAT, shirt: '#5A5D86', trousers: '#8A7B60', shoes: '#3A3430', h: 0.97 },
  gm: { skin: '#9B6A48', hair: '#8F8B85', style: 'side', top: 'blazer', topColor: '#323943', shirt: '#F1ECE4', trousers: '#2F343C', shoes: '#26221F', h: 1.0, specs: true },
}

const GLOVE = new Color('#6F9BD8')
const HIP_H = 0.96
const SIT_DROP = 0.46

// ── Geometry, built once per look ─────────────────────────────────────────

interface Parts {
  pelvis: BufferGeometry
  torso: BufferGeometry
  head: BufferGeometry
  upper: BufferGeometry
  fore: BufferGeometry
  hand: BufferGeometry
  thigh: BufferGeometry
  shin: BufferGeometry
  foot: BufferGeometry
}

function shade(hex: string, k: number) {
  return '#' + new Color(hex).offsetHSL(0, 0, k).getHexString()
}

function buildParts(L: Look): Parts {
  const coat = L.top === 'coat'
  const trim = shade(L.topColor, coat ? -0.06 : -0.05)
  const k = kit()
  // Pelvis: trousers, and the coat's skirt with its open front and pockets.
  k.box([0, -0.02, 0], [0.3, 0.2, 0.19], L.trousers, 0.07)
  if (coat) {
    k.cyl([0, -0.2, 0], 0.215, 0.42, L.topColor, 24, { scale: [1.12, 1, 0.82] }, 0.175)
    k.box([0, -0.2, 0.163], [0.07, 0.42, 0.012], L.trousers, 0.004, { rot: [-0.078, 0, 0] })
    k.box([0.115, -0.24, 0.158], [0.085, 0.08, 0.012], trim, 0.004, { rot: [-0.078, 0.45, 0] })
    k.box([-0.115, -0.24, 0.158], [0.085, 0.08, 0.012], trim, 0.004, { rot: [-0.078, -0.45, 0] })
  } else {
    k.cyl([0, -0.06, 0], 0.19, 0.16, L.topColor, 24, { scale: [1.12, 1, 0.82] }, 0.172)
  }
  const pelvis = k.build()

  // Torso: chest, the shirt in the V, lapels, collar, pocket with pens, an ID badge.
  k.lathe([0, 0, 0], [[0.155, 0], [0.165, 0.1], [0.185, 0.26], [0.2, 0.38], [0.19, 0.44], [0.12, 0.5], [0.05, 0.52], [0, 0.525]], L.topColor, { scale: [1.18, 1, 0.74] }, 24)
  k.box([0, 0.39, 0.128], [0.1, 0.17, 0.012], L.shirt, 0.004, { rot: [-0.46, 0, 0] })
  k.box([0.048, 0.375, 0.133], [0.046, 0.2, 0.014], trim, 0.004, { rot: [-0.46, 0, -0.34] })
  k.box([-0.048, 0.375, 0.133], [0.046, 0.2, 0.014], trim, 0.004, { rot: [-0.46, 0, 0.34] })
  k.torus([0, 0.49, -0.005], 0.068, 0.022, coat ? L.topColor : L.shirt, { rot: [Math.PI / 2 - 0.25, 0, 0] })
  if (coat) {
    k.box([0.095, 0.29, 0.143], [0.075, 0.07, 0.012], trim, 0.004)
    k.cyl([0.08, 0.335, 0.146], 0.006, 0.05, '#2E5BA6', 8)
    k.cyl([0.1, 0.335, 0.146], 0.006, 0.05, '#2A2D33', 8)
  } else {
    k.sphere([0, 0.12, 0.134], 0.011, trim, {}, 8, 6)
  }
  k.box([-0.095, 0.27, 0.146], [0.052, 0.07, 0.008], '#F7F6F2', 0.003)
  k.box([-0.095, 0.293, 0.151], [0.052, 0.016, 0.004], '#2E5BA6', 0.002)
  k.box([-0.106, 0.262, 0.151], [0.016, 0.02, 0.003], '#8A929C', 0.001)
  const torso = k.build()

  // Head: neck, face, ears, eyes, brows, then the hair.
  const skinLo = shade(L.skin, -0.04)
  k.cyl([0, 0.04, 0], 0.045, 0.1, L.skin, 14)
  k.sphere([0, 0.15, 0.005], 0.1, L.skin, { scale: [0.92, 1.08, 1.0] }, 24, 18)
  k.sphere([0.092, 0.15, -0.005], 0.024, skinLo, { scale: [0.5, 1, 0.8] }, 10, 8)
  k.sphere([-0.092, 0.15, -0.005], 0.024, skinLo, { scale: [0.5, 1, 0.8] }, 10, 8)
  k.sphere([0, 0.14, 0.1], 0.018, skinLo, {}, 10, 8)
  k.sphere([0.034, 0.166, 0.089], 0.011, '#1F1A17', {}, 8, 6)
  k.sphere([-0.034, 0.166, 0.089], 0.011, '#1F1A17', {}, 8, 6)
  k.box([0.036, 0.19, 0.088], [0.032, 0.008, 0.01], L.hair, 0.002, { rot: [0, 0, 0.12] })
  k.box([-0.036, 0.19, 0.088], [0.032, 0.008, 0.01], L.hair, 0.002, { rot: [0, 0, -0.12] })
  k.box([0, 0.103, 0.093], [0.032, 0.007, 0.008], shade(L.skin, -0.16), 0.002)
  const cap = (y = 0.17, z = -0.012, r = 0.103) => k.sphere([0, y, z], r, L.hair, { scale: [0.96, 0.98, 1.0] }, 22, 16)
  if (L.style === 'bun') {
    cap()
    k.sphere([0, 0.238, -0.078], 0.044, L.hair, {}, 14, 10)
  } else if (L.style === 'crop') {
    cap(0.174, -0.01, 0.1035)
  } else if (L.style === 'braid') {
    cap()
    const b: [number, number, number][] = [[0.12, -0.105, 0.032], [0.07, -0.132, 0.03], [0.02, -0.15, 0.028], [-0.03, -0.163, 0.026], [-0.08, -0.172, 0.022], [-0.115, -0.176, 0.016]]
    for (const [y, z, r] of b) k.sphere([0, y, z], r, L.hair, {}, 10, 8)
  } else if (L.style === 'curls') {
    cap(0.165, -0.008, 0.1)
    k.sphere([0, 0.258, -0.005], 0.04, L.hair, {}, 10, 8)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      k.sphere([Math.sin(a) * 0.078, 0.225 - (Math.cos(a) < -0.3 ? 0.04 : 0), Math.cos(a) * 0.072 - 0.012], 0.038, L.hair, {}, 10, 8)
    }
  } else if (L.style === 'fringe') {
    cap(0.172, -0.006, 0.104)
    k.box([0, 0.214, 0.074], [0.16, 0.05, 0.045], L.hair, 0.018, { rot: [0.4, 0, 0] })
  } else {
    cap(0.17, -0.01, 0.102)
  }
  if (L.beard) k.sphere([0, 0.095, 0.028], 0.083, L.hair, { scale: [1.0, 0.6, 0.95] }, 18, 12)
  const head = k.build()

  // Arms: sleeve, sleeve with cuff, then a hand painted white (its material tints it skin or glove).
  k.capsule([0, -0.13, 0], 0.056, 0.17, L.topColor)
  const upper = k.build()
  k.capsule([0, -0.11, 0], 0.05, 0.14, L.topColor)
  k.cyl([0, -0.225, 0], 0.052, 0.035, coat ? trim : L.shirt, 14)
  const fore = k.build()
  k.box([0, -0.045, 0.004], [0.072, 0.085, 0.032], '#FFFFFF', 0.014)
  k.box([0, -0.1, 0.012], [0.068, 0.045, 0.026], '#FFFFFF', 0.012, { rot: [-0.25, 0, 0] })
  k.capsule([0, -0.05, 0.03], 0.012, 0.035, '#FFFFFF', { rot: [0.6, 0, 0] }, 8)
  const hand = k.build()

  // Legs and shoes with a lighter sole.
  k.capsule([0, -0.2, 0], 0.072, 0.27, L.trousers)
  const thigh = k.build()
  k.capsule([0, -0.2, 0], 0.06, 0.29, L.trousers)
  const shin = k.build()
  k.box([0, -0.035, 0.045], [0.095, 0.07, 0.24], L.shoes, 0.03)
  k.box([0, -0.068, 0.045], [0.098, 0.016, 0.245], '#E9E4DC', 0.006)
  const foot = k.build()
  return { pelvis, torso, head, upper, fore, hand, thigh, shin, foot }
}

// ── Props held in the hands (shared by everyone) ─────────────────────────

const PROP = (() => {
  const k = kit()
  k.cyl([0, -0.03, 0], 0.013, 0.13, '#F2F0EC', 10)
  k.cyl([0, 0.055, 0], 0.008, 0.04, '#2E5BA6', 8)
  k.cyl([0, -0.12, 0], 0.002, 0.06, '#EFE6D2', 8, {}, 0.008)
  const pipette = k.build()
  k.lathe([0, -0.13, 0], [[0, 0], [0.055, 0], [0.057, 0.012], [0.02, 0.085], [0.015, 0.095], [0.015, 0.13], [0, 0.13]], '#DCE6EC', {}, 16)
  k.lathe([0, -0.128, 0], [[0, 0], [0.05, 0], [0.04, 0.03], [0, 0.03]], '#E2B24F', {}, 16)
  const flask = k.build()
  k.cyl([0, -0.04, 0.02], 0.01, 0.12, '#2E5BA6', 8)
  const marker = k.build()
  k.box([0.1, -0.07, 0.03], [0.17, 0.23, 0.012], '#F4F1EA', 0.004)
  k.box([0.1, -0.03, 0.037], [0.12, 0.012, 0.003], '#9AA3AD', 0.001)
  k.box([0.1, -0.07, 0.037], [0.12, 0.012, 0.003], '#9AA3AD', 0.001)
  const sheet = k.build()
  k.box([0, 0, 0], [0.42, 0.28, 0.32], '#C9A47A', 0.02)
  k.box([0, 0.141, 0], [0.42, 0.004, 0.06], '#E9DCC4', 0.001)
  const box = k.build()
  k.box([0, 0, 0], [0.3, 0.1, 0.2], '#3E6FB0', 0.015)
  k.box([0, 0.06, 0], [0.28, 0.02, 0.18], '#D7E3EE', 0.006)
  const rack = k.build()
  // Safety glasses: a light wraparound band; reading glasses: dark frames.
  k.box([0, 0.165, 0.099], [0.17, 0.045, 0.014], '#CFDAE3', 0.012)
  k.box([0.084, 0.168, 0.04], [0.006, 0.012, 0.12], '#CFDAE3', 0.003)
  k.box([-0.084, 0.168, 0.04], [0.006, 0.012, 0.12], '#CFDAE3', 0.003)
  const safety = k.build()
  k.torus([0.036, 0.165, 0.099], 0.024, 0.0045, '#2A2D33', {}, Math.PI * 2, 16)
  k.torus([-0.036, 0.165, 0.099], 0.024, 0.0045, '#2A2D33', {}, Math.PI * 2, 16)
  k.box([0, 0.168, 0.1], [0.022, 0.005, 0.005], '#2A2D33', 0.001)
  k.box([0.082, 0.168, 0.045], [0.004, 0.006, 0.11], '#2A2D33', 0.001)
  k.box([-0.082, 0.168, 0.045], [0.004, 0.006, 0.11], '#2A2D33', 0.001)
  const specs = k.build()
  return { pipette, flask, marker, sheet, box, rack, safety, specs }
})()

const partsCache = new Map<string, Parts>()
const hitGeo = new CylinderGeometry(0.36, 0.36, 1.9, 10)
const hitMat = new MeshBasicMaterial({ visible: false })
const noRay = () => {}

// ── The rig ──────────────────────────────────────────────────────────────

interface Arm {
  sh: Group
  el: Group
  wr: Group
}
interface Leg {
  hip: Group
  knee: Group
  ank: Group
}
export interface Rig {
  root: Group
  body: Group // scaled to the person's height
  pelvis: Group
  spine: Group
  head: Group
  R: Arm
  L: Arm
  LR: Leg
  LL: Leg
  mat: MeshStandardMaterial
  handMat: MeshStandardMaterial
  skin: Color
  props: Record<'pipette' | 'flask' | 'marker' | 'sheet' | 'box' | 'rack', Mesh>
  safety: Mesh
  specs: Mesh | null
  hands: Vector3
  headPos: Vector3
}

function mesh(g: BufferGeometry, m: MeshStandardMaterial, shadow = false) {
  const x = new Mesh(g, m)
  x.castShadow = shadow
  x.receiveShadow = true
  x.raycast = noRay
  return x
}
function grp(parent: Group, x: number, y: number, z: number) {
  const g = new Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}

export function makeRig(id: string): Rig {
  const L = LOOKS[id] ?? LOOKS.park
  let P = partsCache.get(id)
  if (!P) {
    P = buildParts(L)
    partsCache.set(id, P)
  }
  const mat = CLAY.clone()
  mat.emissive = new Color('#FFFFFF')
  mat.emissiveIntensity = 0
  const handMat = new MeshStandardMaterial({ color: L.skin, roughness: 0.7, vertexColors: true })
  const root = new Group()
  const hit = new Mesh(hitGeo, hitMat)
  hit.position.y = 0.95
  root.add(hit)
  const body = grp(root, 0, 0, 0)
  body.scale.setScalar(L.h)
  const pelvis = grp(body, 0, HIP_H, 0)
  pelvis.add(mesh(P.pelvis, mat, true))
  const spine = grp(pelvis, 0, 0.06, 0)
  spine.add(mesh(P.torso, mat, true))
  const head = grp(spine, 0, 0.5, 0)
  head.add(mesh(P.head, mat, true))
  const arm = (side: number): Arm => {
    const sh = grp(spine, 0.215 * side, 0.43, 0)
    sh.add(mesh(P.upper, mat, true))
    const el = grp(sh, 0, -0.27, 0)
    el.add(mesh(P.fore, mat))
    const wr = grp(el, 0, -0.25, 0)
    wr.add(mesh(P.hand, handMat))
    return { sh, el, wr }
  }
  const leg = (side: number): Leg => {
    const hip = grp(pelvis, 0.088 * side, -0.06, 0)
    hip.add(mesh(P.thigh, mat, true))
    const knee = grp(hip, 0, -0.41, 0)
    knee.add(mesh(P.shin, mat, true))
    const ank = grp(knee, 0, -0.42, 0)
    ank.add(mesh(P.foot, mat))
    return { hip, knee, ank }
  }
  const R = arm(-1)
  const Lf = arm(1)
  const LR = leg(-1)
  const LL = leg(1)
  const prop = (g: BufferGeometry, parent: Group, rx: number, y = -0.06) => {
    const m = mesh(g, mat)
    m.position.set(0, y, 0)
    m.rotation.x = rx
    m.visible = false
    parent.add(m)
    return m
  }
  const props = {
    pipette: prop(PROP.pipette, R.wr, 1.57),
    flask: prop(PROP.flask, R.wr, 1.57),
    marker: prop(PROP.marker, R.wr, 0),
    sheet: prop(PROP.sheet, R.wr, -0.55),
    box: prop(PROP.box, spine, 0, 0.16),
    rack: prop(PROP.rack, spine, 0, 0.2),
  }
  props.box.position.z = 0.33
  props.rack.position.z = 0.3
  const safety = mesh(PROP.safety, mat)
  safety.visible = false
  head.add(safety)
  let specs: Mesh | null = null
  if (L.specs) {
    specs = mesh(PROP.specs, mat)
    head.add(specs)
  }
  return { root, body, pelvis, spine, head, R, L: Lf, LR, LL, mat, handMat, skin: new Color(L.skin), props, safety, specs, hands: new Vector3(), headPos: new Vector3() }
}

// ── Posing ───────────────────────────────────────────────────────────────

export interface PoseIn {
  act: Action | 'walk'
  walk: number // 0..1 how much of the walk cycle shows
  gait: number
  sit: number
  carry: Carry
  send: number // 0..1 holding something up to send
  hold: number // 0..1 holding a returned parcel
  react: 'accept' | 'refine' | 'reject' | 'hold' | null
  reactK: number // 0..1 through the reaction
  glance: number // head yaw toward a colleague, radians
  t: number // seconds, for small idle motions
  still: boolean
  lit: number // 0..1 hover brightening
}

const T = {
  pY: 0, pX: 0, pZ: 0, pRY: 0,
  sX: 0, sY: 0, sZ: 0,
  hX: 0, hY: 0, hZ: 0,
  rX: 0, rZ: 0, reX: 0, rwX: 0,
  lX: 0, lZ: 0, leX: 0, lwX: 0,
  hrX: 0, krX: 0, arX: 0,
  hlX: 0, klX: 0, alX: 0,
}
type Pose = typeof T

const BENCH: Partial<Record<Action, true>> = { pipette: true, swirl: true, load: true, cabinet: true, adjust: true }
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

function actionPose(o: Pose, act: Action | 'walk', t: number, still: boolean) {
  const w = still ? 0 : 1
  switch (act) {
    case 'type':
      o.sX = 0.1; o.hX = 0.18
      o.rX = -0.55; o.rZ = 0.16; o.reX = -1.15; o.rwX = 0.25 + 0.14 * w * Math.max(0, Math.sin(t * 13))
      o.lX = -0.55; o.lZ = -0.16; o.leX = -1.15; o.lwX = 0.25 + 0.14 * w * Math.max(0, Math.sin(t * 13 + 2.1))
      break
    case 'read':
      o.sX = 0.08; o.hX = 0.42 + 0.04 * w * Math.sin(t * 0.7)
      o.rX = -0.6; o.rZ = 0.32; o.reX = -1.45; o.rwX = 0
      o.lX = -0.6; o.lZ = -0.32; o.leX = -1.45
      break
    case 'write':
      o.hX = -0.12; o.hZ = 0.05 * w * Math.sin(t * 0.9)
      o.rX = -1.95 + 0.12 * w * Math.sin(t * 3.1); o.rZ = 0.15 + 0.14 * w * Math.sin(t * 2.3); o.reX = -0.55; o.rwX = -0.2
      o.lX = -0.15; o.lZ = -0.05; o.leX = -0.3
      break
    case 'look':
      o.sX = 0.12; o.hX = 0.3
      o.rX = -0.55; o.rZ = 0.55; o.reX = -1.85
      o.lX = -0.55; o.lZ = -0.55; o.leX = -1.85
      break
    case 'pipette': {
      const press = w * Math.max(0, Math.sin(t * 3.4)) ** 6
      o.sX = 0.16; o.hX = 0.38
      o.rX = -0.75; o.rZ = 0.22; o.reX = -0.82 + 0.1 * press; o.rwX = 0
      o.lX = -0.7; o.lZ = -0.28; o.leX = -1.1
      o.pY = -0.04 * press
      break
    }
    case 'swirl':
      o.sX = 0.06; o.hX = 0.32
      o.rX = -0.72 + 0.1 * w * Math.cos(t * 6); o.rZ = 0.2 + 0.1 * w * Math.sin(t * 6); o.reX = -0.85
      o.lX = -0.2; o.lZ = -0.05; o.leX = -0.4
      break
    case 'load':
      o.sX = 0.38; o.hX = 0.3
      o.rX = -1.0 + 0.08 * w * Math.sin(t * 2); o.rZ = 0.1; o.reX = -0.45
      o.lX = -1.0 - 0.08 * w * Math.sin(t * 2); o.lZ = -0.1; o.leX = -0.45
      break
    case 'cabinet':
      o.sX = 0.14; o.hX = 0.24
      o.rX = -1.22 + 0.06 * w * Math.sin(t * 2.2); o.rZ = 0.08; o.reX = -0.35
      o.lX = -1.22 + 0.06 * w * Math.sin(t * 2.2 + 1.4); o.lZ = -0.08; o.leX = -0.35
      break
    case 'scope':
      o.sX = 0.42; o.hX = 0.32
      o.rX = -0.62; o.rZ = -0.32; o.reX = -1.2; o.rwX = 0.1 * w * Math.sin(t * 1.3)
      o.lX = -0.62; o.lZ = 0.32; o.leX = -1.2
      break
    case 'adjust':
      o.sX = 0.22; o.hX = 0.3
      o.rX = -1.05 + 0.05 * w * Math.sin(t * 1.8); o.rZ = 0.05; o.reX = -0.7
      o.lX = -0.3; o.lZ = -0.1; o.leX = -0.5
      break
    case 'freezer':
      o.sX = 0.08; o.hX = 0.12 + 0.12 * w * Math.sin(t * 0.8)
      o.rX = -1.45; o.rZ = -0.15; o.reX = -0.3
      o.lX = -1.15 + 0.1 * w * Math.sin(t * 1.6); o.lZ = -0.15; o.leX = -0.7
      break
    case 'reach': {
      const hi = w ? (Math.sin(t * 0.9) > 0 ? 1 : 0.4) : 1
      o.hX = -0.3 * hi
      o.rX = lerp(-1.4, -2.45, hi); o.rZ = 0.1; o.reX = -0.3
      o.lX = -0.15; o.leX = -0.25
      break
    }
    case 'pickup':
      o.sX = 0.62; o.hX = 0.2; o.pY = -0.14
      o.hrX = -0.65; o.krX = 1.05; o.arX = -0.4
      o.hlX = -0.45; o.klX = 0.8; o.alX = -0.35
      o.rX = -0.9; o.reX = -0.3; o.lX = -0.9; o.leX = -0.3
      break
    case 'place':
      o.sX = 0.1; o.hX = 0.15
      o.rX = -1.3; o.rZ = 0.18; o.reX = -0.5
      o.lX = -1.3; o.lZ = -0.18; o.leX = -0.5
      break
    default:
      o.rX = -0.08; o.lX = -0.08; o.reX = -0.15; o.leX = -0.15
      o.rZ = 0.06; o.lZ = -0.06
  }
}

const tgt: Pose = { ...T }
const zero = () => Object.assign(tgt, T)

/** Pose a rig for this frame, damped toward its targets. */
export function pose(r: Rig, p: PoseIn, dt: number) {
  zero()
  const o = tgt
  actionPose(o, p.walk > 0.5 ? 'stand' : p.act, p.t, p.still)
  // Idle life: breathing, a slow weight shift.
  if (!p.still) {
    o.pX += 0.018 * Math.sin(p.t * 0.7)
    o.pZ += 0.02 * Math.sin(p.t * 0.7)
    o.krX += 0.06 * Math.max(0, Math.sin(p.t * 0.7))
    o.klX += 0.06 * Math.max(0, -Math.sin(p.t * 0.7))
  }
  o.hY += p.glance

  // Walking: leg swing, knee lift, heel strike, counter arm swing, a little bob.
  const wk = p.walk
  if (wk > 0) {
    const g = p.gait
    const s = Math.sin(g)
    const c = Math.cos(g)
    o.hrX = lerp(o.hrX, -0.44 * s, wk)
    o.hlX = lerp(o.hlX, 0.44 * s, wk)
    o.krX = lerp(o.krX, 0.08 + 0.85 * Math.max(0, c) ** 1.4, wk)
    o.klX = lerp(o.klX, 0.08 + 0.85 * Math.max(0, -c) ** 1.4, wk)
    o.arX = lerp(o.arX, 0.44 * s - (0.08 + 0.85 * Math.max(0, c) ** 1.4) * 0.5 - 0.26 * Math.max(0, s), wk)
    o.alX = lerp(o.alX, -0.44 * s - (0.08 + 0.85 * Math.max(0, -c) ** 1.4) * 0.5 - 0.26 * Math.max(0, -s), wk)
    o.rX = lerp(o.rX, 0.34 * s, wk)
    o.lX = lerp(o.lX, -0.34 * s, wk)
    o.reX = lerp(o.reX, -0.22 - 0.2 * Math.max(0, -s), wk)
    o.leX = lerp(o.leX, -0.22 - 0.2 * Math.max(0, s), wk)
    o.rZ = lerp(o.rZ, 0.06, wk)
    o.lZ = lerp(o.lZ, -0.06, wk)
    o.pY += wk * 0.022 * Math.cos(2 * g)
    o.pRY = wk * 0.09 * s
    o.sY = -wk * 0.12 * s
    o.sX = lerp(o.sX, 0.05, wk)
    o.hX = lerp(o.hX, 0.04, wk)
    o.pX = lerp(o.pX, 0, wk)
    o.pZ = wk * 0.025 * s
  }
  // Carrying: forearms out, no arm swing.
  if (p.carry) {
    o.rX = -0.72; o.rZ = 0.2; o.reX = -0.95; o.rwX = 0
    o.lX = -0.72; o.lZ = -0.2; o.leX = -0.95; o.lwX = 0
    o.hX = 0.08
  }
  // Holding a returned parcel, or holding one up to send it.
  if (p.hold > 0) {
    o.rX = lerp(o.rX, -0.85, p.hold); o.rZ = lerp(o.rZ, 0.26, p.hold); o.reX = lerp(o.reX, -0.85, p.hold)
    o.lX = lerp(o.lX, -0.85, p.hold); o.lZ = lerp(o.lZ, -0.26, p.hold); o.leX = lerp(o.leX, -0.85, p.hold)
    o.hX = lerp(o.hX, 0.3, p.hold)
  }
  if (p.send > 0) {
    const k = p.send
    o.rX = lerp(o.rX, -1.95, k); o.rZ = lerp(o.rZ, 0.2, k); o.reX = lerp(o.reX, -0.3, k)
    o.lX = lerp(o.lX, -1.95, k); o.lZ = lerp(o.lZ, -0.2, k); o.leX = lerp(o.leX, -0.3, k)
    o.sX = lerp(o.sX, -0.06, k); o.hX = lerp(o.hX, -0.22, k)
  }
  // Hearing back: a hop, a slump, a tilt or a turn.
  if (p.react && !p.still) {
    const b = Math.sin(Math.PI * p.reactK)
    if (p.react === 'accept') {
      o.pY += 0.05 * b
      o.hX -= 0.12 * b
    } else if (p.react === 'reject') {
      o.sX += 0.22 * b
      o.hX += 0.35 * b
    } else if (p.react === 'hold') o.hZ += 0.22 * b
    else o.hY += 0.5 * b
  }
  // Sitting folds the legs and drops the hips onto the chair.
  if (p.sit > 0) {
    const k = p.sit
    o.pY -= SIT_DROP * k
    o.hrX = lerp(o.hrX, -1.52, k); o.krX = lerp(o.krX, 1.5, k); o.arX = lerp(o.arX, 0.02, k)
    o.hlX = lerp(o.hlX, -1.52, k); o.klX = lerp(o.klX, 1.5, k); o.alX = lerp(o.alX, 0.02, k)
    o.pX *= 1 - k
    o.pZ *= 1 - k
  }

  const k = 1 - Math.exp(-dt * 14)
  const d = (cur: number, to: number) => cur + (to - cur) * k
  r.pelvis.position.y = d(r.pelvis.position.y, HIP_H + o.pY)
  r.pelvis.position.x = d(r.pelvis.position.x, o.pX)
  r.pelvis.rotation.z = d(r.pelvis.rotation.z, o.pZ)
  r.pelvis.rotation.y = d(r.pelvis.rotation.y, o.pRY)
  r.spine.rotation.x = d(r.spine.rotation.x, o.sX)
  r.spine.rotation.y = d(r.spine.rotation.y, o.sY)
  r.spine.rotation.z = d(r.spine.rotation.z, -o.pZ * 0.8)
  r.head.rotation.x = d(r.head.rotation.x, o.hX)
  r.head.rotation.y = d(r.head.rotation.y, o.hY)
  r.head.rotation.z = d(r.head.rotation.z, o.hZ)
  r.R.sh.rotation.x = d(r.R.sh.rotation.x, o.rX)
  r.R.sh.rotation.z = d(r.R.sh.rotation.z, o.rZ)
  r.R.el.rotation.x = d(r.R.el.rotation.x, o.reX)
  r.R.wr.rotation.x = d(r.R.wr.rotation.x, o.rwX)
  r.L.sh.rotation.x = d(r.L.sh.rotation.x, o.lX)
  r.L.sh.rotation.z = d(r.L.sh.rotation.z, o.lZ)
  r.L.el.rotation.x = d(r.L.el.rotation.x, o.leX)
  r.L.wr.rotation.x = d(r.L.wr.rotation.x, o.lwX)
  r.LR.hip.rotation.x = d(r.LR.hip.rotation.x, o.hrX)
  r.LR.knee.rotation.x = d(r.LR.knee.rotation.x, o.krX)
  r.LR.ank.rotation.x = d(r.LR.ank.rotation.x, o.arX)
  r.LL.hip.rotation.x = d(r.LL.hip.rotation.x, o.hlX)
  r.LL.knee.rotation.x = d(r.LL.knee.rotation.x, o.klX)
  r.LL.ank.rotation.x = d(r.LL.ank.rotation.x, o.alX)

  // What's in the hands, gloves and safety glasses at the bench.
  const act = p.walk > 0.5 ? 'walk' : p.act
  const busy = p.send > 0.2 || p.hold > 0.2
  r.props.pipette.visible = !busy && act === 'pipette'
  r.props.flask.visible = !busy && act === 'swirl'
  r.props.marker.visible = !busy && act === 'write'
  r.props.sheet.visible = !busy && act === 'read'
  r.props.box.visible = !busy && p.carry === 'box'
  r.props.rack.visible = !busy && p.carry === 'rack'
  const bench = act !== 'walk' && !!BENCH[act as Action]
  r.safety.visible = bench && !r.specs
  r.handMat.color.lerp(bench ? GLOVE : r.skin, Math.min(1, dt * 6))
  r.mat.emissiveIntensity = d(r.mat.emissiveIntensity, p.lit * 0.16)
}

const wA = new Vector3()
const wB = new Vector3()
/** World positions of the hands' midpoint (a little forward) and the head, after posing. */
export function readOut(r: Rig) {
  r.root.updateWorldMatrix(true, true)
  r.R.wr.getWorldPosition(wA)
  r.L.wr.getWorldPosition(wB)
  r.hands.addVectors(wA, wB).multiplyScalar(0.5)
  r.head.getWorldPosition(r.headPos)
  r.headPos.y += 0.18
}

// ── The five researchers ─────────────────────────────────────────────────

const LAB_IDS = ['ortiz', 'okafor', 'raman', 'silva', 'park']
const walkers: Walker[] = LAB_IDS.map(makeWalker)
const walkerOf: Record<string, Walker> = Object.fromEntries(walkers.map(w => [w.id, w]))

/** How far through holding something up to send it (0 when nothing is going out). */
function sendingOf(rid: string, t: number) {
  const pk = feed.getWorld().packets
  let k = 0
  for (const p of pk) {
    if (p.from !== rid || (p.kind !== 'request' && p.kind !== 'pushback' && p.kind !== 'paper')) continue
    const u = progress(p, t)
    if (u < SEND_HOLD + 0.06) k = Math.max(k, u < 0.04 ? u / 0.04 : u > SEND_HOLD ? 1 - (u - SEND_HOLD) / 0.06 : 1)
  }
  return k
}

function Researcher({ id }: { id: string }) {
  const rig = useMemo(() => makeRig(id), [id])
  const still = useMemo(reducedMotion, [])
  const st = useMemo(() => ({ last: -1, life: Math.random() * 10, turn: 0 }), [])
  const inp = useMemo<PoseIn>(() => ({ act: 'stand', walk: 0, gait: 0, sit: 0, carry: null, send: 0, hold: 0, react: null, reactK: 0, glance: 0, t: 0, still: false, lit: 0 }), [])

  useEffect(() => {
    fx.figs.set(id, { pos: new Vector3(), hands: new Vector3(), head: new Vector3(), yaw: 0, action: 'stand', spot: '', arrived: true })
    return () => {
      fx.figs.delete(id)
      walkerOf[id].ready = false
    }
  }, [id])

  useFrame((_, dtReal) => {
    const t = now()
    const w = walkerOf[id]
    const world = feed.getWorld()
    let task = ''
    for (const r of world.researchers) if (r.id === id) task = r.task
    const dt = st.last < 0 ? 0 : t - st.last
    const jump = still || st.last < 0 || dt < 0 || dt > 1500
    st.last = t
    const rid = `r:${id}`
    const send = sendingOf(rid, t)
    stepWalker(w, planFor(id, task, t), t, jump ? 0 : dt, walkers, send > 0, jump)

    const dts = Math.min(dtReal, 0.1)
    st.life += dts
    const [x, z] = placeOf(w)
    rig.root.position.set(x, 0, z)
    // Turn toward the finance side while holding something up to send.
    const face = w.yaw + Math.atan2(Math.sin(Math.PI / 2 - w.yaw), Math.cos(Math.PI / 2 - w.yaw)) * Math.min(1, send * 1.4)
    rig.root.rotation.y = face

    // A glance at the nearest colleague now and then.
    let glance = 0
    if (!w.moving && !still && Math.floor(st.life / 6.5) % 3 === 1) {
      let best = 3.5
      for (const o of walkers) {
        if (o === w) continue
        const d = Math.hypot(o.x - w.x, o.z - w.z)
        if (d < best) {
          best = d
          const a = Math.atan2(o.x - w.x, o.z - w.z) - face
          glance = Math.max(-1, Math.min(1, Math.atan2(Math.sin(a), Math.cos(a))))
        }
      }
    }
    st.turn += (glance - st.turn) * Math.min(1, dts * 3)

    const re = fx.reactions.get(id)
    const reK = re && re.kind !== 'send' ? (t - re.at) / 900 : -1
    const held = fx.holding.get(id) ?? -1
    const s = ui.get()
    inp.act = w.act
    inp.walk = w.moving ? Math.min(1, w.speed / 0.6) : 0
    inp.gait = w.gait
    inp.sit = w.sit
    inp.carry = w.carry
    inp.send = send
    inp.hold = t < held ? Math.min(1, (held - t) / 300, 1) : 0
    inp.react = reK >= 0 && reK < 1 && re && re.kind !== 'send' ? re.kind : null
    inp.reactK = reK
    inp.glance = SPOTS[w.spot] && (w.act === 'scope' || w.act === 'type') ? 0 : st.turn
    inp.t = st.life
    inp.still = still
    inp.lit = s.hovered === rid || s.selected === rid ? 1 : 0
    pose(rig, inp, jump && st.life < 0.2 ? 1 : dts)
    readOut(rig)
    const f = fx.figs.get(id)
    if (f) {
      f.pos.set(x, 0, z)
      f.hands.copy(rig.hands)
      f.hands.y += 0.04
      f.head.copy(rig.headPos)
      f.yaw = face
      f.action = w.act
      f.spot = w.spot
      f.arrived = !w.moving
    }
  })

  return (
    <Pick id={`r:${id}`}>
      <primitive object={rig.root} />
    </Pick>
  )
}

export function Researchers() {
  return (
    <>
      {LAB_IDS.map(id => (
        <Researcher key={id} id={id} />
      ))}
    </>
  )
}

/** The grant manager: seated at the desk in the network, reading when a decision waits. */
export function GrantManagerFigure({ at, yaw }: { at: [number, number, number]; yaw: number }) {
  const rig = useMemo(() => makeRig('gm'), [])
  const still = useMemo(reducedMotion, [])
  const inp = useMemo<PoseIn>(() => ({ act: 'type', walk: 0, gait: 0, sit: 1, carry: null, send: 0, hold: 0, react: null, reactK: 0, glance: 0, t: 0, still: false, lit: 0 }), [])
  const st = useMemo(() => ({ life: 3 }), [])
  useFrame((_, dtReal) => {
    const dts = Math.min(dtReal, 0.1)
    st.life += dts
    const w = feed.getWorld()
    let waiting = false
    for (const h of w.holds) if (h.open) waiting = true
    const s = ui.get()
    inp.act = waiting ? 'read' : 'type'
    inp.t = st.life
    inp.still = still
    inp.lit = s.hovered === 'p:grant_manager' || s.selected === 'p:grant_manager' ? 1 : 0
    pose(rig, inp, dts)
  })
  useEffect(() => {
    rig.root.position.set(...at)
    rig.root.rotation.y = yaw
  }, [rig, at, yaw])
  return <primitive object={rig.root} />
}
