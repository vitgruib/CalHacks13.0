// Hover zones, for the landing: while a1 is embedded (embed.ts), the lab and
// the agent network each become one target. Pointing at a plinth lifts it,
// dims the other and shows a card naming its portal; a click (on touch, the
// card's button) calls the host's onEnter with that side's role. Per-node
// hovers and selection step aside (Pick asks useZones). The gallery keeps its
// per-node hovers; in development `?zones` turns zone mode on there to test.

import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  BoxGeometry,
  Color,
  CustomBlending,
  MathUtils,
  MeshBasicMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
  type Mesh,
} from 'three'
import { embed, useEmbed, type Role } from './embed'
import { LAB_BOX, LAB_X, NET_BOX, NET_X } from './layout'
import { reducedMotion } from './ui'
import './zones.css'

export type ZoneId = 'lab' | 'net'

const devZones = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('zones')
/** Zone mode: on while embedded (or with `?zones` in development). */
export const useZones = () => useEmbed(s => s.on) || devZones

/** Opens that side's portal. In development each call is also kept on window.__zoneEnters, for checks. */
function enter(role: Role) {
  if (import.meta.env.DEV) {
    const w = window as unknown as { __zoneEnters?: Role[] }
    ;(w.__zoneEnters ??= []).push(role)
  }
  embed.get().onEnter?.(role)
}

const ROLE: Record<ZoneId, Role> = { lab: 'researcher', net: 'grant_office' }
const WORDS: Record<ZoneId, { title: string; line: string; button: string }> = {
  lab: {
    title: 'Go to the research portal',
    line: 'Ask for what your experiment needs and follow each request.',
    button: 'Open the research portal',
  },
  net: {
    title: 'Go to the grant manager portal',
    line: 'The Inbox, the funds, and every decision the agents bring you.',
    button: 'Open the grant manager portal',
  },
}

// Each plinth's footprint, from the bottom of its body to above its tallest piece.
const BOX: Record<ZoneId, { x: number; w: number; d: number; y0: number; y1: number }> = {
  lab: { x: LAB_X, w: LAB_BOX.x1 - LAB_BOX.x0, d: LAB_BOX.z1 - LAB_BOX.z0, y0: -1.12, y1: 2.35 },
  net: { x: NET_X, w: NET_BOX.x1 - NET_BOX.x0, d: NET_BOX.z1 - NET_BOX.z0, y0: -1.12, y1: 1.8 },
}
// The lift: a flat brightening plus a rim, warm on the clay lab, cool on the slate network.
const LIFT: Record<ZoneId, { color: string; flat: number; rim: number }> = {
  lab: { color: '#FFF4E4', flat: 0.08, rim: 0.3 },
  net: { color: '#D4E3F6', flat: 0.014, rim: 0.16 },
}
const DIM = 0.2
const EASE = 14 // damp rate: about 200 ms to settle

// ── Shared state: which zone is lit, and where the card goes ─────────────

interface ZoneState {
  /** The zone under a mouse or pen. */
  hover: ZoneId | null
  /** Touch: the zone whose card is open with its button. */
  open: ZoneId | null
  /** The zone being entered: the camera glides in, the card is gone, clicks wait. */
  going: ZoneId | null
  /** The zone the copy's prompt points at (a phrase hovered or focused): lit, with no card. */
  hint: ZoneId | null
}
let zs: ZoneState = { hover: null, open: null, going: null, hint: null }
const subs = new Set<() => void>()
const setZone = (p: Partial<ZoneState>) => {
  const n = { ...zs, ...p }
  if (n.hover === zs.hover && n.open === zs.open && n.going === zs.going && n.hint === zs.hint) return
  zs = n
  subs.forEach(f => f())
}
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}
const getZone = () => zs
const litZone = () => zs.going ?? zs.open ?? zs.hover ?? zs.hint

/** For the copy's prompt (Hud.tsx): light a zone as its phrase is pointed at or focused, follow which zone is lit, and enter one. */
export const hintZone = (id: ZoneId | null) => setZone({ hint: id })
export const useLitZone = () => useSyncExternalStore(subscribe, litZone)
export const enterZone = (id: ZoneId, from: Element) => go(id, from)

interface Box {
  x: number
  y: number
  w: number
  h: number
}
/** The pointer on the stage, px, and the boxes the card keeps clear of. The hit boxes write it; the card reads it. */
const at = { x: 0, y: 0, el: null as HTMLDivElement | null, tapped: false, avoid: [] as Box[] }

