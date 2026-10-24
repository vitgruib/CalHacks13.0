// The machine's hardware: rails, gates, switch, hoppers with padlocks, the
// ticker, press, benches. Static geometry is built once; moving parts read
// the effect bus (kit.fx) in useFrame.

import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Curve,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { feed, R01, R21 } from '../../feed'
import { C, COL, M, fx, paint, spring, uiStore, type Paint } from './kit'
import {
  BALL_R,
  BENCH_X,
  BENCH_Z,
  BIN,
  CABLE_Y,
  CRADLE,
  CROSSOVERS,
  DESK,
  DISPENSER,
  FAIL_LANE,
  FUNDER,
  FUNDER_LINE,
  GATE_X,
  GM_BIN,
  HOPPER,
  INVOICE,
  LIFT,
  LIFT_TOP,
  LOOP,
  MAIN_LANE,
  PRESS,
  RECHECK,
  RERUN,
  RESEARCHER_IDS,
  SOURCES,
  SOURCE_Z,
  SW,
  TICKER,
  TO_BIN,
  TO_CRADLE,
  TO_LOOP,
  TO_TRAY,
  TRAY_BACK,
  UP,
  VENDORS,
  ballY,
  chargeLine,
  chute,
  cradleToHopper,
  docLine,
  holdLine,
  releaseAt,
  returnTrack,
  rounded,
  signalLine,
  tape,
  toHopper,
  trayAt,
  v,
} from './layout'

// ── Picking ───────────────────────────────────────────────────────────────

let cursorEl: HTMLElement | null = null
export const setCursorEl = (el: HTMLElement | null) => {
  cursorEl = el
}
export function Hit({ id, children }: { id: string; children: ReactNode }) {
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (uiStore.get().hover !== id) uiStore.set({ hover: id })
    if (cursorEl) cursorEl.style.cursor = 'pointer'
  }
  const out = () => {
    if (uiStore.get().hover === id) uiStore.set({ hover: undefined })
    if (cursorEl) cursorEl.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    uiStore.set({ selected: id, sheet: 'detail' })
  }
  return (
    <group onPointerOver={over} onPointerOut={out} onClick={click}>
      {children}
    </group>
  )
}

// ── Little helpers ────────────────────────────────────────────────────────

const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d)
const tmpQ = new Quaternion()
const tmpS = new Vector3()

function Box({ p, s, m = M.black, cast = true }: { p: [number, number, number]; s: [number, number, number]; m?: MeshStandardMaterial; cast?: boolean }) {
  const g = useMemo(() => box(...s), [s[0], s[1], s[2]])
  return <mesh geometry={g} material={m} position={p} castShadow={cast} receiveShadow />
}
function Cyl({ p, r, h, m = M.black, rot, seg = 24 }: { p: [number, number, number]; r: number; h: number; m?: MeshStandardMaterial; rot?: [number, number, number]; seg?: number }) {
  const g = useMemo(() => new CylinderGeometry(r, r, h, seg), [r, h, seg])
  return <mesh geometry={g} material={m} position={p} rotation={rot} castShadow receiveShadow />
}

/** A rod between two points. */
function rodMatrix(a: Vector3, b: Vector3, r: number) {
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const dir = b.clone().sub(a)
  const len = dir.length()
  tmpQ.setFromUnitVectors(UP, dir.normalize())
  tmpS.set(r, len, r)
  return new Matrix4().compose(mid, tmpQ, tmpS)
}

// ── Rails, ties and supports, merged into a handful of draw calls ────────

const inPlinth = (p: Vector3) => p.x > -9.5 && p.x < 6.7 && p.z > -1.15 && p.z < 2.15

function railsFor(curve: Curve<Vector3>, geos: BufferGeometry[], ties: Matrix4[], posts: Matrix4[], opts: { gauge?: number; drop?: number; tieEvery?: number; postEvery?: number } = {}) {
  const gauge = opts.gauge ?? 0.27
  const drop = opts.drop ?? 0.2
  const len = curve.getLength()
  const n = Math.max(8, Math.ceil(len * 5))
  const L: Vector3[] = []
  const R: Vector3[] = []
  let lat = new Vector3(0, 0, 1)
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const p = curve.getPointAt(u)
    const t = curve.getTangentAt(u)
    const l = new Vector3().crossVectors(t, UP)
    if (l.lengthSq() > 1e-4) lat = l.normalize()
    const base = p.clone().add(new Vector3(0, -drop, 0))
    L.push(base.clone().addScaledVector(lat, gauge / 2))
    R.push(base.clone().addScaledVector(lat, -gauge / 2))
  }
  geos.push(new TubeGeometry(new CatmullRomCurve3(L), n, 0.034, 6), new TubeGeometry(new CatmullRomCurve3(R), n, 0.034, 6))
  const tieEvery = opts.tieEvery ?? 0.55
  for (let d = tieEvery / 2; d < len; d += tieEvery) {
    const u = d / len
    const p = curve.getPointAt(u).add(new Vector3(0, -drop - 0.05, 0))
    const t = curve.getTangentAt(u)
    const l = new Vector3().crossVectors(t, UP)
    if (l.lengthSq() < 1e-4) continue
    l.normalize()
    const up2 = new Vector3().crossVectors(t, l).normalize().negate()
    const m = new Matrix4().makeBasis(l, up2, t)
    m.setPosition(p)
    ties.push(m)
  }
  const postEvery = opts.postEvery ?? 2.8
  for (let d = postEvery * 0.6; d < len - 0.3; d += postEvery) {
    const p = curve.getPointAt(d / len)
    const bottom = inPlinth(p) ? 0.6 : 0
    const top = p.y - drop - 0.08
    if (top - bottom < 0.3) continue
    posts.push(rodMatrix(v(p.x, bottom, p.z), v(p.x, top, p.z), 0.05))
  }
}

