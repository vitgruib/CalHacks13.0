// The people: jointed clay figures (hips, legs, torso, head, arms, hands)
// dressed per person, with a coat or cardigan, a badge, safety glasses and
// gloves at the bench. Each lab member follows a schedule from their feed
// task, walks the aisles to get there (legs swing, arms counter, a small
// bob), works with the right action, and holds up whatever they send.

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import { DoubleSide, type BufferGeometry, type Group, type Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { feed } from '../../feed'
import { bake, shade, type Bake } from './bake'
import { CYCLE_MS, HOME, NODES_XZ, SPOTS, TASK_SPOTS, route, type Action, type Spot } from './layout'
import { M, skinMat } from './mats'
import { Pick } from './Parts'
import { bodyOf, fx, reducedMotion } from './store'

// ── Looks ─────────────────────────────────────────────────────────────────

type Hair = 'bob' | 'crop' | 'pony' | 'curly' | 'side' | 'grey'
interface Look {
  skin: string
  hair: string
  style: Hair
  shirt: string
  trousers: string
  shoes: string
  coat: 'lab' | 'cardigan' | 'blazer'
  coatColor: string
  scale: number
  badge: string
}

const LAB_COAT = '#F3F1EC'
export const LOOKS: Record<string, Look> = {
  ortiz: { skin: '#B98463', hair: '#3A2A22', style: 'bob', shirt: '#E9E1D3', trousers: '#3B414A', shoes: '#2A2622', coat: 'cardigan', coatColor: '#A85E45', scale: 0.98, badge: '#2E5BA6' },
  okafor: { skin: '#6B4430', hair: '#1B1715', style: 'crop', shirt: '#3D7A78', trousers: '#2F3540', shoes: '#3A3330', coat: 'lab', coatColor: LAB_COAT, scale: 1.04, badge: '#2E5BA6' },
  raman: { skin: '#9C6A4C', hair: '#1F1916', style: 'pony', shirt: '#C9A13E', trousers: '#33384A', shoes: '#5B5048', coat: 'lab', coatColor: LAB_COAT, scale: 0.94, badge: '#2E5BA6' },
  silva: { skin: '#D4A27C', hair: '#5A3A25', style: 'curly', shirt: '#2E4A7A', trousers: '#5A5148', shoes: '#2C2A28', coat: 'lab', coatColor: LAB_COAT, scale: 1.0, badge: '#2E5BA6' },
  park: { skin: '#E6C2A0', hair: '#141414', style: 'side', shirt: '#7C8590', trousers: '#2C3138', shoes: '#C9C3BA', coat: 'lab', coatColor: LAB_COAT, scale: 1.0, badge: '#4F9C80' },
  gm: { skin: '#8D5A3C', hair: '#A8A29A', style: 'grey', shirt: '#E9EEF2', trousers: '#2E3440', shoes: '#2A2622', coat: 'blazer', coatColor: '#3D4A5C', scale: 1.0, badge: '#C98B2E' },
}

const HIP = 0.88
const THIGH = 0.41
const SHIN = 0.4
const SHOULDER_Y = 0.47
const SHOULDER_X = 0.205
const UPPER = 0.27
const FORE = 0.25

interface FigGeo {
  pelvis: BufferGeometry
  thigh: BufferGeometry
  shin: BufferGeometry
  torso: BufferGeometry
  head: BufferGeometry
  upper: BufferGeometry
  fore: BufferGeometry
}

function figureGeo(L: Look): FigGeo {
  const coat = L.coatColor
  const fold = shade(coat, -0.05)
  const long = L.coat === 'lab'
  return {
    pelvis: bake(b => {
      b.box([0, 0.02, 0], [0.32, 0.2, 0.21], L.trousers, 0.07)
      if (long) {
        // The coat skirt, open at the front, down to the knees, with two hip pockets.
        b.arc([0, -0.15, 0], 0.205, 0.54, coat, 0.42, Math.PI * 2 - 0.84, undefined, 0.245)
        b.box([0.135, -0.1, 0.205], [0.085, 0.09, 0.012], fold, 0.005, [0, 0.55, 0])
        b.box([-0.135, -0.1, 0.205], [0.085, 0.09, 0.012], fold, 0.005, [0, -0.55, 0])
      } else b.arc([0, 0.02, 0], 0.2, 0.24, coat, 0.32, Math.PI * 2 - 0.64, undefined, 0.215)
    }),
    thigh: bake(b => b.cap([0, -0.2, 0], 0.07, 0.28, L.trousers)),
    shin: bake(b => {
      b.cap([0, -0.19, 0], 0.06, 0.28, L.trousers)
      b.box([0, -SHIN + 0.0, 0.045], [0.11, 0.085, 0.25], L.shoes, 0.035)
    }),
    torso: bake(b => {
      b.box([0, 0.24, 0], [0.33, 0.48, 0.2], L.shirt, 0.09)
      b.box([0, 0.25, -0.004], [0.37, 0.48, 0.235], coat, 0.1)
      b.ball([SHOULDER_X - 0.02, 0.45, 0], 0.075, coat)
      b.ball([-SHOULDER_X + 0.02, 0.45, 0], 0.075, coat)
      // The open V at the neck shows the shirt; lapels fold back on either side.
      b.box([0, 0.4, 0.112], [0.1, 0.17, 0.012], L.shirt, 0.004)
      b.box([0.062, 0.37, 0.12], [0.06, 0.23, 0.014], fold, 0.005, [0, 0, -0.32])
      b.box([-0.062, 0.37, 0.12], [0.06, 0.23, 0.014], fold, 0.005, [0, 0, 0.32])
      b.ring([0, 0.5, 0], 0.075, 0.024, coat, [Math.PI / 2, 0, 0])
      if (L.coat === 'blazer') b.box([0, 0.36, 0.122], [0.03, 0.14, 0.008], '#7A2E2A', 0.003)
      if (long) {
        b.box([0.1, 0.31, 0.121], [0.085, 0.085, 0.012], fold, 0.004)
        b.cyl([0.115, 0.37, 0.126], 0.008, 0.075, '#2E4A7A', 6)
      }
      for (const y of [0.17, 0.06]) b.ball([0, y, 0.118], 0.012, shade(coat, -0.18), undefined, 8)
      // The ID badge on its clip.
      b.box([-0.095, 0.31, 0.125], [0.058, 0.078, 0.01], '#F7F6F2', 0.004)
      b.box([-0.095, 0.338, 0.131], [0.058, 0.018, 0.004], L.badge, 0.002)
      b.cyl([0, 0.56, 0], 0.05, 0.1, L.skin, 12)
    }),
    head: bake(b => {
      b.ball([0, 0.13, 0], 0.125, L.skin, [0.92, 1.05, 0.98], 20)
      b.ball([0.114, 0.125, -0.005], 0.028, shade(L.skin, -0.04), undefined, 8)
      b.ball([-0.114, 0.125, -0.005], 0.028, shade(L.skin, -0.04), undefined, 8)
      b.ball([0, 0.112, 0.12], 0.022, shade(L.skin, -0.03), undefined, 8)
      b.ball([0.042, 0.145, 0.105], 0.013, '#1E1A18', undefined, 6)
      b.ball([-0.042, 0.145, 0.105], 0.013, '#1E1A18', undefined, 6)
      hair(b, L)
    }),
    upper: bake(b => b.cap([0, -0.13, 0], 0.056, 0.17, coat)),
    fore: bake(b => {
      b.cap([0, -0.12, 0], 0.05, 0.16, coat)
      b.ring([0, -0.215, 0], 0.048, 0.012, fold, [Math.PI / 2, 0, 0])
    }),
  }
}

function hair(k: Bake, L: Look) {
  const h = L.hair
  if (L.style === 'bob') {
    k.ball([0, 0.17, -0.02], 0.136, h, [1.0, 0.92, 1.0], 18)
    k.box([0, 0.075, -0.035], [0.275, 0.17, 0.215], h, 0.08)
    k.ball([0.03, 0.225, 0.075], 0.07, h, [1.5, 0.5, 0.8], 12)
  } else if (L.style === 'crop') {
    k.ball([0, 0.165, -0.012], 0.13, h, [1.0, 0.86, 1.0], 18)
  } else if (L.style === 'pony') {
    k.ball([0, 0.17, -0.016], 0.133, h, [1.0, 0.9, 1.0], 18)
    k.cap([0, 0.06, -0.165], 0.042, 0.17, h, [0.35, 0, 0])
    k.ring([0, 0.16, -0.14], 0.03, 0.012, '#B4654A', [0.4, 0, 0])
  } else if (L.style === 'curly') {
    k.ball([0, 0.17, -0.016], 0.132, h, [1.0, 0.9, 1.0], 18)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      k.ball([Math.sin(a) * 0.09, 0.245 + 0.015 * Math.cos(a * 2), Math.cos(a) * 0.07 - 0.02], 0.055, shade(h, i % 2 ? 0.03 : -0.02), undefined, 10)
    }
  } else if (L.style === 'side') {
    k.ball([0, 0.168, -0.014], 0.131, h, [1.0, 0.88, 1.0], 18)
    k.ball([0.045, 0.245, 0.04], 0.07, h, [1.5, 0.5, 1.1], 12)
  } else {
    k.ball([0, 0.16, -0.025], 0.129, h, [1.0, 0.82, 0.96], 18)
  }
}

