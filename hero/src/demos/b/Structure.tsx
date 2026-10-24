// The building's carcass and its site: basswood floor slabs (the floor
// lines), card walls, the ground cut in section, the tube network, rooftop
// antennas, the vendor's truck, the funder's building. All static, merged.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Kit, type Part } from './kit'
import { M } from './materials'
import { ANTENNAS, antennaTip, junctions, ROOF, TZ, tubeRuns, ZB, ZF } from './layout'
import { intro } from './state'

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

function buildStructure(): Part[] {
  const k = new Kit()
  const D0 = ZB - 0.2
  const D1 = ZF + 0.05
  const dz = D1 - D0
  const cz = (D0 + D1) / 2

  // Floor slabs: the clear floor lines of the section
  const slab = (x0: number, x1: number, y: number, t = 0.24) => k.box('wood', (x0 + x1) / 2, y, cz, x1 - x0, t, dz)
  slab(-1.6, 14.4, -3.2)
  slab(-14.4, 14.4, 0)
  slab(-14.4, 14.4, 3.2)
  slab(-14.4, 14.4, 6.4)
  slab(-14.4, 14.4, ROOF, 0.32)

  // Exterior walls, cut at the front. The dock door opens in the left wall.
  k.box('card', -14.3, 5.95, cz, 0.2, 7.3, dz)
  k.box('card', -14.3, 1.15, (D0 - 2.0) / 2, 0.2, 2.3, -2.0 - D0)
  k.box('card', -14.3, 1.15, (0.9 + D1) / 2, 0.2, 2.3, D1 - 0.9)
  k.box('woodDark', -14.3, 2.0, -0.55, 0.12, 0.6, 2.9)
  k.box('card', 14.3, 3.2, cz, 0.2, 12.8, dz)

  // The void behind every room (seen when a room is pulled out)
  k.box('chipDark', 0, 3.2, ZB - 0.1, 28.8, 12.8, 0.2)

  // The exchange core: a white shaft between the wings
  k.box('card', 0, 3.2, ZB + 0.05, 3.2, 12.8, 0.1)
  k.box('card', -1.55, 3.2, cz, 0.1, 12.8, dz)
  k.box('card', 1.55, 3.2, cz, 0.1, 12.8, dz)

  // Roof: parapets, lab exhaust stacks, an air handler
  k.box('card', 0, ROOF + 0.33, ZF - 0.08, 28.8, 0.34, 0.16)
  k.box('card', 0, ROOF + 0.33, D0 + 0.08, 28.8, 0.34, 0.16)
  k.cyl('card', -12.4, ROOF + 0.16, -1.1, 0.24, 1.0)
  k.cyl('card', -11.2, ROOF + 0.16, -1.1, 0.2, 1.3)
  k.cyl('card', -10.0, ROOF + 0.16, -1.1, 0.24, 0.85)
  k.blk('card', -5.6, ROOF + 0.16, -1.1, 3.0, 0.75, 1.8)
  k.blk('wood', -5.6, ROOF + 0.91, -1.1, 3.1, 0.05, 1.9)

  // Rooftop antennas: the outside sources the bookkeeping agent reads
  for (const a of ANTENNAS) {
    const base = ROOF + 0.16
    const tip = antennaTip(a)
    k.blk('card', a.x, base, TZ, 0.4, 0.16, 0.4)
    k.rod('steel', V(a.x, base, TZ), V(a.x, tip, TZ), 0.04, 8)
    if (a.top === 'dish') {
      const g = new THREE.CylinderGeometry(0.46, 0.2, 0.12, 24)
      g.rotateX(-1.05)
      g.rotateY(0.35)
      g.translate(a.x - 0.05, tip + 0.02, TZ + 0.18)
      k.geo('card', g)
    } else if (a.top === 'yagi') {
      for (let i = 0; i < 4; i++) k.rod('steel', V(a.x - 0.4 + i * 0.02, tip - 0.1 - i * 0.28, TZ), V(a.x + 0.4 - i * 0.02, tip - 0.1 - i * 0.28, TZ), 0.025, 6)
    } else {
      k.ball('steel', a.x, tip + 0.06, TZ, 0.08)
      k.rod('steel', V(a.x - 0.3, tip - 0.5, TZ), V(a.x + 0.3, tip - 0.5, TZ), 0.025, 6)
    }
  }

  // The ground, cut in section along the same plane as the building
  k.box('chip', -20.8, -1.8, -5.8, 38.4, 3.6, 16.4)
  k.box('chip', 27.2, -1.8, -5.8, 25.6, 3.6, 16.4)
  k.box('chip', 6.4, -3.46, -5.8, 16, 0.28, 16.4)
  k.box('chip', 6.4, -1.66, -8.3, 16, 3.32, 11.4)

  // Loading dock and the vendor's truck
  k.blk('chip', -15.3, 0, -0.9, 1.8, 0.55, 3.0)
  k.blk('card', -15.4, 2.62, -0.8, 2.2, 0.07, 3.3)
  k.blk('ink', -18.9, 0.36, -1.2, 5.2, 0.22, 1.7)
  k.blk('card', -18.25, 0.58, -1.2, 3.9, 1.62, 1.9)
  k.blk('card', -20.9, 0.58, -1.2, 1.3, 1.22, 1.8)
  k.box('glass', -21.56, 1.5, -1.2, 0.04, 0.42, 1.5)
  k.box('wood', -18.25, 1.38, -0.24, 3.6, 0.04, 0.02)
  for (const x of [-20.9, -18.9, -17.1]) {
    k.disc('ink', x, 0.34, -0.26, 0.34, 0.22)
    k.disc('ink', x, 0.34, -2.14, 0.34, 0.22)
  }

  // The funder: a small federal building with a portico
  k.blk('card', 18.7, 0, -1.1, 4.2, 0.45, 3.8)
  k.blk('card', 18.7, 0, 0.98, 3.2, 0.24, 0.36)
  k.blk('card', 18.7, 0.45, -1.6, 3.6, 2.5, 2.4)
  for (let i = 0; i < 6; i++) k.cyl('card', 16.95 + i * 0.7, 0.45, 0.35, 0.13, 2.5)
  k.blk('card', 18.7, 2.95, -1.1, 4.1, 0.38, 3.7)
  const ped = new THREE.CylinderGeometry(1, 1, 3.7, 3)
  ped.rotateX(-Math.PI / 2)
  ped.scale(2.2, 0.55, 1)
  ped.translate(18.7, 3.33 + 0.28, -1.1)
  k.geo('card', ped)

  // Model trees, for scale
  const tree = (x: number, z: number, s: number) => {
    k.rod('woodDark', V(x, 0, z), V(x, 1.7 * s, z), 0.07 * s, 6)
    const g = new THREE.IcosahedronGeometry(s, 1)
    g.scale(1, 1.15, 1)
    g.translate(x, 2.45 * s, z)
    k.geo('card', g)
  }
  tree(-25.2, -2.6, 1.15)
  tree(-23.4, -6.4, 1.45)
  tree(24.2, -2.4, 1.2)
  tree(22.6, -6.6, 1.55)
  tree(-28.6, -5.2, 1.3)
  tree(27.8, -5.6, 1.25)

  // The pneumatic tube network: acrylic runs, joints, and the exchange's diverters
  for (const [a, b] of tubeRuns()) k.rod('acrylic', a, b, 0.17, 14)
  const joints = new Map<string, THREE.Vector3>()
  for (const [a, b] of tubeRuns()) for (const p of [a, b]) joints.set(`${p.x.toFixed(2)},${p.y.toFixed(2)}`, p)
  for (const p of joints.values()) k.ball('acrylic', p.x, p.y, p.z, 0.17, 12)
  for (const j of junctions()) k.box('wood', j.x, j.y, j.z, 0.62, 0.5, 0.5)

  return k.build()
}

