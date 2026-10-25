// The board's memory. Every card, slip and coin is a Piece with a queue of
// slides; a slide starts when the feed asks for it or when the piece's last
// slide ends, whichever is later. That lets each stamp and slide take longer
// than the feed's own beat (the story plays at 4x) without anything jumping.
// Mounting mid-story rebuilds the picture from the world (fromWorld).

import { Vector3 } from 'three'
import { feed, type FlowEvent, type Hold, type ItemKind, type Outcome, type Packet, type Request } from '../../feed'
import {
  BK_FILED_X,
  BK_HOLD_X,
  BK_X,
  BZ,
  CARD,
  COIN_H,
  DOC,
  DOC_MARK,
  GLAZE,
  GRANT_COLOR,
  GRANT_X,
  GZ,
  LAB_X,
  MARK_Z,
  OUT_X,
  PLATE_TOP,
  PR_X,
  PZ,
  REPLY_Z,
  RP_HOLD_X,
  RP_PILE_X,
  RP_X,
  RZ,
  SLOT_OUT,
  SLOT_X,
  STAGE_X,
  T,
  TONE,
  TRAY_X,
  clamp01,
  coinsFor,
  ease,
  markX,
} from './geo'

export interface Mark {
  pass: boolean
  at: number
}
interface Seg {
  from: Vector3
  to: Vector3
  at: number
  ms: number
  arc: number
}
export type PieceType = 'card' | 'invoice' | 'paper' | 'pr' | 'notice' | 'slip' | 'coin'
export interface Piece {
  id: string
  type: PieceType
  item?: ItemKind
  tone: string
  scale: number
  marks: (Mark | null)[]
  tags: string[]
  tagAt: number
  weight: { kind: 'gm' | 'money'; on: number; off: number } | null
  segs: Seg[]
  pos: Vector3
  last: Vector3
  busy: number
  born: number
  grow: number
  die: number
  fade: number
  gid?: string
  pile?: string
  sent?: boolean
  inPlace?: boolean // re-running its rules where it sits in a tray
}

export const pieces = new Map<string, Piece>()
const piles = new Map<string, string[]>()
/** Stamp presses per station ('p0'..'p5', 'bk', 'rp'), oldest first. */
export const presses = new Map<string, { at: number; ms: number; pass: boolean; by: string }[]>()
/** When each agent last got work, for its name tab. */
export const pulses = new Map<string, number>()
/** Each grant's bell jar: 0 = down over the stack, 1 = lifted away. */
const cloches = new Map<string, { from: number; to: number; at: number; ms: number }>()
const frozenNow = new Map<string, boolean>()
const noticeLand = new Map<string, number>()
let seq = 0

const subs = new Set<() => void>()
export const subscribe = (fn: () => void) => {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}
const bump = () => {
  for (const fn of subs) fn()
}
const now = () => feed.now()

export function clearAll() {
  pieces.clear()
  piles.clear()
  presses.clear()
  pulses.clear()
  cloches.clear()
  frozenNow.clear()
  noticeLand.clear()
}

// ── Moving pieces ────────────────────────────────────────────────────────

const v = (x: number, y: number, z: number) => new Vector3(x, y, z)

function spawn(id: string, type: PieceType, at: Vector3, o: Partial<Piece> = {}): Piece {
  const t = now()
  const p: Piece = {
    id,
    type,
    tone: TONE.card,
    scale: 1,
    marks: [],
    tags: [],
    tagAt: 0,
    weight: null,
    segs: [],
    pos: at.clone(),
    last: at.clone(),
    busy: t,
    born: t,
    grow: 0,
    die: Infinity,
    fade: 600,
    ...o,
  }
  pieces.set(id, p)
  return p
}

/** A piece that has fallen behind the feed moves faster until it catches up. */
const hurry = (p: Piece) => {
  const lag = p.busy - now()
  return lag > 3000 ? Math.max(0.45, 3000 / lag) : 1
}

/** Queue a slide; returns when it starts. */
function go(p: Piece, to: Vector3, ms: number, at = now(), arc = 0) {
  const start = Math.max(at, p.busy)
  ms *= hurry(p)
  p.segs.push({ from: p.last.clone(), to: to.clone(), at: start, ms, arc })
  p.last.copy(to)
  p.busy = start + ms
  return start
}

