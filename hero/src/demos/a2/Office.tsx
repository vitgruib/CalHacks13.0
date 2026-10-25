// The finance network as a balanced mobile, hung from one hook above a small
// slate base where the grant manager works. Thin wire arms carry the three
// agents (matte clay forms with one lens each), the two grants (glass vessels
// whose liquid is the money truly available), the vendors, the funder and,
// at the tips, the outside sources. When a node gains work or money its arm
// dips and settles on a damped spring (mobile.ts solves the pose).

import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  type Group,
  InstancedMesh,
  LineBasicMaterial,
  type Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { feed, useFlow, type Verdict, type World } from '../../feed'
import { bake, shade } from './bake'
import { ARMS, BASE, GLAZE, GM_TRAY, GRANTS, GRANT_TINT, HANGS, HOOK, PAL, type HangSpec } from './layout'
import { CLAY, M, glass, liquid } from './mats'
import { HANG, P, YAW, setTarget, solve } from './mobile'
import { Pick } from './Parts'
import { GrantManagerFigure } from './People'
import { fx, now, reducedMotion, ui } from './store'

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const clamp01 = (x: number) => clamp(x, 0, 1)

// ── How busy each node is, counted once a frame without allocating ────────

const WORK: Record<string, number> = {}
for (const h of HANGS) WORK[h.id] = 0
WORK['p:grant_manager'] = 0
export type Busy = 'idle' | 'working' | 'waiting'
const BUSY: Record<string, Busy> = { 'a:purchasing': 'idle', 'a:bookkeeping': 'idle', 'a:payment_report': 'idle' }

function count(w: World) {
  for (const k in WORK) WORK[k] = 0
  for (const p of w.packets) {
    if (p.to in WORK) WORK[p.to]++
    if (p.from in WORK) WORK[p.from]++
  }
  for (const r of w.requests) if (r.outcome === undefined && r.verdicts.length > 0) WORK['a:purchasing']++
  let open = 0
  for (const h of w.holds) if (h.open) open++
  WORK['p:grant_manager'] += open
  for (const role of ['purchasing', 'bookkeeping', 'payment_report']) {
    const id = `a:${role}`
    let waiting = false
    for (const h of w.holds) if (h.open && h.raisedBy === role) waiting = true
    BUSY[id] = WORK[id] > 0 ? 'working' : waiting ? 'waiting' : 'idle'
  }
}

const sum = (...ids: string[]) => ids.reduce((n, id) => n + (WORK[id] ?? 0), 0)

/** Each arm leans toward the side with more going on; the grants' arm leans by money. */
function balance(w: World) {
  const g1 = w.grants.find(g => g.id === GRANTS[0])
  const g2 = w.grants.find(g => g.id === GRANTS[1])
  const a1 = g1 ? g1.available : 0
  const a2 = g2 ? g2.available : 0
  setTarget('AG', clamp((a1 - a2) / (a1 + a2 + 1), -1, 1) * 0.16)
  setTarget('AL', clamp(WORK['a:purchasing'] - sum('a:payment_report', 'p:funder'), -2, 2) * 0.06)
  const src = sum('s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments')
  setTarget('AB', clamp(WORK['a:bookkeeping'] - src, -2, 2) * 0.05)
  const as = WORK['s:reporter'] + WORK['s:usaspending'] * 0.5 - WORK['s:court'] * 0.5 - WORK['s:payments']
  setTarget('AS', clamp(as, -2, 2) * 0.07)
  const left = sum(`g:${GRANTS[0]}`, `g:${GRANTS[1]}`, 'v:vendors')
  const right = sum('a:bookkeeping') + src
  setTarget('AR', clamp(left - right, -3, 3) * 0.03)
  setTarget('A0', clamp(sum('a:purchasing', 'a:payment_report', 'p:funder') - left - right, -3, 3) * 0.02)
}

/** Steps the mobile once a frame, before anything reads its points. */
export function Solver() {
  const still = useMemo(reducedMotion, [])
  useFrame(({ clock }, dt) => {
    const w = feed.getWorld()
    count(w)
    balance(w)
    solve(clock.elapsedTime, Math.min(dt, 0.1), still)
  })
  return null
}

