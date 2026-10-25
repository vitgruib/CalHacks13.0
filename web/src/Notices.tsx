// Notifications shown above every window when a grant is restored (MASTER-PLAN §3.1):
// once when a court order restores its status, and once when money arrives and
// spending reopens. Each one spells out what the change means for the lab.
import { useState } from 'react'
import { useStore } from './data/store'
import { trulyAvailable, type Db, type Grant, type StatusEvent } from './data/types'
import { money } from './ui'
import './Notices.css'

interface Notice { id: string; tone: 'warn' | 'good'; title: string; points: string[] }

const DAY_MS = 86_400_000
const daysLeft = (g: Grant, today: string) => Math.round((Date.parse(g.end) - Date.parse(today)) / DAY_MS)

function endPoint(g: Grant, today: string): string {
  const left = daysLeft(g, today)
  if (left < 0) return `The grant ended on ${g.end}. Restoring it does not extend the end date; spending needs a no-cost extension from the funder.`
  const base = `The end date is still ${g.end} (${left} days away). Time lost while it was canceled is not added back unless the funder approves a no-cost extension.`
  return left <= 90 ? `${base} It is in its last 90 days, so new supply purchases are rerouted or blocked.` : base
}

function waiting(db: Db, grantId: string): string {
  const holds = db.holds.filter(h => h.grantId === grantId && !h.decision).length
  return holds === 0 ? 'Nothing is waiting in the Inbox for this grant.' : `${holds} item${holds === 1 ? '' : 's'} for this grant ${holds === 1 ? 'is' : 'are'} waiting in the Inbox.`
}

function courtOrderNotice(db: Db, g: Grant, e: StatusEvent): Notice {
  return {
    id: e.id,
    tone: 'warn',
    title: `${g.id} restored by court on ${e.day}. No spending until the money arrives.`,
    points: [
      'A court order restores the status, not the cash. No payment has arrived, so agents will not buy, pay invoices or promise money on this grant yet.',
      `New purchases on this grant are held for the grant manager instead of bought. ${waiting(db, g.id)}`,
      'Court orders can be appealed or paused, so the status can change again. The fund tracker keeps re-checking NIH RePORTER, USAspending and the cancellation lists.',
      'Costs from the canceled period may not be paid back. Check with the funder before counting on them.',
      endPoint(g, db.today),
    ],
  }
}

function reopenedNotice(db: Db, g: Grant, e: StatusEvent): Notice {
  return {
    id: e.id,
    tone: 'good',
    title: `${g.id} is active again: money arrived on ${e.day}, so spending reopens.`,
    points: [
      `Truly available is now ${money(trulyAvailable(g))} (awarded minus spent minus promised).`,
      `Purchases held during the freeze are checked against every rule again before anything is bought. ${waiting(db, g.id)}`,
      'The next payment request should cover the allowable costs held during the freeze, with each one explained.',
      'If the court order is reversed, the grant freezes again and agents stop spending.',
      endPoint(g, db.today),
    ],
  }
}

/** Every restoration in the event history, newest first. */
export function restorationNotices(db: Db): Notice[] {
  const out: Notice[] = []
  for (const g of db.grants) {
    const events = db.statusEvents.filter(e => e.grantId === g.id).sort((a, b) => a.day.localeCompare(b.day))
    events.forEach((e, i) => {
      if (e.kind === 'court_order') out.push(courtOrderNotice(db, g, e))
      const afterCourt = events.slice(0, i).some(p => p.kind === 'court_order')
      if (e.kind === 'unfrozen' && afterCourt) out.push(reopenedNotice(db, g, e))
    })
  }
  return out.reverse()
}

const KEY = 'gg.dismissedNotices'
function loadDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export default function Notices() {
  const { db } = useStore()
  const [dismissed, setDismissed] = useState(loadDismissed)
  const dismiss = (id: string) => {
    const next = [...dismissed, id]
    setDismissed(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* per-viewer convenience only */ }
  }
  const notices = restorationNotices(db).filter(n => !dismissed.includes(n.id))
  if (notices.length === 0) return null
  return (
    <div className="notices" role="status" aria-live="polite">
      {notices.map(n => (
        <article key={n.id} className={`notice notice-${n.tone}`}>
          <header>
            <strong>{n.title}</strong>
            <button onClick={() => dismiss(n.id)} aria-label="Dismiss notification">Dismiss</button>
          </header>
          <details>
            <summary>What this means</summary>
            <ul>{n.points.map(p => <li key={p}>{p}</li>)}</ul>
            <a href="#funds">See it in Funds →</a>
          </details>
        </article>
      ))}
    </div>
  )
}
