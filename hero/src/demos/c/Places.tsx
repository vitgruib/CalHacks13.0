// Everything that stands on the land: the lab settlement, the three agent
// observatories, the grant manager's lodge at the pass, the six rule cairns
// on the switchback, the horizon stations, the vendors' depot.

import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import * as THREE from 'three'
import { feed, useFlow, type Verdict } from '../../feed'
import { AGENT_SPOTS, climb, DEPOT, HOUSES, housePos, LODGE, markerSpot, STATIONS, terrainHeight } from './layout'
import { pulseAge, pulses, ui, useUI } from './store'
import { glowTexture, trailMaterial } from './terrainMaterial'
import { RULES, ruleIndex, TONE } from './words'
import { Glyph } from './icons'

const MAT = {
  stone: new THREE.MeshStandardMaterial({ color: '#5e5249', roughness: 0.95 }),
  wall: new THREE.MeshStandardMaterial({ color: '#7a644c', roughness: 0.9 }),
  roof: new THREE.MeshStandardMaterial({ color: '#35291f', roughness: 0.85 }),
  zinc: new THREE.MeshStandardMaterial({ color: '#68717d', roughness: 0.42, metalness: 0.5 }),
  timber: new THREE.MeshStandardMaterial({ color: '#4d3625', roughness: 0.9 }),
  mast: new THREE.MeshStandardMaterial({ color: '#3d3d42', roughness: 0.7, metalness: 0.3 }),
}
const lampColor = new THREE.Color(2.6, 1.35, 0.42)

function windowMat(k = 1) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4 * k, 1.3 * k, 0.45 * k), toneMapped: false })
}

const gableCache = new Map<string, THREE.ExtrudeGeometry>()
function gable(w: number, h: number, d: number) {
  const key = `${w}:${h}:${d}`
  let g = gableCache.get(key)
  if (!g) {
    const s = new THREE.Shape()
    s.moveTo(-w / 2, 0)
    s.lineTo(w / 2, 0)
    s.lineTo(0, h)
    s.closePath()
    g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false })
    g.translate(0, 0, -d / 2)
    gableCache.set(key, g)
  }
  return g
}

function hoverProps(id: string) {
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      ui.set({ hovered: id })
    },
    onPointerOut: () => {
      if (ui.get().hovered === id) ui.set({ hovered: null })
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      ui.select(id)
    },
  }
}

function tagProps(id: string) {
  return {
    type: 'button' as const,
    tabIndex: -1,
    onClick: () => ui.select(id),
    onPointerEnter: () => ui.set({ hovered: id }),
    onPointerLeave: () => {
      if (ui.get().hovered === id) ui.set({ hovered: null })
    },
  }
}

function Glow({ color, scale, position, spriteRef }: { color: THREE.Color; scale: number; position: [number, number, number]; spriteRef?: Ref<THREE.Sprite> }) {
  return (
    <sprite ref={spriteRef} position={position} scale={[scale, scale, scale]}>
      <spriteMaterial map={glowTexture()} color={color} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
    </sprite>
  )
}

/** A ground ring that brightens when its place is hovered or selected. */
function Halo({ id, r }: { id: string; r: number }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.4, 0.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [])
  useFrame(() => {
    const s = ui.get()
    const target = s.selected === id ? 0.85 : s.hovered === id ? 0.6 : 0
    mat.opacity += (target - mat.opacity) * 0.2
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} material={mat}>
      <ringGeometry args={[r * 0.9, r, 48]} />
    </mesh>
  )
}

// ── The lab settlement ────────────────────────────────────────────────────

