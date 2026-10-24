// Annotation in the manner of an architectural drawing: room numbers on the
// cut face, leader-line notes that appear only while a room is busy, signs
// on the vault doors, tags on the antennas, and tags riding the capsules.
// The DOM lives over the canvas; <Projector> moves it every frame.

import { useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { feed, usd, useFlow, useWorld, type Grant } from '../../feed'
import { ANTENNAS, antennaTip, FH, ROOF, FUNDER, ROOMS, RULE_Y, STATION_NAMES, STATION_X, stationOf, TRACK_Z, TRUCK, TZ, ZF, type Room } from './layout'
import { activity, intro, pull, stations, TAGS, tagEls, ui } from './state'

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

interface Anchor {
  key: string
  pos: THREE.Vector3
  node?: string
  mode: 'always' | 'active'
  follow?: boolean // moves with its room when the room is pulled out
  station?: number
  lead?: THREE.Vector3 // draw a leader line down to this point
  on?: string
  act?: string
}

const notePos = (r: Room) => {
  const mid = (r.x0 + r.x1) / 2
  switch (r.kind) {
    case 'rules':
      return V(r.x1 - 0.1, r.y0 + 2.3, ZF)
    case 'records':
      return V(4.6, r.y0 + 2.2, 0)
    case 'dispatch':
      return V(11.6, r.y0 + 2.3, 0)
    case 'gm':
      return V(4.4, r.y0 + 2.35, 0)
    case 'supply':
      return V(-9.4, r.y0 + 2.4, 0.3)
    default:
      return V(mid, r.y0 + 2.35, 0.3)
  }
}

const ANCHORS: Anchor[] = []
for (const r of ROOMS) {
  if (r.kind === 'vault') {
    const left = r.x0 < 5
    ANCHORS.push({ key: `vault:${r.node}`, pos: V(left ? r.x0 - 0.1 : r.x1 + 0.1, r.y0 + FH - 0.3, ZF), node: r.node, mode: 'always', follow: true })
    ANCHORS.push({ key: `vaultlow:${r.node}`, pos: V((r.x0 + r.x1) / 2, r.y0 - 0.2, ZF + 0.4), node: r.node, mode: 'always', follow: true })
    continue
  }
  ANCHORS.push({ key: `tag:${r.node}`, pos: V(r.x0 + 0.24, r.y0 + 0.22, ZF), node: r.node, mode: 'always', follow: true })
  ANCHORS.push({ key: `note:${r.node}`, pos: notePos(r), node: r.node, mode: 'active', follow: true })
}
// tags sit on two levels so neighbours never collide; a leader drops to each antenna
ANTENNAS.forEach((a, i) =>
  ANCHORS.push({ key: `src:${a.node}`, pos: V(a.x, ROOF + 0.3 + (i % 2 ? 3.6 : 2.85), TZ), lead: V(a.x, antennaTip(a), TZ), node: a.node, mode: 'always' }),
)
ANCHORS.push({ key: 'out:v:vendors', pos: V((TRUCK.x0 + TRUCK.x1) / 2 + 0.6, 2.75, -0.3), node: 'v:vendors', mode: 'always' })
ANCHORS.push({ key: 'out:p:funder', pos: V((FUNDER.x0 + FUNDER.x1) / 2, 4.45, 0), node: 'p:funder', mode: 'always' })
STATION_X.forEach((x, i) =>
  ANCHORS.push({ key: `st:${i}`, pos: V(x, RULE_Y + 0.92, TRACK_Z), node: 'a:purchasing', mode: 'active', follow: true, station: i }),
)

const els = new Map<string, HTMLElement>()
const reg = (key: string) => (el: HTMLElement | null) => {
  if (el) els.set(key, el)
  else els.delete(key)
}
let layerEl: HTMLElement | null = null

const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

/** Inside the Canvas: projects every anchor to the screen. */
export function Projector() {
  const v = new THREE.Vector3()
  const t = new THREE.Vector3()
  useFrame(({ camera, size }) => {
    if (layerEl) {
      layerEl.style.opacity = smooth(0.55, 0.9, intro.t).toFixed(3)
      const cam = camera as THREE.PerspectiveCamera
      const ppu = size.height / (2 * Math.max(1, camera.position.z - 0) * Math.tan(((cam.fov ?? 30) * Math.PI) / 360))
      const zoom = ppu < 20 ? 'far' : ppu < 40 ? 'mid' : 'near'
      if (layerEl.dataset.zoom !== zoom) layerEl.dataset.zoom = zoom
    }
    for (const a of ANCHORS) {
      const el = els.get(a.key)
      if (!el) continue
      v.copy(a.pos)
      if (a.follow && a.node) v.z += pull[a.node] ?? 0
      v.project(camera)
      const act = a.node ? (activity[a.node] ?? 0) : 0
      const focus = !!a.node && (ui.hovered === a.node || ui.selected === a.node)
      const on = v.z < 1 && (a.mode === 'always' || act > 0.45 || focus) ? '1' : '0'
      if (on !== a.on) {
        el.dataset.on = on
        a.on = on
      }
      const hot = focus ? 'focus' : act > 0.45 ? 'busy' : ''
      if (hot !== a.act) {
        el.dataset.act = hot
        a.act = hot
      }
      if (a.station !== undefined) {
        const s = stations[a.station].state
        const st = s > 0 ? 'pass' : s < 0 ? 'fail' : 'idle'
        if (el.dataset.state !== st) el.dataset.state = st
      }
      if (on === '1' && a.lead) {
        t.copy(a.lead).project(camera)
        el.style.setProperty('--lead', `${Math.max(0, (v.y - t.y) * 0.5 * size.height).toFixed(1)}px`)
      }
      if (on === '1') el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px, 0)`
    }
  })
  return null
}

const SRC_LABEL: Record<string, string> = { 's:payments': 'Payments' }

const WHO: Record<string, string> = {
  'a:purchasing': 'Purchasing agent',
  'a:bookkeeping': 'Bookkeeping agent',
  'a:payment_report': 'Payment & report agent',
  'p:grant_manager': 'Grant manager',
}
const SUB: Record<string, string> = {
  'a:purchasing': 'Six spending rules',
  'a:bookkeeping': 'Fund tracker, invoices',
  'a:payment_report': 'Payment requests, papers',
  'p:grant_manager': 'The only human who approves',
}

export function vaultStatus(g: Grant) {
  if (g.frozen && g.status === 'restored_by_court') return 'Frozen: court order, no cash yet'
  if (g.frozen && g.status === 'canceled') return 'Frozen: canceled'
  if (g.frozen) return 'Frozen'
  return 'Open for spending'
}

/** Over the canvas: the DOM the Projector moves. */
export function LabelLayer() {
  const w = useWorld()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [checks, setChecks] = useState<{ item: string; rows: { k: number; name: string; pass: boolean }[] }>({ item: '', rows: [] })
  useFlow(e => {
    if (e.type === 'reset') {
      setNotes({})
      setChecks({ item: '', rows: [] })
    }
    else if (e.type === 'packet') {
      const p = e.packet
      const text = p.from.startsWith('r:') ? `Sent: ${p.label}` : p.label
      setNotes(n => ({ ...n, [p.from]: text }))
    } else if (e.type === 'arrive') {
      const p = e.packet
      const src = w.nodes.find(n => n.id === p.from)
      const text = p.from.startsWith('s:') ? `${src?.label ?? 'Source'}: ${p.label}` : p.to.startsWith('r:') ? p.label : `In: ${p.label}`
      setNotes(n => ({ ...n, [p.to]: text }))
    } else if (e.type === 'rule') {
      const k = stationOf(e.verdict.rule)
      const req = feed.getWorld().requests.find(r => r.id === e.requestId)
      const row = { k, name: e.verdict.rule, pass: e.verdict.pass }
      setChecks(c => (e.index === 0 || c.item !== (req?.item ?? '') ? { item: req?.item ?? '', rows: [row] } : { item: c.item, rows: [...c.rows, row].slice(-7) }))
    } else if (e.type === 'hold') {
      const h = e.hold
      setNotes(n => ({ ...n, 'p:grant_manager': h.open ? `Waiting on you: ${h.title}` : `${h.decision?.choice === 'approve' ? 'Approved' : 'Rejected'}: ${h.decision?.reason ?? ''}` }))
    }
  })
  const open = w.holds.filter(h => h.open).length

  return (
    <div className="b-labels" aria-hidden="true" ref={el => void (layerEl = el)}>
      {ROOMS.map(r => {
        if (r.kind === 'rules')
          return [
            <div key={`t${r.node}`} className="b-anchor b-tag" ref={reg(`tag:${r.node}`)}>
              <div>
                <b>{r.num}</b> Purchasing agent
                <span>{SUB[r.node]}</span>
              </div>
            </div>,
            <div key={`n${r.node}`} className="b-anchor b-note b-side" ref={reg(`note:${r.node}`)}>
              <div>
                <b>Purchasing agent{checks.item ? `: ${checks.item}` : ''}</b>
                {checks.rows.length ? (
                  <ol className="b-checks">
                    {checks.rows.map((c, i) => (
                      <li key={i} data-pass={c.pass ? '1' : '0'}>
                        <i>{c.k + 1}</i>
                        <span>{c.name}</span>
                        <em>{c.pass ? 'pass' : 'fail'}</em>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <span>{notes[r.node] ?? SUB[r.node]}</span>
                )}
                {checks.rows.length > 0 && notes[r.node] && !notes[r.node].includes(': ') && <em>{notes[r.node]}</em>}
              </div>
            </div>,
          ]
        const g = r.kind === 'vault' ? w.grants.find(x => `g:${x.id}` === r.node) : undefined
        if (g)
          return [
            <div key={r.node} className={`b-anchor b-vault ${r.x0 < 5 ? 'left' : 'right'}`} ref={reg(`vault:${r.node}`)} data-frozen={g.frozen ? '1' : '0'}>
              <div>
                <span className="b-vault-num">
                  {r.num} Vault {g.id}
                </span>
                <span className="b-vault-money">
                  {usd(g.available)} <small>truly available</small>
                </span>
                <span className="b-vault-state">{vaultStatus(g)}</span>
              </div>
            </div>,
            <div key={`low${r.node}`} className="b-anchor b-vault low" ref={reg(`vaultlow:${r.node}`)} data-frozen={g.frozen ? '1' : '0'}>
              <div>
                <span className="b-vault-num">{g.id.slice(0, 3)}</span>
                <span className="b-vault-money">{usd(g.available)}</span>
                <span className="b-vault-state">{g.frozen ? 'Frozen' : 'Open'}</span>
              </div>
            </div>,
          ]
        const res = r.node.startsWith('r:') ? w.researchers.find(x => `r:${x.id}` === r.node) : undefined
        const title = res ? res.name : (WHO[r.node] ?? r.name)
        return [
          <div key={`t${r.node}`} className="b-anchor b-tag" ref={reg(`tag:${r.node}`)}>
            <div>
              <b>{r.num}</b> {res ? r.name : (WHO[r.node] ?? r.name)}
              <span>{res ? res.name : SUB[r.node]}</span>
            </div>
          </div>,
          <div key={`n${r.node}`} className="b-anchor b-note" ref={reg(`note:${r.node}`)}>
            <div>
              <b>{title}</b>
              <span>{notes[r.node] ?? (res ? res.task : SUB[r.node])}</span>
              {res && notes[r.node] && <em>Now: {res.task}</em>}
              {r.node === 'p:grant_manager' && open > 0 && <em>{open} waiting for a decision</em>}
            </div>
          </div>,
        ]
      })}
      {ANTENNAS.map(a => (
        <div key={a.node} className="b-anchor b-src" ref={reg(`src:${a.node}`)}>
          <div>{SRC_LABEL[a.node] ?? w.nodes.find(n => n.id === a.node)?.label ?? a.node}</div>
        </div>
      ))}
      <div className="b-anchor b-src b-out" ref={reg('out:v:vendors')}>
        <div>Vendors</div>
      </div>
      <div className="b-anchor b-src b-out" ref={reg('out:p:funder')}>
        <div>NIH funder</div>
      </div>
      {STATION_NAMES.map((n, i) => (
        <div key={n} className={`b-anchor b-station ${i % 2 ? 'low' : 'high'}`} ref={reg(`st:${i}`)}>
          <div>
            <b>{i + 1}</b>
            <span> {n}</span>
          </div>
        </div>
      ))}
      {Array.from({ length: TAGS }, (_, i) => (
        <div
          key={`cap${i}`}
          className="b-anchor b-cap"
          data-on="0"
          ref={el => {
            tagEls[i] = el
          }}
        >
          <b />
          <span />
        </div>
      ))}
    </div>
  )
}
