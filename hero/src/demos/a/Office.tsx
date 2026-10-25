// The grant office plinth, in deep slate: three agent stations (each one
// object with a single light), the grant manager's desk, the two grants as
// vessels of money filled to their truly available amount, and one rack for
// the outside sources. A glass bell jar drops over a frozen grant and lifts
// when cash lands.

import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Color, LatheGeometry, MeshStandardMaterial, Vector2, type Group, type Mesh, type PointLight } from 'three'
import { feed, useFlow, usd } from '../../feed'
import type { Verdict } from '../../feed'
import {
  BOOKKEEPING,
  DESK_H,
  FUNDER,
  GM_DESK,
  OFFICE_X,
  PAL,
  PAYMENT_REPORT,
  PLINTH_D,
  PLINTH_W,
  PURCHASING,
  RACK,
  RESERVOIRS,
  SOURCES,
  VENDORS,
  floorOf,
  type V3,
} from './layout'
import { M, glass, liquid, vary } from './mats'
import { B, Chip, Cyl, NamePlate, Pick, useFlash } from './Parts'
import { IconCheck, IconCross } from './icons'
import { fx, now, reducedMotion, useFeed, useUi } from './store'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const easeOut = (t: number) => 1 - (1 - t) ** 3

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
    const level = 0.3 + (busy ? 0.4 : 0) + flare * 0.9
    if (light.current) light.current.intensity += (level * 2.2 - light.current.intensity) * 0.15
    if (mesh.current) mesh.current.scale.setScalar(1 + flare * 0.22)
  })
  return (
    <group position={p}>
      <mesh ref={mesh} material={M.lens}>
        {kind === 'sphere' ? <sphereGeometry args={[r, 28, 18]} /> : <cylinderGeometry args={[r, r, 0.04, 32]} />}
      </mesh>
      <pointLight ref={light} color={PAL.lens} intensity={0.7} distance={3} decay={1.6} position={[0, 0.25, 0]} />
    </group>
  )
}

// ── Purchasing: a desk where each request is checked, rule pips along its edge ──

interface RuleRun {
  requestId: string
  total: number
  verdicts: (Verdict | undefined)[]
  litAt: number[]
  last: number
  done: number
}
const run: { cur: RuleRun | null } = { cur: null }

const SLOTS = 9
const PIP_GAP = 0.19
const pipIdle = new Color('#5F6B79')
const pipPass = new Color(PAL.celadon)
const pipFail = new Color('#C2403A')
const black = new Color('#000000')

export function failText(v: Verdict) {
  const rule = v.rule
  const limit = /card limit \((\$[\d,]+)\)/.exec(rule)
  if (limit) return `Over the ${limit[1]} card limit`
  if (rule.startsWith('Grant is active')) return /frozen/i.test(v.detail) ? 'The grant is frozen' : 'The grant isn’t active'
  if (rule.startsWith('Not in the grant')) return 'In the grant’s last 90 days'
  if (rule.startsWith('Enough truly available')) return 'Not enough truly available money'
  if (rule.startsWith('Category allowed')) return 'Category not allowed on a federal grant'
  if (rule.startsWith('Shared cost')) return 'Shared cost isn’t split across its grants'
  if (rule.startsWith('Grant exists')) return 'No such grant'
  return rule
}

/** The request now on the desk, if any: arrived, checked, no answer yet. */
function onDesk() {
  const w = feed.getWorld()
  return w.requests.find(r => r.outcome === undefined && r.verdicts.length > 0 && !w.packets.some(p => p.refId === r.id && p.kind === 'request'))
}

