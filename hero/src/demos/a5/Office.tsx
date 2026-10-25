// The finance network after dark: a round dark plinth, three agent pods and
// the grant manager joined by fine lines of light, the two grants as glass
// vessels of glowing money that frost over and lock when frozen, the five
// sources standing on the back rim, and the vendors and the funder on their
// own pedestals outside. Nothing here carries text; the hover card names it.

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  QuadraticBezierCurve3,
  ShaderMaterial,
  SphereGeometry,
  TubeGeometry,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { feed, useFlow } from '../../feed'
import type { AgentRole, Verdict, World } from '../../feed'
import { made } from './kit'
import { GLAZE, GRANT_COLOR, NET, NET_R, NODE_AT, PAL } from './layout'
import { M, glass, lightMat, liquid } from './mats'
import { NET_EDGES, PULSES, pulseN, pulses } from './net'
import { Pick } from './Parts'
import { GM_LOOK, useStillFigure } from './People'
import { fx, now, reducedMotion, ui } from './store'

const at = (id: string) => NODE_AT[id]
const kd = (dt: number, rate: number) => 1 - Math.exp(-Math.min(dt, 0.1) * rate)
const C = (hex: string) => new Color(hex)
const IDLE = C('#5F78B8')
const WORK = C('#CFE0FF')
const WAIT = C(GLAZE.hold)

// ── The plinth ───────────────────────────────────────────────────────────

const plinthGeo = made(m => {
  m.cyl([0, -0.3, 0], NET_R, 0.6, PAL.netBody, 64)
  m.cyl([0, -0.005, 0], NET_R - 0.04, 0.012, PAL.netTop, 64)
  // pedestals outside for the vendors and the funder
  for (const id of ['v:vendors', 'p:funder']) {
    const p = at(id)
    m.cyl([p[0] - NET[0], p[1] - 0.45, p[2] - NET[2]], 0.95, 0.9, PAL.netBody, 40)
    m.cyl([p[0] - NET[0], p[1] - 0.003, p[2] - NET[2]], 0.91, 0.01, PAL.netTop, 40)
  }
})
const rimGeo = made(m => {
  m.torus([0, 0.004, 0], NET_R - 0.02, 0.012, '#6F8BD8', [Math.PI / 2, 0, 0], Math.PI * 2, 1.6)
  m.torus([0, 0.004, 0], NET_R * 0.62, 0.006, '#4A5F96', [Math.PI / 2, 0, 0], Math.PI * 2, 1.0)
  m.torus([0, 0.004, 0], NET_R * 0.3, 0.005, '#3D4F80', [Math.PI / 2, 0, 0], Math.PI * 2, 0.9)
  for (const id of ['v:vendors', 'p:funder']) {
    const p = at(id)
    m.torus([p[0] - NET[0], p[1] + 0.004, p[2] - NET[2]], 0.92, 0.01, '#6F8BD8', [Math.PI / 2, 0, 0], Math.PI * 2, 1.4)
  }
})

function Plinth() {
  return (
    <group position={NET}>
      <mesh geometry={plinthGeo} material={M.net} receiveShadow castShadow />
      <mesh geometry={rimGeo} material={M.glow} />
    </group>
  )
}

// ── The lines ────────────────────────────────────────────────────────────

const N_EDGES = NET_EDGES.length
const lineGeo: BufferGeometry = (() => {
  const parts = NET_EDGES.map((e, i) => {
    const g = new TubeGeometry(new QuadraticBezierCurve3(e.a, e.c, e.b), 48, 0.016, 5, false)
    const n = g.attributes.position.count
    g.setAttribute('aEdge', new BufferAttribute(new Float32Array(n).fill(i), 1))
    return g
  })
  const g = mergeGeometries(parts, false) ?? parts[0]
  for (const p of parts) if (p !== g) p.dispose()
  return g
})()