// ── Wires, threads, weights ──────────────────────────────────────────────

const rodGeo = new CylinderGeometry(1, 1, 1, 8, 1)
const beadGeo = new SphereGeometry(1, 14, 10)
const o = new Object3D()
const UPV = new Vector3(0, 1, 0)
const va = new Vector3()
const vb = new Vector3()
const vd = new Vector3()
const qq = new Quaternion()

/** Thread segments: [from point, from offset (down), to point, to offset (up)]. */
type Seg = [string, number, string, number]
const SEGS: Seg[] = [['hook', -14, 'hook', 0]]
for (const a of ARMS) SEGS.push([a.parent, 0, a.id, 0])
for (const h of HANGS) SEGS.push([h.parent, HANG.get(h.parent)?.bottom ?? 0, h.id, h.top])
SEGS.push(['a:purchasing', 0.5, 'pickup', -0.02])
SEGS.push(['A0', 0, 'gm', -0.02])

function Wires() {
  const rods = useRef<InstancedMesh>(null)
  const beads = useRef<InstancedMesh>(null)
  const lines = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(SEGS.length * 6), 3))
    return g
  }, [])
  const lineMat = useMemo(() => new LineBasicMaterial({ color: '#4A5360' }), [])
  useFrame(() => {
    const R = rods.current, Bd = beads.current
    if (!R || !Bd) return
    let nb = 0
    ARMS.forEach((a, i) => {
      va.copy(P.get(`${a.id}.L`)!)
      vb.copy(P.get(`${a.id}.R`)!)
      vd.subVectors(vb, va)
      const len = vd.length()
      o.position.addVectors(va, vb).multiplyScalar(0.5)
      qq.setFromUnitVectors(UPV, vd.normalize())
      o.quaternion.copy(qq)
      o.scale.set(0.032, len, 0.032)
      o.updateMatrix()
      R.setMatrixAt(i, o.matrix)
      o.quaternion.identity()
      for (const [pt, r] of [
        [va, 0.075],
        [vb, 0.075],
        [P.get(a.id)!, 0.05],
      ] as const) {
        o.position.copy(pt)
        o.scale.setScalar(r)
        o.updateMatrix()
        Bd.setMatrixAt(nb++, o.matrix)
      }
    })
    R.instanceMatrix.needsUpdate = true
    Bd.count = nb
    Bd.instanceMatrix.needsUpdate = true
    const pos = lines.getAttribute('position') as BufferAttribute
    const arr = pos.array as Float32Array
    for (let i = 0; i < SEGS.length; i++) {
      const [a, da, b, db] = SEGS[i]
      const pa = P.get(a)!, pb = P.get(b)!
      arr[i * 6] = pa.x
      arr[i * 6 + 1] = pa.y - da
      arr[i * 6 + 2] = pa.z
      arr[i * 6 + 3] = pb.x
      arr[i * 6 + 4] = pb.y + db
      arr[i * 6 + 5] = pb.z
    }
    pos.needsUpdate = true
    lines.computeBoundingSphere()
  })
  return (
    <>
      <instancedMesh ref={rods} args={[rodGeo, M.wire, ARMS.length]} castShadow frustumCulled={false} />
      <instancedMesh ref={beads} args={[beadGeo, M.wire, ARMS.length * 3]} castShadow frustumCulled={false} />
      <lineSegments geometry={lines} material={lineMat} frustumCulled={false} />
      {/* The hook ring itself. */}
      <mesh position={HOOK} material={M.wire}>
        <torusGeometry args={[0.09, 0.02, 8, 20]} />
      </mesh>
    </>
  )
}

// ── A hanging node: follows its point, outlines when hovered ─────────────

const hitGeo = new SphereGeometry(1, 12, 8)
const hitMat = new MeshBasicMaterial()