function Pips() {
  const pips = useRef<(Mesh | null)[]>([])
  const mats = useMemo(() => Array.from({ length: SLOTS }, () => new MeshStandardMaterial({ color: pipIdle, roughness: 0.4, emissive: new Color('#000000') })), [])
  const still = useMemo(reducedMotion, [])
  const c = useMemo(() => new Color(), [])
  useFrame((_, dt) => {
    const r = run.cur
    const t = now()
    const idle = !r || (r.done > 0 && t - r.done > 1600) || t - r.last > 9000
    const n = idle || !r ? 6 : r.total
    const k = Math.min(1, dt * 10)
    for (let i = 0; i < SLOTS; i++) {
      const m = pips.current[i]
      if (!m) continue
      m.visible = i < n
      if (!m.visible) continue
      m.position.x = (i - (n - 1) / 2) * PIP_GAP
      const v = idle || !r ? undefined : r.verdicts[i]
      c.copy(!v ? pipIdle : v.pass ? pipPass : pipFail)
      mats[i].color.lerp(c, k)
      mats[i].emissive.lerp(v ? c : black, k)
      mats[i].emissiveIntensity = v ? 0.55 : 0
      const lit = r && v ? t - (r.litAt[i] ?? -1e9) : 1e9
      const pop = !still && lit >= 0 && lit < 260 ? Math.sin((lit / 260) * Math.PI) : 0
      m.scale.set(1 + 0.45 * pop, 0.55 + 0.6 * pop, 1 + 0.45 * pop)
    }
  })
  return (
    <group position={[0, DESK_H + 0.012, 0.4]}>
      {mats.map((m, i) => (
        <mesh
          key={i}
          ref={el => {
            pips.current[i] = el
          }}
          material={m}
          visible={false}
        >
          <sphereGeometry args={[0.065, 18, 12]} />
        </mesh>
      ))}
    </group>
  )
}

/** One short caption near the agent when a rule fails, gone after a moment. */
function FailCaption() {
  const [fail, setFail] = useState<{ text: string; on: boolean }>({ text: '', on: false })
  const timer = useRef<number | undefined>(undefined)
  useFlow(e => {
    if (e.type === 'reset') setFail({ text: '', on: false })
    if (e.type === 'rule' && !e.verdict.pass) {
      setFail({ text: failText(e.verdict), on: true })
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setFail(f => ({ ...f, on: false })), 2500)
    }
  })
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <Html position={[PURCHASING[0] - 0.55, 1.75, PURCHASING[2] + 0.2]} zIndexRange={[22, 10]} wrapperClass="a-html" pointerEvents="none">
      <p className={`a-fail${fail.on ? '' : ' is-hidden'}`} aria-hidden="true">
        {fail.text && (
          <>
            <IconCross size={12} />
            {fail.text}
          </>
        )}
      </p>
    </Html>
  )
}

const RULES = [
  'Grant is active and not frozen',
  'Not in the grant’s last 90 days, for supplies',
  'Enough truly available money',
  'Category allowed',
  'Under the $5,000 card limit',
  'Shared costs split across the grants they serve',
]

/** The full rule list, on hover or selection of the purchasing agent. */
function RuleList() {
  const on = useUi(s => s.hovered === 'a:purchasing' || s.selected === 'a:purchasing')
  const [, force] = useState(0)
  useFlow(e => {
    if (on && (e.type === 'rule' || e.type === 'reset')) force(n => n + 1)
  })
  const r = run.cur
  const live = !!r && (r.done === 0 || now() - r.done < 1600)
  return (
    <Html position={[PURCHASING[0] - 0.9, 1.15, PURCHASING[2]]} zIndexRange={[23, 10]} wrapperClass="a-html" pointerEvents="none">
      <div className={`a-rules${on ? '' : ' is-hidden'}`} aria-hidden="true">
        <p className="a-rules-head">Spending rules</p>
        <ol>
          {live && r
            ? Array.from({ length: r.total }, (_, i) => {
                const v = r.verdicts[i]
                return (
                  <li key={i} className={v ? (v.pass ? 'is-pass' : 'is-fail') : 'is-wait'}>
                    <span className="a-rules-mark">{v ? v.pass ? <IconCheck size={11} /> : <IconCross size={11} /> : null}</span>
                    <span>{v ? v.rule : 'Checking'}</span>
                  </li>
                )
              })
            : RULES.map(x => (
                <li key={x} className="is-wait">
                  <span className="a-rules-mark" />
                  <span>{x}</span>
                </li>
              ))}
        </ol>
      </div>
    </Html>
  )
}