function cable(points: Vector3[], r: number, geos: BufferGeometry[], radius = 0.5, lift = 0) {
  const c = rounded(points.map(p => p.clone().add(new Vector3(0, lift, 0))), radius)
  geos.push(new TubeGeometry(c, Math.max(12, Math.ceil(c.getLength() * 3)), r, 6))
}

function Network() {
  const built = useMemo(() => {
    const rails: BufferGeometry[] = []
    const ties: Matrix4[] = []
    const posts: Matrix4[] = []
    for (const id of RESEARCHER_IDS) railsFor(chute(id), rails, ties, posts, { postEvery: 2.2 })
    railsFor(rounded(MAIN_LANE, 0.6), rails, ties, posts)
    railsFor(rounded(FAIL_LANE, 0.6), rails, ties, posts)
    const dest = [toHopper(R01), toHopper(R21), TO_BIN, TO_LOOP, TO_CRADLE, TO_TRAY, cradleToHopper(R01), cradleToHopper(R21), RERUN, ...RESEARCHER_IDS.map(returnTrack)]
    for (const t of dest) if (t.rail) railsFor(rounded(t.rail, 0.5), rails, ties, posts)
    for (const c of CROSSOVERS) railsFor(rounded(c, 0.4), rails, ties, posts)

    const cables: BufferGeometry[] = []
    for (const id of RESEARCHER_IDS) {
      const d = docLine(id)
      cable([d[0], d[1], d[2]], 0.035, cables, 0.4, 0.2)
    }
    cable(docLine('ortiz').slice(2), 0.045, cables, 0.6, 0.2)
    for (const from of ['a:purchasing', 'a:bookkeeping', 'a:payment_report']) cable(holdLine(from), 0.03, cables, 0.5, 0.18)
    cable(INVOICE, 0.03, cables, 0.6, 0.18)
    cable(FUNDER_LINE, 0.03, cables, 0.4, 0.18)
    const conduits: BufferGeometry[] = []
    for (const g of [R01, R21]) cable(signalLine(g), 0.05, conduits, 0.3)
    for (const g of [R01, R21]) cable(chargeLine(g), 0.06, conduits, 0.4, -0.06)
    const recheck = new TubeGeometry(RECHECK, 64, 0.055, 8)

    const tapes = SOURCES.map(s => {
      const [a, b] = tape(s.id)
      const mid = a.clone().add(b).multiplyScalar(0.5).add(new Vector3(0, -0.06, 0))
      const dir = b.clone().sub(a)
      const m = new Matrix4().lookAt(a, b, UP)
      m.setPosition(mid)
      return { m, len: dir.length() }
    })

    return {
      rails: mergeGeometries(rails),
      cables: mergeGeometries(cables),
      conduits: mergeGeometries(conduits),
      recheck,
      ties,
      posts,
      tapes,
    }
  }, [])

  const tieRef = useRef<InstancedMesh>(null)
  const postRef = useRef<InstancedMesh>(null)
  const tieGeo = useMemo(() => box(0.4, 0.04, 0.08), [])
  const postGeo = useMemo(() => new CylinderGeometry(1, 1, 1, 8), [])
  const tapeGeo = useMemo(() => box(0.3, 0.02, 1), [])

  useLayoutEffect(() => {
    const t = tieRef.current
    const p = postRef.current
    if (t) {
      built.ties.forEach((m, i) => t.setMatrixAt(i, m))
      t.instanceMatrix.needsUpdate = true
    }
    if (p) {
      built.posts.forEach((m, i) => p.setMatrixAt(i, m))
      p.instanceMatrix.needsUpdate = true
    }
  }, [built])

  return (
    <group>
      <mesh geometry={built.rails} material={M.rail} castShadow />
      <mesh geometry={built.cables} material={M.black} />
      <mesh geometry={built.conduits} material={M.black} receiveShadow />
      <mesh geometry={built.recheck} material={M.cobalt} castShadow />
      <instancedMesh ref={tieRef} args={[tieGeo, M.black, built.ties.length]} castShadow frustumCulled={false} />
      <instancedMesh ref={postRef} args={[postGeo, M.black, built.posts.length]} castShadow frustumCulled={false} />
      {built.tapes.map((t, i) => (
        <mesh key={i} geometry={tapeGeo} material={M.ash} matrixAutoUpdate={false} matrix={t.m.clone().multiply(new Matrix4().makeScale(1, 1, t.len))} receiveShadow />
      ))}
    </group>
  )
}

// ── Ground ────────────────────────────────────────────────────────────────

function concreteTexture() {
  const s = 512
  const cv = document.createElement('canvas')
  cv.width = cv.height = s
  const g = cv.getContext('2d')!
  g.fillStyle = C.ground
  g.fillRect(0, 0, s, s)
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 9000; i++) {
    const l = rnd()
    g.fillStyle = l > 0.5 ? `rgba(255,255,255,${0.05 + rnd() * 0.06})` : `rgba(40,48,54,${0.03 + rnd() * 0.05})`
    g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 1.5, 1 + rnd() * 1.5)
  }
  g.fillStyle = 'rgba(60,68,74,0.28)'
  g.fillRect(0, 0, s, 2)
  g.fillRect(0, 0, 2, s)
  const t = new CanvasTexture(cv)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(32, 32)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function Ground() {
  const mat = useMemo(() => new MeshStandardMaterial({ map: concreteTexture(), roughness: 0.96, metalness: 0 }), [])
  const geo = useMemo(() => new CircleGeometry(160, 48), [])
  return (
    <group>
      <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
      {/* the lab floor: a pale slab the benches stand on */}
      <Box p={[BENCH_X - 0.1, 0.04, -0.8]} s={[6.6, 0.08, 14.6]} m={M.ash} cast={false} />
    </group>
  )
}