const HAND = bake(b => {
  b.box([0, -0.05, 0], [0.065, 0.095, 0.042], '#FFFFFF', 0.02)
  b.cap([0, -0.04, 0.03], 0.014, 0.04, '#FFFFFF', [0.5, 0, 0], 8)
})
const GOGGLES = bake(b => {
  b.arc([0, 0.148, 0.0], 0.134, 0.05, '#FFFFFF', -0.95, 1.9, undefined, 0.134, 16)
  b.ring([0, 0.148, 0], 0.137, 0.006, '#FFFFFF', [Math.PI / 2, 0, 0], Math.PI * 2, 24)
})

const FIG = new MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0, side: DoubleSide })

// Things held in the hand, each one mesh.
type Prop = 'none' | 'pipette' | 'flask' | 'marker' | 'clipboard' | 'tube' | 'box' | 'plate'
const PROPS: Record<Exclude<Prop, 'none'>, BufferGeometry> = {
  pipette: bake(b => {
    b.cap([0, -0.06, 0.03], 0.02, 0.14, '#9AA4AF', undefined, 8)
    b.cyl([0, 0.04, 0.03], 0.012, 0.05, '#F2F2EE', 8)
    b.cyl([0, -0.19, 0.03], 0.003, 0.08, '#E8E3D2', 6, undefined, 0.011)
  }),
  flask: bake(b => {
    b.lathe([0, -0.13, 0.05], [[0, 0], [0.075, 0], [0.08, 0.02], [0.025, 0.13], [0.025, 0.17], [0, 0.17]], '#DCE6EE', 16)
    b.lathe([0, -0.128, 0.05], [[0, 0], [0.072, 0], [0.074, 0.02], [0.05, 0.06], [0, 0.06]], '#D9A441', 16)
  }),
  marker: bake(b => b.cap([0, -0.07, 0.03], 0.014, 0.1, '#2E4A7A', [0.4, 0, 0], 8)),
  clipboard: bake(b => {
    b.box([0, -0.09, 0.05], [0.17, 0.23, 0.012], '#8A6A48', 0.005, [-0.5, 0, 0])
    b.box([0, -0.095, 0.058], [0.145, 0.19, 0.004], '#F7F4EF', 0.002, [-0.5, 0, 0])
    b.box([0, 0.01, 0.0], [0.06, 0.02, 0.02], '#9AA4AF', 0.005, [-0.5, 0, 0])
  }),
  tube: bake(b => {
    b.cyl([0, -0.06, 0.03], 0.012, 0.09, '#E9EEF2', 8)
    b.cyl([0, -0.01, 0.03], 0.014, 0.015, '#6F62B0', 8)
  }),
  box: bake(b => {
    b.box([0.2, -0.06, 0.12], [0.34, 0.13, 0.24], '#5D7FA8', 0.02)
    b.box([0.2, 0.012, 0.12], [0.35, 0.02, 0.25], '#E7EEF4', 0.008)
  }),
  plate: bake(b => {
    b.box([0, -0.05, 0.08], [0.2, 0.025, 0.13], '#F2F0EA', 0.006, [-0.9, 0, 0])
  }),
}

