// The grant office plinth: three agent stations (each one precise object
// with a single light), the grant manager's desk, the two grants as
// reservoirs filled to their truly available money, and the source posts.
// A frosted bell jar drops over a frozen grant and lifts when cash lands.

import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef, useState } from 'react'
import { Color, LatheGeometry, MeshStandardMaterial, Vector2, type Group, type Mesh, type MeshPhysicalMaterial, type PointLight } from 'three'
import { feed, useFlow, usd } from '../../feed'
import type { Outcome, Verdict } from '../../feed'
import {
  BOOKKEEPING,
  FUNDER,
  GM_DESK,
  OFFICE_X,
  PAL,
  PAYMENT_REPORT,
  PLINTH_D,
  PLINTH_W,
  PURCHASING,
  RESERVOIRS,
  SOURCES,
  VENDORS,
  floorOf,
  type V3,
} from './layout'
import { M } from './mats'
import { B, Chip, Cyl, Pick, useFlash } from './Parts'
import { IconCheck, IconCross, TokenIcon } from './icons'
import { fx, now, useFeed, useUi } from './store'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** A lens that brightens while its station is sending or receiving. */
function Lens({ id, p, r = 0.11, kind = 'sphere' }: { id: string; p: V3; r?: number; kind?: 'sphere' | 'disc' }) {
  const light = useRef<PointLight>(null)
  const mesh = useRef<Mesh>(null)
  useFrame(() => {
    const t = now()
    const w = feed.getWorld()
    const busy = w.packets.some(pk => pk.from === id || pk.to === id)
    const since = t - (fx.pulses.get(id) ?? -1e9)
    const flare = since >= 0 && since < 900 ? 1 - since / 900 : 0
    const level = 0.35 + (busy ? 0.45 : 0) + flare * 0.9
    if (light.current) light.current.intensity += (level * 2.4 - light.current.intensity) * 0.15
    if (mesh.current) mesh.current.scale.setScalar(1 + flare * 0.25)
  })
  return (
    <group position={p}>
      <mesh ref={mesh} material={M.lens}>
        {kind === 'sphere' ? <sphereGeometry args={[r, 24, 16]} /> : <cylinderGeometry args={[r, r, 0.04, 28]} />}
      </mesh>
      <pointLight ref={light} color={PAL.lens} intensity={0.8} distance={3.2} decay={1.6} position={[0, 0.25, 0]} />
    </group>
  )
}

// ── Purchasing: a column of rule plates that glaze pass or fail ───────────

const PLATES = 9
const plateBase = new Color(PAL.porcelain)
const plateIdle = new Color('#C9D0D8')
const platePass = new Color(PAL.celadon)
const plateFail = new Color(PAL.oxblood)

interface RuleRun {
  requestId: string
  label: string
  total: number
  verdicts: (Verdict | undefined)[]
  last: number
  outcome?: Outcome
}

const run: { cur: RuleRun | null } = { cur: null }

function Purchasing() {
  const mats = useMemo(() => Array.from({ length: PLATES }, () => new MeshStandardMaterial({ color: PAL.porcelain, roughness: 0.5 })), [])
  const target = useMemo(() => new Color(), [])
  useFrame((_, dt) => {
    const r = run.cur
    const idle = !r || now() - r.last > 5200
    for (let i = 0; i < PLATES; i++) {
      if (idle || !r) target.copy(plateBase)
      else if (i >= r.total) target.copy(plateIdle)
      else {
        const v = r.verdicts[i]
        target.copy(!v ? plateBase : v.pass ? platePass : plateFail)
      }
      mats[i].color.lerp(target, Math.min(1, dt * 9))
    }
  })
  return (
    <Pick id="a:purchasing">
      <group position={PURCHASING}>
        <B p={[0, 0.08, 0]} s={[1.12, 0.16, 1.12]} m={M.slateDeep} r={0.05} />
        <Cyl p={[0, 0.88, 0]} r={0.17} h={1.44} m={M.slate} />
        {mats.map((m, i) => (
          <B key={i} p={[0, 0.3 + i * 0.135, 0]} s={[0.86, 0.06, 0.86]} m={m} r={0.022} />
        ))}
        <B p={[0, 1.6, 0]} s={[0.98, 0.1, 0.98]} m={M.porcelain} r={0.04} />
        <Lens id="a:purchasing" p={[0, 1.72, 0]} />
      </group>
    </Pick>
  )
}