function Hanging({ id, spec, outline, hit, children }: { id: string; spec: HangSpec; outline?: BufferGeometry; hit?: number; children: ReactNode }) {
  const g = useRef<Group>(null)
  const ol = useRef<Mesh>(null)
  const still = useMemo(reducedMotion, [])
  useFrame((_, dt) => {
    const el = g.current
    if (!el) return
    el.position.copy(P.get(id)!)
    // Nodes turn a little with their arm, but keep their face to the room.
    const want = 0.35 * (YAW.get(id) ?? 0)
    el.rotation.y = still ? want : el.rotation.y + (want - el.rotation.y) * Math.min(1, dt * 4)
    const m = ol.current
    if (m) {
      const s = ui.get()
      const on = s.selected === id || s.hovered === id
      m.visible = on
      if (on) m.material = s.selected === id ? M.outlineSel : M.outline
    }
  })
  const r = hit ?? Math.max(spec.top, spec.bottom) + 0.18
  return (
    <Pick id={id}>
      <group ref={g}>
        {children}
        {outline && <mesh ref={ol} geometry={outline} material={M.outline} scale={1.07} visible={false} />}
        <mesh geometry={hitGeo} material={hitMat} scale={r} visible={false} />
      </group>
    </Pick>
  )
}

const specOf = (id: string) => HANGS.find(h => h.id === id)!

// ── Agents ───────────────────────────────────────────────────────────────

const LENS_IDLE = new Color('#C9D2DC')
const LENS_WORK = new Color('#F6FAFF')
const LENS_WAIT = new Color(PAL.cobalt)

/** The one lens on each agent: dim while idle, bright while working, cobalt while it waits on a person. */
function useLens(id: string, r: number) {
  const mat = useMemo(() => new MeshBasicMaterial({ color: LENS_IDLE.clone(), toneMapped: false }), [])
  const mesh = useRef<Mesh>(null)
  const still = useMemo(reducedMotion, [])
  useFrame((_, dt) => {
    const b = BUSY[id]
    const target = b === 'working' ? LENS_WORK : b === 'waiting' ? LENS_WAIT : LENS_IDLE
    mat.color.lerp(target, Math.min(1, dt * 5))
    const since = now() - (fx.pulses.get(id) ?? -1e9)
    const flare = since >= 0 && since < 700 && !still ? 1 - since / 700 : 0
    const k = r * (1 + 0.25 * flare + (b === 'waiting' && !still ? 0.06 * Math.sin(now() / 380) : 0))
    if (mesh.current) mesh.current.scale.set(k, k, 1)
  })
  return { mat, mesh }
}

const lensGeo = new CylinderGeometry(1, 1, 0.04, 28).rotateX(Math.PI / 2)

const PURCH_GEO = bake(b => {
  b.lathe([0, -0.5, 0], [[0, 0], [0.26, 0.02], [0.44, 0.15], [0.52, 0.4], [0.52, 0.55], [0.46, 0.76], [0.3, 0.93], [0, 1.0]], '#D9CDBE', 36)
  b.ring([0, 0.06, 0.0], 0.52, 0.02, shade('#D9CDBE', -0.08), [Math.PI / 2, 0, 0], Math.PI * 2, 40)
  b.cyl([0, 0.12, 0.47], 0.17, 0.08, '#3A414A', 28, [Math.PI / 2, 0, 0])
  b.cyl([0, 0.52, 0], 0.05, 0.06, '#5C6672', 10)
  b.cyl([0, -0.5, 0], 0.05, 0.05, '#5C6672', 10)
})
const BOOK_GEO = bake(b => {
  b.lathe([0, -0.42, 0], [[0, 0], [0.36, 0], [0.42, 0.06], [0.42, 0.78], [0.36, 0.84], [0, 0.84]], '#C9CFD6', 36)
  for (const y of [-0.22, 0.0, 0.22]) b.ring([0, y, 0], 0.425, 0.012, shade('#C9CFD6', -0.12), [Math.PI / 2, 0, 0], Math.PI * 2, 40)
  b.cyl([0, 0.1, 0.4], 0.13, 0.07, '#3A414A', 24, [Math.PI / 2, 0, 0])
  b.cyl([0, 0.44, 0], 0.04, 0.05, '#5C6672', 10)
})
const PAY_GEO = bake(b => {
  b.box([0, -0.07, 0], [0.7, 0.62, 0.3], '#D8C9C4', 0.08)
  b.cyl([0, 0.24, 0], 0.35, 0.3, '#D8C9C4', 28, [Math.PI / 2, 0, 0])
  b.box([0, -0.2, 0.152], [0.4, 0.03, 0.01], '#3A414A', 0.005)
  b.cyl([0, 0.2, 0.15], 0.12, 0.06, '#3A414A', 24, [Math.PI / 2, 0, 0])
  b.cyl([0, 0.42, 0], 0.04, 0.05, '#5C6672', 10)
})