/** A stamp comes down on the piece; the mark shows the moment it touches. */
function press(p: Piece, station: string, i: number, pass: boolean) {
  const start = Math.max(now(), p.busy)
  const ms = T.press * hurry(p)
  let list = presses.get(station)
  if (!list) presses.set(station, (list = []))
  list.push({ at: start, ms, pass, by: p.id })
  if (list.length > 8) list.shift()
  p.marks[i] = { pass, at: start + ms * 0.42 }
  p.busy = start + ms
  return start
}

/** Drop a card's slides and stamps that haven't started: a new rule run replaces them. */
function flush(p: Piece, t: number) {
  const keep = p.segs.filter(s => s.at <= t)
  if (keep.length === p.segs.length) return
  p.segs = keep
  const end = keep[keep.length - 1]
  p.last.copy(end ? end.to : p.pos)
  p.busy = end ? end.at + end.ms : t
  for (const list of presses.values())
    for (let i = list.length - 1; i >= 0; i--) if (list[i].by === p.id && list[i].at > t) list.splice(i, 1)
}

function kill(p: Piece, at: number, fade = 600) {
  p.die = at
  p.fade = fade
}

/** Where a piece is at feed time t (finished slides are dropped as it goes). */
export function place(p: Piece, t: number, out: Vector3) {
  while (p.segs.length && t >= p.segs[0].at + p.segs[0].ms) {
    p.pos.copy(p.segs[0].to)
    p.segs.shift()
  }
  const s = p.segs[0]
  if (!s || t < s.at) return out.copy(p.pos)
  const k = ease((t - s.at) / s.ms)
  out.lerpVectors(s.from, s.to, k)
  if (s.arc) out.y += Math.sin(Math.PI * k) * s.arc
  return out
}

// ── Piles: outcome trays, filed invoices, the report ─────────────────────

const PILE_MAX = 4
function pileBase(key: string): { at: Vector3; step: number } {
  if (key.startsWith('tray')) return { at: v(TRAY_X[Number(key.slice(4))], 0.05, PZ), step: CARD.h + 0.008 }
  if (key === 'filed') return { at: v(BK_FILED_X, 0, BZ), step: DOC.h + 0.008 }
  return { at: v(RP_PILE_X, 0, RZ), step: DOC.h + 0.008 }
}
const spotIn = (key: string, i: number) => {
  const b = pileBase(key)
  return b.at.clone().add(v(0, i * b.step, 0))
}
function reflow(key: string) {
  const list = piles.get(key) ?? []
  list.forEach((id, i) => {
    const q = pieces.get(id)
    const to = spotIn(key, i)
    if (q && q.last.distanceTo(to) > 0.001) go(q, to, 800)
  })
}
function leavePile(p: Piece) {
  if (!p.pile) return
  const list = piles.get(p.pile) ?? []
  const i = list.indexOf(p.id)
  if (i >= 0) list.splice(i, 1)
  const key = p.pile
  p.pile = undefined
  reflow(key)
}
function toPile(p: Piece, key: string, ms: number, at = now()) {
  leavePile(p)
  let list = piles.get(key)
  if (!list) piles.set(key, (list = []))
  // The oldest card fades so a pile never grows past a few.
  while (list.length >= PILE_MAX) {
    const old = pieces.get(list.shift()!)
    if (old) kill(old, now() + 900, 900)
    reflow(key)
  }
  list.push(p.id)
  p.pile = key
  return go(p, spotIn(key, list.length - 1), ms, at)
}

// ── Purchase cards ───────────────────────────────────────────────────────

const TRAY_OF: Record<Outcome, number> = { accept: 0, refine: 1, reject: 2, hold: 3 }
const cardId = (rid: string) => `rq:${rid}`
const stage = () => v(STAGE_X, 0, PZ)
const slotSpot = (i: number) => v(SLOT_X[i] - markX(i), 0, PZ - MARK_Z)
const reqOf = (id?: string) => (id ? feed.getWorld().requests.find(r => r.id === id) : undefined)

function tagsFor(r: Request, outcome: Outcome) {
  if (outcome === 'accept') return r.split.length > 1 ? r.split.map(s => GRANT_COLOR[s.grantId]) : [GRANT_COLOR[r.chargedGrantId ?? r.grantId]]
  if (outcome === 'refine') {
    if (r.chargedGrantId && r.chargedGrantId !== r.grantId) return [GRANT_COLOR[r.chargedGrantId]]
    if (r.sharedWith.length > 1) return r.sharedWith.slice(0, 2).map(g => GRANT_COLOR[g])
  }
  return []
}

