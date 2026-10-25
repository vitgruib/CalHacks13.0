// The network itself: a soft clay deck, neurons on short stems, weights as
// thin clay tubes. Nothing here moves on its own; every frame it reads the
// glow store (what signals touched) and the world (which grant is frozen,
// whether anything waits on the grant manager) and tints itself to match.

import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  LineCurve3,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  TubeGeometry,
  type Group,
  type Mesh,
} from 'three'
import { feed } from '../../feed'
import { GLAZE, GRANT_COLOR, PAL } from '../a1/layout'
import { glass } from '../a1/mats'
import { EDGES, G1, G2, NODES, type NNode } from './layout'
import { decay, glow } from './glow'

const clay = (c: string, roughness = 0.86) => new MeshStandardMaterial({ color: c, roughness, metalness: 0 })
const mix = (a: string, b: string, k: number) => new Color(a).lerp(new Color(b), k)

const DECK = '#E3E1DD'
const PAD = '#D9D5CE'
const WEIGHT = '#CDC8C0'
const LANE = '#D3CFC8'
const NEURON = '#EEEBE6'
const AGENT = '#DDD7CE'

function baseColor(n: NNode) {
  if (n.kind === 'grant') return mix(GRANT_COLOR[n.id.slice(2)] ?? AGENT, '#E6DFD4', 0.38)
  if (n.kind === 'out') return mix(GLAZE[n.id.slice(2) as keyof typeof GLAZE], '#DCD6CC', 0.55)
  if (n.kind === 'dec' || n.kind === 'agent') return new Color(AGENT)
  return new Color(NEURON)
}

const sphere = new SphereGeometry(1, 40, 28)
const stem = new CylinderGeometry(0.07, 0.11, 1, 14)
const ringGeo = new RingGeometry(0.88, 1, 64)

// ── Neurons ──────────────────────────────────────────────────────────────

function Neurons() {
  const list = useMemo(() => Object.values(NODES).filter(n => n.r > 0 && n.kind !== 'gm'), [])
  const mats = useMemo(() => list.map(n => ({ m: new MeshStandardMaterial({ color: baseColor(n), roughness: 0.78, metalness: 0 }), base: baseColor(n) })), [list])
  const refs = useRef<(Mesh | null)[]>([])
  const frosts = useMemo(() => [glass(), glass()], [])
  const frostRefs = useRef<(Mesh | null)[]>([])
  const frozenK = useRef([0, 0])
  const ice = useMemo(() => new Color(PAL.ice), [])
  const tmp = useMemo(() => new Color(), [])

  useFrame((_, dt) => {
    const w = feed.getWorld()
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 2.2)
    list.forEach((n, i) => {
      const { m, base } = mats[i]
      const g = glow.node.get(n.id)
      const v = g ? Math.min(1.6, g.v) : 0
      tmp.copy(base)
      if (n.kind === 'grant') {
        const gi = n.id === G1 ? 0 : 1
        const fz = w.grants.find(x => `g:${x.id}` === n.id)?.frozen ? 1 : 0
        frozenK.current[gi] += (fz - frozenK.current[gi]) * k
        const f = frozenK.current[gi]
        tmp.lerp(ice, f * 0.7)
        const u = frosts[gi].userData.u
        u.uFrost.value = f
        u.uFade.value = Math.min(1, f * 1.4)
        const fm = frostRefs.current[gi]
        if (fm) {
          fm.visible = f > 0.02
          fm.scale.setScalar(n.r + 0.42 + 0.1 * f)
        }
      }
      if (g) tmp.lerp(g.c, Math.min(1, v) * 0.85)
      m.color.copy(tmp)
      m.emissive.copy(g ? g.c : base).multiplyScalar(g ? v * 0.5 : 0)
      const mesh = refs.current[i]
      if (mesh) mesh.scale.setScalar(n.r * (n.kind === 'grant' ? 1 : 1 + 0.1 * Math.min(1, v))) // a grant never swells: money is a glow, not a fill
    })
  })

  return (
    <group>
      {list.map((n, i) => (
        <group key={n.id}>
          <mesh
            ref={el => {
              refs.current[i] = el
            }}
            geometry={sphere}
            material={mats[i].m}
            position={n.at}
            scale={n.r}
            castShadow
          />
          <mesh geometry={stem} material={STEM} position={[n.at.x, (n.at.y - n.r) / 2, n.at.z]} scale={[1, n.at.y - n.r * 0.6, 1]} castShadow />
        </group>
      ))}
      {[G1, G2].map((id, gi) => (
        <mesh
          key={id}
          ref={el => {
            frostRefs.current[gi] = el
          }}
          geometry={sphere}
          material={frosts[gi]}
          position={NODES[id].at}
          visible={false}
          renderOrder={2}
        />
      ))}
    </group>
  )
}
const STEM = clay('#D6CDBF')

// ── Weights ──────────────────────────────────────────────────────────────

function Weights() {
  const items = useMemo(
    () =>
      EDGES.map(e => {
        const curve = e.pts.length > 2 ? new CatmullRomCurve3(e.pts) : new LineCurve3(e.pts[0], e.pts[1])
        const geo = new TubeGeometry(curve, e.pts.length > 2 ? 48 : 2, e.lane ? 0.05 : 0.026, 8, false)
        const base = new Color(e.lane ? LANE : WEIGHT)
        return { e, geo, base, m: new MeshStandardMaterial({ color: base, roughness: 0.8, metalness: 0 }) }
      }),
    [],
  )
  useFrame(() => {
    for (const it of items) {
      const g = glow.edge.get(it.e.key)
      if (!g) {
        it.m.color.copy(it.base)
        it.m.emissive.setRGB(0, 0, 0)
        continue
      }
      const v = Math.min(1.8, g.v)
      it.m.color.copy(it.base).lerp(g.c, Math.min(1, v) * 0.9)
      it.m.emissive.copy(g.c).multiplyScalar(v * 0.6)
    }
  })
  return (
    <group>
      {items.map(it => (
        <mesh key={it.e.key} geometry={it.geo} material={it.m} />
      ))}
    </group>
  )
}