// The six rule checks light up in an arc under the purchasing agent's lens.
interface RuleRun {
  requestId: string
  total: number
  verdicts: (Verdict | undefined)[]
  litAt: number[]
  last: number
  done: number
}
const run: { cur: RuleRun | null } = { cur: null }
const SLOTS = 9
const pipIdle = new Color('#6E7884')
const pipPass = new Color(PAL.celadon)
const pipFail = new Color('#C2403A')
const black = new Color('#000000')
const pipGeo = new SphereGeometry(0.05, 14, 10)

function Pips() {
  const pips = useRef<(Mesh | null)[]>([])
  const mats = useMemo(() => Array.from({ length: SLOTS }, () => new MeshStandardMaterial({ color: pipIdle.clone(), roughness: 0.4, emissive: new Color('#000000') })), [])
  const still = useMemo(reducedMotion, [])
  const c = useMemo(() => new Color(), [])
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
    const w = feed.getWorld()
    const r = w.requests.find(q => q.outcome === undefined && q.verdicts.length > 0 && !w.packets.some(p => p.refId === q.id && p.kind === 'request'))
    if (r) run.cur = { requestId: r.id, total: r.verdicts.length, verdicts: [...r.verdicts], litAt: [], last: now(), done: 0 }
  }, [])
  useFrame((_, dt) => {
    const r = run.cur
    const t = now()
    const idle = !r || (r.done > 0 && t - r.done > 1600) || t - r.last > 9000
    const n = idle || !r ? 6 : r.total
    const k = Math.min(1, dt * 10)
    for (let i = 0; i < SLOTS; i++) {
      const m = pips.current[i]
      if (!m) continue
      m.visible = i < n
      if (!m.visible) continue
      const a = ((i - (n - 1) / 2) / Math.max(1, n - 1)) * 1.5
      m.position.set(Math.sin(a) * 0.5, -0.2 + 0.1 * (1 - Math.cos(a)), Math.cos(a) * 0.47)
      const v = idle || !r ? undefined : r.verdicts[i]
      c.copy(!v ? pipIdle : v.pass ? pipPass : pipFail)
      mats[i].color.lerp(c, k)
      mats[i].emissive.lerp(v ? c : black, k)
      mats[i].emissiveIntensity = v ? 0.6 : 0
      const lit = r && v ? t - (r.litAt[i] ?? -1e9) : 1e9
      const pop = !still && lit >= 0 && lit < 260 ? Math.sin((lit / 260) * Math.PI) : 0
      m.scale.setScalar(1 + 0.5 * pop)
    }
  })
  return (
    <>
      {mats.map((m, i) => (
        <mesh
          key={i}
          ref={el => {
            pips.current[i] = el
          }}
          geometry={pipGeo}
          material={m}
          visible={false}
        />
      ))}
    </>
  )
}

function Agent({ id, geo, lensAt, lensR }: { id: string; geo: BufferGeometry; lensAt: [number, number, number]; lensR: number }) {
  const lens = useLens(id, lensR)
  return (
    <Hanging id={id} spec={specOf(id)} outline={geo}>
      <mesh geometry={geo} material={CLAY} castShadow />
      <mesh ref={lens.mesh} geometry={lensGeo} material={lens.mat} position={lensAt} scale={[lensR, lensR, 1]} />
      {id === 'a:purchasing' && <Pips />}
    </Hanging>
  )
}

// ── Grants: glass vessels, filled to the money truly available ───────────

