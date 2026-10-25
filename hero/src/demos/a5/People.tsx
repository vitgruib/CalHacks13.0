// The people: jointed clay figures (hips, thighs, shins, feet, a torso in a
// lab coat, head, upper arms, forearms, hands) that walk the lab's aisles
// between stations and do the work their feed task names. Where each one is
// comes from feed time, so pausing stops them mid-step and a jump puts
// everyone at their station.

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Group, Mesh, Object3D, SphereGeometry, Vector3, type BufferGeometry, type MeshStandardMaterial } from 'three'
import { feed, progress, useFlow } from '../../feed'
import { GRAPH, HOME, NODES_XZ, NODE_AT, ROUTINES, SPOTS, type Action, type Leg, type Spot } from './layout'
import { Kit, made } from './kit'
import { figureMat } from './mats'
import { Pick } from './Parts'
import { fx, now, reducedMotion, ui } from './store'

// ── Looks ────────────────────────────────────────────────────────────────

export interface Look {
  skin: string
  hair: string
  outer: string // lab coat, or the PI's blazer
  coat: boolean
  top: string
  pants: string
  shoes: string
  sole: string
  hair_: 'bun' | 'crop' | 'braid' | 'curls' | 'fringe' | 'short'
  beard?: boolean
  readers?: boolean
  badge: string
  height: number
  build: number
}

export const LOOKS: Record<string, Look> = {
  ortiz: { skin: '#B57B55', hair: '#231816', outer: '#2E5A66', coat: false, top: '#E8DCC8', pants: '#33373F', shoes: '#2A2524', sole: '#1C1A19', hair_: 'bun', readers: true, badge: '#E15FA6', height: 0.98, build: 0.95 },
  okafor: { skin: '#5A3826', hair: '#141010', outer: '#ECEEF0', coat: true, top: '#4C6DA6', pants: '#2C3240', shoes: '#E4E3DF', sole: '#9A9893', hair_: 'crop', beard: true, badge: '#E15FA6', height: 1.04, build: 1.07 },
  raman: { skin: '#9A6342', hair: '#110D0D', outer: '#F0F0EC', coat: true, top: '#8A3A4A', pants: '#383746', shoes: '#4A4A56', sole: '#2A2A30', hair_: 'braid', badge: '#3FC4DE', height: 0.95, build: 0.92 },
  silva: { skin: '#D39F79', hair: '#3A2516', outer: '#EBEDEF', coat: true, top: '#5E7E69', pants: '#685B49', shoes: '#2E2E2D', sole: '#1E1E1E', hair_: 'curls', badge: '#3FC4DE', height: 1.0, build: 1.0 },
  park: { skin: '#E3BC94', hair: '#141213', outer: '#E8EBEE', coat: true, top: '#394862', pants: '#4A5240', shoes: '#C9C3B8', sole: '#8E897F', hair_: 'fringe', badge: '#F2D16B', height: 0.99, build: 1.0 },
}
export const GM_LOOK: Look = { skin: '#7A4F33', hair: '#B9B4AC', outer: '#3B3550', coat: false, top: '#D8D2C6', pants: '#2C2F36', shoes: '#262322', sole: '#151414', hair_: 'short', readers: true, badge: '#7C93F2', height: 1.0, build: 1.02 }

const L1 = 0.42 // thigh
const L2 = 0.4 // shin
const ANK = 0.075 // ankle height
const PEL = 0.035 // hip joints below the pelvis centre
const UA = 0.28 // upper arm
const FA = 0.25 // forearm
const shade = (hex: string, k: number) => {
  const v = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + k))))
  return `#${[(v >> 16) & 255, (v >> 8) & 255, v & 255].map(f).map(x => x.toString(16).padStart(2, '0')).join('')}`
}

interface Geos {
  pelvis: BufferGeometry
  thigh: BufferGeometry
  shin: BufferGeometry
  foot: BufferGeometry
  torso: BufferGeometry
  head: BufferGeometry
  glasses: BufferGeometry
  upper: BufferGeometry
  fore: BufferGeometry
  hand: [BufferGeometry, BufferGeometry]
  glove: [BufferGeometry, BufferGeometry]
}

const GLOVE = '#7183E8'

function hair(m: Kit, k: Look) {
  const h = k.hair
  const capAt: [number, number, number] = [0, 0.122, -0.006]
  if (k.hair_ === 'crop') m.cap([0, 0.124, -0.004], 0.104, 1.28, h, [0.92, 1.12, 1.02], [-0.5, 0, 0])
  else if (k.hair_ === 'short') m.cap([0, 0.124, -0.004], 0.105, 1.32, h, [0.93, 1.12, 1.03], [-0.45, 0, 0])
  else m.cap(capAt, 0.107, 1.5, h, [0.94, 1.14, 1.04], [-0.42, 0, 0])
  if (k.hair_ === 'bun') {
    m.sphere([0, 0.075, -0.07], 0.082, h, [1.05, 0.8, 0.75], 12)
    m.sphere([0, 0.1, -0.13], 0.052, h, [1, 0.92, 0.9], 12)
  } else if (k.hair_ === 'braid') {
    m.sphere([0, 0.07, -0.07], 0.078, h, [1.08, 0.9, 0.8], 12)
    const beads: [number, number, number][] = [
      [-0.0, 0.034, -0.11],
      [-0.03, 0.018, -0.12],
      [-0.09, 0.016, -0.128],
      [-0.15, 0.015, -0.132],
    ]
    for (const [y, x, z] of beads) m.sphere([x, y, z], 0.033 - Math.abs(y) * 0.05, h, [1, 1.15, 1], 10)
    m.sphere([0.014, -0.19, -0.133], 0.016, '#C84A6A', undefined, 8)
  } else if (k.hair_ === 'curls') {
    const ring = [-2.3, -1.6, -0.9, 0.9, 1.6, 2.3, Math.PI]
    m.sphere([0, 0.21, -0.012], 0.052, h, undefined, 10)
    for (const a of ring) m.sphere([Math.sin(a) * 0.075, 0.18, Math.cos(a) * 0.075 - 0.01], 0.048, h, undefined, 10)
    for (const a of [-2.0, 2.0, Math.PI]) m.sphere([Math.sin(a) * 0.09, 0.115, Math.cos(a) * 0.08 - 0.01], 0.044, h, undefined, 10)
    for (const a of [-0.55, 0, 0.55]) m.sphere([Math.sin(a) * 0.06, 0.2, Math.cos(a) * 0.06 + 0.02], 0.04, h, undefined, 10)
  } else if (k.hair_ === 'fringe') {
    m.box([0.018, 0.19, 0.07], [0.175, 0.05, 0.055], h, 0.022, [0.5, 0, -0.14])
    m.box([0, 0.215, -0.01], [0.19, 0.05, 0.17], h, 0.025, [-0.1, 0, 0])
  }
  if (k.beard) m.band([0, 0.118, 0.006], 0.103, 1.72, 2.55, h, [0.92, 1.12, 1.02])
  if (k.readers) {
    for (const s of [-1, 1]) m.torus([s * 0.036, 0.122, 0.094], 0.024, 0.0045, '#1E2229')
    m.slab([0, 0.125, 0.097], [0.022, 0.006, 0.006], '#1E2229')
    for (const s of [-1, 1]) m.slab([s * 0.086, 0.125, 0.04], [0.006, 0.006, 0.11], '#1E2229')
  }
}

