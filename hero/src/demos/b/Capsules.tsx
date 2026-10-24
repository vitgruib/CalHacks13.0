// Every packet in flight is a capsule in the tubes. Verdicts differ in form
// and motion, not only colour: bought glides and drops a parcel on the bench;
// refine spins, two-capped, and kicks back up the tube; blocked is squat,
// slams in, shakes and falls into the bin; held is frosted, stutters, and
// parks in a clip beside the terminal until the answer changes.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { feed, progress, type Packet } from '../../feed'
import { BAND, CAP, CAPSULE, INSERT } from './Rooms'
import { C, M } from './materials'
import { route, terminalOf } from './layout'
import { clock, effects, parked, pull, TAGS, tagEls } from './state'

type Mat = THREE.Material

interface Look {
  body: Mat
  insert: boolean
  cap: Mat | null
  cap2: Mat | null
  band: Mat | null
  s: [number, number, number]
  ease: (p: number) => number
  spin: number
  tag: boolean
  tone: string
}

const sm = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}
const inOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2)
const glide = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2)
const slam = (p: number) => p * p
const linear = (p: number) => p
const stutter = (p: number) => {
  const s = p * 3
  const k = Math.min(2, Math.floor(s))
  return (k + sm(0.35, 1, s - k)) / 3
}

const L = (o: Partial<Look>): Look => ({ body: M.capsule, insert: false, cap: null, cap2: null, band: null, s: [1, 1, 1], ease: inOut, spin: 0, tag: true, tone: 'request', ...o })

function lookOf(p: Packet): Look {
  switch (p.kind) {
    case 'request':
      return L({ insert: true, cap: M.ink })
    case 'pushback':
      return L({ insert: true, cap: M.ink, band: M.ink })
    case 'verdict':
      if (p.outcome === 'accept') return L({ insert: true, cap: M.accept, ease: glide, tone: 'accept' })
      if (p.outcome === 'refine') return L({ insert: true, cap: M.refine, cap2: M.refine, ease: linear, spin: 5, tone: 'refine' })
      if (p.outcome === 'reject') return L({ cap: M.reject, band: M.reject, s: [1.32, 0.66, 1.32], ease: slam, tone: 'reject' })
      return L({ body: M.frost, band: M.ink, ease: stutter, tone: 'hold' })
    case 'hold':
      return L({ body: M.frost, band: M.ink, ease: stutter, tone: 'hold' })
    case 'decision':
      return L({ insert: true, cap: p.outcome === 'reject' ? M.reject : M.accept, tone: p.outcome === 'reject' ? 'reject' : 'accept' })
    case 'payment':
      return L({ body: M.money, s: [1.25, 1.2, 1.25], tone: 'money' })
    case 'charge':
      return L({ body: M.money, s: [0.8, 0.8, 0.8], tag: false, tone: 'money' })
    case 'invoice':
      return L({ insert: true, band: M.money, tone: 'money' })
    case 'payment_request':
      return L({ insert: true, cap: M.money, tone: 'money' })
    case 'follow_up':
      return L({ insert: true, cap: M.ink })
    case 'paper':
      return L({ body: M.paper, band: M.ink })
    case 'reading':
      return L({ body: M.paper, cap: M.ink, s: [0.72, 0.72, 0.72], tag: !p.label.includes('no change'), tone: 'reading' })
    default:
      return L({ insert: true, band: M.ink, s: [0.8, 0.8, 0.8], tag: false })
  }
}

const HELD = L({ body: M.frost, band: M.ink, tone: 'hold', tag: false })
const MONEY = L({ body: M.money, s: [1.2, 1.1, 1.2], tone: 'money', tag: false })

interface Slot {
  g: THREE.Group
  body: THREE.Mesh
  insert: THREE.Mesh
  cap: THREE.Mesh
  cap2: THREE.Mesh
  band: THREE.Mesh
  key: string
}

const N = 40
const UP = new THREE.Vector3(0, 1, 0)
const SIDE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)

