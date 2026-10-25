// The page a donut color or the forecast opens in a new tab: `#detail/<grant id>/<what>`
// with <what> = committed | spent | available | history | all (the Detailed view
// button: everything at once). No navigation; the
// tab just shows that one list and can be closed.
import SegmentDetails, { SEGMENT_TITLES, type Segment } from './charts/Details'
import MoneyCharts from './charts/MoneyCharts'
import { StatusHistory } from './windows/Funds'
import { useStore } from './data/store'
import type { Role } from './windows/registry'
import { grantHeading } from './plain'
import './windows/Funds.css'
import './DetailPage.css'

const SEGMENTS: Segment[] = ['spent', 'committed', 'available']

export default function DetailPage({ role }: { role: Role }) {
  const { db } = useStore()
  const [, id = '', what = ''] = location.hash.split('/')
  const g = db.grants.find(x => x.id === decodeURIComponent(id))
  const home = role === 'scientist' ? '#grants' : '#funds'
  // A tab the app opened closes; one reached in place (or by a pasted link) goes back to the list.
  const close = () => {
    if (window.opener) window.close()
    else location.hash = home
  }
  const title = what === 'all' ? 'Detailed view' : what === 'history' ? 'Status timeline' : SEGMENTS.includes(what as Segment) ? SEGMENT_TITLES[what as Segment] : ''

  return (
    <div className={role === 'scientist' ? 'sci' : undefined}>
      <main className="dp">
        <div className="dp-top">
          <span className="dp-brand">GrantGuard</span>
          <button type="button" onClick={close}>Close tab</button>
        </div>
        {!g || !title ? (
          <p className="dp-missing">{db.grants.length === 0 ? 'Loading…' : 'That list is not available.'}</p>
        ) : (
          <>
            <p className="dp-kicker">{g.id} · {g.pi}</p>
            <h1>{grantHeading(g)}</h1>
            {what !== 'all' && <h2>{title}</h2>}
            {what === 'all' ? (
              <>
                <p className="dp-meta">{g.agency} · {g.start} to {g.end}</p>
                <MoneyCharts db={db} g={g} />
                {SEGMENTS.map(s => (
                  <section key={s} className="dp-part">
                    <h2>{SEGMENT_TITLES[s]}</h2>
                    <SegmentDetails db={db} g={g} segment={s} />
                  </section>
                ))}
                <section className="dp-part">
                  <h2>Status and sources</h2>
                  <StatusHistory g={g} db={db} />
                </section>
              </>
            ) : what === 'history' ? <StatusHistory g={g} db={db} /> : <SegmentDetails db={db} g={g} segment={what as Segment} />}
          </>
        )}
      </main>
    </div>
  )
}
