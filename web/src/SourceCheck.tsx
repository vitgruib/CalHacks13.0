// "Sources last checked 3 min ago" + Check now (T31). Check now asks the
// bookkeeping agent to read every outside source (and, with live sources, to
// start a fresh scraper run first); the line updates when the agent finishes.
// Demo times moved to the real failure cases (T65, FailureCases.tsx), one grant each;
// Check now reads today's list for every grant.
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

const fullTime = (d: Date) => d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })

export default function SourceCheck() {
  const { sourceCheck, checkNow } = useStore()
  const { last, pendingSince } = sourceCheck
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

  const press = () => {
    setError(null)
    setSending(true)
    checkNow()
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
      <button type="button" onClick={press} disabled={checking}>
        {checking ? 'Checking…' : failed ? 'Try again' : 'Check now'}
      </button>
    </div>
  )
}
