// The grant office as a raised transit map. Four enamel lines, one per kind
// of traffic (requests and answers, money, readings, holds and decisions),
// run across a cream board on a slate plinth. The agents are drums standing
// on their stations, the grants are glass vessels whose money level, frost
// and padlock show what can truly be spent, the sources sit along the back
// edge, the grant manager stands on their own platform, and the vendors and
// the funder wait on pedestals outside. Nothing is labelled.

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, CylinderGeometry, InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry, type BufferGeometry, type Group, type Mesh } from 'three'
import { feed, progress, useFlow } from '../../feed'
import { Kit, type P3 } from './geo'
import { DECK_Y, DRUM, F_Y, GLAZE, GM_SLOTS, GRANT_COLOR, LINE, LINE_Y, MAP, MAP_SEGMENTS, PAL, PEDESTAL, PLINTH_H, V_Y, VESSEL_R, mapPoint } from './layout'
import { M, frostGlass, liquid } from './mats'
import { Pick } from './Parts'
import { GrantManagerFigure } from './People'
import { now, reducedMotion } from './store'

const SLATE = PAL.mapBody
const WHITE = '#F4F3EF'
const R01 = 'R01GM061721'
const R21 = 'R21AI182745'

function bx(k: Kit, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: string, r = 0) {
  return k.box([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [x1 - x0, y1 - y0, z1 - z0], c, r)
}

/** A raised strip of line from one map point to another, sloping where it crosses to a pedestal. */
function strip(k: Kit, a: P3, b: P3, color: string) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const flat = Math.hypot(dx, dz)
  const len = Math.hypot(flat, dy)
  const h = 0.06
  k.box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - h / 2, (a[2] + b[2]) / 2], [len, h, 0.18], color, 0.012, { rot: [0, Math.atan2(-dz, dx), Math.atan2(dy, flat)] })
}