function card(r: Request | undefined, rid: string, at = stage()) {
  const id = cardId(rid)
  return pieces.get(id) ?? spawn(id, 'card', at, { item: r?.kind ?? 'carton', marks: new Array(6).fill(null) })
}

/** The answer: the card slides to its tray, and a glazed slip rides back to the lab. */
function verdict(c: Piece, r: Request | undefined, outcome: Outcome, holdFor: Packet['holdFor'], instant = false) {
  const ti = TRAY_OF[outcome]
  const key = `tray${ti}`
  const stay = c.pile === key && inTray(c)
  const land = stay ? Math.max(now(), c.busy) : toPile(c, key, instant ? 0 : T.toTray) + (instant ? 0 : T.toTray)
  c.inPlace = false
  c.tags = r ? tagsFor(r, outcome).filter(Boolean) : []
  c.tagAt = land - 300
  const kind = holdFor === 'payment' ? 'money' : 'gm'
  if (outcome !== 'hold') c.weight = null
  else if (!(c.weight && c.weight.off === Infinity && c.weight.kind === kind)) c.weight = { kind, on: land, off: Infinity }
  if (instant) return
  const s = spawn(`reply:${c.id}:${seq++}`, 'slip', v(TRAY_X[ti], 0, REPLY_Z), { tone: GLAZE[outcome], born: land, grow: 400 })
  go(s, v(LAB_X, 0, REPLY_Z), T.reply, land + 200)
  kill(s, s.busy, 500)
}

/** Sitting in (or already sliding into) a tray, not merely booked for one. */
function inTray(c: Piece) {
  if (!c.pile?.startsWith('tray')) return false
  const list = piles.get(c.pile) ?? []
  const i = list.indexOf(c.id)
  return i >= 0 && c.last.distanceTo(spotIn(c.pile, i)) < 0.01
}

// ── Documents in the other two lanes ─────────────────────────────────────

const bkStation = () => v(BK_X - DOC_MARK.x, 0, BZ - DOC_MARK.z)
const rpStation = () => v(RP_X - DOC_MARK.x, 0, RZ - DOC_MARK.z)

function grantIn(label: string) {
  const l = label.toLowerCase()
  return feed.getWorld().grants.find(g => l.includes(g.name.toLowerCase()))?.id
}
const plateSpot = (gid: string) => v(GRANT_X[gid] ?? 0, PLATE_TOP, GZ + 0.86)

function plateNotice(gid: string, tone: string, at: number) {
  for (const q of pieces.values()) if (q.type === 'notice' && q.gid === gid && q.die === Infinity && q.pile === 'plate') kill(q, at + 300)
  const p = spawn(`notice:${seq++}`, 'notice', plateSpot(gid), { tone, gid, scale: 0.6 })
  p.pile = 'plate'
  return p
}

// ── Grants ───────────────────────────────────────────────────────────────

export function clocheAt(gid: string, t: number) {
  const c = cloches.get(gid)
  if (!c) return frozenNow.get(gid) ? 0 : 1
  return c.from + (c.to - c.from) * ease(clamp01((t - c.at) / c.ms))
}

/** Coins drawn on a grant's stack right now: the money it has received, less coins still falling in. */
export function coinsShown(gid: string, t: number) {
  const g = feed.getWorld().grants.find(x => x.id === gid)
  if (!g) return 0
  let pending = 0
  for (const p of pieces.values()) if (p.type === 'coin' && p.gid === gid && t < p.die) pending++
  return Math.max(0, coinsFor(g.received) - pending)
}

// ── Feed events ──────────────────────────────────────────────────────────

const NEWS = /terminated|restored/i

