// Everything that travels. Money is a glowing capsule in the pipes (in its
// grant's colour); a request is a small clay pill on the lab line that
// comes back glazed with its outcome; papers, invoices, holds and decisions
// are slips; readings and rechecks are beads. Packets in flight come from the
// world each frame, so a mid-story mount shows them where they are.

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BoxGeometry, CapsuleGeometry, MeshStandardMaterial, SphereGeometry, Vector3, type Mesh } from 'three'
import { feed, progress, useFlow } from '../../feed'
import type { Packet } from '../../feed'
import { GLAZE, GRANT_COLOR, PAL } from '../a1/layout'
import { DOCK, GM, LAB, LAB_R, PIPE_R, anchor } from './layout'
import { clock, ease, onFlow, st, tick, uNow } from './flow'
import { labelEls } from './Labels'

const N_BLOB = 10
const N_TOKEN = 8
const N_SLIP = 14
const N_BEAD = 12

const capsule = new CapsuleGeometry(PIPE_R * 1.35, 0.34, 6, 16)
const pill = new CapsuleGeometry(0.1, 0.2, 6, 14)
const slip = new BoxGeometry(0.3, 0.22, 0.045)
const bead = new SphereGeometry(0.075, 14, 10)

const SLIP_TONE: Record<string, string> = {
  paper: '#F6F3EC',
  invoice: '#E7D6B8',
  payment_request: '#CDE8EE',
  follow_up: '#E2E6EC',
  hold: GLAZE.hold,
}
const BEAD_TONE: Record<string, string> = { recheck: '#B9CFE6', reading: '#A9C3DD', payment: PAL.money }

const Y = new Vector3(0, 1, 0)
const X = new Vector3(1, 0, 0)
const p = new Vector3()
const a = new Vector3()
const b = new Vector3()
const tan = new Vector3()

function arc(pk: Packet, out: Vector3) {
  anchor(pk.from, a)
  anchor(pk.to, b)
  const k = ease(progress(pk))
  out.lerpVectors(a, b, k)
  const d = Math.hypot(a.x - b.x, a.z - b.z)
  out.y += Math.sin(Math.PI * k) * (0.25 + d * 0.16)
  return out
}