function Purchasing() {
  useFlow(e => {
    const t = now()
    if (e.type === 'reset') run.cur = null
    else if (e.type === 'rule') {
      let r = run.cur
      if (!r || r.requestId !== e.requestId || e.index === 0) {
        const req = feed.getWorld().requests.find(q => q.id === e.requestId)
        r = { requestId: e.requestId, total: e.total, verdicts: req ? req.verdicts.slice(0, e.index) : [], litAt: [], last: t, done: 0 }
        run.cur = r
      }
      r.verdicts[e.index] = e.verdict
      r.litAt[e.index] = t
      r.total = e.total
      r.last = t
    } else if (e.type === 'packet' && run.cur && e.packet.refId === run.cur.requestId && (e.packet.kind === 'verdict' || e.packet.kind === 'hold')) {
      run.cur.done = t
    }
  })
  useEffect(() => {
    // Mounting mid-story: show whatever is on the desk as already checked.
    const r = onDesk()
    if (r) run.cur = { requestId: r.id, total: r.verdicts.length, verdicts: [...r.verdicts], litAt: [], last: now(), done: 0 }
  }, [])
  return (
    <Pick id="a:purchasing">
      <group position={PURCHASING}>
        <B p={[0, DESK_H / 2, 0]} s={[1.5, DESK_H, 1.02]} m={M.slate} r={0.07} />
        <B p={[0, DESK_H - 0.02, 0.08]} s={[1.0, 0.04, 0.6]} m={M.slateDeep} r={0.015} shadow={false} />
        <Cyl p={[0, DESK_H + 0.22, -0.36]} r={0.15} r2={0.11} h={0.44} m={M.slateDeep} />
        <Lens id="a:purchasing" p={[0, DESK_H + 0.56, -0.36]} r={0.14} />
        <Pips />
      </group>
    </Pick>
  )
}

// ── Bookkeeping drum and the payment & report arch ───────────────────────

function Bookkeeping() {
  return (
    <Pick id="a:bookkeeping">
      <group position={BOOKKEEPING}>
        <Cyl p={[0, 0.06, 0]} r={0.68} h={0.12} m={M.slateDeep} seg={48} />
        <Cyl p={[0, 0.62, 0]} r={0.52} h={1.0} m={M.slate} seg={48} />
        <Cyl p={[0, 1.15, 0]} r={0.56} h={0.07} m={vary(M.chalk, 2)} seg={48} />
        <Lens id="a:bookkeeping" p={[0, 1.2, 0]} r={0.16} kind="disc" />
      </group>
    </Pick>
  )
}

function PaymentReport() {
  return (
    <Pick id="a:payment_report">
      <group position={PAYMENT_REPORT}>
        <B p={[0, 0.05, 0]} s={[1.5, 0.1, 0.72]} m={M.slateDeep} r={0.035} />
        <B p={[-0.52, 0.76, 0]} s={[0.26, 1.32, 0.58]} m={M.slate} r={0.06} />
        <B p={[0.52, 0.76, 0]} s={[0.26, 1.32, 0.58]} m={M.slate} r={0.06} />
        <B p={[0, 1.5, 0]} s={[1.32, 0.26, 0.58]} m={M.slate} r={0.06} />
        <B p={[0, 0.58, 0]} s={[0.62, 0.05, 0.42]} m={M.slateDeep} r={0.015} />
        <B p={[0, 0.63, 0]} s={[0.44, 0.05, 0.32]} m={M.paper} r={0.008} />
        <Lens id="a:payment_report" p={[0, 1.5, 0.32]} r={0.09} />
      </group>
    </Pick>
  )
}

// ── The grant manager's desk (the one human in the office) ──────────────