function build() {
  const clay = new Kit()
  const enamel = new Kit()
  // Plinth, rim and board.
  bx(clay, MAP.x0, MAP.x1, -PLINTH_H, -0.012, MAP.z0, MAP.z1, SLATE, 0.05)
  bx(clay, MAP.x0 + 0.03, MAP.x1 - 0.03, -0.02, 0.0, MAP.z0 + 0.03, MAP.z1 - 0.03, '#36404B', 0.01)
  bx(enamel, MAP.x0 + 0.16, MAP.x1 - 0.16, -0.01, 0.03, MAP.z0 + 0.16, MAP.z1 - 0.16, PAL.board, 0.02)
  for (let x = MAP.x0 + 0.66; x < MAP.x1 - 0.2; x += 0.5) bx(enamel, x - 0.004, x + 0.004, 0.03, 0.0315, MAP.z0 + 0.2, MAP.z1 - 0.2, '#E3DED4')
  for (let z = MAP.z0 + 0.3; z < MAP.z1 - 0.2; z += 0.5) bx(enamel, MAP.x0 + 0.2, MAP.x1 - 0.2, 0.03, 0.0315, z - 0.004, z + 0.004, '#E3DED4')

  // The lines, with a round cap at every point so joints read as one stroke.
  const capped = new Set<string>()
  for (const s of MAP_SEGMENTS) {
    const a = mapPoint(s.a)
    const b = mapPoint(s.b)
    strip(enamel, a, b, LINE[s.fam])
    for (const [k, p] of [
      [s.a, a],
      [s.b, b],
    ] as const) {
      const key = `${k}:${s.fam}`
      if (capped.has(key)) continue
      capped.add(key)
      enamel.cyl([p[0], p[1] - 0.03, p[2]], 0.09, 0.06, LINE[s.fam], { seg: 20 })
    }
  }
  // Bridges out to the pedestals get a slim girder underneath.
  for (const [a, b] of [
    ['ME', 'VB'],
    ['FE', 'FB'],
  ]) {
    const p = mapPoint(a)
    const q = mapPoint(b)
    clay.box([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 0.1, p[2]], [Math.abs(q[0] - p[0]) + 0.1, 0.08, 0.1], SLATE, 0.02, { rot: [0, 0, Math.atan2(q[1] - p[1], q[0] - p[0])] })
  }

  // Interchanges where lines meet, the intake platform, siding buffers.
  for (const k of ['X', 'J2', 'RT', 'RF']) {
    const p = mapPoint(k)
    enamel.cyl([p[0], LINE_Y + 0.01, p[2]], 0.17, 0.04, WHITE, { seg: 28 })
    enamel.torus([p[0], LINE_Y + 0.03, p[2]], 0.16, 0.03, SLATE, { rot: [Math.PI / 2, 0, 0], seg: 28 })
  }
  const I = mapPoint('I')
  enamel.box([I[0] - 0.05, LINE_Y - 0.005, I[2]], [0.46, 0.05, 1.0], WHITE, 0.03)
  enamel.box([I[0] - 0.27, LINE_Y + 0.0, I[2]], [0.05, 0.06, 1.0], LINE.request, 0.02)
  enamel.box([I[0] + 0.05, LINE_Y + 0.025, I[2]], [0.2, 0.01, 0.82], '#E6E2DA', 0.004)
  for (const k of ['S1', 'S2']) {
    const p = mapPoint(k)
    clay.box([p[0], LINE_Y + 0.05, p[2]], [0.24, 0.12, 0.24], SLATE, 0.03)
    clay.box([p[0], LINE_Y + 0.12, p[2]], [0.16, 0.03, 0.16], LINE.money, 0.01)
  }

  // Agents: white drums with a slate band; lamps and pips are separate meshes.
  for (const k of ['P', 'K', 'R']) {
    const p = mapPoint(k)
    clay.cyl([p[0], 0.05, p[2]], DRUM.r + 0.08, 0.06, SLATE, { seg: 36 })
    enamel.lathe(
      [
        [0, 0.08],
        [DRUM.r, 0.08],
        [DRUM.r, DRUM.h - 0.03],
        [DRUM.r - 0.03, DRUM.h],
        [0, DRUM.h],
      ],
      WHITE,
      [p[0], 0, p[2]],
      { seg: 40 },
    )
    enamel.cyl([p[0], 0.21, p[2]], DRUM.r + 0.006, 0.07, SLATE, { seg: 40 })
    enamel.cyl([p[0], DRUM.h + 0.004, p[2]], DRUM.r - 0.1, 0.008, '#E5E2DC', { seg: 32 })
  }

  // Grants: a slate foot ringed in the grant's colour, a lid on top. Glass, money and lock move.
  for (const [g, k] of [
    [R01, 'G1'],
    [R21, 'G2'],
  ]) {
    const p = mapPoint(k)
    clay.cyl([p[0], 0.06, p[2]], VESSEL_R + 0.1, 0.1, SLATE, { seg: 36 })
    enamel.torus([p[0], 0.11, p[2]], VESSEL_R + 0.06, 0.035, GRANT_COLOR[g], { rot: [Math.PI / 2, 0, 0], seg: 40 })
    clay.cyl([p[0], 1.235, p[2]], VESSEL_R + 0.03, 0.05, SLATE, { seg: 36 })
    clay.cyl([p[0], 1.27, p[2]], 0.08, 0.03, SLATE, { seg: 16 })
  }

  // Sources: small pucks along the back edge; the lamp is instanced.
  for (const k of ['s1', 's2', 's3', 's4', 's5']) {
    const p = mapPoint(k)
    clay.cyl([p[0], 0.1, p[2]], 0.24, 0.16, SLATE, { seg: 28 })
    enamel.torus([p[0], 0.18, p[2]], 0.2, 0.02, k === 's5' ? LINE.money : LINE.reading, { rot: [Math.PI / 2, 0, 0], seg: 28 })
  }

  // The grant manager's platform, and the pads where held requests wait.
  const gm = mapPoint('GM')
  clay.cyl([gm[0], 0.05, gm[2]], 0.62, 0.06, SLATE, { seg: 40 })
  enamel.cyl([gm[0], 0.085, gm[2]], 0.56, 0.03, WHITE, { seg: 40 })
  for (const [x, z] of GM_SLOTS) enamel.cyl([x, 0.04, z], 0.3, 0.02, '#E6E2DA', { seg: 28 })

  // Vendors: a little warehouse with a roller door and cartons, on its pedestal.
  const v = PEDESTAL.vendors
  bx(clay, v[0] - 0.8, v[0] + 0.8, V_Y - 0.8, V_Y, v[2] - 0.95, v[2] + 0.95, SLATE, 0.04)
  bx(enamel, v[0] - 0.74, v[0] + 0.74, V_Y - 0.01, V_Y + 0.02, v[2] - 0.89, v[2] + 0.89, PAL.board, 0.015)
  bx(clay, v[0] - 0.15, v[0] + 0.6, V_Y + 0.02, V_Y + 0.62, v[2] - 0.75, v[2] + 0.05, '#D8D2C6', 0.02)
  bx(clay, v[0] - 0.2, v[0] + 0.65, V_Y + 0.62, V_Y + 0.67, v[2] - 0.8, v[2] + 0.1, SLATE, 0.015)
  bx(clay, v[0] - 0.155, v[0] - 0.15, V_Y + 0.05, V_Y + 0.45, v[2] - 0.6, v[2] - 0.1, '#9AA2AA')
  for (let i = 0; i < 7; i++) bx(clay, v[0] - 0.16, v[0] - 0.154, V_Y + 0.08 + i * 0.054, V_Y + 0.086 + i * 0.054, v[2] - 0.6, v[2] - 0.1, '#7E868E')
  const boxes: [number, number, number, number][] = [
    [-0.45, 0.18, 0.3, 0.26],
    [-0.45, 0.48, 0.3, 0.26],
    [-0.1, 0.5, 0.26, 0.22],
    [0.3, 0.45, 0.24, 0.2],
    [-0.45, 0.18, 0.62, 0.22],
  ]
  for (const [dx, dz, w, h] of boxes) {
    const base = V_Y + 0.02 + (h === 0.22 && dz === 0.18 ? 0.26 : 0)
    bx(clay, v[0] + dx - w / 2, v[0] + dx + w / 2, base, base + h, v[2] + dz - w / 2, v[2] + dz + w / 2, '#C49A6C', 0.012)
    bx(clay, v[0] + dx - 0.025, v[0] + dx + 0.025, base + h, base + h + 0.002, v[2] + dz - w / 2, v[2] + dz + w / 2, '#E3D2B0')
  }

  // The funder: a columned building on steps.
  const f = PEDESTAL.funder
  bx(clay, f[0] - 0.8, f[0] + 0.8, F_Y - 0.8, F_Y, f[2] - 0.9, f[2] + 0.9, SLATE, 0.04)
  bx(enamel, f[0] - 0.74, f[0] + 0.74, F_Y - 0.01, F_Y + 0.02, f[2] - 0.84, f[2] + 0.84, PAL.board, 0.015)
  for (let i = 0; i < 3; i++) bx(clay, f[0] - 0.42 + i * 0.05, f[0] + 0.62 - i * 0.02, F_Y + 0.02 + i * 0.05, F_Y + 0.07 + i * 0.05, f[2] - 0.62 + i * 0.05, f[2] + 0.62 - i * 0.05, '#E9E5DD', 0.008)
  for (let i = 0; i < 5; i++) clay.cyl([f[0] - 0.26, F_Y + 0.17 + 0.25, f[2] - 0.42 + i * 0.21], 0.045, 0.5, WHITE, { seg: 16 })
  bx(clay, f[0] - 0.2, f[0] + 0.5, F_Y + 0.17, F_Y + 0.67, f[2] - 0.48, f[2] + 0.48, '#E2DDD3', 0.01)
  bx(clay, f[0] - 0.34, f[0] + 0.56, F_Y + 0.67, F_Y + 0.75, f[2] - 0.55, f[2] + 0.55, WHITE, 0.01)
  clay.cyl([f[0] + 0.11, F_Y + 0.84, f[2]], 0.36, 1.1, '#ECE8E0', { seg: 3, rot: [Math.PI / 2, 0, Math.PI / 2] , r2: 0.36 })
  return { clay: clay.build(), enamel: enamel.build() }
}

