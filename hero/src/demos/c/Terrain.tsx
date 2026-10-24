// The land and the money in it: terrain mesh, the freeze/thaw state machine
// for each grant landform, meltwater pools, the court path, and the money
// rings that label a landform's levels on hover.

import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { feed, useFlow, usd, type Grant } from '../../feed'
import { AGENT_SPOTS, frostSeed, grantPath, HOUSES, LODGE, MESA_BASE, mesaHeights, MESAS, terrainHeight, UNIT } from './layout'
import { buildTerrainGeometry, poolMaterial, terrainMaterial, trailMaterial } from './terrainMaterial'
import { ui, useUI } from './store'

/** Per-landform animation state, advanced in feed time so it pauses and speeds up with the story. */
export const fx = MESAS.map(() => ({ frost: 0, thaw: 0, melt: 0, court: 0, water: 0, pool: 0, hover: 0 }))
const resetFx = () => fx.forEach(f => Object.assign(f, { frost: 0, thaw: 0, melt: 0, court: 0, water: 0, pool: 0 }))

const FROST_FULL = 1.35
const THAW_FULL = 1.75

function step(g: Grant | undefined, f: (typeof fx)[number], dt: number) {
  if (!g) return
  if (g.frozen) {
    f.thaw = 0
    f.frost = Math.min(FROST_FULL, f.frost + dt * 0.2)
    f.court = g.status === 'restored_by_court' ? Math.min(1, f.court + dt * 0.4) : Math.max(0, f.court - dt)
    f.melt = Math.max(0, f.melt - dt * 0.5)
    f.water = Math.max(0, f.water - dt)
    return
  }
  if (f.frost > 0) {
    // Money landed: water runs in along the court path, then the ice gives way from the top down.
    f.court = Math.max(f.court, 1)
    f.water = Math.min(1, f.water + dt * 0.75)
    if (f.water >= 1) {
      f.thaw = Math.min(THAW_FULL, f.thaw + dt * 0.24)
      f.melt = Math.min(1, f.melt + dt * 0.8)
    }
    if (f.thaw >= THAW_FULL) {
      f.frost = 0
      f.thaw = 0
    }
  } else {
    f.melt = Math.max(0, f.melt - dt * 0.07)
    f.water = Math.max(0, f.water - dt * 0.12)
    f.court = Math.max(0, f.court - dt * 0.12)
  }
  const poolTarget = f.melt > 0.02 ? 1 : f.pool > 0 ? 0.4 : 0
  f.pool += (poolTarget - f.pool) * Math.min(1, dt * 0.35)
}

