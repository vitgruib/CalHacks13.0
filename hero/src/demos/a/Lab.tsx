// The lab plinth: a matte clay diorama of the Ortiz Lab with five figurines
// at their stations, each with a tidy stack of their recent requests.

import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import { LatheGeometry, MeshStandardMaterial, Vector2, type Group, type Material, type Mesh } from 'three'
import { feed } from '../../feed'
import type { Outcome, Request } from '../../feed'
import { LAB_X, PLINTH_D, PLINTH_W, STATIONS, type Gesture, type Station, type V3 } from './layout'
import { glazeFor, M } from './mats'
import { B, Chip, Cyl, Pick, useFlash } from './Parts'
import { TokenIcon, outcomeWord } from './icons'
import { fx, now, reducedMotion, ui, useFeed, useUi } from './store'

const coatGeo = new LatheGeometry(
  [new Vector2(0, 0), new Vector2(0.25, 0), new Vector2(0.255, 0.04), new Vector2(0.23, 0.45), new Vector2(0.2, 0.82), new Vector2(0, 0.82)],
  40,
)
const chestGeo = new LatheGeometry([new Vector2(0, 0), new Vector2(0.2, 0), new Vector2(0.215, 0.3), new Vector2(0.19, 0.44), new Vector2(0.09, 0.54), new Vector2(0, 0.56)], 40)

const tone = (c: string) => new MeshStandardMaterial({ color: c, roughness: 0.82 })
const BODY: Record<string, Material> = {
  ortiz: tone('#2F3945'),
  okafor: tone('#4E5B69'),
  raman: tone('#64727F'),
  silva: tone('#5A6878'),
  park: tone('#7A8795'),
}
const HEAD = tone('#DCE1E6')

const SHORT: Record<string, string> = { ortiz: 'Lena', okafor: 'Sam', raman: 'Priya', silva: 'Mateo', park: 'Jun' }
const ROLE: Record<string, string> = { ortiz: 'PI', okafor: 'Postdoc', raman: 'Grad student', silva: 'Grad student', park: 'Lab manager' }

function gestureFor(task: string, base: Gesture): Gesture | 'read' {
  if (/whiteboard/i.test(task)) return 'write'
  if (/Reading|Reviewing|Drafting|Logging|Stitching|Exporting/.test(task)) return 'read'
  return base
}

const damp = (a: number, b: number, k: number) => a + (b - a) * k

