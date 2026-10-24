// Engraved name plates over the machine. They live in the page's own React
// tree (one layer, no per-label roots). A projector inside the canvas pins
// each one to its 3D anchor every frame, keeps plates off each other and off
// the HUD panels (nudging, or hiding the least important), and writes
// fast-changing text (grant money and status, gate state) straight to the DOM.

import { useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Vector3 } from 'three'
import { feed, R01, R21, usd, useFlow, type Outcome } from '../../feed'
import { fx, uiStore, useUi } from './kit'
import { ANCHOR, BIN, CRADLE, GATES, GATE_X, LOOP, SOURCES, TRAY_BACK, v } from './layout'
import { Shape, outcomeWord } from './words'

type Pin = { el: HTMLElement; at: Vector3; prio: number; rank: number; w: number; h: number; last: string; tick?: () => void; ro?: ResizeObserver }
type Rect = { x0: number; y0: number; x1: number; y1: number }
const pins = new Map<string, Pin>()

function usePin(key: string, at: Vector3, prio: number, tick?: () => void) {
  const tickRef = useRef(tick)
  tickRef.current = tick
  return useCallback(
    (el: HTMLElement | null) => {
      pins.get(key)?.ro?.disconnect()
      if (!el) {
        pins.delete(key)
        return
      }
      const p: Pin = { el, at, prio, rank: prio, w: el.offsetWidth, h: el.offsetHeight, last: '', tick: () => tickRef.current?.() }
      if (typeof ResizeObserver !== 'undefined') {
        p.ro = new ResizeObserver(() => {
          p.w = el.offsetWidth
          p.h = el.offsetHeight
        })
        p.ro.observe(el)
      }
      pins.set(key, p)
    },
    [key, at, prio],
  )
}

const hit = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
let walls: Rect[] = []
let wallAt = 0
function readWalls(w: number, h: number) {
  walls = []
  document.querySelectorAll<HTMLElement>('.demo-e .e-panel, .demo-e .e-tabs, .demo-e .e-pullback').forEach(el => {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) walls.push({ x0: r.left - 4, y0: r.top - 4, x1: r.right + 4, y1: r.bottom + 4 })
  })
  // the gallery switcher strip, bottom centre
  walls.push({ x0: w / 2 - 266, y0: h - 80, x1: w / 2 + 266, y1: h })
}

const OFFSETS = [0, -1, 1, -2, 2, -3, 3, -4, 4, 5, -5, 6, 7, 8]
const STEP = 9
const P = new Vector3()
const order: Pin[] = []
const placed: Rect[] = []