// ── The six gates ─────────────────────────────────────────────────────────

const lampOn = { pass: COL.yellow, fail: COL.red, skip: COL.grey, idle: COL.lampOff }

function Gate({ i }: { i: number }) {
  const x = GATE_X[i]
  const flapRef = useRef<Group>(null)
  const kickRef = useRef<Group>(null)
  const lampMat = useMemo(() => new MeshStandardMaterial({ color: '#2b2f34', roughness: 0.3, metalness: 0.2, emissive: COL.lampOff.clone(), emissiveIntensity: 0 }), [])
  const plateMat = useMemo(() => new MeshStandardMaterial({ color: C.ash, roughness: 0.6, metalness: 0.1, emissive: COL.yellow.clone(), emissiveIntensity: 0 }), [])
  const by = ballY(x)
  const pivotY = 4.95
  const flapLen = pivotY - (by - 0.1)
  const flapGeo = useMemo(() => {
    const g = box(0.05, flapLen, 0.52)
    g.translate(0, -flapLen / 2, 0)
    return g
  }, [flapLen])
  const plateGeo = useMemo(() => box(0.5, 0.06, 0.62), [])

  useFrame((_, dt) => {
    const g = fx.gates[i]
    const d = Math.min(dt, 0.05) * feedRate()
    spring(g.flap, 0, 70, 5.5, d)
    if (g.flap.x < 0) {
      g.flap.x = 0
      g.flap.v = -g.flap.v * 0.3
    }
    if (flapRef.current) flapRef.current.rotation.z = g.flap.x + Math.sin(g.shake * 60) * 0.06 * g.shake
    g.shake = Math.max(0, g.shake - d * 2.5)
    g.flash = Math.max(0, g.flash - d * 1.4)
    const on = lampOn[g.lamp]
    lampMat.emissive.copy(on)
    lampMat.emissiveIntensity = g.lamp === 'idle' ? 0 : (g.lamp === 'skip' ? 0.25 : 1.1) + g.flash * 5
    plateMat.emissive.copy(g.lamp === 'fail' ? COL.red : COL.yellow)
    plateMat.emissiveIntensity = g.lamp === 'pass' || g.lamp === 'fail' ? 0.12 + g.flash * 0.5 : 0
    g.kick = Math.max(0, g.kick - d * 2.6)
    const k = g.kick > 0.8 ? (1 - g.kick) / 0.2 : g.kick / 0.8
    if (kickRef.current) kickRef.current.position.z = -0.62 + k * 0.42
  })

  return (
    <Hit id="a:purchasing">
      <group position={[x, 0, 0]}>
        <Box p={[0, 2.8, -0.55]} s={[0.15, 4.4, 0.15]} />
        <Box p={[0, 2.65, 1.55]} s={[0.15, 4.1, 0.15]} />
        <Box p={[0, 5.0, 0.5]} s={[0.2, 0.2, 2.3]} />
        <mesh geometry={plateGeo} material={plateMat} position={[0, 5.13, 0.5]} castShadow />
        <mesh material={lampMat} position={[0, 5.27, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.17, 0.2, 24]} />
        </mesh>
        <group ref={flapRef} position={[0, pivotY, 0]}>
          <mesh geometry={flapGeo} material={M.ash} castShadow />
          <Cyl p={[0, 0, 0]} r={0.05} h={0.62} rot={[Math.PI / 2, 0, 0]} />
        </group>
        {/* the kicker: a red piston behind the main lane */}
        <Box p={[0, by, -0.86]} s={[0.3, 0.3, 0.26]} />
        <group ref={kickRef} position={[0, by, -0.62]}>
          <Cyl p={[0, 0, 0]} r={0.09} h={0.34} m={M.red} rot={[Math.PI / 2, 0, 0]} />
        </group>
      </group>
    </Hit>
  )
}

/** Feed playback rate (0 when paused): the machine runs on feed time. */
export const feedRate = () => {
  const w = feed.getWorld()
  return w.playing ? w.speed : 0
}

function Switch() {
  const arm = useRef<Group>(null)
  const lampMat = useMemo(() => new MeshStandardMaterial({ color: '#2b2f34', emissive: COL.cobalt.clone(), emissiveIntensity: 0 }), [])
  useFrame((st, dt) => {
    const d = Math.min(dt, 0.05) * feedRate()
    let target = fx.sw.target
    while (target - fx.sw.angle.x > Math.PI) target -= Math.PI * 2
    while (target - fx.sw.angle.x < -Math.PI) target += Math.PI * 2
    spring(fx.sw.angle, target, 90, 9, d)
    if (arm.current) arm.current.rotation.y = fx.sw.angle.x
    fx.sw.deciding = Math.max(0, fx.sw.deciding - d * 0.25)
    const blink = fx.sw.deciding > 0 ? 0.5 + 0.5 * Math.sin(st.clock.elapsedTime * 9) : 0
    lampMat.emissiveIntensity = blink * 3.2
  })
  const top = SW.y - BALL_R - 0.06
  return (
    <Hit id="a:purchasing">
      <group position={[SW.x, 0, SW.z]}>
        <Cyl p={[0, top / 2 + 0.3, 0]} r={0.16} h={top - 0.6} />
        <Cyl p={[0, top, 0]} r={0.8} h={0.12} seg={40} />
        <group ref={arm} position={[0, top + 0.1, 0]}>
          <Box p={[0.45, 0, 0]} s={[0.9, 0.08, 0.2]} m={M.yellow} />
          <Cyl p={[0, 0, 0]} r={0.14} h={0.12} m={M.yellow} />
        </group>
        {/* mast for the recheck tube and the "checking again" lamp */}
        <Box p={[0.15, (top + 4.5) / 2, -0.7]} s={[0.12, 4.5 - top, 0.12]} />
        <mesh material={lampMat} position={[0.15, 4.62, -0.7]}>
          <sphereGeometry args={[0.16, 20, 14]} />
        </mesh>
      </group>
    </Hit>
  )
}