/** The rule checks as they arrive, readable next to the column. */
const ROD_FROM = 1.8
const ROD_TO = 4.6

function RulePanel() {
  const [, force] = useState(0)
  const hideAt = useRef(0)
  const rod = useRef<Group>(null)
  useFlow(e => {
    if (e.type === 'reset') {
      run.cur = null
      force(n => n + 1)
    } else if (e.type === 'rule') {
      let r = run.cur
      if (!r || r.requestId !== e.requestId || e.index === 0) {
        const req = feed.getWorld().requests.find(q => q.id === e.requestId)
        r = { requestId: e.requestId, label: req ? `${req.item.split(',')[0]} · ${usd(req.price)}` : e.requestId, total: e.total, verdicts: req ? req.verdicts.slice(0, e.index) : [], last: now() }
        run.cur = r
      }
      r.verdicts[e.index] = e.verdict
      r.total = e.total
      r.last = now()
      hideAt.current = 0
      force(n => n + 1)
    } else if (e.type === 'packet' && e.packet.kind === 'verdict' && run.cur && e.packet.refId === run.cur.requestId) {
      run.cur.outcome = e.packet.outcome
      run.cur.last = now()
      force(n => n + 1)
    }
  })
  useFrame(() => {
    const r = run.cur
    if (r && now() - r.last > 5200 && !hideAt.current) {
      hideAt.current = 1
      force(n => n + 1)
    }
  })
  const r = run.cur
  const shown = !!r && now() - r.last <= 5200
  useFrame((_, dt) => {
    const m = rod.current
    if (!m) return
    const on = !!run.cur && now() - run.cur.last <= 5200
    m.scale.y += ((on ? 1 : 0.001) - m.scale.y) * Math.min(1, dt * 7)
    m.visible = m.scale.y > 0.01
  })
  return (
    <>
    <group ref={rod} position={[PURCHASING[0], ROD_FROM, PURCHASING[2]]} scale={[1, 0.001, 1]}>
      <mesh position={[0, (ROD_TO - ROD_FROM) / 2, 0]} material={M.slateDeep} castShadow>
        <cylinderGeometry args={[0.028, 0.028, ROD_TO - ROD_FROM, 12]} />
      </mesh>
      <B p={[0, ROD_TO - ROD_FROM, 0]} s={[0.34, 0.07, 0.07]} m={M.slateDeep} r={0.02} />
    </group>
    <Html position={[PURCHASING[0], ROD_TO, PURCHASING[2]]} zIndexRange={[22, 10]} wrapperClass="a-html" pointerEvents="none">
      <div className={`a-rules${shown ? ' is-on' : ''}`} aria-live="polite">
        {r && (
          <>
            <p className="a-rules-head">
              <span>Spending rules</span>
              <span className="a-rules-req">{r.label}</span>
            </p>
            <ol>
              {Array.from({ length: r.total }, (_, i) => {
                const v = r.verdicts[i]
                return (
                  <li key={i} className={v ? (v.pass ? 'is-pass' : 'is-fail') : 'is-wait'}>
                    <span className="a-rules-mark">{v ? v.pass ? <IconCheck size={12} /> : <IconCross size={12} /> : null}</span>
                    <span>{v ? v.rule : 'Checking'}</span>
                  </li>
                )
              })}
            </ol>
            {r.outcome && (
              <p className={`a-rules-out a-word--${r.outcome}`}>
                <TokenIcon outcome={r.outcome} size={14} />
                {r.outcome === 'accept' ? 'Every rule passed' : r.outcome === 'refine' ? 'Fixable: rerouted or sent back' : r.outcome === 'reject' ? 'Blocked' : 'Held'}
              </p>
            )}
          </>
        )}
      </div>
    </Html>
    </>
  )
}

// ── Bookkeeping drum and the payment & report arch ───────────────────────