const lineMat = new ShaderMaterial({
  toneMapped: false,
  uniforms: {
    uP: { value: Array.from({ length: PULSES }, () => [0, 0, 0, 0]).flat() },
    uPC: { value: Array.from({ length: PULSES * 3 }, () => 0) },
    uL: { value: Array.from({ length: 32 }, () => 0.3) },
    uH: { value: Array.from({ length: 32 }, () => 0) },
    uBase: { value: C(PAL.line) },
  },
  vertexShader: [
    'attribute float aEdge; varying float vEdge; varying float vU;',
    'void main() { vEdge = aEdge; vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  ].join('\n'),
  fragmentShader: [
    `uniform vec4 uP[${PULSES}]; uniform vec3 uPC[${PULSES}]; uniform float uL[32]; uniform float uH[32]; uniform vec3 uBase;`,
    'varying float vEdge; varying float vU;',
    'void main() {',
    '  int e = int(vEdge + 0.5);',
    '  vec3 c = uBase * (0.18 + 0.9 * uL[e]) + vec3(0.85, 0.92, 1.0) * uH[e] * 0.9;',
    `  for (int i = 0; i < ${PULSES}; i++) {`,
    '    if (uP[i].z <= 0.0 || abs(uP[i].x - vEdge) > 0.5) continue;',
    '    float d = vU - uP[i].y;',
    '    c += uPC[i] * uP[i].z * (exp(-d * d / 0.0016) * 2.2 + exp(-d * d / 0.03) * 0.6);',
    '  }',
    '  gl_FragColor = vec4(c, 1.0);',
    '}',
  ].join('\n'),
})

/** Standing level for each line: brighter while traffic runs, cut while the grant it reaches is frozen. */
const lastAt = new Float32Array(32).fill(-1e9)
function Lines() {
  const lv = useRef(new Float32Array(32).fill(0.3))
  const hi = useRef(new Float32Array(32))
  useFrame((_, dt) => {
    const t = now()
    const w = feed.getWorld()
    const s = ui.get()
    const u = lineMat.uniforms
    const P = u.uP.value as number[]
    const PC = u.uPC.value as number[]
    for (let i = 0; i < PULSES; i++) {
      const q = pulses[i]
      const on = i < pulseN.n
      P[i * 4] = on ? q.edge : -9
      P[i * 4 + 1] = q.u
      P[i * 4 + 2] = on ? q.k : 0
      PC[i * 3] = q.r
      PC[i * 3 + 1] = q.g
      PC[i * 3 + 2] = q.b
      if (on) lastAt[q.edge] = t
    }
    const focus = s.hovered ?? s.selected
    for (let i = 0; i < N_EDGES; i++) {
      const e = NET_EDGES[i]
      const standing = e.kinds.length === 0
      let rest = standing ? 0.16 : 0.32
      const g = e.to.startsWith('g:') ? w.grants.find(x => `g:${x.id}` === e.to) : undefined
      if (g?.frozen && e.from === 'a:purchasing') rest = 0.03
      const recent = Math.max(0, 1 - (t - lastAt[i]) / 1600)
      const target = Math.max(rest, recent * 0.85)
      lv.current[i] += (target - lv.current[i]) * kd(dt, 5)
      const h = focus && (e.from === focus || e.to === focus || (focus.startsWith('r:') && e.from === 'intake')) ? 1 : 0
      hi.current[i] += (h - hi.current[i]) * kd(dt, 8)
      ;(u.uL.value as number[])[i] = lv.current[i]
      ;(u.uH.value as number[])[i] = hi.current[i]
    }
  })
  return <mesh geometry={lineGeo} material={lineMat} frustumCulled={false} />
}

// ── Agents ───────────────────────────────────────────────────────────────

const podGeo = made(m => {
  m.cyl([0, 0.06, 0], 0.62, 0.12, '#2A3240', 40)
  m.cyl([0, 0.135, 0], 0.56, 0.03, '#3A4556', 40)
  m.lathe([[0.001, 0.15], [0.42, 0.15], [0.36, 0.3], [0.3, 0.9], [0.34, 1.02], [0.5, 1.1], [0.52, 1.17], [0.001, 1.17]], [0, 0, 0], '#4A5770', 40)
  m.cyl([0, 1.19, 0], 0.48, 0.03, '#5B6982', 40)
})
const podSheen = made(m => {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    m.slab([Math.sin(a) * 0.33, 0.6, Math.cos(a) * 0.33], [0.035, 0.52, 0.02], '#8592A8', [0, a, -0.07 * 0])
  }
})
const ringGeo = made(m => m.torus([0, 0, 0], 0.5, 0.028, '#FFFFFF', [Math.PI / 2, 0, 0], Math.PI * 2))
const stripGeo = made(m => {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    m.slab([Math.sin(a) * 0.335, 0.62, Math.cos(a) * 0.335], [0.05, 0.36, 0.012], '#FFFFFF', [0, a, 0])
  }
})
/** What sits on top of each pod: an inspection tray, a stack of ledgers, a fan of papers. */
const CROWN: Record<AgentRole, BufferGeometry> = {
  purchasing: made(m => {
    m.cyl([0, 1.215, 0], 0.4, 0.02, '#46536A', 36)
    m.torus([0, 1.225, 0], 0.4, 0.014, '#7D8CA6', [Math.PI / 2, 0, 0])
  }),
  bookkeeping: made(m => {
    const c = ['#7D5A3C', '#3E5A7A', '#6B3F4E', '#4C6A55']
    for (let i = 0; i < 4; i++) m.box([0.03 * (i % 2 ? 1 : -1), 1.25 + i * 0.07, 0.02 * i], [0.46, 0.065, 0.34], c[i], 0.012, [0, 0.25 * i - 0.3, 0])
    m.slab([0.0, 1.25 + 3 * 0.07 + 0.04, 0.06], [0.36, 0.008, 0.26], '#E9E4DA', [0, 0.45, 0])
  }),
  payment_report: made(m => {
    for (let i = 0; i < 5; i++) m.slab([0, 1.42, -0.05], [0.3, 0.42, 0.012], i === 4 ? '#F1EDE4' : '#D8D3C9', [-0.25, 0, (i - 2) * 0.24])
    m.cyl([0, 1.23, 0], 0.16, 0.06, '#3A4556', 20)
  }),
}