// ── The grant manager: a small clay figure inside a gate that rises while anything waits ──

function Manager() {
  const at = NODES.gm.at
  const wall = useRef<Group>(null)
  const ringM = useMemo(() => new MeshStandardMaterial({ color: '#CFC6B8', roughness: 0.8 }), [])
  const wallM = useMemo(() => new MeshStandardMaterial({ color: '#A9BCDF', roughness: 0.82, transparent: true, opacity: 0.6, side: DoubleSide, depthWrite: false }), [])
  const k = useRef(0)
  const cobalt = useMemo(() => new Color(GLAZE.hold), [])
  const rest = useMemo(() => new Color('#CFC6B8'), [])
  useFrame((_, dt) => {
    const open = feed.getWorld().holds.some(h => h.open)
    k.current += ((open ? 1 : 0) - k.current) * (1 - Math.exp(-Math.min(dt, 0.1) * 3))
    const m = wall.current
    if (m) {
      m.visible = k.current > 0.02
      m.scale.set(1, Math.max(0.001, k.current), 1)
    }
    ringM.color.copy(rest).lerp(cobalt, k.current)
    const g = glow.node.get('gm')
    ringM.emissive.copy(g ? g.c : cobalt).multiplyScalar(g ? Math.min(1, g.v) * 0.5 : 0)
  })
  return (
    <group position={[at.x, 0, at.z]}>
      {/* the person */}
      <group scale={1.45}>
        <mesh position={[0, 0.3, 0]} castShadow material={FIG}>
          <capsuleGeometry args={[0.17, 0.26, 6, 16]} />
        </mesh>
        <mesh position={[0, 0.72, 0]} castShadow material={FIG}>
          <sphereGeometry args={[0.15, 24, 16]} />
        </mesh>
      </group>
      {/* the gate: a ring on the deck, and a pale cobalt wall that rises out of it while anything waits */}
      <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} material={ringM} castShadow>
        <torusGeometry args={[0.72, 0.06, 12, 56]} />
      </mesh>
      <group ref={wall} position={[0, 0.05, 0]} visible={false}>
        <mesh position={[0, 0.5, 0]} material={wallM}>
          <cylinderGeometry args={[0.72, 0.72, 1.0, 48, 1, true]} />
        </mesh>
      </group>
    </group>
  )
}
const FIG = clay('#D9CFC1')

// ── Ports: arches in the deck edge where signals come and go ─────────────

function Port({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0, 0]} castShadow material={PORT}>
        <torusGeometry args={[0.42, 0.08, 12, 32, Math.PI]} />
      </mesh>
    </group>
  )
}
const PORT = clay('#D6CDBF')

// ── Ripples on the deck: money landing, a freeze, a thaw ─────────────────

function Ripples() {
  const refs = useRef<(Mesh | null)[]>([])
  const mats = useMemo(() => Array.from({ length: 8 }, () => new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })), [])
  useFrame((_, dt) => {
    decay(Math.min(dt, 0.1))
    for (let i = 0; i < 8; i++) {
      const m = refs.current[i]
      const r = glow.ripples[i]
      if (!m) continue
      if (!r) {
        m.visible = false
        continue
      }
      const f = r.t / 1.6
      m.visible = true
      m.position.set(r.at.x, 0.02, r.at.z)
      m.scale.setScalar(0.4 + r.size * (1 - (1 - f) ** 3))
      mats[i].color.copy(r.c)
      mats[i].opacity = 0.7 * (1 - f) ** 1.4
    }
  })
  return (
    <group>
      {mats.map((m, i) => (
        <mesh
          key={i}
          ref={el => {
            refs.current[i] = el
          }}
          geometry={ringGeo}
          material={m}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
          renderOrder={3}
        />
      ))}
    </group>
  )
}

// ── All of it ────────────────────────────────────────────────────────────

export function Net() {
  const deck = useRef<Group>(null)
  return (
    <group ref={deck}>
      <RoundedBox args={[17.4, 0.5, 9.4]} radius={0.22} smoothness={4} position={[-0.4, -0.25, 0]} receiveShadow material={clay(DECK, 0.92)} />
      {/* agent pads: one raised slab per agent, so each reads as a layer */}
      <RoundedBox args={[3.6, 0.1, 6.5]} radius={0.05} smoothness={3} position={[-3.25, 0.03, 0]} receiveShadow material={clay(PAD, 0.92)} />
      <RoundedBox args={[1.7, 0.1, 1.7]} radius={0.05} smoothness={3} position={[0.7, 0.03, -2.0]} receiveShadow material={clay(PAD, 0.92)} />
      <RoundedBox args={[1.7, 0.1, 1.7]} radius={0.05} smoothness={3} position={[0.7, 0.03, 2.0]} receiveShadow material={clay(PAD, 0.92)} />
      <Port x={-8.3} z={0} rot={Math.PI / 2} />
      <Port x={0.7} z={-4.7} rot={0} />
      <Port x={0.7} z={4.7} rot={0} />
      <Neurons />
      <Weights />
      <Manager />
      <Ripples />
    </group>
  )
}