function Bookkeeping() {
  return (
    <Pick id="a:bookkeeping">
      <group position={BOOKKEEPING}>
        <Cyl p={[0, 0.06, 0]} r={0.7} h={0.12} m={M.slateDeep} seg={48} />
        <Cyl p={[0, 0.6, 0]} r={0.52} h={0.96} m={M.porcelain} seg={48} />
        {[0.34, 0.6, 0.86].map(y => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.slate}>
            <torusGeometry args={[0.523, 0.012, 8, 64]} />
          </mesh>
        ))}
        <Cyl p={[0, 1.11, 0]} r={0.57} h={0.06} m={M.clay} seg={48} />
        <B p={[0, 0.74, 0.5]} s={[0.36, 0.05, 0.08]} m={M.dark} r={0.015} />
        <Lens id="a:bookkeeping" p={[0, 1.16, 0]} r={0.15} kind="disc" />
      </group>
    </Pick>
  )
}

function PaymentReport() {
  return (
    <Pick id="a:payment_report">
      <group position={PAYMENT_REPORT}>
        <B p={[0, 0.05, 0]} s={[1.5, 0.1, 0.72]} m={M.slateDeep} r={0.03} />
        <B p={[-0.52, 0.76, 0]} s={[0.24, 1.32, 0.56]} m={M.porcelain} r={0.05} />
        <B p={[0.52, 0.76, 0]} s={[0.24, 1.32, 0.56]} m={M.porcelain} r={0.05} />
        <B p={[0, 1.5, 0]} s={[1.32, 0.24, 0.56]} m={M.porcelain} r={0.05} />
        <B p={[0, 0.56, 0]} s={[0.66, 0.04, 0.42]} m={M.clay} r={0.012} />
        {[0, 1, 2].map(i => (
          <B key={i} p={[0.02 * i, 0.595 + i * 0.016, 0.01 * i]} s={[0.44, 0.012, 0.32]} m={M.paper} r={0.004} />
        ))}
        <Lens id="a:payment_report" p={[0, 1.5, 0.3]} r={0.085} />
      </group>
    </Pick>
  )
}

// ── The grant manager's desk ──────────────────────────────────────────────

const gmCoat = new MeshStandardMaterial({ color: '#E9ECEF', roughness: 0.85 })
const gmHead = new MeshStandardMaterial({ color: '#AEB8C3', roughness: 0.85 })
const gmGeo = new LatheGeometry([new Vector2(0, 0), new Vector2(0.24, 0), new Vector2(0.25, 0.04), new Vector2(0.22, 0.6), new Vector2(0.2, 1.18), new Vector2(0.09, 1.32), new Vector2(0, 1.34)], 40)

function GrantManager() {
  const open = useFeed(w => w.holds.reduce((n, h) => n + (h.open ? 1 : 0), 0))
  const closed = useFeed(w => w.holds.reduce((n, h) => n + (h.open ? 0 : 1), 0))
  return (
    <Pick id="p:grant_manager">
      <group position={GM_DESK}>
        <B p={[0, 0.76, 0]} s={[1.5, 0.07, 0.76]} m={M.porcelain} r={0.025} />
        <B p={[-0.68, 0.37, 0]} s={[0.07, 0.74, 0.7]} m={M.clay} r={0.02} />
        <B p={[0.68, 0.37, 0]} s={[0.07, 0.74, 0.7]} m={M.clay} r={0.02} />
        <B p={[0, 0.48, 0.3]} s={[1.3, 0.46, 0.04]} m={M.clay} r={0.015} />
        <B p={[-0.35, 0.815, 0.04]} s={[0.46, 0.04, 0.34]} m={M.slate} r={0.012} />
        {Array.from({ length: Math.min(open, 6) }, (_, i) => (
          <B key={`o${i}`} p={[-0.35, 0.85 + i * 0.022, 0.04]} s={[0.38, 0.014, 0.27]} m={M.glazeHold} r={0.004} />
        ))}
        {Array.from({ length: Math.min(closed, 6) }, (_, i) => (
          <B key={`c${i}`} p={[0.36, 0.81 + i * 0.016, 0.02]} s={[0.36, 0.012, 0.26]} m={M.paper} r={0.004} rot={[0, 0.08 * (i % 2), 0]} />
        ))}
        <group position={[0, 0, -0.62]}>
          <mesh geometry={gmGeo} material={gmCoat} castShadow receiveShadow />
          <mesh position={[0, 1.5, 0]} material={gmHead} castShadow>
            <sphereGeometry args={[0.15, 28, 20]} />
          </mesh>
        </group>
      </group>
    </Pick>
  )
}

// ── Grants as reservoirs, and the bell jar ───────────────────────────────

