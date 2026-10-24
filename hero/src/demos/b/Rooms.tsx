// Every room of the section as a drawer that can slide out of the model,
// with what moves inside it: the lab members at their stations, the six
// rule stations, the vaults' doors and frost shutters, the grant manager's
// inbox tray. Rooms stay quiet until something happens in them.

import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { feed } from '../../feed'
import { furnish } from './furnish'
import { C, M } from './materials'
import {
  ANTENNAS,
  antennaTip,
  FH,
  FUNDER,
  INTAKE_X,
  OUTLET_X,
  PULL,
  ROOF,
  ROOMS,
  RULE_Y,
  SPOTS,
  STATION_X,
  TRACK_Z,
  TRUCK,
  ZB,
  ZF,
  type Room,
} from './layout'
import { activity, clock, hover, pull, run, select, stations, ui, vaultHoldUntil, vaultShake } from './state'

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt))
const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

export const BODY = new THREE.CapsuleGeometry(0.17, 0.8, 4, 12)
export const HEAD = new THREE.SphereGeometry(0.135, 14, 10)
export const CAPSULE = new THREE.CapsuleGeometry(0.19, 0.62, 4, 14)
export const CAP = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 18)
export const BAND = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 18)

const LIT = new THREE.Color('#ffd9a0')
const AGENT_LAMP: Record<string, [number, number, number]> = {
  'a:purchasing': [2.45, 3.2 + 0.16 + 1.15 + 0.13, -2.0],
  'a:bookkeeping': [3.55, 6.4 + 0.16 + 1.15 + 0.13, -1.95],
  'a:payment_report': [9.1, 0.16 + 1.15 + 0.13, -1.95],
}

function handlers(node: string) {
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      hover(node)
    },
    onPointerOut: () => {
      if (ui.hovered === node) hover(null)
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      if (e.delta > 6) return
      select(ui.selected === node ? null : node)
    },
  }
}

