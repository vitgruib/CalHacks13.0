import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { feed, progress, usd, useFlow, type Grant, type Packet } from '../../feed'
import { INK, OCCLUDER, PICK, Pen, hair, ink, reshape, setReveal, shadowHatch, type InkLine, type V3 } from './ink'
import { RULE_SLOTS, ROOM, VAULT, buildRoom, type Model, type Occ } from './models'
import { LAB_IDS, LINKS, MODELS, MODEL_BY_ID, centreOf, portOf, route } from './routes'
import { el, mine, overlay, stage, ui } from './store'
import { slipKey, slipSize, slipTexture } from './slips'
import { landStamp } from './stamps'

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const now = () => performance.now() / 1000

// Intro timeline (seconds): the plan draws itself, then rises into a model.
const T = { tilt0: 1.5, tilt1: 4.4 }
const revealAt = (x: number) => 0.15 + ((x + 16) / 34) * 2.1

/** Last arrival per node, so drums and wheels turn when something lands. */
const kicks = new Map<string, number>()
const partGroups = new Map<string, THREE.Group[]>()

const BOX = new THREE.BoxGeometry(1, 1, 1)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 24)

function occluder(o: Occ) {
  const m = new THREE.Mesh(o.kind === 'box' ? BOX : CYL, OCCLUDER)
  if (o.kind === 'box') {
    m.scale.set(Math.max(0.01, o.s[0]), Math.max(0.01, o.s[1]), Math.max(0.01, o.s[2]))
    m.position.set(o.c[0], o.c[1] + o.s[1] / 2, o.c[2])
  } else {
    m.scale.set(o.r, o.h, o.r)
    m.position.set(o.c[0], o.c[1] + o.h / 2, o.c[2])
  }
  return m
}

// ── The camera ─────────────────────────────────────────────────────────────

interface Controls {
  target: THREE.Vector3
  enabled: boolean
  update(): boolean
  addEventListener(t: string, f: () => void): void
  removeEventListener(t: string, f: () => void): void
}

export function viewFor(aspect: number) {
  if (aspect < 0.8) return { target: new THREE.Vector3(7, 0, -0.5), r: 60, polar: 0.95, az: -1.4, fov: 46 }
  return { target: new THREE.Vector3(-0.3, 0, -4.3), r: 45, polar: 0.98, az: -0.18, fov: 30 }
}

const place = (v: THREE.Vector3, t: THREE.Vector3, r: number, polar: number, az: number) =>
  v.set(t.x + r * Math.sin(polar) * Math.sin(az), t.y + r * Math.cos(polar), t.z + r * Math.sin(polar) * Math.cos(az))

function Rig() {
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera
  const size = useThree(s => s.size)
  const controls = useThree(s => s.controls) as unknown as Controls | null
  const t0 = useRef(-1)
  const focus = useRef<{ target: THREE.Vector3; r: number } | null>(null)
  const last = useRef<string | null>(null)

  useEffect(
    () =>
      ui.subscribe(() => {
        const sel = ui.get().selected
        if (sel === last.current) return
        last.current = sel
        const m = sel ? MODEL_BY_ID.get(sel) : undefined
        const view = viewFor(size.width / size.height)
        focus.current = m ? { target: new THREE.Vector3(m.at[0], 0.9, m.at[1]), r: size.width < 700 ? 30 : 21 } : sel === null ? { target: view.target.clone(), r: view.r } : null
      }),
    [size],
  )

  useEffect(() => {
    if (!controls) return
    const stop = () => (focus.current = null)
    controls.addEventListener('start', stop)
    return () => controls.removeEventListener('start', stop)
  }, [controls])

  useFrame((state, dt) => {
    const view = viewFor(size.width / size.height)
    if (camera.fov !== view.fov) {
      camera.fov = view.fov
      camera.updateProjectionMatrix()
    }
    if (!stage.introDone) {
      if (t0.current < 0) t0.current = state.clock.elapsedTime
      const t = stage.reduced ? 99 : state.clock.elapsedTime - t0.current
      const k = ease(clamp((t - T.tilt0) / (T.tilt1 - T.tilt0)))
      stage.yScale = 0.02 + 0.98 * k
      place(camera.position, view.target, THREE.MathUtils.lerp(56, view.r, k), THREE.MathUtils.lerp(0.03, view.polar, k), THREE.MathUtils.lerp(view.az + 0.35, view.az, k))
      camera.lookAt(view.target)
      if (controls) {
        controls.target.copy(view.target)
        controls.enabled = false
      }
      if (t >= T.tilt1) {
        stage.introDone = true
        stage.yScale = 1
        if (controls) {
          controls.enabled = true
          controls.update()
        }
      }
      overlay.update(camera, size.width, size.height)
      return
    }
    if (controls && focus.current) {
      const f = focus.current
      const a = stage.reduced ? 1 : 1 - Math.exp(-dt * 3.5)
      const off = camera.position.clone().sub(controls.target)
      controls.target.lerp(f.target, a)
      const len = THREE.MathUtils.lerp(off.length(), f.r, a)
      camera.position.copy(controls.target).add(off.setLength(len))
      if (controls.target.distanceTo(f.target) < 0.02 && Math.abs(len - f.r) < 0.05) focus.current = null
    }
    if (controls) {
      const tg = controls.target
      tg.set(clamp(tg.x, -14, 16), clamp(tg.y, 0, 3), clamp(tg.z, -8, 8))
    }
    overlay.update(camera, size.width, size.height)
  })

  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={11}
      maxDistance={66}
      minPolarAngle={0.08}
      maxPolarAngle={1.32}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      panSpeed={0.7}
      screenSpacePanning={false}
    />
  )
}