function geos(k: Look): Geos {
  const b = k.build
  const trim = shade(k.outer, k.coat ? -0.09 : -0.18)
  return {
    pelvis: made(m => {
      m.box([0, 0, 0], [0.31 * b, 0.19, 0.21], k.pants, 0.07)
      if (k.coat) {
        m.lathe([[0.172, 0.09], [0.186, -0.04], [0.213, -0.24], [0.234, -0.44]], [0, 0, -0.012], k.outer, 18, [b, 1, 0.7], [0.5, Math.PI * 2 - 1.0])
        for (const s of [-1, 1]) m.slab([s * 0.122 * b, -0.17, 0.118], [0.1, 0.1, 0.012], trim, [0, s * 0.62, 0])
      } else {
        m.lathe([[0.172, 0.1], [0.182, -0.02], [0.192, -0.12]], [0, 0, -0.008], k.outer, 18, [b, 1, 0.7], [0.42, Math.PI * 2 - 0.84])
      }
    }),
    thigh: made(m => m.capsule([0, -L1 / 2, 0], 0.07, L1 - 0.1, k.pants)),
    shin: made(m => m.capsule([0, -L2 / 2, 0], 0.057, L2 - 0.08, k.pants)),
    foot: made(m => {
      m.box([0, -0.034, 0.045], [0.1, 0.07, 0.245], k.shoes, 0.032)
      m.slab([0, -0.067, 0.045], [0.104, 0.018, 0.25], k.sole)
    }),
    torso: made(m => {
      m.lathe([[0.15, 0], [0.158, 0.12], [0.178, 0.27], [0.192, 0.36], [0.168, 0.425], [0.085, 0.46], [0.001, 0.465]], [0, 0, 0], k.top, 18, [b, 1, 0.62])
      m.lathe([[0.164, -0.02], [0.171, 0.12], [0.191, 0.27], [0.206, 0.36], [0.181, 0.428], [0.096, 0.462], [0.001, 0.468]], [0, 0, -0.004], k.outer, 18, [b, 1, 0.66], [0.3, Math.PI * 2 - 0.6])
      for (const s of [-1, 1]) {
        m.slab([s * 0.05 * b, 0.35, 0.12], [0.055, 0.17, 0.014], k.outer, [-0.15, s * 0.3, -s * 0.36])
        m.sphere([s * 0.19 * b, 0.385, 0], 0.066, k.outer, [1, 0.9, 0.95], 12)
      }
      m.torus([0, 0.445, -0.006], 0.08, 0.022, k.outer, [Math.PI / 2 - 0.25, 0, 0])
      m.cyl([0, 0.5, 0], 0.043, 0.11, k.skin, 12)
      m.slab([0.095 * b, 0.255, 0.119], [0.08, 0.075, 0.012], trim, [0.08, 0.3, 0])
      m.cyl([0.078 * b, 0.302, 0.121], 0.007, 0.07, '#2B4C9B', 6)
      m.slab([-0.1 * b, 0.27, 0.121], [0.056, 0.078, 0.01], '#F4F4F2', [0.08, -0.3, 0])
      m.slab([-0.1 * b, 0.297, 0.127], [0.056, 0.018, 0.006], k.badge, [0.08, -0.3, 0])
      m.slab([-0.1 * b, 0.316, 0.123], [0.02, 0.022, 0.012], '#9AA0A8', [0.08, -0.3, 0])
    }),
    head: made(m => {
      m.sphere([0, 0.115, 0.004], 0.1, k.skin, [0.9, 1.14, 1.0], 18)
      m.sphere([0, 0.1, 0.094], 0.019, k.skin, [1, 1.15, 1], 8)
      for (const s of [-1, 1]) m.sphere([s * 0.09, 0.105, -0.004], 0.022, k.skin, [0.5, 1, 0.8], 8)
      hair(m, k)
    }),
    glasses: made(m => {
      m.box([0, 0.128, 0.087], [0.186, 0.042, 0.036], '#C3D3E0', 0.012)
      for (const s of [-1, 1]) m.slab([s * 0.091, 0.134, 0.035], [0.01, 0.012, 0.11], '#9FB0BE')
    }),
    upper: made(m => m.capsule([0, -UA / 2, 0], 0.053, UA - 0.06, k.outer)),
    fore: made(m => {
      m.capsule([0, -FA / 2 + 0.01, 0], 0.047, FA - 0.06, k.outer)
      m.cyl([0, -FA + 0.028, 0], 0.051, 0.036, trim, 12)
      m.cyl([0, -FA - 0.004, 0], 0.031, 0.03, k.skin, 10)
    }),
    hand: [1, -1].map(s =>
      made(m => {
        m.box([0, -0.05, 0.004], [0.058, 0.092, 0.03], k.skin, 0.014)
        m.capsule([s * 0.026, -0.035, 0.018], 0.012, 0.035, k.skin, [0.4, 0, -s * 0.5])
      }),
    ) as [BufferGeometry, BufferGeometry],
    glove: [1, -1].map(s =>
      made(m => {
        m.box([0, -0.05, 0.004], [0.06, 0.094, 0.032], GLOVE, 0.014)
        m.capsule([s * 0.027, -0.035, 0.019], 0.013, 0.035, GLOVE, [0.4, 0, -s * 0.5])
        m.cyl([0, 0.0, 0], 0.037, 0.045, GLOVE, 10)
      }),
    ) as [BufferGeometry, BufferGeometry],
  }
}

