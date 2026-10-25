// The Invoice tab's "research lab console": a dark stage with a living molecule
// network that drifts and leans toward the cursor, and 3D tilt with a moving
// glare on anything marked data-tilt (the three tabs and the invoice cards).
// Plain canvas and CSS transforms, no libraries; respects reduced motion.
import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react'
import './Stage.css'

interface Atom { x: number; y: number; vx: number; vy: number; r: number; hue: number }

function MoleculeField() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const host = canvas?.parentElement
    const ctx = canvas?.getContext('2d')
    if (!canvas || !host || !ctx) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(2, devicePixelRatio || 1)
    const mouse = { x: -999, y: -999 }
    let w = 0, h = 0, raf = 0, atoms: Atom[] = []

    const size = () => {
      const r = host.getBoundingClientRect()
      w = r.width; h = r.height
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.round(Math.min(72, Math.max(24, (w * h) / 15000)))
      atoms = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
        r: 1.4 + Math.random() * 2.6, hue: Math.random() < 0.55 ? 188 : Math.random() < 0.5 ? 160 : 265,
      }))
    }

    const frame = () => {
      ctx.clearRect(0, 0, w, h)
      for (const a of atoms) {
        const dx = mouse.x - a.x, dy = mouse.y - a.y
        const d = Math.hypot(dx, dy)
        if (d < 170 && d > 1) { a.vx += (dx / d) * 0.012; a.vy += (dy / d) * 0.012 } // lean toward the cursor
        a.vx *= 0.995; a.vy *= 0.995
        a.x += a.vx; a.y += a.vy
        if (a.x < -10) a.x = w + 10; else if (a.x > w + 10) a.x = -10
        if (a.y < -10) a.y = h + 10; else if (a.y > h + 10) a.y = -10
      }
      for (let i = 0; i < atoms.length; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
          const d = Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y)
          if (d < 118) {
            ctx.strokeStyle = `hsla(${atoms[i].hue}, 90%, 70%, ${(1 - d / 118) * 0.35})`
            ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(atoms[i].x, atoms[i].y); ctx.lineTo(atoms[j].x, atoms[j].y); ctx.stroke()
          }
        }
      }
      for (const a of atoms) {
        const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r * 4)
        g.addColorStop(0, `hsla(${a.hue}, 95%, 75%, .95)`)
        g.addColorStop(1, `hsla(${a.hue}, 95%, 60%, 0)`)
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r * 4, 0, Math.PI * 2); ctx.fill()
      }
      if (!reduce) raf = requestAnimationFrame(frame)
    }

    const move = (e: globalThis.PointerEvent) => { const r = host.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top }
    const leave = () => { mouse.x = mouse.y = -999 }
    const ro = new ResizeObserver(size)
    size(); frame()
    ro.observe(host)
    host.addEventListener('pointermove', move)
    host.addEventListener('pointerleave', leave)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave) }
  }, [])
  return <canvas ref={ref} className="iv-field-canvas" aria-hidden="true" />
}

const clear = (el: HTMLElement) => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); el.style.setProperty('--glare', '0') }

export default function Stage({ children }: { children: ReactNode }) {
  // One handler for every [data-tilt] element: lean toward the cursor, move the glare.
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tilt]')
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height
    const max = el.dataset.tilt === 'card' ? 4 : 9
    el.style.setProperty('--ry', `${(px - 0.5) * 2 * max}deg`)
    el.style.setProperty('--rx', `${-(py - 0.5) * 2 * max}deg`)
    el.style.setProperty('--mx', `${px * 100}%`)
    el.style.setProperty('--my', `${py * 100}%`)
    el.style.setProperty('--glare', '1')
  }
  const out = (e: PointerEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tilt]')
    if (el && !el.contains(e.relatedTarget as Node | null)) clear(el)
  }
  return (
    <div className="iv-stage" onPointerMove={move} onPointerOut={out}>
      <MoleculeField />
      <div className="iv-stage-body">{children}</div>
    </div>
  )
}

/** A number that counts up to its value when it first appears. */
export function Count({ n }: { n: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = String(n); return }
    const start = performance.now(), from = Number(el.textContent) || 0
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700)
      el.textContent = String(Math.round(from + (n - from) * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [n])
  return <span ref={ref}>0</span>
}
