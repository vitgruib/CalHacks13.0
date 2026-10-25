// The page around the model: title, narration, playback, ledger, the grant
// manager's inbox, the request form, a directory of rooms for keyboard use,
// and the drawer that opens when a room is pulled out.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { feed, PRESETS, usd, useFlow, useWorld, type Hold, type LogRow, type Outcome, type Preset, type Request, type World } from '../../feed'
import { select, useSelected } from './state'
import { vaultStatus } from './Labels'

const APP_URL = import.meta.env.VITE_APP_URL ?? 'https://calhacks130.vercel.app'

// ── Words ────────────────────────────────────────────────────────────────

export function stateWord(r: Request) {
  switch (r.state) {
    case 'bought':
      return 'Bought'
    case 'rerouted':
      return r.chargedGrantId ? `Rerouted to ${r.chargedGrantId}` : 'Rerouted'
    case 'blocked':
      return r.outcome === 'refine' ? 'Sent back: split it' : 'Blocked'
    case 'rejected':
      return 'Rejected by the grant manager'
    case 'waiting_on_manager':
      return 'Held for the grant manager'
    default:
      return r.outcome === 'hold' ? 'Held until money lands' : 'Checking the rules'
  }
}

const tone = (r: Request): Outcome | 'pending' => (r.state === 'rejected' ? 'reject' : (r.outcome ?? 'pending'))

const ACTOR: Record<LogRow['actor'], string> = {
  purchasing: 'Purchasing',
  bookkeeping: 'Bookkeeping',
  payment_report: 'Payment & report',
  grant_manager: 'Grant manager',
  scientist: 'Researcher',
  system: 'System',
}

const EXPECT: Record<Outcome, string> = { accept: 'Likely bought', refine: 'Likely rerouted or sent back', reject: 'Likely blocked', hold: 'Likely held' }

const SOURCE_OF: Record<string, string> = {
  's:reporter': 'NIH RePORTER',
  's:usaspending': 'USAspending',
  's:cancellations': 'Cancellation list (Apify)',
  's:court': 'Court notice',
  's:payments': 'Payment system',
}

const day = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// ── Icons ────────────────────────────────────────────────────────────────

const I = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const PLAY = 'M5 3.5v9l7-4.5z'
const PAUSE = 'M5.5 3.5v9M10.5 3.5v9'
const REPLAY = 'M3.5 8a4.5 4.5 0 1 0 1.4-3.3M3.5 2.5v2.6h2.6'
const CLOSE = 'M4 4l8 8M12 4l-8 8'
const LIST = 'M3 4.5h10M3 8h10M3 11.5h10'
const SEND = 'M2.5 8h9M8 4.5L11.5 8 8 11.5'
const OUT = 'M6 3.5H3.5v9h9V10M9 3.5h3.5V7M12.5 3.5L7.5 8.5'

// ── Hooks ────────────────────────────────────────────────────────────────