let geo: ReturnType<typeof build> | null = null

// ── Rule runs: which request the purchasing agent is checking, and how each rule came out ──

export const ruleRun = { id: null as string | null, at: -1e9, total: 6, results: [] as boolean[] }

const pipGeo = new SphereGeometry(0.05, 12, 8)
const lampGeo = new SphereGeometry(0.075, 14, 10)
const ringGeo = new CylinderGeometry(DRUM.r - 0.035, DRUM.r - 0.035, 0.022, 40, 1, true)
const spinGeo = (() => new Kit().torus([0, 0, 0], DRUM.r - 0.16, 0.022, WHITE, { arc: 1.9, rot: [Math.PI / 2, 0, 0], seg: 18 }).build())()
const HIT = new MeshBasicMaterial({ visible: false })
const hitDrum = new CylinderGeometry(0.55, 0.55, 0.75, 16)
const hitVessel = new CylinderGeometry(0.55, 0.55, 1.45, 16)
const hitPuck = new CylinderGeometry(0.34, 0.34, 0.5, 12)

const IDLE = new Color('#8E979F')
const WORK = new Color('#FFF4D8')
const WAIT = new Color(LINE.people)
const DIM = new Color('#C9CED3')
const PASS = new Color(GLAZE.accept)
const FAIL = new Color(GLAZE.reject)
const NEXT = new Color('#FFFFFF')
const READ = new Color(LINE.reading)
const CASH = new Color(LINE.money)
const OFF = new Color('#4A535D')
const tmp = new Color()
const o = new Object3D()