// ── The rig ───────────────────────────────────────────────────────────────

interface Pose {
  crouch: number
  lean: number
  twist: number
  side: number
  nod: number
  turn: number
  sRx: number
  outR: number
  eR: number
  sLx: number
  outL: number
  eL: number
  thL: number
  thR: number
  knL: number
  knR: number
  bob: number
  seat: number
}
const blank = (): Pose => ({ crouch: 0, lean: 0, twist: 0, side: 0, nod: 0, turn: 0, sRx: 0.04, outR: 0.07, eR: -0.12, sLx: 0.04, outL: 0.07, eL: -0.12, thL: 0, thR: 0, knL: 0, knR: 0, bob: 0, seat: 0 })

interface Joints {
  root: Group
  pelvis: Group
  spine: Group
  head: Group
  shL: Group
  shR: Group
  elL: Group
  elR: Group
  hdR: Group
  thL: Group
  thR: Group
  knL: Group
  knR: Group
  handL: Mesh
  handR: Mesh
  propL: Mesh
  propR: Mesh
  goggles: Mesh
}

function useJoints() {
  return useRef<Partial<Joints>>({})
}
const ready = (j: Partial<Joints>): j is Joints => !!(j.root && j.pelvis && j.spine && j.head && j.shL && j.shR && j.elL && j.elR && j.hdR && j.thL && j.thR && j.knL && j.knR && j.handL && j.handR && j.propL && j.propR && j.goggles)

