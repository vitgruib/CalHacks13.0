// Everything that moves, driven by the story feed. Positions are worked out
// every frame from the World (requests, holds, grants, packets in flight) and
// feed time, so ?at= fast-forwards and pauses land in the right place; events
// only add the moments a snapshot can't show (rule timing, beads in flight).
//
// A request is a marble in the item's tint. It comes in from the lab, rolls
// through the purchasing agent's six gates (each glows celadon on a pass or
// flips a red switch on a fail), waits on the switch while bookkeeping checks
// again, then drops into a cup that glazes it: bought, rerouted, blocked, or
// held. Held marbles wait in a cradle with a latch: the grant manager's, or a
// money latch beside the frozen grant. Glazed marbles roll back to the lab.

import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, DoubleSide, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { PACE, feed, progress, useFlow } from '../../feed'
import type { HoldFor, ItemKind, Outcome, Packet, Request, World } from '../../feed'
import { GLAZE, GRANT_COLOR, PAL } from '../a1/layout'
import { M, glass, liquid } from '../a1/mats'
import {
  BOOK,
  BOOK_IN,
  BOOK_NOTCH,
  CUP,
  ENTRY,
  FROM_CUP,
  FUND_CHUTE,
  GATE_X,
  GM,
  GRANT_AT,
  GRANT_IDS,
  BLOCK_H,
  JUNCTION,
  LANE_Z,
  MR,
  MY,
  PAPER_IN,
  PR,
  PR_NOTCH,
  PR_OUT,
  Path,
  RECHECK,
  RUN_START,
  RUN_X0,
  RUN_X1,
  TO_CUP,
  clamp01,
  ease,
  hop,
  notchOf,
  roll,
  v,
} from './layout'
import { pins } from './pins'

type CupKey = keyof typeof CUP

const TINT: Record<ItemKind, string> = {
  gloves: '#86A9D8',
  plates: '#E2B872',
  tips: '#A9C9CF',
  bottle: '#B98257',
  kit: '#EEE9E1',
  dishes: '#C4D7DE',
  pump: '#959BA4',
  rotor: '#B3B8BF',
  espresso: '#6B5D52',
  service: '#E8DCC2',
  food: '#DCA66E',
  chair: '#737885',
  carton: '#CBAA80',
}
const GL = { accept: new Color(GLAZE.accept), refine: new Color(GLAZE.refine), reject: new Color(GLAZE.reject), hold: new Color(GLAZE.hold) }
const MONEY = new Color(PAL.money)
const CHALK = new Color(PAL.chalk)
const PAPER = new Color(PAL.porcelain)

const N_MARBLES = 12
const N_BEADS = 28
const N_MONEY = 16
const N_DOCS = 5

// Feed-time pacing (ms). The story plays at 4x, so 4000 here is one second on screen.
const T = {
  toCup: 2600, // switch → cup
  sit: 5600, // landed → tipped out
  back: 9000, // cup → out under the lab's arch
  toNotch: 2800, // switch → the frozen grant's notch
  toCradle: 2200,
  glazeAfterLatch: 1600, // the grant manager's latch opens, then out
  gate: 6000, // a gate's celadon glow fades
  fail: 9000, // a failed gate's switch stays flipped
}

interface Marble {
  id: string
  tint: Color
  rulesAt: number // feed ms the latest rule run began; -1 none yet
  runFromNotch: boolean
  outcome?: Outcome
  holdFor?: HoldFor
  outcomeAt: number
  fromCradle: boolean
  gone: boolean
  slot: number
  pos: Vector3
  placed: boolean
  hitRun: number
  hit: boolean[]
  at: 'entry' | 'hop' | 'run' | 'junction' | 'chute' | 'cup' | 'exit' | 'notch' | 'cradle'
  cup?: CupKey
  word: string
  grantId: string
}

interface Bead {
  t0: number
  dur: number
  path?: Path
  a?: Vector3
  b?: Vector3
  h: number
  color: Color
  size: number
  money: boolean
  shrink: boolean
  pulse?: 'book' | 'pr' | 'gm'
}

interface Doc {
  refId: string
  t0: number
  inPath?: Path
  inDur: number
  notch: Vector3
  home: Vector3
  station: 'book' | 'pr'
  noun: string
  ok?: boolean
  closedAt: number
  choice?: 'approve' | 'reject'
  done: boolean
  slot: number
}

const tmp = new Vector3()
const tmp2 = new Vector3()
const prev = new Vector3()
const axis = new Vector3()
const q = new Quaternion()
const col = new Color()

function wordFor(r: Request, w: World) {
  if (r.outcome === 'accept') return 'Bought'
  if (r.outcome === 'reject') return 'Blocked'
  if (r.outcome === 'refine') return r.chargedGrantId ? `Rerouted to the ${w.grants.find(g => g.id === r.chargedGrantId)?.name.toLowerCase() ?? 'other grant'}` : 'Sent back to split'
  return r.holdFor === 'grant_manager' ? 'Waiting on the grant manager' : 'Held until money lands'
}