function useNarrow() {
  const q = '(max-width: 720px)'
  const [n, setN] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setN(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return n
}

// ── Pieces ───────────────────────────────────────────────────────────────

function Playback({ w }: { w: World }) {
  return (
    <div className="b-play" role="group" aria-label="Playback">
      <button type="button" className="b-icon" onClick={() => (w.playing ? feed.pause() : feed.play())} aria-label={w.playing ? 'Pause' : 'Play'}>
        <I d={w.playing ? PAUSE : PLAY} />
      </button>
      <div className="b-speeds" role="radiogroup" aria-label="Speed">
        {[1, 2, 4].map(s => (
          <button key={s} type="button" role="radio" aria-checked={w.speed === s} className="b-speed" onClick={() => feed.setSpeed(s)}>
            {s}x
          </button>
        ))}
      </div>
      <button type="button" className="b-icon" onClick={() => feed.restart()} aria-label="Replay the story from the start">
        <I d={REPLAY} />
      </button>
    </div>
  )
}

function LogRows({ rows }: { rows: LogRow[] }) {
  if (!rows.length) return <p className="b-empty">Nothing logged yet.</p>
  return (
    <ol className="b-log">
      {rows.map(r => (
        <li key={r.id}>
          <div className="b-log-head">
            <span className="b-log-actor" data-actor={r.actor}>
              {ACTOR[r.actor]}
            </span>
            <span className="b-log-action">{r.action}</span>
            <time className="b-num">{r.day.slice(5)}</time>
          </div>
          <p>{r.reason}</p>
        </li>
      ))}
    </ol>
  )
}

function Ledger({ w, count = 5 }: { w: World; count?: number }) {
  return (
    <section className="b-card b-ledger" aria-label="Ledger">
      <header className="b-card-head">
        <h2>Ledger</h2>
        <span>Newest first, live</span>
      </header>
      <LogRows rows={w.log.slice(0, count)} />
    </section>
  )
}

function HoldCard({ h, autoFocus }: { h: Hold; autoFocus?: boolean }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | undefined>()
  const id = `b-reason-${h.id}`
  const decide = (choice: 'approve' | 'reject') => setErr(feed.decide(h.id, choice, reason))
  return (
    <article className="b-hold">
      <h3>{h.title}</h3>
      <p>{h.why}</p>
      {h.evidence.length > 0 && (
        <dl className="b-evidence">
          {h.evidence.map(e => (
            <div key={e.label}>
              <dt>{e.label}</dt>
              <dd className="b-num">{e.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <label htmlFor={id}>Your reason (goes in the log)</label>
      <textarea id={id} rows={2} value={reason} onChange={e => setReason(e.target.value)} autoFocus={autoFocus} aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined} />
      {err && (
        <p className="b-err" id={`${id}-err`} role="alert">
          {err}
        </p>
      )}
      <div className="b-hold-actions">
        <button type="button" className="b-btn b-approve" onClick={() => decide('approve')}>
          Approve
        </button>
        <button type="button" className="b-btn b-reject" onClick={() => decide('reject')}>
          Reject
        </button>
      </div>
    </article>
  )
}

function Inbox({ holds, onClose }: { holds: Hold[]; onClose?: () => void }) {
  return (
    <section className="b-card b-inbox" aria-label="Grant manager inbox">
      <header className="b-card-head">
        <h2>Waiting on you</h2>
        <span>You are the grant manager</span>
        {onClose && (
          <button type="button" className="b-icon b-close" onClick={onClose} aria-label="Close inbox">
            <I d={CLOSE} />
          </button>
        )}
      </header>
      {holds.length ? holds.map(h => <HoldCard key={h.id} h={h} />) : <p className="b-empty">No open holds. Agents ask here when a rule needs a person.</p>}
    </section>
  )
}

function RequestPanel({ w, onClose, onSent }: { w: World; onClose: () => void; onSent: (id: string) => void }) {
  const [pick, setPick] = useState(0)
  const [who, setWho] = useState(PRESETS[0].researcherId)
  const preset: Preset = PRESETS[pick]
  const input = useMemo(() => ({ ...preset, researcherId: who }), [preset, who])
  const hint = useMemo(() => {
    try {
      return feed.preview(input)
    } catch {
      return preset.expect
    }
    // re-run when the grants change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, w.grants])
  return (
    <section className="b-card b-request" aria-label="Send a request" role="dialog">
      <header className="b-card-head">
        <h2>Send a request</h2>
        <span>It goes down the tube to the purchasing agent</span>
        <button type="button" className="b-icon b-close" onClick={onClose} aria-label="Close">
          <I d={CLOSE} />
        </button>
      </header>
      <fieldset className="b-presets">
        <legend>What to ask for</legend>
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            type="button"
            className="b-preset"
            aria-pressed={pick === i}
            onClick={() => {
              setPick(i)
              setWho(p.researcherId)
            }}
          >
            <span>{p.label}</span>
            <span className="b-num">{usd(p.price)}</span>
          </button>
        ))}
      </fieldset>
      <div className="b-field">
        <label htmlFor="b-who">Who sends it</label>
        <select id="b-who" value={who} onChange={e => setWho(e.target.value)}>
          {w.researchers.map(r => (
            <option key={r.id} value={r.id}>
              {r.name}, {r.role}
            </option>
          ))}
        </select>
      </div>
      <p className="b-preview" data-tone={hint}>
        <span>{EXPECT[hint]}</span> {preset.category}, charged to <span className="b-num">{preset.grantId}</span>
        {preset.sharedWith?.length ? ', shared by both grants' : ''}. The agent decides with the rules in force when it arrives.
      </p>
      <button
        type="button"
        className="b-btn b-primary"
        onClick={() => {
          onSent(feed.submit(input))
        }}
      >
        <I d={SEND} /> Send it
      </button>
    </section>
  )
}

function Tracker({ id, w, onClose, onAgain }: { id: string; w: World; onClose: () => void; onAgain: () => void }) {
  const r = w.requests.find(x => x.id === id || x.revisionOf === id)
  const latest = w.requests.find(x => x.revisionOf === id) ?? r
  if (!latest) return null
  const who = w.researchers.find(x => x.id === latest.researcherId)
  return (
    <section className="b-card b-track" aria-live="polite" data-tone={tone(latest)}>
      <div className="b-track-main">
        <span className="b-track-state">{stateWord(latest)}</span>
        <span>
          {latest.item}, <span className="b-num">{usd(latest.price)}</span>, from {who?.name ?? 'the lab'}
        </span>
        {latest.state !== 'submitted' || latest.outcome ? <p>{latest.explanation}</p> : null}
      </div>
      <div className="b-track-actions">
        <button type="button" className="b-link" onClick={onAgain}>
          Send another
        </button>
        <button type="button" className="b-icon b-close" onClick={onClose} aria-label="Close">
          <I d={CLOSE} />
        </button>
      </div>
    </section>
  )
}

function Money({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  return (
    <div className={strong ? 'b-money strong' : 'b-money'}>
      <dt>{label}</dt>
      <dd className="b-num">{usd(v)}</dd>
    </div>
  )
}

function Detail({ id, w }: { id: string; w: World }): ReactNode {
  const node = w.nodes.find(n => n.id === id)
  if (id.startsWith('r:')) {
    const r = w.researchers.find(x => `r:${x.id}` === id)
    if (!r) return null
    const reqs = w.requests.filter(x => x.researcherId === r.id).slice(0, 6)
    return (
      <>
        <p className="b-kind">
          {r.role} · {r.station}
        </p>
        <h2>{r.name}</h2>
        <p className="b-now">
          <span>Working on</span> {r.task}
        </p>
        <p className="b-sub">
          Paid from <span className="b-num">{r.grantIds.join(', ')}</span>
        </p>
        <h3>Requests</h3>
        {reqs.length ? (
          <ul className="b-reqs">
            {reqs.map(q => (
              <li key={q.id} data-tone={tone(q)}>
                <div className="b-req-head">
                  <span>{q.item}</span>
                  <span className="b-num">{usd(q.price)}</span>
                </div>
                <span className="b-pill">{stateWord(q)}</span>
                <p>{q.explanation}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="b-empty">No requests yet.</p>
        )}
      </>
    )
  }
  if (id.startsWith('a:')) {
    const role = id.slice(2)
    const a = w.agents.find(x => x.role === role)
    if (!a) return null
    return (
      <>
        <p className="b-kind">AI agent · {a.seat}</p>
        <h2>{a.name}</h2>
        <p>{a.job}</p>
        {role === 'purchasing' && (
          <ol className="b-rules">
            <li>Grant is active and not frozen</li>
            <li>Not in the grant’s last 90 days, for supplies</li>
            <li>Enough truly available money</li>
            <li>Category allowed</li>
            <li>Under the $5,000 card limit</li>
            <li>Shared costs split across the grants they serve</li>
          </ol>
        )}
        <h3>Recent log</h3>
        <LogRows rows={w.log.filter(l => l.actor === role).slice(0, 6)} />
      </>
    )
  }
  if (id.startsWith('g:')) {
    const g = w.grants.find(x => `g:${x.id}` === id)
    if (!g) return null
    const ev = w.statusEvents.filter(e => e.grantId === g.id).slice(0, 6)
    return (
      <>
        <p className="b-kind">
          Grant · {g.agency} · ends {day(g.end)}
        </p>
        <h2 className="b-num">{g.id}</h2>
        <p>{g.title}</p>
        <p className="b-status" data-frozen={g.frozen ? '1' : '0'}>
          {vaultStatus(g)}
        </p>
        {g.frozen && g.frozenReason && <p className="b-sub">{g.frozenReason}</p>}
        <dl className="b-moneys">
          <Money label="Truly available" v={g.available} strong />
          <Money label="Awarded" v={g.awarded} />
          <Money label="Received" v={g.received} />
          <Money label="Spent" v={g.spent} />
          <Money label="Promised" v={g.promised} />
        </dl>
        <p className="b-sub">Truly available is awarded minus spent minus promised.</p>
        <h3>Status events</h3>
        {ev.length ? (
          <ul className="b-events">
            {ev.map(e => (
              <li key={e.id}>
                <div className="b-req-head">
                  <span>{e.source}</span>
                  <time className="b-num">{day(e.day)}</time>
                </div>
                <p>{e.summary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="b-empty">No status changes yet.</p>
        )}
      </>
    )
  }
  if (id === 'p:grant_manager') {
    const open = w.holds.filter(h => h.open)
    const closed = w.holds.filter(h => !h.open).slice(0, 3)
    return (
      <>
        <p className="b-kind">Person · you, in this demo</p>
        <h2>Grant manager</h2>
        <p>The only one who approves exceptions, always with a reason that goes in the log.</p>
        <h3>Open holds</h3>
        {open.length ? open.map(h => <HoldCard key={h.id} h={h} />) : <p className="b-empty">Nothing waiting.</p>}
        {closed.length > 0 && (
          <>
            <h3>Decided</h3>
            <ul className="b-events">
              {closed.map(h => (
                <li key={h.id}>
                  <div className="b-req-head">
                    <span>{h.title}</span>
                  </div>
                  <p>
                    {h.decision?.choice === 'approve' ? 'Approved' : 'Rejected'}: {h.decision?.reason}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    )
  }
  if (id.startsWith('s:')) {
    const src = SOURCE_OF[id]
    const ev = w.statusEvents.filter(e => e.source === src).slice(0, 6)
    return (
      <>
        <p className="b-kind">Source · read by the bookkeeping agent</p>
        <h2>{node?.label ?? id}</h2>
        {node?.sub && <p>{node.sub}</p>}
        <h3>What it reported</h3>
        {ev.length ? (
          <ul className="b-events">
            {ev.map(e => (
              <li key={e.id}>
                <div className="b-req-head">
                  <span className="b-num">{e.grantId}</span>
                  <time className="b-num">{day(e.day)}</time>
                </div>
                <p>{e.summary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="b-empty">No changes reported. Routine readings come in as “no change”.</p>
        )}
      </>
    )
  }
  if (id === 'v:vendors') {
    const bought = w.requests.filter(r => r.state === 'bought' || r.state === 'rerouted').slice(0, 6)
    return (
      <>
        <p className="b-kind">Outside · loading dock</p>
        <h2>Vendors</h2>
        <p>Orders leave from the grant they are charged to. Invoices come back to the bookkeeping agent.</p>
        <h3>Orders placed</h3>
        {bought.length ? (
          <ul className="b-events">
            {bought.map(r => (
              <li key={r.id}>
                <div className="b-req-head">
                  <span>{r.item}</span>
                  <span className="b-num">{usd(r.price)}</span>
                </div>
                <p>
                  Charged to <span className="b-num">{r.chargedGrantId ?? r.grantId}</span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="b-empty">No orders yet.</p>
        )}
      </>
    )
  }
  if (id === 'p:funder') {
    return (
      <>
        <p className="b-kind">Outside · funder</p>
        <h2>{node?.label ?? 'NIH funder'}</h2>
        <p>Receives payment requests from the payment & report agent and sends follow-up questions back.</p>
        <h3>Recent log</h3>
        <LogRows rows={w.log.filter(l => l.actor === 'payment_report').slice(0, 5)} />
      </>
    )
  }
  return (
    <>
      <h2>{node?.label ?? id}</h2>
      {node?.sub && <p>{node.sub}</p>}
    </>
  )
}

const GROUPS: [string, (id: string) => boolean][] = [
  ['Lab', id => id.startsWith('r:')],
  ['Grant office', id => id.startsWith('a:') || id === 'p:grant_manager' || id.startsWith('g:')],
  ['Outside', id => id.startsWith('s:') || id === 'v:vendors' || id === 'p:funder'],
]

function Directory({ w, onPick, onClose }: { w: World; onPick: () => void; onClose: () => void }) {
  return (
    <nav className="b-card b-dir" aria-label="Rooms">
      <header className="b-card-head">
        <h2>Rooms</h2>
        <span>Pull one out of the model</span>
        <button type="button" className="b-icon b-close" onClick={onClose} aria-label="Close rooms">
          <I d={CLOSE} />
        </button>
      </header>
      {GROUPS.map(([name, f]) => (
        <div key={name} className="b-dir-group">
          <h3>{name}</h3>
          <ul>
            {w.nodes
              .filter(n => f(n.id))
              .map(n => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      select(n.id)
                      onPick()
                    }}
                  >
                    <span>{n.label}</span>
                    {n.sub && <span className="b-dir-sub">{n.sub}</span>}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

// ── The HUD ──────────────────────────────────────────────────────────────

type Sheet = 'request' | 'directory' | 'ledger' | 'inbox' | null

export function Hud() {
  const w = useWorld()
  const selected = useSelected()
  const narrow = useNarrow()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [tracking, setTracking] = useState<string | null>(null)
  const [inboxOpen, setInboxOpen] = useState(true)
  const seenHolds = useRef(new Set<string>())
  const open = w.holds.filter(h => h.open)
  const detailRef = useRef<HTMLElement>(null)

  useFlow(e => {
    if (e.type === 'reset') {
      setTracking(null)
      setSheet(null)
      seenHolds.current.clear()
      select(null)
    }
    if (e.type === 'hold' && e.hold.open && !seenHolds.current.has(e.hold.id)) {
      seenHolds.current.add(e.hold.id)
      setInboxOpen(true)
    }
  })

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selected) select(null)
      else setSheet(null)
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [selected])

  useEffect(() => {
    if (selected) detailRef.current?.focus()
  }, [selected])

  const toggle = (s: Sheet) => setSheet(cur => (cur === s ? null : s))
  const showInbox = narrow ? sheet === 'inbox' : open.length > 0 && inboxOpen && !selected

  return (
    <div className="b-hud" data-sheet={sheet ?? ''} data-selected={selected ? '1' : '0'}>
      <header className="b-title">
        <div className="b-brand-row">
          <p className="b-brand">Grant Test Auto</p>
          {narrow && <Playback w={w} />}
        </div>
        <h1>An AI grant office that keeps a lab’s spending inside its grants’ rules.</h1>
        <p className="b-lede">
          Researchers send requests down the tubes. Three AI agents check each one against the spending rules and send back an answer: bought, rerouted, blocked or held. Only a human grant manager approves
          exceptions.
        </p>
        <div className="b-cta">
          <button
            type="button"
            className="b-btn b-primary"
            aria-expanded={sheet === 'request'}
            onClick={() => {
              setTracking(null)
              toggle('request')
            }}
          >
            Send a request
          </button>
          <a className="b-link-out" href={APP_URL}>
            Open the grant office <I d={OUT} size={14} />
          </a>
        </div>
      </header>

      {sheet === 'request' && (
        <RequestPanel
          w={w}
          onClose={() => setSheet(null)}
          onSent={id => {
            setTracking(id)
            setSheet(null)
          }}
        />
      )}
      {tracking && sheet !== 'request' && (
        <Tracker
          id={tracking}
          w={w}
          onClose={() => setTracking(null)}
          onAgain={() => {
            setTracking(null)
            setSheet('request')
          }}
        />
      )}

      <div className="b-top-right">
        {!narrow && (
          <div className="b-bar">
          <Playback w={w} />
          <span className="b-demo">Demo data</span>
          <button type="button" className="b-btn b-quiet b-desk" aria-expanded={sheet === 'directory'} onClick={() => toggle('directory')}>
            <I d={LIST} /> Rooms
          </button>
          </div>
        )}
        {!narrow && sheet === 'directory' && <Directory w={w} onPick={() => setSheet(null)} onClose={() => setSheet(null)} />}
        {!narrow && sheet !== 'directory' && !selected && <Ledger w={w} />}
      </div>

      <section className="b-narr" aria-live="polite" aria-label="What is happening">
        <div className="b-narr-meta">
          <time className="b-num">{day(w.today)}</time>
          <span>Demo data · Ortiz Lab</span>
        </div>
        <h2>{w.beat?.title ?? 'The Ortiz Lab'}</h2>
        <p>{w.beat?.caption ?? 'Five researchers, two grants, three AI agents.'}</p>
      </section>

      {narrow && (
        <nav className="b-toolbar" aria-label="Panels">
          <button type="button" aria-expanded={sheet === 'directory'} onClick={() => toggle('directory')}>
            Rooms
          </button>
          <button type="button" aria-expanded={sheet === 'ledger'} onClick={() => toggle('ledger')}>
            Ledger
          </button>
          <button type="button" aria-expanded={sheet === 'inbox'} onClick={() => toggle('inbox')} data-count={open.length || undefined}>
            Inbox{open.length ? <span className="b-count b-num">{open.length}</span> : null}
          </button>
        </nav>
      )}
      {narrow && sheet === 'directory' && <Directory w={w} onPick={() => setSheet(null)} onClose={() => setSheet(null)} />}
      {narrow && sheet === 'ledger' && (
        <div className="b-sheet-wrap">
          <Ledger w={w} count={10} />
          <button type="button" className="b-icon b-close b-sheet-close" onClick={() => setSheet(null)} aria-label="Close ledger">
            <I d={CLOSE} />
          </button>
        </div>
      )}
      {showInbox && <Inbox holds={open} onClose={narrow ? () => setSheet(null) : () => setInboxOpen(false)} />}
      {!narrow && open.length > 0 && !inboxOpen && !selected && (
        <button type="button" className="b-btn b-inbox-chip" onClick={() => setInboxOpen(true)}>
          {open.length} waiting on you
        </button>
      )}

      {selected && (
        <aside className="b-card b-detail" aria-label="Room detail" tabIndex={-1} ref={detailRef}>
          <button type="button" className="b-icon b-close" onClick={() => select(null)} aria-label="Slide the room back">
            <I d={CLOSE} />
          </button>
          <Detail id={selected} w={w} />
        </aside>
      )}
    </div>
  )
}