const damp = (a: number, b: number, k: number) => a + (b - a) * k

/** Ease the joints toward a pose. */
function apply(j: Joints, p: Pose, k: number) {
  const seatY = 0.5
  j.pelvis.position.y = damp(j.pelvis.position.y, (HIP - p.crouch) * (1 - p.seat) + seatY * p.seat + p.bob, k)
  j.spine.rotation.x = damp(j.spine.rotation.x, p.lean, k)
  j.spine.rotation.y = damp(j.spine.rotation.y, p.twist, k)
  j.spine.rotation.z = damp(j.spine.rotation.z, p.side, k)
  j.head.rotation.x = damp(j.head.rotation.x, p.nod, k)
  j.head.rotation.y = damp(j.head.rotation.y, p.turn, k)
  // The figure's right arm is on its -x side; "out" swings an arm away from the body.
  j.shR.rotation.x = damp(j.shR.rotation.x, p.sRx, k)
  j.shR.rotation.z = damp(j.shR.rotation.z, -p.outR, k)
  j.elR.rotation.x = damp(j.elR.rotation.x, p.eR, k)
  j.shL.rotation.x = damp(j.shL.rotation.x, p.sLx, k)
  j.shL.rotation.z = damp(j.shL.rotation.z, p.outL, k)
  j.elL.rotation.x = damp(j.elL.rotation.x, p.eL, k)
  const thL = p.thL * (1 - p.seat) - 1.5 * p.seat
  const thR = p.thR * (1 - p.seat) - 1.5 * p.seat
  j.thL.rotation.x = damp(j.thL.rotation.x, thL, k)
  j.thR.rotation.x = damp(j.thR.rotation.x, thR, k)
  j.knL.rotation.x = damp(j.knL.rotation.x, p.knL * (1 - p.seat) + 1.5 * p.seat, k)
  j.knR.rotation.x = damp(j.knR.rotation.x, p.knR * (1 - p.seat) + 1.5 * p.seat, k)
}

const pulse = (x: number) => Math.max(0, Math.sin(x)) ** 4