// ── The sheet: grid, border, lanes, wiring, room, hatched shadows ──────────

function Sheet() {
  const objs = useMemo(() => {
    const grid = new Pen()
    const major = new Pen()
    const X0 = -17.5
    const X1 = 19
    const Z0 = -9.5
    const Z1 = 8.5
    for (let x = Math.ceil(X0); x <= X1; x++) (x % 5 === 0 ? major : grid).seg([x, 0, Z0], [x, 0, Z1])
    for (let z = Math.ceil(Z0); z <= Z1; z++) (z % 5 === 0 ? major : grid).seg([X0, 0, z], [X1, 0, z])
    const border = new Pen()
    border.poly([[X0, 0.01, Z0], [X1, 0.01, Z0], [X1, 0.01, Z1], [X0, 0.01, Z1]], true)
    const inner = new Pen()
    const m = 0.45
    inner.poly([[X0 + m, 0.01, Z0 + m], [X1 - m, 0.01, Z0 + m], [X1 - m, 0.01, Z1 - m], [X0 + m, 0.01, Z1 - m]], true)
    for (let x = X0 + 3; x < X1; x += 3) inner.seg([x, 0.01, Z0], [x, 0.01, Z0 + m]).seg([x, 0.01, Z1], [x, 0.01, Z1 - m])
    for (let z = Z0 + 3; z < Z1; z += 3) inner.seg([X0, 0.01, z], [X0 + m, 0.01, z]).seg([X1, 0.01, z], [X1 - m, 0.01, z])
    const lanes = new Pen()
    for (const rid of LAB_IDS) {
      for (const r of [route(rid, 'a:purchasing'), route('a:purchasing', rid)]) {
        const g = r.ground
        for (let i = 0; i < g.length - 1; i++) lanes.seg([g[i].x, 0.015, g[i].z], [g[i + 1].x, 0.015, g[i + 1].z])
      }
    }
    const links = new Pen()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    for (const [f, t] of LINKS) {
      centreOf(f, a)
      centreOf(t, b)
      links.seg([a.x, 0.015, a.z], [b.x, 0.015, b.z])
    }
    const bed = new Pen()
    bed.poly([[-1.8, 0.012, -5.4], [16.4, 0.012, -5.4], [16.4, 0.012, 7.4], [-1.8, 0.012, 7.4]], true)
    bed.seg([-2.4, 0.012, -6.2], [18.4, 0.012, -6.2])
    const shadows = new Pen()
    for (const md of MODELS) {
      for (const s of md.shadows) {
        const foot = s.foot.map(p => [p[0] + md.at[0], p[1] + md.at[1]] as [number, number])
        shadowHatch(shadows, foot, s.h)
      }
    }
    const room = buildRoom()
    const roomGroup = new THREE.Group()
    const roomInk = ink(room.main, 1.8, INK.chalk, 0.95)
    const roomFine = ink(room.fine, 1.0, INK.fine, 0.6)
    roomGroup.add(roomInk, roomFine)
    for (const o of room.occ) roomGroup.add(occluder(o))
    const borderInk = ink(border, 2.2, INK.chalk, 0.85)
    return {
      grid: hair(grid, INK.fine, 0.1),
      major: hair(major, INK.fine, 0.2),
      inner: hair(inner, INK.fine, 0.45),
      lanes: hair(lanes, INK.chalk, 0.42, [0.22, 0.14]),
      links: hair(links, INK.fine, 0.32, [0.14, 0.18]),
      bed: hair(bed, INK.fine, 0.4, [0.5, 0.2]),
      shadows: hair(shadows, INK.fine, 0.28),
      borderInk,
      roomGroup,
      reveal: [roomInk, roomFine, borderInk] as InkLine[],
    }
  }, [])

  const group = useRef<THREE.Group>(null)
  const room = useRef<THREE.Group>(null)
  const t0 = useRef(-1)
  useFrame(state => {
    if (t0.current < 0) t0.current = state.clock.elapsedTime
    const t = stage.reduced ? 99 : state.clock.elapsedTime - t0.current
    if (t > 8) return
    const f = clamp(t / 1.2)
    ;(objs.grid.material as THREE.LineBasicMaterial).opacity = 0.1 * f
    ;(objs.major.material as THREE.LineBasicMaterial).opacity = 0.2 * f
    ;(objs.shadows.material as THREE.LineBasicMaterial).opacity = 0.28 * clamp((t - 2.2) / 1.6)
    ;(objs.lanes.material as THREE.LineBasicMaterial).opacity = 0.42 * clamp((t - 1.0) / 1.2)
    ;(objs.links.material as THREE.LineBasicMaterial).opacity = 0.32 * clamp((t - 1.8) / 1.2)
    setReveal(objs.borderInk, t / 1.4)
    setReveal(objs.reveal[0], (t - 0.2) / 1.1)
    setReveal(objs.reveal[1], (t - 0.8) / 1.1)
    if (room.current) room.current.scale.y = stage.yScale
  })

  useEffect(() => {
    const zones = [
      { text: 'Ortiz Lab: five researchers', at: new THREE.Vector3(ROOM.x0 + 0.2, 0, ROOM.z1 + 0.75) },
      { text: 'Grant office: three AI agents, one grant manager', at: new THREE.Vector3(-1.6, 0, 7.95) },
      { text: 'Outside sources', at: new THREE.Vector3(-2.6, 0, -7.4) },
    ]
    const anchors = zones.map(z => overlay.add(el('div', 'dd-zone', z.text), () => z.at))
    return () => anchors.forEach(a => overlay.remove(a))
  }, [])

  return (
    <group ref={group}>
      <primitive object={objs.grid} />
      <primitive object={objs.major} />
      <primitive object={objs.inner} />
      <primitive object={objs.borderInk} />
      <primitive object={objs.lanes} />
      <primitive object={objs.links} />
      <primitive object={objs.bed} />
      <primitive object={objs.shadows} />
      <group ref={room}>
        <primitive object={objs.roomGroup} />
      </group>
    </group>
  )
}