/** The six spending rules, as lights round the purchasing agent's tray. */
interface RuleRun {
  requestId: string
  lit: (boolean | null)[]
  at: number[]
  last: number
  verdicts: (Verdict | null)[]
}
export const run: { cur: RuleRun | null } = { cur: null }
const RULE_N = 6
const RULE_PASS = C(GLAZE.accept).multiplyScalar(2.2)
const RULE_FAIL = C(GLAZE.reject).multiplyScalar(2.6)
const RULE_WAIT = C('#8EA2D8').multiplyScalar(0.7)
const RULE_OFF = C('#2A3550')
const ruleGeo = new SphereGeometry(0.07, 14, 10)
const ruleMat = new MeshBasicMaterial({ toneMapped: false })

function RuleLights() {
  const ref = useRef<InstancedMesh>(null)
  const col = useMemo(() => new Color(), [])
  const o = useMemo(() => new Object3D(), [])
  useFlow(e => {
    if (e.type === 'reset') run.cur = null
    if (e.type === 'rule') {
      if (!run.cur || run.cur.requestId !== e.requestId || e.index === 0) {
        run.cur = { requestId: e.requestId, lit: Array(RULE_N).fill(null), at: Array(RULE_N).fill(-1e9), last: now(), verdicts: Array(RULE_N).fill(null) }
        // Joined mid-run (a jump in time): the rules already checked come from the request itself.
        const done = e.index > 0 ? feed.getWorld().requests.find(q => q.id === e.requestId)?.verdicts : undefined
        for (let k = 0; done && k < e.index && k < RULE_N; k++) {
          run.cur.lit[k] = done[k]?.pass ?? null
          run.cur.verdicts[k] = done[k] ?? null
        }
      }
      const i = e.index % RULE_N
      run.cur.lit[i] = e.verdict.pass
      run.cur.at[i] = now()
      run.cur.verdicts[i] = e.verdict
      run.cur.last = now()
    }
  })
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const t = now()
    const p = at('a:purchasing')
    const r = run.cur
    const age = r ? t - r.last : 1e9
    const fade = age < 2600 ? 1 : Math.max(0, 1 - (age - 2600) / 1200)
    if (r && fade <= 0) run.cur = null
    for (let i = 0; i < RULE_N; i++) {
      const a = (i / RULE_N) * Math.PI * 1.4 - Math.PI * 0.7 + Math.PI * 0.25
      o.position.set(p[0] + Math.sin(a) * 0.52, 1.29, p[2] + Math.cos(a) * 0.52)
      const lit = r?.lit[i]
      const pop = r ? Math.max(0, 1 - (t - r.at[i]) / 300) : 0
      o.scale.setScalar(1 + 0.6 * pop)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      if (lit === true) col.copy(RULE_OFF).lerp(RULE_PASS, fade)
      else if (lit === false) col.copy(RULE_OFF).lerp(RULE_FAIL, fade)
      else col.copy(r && fade >= 1 ? RULE_WAIT : RULE_OFF)
      m.setColorAt(i, col)
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[ruleGeo, ruleMat, RULE_N]} frustumCulled={false} />
}