// Props, shared by everyone. Built hanging from the hand (origin at the wrist).
type Prop = 'pipette' | 'flask' | 'plate' | 'marker' | 'paper' | 'clip' | 'box'
const PROPS: Record<Prop, BufferGeometry> = {
  pipette: made(m => {
    m.capsule([0, -0.075, 0.03], 0.017, 0.11, '#E9E7E1')
    m.cyl([0, -0.04, 0.03], 0.0195, 0.014, '#3A6FD8', 10)
    m.cyl([0, -0.17, 0.03], 0.003, 0.055, '#F1EAC8', 8, undefined, 0.011)
    m.cyl([0, 0.005, 0.03], 0.008, 0.03, '#C0392B', 8)
  }),
  flask: made(m => {
    m.lathe([[0.001, 0], [0.05, 0], [0.054, 0.012], [0.028, 0.085], [0.015, 0.105], [0.015, 0.14], [0.001, 0.14]], [0, -0.175, 0.03], '#DCE8EC', 14)
    m.lathe([[0.001, 0.003], [0.049, 0.003], [0.051, 0.013], [0.036, 0.05], [0.001, 0.05]], [0, -0.172, 0.03], '#E2B157', 14)
  }),
  plate: made(m => {
    m.cyl([0, -0.09, 0.035], 0.048, 0.013, '#E6EEF0', 18, [Math.PI / 2, 0, 0])
    m.cyl([0, -0.09, 0.037], 0.042, 0.011, '#D99A3A', 18, [Math.PI / 2, 0, 0])
  }),
  marker: made(m => m.cyl([0, -0.06, 0.03], 0.011, 0.11, '#2D5BD0', 8, [0.5, 0, 0])),
  paper: made(m => {
    m.slab([0, -0.09, 0.07], [0.16, 0.21, 0.004], '#F4F1EA', [-1.0, 0, 0])
    for (let i = 0; i < 4; i++) m.slab([0, -0.06 - i * 0.035 * 0.55, 0.07 + 0.003 + i * 0.035 * 0.84], [0.11, 0.006, 0.003], '#9AA3AE', [-1.0, 0, 0])
  }),
  clip: made(m => {
    m.slab([0, -0.1, 0.05], [0.16, 0.22, 0.012], '#8B6A4A', [-0.7, 0, 0])
    m.slab([0, -0.105, 0.056], [0.14, 0.18, 0.004], '#F4F1EA', [-0.7, 0, 0])
    m.slab([0, -0.02, 0.0], [0.06, 0.03, 0.02], '#9AA0A8', [-0.7, 0, 0])
  }),
  box: made(m => {
    m.box([0, 0.06, 0.3], [0.38, 0.25, 0.3], '#C9A27A', 0.02)
    m.slab([0, 0.186, 0.3], [0.08, 0.004, 0.302], '#E7D3AE')
  }),
}

// ── The rig ──────────────────────────────────────────────────────────────

interface Rig {
  root: Group
  body: Group
  pelvis: Group
  spine: Group
  head: Group
  thigh: [Group, Group]
  knee: [Group, Group]
  ankle: [Group, Group]
  shoulder: [Group, Group]
  elbow: [Group, Group]
  hand: [Mesh, Mesh]
  glove: [Mesh, Mesh]
  glasses: Mesh
  props: Record<Prop, Mesh>
  grip: Object3D
  mat: MeshStandardMaterial
}

function mesh(g: BufferGeometry, m: MeshStandardMaterial, parent: Object3D, cast = true) {
  const x = new Mesh(g, m)
  x.castShadow = cast
  x.receiveShadow = true
  parent.add(x)
  return x
}
function group(parent: Object3D, x = 0, y = 0, z = 0) {
  const g = new Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}

export function makeRig(k: Look): Rig {
  const G = geos(k)
  const mat = figureMat()
  const root = new Group()
  const body = group(root)
  body.scale.setScalar(k.height)
  const pelvis = group(body, 0, L1 + L2 + ANK + PEL, 0)
  pelvis.rotation.order = 'YXZ'
  mesh(G.pelvis, mat, pelvis)
  const legs = [-1, 1].map(s => {
    const t = group(pelvis, s * 0.09 * k.build, -PEL, 0)
    mesh(G.thigh, mat, t)
    const kn = group(t, 0, -L1, 0)
    mesh(G.shin, mat, kn)
    const an = group(kn, 0, -L2, 0)
    mesh(G.foot, mat, an, false)
    return [t, kn, an] as const
  })
  const spine = group(pelvis, 0, 0.06, 0)
  spine.rotation.order = 'YXZ'
  mesh(G.torso, mat, spine)
  const head = group(spine, 0, 0.545, 0)
  head.rotation.order = 'YXZ'
  mesh(G.head, mat, head)
  const glasses = mesh(G.glasses, mat, head, false)
  const props = {} as Record<Prop, Mesh>
  const arms = [-1, 1].map((s, i) => {
    const sh = group(spine, s * 0.2 * k.build, 0.385, 0)
    mesh(G.upper, mat, sh)
    const el = group(sh, 0, -UA, 0)
    mesh(G.fore, mat, el)
    const wr = group(el, 0, -FA, 0)
    const h = mesh(G.hand[i], mat, wr, false)
    const gl = mesh(G.glove[i], mat, wr, false)
    return [sh, el, wr, h, gl] as const
  })
  // Right hand (at -x) carries the tools, left the clipboard; the box sits on the forearms.
  const wrR = arms[0][2]
  const wrL = arms[1][2]
  for (const p of ['pipette', 'flask', 'plate', 'marker', 'paper'] as Prop[]) props[p] = mesh(PROPS[p], mat, wrR, false)
  props.clip = mesh(PROPS.clip, mat, wrL, false)
  props.box = mesh(PROPS.box, mat, spine, true)
  for (const p of Object.values(props)) p.visible = false
  const grip = new Object3D()
  grip.position.set(0, -0.11, 0.04)
  wrR.add(grip)
  return {
    root,
    body,
    pelvis,
    spine,
    head,
    thigh: [legs[0][0], legs[1][0]],
    knee: [legs[0][1], legs[1][1]],
    ankle: [legs[0][2], legs[1][2]],
    shoulder: [arms[0][0], arms[1][0]],
    elbow: [arms[0][1], arms[1][1]],
    hand: [arms[0][3], arms[1][3]],
    glove: [arms[0][4], arms[1][4]],
    glasses,
    props,
    grip,
    mat,
  }
}

