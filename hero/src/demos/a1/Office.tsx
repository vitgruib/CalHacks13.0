// The finance plinth: a slate network. The three agents are clay pods on
// short columns; the grants are clay reservoirs plugged into the grid, their
// money a glossy liquid that freezes under a frosted bell jar with a lock.
// Every route is a groove inlaid in the slate that lights in the colour of
// whatever runs along it. The grant manager is a person at a desk; the
// government sources stand along the far edge; vendors and the funder wait
// outside on their own pedestals. Nothing carries a label at rest.

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  ShaderMaterial,
  TorusGeometry,
  type Group,
  type Mesh,
} from 'three'
import { PACE, feed, progress } from '../../feed'
import { kit, type Kit } from './kit'
import { FUNDER, GLAZE, GRANT_COLOR, GROOVES, NET, NET_BOX, NET_X, PAL, R01, R21, VENDORS, type V3 } from './layout'
import { CLAY, glass, liquid } from './mats'
import { GrantManagerFigure } from './People'
import { Pick } from './Parts'
import { GLOW } from './routes'
import { RULES_MAX, fx, now, reducedMotion, ui } from './store'
import { Zone } from './zones'

const PI = Math.PI
const POD = '#D6CDBF'
const POD_D = '#BDB1A2'
const COLUMN = '#56616F'
const GROOVE_W = 0.15
const hitMat = new MeshBasicMaterial({ visible: false })
const noRay = () => {}

// ── The static network ───────────────────────────────────────────────────

function pod(k: Kit, id: string) {
  const n = NET[id]
  const [x, z] = n.at
  const r = n.r
  const colTop = n.top - 0.5
  k.cyl([x, 0.02, z], r * 0.62, 0.04, PAL.slateDeep, 28)
  k.cyl([x, colTop / 2, z], r * 0.4, colTop, COLUMN, 24)
  k.lathe([x, colTop, z], [[0, 0], [r * 0.7, 0], [r * 0.95, 0.08], [r, 0.2], [r * 0.93, 0.34], [r * 0.72, 0.44], [0, 0.47]], POD, {}, 36)
  k.torus([x, colTop + 0.2, z], r * 1.0, 0.02, POD_D, { rot: [PI / 2, 0, 0] }, PI * 2, 40)
}