/** A gate: a small clay arch over the run with a switch on top that flips on a fail. */
function Gate({ x, setRef }: { x: number; setRef: (g: { arch: MeshStandardMaterial; lever: Group; knob: MeshStandardMaterial }) => void }) {
  const arch = useMemo(() => new MeshStandardMaterial({ color: PAL.chalk, roughness: 0.82, metalness: 0 }), [])
  const knob = useMemo(() => new MeshStandardMaterial({ color: PAL.clayDeep, roughness: 0.7, metalness: 0 }), [])
  const lever = useRef<Group>(null)
  return (
    <group position={[x, 0.09, LANE_Z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh material={arch} position={[0, 0.16, 0]} castShadow>
        <torusGeometry args={[0.43, 0.09, 14, 32, Math.PI]} />
      </mesh>
      <mesh material={arch} position={[0.43, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.1, 0.16, 14]} />
      </mesh>
      <mesh material={arch} position={[-0.43, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.1, 0.16, 14]} />
      </mesh>
      <group
        ref={g => {
          lever.current = g
          if (g) setRef({ arch, lever: g, knob })
        }}
        position={[0, 0.62, 0]}
        rotation={[0, 0, 0.55]}
      >
        <mesh material={M.slate} position={[0, 0.12, 0]}>
          <boxGeometry args={[0.05, 0.24, 0.05]} />
        </mesh>
        <mesh material={knob} position={[0, 0.26, 0]} castShadow>
          <sphereGeometry args={[0.065, 16, 12]} />
        </mesh>
      </group>
    </group>
  )
}

export function Run() {
  // ── Materials and refs ─────────────────────────────────────────────────
  const gates = useRef<{ arch: MeshStandardMaterial; lever: Group; knob: MeshStandardMaterial }[]>([])
  const gateState = useRef(GATE_X.map(() => ({ at: -1e9, pass: true })))
  const marbleMeshes = useRef<(Mesh | null)[]>([])
  const marbleMats = useMemo(() => Array.from({ length: N_MARBLES }, () => new MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0, envMapIntensity: 1.15 })), [])
  const beadMeshes = useRef<(Mesh | null)[]>([])
  const beadMats = useMemo(() => Array.from({ length: N_BEADS }, () => new MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0 })), [])
  const moneyMeshes = useRef<(Mesh | null)[]>([])
  const moneyMat = useMemo(() => liquid(PAL.money), [])
  const docMeshes = useRef<(Mesh | null)[]>([])
  const docMats = useMemo(() => Array.from({ length: N_DOCS }, () => new MeshStandardMaterial({ color: PAL.porcelain, roughness: 0.6, metalness: 0 })), [])
  const cupGroups = useRef<Record<string, Group | null>>({})
  const cupMats = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(CUP) as CupKey[]).map(k => [k, new MeshStandardMaterial({ color: new Color(PAL.clay).lerp(GL[k], 0.78), roughness: 0.7, metalness: 0, side: DoubleSide })]),
      ) as Record<CupKey, MeshStandardMaterial>,
    [],
  )
  const paddle = useRef<Group>(null)
  const gmLatch = useRef<Group>(null)
  const gmRing = useMemo(() => new MeshStandardMaterial({ color: PAL.chalk, roughness: 0.8, metalness: 0 }), [])
  const ringMats = useMemo(() => ({ book: new MeshStandardMaterial({ color: PAL.chalk, roughness: 0.8 }), pr: new MeshStandardMaterial({ color: PAL.chalk, roughness: 0.8 }) }), [])
  const grantViz = useMemo(
    () =>
      Object.fromEntries(
        GRANT_IDS.map(gid => [
          gid,
          {
            collar: new MeshStandardMaterial({ color: GRANT_COLOR[gid], roughness: 0.6, metalness: 0 }),
            jar: glass(),
            latchMat: new MeshStandardMaterial({ color: PAL.ice, roughness: 0.5, metalness: 0 }),
            bar: null as Mesh | null,
            jarGroup: null as Group | null,
            latch: null as Group | null,
            jarK: -1,
            latchK: 0,
            chargeAt: -1e9,
            payAt: -1e9,
          },
        ]),
      ),
    [],
  )

  // ── Scene-local memory ─────────────────────────────────────────────────
  const st = useRef({
    marbles: new Map<string, Marble>(),
    beads: [] as Bead[],
    docs: new Map<string, Doc>(),
    seen: new Set<string>(),
    pulses: [] as { at: number; where: 'book' | 'pr' | 'gm' }[],
    lastReading: -1e9,
    lastNow: -1,
    paddleA: 0,
    scanned: false,
  })

  if (import.meta.env.DEV) (window as unknown as { __n3?: unknown }).__n3 = st.current
  const reset = () => {
    const s = st.current
    s.marbles.clear()
    s.beads = []
    s.docs.clear()
    s.seen.clear()
    s.pulses = []
    s.lastReading = -1e9
    s.scanned = false
    gateState.current.forEach(g => {
      g.at = -1e9
      g.pass = true
    })
    for (const g of Object.values(grantViz)) {
      g.jarK = -1
      g.payAt = -1e9
    }
  }

  const marbleFor = (r: Request, now: number, w: World): Marble => {
    const s = st.current
    let m = s.marbles.get(r.id)
    if (m) return m
    const inFlight = w.packets.some(p => p.refId === r.id && (p.kind === 'request' || p.kind === 'verdict'))
    m = {
      id: r.id,
      tint: new Color(TINT[r.kind] ?? TINT.carton),
      rulesAt: -1,
      runFromNotch: false,
      outcome: r.outcome,
      holdFor: r.holdFor,
      outcomeAt: r.outcome ? (w.packets.find(p => p.kind === 'verdict' && p.refId === r.id)?.sentAt ?? now - 1e6) : now,
      fromCradle: false,
      // Already answered before this scene opened: nothing left to show, unless it's still held.
      gone: !!r.outcome && r.outcome !== 'hold' && !inFlight,
      slot: -1,
      pos: new Vector3(),
      placed: false,
      hitRun: -2,
      hit: GATE_X.map(() => false),
      at: 'entry',
      word: '',
      grantId: r.grantId,
    }
    s.marbles.set(r.id, m)
    return m
  }

  const spawn = (p: Packet) => {
    const s = st.current
    if (s.seen.has(p.id)) return
    s.seen.add(p.id)
    const now = feed.now()
    if (now - p.sentAt > 12000) return
    const w = feed.getWorld()
    const bead = (b: Partial<Bead> & { dur: number }) =>
      s.beads.push({ t0: p.sentAt, h: 0, color: CHALK, size: 0.1, money: false, shrink: false, ...b })
    switch (p.kind) {
      case 'reading': {
        const big = /terminated|restored/i.test(p.label)
        if (!big && p.sentAt - s.lastReading < 2600) return // daily checks come in fours; one bead says it
        if (!big) s.lastReading = p.sentAt
        bead({ dur: big ? 5200 : 4200, path: BOOK_IN, color: big ? (/terminated/i.test(p.label) ? GL.reject : GL.refine) : CHALK, size: big ? 0.15 : 0.085, pulse: 'book' })
        break
      }
      case 'recheck': {
        const there = p.to === 'a:bookkeeping'
        bead({ dur: p.ms, a: there ? RECHECK.pts[0] : RECHECK.pts[1], b: there ? RECHECK.pts[1] : RECHECK.pts[0], h: 0.25, color: PAPER, size: 0.08, pulse: there ? 'book' : undefined })
        break
      }
      case 'payment': {
        // One bright marble rolls down the funder's chute onto the grant that's waiting for it.
        const gid = w.grants.find(g => g.frozen)?.id ?? GRANT_IDS[0]
        const g = GRANT_AT[gid]
        const path = new Path([...FUND_CHUTE[gid].pts, v(g.x, BLOCK_H + 0.2, g.z)])
        s.beads.push({ t0: p.sentAt, dur: 3600, path, h: 0, color: MONEY, size: 0.2, money: true, shrink: false })
        grantViz[gid].payAt = p.sentAt + 3600
        s.pulses.push({ at: p.sentAt + p.ms, where: 'book' })
        break
      }
      case 'charge': {
        // An order is paid: a drop of money lifts out of the grant that pays (the other grant, on a reroute).
        const gid = p.from.slice(2)
        const g = GRANT_AT[gid]
        if (!g) return
        grantViz[gid].chargeAt = p.sentAt
        bead({ dur: 3200, a: v(g.x, BLOCK_H, g.z), b: v(g.x + 0.5, BLOCK_H + 1.4, g.z + 0.3), h: 0.25, color: MONEY, size: 0.12, money: true, shrink: true })
        break
      }
      case 'invoice':
        s.docs.set(p.refId ?? p.id, newDoc(p.refId ?? p.id, p.sentAt, BOOK_IN, 5200, 'book', 'Invoice'))
        break
      case 'paper':
        s.docs.set(p.refId ?? p.id, newDoc(p.refId ?? p.id, p.sentAt, PAPER_IN, 5600, 'pr', 'Paper'))
        break
      case 'payment_request':
        bead({ dur: 5200, path: PR_OUT, color: PAPER, size: 0.13 })
        break
      case 'follow_up':
        bead({ dur: 5200, path: new Path([...PR_OUT.pts].reverse()), color: new Color(PAL.ochre).lerp(PAPER, 0.4), size: 0.11, pulse: 'pr' })
        break
      case 'hold':
      case 'decision': {
        // Bookkeeping and payment & report ask the grant manager across the deck; purchasing's own holds sit in her cradle.
        const agent = p.kind === 'hold' ? p.from : p.to
        if (agent === 'a:purchasing') return
        const from = agent === 'a:bookkeeping' ? BOOK_NOTCH : PR_NOTCH
        const top = v(GM.x, 0.95, GM.z)
        const there = p.kind === 'hold'
        const c = there ? GL.hold : p.outcome === 'reject' ? GL.reject : GL.accept
        bead({ dur: 3800, a: there ? from : top, b: there ? top : from, h: 1.6, color: c, size: 0.1, pulse: there ? 'gm' : undefined })
        break
      }
    }
  }

  const newDoc = (refId: string, t0: number, inPath: Path | undefined, inDur: number, station: 'book' | 'pr', noun: string): Doc => ({
    refId,
    t0,
    inPath,
    inDur,
    station,
    noun,
    notch: station === 'book' ? BOOK_NOTCH : PR_NOTCH,
    home: station === 'book' ? v(BOOK.x + 0.75, MY - 0.02, BOOK.z) : v(PR.x, MY - 0.02, PR.z + 0.72),
    closedAt: -1,
    done: false,
    slot: -1,
  })

  useFlow(e => {
    const s = st.current
    if (e.type === 'reset') return reset()
    if (e.type === 'packet') return spawn(e.packet)
    if (e.type === 'request' && !e.request.outcome && e.request.verdicts.length) {
      const w = feed.getWorld()
      const m = marbleFor(e.request, feed.now(), w)
      m.rulesAt = feed.now()
      m.runFromNotch = m.at === 'notch'
      m.outcome = undefined
      m.holdFor = undefined
      m.gone = false
    }
    if (e.type === 'invoice') {
      const d = s.docs.get(e.invoiceId)
      if (d) d.ok = e.matched
    }
    if (e.type === 'paper') {
      const d = s.docs.get(e.paperId)
      if (d) d.ok = e.result !== 'held'
    }
    if (e.type === 'hold' && e.hold.open && e.hold.kind === 'payment_request' && !s.docs.has(e.hold.refId)) {
      const d = newDoc(e.hold.refId, feed.now(), undefined, 0, 'pr', 'Payment request')
      s.docs.set(e.hold.refId, d)
    }
  })

  // ── Every frame ────────────────────────────────────────────────────────
  useFrame((_, dtRaw) => {
    const s = st.current
    const w = feed.getWorld()
    const now = feed.now()
    const dt = Math.min(0.5, dtRaw)
    const dFeed = s.lastNow < 0 || now < s.lastNow ? 0 : now - s.lastNow
    s.lastNow = now
    if (!s.scanned) {
      s.scanned = true
      for (const p of w.packets) spawn(p)
      for (const h of w.holds) if (h.open && h.kind === 'payment_request' && !s.docs.has(h.refId)) s.docs.set(h.refId, newDoc(h.refId, now, undefined, 0, 'pr', 'Payment request'))
    }
    for (const k in pins) if (k.startsWith('w:')) pins[k].op = 0

    // Grants: money-left bar, freeze jar, money latch.
    for (const gid of GRANT_IDS) {
      const g = w.grants.find(x => x.id === gid)
      const gv = grantViz[gid]
      if (!g) continue
      const jarT = g.frozen ? 1 : 0
      gv.jarK = gv.jarK < 0 ? jarT : gv.jarK + Math.sign(jarT - gv.jarK) * Math.min(Math.abs(jarT - gv.jarK), dFeed / 2600)
      const jk = ease(gv.jarK)
      if (gv.bar) {
        const left = Math.max(0.03, clamp01(g.available / g.awarded))
        gv.bar.scale.x = left
        gv.bar.position.x = -0.6 + 0.6 * left
      }
      if (gv.jarGroup) {
        gv.jarGroup.position.y = (1 - jk) * 2.4
        gv.jarGroup.visible = jk > 0.01
      }
      const ju = gv.jar.userData.u as { uFrost: { value: number }; uFade: { value: number } }
      ju.uFade.value = jk
      ju.uFrost.value = g.status === 'restored_by_court' ? 0.5 : 0.95
      const kc = now - gv.chargeAt
      const kp = now - gv.payAt
      const glow = Math.max(kc >= 0 && kc < 3000 ? 0.45 * Math.sin((Math.PI * kc) / 3000) : 0, kp >= -600 && kp < 4000 ? 0.9 * Math.sin((Math.PI * (kp + 600)) / 4600) : 0)
      gv.collar.emissive.copy(col.set(GRANT_COLOR[gid])).multiplyScalar(glow)
      gv.latchK += ((g.frozen ? 0 : 1) - gv.latchK) * (1 - Math.exp(-dFeed / 700))
      if (gv.latch) gv.latch.rotation.z = gv.latchK * 1.25
      gv.latchMat.color.set(PAL.ice).lerp(MONEY, gv.latchK)
    }

    // Marbles.
    for (const r of w.requests) marbleFor(r, now, w)
    const used = new Set<number>()
    for (const m of s.marbles.values()) if (!m.gone && m.slot >= 0) used.add(m.slot)
    let paddleTarget = 0
    let cradleBusy = false
    let cradleOpen = 0
    for (const m of s.marbles.values()) {
      const r = w.requests.find(x => x.id === m.id)
      if (!r) {
        m.gone = true
      }
      if (m.gone) {
        if (m.slot >= 0) {
          const mesh = marbleMeshes.current[m.slot]
          if (mesh) mesh.visible = false
          m.slot = -1
        }
        continue
      }
      if (!r) continue
      // Outcome changes: an answer arrives (or a hold ends).
      if (r.outcome !== m.outcome || r.holdFor !== m.holdFor) {
        if (r.outcome) {
          const vp = w.packets.find(p => p.kind === 'verdict' && p.refId === r.id)
          m.fromCradle = m.outcome === 'hold' && m.holdFor === 'grant_manager'
          m.outcomeAt = vp?.sentAt ?? now
        } else {
          m.runFromNotch = m.at === 'notch'
          if (m.rulesAt < 0) m.rulesAt = now
        }
        m.outcome = r.outcome
        m.holdFor = r.holdFor
        m.word = wordFor(r, w)
      }
      const n = Math.max(1, r.verdicts.length)
      const runLen = PACE.rule * (n + 1)
      const reqPk = w.packets.find(p => p.kind === 'request' && p.refId === r.id)
      const pushPk = w.packets.find(p => p.kind === 'pushback' && p.refId === r.id)
      let glaze = 0
      let gc = GL.hold
      const notch = notchOf(m.grantId, tmp2)
      if (reqPk) {
        ENTRY.at(roll(progress(reqPk, now)), tmp)
        m.at = 'entry'
      } else if (pushPk) {
        // The researcher pushes back: the marble is carried back to the start to run the rules again.
        hop(notch, RUN_START, ease(progress(pushPk, now)), 1.5, tmp)
        m.at = 'hop'
        glaze = 0.45 * (1 - progress(pushPk, now))
      } else if (!m.outcome) {
        if (m.rulesAt < 0) m.rulesAt = now
        const k = (now - m.rulesAt) / runLen
        if (k < 1) {
          const first = 1 / (n + 1)
          if (m.runFromNotch && k < first) {
            hop(notch, RUN_START, ease(k / first), 1.5, tmp)
            m.at = 'hop'
          } else {
            tmp.set(RUN_X0 + (RUN_X1 - RUN_X0) * k, MY, LANE_Z)
            m.at = 'run'
          }
        } else {
          const kj = clamp01((now - m.rulesAt - runLen) / 900)
          tmp.set(RUN_X1 + (JUNCTION.x - RUN_X1) * roll(kj), MY, LANE_Z)
          m.at = 'junction'
        }
      } else {
        const k = now - m.outcomeAt
        gc = GL[m.outcome]
        if (m.outcome === 'hold' && m.holdFor === 'payment') {
          const u = clamp01(k / T.toNotch)
          if (u < 1) hop(JUNCTION, notch, ease(u), 1.6, tmp)
          else tmp.copy(notch)
          m.at = u < 1 ? 'hop' : 'notch'
          glaze = 0.5 * u
          if (u > 0.7) {
            const p = pins[`w:n:${m.grantId}`]
            if (p) {
              p.op = 1
              p.text = m.word
            }
          }
        } else if (m.outcome === 'hold') {
          const u = clamp01(k / T.toCradle)
          TO_CUP.hold.at(roll(u), tmp)
          m.at = u < 1 ? 'chute' : 'cradle'
          m.cup = 'hold'
          glaze = 0.5 * u
          cradleBusy = true
          if (u < 1) paddleTarget = angleTo('hold')
          if (u > 0.6) {
            pins['w:hold'].op = 1
            pins['w:hold'].text = m.word
          }
        } else {
          const cup: CupKey = m.fromCradle ? 'hold' : m.outcome
          m.cup = cup
          const sit = m.fromCradle ? T.glazeAfterLatch : T.toCup + T.sit
          if (!m.fromCradle && k < T.toCup) {
            const u = k / T.toCup
            TO_CUP[cup].at(roll(u), tmp)
            m.at = 'chute'
            glaze = 0.2 * u
            paddleTarget = angleTo(cup)
          } else if (k < sit) {
            TO_CUP[cup].at(1, tmp)
            m.at = 'cup'
            glaze = m.fromCradle ? 0.5 + 0.3 * clamp01(k / T.glazeAfterLatch) : 0.2 + 0.4 * ease((k - T.toCup) / 1400)
            if (m.fromCradle) {
              cradleOpen = Math.max(cradleOpen, clamp01(k / 700))
              cradleBusy = true
            }
          } else {
            const u = (k - sit) / T.back
            if (u >= 1) {
              m.gone = true
              continue
            }
            FROM_CUP[cup].at(roll(u), tmp)
            m.at = 'exit'
            glaze = 0.8
            if (m.fromCradle) cradleOpen = Math.max(cradleOpen, 1 - clamp01((u - 0.1) / 0.1))
          }
          if (m.at !== 'exit' || (k - sit) / T.back < 0.12) {
            const p = pins[`w:${cup}`]
            p.op = 1
            p.text = m.fromCradle ? (m.outcome === 'accept' ? 'Approved and bought' : 'Rejected') : m.word
          }
        }
      }

      // Ease toward the target, with a little lift on long carries.
      if (m.slot < 0) {
        for (let i = 0; i < N_MARBLES; i++)
          if (!used.has(i)) {
            m.slot = i
            used.add(i)
            break
          }
      }
      const mesh = m.slot >= 0 ? marbleMeshes.current[m.slot] : null
      if (!mesh) continue
      prev.copy(m.pos)
      if (!m.placed) {
        m.pos.copy(tmp)
        m.placed = true
        mesh.quaternion.identity()
      } else m.pos.lerp(tmp, 1 - Math.exp(-dt * 12))
      mesh.position.copy(m.pos)
      // Roll: turn about the axis across the direction of travel.
      const dx = m.pos.x - prev.x
      const dz = m.pos.z - prev.z
      const d = Math.hypot(dx, dz)
      if (d > 1e-4 && m.at !== 'hop') {
        axis.set(dz, 0, -dx).normalize()
        q.setFromAxisAngle(axis, d / MR)
        mesh.quaternion.premultiply(q)
      }
      // Fade in under the arch on the way in, out on the way back.
      const sc = clamp01((m.pos.x + 10.4) / 1.0)
      mesh.scale.setScalar(Math.max(0.001, sc))
      mesh.visible = sc > 0.01
      marbleMats[m.slot].color.copy(m.tint).lerp(gc, clamp01(glaze))

      // A gate reacts as the marble passes under it.
      if (m.at === 'run') {
        if (m.hitRun !== m.rulesAt) {
          m.hitRun = m.rulesAt
          m.hit.fill(false)
        }
        for (let i = 0; i < GATE_X.length && i < r.verdicts.length; i++) {
          if (!m.hit[i] && m.pos.x >= GATE_X[i] - 0.05) {
            m.hit[i] = true
            gateState.current[i].at = now
            gateState.current[i].pass = r.verdicts[i].pass
          }
        }
      }
    }
    for (let i = 0; i < N_MARBLES; i++) {
      if (used.has(i)) continue
      const mesh = marbleMeshes.current[i]
      if (mesh) mesh.visible = false
    }

    // Gates.
    gateState.current.forEach((g, i) => {
      const ref = gates.current[i]
      if (!ref) return
      const k = now - g.at
      let amt = 0
      if (k >= 0) {
        if (g.pass) amt = Math.max(0, 1 - k / T.gate)
        else amt = k < T.fail ? 1 : Math.max(0, 1 - (k - T.fail) / 1800)
      }
      const c = g.pass ? GL.accept : GL.reject
      ref.arch.color.copy(CHALK).lerp(c, 0.85 * amt)
      ref.arch.emissive.copy(c).multiplyScalar(g.pass ? 0.35 * amt : 0.12 * amt)
      ref.knob.color.set(PAL.clayDeep).lerp(GL.reject, g.pass ? 0 : amt)
      ref.lever.rotation.z = 0.55 - (g.pass ? 0 : 1.1 * ease(amt))
    })

    // The switch points at the cup a marble is heading for.
    s.paddleA += (paddleTarget - s.paddleA) * (1 - Math.exp(-dt * 6))
    if (paddle.current) paddle.current.rotation.y = s.paddleA

    // The grant manager's latch: shut while someone waits, swung open as they leave.
    if (gmLatch.current) gmLatch.current.rotation.z += (-cradleOpen * 1.3 - gmLatch.current.rotation.z) * (1 - Math.exp(-dt * 8))
    const anyOpen = w.holds.some(h => h.open)
    const breathe = 0.5 + 0.5 * Math.sin(performance.now() / 900)
    gmRing.color.set(PAL.chalk).lerp(GL.hold, anyOpen || cradleBusy ? 0.55 + 0.25 * breathe : 0)

    // Beads: readings, rechecks, money, payment requests, questions for the grant manager.
    let bi = 0
    let mi = 0
    s.beads = s.beads.filter(b => now - b.t0 < b.dur + 200)
    for (const b of s.beads) {
      const u = (now - b.t0) / b.dur
      if (u >= 1 && b.pulse) {
        s.pulses.push({ at: b.t0 + b.dur, where: b.pulse })
        b.pulse = undefined
      }
      if (u < 0 || u >= 1) continue
      const mesh = b.money ? moneyMeshes.current[mi++] : beadMeshes.current[bi]
      const mat = b.money ? null : beadMats[bi]
      if (!b.money) bi++
      if (!mesh) continue
      if (b.path) b.path.at(b.money ? u * u * (1.6 - 0.6 * u) : roll(u), mesh.position)
      else if (b.a && b.b) hop(b.a, b.b, ease(u), b.h, mesh.position)
      const sz = b.size * Math.min(1, u / 0.06) * (b.shrink ? 1 - ease((u - 0.5) / 0.5) : 1)
      mesh.scale.setScalar(Math.max(0.001, sz))
      mesh.visible = true
      if (mat) mat.color.copy(b.color)
      if (bi >= N_BEADS || mi >= N_MONEY) break
    }
    for (let i = bi; i < N_BEADS; i++) {
      const mesh = beadMeshes.current[i]
      if (mesh) mesh.visible = false
    }
    for (let i = mi; i < N_MONEY; i++) {
      const mesh = moneyMeshes.current[i]
      if (mesh) mesh.visible = false
    }

    // Documents: an invoice or a paper rolls in on its agent's side track, waits in a notch if it's held, then clears.
    let di = 0
    for (const [key, d] of s.docs) {
      if (d.done) {
        s.docs.delete(key)
        continue
      }
      const mesh = docMeshes.current[di]
      const mat = docMats[di]
      if (!mesh) break
      const k = now - d.t0
      const hold = w.holds.find(h => h.refId === d.refId && h.kind !== 'purchase')
      let pos = d.home
      let glz = 0
      let gcol = GL.hold
      let alpha = 1
      if (d.inPath && k < d.inDur) {
        d.inPath.at(roll(k / d.inDur), tmp)
        pos = tmp
      } else if (hold?.open) {
        pos = d.notch
        glz = 0.6
        const p = pins[d.station === 'book' ? 'w:book' : 'w:pr']
        p.op = 1
        p.text = d.noun === 'Invoice' ? 'Invoice held: the order was canceled' : d.noun === 'Paper' ? 'Paper held: credits the wrong grant' : 'Payment request for the grant manager'
      } else if (hold && !hold.open) {
        if (d.closedAt < 0) d.closedAt = now
        const kc = now - d.closedAt
        pos = d.notch
        gcol = hold.decision?.choice === 'reject' ? GL.reject : GL.accept
        glz = 0.6 + 0.4 * clamp01(kc / 900)
        alpha = 1 - clamp01((kc - 2600) / 1400)
        if (kc > 4000) d.done = true
      } else {
        const ka = k - d.inDur
        if (d.ok === false || ka < 1600) {
          // Waiting for the check (or for the hold to reach the grant manager).
        } else {
          gcol = GL.accept
          glz = clamp01((ka - 1600) / 800)
          alpha = 1 - clamp01((ka - 2800) / 1400)
          if (ka > 4200) d.done = true
        }
      }
      mesh.position.copy(pos)
      mesh.position.y = MY - 0.08
      mesh.scale.setScalar(Math.max(0.001, alpha))
      mesh.visible = alpha > 0.02
      mat.color.copy(PAPER).lerp(gcol, glz)
      di++
      if (di >= N_DOCS) break
    }
    for (let i = di; i < N_DOCS; i++) {
      const mesh = docMeshes.current[i]
      if (mesh) mesh.visible = false
    }

    // Stations glow briefly when work reaches them.
    s.pulses = s.pulses.filter(p => now - p.at < 4000)
    for (const where of ['book', 'pr'] as const) {
      let a = 0
      for (const p of s.pulses) {
        if (p.where !== where) continue
        const k = now - p.at
        if (k >= 0) a = Math.max(a, k < 250 ? k / 250 : 1 - (k - 250) / 3000)
      }
      ringMats[where].color.set(PAL.chalk).lerp(where === 'book' ? MONEY : GL.refine, 0.8 * a)
      ringMats[where].emissive.copy(where === 'book' ? MONEY : GL.refine).multiplyScalar(0.25 * a)
    }

    // Cups tip toward the collector as a marble leaves, and glow as one lands.
    for (const k of Object.keys(CUP) as CupKey[]) {
      const grp = cupGroups.current[k]
      if (!grp) continue
      let tilt = 0
      let glow = 0
      for (const m of s.marbles.values()) {
        if (m.gone || m.cup !== k || !m.outcome) continue
        const kk = now - m.outcomeAt
        const sit = m.fromCradle ? T.glazeAfterLatch : T.toCup + T.sit
        if (m.at === 'cup' && !m.fromCradle) glow = Math.max(glow, 1 - clamp01((kk - T.toCup) / 3000))
        const ke = kk - sit
        if (k !== 'hold' && ke > -500 && ke < 1600) tilt = Math.max(tilt, Math.sin(Math.PI * clamp01((ke + 500) / 2100)))
      }
      grp.rotation.z = -0.45 * tilt
      cupMats[k].emissive.copy(GL[k]).multiplyScalar(0.3 * glow)
    }
  })

  const angleTo = (cup: CupKey) => Math.atan2(-(CUP[cup].z - JUNCTION.z), CUP[cup].x - JUNCTION.x)

  // ── The parts ──────────────────────────────────────────────────────────
  return (
    <group>
      {GATE_X.map((x, i) => (
        <Gate key={i} x={x} setRef={g => (gates.current[i] = g)} />
      ))}

      {/* The switch at the end of the run. */}
      <group ref={paddle} position={[JUNCTION.x, 0.16, JUNCTION.z]}>
        <mesh material={M.porcelain} position={[0.42, 0.06, 0]} castShadow>
          <boxGeometry args={[0.84, 0.12, 0.09]} />
        </mesh>
        <mesh material={M.porcelain} position={[0, 0.07, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.16, 16]} />
        </mesh>
      </group>

      {/* Four outcome plinths, square and solid so none reads as a basin; the marble rests on top. Held keeps the grant manager's latch. */}
      {(Object.keys(CUP) as CupKey[]).map(k => (
        <group key={k} position={CUP[k]} ref={g => (cupGroups.current[k] = g)}>
          {k === 'hold' ? (
            <>
              <RoundedBox args={[0.86, 0.26, 0.86]} radius={0.05} smoothness={3} position={[0, 0.13, 0]} material={cupMats.hold} castShadow receiveShadow />
              <group ref={gmLatch} position={[0.52, 0.1, 0]}>
                <mesh material={M.slate} position={[0, 0.22, 0]} castShadow>
                  <boxGeometry args={[0.09, 0.44, 0.7]} />
                </mesh>
                <mesh material={gmRing} position={[0.02, 0.46, 0]}>
                  <sphereGeometry args={[0.08, 16, 12]} />
                </mesh>
              </group>
            </>
          ) : (
            <>
              <RoundedBox args={[0.86, 0.26, 0.86]} radius={0.05} smoothness={3} position={[0, 0.13, 0]} material={cupMats[k]} castShadow receiveShadow />
            </>
          )}
        </group>
      ))}
      {/* A ring under the grant manager that breathes while something waits on her. */}
      <mesh material={gmRing} position={[GM.x, 0.02, GM.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.34, 0.46, 40]} />
      </mesh>

      {/* The two grants: solid clay blocks with a band in the grant's colour and a dry "money left" bar; a frosted jar comes down over a frozen one. */}
      {GRANT_IDS.map(gid => {
        const gv = grantViz[gid]
        const g = GRANT_AT[gid]
        const notch = notchOf(gid)
        return (
          <group key={gid}>
            <group position={g}>
              <mesh material={M.clay} position={[0, BLOCK_H / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.3, BLOCK_H, 1.1]} />
              </mesh>
              <mesh material={gv.collar} position={[0, BLOCK_H - 0.12, 0]} castShadow>
                <boxGeometry args={[1.36, 0.14, 1.16]} />
              </mesh>
              {/* Money left: a thin dry bar on the deck in front of the block, its length the share still available. */}
              <mesh material={M.slateDeep} position={[0, 0.03, 0.72]}>
                <boxGeometry args={[1.2, 0.05, 0.1]} />
              </mesh>
              <mesh material={gv.collar} ref={m => (gv.bar = m)} position={[0, 0.07, 0.72]}>
                <boxGeometry args={[1.2, 0.06, 0.12]} />
              </mesh>
              <group ref={grp => (gv.jarGroup = grp)}>
                <mesh material={gv.jar} position={[0, 0.8, 0]} renderOrder={2}>
                  <cylinderGeometry args={[1.0, 1.0, 1.6, 48, 1, true]} />
                </mesh>
                <mesh material={gv.jar} position={[0, 1.6, 0]} renderOrder={2}>
                  <sphereGeometry args={[1.0, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
                </mesh>
              </group>
            </group>
            {/* The notch where a purchase waits for this grant's money, behind a latch that opens when the freeze lifts. */}
            <group position={[notch.x, 0, notch.z]}>
              <RoundedBox args={[0.5, 0.06, 0.5]} radius={0.02} smoothness={2} position={[0, 0.03, 0]} material={cupMats.hold} receiveShadow />
              <group ref={grp => (gv.latch = grp)} position={[-0.32, 0.08, 0]}>
                <mesh material={gv.latchMat} position={[0, 0.2, 0]} castShadow>
                  <boxGeometry args={[0.08, 0.4, 0.5]} />
                </mesh>
              </group>
            </group>
          </group>
        )
      })}

      {/* Rings round the bookkeeping and payment & report drums that glow as work arrives. */}
      <mesh material={ringMats.book} position={[BOOK.x, 0.03, BOOK.z]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.72, 0.05, 10, 48]} />
      </mesh>
      <mesh material={ringMats.pr} position={[PR.x, 0.03, PR.z]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.72, 0.05, 10, 48]} />
      </mesh>

      {/* Pools. */}
      {marbleMats.map((m, i) => (
        <mesh key={`m${i}`} ref={el => (marbleMeshes.current[i] = el)} material={m} visible={false} castShadow>
          <sphereGeometry args={[MR, 32, 20]} />
        </mesh>
      ))}
      {beadMats.map((m, i) => (
        <mesh key={`b${i}`} ref={el => (beadMeshes.current[i] = el)} material={m} visible={false} castShadow>
          <sphereGeometry args={[1, 16, 12]} />
        </mesh>
      ))}
      {Array.from({ length: N_MONEY }, (_, i) => (
        <mesh key={`$${i}`} ref={el => (moneyMeshes.current[i] = el)} material={moneyMat} visible={false} castShadow>
          <sphereGeometry args={[1, 20, 14]} />
        </mesh>
      ))}
      {docMats.map((m, i) => (
        <mesh key={`d${i}`} ref={el => (docMeshes.current[i] = el)} material={m} visible={false} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.07, 28]} />
        </mesh>
      ))}
    </group>
  )
}