const V_IN = 0.44
const V_FLOOR = -0.46
const V_FULL = 0.86
const vesselGlass = bake(b =>
  b.lathe([0, -0.6, 0], [[0, 0], [0.3, 0.005], [0.46, 0.08], [0.5, 0.3], [0.5, 0.9], [0.43, 1.06], [0.31, 1.13], [0.3, 1.2]], '#FFFFFF', 48),
)
const vesselClay = (tint: string) =>
  bake(b => {
    b.cyl([0, -0.62, 0], 0.32, 0.07, '#4E5967', 32)
    b.cyl([0, -0.57, 0], 0.26, 0.04, shade('#4E5967', 0.08), 32)
    b.ring([0, 0.58, 0], 0.31, 0.045, tint, [Math.PI / 2, 0, 0], Math.PI * 2, 32)
    b.cyl([0, 0.62, 0], 0.27, 0.04, '#4E5967', 28)
    b.ring([0, 0.67, 0], 0.05, 0.015, '#5C6672', [0, 0, 0], Math.PI * 2, 12)
  })
const vesselOutline = bake(b => b.lathe([0, -0.66, 0], [[0, 0], [0.34, 0], [0.5, 0.15], [0.5, 1.0], [0.36, 1.3], [0, 1.32]], '#FFFFFF', 32))
const liqGeo = new CylinderGeometry(V_IN, V_IN, 1, 40)
const LOCK_GEO = bake(b => {
  b.box([0, -0.05, 0], [0.2, 0.17, 0.08], '#8C949D', 0.03)
  b.ring([0, 0.05, 0], 0.065, 0.02, '#B9C0C8', [0, 0, 0], Math.PI, 12)
  b.cyl([0, -0.04, 0.042], 0.022, 0.01, '#2A2F36', 10, [Math.PI / 2, 0, 0])
})
const COURT_GEO = bake(b => {
  b.box([0, -0.12, 0], [0.22, 0.16, 0.012], '#F7F4EF', 0.006)
  b.box([0, -0.08, 0.008], [0.14, 0.018, 0.004], '#2A2F36', 0.002)
  b.box([-0.02, -0.12, 0.008], [0.1, 0.014, 0.004], '#9AA4AF', 0.002)
  b.ring([0, -0.18, 0.01], 0.03, 0.01, '#9C2E2A', [0, 0, 0], Math.PI * 2, 12)
})
const ICE = new Color(PAL.ice)
const MONEY = new Color(PAL.money)
const ENDED = new Color('#9AA4AF')

function Vessel({ gid }: { gid: string }) {
  const id = `g:${gid}`
  const body = useRef<Mesh>(null)
  const lock = useRef<Group>(null)
  const tag = useRef<Group>(null)
  const clayGeo = useMemo(() => vesselClay(GRANT_TINT[gid] ?? PAL.slate), [gid])
  const fill = useMemo(() => liquid(), [])
  const glassMat = useMemo(() => glass(), [])
  const still = useMemo(reducedMotion, [])
  const st = useRef({ seen: false, level: 0, frost: 0, frozen: false, thawAt: -1e9 })
  useFlow(e => {
    if (e.type === 'reset') st.current.seen = false
    if (e.type === 'grant' && e.grant.id === gid && e.event?.kind === 'payment_received') st.current.thawAt = now() + 650
  })
  useFrame((_, dt) => {
    const g = feed.getWorld().grants.find(x => x.id === gid)
    const b = body.current
    if (!g || !b || !lock.current || !tag.current) return
    const s = st.current
    const want = Math.max(0.02, V_FULL * clamp01(g.available / g.awarded))
    if (!s.seen) {
      s.seen = true
      s.level = want
      s.frost = g.frozen ? 1 : 0
      fill.color.copy(g.status === 'ended' ? ENDED : g.frozen ? ICE : MONEY)
    }
    const k = still ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 2.4)
    s.level += (want - s.level) * k
    b.scale.y = s.level
    b.position.y = V_FLOOR + s.level / 2
    fill.color.lerp(g.status === 'ended' ? ENDED : g.frozen ? ICE : MONEY, still ? 1 : Math.min(1, dt * 2))
    s.frost += ((g.frozen ? 1 : 0) - s.frost) * (still ? 1 : Math.min(1, dt * (g.frozen ? 2.5 : 1.6)))
    ;(glassMat.userData.u as { uFrost: { value: number } }).uFrost.value = s.frost
    const t = now() - s.thawAt
    ;(fill.userData.u as { uPulse: { value: number } }).uPulse.value = t >= 0 && t < 1400 && !still ? Math.sin((t / 1400) * Math.PI) * 1.4 : 0
    const ls = lock.current.scale.x + ((g.frozen ? 1 : 0) - lock.current.scale.x) * (still ? 1 : Math.min(1, dt * 6))
    lock.current.scale.setScalar(ls)
    lock.current.visible = ls > 0.02
    const court = g.frozen && g.status === 'restored_by_court'
    const ts = tag.current.scale.x + ((court ? 1 : 0) - tag.current.scale.x) * (still ? 1 : Math.min(1, dt * 5))
    tag.current.scale.setScalar(ts)
    tag.current.visible = ts > 0.02
    if (!still) tag.current.rotation.z = 0.12 * Math.sin(now() / 900)
  })
  return (
    <Hanging id={id} spec={specOf(id)} outline={vesselOutline}>
      <mesh geometry={clayGeo} material={CLAY} castShadow />
      <mesh ref={body} geometry={liqGeo} material={fill} position={[0, V_FLOOR + 0.2, 0]} />
      <mesh geometry={vesselGlass} material={glassMat} renderOrder={2} />
      <group ref={lock} position={[0, 0.1, 0.52]} scale={0}>
        <mesh geometry={LOCK_GEO} material={CLAY} castShadow />
      </group>
      <group ref={tag} position={[0.3, 0.55, 0.2]} scale={0}>
        <mesh geometry={COURT_GEO} material={CLAY} />
      </group>
    </Hanging>
  )
}