function build() {
  const k = kit()
  const W = NET_BOX.x1 - NET_BOX.x0
  const D = NET_BOX.z1 - NET_BOX.z0
  k.box([NET_X, -0.56, 0], [W, 1.1, D], PAL.officeBody, 0.08)
  k.box([NET_X, -0.008, 0], [W - 0.1, 0.03, D - 0.1], PAL.officeTop, 0.01)

  // Groove inlays: a dark channel with a lighter lip.
  for (const g of GROOVES) {
    for (let i = 1; i < g.pts.length; i++) {
      const [ax, az] = g.pts[i - 1]
      const [bx, bz] = g.pts[i]
      const l = Math.hypot(bx - ax, bz - az)
      const yaw = Math.atan2(bx - ax, bz - az)
      k.box([(ax + bx) / 2, 0.006, (az + bz) / 2], [GROOVE_W + 0.05, 0.004, l], '#3D4753', 0.001, { rot: [0, yaw, 0] })
      k.box([(ax + bx) / 2, 0.009, (az + bz) / 2], [GROOVE_W, 0.004, l], PAL.groove, 0.001, { rot: [0, yaw, 0] })
      k.cyl([bx, 0.009, bz], GROOVE_W / 2, 0.004, PAL.groove, 14)
    }
  }

  // Agent pods, each with a small mark of its job on top.
  pod(k, 'a:purchasing')
  pod(k, 'a:payment_report')
  pod(k, 'a:bookkeeping')
  {
    const [x, z] = NET['a:bookkeeping'].at
    const y = NET['a:bookkeeping'].top - 0.04
    for (let i = 0; i < 3; i++) k.cyl([x, y + i * 0.05, z], 0.2 - i * 0.03, 0.04, i % 2 ? '#E8E2D8' : '#2F9DB5', 24)
  }
  {
    const [x, z] = NET['a:payment_report'].at
    const y = NET['a:payment_report'].top - 0.05
    k.box([x, y + 0.02, z], [0.36, 0.04, 0.12], '#3A4451', 0.01)
    k.box([x, y + 0.12, z], [0.26, 0.2, 0.012], '#F6F3EC', 0.004, { rot: [-0.15, 0, 0] })
  }
  {
    const [x, z] = NET['a:purchasing'].at
    const y = NET['a:purchasing'].top - 0.04
    k.cyl([x, y, z], 0.34, 0.03, '#E8E2D8', 32)
  }

  // Grant manager's desk and chair (the figure sits there).
  {
    const [x, z] = NET['p:grant_manager'].at
    k.box([x, 0.74, z + 0.05], [1.3, 0.05, 0.62], POD, 0.015)
    k.box([x - 0.6, 0.36, z + 0.05], [0.06, 0.72, 0.56], POD_D, 0.01)
    k.box([x + 0.6, 0.36, z + 0.05], [0.06, 0.72, 0.56], POD_D, 0.01)
    k.box([x, 0.45, z - 0.22], [1.16, 0.5, 0.03], POD_D, 0.01)
    k.box([x + 0.42, 0.79, z + 0.12], [0.34, 0.04, 0.26], '#3A4451', 0.008)
    k.box([x - 0.35, 0.775, z + 0.14], [0.36, 0.012, 0.13], '#D9DCDF', 0.004)
    // Chair
    const cz = z - 0.46
    k.box([x, 0.47, cz], [0.46, 0.07, 0.44], '#2E333A', 0.03)
    k.box([x, 0.78, cz - 0.24], [0.42, 0.5, 0.06], '#2E333A', 0.03, { rot: [0.08, 0, 0] })
    k.cyl([x, 0.25, cz], 0.03, 0.4, '#8C959E', 10)
    k.cyl([x, 0.03, cz], 0.26, 0.04, '#2E333A', 20)
  }

  // Reservoirs: a clay basin set into the slate, its collar in the grant's colour.
  for (const gid of [R01, R21]) {
    const n = NET[`g:${gid}`]
    const [x, z] = n.at
    k.lathe([x, 0, z], [[0.9, 0], [1.02, 0], [1.06, 0.06], [1.04, 0.5], [0.98, 0.56], [0.9, 0.56], [0.88, 0.1], [0.0, 0.1]], POD, {}, 48)
    k.torus([x, 0.56, z], 0.96, 0.05, GRANT_COLOR[gid], { rot: [PI / 2, 0, 0] }, PI * 2, 48)
    k.cyl([x, 0.105, z], 0.88, 0.01, PAL.slateDeep, 40)
  }

  // Ports: notches in the plinth edge where traffic enters and leaves.
  for (const id of ['port:lab', 'port:vendors', 'port:invoice', 'port:funder']) {
    const [x, z] = NET[id].at
    k.cyl([x, 0.012, z], 0.2, 0.012, PAL.groove, 24)
    k.torus([x, 0.018, z], 0.2, 0.025, '#5D6977', { rot: [PI / 2, 0, 0] }, PI * 2, 24)
  }

  // Government sources along the far edge: small posts with a cap that lights when they report.
  for (const id of ['s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments']) {
    const [x, z] = NET[id].at
    k.cyl([x, 0.03, z], 0.2, 0.06, PAL.slateDeep, 20)
    k.cyl([x, 0.27, z], 0.055, 0.46, '#7B8693', 14)
  }

  // Vendors: a small warehouse on its own pedestal, cartons stacked outside.
  {
    const [x, y, z] = VENDORS
    k.cyl([x, y - 0.55, z], 1.15, 1.1, PAL.clay, 40)
    k.box([x + 0.15, y + 0.36, z - 0.05], [1.2, 0.72, 0.9], '#E3DCD0', 0.03)
    k.box([x + 0.15, y + 0.77, z - 0.05], [1.3, 0.08, 1.0], '#9C5B3E', 0.02)
    k.box([x - 0.47, y + 0.28, z + 0.05], [0.02, 0.5, 0.56], '#8E979F', 0.004)
    for (let i = 0; i < 5; i++) k.box([x - 0.48, y + 0.07 + i * 0.1, z + 0.05], [0.02, 0.01, 0.54], '#6F7881', 0.001)
    k.box([x - 0.52, y + 0.6, z + 0.05], [0.14, 0.03, 0.7], '#C98B2E', 0.01)
    k.box([x - 0.75, y + 0.16, z + 0.62], [0.36, 0.32, 0.3], '#C9A47A', 0.02)
    k.box([x - 0.72, y + 0.45, z + 0.6], [0.3, 0.26, 0.26], '#BE9767', 0.02)
    k.box([x - 0.35, y + 0.13, z + 0.7], [0.3, 0.26, 0.26], '#C9A47A', 0.02)
  }

  // The funder: a small civic building with columns on its pedestal.
  {
    const [x, y, z] = FUNDER
    k.cyl([x, y - 0.55, z], 1.1, 1.1, PAL.clay, 40)
    k.box([x, y + 0.04, z], [1.3, 0.08, 0.9], '#ECE7DF', 0.01)
    k.box([x, y + 0.11, z], [1.18, 0.06, 0.8], '#E3DCD0', 0.01)
    for (let i = 0; i < 4; i++) k.cyl([x - 0.42 + i * 0.28, y + 0.42, z + 0.3], 0.055, 0.56, '#F2EEE7', 14)
    k.box([x, y + 0.42, z - 0.08], [1.0, 0.56, 0.5], '#E3DCD0', 0.02)
    k.box([x, y + 0.74, z], [1.18, 0.08, 0.82], '#ECE7DF', 0.01)
    k.cyl([x, y + 0.86, z], 0.42, 0.82, '#ECE7DF', 3, { rot: [PI / 2, 0, PI / 2], scale: [1.45, 1, 0.34] })
  }
  return k.build()
}

