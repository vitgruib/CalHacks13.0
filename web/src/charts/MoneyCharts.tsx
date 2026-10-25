// The grant tracker (donut) with the grant forecast under it, for one grant,
// with a heading above each and its text below. With `details`, a button per
// color of the donut opens that color's list on its own page in a new tab
// (DetailPage); with `forecastDetails`, one more button opens the status
// timeline the same way (Funds only).
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

const SEGMENTS: Segment[] = ['spent', 'committed', 'available']
const SEGMENT_NAMES: Record<Segment, string> = { spent: 'Spent', committed: 'Committed', available: 'Available' }

interface Props { db: Db; g: Grant; details?: boolean; forecastDetails?: boolean }

export default function MoneyCharts({ db, g, details = false, forecastDetails = false }: Props) {
  const r = runway(db, g)
  return (
    <div className="mc">
      <div className="money-charts">
        <section className="mc-panel">
          <h3 className="mc-title">Grants tracker</h3>
          <Donut r={r} />
        </section>
        <section className="mc-panel">
          <h3 className="mc-title">Grant forecast</h3>
          <RunwayChart r={r} />
        </section>
      </div>
      {details && (
        <div className="mc-details">
          <span className="mc-details-label">Detailed view:</span>
          {SEGMENTS.map(s => (
            <button key={s} type="button" className={`mc-detail mc-detail-${s}`} onClick={() => openTab(detailUrl(g.id, s))}>
              {SEGMENT_NAMES[s]}
            </button>
          ))}
          {forecastDetails && (
            <button type="button" className="mc-detail" onClick={() => openTab(detailUrl(g.id, 'history'))}>Status timeline</button>
          )}
        </div>
      )}
    </div>
  )
}