// ── One drafted component ──────────────────────────────────────────────────

function buildModel(m: Model) {
  const group = new THREE.Group()
  group.position.set(m.at[0], 0, m.at[1])
  const parts: { g: THREE.Group; inner: THREE.Group; explode: V3; anim?: string; call?: string }[] = []
  const lines: { l: InkLine; at: number }[] = []
  const sils: { g: THREE.Group; c: V3 }[] = []
  const t0 = revealAt(m.at[0])
  m.parts.forEach((part, i) => {
    const g = new THREE.Group()
    const inner = new THREE.Group()
    if (part.pivot) inner.position.set(...part.pivot)
    g.add(inner)
    const main = ink(part.main, 1.7, INK.chalk, 0.96)
    inner.add(main)
    lines.push({ l: main, at: t0 + i * 0.12 })
    if (part.fine && part.fine.pts.length) {
      const f = ink(part.fine, 1.05, INK.fine, 0.75)
      inner.add(f)
      lines.push({ l: f, at: t0 + 0.35 + i * 0.12 })
    }
    for (const o of part.occ ?? []) inner.add(occluder(o))
    for (const s of part.sil ?? []) {
      const sg = new THREE.Group()
      sg.position.set(s.c[0], s.c[1], s.c[2])
      const p = new Pen()
      p.seg([-s.r, 0, 0], [-s.r, s.h, 0]).seg([s.r, 0, 0], [s.r, s.h, 0])
      const l = ink(p, 1.7, INK.chalk, 0.96)
      sg.add(l)
      lines.push({ l, at: t0 + 0.2 })
      inner.add(sg)
      sils.push({ g: sg, c: s.c })
    }
    group.add(g)
    parts.push({ g, inner, explode: part.explode ?? [0, 0, 0], anim: part.anim, call: part.call })
  })
  const pick = new THREE.Mesh(BOX, PICK)
  pick.scale.set(...m.hit.s)
  pick.position.set(m.hit.c[0], m.hit.c[1] + m.hit.s[1] / 2, m.hit.c[2])
  group.add(pick)
  return { group, parts, lines, sils }
}

function nodeTag(m: Model) {
  const w = feed.getWorld()
  const node = w.nodes.find(n => n.id === m.id)
  const tag = el('div', `dd-tag dd-tag-${node?.kind ?? 'x'}`)
  if (m.id.startsWith('s:')) {
    const i = ['s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments'].indexOf(m.id)
    tag.classList.add('dd-tb')
    tag.style.setProperty('--lead', i % 2 ? '50px' : '10px')
    tag.append(el('span', 'dd-tb-k', `S-${i + 1}`), el('span', 'dd-tb-v', node?.label ?? m.id))
    if (node?.sub) tag.append(el('span', 'dd-tb-s', node.sub.replace(' scraper', '')))
    return { tag, task: null as HTMLElement | null }
  }
  if (m.id.startsWith('r:')) {
    const r = w.researchers.find(x => `r:${x.id}` === m.id)
    tag.append(el('b', 'dd-tag-name', r?.name ?? node?.label ?? m.id), el('span', 'dd-tag-sub', r?.role ?? ''))
    const task = el('span', 'dd-tag-task', r?.task ?? '')
    tag.append(task)
    return { tag, task }
  }
  if (m.id === 'p:grant_manager') {
    tag.append(el('b', 'dd-tag-name', 'Grant manager'), el('span', 'dd-tag-sub', 'The only human who approves. In this demo: you.'))
    return { tag, task: null }
  }
  tag.append(el('b', 'dd-tag-name', node?.label ?? m.id))
  if (node?.sub) tag.append(el('span', 'dd-tag-sub', node.sub))
  return { tag, task: null }
}