function buildFacade(): Part[] {
  const k = new Kit()
  const z = ZF + 0.12
  const d = 0.12
  for (const y of [0, 3.2, 6.4]) {
    k.box('card', 0, y + 0.12, z, 28.8, 0.92, d)
    const yc = y + 0.58 + 1.15
    for (let i = 0; i <= 8; i++) k.box('card', -14.2 + i * 1.575, yc, z, 0.36, 2.3, d)
    k.box('glass', -8, yc, z - 0.05, 12.8, 2.3, 0.04)
    for (let i = 0; i <= 12; i++) k.box('card', 1.75 + i * 1.04, yc, z, 0.14, 2.3, d)
    k.box('glass', 8, yc, z - 0.05, 12.8, 2.3, 0.04)
  }
  k.box('card', 0, ROOF + 0.12, z, 28.8, 0.9, d)
  k.box('card', 0, 4.8, z + 0.01, 3.2, 9.6, d)
  k.box('chip', 6.4, -1.8, z, 16, 3.6, 0.14)
  return k.build()
}

export function Structure() {
  const parts = useMemo(buildStructure, [])
  return (
    <group>
      {parts.map(p => (
        <mesh key={p.mat} geometry={p.geo} material={M[p.mat]} castShadow={p.mat !== 'acrylic'} receiveShadow />
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0, -3.62, 10]} receiveShadow material={M.table}>
        <planeGeometry args={[400, 220]} />
      </mesh>
    </group>
  )
}

const ease = (t: number) => t * t * (3 - 2 * t)

/** The front of the building, lifted off like a dollhouse lid during the opening move. */
export function Facade() {
  const parts = useMemo(buildFacade, [])
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!g.current) return
    const lift = ease(Math.min(1, Math.max(0, (intro.t - 0.1) / 0.5)))
    g.current.visible = lift < 0.999
    g.current.position.set(0, lift * 17, lift * 12)
    g.current.rotation.x = -lift * 0.55
  })
  return (
    <group ref={g}>
      {parts.map(p => (
        <mesh key={p.mat} geometry={p.geo} material={M[p.mat]} castShadow receiveShadow />
      ))}
    </group>
  )
}
