// The grant office as it really works: a round table with the one shared
// record at its centre. The three agents and the grant manager sit around
// it and never talk to each other directly; every packet goes into the
// record and back out. The two grants are vessels inside the ring, filled
// to what is truly available, under a frosted bell jar with a padlock while
// frozen. The outside sources are posts on the rim; vendors and the funder
// stand outside on pedestals. Spokes in the table light under whatever is
// travelling. Nothing here is labelled; the hover card and the sidebar
// carry the words.

import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  Vector3,
  type Group,
  type Mesh,
} from 'three'
import { feed, useFlow } from '../../feed'
import type { Packet, Verdict } from '../../feed'
import { Batch, cylinder, lathe, merge, placed, roundedBox } from './batch'
import { trailColor } from './colors'
import {
  DESK_SPOT,
  FUNDER,
  GM_DESK,
  GRANT_HUE,
  NODE_DEG,
  PAL,
  RECORD_H,
  RESERVOIRS,
  SOURCES,
  TABLE,
  TABLE_R,
  VENDORS,
  polar,
  spot,
} from './layout'
import { M, glass, liquid, tone } from './mats'
import { Pick } from './Parts'
import { IN_HAND, handHeld, splitOf, travel } from './routes'
import { fx, now, reducedMotion } from './store'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const easeOut = (t: number) => 1 - (1 - t) ** 3
const [TX, , TZ] = TABLE

const AGENTS = ['a:purchasing', 'a:bookkeeping', 'a:payment_report'] as const
const ROLE: Record<string, string> = { 'a:purchasing': 'purchasing', 'a:bookkeeping': 'bookkeeping', 'a:payment_report': 'payment_report' }

// ── The pod every agent shares ───────────────────────────────────────────
const POD = lathe(
  [
    [0.001, 0],
    [0.4, 0],
    [0.43, 0.05],
    [0.44, 0.2],
    [0.41, 0.42],
    [0.34, 0.56],
    [0.27, 0.62],
    [0.001, 0.63],
  ],
  40,
)
const LENS_Y = 0.6

// ── Static table, merged ─────────────────────────────────────────────────

function nodeRadius(id: string) {
  if (id.startsWith('a:')) return 2.55 - 0.46
  if (id === 'p:grant_manager') return 2.2 - 0.3
  if (id.startsWith('g:')) return 1.72 - 0.62
  if (id.startsWith('s:')) return 3.62 - 0.14
  return TABLE_R - 0.08
}
export const SPOKES = Object.keys(NODE_DEG)
const SPOKE_R0 = 0.86