function HouseBody({ variant, win }: { variant: number; win: THREE.Material }) {
  switch (variant) {
    case 0: // PI office and whiteboard: two storeys
      return (
        <>
          <mesh material={MAT.wall} position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[1.15, 1.2, 0.95]} />
          </mesh>
          <mesh material={MAT.roof} position={[0, 1.2, 0]} geometry={gable(1.3, 0.5, 1.05)} />
          <mesh material={win} position={[-0.25, 0.85, 0.48]}>
            <planeGeometry args={[0.32, 0.26]} />
          </mesh>
          <mesh material={win} position={[0.25, 0.85, 0.48]}>
            <planeGeometry args={[0.32, 0.26]} />
          </mesh>
          <mesh material={win} position={[0, 0.35, 0.48]}>
            <planeGeometry args={[0.7, 0.24]} />
          </mesh>
        </>
      )
    case 1: // protein purification bench: a long low lab with a vent stack
      return (
        <>
          <mesh material={MAT.wall} position={[0, 0.36, 0]}>
            <boxGeometry args={[1.6, 0.72, 0.9]} />
          </mesh>
          <mesh material={MAT.roof} position={[0, 0.72, 0]} geometry={gable(1.75, 0.42, 1.0)} rotation={[0, Math.PI / 2, 0]} scale={[0.6, 1, 1.85]} />
          <mesh material={MAT.mast} position={[0.55, 1.1, -0.15]}>
            <cylinderGeometry args={[0.07, 0.07, 0.7, 10]} />
          </mesh>
          <mesh material={win} position={[0, 0.4, 0.46]}>
            <planeGeometry args={[1.2, 0.26]} />
          </mesh>
        </>
      )
    case 2: // microbiology bench: flat roof and cabinet exhaust
      return (
        <>
          <mesh material={MAT.wall} position={[0, 0.42, 0]}>
            <boxGeometry args={[1.1, 0.84, 1.0]} />
          </mesh>
          <mesh material={MAT.roof} position={[0, 0.87, 0]}>
            <boxGeometry args={[1.2, 0.08, 1.1]} />
          </mesh>
          <mesh material={MAT.zinc} position={[-0.3, 1.05, -0.1]}>
            <cylinderGeometry args={[0.13, 0.16, 0.32, 12]} />
          </mesh>
          <mesh material={win} position={[0.18, 0.46, 0.51]}>
            <planeGeometry args={[0.55, 0.32]} />
          </mesh>
        </>
      )
    case 3: // the confocal microscope room: a small dark dome
      return (
        <>
          <mesh material={MAT.wall} position={[0, 0.32, 0]}>
            <cylinderGeometry args={[0.6, 0.64, 0.64, 20]} />
          </mesh>
          <mesh material={MAT.zinc} position={[0, 0.64, 0]}>
            <sphereGeometry args={[0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh material={win} position={[0, 0.32, 0.62]}>
            <planeGeometry args={[0.3, 0.3]} />
          </mesh>
        </>
      )
    default: // supply room and the −80 °C freezer
      return (
        <>
          <mesh material={MAT.wall} position={[0, 0.45, 0]}>
            <boxGeometry args={[1.3, 0.9, 1.05]} />
          </mesh>
          <mesh material={MAT.roof} position={[0, 0.9, 0]} geometry={gable(1.45, 0.55, 1.15)} />
          <mesh material={win} position={[0, 0.34, 0.53]}>
            <planeGeometry args={[0.5, 0.56]} />
          </mesh>
          <mesh material={MAT.zinc} position={[0.9, 0.3, 0.1]}>
            <boxGeometry args={[0.42, 0.6, 0.5]} />
          </mesh>
        </>
      )
  }
}

function House({ id, variant }: { id: string; variant: number }) {
  const nid = `r:${id}`
  const p = housePos(id)!
  const win = useMemo(() => windowMat(), [])
  const lamp = useRef<THREE.Sprite>(null)
  const base = useMemo(() => new THREE.Color(1.55, 0.82, 0.28), [])
  const tintC = useMemo(() => new THREE.Color(), [])
  useFrame(state => {
    const t = state.clock.elapsedTime
    const age = pulseAge(nid)
    const kick = age < 1.6 ? 1 - age / 1.6 : 0
    const tint = pulses.get(nid)?.color ?? [2.4, 1.3, 0.45]
    const breathe = 0.85 + 0.15 * Math.sin(t * 1.3 + variant * 1.7)
    win.color.copy(base).multiplyScalar(breathe)
    if (kick > 0) win.color.lerp(tintC.setRGB(tint[0], tint[1], tint[2]), kick)
    if (lamp.current) lamp.current.scale.setScalar(0.9 + kick * 1.8)
  })
  return (
    <group position={[p.x, p.y - 0.04, p.z]} rotation={[0, -p.x * 0.05, 0]} {...hoverProps(nid)}>
      <HouseBody variant={variant} win={win} />
      <mesh material={MAT.mast} position={[0.75, 0.55, 0.55]}>
        <cylinderGeometry args={[0.025, 0.03, 1.1, 6]} />
      </mesh>
      <Glow spriteRef={lamp} color={lampColor} scale={0.9} position={[0.75, 1.12, 0.55]} />
      <Halo id={nid} r={1.05} />
      <ResearcherLabel id={id} />
    </group>
  )
}

function ResearcherLabel({ id }: { id: string }) {
  const nid = `r:${id}`
  const find = () => feed.getWorld().researchers.find(r => r.id === id)
  const [task, setTask] = useState(() => find()?.task ?? '')
  const [flash, setFlash] = useState<{ text: string; tone: string } | null>(null)
  const timer = useRef(0)
  const on = useUI(s => s.hovered === nid || s.selected === nid)
  const show = (text: string, tone: string, ms = 4200) => {
    setFlash({ text, tone })
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setFlash(null), ms)
  }
  useFlow(e => {
    if (e.type === 'reset') {
      setFlash(null)
      setTask(find()?.task ?? '')
    } else if (e.type === 'task' && e.researcherId === id) setTask(e.task)
    else if (e.type === 'packet' && e.packet.from === nid) {
      const k = e.packet.kind
      show(k === 'paper' ? `Sent a paper to the report check` : k === 'pushback' ? 'Pushed back on the hold' : `Asked for ${e.packet.label}`, 'send')
    } else if (e.type === 'arrive' && e.packet.to === nid && e.packet.kind === 'verdict') show(e.packet.label, e.packet.outcome ?? 'accept', 5600)
  })
  useEffect(() => () => clearTimeout(timer.current), [])
  const r = find()
  if (!r) return null
  return (
    <Html position={[0, 2.0, 0]} center zIndexRange={[16, 0]}>
      <div className="c-labwrap">
        {(on || flash) && (
          <div className="c-bubble" data-tone={flash?.tone ?? 'idle'}>
            <span className="c-tag__task">{task}</span>
            {flash && (
              <span className={`c-tag__flash is-${flash.tone}`}>
                {flash.tone !== 'send' && <Glyph name={flash.tone} />}
                {flash.text}
              </span>
            )}
          </div>
        )}
        <button className={`c-tag c-tag--lab${on ? ' is-on' : ''}${flash ? ' is-flash' : ''}`} {...tagProps(nid)}>
          <span className="c-tag__name c-wide">{r.name}</span>
          <span className="c-tag__name c-narrow">{r.name.split(' ').pop()}</span>
          <span className="c-tag__sub">{r.role}</span>
        </button>
      </div>
    </Html>
  )
}