/** Working, waiting on the grant manager, or idle: what an agent's ring shows. */
export function agentState(role: AgentRole, w: World, t: number): 'working' | 'waiting' | 'idle' {
  const id = `a:${role}`
  for (const p of w.packets) if (p.from === id || p.to === id) return 'working'
  if (role === 'purchasing' && run.cur && t - run.cur.last < 2600) return 'working'
  if (t - (fx.pulses.get(id) ?? -1e9) < 1200) return 'working'
  for (const h of w.holds) if (h.open && h.raisedBy === role) return 'waiting'
  return 'idle'
}

function Agent({ role }: { role: AgentRole }) {
  const id = `a:${role}`
  const p = at(id)
  const g = useRef<Group>(null)
  const ring = useMemo(() => lightMat('#5F78B8'), [])
  const strip = useMemo(() => lightMat('#5F78B8'), [])
  const lift = useRef(0)
  const still = useMemo(reducedMotion, [])
  const col = useMemo(() => new Color(), [])
  useEffect(
    () => () => {
      ring.dispose()
      strip.dispose()
    },
    [ring, strip],
  )
  useFrame((_, dt) => {
    const t = now()
    const w = feed.getWorld()
    const s = ui.get()
    const st = agentState(role, w, t)
    const on = s.hovered === id || s.selected === id
    lift.current += ((on ? 0.07 : 0) - lift.current) * kd(dt, 8)
    if (g.current) g.current.position.y = lift.current
    const breathe = still ? 1 : 0.75 + 0.25 * Math.sin(t / 600)
    if (st === 'working') col.copy(WORK).multiplyScalar(1.8 * (still ? 1 : 0.85 + 0.15 * Math.sin(t / 140)))
    else if (st === 'waiting') col.copy(WAIT).multiplyScalar(1.7 * breathe)
    else col.copy(IDLE).multiplyScalar(0.55)
    if (on) col.multiplyScalar(1.35)
    ring.color.lerp(col, kd(dt, 6))
    strip.color.copy(ring.color).multiplyScalar(st === 'idle' ? 0.35 : 0.6)
  })
  return (
    <Pick id={id}>
      <group ref={g}>
        <group position={[p[0], p[1], p[2]]}>
          <mesh geometry={podGeo} material={M.net} castShadow receiveShadow />
          <mesh geometry={podSheen} material={M.sheen} />
          <mesh geometry={CROWN[role]} material={M.net} castShadow />
          <mesh geometry={ringGeo} material={ring} position={[0, 0.3, 0]} />
          <mesh geometry={stripGeo} material={strip} />
        </group>
        {role === 'purchasing' && <RuleLights />}
      </group>
    </Pick>
  )
}

// ── The grant manager ────────────────────────────────────────────────────

const deskGeo = made(m => {
  const d = [0.55, 0, 0.25]
  m.cyl([0, 0.05, 0], 0.85, 0.1, '#1E2531', 40)
  m.box([d[0], 1.06, d[2]], [0.9, 0.06, 0.6], '#3A4556', 0.02)
  m.slab([d[0], 0.55, d[2] - 0.22], [0.8, 1.0, 0.04], '#262E3B')
  m.cyl([d[0] + 0.2, 1.2, d[2] - 0.2], 0.02, 0.3, '#5A667A', 8)
  m.box([d[0] + 0.2, 1.42, d[2] - 0.18], [0.5, 0.3, 0.03], '#151A22', 0.01, [0, -0.5, 0])
})
const deskGlow = made(m => {
  m.slab([0.75, 1.42, 0.08], [0.44, 0.24, 0.005], '#8FB0FF', [0, -0.5, 0], 1.3)
  m.torus([0, 0.11, 0], 0.84, 0.012, '#7C93F2', [Math.PI / 2, 0, 0], Math.PI * 2, 1.4)
})