// ── Poses ────────────────────────────────────────────────────────────────

/** Joint targets. Arm index 0 is the right arm (at -x), 1 the left. Angles in radians. */
function blank() {
  return {
    seat: 0, // seat height while seated, 0 when standing
    lift: 0, // extra hop
    pYaw: 0,
    pRoll: 0,
    sPitch: 0, // lean forward
    sYaw: 0,
    sRoll: 0,
    nPitch: 0, // look down
    hYaw: 0,
    hRoll: 0,
    t0: 0, // thigh forward
    t1: 0,
    k0: 0, // knee flex
    k1: 0,
    f0: 0, // foot toes-up, world
    f1: 0,
    a0: 0, // shoulder forward
    a1: 0,
    b0: 0, // shoulder out to the side
    b1: 0,
    c0: 0, // shoulder twist
    c1: 0,
    e0: 0, // elbow flex
    e1: 0,
  }
}
type Pose = ReturnType<typeof blank>
const KEYS = Object.keys(blank()) as (keyof Pose)[]

const GLOVED = new Set<Action>(['pipette', 'swirl', 'cabinet', 'inspect', 'load'])
const GOGGLED = new Set<Action>(['pipette', 'swirl', 'cabinet', 'inspect', 'load', 'freezer'])
const PROP_OF: Partial<Record<Action, Prop>> = { pipette: 'pipette', swirl: 'flask', inspect: 'plate', write: 'marker', read: 'paper' }

const wave = (t: number, period: number, ph = 0) => Math.sin(((t / period) * 2 + ph) * Math.PI)
/** 0..1 pulses: a thumb press every `period` seconds. */
const press = (t: number, period: number) => {
  const x = (t % period) / period
  return x < 0.18 ? Math.sin((x / 0.18) * Math.PI) : 0
}

/** The pose for an action at time t (seconds of feed time). `e` is seconds since it began. */
function act(o: Pose, a: Action | 'stand' | 'carry', t: number, e: number, live: boolean, seat: number) {
  Object.assign(o, BASE)
  const w = live ? 1 : 0
  switch (a) {
    case 'stand':
    case 'carry':
      o.a0 = o.a1 = 0.06
      o.b0 = o.b1 = 0.1
      o.e0 = o.e1 = 0.28
      if (a === 'carry') {
        o.a0 = o.a1 = 0.62
        o.e0 = o.e1 = 1.2
        o.c0 = 0.25
        o.c1 = -0.25
      }
      break
    case 'type':
      o.seat = seat
      o.t0 = o.t1 = 1.5
      o.k0 = o.k1 = 1.45
      o.sPitch = 0.14
      o.nPitch = 0.12 + 0.03 * w * wave(t, 7)
      o.hYaw = 0.12 * w * wave(t, 9.5)
      o.a0 = o.a1 = 0.55
      o.b0 = o.b1 = 0.14
      o.c0 = 0.3
      o.c1 = -0.3
      o.e0 = 1.25 + 0.07 * w * Math.max(0, wave(t, 0.24))
      o.e1 = 1.25 + 0.07 * w * Math.max(0, wave(t, 0.28, 0.5))
      break
    case 'write':
      o.a0 = 2.05 + 0.16 * w * wave(t, 2.6)
      o.b0 = 0.1 + 0.3 * w * wave(t, 5.2, 0.3)
      o.e0 = 0.45
      o.a1 = 0.15
      o.e1 = 0.5
      o.b1 = 0.12
      o.nPitch = -0.12
      o.hYaw = -0.15 * w * wave(t, 5.2, 0.3)
      o.sYaw = -0.08
      break
    case 'read':
      o.a0 = o.a1 = 0.72
      o.e0 = o.e1 = 1.38
      o.c0 = 0.2
      o.c1 = -0.2
      o.nPitch = 0.34 + 0.05 * w * wave(t, 6)
      o.sPitch = 0.04
      o.pRoll = 0.035 * w * wave(t, 11)
      o.k1 = 0.12
      break
    case 'look':
      o.sPitch = 0.34
      o.nPitch = 0.22
      o.a0 = 1.05 + 0.08 * w * wave(t, 3)
      o.e0 = 0.35
      o.a1 = 0.1
      o.b1 = 0.38
      o.e1 = 1.5
      o.c1 = 0.7
      o.k0 = 0.08
      o.k1 = 0.08
      break
    case 'pipette': {
      const p = live ? press(t, 1.7) : 0
      o.a0 = 0.88 + 0.05 * p
      o.b0 = 0.06
      o.e0 = 1.5 - 0.12 * p
      o.c0 = 0.15
      o.a1 = 0.62
      o.e1 = 1.55
      o.c1 = -0.35
      o.sPitch = 0.18
      o.nPitch = 0.38
      o.hYaw = 0.1 * w * wave(t, 6.8)
      break
    }
    case 'swirl':
      o.a0 = 0.78 + 0.06 * w * wave(t, 0.45)
      o.b0 = 0.1 + 0.06 * w * wave(t, 0.45, 0.5)
      o.e0 = 1.25
      o.a1 = 0.1
      o.e1 = 0.4
      o.nPitch = 0.3
      o.sPitch = 0.08
      break
    case 'cabinet':
      o.a0 = 1.22 + 0.06 * w * wave(t, 2.2)
      o.a1 = 1.22 + 0.06 * w * wave(t, 2.2, 1.1)
      o.e0 = o.e1 = 0.62
      o.c0 = 0.2
      o.c1 = -0.2
      o.sPitch = 0.22
      o.nPitch = 0.16
      break
    case 'inspect': {
      // Lifts a plate to the lamp, looks, lowers it; again with the next.
      const cyc = live ? (t % 4.6) / 4.6 : 0.5
      const up = cyc < 0.15 ? cyc / 0.15 : cyc < 0.75 ? 1 : 1 - (cyc - 0.75) / 0.25
      o.a0 = 0.6 + 0.95 * up
      o.e0 = 1.0 + 0.5 * up
      o.c0 = 0.2
      o.a1 = 0.45
      o.e1 = 1.3
      o.nPitch = 0.3 - 0.4 * up
      o.sPitch = 0.05
      break
    }
    case 'scope':
      o.sPitch = 0.52
      o.nPitch = 0.42
      o.a0 = o.a1 = 0.72
      o.e0 = o.e1 = 0.95
      o.b0 = o.b1 = 0.22
      o.e0 += 0.05 * w * wave(t, 3.1)
      o.k0 = o.k1 = 0.12
      break
    case 'adjust':
      o.sPitch = 0.3
      o.nPitch = 0.48
      o.a0 = 0.95 + 0.07 * w * wave(t, 1.9)
      o.a1 = 0.9 + 0.07 * w * wave(t, 2.3, 0.4)
      o.e0 = o.e1 = 0.7
      o.k0 = o.k1 = 0.08
      break
    case 'reach': {
      const hi = live ? 0.5 + 0.5 * wave(t, 6.5) : 0.5
      o.a0 = 1.45 + 0.85 * hi
      o.e0 = 0.35
      o.b0 = 0.12
      o.a1 = 0.62
      o.e1 = 1.45
      o.c1 = -0.3
      o.nPitch = -0.22 * hi + 0.15 * (1 - hi)
      break
    }
    case 'freezer': {
      const inside = live ? (e % 8) < 5 : true
      o.a0 = inside ? 1.32 : 0.7
      o.e0 = inside ? 0.38 : 1.4
      o.a1 = 0.64
      o.e1 = 1.5
      o.c1 = -0.3
      o.sPitch = inside ? 0.16 : 0.05
      o.nPitch = inside ? 0.1 : 0.42
      break
    }
    case 'load':
      o.sPitch = 0.68
      o.nPitch = 0.3
      o.a0 = o.a1 = 0.85 + 0.08 * w * wave(t, 2.4)
      o.e0 = o.e1 = 0.32
      o.k0 = o.k1 = 0.16
      o.t0 = o.t1 = 0.12
      break
    case 'pickup':
    case 'place': {
      // Bend down to the box (or to the shelf), straighten up with it, or let it go.
      const k = Math.min(1, e / 2.2)
      const bend = a === 'pickup' ? Math.sin(Math.min(1, k * 1.25) * Math.PI) : 0.5 * Math.sin(Math.min(1, k * 1.3) * Math.PI)
      o.sPitch = 0.75 * bend
      o.t0 = o.t1 = 0.55 * bend
      o.k0 = o.k1 = 1.0 * bend
      o.a0 = o.a1 = 0.62 + 0.25 * bend
      o.e0 = o.e1 = 1.2 - 0.7 * bend
      o.c0 = 0.25
      o.c1 = -0.25
      o.nPitch = 0.3 * bend
      break
    }
  }
}
const BASE = blank()

