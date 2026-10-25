// The table itself: three lanes with name tabs, the six rule stamps, the
// four outcome trays, a stamp in each of the other two lanes, the hoods
// work comes in under, and at the head of the table the two grants' coin
// stacks (a glass cloche over a frozen one) and the funder's slot.

import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, MeshStandardMaterial, Vector3, type Group, type Mesh } from 'three'
import { R01, R21, feed } from '../../feed'
import { glass } from '../a1/mats'
import {
  BK_X,
  BZ,
  CARD,
  CLOCHE_GEO,
  COIN_GEO,
  COIN_H,
  DOC,
  FUNDER,
  GLAZE,
  GRANT_COLOR,
  GRANT_X,
  GZ,
  LANE_D,
  PLATE_TOP,
  PZ,
  REPLY_Z,
  RP_X,
  RZ,
  SLOT_OUT,
  SLOT_X,
  TABLE,
  TONE,
  TRAY_GLAZE,
  TRAY_NAME,
  TRAY_X,
  clamp01,
  clay,
  ease,
} from './geo'
import { PINS } from './Labels'
import { clocheAt, coinsShown, presses, pulses } from './story'

/** A small label pinned to a point on the board (drawn by Labels). */
function Label({ at, text, kind = 'name' }: { at: [number, number, number]; text: string; kind?: string }) {
  const [x, y, z] = at
  useEffect(() => {
    const id = `${kind}:${text}`
    PINS.set(id, { at: new Vector3(x, y, z), text, kind, show: true })
    return () => void PINS.delete(id)
  }, [x, y, z, text, kind])
  return null
}

