// The fixed plumbing: plinth, pipes, the two grant vaults, the purchasing valve with
// its six gauges, the bookkeeping meter, the payment & report pump and the
// grant manager's valve. Moving parts read flow.ts and the world each frame.

import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, CylinderGeometry, MeshStandardMaterial, TubeGeometry, type Group, type Mesh } from 'three'
import { feed } from '../../feed'
import { GLAZE, GRANT_COLOR, PAL } from '../a1/layout'
import { M } from '../a1/mats'
import {
  COLLARS,
  GAUGES,
  GAUGE_R,
  GM,
  GRANT_IDS,
  H,
  HEADER_Y,
  HEADER_Z,
  LAB,
  LAB_R,
  LAB_X,
  MAIN_Z,
  NIH_X,
  VENDOR_X,
  METER,
  METER_R,
  PIPES,
  PIPE_R,
  PUMP,
  PUMP_R,
  TANK,
  TANK_AT,
  VALVE,
  VALVE_R,
} from './layout'
import { POUR_FALL, POUR_TRAVEL, bookLevel, clamp01, clock, frame, pending, st } from './flow'

const clay = (color: string, roughness = 0.8) => new MeshStandardMaterial({ color, roughness, metalness: 0 })
const C = (hex: string) => new Color(hex)
const SLATE = C(PAL.slate)
const tmp = new Color()

/** A rim that takes an agent's latest outcome colour, then settles back to slate. */
function useRim(id: string) {
  const mat = useMemo(() => clay(PAL.slate, 0.55), [])
  useFrame(() => {
    const g = st.glow.get(id)
    const t = clock()
    let k = g ? clamp01(1 - (t - g.t) / 2.6) : 0
    let color = g?.color
    // Steady while something waits on this node.
    const w = feed.getWorld()
    if (id === 'p:grant_manager' && w.holds.some(h => h.open)) {
      k = Math.max(k, 0.85)
      if (!g || t - g.t > 2.6) color = GLAZE.hold
    }
    if (id === 'a:purchasing' && w.requests.some(r => r.outcome === 'hold' && r.holdFor === 'payment' && r.state === 'submitted')) {
      k = Math.max(k, 0.85)
      if (!g || t - g.t > 2.6) color = GLAZE.hold
    }
    mat.color.copy(SLATE).lerp(tmp.set(color ?? PAL.slate), k)
    mat.emissive.copy(tmp).multiplyScalar(k * 0.18)
  })
  return mat
}

// ── Static pieces ────────────────────────────────────────────────────────

function Pipes() {
  const tubes = useMemo(
    () => PIPES.map(p => new TubeGeometry(p.path, Math.max(8, Math.ceil(p.path.getLength() * 10)), p.r, 14, false)),
    [],
  )
  const lab = useMemo(() => new TubeGeometry(LAB, 160, LAB_R, 10, false), [])
  const collar = useMemo(() => new CylinderGeometry(PIPE_R * 1.45, PIPE_R * 1.45, 0.13, 18), [])
  return (
    <group>
      {tubes.map((g, i) => (
        <mesh key={i} geometry={g} material={M.clay} castShadow receiveShadow />
      ))}
      <mesh geometry={lab} material={M.porcelain} castShadow />
      {COLLARS.map(([p, axis], i) => (
        <mesh key={i} geometry={collar} material={M.clayDeep} position={p} rotation={axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]} castShadow />
      ))}
      {/* posts that carry the overhead header */}
      {[6.7, -5.5].map(x => (
        <mesh key={x} position={[x, HEADER_Y / 2, HEADER_Z]} material={M.clay} castShadow>
          <cylinderGeometry args={[0.07, 0.09, HEADER_Y, 12]} />
        </mesh>
      ))}
      {/* ports where things come from and go to off stage */}
      {[
        [LAB_X, 0.3, 1.95, 0.15],
        [VENDOR_X, H, MAIN_Z, 0.22],
        [NIH_X, HEADER_Y, HEADER_Z, 0.22],
      ].map(([x, y, z, r]) => (
        <mesh key={x} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} material={M.clayDeep} castShadow>
          <cylinderGeometry args={[r, r, 0.2, 24]} />
        </mesh>
      ))}
    </group>
  )
}