function build() {
  const b = new Batch()
  const groove = tone('#222932', 0.8)
  // A clay drum under a dark epoxy top, like the lab's own benches.
  b.cyl([TX, -0.56, TZ], TABLE_R, 1.1, M.labBody, 96)
  b.cyl([TX, -0.012, TZ], TABLE_R - 0.12, 0.03, M.tableTop, 96)
  b.ring([TX, 0, TZ], TABLE_R - 0.08, 0.045, M.officeTop, [Math.PI / 2, 0, 0])
  b.ring([TX, 0.004, TZ], 1.28, 0.012, groove, [Math.PI / 2, 0, 0], Math.PI * 2, false)
  // A groove from every seat to the record: the spokes.
  for (const id of SPOKES) {
    const deg = NODE_DEG[id]
    const r1 = nodeRadius(id)
    const [x, , z] = polar(deg, (SPOKE_R0 + r1) / 2)
    b.box([x, 0.004, z], [r1 - SPOKE_R0, 0.008, 0.075], groove, 0.003, [0, (-deg * Math.PI) / 180, 0], false)
  }

  // The shared record: ledger plates stacked on a base, a light at its core.
  b.cyl([TX, 0.04, TZ], 0.8, 0.08, M.slateDeep, 48)
  for (let i = 0; i < 5; i++) {
    const r = 0.62 - i * 0.022
    b.cyl([TX, 0.14 + i * 0.112, TZ], r, 0.086, i % 2 ? M.porcelain : M.chalk, 48)
    b.cyl([TX, 0.19 + i * 0.112, TZ], r - 0.03, 0.026, M.slateDeep, 48, undefined, undefined, false)
  }

  // Agent pods, each facing the record.
  for (const id of AGENTS) {
    const [x, , z] = polar(NODE_DEG[id], 2.55)
    b.cyl([x, 0.025, z], 0.5, 0.05, M.slateDeep, 40)
    b.add(POD, M.chalk, [x, 0.04, z])
  }
  // The purchasing tray, where a request waits while the rules run.
  b.cyl([DESK_SPOT[0], 0.07, DESK_SPOT[2]], 0.12, 0.14, M.slateDeep, 20)
  b.cyl([DESK_SPOT[0], 0.16, DESK_SPOT[2]], 0.5, 0.04, M.slate, 48)
  b.ring([DESK_SPOT[0], 0.18, DESK_SPOT[2]], 0.48, 0.02, M.officeTop, [Math.PI / 2, 0, 0])

  // The grant manager's standing desk.
  b.at(GM_DESK, 0, () => {
    b.box([0, 0.7, 0], [1.1, 0.04, 0.5], M.slate, 0.012)
    for (const dx of [-0.46, 0.46]) b.box([dx, 0.35, 0], [0.05, 0.7, 0.4], M.slateDeep, 0.012)
    b.box([0, 0.12, 0], [0.92, 0.04, 0.3], M.slateDeep, 0.01)
    b.box([0.32, 0.73, -0.12], [0.3, 0.02, 0.2], M.paper, 0.004, [0, 0.12, 0])
  })

  // Grant vessels: a base, the clay vessel, a band in the grant's own colour.
  for (const [gid, p] of Object.entries(RESERVOIRS)) {
    b.cyl([p[0], 0.025, p[2]], 0.7, 0.05, M.slateDeep, 56)
    b.add(VESSEL, M.chalk, [p[0], 0.05, p[2]])
    b.ring([p[0], 0.05 + 0.56, p[2]], 0.54, 0.035, tone(GRANT_HUE[gid] ?? PAL.clay, 0.5), [Math.PI / 2, 0, 0], Math.PI * 2, false)
  }

  // Source posts on the rim.
  for (const p of Object.values(SOURCES)) {
    b.cyl([p[0], 0.02, p[2]], 0.17, 0.04, M.slateDeep, 24)
    b.cyl([p[0], 0.26, p[2]], 0.075, 0.48, M.slate, 20, undefined, 0.09)
    b.ring([p[0], 0.5, p[2]], 0.1, 0.022, M.officeTop, [Math.PI / 2, 0, 0])
  }

  // Vendors: a pedestal with stacked cartons. The funder: a pedestal with a small hall.
  b.at(VENDORS, (-NODE_DEG['v:vendors'] * Math.PI) / 180, () => {
    b.cyl([0, -0.4, 0], 0.95, 0.8, M.clay, 48)
    b.cyl([0, -0.02, 0], 0.98, 0.04, M.clayDeep, 48)
    b.box([-0.18, 0.22, -0.12], [0.56, 0.44, 0.5], M.carton, 0.04)
    b.box([0.36, 0.17, 0.22], [0.44, 0.34, 0.42], M.carton, 0.04, [0, 0.4, 0])
    b.box([-0.14, 0.6, -0.1], [0.42, 0.32, 0.38], M.carton, 0.04, [0, -0.25, 0])
    b.box([-0.18, 0.442, -0.12], [0.1, 0.008, 0.502], M.tape, 0.002, undefined, false)
    b.box([-0.14, 0.762, -0.1], [0.08, 0.008, 0.382], M.tape, 0.002, [0, -0.25, 0], false)
  })
  b.at(FUNDER, (-NODE_DEG['p:funder'] * Math.PI) / 180 + Math.PI / 2, () => {
    b.cyl([0, -0.45, 0], 0.95, 0.9, M.clay, 48)
    b.cyl([0, -0.02, 0], 0.98, 0.04, M.clayDeep, 48)
    b.box([0, 0.06, 0], [1.2, 0.12, 0.8], M.porcelain, 0.02)
    for (let i = 0; i < 5; i++) b.cyl([-0.48 + i * 0.24, 0.42, 0.3], 0.055, 0.6, M.chalk, 16)
    b.box([0, 0.42, -0.08], [1.0, 0.6, 0.42], M.porcelain, 0.02)
    b.box([0, 0.76, 0], [1.24, 0.08, 0.84], M.porcelain, 0.02)
    b.add(ROOF, M.chalk, [0, 0.8, 0])
  })
  return b.build()
}