function ModelView({ m }: { m: Model }) {
  const camera = useThree(s => s.camera)
  const built = useMemo(() => buildModel(m), [m])
  const flash = useRef(0)
  const lastState = useRef('')
  const revealed = useRef(false)
  const tagRef = useRef<HTMLElement | null>(null)
  const phase = useMemo(() => Math.random() * 6, [])
  const isGrant = m.id.startsWith('g:')

  useEffect(() => {
    partGroups.set(m.id, built.parts.map(p => p.g))
    const anchors: ReturnType<typeof overlay.add>[] = []
    const tmp = new THREE.Vector3()
    let task: HTMLElement | null = null
    if (!isGrant) {
      const t = nodeTag(m)
      task = t.task
      const local = new THREE.Vector3(...m.label)
      const tagEl = t.tag
      tagEl.dataset.id = m.id
      tagRef.current = tagEl
      anchors.push(overlay.add(tagEl, () => built.group.localToWorld(tmp.copy(local).setY(local.y * stage.yScale))))
    }
    built.parts.forEach(p => {
      if (!p.call) return
      const c = el('div', 'dd-callout', p.call)
      c.dataset.for = m.id
      const v = new THREE.Vector3()
      anchors.push(overlay.add(c, () => (ui.get().selected === m.id ? p.g.localToWorld(v.set(0, 0, 0).add(p.inner.position)).add(new THREE.Vector3(0, 0.4, 0)) : null)))
    })
    const off = feed.on(e => {
      if (!task) return
      const rid = m.id.slice(2)
      if (e.type === 'task' && e.researcherId === rid) {
        task.textContent = e.task
        flash.current = now() + 3.2
      } else if ((e.type === 'packet' && e.packet.from === m.id) || (e.type === 'arrive' && e.packet.to === m.id)) {
        flash.current = now() + 4
      } else if (e.type === 'reset') {
        task.textContent = feed.getWorld().researchers.find(r => r.id === rid)?.task ?? ''
      }
    })
    return () => {
      off()
      anchors.forEach(a => overlay.remove(a))
      partGroups.delete(m.id)
    }
  }, [built, m, isGrant])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    if (!revealed.current) {
      let all = true
      for (const { l, at } of built.lines) {
        const f = stage.reduced ? 1 : (t - at) / 0.9
        setReveal(l, f)
        if (f < 1) all = false
      }
      revealed.current = all
    }
    built.group.scale.y = stage.yScale
    const { selected, hovered } = ui.get()
    const on = selected === m.id
    const hot = on || hovered === m.id
    const dim = selected !== null && !on
    const dist = camera.position.distanceTo(built.group.position)
    const k = clamp(32 / dist, 0.55, 1.9) * (hot ? 1.45 : 1)
    for (const { l } of built.lines) {
      l.material.linewidth = l.userData.width * k
      l.material.opacity = l.userData.opacity * (dim ? 0.32 : 1)
      if (hot) l.material.color.set('#ffffff')
      else l.material.color.set(l.userData.width > 1.5 ? INK.chalk : INK.fine)
    }
    const a = stage.reduced ? 1 : 1 - Math.exp(-dt * 5)
    for (const p of built.parts) {
      const tx = on ? p.explode[0] : 0
      const ty = on ? p.explode[1] : 0
      const tz = on ? p.explode[2] : 0
      p.g.position.x += (tx - p.g.position.x) * a
      p.g.position.y += (ty - p.g.position.y) * a
      p.g.position.z += (tz - p.g.position.z) * a
      if (stage.reduced) continue
      if (p.anim === 'arm') p.inner.rotation.x = -0.2 + Math.sin(t * 2.1 + phase) * 0.26
      else if (p.anim === 'drum' || p.anim === 'wheel') {
        const kick = kicks.get(m.id) ?? -10
        const spin = Math.max(0, 1 - (feed.now() - kick) / 1400) * 6 + 0.25
        if (p.anim === 'drum') p.inner.rotation.x += dt * spin
        else p.inner.rotation.y += dt * spin * 0.6
      }
    }
    for (const s of built.sils) {
      const dx = m.at[0] + s.c[0] - camera.position.x
      const dz = m.at[1] + s.c[2] - camera.position.z
      s.g.rotation.y = Math.atan2(dx, dz)
    }
    const tagState = `${hot ? 1 : 0}${flash.current > now() ? 1 : 0}${dim ? 1 : 0}`
    if (tagState !== lastState.current) {
      lastState.current = tagState
      const e = tagRef.current
      if (e) {
        e.dataset.open = hot || flash.current > now() ? '1' : '0'
        e.dataset.dim = dim ? '1' : '0'
        e.dataset.hot = hot ? '1' : '0'
      }
    }
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    ui.set({ hovered: m.id })
    document.body.style.cursor = 'pointer'
  }
  const out = () => {
    if (ui.get().hovered === m.id) ui.set({ hovered: null })
    document.body.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    ui.set({ selected: m.id })
  }

  return <primitive object={built.group} onPointerOver={over} onPointerOut={out} onClick={click} />
}

// ── Rule panel on the purchasing agent ─────────────────────────────────────

function markPen(kind: 'check' | 'cross', s: (typeof RULE_SLOTS)[number]) {
  const p = new Pen()
  const h = s.s / 2
  if (kind === 'check') p.poly([[s.x - h * 0.6, s.y, s.z + 0.01], [s.x - h * 0.1, s.y - h * 0.55, s.z + 0.01], [s.x + h * 0.85, s.y + h * 0.75, s.z + 0.01]])
  else p.seg([s.x - h * 0.7, s.y - h * 0.7, s.z + 0.01], [s.x + h * 0.7, s.y + h * 0.7, s.z + 0.01]).seg([s.x + h * 0.7, s.y - h * 0.7, s.z + 0.01], [s.x - h * 0.7, s.y + h * 0.7, s.z + 0.01])
  return p
}

const SVG_CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const SVG_CROSS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'