/**
 * DOM laid over the canvas that takes the pointer (the landing's copy, a phone's bar), in stage px.
 * Read when a hover or tap starts, never per move: the stage's, the demo's and its host's children,
 * plus anything marked [data-zone-avoid].
 */
function findAvoid() {
  at.avoid.length = 0
  const el = at.el
  const stage = el?.parentElement
  const root = el?.closest('.demo-a1')
  if (!el || !stage || !root) return
  const s = stage.getBoundingClientRect()
  const pool = new Set<Element>([...stage.children, ...root.children, ...(root.parentElement?.children ?? []), ...root.querySelectorAll('[data-zone-avoid]')])
  for (const n of pool) {
    if (n === el || n.contains(el) || n.querySelector('canvas') || n.classList.contains('a1-card') || n.classList.contains('a1-zone-veil')) continue
    const r = n.getBoundingClientRect()
    const x0 = Math.max(r.left, s.left)
    const y0 = Math.max(r.top, s.top)
    const x1 = Math.min(r.right, s.right)
    const y1 = Math.min(r.bottom, s.bottom)
    if (x1 - x0 < 4 || y1 - y0 < 4 || (x1 - x0) * (y1 - y0) > 0.6 * s.width * s.height) continue
    const cs = getComputedStyle(n)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none' || cs.opacity === '0') continue
    at.avoid.push({ x: x0 - s.left - 8, y: y0 - s.top - 8, w: x1 - x0 + 16, h: y1 - y0 + 16 })
  }
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
const cand: Box = { x: 0, y: 0, w: 0, h: 0 }
const me: Box = { x: 0, y: 0, w: 12, h: 12 }
const spots = new Float64Array(12)
/** Six candidate spots as x, y pairs. */
function put(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, x5: number, y5: number) {
  spots[0] = x0
  spots[1] = y0
  spots[2] = x1
  spots[3] = y1
  spots[4] = x2
  spots[5] = y2
  spots[6] = x3
  spots[7] = y3
  spots[8] = x4
  spots[9] = y4
  spots[10] = x5
  spots[11] = y5
}

/**
 * Puts the card beside the pointer (below-right for a mouse, above a finger), inside the canvas,
 * never over the pointer and clear of the DOM laid over the canvas; the first spot that fits wins.
 */
function placeCard() {
  const el = at.el
  if (!el) return
  const box = el.parentElement
  const W = box?.clientWidth ?? innerWidth
  const H = box?.clientHeight ?? innerHeight
  const w = el.offsetWidth
  const h = el.offsetHeight
  const { x, y } = at
  // Six spots in order of preference: a finger's card goes above it, a mouse's below-right.
  const L = x - w - 14
  const R = x + 16
  const C = x - w / 2
  if (zs.open) put(C, y - h - 20, C, y + 28, R, y - h / 2, L, y - h / 2, R, y - h - 20, L, y + 28)
  else put(R, y + 20, L, y + 20, R, y - h - 14, L, y - h - 14, C, y - h - 18, C, y + 24)
  me.x = x - 6
  me.y = y - 6
  cand.w = w
  cand.h = h
  let bx = 8
  let by = 8
  let bestScore = Infinity
  for (let i = 0; i < 12; i += 2) {
    cand.x = Math.max(8, Math.min(W - w - 8, spots[i]))
    cand.y = Math.max(8, Math.min(H - h - 8, spots[i + 1]))
    let score = overlap(cand, me) > 0 ? 1e7 : 0
    for (const a of at.avoid) score += overlap(cand, a)
    if (score < bestScore) {
      bx = cand.x
      by = cand.y
      bestScore = score
      if (score === 0) break
    }
  }
  el.style.transform = `translate(${Math.round(bx)}px, ${Math.round(by)}px)`
}

// ── Entering: a short glide toward the zone, a fade to the page, then the portal ──

const GLIDE_MS = 550
const FADE_MS = 250
/** Where the camera heads when a zone is entered. */
const CENTRE: Record<ZoneId, Vector3> = { lab: new Vector3(LAB_X, 0.4, 0), net: new Vector3(NET_X, 0.4, 0) }
const goFns = new Set<(to: Vector3 | null) => void>()
/** For the camera rig: a point to glide toward, or null to return to the hero framing at once. */
export const onZoneGo = (f: (to: Vector3 | null) => void) => {
  goFns.add(f)
  return () => {
    goFns.delete(f)
  }
}

/** The host page's own background, for the fade. */
function pageBg() {
  for (const el of [document.body, document.documentElement]) {
    const c = getComputedStyle(el).backgroundColor
    if (c && c !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(c)) return c
  }
  return '#f7f5f0'
}

/** Glide toward the zone and fade to the page over GLIDE_MS, then open its portal. Clicks meanwhile are ignored. */
function go(id: ZoneId, from: Element | null) {
  if (zs.going) return
  const role = ROLE[id]
  const root = from?.closest<HTMLElement>('.demo-a1') ?? null
  root?.removeAttribute('data-zone')
  document.body.style.cursor = ''
  if (reducedMotion() || !root) {
    setZone({ hover: null, open: null, hint: null })
    enter(role)
    return
  }
  setZone({ going: id, hover: null, open: null, hint: null })
  goFns.forEach(f => f(CENTRE[id]))
  const veil = document.createElement('div')
  veil.className = 'a1-zone-veil'
  veil.style.background = pageBg()
  root.appendChild(veil)
  const fade = veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, delay: GLIDE_MS - FADE_MS, easing: 'ease-in', fill: 'forwards' })
  window.setTimeout(() => {
    enter(role)
    // Still on this page (the landing scrolls to its researcher list): back to the hero framing under the veil, then lift it.
    window.setTimeout(() => {
      setZone({ going: null })
      if (!veil.isConnected) return
      goFns.forEach(f => f(null))
      fade.cancel()
      veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-out', fill: 'forwards' }).onfinish = () => veil.remove()
    }, 200)
  }, GLIDE_MS)
}