export function Terrain() {
  const geometry = useMemo(buildTerrainGeometry, [])
  const material = useMemo(() => {
    const lamps = [
      ...HOUSES.map(h => new THREE.Vector3(h.x, terrainHeight(h.x, h.z) + 0.7, h.z + 0.6)),
      ...Object.values(AGENT_SPOTS).map(s => new THREE.Vector3(s.x, terrainHeight(s.x, s.z) + 0.8, s.z + 0.6)),
      new THREE.Vector3(LODGE.x, terrainHeight(LODGE.x, LODGE.z) + 0.6, LODGE.z + 0.5),
    ]
    const m = terrainMaterial(lamps)
    m.uniforms.uSeed0.value.copy(frostSeed(0))
    m.uniforms.uSeed1.value.copy(frostSeed(1))
    return m
  }, [])
  const last = useRef(feed.now())

  useFlow(e => {
    if (e.type === 'reset') resetFx()
  })

  useFrame((state, delta) => {
    const w = feed.getWorld()
    const now = feed.now()
    const dt = Math.min(0.25, Math.max(0, (now - last.current) / 1000))
    last.current = now
    const s = ui.get()
    MESAS.forEach((m, i) => {
      const g = w.grants.find(x => x.id === m.id)
      if (g) mesaHeights[i] += (g.available / UNIT - mesaHeights[i]) * Math.min(1, delta * 2.2)
      step(g, fx[i], dt)
      const lit = s.hovered === `g:${m.id}` || s.selected === `g:${m.id}` ? 1 : 0
      fx[i].hover += (lit - fx[i].hover) * Math.min(1, delta * 6)
    })
    const u = material.uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uH.value.set(mesaHeights[0], mesaHeights[1])
    u.uFx0.value.set(fx[0].frost, fx[0].thaw, fx[0].melt, fx[0].hover)
    u.uFx1.value.set(fx[1].frost, fx[1].thaw, fx[1].melt, fx[1].hover)
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

export function Pools() {
  const items = useMemo(
    () =>
      MESAS.map(m => {
        const mat = poolMaterial(m.R)
        const geo = new THREE.CircleGeometry(m.R * 1.6, 72)
        return { m, mat, geo }
      }),
    [],
  )
  const refs = useRef<(THREE.Mesh | null)[]>([])
  useFrame(state => {
    items.forEach((it, i) => {
      const mesh = refs.current[i]
      if (!mesh) return
      const lv = fx[i].pool
      mesh.visible = lv > 0.01
      mesh.position.y = MESA_BASE - 0.2 + 0.32 * lv
      it.mat.uniforms.uLevel.value = lv
      it.mat.uniforms.uTime.value = state.clock.elapsedTime
    })
  })
  return (
    <>
      {items.map((it, i) => (
        <mesh
          key={it.m.id}
          ref={el => {
            refs.current[i] = el
          }}
          geometry={it.geo}
          material={it.mat}
          position={[it.m.cx, MESA_BASE - 0.2, it.m.cz]}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        />
      ))}
    </>
  )
}

/** The court order's thin lit path up the ice, and the meltwater that follows it when money lands. */
export function GrantPaths() {
  const mats = useMemo(
    () =>
      MESAS.map(() => ({
        court: trailMaterial(new THREE.Color(1.3, 1.05, 0.55), { dash: 140, len: 8, alpha: 0.95 }),
        water: trailMaterial(new THREE.Color(0.55, 1.05, 1.35), { flow: 90, len: 8, alpha: 0.9 }),
      })),
    [],
  )
  const groups = useRef<(THREE.Group | null)[]>([])
  const built = useRef<(THREE.TubeGeometry[] | null)[]>(MESAS.map(() => null))

  useFlow(e => {
    if (e.type !== 'reset') return
    built.current.forEach((b, i) => {
      b?.forEach(g => g.dispose())
      built.current[i] = null
      groups.current[i]?.clear()
    })
  })

  useFrame(state => {
    MESAS.forEach((_, i) => {
      const f = fx[i]
      const grp = groups.current[i]
      if (!grp) return
      const active = f.court > 0.001 || f.water > 0.001
      if (active && !built.current[i]) {
        const curve = new THREE.CatmullRomCurve3(grantPath(i))
        const thin = new THREE.TubeGeometry(curve, 320, 0.035, 5, false)
        const wide = new THREE.TubeGeometry(curve, 320, 0.085, 6, false)
        built.current[i] = [thin, wide]
        grp.add(new THREE.Mesh(thin, mats[i].court), new THREE.Mesh(wide, mats[i].water))
      }
      grp.visible = active
      const m = mats[i]
      m.court.uniforms.uHead.value = f.court
      m.court.uniforms.uTime.value = state.clock.elapsedTime
      m.court.uniforms.uAlpha.value = Math.min(1, f.court) * (f.water > 0 ? 0.6 : 0.95)
      m.water.uniforms.uHead.value = f.water
      m.water.uniforms.uTime.value = state.clock.elapsedTime
      m.water.uniforms.uAlpha.value = f.frost > 0 ? 0.95 : Math.min(0.95, f.water * 1.2)
    })
  })

  return (
    <>
      {MESAS.map((m, i) => (
        <group
          key={m.id}
          ref={el => {
            groups.current[i] = el
          }}
        />
      ))}
    </>
  )
}

// ── Hover, click, labels ──────────────────────────────────────────────────

const ringGeo = (r: number) => {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
  }
  return new THREE.BufferGeometry().setFromPoints(pts)
}

function MesaLevels({ index }: { index: number }) {
  const m = MESAS[index]
  const id = `g:${m.id}`
  const r = m.R * 0.6
  const parts = useMemo(() => {
    const geo = ringGeo(r)
    const mk = (color: string, dash: number, gap: number) => {
      const mat = new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: gap, transparent: true, depthWrite: false, toneMapped: false })
      const line = new THREE.Line(geo, mat)
      line.computeLineDistances()
      return line
    }
    const awarded = mk('#f4e3bf', 0.35, 0.2)
    const spent = mk('#e0b46a', 0.08, 0.14)
    const top = mk('#ffd27a', 1, 0)
    // Six unit-height posts from the plateau rim up to the award ring; scaled each frame.
    const pts: number[] = []
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3
      pts.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(a) * r, 1, Math.sin(a) * r)
    }
    const struts = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
      new THREE.LineDashedMaterial({ color: '#f4e3bf', dashSize: 0.06, gapSize: 0.06, transparent: true, depthWrite: false, toneMapped: false }),
    )
    struts.computeLineDistances()
    return { awarded, spent, top, struts }
  }, [r])
  const hit = useRef<THREE.Mesh>(null)
  const label = useRef<THREE.Group>(null)
  const top = useRef<THREE.Group>(null)

  useFrame(() => {
    const g = feed.getWorld().grants.find(x => x.id === m.id)
    if (!g) return
    const h = fx[index].hover
    const yA = MESA_BASE + g.awarded / UNIT
    const yB = MESA_BASE + (g.awarded - g.spent) / UNIT
    const yC = MESA_BASE + mesaHeights[index]
    parts.awarded.position.set(m.cx, yA, m.cz)
    parts.spent.position.set(m.cx, yB, m.cz)
    parts.top.position.set(m.cx, yC + 0.04, m.cz)
    ;(parts.awarded.material as THREE.LineDashedMaterial).opacity = 0.22 + 0.7 * h
    ;(parts.spent.material as THREE.LineDashedMaterial).opacity = 0.75 * h
    ;(parts.top.material as THREE.LineDashedMaterial).opacity = 0.9 * h
    parts.struts.position.set(m.cx, yC, m.cz)
    parts.struts.scale.set(1, Math.max(0.01, yA - yC), 1)
    ;(parts.struts.material as THREE.LineDashedMaterial).opacity = 0.12 + 0.45 * h
    if (hit.current) {
      const H = Math.max(0.5, mesaHeights[index])
      hit.current.scale.set(1, H, 1)
      hit.current.position.set(m.cx, MESA_BASE + H / 2, m.cz)
    }
    label.current?.position.set(m.cx + (m.cx > 0 ? -1 : 1) * r * 0.8, yA, m.cz + r * 0.7)
    top.current?.position.set(m.cx, yC + 0.5, m.cz)
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    ui.set({ hovered: id })
  }
  const out = () => ui.get().hovered === id && ui.set({ hovered: null })

  return (
    <>
      <primitive object={parts.awarded} />
      <primitive object={parts.spent} />
      <primitive object={parts.top} />
      <primitive object={parts.struts} />
      <mesh
        ref={hit}
        onPointerOver={over}
        onPointerOut={out}
        onClick={e => {
          e.stopPropagation()
          ui.select(id)
        }}
      >
        <cylinderGeometry args={[m.R * 0.92, m.R * 1.05, 1, 24, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <group ref={label}>
        <LevelsLabel grantId={m.id} />
      </group>
      <group ref={top}>
        <GrantTag grantId={m.id} />
      </group>
    </>
  )
}

function useGrant(grantId: string) {
  const [g, setG] = useState(() => feed.getWorld().grants.find(x => x.id === grantId))
  useFlow(e => {
    if (e.type === 'grant' && e.grant.id === grantId) setG(e.grant)
    if (e.type === 'reset') setG(feed.getWorld().grants.find(x => x.id === grantId))
  })
  return g
}

function LevelsLabel({ grantId }: { grantId: string }) {
  const g = useGrant(grantId)
  const on = useUI(s => s.hovered === `g:${grantId}`)
  const left = (MESAS.find(m => m.id === grantId)?.cx ?? 0) > 0
  if (!g) return null
  return (
    <Html zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
      <dl className={`c-levels${on ? ' is-on' : ''}${left ? ' is-left' : ''}`} aria-hidden={!on}>
        <div>
          <dt>Awarded</dt>
          <dd className="c-num">{usd(g.awarded)}</dd>
        </div>
        <div>
          <dt>Spent</dt>
          <dd className="c-num">−{usd(g.spent)}</dd>
        </div>
        <div>
          <dt>Promised</dt>
          <dd className="c-num">−{usd(g.promised)}</dd>
        </div>
        <div className="is-total">
          <dt>Truly available</dt>
          <dd className="c-num">{usd(g.available)}</dd>
        </div>
        <p>Dashed ring: the award. Plateau: what is left to spend. One contour = $25,000.</p>
      </dl>
    </Html>
  )
}

export const statusWord = (g: Grant) =>
  g.frozen ? (g.status === 'restored_by_court' ? 'Restored by court, still frozen' : 'Canceled, frozen') : g.status === 'restored_by_court' ? 'Restored and paid' : g.status === 'ended' ? 'Ended' : 'Active'

function GrantTag({ grantId }: { grantId: string }) {
  const g = useGrant(grantId)
  const on = useUI(s => s.hovered === `g:${grantId}`)
  if (!g) return null
  return (
    <Html center zIndexRange={[14, 0]}>
      <button
        type="button"
        tabIndex={-1}
        className={`c-tag c-tag--grant${g.frozen ? ' is-frozen' : ''}${on ? ' is-on' : ''}`}
        onClick={() => ui.select(`g:${grantId}`)}
        onPointerEnter={() => ui.set({ hovered: `g:${grantId}` })}
        onPointerLeave={() => ui.get().hovered === `g:${grantId}` && ui.set({ hovered: null })}
      >
        <span className="c-tag__name c-id">{g.id}</span>
        <span className="c-tag__elev">
          <span className="c-num">{usd(g.available)}</span> truly available
        </span>
        <span className="c-tag__status">{statusWord(g)}</span>
      </button>
    </Html>
  )
}

export function MesaLevelsAll() {
  return (
    <>
      {MESAS.map((m, i) => (
        <MesaLevels key={m.id} index={i} />
      ))}
    </>
  )
}