/** Faint lit footpaths from every house up the switchback, so the route is always readable. */
function Footpaths() {
  const meshes = useMemo(() => {
    const mat = trailMaterial(new THREE.Color(0.9, 0.62, 0.32), { len: 50, alpha: 0.32, dash: 260 })
    mat.uniforms.uHead.value = 1.01
    return HOUSES.map(h => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(climb(h.id)), 160, 0.03, 4, false), mat))
  }, [])
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

export function Settlement() {
  return (
    <>
      {HOUSES.map(h => (
        <House key={h.id} id={h.id} variant={h.variant} />
      ))}
      <Footpaths />
    </>
  )
}

// ── The finance ridge ─────────────────────────────────────────────────────

const beamMat = (color: THREE.Color) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: color }, uK: { value: 0.3 } },
    vertexShader: `varying float vH; void main(){ vH = position.y / 7.0 + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uK; varying float vH; void main(){ float a = pow(1.0 - vH, 2.2) * uK; gl_FragColor = vec4(uColor * a, a); }`,
  })

const AGENT_NAME: Record<string, [string, string]> = {
  purchasing: ['Purchasing agent', 'Runs the six spending rules'],
  bookkeeping: ['Bookkeeping agent', 'Fund tracker and invoices'],
  payment_report: ['Payment & report agent', 'Payment requests and papers'],
}