// ── Groove light ─────────────────────────────────────────────────────────

function grooveGlow() {
  const pos: number[] = []
  const edge: number[] = []
  const uu: number[] = []
  const len: number[] = []
  const idx: number[] = []
  const hw = GROOVE_W / 2
  GROOVES.forEach((g, gi) => {
    const P = g.pts
    const n = P.length
    const dir = (i: number) => {
      const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) || 1
      return [(P[i + 1][0] - P[i][0]) / l, (P[i + 1][1] - P[i][1]) / l] as const
    }
    let total = 0
    for (let i = 1; i < n; i++) total += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])
    // One continuous strip per groove with mitred corners, so no two quads
    // overlap and double the light where a groove bends.
    const b = pos.length / 3
    let s = 0
    for (let i = 0; i < n; i++) {
      if (i > 0) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])
      let [x, z] = P[i]
      let ox: number
      let oz: number
      if (i === 0 || i === n - 1) {
        // Ends run on half a groove width so the light reaches under the node.
        const [dx, dz] = dir(i === 0 ? 0 : n - 2)
        const e = i === 0 ? -hw : hw
        x += dx * e
        z += dz * e
        ox = -dz * hw
        oz = dx * hw
      } else {
        const [ax, az] = dir(i - 1)
        const [bx, bz] = dir(i)
        let mx = -az - bz
        let mz = ax + bx
        const ml = Math.hypot(mx, mz) || 1
        mx /= ml
        mz /= ml
        const k = hw / Math.max(0.35, mx * -bz + mz * bx)
        ox = mx * k
        oz = mz * k
      }
      pos.push(x - ox, 0.013, z - oz, x + ox, 0.013, z + oz)
      edge.push(gi, gi)
      uu.push(s / total, s / total)
      len.push(total, total)
      // Counter-clockwise seen from above, so the strip faces the camera
      // (the old quads faced down and were culled: the grooves never lit).
      if (i > 0) {
        const r0 = b + (i - 1) * 2
        idx.push(r0, r0 + 1, r0 + 2, r0 + 1, r0 + 3, r0 + 2)
      }
    }
  })
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  geo.setAttribute('aEdge', new BufferAttribute(new Float32Array(edge), 1))
  geo.setAttribute('aU', new BufferAttribute(new Float32Array(uu), 1))
  geo.setAttribute('aLen', new BufferAttribute(new Float32Array(len), 1))
  geo.setIndex(idx)
  geo.computeBoundingSphere()
  const N = GROOVES.length
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: { uHead: { value: GLOW.head }, uDir: { value: GLOW.dir }, uOn: { value: GLOW.on }, uCol: { value: GLOW.col } },
    vertexShader: [
      `uniform float uHead[${N}]; uniform float uDir[${N}]; uniform float uOn[${N}]; uniform vec3 uCol[${N}];`,
      'attribute float aEdge; attribute float aU; attribute float aLen;',
      'varying float vU; varying float vHead; varying float vDir; varying float vOn; varying vec3 vCol; varying float vLen;',
      'void main() {',
      '  int e = int(aEdge + 0.5);',
      '  vU = aU; vHead = uHead[e]; vDir = uDir[e]; vOn = uOn[e]; vCol = uCol[e]; vLen = aLen;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    // Distances are in world units (u × the groove's length), so a short
    // groove and a long one carry the same light: a bright head with a soft
    // front, a 0.9-unit tail behind it, and a faint resting level so an idle
    // groove still reads as an inlay rather than dark on dark.
    fragmentShader: [
      'varying float vU; varying float vHead; varying float vDir; varying float vOn; varying vec3 vCol; varying float vLen;',
      'const vec3 REST = vec3(0.70, 0.77, 0.85);',
      'void main() {',
      '  float d = (vHead - vU) * vDir * vLen;',
      '  float front = smoothstep(-0.12, 0.0, d);',
      '  float trail = pow(clamp(1.0 - d / 0.9, 0.0, 1.0), 2.0) * front;',
      '  float head = exp(-d * d * 90.0);',
      '  float lit = vOn * (0.22 + 0.78 * trail + 0.5 * head);',
      '  float a = 0.06 + lit;',
      '  vec3 c = mix(REST, vCol * (1.0 + 0.45 * head * vOn), clamp(lit / a, 0.0, 1.0));',
      '  gl_FragColor = vec4(c, min(a, 1.0));',
      '}',
    ].join('\n'),
  })
  return { geo, mat }
}

