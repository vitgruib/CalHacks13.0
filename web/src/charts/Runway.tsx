// Will the money last? Money left over time: the solid line is what happened,
// the dashed line is where the recent spending pace leads, against the grant's
// end date. The sentence on top says it in words; hover reads any month.
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { longDate, monthYear } from '../plain'
import { money } from '../ui'
import { duration, monthsBetween, PACE_DAYS, toDay, type Runway } from './spending'
import './charts.css'

const HEIGHT = 220
const PAD = { top: 24, right: 16, bottom: 28, left: 52 }

const short = (n: number) => {
  const a = Math.abs(n)
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${Math.round(a / 1e3)}k` : `$${Math.round(a)}`
  return n < 0 ? `−${s}` : s
}
const month = (ms: number) => monthYear(toDay(ms))

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(560)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

type Tone = 'good' | 'warn' | 'bad' | 'neutral'

/** The runway in one or two plain sentences, plus a tone for the chart. */
export function runwayWords(r: Runway): { tone: Tone; headline: string; advice?: string } {
  const pace = `${money(r.pace)} a month`
  if (r.todayMs >= r.endMs) return { tone: 'neutral', headline: `This grant ended in ${month(r.endMs)}.` }
  if (r.left <= 0) return { tone: 'bad', headline: `Nothing is left: ${money(-r.left)} over the award.` }
  if (r.pace <= 0) return { tone: 'neutral', headline: 'No spending recorded yet, so there is no pace to project.' }
  const lasts = (r.runOutMs! - r.todayMs) / (r.endMs - r.todayMs) >= 1
  if (!lasts) {
    const cut = Math.round((1 - r.evenPace / r.pace) * 100)
    return {
      tone: 'bad',
      headline: `At about ${pace}, the money runs out in ${duration(monthsBetween(r.todayMs, r.runOutMs!))} (${month(r.runOutMs!)}), ${duration(monthsBetween(r.runOutMs!, r.endMs))} before the grant ends.`,
      advice: `To make it last until ${month(r.endMs)}, spend about ${money(r.evenPace)} a month (${cut}% less).`,
    }
  }
  const room = r.evenPace - r.pace
  return {
    tone: r.leftAtEnd > r.awarded * 0.1 ? 'warn' : 'good',
    headline: `At about ${pace}, the money lasts to the end date, with about ${money(r.leftAtEnd)} left on ${month(r.endMs)}.`,
    advice: room >= 100
      ? `Money not spent by the end date usually goes back. There's room for about ${money(room)} more a month (up to ${money(r.evenPace)} a month).`
      : 'That pace spends it down almost exactly by the end date.',
  }
}