const gmBody = new MeshStandardMaterial({ color: '#7A7066', roughness: 0.84 })
const gmHead = new MeshStandardMaterial({ color: '#ECE4D8', roughness: 0.84 })
const gmGeo = new LatheGeometry(
  [new Vector2(0, 0), new Vector2(0.24, 0), new Vector2(0.25, 0.04), new Vector2(0.22, 0.6), new Vector2(0.235, 1.05), new Vector2(0.24, 1.2), new Vector2(0.15, 1.32), new Vector2(0, 1.34)],
  40,
)

function GrantManager() {
  const others = useFeed(w => w.holds.reduce((n, h) => n + (h.open && h.kind !== 'purchase' ? 1 : 0), 0))
  return (
    <Pick id="p:grant_manager">
      <group position={GM_DESK}>
        <B p={[0, 0.37, 0]} s={[1.5, 0.74, 0.76]} m={vary(M.slate, 3)} r={0.06} />
        {Array.from({ length: Math.min(others, 4) }, (_, i) => (
          <B key={i} p={[-0.42, 0.755 + i * 0.024, 0.04]} s={[0.4, 0.016, 0.29]} m={M.glazeHold} r={0.005} />
        ))}
        <group position={[0, 0, -0.62]}>
          <mesh geometry={gmGeo} material={gmBody} castShadow receiveShadow />
          <mesh position={[0, 1.42, 0]} material={gmHead} castShadow>
            <cylinderGeometry args={[0.06, 0.07, 0.12, 16]} />
          </mesh>
          <mesh position={[0, 1.6, 0]} material={gmHead} castShadow>
            <sphereGeometry args={[0.16, 32, 22]} />
          </mesh>
        </group>
      </group>
    </Pick>
  )
}

// ── Grants as vessels of money, and the bell jar ─────────────────────────

const vesselGeo = new LatheGeometry(
  [new Vector2(0, 0), new Vector2(0.8, 0), new Vector2(0.86, 0.05), new Vector2(0.86, 0.98), new Vector2(0.83, 1.04), new Vector2(0.77, 1.04), new Vector2(0.745, 0.98), new Vector2(0.745, 0.12), new Vector2(0, 0.12)],
  72,
)
const jarGeo = new LatheGeometry(
  [new Vector2(1.0, 0), new Vector2(1.0, 1.25), new Vector2(0.98, 1.42), new Vector2(0.91, 1.62), new Vector2(0.77, 1.8), new Vector2(0.54, 1.93), new Vector2(0.26, 2.0), new Vector2(0.001, 2.02)],
  72,
)
const iceColor = new Color(PAL.ice)
const moneyColor = new Color(PAL.money)
const FILL = 0.84 // the vessel's inner height
const BASE = 0.18 // the vessel floor
const DROP_FROM = 3.6