/** Walking: legs swing, the other arm counters, the hips bob, the heel strikes first. */
function gaitPose(o: Pose, phi: number, amp: number, carry: boolean) {
  Object.assign(o, BASE)
  for (let i = 0; i < 2; i++) {
    const f = phi + i * Math.PI
    const thigh = amp * Math.sin(f)
    const sw = Math.max(0, Math.sin(f + 2.17))
    const load = Math.max(0, Math.sin(2 * (f - Math.PI / 2)))
    const knee = 0.06 + 0.95 * amp * 2.4 * sw * sw + 0.1 * load * (Math.sin(f) > 0 ? 1 : 0)
    const d1 = Math.atan2(Math.sin(f - Math.PI / 2), Math.cos(f - Math.PI / 2))
    const d2 = Math.atan2(Math.sin(f + Math.PI / 2 - 0.3), Math.cos(f + Math.PI / 2 - 0.3))
    const foot = 0.3 * Math.exp(-(d1 * d1) / 0.2) - 0.5 * Math.exp(-(d2 * d2) / 0.16)
    if (i === 0) {
      o.t0 = thigh
      o.k0 = knee
      o.f0 = foot * amp * 2.6
      o.a0 = carry ? 0.62 : -1.15 * thigh
      o.e0 = carry ? 1.2 : 0.3 + 0.3 * Math.max(0, -Math.sin(f))
    } else {
      o.t1 = thigh
      o.k1 = knee
      o.f1 = foot * amp * 2.6
      o.a1 = carry ? 0.62 : -1.15 * thigh
      o.e1 = carry ? 1.2 : 0.3 + 0.3 * Math.max(0, -Math.sin(f))
    }
  }
  o.b0 = o.b1 = carry ? 0.1 : 0.08
  if (carry) {
    o.c0 = 0.25
    o.c1 = -0.25
  }
  o.pYaw = 0.1 * Math.sin(phi) * (amp / 0.38)
  o.sYaw = -0.13 * Math.sin(phi) * (amp / 0.38)
  o.hYaw = 0.04 * Math.sin(phi)
  o.sPitch = 0.05
  o.nPitch = 0.04
}

function apply(r: Rig, p: Pose) {
  const reach = (t: number, k: number) => L1 * Math.cos(t) + L2 * Math.cos(t - k) + ANK + PEL
  const stand = Math.max(reach(p.t0, p.k0), reach(p.t1, p.k1))
  const y = p.seat > 0.01 ? p.seat + 0.07 : stand
  r.pelvis.position.y = y + p.lift
  r.pelvis.rotation.set(0, p.pYaw, p.pRoll)
  r.spine.rotation.set(p.sPitch, p.sYaw - p.pYaw * 0.6, p.sRoll)
  r.head.rotation.set(p.nPitch, p.hYaw - p.sYaw * 0.5, p.hRoll)
  r.thigh[0].rotation.set(-p.t0, 0, 0.02)
  r.thigh[1].rotation.set(-p.t1, 0, -0.02)
  r.knee[0].rotation.x = p.k0
  r.knee[1].rotation.x = p.k1
  r.ankle[0].rotation.x = -p.f0 + p.t0 - p.k0
  r.ankle[1].rotation.x = -p.f1 + p.t1 - p.k1
  r.shoulder[0].rotation.set(-p.a0, p.c0, -p.b0)
  r.shoulder[1].rotation.set(-p.a1, p.c1, p.b1)
  r.elbow[0].rotation.x = -p.e0
  r.elbow[1].rotation.x = -p.e1
}

// ── Getting around: the aisle graph and each person's plan ───────────────

