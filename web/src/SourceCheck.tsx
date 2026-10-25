// "Sources last checked 3 min ago" + Check now (T31). Check now asks the
// bookkeeping agent to read every outside source (and, with live sources, to
// start a fresh scraper run first); the line updates when the agent finishes.
// Demo time buttons (T59) run the same check with the cancellation list read
// as it stood on a past real day; the time stays until another is picked.
import { useEffect, useState } from 'react'
import { useStore } from './data/store'
import './SourceCheck.css'

/** A check that hasn't finished by then most likely never will (no worker). */
const GIVE_UP_MS = 90_000

/** 42 s → "42 s ago", 3 min → "3 min ago"; future times (clock skew) read "just now". */
export function ago(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s} s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

/** R01GM061721 on the real Grant Witness list: terminated 2025-07-31,
 *  reinstated 2025-09-22 (Thakur v. Trump). */
const DEMO_TIMES: Array<{ label: string; asOf: string | null }> = [
  { label: 'Before the cut', asOf: '2025-07-30' },
  { label: 'After the cut', asOf: '2025-08-15' },
  { label: 'After the court', asOf: '2025-09-22' },
  { label: 'Today', asOf: null },
]

const fullTime = (d: Date) => d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })

export default function SourceCheck() {
  const { sourceCheck, checkNow } = useStore()
  const { last, pendingSince, asOf } = sourceCheck
  const [now, setNow] = useState(() => Date.now())
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const timedOut = pendingSince !== null && now - pendingSince.getTime() >= GIVE_UP_MS
  const checking = sending || (pendingSince !== null && !timedOut)
  const failed = error ?? (timedOut ? `The check didn't finish within ${GIVE_UP_MS / 1000} s. Is the agent worker running?` : null)

  const press = (day: string | null) => {
    setError(null)
    setSending(true)
    checkNow(day ?? undefined)
      .catch(e => setError(`Check failed: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setSending(false))
  }

  return (
    <div className={`source-check${failed && !checking ? ' failed' : ''}`} role="status" aria-live="polite">
      <span className="source-check-when">
        {last
          ? <>Sources last checked <time dateTime={last.at.toISOString()} title={`${fullTime(last.at)} · ${last.what}`}>{ago(now - last.at.getTime())}</time></>
          : 'Sources not checked yet'}
      </span>
      {checking && <span className="source-check-note">Reading every source…</span>}
      {!checking && failed && <span className="source-check-error">{failed}</span>}
      <button type="button" onClick={() => press(asOf)} disabled={checking}>
        {checking ? 'Checking…' : failed ? 'Try again' : 'Check now'}
      </button>
      <div className="source-check-times" role="group" aria-label="Demo time: check the cancellation list as of">
        <span>Demo time</span>
        {DEMO_TIMES.map(t => (
          <button key={t.label} type="button" aria-pressed={asOf === t.asOf} disabled={checking} onClick={() => press(t.asOf)}
            title={t.asOf ? `Check now, reading the real cancellation list as it stood on ${t.asOf}` : 'Check now, reading today\'s cancellation list'}>
            {t.label}{t.asOf && <small>{t.asOf}</small>}
          </button>
        ))}
      </div>
    </div>
  )
}