const AGENTS = [
  { id: 'a:purchasing', at: 'P', role: 'purchasing' },
  { id: 'a:bookkeeping', at: 'K', role: 'bookkeeping' },
  { id: 'a:payment_report', at: 'R', role: 'payment_report' },
] as const
const SOURCES = ['s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments']
const SOURCE_AT = ['s1', 's2', 's3', 's4', 's5']

/** One agent's lamp and spinner: dim when idle, bright and turning when working, a slow berry pulse when waiting on a person. */
function AgentLamp({ i }: { i: number }) {
  const a = AGENTS[i]
  const p = mapPoint(a.at)
  const ring = useRef<Mesh>(null)
  const spin = useRef<Mesh>(null)
  const mat = useMemo(() => new MeshBasicMaterial({ color: IDLE, toneMapped: false }), [])
  const spinMat = useMemo(() => new MeshBasicMaterial({ color: LINE.request, toneMapped: false }), [])
  const still = useMemo(reducedMotion, [])
  const level = useRef(0)
  useFrame((st, dt) => {
    const w = feed.getWorld()
    const t = now()
    const waiting = w.holds.some(h => h.open && h.raisedBy === a.role)
    let working = w.packets.some(pk => (pk.from === a.id || pk.to === a.id) && progress(pk, t) > 0.5 !== (pk.from === a.id) || (pk.from === a.id && progress(pk, t) < 0.25))
    if (a.role === 'purchasing') {
      if (t - ruleRun.at < 900) working = true
      if (w.requests.some(r => r.outcome === undefined && !w.packets.some(pk => pk.refId === r.id && pk.kind === 'request'))) working = true
    }
    const target = working ? 1 : 0
    level.current += (target - level.current) * (1 - Math.exp(-Math.min(dt, 0.1) * 6))
    const hov = st.scene.userData.hovered === a.id
    if (waiting && !working) {
      const pulse = still ? 0.7 : 0.55 + 0.45 * Math.sin((st.clock.elapsedTime / 1.8) * Math.PI * 2)
      tmp.copy(IDLE).lerp(WAIT, pulse)
    } else tmp.copy(IDLE).lerp(WORK, level.current)
    if (hov) tmp.lerp(NEXT, 0.25)
    mat.color.copy(tmp)
    if (spin.current) {
      spin.current.visible = level.current > 0.05
      spin.current.scale.setScalar(0.6 + 0.4 * level.current)
      if (!still) spin.current.rotation.y -= dt * 2.6
      spinMat.color.set(a.role === 'purchasing' ? LINE.request : a.role === 'bookkeeping' ? LINE.reading : LINE.money)
    }
    if (ring.current) ring.current.position.y = DRUM.h - 0.03 + (hov ? 0.01 : 0)
  })
  return (
    <>
      <mesh ref={ring} geometry={ringGeo} material={mat} position={[p[0], DRUM.h - 0.03, p[2]]} />
      <mesh ref={spin} geometry={spinGeo} material={spinMat} position={[p[0], DRUM.h + 0.03, p[2]]} visible={false} />
    </>
  )
}

