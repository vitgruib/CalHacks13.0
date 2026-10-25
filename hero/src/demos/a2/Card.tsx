// The one hover card: a name and one line on what that thing is doing now,
// anchored above whatever the pointer is over in the stage. It shows only
// while the pointer is over the 3D object itself (never for a sidebar row),
// stays inside the stage, flips near the edges, and steps aside from any
// other floating overlay; if there is no clear spot, it doesn't show.

import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { feed } from '../../feed'
import { HANG, P } from './mobile'
import { nodeLine, nodeName } from './now'
import { fx, ui } from './store'

const card = {
  el: null as HTMLDivElement | null,
  name: null as HTMLParagraphElement | null,
  line: null as HTMLParagraphElement | null,
  id: null as string | null,
  at: 0,
  w: 0,
  h: 0,
  x: -1,
  y: -1,
  on: false,
  others: [] as DOMRect[],
  stage: null as DOMRect | null,
}

export function HoverCard() {
  return (
    <div
      className="a2-card"
      data-float="hover-card"
      aria-hidden="true"
      ref={el => {
        card.el = el
      }}
    >
      <p
        className="a2-card-name"
        ref={el => {
          card.name = el
        }}
      />
      <p
        className="a2-card-line"
        ref={el => {
          card.line = el
        }}
      />
    </div>
  )
}

const v = new Vector3()
const GAP = 12
const EDGE = 8

function anchor(id: string, out: Vector3) {
  if (id.startsWith('r:') || id === 'p:grant_manager') {
    const b = fx.bodies.get(id === 'p:grant_manager' ? 'gm' : id.slice(2))
    if (!b) return null
    return out.copy(b.head).setY(b.head.y + 0.42)
  }
  const p = P.get(id)
  if (!p) return null
  return out.copy(p).setY(p.y + (HANG.get(id)?.top ?? 0.3) + 0.1)
}

const overlaps = (x: number, y: number, w: number, h: number, r: DOMRect) => x < r.right && x + w > r.left && y < r.bottom && y + h > r.top

function hide() {
  if (card.on && card.el) {
    card.el.classList.remove('is-on')
    card.on = false
  }
  card.id = null
}

/** Inside the Canvas: projects the anchor and places the card every frame. */
export function CardTracker() {
  const { camera, size } = useThree()
  useFrame(() => {
    const el = card.el
    if (!el || !card.name || !card.line) return
    const s = ui.get()
    const id = fx.pointer && s.hovered === fx.pointer ? fx.pointer : null
    if (!id || !anchor(id, v)) return hide()
    const t = performance.now()
    if (id !== card.id || t - card.at > 300) {
      // Words and the other overlays' boxes, a few times a second.
      const w = feed.getWorld()
      const name = nodeName(w, id)
      const line = nodeLine(w, id).text
      if (card.name.textContent !== name) card.name.textContent = name
      if (card.line.textContent !== line) card.line.textContent = line
      card.line.hidden = !line
      card.w = el.offsetWidth
      card.h = el.offsetHeight
      const stage = el.parentElement?.getBoundingClientRect() ?? null
      card.stage = stage
      card.others.length = 0
      if (stage)
        document.querySelectorAll('[data-float]').forEach(n => {
          if (n === el) return
          const r = n.getBoundingClientRect()
          if (r.width > 0 && r.height > 0) card.others.push(new DOMRect(r.left - stage.left, r.top - stage.top, r.width, r.height))
        })
      card.id = id
      card.at = t
    }
    v.project(camera)
    if (v.z > 1) return hide()
    const ax = ((v.x + 1) / 2) * size.width
    const ay = ((1 - v.y) / 2) * size.height
    const W = card.w
    const H = card.h
    // Above, then to either side, then below.
    let px = -1
    let py = -1
    for (let i = 0; i < 4; i++) {
      const x = i === 0 || i === 3 ? ax - W / 2 : i === 1 ? ax + GAP : ax - GAP - W
      const y = i === 0 ? ay - GAP - H : i === 3 ? ay + GAP * 3 : ay - H / 2
      const cx = Math.min(Math.max(EDGE, x), size.width - W - EDGE)
      const cy = Math.min(Math.max(EDGE, y), size.height - H - EDGE)
      if (Math.abs(cx - x) > W / 2 || Math.abs(cy - y) > H / 2) continue
      let clear = true
      for (const r of card.others) if (overlaps(cx, cy, W, H, r)) clear = false
      if (!clear) continue
      px = cx
      py = cy
      break
    }
    if (px < 0) return hide()
    if (Math.abs(px - card.x) > 0.5 || Math.abs(py - card.y) > 0.5) {
      el.style.transform = `translate3d(${Math.round(px)}px, ${Math.round(py)}px, 0)`
      card.x = px
      card.y = py
    }
    if (!card.on) {
      el.classList.add('is-on')
      card.on = true
    }
  })
  return null
}

/** Pointer left the stage: nothing is hovered from the stage any more. */
export function leaveStage() {
  if (fx.pointer && ui.get().hovered === fx.pointer) ui.set({ hovered: null })
  fx.pointer = null
  document.body.style.cursor = ''
}
