// Awarded vs received (T116): the award is what the funder promised over the
// whole grant; received is the money that has actually arrived from it so far.
// A court order or an award notice moves neither; only a payment moves
// received. Shown on each grant's Funds card above the tracker.
import type { Grant } from '../data/types'
import { money } from '../ui'
import './charts.css'

export default function Received({ g }: { g: Pick<Grant, 'awarded' | 'received' | 'spent'> }) {
  const pending = Math.max(0, g.awarded - g.received)
  const share = g.awarded > 0 ? Math.min(1, g.received / g.awarded) : 0
  const pct = Math.round(share * 100)
  const fronted = g.spent - g.received
  return (
    <figure className="rc">
      <dl className="rc-nums">
        <div><dt>Awarded</dt><dd>{money(g.awarded)}</dd></div>
        <div className="rc-in"><dt><span className="rc-swatch" />Received from the funder</dt><dd>{money(g.received)} · {pct}%</dd></div>
        <div className="rc-out"><dt><span className="rc-swatch" />Not received yet</dt><dd>{money(pending)}</dd></div>
      </dl>
      <div className="rc-bar" role="img" aria-label={`${money(g.received)} of the ${money(g.awarded)} award received from the funder; ${money(pending)} not received yet.`}>
        <span style={{ width: `${share * 100}%` }} />
      </div>
      <figcaption className="rc-text">
        Available below counts the whole award; only received money has arrived.
        {fronted > 0 && <> <strong>{money(fronted)} spent beyond what was received</strong>: the university covers it until the funder pays.</>}
      </figcaption>
    </figure>
  )
}
