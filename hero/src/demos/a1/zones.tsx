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
  type BufferGeometry,
  type Mesh,
} from 'three'
import { embed, useEmbed, type Role } from './embed'
import { LAB_BOX, LAB_X, NET_BOX, NET_X } from './layout'
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
}
let zs: ZoneState = { hover: null, open: null }
const subs = new Set<() => void>()
const setZone = (p: Partial<ZoneState>) => {
  const n = { ...zs, ...p }
  if (n.hover === zs.hover && n.open === zs.open) return
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
const litZone = () => zs.open ?? zs.hover

/** The pointer on the stage, px. The hit boxes write it; the card reads it. */
const at = { x: 0, y: 0, el: null as HTMLDivElement | null, tapped: false }

/** Puts the card beside the pointer, never under it: below-right for a mouse, above a finger. */
function placeCard() {
  const el = at.el
  if (!el) return
  const box = el.parentElement
  const W = box?.clientWidth ?? innerWidth
  const H = box?.clientHeight ?? innerHeight
  const w = el.offsetWidth
  const h = el.offsetHeight
  let x: number
  let y: number
  if (zs.open) {
    x = at.x - w / 2
    y = at.y - h - 20
    if (y < 8) y = at.y + 28
  } else {
    x = at.x + 16
    y = at.y + 20
    if (x + w > W - 8) x = at.x - w - 14
    if (y + h > H - 8) y = at.y - h - 14
  }
  x = Math.max(8, Math.min(W - w - 8, x))
  y = Math.max(8, Math.min(H - h - 8, y))
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
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
      if (zs.hover === id || zs.open === id) setZone({ hover: null, open: null })
    }
  }, [on, id])

  if (!on) return null

  const root = () => gl.domElement.closest('.demo-a1')
  const point = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    at.x = e.nativeEvent.offsetX
    at.y = e.nativeEvent.offsetY
  }
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.nativeEvent.pointerType === 'touch') return
    point(e)
    setZone({ hover: id })
    placeCard()
    root()?.setAttribute('data-zone', id)
    document.body.style.cursor = 'pointer'
  }
  const move = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.nativeEvent.pointerType === 'touch' || zs.hover !== id) return
    point(e)
    placeCard()
  }
  const out = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
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
    if (e.delta > 6) return
    if (down.current === 'touch') {
      // First tap opens the card with a real button; the document listener in ZoneCard closes it.
      point(e)
      at.tapped = true
      setZone({ open: id, hover: null })
      placeCard()
      return
    }
    enter(ROLE[id])
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

// ── On the stage: the card ───────────────────────────────────────────────

/** The portal card. Mount it beside the scene's hover card, outside the Canvas. */
export function ZoneCard() {
  const on = useZones()
  const s = useSyncExternalStore(subscribe, getZone)
  const last = useRef<ZoneId>('lab')
  const id = s.open ?? s.hover
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
              const z = s.open
              setZone({ open: null })
              if (z) enter(ROLE[z])
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