function GrantManager() {
  const p = at('p:grant_manager')
  const { rig, step } = useStillFigure(GM_LOOK)
  const still = useMemo(reducedMotion, [])
  const glow = useMemo(() => lightMat('#7C93F2'), [])
  useEffect(() => () => glow.dispose(), [glow])
  const col = useMemo(() => new Color(), [])
  useFrame((_, dt) => {
    const w = feed.getWorld()
    const s = ui.get()
    let open = 0
    for (const h of w.holds) if (h.open) open++
    step(open ? 'read' : 'look', dt, now() / 1000, still)
    const on = s.hovered === 'p:grant_manager' || s.selected === 'p:grant_manager' ? 1 : 0
    rig.mat.emissive.setRGB(0.1 * on, 0.1 * on, 0.09 * on)
    col.set(GLAZE.hold).multiplyScalar(open ? 1.6 + (still ? 0 : 0.4 * Math.sin(now() / 500)) : 0.6)
    glow.color.lerp(col, kd(dt, 5))
  })
  return (
    <Pick id="p:grant_manager">
      <group position={[p[0], p[1], p[2]]}>
        <mesh geometry={deskGeo} material={M.net} castShadow receiveShadow />
        <mesh geometry={deskGlow} material={glow} />
        <primitive object={rig.root} position={[0, 0.1, 0]} rotation={[0, 1.14, 0]} />
      </group>
    </Pick>
  )
}

// ── The grants ───────────────────────────────────────────────────────────

const VR = 0.62 // vessel radius
const VH = 1.45 // and height
const vesselBase = made(m => {
  m.cyl([0, 0.07, 0], VR + 0.18, 0.14, '#1E2531', 48)
  m.cyl([0, VH + 0.2, 0], VR + 0.06, 0.06, '#3A4556', 48)
  m.cyl([0, VH + 0.25, 0], VR - 0.12, 0.04, '#2B3443', 48)
})
const baseRing = made(m => m.torus([0, 0.145, 0], VR + 0.12, 0.018, '#FFFFFF', [Math.PI / 2, 0, 0], Math.PI * 2))
const glassGeo = made(m => m.cyl([0, 0.14 + VH / 2, 0], VR, VH, '#FFFFFF', 48))
const liquidGeo = made(m => m.cyl([0, 0.5, 0], VR - 0.05, 1, '#FFFFFF', 40))
const lockGeo = made(m => {
  m.box([0, 0, 0], [0.42, 0.34, 0.16], '#C9CED6', 0.05)
  m.cyl([0, 0.02, 0.085], 0.04, 0.02, '#2A2F37', 12, [Math.PI / 2, 0, 0])
  m.slab([0, -0.06, 0.085], [0.025, 0.08, 0.02], '#2A2F37')
})
const shackleGeo = made(m => m.torus([0, 0.17, 0], 0.13, 0.035, '#AEB4BC', [0, 0, 0], Math.PI))