// ── In the scene: one hit box and one highlight per plinth ───────────────

const hitMat = new MeshBasicMaterial({ visible: false })
const noRay = () => {}

const liftVert = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`
// Adds light (rim-weighted) and darkens by uDim: out = add + dst * (1 - uDim).
const liftFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uFlat;
uniform float uRim;
uniform float uDim;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
  float rim = f * f * f;
  gl_FragColor = vec4(uColor * (uFlat + uRim * rim), uDim);
}`

const haloVert = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
// A crisp line just outside the plinth's top edge, and a soft glow falling off outward.
const haloFrag = /* glsl */ `
uniform vec2 uHalf;
uniform float uK;
uniform vec3 uColor;
varying vec2 vP;
void main() {
  vec2 q = abs(vP) - uHalf + 0.08;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.08;
  if (d < -0.005) discard;
  float line = 1.0 - smoothstep(0.012, 0.05, abs(d - 0.03));
  float glow = exp(-max(d, 0.0) * 4.5) * (1.0 - smoothstep(0.5, 0.7, d));
  gl_FragColor = vec4(uColor, uK * (0.9 * line + 0.42 * glow));
}`
const HALO_PAD = 0.75

/**
 * One plinth as a single target. Mount it in the plinth's JSX with the plinth's
 * merged geometry; it renders nothing outside zone mode.
 */
