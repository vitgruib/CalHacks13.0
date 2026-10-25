// The lab plinth: a warm clay diorama of the Ortiz Lab with five figurines
// at their stations, each with a tidy stack of their recent requests.

import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import { LatheGeometry, MeshStandardMaterial, Vector2, type Group, type Material, type Mesh } from 'three'
import { feed } from '../../feed'
import type { Outcome, Request } from '../../feed'
import { LAB_X, PLINTH_D, PLINTH_W, STATIONS, type Gesture, type Station, type V3 } from './layout'
import { glazeFor, M, vary } from './mats'
import { B, Chip, Cyl, NamePlate, Pick } from './Parts'
import { TokenIcon, outcomeWord } from './icons'
import { fx, now, reducedMotion, ui, useFeed, useUi } from './store'

const coatGeo = new LatheGeometry(
  [new Vector2(0, 0), new Vector2(0.24, 0), new Vector2(0.25, 0.04), new Vector2(0.225, 0.42), new Vector2(0.2, 0.8), new Vector2(0, 0.8)],
  40,
)
const chestGeo = new LatheGeometry(
  [new Vector2(0, 0), new Vector2(0.2, 0), new Vector2(0.222, 0.2), new Vector2(0.25, 0.38), new Vector2(0.235, 0.47), new Vector2(0.14, 0.55), new Vector2(0, 0.57)],
  40,
)

const tone = (c: string) => new MeshStandardMaterial({ color: c, roughness: 0.84 })
const BODY: Record<string, Material> = {
  ortiz: tone('#5A5149'),
  okafor: tone('#6C6359'),
  raman: tone('#7D7368'),
  silva: tone('#71675D'),
  park: tone('#8A8076'),
}
const HEAD = tone('#ECE4D8')
// Sleeves a step lighter than the coat, so arms and gestures read against the body.
const ARM: Record<string, Material> = Object.fromEntries(
  Object.entries(BODY).map(([k, m]) => {
    const a = (m as MeshStandardMaterial).clone()
    a.color.offsetHSL(0, 0, 0.09)
    return [k, a]
  }),
)

const SHORT: Record<string, string> = { ortiz: 'Lena', okafor: 'Sam', raman: 'Priya', silva: 'Mateo', park: 'Jun' }
const ROLE: Record<string, string> = { ortiz: 'PI', okafor: 'Postdoc', raman: 'Grad student', silva: 'Grad student', park: 'Lab manager' }

function gestureFor(task: string, base: Gesture): Gesture | 'read' {
  if (/whiteboard/i.test(task)) return 'write'
  if (/Reading|Reviewing|Drafting|Logging|Stitching|Exporting/.test(task)) return 'read'
  return base
}

const damp = (a: number, b: number, k: number) => a + (b - a) * k
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

