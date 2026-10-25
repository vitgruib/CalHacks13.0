// The award as a donut: three arcs for spent, committed and available, with
// the available share in the middle. Committed is kept visible even when it's
// small (striped, with a minimum arc length). Legend labels are always shown
// small and grow on hover or focus; double-click (or Enter on) an arc or a
// legend row to open what's behind it.
import { useId, useState } from 'react'
import { money } from '../ui'
import type { Segment } from './Details'
import type { Runway } from './spending'
import './charts.css'

const R = 62
const C = 2 * Math.PI * R
const GAP = 3 // visible gap between arcs, in px of arc length
const MIN_COMMITTED = 0.06 // committed never draws thinner than this share of the ring

export default function Donut({ r, onSegment }: { r: Runway; onSegment?: (s: Segment) => void }) {
  const [active, setActive] = useState<Segment | null>(null)
  const stripes = `dn${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const total = r.awarded || 1
  const spent = Math.min(r.spent, total)
  const committed = Math.min(r.promised, total - spent)
  const available = Math.max(0, r.left)
  const pct = (n: number) => Math.round((n / total) * 100)

  const parts: { key: Segment; name: string; amount: number }[] = [
    { key: 'spent', name: 'Spent', amount: spent },
    { key: 'committed', name: 'Committed', amount: committed },
    { key: 'available', name: 'Available', amount: available },
  ]
  const shown = parts.filter(p => p.amount > 0)
  // Arc lengths: true shares, except committed is widened to a minimum and the
  // extra comes off available, so a small order book is still easy to see.
  const lens = new Map(shown.map(p => [p.key, (p.amount / total) * C]))
  const minLen = MIN_COMMITTED * C
  const c = lens.get('committed')
  if (c !== undefined && c < minLen && lens.has('available')) {
    lens.set('available', Math.max(0, lens.get('available')! - (minLen - c)))
    lens.set('committed', minLen)
  }
  let offset = 0
  const arcs = shown.map(p => {
    const len = lens.get(p.key)!
    const arc = { ...p, len, offset }
    offset += len
    return arc
  })
  const on = (key: Segment) => ({
    onMouseEnter: () => setActive(key),
    onMouseLeave: () => setActive(null),
    onFocus: () => setActive(key),
    onBlur: () => setActive(null),
  })
  const open = (key: Segment) => onSegment && {
    onDoubleClick: () => onSegment(key),
    style: { cursor: 'zoom-in' },
  }
  const state = (key: Segment) => (active === key ? ' dn-on' : active ? ' dn-off' : '')

  return (
    <figure className="dn">
      <div className="dn-row">
        <svg viewBox="0 0 160 160" className="dn-svg" role="img" aria-label={`${pct(available)} percent of the ${money(r.awarded)} award is available: ${money(spent)} spent, ${money(committed)} committed, ${money(available)} available.`}>
          <defs>
            <pattern id={stripes} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" className="dn-stripe-bg" />
              <line x1="0" y1="0" x2="0" y2="7" className="dn-stripe-line" />
            </pattern>
          </defs>
          <circle cx="80" cy="80" r={R} className="dn-track" />
          {arcs.map(a => (
            <circle
              key={a.key} cx="80" cy="80" r={R}
              className={`dn-arc dn-${a.key}${state(a.key)}`}
              stroke={a.key === 'committed' ? `url(#${stripes})` : undefined}
              strokeDasharray={`${Math.max(0, a.len - (shown.length > 1 ? GAP : 0))} ${C}`}
              strokeDashoffset={-a.offset}
              transform="rotate(-90 80 80)"
              {...on(a.key)}
              {...open(a.key)}
            />
          ))}
          <text x="80" y="82" textAnchor="middle" className="dn-pct">{r.left < 0 ? 'Over' : `${pct(available)}%`}</text>
          <text x="80" y="100" textAnchor="middle" className="dn-sub">{r.left < 0 ? 'budget' : 'available'}</text>
        </svg>
        <ul className="dn-legend">
          <li className="dn-item dn-total"><span className="dn-name">Total award</span><span className="dn-value">{money(r.awarded)}</span></li>
          {parts.map(p => (
            <li
              key={p.key}
              className={`dn-item dn-${p.key}${state(p.key)}${p.key === 'committed' && p.amount > 0 ? ' dn-strong' : ''}`}
              tabIndex={0}
              title={onSegment ? 'Double-click to open the list in a new tab' : undefined}
              onKeyDown={e => { if (e.key === 'Enter') onSegment?.(p.key) }}
              {...on(p.key)}
              {...open(p.key)}
            >
              <span className="dn-name"><span className="dn-swatch" />{p.name}{p.key === 'committed' && p.amount > 0 && <small> (ordered, not yet paid)</small>}</span>
              <span className="dn-value">{money(p.amount)} · {pct(p.amount)}%</span>
            </li>
          ))}
        </ul>
      </div>
      <TrackerText r={r} />
    </figure>
  )
}

/** The sentence under the donut. */
export function TrackerText({ r }: { r: Runway }) {
  const pct = Math.round(r.leftShare * 100)
  return (
    <figcaption className="tr-text">
      {r.left < 0
        ? <><strong className="tr-over">Over budget by {money(-r.left)}</strong> on the {money(r.awarded)} award.</>
        : <><strong>{pct}% available</strong>: {money(r.left)} of the {money(r.awarded)} award{r.promised > 0 && <>, with <strong className="tr-committed">{money(r.promised)} already committed</strong></>}.</>}
    </figcaption>
  )
}