// ── Grant vaults ────────────────────────────────────────────────────────
// Closed clay boxes, no pools: a thin bar on the front says what's left, the
// inlet valve on top takes money from NIH, and a freeze frosts the box and
// padlocks that valve.

const BAR_W = 1.3

function Vault({ gid }: { gid: string }) {
  const at = TANK_AT[gid]
  const color = GRANT_COLOR[gid]
  const mats = useMemo(
    () => ({
      band: clay(color, 0.5),
      fill: new MeshStandardMaterial({ color, roughness: 0.4, emissive: new Color(color), emissiveIntensity: 0 }),
      ice: new MeshStandardMaterial({ color: '#E3ECF4', roughness: 0.25, transparent: true, opacity: 0, depthWrite: false }),
      capsule: new MeshStandardMaterial({ color, roughness: 0.3, emissive: new Color(color), emissiveIntensity: 0.9 }),
    }),
    [color],
  )
  const fill = useRef<Mesh>(null)
  const shell = useRef<Mesh>(null)
  const lock = useRef<Group>(null)
  const shackle = useRef<Mesh>(null)
  const caps = useRef<(Mesh | null)[]>([])
  const s = useRef({ level: -1, frost: -1 })

  useFrame(() => {
    const t = clock()
    const g = feed.getWorld().grants.find(x => x.id === gid)
    if (!g) return
    const pour = st.pours.find(p => p.gid === gid)
    const target = Math.max(0.04, bookLevel(g) - pending(gid, t))
    const frozenNow = g.frozen || (!!pour && t < pour.t0 + POUR_TRAVEL)
    if (s.current.level < 0) {
      s.current.level = target
      s.current.frost = frozenNow ? 1 : 0
    }
    s.current.level += (target - s.current.level) * (1 - Math.exp(-frame.dt * 2.2))
    s.current.frost += ((frozenNow ? 1 : 0) - s.current.frost) * (1 - Math.exp(-frame.dt * (frozenNow ? 1.4 : 1.1)))
    const frost = s.current.frost
    if (fill.current) {
      fill.current.scale.x = Math.max(0.001, s.current.level)
      fill.current.position.x = -BAR_W / 2 + (BAR_W * s.current.level) / 2
    }
    // A brief glow as the money lands.
    const glowK = pour ? Math.sin(Math.PI * clamp01((t - pour.t0 - POUR_TRAVEL) / POUR_FALL)) : 0
    mats.fill.emissiveIntensity = glowK * 0.8
    mats.band.emissive.set(color).multiplyScalar(glowK * 0.35)
    mats.ice.opacity = frost * 0.62
    if (shell.current) shell.current.visible = frost > 0.02
    if (lock.current && shackle.current) {
      lock.current.visible = frost > 0.3
      shackle.current.position.y = 0.16 + clamp01((0.85 - frost) / 0.5) * 0.14
    }
    // Capsules from NIH: along the header, then down the drop into the vault.
    for (let i = 0; i < 3; i++) {
      const m = caps.current[i]
      if (!m) continue
      const a = pour ? (t - pour.t0 - i * 0.16) / (POUR_TRAVEL - 0.32) : -1
      m.visible = a > 0 && a < 1
      if (!m.visible) continue
      const run = NIH_X - at.x
      const drop = HEADER_Y - TANK.h
      const d = a * (run + drop)
      if (d < run) {
        m.position.set(NIH_X - d, HEADER_Y, HEADER_Z)
        m.rotation.set(0, 0, Math.PI / 2)
      } else {
        m.position.set(at.x, HEADER_Y - (d - run), HEADER_Z)
        m.rotation.set(0, 0, 0)
      }
    }
  })

  return (
    <group>
      <group position={[at.x, 0, at.z]}>
        <RoundedBox args={[TANK.w, TANK.h, TANK.r * 2]} radius={0.12} smoothness={4} position={[0, TANK.h / 2, 0]} material={M.clay} castShadow receiveShadow />
        {/* a band in the grant's colour, and the money-left bar on the front */}
        <RoundedBox args={[TANK.w + 0.03, 0.12, TANK.r * 2 + 0.03]} radius={0.04} position={[0, TANK.h - 0.28, 0]} material={mats.band} />
        <group position={[0, TANK.h - 0.62, TANK.r + 0.02]}>
          <mesh material={M.slateDeep}>
            <boxGeometry args={[BAR_W + 0.08, 0.16, 0.04]} />
          </mesh>
          <mesh ref={fill} position={[0, 0, 0.03]} material={mats.fill}>
            <boxGeometry args={[BAR_W, 0.1, 0.04]} />
          </mesh>
        </group>
        <mesh ref={shell} position={[0, TANK.h / 2, 0]} material={mats.ice} visible={false}>
          <boxGeometry args={[TANK.w + 0.1, TANK.h + 0.1, TANK.r * 2 + 0.1]} />
        </mesh>
      </group>
      {/* the inlet valve on top, where NIH money comes in */}
      <group position={[at.x, TANK.h + 0.38, HEADER_Z]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={M.slate} castShadow>
          <torusGeometry args={[0.2, 0.035, 8, 24]} />
        </mesh>
      </group>
      <group ref={lock} position={[at.x, TANK.h + 0.36, HEADER_Z + 0.2]}>
        <RoundedBox args={[0.3, 0.24, 0.12]} radius={0.04} material={M.slateDeep} castShadow />
        <mesh ref={shackle} position={[0, 0.16, 0]} material={M.slate}>
          <torusGeometry args={[0.09, 0.028, 8, 20, Math.PI]} />
        </mesh>
      </group>
      {[0, 1, 2].map(i => (
        <mesh key={i} material={mats.capsule} visible={false} ref={el => void (caps.current[i] = el)}>
          <capsuleGeometry args={[PIPE_R * 1.3, 0.22, 6, 12]} />
        </mesh>
      ))}
    </group>
  )
}

// ── Purchasing valve ─────────────────────────────────────────────────────

const IDLE_FACE = C('#EFEBE4')
const PASS = C(GLAZE.accept)
const FAIL = C(GLAZE.reject)

function Gauges() {
  const faces = useMemo(() => GAUGES.map(() => clay('#EFEBE4', 0.5)), [])
  const needles = useRef<(Group | null)[]>([])
  const pops = useRef<(Group | null)[]>([])
  const ang = useRef(GAUGES.map(() => -2.2))
  useFrame(() => {
    const t = clock()
    const r = st.run
    const live = t - r.last < 4.2
    const fade = live ? 1 : clamp01(1 - (t - r.last - 4.2) / 1.2)
    for (let i = 0; i < GAUGES.length; i++) {
      const lit = r.at[i] >= 0 && fade > 0
      const pass = r.pass[i] === 1
      const k = lit ? clamp01((t - r.at[i]) / 0.25) * fade : 0
      faces[i].color.copy(IDLE_FACE).lerp(pass ? PASS : FAIL, k)
      const want = lit && fade > 0.5 ? (pass ? 0.75 : -0.75) : -2.2
      ang.current[i] += (want - ang.current[i]) * (1 - Math.exp(-frame.dt * 7))
      const n = needles.current[i]
      if (n) n.rotation.z = -ang.current[i]
      const p = pops.current[i]
      if (p) p.scale.setScalar(1 + (lit ? 0.18 * Math.exp(-(t - r.at[i]) * 5) : 0))
    }
  })
  return (
    <group>
      {GAUGES.map((g, i) => {
        const dx = g.x - VALVE.x
        const dy = g.y - VALVE.y
        const a = Math.atan2(dy, dx)
        return (
          <group key={i}>
            {/* a short stem from the valve rim */}
            <mesh position={[VALVE.x + Math.cos(a) * (VALVE_R + 0.06), VALVE.y + Math.sin(a) * (VALVE_R + 0.06), g.z - 0.06]} rotation={[0, 0, a - Math.PI / 2]} material={M.slate}>
              <cylinderGeometry args={[0.035, 0.035, 0.16, 8]} />
            </mesh>
            <group position={g} ref={el => void (pops.current[i] = el)}>
              <mesh rotation={[Math.PI / 2, 0, 0]} material={M.slateDeep} castShadow>
                <cylinderGeometry args={[GAUGE_R + 0.03, GAUGE_R + 0.03, 0.08, 24]} />
              </mesh>
              <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]} material={faces[i]}>
                <cylinderGeometry args={[GAUGE_R, GAUGE_R, 0.08, 24]} />
              </mesh>
              <group position={[0, 0, 0.07]} ref={el => void (needles.current[i] = el)}>
                <mesh position={[0, GAUGE_R * 0.4, 0]} material={M.ink}>
                  <boxGeometry args={[0.026, GAUGE_R * 0.85, 0.02]} />
                </mesh>
              </group>
            </group>
          </group>
        )
      })}
    </group>
  )
}