function Figure({ id, s }: { id: string; s: Station }) {
  const root = useRef<Group>(null)
  const torso = useRef<Group>(null)
  const head = useRef<Mesh>(null)
  const armR = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const still = useMemo(reducedMotion, [])
  const phase = useMemo(() => id.length * 1.7, [id])
  const life = useRef(0)

  useFrame((_, dt) => {
    if (!root.current || !torso.current || !head.current || !armR.current || !armL.current) return
    life.current += Math.min(dt, 0.05)
    const t = still ? 0 : life.current + phase
    const task = feed.getWorld().researchers.find(r => r.id === id)?.task ?? ''
    const g = gestureFor(task, s.gesture)
    let rx = -0.2, lx = -0.2, rz = 0.08, lz = -0.08, lean = 0, nod = 0, yaw = 0
    if (g === 'write') {
      rx = -2.0 + 0.12 * Math.sin(t * 3)
      rz = -0.15 + 0.2 * Math.sin(t * 1.7)
      nod = -0.12
    } else if (g === 'read') {
      rx = lx = -1.0
      rz = 0.3
      lz = -0.3
      nod = 0.38 + 0.05 * Math.sin(t * 0.8)
      lean = 0.06
    } else if (g === 'pipette') {
      rx = -1.3 + 0.2 * Math.max(0, Math.sin(t * 3.2))
      lx = -0.95
      lz = -0.15
      lean = 0.14
      nod = 0.32
    } else if (g === 'cabinet') {
      rx = -1.45 + 0.07 * Math.sin(t * 2.1)
      lx = -1.45 + 0.07 * Math.sin(t * 2.1 + 1.3)
      lean = 0.16
      nod = 0.22
    } else if (g === 'scope') {
      rx = lx = -1.05 + 0.05 * Math.sin(t * 1.4)
      rz = 0.2
      lz = -0.2
      lean = 0.36
      nod = 0.28
    } else if (g === 'reach') {
      rx = -2.5 + 0.25 * Math.sin(t * 1.4)
      lx = -0.35
      nod = -0.25
      yaw = 0.2 * Math.sin(t * 0.5)
    }
    // Breathing and a slow shift of weight.
    const breath = still ? 0 : Math.sin((t * Math.PI * 2) / 4.2)
    const sway = still ? 0 : 0.016 * Math.sin((t * Math.PI * 2) / 9)
    let y = 0
    // Sending: a short dip (anticipation), then a rise as the parcel leaves.
    // Hearing back: a hop, a slump, a glance up or a turn.
    const r = fx.reactions.get(id)
    if (r && !still) {
      const e = now() - r.at
      if (r.kind === 'send' && e >= 0 && e < 760) {
        const dip = e < 120 ? Math.sin((Math.PI / 2) * (e / 120)) : clamp01(1 - (e - 120) / 180)
        const rise = e >= 120 && e < 560 ? Math.sin((Math.PI * (e - 120)) / 440) : 0
        y = -0.07 * dip + 0.07 * rise
        lean = damp(lean, 0.22, dip)
        rx = damp(rx, -2.5, Math.max(rise, dip * 0.4))
      } else if (r.kind !== 'send') {
        const k = e / 700
        if (k >= 0 && k < 1) {
          const bell = Math.sin(Math.PI * k)
          if (r.kind === 'accept') y = 0.12 * bell
          else if (r.kind === 'reject') {
            lean = damp(lean, -0.18, bell)
            nod = damp(nod, 0.55, bell)
          } else if (r.kind === 'hold') nod = damp(nod, -0.3, bell)
          else if (r.kind === 'refine') yaw = damp(yaw, 0.6, bell)
        }
      }
    }
    const k = Math.min(1, dt * 7)
    armR.current.rotation.x = damp(armR.current.rotation.x, rx, k)
    armR.current.rotation.z = damp(armR.current.rotation.z, rz, k)
    armL.current.rotation.x = damp(armL.current.rotation.x, lx, k)
    armL.current.rotation.z = damp(armL.current.rotation.z, lz, k)
    torso.current.rotation.x = damp(torso.current.rotation.x, lean, k)
    torso.current.rotation.y = damp(torso.current.rotation.y, yaw, k)
    torso.current.scale.set(1 + 0.008 * breath, 1 + 0.014 * breath, 1 + 0.008 * breath)
    head.current.rotation.x = damp(head.current.rotation.x, nod, k)
    root.current.position.y = y
    root.current.rotation.z = sway
  })

  const body = BODY[id] ?? M.slate
  const sleeve = ARM[id] ?? body
  return (
    <group position={s.fig} rotation={[0, s.rot, 0]}>
      <group ref={root}>
        <mesh geometry={coatGeo} material={body} castShadow receiveShadow />
        <group ref={torso} position={[0, 0.78, 0]}>
          <mesh geometry={chestGeo} material={body} castShadow receiveShadow />
          <mesh position={[0, 0.6, 0]} material={HEAD} castShadow>
            <cylinderGeometry args={[0.06, 0.07, 0.12, 16]} />
          </mesh>
          <mesh ref={head} position={[0, 0.79, 0]} material={HEAD} castShadow receiveShadow>
            <sphereGeometry args={[0.16, 32, 22]} />
          </mesh>
          <group ref={armR} position={[0.305, 0.44, 0]}>
            <mesh position={[0, -0.24, 0]} material={sleeve} castShadow>
              <capsuleGeometry args={[0.06, 0.34, 6, 14]} />
            </mesh>
            <mesh position={[0, -0.47, 0]} material={HEAD} castShadow>
              <sphereGeometry args={[0.058, 16, 12]} />
            </mesh>
          </group>
          <group ref={armL} position={[-0.305, 0.44, 0]}>
            <mesh position={[0, -0.24, 0]} material={sleeve} castShadow>
              <capsuleGeometry args={[0.06, 0.34, 6, 14]} />
            </mesh>
            <mesh position={[0, -0.47, 0]} material={HEAD} castShadow>
              <sphereGeometry args={[0.058, 16, 12]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

// ── The researcher's token stack (the signature: it grows on selection) ──

const chipGeoArgs: [number, number, number, number] = [0.13, 0.13, 0.07, 32]

function stackKey(rs: Request[], id: string) {
  return rs
    .filter(r => r.researcherId === id)
    .slice(0, 6)
    .map(r => `${r.id}~${r.outcome ?? 'pending'}~${r.state}`)
    .join('|')
}

function Stack({ id, s }: { id: string; s: Station }) {
  const key = useFeed(w => stackKey(w.requests, id))
  const selected = useUi(st => st.selected === `r:${id}`)
  const group = useRef<Group>(null)
  const chips = key ? key.split('|').map(k => k.split('~')) : []
  const ordered = [...chips].reverse() // oldest at the bottom

  useFrame((_, dt) => {
    if (!group.current) return
    const target = ui.get().selected === `r:${id}` ? 1.7 : 1
    const sc = group.current.scale.x + (target - group.current.scale.x) * Math.min(1, dt * 5)
    group.current.scale.setScalar(sc)
  })

  return (
    <group position={s.stack}>
      <group ref={group}>
        <Cyl p={[0, 0.015, 0]} r={0.17} h={0.03} m={M.clayDeep} />
        {ordered.map(([rid, outcome], i) => (
          <mesh key={rid} position={[0, 0.07 + i * 0.08, 0]} material={glazeFor(outcome === 'pending' ? undefined : outcome)} castShadow receiveShadow>
            <cylinderGeometry args={chipGeoArgs} />
          </mesh>
        ))}
      </group>
      <StackCard id={id} ids={chips.map(c => c[0])} shown={selected && chips.length > 0} />
    </group>
  )
}

function StackCard({ id, ids, shown }: { id: string; ids: string[]; shown: boolean }) {
  const requests = useFeed(w => w.requests)
  const open = useUi(s => s.openRequest)
  const rows = ids.map(rid => requests.find(r => r.id === rid)).filter((r): r is Request => !!r)
  return (
    <Html position={[0.35, 1.1, 0]} zIndexRange={[24, 21]} wrapperClass="a-html a-html--live">
      <div className={`a-stack${shown ? '' : ' is-hidden'}`} role="group" aria-label={`${SHORT[id]}'s recent requests`} aria-hidden={!shown} inert={!shown}>
        <p className="a-stack-head">{SHORT[id]}’s requests</p>
        <ul>
          {rows.map(r => {
            const o: Outcome | undefined = r.outcome
            const isOpen = open === r.id
            return (
              <li key={r.id}>
                <button type="button" aria-expanded={isOpen} onClick={() => ui.set({ openRequest: isOpen ? null : r.id })}>
                  <TokenIcon outcome={o} />
                  <span className="a-stack-item">{r.item.split(',')[0]}</span>
                  <span className={`a-word a-word--${o ?? 'pending'}`}>{outcomeWord(r)}</span>
                </button>
                {isOpen && <p className="a-stack-why">{r.explanation}</p>}
              </li>
            )
          })}
        </ul>
      </div>
    </Html>
  )
}

const ResearcherChip = memo(function ResearcherChip({ id, s }: { id: string; s: Station }) {
  const task = useFeed(w => w.researchers.find(r => r.id === id)?.task ?? '')
  return (
    <Chip id={`r:${id}`} at={[s.fig[0], 2.15, s.fig[2]]} title={SHORT[id]} sub={ROLE[id]}>
      <span className="a-chip-task">{task}</span>
    </Chip>
  )
})

// ── Stations ──────────────────────────────────────────────────────────────

function Whiteboard() {
  return (
    <group position={[-8.25, 0, -2.6]} rotation={[0, 0.25, 0]}>
      <B p={[0, 1.3, 0]} s={[1.8, 1.12, 0.08]} m={vary(M.clay, 1)} r={0.035} />
      <B p={[0, 1.3, 0.045]} s={[1.66, 0.98, 0.012]} m={M.board} r={0.004} />
      <B p={[-0.35, 1.55, 0.055]} s={[0.5, 0.025, 0.006]} m={M.slate} r={0.002} shadow={false} />
      <B p={[-0.42, 1.47, 0.055]} s={[0.36, 0.02, 0.006]} m={M.clayDeep} r={0.002} shadow={false} />
      <B p={[0.3, 1.3, 0.055]} s={[0.36, 0.22, 0.006]} m={M.clayDeep} r={0.002} shadow={false} />
      <B p={[0, 0.76, 0.07]} s={[1.5, 0.05, 0.1]} m={vary(M.clay, 1)} r={0.02} />
      <B p={[0, 0.37, 0]} s={[1.5, 0.74, 0.12]} m={vary(M.clayDeep, 2)} r={0.04} />
    </group>
  )
}

function FumeHood() {
  return (
    <group position={[-6.5, 0, -2.62]}>
      <B p={[0, 1.05, 0]} s={[1.45, 2.1, 0.9]} m={vary(M.porcelain, 3)} r={0.06} />
      <B p={[0, 1.27, 0.43]} s={[1.18, 0.8, 0.06]} m={M.dark} r={0.02} />
      <B p={[0, 1.5, 0.47]} s={[1.2, 0.42, 0.02]} m={M.window} r={0.008} shadow={false} />
      <B p={[0, 0.84, 0.48]} s={[1.3, 0.06, 0.12]} m={M.clay} r={0.02} />
      <Cyl p={[0.3, 2.35, -0.1]} r={0.16} h={0.5} m={vary(M.clay, 4)} />
    </group>
  )
}

function SafetyCabinet() {
  return (
    <group position={[-5.05, 0, -2.6]}>
      <B p={[0, 0.37, 0]} s={[1.5, 0.74, 0.8]} m={vary(M.clay, 2)} r={0.05} />
      <B p={[0, 1.33, 0]} s={[1.56, 1.18, 0.86]} m={vary(M.porcelain, 1)} r={0.06} />
      <B p={[0, 1.13, 0.42]} s={[1.3, 0.46, 0.06]} m={M.dark} r={0.02} />
      <B p={[0, 1.47, 0.46]} s={[1.32, 0.5, 0.016]} m={M.window} r={0.006} rot={[-0.16, 0, 0]} shadow={false} />
      <B p={[0, 1.98, 0.05]} s={[1.4, 0.12, 0.62]} m={vary(M.clay, 3)} r={0.04} />
    </group>
  )
}

function Freezer() {
  return (
    <group position={[-2.3, 0, -2.6]}>
      <B p={[0, 0.98, 0]} s={[0.95, 1.96, 0.88]} m={vary(M.porcelain, 4)} r={0.07} />
      <B p={[0, 0.98, 0.445]} s={[0.86, 1.74, 0.02]} m={M.chalk} r={0.008} />
      <B p={[0.34, 1.12, 0.48]} s={[0.06, 0.5, 0.06]} m={M.slate} r={0.025} />
    </group>
  )
}

function Shelf() {
  const boxes: [V3, V3, MeshStandardMaterial][] = [
    [[-0.2, 0.47, 0], [0.32, 0.2, 0.3], M.chalk],
    [[0.18, 0.45, 0], [0.3, 0.16, 0.32], M.clayDeep],
    [[-0.12, 0.92, 0], [0.46, 0.2, 0.3], M.clay],
    [[-0.05, 1.37, 0], [0.62, 0.18, 0.3], M.chalk],
  ]
  return (
    <group position={[-3.55, 0, -2.75]}>
      {[0.34, 0.8, 1.26, 1.72].map(y => (
        <B key={y} p={[0, y, 0]} s={[0.92, 0.04, 0.46]} m={vary(M.clay, 2)} r={0.012} />
      ))}
      {[-0.46, 0.46].map(x => (
        <B key={x} p={[x, 0.88, 0]} s={[0.05, 1.76, 0.46]} m={vary(M.clayDeep, 1)} r={0.015} />
      ))}
      {boxes.map(([p, s, m], i) => (
        <B key={i} p={p} s={s} m={vary(m, i)} r={0.025} />
      ))}
    </group>
  )
}

function PurificationBench() {
  return (
    <group position={[-7.4, 0, 0.92]}>
      <B p={[0, 0.41, 0]} s={[2.4, 0.82, 0.84]} m={vary(M.clay, 3)} r={0.05} />
      <B p={[0, 0.86, 0]} s={[2.5, 0.08, 0.94]} m={vary(M.porcelain, 2)} r={0.035} />
      <B p={[-0.6, 0.93, -0.05]} s={[0.36, 0.06, 0.24]} m={M.slate} r={0.015} />
      <Cyl p={[-0.66, 1.15, -0.04]} r={0.05} h={0.38} m={M.window} seg={20} />
      <Cyl p={[-0.52, 1.12, -0.04]} r={0.05} h={0.32} m={M.window} seg={20} />
      <B p={[0.25, 1.0, 0.05]} s={[0.5, 0.2, 0.34]} m={M.chalk} r={0.035} />
      {Array.from({ length: 5 }, (_, i) => (
        <Cyl key={i} p={[0.07 + i * 0.09, 1.15, 0.05]} r={0.026} h={0.11} m={i % 2 ? M.porcelain : M.clayDeep} seg={12} />
      ))}
      <Cyl p={[0.82, 1.02, -0.1]} r={0.08} h={0.24} m={vary(M.porcelain, 1)} seg={22} />
    </group>
  )
}

function ConfocalTable() {
  return (
    <group position={[-4.15, 0, 0.98]}>
      {[-0.66, 0.66].map(x => (
        <B key={x} p={[x, 0.36, 0]} s={[0.18, 0.72, 0.74]} m={vary(M.clay, 1)} r={0.04} />
      ))}
      <B p={[0, 0.78, 0]} s={[1.75, 0.12, 0.88]} m={M.slateDeep} r={0.035} />
      <group position={[-0.15, 0.84, 0.05]}>
        <B p={[0, 0.05, 0]} s={[0.5, 0.1, 0.42]} m={M.porcelain} r={0.035} />
        <B p={[0, 0.42, 0.14]} s={[0.16, 0.7, 0.18]} m={M.porcelain} r={0.04} />
        <B p={[0, 0.74, 0.0]} s={[0.19, 0.14, 0.44]} m={M.porcelain} r={0.04} />
        <Cyl p={[0, 0.62, -0.12]} r={0.075} h={0.08} m={M.slate} />
        <B p={[0.34, 0.66, 0.06]} s={[0.3, 0.28, 0.32]} m={M.chalk} r={0.045} />
      </group>
      <B p={[0.58, 0.95, 0.18]} s={[0.4, 0.22, 0.32]} m={vary(M.clay, 4)} r={0.035} />
    </group>
  )
}

export const LabPlinth = memo(function LabPlinth() {
  const ids = Object.keys(STATIONS)
  return (
    <group>
      <B p={[LAB_X, -0.56, 0]} s={[PLINTH_W, 1.1, PLINTH_D]} m={M.labBody} r={0.16} />
      <B p={[LAB_X, -0.01, 0]} s={[PLINTH_W - 0.3, 0.04, PLINTH_D - 0.3]} m={M.labTop} r={0.015} />
      <NamePlate text="The Ortiz Lab" x={LAB_X} ink="#B3A898" light="#E6DFD3" />
      <Pick id="r:ortiz">
        <Whiteboard />
      </Pick>
      <FumeHood />
      <Pick id="r:raman">
        <SafetyCabinet />
      </Pick>
      <Pick id="r:park">
        <Freezer />
        <Shelf />
      </Pick>
      <Pick id="r:okafor">
        <PurificationBench />
      </Pick>
      <Pick id="r:silva">
        <ConfocalTable />
      </Pick>
      {ids.map(id => (
        <Pick key={id} id={`r:${id}`}>
          <Figure id={id} s={STATIONS[id]} />
          <Stack id={id} s={STATIONS[id]} />
        </Pick>
      ))}
      {ids.map(id => (
        <ResearcherChip key={id} id={id} s={STATIONS[id]} />
      ))}
    </group>
  )
})