function Observatory({ role }: { role: string }) {
  const id = `a:${role}`
  const s = AGENT_SPOTS[role]
  const y = terrainHeight(s.x, s.z)
  const beacon = useRef<THREE.Sprite>(null)
  const beam = useMemo(() => beamMat(new THREE.Color(1.6, 1.15, 0.65)), [])
  const slit = useMemo(() => windowMat(1.1), [])
  const on = useUI(st => st.hovered === id || st.selected === id)
  useFrame(state => {
    const age = pulseAge(id)
    const kick = age < 1.4 ? 1 - age / 1.4 : 0
    const t = state.clock.elapsedTime
    beam.uniforms.uK.value = 0.16 + 0.1 * Math.sin(t * 0.8 + s.x) + kick * 0.55
    if (beacon.current) beacon.current.scale.setScalar(1.1 + kick * 1.6 + 0.12 * Math.sin(t * 2 + s.x))
  })
  const [name, sub] = AGENT_NAME[role]
  return (
    <group position={[s.x, y - 0.1, s.z]} scale={s.scale} {...hoverProps(id)}>
      <mesh material={MAT.stone} position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.72, 0.84, 0.84, 24]} />
      </mesh>
      <mesh material={MAT.zinc} position={[0, 0.84, 0]}>
        <sphereGeometry args={[0.74, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh material={slit} position={[0, 1.18, 0.52]} rotation={[-0.75, 0, 0]}>
        <boxGeometry args={[0.15, 0.5, 0.04]} />
      </mesh>
      {[-0.9, 0, 0.9].map(a => (
        <mesh key={a} material={slit} position={[Math.sin(a) * 0.79, 0.45, Math.cos(a) * 0.79]} rotation={[0, a, 0]}>
          <planeGeometry args={[0.16, 0.22]} />
        </mesh>
      ))}
      <Glow spriteRef={beacon} color={new THREE.Color(2.2, 1.6, 0.9)} scale={1.1} position={[0, 1.72, 0]} />
      <mesh material={beam} position={[0, 5.2, 0]}>
        <cylinderGeometry args={[0.06, 0.32, 7, 16, 1, true]} />
      </mesh>
      <Halo id={id} r={1.25} />
      <Html position={[0, 2.5, 0]} center zIndexRange={[16, 0]}>
        <button className={`c-tag c-tag--agent${on ? ' is-on' : ''}`} {...tagProps(id)}>
          <span className="c-tag__name c-wide">{name}</span>
          <span className="c-tag__name c-narrow">{name.replace(/ agent$/, '')}</span>
          <span className="c-tag__sub">{sub}</span>
        </button>
      </Html>
    </group>
  )
}

