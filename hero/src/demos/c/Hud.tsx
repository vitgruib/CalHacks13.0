// The DOM over the terrain: the thesis, playback, narration, the ledger,
// the places index, and the side sheet (send a request, place details, the
// grant manager's open decisions).

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { feed, PRESETS, usd, useWorld, type Hold, type RequestInput, type World } from '../../feed'
import { Glyph } from './icons'
import { ui, useUI } from './store'
import { statusWord } from './Terrain'
import { ACTOR, answerWord, longDay, OUTCOME_SHORT, shortDay } from './words'

const APP_URL: string = import.meta.env.VITE_APP_URL ?? 'http://localhost:5173'

export function Hud() {
  const w = useWorld()
  const panel = useUI(s => s.panel)
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef(0)
  const say = (t: string) => {
    setToast(t)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 6500)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ui.get().panel) ui.set({ panel: null, selected: null })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const open = w.holds.filter(h => h.open)

  return (
    <div className={`c-hud${panel ? ' has-sheet' : ''}`}>
      <div className="c-scrim" aria-hidden />
      <header className="c-hero">
        <p className="c-brand">
          <svg className="c-brand__mark" viewBox="0 0 32 32" aria-hidden width="28" height="28">
            <path d="M4 25 C8 14 12 9 16 9 C20 9 24 14 28 25" />
            <path d="M9 25 C11 18 13.5 15 16 15 C18.5 15 21 18 23 25" />
            <path d="M2 25 H30" />
          </svg>
          GrantGuard
        </p>
        <h1>An AI grant office that keeps a lab’s spending inside its grants’ rules.</h1>
        <p className="c-lede">
          Researchers send requests. Three AI agents check each one against the spending rules and answer: bought, rerouted, blocked or held, with a human grant manager deciding what the rules can’t.
        </p>
        <div className="c-actions">
          <button type="button" className="c-btn c-btn--primary" onClick={() => ui.set({ panel: 'request', selected: null })}>
            <Glyph name="send" />
            Send a request
          </button>
          <a className="c-btn c-btn--quiet" href={APP_URL}>
            Open the grant office
            <Glyph name="out" />
          </a>
        </div>
        <ul className="c-key" aria-label="How an answer comes back down">
          {(['accept', 'refine', 'reject', 'hold'] as const).map(o => (
            <li key={o} className={`is-${o}`}>
              <Glyph name={o} size={22} />
              <span>
                <strong>{OUTCOME_SHORT[o]}</strong>
                <em>{KEY_NOTE[o]}</em>
              </span>
            </li>
          ))}
        </ul>
      </header>

      <div className="c-top">
        <p className="c-date">
          <span className="c-date__day c-num">{longDay(w.today)}</span>
          <span className="c-date__demo">Demo data · Ortiz Lab</span>
        </p>
        <div className="c-play" role="group" aria-label="Story playback">
          <button type="button" className="c-icon" aria-label={w.playing ? 'Pause the story' : 'Play the story'} onClick={() => (w.playing ? feed.pause() : feed.play())}>
            <Glyph name={w.playing ? 'pause' : 'play'} />
          </button>
          {[1, 2, 4].map(s => (
            <button key={s} type="button" className="c-speed c-num" aria-pressed={w.speed === s} aria-label={`${s} times speed`} onClick={() => feed.setSpeed(s)}>
              {s}x
            </button>
          ))}
          <button type="button" className="c-icon" aria-label="Replay the story from the start" onClick={() => feed.restart()}>
            <Glyph name="replay" />
          </button>
        </div>
        <Places w={w} />
        {open.length > 0 && (
          <button type="button" className="c-inbox" onClick={() => ui.select('p:grant_manager')}>
            <Glyph name="hold" size={18} />
            <span>
              <strong>
                {open.length} decision{open.length > 1 ? 's' : ''} waiting
              </strong>{' '}
              for the grant manager. That’s you.
            </span>
          </button>
        )}
      </div>

      {w.beat && (
        <section className="c-story" aria-live="polite" aria-label="What the story is showing">
          <h2>{w.beat.title}</h2>
          <p>{w.beat.caption}</p>
        </section>
      )}

      <section className="c-ledger" aria-label="Ledger, newest first">
        <h2>
          <Glyph name="ledger" />
          Ledger
        </h2>
        <ol>
          {w.log.slice(0, 3).map(r => (
            <li key={r.id}>
              <span className="c-ledger__day c-num">{shortDay(r.day)}</span>
              <span className="c-ledger__actor">{ACTOR[r.actor]}</span>
              <span className="c-ledger__action">{r.action}</span>
              <span className="c-ledger__reason c-num">{r.reason}</span>
            </li>
          ))}
        </ol>
      </section>

      {toast && (
        <p className="c-toast" role="status">
          {toast}
        </p>
      )}

      {panel && <Sheet w={w} onSent={say} />}
    </div>
  )
}