function Plinth() {
  return (
    <Hit id="a:purchasing">
      <Box p={[-1.4, 0.3, 0.5]} s={[16.2, 0.6, 3.3]} />
      <Box p={[-1.4, 0.62, 0.5]} s={[16.0, 0.04, 3.1]} m={M.ash} />
      {/* a red datum stripe on the plinth face */}
      <Box p={[-1.4, 0.3, 2.16]} s={[16.2, 0.08, 0.02]} m={M.red} cast={false} />
    </Hit>
  )
}

// ── Destinations ─────────────────────────────────────────────────────────

function Bucket({ at, r = 0.62, h = 1.1 }: { at: Vector3; r?: number; h?: number }) {
  const g = useMemo(() => new CylinderGeometry(r, r * 0.82, h, 36, 1, true), [r, h])
  return (
    <group position={at}>
      <mesh geometry={g} material={M.redSide} position={[0, h / 2, 0]} castShadow receiveShadow />
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={M.black}>
        <circleGeometry args={[r * 0.82, 32]} />
      </mesh>
    </group>
  )
}

function Loop() {
  const inner = useMemo(() => new TorusGeometry(LOOP.r - 0.135, 0.034, 6, 64), [])
  const outer = useMemo(() => new TorusGeometry(LOOP.r + 0.135, 0.034, 6, 64), [])
  const y = LOOP.c.y - 0.2
  const carrier = useRef<Mesh>(null)
  useFrame(() => {
    if (!carrier.current) return
    carrier.current.position.y = fx.lift.active ? fx.lift.y - 0.27 : LOOP.c.y - 0.27
  })
  return (
    <group>
      <mesh position={[LOOP.c.x, y - 0.18, LOOP.c.z]} rotation={[-Math.PI / 2, 0, 0]} material={M.yellow} receiveShadow castShadow>
        <circleGeometry args={[LOOP.r + 0.3, 48]} />
      </mesh>
      <mesh geometry={inner} material={M.rail} position={[LOOP.c.x, y, LOOP.c.z]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={outer} material={M.rail} position={[LOOP.c.x, y, LOOP.c.z]} rotation={[Math.PI / 2, 0, 0]} />
      <Cyl p={[LOOP.c.x, (y - 0.2) / 2, LOOP.c.z]} r={0.09} h={y - 0.2} />
      {/* the lift that carries a parked ball back to the gates */}
      <Box p={[LIFT.x, (LIFT_TOP.y + 0.25) / 2, LIFT.z - 0.3]} s={[0.12, LIFT_TOP.y + 0.25, 0.12]} />
      <mesh ref={carrier} position={[LIFT.x, LOOP.c.y - 0.27, LIFT.z]} material={M.yellow} castShadow>
        <boxGeometry args={[0.34, 0.08, 0.34]} />
      </mesh>
    </group>
  )
}

function Cradle() {
  const g = useMemo(() => new TorusGeometry(0.27, 0.045, 8, 20, Math.PI), [])
  return (
    <group>
      <group position={[CRADLE.x, CRADLE.y, CRADLE.z]}>
        <mesh geometry={g} material={M.black} rotation={[0, 0, Math.PI]} position={[0, 0, 0.13]} castShadow />
        <mesh geometry={g} material={M.black} rotation={[0, 0, Math.PI]} position={[0, 0, -0.13]} castShadow />
        <Box p={[0, -0.05, -0.45]} s={[0.12, 0.12, 0.7]} />
      </group>
      <Box p={[CRADLE.x, CRADLE.y / 2, CRADLE.z - 0.8]} s={[0.14, CRADLE.y, 0.14]} />
      <Bucket at={GM_BIN} r={0.45} h={0.9} />
    </group>
  )
}

function Trays() {
  return (
    <group>
      {/* sent back to fix: a cobalt tray beside the switch */}
      <Box p={[TRAY_BACK.x, TRAY_BACK.y - 0.27, TRAY_BACK.z]} s={[0.8, 0.06, 0.8]} m={M.cobalt} />
      <Box p={[TRAY_BACK.x, (TRAY_BACK.y - 0.3) / 2 + 0.3, TRAY_BACK.z]} s={[0.1, TRAY_BACK.y - 0.9, 0.1]} />
      {/* the answer dispenser where verdicts leave for the lab */}
      <Box p={[DISPENSER.x + 0.15, DISPENSER.y - 0.05, DISPENSER.z]} s={[0.55, 0.55, 0.6]} />
      <Box p={[DISPENSER.x - 0.13, DISPENSER.y - 0.02, DISPENSER.z]} s={[0.02, 0.24, 0.34]} m={M.yellow} cast={false} />
      <Box p={[DISPENSER.x + 0.15, (DISPENSER.y - 0.32) / 2, DISPENSER.z]} s={[0.12, DISPENSER.y - 0.32, 0.12]} />
      <Bucket at={BIN} />
    </group>
  )
}

// ── Grant hoppers with their padlocks ────────────────────────────────────

const FILL_H = 1.55
function Hopper({ g }: { g: string }) {
  const at = HOPPER[g]
  const fill = useRef<Mesh>(null)
  const lock = useRef<Group>(null)
  const body = useRef<Group>(null)
  const level = useRef({ x: 0.5, v: 0 })
  const fillGeo = useMemo(() => {
    const b = box(1.3, 1, 1.3)
    b.translate(0, 0.5, 0)
    return b
  }, [])
  const funnel = useMemo(() => new CylinderGeometry(0.92, 0.32, 0.42, 40, 1, true), [])
  const ticks = useMemo(() => Array.from({ length: 11 }, (_, i) => 0.33 + (FILL_H * i) / 10), [])
  const color = g === R21 ? M.yellow : M.cobalt

  useFrame((st, dt) => {
    const d = Math.min(dt, 0.05)
    const grant = feed.getWorld().grants.find(x => x.id === g)
    const ratio = grant ? Math.max(0.02, grant.available / grant.awarded) : 0.5
    spring(level.current, ratio, 30, 7, d)
    const h = fx.hopper[g]
    if (h) h.gulp = Math.max(0, h.gulp - d * 1.8)
    const gulp = h ? Math.sin((1 - h.gulp) * Math.PI * 3) * h.gulp * 0.06 : 0
    if (fill.current) fill.current.scale.y = Math.max(0.01, level.current.x * FILL_H * (1 + gulp))
    const L = fx.lock[g]
    if (!L) return
    const dd = d * Math.max(0.5, feedRate())
    spring(L.a, L.frozen ? 0 : 1.62, 80, 6.5, dd)
    if (L.a.x < 0) {
      L.a.x = 0
      L.a.v = -L.a.v * 0.35
    }
    L.rattle = Math.max(0, L.rattle - dd * 0.7)
    const shake = Math.sin(st.clock.elapsedTime * 38) * L.rattle
    if (lock.current) lock.current.rotation.z = L.a.x + shake * 0.07
    if (body.current) body.current.rotation.z = shake * 0.35
  })

  return (
    <Hit id={`g:${g}`}>
      <group position={[at.x, 0, at.z]}>
        <Box p={[0, 0.15, 0]} s={[2.1, 0.3, 2.1]} />
        {[-0.75, 0.75].flatMap(x => [-0.75, 0.75].map(z => <Box key={`${x}${z}`} p={[x, 1.12, z]} s={[0.1, 1.64, 0.1]} />))}
        <Box p={[0, 1.95, 0.75]} s={[1.6, 0.1, 0.1]} />
        <Box p={[0, 1.95, -0.75]} s={[1.6, 0.1, 0.1]} />
        <Box p={[0.75, 1.95, 0]} s={[0.1, 0.1, 1.6]} />
        <Box p={[-0.75, 1.95, 0]} s={[0.1, 0.1, 1.6]} />
        {ticks.map((y, i) => (
          <Box key={i} p={[0.83, y, 0.75]} s={[i % 5 === 0 ? 0.16 : 0.08, 0.025, 0.03]} m={M.black} cast={false} />
        ))}
        <mesh ref={fill} geometry={fillGeo} material={color} position={[0, 0.32, 0]} castShadow receiveShadow />
        <mesh geometry={funnel} material={M.blackSide} position={[0, 2.11, 0]} castShadow receiveShadow />
        {/* the padlock bar: hinged at the left of the mouth */}
        <Box p={[-1.0, 2.2, 0]} s={[0.14, 0.5, 0.14]} />
        <group ref={lock} position={[-1.0, 2.44, 0]}>
          <Box p={[1.0, 0, 0]} s={[2.05, 0.13, 0.24]} m={M.red} />
          <group ref={body} position={[1.0, -0.06, 0]}>
            <mesh position={[0, -0.02, 0]} material={M.black} castShadow>
              <torusGeometry args={[0.13, 0.04, 8, 20, Math.PI]} />
            </mesh>
            <Box p={[0, -0.26, 0]} s={[0.4, 0.42, 0.2]} />
            <mesh position={[0, -0.24, 0.105]} material={M.yellow}>
              <circleGeometry args={[0.055, 16]} />
            </mesh>
          </group>
        </group>
      </group>
    </Hit>
  )
}

// ── The lab: benches, people, drop towers ─────────────────────────────────

const ROLE_PAINT: Record<string, Paint> = { ortiz: 'red', okafor: 'cobalt', raman: 'yellow', silva: 'yellow', park: 'steel' }

function Prop({ id }: { id: string }) {
  if (id === 'ortiz')
    return (
      <group position={[-0.4, 1.0, -0.35]}>
        <Box p={[0, 0.62, 0]} s={[1.7, 1.05, 0.06]} m={M.ash} />
        <Box p={[0, 0.62, -0.04]} s={[1.8, 1.15, 0.04]} />
        <Box p={[-0.35, 0.8, 0.04]} s={[0.6, 0.05, 0.01]} m={M.red} cast={false} />
        <Box p={[0.2, 0.55, 0.04]} s={[0.8, 0.05, 0.01]} m={M.cobalt} cast={false} />
        <mesh position={[0.45, 0.85, 0.04]} material={M.yellow}>
          <circleGeometry args={[0.12, 20]} />
        </mesh>
      </group>
    )
  if (id === 'okafor')
    return (
      <group position={[-0.5, 1.0, -0.15]}>
        <Box p={[0, 0.3, 0]} s={[0.9, 0.6, 0.5]} />
        {[-0.3, -0.1, 0.1, 0.3].map(x => (
          <Cyl key={x} p={[x, 0.85, 0]} r={0.05} h={0.5} m={x === 0.1 ? M.cobalt : M.ash} />
        ))}
        <Box p={[0.75, 0.15, 0.1]} s={[0.4, 0.3, 0.4]} m={M.ash} />
      </group>
    )
  if (id === 'raman')
    return (
      <group position={[-0.5, 1.0, -0.2]}>
        <Box p={[0, 0.55, 0]} s={[1.5, 1.1, 0.8]} m={M.ash} />
        <Box p={[0, 0.5, 0.41]} s={[1.2, 0.6, 0.02]} m={M.black} cast={false} />
        <Box p={[0, 1.12, 0]} s={[1.5, 0.06, 0.8]} m={M.yellow} />
      </group>
    )
  if (id === 'silva')
    return (
      <group position={[-0.5, 1.0, -0.1]}>
        <Box p={[0, 0.08, 0]} s={[0.8, 0.16, 0.6]} />
        <Cyl p={[-0.2, 0.6, 0]} r={0.08} h={1.0} />
        <Box p={[0.05, 1.05, 0]} s={[0.6, 0.18, 0.22]} m={M.ash} />
        <Cyl p={[0.25, 0.8, 0]} r={0.07} h={0.4} m={M.cobalt} />
      </group>
    )
  return (
    <group position={[-0.6, 1.0, -0.2]}>
      <Box p={[0, 0.8, 0]} s={[0.9, 1.6, 0.8]} m={M.ash} />
      <Box p={[0.3, 0.9, 0.41]} s={[0.06, 0.5, 0.04]} />
      {[0, 1, 2].map(i => (
        <Box key={i} p={[0.8 + (i % 2) * 0.1, 0.12 + i * 0.25, 0.1]} s={[0.36, 0.22, 0.32]} m={i === 1 ? M.yellow : M.black} />
      ))}
    </group>
  )
}

function Bench({ id }: { id: string }) {
  const z = BENCH_Z[id]
  const fig = useRef<Group>(null)
  const lever = useRef<Group>(null)
  const trayMat = useMemo(() => new MeshStandardMaterial({ color: C.ash, roughness: 0.6, emissive: COL.yellow.clone(), emissiveIntensity: 0 }), [])
  const rel = releaseAt(id)
  const tray = trayAt(id)
  useFrame((st, dt) => {
    const b = fx.bench[id]
    if (!b) return
    const d = Math.min(dt, 0.05)
    b.send = Math.max(0, b.send - d * 1.5)
    b.recv = Math.max(0, b.recv - d * 0.8)
    const t = st.clock.elapsedTime + z
    if (fig.current) {
      fig.current.rotation.x = -0.18 * Math.sin(b.send * Math.PI) - 0.03 * (1 + Math.sin(t * 0.9))
      fig.current.position.y = 0.04 * Math.sin(b.recv * Math.PI * 3) * b.recv
    }
    if (lever.current) lever.current.rotation.z = -0.9 * Math.sin(b.send * Math.PI)
    trayMat.emissive.copy(b.color)
    trayMat.emissiveIntensity = b.recv * 0.7
  })
  return (
    <Hit id={`r:${id}`}>
      <group position={[BENCH_X, 0, z]}>
        <Box p={[0, 0.95, 0]} s={[3.0, 0.1, 1.3]} m={M.ash} />
        {[-1.35, 1.35].flatMap(x => [-0.55, 0.55].map(zz => <Box key={`${x}${zz}`} p={[x, 0.45, zz]} s={[0.08, 0.9, 0.08]} />))}
        <Box p={[0, 0.25, 0]} s={[2.7, 0.05, 1.1]} />
        <Prop id={id} />
      </group>
      <group ref={fig} position={[BENCH_X - 0.5, 0, z - 1.0]}>
        <mesh position={[0, 0.62, 0]} material={paint(ROLE_PAINT[id] ?? 'steel')} castShadow>
          <cylinderGeometry args={[0.24, 0.36, 1.24, 28]} />
        </mesh>
        <mesh position={[0, 1.27, 0]} material={M.ash} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.06, 28]} />
        </mesh>
        <mesh position={[0, 1.55, 0]} material={M.ash} castShadow>
          <sphereGeometry args={[0.22, 24, 16]} />
        </mesh>
      </group>
      {/* drop tower and release cup */}
      <Box p={[rel.x + 0.25, (rel.y - 0.25) / 2 + 0.5, rel.z]} s={[0.1, rel.y - 1.25, 0.1]} />
      <mesh position={[rel.x, rel.y - 0.16, rel.z]} material={M.blackSide} castShadow>
        <cylinderGeometry args={[0.3, 0.18, 0.22, 24, 1, true]} />
      </mesh>
      <group ref={lever} position={[rel.x + 0.25, rel.y - 0.3, rel.z + 0.18]}>
        <Box p={[-0.2, 0, 0]} s={[0.4, 0.06, 0.06]} m={M.yellow} />
      </group>
      {/* the answer tray */}
      <mesh position={[tray.x, tray.y - 0.2, tray.z]} material={trayMat} castShadow receiveShadow>
        <boxGeometry args={[0.66, 0.05, 0.6]} />
      </mesh>
      <Box p={[tray.x, (tray.y - 0.22) / 2, tray.z]} s={[0.08, tray.y - 0.22, 0.08]} />
      {/* document mast to the overhead line */}
      <Box p={[-17.6, (CABLE_Y + 0.2) / 2, z]} s={[0.08, CABLE_Y + 0.2, 0.08]} />
    </Hit>
  )
}