// ── Sources, vendors, funder ─────────────────────────────────────────────

const SOURCE_GEO = bake(b => {
  b.cyl([0, 0, 0], 0.16, 0.16, '#4E5967', 24)
  b.cyl([0, 0.085, 0], 0.13, 0.02, '#3A4451', 24)
  b.cyl([0, 0.1, 0], 0.025, 0.03, '#5C6672', 8)
})
const lampGeo = new CylinderGeometry(0.075, 0.075, 0.02, 20).rotateX(Math.PI / 2)
const lampOff = new Color('#6E7884')
const lampOn = new Color('#F3F8FF')

function SourceNode({ id }: { id: string }) {
  const mat = useMemo(() => new MeshBasicMaterial({ color: lampOff.clone(), toneMapped: false }), [])
  useFrame(() => {
    const since = now() - (fx.pulses.get(id) ?? -1e9)
    const k = since >= 0 && since < 1200 ? 1 - since / 1200 : 0
    mat.color.copy(lampOff).lerp(lampOn, Math.max(k, WORK[id] > 0 ? 0.6 : 0))
  })
  return (
    <Hanging id={id} spec={specOf(id)} outline={SOURCE_GEO} hit={0.3}>
      <mesh geometry={SOURCE_GEO} material={CLAY} castShadow />
      <mesh geometry={lampGeo} material={mat} position={[0, 0, 0.16]} />
    </Hanging>
  )
}

const VENDOR_GEO = bake(b => {
  b.box([0, -0.12, 0], [0.62, 0.26, 0.46], '#C9A67A', 0.03)
  b.box([0, 0.0, 0], [0.1, 0.006, 0.465], shade('#C9A67A', 0.12), 0.002)
  b.box([-0.08, 0.15, 0.02], [0.4, 0.26, 0.36], shade('#C9A67A', -0.05), 0.03, [0, 0.25, 0])
  b.box([-0.08, 0.282, 0.02], [0.07, 0.006, 0.365], shade('#C9A67A', 0.1), 0.002, [0, 0.25, 0])
  b.box([0.14, -0.1, 0.235], [0.16, 0.1, 0.004], '#F4F2EC', 0.002)
})
const FUNDER_GEO = bake(b => {
  b.box([0, -0.17, 0], [0.74, 0.06, 0.44], '#E8E2D8', 0.01)
  b.box([0, -0.12, 0], [0.66, 0.05, 0.38], '#EFEAE2', 0.01)
  for (let i = 0; i < 4; i++) b.cyl([-0.24 + i * 0.16, 0.05, 0.12], 0.035, 0.3, '#F5F1EB', 12)
  b.box([0, 0.05, -0.04], [0.6, 0.3, 0.2], '#E2DBD0', 0.01)
  b.box([0, 0.225, 0], [0.7, 0.05, 0.42], '#EFEAE2', 0.01)
  b.cyl([0, 0.3, 0], 0.001, 0.12, '#F5F1EB', 4, [0, Math.PI / 4, 0], 0.5)
  b.ring([0, 0.4, 0], 0.04, 0.012, '#5C6672', [0, 0, 0], Math.PI * 2, 10)
})

