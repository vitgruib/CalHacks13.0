// The grant tracker (donut) with the grant forecast under it, for one grant,
// with a heading above each and its text below. With `details`, a Detailed view
// button under them opens the grant's detailed view (DetailPage) in a new tab.
import type { Db, Grant } from '../data/types'
import type { Segment } from './Details'
import Donut from './Donut'
import RunwayChart from './Runway'
import { runway } from './spending'

/** Where a grant's details open: its own page, in a new tab. */
export const detailUrl = (grantId: string, what: Segment | 'history' | 'all') => `#detail/${encodeURIComponent(grantId)}/${what}`
/** A new browser tab on the details page; if the browser blocks it, open it in this tab instead. */
function openTab(hash: string) {
  const url = `${location.origin}${location.pathname}${location.search}${hash}`
  const tab = window.open(url, '_blank')
  if (!tab) location.hash = hash
}

interface Props { db: Db; g: Grant; details?: boolean }

export default function MoneyCharts({ db, g, details = false }: Props) {
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
          <button type="button" className="mc-open" onClick={() => openTab(detailUrl(g.id, 'all'))}>
            Detailed view <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}
    </div>
  )
}