// ── Bookkeeping ticker, sources, press, funder, vendors, desk ────────────

function Ticker() {
  const reelA = useRef<Mesh>(null)
  const reelB = useRef<Mesh>(null)
  const head = useRef<Mesh>(null)
  const reel = useRef({ x: 0, v: 0 })
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05)
    fx.ticker.tick = Math.max(0, fx.ticker.tick - d * 3)
    spring(reel.current, fx.ticker.reel, 40, 8, d)
    if (reelA.current) reelA.current.rotation.z = -reel.current.x
    if (reelB.current) reelB.current.rotation.z = -reel.current.x * 1.3
    if (head.current) head.current.position.y = 1.95 - Math.sin(fx.ticker.tick * Math.PI) * 0.18
  })
  const T = TICKER
  return (
    <Hit id="a:bookkeeping">
      <group position={[T.x, 0, T.z]}>
        <Box p={[0, 0.8, 0]} s={[3.4, 1.6, 1.5]} />
        <Box p={[0, 1.62, 0]} s={[3.3, 0.04, 1.4]} m={M.ash} />
        <mesh ref={reelA} position={[-1.05, 2.1, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.cobalt} castShadow>
          <cylinderGeometry args={[0.42, 0.42, 0.26, 6]} />
        </mesh>
        <mesh ref={reelB} position={[1.05, 2.1, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.ash} castShadow>
          <cylinderGeometry args={[0.42, 0.42, 0.26, 6]} />
        </mesh>
        <Box p={[0, 2.53, 0]} s={[2.1, 0.02, 0.24]} m={M.ash} />
        <mesh ref={head} position={[0, 1.95, 0.35]} material={M.yellow} castShadow>
          <boxGeometry args={[0.42, 0.28, 0.42]} />
        </mesh>
        <Box p={[0, 1.1, 0.76]} s={[2.6, 0.06, 0.02]} m={M.yellow} cast={false} />
      </group>
    </Hit>
  )
}

function Sources() {
  return (
    <group>
      {SOURCES.map(s => (
        <Hit key={s.id} id={s.id}>
          <group position={[s.x, 0, SOURCE_Z]}>
            <Box p={[0, 1.2, 0]} s={[1.5, 2.4, 1.0]} />
            <Box p={[0, 2.45, 0]} s={[1.5, 0.12, 1.0]} m={paint(s.cap as Paint)} />
            <Cyl p={[0, 1.6, 0.52]} r={0.32} h={0.08} m={M.ash} rot={[Math.PI / 2, 0, 0]} />
            <Box p={[0, 1.3, 0.52]} s={[0.4, 0.04, 0.06]} m={M.ash} cast={false} />
          </group>
        </Hit>
      ))}
    </group>
  )
}

function Press() {
  const ram = useRef<Mesh>(null)
  const ramMat = useMemo(() => new MeshStandardMaterial({ color: C.red, roughness: 0.4, emissive: COL.yellow.clone(), emissiveIntensity: 0 }), [])
  const sheets = useRef<Group>(null)
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05)
    fx.press.stamp = Math.max(0, fx.press.stamp - d * 1.6)
    const s = fx.press.stamp
    const down = s > 0.75 ? (1 - s) / 0.25 : s / 0.75
    if (ram.current) ram.current.position.y = 2.75 - down * 1.55
    ramMat.color.copy(fx.press.color)
    if (sheets.current) sheets.current.children.forEach((c, i) => (c.visible = i < fx.press.sheets))
  })
  const P = PRESS
  return (
    <Hit id="a:payment_report">
      <group position={[P.x, 0, P.z]}>
        <Box p={[0, 0.4, 0]} s={[2.4, 0.8, 1.8]} />
        <Box p={[0, 0.82, 0]} s={[1.2, 0.04, 1.0]} m={M.ash} />
        <Box p={[-0.95, 2.2, 0]} s={[0.18, 3.0, 0.18]} />
        <Box p={[0.95, 2.2, 0]} s={[0.18, 3.0, 0.18]} />
        <Box p={[0, 3.62, 0]} s={[2.2, 0.24, 0.5]} />
        <mesh ref={ram} position={[0, 2.75, 0]} material={ramMat} castShadow>
          <boxGeometry args={[0.95, 0.5, 0.95]} />
        </mesh>
        <Box p={[-1.6, 0.95, 0]} s={[0.7, 0.05, 0.6]} m={M.ash} />
        <Box p={[1.65, 0.5, 0]} s={[0.9, 1.0, 0.9]} />
        <group ref={sheets} position={[1.65, 1.02, 0]}>
          {Array.from({ length: 12 }, (_, i) => (
            <mesh key={i} position={[0, i * 0.035, 0]} material={i % 4 === 3 ? M.yellow : M.ash} visible={false}>
              <boxGeometry args={[0.6, 0.025, 0.44]} />
            </mesh>
          ))}
        </group>
      </group>
    </Hit>
  )
}

