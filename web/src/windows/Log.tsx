// Log window (MASTER-PLAN §3.6 B4, §4): who did what, and why.
// Information only; decisions live in the Inbox.
import { Fragment, useId, useMemo, useState } from 'react'
import { useStore } from '../data/store'
import type { Actor, Db, LogRow } from '../data/types'
import { Badge, Empty, money } from '../ui'
import './Log.css'

const actorLabel: Record<Actor, string> = {
  purchasing: 'Purchasing agent',
  bookkeeping: 'Bookkeeping agent',
  payment_report: 'Payment & report agent',
  grant_manager: 'Grant manager',
  scientist: 'Researcher',
  funder: 'Funder',
  system: 'System',
}
const isAgent = (a: Actor) => a === 'purchasing' || a === 'bookkeeping' || a === 'payment_report'

interface RefSummary { kind: string; summary: string; href?: string }

/** Find what a log row points at, across every collection. */
function lookupRef(db: Db, id: string): RefSummary | undefined {
  const g = db.grants.find(x => x.id === id)
  if (g) return { kind: 'Grant', summary: `${g.id}: ${g.title}`, href: '#funds' }
  const se = db.statusEvents.find(x => x.id === id)
  if (se) return { kind: 'Status event', summary: `${se.day}, ${se.grantId}: ${se.summary} (source: ${se.source})`, href: '#funds' }
  const sr = db.sourceReadings.find(x => x.id === id)
  if (sr) return { kind: 'Source reading', summary: `${sr.source} said ${sr.status} for ${sr.grantId} on ${sr.day}`, href: '#funds' }
  const f = db.flags.find(x => x.id === id)
  if (f) return { kind: 'Flag', summary: `${f.grantId}: ${f.summary} (${f.open ? 'open' : 'closed'})`, href: '#funds' }
  const rq = db.requests.find(x => x.id === id)
  if (rq) return { kind: 'Purchase request', summary: `${rq.item}, ${money(rq.price)} on ${rq.chargedGrantId ?? rq.grantId}, now ${rq.state.replace(/_/g, ' ')}. ${rq.explanation}`, href: '#requests' }
  const o = db.orders.find(x => x.id === id)
  if (o) return { kind: 'Order', summary: `${o.vendor}, ${money(o.amount)}, placed ${o.placed}, ${o.state}${o.canceledOn ? ` on ${o.canceledOn}` : ''}`, href: '#invoices' }
  const ap = db.approvals.find(x => x.id === id)
  if (ap) return { kind: 'Approval', summary: `${money(ap.amount)} on order ${ap.orderId}, by ${actorLabel[ap.by]} on ${ap.day}`, href: '#invoices' }
  const inv = db.invoices.find(x => x.id === id)
  if (inv) return { kind: 'Invoice', summary: `${inv.vendor}, ${money(inv.amount)}, ${inv.state}${inv.mismatch ? `: ${inv.mismatch}` : ''}`, href: '#invoices' }
  for (const pr of db.paymentRequests) {
    if (pr.id === id) return { kind: 'Payment request', summary: `${pr.grantId}, ${pr.from} to ${pr.to}, ${money(pr.amount)}, ${pr.state.replace(/_/g, ' ')}`, href: '#payment-requests' }
    const fu = pr.followUps.find(x => x.id === id)
    if (fu) return { kind: 'Follow-up question', summary: `"${fu.question}" (${fu.state.replace(/_/g, ' ')})`, href: '#payment-requests' }
  }
  const p = db.papers.find(x => x.id === id)
  if (p) return { kind: 'Report paper', summary: `"${p.title}" in ${p.grantId}'s report: ${p.result}`, href: '#reports' }
  const h = db.holds.find(x => x.id === id)
  if (h) return { kind: 'Inbox item', summary: `${h.title} ${h.decision ? `Decided: ${h.decision.choice.replace(/_/g, ' ')} ("${h.decision.reason}")` : 'Waiting for the grant manager.'}`, href: '#inbox' }
  return undefined
}

export default function Log() {
  const { db } = useStore()
  const [actor, setActor] = useState<Actor | 'all'>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const ids = { actor: useId(), search: useId() }

  // Newest first; rows on the same day keep reverse insertion order.
  const rows = useMemo(
    () => db.log.map((r, i) => ({ r, i })).sort((a, b) => b.r.day.localeCompare(a.r.day) || b.i - a.i).map(x => x.r),
    [db.log],
  )
  const actors = useMemo(() => [...new Set(db.log.map(r => r.actor))], [db.log])

  const q = query.trim().toLowerCase()
  const shown = rows.filter(
    r => (actor === 'all' || r.actor === actor) &&
      (!q || [r.day, actorLabel[r.actor], r.action, r.rule ?? '', r.reason, r.refId ?? ''].some(s => s.toLowerCase().includes(q))),
  )

  return (
    <section className="section">
      <form className="log-filters" role="search" onSubmit={e => e.preventDefault()}>
        <label htmlFor={ids.actor}>Who</label>
        <select id={ids.actor} value={actor} onChange={e => setActor(e.target.value as Actor | 'all')}>
          <option value="all">Everyone</option>
          {actors.map(a => <option key={a} value={a}>{actorLabel[a]}</option>)}
        </select>
        <label htmlFor={ids.search}>Search</label>
        <input id={ids.search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="action, rule, reason, id…" />
        <span className="log-count" aria-live="polite">{shown.length} of {rows.length} rows</span>
      </form>

      {shown.length === 0 ? <Empty>{rows.length === 0 ? 'Nothing has happened yet.' : 'No rows match.'}</Empty> : (
        <div className="log-scroll">
        <table className="log-table">
          <caption className="sr-only">Every action, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Who</th>
              <th scope="col">Did what</th>
              <th scope="col">Rule</th>
              <th scope="col">Reason</th>
              <th scope="col"><span className="sr-only">Details</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <LogEntry key={r.id} r={r} db={db} expanded={open === r.id} toggle={() => setOpen(open === r.id ? null : r.id)} />
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  )
}

function LogEntry({ r, db, expanded, toggle }: { r: LogRow; db: Db; expanded: boolean; toggle: () => void }) {
  const detailId = `log-why-${r.id}`
  const ref = r.refId ? lookupRef(db, r.refId) : undefined
  return (
    <Fragment>
      <tr className={expanded ? 'log-row expanded' : 'log-row'}>
        <td className="log-day">{r.day}</td>
        <td><Badge tone={isAgent(r.actor) ? 'neutral' : 'warn'}>{actorLabel[r.actor]}</Badge></td>
        <td>{r.action}</td>
        <td className="log-rule">{r.rule ?? '—'}</td>
        <td className="log-reason">{r.reason}</td>
        <td>
          <button type="button" className="log-why" aria-expanded={expanded} aria-controls={detailId} onClick={toggle}>
            why?
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="log-detail" id={detailId}>
          <td colSpan={6}>
            <dl>
              <dt>Reason</dt><dd>{r.reason}</dd>
              <dt>Rule</dt><dd>{r.rule ?? 'No rule: a person decided.'}</dd>
              <dt>About</dt>
              <dd>
                {!r.refId ? 'Nothing referenced.' : ref ? (
                  <>
                    <strong>{ref.kind}</strong> <code>{r.refId}</code>: {ref.summary}{' '}
                    {ref.href && <a href={ref.href}>View</a>}
                  </>
                ) : <><code>{r.refId}</code> (not found in the current data)</>}
              </dd>
            </dl>
          </td>
        </tr>
      )}
    </Fragment>
  )
}
