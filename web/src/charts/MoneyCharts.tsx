// The grant tracker (donut) with the grant forecast under it, for one grant,
// with a heading above each and its text below. With `details`, double-clicking
// a color of the donut opens that color's list on its own page in a new tab
// (DetailPage); with `forecastDetails`, double-clicking the forecast opens the
// status timeline the same way (Funds only).
import type { KeyboardEvent } from 'react'
import type { Db, Grant } from '../data/types'
import type { Segment } from './Details'
import Donut from './Donut'
import RunwayChart from './Runway'
import { runway } from './spending'

/** Where a grant's details open: its own page, in a new tab. */
export const detailUrl = (grantId: string, what: Segment | 'history') => `#detail/${encodeURIComponent(grantId)}/${what}`
/** A new browser tab on the details page; if the browser blocks it, open it in this tab instead. */
function openTab(hash: string) {
  const url = `${location.origin}${location.pathname}${location.search}${hash}`
  const tab = window.open(url, '_blank')
  if (!tab) location.hash = hash
}

interface Props { db: Db; g: Grant; details?: boolean; forecastDetails?: boolean }

export default function MoneyCharts({ db, g, details = false, forecastDetails = false }: Props) {
  const r = runway(db, g)
  const forecast = <RunwayChart r={r} />
  return (
    <div className="mc">
      <div className="money-charts">
        <section className="mc-panel">
          <h3 className="mc-title">Grants tracker</h3>
          <Donut r={r} onSegment={details ? s => openTab(detailUrl(g.id, s)) : undefined} />
        </section>
        <section className="mc-panel">
          <h3 className="mc-title">Grant forecast</h3>
          {forecastDetails ? (
            <div
              className="chart-open"
              tabIndex={0}
              role="link"
              aria-label="Grant forecast: double-click or press Enter to open the status timeline in a new tab"
              title="Double-click to open the status timeline in a new tab"
              onDoubleClick={() => openTab(detailUrl(g.id, 'history'))}
              onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' && e.target === e.currentTarget) openTab(detailUrl(g.id, 'history')) }}
            >
              {forecast}
            </div>
          ) : forecast}
        </section>
      </div>
    </div>
  )
}