function onPacket(p: Packet, t: number) {
  if (p.from.startsWith('a:')) pulses.set(p.from, t)
  const r = reqOf(p.refId)
  switch (p.kind) {
    case 'request': {
      if (!p.refId) return
      const c = card(r, p.refId, v(LAB_X, 0, PZ))
      go(c, stage(), Math.max(T.enter, p.ms))
      return
    }
    case 'pushback': {
      // The researcher's argument rides in on the answer rail to the held card.
      const s = spawn(`push:${p.id}`, 'slip', v(LAB_X, 0, REPLY_Z), { tone: '#FFF3E0', grow: 300 })
      go(s, v(TRAY_X[3] - 0.7, 0, REPLY_Z), Math.max(T.reply, p.ms))
      kill(s, s.busy, 500)
      return
    }
    case 'verdict': {
      if (!p.refId || !p.outcome) return
      verdict(card(r, p.refId), r, p.outcome, p.holdFor)
      return
    }
    case 'hold': {
      if (p.from === 'a:payment_report' && p.refId?.startsWith('pr')) {
        const id = `pr:${p.refId}`
        if (!pieces.has(id)) spawn(id, 'pr', v(PR_X, 0, RZ), { tone: TONE.pr, grow: 1600, marks: [null] })
      }
      return
    }
    case 'charge': {
      // The paying grant's coin sails out to the vendors.
      const gid = p.from.slice(2)
      const gx = GRANT_X[gid]
      if (gx === undefined) return
      const top = PLATE_TOP + COIN_H * (coinsShown(gid, t) + 0.5)
      const c = spawn(`charge:${p.id}`, 'coin', v(gx, top, GZ), { scale: 0.7 })
      go(c, v(OUT_X - 0.4, 0.05, BZ - 0.15), T.charge, t, 1.6)
      kill(c, c.busy, 500)
      return
    }
    case 'invoice': {
      const d = spawn(`inv:${p.refId}`, 'invoice', v(OUT_X, 0, BZ), { tone: TONE.invoice, marks: [null] })
      go(d, bkStation(), Math.max(T.side, p.ms))
      return
    }
    case 'paper': {
      const d = spawn(`paper:${p.refId}`, 'paper', v(LAB_X, 0, RZ), { tone: TONE.paper, marks: [null] })
      go(d, rpStation(), Math.max(T.side, p.ms))
      return
    }
    case 'reading': {
      if (!NEWS.test(p.label)) return
      const gid = grantIn(p.label)
      if (!gid) return
      // A notice comes in from outside, slides along bookkeeping, and is filed on the grant's plate.
      const tone = /terminated/i.test(p.label) ? TONE.canceled : TONE.court
      const n = spawn(`notice:${seq++}`, 'notice', v(OUT_X, 0, BZ), { tone, gid })
      go(n, v((GRANT_X[gid] ?? 0) + 1.2, 0, BZ), T.notice)
      const land = go(n, plateSpot(gid), T.file, 0, 1.1) + T.file
      noticeLand.set(gid, land)
      for (const q of pieces.values()) if (q.type === 'notice' && q.gid === gid && q.pile === 'plate' && q.die === Infinity) kill(q, land)
      n.pile = 'plate'
      n.scale = 1
      shrinkTo.set(n.id, { at: land - T.file, ms: T.file })
      return
    }
    case 'payment_request': {
      const pr = p.refId ? pieces.get(`pr:${p.refId}`) : undefined
      if (pr && !pr.sent) {
        pr.sent = true
        go(pr, v(SLOT_OUT.x, SLOT_OUT.y, SLOT_OUT.z), T.toFunder, t, 0.6)
        kill(pr, pr.busy, 400)
      } else {
        const s = spawn(`ans:${p.id}`, 'slip', v(PR_X, 0, RZ), { tone: TONE.pr, grow: 300 })
        go(s, v(SLOT_OUT.x, SLOT_OUT.y, SLOT_OUT.z), T.toFunder, t, 0.6)
        kill(s, s.busy, 400)
      }
      return
    }
    case 'follow_up': {
      const s = spawn(`fu:${p.id}`, 'slip', v(SLOT_OUT.x, SLOT_OUT.y, SLOT_OUT.z), { tone: '#E2E6EC', grow: 300 })
      go(s, v(PR_X - 0.9, 0, RZ), T.toFunder, t, 0.6)
      kill(s, s.busy + 800, 500)
      return
    }
  }
}

/** Notices shrink as they are filed onto a plate (scene-local, by id). */
export const shrinkTo = new Map<string, { at: number; ms: number }>()

