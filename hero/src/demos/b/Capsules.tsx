// Every packet in flight is a capsule in the tubes, and the tube it runs in
// fills with colour behind it so the route reads from across the room.
// Verdicts differ in form and motion, not only colour: bought glides and
// drops a parcel on the bench; refine spins, two-capped, and kicks back up
// the tube; blocked is squat, slams in, shakes and falls; held is frosted,
// stutters, and parks in a clip beside the terminal until it is answered.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { feed, progress, type Packet, type World } from '../../feed'
import { BAND, CAP, CAPSULE } from './Rooms'
import { C, M } from './materials'
import { route, terminalOf, type Route } from './layout'
import { clock, effects, pull, TAGS, tagEls } from './state'

type Mat = THREE.Material

interface Look {
  body: Mat
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

const L = (o: Partial<Look>): Look => ({ body: M.capsule, cap: null, cap2: null, band: null, s: [1, 1, 1], ease: inOut, spin: 0, tag: true, tone: 'request', ...o })

function lookOf(p: Packet): Look {
  switch (p.kind) {
    case 'request':
      return L({ cap: M.ink })
    case 'pushback':
      return L({ cap: M.ink, band: M.ink })
    case 'verdict':
      if (p.outcome === 'accept') return L({ cap: M.accept, ease: glide, tone: 'accept' })
      if (p.outcome === 'refine') return L({ cap: M.refine, cap2: M.refine, ease: linear, spin: 5, tone: 'refine' })
      if (p.outcome === 'reject') return L({ cap: M.reject, band: M.reject, s: [1.3, 0.68, 1.3], ease: slam, tone: 'reject' })
      return L({ body: M.held, band: M.ink, ease: stutter, tone: 'hold' })
    case 'hold':
      return L({ body: M.held, band: M.ink, ease: stutter, tone: 'hold' })
    case 'decision':
      return L({ cap: p.outcome === 'reject' ? M.reject : M.accept, tone: p.outcome === 'reject' ? 'reject' : 'accept' })
    case 'payment':
      return L({ body: M.money, s: [1.2, 1.15, 1.2], tone: 'money' })
    case 'charge':
      return L({ body: M.money, s: [0.8, 0.8, 0.8], tag: false, tone: 'money' })
    case 'invoice':
      return L({ band: M.money, cap: M.money, tone: 'money' })
    case 'payment_request':
      return L({ cap: M.money, tone: 'money' })
    case 'follow_up':
      return L({ cap: M.ink })
    case 'paper':
      return L({ body: M.paper, band: M.ink })
    case 'reading':
      return L({ body: M.paper, cap: M.ink, s: [0.75, 0.75, 0.75], tag: !p.label.includes('no change'), tone: 'reading' })
    default:
      return L({ band: M.ink, s: [0.8, 0.8, 0.8], tag: false })
  }
}

const HELD = L({ body: M.held, band: M.ink, tone: 'hold', tag: false })
const MONEY = L({ body: M.money, s: [1.2, 1.1, 1.2], tone: 'money', tag: false })

const TRAIL: Record<string, string> = { request: C.ink, reading: '#4a5562', accept: C.accept, refine: C.refine, reject: C.reject, hold: '#5d7387', money: C.money }

const PLACE: Record<string, string> = {
  'a:purchasing': 'purchasing',
  'a:bookkeeping': 'bookkeeping',
  'a:payment_report': 'payment & report',
  'p:grant_manager': 'grant manager',
  'v:vendors': 'vendors',
  'p:funder': 'NIH',
}
function placeName(id: string, w: World) {
  if (PLACE[id]) return PLACE[id]
  if (id.startsWith('r:')) {
    const name = w.researchers.find(r => `r:${r.id}` === id)?.name ?? 'the lab'
    return name.replace(/^Dr\. /, '').split(' ')[0]
  }
  if (id.startsWith('g:')) return `${id.slice(2, 5)} vault`
  return w.nodes.find(n => n.id === id)?.label ?? id
}

interface Slot {
  g: THREE.Group
  body: THREE.Mesh
  cap: THREE.Mesh
  cap2: THREE.Mesh
  band: THREE.Mesh
  key: string
  s: [number, number, number]
}

// A lit copy of a route, drawn over the acrylic from the inside of the tube
// (back faces only, so the capsule in front of it stays white). The part already travelled is
// strong; the rest of the way is faint.
interface Trail {
  mesh: THREE.Mesh
  geo: THREE.BufferGeometry
  strong: THREE.MeshBasicMaterial
  faint: THREE.MeshBasicMaterial
  ends: number[]
  route: Route
  alpha: number
  goal: number // 0..1 how far the capsule has got this frame, -1 when idle
}
const TR = 0.21
const UP = new THREE.Vector3(0, 1, 0)
const SIDE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)