function RulePanel() {
  const m = MODEL_BY_ID.get('a:purchasing')!
  const objs = useMemo(() => {
    const group = new THREE.Group()
    const slots = RULE_SLOTS.map(s => {
      const p = new Pen()
      const h = s.s / 2
      p.poly([[s.x - h, s.y - h, s.z], [s.x + h, s.y - h, s.z], [s.x + h, s.y + h, s.z], [s.x - h, s.y + h, s.z]], true)
      const box = ink(p, 1.4, INK.chalk, 0.95)
      const check = ink(markPen('check', s), 2.6, INK.chalk, 1)
      const cross = ink(markPen('cross', s), 2.8, INK.red, 1)
      setReveal(check, 0)
      setReveal(cross, 0)
      group.add(box, check, cross)
      return { box, check, cross, at: -1, pass: true }
    })
    return { group, slots }
  }, [])
  const total = useRef(6)
  const callout = useRef<{ root: HTMLElement; list: HTMLElement; head: HTMLElement; until: number } | null>(null)

  useEffect(() => {
    const root = el('div', 'dd-rules')
    const head = el('div', 'dd-rules-head', 'Spending rules')
    const list = el('ol', 'dd-rules-list')
    root.append(head, list)
    root.dataset.on = '0'
    callout.current = { root, list, head, until: 0 }
    const v = new THREE.Vector3()
    const a = overlay.add(root, () => v.set(m.at[0] + 0.58, 2.95 * stage.yScale, m.at[1] + 0.64))
    a.wrap.style.zIndex = '3'
    return () => overlay.remove(a)
  }, [m])

  useFlow(e => {
    const c = callout.current
    if (e.type === 'reset') {
      objs.slots.forEach(s => {
        s.at = -1
        setReveal(s.check, 0)
        setReveal(s.cross, 0)
      })
      total.current = 6
      if (c) {
        c.list.replaceChildren()
        c.root.dataset.on = '0'
      }
      return
    }
    if (e.type !== 'rule') return
    if (e.index === 0) {
      objs.slots.forEach(s => {
        s.at = -1
        setReveal(s.check, 0)
        setReveal(s.cross, 0)
      })
      total.current = e.total
      if (c) {
        const req = feed.getWorld().requests.find(r => r.id === e.requestId)
        c.head.replaceChildren(el('span', 'dd-rules-title', `Checking ${req ? req.item.split(',')[0] : 'a request'}`), el('span', 'dd-id', e.requestId))
        c.list.replaceChildren()
      }
    }
    const s = objs.slots[e.index]
    if (s) {
      s.at = now()
      s.pass = e.verdict.pass
    }
    if (c) {
      const li = el('li', `dd-rule ${e.verdict.pass ? 'is-pass' : 'is-fail'}`)
      const mark = el('span', 'dd-rule-mark')
      mark.innerHTML = e.verdict.pass ? SVG_CHECK : SVG_CROSS
      const txt = el('span', 'dd-rule-text')
      txt.append(el('span', 'dd-rule-name', e.verdict.rule))
      if (!e.verdict.pass) txt.append(el('span', 'dd-rule-why', e.verdict.auditCase ? `${e.verdict.detail} ${e.verdict.auditCase}.` : e.verdict.detail))
      li.append(mark, txt)
      li.title = `${e.verdict.rule}: ${e.verdict.detail}`
      c.list.append(li)
      c.root.dataset.on = '1'
      c.until = now() + 7
    }
  })

  useFrame(() => {
    const pg = partGroups.get('a:purchasing')?.[2]
    objs.group.position.set(m.at[0] + (pg?.position.x ?? 0), pg?.position.y ?? 0, m.at[1] + (pg?.position.z ?? 0))
    objs.group.scale.y = stage.yScale
    const t = now()
    objs.slots.forEach((s, i) => {
      s.box.visible = i < total.current && stage.yScale > 0.5
      if (s.at < 0) return
      const f = stage.reduced ? 1 : (t - s.at) / 0.28
      setReveal(s.pass ? s.check : s.cross, f)
      setReveal(s.pass ? s.cross : s.check, 0)
    })
    const c = callout.current
    if (c && c.root.dataset.on === '1' && t > c.until) c.root.dataset.on = '0'
  })

  return <primitive object={objs.group} />
}

// ── Grant vaults: fill line, hatching when frozen, the seal ────────────────

const RINGS = 24
const RSEG = 40