function Figure({ id, s }: { id: string; s: Station }) {
  const root = useRef<Group>(null)
  const torso = useRef<Group>(null)
  const head = useRef<Mesh>(null)
  const armR = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const still = useMemo(reducedMotion, [])
  const phase = useMemo(() => id.length * 1.7, [id])

  useFrame(({ clock }, dt) => {
    if (!root.current || !torso.current || !head.current || !armR.current || !armL.current) return
    const t = still ? 0 : clock.elapsedTime + phase
    const task = feed.getWorld().researchers.find(r => r.id === id)?.task ?? ''
    const g = gestureFor(task, s.gesture)
    let rx = -0.2, lx = -0.2, rz = 0, lz = 0, lean = 0, nod = 0, yaw = 0
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
    // A short reaction when they send something or hear back.
    let hop = 0
    const r = fx.reactions.get(id)
    if (r && !still) {
      const k = (now() - r.at) / 700
      if (k >= 0 && k < 1) {
        const bell = Math.sin(Math.PI * k)
        if (r.kind === 'send') rx = damp(rx, -2.6, bell)
        else if (r.kind === 'accept') hop = 0.12 * bell
        else if (r.kind === 'reject') {
          lean = damp(lean, -0.18, bell)
          nod = damp(nod, 0.55, bell)
        } else if (r.kind === 'hold') nod = damp(nod, -0.3, bell)
        else if (r.kind === 'refine') yaw = damp(yaw, 0.6, bell)
      }
    }
    const k = Math.min(1, dt * 6)
    armR.current.rotation.x = damp(armR.current.rotation.x, rx, k)
    armR.current.rotation.z = damp(armR.current.rotation.z, rz, k)
    armL.current.rotation.x = damp(armL.current.rotation.x, lx, k)
    armL.current.rotation.z = damp(armL.current.rotation.z, lz, k)
    torso.current.rotation.x = damp(torso.current.rotation.x, lean, k)
    torso.current.rotation.y = damp(torso.current.rotation.y, yaw, k)
    head.current.rotation.x = damp(head.current.rotation.x, nod, k)
    root.current.position.y = hop
  })

  return (
    <group position={s.fig} rotation={[0, s.rot, 0]}>
      <group ref={root}>
        <mesh geometry={coatGeo} material={BODY[id] ?? M.slate} castShadow receiveShadow />
        <group ref={torso} position={[0, 0.8, 0]}>
          <mesh geometry={chestGeo} material={BODY[id] ?? M.slate} castShadow receiveShadow />
          <mesh ref={head} position={[0, 0.72, 0]} material={HEAD} castShadow receiveShadow>
            <sphereGeometry args={[0.15, 28, 20]} />
          </mesh>
          <group ref={armR} position={[0.235, 0.43, 0]}>
            <mesh position={[0, -0.24, 0]} material={BODY[id] ?? M.slate} castShadow>
              <capsuleGeometry args={[0.052, 0.36, 4, 12]} />
            </mesh>
            <mesh position={[0, -0.47, 0]} material={HEAD} castShadow>
              <sphereGeometry args={[0.05, 14, 10]} />
            </mesh>
          </group>
          <group ref={armL} position={[-0.235, 0.43, 0]}>
            <mesh position={[0, -0.24, 0]} material={BODY[id] ?? M.slate} castShadow>
              <capsuleGeometry args={[0.052, 0.36, 4, 12]} />
            </mesh>
            <mesh position={[0, -0.47, 0]} material={HEAD} castShadow>
              <sphereGeometry args={[0.05, 14, 10]} />
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
  const flash = useFlash(`r:${id}`)
  const on = useUi(st => st.hovered === `r:${id}` || st.selected === `r:${id}`)
  return (
    <Chip id={`r:${id}`} at={[s.fig[0], 2.0, s.fig[2]]} title={SHORT[id]} sub={ROLE[id]} quiet>
      {(on || flash) && <span className="a-chip-task">{task}</span>}
    </Chip>
  )
})

// ── Stations ──────────────────────────────────────────────────────────────

function Whiteboard() {
  return (
    <group position={[-8.25, 0, -2.6]} rotation={[0, 0.25, 0]}>
      <B p={[0, 1.3, 0]} s={[1.8, 1.12, 0.07]} m={M.clay} r={0.03} />
      <B p={[0, 1.3, 0.04]} s={[1.68, 1.0, 0.012]} m={M.board} r={0.004} />
      <B p={[-0.35, 1.55, 0.05]} s={[0.5, 0.025, 0.006]} m={M.slate} r={0.002} />
      <B p={[-0.42, 1.47, 0.05]} s={[0.36, 0.02, 0.006]} m={M.clayDeep} r={0.002} />
      <B p={[0.3, 1.3, 0.05]} s={[0.36, 0.22, 0.006]} m={M.clayDeep} r={0.002} />
      <B p={[0.3, 1.3, 0.052]} s={[0.32, 0.18, 0.006]} m={M.board} r={0.002} />
      <B p={[-0.2, 1.08, 0.05]} s={[0.7, 0.02, 0.006]} m={M.slate} r={0.002} />
      <B p={[0, 0.76, 0.07]} s={[1.5, 0.04, 0.09]} m={M.clay} r={0.015} />
      <Cyl p={[-0.82, 0.38, 0]} r={0.03} h={0.76} m={M.slate} />
      <Cyl p={[0.82, 0.38, 0]} r={0.03} h={0.76} m={M.slate} />
      <B p={[-0.82, 0.03, 0]} s={[0.08, 0.06, 0.6]} m={M.slate} r={0.02} />
      <B p={[0.82, 0.03, 0]} s={[0.08, 0.06, 0.6]} m={M.slate} r={0.02} />
    </group>
  )
}