// ── Pods: a ring that says idle, working or waiting ──────────────────────

const ringGeo = new TorusGeometry(1, 0.045, 10, 48)
const AGENTS = ['a:purchasing', 'a:payment_report', 'a:bookkeeping'] as const
const IDLE = new Color('#6A7684')
const WORK = new Color('#FFF0D2')
const WAIT = new Color(PAL.cobalt).offsetHSL(0, 0.05, 0.12)
const pipGeo = new CylinderGeometry(0.055, 0.055, 0.05, 16)
const PIP_OFF = new Color('#8D96A1')
const PIP_PASS = new Color(GLAZE.accept).offsetHSL(0, 0.05, 0.08)
const PIP_FAIL = new Color(GLAZE.reject).offsetHSL(0, 0.05, 0.12)
const PIP_CHECK = new Color('#E9DFC9') // dim cream: the rule being checked right now
const o = new Object3D()
const tc = new Color()
const pipMat = new MeshBasicMaterial({ toneMapped: false })

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const backOut = (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2
const POP = 260 // ms for a pip to pop when its rule lands

function Pods() {
  const rings = useRef<(Mesh | null)[]>([])
  const pips = useRef<InstancedMesh>(null)
  const mats = useMemo(() => AGENTS.map(() => new MeshBasicMaterial({ color: IDLE, toneMapped: false })), [])
  const ringK = useMemo(() => new Float32Array(AGENTS.length).fill(1.02), [])
  const still = useMemo(reducedMotion, [])
  useFrame(({ clock }, delta) => {
    const w = feed.getWorld()
    const t = now()
    const s = ui.get()
    const dt = Math.min(delta, 0.1)
    // Colours ease (about 110 ms to settle) instead of jumping in one frame.
    const kc = still ? 1 : 1 - Math.exp(-dt * 9)
    for (let i = 0; i < AGENTS.length; i++) {
      const id = AGENTS[i]
      const role = id.slice(2)
      let working = false
      let waiting = false
      // Working means doing something now: a packet just leaving, or one about to land.
      for (const p of w.packets) {
        const k = progress(p, t)
        if ((p.from === id && k < 0.25) || (p.to === id && k > 0.85)) working = true
      }
      for (const h of w.holds) if (h.open && h.raisedBy === role) waiting = true
      if (id === 'a:purchasing') for (const r of w.requests) if (!r.outcome && r.verdicts.length) working = true
      const lit = s.hovered === id || s.selected === id
      if (waiting) tc.copy(IDLE).lerp(WAIT, still ? 0.8 : 0.55 + 0.45 * Math.sin(clock.elapsedTime * 2.6))
      else tc.copy(working ? WORK : IDLE)
      if (lit) tc.lerp(WORK, 0.35)
      mats[i].color.lerp(tc, kc)
      ringK[i] += ((lit ? 1.06 : 1.02) - ringK[i]) * kc
      const ring = rings.current[i]
      if (ring) ring.scale.setScalar(NET[id].r * ringK[i])
    }
    const P = pips.current
    if (!P) return
    // The rule pips: one per rule of the latest check (5 to 9), around the purchasing pod's rim.
    const run = fx.runs.get(fx.runId)
    const total = run ? run.total : 6
    const fade = run && t - run.last > 2600 ? Math.max(0, 1 - (t - run.last - 2600) / 600) : 1
    // The next rule to land pulses dim cream while it is being checked.
    let lastLit = -1
    if (run) for (let i = 0; i < total; i++) if (run.at[i] >= 0 && run.at[i] <= t) lastLit = i
    const next = run && lastLit < total - 1 ? lastLit + 1 : -1
    const ref = run ? (lastLit >= 0 ? run.at[lastLit] : run.start) : 0
    const checking = next >= 0 && !still ? Math.sin(PI * clamp01((t - ref) / PACE.rule)) : 0
    const n = NET['a:purchasing']
    for (let i = 0; i < total; i++) {
      const a = (i / total) * PI * 2 + PI / 2
      o.position.set(n.at[0] + Math.cos(a) * 0.48, n.top - 0.03, n.at[1] + Math.sin(a) * 0.48)
      o.rotation.set(0, 0, 0)
      const v = run && run.at[i] <= t ? run.pass[i] : -1
      let sc = 1
      tc.copy(PIP_OFF)
      if (v >= 0 && run) {
        const age = t - run.at[i]
        // Pop past full size with a little overshoot, then settle a touch proud of the rim.
        const pop = still ? 1.15 : age < POP ? 1 + 0.35 * backOut(age / POP) : 1.15 + 0.2 * Math.exp(-(age - POP) / 140)
        sc = 1 + (pop - 1) * fade
        tc.lerp(v ? PIP_PASS : PIP_FAIL, fade * (still ? 1 : clamp01(age / 120)))
      } else if (i === next) {
        sc = 1 + 0.15 * checking
        tc.lerp(PIP_CHECK, 0.9 * checking)
      }
      o.scale.setScalar(sc)
      o.updateMatrix()
      P.setMatrixAt(i, o.matrix)
      P.setColorAt(i, tc)
    }
    P.count = total
    P.instanceMatrix.needsUpdate = true
    if (P.instanceColor) P.instanceColor.needsUpdate = true
  })
  return (
    <>
      {AGENTS.map((id, i) => {
        const n = NET[id]
        return (
          <mesh
            key={id}
            ref={el => {
              rings.current[i] = el
            }}
            geometry={ringGeo}
            material={mats[i]}
            position={[n.at[0], n.top - 0.36, n.at[1]]}
            rotation={[PI / 2, 0, 0]}
            raycast={noRay}
          />
        )
      })}
      <instancedMesh ref={pips} args={[pipGeo, pipMat, RULES_MAX]} raycast={noRay} />
    </>
  )
}

// ── Reservoirs: money level, freeze, lock ────────────────────────────────

const LOCK = (() => {
  const k = kit()
  k.box([0, 0, 0], [0.26, 0.22, 0.1], '#C9A23E', 0.03)
  k.cyl([0, -0.01, 0.052], 0.025, 0.01, '#3A3020', 10, { rot: [PI / 2, 0, 0] })
  k.box([0, -0.05, 0.052], [0.016, 0.05, 0.01], '#3A3020', 0.002)
  return k.build()
})()
const SHACKLE = new TorusGeometry(0.085, 0.022, 10, 20, PI)
const shackleMat = new MeshBasicMaterial({ color: '#AEB5BC' })
const liquidGeo = new CylinderGeometry(0.86, 0.86, 1, 48)
const jarGeo = (() => {
  const k = kit()
  k.lathe([0, 0, 0], [[1.08, 0], [1.08, 0.82], [1.0, 1.04], [0.78, 1.2], [0.4, 1.28], [0.12, 1.3], [0.09, 1.38], [0.12, 1.44], [0, 1.45]], '#FFFFFF', {}, 48)
  return k.build()
})()

function Reservoir({ gid }: { gid: string }) {
  const n = NET[`g:${gid}`]
  const liq = useRef<Mesh>(null)
  const jar = useRef<Mesh>(null)
  const lock = useRef<Group>(null)
  const shackle = useRef<Mesh>(null)
  const liqMat = useMemo(() => liquid(PAL.money), [])
  const jarMat = useMemo(() => glass(), [])
  const still = useMemo(reducedMotion, [])
  const st = useMemo(() => ({ fill: -1, down: -1, frost: 0, lock: 0, open: 0 }), [])
  useFrame((_, dt) => {
    const g = feed.getWorld().grants.find(x => x.id === gid)
    if (!g) return
    const t = now()
    const d = Math.min(dt, 0.1)
    const k = still ? 1 : Math.min(1, d * 2.2)
    const fill = Math.max(0.06, Math.min(1, g.available / g.awarded))
    const frozen = g.frozen ? 1 : 0
    const restored = g.frozen && g.status === 'restored_by_court'
    if (st.fill < 0) {
      st.fill = fill
      st.down = frozen
      st.frost = frozen ? (restored ? 0.4 : 1) : 0
      st.lock = frozen
    }
    st.fill += (fill - st.fill) * k
    st.down += (frozen - st.down) * (still ? 1 : Math.min(1, d * 1.6))
    st.frost += ((frozen ? (restored ? 0.38 : 1) : 0) - st.frost) * k
    st.lock += (frozen - st.lock) * (still ? 1 : Math.min(1, d * 3))
    st.open += ((restored ? 1 : 0) - st.open) * k
    const sl = fx.slosh.get(gid)
    const wob = sl && !still && t > sl.at && t - sl.at < 1400 ? 0.03 * Math.sin((t - sl.at) / 70) * (1 - (t - sl.at) / 1400) : 0
    const h = 0.04 + st.fill * 0.4
    if (liq.current) {
      liq.current.scale.set(1, h, 1)
      liq.current.position.y = 0.11 + h / 2 + wob
    }
    const u = liqMat.userData.u as { uPulse: { value: number } }
    u.uPulse.value = sl && t > sl.at ? Math.max(0, 1 - (t - sl.at) / 900) : 0
    if (g.status === 'ended') liqMat.color.set('#8FA9B0')
    else liqMat.color.set(PAL.money)
    if (jar.current) {
      jar.current.position.y = 0.5 + (1 - st.down) * 2.4
      jar.current.visible = st.down > 0.02
      const ju = jarMat.userData.u as { uFrost: { value: number }; uFade: { value: number } }
      ju.uFrost.value = st.frost
      ju.uFade.value = Math.min(1, st.down * 1.4)
    }
    if (lock.current) {
      lock.current.visible = st.lock > 0.02
      lock.current.scale.setScalar(Math.max(0.001, st.lock))
    }
    if (shackle.current) shackle.current.position.y = 0.11 + st.open * 0.06
  })
  return (
    <Pick id={`g:${gid}`}>
      <group position={[n.at[0], 0, n.at[1]]}>
        <mesh geometry={hitCyl} material={hitMat} position={[0, 0.7, 0]} />
        <mesh ref={liq} geometry={liquidGeo} material={liqMat} position={[0, 0.3, 0]} receiveShadow raycast={noRay} />
        <mesh ref={jar} geometry={jarGeo} material={jarMat} renderOrder={4} raycast={noRay} />
        <group ref={lock} position={[0, 0.34, 1.1]}>
          <mesh geometry={LOCK} material={CLAY} castShadow raycast={noRay} />
          <mesh ref={shackle} geometry={SHACKLE} material={shackleMat} position={[0, 0.11, 0]} raycast={noRay} />
        </group>
      </group>
    </Pick>
  )
}
const hitCyl = new CylinderGeometry(1.1, 1.1, 1.5, 16)

// ── Sources: caps light when they report ─────────────────────────────────

const SOURCES = ['s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments']
const capGeo = (() => {
  const k = kit()
  k.sphere([0, 0, 0], 0.12, '#FFFFFF', {}, 18, 12)
  return k.build()
})()
const CAP_IDLE = new Color('#AEB8C3')
const CAP_ON = new Color('#FFF4DE')
const srcHit = new CylinderGeometry(0.3, 0.3, 0.9, 10)

function Sources() {
  const caps = useRef<InstancedMesh>(null)
  const capMat = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), [])
  useFrame(() => {
    const C = caps.current
    if (!C) return
    const t = now()
    const s = ui.get()
    SOURCES.forEach((id, i) => {
      const n = NET[id]
      const at = fx.pulses.get(id) ?? -1e9
      const k = Math.max(0, 1 - (t - at) / 1200)
      o.position.set(n.at[0], n.top - 0.02, n.at[1])
      o.rotation.set(0, 0, 0)
      o.scale.setScalar(1 + 0.25 * k + (s.hovered === id ? 0.15 : 0))
      o.updateMatrix()
      C.setMatrixAt(i, o.matrix)
      tc.copy(CAP_IDLE).lerp(CAP_ON, Math.max(k, s.hovered === id || s.selected === id ? 0.6 : 0))
      C.setColorAt(i, tc)
    })
    C.instanceMatrix.needsUpdate = true
    if (C.instanceColor) C.instanceColor.needsUpdate = true
  })
  return (
    <>
      <instancedMesh ref={caps} args={[capGeo, capMat, SOURCES.length]} raycast={noRay} />
      {SOURCES.map(id => (
        <Pick key={id} id={id}>
          <mesh geometry={srcHit} material={hitMat} position={[NET[id].at[0], 0.45, NET[id].at[1]]} />
        </Pick>
      ))}
    </>
  )
}