export function Capsules() {
  const root = useRef<THREE.Group>(null)
  const slots = useRef<Slot[]>([])
  const rings = useRef<THREE.Mesh[]>([])
  const parcels = useRef<THREE.Mesh[]>([])
  const ringMats = useMemo(() => Array.from({ length: 14 }, () => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide })), [])
  const tmp = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      spin: new THREE.Quaternion(),
      v: new THREE.Vector3(),
      byKey: new Map<string, number>(),
      tagByKey: new Map<string, number>(),
      tagText: [] as string[],
    }),
    [],
  )

  const make = (g: THREE.Group | null, i: number) => {
    if (!g || slots.current[i]) return
    const mesh = (geo: THREE.BufferGeometry, y = 0) => {
      const m = new THREE.Mesh(geo, M.capsule)
      m.position.y = y
      m.castShadow = true
      g.add(m)
      return m
    }
    slots.current[i] = { g, body: mesh(CAPSULE), insert: mesh(INSERT), cap: mesh(CAP, 0.27), cap2: mesh(CAP, -0.27), band: mesh(BAND), key: '' }
    g.visible = false
  }

  const dress = (s: Slot, l: Look) => {
    s.body.material = l.body
    s.insert.visible = l.insert
    s.insert.material = M.paper
    s.cap.visible = !!l.cap
    if (l.cap) s.cap.material = l.cap
    s.cap2.visible = !!l.cap2
    if (l.cap2) s.cap2.material = l.cap2
    s.band.visible = !!l.band
    if (l.band) s.band.material = l.band
    s.g.scale.set(...l.s)
  }

  useFrame(({ camera, size }) => {
    const now = feed.now()
    const t = clock()
    const w = feed.getWorld()
    const { pos, dir, q, spin, v, byKey, tagByKey, tagText } = tmp
    const used = new Set<string>()
    const tagsUsed = new Set<string>()
    const free = () => {
      for (let i = 0; i < N; i++) {
        const s = slots.current[i]
        if (s && !s.key) return i
      }
      return -1
    }
    const claim = (key: string, look: Look) => {
      used.add(key)
      let i = byKey.get(key)
      if (i === undefined) {
        i = free()
        if (i < 0) return null
        byKey.set(key, i)
        slots.current[i].key = key
        dress(slots.current[i], look)
      }
      const s = slots.current[i]
      s.g.visible = true
      return s
    }
    const orient = (s: Slot, d: THREE.Vector3, turn = 0) => {
      q.setFromUnitVectors(UP, d)
      if (turn) q.multiply(spin.setFromAxisAngle(UP, turn))
      s.g.quaternion.copy(q)
    }
    const tag = (key: string, text: string, tone: string, at: THREE.Vector3) => {
      let i = tagByKey.get(key)
      if (i === undefined) {
        for (let k = 0; k < TAGS; k++) if (!tagText[k]) {
          i = k
          break
        }
        if (i === undefined) return
        tagByKey.set(key, i)
        tagText[i] = key
        const el = tagEls[i]
        if (el) {
          el.textContent = text
          el.dataset.tone = tone
        }
      }
      tagsUsed.add(key)
      const el = tagEls[i]
      if (!el) return
      v.copy(at).project(camera)
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      el.dataset.on = v.z < 1 ? '1' : '0'
    }

    // In flight
    for (const p of w.packets) {
      const look = lookOf(p)
      const s = claim(p.id, look)
      if (!s) continue
      const pr = progress(p, now)
      route(p.from, p.to).at(look.ease(pr), pos, dir)
      s.g.position.copy(pos)
      orient(s, dir, look.spin * pr * Math.PI * 2)
      if (look.tag) tag(p.id, p.label, look.tone, pos)
    }

    // After arrival
    for (const e of effects) {
      const age = t - e.t
      if (e.kind === 'slug') {
        if (age > 1.6) continue
        const s = claim(e.key, MONEY)
        if (!s) continue
        route('a:bookkeeping', e.node).at(inOut(age / 1.6), pos, dir)
        s.g.position.copy(pos)
        orient(s, dir)
        continue
      }
      if (!e.packet || e.kind === 'ring') continue
      const p = e.packet
      const r = route(p.from, p.to)
      const end = r.pts[r.pts.length - 1]
      const last = r.pts[r.pts.length - 2] ?? end
      dir.copy(end).sub(last).normalize()
      const z = pull[p.to] ?? 0
      if (e.kind === 'accept' && age < 0.45) {
        const s = claim(e.key, lookOf(p))
        if (!s) continue
        s.g.position.copy(end).setZ(end.z + z)
        s.g.scale.setScalar(1 - sm(0.15, 0.45, age))
        orient(s, dir)
      } else if (e.kind === 'refine' && age < 1.1) {
        const s = claim(e.key, lookOf(p))
        if (!s) continue
        const back = Math.sin(Math.min(1, age / 1.1) * Math.PI) * 0.75
        s.g.position.copy(end).addScaledVector(dir, -back).setZ(end.z + z)
        orient(s, dir, age * 14)
      } else if (e.kind === 'reject' && age < 1.4) {
        const s = claim(e.key, lookOf(p))
        if (!s) continue
        const shake = age < 0.5 ? Math.sin(age * 90) * 0.08 * (1 - age / 0.5) : 0
        const fall = sm(0.5, 1.4, age)
        s.g.position.set(end.x + shake, end.y - fall * fall * 1.1, end.z + z + fall * 0.5)
        s.g.scale.set(1.32 * (1 - fall * 0.6), 0.66 * (1 - fall * 0.6), 1.32 * (1 - fall * 0.6))
        orient(s, dir, fall * 2)
      }
    }

    // Held answers wait in a clip beside the terminal
    const perNode = new Map<string, number>()
    for (const [refId, node] of parked) {
      const k = perNode.get(node) ?? 0
      perNode.set(node, k + 1)
      if (k > 3) continue
      const s = claim(`park-${refId}`, HELD)
      if (!s) continue
      const a = terminalOf(node)
      s.g.position.set(a.x + 0.5 + k * 0.3, a.y - 0.12, a.z + 0.32 + (pull[node] ?? 0))
      s.g.quaternion.copy(SIDE)
    }

    // Release what is no longer drawn
    for (const [key, i] of byKey) {
      if (used.has(key)) continue
      const s = slots.current[i]
      s.g.visible = false
      s.key = ''
      byKey.delete(key)
    }
    for (const [key, i] of tagByKey) {
      if (tagsUsed.has(key)) continue
      tagText[i] = ''
      const el = tagEls[i]
      if (el) el.dataset.on = '0'
      tagByKey.delete(key)
    }

    // Arrival rings and parcels
    let ri = 0
    let pi = 0
    for (const e of effects) {
      const age = t - e.t
      if (e.kind === 'ring' && age < 0.9 && ri < rings.current.length) {
        const m = rings.current[ri]
        const mat = ringMats[ri++]
        const a = terminalOf(e.node)
        m.visible = true
        m.position.set(a.x, a.y, a.z + 0.35 + (pull[e.node] ?? 0))
        m.scale.setScalar(0.7 + age * 2.2)
        mat.color.set(e.color)
        mat.opacity = 0.9 * (1 - age / 0.9)
      } else if (e.kind === 'accept' && age < 9 && pi < parcels.current.length && e.packet) {
        const m = parcels.current[pi++]
        const a = terminalOf(e.packet.to)
        const pop = age < 0.5 ? 1 + Math.sin(sm(0.2, 0.5, age) * Math.PI) * 0.25 : 1
        const fade = 1 - sm(8, 9, age)
        m.visible = age > 0.2
        m.position.set(a.x - 0.05, a.y - 0.2, a.z + 0.06 + (pull[e.packet.to] ?? 0))
        m.scale.setScalar(Math.max(0.001, sm(0.2, 0.45, age) * pop * fade))
      }
    }
    for (; ri < rings.current.length; ri++) rings.current[ri].visible = false
    for (; pi < parcels.current.length; pi++) parcels.current[pi].visible = false
  })

  return (
    <group ref={root}>
      {Array.from({ length: N }, (_, i) => (
        <group key={i} ref={g => make(g, i)} />
      ))}
      {ringMats.map((mat, i) => (
        <mesh
          key={`r${i}`}
          material={mat}
          visible={false}
          ref={m => {
            if (m) rings.current[i] = m
          }}
        >
          <ringGeometry args={[0.2, 0.27, 40]} />
        </mesh>
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh
          key={`p${i}`}
          material={M.wood}
          visible={false}
          castShadow
          ref={m => {
            if (m) parcels.current[i] = m
          }}
        >
          <boxGeometry args={[0.36, 0.26, 0.3]} />
        </mesh>
      ))}
    </group>
  )
}

export const ringColor = (p: Packet) => {
  if (p.kind === 'verdict' || p.kind === 'decision') return p.outcome === 'accept' ? C.accept : p.outcome === 'refine' ? C.refine : p.outcome === 'reject' ? C.reject : '#8aa0b4'
  if (p.kind === 'payment' || p.kind === 'charge' || p.kind === 'invoice' || p.kind === 'payment_request') return C.money
  if (p.kind === 'hold') return '#8aa0b4'
  return C.ink
}