function Reservoir({ gid }: { gid: string }) {
  const p = RESERVOIRS[gid]
  const body = useRef<Mesh>(null)
  const surface = useRef<Mesh>(null)
  const jar = useRef<Group>(null)
  const tag = useRef<Group>(null)
  const fillMat = useMemo(() => liquid(), [])
  const jarMat = useMemo(() => glass(), [])
  const still = useMemo(reducedMotion, [])
  const st = useRef({ seen: false, frozen: false, at: -1e9, level: 0 })
  useFlow(e => {
    if (e.type === 'reset') st.current = { seen: false, frozen: false, at: -1e9, level: 0 }
    if (e.type === 'packet' && e.packet.kind === 'charge' && e.packet.from === `g:${gid}`) fx.slosh.set(gid, { at: now() + 200, amp: 0.4 })
  })

  useFrame((_, dt) => {
    const g = feed.getWorld().grants.find(x => x.id === gid)
    if (!g || !body.current || !surface.current || !jar.current || !tag.current) return
    const t = now()
    const u = jarMat.userData.u as { uFrost: { value: number }; uFade: { value: number } }
    const lu = fillMat.userData.u as { uPulse: { value: number } }
    const target = Math.max(0.02, FILL * clamp01(g.available / g.awarded))
    const s = st.current
    if (!s.seen) {
      // Mounting mid-story: show the current state as settled, no drop.
      s.seen = true
      s.frozen = g.frozen
      s.at = -1e9
      s.level = target
      fillMat.color.copy(g.frozen ? iceColor : moneyColor)
    }
    s.level += (target - s.level) * (1 - Math.exp(-Math.min(dt, 0.1) * 2.6))
    body.current.scale.y = Math.max(0.001, s.level - 0.03)
    body.current.position.y = BASE + (s.level - 0.03) / 2
    surface.current.position.y = BASE + s.level

    const sl = fx.slosh.get(gid)
    const tau = sl ? (t - sl.at) / 1000 : 99
    if (sl && tau >= 0 && tau < 1.8 && !still) {
      const a = 0.05 * sl.amp * Math.exp(-tau * 2.4)
      surface.current.rotation.set(a * Math.sin(tau * Math.PI * 4.2), 0, a * Math.sin(tau * Math.PI * 4.2 + 1.3))
      surface.current.position.y += 0.02 * sl.amp * Math.exp(-tau * 3) * Math.sin(tau * Math.PI * 6)
    } else surface.current.rotation.set(0, 0, 0)
    fillMat.color.lerp(g.frozen ? iceColor : moneyColor, Math.min(1, dt * 2.2))

    if (g.frozen !== s.frozen) {
      s.frozen = g.frozen
      // Freezing is immediate; thawing waits for the money to land first.
      s.at = t + (g.frozen ? 0 : 750)
      if (g.frozen) fx.ripples.push({ pos: floorOf(`g:${gid}`), color: '#EEF4FA', at: t + 640, size: 2.4, ms: 1200 })
      else fx.ripples.push({ pos: floorOf(`g:${gid}`), color: '#E9FBFF', at: t + 750, size: 1.7, ms: 1300 })
    }
    const k = t - s.at
    let y = 0
    let fade = 0
    let frost = 0
    if (s.frozen) {
      if (s.at < -1e8 || still) {
        fade = 1
        frost = s.at < -1e8 ? 1 : clamp01(k / 300)
      } else {
        // Falls under gravity, lands, one small settle, then the frost comes in.
        const fall = 640
        if (k < fall) y = DROP_FROM * (1 - (clamp01(k / fall)) ** 2)
        else if (k < fall + 260) y = 0.09 * Math.sin(((k - fall) / 260) * Math.PI)
        fade = clamp01(k / 160)
        frost = clamp01((k - fall) / 900)
      }
    } else if (s.at > -1e8) {
      const d = clamp01(k / 1300)
      if (k < 0) {
        fade = 1
        frost = 1
      } else if (still) {
        fade = 1 - clamp01(k / 300)
      } else {
        y = DROP_FROM * easeOut(d)
        frost = 1 - clamp01(k / 520)
        fade = 1 - clamp01((d - 0.45) / 0.55)
      }
      lu.uPulse.value = k >= 0 && k < 1400 && !still ? Math.sin((k / 1400) * Math.PI) * (1 - k / 1400) * 1.6 : 0
    }
    jar.current.position.y = y
    u.uFade.value = fade
    u.uFrost.value = frost
    jar.current.visible = fade > 0.005
    const court = g.frozen && g.status === 'restored_by_court'
    const ts = tag.current.scale.x + ((court ? 1 : 0) - tag.current.scale.x) * Math.min(1, dt * 5)
    tag.current.scale.setScalar(ts)
    tag.current.visible = ts > 0.02
  })

  return (
    <Pick id={`g:${gid}`}>
      <group position={p}>
        <Cyl p={[0, 0.03, 0]} r={1.08} h={0.06} m={M.slateDeep} seg={72} />
        <mesh geometry={vesselGeo} material={vary(M.chalk, 1)} castShadow receiveShadow position={[0, 0.06, 0]} />
        <mesh ref={body} material={fillMat} position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.742, 0.742, 1, 64]} />
        </mesh>
        <mesh ref={surface} material={fillMat} position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.742, 0.742, 0.03, 64]} />
        </mesh>
        <group ref={jar} position={[0, DROP_FROM, 0]}>
          <mesh geometry={jarGeo} material={jarMat} position={[0, 0.06, 0]} renderOrder={2} />
          <mesh position={[0, 2.16, 0]} material={jarMat} renderOrder={2}>
            <sphereGeometry args={[0.1, 20, 14]} />
          </mesh>
        </group>
        <group ref={tag} position={[0.15, 0, 1.08]} scale={0}>
          <B p={[0, 0.5, 0]} s={[0.56, 0.4, 0.016]} m={M.paper} r={0.006} rot={[-0.22, 0, 0.04]} />
          <B p={[0, 0.6, 0.03]} s={[0.4, 0.035, 0.006]} m={M.slate} r={0.002} rot={[-0.22, 0, 0.04]} shadow={false} />
          <B p={[-0.04, 0.5, 0.05]} s={[0.32, 0.025, 0.006]} m={M.clayDeep} r={0.002} rot={[-0.22, 0, 0.04]} shadow={false} />
        </group>
      </group>
      <Gauge gid={gid} at={[p[0], 2.35, p[2]]} side={Object.keys(RESERVOIRS).indexOf(gid) === 0 ? 'l' : 'r'} />
    </Pick>
  )
}