const vesselGeo = new LatheGeometry(
  [new Vector2(0, 0), new Vector2(0.8, 0), new Vector2(0.86, 0.05), new Vector2(0.86, 0.98), new Vector2(0.83, 1.04), new Vector2(0.77, 1.04), new Vector2(0.745, 0.98), new Vector2(0.745, 0.12), new Vector2(0, 0.12)],
  64,
)
const jarGeo = new LatheGeometry(
  [new Vector2(1.0, 0), new Vector2(1.0, 1.25), new Vector2(0.98, 1.42), new Vector2(0.91, 1.62), new Vector2(0.77, 1.8), new Vector2(0.54, 1.93), new Vector2(0.26, 2.0), new Vector2(0.001, 2.02)],
  64,
)
const iceColor = new Color(PAL.ice)
const moneyColor = new Color(PAL.money)

function Reservoir({ gid }: { gid: string }) {
  const p = RESERVOIRS[gid]
  const fill = useRef<Mesh>(null)
  const jar = useRef<Group>(null)
  const tag = useRef<Group>(null)
  const fillMat = useMemo(() => M.money.clone(), [])
  const jarMat = useMemo(() => {
    const m = M.glass.clone() as MeshPhysicalMaterial
    m.color.set('#E7EEF5')
    m.roughness = 0.42
    m.opacity = 0
    return m
  }, [])
  const st = useRef({ seen: false, frozen: false, at: -1e9 })
  useFlow(e => {
    if (e.type === 'reset') st.current = { seen: false, frozen: false, at: -1e9 }
  })

  useFrame((_, dt) => {
    const g = feed.getWorld().grants.find(x => x.id === gid)
    if (!g || !fill.current || !jar.current || !tag.current) return
    const t = now()
    const ratio = clamp01(g.available / g.awarded)
    const h = Math.max(0.02, 0.84 * ratio)
    const s = st.current
    if (!s.seen) {
      // Mounting mid-story: show the current state as settled, no drop.
      s.seen = true
      s.frozen = g.frozen
      s.at = -1e9
      fill.current.scale.y = h
      fillMat.color.copy(g.frozen ? iceColor : moneyColor)
    }
    const cur = fill.current.scale.y
    const next = cur + (h - cur) * Math.min(1, dt * 3)
    fill.current.scale.y = next
    fill.current.position.y = 0.12 + next / 2
    fillMat.color.lerp(g.frozen ? iceColor : moneyColor, Math.min(1, dt * 2))

    if (g.frozen !== s.frozen) {
      s.frozen = g.frozen
      // Freezing is immediate; thawing waits for the coin to land first.
      s.at = t + (g.frozen ? 0 : 750)
      if (g.frozen) fx.ripples.push({ pos: floorOf(`g:${gid}`), color: '#EEF4FA', at: t + 760, size: 2.6, ms: 1300 })
    }
    const k = t - s.at
    let y: number
    let op: number
    if (s.frozen) {
      const d = clamp01(k / 1100)
      const fall = d < 0.72 ? (d / 0.72) ** 2 : 1 - 0.07 * Math.sin(((d - 0.72) / 0.28) * Math.PI)
      y = 3.4 * (1 - fall)
      op = 0.12 + 0.46 * clamp01(k / 1500)
      if (s.at < -1e8) {
        y = 0
        op = 0.58
      }
    } else {
      const d = clamp01(k / 1400)
      y = 3.6 * easeInOut(d)
      op = k < 0 ? 0.58 : 0.58 * (1 - d)
      if (s.at < -1e8) op = 0
    }
    jar.current.position.y = y
    jarMat.opacity = op
    jar.current.visible = op > 0.01
    const court = g.frozen && g.status === 'restored_by_court'
    const ts = tag.current.scale.x + ((court ? 1 : 0) - tag.current.scale.x) * Math.min(1, dt * 5)
    tag.current.scale.setScalar(ts)
    tag.current.visible = ts > 0.02
  })

  return (
    <Pick id={`g:${gid}`}>
      <group position={p}>
        <Cyl p={[0, 0.03, 0]} r={1.08} h={0.06} m={M.slateDeep} seg={64} />
        <mesh geometry={vesselGeo} material={M.chalk} castShadow receiveShadow position={[0, 0.06, 0]} />
        <mesh ref={fill} material={fillMat} position={[0, 0.5, 0]} receiveShadow>
          <cylinderGeometry args={[0.742, 0.742, 1, 56]} />
        </mesh>
        <group ref={jar} position={[0, 3.4, 0]}>
          <mesh geometry={jarGeo} material={jarMat} position={[0, 0.06, 0]} renderOrder={2} />
          <mesh position={[0, 2.16, 0]} material={jarMat} renderOrder={2}>
            <sphereGeometry args={[0.1, 20, 14]} />
          </mesh>
          <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]} material={jarMat} renderOrder={2}>
            <torusGeometry args={[1.0, 0.035, 10, 72]} />
          </mesh>
        </group>
        <group ref={tag} position={[0.15, 0, 1.08]} scale={0}>
          <B p={[0, 0.5, 0]} s={[0.56, 0.4, 0.014]} m={M.paper} r={0.005} rot={[-0.22, 0, 0.04]} />
          <B p={[0, 0.6, 0.03]} s={[0.4, 0.035, 0.006]} m={M.slate} r={0.002} rot={[-0.22, 0, 0.04]} />
          <B p={[-0.04, 0.5, 0.05]} s={[0.32, 0.025, 0.006]} m={M.clayDeep} r={0.002} rot={[-0.22, 0, 0.04]} />
        </group>
      </group>
      <GrantChip gid={gid} at={[p[0], 2.45, p[2]]} side={Object.keys(RESERVOIRS).indexOf(gid) === 0 ? 'l' : 'r'} />
    </Pick>
  )
}