const KEY_NOTE = {
  accept: 'a lit line home',
  refine: 'a dashed detour',
  reject: 'falls back down',
  hold: 'a lantern waits',
}

// ── Places index: every selectable place, reachable by keyboard ───────────

const GROUPS: { title: string; glyph: string; ids: string[] }[] = [
  { title: 'The lab', glyph: 'house', ids: ['r:ortiz', 'r:okafor', 'r:raman', 'r:silva', 'r:park'] },
  { title: 'The grant office', glyph: 'observatory', ids: ['a:purchasing', 'a:bookkeeping', 'a:payment_report', 'p:grant_manager'] },
  { title: 'The grants', glyph: 'mesa', ids: ['g:R01GM000001', 'g:R21AI000002'] },
  { title: 'Outside', glyph: 'station', ids: ['s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments', 'p:funder', 'v:vendors'] },
]

function Places({ w }: { w: World }) {
  const [open, setOpen] = useState(false)
  const label = (id: string) => w.nodes.find(n => n.id === id)?.label ?? id
  return (
    <nav className="c-places" aria-label="Places on the map">
      <button type="button" className="c-btn c-btn--small" aria-expanded={open} aria-controls="c-places-list" onClick={() => setOpen(o => !o)}>
        <Glyph name="mesa" />
        Places
      </button>
      {open && (
        <div id="c-places-list" className="c-places__list">
          {GROUPS.map(g => (
            <div key={g.title}>
              <h3>{g.title}</h3>
              <ul>
                {g.ids.map(id => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => ui.select(id)}
                      onFocus={() => ui.set({ hovered: id })}
                      onBlur={() => ui.get().hovered === id && ui.set({ hovered: null })}
                      onPointerEnter={() => ui.set({ hovered: id })}
                      onPointerLeave={() => ui.get().hovered === id && ui.set({ hovered: null })}
                    >
                      <Glyph name={id.startsWith('v:') ? 'depot' : id === 'p:grant_manager' ? 'lodge' : g.glyph} />
                      <span className={id.startsWith('g:') ? 'c-id' : undefined}>{label(id)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </nav>
  )
}

// ── The sheet ─────────────────────────────────────────────────────────────

function Sheet({ w, onSent }: { w: World; onSent: (t: string) => void }) {
  const panel = useUI(s => s.panel)
  const selected = useUI(s => s.selected)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => closeRef.current?.focus(), [panel, selected])
  const node = selected ? w.nodes.find(n => n.id === selected) : undefined
  const title = panel === 'request' ? 'Send a request' : (node?.label ?? 'Details')
  const close = () => ui.set({ panel: null, selected: null })
  const flown = selected?.startsWith('g:')
  return (
    <aside className="c-sheet" aria-label={title}>
      <header className="c-sheet__head">
        <h2 className={selected?.startsWith('g:') ? 'c-id' : undefined}>{title}</h2>
        <button type="button" ref={closeRef} className="c-icon" aria-label="Close" onClick={close}>
          <Glyph name="close" />
        </button>
      </header>
      <div className="c-sheet__body">
        {panel === 'request' && <RequestForm onSent={onSent} />}
        {panel === 'detail' && selected && <Detail id={selected} w={w} />}
      </div>
      {flown && (
        <footer className="c-sheet__foot">
          <button
            type="button"
            className="c-btn c-btn--small"
            onClick={() => {
              ui.overview()
              close()
            }}
          >
            <Glyph name="back" />
            Back to the overview
          </button>
        </footer>
      )}
    </aside>
  )
}

function RequestForm({ onSent }: { onSent: (t: string) => void }) {
  const w = useWorld()
  const [pick, setPick] = useState(0)
  const [who, setWho] = useState(PRESETS[0].researcherId)
  const p = PRESETS[pick]
  const input = (i: number, researcherId: string): RequestInput => {
    const x = PRESETS[i]
    return { researcherId, item: x.item, category: x.category, price: x.price, grantId: x.grantId, purpose: x.purpose, split: x.split, sharedWith: x.sharedWith }
  }
  const send = (e: FormEvent) => {
    e.preventDefault()
    const id = feed.submit(input(pick, who))
    const name = w.researchers.find(r => r.id === who)?.name ?? 'The researcher'
    ui.set({ mine: [...ui.get().mine, id], panel: null, selected: null })
    onSent(`${name} sent “${p.item}”. Watch it climb the switchback to the purchasing agent.`)
  }
  return (
    <form className="c-form" onSubmit={send}>
      <fieldset>
        <legend>What they need</legend>
        <div className="c-presets">
          {PRESETS.map((x, i) => {
            const guess = feed.preview(input(i, who))
            return (
              <label key={x.label} className={`c-preset${pick === i ? ' is-picked' : ''}`}>
                <input
                  type="radio"
                  name="c-preset"
                  checked={pick === i}
                  onChange={() => {
                    setPick(i)
                    setWho(x.researcherId)
                  }}
                />
                <span className="c-preset__row">
                  <span className="c-preset__name">{x.label}</span>
                  <span className="c-num">{usd(x.price)}</span>
                </span>
                <span className="c-preset__meta">
                  {x.category} · <span className="c-id">{x.grantId}</span>
                  {x.sharedWith?.length ? ' · serves both grants' : ''}
                </span>
                <span className={`c-preset__hint is-${guess}`}>
                  <Glyph name={guess} />
                  The rules would say: {OUTCOME_SHORT[guess].toLowerCase()}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend>Who is asking</legend>
        <div className="c-who">
          {w.researchers.map(r => (
            <label key={r.id} className={`c-chip${who === r.id ? ' is-picked' : ''}`}>
              <input type="radio" name="c-who" checked={who === r.id} onChange={() => setWho(r.id)} />
              <span>{r.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="c-btn c-btn--primary c-btn--wide">
        <Glyph name="send" />
        Send the request
      </button>
      <p className="c-fine">It runs through the same spending rules the database enforces. The answer comes back to the researcher who asked.</p>
    </form>
  )
}

function Detail({ id, w }: { id: string; w: World }) {
  if (id.startsWith('r:')) {
    const r = w.researchers.find(x => x.id === id.slice(2))
    if (!r) return null
    const reqs = w.requests.filter(q => q.researcherId === r.id).slice(0, 8)
    return (
      <>
        <p className="c-meta">
          {r.role} · {r.station}
        </p>
        <h3>Working on</h3>
        <p className="c-now">{r.task}</p>
        <h3>Their requests</h3>
        {reqs.length === 0 ? (
          <p className="c-meta">None yet in this story.</p>
        ) : (
          <ol className="c-reqs">
            {reqs.map(q => (
              <li key={q.id}>
                <p className="c-reqs__top">
                  <span>{q.item}</span>
                  <span className="c-num">{usd(q.price)}</span>
                </p>
                <p className={`c-answer is-${q.outcome ?? 'idle'}`}>
                  <Glyph name={q.outcome ?? 'idle'} />
                  {answerWord(q)}
                </p>
                <p className="c-explain">{q.explanation}</p>
              </li>
            ))}
          </ol>
        )}
      </>
    )
  }
  if (id.startsWith('a:')) {
    const role = id.slice(2)
    const a = w.agents.find(x => x.role === role)
    if (!a) return null
    const rows = w.log.filter(r => r.actor === role).slice(0, 8)
    return (
      <>
        <p className="c-meta">Logged in as its own identity. Seat: {a.seat}</p>
        <p className="c-now">{a.job}</p>
        <h3>Recent log</h3>
        <LogList rows={rows} />
      </>
    )
  }
  if (id.startsWith('g:')) {
    const g = w.grants.find(x => x.id === id.slice(2))
    if (!g) return null
    const events = w.statusEvents.filter(e => e.grantId === g.id).slice().reverse()
    const left = Math.round((Date.parse(g.end) - Date.parse(w.today)) / 86_400_000)
    return (
      <>
        <p className="c-meta">
          {g.title} · {g.agency}
        </p>
        <p className={`c-status${g.frozen ? ' is-frozen' : ''}`}>{statusWord(g)}</p>
        {g.frozenReason && <p className="c-explain">{g.frozenReason}</p>}
        <dl className="c-money">
          <div>
            <dt>Awarded</dt>
            <dd className="c-num">{usd(g.awarded)}</dd>
          </div>
          <div>
            <dt>Received so far</dt>
            <dd className="c-num">{usd(g.received)}</dd>
          </div>
          <div>
            <dt>Spent</dt>
            <dd className="c-num">{usd(g.spent)}</dd>
          </div>
          <div>
            <dt>Promised to open orders</dt>
            <dd className="c-num">{usd(g.promised)}</dd>
          </div>
          <div className="is-total">
            <dt>Truly available</dt>
            <dd className="c-num">{usd(g.available)}</dd>
          </div>
        </dl>
        <p className="c-meta">
          Runs {longDay(g.start)} to {longDay(g.end)}, {left} days left.
        </p>
        <h3>Status timeline</h3>
        {events.length === 0 ? (
          <p className="c-meta">No status changes yet. The bookkeeping agent reads the sources every day.</p>
        ) : (
          <ol className="c-timeline">
            {events.map(e => (
              <li key={e.id} className={`is-${e.kind}`}>
                <span className="c-timeline__day c-num">{shortDay(e.day)}</span>
                <span className="c-timeline__what">
                  <strong>{EVENT_WORD[e.kind] ?? e.kind}</strong> · {e.source}
                </span>
                <span className="c-timeline__note c-num">{e.summary}</span>
              </li>
            ))}
          </ol>
        )}
      </>
    )
  }
  if (id === 'p:grant_manager') {
    const open = w.holds.filter(h => h.open)
    const closed = w.holds.filter(h => !h.open).slice(0, 4)
    return (
      <>
        <p className="c-now">The only one who approves, rejects or overrides, always with a reason. In this demo, that’s you.</p>
        <h3>Open decisions</h3>
        {open.length === 0 ? <p className="c-meta">Nothing is waiting. Holds land here when an agent needs a human.</p> : open.map(h => <HoldCard key={h.id} h={h} />)}
        {closed.length > 0 && (
          <>
            <h3>Decided</h3>
            <ol className="c-decided">
              {closed.map(h => (
                <li key={h.id}>
                  <p className="c-reqs__top">
                    <span>{h.title}</span>
                  </p>
                  <p className={`c-answer is-${h.decision?.choice === 'approve' ? 'accept' : 'reject'}`}>
                    <Glyph name={h.decision?.choice === 'approve' ? 'accept' : 'reject'} />
                    {h.decision?.choice === 'approve' ? 'Approved' : 'Rejected'} by {h.decision?.by === 'viewer' ? 'you' : 'the grant manager'}
                  </p>
                  <p className="c-explain">{h.decision?.reason}</p>
                </li>
              ))}
            </ol>
          </>
        )}
      </>
    )
  }
  const node = w.nodes.find(n => n.id === id)
  const rows = w.log.filter(r => node && r.reason.includes(node.label)).slice(0, 6)
  return (
    <>
      <p className="c-now">{node?.sub ?? OUTSIDE[id] ?? ''}</p>
      <p className="c-meta">{OUTSIDE[id]}</p>
      {rows.length > 0 && (
        <>
          <h3>Recent log</h3>
          <LogList rows={rows} />
        </>
      )}
    </>
  )
}

const OUTSIDE: Record<string, string> = {
  's:reporter': 'NIH’s public project database. The bookkeeping agent reads it every day and again right before money moves.',
  's:usaspending': 'Federal award and payment records, read alongside RePORTER.',
  's:cancellations': 'A scraped list of terminated grants (Apify). A grant on it is frozen at once.',
  's:court': 'Court notices. A restoration goes on the record, but spending stays frozen until a payment arrives.',
  's:payments': 'The payment system. Only a payment that actually lands lifts a freeze.',
  'p:funder': 'Receives payment requests and asks follow-up questions; the payment & report agent answers with exact purchases.',
  'v:vendors': 'Orders go out here; invoices come back to the bookkeeping agent, which checks each one.',
}

const EVENT_WORD: Record<string, string> = {
  canceled: 'Canceled',
  court_order: 'Court order',
  payment_received: 'Payment received',
  reading_changed: 'Reading changed',
  unfrozen: 'Unfrozen',
}

function LogList({ rows }: { rows: World['log'] }) {
  if (!rows.length) return <p className="c-meta">Nothing logged yet.</p>
  return (
    <ol className="c-log">
      {rows.map(r => (
        <li key={r.id}>
          <span className="c-num">{shortDay(r.day)}</span>
          <strong>{r.action}</strong>
          <span className="c-num">{r.reason}</span>
        </li>
      ))}
    </ol>
  )
}

function HoldCard({ h }: { h: Hold }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string>()
  const fid = `c-reason-${h.id}`
  const act = (choice: 'approve' | 'reject') => {
    const e = feed.decide(h.id, choice, reason)
    setErr(e)
    if (!e) setReason('')
  }
  return (
    <article className="c-hold">
      <p className="c-hold__title">{h.title}</p>
      <p className="c-explain">{h.why}</p>
      {h.evidence.length > 0 && (
        <dl className="c-evidence">
          {h.evidence.map((x, i) => (
            <div key={i}>
              <dt>{x.label}</dt>
              <dd className="c-num">{x.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <label htmlFor={fid}>Your reason (it goes in the log)</label>
      <textarea id={fid} rows={2} value={reason} onChange={e => setReason(e.target.value)} aria-invalid={!!err} aria-describedby={err ? `${fid}-err` : undefined} />
      {err && (
        <p id={`${fid}-err`} className="c-error" role="alert">
          {err}
        </p>
      )}
      <div className="c-hold__actions">
        <button type="button" className="c-btn c-btn--approve" onClick={() => act('approve')}>
          <Glyph name="pass" />
          Approve
        </button>
        <button type="button" className="c-btn c-btn--reject" onClick={() => act('reject')}>
          <Glyph name="fail" />
          Reject
        </button>
      </div>
    </article>
  )
}