function Wheel({ r, spokes, mat, turn }: { r: number; spokes: number; mat: MeshStandardMaterial; turn: () => number }) {
  const g = useRef<Group>(null)
  const a = useRef(0)
  useFrame(() => {
    a.current += (turn() - a.current) * (1 - Math.exp(-frame.dt * 2.4))
    if (g.current) g.current.rotation.z = a.current
  })
  return (
    <group ref={g}>
      <mesh material={mat} castShadow>
        <torusGeometry args={[r, r * 0.13, 12, 40]} />
      </mesh>
      {Array.from({ length: spokes }, (_, i) => (
        <mesh key={i} rotation={[0, 0, (i / spokes) * Math.PI]} material={mat}>
          <boxGeometry args={[r * 2, r * 0.13, r * 0.11]} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={mat}>
        <cylinderGeometry args={[r * 0.22, r * 0.22, r * 0.3, 16]} />
      </mesh>
    </group>
  )
}

function Purchasing() {
  const rim = useRim('a:purchasing')
  return (
    <group>
      <group position={VALVE}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={M.porcelain} castShadow receiveShadow>
          <cylinderGeometry args={[VALVE_R, VALVE_R, 0.6, 48]} />
        </mesh>
        <mesh position={[0, 0, 0.3]} material={rim} castShadow>
          <torusGeometry args={[VALVE_R - 0.02, 0.07, 14, 56]} />
        </mesh>
        <group position={[0, 0, 0.42]}>
          <Wheel r={0.42} spokes={3} mat={M.slateDeep} turn={() => st.valveTurn} />
        </group>
      </group>
      <RoundedBox args={[0.7, VALVE.y - VALVE_R + 0.12, 0.5]} radius={0.06} position={[VALVE.x, (VALVE.y - VALVE_R + 0.12) / 2, VALVE.z]} material={M.clayDeep} castShadow />
      <Gauges />
    </group>
  )
}

// ── Bookkeeping meter ───────────────────────────────────────────────────

function Bookkeeping() {
  const rim = useRim('a:bookkeeping')
  const needleMats = useMemo(() => GRANT_IDS.map(id => clay(GRANT_COLOR[id], 0.45)), [])
  const needles = useRef<(Group | null)[]>([])
  const shown = useRef(GRANT_IDS.map(() => -1))
  useFrame(() => {
    const t = clock()
    const w = feed.getWorld()
    GRANT_IDS.forEach((id, i) => {
      const g = w.grants.find(x => x.id === id)
      if (!g) return
      const want = Math.max(0.04, bookLevel(g) - pending(id, t))
      if (shown.current[i] < 0) shown.current[i] = want
      shown.current[i] += (want - shown.current[i]) * (1 - Math.exp(-frame.dt * 2.2))
      const n = needles.current[i]
      if (n) n.rotation.z = -(-2.2 + shown.current[i] * 4.4)
    })
  })
  return (
    <group>
      <mesh position={[METER.x, METER.y / 2, METER.z - 0.05]} material={M.clay} castShadow>
        <cylinderGeometry args={[0.09, 0.12, METER.y, 12]} />
      </mesh>
      <group position={METER}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={M.porcelain} castShadow>
          <cylinderGeometry args={[METER_R, METER_R, 0.24, 48]} />
        </mesh>
        <mesh position={[0, 0, 0.12]} material={rim}>
          <torusGeometry args={[METER_R - 0.01, 0.06, 12, 56]} />
        </mesh>
        {GRANT_IDS.map((id, i) => (
          <group key={id} position={[0, 0, 0.14 + i * 0.03]} ref={el => void (needles.current[i] = el)}>
            <mesh position={[0, METER_R * 0.36, 0]} material={needleMats[i]} castShadow>
              <boxGeometry args={[0.05, METER_R * 0.78, 0.025]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]} material={M.slateDeep}>
          <cylinderGeometry args={[0.07, 0.07, 0.06, 16]} />
        </mesh>
      </group>
    </group>
  )
}

// ── Payment & report pump ───────────────────────────────────────────────

function PaymentReport() {
  const rim = useRim('a:payment_report')
  const fan = useRef<Group>(null)
  const spin = useRef(0)
  useFrame(() => {
    const t = clock()
    const busy = [...st.blobs.values()].some(b => b.then === 'gone' && b.path.getLength() > 6 && t >= b.t0 && t < b.t0 + b.dur)
    spin.current += ((busy ? 5.5 : 0.25) - spin.current) * (1 - Math.exp(-frame.dt * 2))
    if (fan.current) fan.current.rotation.z -= spin.current * frame.dt
  })
  return (
    <group>
      <group position={PUMP}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={M.porcelain} castShadow receiveShadow>
          <cylinderGeometry args={[PUMP_R, PUMP_R, 0.5, 48]} />
        </mesh>
        <mesh position={[0, 0, 0.25]} material={rim} castShadow>
          <torusGeometry args={[PUMP_R - 0.02, 0.065, 12, 56]} />
        </mesh>
        <group ref={fan} position={[0, 0, 0.3]}>
          {[0, 1, 2, 3].map(i => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]} position={[Math.cos((i * Math.PI) / 2) * 0.2, Math.sin((i * Math.PI) / 2) * 0.2, 0]} material={M.slateDeep} castShadow>
              <boxGeometry args={[0.34, 0.1, 0.06]} />
            </mesh>
          ))}
          <mesh rotation={[Math.PI / 2, 0, 0]} material={M.slate}>
            <cylinderGeometry args={[0.09, 0.09, 0.1, 16]} />
          </mesh>
        </group>
      </group>
      <RoundedBox args={[0.6, PUMP.y - PUMP_R + 0.1, 0.46]} radius={0.06} position={[PUMP.x, (PUMP.y - PUMP_R + 0.1) / 2, PUMP.z]} material={M.clayDeep} castShadow />
    </group>
  )
}

// ── Grant manager's valve ───────────────────────────────────────────────

function GrantManager() {
  const rim = useRim('p:grant_manager')
  return (
    <group>
      <mesh position={[GM.x, GM.y, GM.z]} material={M.porcelain} castShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.5, 28]} />
      </mesh>
      <mesh position={[GM.x, GM.y + 0.26, GM.z]} rotation={[Math.PI / 2, 0, 0]} material={rim}>
        <torusGeometry args={[0.26, 0.05, 10, 32]} />
      </mesh>
      <mesh position={[GM.x, GM.y + 0.42, GM.z]} material={M.slate}>
        <cylinderGeometry args={[0.035, 0.035, 0.3, 8]} />
      </mesh>
      <group position={[GM.x, GM.y + 0.58, GM.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <Wheel r={0.3} spokes={2} mat={M.slateDeep} turn={() => st.gmTurn} />
      </group>
    </group>
  )
}

export function Plant() {
  return (
    <group>
      <RoundedBox args={[13.4, 0.5, 5.7]} radius={0.22} smoothness={4} position={[0.25, -0.25, 0.25]} material={M.labTop} receiveShadow castShadow />
      <Pipes />
      {GRANT_IDS.map(id => (
        <Vault key={id} gid={id} />
      ))}
      <Purchasing />
      <Bookkeeping />
      <PaymentReport />
      <GrantManager />
    </group>
  )
}