function Outside() {
  return (
    <group>
      <Hit id="p:funder">
        <group position={[FUNDER.x, 0, FUNDER.z]}>
          <Box p={[0, 1.8, 0]} s={[1.4, 3.6, 1.4]} m={M.ash} />
          <mesh position={[0, 3.62, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.cobalt}>
            <circleGeometry args={[0.6, 40]} />
          </mesh>
          <Box p={[0, 3.0, 0.71]} s={[0.7, 0.06, 0.02]} cast={false} />
        </group>
      </Hit>
      <Hit id="v:vendors">
        <group position={[VENDORS.x, 0, VENDORS.z]}>
          <Box p={[0, 0.18, 0]} s={[3.2, 0.36, 2.4]} />
          <Box p={[0.5, 0.71, -0.3]} s={[0.7, 0.7, 0.7]} m={M.ash} />
          <Box p={[0.5, 1.36, -0.3]} s={[0.6, 0.6, 0.6]} m={M.yellow} />
          <Box p={[1.15, 0.66, 0.5]} s={[0.6, 0.6, 0.6]} m={M.ash} />
        </group>
      </Hit>
    </group>
  )
}

function Desk() {
  const lampMat = useMemo(() => new MeshStandardMaterial({ color: '#2b2f34', emissive: COL.yellow.clone(), emissiveIntensity: 0 }), [])
  const stack = useRef<Group>(null)
  useFrame(st => {
    const open = feed.getWorld().holds.filter(h => h.open).length
    lampMat.emissiveIntensity = open ? 1.2 + 1.8 * (0.5 + 0.5 * Math.sin(st.clock.elapsedTime * 5)) : 0
    if (stack.current) stack.current.children.forEach((c, i) => (c.visible = i < open))
  })
  const D = DESK
  return (
    <Hit id="p:grant_manager">
      <group position={[D.x, 0, D.z]}>
        <Box p={[0, 1.05, 0]} s={[2.4, 0.1, 1.1]} m={M.ash} />
        {[-1.1, 1.1].map(x => (
          <Box key={x} p={[x, 0.5, 0]} s={[0.1, 1.0, 1.0]} />
        ))}
        <mesh position={[0.85, 1.36, -0.25]} material={lampMat}>
          <sphereGeometry args={[0.13, 16, 12]} />
        </mesh>
        <Box p={[0.85, 1.18, -0.25]} s={[0.05, 0.26, 0.05]} />
        <group ref={stack} position={[-0.6, 1.17, 0.1]}>
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} position={[(i % 3) * 0.36, Math.floor(i / 3) * 0.13, 0]} material={M.black} visible={false} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 0.11, 3]} />
            </mesh>
          ))}
        </group>
        <group position={[0, 0, -0.85]}>
          <mesh position={[0, 0.62, 0]} material={M.red} castShadow>
            <cylinderGeometry args={[0.24, 0.36, 1.24, 28]} />
          </mesh>
          <mesh position={[0, 1.27, 0]} material={M.ash} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 0.06, 28]} />
          </mesh>
          <mesh position={[0, 1.55, 0]} material={M.ash} castShadow>
            <sphereGeometry args={[0.22, 24, 16]} />
          </mesh>
        </group>
      </group>
    </Hit>
  )
}

