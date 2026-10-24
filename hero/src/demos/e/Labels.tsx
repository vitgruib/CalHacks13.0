// Engraved name plates over the machine. They live in the page's own React
// tree (one layer, no per-label roots); a projector inside the canvas pins
// each one to its 3D anchor every frame and writes fast-changing text
// (grant money, gate state) straight to the DOM.

import { useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Vector3 } from 'three'
import { feed, R01, R21, usd, useFlow, type Outcome } from '../../feed'
import { fx, uiStore, useUi } from './kit'
import { ANCHOR, BIN, CRADLE, GATES, GATE_X, LOOP, SOURCES, TRAY_BACK, v } from './layout'
import { Shape, outcomeWord } from './words'

type Pin = { el: HTMLElement; at: Vector3; tick?: () => void; last: string }
const pins = new Map<string, Pin>()

function usePin(key: string, at: Vector3, tick?: () => void) {
  const tickRef = useRef(tick)
  tickRef.current = tick
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) pins.set(key, { el, at, tick: () => tickRef.current?.(), last: '' })
      else pins.delete(key)
    },
    [key, at],
  )
}

const P = new Vector3()
export function Projector() {
  useFrame(({ camera, size }) => {
    for (const p of pins.values()) {
      p.tick?.()
      P.copy(p.at).project(camera)
      let s: string
      if (P.z > 1 || Math.abs(P.x) > 1.15 || Math.abs(P.y) > 1.15) s = 'hidden'
      else {
        const x = (P.x * 0.5 + 0.5) * size.width
        const y = (-P.y * 0.5 + 0.5) * size.height
        s = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`
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

function Plate({ id, at, tone = 'dark', children, wide, minor, tick }: { id: string; at: Vector3; tone?: 'dark' | 'light'; children: ReactNode; wide?: boolean; minor?: boolean; tick?: () => void }) {
  const u = useUi()
  const on = u.hover === id || u.selected === id
  const ref = usePin(id, at, tick)
  return (
    <div ref={ref} className={`e-pin${on ? ' is-on' : ''}${minor ? ' e-pin--minor' : ''}`}>
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
  const [note, setNote] = useState<{ text: string; outcome?: Outcome } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const u = useUi()
  const nodeId = `r:${id}`
  const show = (text: string, outcome?: Outcome, ms = 5200) => {
    setNote({ text, outcome })
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
      if (!note) show(e.task, undefined, 3200)
    }
    if (e.type === 'packet' && e.packet.from === nodeId && (e.packet.kind === 'request' || e.packet.kind === 'pushback' || e.packet.kind === 'paper')) {
      show(e.packet.kind === 'pushback' ? 'Pushes back on the hold' : e.packet.kind === 'paper' ? `Sends a paper: ${e.packet.label}` : `Sends: ${e.packet.label}`)
    }
    if (e.type === 'arrive' && e.packet.to === nodeId && e.packet.kind === 'verdict') show(e.packet.label, e.packet.outcome, 6500)
  })
  const active = u.hover === nodeId || u.selected === nodeId
  const line = note?.text ?? (active ? task : '')
  return (
    <Plate id={nodeId} at={ANCHOR[nodeId]} tone="light">
      <span className="e-plate-t">
        <span className="e-first">{(r?.name ?? id).split(' ').slice(0, -1).join(' ')} </span>
        {(r?.name ?? id).split(' ').slice(-1)[0]}
      </span>
      <span className="e-plate-s">{r?.role}</span>
      {line && (
        <span className={`e-plate-note${note?.outcome ? ` is-${note.outcome}` : ''}`}>
          {note?.outcome && <Shape o={note.outcome} size={11} />}
          {line}
        </span>
      )}
    </Plate>
  )
}

function GrantPlate({ g }: { g: string }) {
  const status = useRef<HTMLSpanElement>(null)
  const money = useRef<HTMLSpanElement>(null)
  const last = useRef('')
  const tick = () => {
    const grant = feed.getWorld().grants.find(x => x.id === g)
    if (!grant) return
    const shown = fx.lock[g]?.frozen ?? grant.frozen
    const word = shown ? (grant.status === 'restored_by_court' ? 'Frozen: court order, no cash yet' : 'Frozen: canceled') : grant.status === 'ended' ? 'Ended' : 'Open for spending'
    const key = `${word}|${grant.available}`
    if (key === last.current) return
    last.current = key
    if (status.current) {
      status.current.textContent = word
      status.current.dataset.frozen = shown ? '1' : '0'
    }
    if (money.current) money.current.textContent = `${usd(grant.available)} truly available`
  }
  return (
    <Plate id={`g:${g}`} at={ANCHOR[`g:${g}`]} wide tick={tick}>
      <span className="e-plate-t e-mono">{g}</span>
      <span ref={status} className="e-plate-status" />
      <span ref={money} className="e-plate-s e-num" />
    </Plate>
  )
}

const GATE_AT = GATE_X.map((x, i) => v(x, i % 2 ? 7.0 : 5.5, 0.5))

function GatePlate({ i }: { i: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef('')
  const pin = usePin(`gate:${i}`, GATE_AT[i], () => {
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
  const pin = usePin(id, at)
  return (
    <div ref={pin} className="e-pin e-pin--static">
      <div className="e-tag">{children}</div>
    </div>
  )
}

const TAGS = {
  bin: v(BIN.x + 0.2, 1.6, BIN.z + 0.4),
  loop: v(LOOP.c.x + 0.9, LOOP.c.y + 0.55, LOOP.c.z + 0.3),
  tray: v(TRAY_BACK.x - 0.2, TRAY_BACK.y + 0.45, TRAY_BACK.z + 0.35),
  reroute: v(9.15, 3.75, -0.2),
  cradle: v(CRADLE.x - 0.9, CRADLE.y + 0.5, CRADLE.z + 0.2),
}

export function Labels() {
  const ids = ['ortiz', 'okafor', 'raman', 'silva', 'park']
  return (
    <div className="e-labels">
      {ids.map(id => (
        <ResearcherPlate key={id} id={id} />
      ))}
      <Plate id="a:purchasing" at={ANCHOR['a:purchasing']} wide>
        <span className="e-plate-t">Purchasing agent</span>
        <span className="e-plate-s">Six spending rules, then the switch</span>
      </Plate>
      <Plate id="a:bookkeeping" at={ANCHOR['a:bookkeeping']}>
        <span className="e-plate-t">Bookkeeping agent</span>
        <span className="e-plate-s">Fund tracker and invoices</span>
      </Plate>
      <Plate id="a:payment_report" at={ANCHOR['a:payment_report']}>
        <span className="e-plate-t">Payment & report agent</span>
        <span className="e-plate-s">Payment requests and papers</span>
      </Plate>
      <Plate id="p:grant_manager" at={ANCHOR['p:grant_manager']}>
        <span className="e-plate-t">Grant manager</span>
        <span className="e-plate-s">The only human who approves</span>
      </Plate>
      <GrantPlate g={R01} />
      <GrantPlate g={R21} />
      {SOURCES.map(s => (
        <Plate key={s.id} id={s.id} at={ANCHOR[s.id]} tone="light" minor>
          <span className="e-plate-t">{s.label}</span>
        </Plate>
      ))}
      <Plate id="p:funder" at={ANCHOR['p:funder']} tone="light" minor>
        <span className="e-plate-t">NIH funder</span>
      </Plate>
      <Plate id="v:vendors" at={ANCHOR['v:vendors']} tone="light" minor>
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