/** The six rule checks, a ring of lamps on the purchasing drum's band, lit one by one as the rules run. */
function RulePips() {
  const ref = useRef<InstancedMesh>(null)
  const p = mapPoint('P')
  useFlow(e => {
    if (e.type === 'reset') {
      ruleRun.id = null
      ruleRun.results = []
      ruleRun.at = -1e9
    }
    if (e.type !== 'rule') return
    if (e.requestId !== ruleRun.id || e.index === 0) {
      ruleRun.id = e.requestId
      ruleRun.results = []
    }
    ruleRun.results[e.index] = e.verdict.pass
    ruleRun.total = e.total
    ruleRun.at = now()
  })
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    const t = now()
    const w = feed.getWorld()
    // Mid-story with a request already being checked: show its verdicts so far.
    if (ruleRun.id === null) {
      const desk = w.requests.find(r => r.outcome === undefined && r.verdicts.length > 0 && !w.packets.some(pk => pk.refId === r.id && pk.kind === 'request'))
      if (desk) {
        ruleRun.id = desk.id
        ruleRun.results = desk.verdicts.map(v => v.pass)
        ruleRun.at = t
      }
    }
    const live = t - ruleRun.at < 5200 && ruleRun.id !== null
    const req = live ? w.requests.find(r => r.id === ruleRun.id) : undefined
    const settled = req && req.outcome !== undefined && t - ruleRun.at > 2600
    for (let i = 0; i < 6; i++) {
      const a = -0.5 + (i - 2.5) * 0.3
      o.position.set(p[0] + Math.sin(a) * (DRUM.r + 0.012), 0.21, p[2] + Math.cos(a) * (DRUM.r + 0.012))
      o.scale.setScalar(1)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      const r = live && !settled ? ruleRun.results[i] : undefined
      if (r === true) tmp.copy(PASS)
      else if (r === false) tmp.copy(FAIL)
      else if (live && !settled && i === ruleRun.results.length) tmp.copy(DIM).lerp(NEXT, 0.5 + 0.5 * Math.sin(clock.elapsedTime * 14))
      else tmp.copy(DIM)
      m.setColorAt(i, tmp)
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[pipGeo, M.glow, 6]} frustumCulled={false} />
}