function GrantVessel({ gid }: { gid: string }) {
  const id = `g:${gid}`
  const p = at(id)
  const hex = GRANT_COLOR[gid] ?? '#FFFFFF'
  const liq = useMemo(() => liquid(hex), [hex])
  const gl = useMemo(() => glass(), [])
  const ring = useMemo(() => lightMat(hex), [hex])
  const fill = useRef<Mesh>(null)
  const lock = useRef<Group>(null)
  const shackle = useRef<Mesh>(null)
  const top = useRef<Group>(null)
  const st = useRef({ level: -1, frost: -1, lock: 0, open: 0, lift: 0 })
  const still = useMemo(reducedMotion, [])
  const col = useMemo(() => new Color(), [])
  useEffect(
    () => () => {
      liq.dispose()
      gl.dispose()
      ring.dispose()
    },
    [liq, gl, ring],
  )
  useFrame((_, dt) => {
    const t = now()
    const w = feed.getWorld()
    const g = w.grants.find(x => x.id === gid)
    if (!g) return
    const s = ui.get()
    const S = st.current
    const target = g.awarded > 0 ? Math.max(0, Math.min(1, g.available / g.awarded)) : 0
    if (S.level < 0) {
      S.level = target
      S.frost = g.frozen ? 1 : 0
      S.lock = g.frozen ? 1 : 0
    }
    S.level += (target - S.level) * (still ? 1 : kd(dt, 2.2))
    S.frost += ((g.frozen ? 1 : 0) - S.frost) * (still ? 1 : kd(dt, g.frozen ? 3 : 1.4))
    S.lock += ((g.frozen ? 1 : 0) - S.lock) * (still ? 1 : kd(dt, g.frozen ? 5 : 2))
    const sl = fx.slosh.get(gid)
    const sk = sl ? (t - sl.at) / 1400 : 2
    const wob = !still && sk >= 0 && sk < 1 ? 0.04 * (1 - sk) * Math.sin(sk * 22) : 0
    if (fill.current) {
      fill.current.scale.y = Math.max(0.005, S.level * (VH - 0.12) + wob)
      fill.current.visible = S.level > 0.003
    }
    ;(liq.userData.u.uPulse as { value: number }).value = !still && sk >= 0 && sk < 1 ? 0.8 * (1 - sk) : 0
    ;(gl.userData.u.uFrost as { value: number }).value = S.frost
    liq.emissiveIntensity = 0.55 - 0.35 * S.frost
    if (lock.current) {
      // Frozen: a padlock drops onto the vessel. Thawed: the shackle springs and it lifts away.
      const k = S.lock
      lock.current.visible = k > 0.02
      lock.current.position.y = 0.95 + (still ? 0 : (1 - k) * (g.frozen ? 1.6 : 0.9))
      lock.current.scale.setScalar(Math.max(0.01, g.frozen ? 1 : k))
    }
    if (shackle.current) shackle.current.position.y = g.frozen ? 0 : 0.08
    const on = s.hovered === id || s.selected === id
    S.lift += ((on ? 0.07 : 0) - S.lift) * kd(dt, 8)
    if (top.current) top.current.position.y = S.lift
    col.set(hex).multiplyScalar((g.frozen ? 0.35 : 1.5) * (on ? 1.3 : 1))
    ring.color.lerp(col, kd(dt, 4))
  })
  return (
    <Pick id={id}>
      <group ref={top}>
        <group position={[p[0], p[1], p[2]]}>
          <mesh geometry={vesselBase} material={M.net} castShadow receiveShadow />
          <mesh geometry={baseRing} material={ring} />
          <mesh ref={fill} geometry={liquidGeo} material={liq} position={[0, 0.16, 0]} />
          <mesh geometry={glassGeo} material={gl} renderOrder={2} />
          <group ref={lock} position={[0, 0.95, VR + 0.06]} rotation={[0, 0, 0]}>
            <mesh geometry={lockGeo} material={M.sheen} castShadow />
            <mesh ref={shackle} geometry={shackleGeo} material={M.sheen} />
          </group>
        </group>
      </group>
    </Pick>
  )
}

// ── Sources, vendors, the funder, the intake ─────────────────────────────

const postGeo = made(m => {
  m.cyl([0, 0.04, 0], 0.26, 0.08, '#1E2531', 24)
  m.cyl([0, 0.45, 0], 0.045, 0.8, '#3A4556', 12)
  m.cyl([0, 0.9, 0], 0.17, 0.08, '#2B3443', 24)
  m.cap([0, 0.94, 0], 0.15, Math.PI / 2, '#3A4556')
})
const postLamp = made(m => m.torus([0, 0.9, 0], 0.17, 0.02, '#FFFFFF', [Math.PI / 2, 0, 0], Math.PI * 2))
const SOURCES = ['s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments']
const ALERT = C('#FF7A5C')

function SourcePost({ id }: { id: string }) {
  const p = at(id)
  const mat = useMemo(() => lightMat('#6F8BD8'), [])
  useEffect(() => () => mat.dispose(), [mat])
  const col = useMemo(() => new Color(), [])
  useFrame((_, dt) => {
    const t = now()
    const w = feed.getWorld()
    const s = ui.get()
    let alarm = false
    let live = false
    for (const q of w.packets)
      if (q.from === id) {
        live = true
        if (q.kind === 'reading' && !/no change/i.test(q.label)) alarm = true
        if (q.kind === 'payment') alarm = false
      }
    const flash = Math.max(0, 1 - (t - (fx.pulses.get(id) ?? -1e9)) / 900)
    const on = s.hovered === id || s.selected === id
    if (alarm) col.copy(ALERT).multiplyScalar(2)
    else col.copy(IDLE).multiplyScalar(0.6 + (live ? 0.7 : 0) + 1.6 * flash)
    if (on) col.multiplyScalar(1.4)
    mat.color.lerp(col, kd(dt, 8))
  })
  return (
    <Pick id={id}>
      <group position={[p[0], p[1], p[2]]}>
        <mesh geometry={postGeo} material={M.net} castShadow />
        <mesh geometry={postLamp} material={mat} />
      </group>
    </Pick>
  )
}