function GrantVault({ id }: { id: string }) {
  const m = MODEL_BY_ID.get(`g:${id}`)!
  const objs = useMemo(() => {
    const group = new THREE.Group()
    group.position.set(m.at[0], 0, m.at[1])
    const fill = new Pen()
    for (let i = 0; i < RINGS; i++) fill.ring([0, VAULT.base + ((i + 0.5) / RINGS) * VAULT.h, 0], VAULT.r + 0.004, 'y', RSEG)
    const fillInk = ink(fill, 0.9, INK.fine, 0.5)
    const lvl = new Pen()
    lvl.ring([0, 0, 0], VAULT.r + 0.02, 'y', 48)
    const level = ink(lvl, 3, INK.amber, 1)
    const hatch = new Pen()
    const N = 30
    for (const dir of [1, -1]) {
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2
        const pts: V3[] = []
        for (let j = 0; j <= 12; j++) {
          const y = VAULT.base + (j / 12) * VAULT.h
          const a = a0 + dir * (j / 12) * 1.1
          pts.push([Math.cos(a) * (VAULT.r + 0.012), y, Math.sin(a) * (VAULT.r + 0.012)])
        }
        hatch.poly(pts)
      }
    }
    const hatchInk = ink(hatch, 1.25, INK.chalk, 0.9)
    setReveal(hatchInk, 0)
    const dim = new THREE.Group()
    const dline = new Pen()
    dline.seg([VAULT.r + 0.5, 0, 0], [VAULT.r + 0.5, 1, 0])
    const dimLine = ink(dline, 1.1, INK.amber, 0.95)
    const tickTop = ink(new Pen().tick([VAULT.r + 0.5, 0, 0]).seg([VAULT.r + 0.05, 0, 0], [VAULT.r + 0.65, 0, 0]), 1.1, INK.amber, 0.95)
    const tickBot = ink(new Pen().tick([VAULT.r + 0.5, VAULT.base, 0]).seg([VAULT.r + 0.05, VAULT.base, 0], [VAULT.r + 0.65, VAULT.base, 0]), 1.1, INK.amber, 0.95)
    const dimScale = new THREE.Group()
    dimScale.add(dimLine)
    dim.add(dimScale, tickTop, tickBot)
    group.add(fillInk, level, hatchInk, dim)
    return { group, fillInk, level, hatchInk, dim, dimScale, tickTop }
  }, [m])

  const st = useRef({ frozen: false, fill: -1, hatch: 0, hatchTo: 0, key: '', court: '', snap: true })
  const dom = useRef<{ tag: HTMLElement; money: HTMLElement; status: HTMLElement; seal: HTMLElement; sealWhy: HTMLElement; note: HTMLElement } | null>(null)

  useEffect(() => {
    const tag = el('div', 'dd-tag dd-tag-grant')
    tag.dataset.id = `g:${id}`
    tag.dataset.side = id === 'R01GM061721' ? 'l' : 'r'
    const g0 = feed.getWorld().grants.find(g => g.id === id)
    const head = el('div', 'dd-vault-head')
    head.append(el('b', 'dd-id', id), el('span', 'dd-tag-sub', g0?.title ?? ''))
    const money = el('span', 'dd-money', '')
    const status = el('span', 'dd-vault-status', '')
    const row = el('div', 'dd-vault-row')
    row.append(el('span', 'dd-vault-k', 'Truly available'), money)
    tag.append(head, row, status)
    const seal = el('div', 'dd-seal')
    seal.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="55" fill="#f3f6f4"/><circle cx="60" cy="60" r="51" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="60" cy="60" r="41" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'
    const sealWord = el('span', 'dd-seal-word', 'Frozen')
    const sealWhy = el('span', 'dd-seal-why', '')
    seal.append(sealWord, sealWhy)
    seal.dataset.state = 'off'
    const note = el('div', 'dd-note')
    note.dataset.on = '0'
    dom.current = { tag, money, status, seal, sealWhy, note }
    const v1 = new THREE.Vector3()
    const v2 = new THREE.Vector3()
    const v3 = new THREE.Vector3()
    const anchors = [
      overlay.add(tag, () => v1.set(m.at[0] + 0.1, (VAULT.base + VAULT.h + 0.55) * stage.yScale, m.at[1])),
      overlay.add(seal, () => v2.set(m.at[0] + 0.7, (innerWidth <= 760 ? 0.8 : 1.2) * stage.yScale, m.at[1] + 0.71)),
      overlay.add(note, () => {
        // the note is pinned where the news came from: the court notice, or the payment system
        const src = MODEL_BY_ID.get(note.dataset.kind === 'paid' ? 's:payments' : 's:court')
        return src ? v3.set(src.at[0], 1.75 * stage.yScale, src.at[1]) : null
      }),
    ]
    const off = feed.on(e => {
      if (e.type === 'reset') st.current.snap = true
    })
    return () => {
      off()
      anchors.forEach(a => overlay.remove(a))
    }
  }, [id, m, objs])

  useFrame((state, dt) => {
    const w = feed.getWorld()
    const g = w.grants.find(x => x.id === id)
    const d = dom.current
    if (!g || !d) return
    const s = st.current
    const target = clamp(g.available / g.awarded)
    if (s.fill < 0 || s.snap) s.fill = target
    s.fill += (target - s.fill) * (stage.reduced ? 1 : 1 - Math.exp(-dt * 3))
    const shown = Math.max(1, Math.round(s.fill * RINGS))
    objs.fillInk.geometry.instanceCount = shown * RSEG
    const y = VAULT.base + s.fill * VAULT.h
    objs.level.position.y = y
    objs.dimScale.scale.y = y
    objs.tickTop.position.y = y
    objs.group.scale.y = stage.yScale
    const cam = state.camera.position
    // keep the dimension on the right-hand side as seen from the camera
    objs.dim.rotation.y = Math.atan2(cam.x - m.at[0], cam.z - m.at[1])

    if (g.frozen !== s.frozen || s.snap) {
      const was = s.frozen
      s.frozen = g.frozen
      s.hatchTo = g.frozen ? 1 : 0
      if (s.snap) {
        s.hatch = s.hatchTo
        d.seal.dataset.state = g.frozen ? 'on' : 'off'
        d.note.dataset.on = '0'
      } else if (g.frozen && !was) {
        d.seal.dataset.state = 'slam'
      } else if (!g.frozen && was) {
        d.seal.dataset.state = 'lift'
        const paid = w.statusEvents.find(e => e.grantId === id && e.kind === 'payment_received')
        showNote(d.note, paid ? `Payment of ${usd(paid.amount ?? 0)} landed ${paid.day}. A payment is cash: the freeze lifts.` : 'Unfrozen.', 'paid')
      }
    }
    if (g.frozen) {
      const court = w.statusEvents.find(e => e.grantId === id && e.kind === 'court_order')
      const key = court ? court.id : ''
      if (key !== s.court) {
        s.court = key
        if (court && !s.snap) {
          showNote(d.note, `Court order ${court.day}: restored on paper. No payment has arrived, so spending stays frozen. A court order isn’t cash.`, 'court')
          d.seal.dataset.state = 'restamp'
          setTimeout(() => {
            if (d.seal.dataset.state === 'restamp') d.seal.dataset.state = 'on'
          }, 900)
        }
      }
      d.sealWhy.textContent = g.status === 'restored_by_court' ? 'Restored by court · no cash yet' : `Canceled ${w.statusEvents.find(e => e.grantId === id && e.kind === 'canceled')?.day ?? ''}`
    } else s.court = ''
    s.snap = false
    const speed = s.hatchTo > s.hatch ? 0.9 : 1.3
    s.hatch += Math.sign(s.hatchTo - s.hatch) * Math.min(Math.abs(s.hatchTo - s.hatch), stage.reduced ? 1 : dt / speed)
    setReveal(objs.hatchInk, s.hatch)
    const key = `${g.available}|${g.frozen}|${g.status}`
    if (key !== s.key) {
      s.key = key
      d.money.textContent = usd(g.available)
      d.status.textContent = statusText(g)
      d.tag.dataset.frozen = g.frozen ? '1' : '0'
    }
    const { selected, hovered } = ui.get()
    const dim = selected !== null && selected !== `g:${id}`
    d.tag.dataset.dim = dim ? '1' : '0'
    d.tag.dataset.hot = hovered === `g:${id}` || selected === `g:${id}` ? '1' : '0'
  })

  return <primitive object={objs.group} />
}