// ── Ring pulses: the "moment" when something lands ───────────────────────

export function Pulses() {
  const ringGeo = useMemo(() => new RingGeometry(0.42, 0.5, 48), [])
  const mats = useMemo(() => Array.from({ length: 12 }, () => new MeshStandardMaterial({ color: '#fff', transparent: true, opacity: 0, side: DoubleSide, depthWrite: false })), [])
  const group = useRef<Group>(null)
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const d = Math.min(dt, 0.05)
    for (const p of fx.pulses) p.t += d * 1.1
    fx.pulses = fx.pulses.filter(p => p.t < 1)
    g.children.forEach((c, i) => {
      const p = fx.pulses[i]
      const m = c as Mesh
      if (!p) {
        m.visible = false
        return
      }
      m.visible = true
      m.position.copy(p.pos)
      const s = (0.4 + p.t * 2.4) * p.size
      m.scale.set(s, s, s)
      mats[i].color.copy(p.color)
      mats[i].emissive.copy(p.color)
      mats[i].emissiveIntensity = 0.4
      mats[i].opacity = (1 - p.t) * 0.9
    })
  })
  return (
    <group ref={group}>
      {mats.map((m, i) => (
        <mesh key={i} geometry={ringGeo} material={m} rotation={[-Math.PI / 2, 0, 0]} visible={false} />
      ))}
    </group>
  )
}