// ── The base: slate floor, the grant manager's desk ─────────────────────

const DESK_C: [number, number, number] = [GM_TRAY[0], 0, -1.45]
const SEAT: [number, number, number] = [GM_TRAY[0], 0, -2.22]
const BASE_GEO = bake(b => {
  b.box([BASE.x, -0.55, BASE.z], [BASE.w, 1.1, BASE.d], PAL.officeBody, 0.14)
  b.box([BASE.x, -0.008, BASE.z], [BASE.w - 0.24, 0.02, BASE.d - 0.24], PAL.officeTop, 0.01)
  b.box([DESK_C[0], 0.006, -1.75], [2.4, 0.008, 2.0], '#3A4451', 0.004)
  // The desk, its tray where decisions wait, a monitor angled away, a lamp.
  b.box([DESK_C[0], 0.74, DESK_C[2]], [1.6, 0.05, 0.8], '#8E6B4C', 0.015)
  for (const dx of [-0.74, 0.74]) b.box([DESK_C[0] + dx, 0.36, DESK_C[2]], [0.05, 0.72, 0.72], '#7A5B40', 0.01)
  b.box([DESK_C[0], 0.4, DESK_C[2] + 0.36], [1.44, 0.5, 0.03], '#7A5B40', 0.01)
  b.box([GM_TRAY[0], 0.785, GM_TRAY[2]], [0.5, 0.04, 0.38], '#2A2F36', 0.01)
  b.box([GM_TRAY[0], 0.79, GM_TRAY[2]], [0.44, 0.03, 0.32], '#3A414A', 0.006)
  b.box([DESK_C[0] + 0.52, 0.8, -1.55], [0.06, 0.06, 0.18], '#2A2F36', 0.01)
  b.box([DESK_C[0] + 0.55, 1.05, -1.55], [0.42, 0.3, 0.035], '#2A2F36', 0.015, [0, -0.5, 0])
  b.box([DESK_C[0] - 0.12, 0.775, -1.8], [0.4, 0.014, 0.14], '#3A414A', 0.004)
  b.cyl([DESK_C[0] - 0.62, 0.78, -1.3], 0.07, 0.03, '#3A414A', 14)
  b.cap([DESK_C[0] - 0.62, 0.98, -1.3], 0.012, 0.36, '#5C6672', undefined, 6)
  b.cyl([DESK_C[0] - 0.55, 1.18, -1.32], 0.06, 0.09, '#C98B2E', 14, [0, 0, 0.9], 0.11)
  // The chair.
  b.box([SEAT[0], 0.45, SEAT[2]], [0.46, 0.07, 0.44], '#2E3440', 0.03)
  b.box([SEAT[0], 0.82, SEAT[2] - 0.22], [0.44, 0.56, 0.06], '#2E3440', 0.03, [0.1, 0, 0])
  b.cyl([SEAT[0], 0.23, SEAT[2]], 0.03, 0.4, '#8C949D', 10)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    b.box([SEAT[0] + Math.sin(a) * 0.15, 0.05, SEAT[2] + Math.cos(a) * 0.15], [0.04, 0.03, 0.3], '#5C6672', 0.01, [0, a, 0])
  }
  // A filing cabinet and a plant at the back of the base.
  b.box([BASE.x + 1.45, 0.55, BASE.z - 1.15], [0.6, 1.1, 0.6], '#5C6672', 0.03)
  for (let i = 0; i < 3; i++) {
    b.box([BASE.x + 1.45, 0.25 + i * 0.33, BASE.z - 0.84], [0.52, 0.28, 0.02], '#6E7884', 0.01)
    b.box([BASE.x + 1.45, 0.33 + i * 0.33, BASE.z - 0.825], [0.16, 0.03, 0.02], '#B9C0C8', 0.006)
  }
  b.cyl([BASE.x - 1.55, 0.22, BASE.z - 1.15], 0.18, 0.44, '#8C949D', 16, undefined, 0.15)
  for (let k = 0; k < 6; k++) b.ball([BASE.x - 1.55 + Math.sin(k * 2.3) * 0.14, 0.62 + (k % 3) * 0.13, BASE.z - 1.15 + Math.cos(k * 2.3) * 0.12], 0.14, k % 2 ? '#5E8A5A' : '#6E9C66', [1, 0.8, 1], 10)
})
const gmScreen = bake(b => b.box([DESK_C[0] + 0.545, 1.05, -1.565], [0.38, 0.26, 0.006], '#FFFFFF', 0.002, [0, -0.5, 0]))
const SLIP_GEO = bake(b => b.box([0, 0, 0], [0.36, 0.02, 0.26], '#FFFFFF', 0.006))