const IDS = Object.keys(NODES_XZ)
const NEXT: Record<string, Record<string, string>> = {}
{
  // All-pairs shortest paths over a couple of dozen aisle points.
  const d: Record<string, Record<string, number>> = {}
  for (const a of IDS) {
    d[a] = {}
    NEXT[a] = {}
    for (const b of IDS) d[a][b] = a === b ? 0 : Infinity
    for (const b of GRAPH[a] ?? []) {
      d[a][b] = Math.hypot(NODES_XZ[a][0] - NODES_XZ[b][0], NODES_XZ[a][1] - NODES_XZ[b][1])
      NEXT[a][b] = b
    }
    NEXT[a][a] = a
  }
  for (const k of IDS)
    for (const a of IDS)
      for (const b of IDS)
        if (d[a][k] + d[k][b] < d[a][b]) {
          d[a][b] = d[a][k] + d[k][b]
          NEXT[a][b] = NEXT[a][k]
        }
}

function nearestNode(x: number, z: number) {
  let best = IDS[0]
  let bd = Infinity
  for (const id of IDS) {
    const d = Math.hypot(NODES_XZ[id][0] - x, NODES_XZ[id][1] - z)
    if (d < bd) {
      bd = d
      best = id
    }
  }
  return best
}

/** A path from (x, z) to a spot, along the aisles, its corners rounded. */
function route(x: number, z: number, from: string, to: Spot): number[] {
  const raw: number[] = [x, z]
  let cur = from
  raw.push(...NODES_XZ[cur])
  for (let guard = 0; cur !== to.via && guard < 40; guard++) {
    cur = NEXT[cur][to.via] ?? to.via
    raw.push(...NODES_XZ[cur])
  }
  raw.push(to.x, to.z)
  // drop repeats
  const pts: number[] = []
  for (let i = 0; i < raw.length; i += 2) {
    const n = pts.length
    if (n && Math.hypot(pts[n - 2] - raw[i], pts[n - 1] - raw[i + 1]) < 0.05) continue
    pts.push(raw[i], raw[i + 1])
  }
  if (pts.length <= 4) return pts
  const out: number[] = [pts[0], pts[1]]
  for (let i = 2; i < pts.length - 2; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], bx = pts[i], bz = pts[i + 1], cx = pts[i + 2], cz = pts[i + 3]
    const l1 = Math.hypot(bx - ax, bz - az), l2 = Math.hypot(cx - bx, cz - bz)
    const r1 = Math.min(0.32, l1 / 3), r2 = Math.min(0.32, l2 / 3)
    const p1x = bx + ((ax - bx) / l1) * r1, p1z = bz + ((az - bz) / l1) * r1
    const p2x = bx + ((cx - bx) / l2) * r2, p2z = bz + ((cz - bz) / l2) * r2
    out.push(p1x, p1z, (p1x + 2 * bx + p2x) / 4, (p1z + 2 * bz + p2z) / 4, p2x, p2z)
  }
  out.push(pts[pts.length - 2], pts[pts.length - 1])
  return out
}

const SPEED = 1.15 // metres per feed second
const STRIDE = 1.3 // metres per full gait cycle
const SEND_MS = 1150

interface Walker {
  id: string
  rig: Rig
  task: string
  legs: Leg[]
  leg: number
  spot: Spot
  act: Action
  walking: boolean
  path: number[]
  seg: number
  segS: number
  actAt: number
  base: Vector3
  pos: Vector3
  yaw: number
  side: number
  phase: number
  walkW: number
  carry: boolean
  sendAt: number
  lastT: number
  cur: Pose
  tgt: Pose
  gait: Pose
  seed: number
  hover: number
}

const walkers = new Map<string, Walker>()

function legsFor(id: string, task: string): Leg[] {
  return ROUTINES[task] ?? HOME[id] ?? HOME.okafor
}

/** Places a person straight at their station: on mount, after a jump, or under reduced motion. */
function settle(w: Walker, t: number) {
  const cycle = w.legs.reduce((s, l) => s + (Number.isFinite(l.ms) ? l.ms : 0), 0)
  let i = 0
  if (cycle > 0 && w.legs.length > 1) {
    let x = t % cycle
    while (i < w.legs.length - 1 && x >= w.legs[i].ms) {
      x -= w.legs[i].ms
      i++
    }
    w.actAt = t - x
  } else w.actAt = t
  w.leg = i
  const l = w.legs[i]
  w.spot = SPOTS[l.spot]
  w.act = l.act
  w.carry = false
  w.walking = false
  w.base.set(w.spot.x, 0, w.spot.z)
  w.pos.copy(w.base)
  w.yaw = w.spot.yaw
  w.side = 0
  w.walkW = 0
}

function goTo(w: Walker, leg: number, t: number, still: boolean) {
  w.leg = leg
  const l = w.legs[leg]
  const target = SPOTS[l.spot]
  w.carry = !!l.carry
  if (still) {
    w.spot = target
    w.act = l.act
    w.walking = false
    w.base.set(target.x, 0, target.z)
    w.pos.copy(w.base)
    w.yaw = target.yaw
    w.actAt = t
    return
  }
  const from = w.walking ? nearestNode(w.base.x, w.base.z) : w.spot.via
  w.path = route(w.base.x, w.base.z, from, target)
  w.seg = 0
  w.segS = 0
  w.spot = target
  w.act = l.act
  w.walking = true
}