/** The working pose for an action, at `t` seconds into it. */
function act(p: Pose, a: Action, t: number, still: boolean) {
  const s = still ? 0 : 1
  switch (a) {
    case 'pipette':
      Object.assign(p, { sRx: -0.78, outR: 0.12, eR: -1.25 + 0.08 * s * pulse(t * 2.4), sLx: -0.55, outL: 0.1, eL: -1.35, lean: 0.12, nod: 0.38 })
      break
    case 'swirl':
      Object.assign(p, { sRx: -0.8 + 0.07 * s * Math.cos(t * 5), outR: 0.12 + 0.07 * s * Math.sin(t * 5), eR: -1.0, sLx: -0.4, eL: -0.6, lean: 0.08, nod: 0.3 })
      break
    case 'type':
      Object.assign(p, { sRx: -0.5, outR: 0.12, eR: -1.05 + 0.05 * s * Math.sin(t * 11), sLx: -0.5, outL: 0.12, eL: -1.05 + 0.05 * s * Math.cos(t * 10), lean: 0.08, nod: 0.12 })
      break
    case 'scope':
      Object.assign(p, { sRx: -0.7, outR: 0.2, eR: -0.75 + 0.05 * s * Math.sin(t * 1.3), sLx: -0.7, outL: 0.2, eL: -0.75, lean: 0.36, nod: 0.3 })
      break
    case 'cabinet':
      Object.assign(p, { sRx: -1.22 + 0.08 * s * Math.sin(t * 1.6), outR: 0.08, eR: -0.38, sLx: -1.22 + 0.08 * s * Math.sin(t * 1.6 + 1.4), outL: 0.08, eL: -0.38, lean: 0.18, nod: 0.25 })
      break
    case 'freezer': {
      const c = (t % 7) / 7
      const open = c < 0.15 ? c / 0.15 : c < 0.7 ? 1 : c < 0.85 ? 1 - (c - 0.7) / 0.15 : 0
      Object.assign(p, { sRx: -0.95 + 0.2 * open, outR: 0.1 + 0.5 * open, eR: -0.5, sLx: -0.55, outL: 0.05, eL: -1.35, lean: 0.12 * open, nod: 0.2 * open, twist: -0.25 * open })
      fx.freezer = still ? 0.6 : open
      break
    }
    case 'write':
      Object.assign(p, { sRx: -2.0 + 0.1 * s * Math.sin(t * 2.3), outR: 0.1 + 0.16 * s * Math.sin(t * 1.7), eR: -0.45, nod: -0.12 })
      break
    case 'carry':
      Object.assign(p, { sRx: -0.72, outR: 0.06, eR: -0.95, sLx: -0.72, outL: 0.06, eL: -0.95 })
      break
    case 'place':
      Object.assign(p, { sRx: -0.95 + 0.1 * s * Math.sin(t * 1.5), outR: 0.1, eR: -0.55, sLx: -0.95 + 0.1 * s * Math.sin(t * 1.5), outL: 0.1, eL: -0.55, lean: 0.16, nod: 0.32 })
      break
    case 'read':
      Object.assign(p, { sRx: -0.8, outR: -0.02, eR: -1.25, sLx: -0.8, outL: -0.02, eL: -1.25, nod: 0.38 })
      break
    case 'look':
      Object.assign(p, { sRx: -0.5, outR: -0.12, eR: -2.05, sLx: -0.35, outL: -0.18, eL: -1.4, lean: 0.1, nod: 0.18 })
      break
    case 'reach':
      Object.assign(p, { sRx: -2.35 + 0.15 * s * Math.sin(t * 0.9), outR: 0.15, eR: -0.25, sLx: -0.55, eL: -1.35, nod: -0.25 })
      break
    default:
      break
  }
}

function propsFor(a: Action, carrying: boolean): [Prop, Prop] {
  if (carrying) return ['box', 'none']
  switch (a) {
    case 'pipette':
      return ['pipette', 'tube']
    case 'swirl':
      return ['flask', 'none']
    case 'write':
      return ['marker', 'none']
    case 'read':
      return ['clipboard', 'none']
    case 'freezer':
    case 'reach':
      return ['none', 'clipboard']
    default:
      return ['none', 'none']
  }
}
const atBench = (a: Action) => a === 'pipette' || a === 'swirl' || a === 'cabinet' || a === 'place'

function setProp(m: Mesh, p: Prop) {
  m.visible = p !== 'none'
  if (p !== 'none' && m.geometry !== PROPS[p]) m.geometry = PROPS[p]
}

function Body({ geo, look, j }: { geo: FigGeo; look: Look; j: RefObject<Partial<Joints>> }) {
  const skin = skinMat(look.skin)
  const r = (k: keyof Joints) => (el: Group | Mesh | null) => {
    if (el) (j.current as Record<string, unknown>)[k] = el
  }
  const leg = (side: 1 | -1) => (
    <group ref={r(side > 0 ? 'thL' : 'thR')} position={[side * 0.095, -0.02, 0]}>
      <mesh geometry={geo.thigh} material={FIG} castShadow />
      <group ref={r(side > 0 ? 'knL' : 'knR')} position={[0, -THIGH, 0]}>
        <mesh geometry={geo.shin} material={FIG} castShadow />
      </group>
    </group>
  )
  const arm = (side: 1 | -1) => (
    <group ref={r(side > 0 ? 'shL' : 'shR')} position={[side * SHOULDER_X, SHOULDER_Y, 0]}>
      <mesh geometry={geo.upper} material={FIG} castShadow />
      <group ref={r(side > 0 ? 'elL' : 'elR')} position={[0, -UPPER, 0]}>
        <mesh geometry={geo.fore} material={FIG} castShadow />
        <group ref={side < 0 ? r('hdR') : undefined} position={[0, -FORE, 0]}>
          <mesh ref={r(side > 0 ? 'handL' : 'handR')} geometry={HAND} material={skin} castShadow />
          <mesh ref={r(side > 0 ? 'propL' : 'propR')} geometry={PROPS.tube} material={FIG} visible={false} castShadow />
        </group>
      </group>
    </group>
  )
  return (
    <group ref={r('root')} scale={look.scale}>
      <group ref={r('pelvis')} position={[0, HIP, 0]}>
        <mesh geometry={geo.pelvis} material={FIG} castShadow />
        {leg(1)}
        {leg(-1)}
        <group ref={r('spine')} position={[0, 0.1, 0]}>
          <mesh geometry={geo.torso} material={FIG} castShadow />
          <group ref={r('head')} position={[0, 0.58, 0]}>
            <mesh geometry={geo.head} material={FIG} castShadow />
            <mesh ref={r('goggles')} geometry={GOGGLES} material={M.goggles} visible={false} />
          </group>
          {arm(1)}
          {arm(-1)}
        </group>
      </group>
    </group>
  )
}