const VESSEL = lathe(
  [
    [0.001, 0],
    [0.5, 0],
    [0.535, 0.03],
    [0.535, 0.61],
    [0.515, 0.645],
    [0.477, 0.645],
    [0.462, 0.61],
    [0.462, 0.075],
    [0.001, 0.075],
  ],
  64,
)
const ROOF = cylinder(0.001, 0.32, 4, 0.82).rotateY(Math.PI / 4).scale(1.05, 1, 0.68).translate(0, 0.16, 0)

// ── The record: its core glows and its top plate lifts as packets pass through ──

const coreGeo = cylinder(0.44, 0.6, 40)
const topGeo = cylinder(0.5, 0.06, 48)
const capGeo = cylinder(0.32, 0.012, 40)

function passing(t: number) {
  // How strongly something is passing through the record right now.
  let k = 0
  for (const p of feed.getWorld().packets) {
    if (handHeld(p) && (t - p.sentAt) / p.ms < IN_HAND) continue
    const u = travel(p, t)
    const d = Math.abs(u - splitOf(p)) * p.ms * (handHeld(p) ? 0.7 : 1)
    k = Math.max(k, Math.exp(-((d / 260) ** 2)))
  }
  return k
}

function Record() {
  const top = useRef<Group>(null)
  const coreMat = useMemo(() => new MeshStandardMaterial({ color: '#DCEBF5', roughness: 0.4, emissive: new Color('#BFE3F2'), emissiveIntensity: 0.25 }), [])
  const capMat = useMemo(() => new MeshBasicMaterial({ color: '#F3F8FF', toneMapped: false, transparent: true, opacity: 0.5 }), [])
  const still = useMemo(reducedMotion, [])
  const lvl = useRef(0)
  useFrame((_, dt) => {
    const t = now()
    const k = passing(t)
    lvl.current += (k - lvl.current) * Math.min(1, dt * 12)
    const breathe = still ? 0 : 0.04 * Math.sin(performance.now() / 1300)
    coreMat.emissiveIntensity = 0.22 + breathe + lvl.current * 1.1
    capMat.opacity = 0.35 + lvl.current * 0.65
    if (top.current) top.current.position.y = RECORD_H - 0.05 + (still ? 0 : 0.05 * lvl.current)
  })
  return (
    <Pick id="x:record" select={false}>
      <mesh geometry={coreGeo} material={coreMat} position={[TX, 0.44, TZ]} />
      <group ref={top} position={[TX, RECORD_H - 0.05, TZ]}>
        <mesh geometry={topGeo} material={M.porcelain} castShadow />
        <mesh geometry={capGeo} material={capMat} position={[0, 0.034, 0]} />
      </group>
      <mesh geometry={proxyRecord} material={M.hidden} position={[TX, 0.45, TZ]} />
    </Pick>
  )
}

// ── Agents: a lens and collar that show idle, working, or waiting on a person ──

const lensGeo = merge([placed(new TorusGeometry(0.265, 0.03, 10, 40), [0, 0.02, 0], [Math.PI / 2, 0, 0]), placed(sphereTop(0.2), [0, 0, 0])])
function sphereTop(r: number) {
  return lathe(
    Array.from({ length: 10 }, (_, i) => {
      const a = (i / 9) * (Math.PI / 2)
      return [Math.max(0.001, r * Math.cos(a)), r * Math.sin(a) * 0.8] as [number, number]
    }),
    32,
  )
}
const IDLE = new Color('#9AA6B3')
const WORK = new Color('#F3F8FF')
const WAIT = new Color(PAL.cobalt).offsetHSL(0, 0, 0.12)

interface RuleRun {
  requestId: string
  total: number
  verdicts: (Verdict | undefined)[]
  litAt: number[]
  last: number
  done: number
}
const run: { cur: RuleRun | null } = { cur: null }

