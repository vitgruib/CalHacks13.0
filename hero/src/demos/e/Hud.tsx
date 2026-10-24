// Everything the viewer reads or presses. Plain DOM over the canvas, solid
// panels so the moving machine never sits behind body text.

import { useEffect, useRef, useState } from 'react'
import { feed, PRESETS, usd, useFlow, useWorld, type Hold, type Outcome, type Request, type Verdict, type World } from '../../feed'
import { uiStore, useUi } from './kit'
import { GATES, gateOf } from './layout'
import { Shape, actorName, niceAction, niceDay, outcomeWord, previewWord, stateWord } from './words'

const APP_URL: string = import.meta.env.VITE_APP_URL ?? 'http://localhost:5173'

// ── Icons (drawn, not glyphs) ────────────────────────────────────────────

const Icon = {
  play: <path d="M5 3.5v11l9-5.5z" fill="currentColor" />,
  pause: (
    <g fill="currentColor">
      <rect x="4" y="3.5" width="3.4" height="11" />
      <rect x="10.6" y="3.5" width="3.4" height="11" />
    </g>
  ),
  replay: <path d="M9 3.2a5.8 5.8 0 1 1-5.6 7.3h2.1A3.8 3.8 0 1 0 9 5.2v2.3L5.2 4.2 9 1z" fill="currentColor" />,
  close: <path d="M4.5 4.5l9 9m0-9-9 9" stroke="currentColor" strokeWidth="2" fill="none" />,
  arrow: <path d="M3 9h10.5M9.5 4.8 13.7 9l-4.2 4.2" stroke="currentColor" strokeWidth="1.8" fill="none" />,
}
const Svg = ({ i, size = 18 }: { i: keyof typeof Icon; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
    {Icon[i]}
  </svg>
)

function Mark() {
  return (
    <svg className="e-mark" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      <rect x="1" y="1" width="13" height="13" fill="#c2331b" />
      <circle cx="22.5" cy="7.5" r="6.5" fill="#1f47b4" />
      <path d="M1 29 14 16v13z" fill="#14171a" />
      <path d="M16 29h13L22.5 16z" fill="#f2bd0c" />
    </svg>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────

function Hero({ compact }: { compact: boolean }) {
  return (
    <header className={`e-hero e-panel${compact ? ' is-compact' : ''}`}>
      <div className="e-brand">
        <Mark />
        <span className="e-brand-name">GrantGuard</span>
        <span className="e-demo-tag">Demo data</span>
      </div>
      <h1 className="e-h1">An AI grant office that keeps a lab’s spending inside its grants’ rules.</h1>
      <p className="e-lede">
        Every request rolls through six spending rules and comes back bought, rerouted, blocked or held. Only a human grant manager approves exceptions.
      </p>
      <div className="e-ctas">
        <button
          type="button"
          className="e-btn e-btn--primary"
          aria-expanded={uiStore.get().requestOpen}
          onClick={() => uiStore.set({ requestOpen: !uiStore.get().requestOpen, sheet: 'request' })}
        >
          Send a request
        </button>
        <a className="e-link" href={APP_URL}>
          Open the grant office <Svg i="arrow" size={16} />
        </a>
      </div>
    </header>
  )
}

// ── Playback ──────────────────────────────────────────────────────────────

function Transport({ w }: { w: World }) {
  return (
    <div className="e-transport" role="group" aria-label="Story playback">
      <button type="button" className="e-icon-btn" onClick={() => (w.playing ? feed.pause() : feed.play())} aria-label={w.playing ? 'Pause the story' : 'Play the story'}>
        <Svg i={w.playing ? 'pause' : 'play'} />
      </button>
      <div className="e-seg" role="group" aria-label="Speed">
        {[1, 2, 4].map(s => (
          <button key={s} type="button" aria-pressed={w.speed === s} onClick={() => feed.setSpeed(s)}>
            {s}x
          </button>
        ))}
      </div>
      <button type="button" className="e-icon-btn" onClick={() => feed.restart()} aria-label="Replay the story from the start">
        <Svg i="replay" />
      </button>
      <span className="e-date e-num" title="Simulated date">
        {niceDay(w.today)}
      </span>
    </div>
  )
}

// ── Send a request ───────────────────────────────────────────────────────

function RequestPanel({ w }: { w: World }) {
  const [pick, setPick] = useState(0)
  const [who, setWho] = useState(PRESETS[0].researcherId)
  const [follow, setFollow] = useState(() => !(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches))
  const [sent, setSent] = useState<string | null>(null)
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [])
  const preset = PRESETS[pick]
  const input = { ...preset, researcherId: who }
  const hint = feed.preview(input)
  const drop = () => {
    const id = feed.submit(input)
    setSent(id)
    uiStore.set({ follow: follow ? id : undefined, sheet: undefined })
  }
  const req = sent ? w.requests.find(r => r.id === sent) : undefined
  return (
    <section className="e-panel e-req" data-panel="request" aria-labelledby="e-req-h">
      <div className="e-panel-head">
        <h2 id="e-req-h">Drop a ball</h2>
        <button type="button" className="e-icon-btn e-icon-btn--dark" aria-label="Close the request panel" onClick={() => uiStore.set({ requestOpen: false, sheet: undefined })}>
          <Svg i="close" />
        </button>
      </div>
      <div className="e-panel-body">
        <fieldset className="e-field">
          <legend>Who is asking</legend>
          <div className="e-chips">
            {w.researchers.map(r => (
              <label key={r.id} className={`e-chip${who === r.id ? ' is-on' : ''}`}>
                <input type="radio" name="e-who" value={r.id} checked={who === r.id} onChange={() => setWho(r.id)} />
                <span>{r.name.replace('Dr. ', '')}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="e-field">
          <legend>What they need</legend>
          <div className="e-presets">
            {PRESETS.map((p, i) => {
              const o = feed.preview({ ...p, researcherId: who })
              return (
                <button
                  key={p.label}
                  ref={i === 0 ? first : undefined}
                  type="button"
                  className={`e-preset${pick === i ? ' is-on' : ''}`}
                  aria-pressed={pick === i}
                  onClick={() => {
                    setPick(i)
                    setWho(p.researcherId)
                  }}
                >
                  <span className="e-preset-t">{p.label}</span>
                  <span className="e-preset-m e-num">
                    {usd(p.price)} · {p.grantId}
                  </span>
                  <span className="e-preset-h">
                    <Shape o={o} size={11} /> {previewWord[o]}
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>
        <div className="e-drop">
          <label className="e-check">
            <input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} />
            <span>Follow the ball with the camera</span>
          </label>
          <button type="button" className="e-btn e-btn--primary" onClick={drop}>
            Drop the ball
          </button>
        </div>
        <p className="e-hint" aria-live="polite">
          {req ? (
            <>
              <Shape o={req.outcome ?? 'hold'} size={11} /> <strong>{stateWord(req)}.</strong> {req.outcome ? req.explanation : 'Rolling through the gates.'}
            </>
          ) : (
            <>
              The rules say: <Shape o={hint} size={11} /> {previewWord[hint].toLowerCase()}, as things stand on {niceDay(w.today)}.
            </>
          )}
        </p>
      </div>
    </section>
  )
}

// ── The grant manager's desk ─────────────────────────────────────────────

function HoldCard({ h }: { h: Hold }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | undefined>()
  const decide = (choice: 'approve' | 'reject') => setErr(feed.decide(h.id, choice, reason))
  const fid = `e-reason-${h.id}`
  return (
    <article className="e-hold">
      <h3>{h.title}</h3>
      <p className="e-hold-why">{h.why}</p>
      {h.evidence.length > 0 && (
        <dl className="e-evidence">
          {h.evidence.slice(0, 4).map((e, i) => (
            <div key={`${i}-${e.label}`}>
              <dt>{e.label}</dt>
              <dd className="e-num">{e.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <label htmlFor={fid} className="e-label">
        Your reason (required)
      </label>
      <textarea id={fid} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why you approve or reject it" aria-invalid={!!err} aria-describedby={err ? `${fid}-err` : undefined} />
      {err && (
        <p id={`${fid}-err`} className="e-err" role="alert">
          {err}
        </p>
      )}
      <div className="e-hold-act">
        <button type="button" className="e-btn e-btn--ink" onClick={() => decide('approve')}>
          Approve
        </button>
        <button type="button" className="e-btn e-btn--ghost" onClick={() => decide('reject')}>
          Reject
        </button>
      </div>
    </article>
  )
}

function Desk({ w }: { w: World }) {
  const open = w.holds.filter(h => h.open)
  return (
    <section className={`e-panel e-desk${open.length ? ' has-holds' : ''}`} data-panel="desk" aria-labelledby="e-desk-h">
      <div className="e-panel-head">
        <h2 id="e-desk-h">Grant manager’s desk</h2>
        <span className="e-count e-num">{open.length ? `${open.length} waiting` : 'Nothing waiting'}</span>
      </div>
      <div className="e-panel-body">
        {open.length === 0 ? (
          <p className="e-muted">Nothing is waiting on you. Anything outside the rules lands here for your decision.</p>
        ) : (
          <>
            <p className="e-muted">You are the grant manager. If you leave it, the scripted manager decides in a few seconds.</p>
            {open.map(h => (
              <HoldCard key={h.id} h={h} />
            ))}
          </>
        )}
      </div>
    </section>
  )
}

// ── Ledger ────────────────────────────────────────────────────────────────

function Ledger({ w, rows = 3 }: { w: World; rows?: number }) {
  return (
    <section className="e-panel e-ledger" data-panel="ledger" aria-labelledby="e-ledger-h">
      <div className="e-panel-head">
        <h2 id="e-ledger-h">Ledger</h2>
        <span className="e-count">Every action, with its reason</span>
      </div>
      <ol className="e-panel-body e-rows" aria-live="off">
        {w.log.length === 0 && <li className="e-row e-muted">Nothing yet. Every action lands here with its reason.</li>}
        {w.log.slice(0, rows).map(r => (
          <li key={r.id} className="e-row">
            <div className="e-row-top">
              <span className="e-row-actor">{actorName[r.actor]}</span>
              <span className="e-row-act">{niceAction(r.action)}</span>
              <span className="e-row-day e-mono">{r.day.slice(5)}</span>
            </div>
            <p className="e-row-why e-num">{r.reason}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ── Detail ────────────────────────────────────────────────────────────────

function RequestRow({ r }: { r: Request }) {
  return (
    <li className="e-rq">
      <div className="e-rq-top">
        {r.outcome ? <Shape o={r.outcome} size={12} /> : <span className="e-dot" />}
        <span className="e-rq-item">{r.item}</span>
        <span className="e-num">{usd(r.price)}</span>
      </div>
      <p className="e-rq-state">
        <strong>{stateWord(r)}.</strong> {r.explanation}
      </p>
    </li>
  )
}

function Detail({ id, w }: { id: string; w: World }) {
  const node = w.nodes.find(n => n.id === id)
  const close = () => uiStore.set({ selected: undefined, sheet: undefined })
  let body: React.ReactNode = null
  if (id.startsWith('r:')) {
    const r = w.researchers.find(x => `r:${x.id}` === id)
    const reqs = w.requests.filter(x => `r:${x.researcherId}` === id).slice(0, 5)
    body = r && (
      <>
        <p className="e-sub">
          {r.role} · {r.station}
        </p>
        <p className="e-now">
          <span>Now</span> {r.task}
        </p>
        <p className="e-muted e-mono-ids">Paid from {r.grantIds.join(' and ')}</p>
        <h3 className="e-h3">Requests</h3>
        {reqs.length ? <ul className="e-rqs">{reqs.map(q => <RequestRow key={q.id} r={q} />)}</ul> : <p className="e-muted">No requests yet in this story.</p>}
      </>
    )
  } else if (id.startsWith('a:')) {
    const role = id.slice(2)
    const a = w.agents.find(x => x.role === role)
    const rows = w.log.filter(l => l.actor === role).slice(0, 5)
    body = a && (
      <>
        <p className="e-sub">Seat: {a.seat}</p>
        <p>{a.job}</p>
        <h3 className="e-h3">Recent actions</h3>
        <ol className="e-rows">
          {rows.length ? (
            rows.map(r => (
              <li key={r.id} className="e-row">
                <div className="e-row-top">
                  <span className="e-row-act">{niceAction(r.action)}</span>
                  <span className="e-row-day e-mono">{r.day.slice(5)}</span>
                </div>
                <p className="e-row-why e-num">{r.reason}</p>
              </li>
            ))
          ) : (
            <li className="e-muted">Nothing yet.</li>
          )}
        </ol>
      </>
    )
  } else if (id.startsWith('g:')) {
    const g = w.grants.find(x => `g:${x.id}` === id)
    const evs = w.statusEvents.filter(e => g && e.grantId === g.id).slice(0, 4)
    body = g && (
      <>
        <p className="e-sub">
          {g.title} · {g.agency}
        </p>
        <p className={`e-status${g.frozen ? ' is-frozen' : ''}`}>
          {g.frozen ? 'Spending frozen' : 'Open for spending'} · {g.status === 'restored_by_court' ? 'restored by court' : g.status}
        </p>
        {g.frozenReason && <p className="e-muted">{g.frozenReason}</p>}
        <dl className="e-money e-num">
          <div>
            <dt>Awarded</dt>
            <dd>{usd(g.awarded)}</dd>
          </div>
          <div>
            <dt>Received</dt>
            <dd>{usd(g.received)}</dd>
          </div>
          <div>
            <dt>Spent</dt>
            <dd>{usd(g.spent)}</dd>
          </div>
          <div>
            <dt>Promised</dt>
            <dd>{usd(g.promised)}</dd>
          </div>
          <div className="is-key">
            <dt>Truly available</dt>
            <dd>{usd(g.available)}</dd>
          </div>
        </dl>
        <p className="e-muted">
          Ends {g.end}. The hopper’s fill is truly available money: awarded, less spent and promised.
        </p>
        <h3 className="e-h3">Status events</h3>
        {evs.length ? (
          <ol className="e-rows">
            {evs.map(e => (
              <li key={e.id} className="e-row">
                <div className="e-row-top">
                  <span className="e-row-actor">{e.source}</span>
                  <span className="e-row-day e-mono">{e.day.slice(5)}</span>
                </div>
                <p className="e-row-why">{e.summary}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="e-muted">No status changes yet.</p>
        )}
      </>
    )
  } else if (id === 'p:grant_manager') {
    const open = w.holds.filter(h => h.open)
    const closed = w.holds.filter(h => !h.open).slice(0, 3)
    body = (
      <>
        <p className="e-sub">The only one who approves, rejects or overrides, always with a reason. In this demo, that is you.</p>
        {open.length ? open.map(h => <HoldCard key={h.id} h={h} />) : <p className="e-muted">No open holds right now.</p>}
        {closed.length > 0 && (
          <>
            <h3 className="e-h3">Decided</h3>
            <ol className="e-rows">
              {closed.map(h => (
                <li key={h.id} className="e-row">
                  <div className="e-row-top">
                    <span className="e-row-actor">{h.decision?.choice === 'approve' ? 'Approved' : 'Rejected'}</span>
                    <span className="e-row-act">{h.title}</span>
                  </div>
                  <p className="e-row-why">{h.decision?.reason}</p>
                </li>
              ))}
            </ol>
          </>
        )}
      </>
    )
  } else {
    const src = id.startsWith('s:') ? node?.label : undefined
    const evs = src ? w.statusEvents.filter(e => e.source.startsWith(src.split(' ')[0])).slice(0, 4) : []
    body = (
      <>
        {node?.sub && <p className="e-sub">{node.sub}</p>}
        {id.startsWith('s:') && <p>The bookkeeping agent reads this source and posts what changed to the fund tracker.</p>}
        {evs.map(e => (
          <p key={e.id} className="e-muted">
            {e.day}: {e.summary}
          </p>
        ))}
      </>
    )
  }
  return (
    <section className="e-panel e-detail" data-panel="detail" aria-labelledby="e-detail-h">
      <div className="e-panel-head">
        <h2 id="e-detail-h">{node?.label ?? id}</h2>
        <button type="button" className="e-icon-btn e-icon-btn--dark" aria-label="Close details" onClick={close}>
          <Svg i="close" />
        </button>
      </div>
      <div className="e-panel-body">{body}</div>
    </section>
  )
}

// ── Parts index (keyboard path to every detail) ──────────────────────────

const GROUPS: [string, (id: string) => boolean][] = [
  ['Lab', id => id.startsWith('r:')],
  ['Grant office', id => id.startsWith('a:') || id === 'p:grant_manager'],
  ['Grants', id => id.startsWith('g:')],
  ['Outside', id => id.startsWith('s:') || id === 'p:funder' || id === 'v:vendors'],
]

function Parts({ w, selected }: { w: World; selected?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="e-panel e-parts" data-panel="parts" aria-labelledby="e-parts-h">
      <div className="e-panel-head">
        <h2 id="e-parts-h">Parts</h2>
        <button type="button" className="e-mini" aria-expanded={open} aria-controls="e-parts-list" onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Show all'}
        </button>
      </div>
      <div id="e-parts-list" className="e-panel-body" hidden={!open}>
        {GROUPS.map(([name, test]) => (
          <div key={name} className="e-parts-group">
            <h3 className="e-h3">{name}</h3>
            <div className="e-parts-btns">
              {w.nodes
                .filter(n => test(n.id))
                .map(n => (
                  <button
                    key={n.id}
                    type="button"
                    className={`e-part${selected === n.id ? ' is-on' : ''}`}
                    onClick={() => uiStore.set({ selected: n.id, sheet: 'detail' })}
                    onFocus={() => uiStore.set({ hover: n.id })}
                    onBlur={() => uiStore.get().hover === n.id && uiStore.set({ hover: undefined })}
                  >
                    {n.label}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Story: the gates and the narration ───────────────────────────────────

function useGateReadout(w: World) {
  const [run, setRun] = useState<{ id: string; v: (Verdict | undefined)[] } | null>(null)
  useFlow(e => {
    if (e.type === 'reset') setRun(null)
    if (e.type === 'rule') {
      setRun(prev => {
        const base = prev && prev.id === e.requestId && e.index > 0 ? prev.v.slice() : GATES.map(() => undefined)
        const g = gateOf(e.verdict.rule)
        const had = base[g]
        base[g] = had && !had.pass ? had : e.verdict
        return { id: e.requestId, v: base }
      })
    }
  })
  // Mounted mid-story (or before any rule event), show the latest checked
  // request straight from the world.
  if (!run) {
    const last = w.requests.find(r => r.verdicts.length > 0)
    if (!last) return { run: null, req: undefined }
    const v: (Verdict | undefined)[] = GATES.map(() => undefined)
    for (const vd of last.verdicts) {
      const g = gateOf(vd.rule)
      if (!v[g] || v[g]?.pass) v[g] = vd
    }
    return { run: { id: last.id, v }, req: last }
  }
  const req = w.requests.find(r => r.id === run.id)
  return { run, req }
}

function Story({ w }: { w: World }) {
  const { run, req } = useGateReadout(w)
  const who = req ? w.researchers.find(r => r.id === req.researcherId) : undefined
  const failed = run?.v.find(x => x && !x.pass)
  const decided = req?.outcome
  return (
    <section className="e-story e-panel" aria-label="What is happening">
      <Transport w={w} />
      {run && req && (
        <div className={`e-gates${decided ? ' is-done' : ''}`}>
          <p className="e-gates-t">
            <span className="e-gates-item">{req.item.split(',')[0]}</span>
            <span className="e-muted">
              {who?.name} · <span className="e-num">{usd(req.price)}</span> · <span className="e-mono">{req.grantId}</span>
            </span>
          </p>
          <ol className="e-gate-chips">
            {GATES.map((g, i) => {
              const vd = run.v[i]
              const st = vd ? (vd.pass ? 'pass' : 'fail') : decided ? 'na' : 'wait'
              return (
                <li key={g.short} className={`e-gc is-${st}`} title={vd ? `${vd.rule}: ${vd.detail}` : g.name} tabIndex={0} aria-label={`${i + 1}. ${g.name}: ${st === 'pass' ? 'passed' : st === 'fail' ? 'failed' : st === 'na' ? 'does not apply' : 'not checked yet'}`}>
                  <span className="e-gc-n">{i + 1}</span>
                  <span className="e-gc-t">{g.short}</span>
                </li>
              )
            })}
          </ol>
          <p className="e-gates-why">
            {decided ? (
              <>
                <Shape o={decided} size={11} /> <strong>{stateWord(req)}.</strong> {req.explanation}
              </>
            ) : failed ? (
              <>
                <strong>{failed.rule} failed.</strong> {failed.detail} {failed.auditCase ? `(${failed.auditCase}.)` : ''}
              </>
            ) : (
              'Checking each spending rule in turn.'
            )}
          </p>
        </div>
      )}
      <div className="e-beat" aria-live="polite">
        <p className="e-beat-t">{w.beat?.title ?? 'The Ortiz Lab'}</p>
        <p className="e-beat-c">{w.beat?.caption ?? 'Five researchers, two NIH grants, three AI agents.'}</p>
      </div>
      <ul className="e-legend" aria-label="What comes back to the researcher">
        {(['accept', 'refine', 'reject', 'hold'] as Outcome[]).map(o => (
          <li key={o}>
            <Shape o={o} size={12} /> {outcomeWord[o]}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Mobile tab bar ───────────────────────────────────────────────────────

function Tabs({ w, sheet }: { w: World; sheet?: string }) {
  const open = w.holds.filter(h => h.open).length
  const tab = (k: 'desk' | 'ledger' | 'parts', label: string) => (
    <button type="button" aria-pressed={sheet === k} onClick={() => uiStore.set({ sheet: sheet === k ? undefined : k })}>
      {label}
    </button>
  )
  return (
    <nav className="e-tabs" aria-label="Panels">
      {tab('desk', open ? `Desk · ${open}` : 'Desk')}
      {tab('ledger', 'Ledger')}
      {tab('parts', 'Parts')}
    </nav>
  )
}

export function Hud() {
  const w = useWorld()
  const u = useUi()
  const following = !!u.follow
  return (
    <>
      <div className="e-left" data-sheet={u.sheet ?? ''}>
        <Hero compact={u.requestOpen} />
        {u.requestOpen && <RequestPanel w={w} />}
      </div>
      <aside className="e-side" aria-label="Grant office panels" data-sheet={u.sheet ?? ''}>
        {u.selected && <Detail id={u.selected} w={w} />}
        <Desk w={w} />
        <Ledger w={w} />
        <Parts w={w} selected={u.selected} />
      </aside>
      <Story w={w} />
      <Tabs w={w} sheet={u.sheet} />
      {following && (
        <button type="button" className="e-pullback e-btn e-btn--ink" onClick={() => uiStore.set({ follow: undefined })}>
          Pull back
        </button>
      )}
    </>
  )
}