const yawTo = (a: number, b: number) => {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

// ── The figures ──────────────────────────────────────────────────────────

const RIDS = ['ortiz', 'okafor', 'raman', 'silva', 'park']
const INTAKE = new Vector3(...NODE_AT.intake)
const tmp = new Vector3()

function Person({ id }: { id: string }) {
  const rig = useMemo(() => makeRig(LOOKS[id]), [id])
  useEffect(
    () => () => {
      rig.mat.dispose()
    },
    [rig],
  )
  useMemo(() => {
    const t = now()
    const task = feed.getWorld().researchers.find(r => r.id === id)?.task ?? ''
    const w: Walker = {
      id,
      rig,
      task,
      legs: legsFor(id, task),
      leg: 0,
      spot: SPOTS.board,
      act: 'write',
      walking: false,
      path: [],
      seg: 0,
      segS: 0,
      actAt: t,
      base: new Vector3(),
      pos: new Vector3(),
      yaw: 0,
      side: 0,
      phase: RIDS.indexOf(id) * 1.3,
      walkW: 0,
      carry: false,
      sendAt: -1e9,
      lastT: t,
      cur: blank(),
      tgt: blank(),
      gait: blank(),
      seed: RIDS.indexOf(id) * 2.39 + 0.7,
      hover: 0,
    }
    settle(w, t)
    walkers.set(id, w)
    return w
  }, [id, rig])
  return (
    <Pick id={`r:${id}`}>
      <primitive object={rig.root} />
    </Pick>
  )
}

function Driver() {
  const still = useMemo(reducedMotion, [])
  useFlow(e => {
    const t = now()
    if (e.type === 'reset') {
      for (const w of walkers.values()) {
        w.sendAt = -1e9
        w.lastT = t
      }
    } else if (e.type === 'packet' && e.packet.from.startsWith('r:') && (e.packet.kind === 'request' || e.packet.kind === 'pushback' || e.packet.kind === 'paper')) {
      const w = walkers.get(e.packet.from.slice(2))
      if (w) w.sendAt = t
    }
  })

  useFrame((_, dtReal) => {
    const t = now()
    const world = feed.getWorld()
    const s = ui.get()
    const kd = 1 - Math.exp(-Math.min(dtReal, 0.1) * 7)
    for (const w of walkers.values()) {
      const r = world.researchers.find(x => x.id === w.id)
      const dt = (t - w.lastT) / 1000
      w.lastT = t
      const jumped = dt > 1.5 || dt < -0.05
      if (r && r.task !== w.task) {
        w.task = r.task
        w.legs = legsFor(w.id, r.task)
        if (jumped) settle(w, t)
        else goTo(w, 0, t, still)
      } else if (jumped) settle(w, t)
      const sending = t - w.sendAt >= 0 && t - w.sendAt < SEND_MS

      // Next leg of a routine.
      const leg = w.legs[w.leg]
      if (!w.walking && leg && Number.isFinite(leg.ms) && t - w.actAt > leg.ms && !sending) goTo(w, (w.leg + 1) % w.legs.length, t, still)

      // Walk.
      let desired = w.spot.yaw
      if (w.walking && !jumped) {
        let slow = 1
        // Pass politely: ease to one side and slow down for anyone just ahead.
        const n = w.path.length / 2 - 1
        const i = Math.min(w.seg, n - 1)
        const ax = w.path[i * 2], az = w.path[i * 2 + 1], bx = w.path[i * 2 + 2], bz = w.path[i * 2 + 3]
        const len = Math.hypot(bx - ax, bz - az) || 1
        const dx = (bx - ax) / len, dz = (bz - az) / len
        let push = 0
        for (const o of walkers.values()) {
          if (o === w) continue
          const ox = o.pos.x - w.base.x, oz = o.pos.z - w.base.z
          const ahead = ox * dx + oz * dz
          const lat = ox * -dz + oz * dx
          if (ahead > -0.1 && ahead < 1.15 && Math.abs(lat) < 0.62) {
            push += (lat >= 0 ? -1 : 1) * (0.62 - Math.abs(lat)) * (1 - ahead / 1.3)
            if (ahead < 0.55 && Math.abs(lat) < 0.35) slow = Math.min(slow, o.walking && RIDS.indexOf(o.id) < RIDS.indexOf(w.id) ? 0.15 : 0.45)
            else slow = Math.min(slow, 0.7)
          }
        }
        const remain = (() => {
          let d = len - w.segS
          for (let j = i + 1; j < n; j++) d += Math.hypot(w.path[j * 2 + 2] - w.path[j * 2], w.path[j * 2 + 3] - w.path[j * 2 + 1])
          return d
        })()
        const sideCap = Math.min(0.34, remain * 0.5, (w.seg === 0 ? w.segS : 1) * 0.6)
        w.side += (Math.max(-sideCap, Math.min(sideCap, push)) - w.side) * kd
        let ds = sending ? 0 : SPEED * dt * slow
        w.phase += (ds / STRIDE) * Math.PI * 2
        while (ds > 0 && w.seg < n) {
          const sx = w.path[w.seg * 2], sz = w.path[w.seg * 2 + 1], ex = w.path[w.seg * 2 + 2], ez = w.path[w.seg * 2 + 3]
          const L = Math.hypot(ex - sx, ez - sz)
          if (w.segS + ds < L) {
            w.segS += ds
            ds = 0
          } else {
            ds -= L - w.segS
            w.seg++
            w.segS = 0
          }
        }
        if (w.seg >= n) {
          w.walking = false
          w.base.set(w.spot.x, 0, w.spot.z)
          w.actAt = t
          w.carry = false
        } else {
          const sx = w.path[w.seg * 2], sz = w.path[w.seg * 2 + 1], ex = w.path[w.seg * 2 + 2], ez = w.path[w.seg * 2 + 3]
          const L = Math.hypot(ex - sx, ez - sz) || 1
          const u = w.segS / L
          w.base.set(sx + (ex - sx) * u, 0, sz + (ez - sz) * u)
          desired = Math.atan2(ex - sx, ez - sz)
          w.pos.set(w.base.x + (-(ez - sz) / L) * w.side, 0, w.base.z + ((ex - sx) / L) * w.side)
        }
      }
      if (!w.walking) {
        w.side *= 1 - kd
        w.pos.lerp(w.base, kd)
      }
      const moving = w.walking && !sending
      w.walkW += ((moving ? 1 : 0) - w.walkW) * (1 - Math.exp(-Math.min(dtReal, 0.1) * 9))
      if (still) w.walkW = 0
      w.yaw += yawTo(w.yaw, desired) * (still || jumped ? 1 : 1 - Math.exp(-Math.min(dtReal, 0.1) * 6))

      // Pose: the station's action, life on top, then the walk.
      const ts = t / 1000 + w.seed * 10
      const e = (t - w.actAt) / 1000
      const a = w.walking ? (w.carry ? 'carry' : 'stand') : w.act
      act(w.tgt, a, ts, e, !still, w.spot.seat ?? 0)
      if (!still && !w.walking) {
        // Idle life: a slow shift of weight and, now and then, a glance at a colleague.
        if (a !== 'type' && a !== 'scope' && a !== 'load') {
          w.tgt.pRoll += 0.03 * wave(ts, 9)
          w.tgt.k0 += 0.06 * Math.max(0, wave(ts, 9))
          w.tgt.k1 += 0.06 * Math.max(0, -wave(ts, 9))
        }
        const g = wave(ts, 13.7, w.seed)
        if (g > 0.86) {
          let best: Walker | null = null
          let bd = 4.5
          for (const o of walkers.values()) {
            if (o === w) continue
            const d = o.pos.distanceTo(w.pos)
            if (d < bd) {
              bd = d
              best = o
            }
          }
          if (best) {
            const rel = yawTo(w.yaw, Math.atan2(best.pos.x - w.pos.x, best.pos.z - w.pos.z))
            w.tgt.hYaw = Math.max(-1.0, Math.min(1.0, rel))
            w.tgt.sYaw = Math.max(-0.3, Math.min(0.3, rel * 0.3))
            w.tgt.nPitch = Math.min(w.tgt.nPitch, 0.05)
          }
        }
      }
      // Sending: stop, hold the thing up toward the network, then let it go.
      if (sending) {
        const k = (t - w.sendAt) / SEND_MS
        const rel = yawTo(w.yaw, Math.atan2(INTAKE.x - w.pos.x, INTAKE.z - w.pos.z))
        w.tgt.sYaw = Math.max(-0.55, Math.min(0.55, rel * 0.5))
        w.tgt.hYaw = Math.max(-1.0, Math.min(1.0, rel * 0.8))
        w.tgt.nPitch = -0.18
        w.tgt.a0 = k < 0.68 ? 2.45 : 1.75
        w.tgt.e0 = k < 0.68 ? 0.3 : 0.12
        w.tgt.b0 = 0.18
        w.tgt.c0 = 0
      }
      // Hearing back: reach out for it as it comes in, then react.
      for (const p of world.packets) {
        if (p.kind === 'verdict' && p.to === `r:${w.id}` && p.outcome !== 'hold' && progress(p, t) > 0.78) {
          w.tgt.a0 = w.tgt.a1 = 0.95
          w.tgt.e0 = w.tgt.e1 = 0.75
          w.tgt.c0 = 0.2
          w.tgt.c1 = -0.2
        }
      }
      const re = fx.reactions.get(w.id)
      if (re && re.kind !== 'send' && !still) {
        const k = (t - re.at) / 900
        if (k >= 0 && k < 1) {
          const bell = Math.sin(Math.PI * k)
          if (re.kind === 'accept') {
            w.tgt.lift = 0.04 * bell
            w.tgt.nPitch = -0.15 * bell
          } else if (re.kind === 'reject') {
            w.tgt.sPitch += 0.22 * bell
            w.tgt.nPitch += 0.35 * bell
            w.tgt.a0 = w.tgt.a1 = 0
            w.tgt.e0 = w.tgt.e1 = 0.1
          } else if (re.kind === 'refine') {
            w.tgt.hRoll = 0.28 * bell
            w.tgt.hYaw += 0.3 * bell
          }
        }
      }
      const c = w.cur
      for (const key of KEYS) c[key] += (w.tgt[key] - c[key]) * (still || jumped ? 1 : kd)
      if (w.walkW > 0.001) {
        gaitPose(w.gait, w.phase, 0.36, w.carry)
        const g = w.gait
        const k = w.walkW
        for (const key of KEYS) g[key] = c[key] + (g[key] - c[key]) * k
        apply(w.rig, g)
      } else apply(w.rig, c)

      // Props, gloves and glasses follow the action.
      const rg = w.rig
      const atBench = !w.walking && GLOVED.has(w.act)
      rg.hand[0].visible = rg.hand[1].visible = !atBench
      rg.glove[0].visible = rg.glove[1].visible = atBench
      rg.glasses.visible = !w.walking && GOGGLED.has(w.act)
      const prop = w.walking || sending ? undefined : PROP_OF[w.act]
      for (const k of ['pipette', 'flask', 'plate', 'marker', 'paper'] as Prop[]) rg.props[k].visible = prop === k
      rg.props.clip.visible = !w.walking && !sending && (w.act === 'freezer' || (w.act === 'reach' && w.id === 'park'))
      const pk = !w.walking && (w.act === 'pickup' || w.act === 'place') ? (t - w.actAt) / 2200 : -1
      rg.props.box.visible = (w.walking && w.carry) || (w.act === 'pickup' && pk > 0.5) || (w.act === 'place' && pk >= 0 && pk < 0.55)

      // Hover: a soft lift of the whole figure's brightness.
      const on = s.hovered === `r:${w.id}` || s.selected === `r:${w.id}` ? 1 : 0
      w.hover += (on - w.hover) * kd
      rg.mat.emissive.setRGB(0.09 * w.hover, 0.085 * w.hover, 0.07 * w.hover)

      rg.root.position.copy(w.pos)
      rg.root.rotation.y = w.yaw
      rg.root.updateMatrixWorld(true)
      rg.grip.getWorldPosition(fx.hand.get(w.id) ?? tmp)
      rg.spine.getWorldPosition(fx.chest.get(w.id) ?? tmp)
      fx.chest.get(w.id)?.setY(fx.chest.get(w.id)!.y + 0.3)
      fx.doing.set(w.id, w.walking ? 'walking' : w.act)
    }
  })
  return null
}

export function Researchers() {
  useEffect(() => () => walkers.clear(), [])
  return (
    <group>
      {RIDS.map(id => (
        <Person key={id} id={id} />
      ))}
      <Driver />
    </group>
  )
}

/** Where a researcher stands right now (for the hover card and the camera). */
export function personAt(id: string, out: Vector3) {
  const w = walkers.get(id)
  if (!w) return out.set(-3.4, 0, 0.2)
  return out.copy(w.pos)
}
export const isWalking = (id: string) => !!walkers.get(id)?.walking

/** One figure that only stands and works in place (the grant manager). */
export function useStillFigure(look: Look) {
  const rig = useMemo(() => makeRig(look), [look])
  const state = useMemo(() => ({ cur: blank(), tgt: blank() }), [])
  const step = (a: Action | 'stand', dtReal: number, t: number, still: boolean, extra?: (p: Pose) => void) => {
    act(state.tgt, a, t, t, !still, 0)
    if (!still) state.tgt.pRoll += 0.025 * wave(t, 10)
    extra?.(state.tgt)
    const kd = still ? 1 : 1 - Math.exp(-Math.min(dtReal, 0.1) * 6)
    for (const key of KEYS) state.cur[key] += (state.tgt[key] - state.cur[key]) * kd
    apply(rig, state.cur)
  }
  return { rig, step }
}
export type { Pose }

// Keep a reference so tree-shaking doesn't drop the shared sphere used by hair helpers.
void SphereGeometry