function FumeHood() {
  return (
    <group position={[-6.5, 0, -2.62]}>
      <B p={[0, 1.05, 0]} s={[1.45, 2.1, 0.9]} m={M.porcelain} r={0.05} />
      <B p={[0, 1.27, 0.43]} s={[1.18, 0.8, 0.06]} m={M.dark} r={0.02} />
      <B p={[0, 1.5, 0.47]} s={[1.2, 0.42, 0.02]} m={M.glass} r={0.008} />
      <B p={[0, 0.84, 0.48]} s={[1.3, 0.06, 0.12]} m={M.clay} r={0.02} />
      <B p={[0, 0.42, 0.455]} s={[0.02, 0.7, 0.01]} m={M.clayDeep} r={0.004} />
      <Cyl p={[0.3, 2.35, -0.1]} r={0.15} h={0.5} m={M.clay} />
    </group>
  )
}

function SafetyCabinet() {
  return (
    <group position={[-5.05, 0, -2.6]}>
      <B p={[0, 0.37, 0]} s={[1.5, 0.74, 0.8]} m={M.clay} r={0.04} />
      <B p={[0, 1.33, 0]} s={[1.56, 1.18, 0.86]} m={M.porcelain} r={0.05} />
      <B p={[0, 1.13, 0.42]} s={[1.3, 0.46, 0.06]} m={M.dark} r={0.02} />
      <B p={[0, 1.47, 0.46]} s={[1.32, 0.5, 0.016]} m={M.glass} r={0.006} rot={[-0.16, 0, 0]} />
      <B p={[0, 1.98, 0.05]} s={[1.4, 0.12, 0.62]} m={M.clay} r={0.03} />
    </group>
  )
}

function Freezer() {
  return (
    <group position={[-2.3, 0, -2.6]}>
      <B p={[0, 0.98, 0]} s={[0.95, 1.96, 0.88]} m={M.porcelain} r={0.06} />
      <B p={[0, 0.98, 0.445]} s={[0.86, 1.74, 0.02]} m={M.chalk} r={0.008} />
      <B p={[0.34, 1.12, 0.48]} s={[0.05, 0.5, 0.06]} m={M.slate} r={0.02} />
      <B p={[-0.16, 1.72, 0.465]} s={[0.3, 0.12, 0.02]} m={M.dark} r={0.008} />
    </group>
  )
}

function Shelf() {
  const boxes: [V3, V3, Material][] = [
    [[-0.22, 0.47, 0], [0.3, 0.2, 0.3], M.chalk],
    [[0.16, 0.45, 0], [0.34, 0.16, 0.32], M.clayDeep],
    [[-0.18, 0.9, 0], [0.36, 0.16, 0.3], M.clay],
    [[0.2, 0.93, 0], [0.24, 0.22, 0.28], M.porcelain],
    [[-0.05, 1.36, 0], [0.62, 0.18, 0.3], M.chalk],
  ]
  return (
    <group position={[-3.55, 0, -2.75]}>
      {[0.34, 0.8, 1.26, 1.72].map(y => (
        <B key={y} p={[0, y, 0]} s={[0.92, 0.035, 0.46]} m={M.clay} r={0.01} />
      ))}
      {[-0.44, 0.44].flatMap(x => [-0.21, 0.21].map(z => <B key={`${x}${z}`} p={[x, 0.9, z]} s={[0.035, 1.8, 0.035]} m={M.slate} r={0.01} />))}
      {boxes.map(([p, s, m], i) => (
        <B key={i} p={p} s={s} m={m} r={0.02} />
      ))}
    </group>
  )
}