/** The grant's gauge: its money large, its id small, its status only when it isn't plainly active. */
function Gauge({ gid, at, side }: { gid: string; at: V3; side: 'l' | 'r' }) {
  const g = useFeed(w => w.grants.find(x => x.id === gid))
  const on = useUi(s => s.hovered === `g:${gid}` || s.selected === `g:${gid}`)
  if (!g) return null
  const state = g.frozen
    ? g.status === 'restored_by_court'
      ? 'Restored by court, still frozen'
      : 'Frozen'
    : g.status === 'active'
      ? null
      : g.status === 'restored_by_court'
        ? 'Restored and paid'
        : g.status === 'ended'
          ? 'Ended'
          : null
  return (
    <Html position={at} zIndexRange={[23, 21]} wrapperClass="a-html" pointerEvents="none">
      <div className={`a-gauge${g.frozen ? ' is-frozen' : ''}${on ? ' is-on' : ''}`} data-side={side}>
        <span className="a-gauge-id">{g.name}</span>
        <span className="a-gauge-money">{usd(g.available)}</span>
        {on && <span className="a-gauge-sub">truly available</span>}
        {state && <span className="a-gauge-state">{state}</span>}
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

const lampOff = new Color('#56626F')
const lampOn = new Color('#F3F8FF')

function SourceLamp({ id, p }: { id: string; p: V3 }) {
  const mat = useMemo(() => new MeshStandardMaterial({ color: lampOff, roughness: 0.35, emissive: new Color('#000000') }), [])
  useFrame(() => {
    const since = now() - (fx.pulses.get(id) ?? -1e9)
    const k = since >= 0 && since < 1200 ? 1 - since / 1200 : 0
    mat.color.copy(lampOff).lerp(lampOn, k)
    mat.emissive.copy(lampOn).multiplyScalar(k * 0.6)
  })
  return (
    <Pick id={id}>
      <mesh position={[p[0], 0.43, p[2]]} material={mat}>
        <cylinderGeometry args={[0.15, 0.15, 0.04, 28]} />
      </mesh>
    </Pick>
  )
}

function SourceChip({ id, p }: { id: string; p: V3 }) {
  const flash = useFlash(id)
  const on = useUi(s => s.hovered === id || s.selected === id)
  return (
    <Html position={[p[0], 1.05, p[2]]} zIndexRange={[20, 10]} wrapperClass="a-html" pointerEvents="none">
      <div className={`a-chip a-chip--dark a-chip--source${flash || on ? '' : ' is-hidden'}${on ? ' is-on' : ''}`} aria-hidden="true">
        <span className="a-chip-title">{SOURCE_LABEL[id] ?? id}</span>
      </div>
    </Html>
  )
}

function SourceRack() {
  return (
    <>
      <B p={[RACK[0], 0.2, RACK[2]]} s={[4.5, 0.4, 0.52]} m={M.slate} r={0.07} />
      {Object.entries(SOURCES).map(([id, p]) => (
        <SourceLamp key={id} id={id} p={p} />
      ))}
      {Object.entries(SOURCES).map(([id, p]) => (
        <SourceChip key={id} id={id} p={p} />
      ))}
    </>
  )
}

function Vendors() {
  const [x, y, z] = VENDORS
  return (
    <Pick id="v:vendors">
      <B p={[x, y - 0.3, z]} s={[2.3, 0.6, 2.1]} m={vary(M.clay, 2)} r={0.12} />
      <B p={[x - 0.35, y + 0.22, z - 0.1]} s={[0.6, 0.44, 0.55]} m={M.porcelain} r={0.05} />
      <B p={[x + 0.32, y + 0.17, z + 0.2]} s={[0.5, 0.34, 0.5]} m={vary(M.chalk, 3)} r={0.05} />
      <B p={[x - 0.3, y + 0.6, z - 0.08]} s={[0.46, 0.32, 0.44]} m={vary(M.clay, 1)} r={0.05} />
      <Chip id="v:vendors" at={[x, y + 1.25, z]} title="Vendors" sub="Orders and invoices" />
    </Pick>
  )
}

function Funder() {
  const [x, y, z] = FUNDER
  return (
    <Pick id="p:funder">
      <B p={[x, y - 0.3, z]} s={[2.3, 0.6, 2.1]} m={vary(M.clay, 4)} r={0.12} />
      <B p={[x, y + 0.42, z]} s={[1.5, 0.84, 1.0]} m={M.porcelain} r={0.05} />
      <mesh position={[x, y + 1.0, z]} rotation={[0, Math.PI / 4, 0]} material={vary(M.chalk, 1)} castShadow>
        <cylinderGeometry args={[0.001, 0.9, 0.3, 4, 1]} />
      </mesh>
      <Chip id="p:funder" at={[x, y + 1.6, z]} title="NIH funder" sub="Pays, and asks follow-up questions" />
    </Pick>
  )
}

export const OfficePlinth = memo(function OfficePlinth() {
  return (
    <group>
      <B p={[OFFICE_X, -0.56, 0]} s={[PLINTH_W, 1.1, PLINTH_D]} m={M.officeBody} r={0.16} />
      <B p={[OFFICE_X, -0.01, 0]} s={[PLINTH_W - 0.3, 0.04, PLINTH_D - 0.3]} m={M.officeTop} r={0.015} />
      <NamePlate text="The grant office" x={OFFICE_X} ink="#171C23" light="#3B4552" />
      <Purchasing />
      <Bookkeeping />
      <PaymentReport />
      <GrantManager />
      {Object.keys(RESERVOIRS).map(gid => (
        <Reservoir key={gid} gid={gid} />
      ))}
      <SourceRack />
      <Vendors />
      <Funder />
      <FailCaption />
      <RuleList />
      <Chip id="a:purchasing" at={[PURCHASING[0], 2.05, PURCHASING[2] - 0.36]} title="Purchasing agent" sub="Runs the spending rules" />
      <Chip id="a:bookkeeping" at={[BOOKKEEPING[0], 2.0, BOOKKEEPING[2]]} title="Bookkeeping agent" sub="Fund tracker, invoices" />
      <Chip id="a:payment_report" at={[PAYMENT_REPORT[0], 2.2, PAYMENT_REPORT[2]]} title="Payment & report agent" sub="Payment requests, papers" />
      <Chip id="p:grant_manager" at={[GM_DESK[0], 2.25, GM_DESK[2] - 0.62]} title="Grant manager (you)" sub="Approves exceptions, with a reason" tone="dark" />
    </group>
  )
})