export function Zone({ id, geo }: { id: ZoneId; geo: BufferGeometry }) {
  const on = useZones()
  const settled = useEmbed(s => s.settled)
  const gl = useThree(s => s.gl)
  const down = useRef('mouse')
  const lift = useRef<Mesh>(null)
  const halo = useRef<Mesh>(null)
  const st = useMemo(() => ({ lift: 0, dim: 0 }), [])
  const parts = useMemo(() => {
    const b = BOX[id]
    const l = LIFT[id]
    return {
      hit: new BoxGeometry(b.w, b.y1 - b.y0, b.d),
      hitY: (b.y0 + b.y1) / 2,
      x: b.x,
      plane: new PlaneGeometry(b.w + 2 * HALO_PAD, b.d + 2 * HALO_PAD),
      liftMat: new ShaderMaterial({
        vertexShader: liftVert,
        fragmentShader: liftFrag,
        uniforms: { uColor: { value: new Color(l.color) }, uFlat: { value: 0 }, uRim: { value: 0 }, uDim: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
      haloMat: new ShaderMaterial({
        vertexShader: haloVert,
        fragmentShader: haloFrag,
        uniforms: { uHalf: { value: [b.w / 2, b.d / 2] }, uK: { value: 0 }, uColor: { value: new Color('#FFFFFF') } },
        transparent: true,
        depthWrite: false,
      }),
    }
  }, [id])
  useEffect(
    () => () => {
      parts.hit.dispose()
      parts.plane.dispose()
      parts.liftMat.dispose()
      parts.haloMat.dispose()
    },
    [parts],
  )

  useFrame((_, dt) => {
    if (!on) return
    const lit = litZone()
    const k = Math.min(dt, 0.1)
    st.lift = MathUtils.damp(st.lift, lit === id ? 1 : 0, EASE, k)
    st.dim = MathUtils.damp(st.dim, lit && lit !== id ? 1 : 0, EASE, k)
    if (st.lift < 0.002) st.lift = lit === id ? st.lift : 0
    if (st.dim < 0.002) st.dim = lit && lit !== id ? st.dim : 0
    const u = parts.liftMat.uniforms
    const l = LIFT[id]
    u.uFlat.value = l.flat * st.lift
    u.uRim.value = l.rim * st.lift
    u.uDim.value = DIM * st.dim
    parts.haloMat.uniforms.uK.value = st.lift
    if (lift.current) lift.current.visible = st.lift > 0 || st.dim > 0
    if (halo.current) halo.current.visible = st.lift > 0
  })

  useEffect(() => {
    if (!on) return
    return () => {
      if (zs.hover === id) document.body.style.cursor = ''
      if (zs.hover === id || zs.open === id || zs.going === id || zs.hint === id) setZone({ hover: null, open: null, going: null, hint: null })
    }
  }, [on, id])

  // While the opening crane plays the plinths don't take the pointer yet.
  if (!on || !settled) return null

  const root = () => gl.domElement.closest('.demo-a1')
  const point = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    at.x = e.nativeEvent.offsetX
    at.y = e.nativeEvent.offsetY
  }
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.nativeEvent.pointerType === 'touch' || zs.going) return
    point(e)
    findAvoid()
    setZone({ hover: id })
    placeCard()
    root()?.setAttribute('data-zone', id)
    document.body.style.cursor = 'pointer'
  }
  const move = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.nativeEvent.pointerType === 'touch' || zs.hover !== id || zs.going) return
    point(e)
    placeCard()
  }
  const out = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (zs.going) return
    if (zs.hover === id) setZone({ hover: null })
    const r = root()
    if (r?.getAttribute('data-zone') === id) r.removeAttribute('data-zone')
    document.body.style.cursor = ''
  }
  const press = (e: ThreeEvent<PointerEvent>) => {
    down.current = e.nativeEvent.pointerType
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 6 || zs.going) return
    if (down.current === 'touch') {
      // First tap opens the card with a real button; the document listener in ZoneCard closes it.
      point(e)
      findAvoid()
      at.tapped = true
      setZone({ open: id, hover: null })
      placeCard()
      return
    }
    go(id, gl.domElement)
  }

  return (
    <>
      <mesh
        geometry={parts.hit}
        material={hitMat}
        position={[parts.x, parts.hitY, 0]}
        onPointerOver={over}
        onPointerMove={move}
        onPointerOut={out}
        onPointerDown={press}
        onClick={click}
      />
      <mesh ref={lift} geometry={geo} material={parts.liftMat} visible={false} renderOrder={2} raycast={noRay} />
      <mesh
        ref={halo}
        geometry={parts.plane}
        material={parts.haloMat}
        position={[parts.x, 0.002, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        renderOrder={3}
        raycast={noRay}
      />
    </>
  )
}

// ── On the stage: a name over each plinth ────────────────────────────────

/** Each name sits on the middle of its plinth's top edge that's highest on screen: the back edge on a wide stage, whichever faces up on a tall one. */
const EDGES: Record<ZoneId, Vector3[]> = Object.fromEntries(
  (['lab', 'net'] as ZoneId[]).map(id => {
    const b = BOX[id]
    const y = id === 'lab' ? b.y1 : b.y1 - 0.4
    const x0 = b.x - b.w / 2
    const x1 = b.x + b.w / 2
    return [id, [new Vector3(b.x, y, -b.d / 2), new Vector3(b.x, y, b.d / 2), new Vector3(x0, y, 0), new Vector3(x1, y, 0)]]
  }),
) as Record<ZoneId, Vector3[]>
const NAME: Record<ZoneId, { text: string; label: string }> = {
  lab: { text: 'Research lab', label: 'Research lab: open the research portal' },
  net: { text: 'Grant manager network', label: 'Grant manager network: open the grant manager portal' },
}
const pinEls: Record<ZoneId, HTMLButtonElement | null> = { lab: null, net: null }
const _p = new Vector3()
const spot: Record<ZoneId, { x: number; y: number }> = { lab: { x: 0, y: 0 }, net: { x: 0, y: 0 } }

/** In the Canvas: puts each name where its plinth's back edge is on screen, every frame (the crane moves the camera). */
export function ZonePins() {
  const on = useZones()
  useFrame(({ camera, size }) => {
    if (!on) return
    const tall = size.width / size.height < 0.85
    for (const id of ['lab', 'net'] as ZoneId[]) {
      const at = spot[id]
      at.y = Infinity
      for (const e of EDGES[id]) {
        _p.copy(e).project(camera)
        const sy = ((1 - _p.y) / 2) * size.height
        if (sy < at.y) {
          at.y = sy
          at.x = ((_p.x + 1) / 2) * size.width
        }
      }
    }
    // Wide: both just above the higher of the two edges, in one line. Tall (the plinths stacked): each astride its own edge, as the gap between them is narrow.
    const top = Math.min(spot.lab.y, spot.net.y)
    for (const id of ['lab', 'net'] as ZoneId[]) {
      const el = pinEls[id]
      if (!el) continue
      const y = tall ? spot[id].y : top
      el.style.transform = `translate(${spot[id].x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, ${tall ? '-50%' : 'calc(-100% - 10px)'})`
      el.dataset.placed = ''
    }
  })
  return null
}

/** Beside the Canvas: the two names, buttons that light their side as they're pointed at and open its portal. */
export function ZoneLabels() {
  const on = useZones()
  const settled = useEmbed(s => s.settled)
  const lit = useLitZone()
  if (!on) return null
  return (
    <div className="a1-zone-pins" data-on={settled ? '' : undefined}>
      {(['lab', 'net'] as ZoneId[]).map(id => (
        <button
          key={id}
          type="button"
          className="a1-zone-pin"
          data-lit={lit === id ? '' : undefined}
          aria-label={NAME[id].label}
          tabIndex={settled ? 0 : -1}
          ref={el => {
            pinEls[id] = el
          }}
          onPointerEnter={e => e.pointerType !== 'touch' && hintZone(id)}
          onPointerLeave={() => hintZone(null)}
          onFocus={() => hintZone(id)}
          onBlur={() => hintZone(null)}
          onClick={e => go(id, e.currentTarget)}
        >
          {NAME[id].text}
        </button>
      ))}
    </div>
  )
}

// ── On the stage: the card ───────────────────────────────────────────────

/** The portal card. Mount it beside the scene's hover card, outside the Canvas. */
export function ZoneCard() {
  const on = useZones()
  const s = useSyncExternalStore(subscribe, getZone)
  const last = useRef<ZoneId>('lab')
  const id = s.going ? null : (s.open ?? s.hover)
  if (id) last.current = id
  const shown = id ?? last.current
  const touch = !!s.open

  useLayoutEffect(() => {
    if (id) placeCard()
  }, [id, touch])

  // On touch, a tap anywhere but the card (or a zone, which re-opens it) closes the card.
  useEffect(() => {
    if (!touch) return
    const onClick = (e: MouseEvent) => {
      if (at.tapped) {
        at.tapped = false
        return
      }
      if (at.el && e.target instanceof Node && at.el.contains(e.target)) return
      setZone({ open: null })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZone({ open: null })
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [touch])

  if (!on) return null
  const w = WORDS[shown]
  return (
    <div
      className="a1-zone"
      data-float="zone-card"
      data-zone={id ?? undefined}
      data-on={id ? '' : undefined}
      data-touch={touch ? '' : undefined}
      aria-hidden={touch ? undefined : true}
      ref={el => {
        at.el = el
      }}
    >
      <div className="a1-card a1-zone-card" role={touch ? 'dialog' : undefined} aria-label={touch ? w.title : undefined}>
        <span className="a1-card-name a1-zone-title">{w.title}</span>
        <span className="a1-card-line">{w.line}</span>
        {touch ? (
          <button
            type="button"
            className="a1-zone-go"
            onClick={() => {
              if (s.open) go(s.open, at.el)
            }}
          >
            {w.button}&nbsp;<span aria-hidden="true">→</span>
          </button>
        ) : (
          <span className="a1-zone-cue">Click to enter →</span>
        )}
      </div>
    </div>
  )
}