// ── Lab members: schedule, walking, sending ───────────────────────────────

interface Walk {
  pts: [number, number][]
  lens: number[]
  total: number
  s: number
}
interface Mind {
  spot: string | null
  walk: Walk | null
  last: number
  sit: number
  glanceAt: number
  glanceStart: number
  turnTo: number
  yaw: number
  phase: number
  actT: number
}

const WALK_SPEED = 1.15 // units per feed second
const STRIDE = 1.05

function nearestNode(x: number, z: number) {
  let best = 'A0'
  let bd = Infinity
  for (const [k, [nx, nz]] of Object.entries(NODES_XZ)) {
    const d = (nx - x) ** 2 + (nz - z) ** 2
    if (d < bd) {
      bd = d
      best = k
    }
  }
  return best
}

function planWalk(from: Vector3, fromSpot: Spot | null, to: Spot): Walk {
  const a = fromSpot ? fromSpot.node : nearestNode(from.x, from.z)
  const pts: [number, number][] = [[from.x, from.z], ...route(a, to.node), to.p]
  // Drop a first aisle point that would make the walk double back.
  if (pts.length > 3) {
    const [p0, p1, p2] = pts
    const back = (p1[0] - p0[0]) * (p2[0] - p1[0]) + (p1[1] - p0[1]) * (p2[1] - p1[1]) < 0
    if (back && !fromSpot) pts.splice(1, 1)
  }
  const lens = [0]
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    lens.push(total)
  }
  return { pts, lens, total, s: 0 }
}

