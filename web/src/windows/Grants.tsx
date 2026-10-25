// The researcher's grants in plain words. `#grants/<id>` opens one grant; a
// paused grant opens as a parcel-style tracker: where its money is and what's next.
import { useEffect, useState } from 'react'
import { useStore } from '../data/store'
import type { Db, Grant, SourceReading, StatusEvent } from '../data/types'
import { SIM_NOTE, daysLeft, grantHeading, inTime, longDate, monthYear, paused, shortName, spendable } from '../plain'
import { money } from '../ui'
import MoneyCharts from '../charts/MoneyCharts'
import { forResearcher, useResearcher } from '../people'
import './Grants.css'

const useSubId = () => {
  const read = () => decodeURIComponent(location.hash.split('/')[1] ?? '')
  const [id, setId] = useState(read)
  useEffect(() => {
    const on = () => setId(read())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return id
}

interface Step { title: string; note: string; state: 'done' | 'now' | 'next'; checks?: string[]; unsure?: string }

const sum = (evs: StatusEvent[]) => evs.reduce((s, e) => s + (e.kind === 'payment_received' ? e.amount ?? 0 : 0), 0)

/** "NIH RePORTER: RePORTER shows the project as terminated." — the check behind a step. */
const check = (e: StatusEvent) => `${e.source}: ${e.summary}`

const READING: Record<string, string> = { active: 'active', canceled: 'canceled', restored_by_court: 'restored by a court', ended: 'ended' }

/** The grant's story from its status events; undefined if it was never stopped. */
export function trackerSteps(db: Db, g: Grant): Step[] | undefined {
  const evs = db.statusEvents
    .map((e, i) => ({ e, i }))
    .filter(x => x.e.grantId === g.id && x.e.kind !== 'reading_changed')
    .sort((a, b) => a.e.day.localeCompare(b.e.day) || a.i - b.i)
    .map(x => x.e)
  const stop = evs.findIndex(e => e.kind === 'canceled')
  if (stop < 0) return undefined
  const steps: Step[] = [{ title: 'Grant running normally', note: `${monthYear(g.start)} to ${monthYear(evs[stop].day)} · ${money(sum(evs.slice(0, stop)))} arrived`, state: 'done' }]
  let last = ''
  for (const e of evs.slice(stop)) {
    if (e.kind === last && e.kind === 'canceled') { steps[steps.length - 1].checks!.push(check(e)); continue } // a second source confirming the same stop
    last = e.kind
    const when = longDate(e.day)
    if (e.kind === 'canceled') steps.push({ title: 'The government stopped the grant', note: `${when} · All buying on this grant paused`, state: 'done', checks: [check(e)] })
    else if (e.kind === 'court_order') steps.push({ title: 'A court brought it back', note: when, state: 'done', checks: [check(e)] })
    else if (e.kind === 'payment_received') steps.push({ title: `Money arrived: ${money(e.amount ?? 0)}`, note: when, state: 'done', checks: [check(e)] })
    else if (e.kind === 'unfrozen') steps.push({ title: 'You can buy on it again', note: when, state: 'done', checks: [check(e)] })
  }
  if (paused(g)) {
    // Today's check: each source's latest reading, plus any open flag on the grant.
    const latest = new Map<string, SourceReading>()
    for (const r of db.sourceReadings) if (r.grantId === g.id && (latest.get(r.source)?.day ?? '') <= r.day) latest.set(r.source, r)
    const flags = db.flags.filter(f => f.grantId === g.id && f.open)
    const disagree = flags.find(f => f.kind === 'sources_disagree')
    const readings = new Set([...latest.values()].map(r => r.status))
    steps.push({
      title: g.status === 'restored_by_court' ? 'You are here: waiting for the money' : 'You are here: stopped for now',
      note: g.frozenReason ?? '',
      state: 'now',
      checks: [
        ...[...latest.values()].map(r => `${r.source}: ${READING[r.status] ?? r.status} (${longDate(r.day)})`),
        ...flags.filter(f => f !== disagree).map(f => f.summary),
      ],
      unsure: disagree?.summary ?? (readings.size > 1 ? "The sources don't agree on this grant's status today." : undefined),
    })
    steps.push({ title: 'Money arrives, you can buy again', note: 'Anything you asked for in the meantime gets bought then', state: 'next' })
  }
  return steps
}

function Tracker({ db, g, steps }: { db: Db; g: Grant; steps: Step[] }) {
  const headline = !paused(g)
    ? 'Your money is back. You can buy on this grant again.'
    : g.status === 'restored_by_court'
      ? 'Your money is on its way back, but not here yet.'
      : 'This grant is stopped for now.'
  const backup = db.grants.filter(x => x.id !== g.id && !paused(x)).sort((a, b) => spendable(b) - spendable(a))[0]
  return (
    <div className="gr-page">
      <section className="gr-story">
        <div>
          <p className="gr-kicker">{grantHeading(g)}</p>
          <h1>{headline}</h1>
        </div>
        <ol className="gr-steps">
          {steps.map((s, i) => (
            <li key={i} className={`gr-step gr-${s.state}`} aria-current={s.state === 'now' ? 'step' : undefined}>
              <span className="gr-rail" aria-hidden="true">
                <span className="gr-dot">{s.state === 'done' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
                {i < steps.length - 1 && <span className={`gr-line gr-line-${steps[i + 1].state}`} />}
              </span>
              <div className="gr-text">
                <p className="gr-title">{s.title}</p>
                {s.note && <p className="gr-note">{s.note}</p>}
                {s.unsure && <p className="gr-unsure"><span className="gr-unsure-tag">Unsure</span> {s.unsure}</p>}
                {s.checks && s.checks.length > 0 && (
                  <ul className="gr-checks" aria-label="Checks">
                    {s.checks.map((c, j) => <li key={j}>{c}</li>)}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <aside className="gr-side">
        {paused(g) && backup && (
          <div className="gr-box">
            <h2>Need something now?</h2>
            <p>Your <strong>{shortName(backup)}</strong> grant can pay. It has <strong>{money(spendable(backup))}</strong> left and ends {longDate(backup.end)}.</p>
            {daysLeft(db, backup) <= 90 && <p className="gr-muted">It ends {inTime(daysLeft(db, backup))}, so supplies can't go on it, but equipment and services can.</p>}
            <a href="#ask" className="gr-button">Ask to buy something</a>
          </div>
        )}
        <div className="gr-box">
          <h2>In short</h2>
          <dl>
            <dt>Whole grant</dt><dd>{money(g.awarded)}</dd>
            <dt>Arrived so far</dt><dd>{money(g.received)}</dd>
            <dt>Spent</dt><dd>{money(g.spent)}</dd>
            <dt>Runs until</dt><dd>{monthYear(g.end)}</dd>
          </dl>
        </div>
        <a href="#grants">All my grants</a>
      </aside>
    </div>
  )
}

function GrantCard({ db, g }: { db: Db; g: Grant }) {
  const left = daysLeft(db, g)
  return (
    <article className="gr-card">
      <header>
        <h2>{grantHeading(g)}</h2>
        {paused(g) ? <span className="gr-tag gr-tag-paused">Paused</span> : left <= 90 && <span className="gr-tag gr-tag-soon">Ends {inTime(left)}</span>}
      </header>
      <p className="gr-muted">{money(g.awarded)} grant, until {longDate(g.end)}.{!paused(g) && g.promised > 0 && ` ${money(g.promised)} is set aside for orders on the way.`}</p>
      <MoneyCharts db={db} g={g} details />
      {paused(g)
        ? <a href={`#grants/${g.id}`} className="gr-button">Where's my money?</a>
        : left <= 90 && <p className="gr-note-box">This grant stops on {longDate(g.end)}. Money not spent by then goes back.</p>}
    </article>
  )
}

export default function Grants() {
  const db = forResearcher(useStore().db, useResearcher())
  const sub = useSubId()
  const g = db.grants.find(x => x.id === sub)
  if (g) {
    const steps = trackerSteps(db, g)
    if (steps) return <Tracker db={db} g={g} steps={steps} />
    return (
      <div className="gr-page gr-one">
        <GrantCard db={db} g={g} />
        <a href="#grants">All my grants</a>
      </div>
    )
  }
  return (
    <div className="gr-list">
      <h1>My grants</h1>
      <div className="gr-cards">{db.grants.map(x => <GrantCard key={x.id} db={db} g={x} />)}</div>
      <p className="gr-muted gr-sim-note">{SIM_NOTE}</p>
    </div>
  )
}