export default function RunwayChart({ r }: { r: Runway }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const words = runwayWords(r)

  const ended = r.todayMs >= r.endMs
  const x0 = r.startMs
  // The plot ends at the end date, so the dashed projection runs to the right edge.
  const x1 = Math.max(r.endMs, r.todayMs)
  const yMax = r.awarded * 1.05
  const yMin = Math.min(0, r.left)
  const innerW = width - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const x = (ms: number) => PAD.left + ((ms - x0) / (x1 - x0)) * innerW
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH

  // Projection from today at the current pace, to $0 or the end date.
  const projecting = !ended && r.pace > 0 && r.left > 0
  const projEnd = projecting ? Math.min(r.endMs, r.runOutMs!) : r.todayMs
  const projected = (ms: number) => Math.max(0, r.left - r.pace * monthsBetween(r.todayMs, ms))
  const runsOutEarly = projecting && r.runOutMs! < r.endMs

  const actualPath = r.history.map((p, i) => `${i ? 'L' : 'M'}${x(p.ms).toFixed(1)},${y(p.left).toFixed(1)}`).join(' ')
  const projPath = projecting ? `M${x(r.todayMs)},${y(r.left)} L${x(projEnd)},${y(projected(projEnd))}${runsOutEarly ? ` L${x(r.endMs)},${y(0)}` : ''}` : ''

  // Month ticks, about one per 80px.
  const spanMonths = monthsBetween(x0, x1)
  const step = [1, 2, 3, 6, 12].find(s => spanMonths / s <= innerW / 80) ?? 12
  const ticks: number[] = []
  const first = new Date(x0)
  for (let i = 0; ; i += step) {
    const t = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1)
    if (t > x1) break
    if (t >= x0) ticks.push(t)
  }
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => r.awarded * f)

  const valueAt = (ms: number) => {
    if (ms <= r.todayMs) {
      const h = r.history
      const j = h.findIndex(p => p.ms >= ms)
      if (j <= 0) return h[0].left
      const a = h[j - 1], b = h[j]
      return a.left + (b.left - a.left) * ((ms - a.ms) / (b.ms - a.ms || 1))
    }
    return projecting ? projected(Math.min(ms, r.endMs)) : r.left
  }
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const last = Math.max(r.endMs, r.todayMs)
    const ms = x0 + ((e.clientX - box.left) / box.width) * (last - x0)
    setHover(Math.max(x0, Math.min(ms, last)))
  }
  const hv = hover === null ? null : valueAt(hover)
  const tipLeft = hover === null ? 0 : Math.min(width - 150, Math.max(0, x(hover) - 70))

  return (
    <figure className={`rw rw-${words.tone}`}>
      <div className="rw-plot" ref={ref}>
        <svg width={width} height={HEIGHT} role="img" aria-label={`Money left over time. ${words.headline} ${words.advice ?? ''}`}>
          {yTicks.map(v => (
            <g key={v} className="rw-grid">
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} />
              <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end">{short(v)}</text>
            </g>
          ))}
          {ticks.map(t => (
            <text key={t} className="rw-tick" x={x(t)} y={HEIGHT - 8} textAnchor="middle">
              {step >= 12 || new Date(t).getUTCMonth() === 0 ? new Date(t).getUTCFullYear() : new Date(t).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}
            </text>
          ))}

          {runsOutEarly && <rect className="rw-short" x={x(r.runOutMs!)} y={PAD.top} width={x(r.endMs) - x(r.runOutMs!)} height={innerH} />}

          <line className="rw-mark" x1={x(r.endMs)} x2={x(r.endMs)} y1={PAD.top - 8} y2={PAD.top + innerH} />
          <text className="rw-mark-label" x={x(r.endMs)} y={PAD.top - 12} textAnchor="end">Grant ends {month(r.endMs)}</text>
          {!ended && (
            <>
              <line className="rw-today" x1={x(r.todayMs)} x2={x(r.todayMs)} y1={PAD.top} y2={PAD.top + innerH} />
              <text className="rw-mark-label" x={x(r.todayMs) - 4} y={PAD.top + innerH - 6} textAnchor="end">Today</text>
            </>
          )}

          <path className="rw-actual" d={actualPath} />
          {projecting && <path className="rw-proj" d={projPath} />}
          <circle className="rw-now" cx={x(r.todayMs)} cy={y(r.left)} r={4} />

          {runsOutEarly && (
            <g className="rw-out">
              <circle cx={x(r.runOutMs!)} cy={y(0)} r={5} />
              <text x={x(r.runOutMs!)} y={y(0) - 10} textAnchor="middle">Runs out {month(r.runOutMs!)}</text>
            </g>
          )}
          {projecting && !runsOutEarly && (
            <g className="rw-end">
              <circle cx={x(r.endMs)} cy={y(r.leftAtEnd)} r={5} />
              <text x={x(r.endMs) - 8} y={y(r.leftAtEnd) + 20} textAnchor="end">{money(r.leftAtEnd)} left at the end</text>
            </g>
          )}

          {hover !== null && hv !== null && (
            <g className="rw-hover" pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} />
              <circle cx={x(hover)} cy={y(hv)} r={4} />
            </g>
          )}
          <rect
            className="rw-hit" x={PAD.left} y={PAD.top} width={x(Math.max(r.endMs, r.todayMs)) - PAD.left} height={innerH}
            onPointerMove={onMove} onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover !== null && hv !== null && (
          <div className="rw-tip" style={{ left: tipLeft }}>
            <strong>{money(hv)}</strong> left
            <span>{toDay(hover) > toDay(r.todayMs) ? `${month(hover)} · at this pace` : month(hover)}</span>
          </div>
        )}
      </div>
      <p className="rw-basis">
        <span className="rw-item"><span className="rw-key rw-key-actual" /> Money left so far</span>
        {projecting && <span className="rw-item"><span className="rw-key rw-key-proj" /> If spending keeps its pace</span>}
        <span>Pace = {r.paceBasis === 'recent'
          ? `payroll and purchases over the ${Math.round(PACE_DAYS / 30)} months up to ${longDate(r.paceAsOf)}`
          : 'everything spent ÷ months since the grant started'}</span>
      </p>
      <figcaption>
        <p className="rw-headline">{words.headline}</p>
        {words.advice && <p className="rw-advice">{words.advice}</p>}
      </figcaption>
    </figure>
  )
}