/** Hover / selection ring on the floor. */
export function Marker({ foot, size }: { foot: (id: string) => Vector3 | undefined; size: (id: string) => number }) {
  const ref = useRef<Mesh>(null)
  const sel = useRef<Mesh>(null)
  const geo = useMemo(() => new RingGeometry(0.9, 1.0, 64), [])
  useFrame(st => {
    const u = uiStore.get()
    const place = (m: Mesh | null, id?: string, base = 1) => {
      if (!m) return
      const at = id ? foot(id) : undefined
      m.visible = !!at
      if (!at) return
      m.position.set(at.x, 0.03, at.z)
      const s = size(id!) * base
      m.scale.set(s, s, s)
    }
    place(ref.current, u.hover, 1 + 0.03 * Math.sin(st.clock.elapsedTime * 6))
    place(sel.current, u.selected)
  })
  return (
    <group>
      <mesh ref={ref} geometry={geo} material={M.yellow} rotation={[-Math.PI / 2, 0, 0]} visible={false} />
      <mesh ref={sel} geometry={geo} material={M.red} rotation={[-Math.PI / 2, 0, 0]} visible={false} />
    </group>
  )
}

export function Hardware() {
  return (
    <group>
      <Network />
      <Plinth />
      {GATE_X.map((_, i) => (
        <Gate key={i} i={i} />
      ))}
      <Switch />
      <Loop />
      <Cradle />
      <Trays />
      <Hopper g={R01} />
      <Hopper g={R21} />
      {RESEARCHER_IDS.map(id => (
        <Bench key={id} id={id} />
      ))}
      <Ticker />
      <Sources />
      <Press />
      <Outside />
      <Desk />
    </group>
  )
}