// ── Grant manager: open decisions stack up in the tray ───────────────────

const trayGeo = (() => {
  const k = kit()
  k.box([0, 0, 0], [0.26, 0.014, 0.2], '#F6F3EC', 0.004)
  k.box([0, 0.009, -0.04], [0.16, 0.003, 0.02], '#9AA3AD', 0.001)
  return k.build()
})()
const SLIP_C = new Color('#D3DEF0')

function GrantManager() {
  const n = NET['p:grant_manager']
  const slips = useRef<InstancedMesh>(null)
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#FFFFFF' }), [])
  useFrame(() => {
    const S = slips.current
    if (!S) return
    let c = 0
    for (const h of feed.getWorld().holds) if (h.open && h.kind !== 'purchase' && c < 6) {
      o.position.set(n.at[0] + 0.42, 0.82 + c * 0.02, n.at[1] + 0.12)
      o.rotation.set(0, (c % 2 ? 1 : -1) * 0.12, 0)
      o.scale.setScalar(1)
      o.updateMatrix()
      S.setMatrixAt(c, o.matrix)
      S.setColorAt(c, SLIP_C)
      c++
    }
    S.count = c
    S.instanceMatrix.needsUpdate = true
    if (S.instanceColor) S.instanceColor.needsUpdate = true
  })
  return (
    <>
      <Pick id="p:grant_manager">
        <mesh geometry={gmHit} material={hitMat} position={[n.at[0], 0.7, n.at[1] - 0.15]} />
        <GrantManagerFigure at={[n.at[0], 0, n.at[1] - 0.46]} yaw={0} />
      </Pick>
      <instancedMesh ref={slips} args={[trayGeo, mat, 6]} raycast={noRay} />
    </>
  )
}
const gmHit = new CylinderGeometry(0.75, 0.75, 1.5, 12)