function GrantChip({ gid, at, side }: { gid: string; at: V3; side: 'l' | 'r' }) {
  const g = useFeed(w => w.grants.find(x => x.id === gid))
  const on = useUi(s => s.hovered === `g:${gid}` || s.selected === `g:${gid}`)
  if (!g) return null
  const state = !g.frozen ? (g.status === 'active' ? 'Active' : g.status === 'restored_by_court' ? 'Restored and paid' : g.status) : g.status === 'restored_by_court' ? 'Restored by court,\nstill frozen' : 'Canceled,\nspending frozen'
  return (
    <Html position={at} zIndexRange={[23, 21]} wrapperClass="a-html" pointerEvents="none">
      <div className={`a-chip a-chip--grant${g.frozen ? ' is-frozen' : ''}${on ? ' is-on' : ''}`} data-side={side}>
        <span className="a-chip-id">{g.id}</span>
        <span className="a-chip-money">
          <span>Truly available</span> {usd(g.available)}
        </span>
        <span className="a-chip-state">{state}</span>
      </div>
    </Html>
  )
}

// ── Sources, vendors, funder ─────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  's:reporter': 'NIH RePORTER',
  's:usaspending': 'USAspending',
  's:cancellations': 'Cancellation list (Apify)',
  's:court': 'Court notice',
  's:payments': 'Payment system',
}

function SourcePost({ id, p, lift }: { id: string; p: V3; lift: number }) {
  const cap = useRef<Mesh>(null)
  const flash = useFlash(id)
  const on = useUi(s => s.hovered === id || s.selected === id)
  useFrame(() => {
    if (!cap.current) return
    const since = now() - (fx.pulses.get(id) ?? -1e9)
    cap.current.position.y = 1.13 + (since >= 0 && since < 600 ? 0.08 * Math.sin((since / 600) * Math.PI) : 0)
  })
  return (
    <Pick id={id}>
      <group position={p}>
        <Cyl p={[0, 0.04, 0]} r={0.2} h={0.08} m={M.slateDeep} />
        <Cyl p={[0, 0.6, 0]} r={0.06} h={1.04} m={M.porcelain} seg={16} />
        <mesh ref={cap} position={[0, 1.13, 0]} material={M.chalk} castShadow>
          <cylinderGeometry args={[0.17, 0.17, 0.07, 28]} />
        </mesh>
      </group>
      <Html position={[p[0], 4.0 + lift, p[2]]} zIndexRange={[20, 10]} wrapperClass="a-html" pointerEvents="none">
        <div className={`a-chip a-chip--dark a-chip--source${flash || on ? '' : ' is-hidden'}`}>
          <span className="a-chip-title">{SOURCE_LABEL[id]}</span>
        </div>
      </Html>
    </Pick>
  )
}