function RoomView({ room }: { room: Room }) {
  const parts = useMemo(() => furnish(room), [room])
  const dark = room.kind === 'confocal'
  const wallMat = useMemo(() => (dark ? M.chipDark : M.wall).clone(), [dark])
  const lampMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f6efe2', emissive: new THREE.Color('#ffe7bd'), emissiveIntensity: 0.2, roughness: 0.4 }), [])
  const stripMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e9e6df', emissive: new THREE.Color('#ffd28a'), emissiveIntensity: 0, roughness: 0.5 }), [])
  const outer = useRef<THREE.Group>(null)
  const frame = useRef<THREE.Group>(null)
  const w = room.x1 - room.x0
  const cx = (room.x0 + room.x1) / 2
  const cy = room.y0 + FH / 2
  const ih = FH - 0.28
  const h = handlers(room.node)
  const lamp = AGENT_LAMP[room.node]

  useFrame((_, dt) => {
    const sel = ui.selected === room.node
    const p = damp(pull[room.node] ?? 0, sel ? PULL : 0, 5, dt)
    pull[room.node] = p
    if (outer.current) outer.current.position.z = p
    const a = activity[room.node] ?? 0
    wallMat.emissive.copy(LIT).multiplyScalar((dark ? 0.5 : 0.42) * a)
    lampMat.emissiveIntensity = 0.25 + a * 2.2
    stripMat.emissiveIntensity = a * 2.4
    if (frame.current) frame.current.visible = sel || ui.hovered === room.node
  })

  return (
    <group ref={outer}>
      {parts.map(p => (
        <mesh key={p.mat} geometry={p.geo} material={M[p.mat]} castShadow={p.mat !== 'acrylic'} receiveShadow />
      ))}
      <mesh position={[cx, room.y0 + 0.12 + ih / 2, ZB + 0.06]} material={wallMat} receiveShadow>
        <boxGeometry args={[w - 0.12, ih, 0.08]} />
      </mesh>
      {room.kind !== 'vault' && (
        <mesh position={[cx, room.y0 + FH - 0.2, -0.6]} material={stripMat}>
          <boxGeometry args={[w - 1.2, 0.06, 0.36]} />
        </mesh>
      )}
      {lamp && (
        <mesh position={lamp} material={lampMat}>
          <sphereGeometry args={[0.13, 16, 12]} />
        </mesh>
      )}
      <group ref={frame} visible={false}>
        <mesh position={[cx, room.y0 + FH - 0.13, ZF + 0.06]} material={M.ink}>
          <boxGeometry args={[w, 0.05, 0.03]} />
        </mesh>
        <mesh position={[cx, room.y0 + 0.13, ZF + 0.06]} material={M.ink}>
          <boxGeometry args={[w, 0.05, 0.03]} />
        </mesh>
        <mesh position={[room.x0 + 0.03, cy, ZF + 0.06]} material={M.ink}>
          <boxGeometry args={[0.05, FH - 0.26, 0.03]} />
        </mesh>
        <mesh position={[room.x1 - 0.03, cy, ZF + 0.06]} material={M.ink}>
          <boxGeometry args={[0.05, FH - 0.26, 0.03]} />
        </mesh>
      </group>
      <mesh position={[cx, cy, 0]} {...h}>
        <boxGeometry args={[w, FH, ZF - ZB]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {room.node.startsWith('r:') && <Figure id={room.node.slice(2)} y0={room.y0} />}
      {room.kind === 'gm' && <GrantManager />}
      {room.kind === 'rules' && <Stations />}
      {room.kind === 'vault' && <Vault room={room} />}
    </group>
  )
}

// ── Lab members ──────────────────────────────────────────────────────────

function Person({ y0 }: { y0: number }) {
  return (
    <>
      <mesh geometry={BODY} material={M.card} position-y={y0 + 0.16 + 0.6} scale={[1, 1, 0.72]} castShadow receiveShadow />
      <mesh geometry={HEAD} material={M.card} position-y={y0 + 0.16 + 1.33} castShadow />
    </>
  )
}

function Figure({ id, y0 }: { id: string; y0: number }) {
  const spots = SPOTS[id] ?? [[0, 0, 0]]
  const g = useRef<THREE.Group>(null)
  const st = useRef({ x: spots[0][0], z: spots[0][1], ry: spots[0][2], init: false })
  useFrame((state, dt) => {
    const r = feed.getWorld().researchers.find(x => x.id === id)
    const i = r ? Math.max(0, r.tasks.indexOf(r.task)) % spots.length : 0
    const [tx, tz, tr] = spots[i]
    const s = st.current
    if (!s.init) {
      s.x = tx
      s.z = tz
      s.ry = tr
      s.init = true
    }
    const dx = tx - s.x
    const dz = tz - s.z
    const dist = Math.hypot(dx, dz)
    const step = Math.min(dist, 1.5 * dt)
    let face = tr
    if (dist > 0.02) {
      s.x += (dx / dist) * step
      s.z += (dz / dist) * step
      face = Math.atan2(dx, dz)
    }
    let d = face - s.ry
    d = Math.atan2(Math.sin(d), Math.cos(d))
    s.ry += d * (1 - Math.exp(-8 * dt))
    if (g.current) {
      g.current.position.set(s.x, dist > 0.02 ? Math.abs(Math.sin(state.clock.elapsedTime * 9)) * 0.035 : 0, s.z)
      g.current.rotation.y = s.ry
    }
  })
  return (
    <group ref={g}>
      <Person y0={y0} />
    </group>
  )
}

function GrantManager() {
  const tray = useRef<(THREE.Mesh | null)[]>([])
  useFrame(() => {
    const open = feed.getWorld().holds.filter(h => h.open).length
    tray.current.forEach((m, i) => {
      if (m) m.visible = i < open
    })
  })
  return (
    <>
      <group position={[4.7, 0, -1.75]} rotation-y={0}>
        <Person y0={0} />
      </group>
      {[0, 1, 2, 3].map(i => (
        <mesh
          key={i}
          ref={el => {
            tray.current[i] = el
          }}
          geometry={CAPSULE}
          material={M.frost}
          position={[2.42 + i * 0.19, 1.24, -1.2]}
          rotation-x={Math.PI / 2}
          visible={false}
          castShadow
        />
      ))}
    </>
  )
}

// ── The six spending-rule stations ───────────────────────────────────────

const IDLE = new THREE.Color('#ece8df')
const PASS = new THREE.Color(C.accept)
const FAIL = new THREE.Color(C.reject)

function Stations() {
  const lamps = useMemo(() => STATION_X.map(() => new THREE.MeshStandardMaterial({ color: IDLE.clone(), emissive: new THREE.Color(0), roughness: 0.35 })), [])
  const arms = useRef<(THREE.Group | null)[]>([])
  const cap = useRef<THREE.Group>(null)
  const runX = useRef(INTAKE_X)
  useFrame((_, dt) => {
    const now = clock()
    stations.forEach((s, i) => {
      const age = now - s.t
      const live = s.state !== 0 ? 1 - smooth(3.2, 4.4, age) : 0
      const col = s.state > 0 ? PASS : FAIL
      lamps[i].color.copy(IDLE).lerp(col, live)
      lamps[i].emissive.copy(col).multiplyScalar(live * 0.9)
      const arm = arms.current[i]
      if (arm) {
        const down = s.state < 0 && live > 0.01
        arm.visible = live > 0.01 && s.state < 0
        arm.rotation.z = damp(arm.rotation.z, down ? 0 : -Math.PI / 2, 9, dt)
      }
    })
    const out = run.outAt > 0 && now >= run.outAt
    const target = out ? OUTLET_X : run.target >= 0 ? STATION_X[run.target] : INTAKE_X
    runX.current = damp(runX.current, target, 7, dt)
    if (!run.visible) runX.current = INTAKE_X
    if (cap.current) {
      cap.current.visible = run.visible
      cap.current.position.x = runX.current
    }
  })
  return (
    <>
      {STATION_X.map((x, i) => (
        <group key={x}>
          <mesh position={[x, RULE_Y + 0.6, TRACK_Z]} material={lamps[i]}>
            <sphereGeometry args={[0.12, 16, 12]} />
          </mesh>
          <group
            ref={el => {
              arms.current[i] = el
            }}
            position={[x + 0.36, RULE_Y + 0.28, TRACK_Z + 0.1]}
            rotation-z={-Math.PI / 2}
            visible={false}
          >
            <mesh position={[-0.36, 0, 0]} material={M.reject} castShadow>
              <boxGeometry args={[0.72, 0.07, 0.05]} />
            </mesh>
          </group>
        </group>
      ))}
      <group ref={cap} position={[INTAKE_X, RULE_Y, TRACK_Z]} rotation-z={-Math.PI / 2} visible={false}>
        <mesh geometry={CAPSULE} material={M.capsule} castShadow />
        <mesh geometry={CAP} material={M.ink} position-y={0.34} />
      </group>
    </>
  )
}

// ── Vaults: doors seal, an acrylic shutter frosts over, money stands inside ──

const PLATE = new THREE.BoxGeometry(1.15, 0.1, 0.78)
const PER_PLATE = 25000

function Vault({ room }: { room: Room }) {
  const grantId = room.node.slice(2)
  const cx = (room.x0 + room.x1) / 2
  const w = room.x1 - room.x0 - 0.2
  const ih = FH - 0.28
  const top = room.y0 + FH - 0.12
  const frost = useMemo(() => M.frost.clone(), [])
  const plates = useRef<THREE.InstancedMesh>(null)
  const shutter = useRef<THREE.Mesh>(null)
  const doorL = useRef<THREE.Mesh>(null)
  const doorR = useRef<THREE.Mesh>(null)
  const st = useRef({ seal: 0, n: -1 })
  const tmp = useMemo(() => new THREE.Object3D(), [])
  useFrame((state, dt) => {
    const g = feed.getWorld().grants.find(x => x.id === grantId)
    if (!g) return
    const now = clock()
    const frozen = g.frozen || now < (vaultHoldUntil[room.node] ?? 0)
    const s = st.current
    s.seal = damp(s.seal, frozen ? 1 : 0, frozen ? 2.4 : 1.6, dt)
    const doors = smooth(0, 0.5, s.seal)
    const sh = smooth(0.35, 1, s.seal)
    const half = w / 2
    if (doorL.current && doorR.current) {
      const sx = 0.06 + 0.94 * doors
      doorL.current.scale.x = sx
      doorR.current.scale.x = sx
      doorL.current.position.x = room.x0 + 0.1 + (half * sx) / 2
      doorR.current.position.x = room.x1 - 0.1 - (half * sx) / 2
    }
    const shake = vaultShake[room.node] ? Math.max(0, 1.4 - (now - vaultShake[room.node])) : 0
    if (shutter.current) {
      shutter.current.visible = sh > 0.005
      shutter.current.scale.y = Math.max(0.001, sh)
      shutter.current.position.set(cx + Math.sin(state.clock.elapsedTime * 38) * 0.05 * shake, top - (ih * sh) / 2, ZF - 0.06)
    }
    frost.opacity = 0.35 + 0.55 * sh
    const n = Math.max(0, g.available) / PER_PLATE
    s.n = s.n < 0 ? n : damp(s.n, n, 3, dt)
    const im = plates.current
    if (im) {
      for (let i = 0; i < 16; i++) {
        const f = Math.min(1, Math.max(0, s.n - i))
        tmp.position.set(cx + 0.9, room.y0 + 0.16 + 0.24 + i * 0.13 + 0.05 * f, -0.85)
        tmp.scale.set(1, Math.max(0.001, f), 1)
        tmp.updateMatrix()
        im.setMatrixAt(i, tmp.matrix)
      }
      im.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <>
      <instancedMesh ref={plates} args={[PLATE, M.money, 16]} castShadow receiveShadow />
      <mesh ref={doorL} position={[room.x0 + 0.3, room.y0 + 0.12 + ih / 2, 1.55]} material={M.steel} castShadow receiveShadow>
        <boxGeometry args={[w / 2, ih, 0.1]} />
      </mesh>
      <mesh ref={doorR} position={[room.x1 - 0.3, room.y0 + 0.12 + ih / 2, 1.55]} material={M.steel} castShadow receiveShadow>
        <boxGeometry args={[w / 2, ih, 0.1]} />
      </mesh>
      <mesh ref={shutter} material={frost} visible={false}>
        <boxGeometry args={[w, ih, 0.05]} />
      </mesh>
    </>
  )
}

// ── Things outside the building you can still point at ──────────────────

function OutsideHit({ node, pos, size }: { node: string; pos: [number, number, number]; size: [number, number, number] }) {
  const h = handlers(node)
  return (
    <mesh position={pos} {...h}>
      <boxGeometry args={size} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

export function Rooms() {
  return (
    <>
      {ROOMS.map(r => (
        <RoomView key={r.node} room={r} />
      ))}
      {ANTENNAS.map(a => (
        <OutsideHit key={a.node} node={a.node} pos={[a.x, (ROOF + antennaTip(a)) / 2 + 0.2, -1.45]} size={[1.0, antennaTip(a) - ROOF + 0.4, 1.0]} />
      ))}
      <OutsideHit node="v:vendors" pos={[(TRUCK.x0 + TRUCK.x1) / 2, 1.3, -1.2]} size={[TRUCK.x1 - TRUCK.x0, 2.6, 2.2]} />
      <OutsideHit node="p:funder" pos={[(FUNDER.x0 + FUNDER.x1) / 2, 2.0, -1.1]} size={[FUNDER.x1 - FUNDER.x0, 4.2, 3.8]} />
    </>
  )
}
