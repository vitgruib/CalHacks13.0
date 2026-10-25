// The page the Detailed view button opens in a new tab: `#detail/<grant id>/<what>`.
// <what> = all is the whole grant (totals, both charts, what was spent, what's on
// order, and for the grant office the status timeline); committed | spent |
// available | history show one list. No navigation; the tab can be closed.
import type { ReactNode } from 'react'
import SegmentDetails, { SEGMENT_TITLES, type Segment } from './charts/Details'
import MoneyCharts from './charts/MoneyCharts'
import { StatusHistory } from './windows/Funds'
import { useStore } from './data/store'
import type { Db, Grant } from './data/types'
import type { Role } from './windows/registry'
import { grantHeading, longDate } from './plain'
import { Badge, grantStatus, money } from './ui'
import './windows/Funds.css'
import './DetailPage.css'
import { hashPart } from './url'

const SEGMENTS: Segment[] = ['spent', 'committed', 'available']

export default function DetailPage({ role }: { role: Role }) {
  const { db } = useStore()
  const [, , what = ''] = location.hash.split('/')
  const g = db.grants.find(x => x.id === hashPart(1))
  const home = role === 'scientist' ? '#grants' : '#funds'
  // A tab the app opened closes; one reached in place (or by a pasted link) goes back to the list.
  const close = () => {
    if (window.opener) window.close()
    else location.hash = home
  }
  const title = what === 'all' ? 'Detailed view'
    : what === 'history' ? 'Status timeline'
    : SEGMENTS.includes(what as Segment) ? SEGMENT_TITLES[what as Segment] : ''

  return (
    <div className={role === 'scientist' ? 'sci' : undefined}>
      <main className={what === 'all' ? 'dp dp-wide' : 'dp'}>
        <div className="dp-top">
          <span className="dp-brand">Grant Test Auto</span>
          <button type="button" onClick={close}>Close tab</button>
        </div>
        {!g || !title ? (
          <p className="dp-missing">{db.grants.length === 0 ? 'Loading…' : 'That list is not available.'}</p>
        ) : what === 'all' ? (
          <GrantDetails db={db} g={g} role={role} />
        ) : (
          <>
            <p className="dp-kicker">{g.id} · {g.pi}</p>
            <h1>{grantHeading(g)}</h1>
            <h2>{title}</h2>
            {what === 'history' ? <StatusHistory g={g} db={db} /> : <SegmentDetails db={db} g={g} segment={what as Segment} />}
          </>
        )}
      </main>
    </div>
  )
}

/** Everything about one grant on one page. */
function GrantDetails({ db, g, role }: { db: Db; g: Grant; role: Role }) {
  const status = grantStatus(g)
  const available = g.awarded - g.spent - g.promised
  return (
    <>
      <header className="dp-head">
        <p className="dp-kicker">{g.id} · {g.pi} · {g.agency}</p>
        <h1>{grantHeading(g)}</h1>
        <p className="dp-meta">
          <Badge tone={status.tone}>{status.label}</Badge>
          <span>{longDate(g.start)} to {longDate(g.end)}</span>
        </p>
      </header>

      <dl className="dp-stats">
        <Stat label="Total award" value={money(g.awarded)} />
        <Stat label="Spent" value={money(g.spent)} kind="spent" />
        <Stat label="Committed" value={money(g.promised)} kind="committed" note="ordered, not yet paid" />
        <Stat label="Available" value={money(available)} kind="available" note="the award is the budget" />
      </dl>

      <Card title="Where the money stands"><MoneyCharts db={db} g={g} /></Card>
      <Card title={SEGMENT_TITLES.spent}><SegmentDetails db={db} g={g} segment="spent" /></Card>
      <Card title={SEGMENT_TITLES.committed}><SegmentDetails db={db} g={g} segment="committed" /></Card>
      {role === 'grant_manager' && <Card title="Status and sources"><StatusHistory g={g} db={db} /></Card>}
    </>
  )
}

function Stat({ label, value, kind, note }: { label: string; value: string; kind?: Segment; note?: string }) {
  return (
    <div className={kind ? `dp-stat dp-stat-${kind}` : 'dp-stat'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note && <dd className="dp-stat-note">{note}</dd>}
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dp-card">
      <h2>{title}</h2>
      {children}
    </section>
  )
}