export function Live() {
  const GL = useMemo(() => ({ ...GLAZE }), [])
  useFlow(e => onFlow(e, GL))

  const blobMats = useMemo(() => Array.from({ length: N_BLOB }, () => new MeshStandardMaterial({ color: PAL.money, roughness: 0.3, emissiveIntensity: 0.85 })), [])
  const tokenMats = useMemo(() => Array.from({ length: N_TOKEN }, () => new MeshStandardMaterial({ color: PAL.porcelain, roughness: 0.5 })), [])
  const slipMats = useMemo(() => Array.from({ length: N_SLIP }, () => new MeshStandardMaterial({ color: '#F6F3EC', roughness: 0.7 })), [])
  const beadMats = useMemo(() => Array.from({ length: N_BEAD }, () => new MeshStandardMaterial({ color: '#A9C3DD', roughness: 0.4 })), [])
  const blobs = useRef<(Mesh | null)[]>([])
  const tokens = useRef<(Mesh | null)[]>([])
  const slips = useRef<(Mesh | null)[]>([])
  const beads = useRef<(Mesh | null)[]>([])

  useFrame(() => {
    const t = clock()
    tick(t)
    const w = feed.getWorld()

    // Money in the pipes
    let i = 0
    for (const bl of st.blobs.values()) {
      if (i >= N_BLOB) break
      const m = blobs.current[i]
      if (!m) continue
      const u = Math.min(0.999, Math.max(0.001, uNow(bl, t)))
      bl.path.getPointAt(u, p)
      bl.path.getTangentAt(u, tan)
      m.position.copy(p)
      m.quaternion.setFromUnitVectors(Y, tan.normalize())
      // Squash a little while it moves, round out when it waits.
      const moving = t < bl.t0 + bl.dur
      const s = moving ? 1 : 0.92 + 0.04 * Math.sin(t * 2.2)
      m.scale.set(s, moving ? 1.12 : 1, s)
      blobMats[i].color.set(GRANT_COLOR[bl.gid] ?? PAL.money)
      blobMats[i].emissive.set(GRANT_COLOR[bl.gid] ?? PAL.money)
      m.visible = true
      i++
    }
    for (; i < N_BLOB; i++) if (blobs.current[i]) blobs.current[i]!.visible = false

    // Requests on the lab line
    let n = 0
    const put = (u: number, color: string) => {
      const m = tokens.current[n]
      if (!m || n >= N_TOKEN) return
      LAB.getPointAt(Math.min(1, Math.max(0, u)), p)
      LAB.getTangentAt(Math.min(1, Math.max(0, u)), tan)
      m.position.set(p.x, p.y + LAB_R + 0.1, p.z)
      m.quaternion.setFromUnitVectors(Y, tan.normalize())
      tokenMats[n].color.set(color)
      m.visible = true
      n++
    }
    const travelling = new Set<string>()
    for (const pk of w.packets) {
      if ((pk.kind === 'request' || pk.kind === 'pushback') && pk.refId) {
        travelling.add(pk.refId)
        put(ease(progress(pk)), PAL.porcelain)
      } else if (pk.kind === 'verdict' && pk.outcome) put(1 - ease(progress(pk)), GLAZE[pk.outcome])
    }
    let slot = 0
    const dock = (color: string) => {
      const m = tokens.current[n]
      if (!m || n >= N_TOKEN) return
      m.position.set(DOCK.x - slot * 0.32, DOCK.y + LAB_R + 0.1, DOCK.z + slot * 0.05)
      m.quaternion.setFromUnitVectors(Y, X)
      tokenMats[n].color.set(color)
      m.visible = true
      n++
      slot++
    }
    for (const rid of st.docked.keys()) if (!travelling.has(rid)) dock(PAL.porcelain)
    let moneyHeld = false
    for (const r of w.requests) {
      if (r.state === 'submitted' && r.outcome === 'hold' && r.holdFor === 'payment') {
        moneyHeld = true
        if (!st.docked.has(r.id) && !travelling.has(r.id)) dock(GLAZE.hold)
      }
    }
    for (; n < N_TOKEN; n++) if (tokens.current[n]) tokens.current[n]!.visible = false

    // Slips and beads
    let si = 0
    let bi = 0
    for (const pk of w.packets) {
      if (pk.kind in BEAD_TONE) {
        const m = beads.current[bi]
        if (!m) continue
        arc(pk, m.position)
        const tone = pk.kind === 'reading' && /terminated/.test(pk.label) ? GLAZE.reject : pk.kind === 'reading' && /restored/.test(pk.label) ? GLAZE.accept : BEAD_TONE[pk.kind]
        beadMats[bi].color.set(tone)
        m.visible = true
        bi++
        if (bi >= N_BEAD) break
      }
    }
    for (const pk of w.packets) {
      const tone = pk.kind === 'decision' ? (pk.outcome === 'reject' ? GLAZE.reject : GLAZE.accept) : SLIP_TONE[pk.kind]
      if (!tone || si >= N_SLIP) continue
      const m = slips.current[si]
      if (!m) continue
      arc(pk, m.position)
      m.rotation.set(-0.35, 0, Math.sin(progress(pk) * Math.PI) * 0.4)
      slipMats[si].color.set(tone)
      m.visible = true
      si++
    }
    // What waits on the grant manager (a purchase waits as its capsule at the valve instead)
    let k = 0
    for (const h of w.holds) {
      if (!h.open || h.kind === 'purchase' || si >= N_SLIP) continue
      const m = slips.current[si]
      if (!m) continue
      m.position.set(GM.x + 0.42, GM.y + 0.32 + k * 0.07, GM.z + 0.05)
      m.rotation.set(-Math.PI / 2 + 0.3, 0, 0.2 - k * 0.25)
      slipMats[si].color.set(GLAZE.hold)
      m.visible = true
      si++
      k++
    }
    for (; si < N_SLIP; si++) if (slips.current[si]) slips.current[si]!.visible = false
    for (; bi < N_BEAD; bi++) if (beads.current[bi]) beads.current[bi]!.visible = false

    labelEls.get('money')?.classList.toggle('is-on', moneyHeld)
    labelEls.get('gm')?.classList.toggle('is-on', w.holds.some(h => h.open))
  })

  return (
    <group>
      {blobMats.map((m, j) => (
        <mesh key={`b${j}`} geometry={capsule} material={m} visible={false} castShadow ref={el => void (blobs.current[j] = el)} />
      ))}
      {tokenMats.map((m, j) => (
        <mesh key={`t${j}`} geometry={pill} material={m} visible={false} castShadow ref={el => void (tokens.current[j] = el)} />
      ))}
      {slipMats.map((m, j) => (
        <mesh key={`s${j}`} geometry={slip} material={m} visible={false} castShadow ref={el => void (slips.current[j] = el)} />
      ))}
      {beadMats.map((m, j) => (
        <mesh key={`d${j}`} geometry={bead} material={m} visible={false} ref={el => void (beads.current[j] = el)} />
      ))}
    </group>
  )
}