/** What an agent is doing right now, for its lens and for the hover card. */
export function agentState(id: string, t = now()): 'idle' | 'working' | 'waiting' {
  const w = feed.getWorld()
  const role = ROLE[id]
  if (w.packets.some(p => p.from === id || p.to === id)) return 'working'
  if (id === 'a:purchasing' && run.cur && (run.cur.done === 0 ? t - run.cur.last < 2500 : t - run.cur.done < 400)) return 'working'
  if (t - (fx.pulses.get(id) ?? -1e9) < 700) return 'working'
  if (w.holds.some(h => h.open && h.raisedBy === role)) return 'waiting'
  return 'idle'
}

function Agent({ id }: { id: string }) {
  const p = polar(NODE_DEG[id], 2.55)
  const mat = useMemo(() => new MeshStandardMaterial({ color: '#C9D2DB', roughness: 0.3, emissive: new Color('#000000'), emissiveIntensity: 1 }), [])
  const lens = useRef<Mesh>(null)
  const still = useMemo(reducedMotion, [])
  const cur = useMemo(() => new Color(), [])
  useFrame((_, dt) => {
    const t = now()
    const s = agentState(id, t)
    const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(performance.now() / 260)
    const breathe = still ? 0 : 0.05 * Math.sin(performance.now() / 1500 + p[0])
    const target = s === 'working' ? WORK : s === 'waiting' ? WAIT : IDLE
    const k = Math.min(1, dt * 8)
    cur.lerp(target, k)
    mat.color.copy(cur)
    mat.emissive.copy(cur)
    const e = s === 'working' ? 0.95 : s === 'waiting' ? 0.35 + 0.45 * pulse : 0.12 + breathe
    mat.emissiveIntensity += (e - mat.emissiveIntensity) * k
    if (lens.current) lens.current.position.y = 0.04 + LENS_Y + (s === 'working' && !still ? 0.02 * Math.sin(performance.now() / 120) : 0)
  })
  return (
    <Pick id={id}>
      <mesh ref={lens} geometry={lensGeo} material={mat} position={[p[0], 0.04 + LENS_Y, p[2]]} />
      <mesh geometry={proxyPod} material={M.hidden} position={[p[0], 0.45, p[2]]} />
    </Pick>
  )
}

// ── The six rule checks, lit one by one around the purchasing tray ───────

const SLOTS = 9
const pipGeo = new TorusGeometry(0.05, 0.022, 8, 20).rotateX(Math.PI / 2)
const pipCore = cylinder(0.04, 0.03, 16)
const PIP_IDLE = new Color('#56626F')
const PIP_PASS = new Color(PAL.celadon).offsetHSL(0, 0, 0.08)
const PIP_FAIL = new Color('#D0463E')
const o = new Object3D()

/** The request on the tray, if any: arrived, checked, no answer yet. */
function onDesk() {
  const w = feed.getWorld()
  return w.requests.find(r => r.outcome === undefined && r.verdicts.length > 0 && !w.packets.some(p => p.refId === r.id && p.kind === 'request'))
}