function buildTrail(r: Route): { geo: THREE.BufferGeometry; ends: number[] } {
  const parts: THREE.BufferGeometry[] = []
  const ends: number[] = []
  const q = new THREE.Quaternion()
  const d = new THREE.Vector3()
  let n = 0
  for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1]
    const b = r.pts[i]
    const g = new THREE.CylinderGeometry(TR, TR, a.distanceTo(b), 12, 1, true)
    g.applyQuaternion(q.setFromUnitVectors(UP, d.copy(b).sub(a).normalize()))
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    const gi = g.toNonIndexed()
    parts.push(gi)
    n += gi.attributes.position.count
    if (i < r.pts.length - 1) {
      const s = new THREE.SphereGeometry(TR, 12, 8).translate(b.x, b.y, b.z).toNonIndexed()
      parts.push(s)
      n += s.attributes.position.count
    }
    ends.push(n)
  }
  const geo = parts.length ? (mergeGeometries(parts, false) ?? new THREE.BufferGeometry()) : new THREE.BufferGeometry()
  geo.computeBoundingSphere()
  return { geo, ends }
}

const N = 40

export function Capsules() {
  const slots = useRef<Slot[]>([])
  const rings = useRef<THREE.Mesh[]>([])
  const parcels = useRef<THREE.Mesh[]>([])
  const trailRoot = useRef<THREE.Group>(null)
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
      trails: new Map<string, Trail>(),
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
    slots.current[i] = { g, body: mesh(CAPSULE), cap: mesh(CAP, 0.34), cap2: mesh(CAP, -0.34), band: mesh(BAND), key: '', s: [1, 1, 1] }
    g.visible = false
  }

  const dress = (s: Slot, l: Look) => {
    s.body.material = l.body
    s.cap.visible = !!l.cap
    if (l.cap) s.cap.material = l.cap
    s.cap2.visible = !!l.cap2
    if (l.cap2) s.cap2.material = l.cap2
    s.band.visible = !!l.band
    if (l.band) s.band.material = l.band
    s.s = l.s
  }

  const trailFor = (from: string, to: string) => {
    const key = `${from}>${to}`
    let tr = tmp.trails.get(key)
    if (!tr && trailRoot.current) {
      const r = route(from, to)
      const { geo, ends } = buildTrail(r)
      const strong = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide, opacity: 0 })
      const faint = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide, opacity: 0 })
      const mesh = new THREE.Mesh(geo, [strong, faint])
      mesh.frustumCulled = false
      mesh.renderOrder = 2
      trailRoot.current.add(mesh)
      tr = { mesh, geo, strong, faint, ends, route: r, alpha: 0, goal: -1 }
      tmp.trails.set(key, tr)
    }
    return tr
  }

  useFrame(({ camera, size }, dt) => {
    const now = feed.now()
    const t = clock()
    const w = feed.getWorld()
    const { pos, dir, q, spin, v, byKey, tagByKey, tagText, trails } = tmp
    const used = new Set<string>()
    const tagsUsed = new Set<string>()
    // read better from across the room: capsules grow a little when the camera is far
    const boost = Math.min(1.25, Math.max(1, camera.position.z / 46))
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
      s.g.scale.set(s.s[0] * boost, s.s[1] * boost, s.s[2] * boost)
      return s
    }
    const orient = (s: Slot, d: THREE.Vector3, turn = 0) => {
      q.setFromUnitVectors(UP, d)
      if (turn) q.multiply(spin.setFromAxisAngle(UP, turn))
      s.g.quaternion.copy(q)
    }
    const tag = (key: string, p: Packet, tone: string, at: THREE.Vector3) => {
      let i = tagByKey.get(key)
      if (i === undefined) {
        for (let k = 0; k < TAGS; k++)
          if (!tagText[k]) {
            i = k
            break
          }
        if (i === undefined) return
        tagByKey.set(key, i)
        tagText[i] = key
        const el = tagEls[i]
        if (el) {
          const [b, r] = el.children
          if (b) b.textContent = p.label
          if (r) r.textContent = ` → ${placeName(p.to, w)}`
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

    for (const tr of trails.values()) tr.goal = -1

    // In flight
    for (const p of w.packets) {
      const look = lookOf(p)
      const pr = progress(p, now)
      const e = look.ease(pr)
      const tr = trailFor(p.from, p.to)
      if (tr) {
        tr.goal = Math.max(tr.goal, e)
        tr.strong.color.set(TRAIL[look.tone] ?? C.ink)
        tr.faint.color.copy(tr.strong.color)
      }
      const s = claim(p.id, look)
      if (!s) continue
      route(p.from, p.to).at(e, pos, dir)
      s.g.position.copy(pos)
      orient(s, dir, look.spin * pr * Math.PI * 2)
      if (look.tag) tag(p.id, p, look.tone, pos)
    }

    // Lit tubes: fill behind the capsule, fade once it lands
    for (const tr of trails.values()) {
      const on = tr.goal >= 0
      tr.alpha = on ? Math.min(1, tr.alpha + dt * 6) : Math.max(0, tr.alpha - dt * 1.6)
      tr.mesh.visible = tr.alpha > 0.01
      if (!tr.mesh.visible) continue
      const total = tr.ends[tr.ends.length - 1] ?? 0
      let count = total
      if (on) {
        const d = tr.goal * tr.route.len
        let k = 0
        while (k < tr.ends.length - 1 && tr.route.cum[k + 1] < d) k++
        count = tr.ends[k] ?? total
      }
      tr.geo.clearGroups()
      tr.geo.addGroup(0, count, 0)
      if (count < total) tr.geo.addGroup(count, total - count, 1)
      tr.strong.opacity = 0.72 * tr.alpha
      tr.faint.opacity = 0.16 * tr.alpha
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
        s.g.scale.multiplyScalar(1 - sm(0.15, 0.45, age))
        orient(s, dir)
      } else if (e.kind === 'refine' && age < 1.1) {
        const s = claim(e.key, lookOf(p))
        if (!s) continue
        const back = Math.sin(Math.min(1, age / 1.1) * Math.PI) * 0.9
        s.g.position.copy(end).addScaledVector(dir, -back).setZ(end.z + z)
        orient(s, dir, age * 14)
      } else if (e.kind === 'reject' && age < 1.4) {
        const s = claim(e.key, lookOf(p))
        if (!s) continue
        const shake = age < 0.5 ? Math.sin(age * 90) * 0.1 * (1 - age / 0.5) : 0
        const fall = sm(0.5, 1.4, age)
        s.g.position.set(end.x + shake, end.y - fall * fall * 1.1, end.z + z + fall * 0.5)
        s.g.scale.multiplyScalar(1 - fall * 0.6)
        orient(s, dir, fall * 2)
      }
    }

    // Held answers wait in a clip beside the terminal. Read from the world,
    // so a jump into the middle of the story shows them too.
    const flying = new Set<string>()
    for (const p of w.packets) if (p.kind === 'verdict' && p.refId) flying.add(p.refId)
    const perNode = new Map<string, number>()
    for (const r of w.requests) {
      const held = r.state === 'waiting_on_manager' || (r.state === 'submitted' && r.outcome === 'hold')
      if (!held || flying.has(r.id)) continue
      const node = `r:${r.researcherId}`
      const k = perNode.get(node) ?? 0
      perNode.set(node, k + 1)
      if (k > 3) continue
      const s = claim(`park-${r.id}`, HELD)
      if (!s) continue
      const a = terminalOf(node)
      s.g.position.set(a.x + 0.55 + k * 0.42, a.y - 0.12, a.z + 0.36 + (pull[node] ?? 0))
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
        m.position.set(a.x, a.y, a.z + 0.4 + (pull[e.node] ?? 0))
        m.scale.setScalar((0.9 + age * 2.6) * boost)
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
    <group>
      <group ref={trailRoot} />
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
          <ringGeometry args={[0.2, 0.28, 40]} />
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