function statusText(g: Grant) {
  if (g.frozen) return g.status === 'restored_by_court' ? 'Restored by court, still frozen' : 'Canceled: spending frozen'
  if (g.status === 'restored_by_court') return 'Active (restored by court, paid)'
  return g.status === 'ended' ? 'Ended' : `Active to ${g.end}`
}

function showNote(n: HTMLElement, text: string, kind: string) {
  n.textContent = text
  n.dataset.kind = kind
  n.dataset.on = '1'
  const stamp = text
  window.setTimeout(() => {
    if (n.textContent === stamp) n.dataset.on = '0'
  }, kind === 'court' ? 16000 : 7000)
}

// ── Packets: slips in flight, trails that draw the path, arrival moments ──

interface Live {
  mesh: THREE.Mesh
  trail: InkLine
  label: ReturnType<typeof overlay.add> | null
  pos: THREE.Vector3
  gone: number // time the packet arrived (for the trail fade), or 0
}

const LABELLED = new Set(['request', 'verdict', 'pushback', 'payment', 'hold', 'invoice', 'paper', 'payment_request', 'follow_up', 'decision'])

function Packets() {
  const camera = useThree(s => s.camera)
  const pool = useMemo(() => {
    const group = new THREE.Group()
    const trails = new THREE.Group()
    const meshes: THREE.Mesh[] = []
    const lines: InkLine[] = []
    const geo = new THREE.PlaneGeometry(1, 1)
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      mesh.renderOrder = 10
      group.add(mesh)
      meshes.push(mesh)
      const l = ink(new Pen().seg([0, 0, 0], [0, 0, 0.01]), 2, INK.chalk, 0.9)
      l.visible = false
      l.renderOrder = 5
      trails.add(l)
      lines.push(l)
    }
    const rings = new THREE.Group()
    const ringLines = Array.from({ length: 14 }, () => {
      const l = ink(new Pen().ring([0, 0, 0], 1, 'y', 40), 2.2, INK.chalk, 1)
      l.visible = false
      rings.add(l)
      return { l, at: -10, base: new THREE.Vector3() }
    })
    return { group, trails, meshes, lines, rings, ringLines }
  }, [])
  const live = useRef(new Map<string, Live>())
  const free = useRef<number[]>(Array.from({ length: 40 }, (_, i) => i))
  const ringNext = useRef(0)

  const landing = useRef<{ args: Parameters<typeof landStamp>; t: number }[]>([])
  const ring = (at: THREE.Vector3, color: string) => {
    const r = pool.ringLines[ringNext.current++ % pool.ringLines.length]
    r.at = now()
    r.base.copy(at)
    r.l.material.color.set(color)
  }

  useFlow(e => {
    if (e.type === 'reset') {
      for (const [, l] of live.current) {
        l.mesh.visible = false
        l.trail.visible = false
        if (l.label) overlay.remove(l.label)
      }
      live.current.clear()
      free.current = Array.from({ length: 40 }, (_, i) => i)
      overlay.clear(a => a.el.classList.contains('dd-land'))
      landing.current.length = 0
      return
    }
    if (e.type !== 'arrive') return
    const p = e.packet
    kicks.set(p.to, feed.now())
    const at = portOf(p.to)
    if (p.kind === 'verdict' && p.to.startsWith('r:')) {
      ring(at, INK.red)
      const req = feed.getWorld().requests.find(r => r.id === p.refId)
      landing.current.push({ args: [p, req, at.clone()], t: feed.now() })
    } else if (p.kind === 'payment' || p.kind === 'charge') ring(at, INK.amber)
    else if (p.kind !== 'reading' && p.kind !== 'recheck') ring(at, INK.chalk)
  })

  useFrame(() => {
    const w = feed.getWorld()
    const t = now()
    if (landing.current.length) {
      // a ?at jump replays minutes of arrivals in one tick: stamp only the recent ones
      for (const l of landing.current) if (feed.now() - l.t < 2500) landStamp(...l.args)
      landing.current.length = 0
    }
    const seen = new Set<string>()
    for (const p of w.packets) {
      seen.add(p.id)
      let l = live.current.get(p.id)
      if (!l) {
        const i = free.current.pop()
        if (i === undefined) continue
        const mesh = pool.meshes[i]
        const trail = pool.lines[i]
        mesh.userData.slot = i
        const mat = mesh.material as THREE.MeshBasicMaterial
        mat.map = slipTexture(slipKey(p))
        mat.needsUpdate = true
        const [sw, sh] = slipSize(p)
        mesh.scale.set(sw, sh, 1)
        const r = route(p.from, p.to)
        const pen = new Pen()
        const pts = r.curve.getSpacedPoints(60)
        for (let k = 0; k < pts.length - 1; k++) pen.seg(pts[k].toArray() as V3, pts[k + 1].toArray() as V3)
        reshape(trail, pen)
        trail.material.color.set(p.kind === 'payment' || p.kind === 'charge' ? INK.amber : p.kind === 'reading' || p.kind === 'recheck' ? INK.fine : INK.chalk)
        trail.userData.opacity = p.kind === 'reading' || p.kind === 'recheck' ? 0.55 : 0.95
        trail.userData.width = p.kind === 'request' || p.kind === 'verdict' ? 2.4 : 1.6
        const pos = new THREE.Vector3()
        let label: Live['label'] = null
        if (LABELLED.has(p.kind) || (p.kind === 'reading' && !p.label.endsWith('no change'))) {
          const tag = el('div', `dd-ptag dd-ptag-${p.kind}`)
          if (p.outcome && p.kind === 'verdict') tag.dataset.o = p.outcome
          const yours = p.refId && mine.has(p.refId.replace(/b$/, ''))
          if (yours && (p.kind === 'request' || p.kind === 'verdict')) tag.append(el('b', 'dd-ptag-you', 'Your request'))
          tag.append(el('span', '', p.label))
          const v = new THREE.Vector3()
          label = overlay.add(tag, () => (mesh.visible ? v.copy(mesh.position).add(new THREE.Vector3(0, 0.55, 0)) : null))
        }
        l = { mesh, trail, label, pos, gone: 0 }
        live.current.set(p.id, l)
      }
      place3(l, p, camera)
    }
    for (const [id, l] of live.current) {
      if (seen.has(id)) continue
      if (!l.gone) {
        l.gone = t
        l.mesh.visible = false
        if (l.label) overlay.remove(l.label)
        l.label = null
      }
      const f = (t - l.gone) / 1.1
      l.trail.material.opacity = l.trail.userData.opacity * (1 - clamp(f))
      if (f >= 1) {
        l.trail.visible = false
        free.current.push(l.mesh.userData.slot as number)
        live.current.delete(id)
      }
    }
    pool.trails.scale.y = stage.yScale
    for (const r of pool.ringLines) {
      const f = (t - r.at) / 0.8
      if (f < 0 || f > 1) {
        r.l.visible = false
        continue
      }
      r.l.visible = true
      const s = 0.25 + ease(f) * 1.35
      r.l.position.set(r.base.x, 0.03, r.base.z)
      r.l.scale.set(s, 1, s)
      r.l.material.opacity = 1 - f
      r.l.material.linewidth = 2.6 * (1 - f * 0.6)
    }
  })

  return (
    <>
      <primitive object={pool.trails} />
      <primitive object={pool.group} />
      <primitive object={pool.rings} />
    </>
  )
}