function Pips() {
  const ref = useRef<InstancedMesh>(null)
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), [])
  const still = useMemo(reducedMotion, [])
  const cols = useMemo(() => Array.from({ length: SLOTS }, () => PIP_IDLE.clone()), [])
  useFlow(e => {
    const t = now()
    if (e.type === 'reset') run.cur = null
    else if (e.type === 'rule') {
      let r = run.cur
      if (!r || r.requestId !== e.requestId || e.index === 0) {
        const req = feed.getWorld().requests.find(q => q.id === e.requestId)
        r = { requestId: e.requestId, total: e.total, verdicts: req ? req.verdicts.slice(0, e.index) : [], litAt: [], last: t, done: 0 }
        run.cur = r
      }
      r.verdicts[e.index] = e.verdict
      r.litAt[e.index] = t
      r.total = e.total
      r.last = t
    } else if (e.type === 'packet' && run.cur && e.packet.refId === run.cur.requestId && (e.packet.kind === 'verdict' || e.packet.kind === 'hold')) run.cur.done = t
  })
  useEffect(() => {
    // Mounting mid-story: whatever is on the tray shows as already checked.
    const r = onDesk()
    if (r) run.cur = { requestId: r.id, total: r.verdicts.length, verdicts: [...r.verdicts], litAt: [], last: now(), done: 0 }
  }, [])
  useFrame((_, dt) => {
    const m = ref.current
    if (!m) return
    const r = run.cur
    const t = now()
    const idle = !r || (r.done > 0 && t - r.done > 1800) || t - r.last > 9000
    const n = idle || !r ? 6 : Math.min(SLOTS, r.total)
    const k = Math.min(1, dt * 10)
    for (let i = 0; i < n; i++) {
      // An arc on the side of the tray that faces the camera.
      const a = ((40 + (130 * (i + 0.5)) / n) * Math.PI) / 180
      const v = idle || !r ? undefined : r.verdicts[i]
      cols[i].lerp(!v ? PIP_IDLE : v.pass ? PIP_PASS : PIP_FAIL, k)
      const lit = r && v ? t - (r.litAt[i] ?? -1e9) : 1e9
      const pop = !still && lit >= 0 && lit < 300 ? Math.sin((lit / 300) * Math.PI) : 0
      o.position.set(DESK_SPOT[0] + Math.cos(a) * 0.66, 0.035 + 0.06 * pop, DESK_SPOT[2] + Math.sin(a) * 0.66)
      o.rotation.set(0, 0, 0)
      o.scale.setScalar((v ? 1.15 : 0.9) * (1 + 0.5 * pop))
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, cols[i])
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[pipCombo, mat, SLOTS]} frustumCulled={false} />
}
const pipCombo = merge([placed(pipGeo, [0, 0, 0]), placed(pipCore, [0, 0, 0])])

// ── Grants: vessels of money, a bell jar and a padlock while frozen ─────

const FILL = 0.52
const BASE = 0.125
const DROP_FROM = 2.6
const jarGeo = lathe(
  [
    [0.62, 0],
    [0.62, 0.78],
    [0.61, 0.88],
    [0.565, 1.0],
    [0.48, 1.12],
    [0.335, 1.2],
    [0.16, 1.24],
    [0.001, 1.255],
  ],
  64,
)
const knobGeo = cylinder(0.06, 0.08, 16)
const bodyGeo = cylinder(0.459, 1, 56)
const surfGeo = cylinder(0.459, 0.02, 56)
const lockBody = roundedBox([0.2, 0.17, 0.07], 0.03)
const lockShackle = new TorusGeometry(0.065, 0.02, 8, 20, Math.PI)
const tagBody = merge([placed(roundedBox([0.34, 0.24, 0.012], 0.01), [0, 0, 0]), placed(cylinder(0.05, 0.016, 20), [0.08, 0, 0.012], [Math.PI / 2, 0, 0])])
const iceColor = new Color(PAL.ice)
const moneyColor = new Color(PAL.money)
const lockMat = new MeshStandardMaterial({ color: '#3A4451', roughness: 0.4, metalness: 0.5 })
const sealMat = new MeshStandardMaterial({ color: '#F4F0E9', roughness: 0.7 })