function Lodge() {
  const id = 'p:grant_manager'
  const y = terrainHeight(LODGE.x, LODGE.z)
  const lantern = useRef<THREE.Sprite>(null)
  const glass = useMemo(() => windowMat(0.45), [])
  const [open, setOpen] = useState(0)
  const on = useUI(s => s.hovered === id || s.selected === id)
  useFlow(e => {
    if (e.type === 'hold' || e.type === 'reset') setOpen(feed.getWorld().holds.filter(h => h.open).length)
  })
  useFrame(state => {
    const t = state.clock.elapsedTime
    const n = feed.getWorld().holds.filter(h => h.open).length
    const k = n > 0 ? 1.4 + 0.5 * Math.sin(t * 2.6) : 0.7
    if (lantern.current) {
      lantern.current.scale.setScalar(0.7 + k * 0.7)
      ;(lantern.current.material as THREE.SpriteMaterial).color.setRGB(TONE.hold[0] * 0.8, TONE.hold[1] * 0.8, TONE.hold[2] * 0.8)
    }
    glass.color.setRGB(1.1 * (0.7 + 0.3 * Math.min(1, n)), 0.6 * (0.7 + 0.3 * Math.min(1, n)), 0.2)
  })
  return (
    <group position={[LODGE.x, y - 0.08, LODGE.z]} rotation={[0, -0.25, 0]} {...hoverProps(id)}>
      <mesh material={MAT.timber} geometry={gable(1.7, 1.5, 1.35)} />
      <mesh material={glass} position={[0, 0.05, 0.69]} geometry={gable(0.8, 0.72, 0.01)} />
      <mesh material={MAT.stone} position={[0.55, 0.9, -0.3]}>
        <boxGeometry args={[0.18, 0.7, 0.18]} />
      </mesh>
      <Glow spriteRef={lantern} color={new THREE.Color(...TONE.hold)} scale={1} position={[-0.7, 0.55, 0.85]} />
      <Halo id={id} r={1.2} />
      <Html position={[0, 2.05, 0]} center zIndexRange={[16, 0]}>
        <button className={`c-tag c-tag--lodge${on ? ' is-on' : ''}${open ? ' is-waiting' : ''}`} {...tagProps(id)}>
          <span className="c-tag__name">Grant manager</span>
          <span className="c-tag__sub">{open ? `${open} waiting for a decision` : 'The only human who approves'}</span>
        </button>
      </Html>
    </group>
  )
}

/** Six cairns on the switchback, one per spending rule, lit as the purchasing agent checks each. */
function RuleCairns() {
  const state = useRef(RULES.map(() => ({ s: 0, at: 0 }))) // 0 idle, 1 pass, 2 fail
  const current = useRef<string | null>(null)
  const fade = useRef(0)
  const lamps = useRef<(THREE.Sprite | null)[]>([])
  const heads = useMemo(() => RULES.map(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.4, 0.3), toneMapped: false })), [])
  const pass = new THREE.Color(2.3, 1.85, 1.05)
  const fail = new THREE.Color(...TONE.reject)
  const idle = new THREE.Color(0.42, 0.33, 0.24)
  useFlow(e => {
    if (e.type === 'reset') {
      state.current.forEach(x => (x.s = 0))
      current.current = null
    }
    if (e.type === 'rule') {
      if (current.current !== e.requestId || e.index === 0) {
        state.current.forEach(x => (x.s = 0))
        current.current = e.requestId
      }
      const i = ruleIndex(e.verdict.rule)
      if (i < 0) return
      const st = state.current[i]
      st.s = !e.verdict.pass ? 2 : st.s === 2 ? 2 : 1
      st.at = performance.now()
      fade.current = 0
    }
    if (e.type === 'packet' && e.packet.kind === 'verdict' && e.packet.refId === current.current) fade.current = performance.now() + 5000
  })
  useFrame(st => {
    const now = performance.now()
    const dim = fade.current && now > fade.current ? Math.max(0, 1 - (now - fade.current) / 1500) : 1
    if (fade.current && dim === 0) {
      state.current.forEach(x => (x.s = 0))
      fade.current = 0
    }
    RULES.forEach((_, i) => {
      const x = state.current[i]
      const age = (now - x.at) / 1000
      const kick = age < 0.8 ? 1 - age / 0.8 : 0
      const c = x.s === 1 ? pass : x.s === 2 ? fail : idle
      heads[i].color.copy(idle).lerp(c, x.s ? dim : 0)
      const sp = lamps.current[i]
      if (sp) {
        const m = sp.material as THREE.SpriteMaterial
        m.color.copy(c).multiplyScalar(x.s ? dim : 0.35 + 0.1 * Math.sin(st.clock.elapsedTime * 1.5 + i))
        sp.scale.setScalar((x.s ? 1.1 : 0.55) + kick * 1.6)
      }
    })
  })
  return (
    <>
      {RULES.map((r, i) => {
        const p = markerSpot(i)
        return (
          <group key={r.key} position={[p.x, p.y - 0.05, p.z]}>
            <mesh material={MAT.stone} position={[0, 0.1, 0]} scale={[1, 0.7, 1]}>
              <dodecahedronGeometry args={[0.2, 0]} />
            </mesh>
            <mesh material={MAT.stone} position={[0.02, 0.3, 0]} scale={[1, 0.75, 1]}>
              <dodecahedronGeometry args={[0.15, 0]} />
            </mesh>
            <mesh material={heads[i]} position={[0, 0.48, 0]}>
              <sphereGeometry args={[0.08, 12, 8]} />
            </mesh>
            <Glow
              spriteRef={el => {
                lamps.current[i] = el
              }}
              color={idle}
              scale={0.6}
              position={[0, 0.5, 0]}
            />
          </group>
        )
      })}
    </>
  )
}

