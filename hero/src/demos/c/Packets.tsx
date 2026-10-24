// Every packet in flight, drawn as a light trail along its route, plus the
// moment it lands. Rendered imperatively from feed.getWorld().packets so the
// React tree never re-renders on world changes.

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { feed, progress, useFlow, type Packet } from '../../feed'
import { arc, climb, descent, grantPath, MESAS, nodeGround, nodePos, sideOf } from './layout'
import { overlay, pulse, ui } from './store'
import { glowTexture, trailMaterial } from './terrainMaterial'
import { TONE } from './words'

type Form = 'ribbon' | 'detour' | 'ember' | 'lantern' | 'signal' | 'coin' | 'water' | 'paper'

interface Look {
  form: Form
  tone: [number, number, number]
  radius: number
  len: number
  dash?: number
  flow?: number
  head: number
  alpha?: number
  label?: string
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
/** Move, pause, move, pause: a held answer walks home hesitantly. */
const stopAndGo = (t: number) => {
  const n = 4
  const x = Math.min(0.9999, t) * n
  const k = Math.floor(x)
  return t >= 1 ? 1 : (k + easeInOut(Math.min(1, (x - k) / 0.6))) / n
}

function lookFor(p: Packet, mine: boolean): Look {
  const you = mine ? 'Your request · ' : ''
  switch (p.kind) {
    case 'request':
      return { form: 'ribbon', tone: TONE.request, radius: 0.05, len: 0.32, head: 0.95, label: `${you}${p.label}` }
    case 'pushback':
      return { form: 'ribbon', tone: TONE.request, radius: 0.04, len: 0.25, head: 0.85, dash: 90, label: `Pushback: ${p.label}` }
    case 'verdict': {
      const label = `${mine ? 'Your answer · ' : ''}${p.label}`
      if (p.outcome === 'accept') return { form: 'ribbon', tone: TONE.accept, radius: 0.09, len: 0.62, head: 1.35, label }
      if (p.outcome === 'refine') return { form: 'detour', tone: TONE.refine, radius: 0.06, len: 0.7, head: 1.05, dash: 80, label }
      if (p.outcome === 'reject') return { form: 'ember', tone: TONE.reject, radius: 0.03, len: 0.06, head: 0.75, label }
      return { form: 'lantern', tone: TONE.hold, radius: 0.035, len: 0.14, head: 1.7, label }
    }
    case 'hold':
      return { form: 'lantern', tone: TONE.hold, radius: 0.03, len: 0.3, head: 1.2, label: 'To the grant manager' }
    case 'decision':
      return { form: 'ribbon', tone: p.outcome === 'reject' ? TONE.reject : TONE.accept, radius: 0.045, len: 0.5, head: 1.0, label: `Grant manager: ${p.label}` }
    case 'recheck':
      return { form: 'signal', tone: [1.2, 0.95, 0.65], radius: 0.026, len: 0.45, head: 0.6 }
    case 'reading': {
      const news = !p.label.endsWith('no change')
      return { form: 'signal', tone: news ? TONE.cold : TONE.signal, radius: news ? 0.05 : 0.02, len: news ? 0.5 : 0.4, head: news ? 1.2 : 0.55, alpha: news ? 1 : 0.7, label: news ? p.label : undefined }
    }
    case 'payment':
      return { form: 'water', tone: TONE.water, radius: 0.08, len: 0.55, flow: 70, head: 1.4, label: p.label }
    case 'charge':
      return { form: 'coin', tone: TONE.coin, radius: 0.04, len: 0.45, dash: 140, head: 0.7 }
    case 'invoice':
      return { form: 'paper', tone: TONE.paper, radius: 0.035, len: 0.35, head: 0.8, label: `Invoice · ${p.label}` }
    case 'paper':
      return { form: 'paper', tone: TONE.paper, radius: 0.035, len: 0.35, head: 0.8, label: `Paper · ${p.label}` }
    case 'payment_request':
      return { form: 'coin', tone: TONE.coin, radius: 0.05, len: 0.5, head: 1.0, label: p.label }
    case 'follow_up':
      return { form: 'paper', tone: TONE.paper, radius: 0.035, len: 0.35, head: 0.8, label: `NIH asks: ${p.label}` }
    default:
      return { form: 'signal', tone: TONE.signal, radius: 0.03, len: 0.4, head: 0.6 }
  }
}

function routeFor(p: Packet): THREE.Vector3[] {
  const rFrom = p.from.startsWith('r:') ? p.from.slice(2) : null
  const rTo = p.to.startsWith('r:') ? p.to.slice(2) : null
  if (rFrom && p.to === 'a:purchasing') return climb(rFrom)
  if (rTo && p.from === 'a:purchasing') {
    const req = p.refId ? feed.getWorld().requests.find(r => r.id === p.refId) : undefined
    return descent(rTo, p.outcome, sideOf(req?.chargedGrantId))
  }
  if (p.id.startsWith('local-cold') && p.to.startsWith('g:')) {
    const i = MESAS.findIndex(m => `g:${m.id}` === p.to)
    if (i >= 0) return grantPath(i)
  }
  const a = nodePos(p.from)
  const b = nodePos(p.to)
  const far = p.from.startsWith('s:') || p.to === 'p:funder' || p.from === 'p:funder'
  return arc(a, b, far ? 0.1 : 0.2, far ? 60 : 40)
}

interface Live {
  p: Packet
  look: Look
  curve: THREE.CatmullRomCurve3
  trail: THREE.Mesh<THREE.TubeGeometry, THREE.ShaderMaterial>
  head: THREE.Sprite
  core?: THREE.Mesh
  doneAt: number
  label?: HTMLDivElement
}

const coreGeo = new THREE.IcosahedronGeometry(0.11, 0)
const lanternGeo = new THREE.SphereGeometry(0.12, 14, 10)

export function Packets() {
  const group = useRef<THREE.Group>(null)
  const live = useRef(new Map<string, Live>())
  const local = useRef<Packet[]>([])
  const n = useRef(0)
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])

  const drop = (l: Live) => {
    group.current?.remove(l.trail, l.head)
    if (l.core) group.current?.remove(l.core)
    l.trail.geometry.dispose()
    l.trail.material.dispose()
    ;(l.head.material as THREE.SpriteMaterial).dispose()
    l.label?.remove()
  }

  const make = (p: Packet): Live => {
    const look = lookFor(p, !!p.refId && ui.get().mine.includes(p.refId))
    const pts = routeFor(p)
    const curve = new THREE.CatmullRomCurve3(pts)
    const segs = Math.min(220, Math.max(48, Math.round(curve.getLength() * 6)))
    const mat = trailMaterial(new THREE.Color(...look.tone), { dash: look.dash, flow: look.flow, len: look.len, alpha: look.alpha })
    const trail = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, look.radius, 5, false), mat)
    trail.frustumCulled = false
    const head = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(...look.tone), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
    )
    head.scale.setScalar(look.head)
    let core: THREE.Mesh | undefined
    if (look.form === 'ember') core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.3, 0.15), toneMapped: false }))
    if (look.form === 'lantern') core = new THREE.Mesh(lanternGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 2.8), toneMapped: false }))
    group.current?.add(trail, head)
    if (core) group.current?.add(core)
    let label: HTMLDivElement | undefined
    if (look.label && overlay.el) {
      label = document.createElement('div')
      label.className = `c-plabel is-${p.kind === 'verdict' ? (p.outcome ?? 'accept') : look.form}`
      label.textContent = look.label
      overlay.el.appendChild(label)
    }
    pulse(p.from, look.tone)
    return { p, look, curve, trail, head, core, doneAt: 0, label }
  }

  useFlow(e => {
    if (e.type === 'reset') {
      live.current.forEach(drop)
      live.current.clear()
      local.current = []
      return
    }
    if (e.type === 'grant' && e.event?.kind === 'canceled') {
      // The freeze order: a cold line from the bookkeeping agent onto the landform.
      local.current.push({ id: `local-cold-${n.current++}`, kind: 'reading', from: 'a:bookkeeping', to: `g:${e.grant.id}`, label: 'Freeze spending', sentAt: feed.now(), ms: 1600 })
    }
    if (e.type === 'arrive') impact(e.packet)
  })

  useEffect(
    () => () => {
      live.current.forEach(drop)
      live.current.clear()
    },
    [],
  )

  useFrame(state => {
    const w = feed.getWorld()
    const now = feed.now()
    const t = state.clock.elapsedTime
    const real = performance.now()
    const seen = new Set<string>()
    const all = local.current.length ? [...w.packets, ...local.current] : w.packets
    for (const p of all) {
      seen.add(p.id)
      let l = live.current.get(p.id)
      if (!l) {
        l = make(p)
        live.current.set(p.id, l)
      }
      const raw = progress(p, now)
      const e = l.look.form === 'lantern' ? stopAndGo(raw) : l.look.form === 'ember' ? raw : easeInOut(raw)
      place(l, e, t, 1)
      if (p.id.startsWith('local-') && raw >= 1) {
        local.current = local.current.filter(x => x.id !== p.id)
        impact({ ...p, kind: 'reading', label: 'Freeze spending' }, TONE.cold)
      }
    }
    for (const [id, l] of live.current) {
      if (seen.has(id)) continue
      if (!l.doneAt) l.doneAt = real
      const k = (real - l.doneAt) / 600
      if (k >= 1) {
        drop(l)
        live.current.delete(id)
        continue
      }
      place(l, 1 + k * l.look.len, t, 1 - k)
    }
  })

  const place = (l: Live, e: number, t: number, fade: number) => {
    const head = Math.min(1, e)
    l.curve.getPointAt(head, v)
    l.trail.material.uniforms.uHead.value = e
    l.trail.material.uniforms.uTime.value = t
    l.head.position.copy(v)
    const sm = l.head.material as THREE.SpriteMaterial
    sm.opacity = fade
    let s = l.look.head
    if (l.look.form === 'ember') s *= 0.8 + 0.4 * Math.abs(Math.sin(t * 23 + l.p.sentAt))
    if (l.look.form === 'lantern') s *= 0.9 + 0.2 * Math.sin(t * 4)
    l.head.scale.setScalar(s * (0.5 + 0.5 * fade))
    if (l.core) {
      l.core.position.copy(v)
      l.core.rotation.set(t * 7, t * 5, 0)
      l.core.visible = fade > 0.3
    }
    if (l.label) {
      v.project(camera)
      const hidden = v.z > 1 || fade < 0.5
      l.label.style.opacity = hidden ? '0' : '1'
      l.label.style.transform = `translate3d(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px, 0)`
    }
  }

  // Arrival moments: a ring on the ground and a flash at the place that received it.
  const rings = useMemo(
    () =>
      Array.from({ length: 24 }, () => {
        const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide })
        const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 64), mat)
        mesh.rotation.x = -Math.PI / 2
        mesh.visible = false
        return { mesh, mat, t0: 0, dur: 1, s0: 0.3, s1: 2 }
      }),
    [],
  )
  const columns = useMemo(
    () =>
      Array.from({ length: 6 }, () => {
        const mat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
          side: THREE.DoubleSide,
          uniforms: { uColor: { value: new THREE.Color() }, uK: { value: 0 } },
          vertexShader: `varying float vH; void main(){ vH = position.y / 4.0 + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `uniform vec3 uColor; uniform float uK; varying float vH; void main(){ float a = pow(1.0 - vH, 1.6) * uK; gl_FragColor = vec4(uColor * a, a); }`,
        })
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 4, 24, 1, true), mat)
        mesh.visible = false
        return { mesh, mat, t0: 0 }
      }),
    [],
  )
  const ri = useRef(0)
  const ci = useRef(0)

  const ring = (at: THREE.Vector3, tone: [number, number, number], s1: number, dur: number, delay = 0) => {
    const r = rings[ri.current++ % rings.length]
    r.mesh.position.copy(at)
    r.mat.color.setRGB(...tone)
    r.t0 = performance.now() + delay
    r.dur = dur
    r.s1 = s1
    r.mesh.visible = true
  }

  const impact = (p: Packet, override?: [number, number, number]) => {
    const look = lookFor(p, false)
    const tone = override ?? look.tone
    const at = nodeGround(p.to)
    pulse(p.to, tone)
    if (p.kind === 'reading' && !look.label && !override) return ring(at, tone, 0.9, 700)
    if (p.kind === 'verdict') {
      if (p.outcome === 'reject') {
        ring(at, tone, 1.6, 700)
        ring(at, tone, 2.4, 900, 160)
        return
      }
      ring(at, tone, p.outcome === 'accept' ? 3.2 : 2.4, 1300)
      if (p.outcome === 'accept' || p.outcome === 'refine') {
        const c = columns[ci.current++ % columns.length]
        c.mesh.position.set(at.x, at.y + 2, at.z)
        c.mat.uniforms.uColor.value.setRGB(...tone)
        c.t0 = performance.now()
        c.mesh.visible = true
      }
      return
    }
    ring(at, tone, p.kind === 'payment' || override ? 3 : 1.6, 1100)
  }

  useFrame(() => {
    const now = performance.now()
    for (const r of rings) {
      if (!r.mesh.visible) continue
      const k = (now - r.t0) / r.dur
      if (k < 0) {
        r.mat.opacity = 0
        continue
      }
      if (k >= 1) {
        r.mesh.visible = false
        continue
      }
      const e = 1 - (1 - k) ** 3
      r.mesh.scale.setScalar(r.s0 + (r.s1 - r.s0) * e)
      r.mat.opacity = (1 - k) * 0.9
    }
    for (const c of columns) {
      if (!c.mesh.visible) continue
      const k = (now - c.t0) / 1400
      if (k >= 1) {
        c.mesh.visible = false
        continue
      }
      c.mat.uniforms.uK.value = (1 - k) * (k < 0.1 ? k / 0.1 : 1) * 0.9
      c.mesh.scale.set(1 - k * 0.4, 1 + k * 0.5, 1 - k * 0.4)
    }
  })

  return (
    <>
      <group ref={group} />
      {rings.map((r, i) => (
        <primitive key={`r${i}`} object={r.mesh} />
      ))}
      {columns.map((c, i) => (
        <primitive key={`c${i}`} object={c.mesh} />
      ))}
    </>
  )
}