function Vessel({ gid }: { gid: string }) {
  const p = RESERVOIRS[gid]
  const body = useRef<Mesh>(null)
  const surface = useRef<Mesh>(null)
  const jar = useRef<Group>(null)
  const lock = useRef<Group>(null)
  const shackle = useRef<Mesh>(null)
  const tag = useRef<Group>(null)
  const fillMat = useMemo(() => liquid(), [])
  const jarMat = useMemo(() => glass(), [])
  const still = useMemo(reducedMotion, [])
  const st = useRef({ seen: false, frozen: false, at: -1e9, level: 0, lock: 0 })
  useFlow(e => {
    if (e.type === 'reset') st.current = { seen: false, frozen: false, at: -1e9, level: 0, lock: 0 }
    if (e.type === 'packet' && e.packet.kind === 'charge' && e.packet.from === `g:${gid}`) fx.slosh.set(gid, { at: now() + 200, amp: 0.4 })
  })
  useFrame((_, rdt) => {
    const dt = Math.min(rdt, 0.1)
    const g = feed.getWorld().grants.find(x => x.id === gid)
    if (!g || !body.current || !surface.current || !jar.current || !lock.current || !tag.current || !shackle.current) return
    const t = now()
    const u = jarMat.userData.u as { uFrost: { value: number }; uFade: { value: number } }
    const lu = fillMat.userData.u as { uPulse: { value: number } }
    const target = Math.max(0.02, FILL * clamp01(g.available / g.awarded))
    const s = st.current
    if (!s.seen) {
      // Mounting mid-story: show the state as settled, no drop.
      s.seen = true
      s.frozen = g.frozen
      s.at = -1e9
      s.level = target
      s.lock = g.frozen ? 1 : 0
      fillMat.color.copy(g.frozen ? iceColor : moneyColor)
    }
    s.level += (target - s.level) * (1 - Math.exp(-dt * 2.6))
    body.current.scale.y = Math.max(0.001, s.level - 0.02)
    body.current.position.y = BASE + (s.level - 0.02) / 2
    surface.current.position.y = BASE + s.level
    const sl = fx.slosh.get(gid)
    const tau = sl ? (t - sl.at) / 1000 : 99
    if (sl && tau >= 0 && tau < 1.8 && !still) {
      const a = 0.05 * sl.amp * Math.exp(-tau * 2.4)
      surface.current.rotation.set(a * Math.sin(tau * Math.PI * 4.2), 0, a * Math.sin(tau * Math.PI * 4.2 + 1.3))
      surface.current.position.y += 0.015 * sl.amp * Math.exp(-tau * 3) * Math.sin(tau * Math.PI * 6)
    } else surface.current.rotation.set(0, 0, 0)
    fillMat.color.lerp(g.frozen ? iceColor : moneyColor, Math.min(1, dt * 2.2))
    if (g.frozen !== s.frozen) {
      s.frozen = g.frozen
      // Freezing is immediate; thawing waits for the money to land.
      s.at = t + (g.frozen ? 0 : 750)
      fx.ripples.push({ pos: new Vector3(p[0], 0.06, p[2]), color: g.frozen ? '#EEF4FA' : '#E9FBFF', at: t + (g.frozen ? 640 : 750), size: 1.4, ms: 1200 })
    }
    const k = t - s.at
    let y = 0
    let fade = 0
    let frost = 0
    let lockGoal = 0
    let open = 0
    if (s.frozen) {
      lockGoal = 1
      if (s.at < -1e8 || still) {
        fade = 1
        frost = s.at < -1e8 ? 1 : clamp01(k / 300)
      } else {
        // Falls, lands, one small settle, then the frost comes in and the lock snaps on.
        const fall = 640
        if (k < fall) y = DROP_FROM * (1 - clamp01(k / fall) ** 2)
        else if (k < fall + 260) y = 0.06 * Math.sin(((k - fall) / 260) * Math.PI)
        fade = clamp01(k / 160)
        frost = clamp01((k - fall) / 900)
        lockGoal = k > fall + 300 ? 1 : 0
      }
    } else if (s.at > -1e8) {
      const d = clamp01(k / 1300)
      if (k < 0) {
        fade = 1
        frost = 1
        lockGoal = 1
      } else if (still) {
        fade = 1 - clamp01(k / 300)
      } else {
        // The shackle pops, the lock falls away, the jar lifts off.
        open = clamp01(k / 200)
        lockGoal = k < 420 ? 1 : 0
        y = DROP_FROM * easeOut(d)
        frost = 1 - clamp01(k / 520)
        fade = 1 - clamp01((d - 0.45) / 0.55)
      }
      lu.uPulse.value = k >= 0 && k < 1400 && !still ? Math.sin((k / 1400) * Math.PI) * (1 - k / 1400) * 1.6 : 0
    }
    jar.current.position.y = y
    u.uFade.value = fade
    u.uFrost.value = frost
    jar.current.visible = fade > 0.005
    s.lock += (lockGoal - s.lock) * (still ? 1 : Math.min(1, dt * 10))
    lock.current.visible = s.lock > 0.02
    lock.current.scale.setScalar(Math.max(0.001, s.lock))
    lock.current.position.y = 0.44 + y
    shackle.current.position.y = 0.085 + 0.05 * open
    const court = g.frozen && g.status === 'restored_by_court'
    const ts = tag.current.scale.x + ((court ? 1 : 0) - tag.current.scale.x) * Math.min(1, dt * 5)
    tag.current.scale.setScalar(Math.max(0.001, ts))
    tag.current.visible = ts > 0.02
  })
  // The lock and the court's slip face the camera side of the jar.
  return (
    <Pick id={`g:${gid}`}>
      <group position={p}>
        <mesh ref={body} geometry={bodyGeo} material={fillMat} position={[0, 0.4, 0]} />
        <mesh ref={surface} geometry={surfGeo} material={fillMat} position={[0, 0.6, 0]} />
        <group ref={jar} position={[0, DROP_FROM, 0]}>
          <mesh geometry={jarGeo} material={jarMat} position={[0, 0.05, 0]} renderOrder={2} />
          <mesh geometry={knobGeo} material={jarMat} position={[0, 1.33, 0]} renderOrder={2} />
        </group>
        <group ref={lock} position={[-0.12, 0.44, 0.64]} rotation={[0, -0.25, 0]} visible={false}>
          <mesh geometry={lockBody} material={lockMat} castShadow />
          <mesh ref={shackle} geometry={lockShackle} material={M.steel} position={[0, 0.085, 0]} />
        </group>
        <group ref={tag} position={[0.3, 0.25, 0.66]} rotation={[-0.15, 0.3, 0.06]} scale={0.001} visible={false}>
          <mesh geometry={tagBody} material={sealMat} castShadow />
          <mesh geometry={sealGeo} material={M.glazeRefine} position={[0.08, 0, 0.022]} rotation={[Math.PI / 2, 0, 0]} />
        </group>
        <mesh geometry={proxyGrant} material={M.hidden} position={[0, 0.6, 0]} />
      </group>
    </Pick>
  )
}
const sealGeo = cylinder(0.036, 0.008, 20)