/** Source lamps flash when they send a reading or a payment. */
function SourceLamps() {
  const ref = useRef<InstancedMesh>(null)
  const still = useMemo(reducedMotion, [])
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const w = feed.getWorld()
    const t = now()
    SOURCES.forEach((id, i) => {
      const p = mapPoint(SOURCE_AT[i])
      let k = 0
      for (const pk of w.packets) if (pk.from === id) k = Math.max(k, 1 - progress(pk, t) * 2.2)
      k = Math.max(0, k)
      o.position.set(p[0], 0.21, p[2])
      o.scale.setScalar(still ? 1 : 1 + 0.25 * k)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      tmp.copy(OFF).lerp(id === 's:payments' ? CASH : READ, 0.35 + 0.65 * k)
      m.setColorAt(i, tmp)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[lampGeo, M.glow, 5]} frustumCulled={false} />
}

// ── Grants ────────────────────────────────────────────────────────────────

const glassGeo = new CylinderGeometry(VESSEL_R, VESSEL_R, 1.1, 40, 1, true)
const fluidGeo = (() => {
  const g = new CylinderGeometry(VESSEL_R - 0.03, VESSEL_R - 0.03, 1, 36)
  g.translate(0, 0.5, 0)
  return g
})()
const lockGeo = (() =>
  new Kit()
    .box([0, 0, 0], [0.2, 0.17, 0.07], '#B98E3E', 0.02)
    .torus([0, 0.09, 0], 0.065, 0.018, '#8E969E', { arc: Math.PI, seg: 14 })
    .cyl([0, -0.01, 0.036], 0.018, 0.01, '#5E4A26', { seg: 10, rot: [Math.PI / 2, 0, 0] })
    .build())()
const sealGeo = (() =>
  new Kit()
    .cyl([0, 0, 0], 0.11, 0.025, '#C9A24A', { seg: 24, rot: [Math.PI / 2, 0, 0] })
    .torus([0, 0, 0.013], 0.085, 0.01, '#E3C474', { seg: 24 })
    .box([-0.04, -0.13, 0], [0.04, 0.12, 0.01], '#2E5BA6', 0, { rot: [0, 0, 0.25] })
    .box([0.04, -0.13, 0], [0.04, 0.12, 0.01], '#2E5BA6', 0, { rot: [0, 0, -0.25] })
    .build())()

function Vessel({ grantId, at }: { grantId: string; at: string }) {
  const p = mapPoint(at)
  const glass = useMemo(frostGlass, [])
  const fluid = useMemo(() => liquid(LINE.money), [])
  const fill = useRef<Mesh>(null)
  const lock = useRef<Group>(null)
  const seal = useRef<Mesh>(null)
  const still = useMemo(reducedMotion, [])
  const s = useRef({ fill: -1, frost: -1, lock: -1, seal: 0, pulse: 0, avail: -1 })
  useFrame((st, dt) => {
    const g = feed.getWorld().grants.find(x => x.id === grantId)
    if (!g) return
    const k = still ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 3)
    const v = s.current
    const fillT = Math.max(0.03, Math.min(1, g.available / Math.max(1, g.awarded)))
    if (v.fill < 0) v.fill = fillT
    if (v.avail >= 0 && g.available !== v.avail) v.pulse = 1
    v.avail = g.available
    v.fill += (fillT - v.fill) * k
    const frostT = g.frozen ? 1 : 0
    if (v.frost < 0) v.frost = frostT
    v.frost += (frostT - v.frost) * (still ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 1.6))
    if (v.lock < 0) v.lock = frostT
    v.lock += (frostT - v.lock) * (still ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 2.4))
    const sealT = g.frozen && g.status === 'restored_by_court' ? 1 : 0
    v.seal += (sealT - v.seal) * k
    v.pulse = Math.max(0, v.pulse - dt * 1.4)
    glass.userData.u.uFrost.value = v.frost
    fluid.userData.u.uPulse.value = v.pulse + (st.scene.userData.hovered === `g:${grantId}` ? 0.25 : 0)
    if (fill.current) fill.current.scale.y = v.fill * 1.04
    if (lock.current) {
      // Locked: it hangs on the front of the glass. Unlocked: it drops to the foot and shrinks away.
      const l = v.lock
      lock.current.visible = l > 0.02
      lock.current.position.y = 0.25 + 0.5 * l
      lock.current.scale.setScalar(Math.max(0.001, Math.min(1, l * 1.6)))
      lock.current.rotation.z = (1 - l) * 0.6
    }
    if (seal.current) {
      seal.current.visible = v.seal > 0.02
      seal.current.scale.setScalar(Math.max(0.001, v.seal))
    }
  })
  // The front of the vessel faces the hero camera (front left).
  const fa = -0.5
  const fx = Math.sin(fa) * (VESSEL_R + 0.05)
  const fz = Math.cos(fa) * (VESSEL_R + 0.05)
  return (
    <group position={[p[0], 0, p[2]]}>
      <mesh ref={fill} geometry={fluidGeo} material={fluid} position={[0, 0.13, 0]} castShadow={false} />
      <mesh geometry={glassGeo} material={glass} position={[0, 0.67, 0]} renderOrder={2} />
      <group ref={lock} position={[fx, 0.75, fz]} rotation={[0, fa, 0]}>
        <mesh geometry={lockGeo} material={M.clay} castShadow />
      </group>
      <mesh ref={seal} geometry={sealGeo} material={M.clay} position={[fx + Math.cos(fa) * 0.26, 0.85, fz - Math.sin(fa) * 0.26]} rotation={[0, fa, 0]} castShadow />
      <Pick id={`g:${grantId}`}>
        <mesh geometry={hitVessel} material={HIT} position={[0, 0.7, 0]} />
      </Pick>
    </group>
  )
}