function onRequest(r: Request, t: number) {
  if (r.outcome || !r.verdicts.length) return
  const c = card(r, r.id)
  flush(c, t)
  c.marks = new Array(6).fill(null)
  if (inTray(c)) {
    // Asked again while it waits (pushed back, or money landed): the rules re-run on the card where it sits.
    // The paperweight stays while the grant is still frozen.
    c.inPlace = true
    const g = feed.getWorld().grants.find(x => x.id === r.grantId)
    if (c.weight && c.weight.off === Infinity && !(c.weight.kind === 'money' && g?.frozen)) c.weight.off = Math.max(t, c.weight.on + 300)
    return
  }
  // A first run: the card goes to the start of the stamps with a clean face.
  c.inPlace = false
  leavePile(c)
  if (c.last.distanceTo(stage()) > 0.01) go(c, stage(), T.back)
  c.tags = []
  if (c.weight && c.weight.off === Infinity) c.weight.off = Math.max(t, c.weight.on + 300)
}

function onHold(h: Hold, t: number) {
  if (h.kind === 'purchase') {
    const c = pieces.get(cardId(h.refId))
    if (c?.weight) {
      if (h.open && c.weight.off !== Infinity) c.weight = { kind: 'gm', on: Math.max(t, c.busy), off: Infinity }
      if (!h.open && c.weight.off === Infinity) c.weight.off = Math.max(t, c.weight.on + 300)
    }
    return
  }
  const id = h.kind === 'invoice' ? `inv:${h.refId}` : h.kind === 'report' ? `paper:${h.refId}` : h.kind === 'payment_request' ? `pr:${h.refId}` : ''
  const d = pieces.get(id)
  if (!d) return
  if (h.open) {
    if (h.kind === 'invoice') go(d, v(BK_HOLD_X, 0, BZ), T.hold)
    if (h.kind === 'report') go(d, v(RP_HOLD_X, 0, RZ), T.hold)
    d.weight = { kind: 'gm', on: Math.max(t, d.busy), off: Infinity }
    return
  }
  if (d.weight) d.weight.off = Math.max(t, d.weight.on + 300)
  const ok = h.decision?.choice === 'approve'
  const after = d.weight ? d.weight.off + T.weight * 0.6 : t
  if (h.kind === 'invoice') {
    if (ok) toPile(d, 'filed', T.file, after)
    else {
      // Rejected: back out to the vendor.
      go(d, v(OUT_X, 0, BZ), T.side, after)
      kill(d, d.busy, 400)
    }
  } else if (h.kind === 'report') {
    // Approved: the paper moves to the other grant's report, and wears that grant's colour.
    const other = feed.getWorld().grants.find(g => g.id !== h.grantId)
    if (ok && other) {
      d.tags = [GRANT_COLOR[other.id]]
      d.tagAt = after
    }
    if (ok) toPile(d, 'report', T.file, after)
    else {
      go(d, v(LAB_X, 0, RZ), T.side, after)
      kill(d, d.busy, 400)
    }
  }
}

function onGrant(gid: string, frozen: boolean, received: number, payment: number | undefined, t: number) {
  const was = frozenNow.get(gid)
  if (was === undefined) frozenNow.set(gid, frozen)
  else if (was !== frozen) {
    frozenNow.set(gid, frozen)
    const start = frozen ? Math.max(t, (noticeLand.get(gid) ?? 0) - 500) : t
    cloches.set(gid, { from: clocheAt(gid, start), to: frozen ? 0 : 1, at: start, ms: T.cloche })
    if (!frozen) for (const q of pieces.values()) if (q.type === 'notice' && q.gid === gid && q.die === Infinity) kill(q, t + 1200, 900)
  }
  if (payment) {
    const gx = GRANT_X[gid]
    if (gx === undefined) return
    const after = coinsFor(received)
    const before = coinsFor(received - payment)
    const n = Math.max(1, Math.min(6, after - before))
    for (let j = 0; j < n; j++) {
      const born = t + T.coinStart + j * T.coinGap
      const c = spawn(`drop:${gid}:${seq++}`, 'coin', v(SLOT_OUT.x, SLOT_OUT.y, SLOT_OUT.z), { gid, born, grow: 200 })
      go(c, v(gx, PLATE_TOP + COIN_H * (after - n + j + 0.5), GZ), T.coinFall, born, 0.5)
      kill(c, c.busy, 0)
    }
  }
}