// ── Sources: posts on the rim whose lamps light on a reading ─────────────

const lampGeo = merge([placed(cylinder(0.085, 0.05, 24), [0, 0, 0]), placed(cylinder(0.05, 0.03, 20), [0, 0.035, 0])])
const LAMP_OFF = new Color('#5A6573')
const LAMP_ON = new Color('#F3F8FF')
const ALARM_ON = new Color('#F2C46A')

function Lamps() {
  const ref = useRef<InstancedMesh>(null)
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), [])
  const ids = Object.keys(SOURCES)
  const cols = useMemo(() => ids.map(() => LAMP_OFF.clone()), [ids])
  const flash = useRef(new Map<string, { at: number; alarm: boolean }>())
  useFlow(e => {
    if (e.type === 'reset') flash.current.clear()
    if (e.type === 'packet' && e.packet.from.startsWith('s:')) flash.current.set(e.packet.from, { at: now(), alarm: !/no change/.test(e.packet.label) && e.packet.kind === 'reading' })
  })
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const t = now()
    ids.forEach((id, i) => {
      const f = flash.current.get(id)
      const since = f ? t - f.at : 1e9
      const k = since >= 0 && since < 1400 ? 1 - since / 1400 : 0
      cols[i].copy(LAMP_OFF).lerp(f?.alarm ? ALARM_ON : LAMP_ON, k)
      const p = SOURCES[id]
      o.position.set(p[0], 0.525 + 0.03 * k, p[2])
      o.rotation.set(0, 0, 0)
      o.scale.setScalar(1 + 0.25 * k)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, cols[i])
    })
    m.count = ids.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return (
    <>
      <instancedMesh ref={ref} args={[lampGeo, mat, ids.length]} frustumCulled={false} />
      {ids.map(id => (
        <Pick key={id} id={id}>
          <mesh geometry={proxyPost} material={M.hidden} position={[SOURCES[id][0], 0.32, SOURCES[id][2]]} />
        </Pick>
      ))}
    </>
  )
}

// ── Spokes: light under whatever is travelling, sender's leg then receiver's ──