const angleTo = (a: number, b: number) => {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

const IDS = ['ortiz', 'okafor', 'raman', 'silva', 'park']
const GEOS: Record<string, FigGeo> = Object.fromEntries([...IDS, 'gm'].map(id => [id, figureGeo(LOOKS[id])]))
const hitGeo = bake(b => b.cap([0, 0.9, 0], 0.32, 1.1, '#FFFFFF'))
const hitMat = new MeshStandardMaterial()

const pose = blank()
const BLANK = blank()

function Researcher({ id }: { id: string }) {
  const j = useJoints()
  const still = useMemo(reducedMotion, [])
  const mind = useRef<Mind>({ spot: null, walk: null, last: 0, sit: 0, glanceAt: 6000 + id.length * 1300, glanceStart: -1e9, turnTo: 0, yaw: 0, phase: 0, actT: 0 })
  const body = bodyOf(id)

  useFrame((_, rdt) => {
    const J = j.current
    if (!ready(J)) return
    const m = mind.current
    const w = feed.getWorld()
    const t = feed.now()
    let task = ''
    for (const r of w.researchers) if (r.id === id) task = r.task
    const list = TASK_SPOTS[task] ?? [HOME[id]]
    const want = list.length > 1 ? list[Math.floor(t / (CYCLE_MS[id] ?? 7000)) % list.length] : list[0]
    const spot = SPOTS[want] ?? SPOTS[HOME[id]]
    const fdt = Math.max(0, Math.min(0.25, (t - m.last) / 1000))
    m.last = t
    const dt = Math.min(rdt, 0.1)

    // A new place to be: walk there (or, with reduced motion, simply be there).
    if (m.spot !== want) {
      const from = m.spot ? SPOTS[m.spot] : null
      if (m.spot === null || still) {
        J.root.parent!.position.set(spot.p[0], 0, spot.p[1])
        m.yaw = spot.yaw
        m.sit = spot.seat ? 1 : 0
        m.walk = null
      } else m.walk = planWalk(J.root.parent!.position, m.walk ? null : from, spot)
      m.spot = want
      m.actT = 0
    }

    const holder = J.root.parent!
    const send = fx.reactions.get(id)
    const sinceSend = send && send.kind === 'send' ? t - send.at : 1e9
    const sending = sinceSend >= 0 && sinceSend < 1150
    let walking = false
    let carry = false

    if (m.walk && !sending) {
      // Stand up before walking off.
      if (m.sit > 0.02) m.sit = Math.max(0, m.sit - fdt * 2.4)
      else {
        const wk = m.walk
        // Polite passing: slow down for someone close ahead and keep to the right.
        let i = 1
        while (i < wk.pts.length - 1 && wk.lens[i] < wk.s) i++
        const [ax, az] = wk.pts[i - 1]
        const [bx, bz] = wk.pts[i]
        const sl = Math.max(1e-4, wk.lens[i] - wk.lens[i - 1])
        const dx = (bx - ax) / sl, dz = (bz - az) / sl
        let slow = 1
        let side = 0
        for (const [oid, ob] of fx.bodies) {
          if (oid === id) continue
          const ox = ob.pos.x - holder.position.x, oz = ob.pos.z - holder.position.z
          const ahead = ox * dx + oz * dz
          const lat = Math.abs(ox * dz - oz * dx)
          if (ahead > 0 && ahead < 1.2 && lat < 0.6) {
            slow = Math.min(slow, Math.max(0.25, (ahead - 0.35) / 0.85))
            side = Math.max(side, 0.24 * (1 - ahead / 1.2))
          }
        }
        wk.s = Math.min(wk.total, wk.s + WALK_SPEED * fdt * slow)
        const k = (wk.s - wk.lens[i - 1]) / sl
        const near = Math.min(wk.s, wk.total - wk.s)
        const off = side * Math.min(1, near / 0.5)
        holder.position.set(ax + (bx - ax) * Math.min(1, k) - dz * off, 0, az + (bz - az) * Math.min(1, k) + dx * off)
        m.phase += ((WALK_SPEED * fdt * slow) / STRIDE) * Math.PI * 2
        walking = fdt > 0
        carry = !!spot.carry
        m.yaw += angleTo(m.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 9)
        if (wk.s >= wk.total - 1e-3) m.walk = null
      }
    }
    if (!m.walk) {
      m.yaw += angleTo(m.yaw, spot.yaw) * Math.min(1, dt * 5)
      if (spot.seat && m.sit < 1) m.sit = Math.min(1, m.sit + fdt * 2.2)
      m.actT += fdt
    }
    holder.rotation.y = m.yaw

    // The pose: working, walking, or holding something up to send.
    Object.assign(pose, BLANK)
    const a = m.walk ? (carry ? 'carry' : 'idle') : spot.act
    if (!m.walk) act(pose, a, m.actT, still)
    if (id === 'park' && (m.walk || spot.act !== 'freezer')) fx.freezer = 0
    else if (carry) act(pose, 'carry', 0, still)
    pose.seat = m.sit
    if (walking && !still) {
      const ph = m.phase
      pose.thL = -0.42 * Math.sin(ph)
      pose.thR = 0.42 * Math.sin(ph)
      pose.knL = 0.08 + 0.7 * Math.max(0, Math.cos(ph)) ** 1.6
      pose.knR = 0.08 + 0.7 * Math.max(0, -Math.cos(ph)) ** 1.6
      pose.bob = 0.026 * Math.cos(ph * 2)
      if (!carry) {
        pose.sLx = 0.34 * Math.sin(ph)
        pose.sRx = -0.34 * Math.sin(ph)
        pose.eL = pose.eR = -0.28
      }
      pose.twist = 0.07 * Math.sin(ph)
    } else if (!still) {
      // Idle life: weight shifts, breathing, a glance at a colleague now and then.
      pose.side += 0.02 * Math.sin(t / 1400 + id.length)
      if (t > m.glanceAt) {
        m.glanceAt = t + 7000 + ((id.charCodeAt(0) * 977) % 5000)
        m.glanceStart = t
        let best: Vector3 | null = null
        let bd = 9
        for (const [oid, ob] of fx.bodies)
          if (oid !== id) {
            const d = ob.pos.distanceToSquared(holder.position)
            if (d < bd) {
              bd = d
              best = ob.pos
            }
          }
        m.turnTo = best ? Math.max(-0.8, Math.min(0.8, angleTo(m.yaw, Math.atan2(best.x - holder.position.x, best.z - holder.position.z)))) : 0.5 * Math.sin(t)
      }
      const glancing = t - m.glanceStart < 1500
      pose.turn += glancing ? m.turnTo : 0.12 * Math.sin(t / 2300 + id.length * 2)
    }

    // Sending: a small dip, then the item held up high until it leaves the hand.
    if (sending) {
      const e = sinceSend
      const dip = e < 160 ? Math.sin((Math.PI / 2) * (e / 160)) : Math.max(0, 1 - (e - 160) / 200)
      const up = e < 160 ? 0 : e < 900 ? Math.min(1, (e - 160) / 260) : Math.max(0, 1 - (e - 900) / 250)
      pose.crouch = 0.06 * dip
      pose.lean = damp(pose.lean, 0.1, dip)
      pose.sRx = damp(pose.sRx, -2.7, up)
      pose.outR = damp(pose.outR, 0.12, up)
      pose.eR = damp(pose.eR, -0.15, up)
      pose.nod = damp(pose.nod, -0.3, up)
      pose.turn = damp(pose.turn, 0, up)
    } else if (send && send.kind !== 'send' && !still) {
      const k = (t - send.at) / 900
      if (k >= 0 && k < 1) {
        const bell = Math.sin(Math.PI * k)
        if (send.kind === 'accept') {
          pose.bob += 0.07 * bell
          pose.nod = damp(pose.nod, 0.25, bell)
        } else if (send.kind === 'reject') {
          pose.lean = damp(pose.lean, -0.06, bell)
          pose.nod = damp(pose.nod, 0.55, bell)
          pose.outR = damp(pose.outR, -0.05, bell)
          pose.outL = damp(pose.outL, -0.05, bell)
        } else if (send.kind === 'hold') pose.nod = damp(pose.nod, -0.4, bell)
        else {
          pose.side = damp(pose.side, 0.1, bell)
          pose.turn = damp(pose.turn, 0.4, bell)
        }
      }
    }
    apply(J, pose, still ? 1 : 1 - Math.exp(-dt * 9))

    const [pr, pl] = sending ? (['none', 'none'] as [Prop, Prop]) : propsFor(a, carry)
    setProp(J.propR, pr)
    setProp(J.propL, pl)
    const gloved = !m.walk && atBench(spot.act) && LOOKS[id].coat === 'lab'
    J.handL.material = J.handR.material = gloved ? M.glove : skinMat(LOOKS[id].skin)
    J.goggles.visible = gloved && spot.act !== 'place'

    body.pos.copy(holder.position)
    body.yaw = m.yaw
    body.walking = walking
    body.surf = spot.surf ?? 0.94
    J.hdR.updateWorldMatrix(true, false)
    J.hdR.getWorldPosition(body.hand)
    J.head.getWorldPosition(body.head)
  })

  return (
    <Pick id={`r:${id}`}>
      <group>
        <Body geo={GEOS[id]} look={LOOKS[id]} j={j} />
        <mesh geometry={hitGeo} material={hitMat} visible={false} />
      </group>
    </Pick>
  )
}

export function Researchers() {
  return (
    <>
      {IDS.map(id => (
        <Researcher key={id} id={id} />
      ))}
    </>
  )
}

// ── The grant manager, at the desk under the mobile ───────────────────────

export function GrantManagerFigure({ waiting }: { waiting: RefObject<number> }) {
  const j = useJoints()
  const still = useMemo(reducedMotion, [])
  const body = bodyOf('gm')
  useFrame((_, rdt) => {
    const J = j.current
    if (!ready(J)) return
    const t = feed.now() / 1000
    Object.assign(pose, BLANK)
    const decided = fx.reactions.get('gm')
    const since = decided ? feed.now() - decided.at : 1e9
    if (since >= 0 && since < 900) {
      const up = Math.sin(Math.PI * (since / 900))
      act(pose, 'type', t, still)
      pose.sRx = damp(pose.sRx, -2.3, up)
      pose.eR = damp(pose.eR, -0.3, up)
      pose.nod = damp(pose.nod, -0.35, up)
    } else if (waiting.current > 0) {
      act(pose, 'look', t, still)
      pose.nod = 0.3
    } else {
      act(pose, 'type', t, still)
      if (!still) pose.turn = 0.18 * Math.sin(t / 3.1)
    }
    pose.seat = 1
    apply(J, pose, still ? 1 : 1 - Math.exp(-Math.min(rdt, 0.1) * 8))
    setProp(J.propR, 'none')
    setProp(J.propL, 'none')
    J.goggles.visible = false
    J.root.parent!.getWorldPosition(body.pos)
    J.head.getWorldPosition(body.head)
  })
  return (
    <group>
      <Body geo={GEOS.gm} look={LOOKS.gm} j={j} />
      <mesh geometry={hitGeo} material={hitMat} visible={false} />
    </group>
  )
}