/** The purchasing agent's rule card: the request being checked and each rule's verdict as it lands. */
function RuleCard() {
  const [card, setCard] = useState<{ id: string; title: string; rows: (Verdict | null)[]; answer?: string; tone?: string } | null>(null)
  const hide = useRef(0)
  useFlow(e => {
    if (e.type === 'reset') return setCard(null)
    if (e.type === 'rule') {
      clearTimeout(hide.current)
      setCard(c => {
        const fresh = !c || c.id !== e.requestId || e.index === 0
        const req = feed.getWorld().requests.find(r => r.id === e.requestId)
        const rows = fresh ? RULES.map(() => null as Verdict | null) : [...c.rows]
        const i = ruleIndex(e.verdict.rule)
        if (i >= 0) rows[i] = rows[i] && !rows[i]!.pass ? rows[i] : e.verdict
        return { id: e.requestId, title: req ? `${req.item.split(',')[0]} · $${req.price.toLocaleString('en-US')}` : e.requestId, rows, answer: fresh ? undefined : c.answer }
      })
    }
    if (e.type === 'packet' && e.packet.kind === 'verdict') {
      setCard(c => (c && c.id === e.packet.refId ? { ...c, answer: e.packet.label.split(' · ')[0], tone: e.packet.outcome } : c))
      clearTimeout(hide.current)
      hide.current = window.setTimeout(() => setCard(null), 6500)
    }
  })
  useEffect(() => () => clearTimeout(hide.current), [])
  const p = AGENT_SPOTS.purchasing
  return (
    <group position={[p.x, terrainHeight(p.x, p.z), p.z]}>
      <Html position={[0, 4.6, -0.6]} zIndexRange={[18, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`c-rulecard${card ? ' is-on' : ''}`} aria-hidden>
          {card && (
            <>
              <p className="c-rulecard__title">{card.title}</p>
              <ol>
                {RULES.map((r, i) => {
                  const v = card.rows[i]
                  return (
                    <li key={r.key} className={v ? (v.pass ? 'is-pass' : 'is-fail') : 'is-idle'} title={v?.detail}>
                      <Glyph name={v ? (v.pass ? 'pass' : 'fail') : 'idle'} />
                      <span>{r.name}</span>
                    </li>
                  )
                })}
              </ol>
              {card.answer && (
                <p className={`c-rulecard__answer is-${card.tone}`}>
                  <Glyph name={card.tone ?? 'accept'} />
                  {card.answer}
                </p>
              )}
            </>
          )}
        </div>
      </Html>
    </group>
  )
}

export function Ridge() {
  return (
    <>
      {Object.keys(AGENT_SPOTS).map(r => (
        <Observatory key={r} role={r} />
      ))}
      <Lodge />
      <RuleCairns />
      <RuleCard />
    </>
  )
}

// ── The outside world ─────────────────────────────────────────────────────

const STATION_NAME: Record<string, string> = {
  's:reporter': 'NIH RePORTER',
  's:usaspending': 'USAspending',
  's:cancellations': 'Cancellation list',
  's:court': 'Court notice',
  's:payments': 'Payment system',
  'p:funder': 'NIH funder',
}

function Station({ id }: { id: string }) {
  const s = STATIONS[id]
  const y = terrainHeight(s.x, s.z)
  const lamp = useRef<THREE.Sprite>(null)
  const funder = id === 'p:funder'
  const win = useMemo(() => windowMat(0.8), [])
  const on = useUI(st => st.hovered === id || st.selected === id)
  useFrame(state => {
    const age = pulseAge(id)
    const kick = age < 1.2 ? 1 - age / 1.2 : 0
    const blink = 0.55 + 0.45 * Math.max(0, Math.sin(state.clock.elapsedTime * 1.4 + s.x))
    if (lamp.current) lamp.current.scale.setScalar(1.4 * blink + kick * 2.5)
  })
  return (
    <group position={[s.x, y - 0.1, s.z]} {...hoverProps(id)}>
      {funder ? (
        <>
          <mesh material={MAT.stone} position={[0, 0.45, 0]}>
            <boxGeometry args={[2.2, 0.9, 1.1]} />
          </mesh>
          <mesh material={MAT.zinc} position={[0, 1.0, 0]}>
            <cylinderGeometry args={[0.45, 0.55, 0.3, 16]} />
          </mesh>
          {[-0.75, -0.25, 0.25, 0.75].map(x => (
            <mesh key={x} material={win} position={[x, 0.45, 0.56]}>
              <planeGeometry args={[0.24, 0.34]} />
            </mesh>
          ))}
        </>
      ) : (
        <>
          <mesh material={MAT.stone} position={[0, 0.2, 0]}>
            <boxGeometry args={[0.6, 0.4, 0.5]} />
          </mesh>
          <mesh material={MAT.mast} position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.03, 0.07, 2.4, 6]} />
          </mesh>
          <mesh material={win} position={[0, 0.2, 0.26]}>
            <planeGeometry args={[0.2, 0.16]} />
          </mesh>
        </>
      )}
      <Glow spriteRef={lamp} color={new THREE.Color(2.4, 0.9, 0.45)} scale={1.4} position={[0, funder ? 1.35 : 2.65, 0]} />
      <Html position={[0, funder ? 2.3 : 3.4, 0]} center zIndexRange={[10, 0]}>
        <button className={`c-tag c-tag--far${on ? ' is-on' : ''}`} {...tagProps(id)}>
          <span className="c-tag__name">{STATION_NAME[id]}</span>
        </button>
      </Html>
    </group>
  )
}