/** The grant manager's platform ring: a slow pulse while decisions wait. */
function GmRing() {
  const p = mapPoint('GM')
  const mat = useMemo(() => new MeshBasicMaterial({ color: LINE.people, toneMapped: false }), [])
  const still = useMemo(reducedMotion, [])
  const geom = useMemo(() => new Kit().torus([0, 0, 0], 0.58, 0.035, WHITE, { rot: [Math.PI / 2, 0, 0], seg: 48 }).build(), [])
  useFrame(st => {
    const waiting = feed.getWorld().holds.some(h => h.open)
    const k = waiting ? (still ? 1 : 0.55 + 0.45 * Math.sin((st.clock.elapsedTime / 1.8) * Math.PI * 2)) : 0
    mat.color.set(LINE.people).lerp(tmp.set('#E9D6DF'), 1 - k)
  })
  return <mesh geometry={geom} material={mat} position={[p[0], 0.1, p[2]]} />
}

export function OfficePlinth() {
  const g = useMemo(() => (geo ??= build()), [])
  const gm = mapPoint('GM')
  const solid = (geom: BufferGeometry, m: typeof M.clay | typeof M.enamel) => <mesh geometry={geom} material={m} castShadow receiveShadow />
  return (
    <group>
      {solid(g.clay, M.clay)}
      {solid(g.enamel, M.enamel)}
      {AGENTS.map((a, i) => {
        const p = mapPoint(a.at)
        return (
          <group key={a.id}>
            <AgentLamp i={i} />
            <Pick id={a.id}>
              <mesh geometry={hitDrum} material={HIT} position={[p[0], 0.35, p[2]]} />
            </Pick>
          </group>
        )
      })}
      <RulePips />
      <SourceLamps />
      {SOURCES.map((id, i) => {
        const p = mapPoint(SOURCE_AT[i])
        return (
          <Pick key={id} id={id}>
            <mesh geometry={hitPuck} material={HIT} position={[p[0], 0.25, p[2]]} />
          </Pick>
        )
      })}
      <Vessel grantId={R01} at="G1" />
      <Vessel grantId={R21} at="G2" />
      <GmRing />
      <GrantManagerFigure at={[gm[0], DECK_Y + 0.02, gm[2]]} />
      <Pick id="v:vendors">
        <mesh material={HIT} position={[PEDESTAL.vendors[0], V_Y + 0.4, PEDESTAL.vendors[2]]}>
          <boxGeometry args={[1.5, 0.9, 1.8]} />
        </mesh>
      </Pick>
      <Pick id="p:funder">
        <mesh material={HIT} position={[PEDESTAL.funder[0], F_Y + 0.5, PEDESTAL.funder[2]]}>
          <boxGeometry args={[1.5, 1.1, 1.7]} />
        </mesh>
      </Pick>
    </group>
  )
}