/** Decisions waiting that aren't a purchase (those wait as the item itself): cobalt slips in the tray. */
function TraySlips() {
  const refs = useRef<(Mesh | null)[]>([])
  const mat = useMemo(() => new MeshStandardMaterial({ color: GLAZE.hold, roughness: 0.6 }), [])
  useFrame(() => {
    let n = 0
    for (const h of feed.getWorld().holds) if (h.open && h.kind !== 'purchase') n++
    for (let i = 0; i < 4; i++) {
      const m = refs.current[i]
      if (m) m.visible = i < n
    }
  })
  return (
    <>
      {[0, 1, 2, 3].map(i => (
        <mesh
          key={i}
          ref={el => {
            refs.current[i] = el
          }}
          geometry={SLIP_GEO}
          material={mat}
          position={[GM_TRAY[0] - 0.02 + i * 0.015, 0.82 + i * 0.024, GM_TRAY[2] + 0.01 * i]}
          rotation={[0, 0.08 * (i - 1.5), 0]}
          visible={false}
        />
      ))}
    </>
  )
}

function GrantManager() {
  const waiting = useRef(0)
  useFrame(() => {
    waiting.current = WORK['p:grant_manager'] ?? 0
  })
  const hit = useMemo(() => new SphereGeometry(1, 12, 8), [])
  return (
    <Pick id="p:grant_manager">
      <group position={SEAT}>
        <GrantManagerFigure waiting={waiting} />
      </group>
      <mesh geometry={hit} material={hitMat} position={[DESK_C[0], 0.9, -1.8]} scale={[1.0, 0.95, 0.8]} visible={false} />
    </Pick>
  )
}

export const OfficeMobile = memo(function OfficeMobile() {
  return (
    <group>
      <mesh geometry={BASE_GEO} material={CLAY} castShadow receiveShadow />
      <mesh geometry={gmScreen} material={M.screen} />
      <TraySlips />
      <GrantManager />
      <Wires />
      <Agent id="a:purchasing" geo={PURCH_GEO} lensAt={[0, 0.12, 0.52]} lensR={0.13} />
      <Agent id="a:bookkeeping" geo={BOOK_GEO} lensAt={[0, 0.1, 0.44]} lensR={0.1} />
      <Agent id="a:payment_report" geo={PAY_GEO} lensAt={[0, 0.2, 0.185]} lensR={0.09} />
      {GRANTS.map(gid => (
        <Vessel key={gid} gid={gid} />
      ))}
      {HANGS.filter(h => h.shape === 'source').map(h => (
        <SourceNode key={h.id} id={h.id} />
      ))}
      <Hanging id="v:vendors" spec={specOf('v:vendors')} outline={VENDOR_GEO}>
        <mesh geometry={VENDOR_GEO} material={CLAY} castShadow />
      </Hanging>
      <Hanging id="p:funder" spec={specOf('p:funder')} outline={FUNDER_GEO}>
        <mesh geometry={FUNDER_GEO} material={CLAY} castShadow />
      </Hanging>
      {/* The hook under the purchasing agent where requests wait while they're checked. */}
      <PickupHook />
    </group>
  )
})

function PickupHook() {
  const g = useRef<Group>(null)
  useFrame(() => {
    g.current?.position.copy(P.get('pk')!)
  })
  return (
    <group ref={g}>
      <mesh material={M.wire} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.06, 0.015, 8, 16]} />
      </mesh>
    </group>
  )
}