/** A strip of box in table coordinates. */
function Slab({ x0, x1, z0, z1, y0 = 0, h, color, r = 0.86 }: { x0: number; x1: number; z0: number; z1: number; y0?: number; h: number; color: string; r?: number }) {
  return (
    <mesh position={[(x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2]} material={clay(color, r)} receiveShadow castShadow>
      <boxGeometry args={[x1 - x0, h, z1 - z0]} />
    </mesh>
  )
}

// ── A rule stamp on its little gantry ────────────────────────────────────

const UP = 0.5
const ARM_Y = 1.05
const NEUTRAL = new Color(TONE.slate)
const OK = new Color(GLAZE.accept)
const NO = new Color(GLAZE.reject)

function Stamp({ id, x, z, down }: { id: string; x: number; z: number; down: number }) {
  const head = useRef<Group>(null)
  const ink = useMemo(() => new MeshStandardMaterial({ color: NEUTRAL.clone(), roughness: 0.5 }), [])
  useFrame(() => {
    const H = head.current
    if (!H) return
    const t = feed.now()
    let y = UP
    let c = NEUTRAL
    for (const p of presses.get(id) ?? []) {
      const a = (t - p.at) / p.ms
      if (a < 0) continue
      if (a <= 1) y = UP + (down - UP) * (a < 0.42 ? ease(a / 0.42) : a < 0.58 ? 1 : 1 - ease((a - 0.58) / 0.42))
      if (a < 2.2) c = p.pass ? OK : NO
    }
    H.position.y = y
    ink.color.copy(c)
  })
  return (
    <group ref={head} position={[x, UP, z]}>
      <mesh position={[0, 0.5, 0]} material={clay(TONE.wood, 0.7)}>
        <cylinderGeometry args={[0.022, 0.022, 0.75, 10]} />
      </mesh>
      <mesh position={[0, 0.1, 0]} material={clay(TONE.wood, 0.8)} castShadow>
        <cylinderGeometry args={[0.1, 0.125, 0.15, 20]} />
      </mesh>
      <mesh position={[0, 0.2, 0]} material={clay(TONE.card, 0.7)} castShadow>
        <sphereGeometry args={[0.07, 16, 10]} />
      </mesh>
      <mesh position={[0, 0.014, 0]} material={ink}>
        <cylinderGeometry args={[0.118, 0.118, 0.028, 20]} />
      </mesh>
    </group>
  )
}

/** A clay gantry over a lane: an arch at each end and a beam the stamps hang from. */
function Gantry({ x0, x1, z }: { x0: number; x1: number; z: number }) {
  const m = clay('#C9BFB1', 0.85)
  const half = LANE_D / 2 + 0.12
  return (
    <group>
      {(x1 > x0 + 0.01 ? [x0, x1] : [x0]).map(x => (
        <group key={x}>
          {[-half, half].map(dz => (
            <mesh key={dz} position={[x, ARM_Y / 2, z + dz]} material={m} castShadow>
              <boxGeometry args={[0.1, ARM_Y, 0.1]} />
            </mesh>
          ))}
          <mesh position={[x, ARM_Y, z]} material={m} castShadow>
            <boxGeometry args={[0.12, 0.09, half * 2 + 0.1]} />
          </mesh>
        </group>
      ))}
      {x1 > x0 + 0.01 && (
        <mesh position={[(x0 + x1) / 2, ARM_Y + 0.02, z]} material={m} castShadow>
          <boxGeometry args={[x1 - x0, 0.09, 0.12]} />
        </mesh>
      )}
    </group>
  )
}

// ── Outcome trays ────────────────────────────────────────────────────────

function Tray({ x, color, name }: { x: number; color: string; name: string }) {
  const W = 1.27
  const D = 1.0
  const H = 0.13
  const t = 0.06
  const m = clay(`#${new Color(color).lerp(new Color('#EFE8DD'), 0.38).getHexString()}`, 0.62)
  return (
    <group position={[x, 0, PZ]}>
      <mesh position={[0, 0.025, 0]} material={m} receiveShadow castShadow>
        <boxGeometry args={[W, 0.05, D]} />
      </mesh>
      {[
        [0, -D / 2 + t / 2, W, t],
        [0, D / 2 - t / 2, W, t],
        [-W / 2 + t / 2, 0, t, D],
        [W / 2 - t / 2, 0, t, D],
      ].map(([px, pz, w, d], i) => (
        <mesh key={i} position={[px, H / 2, pz]} material={m} castShadow receiveShadow>
          <boxGeometry args={[w, H, d]} />
        </mesh>
      ))}
      <Label at={[x, 0.02, PZ + D / 2 + 0.24]} text={name} kind="tray" />
    </group>
  )
}

// ── Agent name tabs: they lift a little when work reaches the agent ──────

function Tab({ agent, z, name }: { agent: string; z: number; name: string }) {
  const g = useRef<Group>(null)
  const mat = useMemo(() => new MeshStandardMaterial({ color: '#F1ECE4', roughness: 0.8, emissive: new Color('#FFF4DF'), emissiveIntensity: 0 }), [])
  useFrame(() => {
    const G = g.current
    if (!G) return
    const age = feed.now() - (pulses.get(agent) ?? -1e9)
    const k = age < 0 ? 0 : clamp01(1 - age / 2600)
    const lift = Math.sin(Math.min(1, age / 500) * Math.PI * 0.5) * k
    G.position.y = 0.06 * lift
    mat.emissiveIntensity = 0.35 * k
  })
  return (
    <group position={[-6.15, 0, z - LANE_D / 2 - 0.2]}>
      <Label at={[-6.15, 0.1, z - LANE_D / 2 - 0.2]} text={name} kind="agent" />
      <group ref={g}>
        <RoundedBox args={[2.1, 0.09, 0.34]} radius={0.04} smoothness={3} position={[0, 0.045, 0]} material={mat} castShadow receiveShadow />
      </group>
    </group>
  )
}

/** The arch work slides in and out under, at a lane's end. */
function Hood({ x, z0, z1 }: { x: number; z0: number; z1: number }) {
  const m = clay(TONE.rail, 0.85)
  const H = 0.36
  return (
    <group position={[x, 0, (z0 + z1) / 2]}>
      <RoundedBox args={[0.95, 0.09, z1 - z0]} radius={0.04} smoothness={3} position={[0, H, 0]} material={m} castShadow receiveShadow />
      <mesh position={[0, H / 2, -(z1 - z0) / 2 + 0.05]} material={m} castShadow>
        <boxGeometry args={[0.95, H, 0.1]} />
      </mesh>
      <mesh position={[0, H / 2, (z1 - z0) / 2 - 0.05]} material={m} castShadow>
        <boxGeometry args={[0.95, H, 0.1]} />
      </mesh>
    </group>
  )
}

// ── The grants: coin stacks at the head of the table ─────────────────────

const STACK_MAX = 30
function GrantStack({ gid, name }: { gid: string; name: string }) {
  const coins = useRef<(Mesh | null)[]>([])
  const cloche = useRef<Mesh>(null)
  const mat = useMemo(() => glass(), [])
  const jitter = useMemo(() => Array.from({ length: STACK_MAX }, (_, i) => [Math.sin(i * 12.9) * 0.025, Math.cos(i * 7.3) * 0.025] as const), [])
  const x = GRANT_X[gid] ?? 0
  useFrame(() => {
    const t = feed.now()
    const n = coinsShown(gid, t)
    for (let i = 0; i < STACK_MAX; i++) {
      const m = coins.current[i]
      if (m) m.visible = i < n
    }
    const C = cloche.current
    if (!C) return
    const k = clocheAt(gid, t) // 0 down, 1 lifted away
    C.position.y = 1.4 * k
    const u = mat.userData.u as { uFade: { value: number }; uFrost: { value: number } }
    u.uFade.value = 1 - k
    u.uFrost.value = 0.5 * (1 - k)
    C.visible = k < 0.995
  })
  return (
    <group position={[x, 0, GZ]}>
      <mesh position={[0, 0.03, 0]} material={clay(GRANT_COLOR[gid], 0.6)} castShadow receiveShadow>
        <cylinderGeometry args={[0.72, 0.76, 0.06, 40]} />
      </mesh>
      <mesh position={[0, 0.065, 0]} material={clay(TONE.card, 0.8)} receiveShadow>
        <cylinderGeometry args={[0.62, 0.62, 0.03, 40]} />
      </mesh>
      {jitter.map(([jx, jz], i) => (
        <mesh
          key={i}
          ref={el => {
            coins.current[i] = el
          }}
          geometry={COIN_GEO}
          material={clay(TONE.coin, 0.5)}
          position={[jx, PLATE_TOP + COIN_H * (i + 0.5), jz]}
          castShadow
          receiveShadow
        />
      ))}
      <mesh ref={cloche} geometry={CLOCHE_GEO} material={mat} position={[0, 0.05, 0]} renderOrder={2} />
      <Label at={[x, 0.02, GZ + 1.12]} text={name} kind="grant" />
    </group>
  )
}

function Funder() {
  return (
    <group>
      <RoundedBox args={[1.5, 1.1, 0.62]} radius={0.1} smoothness={3} position={[FUNDER.x, FUNDER.y, FUNDER.z]} material={clay('#7D8794', 0.75)} castShadow receiveShadow />
      <mesh position={[FUNDER.x, SLOT_OUT.y, FUNDER.z + 0.315]} material={clay(TONE.ink, 0.6)}>
        <boxGeometry args={[0.9, 0.08, 0.02]} />
      </mesh>
      <Label at={[FUNDER.x, FUNDER.y + 0.85, FUNDER.z]} text="Funder" kind="small" />
    </group>
  )
}

export function Board() {
  const lane = TONE.lane
  return (
    <group>
      {/* The table: a thick soft slab. */}
      <RoundedBox
        args={[TABLE.x1 - TABLE.x0, 0.6, TABLE.z1 - TABLE.z0]}
        radius={0.22}
        smoothness={4}
        position={[(TABLE.x0 + TABLE.x1) / 2, -0.3, (TABLE.z0 + TABLE.z1) / 2]}
        material={clay(TONE.table, 0.9)}
        receiveShadow
        castShadow
      />
      {/* Lanes, pressed a hair into the table. */}
      <Slab x0={-7.3} x1={1.75} z0={PZ - LANE_D / 2} z1={PZ + LANE_D / 2} h={0.012} color={lane} />
      <Slab x0={-7.3} x1={6.9} z0={REPLY_Z - 0.2} z1={REPLY_Z + 0.2} h={0.008} color={lane} />
      <Slab x0={-4.6} x1={7.3} z0={BZ - LANE_D / 2} z1={BZ + LANE_D / 2} h={0.012} color={lane} />
      <Slab x0={-7.3} x1={4.1} z0={RZ - LANE_D / 2} z1={RZ + LANE_D / 2} h={0.012} color={lane} />

      <Tab agent="a:purchasing" z={PZ} name="Purchasing" />
      <Tab agent="a:bookkeeping" z={BZ} name="Bookkeeping" />
      <Tab agent="a:payment_report" z={RZ} name="Payment & report" />

      <Hood x={-7.78} z0={PZ - LANE_D / 2 - 0.05} z1={REPLY_Z + 0.3} />
      <Label at={[-7.78, 0.46, PZ + 0.25]} text="From the lab" kind="port" />
      <Hood x={-7.78} z0={RZ - LANE_D / 2 - 0.05} z1={RZ + LANE_D / 2 + 0.05} />
      <Hood x={7.78} z0={BZ - LANE_D / 2 - 0.05} z1={BZ + LANE_D / 2 + 0.05} />

      <Gantry x0={SLOT_X[0] - 0.45} x1={SLOT_X[5] + 0.45} z={PZ} />
      <Gantry x0={BK_X} x1={BK_X} z={BZ} />
      <Gantry x0={RP_X} x1={RP_X} z={RZ} />
      {SLOT_X.map((x, i) => (
        <Stamp key={i} id={`p${i}`} x={x} z={PZ} down={CARD.h + 0.004} />
      ))}
      <Stamp id="bk" x={BK_X} z={BZ} down={DOC.h + 0.004} />
      <Stamp id="rp" x={RP_X} z={RZ} down={DOC.h + 0.004} />

      {TRAY_X.map((x, i) => (
        <Tray key={i} x={x} color={TRAY_GLAZE[i]} name={TRAY_NAME[i]} />
      ))}

      <GrantStack gid={R01} name="Mitochondria grant" />
      <GrantStack gid={R21} name="Antibiotic grant" />
      <Funder />
    </group>
  )
}