const vendorGeo = made(m => {
  m.box([0, 0.42, 0], [1.1, 0.84, 0.8], '#3A4250', 0.03)
  m.slab([0, 0.9, 0], [1.2, 0.08, 0.9], '#2A303A', [0, 0, 0.0])
  for (let i = 0; i < 6; i++) m.slab([-0.18, 0.12 + i * 0.09, 0.405], [0.5, 0.012, 0.01], '#56606F')
  m.box([0.35, 0.18, 0.3], [0.28, 0.3, 0.28], '#C49A6C', 0.012)
  m.box([0.35, 0.47, 0.3], [0.22, 0.24, 0.22], '#B88C5E', 0.012)
})
const vendorGlow = made(m => m.slab([-0.18, 0.66, 0.41], [0.56, 0.04, 0.01], '#FFC98C', undefined, 1.5))
const funderGeo = made(m => {
  m.box([0, 0.05, 0], [1.3, 0.1, 0.9], '#3A4556', 0.01)
  m.box([0, 0.13, 0], [1.16, 0.06, 0.8], '#46536A', 0.01)
  for (let i = 0; i < 5; i++) m.cyl([-0.44 + i * 0.22, 0.48, 0.28], 0.05, 0.64, '#8E9AB0', 12)
  m.box([0, 0.48, -0.08], [1.0, 0.64, 0.5], '#2E3746', 0.01)
  m.slab([0, 0.84, 0], [1.16, 0.08, 0.8], '#56627A')
  m.cyl([0, 0.98, 0], 0.68, 0.2, '#46536A', 3, [Math.PI / 2, 0, Math.PI / 2])
})
const funderGlow = made(m => {
  for (let i = 0; i < 4; i++) m.slab([-0.33 + i * 0.22, 0.48, 0.175], [0.1, 0.34, 0.01], '#FFC98C', undefined, 1.2)
})

function Outside({ id, geo, glowGeo, yaw }: { id: string; geo: BufferGeometry; glowGeo: BufferGeometry; yaw: number }) {
  const p = at(id)
  const g = useRef<Group>(null)
  const lift = useRef(0)
  useFrame((_, dt) => {
    const s = ui.get()
    const on = s.hovered === id || s.selected === id
    lift.current += ((on ? 0.07 : 0) - lift.current) * kd(dt, 8)
    if (g.current) g.current.position.y = p[1] + lift.current
  })
  return (
    <Pick id={id}>
      <group ref={g} position={[p[0], p[1], p[2]]} rotation={[0, yaw, 0]}>
        <mesh geometry={geo} material={M.net} castShadow receiveShadow />
        <mesh geometry={glowGeo} material={M.glow} />
      </group>
    </Pick>
  )
}

const intakeGeo = made(m => {
  m.cyl([0, 0.04, 0], 0.34, 0.08, '#1E2531', 24)
  m.cyl([0, 0.2, 0], 0.06, 0.3, '#3A4556', 12)
})
const intakeGlow = made(m => m.torus([0, 0.42, 0], 0.22, 0.022, '#9FB6E8', [0, -0.8, 0], Math.PI * 2, 1.8))

function Intake() {
  const p = at('intake')
  return (
    <group position={[p[0], p[1], p[2]]}>
      <mesh geometry={intakeGeo} material={M.net} />
      <mesh geometry={intakeGlow} material={M.glow} />
    </group>
  )
}

export function OfficePlinth() {
  return (
    <group>
      <Plinth />
      <Lines />
      <Intake />
      <Agent role="purchasing" />
      <Agent role="bookkeeping" />
      <Agent role="payment_report" />
      <GrantManager />
      {Object.keys(GRANT_COLOR).map(g => (
        <GrantVessel key={g} gid={g} />
      ))}
      {SOURCES.map(s => (
        <SourcePost key={s} id={s} />
      ))}
      <Outside id="v:vendors" geo={vendorGeo} glowGeo={vendorGlow} yaw={-0.9} />
      <Outside id="p:funder" geo={funderGeo} glowGeo={funderGlow} yaw={-1.25} />
    </group>
  )
}