function Depot() {
  const id = 'v:vendors'
  const y = terrainHeight(DEPOT.x, DEPOT.z)
  const win = useMemo(() => windowMat(0.9), [])
  const on = useUI(st => st.hovered === id || st.selected === id)
  return (
    <group position={[DEPOT.x, y - 0.05, DEPOT.z]} rotation={[0, -0.5, 0]} {...hoverProps(id)}>
      <mesh material={MAT.wall} position={[0, 0.45, 0]}>
        <boxGeometry args={[2.2, 0.9, 1.3]} />
      </mesh>
      <mesh material={MAT.roof} position={[0, 0.9, 0]} geometry={gable(2.35, 0.45, 1.4)} />
      {[-0.6, 0, 0.6].map(x => (
        <mesh key={x} material={win} position={[x, 0.32, 0.66]}>
          <planeGeometry args={[0.4, 0.42]} />
        </mesh>
      ))}
      <Glow color={lampColor} scale={0.9} position={[-1.2, 0.95, 0.7]} />
      <Halo id={id} r={1.6} />
      <Html position={[0, 1.9, 0]} center zIndexRange={[12, 0]}>
        <button className={`c-tag c-tag--far${on ? ' is-on' : ''}`} {...tagProps(id)}>
          <span className="c-tag__name">Vendors</span>
          <span className="c-tag__sub">Orders and invoices</span>
        </button>
      </Html>
    </group>
  )
}

export function Horizon() {
  return (
    <>
      {Object.keys(STATIONS).map(id => (
        <Station key={id} id={id} />
      ))}
      <Depot />
    </>
  )
}