const spokeGeo = roundedBox([1, 0.01, 0.06], 0.004)
const sp = new Color()
function Spokes() {
  const ref = useRef<InstancedMesh>(null)
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }), [])
  const lit = useMemo(() => SPOKES.map(() => ({ k: 0, c: new Color() })), [])
  const index = useMemo(() => new Map(SPOKES.map((id, i) => [id, i])), [])
  const goal = useMemo(() => SPOKES.map(() => ({ k: 0, c: new Color() })), [])
  useFrame((_, dt) => {
    const m = ref.current
    if (!m) return
    const t = now()
    for (const g of goal) g.k = 0
    for (const p of feed.getWorld().packets) {
      if (handHeld(p) && (t - p.sentAt) / p.ms < IN_HAND) continue
      const u = travel(p, t)
      const s = splitOf(p)
      const id = u < s ? p.from : p.to
      const i = index.get(id)
      if (i === undefined) continue
      const strength = routine(p) ? 0.35 : 1
      if (strength >= goal[i].k) {
        goal[i].k = strength
        goal[i].c.copy(trailColor(p))
      }
    }
    const k = Math.min(1, dt * 7)
    SPOKES.forEach((id, i) => {
      const l = lit[i]
      l.k += (goal[i].k - l.k) * k
      if (goal[i].k > 0) l.c.lerp(goal[i].c, Math.min(1, dt * 12))
      const deg = NODE_DEG[id]
      const r1 = nodeRadius(id)
      const [x, , z] = polar(deg, (SPOKE_R0 + r1) / 2)
      o.position.set(x, 0.011, z)
      o.rotation.set(0, (-deg * Math.PI) / 180, 0)
      o.scale.set(Math.max(0.01, r1 - SPOKE_R0), 1, l.k > 0.01 ? 1 : 0.0001)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      sp.copy(l.c).multiplyScalar(0.85 * l.k)
      m.setColorAt(i, sp)
    })
    m.count = SPOKES.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[spokeGeo, mat, SPOKES.length]} frustumCulled={false} renderOrder={1} />
}
const routine = (p: Packet) => (p.kind === 'reading' && /no change/.test(p.label)) || p.kind === 'recheck'

// ── The grant manager's pile of other decisions waiting ──────────────────

const slipGeo = roundedBox([0.34, 0.016, 0.24], 0.005)
function Slips() {
  const refs = useRef<(Mesh | null)[]>([])
  useFrame(() => {
    const n = feed.getWorld().holds.reduce((a, h) => a + (h.open && h.kind !== 'purchase' ? 1 : 0), 0)
    refs.current.forEach((m, i) => {
      if (m) m.visible = i < Math.min(n, 4)
    })
  })
  return (
    <>
      {[0, 1, 2, 3].map(i => (
        <mesh
          key={i}
          ref={el => {
            refs.current[i] = el
          }}
          geometry={slipGeo}
          material={M.glazeHold}
          position={[GM_DESK[0] - 0.3 + i * 0.012, 0.73 + i * 0.02, GM_DESK[2] + 0.04]}
          rotation={[0, 0.1 * (i % 2 ? 1 : -1), 0]}
          visible={false}
        />
      ))}
    </>
  )
}

// ── Pick shapes for whatever isn't easy to point at ──────────────────────

const proxyPod = cylinder(0.5, 0.95, 12)
const proxyGrant = cylinder(0.7, 1.35, 12)
const proxyPost = cylinder(0.24, 0.66, 8)
const proxyRecord = cylinder(0.8, 0.95, 12)
const proxyPedestal = cylinder(1.0, 1.9, 12)

function Outside() {
  return (
    <>
      <Pick id="v:vendors">
        <mesh geometry={proxyPedestal} material={M.hidden} position={[VENDORS[0], VENDORS[1] + 0.2, VENDORS[2]]} />
      </Pick>
      <Pick id="p:funder">
        <mesh geometry={proxyPedestal} material={M.hidden} position={[FUNDER[0], FUNDER[1] + 0.2, FUNDER[2]]} />
      </Pick>
    </>
  )
}

export const OfficePlinth = memo(function OfficePlinth() {
  const parts = useMemo(build, [])
  return (
    <group>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geo} material={p.mat} castShadow={p.shadow} receiveShadow />
      ))}
      <Spokes />
      <Record />
      {AGENTS.map(id => (
        <Agent key={id} id={id} />
      ))}
      <Pips />
      {Object.keys(RESERVOIRS).map(gid => (
        <Vessel key={gid} gid={gid} />
      ))}
      <Lamps />
      <Slips />
      <Outside />
    </group>
  )
})

/** Where a node's hover card sits: above its top. */
export const cardAnchor = (id: string, out: Vector3) => {
  const s = spot(id)
  return out.set(s.anchor[0], s.top, s.anchor[2])
}