function Vendors() {
  const [x, y, z] = VENDORS
  return (
    <Pick id="v:vendors">
      <B p={[x, y - 0.3, z]} s={[2.3, 0.6, 2.1]} m={M.clayDeep} r={0.1} />
      <B p={[x - 0.35, y + 0.22, z - 0.1]} s={[0.6, 0.44, 0.55]} m={M.porcelain} r={0.04} />
      <B p={[x + 0.32, y + 0.17, z + 0.2]} s={[0.5, 0.34, 0.5]} m={M.chalk} r={0.04} />
      <B p={[x - 0.3, y + 0.6, z - 0.08]} s={[0.46, 0.32, 0.44]} m={M.clay} r={0.04} />
      <Chip id="v:vendors" at={[x, y + 1.25, z]} title="Vendors" sub="Orders and invoices" minor hoverSub />
    </Pick>
  )
}

function Funder() {
  const [x, y, z] = FUNDER
  return (
    <Pick id="p:funder">
      <B p={[x, y - 0.3, z]} s={[2.3, 0.6, 2.1]} m={M.clayDeep} r={0.1} />
      <B p={[x, y + 0.06, z]} s={[1.5, 0.12, 1.0]} m={M.porcelain} r={0.03} />
      {[-0.5, -0.17, 0.17, 0.5].map(cx => (
        <Cyl key={cx} p={[x + cx, y + 0.47, z + 0.3]} r={0.065} h={0.72} m={M.porcelain} seg={16} />
      ))}
      <B p={[x, y + 0.47, z - 0.15]} s={[1.3, 0.72, 0.5]} m={M.chalk} r={0.03} />
      <B p={[x, y + 0.88, z]} s={[1.56, 0.11, 1.04]} m={M.porcelain} r={0.03} />
      <mesh position={[x, y + 1.04, z]} rotation={[0, Math.PI / 4, 0]} material={M.chalk} castShadow>
        <cylinderGeometry args={[0.001, 0.82, 0.22, 4, 1]} />
      </mesh>
      <Chip id="p:funder" at={[x, y + 1.75, z]} title="NIH funder" sub="Asks follow-up questions" minor hoverSub />
    </Pick>
  )
}

export const OfficePlinth = memo(function OfficePlinth() {
  return (
    <group>
      <B p={[OFFICE_X, -0.56, 0]} s={[PLINTH_W, 1.1, PLINTH_D]} m={M.officeBody} r={0.14} />
      <B p={[OFFICE_X, -0.01, 0]} s={[PLINTH_W - 0.3, 0.04, PLINTH_D - 0.3]} m={M.officeTop} r={0.015} />
      <Purchasing />
      <Bookkeeping />
      <PaymentReport />
      <GrantManager />
      {Object.keys(RESERVOIRS).map(gid => (
        <Reservoir key={gid} gid={gid} />
      ))}
      {Object.entries(SOURCES).map(([id, p], i) => (
        // Neighbouring posts often report together; alternate heights so their labels don't stack.
        <SourcePost key={id} id={id} p={p} lift={i % 2 ? 0.6 : 0} />
      ))}
      <Vendors />
      <Funder />
      <RulePanel />
      <Chip id="a:purchasing" at={[PURCHASING[0] - 0.5, 2.55, PURCHASING[2]]} title="Purchasing agent" sub="Runs the spending rules" minor hoverSub />
      <Chip id="a:bookkeeping" at={[BOOKKEEPING[0], 3.35, BOOKKEEPING[2]]} title="Bookkeeping agent" sub="Fund tracker, invoices" minor hoverSub nudge={-0.6} />
      <Chip id="a:payment_report" at={[PAYMENT_REPORT[0], 3.35, PAYMENT_REPORT[2]]} title="Payment & report agent" sub="Payment requests, papers" minor hoverSub nudge={-0.42} />
      <Chip id="p:grant_manager" at={[GM_DESK[0], 2.15, GM_DESK[2] - 0.6]} title="Grant manager (you)" sub="Approves exceptions, with a reason" tone="dark" minor hoverSub nudge={-1} />
      <Html position={[OFFICE_X, -0.5, PLINTH_D / 2 + 0.02]} zIndexRange={[19, 10]} wrapperClass="a-html" pointerEvents="none">
        <div className="a-plaque a-plaque--dark">
          <span>The grant office</span> three AI agents, one human
        </div>
      </Html>
    </group>
  )
})