function PurificationBench() {
  return (
    <group position={[-7.4, 0, 0.92]}>
      <B p={[0, 0.41, 0]} s={[2.4, 0.82, 0.84]} m={M.clay} r={0.04} />
      <B p={[0, 0.86, 0]} s={[2.5, 0.08, 0.94]} m={M.porcelain} r={0.03} />
      <B p={[-0.6, 0.915, -0.05]} s={[0.32, 0.03, 0.22]} m={M.slate} r={0.01} />
      <Cyl p={[-0.6, 1.22, -0.12]} r={0.014} h={0.6} m={M.slate} seg={10} />
      <Cyl p={[-0.66, 1.18, -0.02]} r={0.04} h={0.36} m={M.glass} seg={16} />
      <Cyl p={[-0.54, 1.14, -0.02]} r={0.04} h={0.3} m={M.glass} seg={16} />
      <B p={[0.25, 1.0, 0.05]} s={[0.5, 0.2, 0.34]} m={M.chalk} r={0.03} />
      {Array.from({ length: 10 }, (_, i) => (
        <Cyl key={i} p={[0.06 + (i % 5) * 0.09, 1.14, -0.03 + Math.floor(i / 5) * 0.12]} r={0.022} h={0.1} m={i % 3 ? M.porcelain : M.clayDeep} seg={10} />
      ))}
      <Cyl p={[0.8, 1.02, -0.12]} r={0.07} h={0.24} m={M.porcelain} seg={18} />
      <Cyl p={[0.98, 0.99, -0.06]} r={0.06} h={0.18} m={M.clayDeep} seg={18} />
      <Cyl p={[0.9, 0.97, 0.16]} r={0.05} h={0.14} m={M.chalk} seg={18} />
    </group>
  )
}

function ConfocalTable() {
  return (
    <group position={[-4.15, 0, 0.98]}>
      {[-0.72, 0.72].flatMap(x => [-0.3, 0.3].map(z => <B key={`${x}${z}`} p={[x, 0.36, z]} s={[0.16, 0.72, 0.16]} m={M.clay} r={0.03} />))}
      <B p={[0, 0.78, 0]} s={[1.75, 0.12, 0.88]} m={M.slateDeep} r={0.03} />
      <group position={[-0.15, 0.84, 0.05]}>
        <B p={[0, 0.05, 0]} s={[0.5, 0.1, 0.42]} m={M.porcelain} r={0.03} />
        <B p={[0, 0.42, 0.14]} s={[0.14, 0.7, 0.16]} m={M.porcelain} r={0.03} />
        <B p={[0, 0.74, 0.0]} s={[0.17, 0.12, 0.42]} m={M.porcelain} r={0.03} />
        <Cyl p={[0, 0.62, -0.12]} r={0.07} h={0.08} m={M.slate} />
        <B p={[0, 0.4, -0.08]} s={[0.32, 0.03, 0.26]} m={M.slate} r={0.01} />
        <Cyl p={[-0.04, 0.84, -0.14]} r={0.024} h={0.18} m={M.slate} rot={[0.6, 0, 0]} seg={12} />
        <Cyl p={[0.04, 0.84, -0.14]} r={0.024} h={0.18} m={M.slate} rot={[0.6, 0, 0]} seg={12} />
        <B p={[0.34, 0.66, 0.06]} s={[0.3, 0.28, 0.32]} m={M.chalk} r={0.04} />
      </group>
      <B p={[0.58, 0.95, 0.18]} s={[0.4, 0.22, 0.32]} m={M.clay} r={0.03} />
      <B p={[-0.68, 1.12, 0.12]} s={[0.46, 0.3, 0.03]} m={M.dark} r={0.01} rot={[0, 0.35, 0]} />
      <Cyl p={[-0.68, 0.92, 0.12]} r={0.02} h={0.16} m={M.slate} seg={8} />
    </group>
  )
}

export const LabPlinth = memo(function LabPlinth() {
  const ids = Object.keys(STATIONS)
  return (
    <group>
      <B p={[LAB_X, -0.56, 0]} s={[PLINTH_W, 1.1, PLINTH_D]} m={M.labBody} r={0.14} />
      <B p={[LAB_X, -0.01, 0]} s={[PLINTH_W - 0.3, 0.04, PLINTH_D - 0.3]} m={M.labTop} r={0.015} />
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
      <Html position={[LAB_X, -0.5, PLINTH_D / 2 + 0.02]} zIndexRange={[19, 10]} wrapperClass="a-html" pointerEvents="none">
        <div className="a-plaque a-plaque--light">
          <span>The Ortiz Lab</span> five researchers
        </div>
      </Html>
    </group>
  )
})