export function Projector() {
  useFrame(({ camera, size }) => {
    const tall = size.width / size.height < 0.8
    if (tall !== tallNow) {
      tallNow = tall
      for (const [k, p] of Object.entries(TALL_AT)) AT[k]?.copy(tall ? p : WIDE_AT[k])
    }
    const t = performance.now()
    if (t - wallAt > 250) {
      readWalls(size.width, size.height)
      wallAt = t
    }
    order.length = 0
    for (const p of pins.values()) {
      p.tick?.()
      const cl = p.el.classList
      p.rank = cl.contains('is-on') ? -1 : cl.contains('has-note') ? 0 : p.prio
      order.push(p)
    }
    order.sort((a, b) => a.rank - b.rank)
    placed.length = 0
    for (const p of order) {
      let s = 'hidden'
      P.copy(p.at).project(camera)
      if (p.w > 0 && P.z <= 1 && Math.abs(P.x) <= 1.1 && Math.abs(P.y) <= 1.1) {
        const half = p.w / 2 + 4
        const x = Math.min(size.width - half, Math.max(half, (P.x * 0.5 + 0.5) * size.width))
        const y0 = (-P.y * 0.5 + 0.5) * size.height
        for (const k of OFFSETS) {
          const y = y0 + k * STEP
          const r = { x0: x - p.w / 2 - 2, x1: x + p.w / 2 + 2, y0: y - p.h / 2 - 2, y1: y + p.h / 2 + 2 }
          if (p.rank < 0 || (!walls.some(w => hit(r, w)) && !placed.some(q => hit(r, q)))) {
            placed.push(r)
            s = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`
            break
          }
        }
      }
      if (s === p.last) continue
      p.last = s
      if (s === 'hidden') p.el.style.visibility = 'hidden'
      else {
        p.el.style.visibility = 'visible'
        p.el.style.transform = s
        p.el.style.zIndex = String(1000 - Math.round(camera.position.distanceTo(p.at) * 8))
      }
    }
  })
  return null
}

type PlateProps = { id: string; at: Vector3; prio: number; tone?: 'dark' | 'light'; children: ReactNode; wide?: boolean; minor?: boolean; note?: boolean; tick?: () => void }

function Plate({ id, at, prio, tone = 'dark', children, wide, minor, note, tick }: PlateProps) {
  const u = useUi()
  const on = u.hover === id || u.selected === id
  const ref = usePin(id, at, prio, tick)
  return (
    <div ref={ref} className={`e-pin${on ? ' is-on' : ''}${minor ? ' e-pin--minor' : ''}${note ? ' has-note' : ''}`}>
      <button
        type="button"
        tabIndex={-1}
        className={`e-plate e-plate--${tone}${on ? ' is-on' : ''}${wide ? ' e-plate--wide' : ''}`}
        onClick={() => uiStore.set({ selected: id, sheet: 'detail' })}
        onPointerEnter={() => uiStore.set({ hover: id })}
        onPointerLeave={() => uiStore.get().hover === id && uiStore.set({ hover: undefined })}
      >
        {children}
      </button>
    </div>
  )
}

function ResearcherPlate({ id }: { id: string }) {
  const r = feed.getWorld().researchers.find(x => x.id === id)
  const [task, setTask] = useState(r?.task ?? '')
  const [note, setNote] = useState<{ text: string; outcome?: Outcome; task?: boolean } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const u = useUi()
  const nodeId = `r:${id}`
  const show = (text: string, outcome?: Outcome, ms = 5200, task = false) => {
    setNote({ text, outcome, task })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNote(null), ms)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useFlow(e => {
    if (e.type === 'reset') {
      window.clearTimeout(timer.current)
      setNote(null)
      setTask(feed.getWorld().researchers.find(x => x.id === id)?.task ?? '')
    }
    if (e.type === 'task' && e.researcherId === id) {
      setTask(e.task)
      if (!note) show(e.task, undefined, 3200, true)
    }
    if (e.type === 'packet' && e.packet.from === nodeId && (e.packet.kind === 'request' || e.packet.kind === 'pushback' || e.packet.kind === 'paper')) {
      show(e.packet.kind === 'pushback' ? 'Pushes back on the hold' : e.packet.kind === 'paper' ? `Sends a paper: ${e.packet.label}` : `Sends: ${e.packet.label}`)
    }
    if (e.type === 'arrive' && e.packet.to === nodeId && e.packet.kind === 'verdict') show(e.packet.label, e.packet.outcome, 6500)
  })
  const active = u.hover === nodeId || u.selected === nodeId
  const line = note?.text ?? (active ? task : '')
  const name = r?.name ?? id
  return (
    <Plate id={nodeId} at={AT[nodeId]} prio={1} tone="light" note={!!note}>
      <span className="e-plate-t">
        <span className="e-first">{name.split(' ').slice(0, -1).join(' ')} </span>
        {name.split(' ').slice(-1)[0]}
      </span>
      <span className="e-plate-s">{r?.role}</span>
      {line && (
        <span className={`e-plate-note${note?.outcome ? ` is-${note.outcome}` : ''}${note?.task ? ' is-task' : ''}`}>
          {note?.outcome && <Shape o={note.outcome} size={11} />}
          <span className="e-note-t">{line}</span>
        </span>
      )}
    </Plate>
  )
}

/** Status and money come from the world every frame, never from events. */
function GrantPlate({ g }: { g: string }) {
  const status = useRef<HTMLSpanElement>(null)
  const money = useRef<HTMLSpanElement>(null)
  const last = useRef('')
  const tick = () => {
    const grant = feed.getWorld().grants.find(x => x.id === g)
    if (!grant) return
    const word = !grant.frozen
      ? grant.status === 'ended'
        ? 'Ended'
        : 'Open for spending'
      : grant.status === 'restored_by_court'
        ? 'Frozen: court order, no cash yet'
        : grant.status === 'canceled'
          ? 'Frozen: canceled'
          : 'Frozen'
    const key = `${word}|${grant.available}`
    if (key === last.current) return
    last.current = key
    if (status.current) {
      status.current.textContent = word
      status.current.dataset.frozen = grant.frozen ? '1' : '0'
    }
    if (money.current) money.current.textContent = `${usd(grant.available)} truly available`
  }
  return (
    <Plate id={`g:${g}`} at={AT[`g:${g}`]} prio={1} wide tick={tick}>
      <span className="e-plate-t e-mono">{g}</span>
      <span ref={status} className="e-plate-status" />
      <span ref={money} className="e-plate-s e-num" />
    </Plate>
  )
}

// Where a plate sits when it shouldn't sit on its node's own anchor: the
// purchasing plate goes on the floor in front of the plinth (the gate plates
// own the plinth face), and every other source plate rides higher so the five
// never touch.
const AT: Record<string, Vector3> = {
  ...Object.fromEntries(Object.entries(ANCHOR).map(([k, p]) => [k, p.clone()])),
  'a:purchasing': v(-2.1, 0.1, 5.2),
  ...Object.fromEntries(SOURCES.map((s, i) => [s.id, i % 2 ? v(s.x, 4.7, ANCHOR[s.id].z) : ANCHOR[s.id]])),
}

// The phone camera looks along the machine, so the two grant plates would
// stack on each other: there they move apart, and the desk plate lifts.
const TALL_AT: Record<string, Vector3> = {
  [`g:${R01}`]: v(10.6, 3.35, -5.0),
  [`g:${R21}`]: v(10.6, 3.35, 4.4),
  'p:grant_manager': v(6.6, 4.6, -7.4),
}
const WIDE_AT: Record<string, Vector3> = Object.fromEntries(Object.keys(TALL_AT).map(k => [k, AT[k].clone()]))
let tallNow = false

// Odd-numbered gates are labelled above the run, even-numbered ones on the
// plinth face below it, so neighbouring plates never share a row.
const GATE_AT = GATE_X.map((x, i) => (i % 2 ? v(x, 0.32, 2.45) : v(x, 5.5, 0.5)))

function GatePlate({ i }: { i: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef('')
  const pin = usePin(`gate:${i}`, GATE_AT[i], 3, () => {
    const s = fx.gates[i].lamp
    if (s === last.current || !ref.current) return
    last.current = s
    ref.current.dataset.state = s
  })
  return (
    <div ref={pin} className="e-pin e-pin--static">
      <div ref={ref} className="e-gate" data-state="idle" title={GATES[i].name}>
        <span className="e-gate-n">{i + 1}</span>
        <span className="e-gate-t">{GATES[i].name}</span>
      </div>
    </div>
  )
}

function Tag({ id, at, children }: { id: string; at: Vector3; children: ReactNode }) {
  const pin = usePin(id, at, 5)
  return (
    <div ref={pin} className="e-pin e-pin--static">
      <div className="e-tag">{children}</div>
    </div>
  )
}

const TAGS = {
  bin: v(BIN.x + 0.2, 1.6, BIN.z + 0.4),
  loop: v(LOOP.c.x - 1.0, LOOP.c.y - 0.45, LOOP.c.z - 0.1),
  tray: v(TRAY_BACK.x - 0.2, TRAY_BACK.y + 0.45, TRAY_BACK.z + 0.35),
  reroute: v(8.2, 2.0, 2.6),
  cradle: v(CRADLE.x - 0.9, CRADLE.y + 0.5, CRADLE.z + 0.2),
}

export function Labels() {
  const ids = ['ortiz', 'okafor', 'raman', 'silva', 'park']
  return (
    <div className="e-labels">
      {ids.map(id => (
        <ResearcherPlate key={id} id={id} />
      ))}
      <Plate id="a:purchasing" at={AT['a:purchasing']} prio={2} wide>
        <span className="e-plate-t">Purchasing agent</span>
        <span className="e-plate-s">Six spending rules, then the switch</span>
      </Plate>
      <Plate id="a:bookkeeping" at={AT['a:bookkeeping']} prio={2}>
        <span className="e-plate-t">Bookkeeping agent</span>
        <span className="e-plate-s">Fund tracker and invoices</span>
      </Plate>
      <Plate id="a:payment_report" at={AT['a:payment_report']} prio={2}>
        <span className="e-plate-t">Payment & report agent</span>
        <span className="e-plate-s">Payment requests and papers</span>
      </Plate>
      <Plate id="p:grant_manager" at={AT['p:grant_manager']} prio={2}>
        <span className="e-plate-t">Grant manager</span>
        <span className="e-plate-s">The only human who approves</span>
      </Plate>
      <GrantPlate g={R01} />
      <GrantPlate g={R21} />
      {SOURCES.map(s => (
        <Plate key={s.id} id={s.id} at={AT[s.id]} prio={4} tone="light" minor>
          <span className="e-plate-t">{s.label}</span>
        </Plate>
      ))}
      <Plate id="p:funder" at={AT['p:funder']} prio={4} tone="light" minor>
        <span className="e-plate-t">NIH funder</span>
      </Plate>
      <Plate id="v:vendors" at={AT['v:vendors']} prio={4} tone="light" minor>
        <span className="e-plate-t">Vendors</span>
      </Plate>
      {GATES.map((_, i) => (
        <GatePlate key={i} i={i} />
      ))}
      <Tag id="tag:bin" at={TAGS.bin}>
        <Shape o="reject" size={10} />
        {outcomeWord.reject}
      </Tag>
      <Tag id="tag:loop" at={TAGS.loop}>
        <Shape o="hold" size={10} />
        Waiting for money
      </Tag>
      <Tag id="tag:tray" at={TAGS.tray}>
        <Shape o="refine" size={10} />
        Sent back to fix
      </Tag>
      <Tag id="tag:reroute" at={TAGS.reroute}>
        <Shape o="refine" size={10} />
        Rerouted
      </Tag>
      <Tag id="tag:cradle" at={TAGS.cradle}>
        <Shape o="hold" size={10} />
        For the grant manager
      </Tag>
    </div>
  )
}