const tmpN = new THREE.Vector3()

/** Where a packet is, with motion that differs by kind and verdict. */
function place3(l: Live, p: Packet, camera: THREE.Camera) {
  const u = progress(p)
  const r = route(p.from, p.to)
  let e = ease(u)
  let lift = 0
  let roll = 0
  if (p.kind === 'verdict') {
    if (p.outcome === 'reject') e = u * u * u // accelerates into the desk and slams
    else if (p.outcome === 'hold') {
      e = 1 - Math.pow(1 - u, 2.4) // slows, then hovers above the desk
      lift = Math.sin(clamp((u - 0.75) / 0.25) * Math.PI * 0.5) * 0.7
    } else if (p.outcome === 'refine') roll = Math.sin(u * Math.PI * 4) * 0.35 * (1 - u)
  }
  r.curve.getPointAt(clamp(e), l.pos)
  if (p.kind === 'verdict' && p.outcome === 'refine') {
    const tan = r.curve.getTangentAt(clamp(e), tmpN)
    const bump = Math.sin(u * Math.PI) * 0.75
    l.pos.x += -tan.z * bump
    l.pos.z += tan.x * bump
  }
  l.pos.y = (l.pos.y + 0.32 + lift) * stage.yScale + 0.05
  l.mesh.position.copy(l.pos)
  l.mesh.quaternion.copy(camera.quaternion)
  if (roll) l.mesh.rotateZ(roll)
  l.mesh.visible = true
  l.trail.visible = true
  setReveal(l.trail, e)
  l.trail.material.opacity = l.trail.userData.opacity
  l.trail.material.linewidth = l.trail.userData.width
}

// ── The whole drawing ──────────────────────────────────────────────────────

export function Scene() {
  return (
    <>
      <Rig />
      <Sheet />
      {MODELS.map(m => (
        <ModelView key={m.id} m={m} />
      ))}
      <RulePanel />
      <GrantVault id="R01GM061721" />
      <GrantVault id="R21AI182745" />
      <Packets />
    </>
  )
}