const agentHit = new CylinderGeometry(0.7, 0.7, 1.2, 14)
const vendorHit = new CylinderGeometry(1.15, 1.15, 1.6, 14)

export function OfficePlinth() {
  const geo = useMemo(build, [])
  const g = useMemo(grooveGlow, [])
  return (
    <group>
      <mesh geometry={geo} material={CLAY} castShadow receiveShadow raycast={noRay} />
      <mesh geometry={g.geo} material={g.mat} renderOrder={1} raycast={noRay} />
      <Pods />
      {AGENTS.map(id => (
        <Pick key={id} id={id}>
          <mesh geometry={agentHit} material={hitMat} position={[NET[id].at[0], 0.6, NET[id].at[1]]} />
        </Pick>
      ))}
      <Reservoir gid={R01} />
      <Reservoir gid={R21} />
      <Sources />
      <GrantManager />
      <Pick id="v:vendors">
        <mesh geometry={vendorHit} material={hitMat} position={[VENDORS[0], VENDORS[1] + 0.2, VENDORS[2]] as V3} />
      </Pick>
      <Pick id="p:funder">
        <mesh geometry={vendorHit} material={hitMat} position={[FUNDER[0], FUNDER[1] + 0.2, FUNDER[2]] as V3} />
      </Pick>
      <Zone id="net" geo={geo} />
    </group>
  )
}