export function onEvent(e: FlowEvent) {
  const t = now()
  switch (e.type) {
    case 'reset':
      clearAll()
      fromWorld()
      break
    case 'packet':
      onPacket(e.packet, t)
      break
    case 'arrive':
      if (e.packet.to.startsWith('a:')) pulses.set(e.packet.to, t)
      return
    case 'request':
      onRequest(e.request, t)
      break
    case 'rule': {
      const r = reqOf(e.requestId)
      const c = card(r, e.requestId)
      if (e.index > 5) return
      if (c.inPlace) {
        const at = Math.max(t, c.busy)
        c.marks[e.index] = { pass: e.verdict.pass, at }
        c.busy = at + 300
        break
      }
      go(c, slotSpot(e.index), T.step)
      press(c, `p${e.index}`, e.index, e.verdict.pass)
      break
    }
    case 'hold':
      onHold(e.hold, t)
      break
    case 'grant':
      onGrant(e.grant.id, e.grant.frozen, e.grant.received, e.event?.kind === 'payment_received' ? e.event.amount : undefined, t)
      break
    case 'paper': {
      const d = pieces.get(`paper:${e.paperId}`) ?? spawn(`paper:${e.paperId}`, 'paper', rpStation(), { tone: TONE.paper, marks: [null] })
      const ok = e.result !== 'held'
      press(d, 'rp', 0, ok)
      if (ok) toPile(d, 'report', T.file)
      break
    }
    case 'invoice': {
      const d = pieces.get(`inv:${e.invoiceId}`) ?? spawn(`inv:${e.invoiceId}`, 'invoice', bkStation(), { tone: TONE.invoice, marks: [null] })
      press(d, 'bk', 0, e.matched)
      if (e.matched) toPile(d, 'filed', T.file)
      break
    }
    default:
      return
  }
  bump()
}

// ── Mid-story mount: the picture from the world as it stands ─────────────

export function fromWorld() {
  const w = feed.getWorld()
  const t = now()
  for (const g of w.grants) {
    frozenNow.set(g.id, g.frozen)
    if (g.frozen) plateNotice(g.id, g.status === 'restored_by_court' ? TONE.court : TONE.canceled, t)
  }
  const recent = w.requests.slice(0, 14).reverse()
  for (const r of recent) {
    let pReq: Packet | undefined
    let pVer: Packet | undefined
    for (const p of w.packets) if (p.refId === r.id) {
      if (p.kind === 'request') pReq = p
      if (p.kind === 'verdict') pVer = p
    }
    if (pReq) {
      const k = clamp01((t - pReq.sentAt) / pReq.ms)
      const c = card(r, r.id, v(LAB_X + (STAGE_X - LAB_X) * k, 0, PZ))
      go(c, stage(), Math.max(400, pReq.ms * (1 - k)))
      continue
    }
    const outcome = pVer?.outcome ?? r.outcome
    const c = card(r, r.id)
    r.verdicts.slice(0, 6).forEach((x, i) => (c.marks[i] = { pass: x.pass, at: 0 }))
    if (outcome) {
      verdict(c, r, outcome, pVer?.holdFor ?? r.holdFor, true)
      if (outcome === 'hold' && r.holdFor === 'grant_manager' && !w.holds.some(h => h.open && h.refId === r.id)) c.weight = null
    }
  }
  for (const h of [...w.holds].reverse()) {
    if (h.kind === 'invoice' && h.open) {
      const d = spawn(`inv:${h.refId}`, 'invoice', v(BK_HOLD_X, 0, BZ), { tone: TONE.invoice, marks: [{ pass: false, at: 0 }] })
      d.weight = { kind: 'gm', on: 0, off: Infinity }
    }
    if (h.kind === 'report') {
      const d = spawn(`paper:${h.refId}`, 'paper', v(RP_HOLD_X, 0, RZ), { tone: TONE.paper, marks: [{ pass: false, at: 0 }] })
      if (h.open) d.weight = { kind: 'gm', on: 0, off: Infinity }
      else if (h.decision?.choice === 'approve') toPile(d, 'report', 0)
      else pieces.delete(d.id)
    }
    if (h.kind === 'payment_request' && h.open) {
      const d = spawn(`pr:${h.refId}`, 'pr', v(PR_X, 0, RZ), { tone: TONE.pr, marks: [null] })
      d.weight = { kind: 'gm', on: 0, off: Infinity }
    }
  }
  bump()
}

export const pieceCount = () => pieces.size
export { DOC, CARD }
