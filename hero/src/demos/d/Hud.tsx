import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PRESETS, feed, usd, useWorld, type FlowNode, type Hold, type LogRow, type Outcome, type Preset, type RequestInput, type World } from '../../feed'
import { outcomeWord } from './stamps'
import { mine, ui, useUi } from './store'

const APP_URL: string = import.meta.env.VITE_APP_URL ?? 'https://calhacks130.vercel.app'

const ACTOR: Record<LogRow['actor'], string> = {
  purchasing: 'Purchasing',
  bookkeeping: 'Bookkeeping',
  payment_report: 'Payment & report',
  grant_manager: 'Grant manager',
  scientist: 'Researcher',
  system: 'System',
}

const toInput = (p: Preset): RequestInput => ({ researcherId: p.researcherId, item: p.item, category: p.category, price: p.price, grantId: p.grantId, purpose: p.purpose, split: p.split, sharedWith: p.sharedWith })

function hint(o: Outcome, input: RequestInput) {
  if (o === 'accept') return 'Bought'
  if (o === 'reject') return 'Blocked'
  if (o === 'hold') return input.price > 5000 ? 'Held for the grant manager' : 'Held until money lands'
  return (input.sharedWith?.length ?? 0) >= 2 && !input.split?.length ? 'Sent back to split' : 'Rerouted'
}

// ── Small drawn icons (SVG, no glyphs) ─────────────────────────────────────

const Icon = {
  play: <path d="M5 3.5v9l8-4.5z" fill="currentColor" />,
  pause: <path d="M4.5 3.5h2.6v9H4.5zM8.9 3.5h2.6v9H8.9z" fill="currentColor" />,
  replay: <path d="M3.5 8a4.5 4.5 0 1 0 1.4-3.3M3.5 2.8v2.4h2.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  close: <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />,
  list: <path d="M3 4.5h10M3 8h10M3 11.5h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
}
const Svg = ({ children }: { children: ReactNode }) => (
  <svg className="dd-ico" viewBox="0 0 16 16" aria-hidden="true">
    {children}
  </svg>
)

function Mark() {
  return (
    <svg className="dd-logo" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="2" y="2" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="6" y="6" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M9 14.5l3.3 3.3L19.5 10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Playback({ w }: { w: World }) {
  return (
    <div className="dd-play" role="group" aria-label="Story playback">
      <button className="dd-btn dd-btn-icon" onClick={() => (w.playing ? feed.pause() : feed.play())} aria-label={w.playing ? 'Pause the story' : 'Play the story'}>
        <Svg>{w.playing ? Icon.pause : Icon.play}</Svg>
      </button>
      {[1, 2, 4].map(s => (
        <button key={s} className="dd-btn dd-btn-speed" aria-pressed={w.speed === s} onClick={() => feed.setSpeed(s)} aria-label={`Speed ${s}x`}>
          {s}x
        </button>
      ))}
      <button className="dd-btn" onClick={() => feed.restart()}>
        <Svg>{Icon.replay}</Svg>
        Replay
      </button>
    </div>
  )
}

const GROUPS: { title: string; test: (n: FlowNode) => boolean }[] = [
  { title: 'Ortiz Lab', test: n => n.kind === 'researcher' },
  { title: 'Grant office', test: n => n.side === 'finance' },
  { title: 'Outside', test: n => n.side === 'outside' },
]

function PartsList({ w, onPick }: { w: World; onPick?: () => void }) {
  let i = 0
  return (
    <nav className="dd-parts" aria-label="Parts list: open any part of the drawing">
      {GROUPS.map(g => (
        <div key={g.title} className="dd-parts-group">
          <h3>{g.title}</h3>
          <ul>
            {w.nodes.filter(g.test).map(n => {
              i++
              return (
                <li key={n.id}>
                  <button
                    className="dd-part"
                    onClick={() => {
                      ui.set({ selected: n.id })
                      onPick?.()
                    }}
                    onFocus={() => ui.set({ hovered: n.id })}
                    onBlur={() => ui.get().hovered === n.id && ui.set({ hovered: null })}
                    onMouseEnter={() => ui.set({ hovered: n.id })}
                    onMouseLeave={() => ui.get().hovered === n.id && ui.set({ hovered: null })}
                  >
                    <span className="dd-part-no">{String(i).padStart(2, '0')}</span>
                    <span className="dd-part-name">{n.kind === 'grant' ? <span className="dd-id">{n.label}</span> : n.label}</span>
                    {n.sub && <span className="dd-part-sub">{n.sub}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function HoldCard({ h, compact }: { h: Hold; compact?: boolean }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string>()
  const decide = (c: 'approve' | 'reject') => setErr(feed.decide(h.id, c, reason))
  const fid = `dd-reason-${h.id}`
  return (
    <article className="dd-hold">
      <h3>{h.title}</h3>
      <p className="dd-hold-why">{h.why}</p>
      {!compact && h.evidence.length > 0 && (
        <dl className="dd-hold-ev">
          {h.evidence.slice(0, 4).map(e => (
            <div key={e.label}>
              <dt>{e.label}</dt>
              <dd>{e.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <label className="dd-field" htmlFor={fid}>
        <span>Your reason (required)</span>
        <input id={fid} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why you approve or reject" aria-invalid={!!err} aria-describedby={err ? `${fid}-err` : undefined} />
      </label>
      {err && (
        <p className="dd-err" id={`${fid}-err`} role="alert">
          {err}
        </p>
      )}
      <div className="dd-hold-act">
        <button className="dd-btn-primary dd-btn-sm" onClick={() => decide('approve')}>
          Approve
        </button>
        <button className="dd-btn dd-btn-sm" onClick={() => decide('reject')}>
          Reject
        </button>
      </div>
    </article>
  )
}

function InTray({ w }: { w: World }) {
  const open = w.holds.filter(h => h.open)
  if (!open.length) return null
  return (
    <section className="dd-panel dd-tray" aria-label="Waiting for the grant manager">
      <header className="dd-panel-head">
        <h2>Your call, grant manager</h2>
        <span className="dd-count">{open.length} open</span>
      </header>
      <p className="dd-tray-note">An agent stopped and asked a human. Decide with a reason, or the scripted grant manager will in a few seconds.</p>
      <HoldCard key={open[0].id} h={open[0]} compact />
      {open.length > 1 && (
        <button className="dd-btn dd-btn-wide" onClick={() => ui.set({ selected: 'p:grant_manager' })}>
          See all {open.length} open items
        </button>
      )}
    </section>
  )
}

function RequestPanel({ w }: { w: World }) {
  const [pick, setPick] = useState(0)
  const [who, setWho] = useState(PRESETS[0].researcherId)
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [])
  const choose = (i: number) => {
    setPick(i)
    setWho(PRESETS[i].researcherId)
  }
  const send = () => {
    const id = feed.submit({ ...toInput(PRESETS[pick]), researcherId: who })
    mine.add(id)
    ui.set({ requestOpen: false, hovered: `r:${who}` })
    window.setTimeout(() => ui.get().hovered === `r:${who}` && ui.set({ hovered: null }), 3000)
  }
  const person = w.researchers.find(r => r.id === who)
  return (
    <section className="dd-panel dd-req" aria-label="Send a request">
      <header className="dd-panel-head">
        <h2>Send a request</h2>
        <button className="dd-btn dd-btn-icon" onClick={() => ui.set({ requestOpen: false })} aria-label="Close">
          <Svg>{Icon.close}</Svg>
        </button>
      </header>
      <fieldset className="dd-fs">
        <legend>What the lab needs</legend>
        <div className="dd-presets">
          {PRESETS.map((p, i) => {
            const input = toInput(p)
            const o = feed.preview(input)
            return (
              <button key={p.label} ref={i === 0 ? first : undefined} className="dd-preset" aria-pressed={pick === i} onClick={() => choose(i)}>
                <span className="dd-preset-name">{p.label}</span>
                <span className="dd-preset-meta">
                  <span className="dd-num">{usd(p.price)}</span> on <span className="dd-id">{p.grantId}</span>
                </span>
                <span className="dd-preset-hint" data-o={o}>
                  Rules say now: {hint(o, input)}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>
      <fieldset className="dd-fs">
        <legend>Who is asking</legend>
        <div className="dd-who" role="radiogroup">
          {w.researchers.map(r => (
            <label key={r.id} className="dd-who-opt">
              <input type="radio" name="dd-who" value={r.id} checked={who === r.id} onChange={() => setWho(r.id)} />
              <span>
                {r.name}
                <small>{r.role}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <button className="dd-btn-primary dd-btn-wide" onClick={send}>
        Send {person ? person.name.replace('Dr. ', '').split(' ')[0] : 'the'}’s request
      </button>
      <p className="dd-req-note">The slip leaves {person?.name ?? 'their'} station, the purchasing agent runs every spending rule, and the answer comes back stamped.</p>
    </section>
  )
}

function Stampette({ o, label }: { o?: Outcome; label?: string }) {
  return (
    <span className="dd-mini" data-o={o ?? 'none'}>
      {o ? outcomeWord(o, label) : 'Checking'}
    </span>
  )
}

function Detail({ id, w }: { id: string; w: World }) {
  const node = w.nodes.find(n => n.id === id)
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => ref.current?.focus(), [id])
  if (!node) return null
  let body: ReactNode = null
  if (node.kind === 'researcher') {
    const r = w.researchers.find(x => `r:${x.id}` === id)
    const reqs = w.requests.filter(q => q.researcherId === r?.id).slice(0, 6)
    body = r && (
      <>
        <p className="dd-d-sub">
          {r.role} · {r.station}
        </p>
        <dl className="dd-cells">
          <div>
            <dt>Now</dt>
            <dd>{r.task}</dd>
          </div>
          <div>
            <dt>Paid from</dt>
            <dd>
              {r.grantIds.map(g => (
                <span key={g} className="dd-id dd-id-chip">
                  {g}
                </span>
              ))}
            </dd>
          </div>
        </dl>
        <h3 className="dd-d-h">Requests</h3>
        {reqs.length === 0 ? (
          <p className="dd-empty">No requests yet in this run.</p>
        ) : (
          <ul className="dd-reqs">
            {reqs.map(q => (
              <li key={q.id}>
                <div className="dd-reqs-top">
                  <Stampette o={q.outcome} label={q.chargedGrantId ? 'Rerouted' : ''} />
                  <b>{q.item}</b>
                  <span className="dd-num">{usd(q.price)}</span>
                </div>
                <p>{q.explanation}</p>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  } else if (node.kind === 'agent') {
    const role = id.slice(2)
    const a = w.agents.find(x => x.role === role)
    const rows = w.log.filter(l => l.actor === role).slice(0, 6)
    body = a && (
      <>
        <p className="dd-d-sub">Does the job of: {a.seat}. Logged in under its own identity.</p>
        <p className="dd-d-job">{a.job}</p>
        <h3 className="dd-d-h">Its log</h3>
        <LogList rows={rows} />
      </>
    )
  } else if (node.kind === 'grant') {
    const g = w.grants.find(x => `g:${x.id}` === id)
    const evs = w.statusEvents.filter(e => `g:${e.grantId}` === id).slice(0, 6)
    body = g && (
      <>
        <p className="dd-d-sub">
          {g.title} · {g.agency} · {g.start} to {g.end}
        </p>
        <table className="dd-money-t">
          <tbody>
            {(
              [
                ['Awarded', g.awarded],
                ['Received', g.received],
                ['Spent', g.spent],
                ['Promised', g.promised],
              ] as [string, number][]
            ).map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td className="dd-num">{usd(v)}</td>
              </tr>
            ))}
            <tr className="dd-money-total">
              <th scope="row">Truly available</th>
              <td className="dd-num">{usd(g.available)}</td>
            </tr>
          </tbody>
        </table>
        <dl className="dd-cells">
          <div>
            <dt>Status</dt>
            <dd data-frozen={g.frozen ? '1' : '0'}>{g.frozen ? 'Frozen' : g.status === 'restored_by_court' ? 'Active, restored by court' : g.status === 'ended' ? 'Ended' : 'Active'}</dd>
          </div>
          {g.frozenReason && (
            <div>
              <dt>Why frozen</dt>
              <dd>{g.frozenReason}</dd>
            </div>
          )}
        </dl>
        <h3 className="dd-d-h">Status events</h3>
        {evs.length === 0 ? (
          <p className="dd-empty">No status changes yet in this run.</p>
        ) : (
          <ul className="dd-evs">
            {evs.map(e => (
              <li key={e.id}>
                <span className="dd-ev-day">{e.day}</span>
                <span className="dd-ev-src">{e.source}</span>
                <span>{e.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  } else if (id === 'p:grant_manager') {
    const open = w.holds.filter(h => h.open)
    const done = w.holds.filter(h => !h.open).slice(0, 4)
    body = (
      <>
        <p className="dd-d-sub">The only one who approves, rejects or overrides, always with a reason. In this demo, that is you.</p>
        <h3 className="dd-d-h">Open holds</h3>
        {open.length === 0 ? <p className="dd-empty">Nothing is waiting for you right now.</p> : open.map(h => <HoldCard key={h.id} h={h} compact />)}
        {done.length > 0 && (
          <>
            <h3 className="dd-d-h">Decided</h3>
            <ul className="dd-evs">
              {done.map(h => (
                <li key={h.id}>
                  <span className="dd-ev-day">{h.decision?.day}</span>
                  <span className="dd-ev-src">{h.decision?.choice === 'approve' ? 'Approved' : 'Rejected'}</span>
                  <span>
                    {h.title}. {h.decision?.reason}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    )
  } else {
    const src = node.kind === 'source' ? w.statusEvents.filter(e => e.source.startsWith(node.label.split(' ')[0])).slice(0, 5) : []
    const rows = w.log.filter(l => (id === 'v:vendors' ? l.action.startsWith('check_invoice') || l.action.includes('buy') : id === 'p:funder' ? l.action.includes('payment_request') || l.action.includes('follow_up') : l.actor === 'bookkeeping')).slice(0, 5)
    body = (
      <>
        <p className="dd-d-sub">{node.sub ?? (node.kind === 'source' ? 'Read by the bookkeeping agent.' : '')}</p>
        {src.length > 0 && (
          <ul className="dd-evs">
            {src.map(e => (
              <li key={e.id}>
                <span className="dd-ev-day">{e.day}</span>
                <span className="dd-ev-src">{e.grantId}</span>
                <span>{e.summary}</span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="dd-d-h">Related log</h3>
        <LogList rows={rows} />
      </>
    )
  }
  return (
    <section className="dd-panel dd-detail" aria-label={`Detail: ${node.label}`}>
      <header className="dd-panel-head dd-detail-head">
        <h2 ref={ref} tabIndex={-1}>
          {node.kind === 'grant' ? <span className="dd-id">{node.label}</span> : node.label}
        </h2>
        <button className="dd-btn dd-btn-icon" onClick={() => ui.set({ selected: null })} aria-label="Close detail">
          <Svg>{Icon.close}</Svg>
        </button>
      </header>
      <div className="dd-detail-body">{body}</div>
    </section>
  )
}

function LogList({ rows }: { rows: LogRow[] }) {
  if (!rows.length) return <p className="dd-empty">Nothing logged yet in this run.</p>
  return (
    <ul className="dd-evs">
      {rows.map(r => (
        <li key={r.id}>
          <span className="dd-ev-day">{r.day}</span>
          <span className="dd-ev-src">{r.action}</span>
          <span>{r.reason}</span>
        </li>
      ))}
    </ul>
  )
}

function Narration({ w }: { w: World }) {
  return (
    <div className="dd-narr" aria-live="polite">
      <div className="dd-narr-top">
        <span className="dd-narr-date">{w.today}</span>
        <b>{w.beat?.title ?? 'The Ortiz Lab'}</b>
        <span className="dd-narr-demo">Demo data</span>
      </div>
      {w.beat && <p>{w.beat.caption}</p>}
    </div>
  )
}

function SheetInfo({ w }: { w: World }) {
  return (
    <div className="dd-sheetinfo">
      <table className="dd-rev">
        <caption>Revisions: the live ledger</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">By</th>
            <th scope="col">Action and reason</th>
          </tr>
        </thead>
        <tbody>
          {w.log.slice(0, 3).map(r => (
            <tr key={r.id}>
              <td className="dd-num">{r.day.slice(5)}</td>
              <td>{ACTOR[r.actor]}</td>
              <td>
                <div className="dd-rev-txt">
                  <span className="dd-rev-act">{r.action}</span> {r.reason}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dd-tblock">
        <div className="dd-tb-title">GrantGuard · grant office of the Ortiz Lab</div>
        <dl>
          <div>
            <dt>Date</dt>
            <dd className="dd-num">{w.today}</dd>
          </div>
          <div>
            <dt>Approved by</dt>
            <dd>Grant manager only</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>Demo data</dd>
          </div>
          <div>
            <dt>Sheet</dt>
            <dd>1 of 1</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

// ── The HUD ────────────────────────────────────────────────────────────────

export function Hud() {
  const w = useWorld()
  const u = useUi()
  const [parts, setParts] = useState(false)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (ui.get().requestOpen) ui.set({ requestOpen: false })
      else if (ui.get().selected) ui.set({ selected: null })
      setParts(false)
      setMenu(false)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const openCount = w.holds.filter(h => h.open).length

  return (
    <div className="dd-hud">
      <div className="dd-top">
        <a className="dd-brand" href="#d" aria-label="GrantGuard">
          <Mark />
          <span>GrantGuard</span>
        </a>
        <div className="dd-top-r">
          <button className="dd-btn dd-desk" aria-expanded={parts} onClick={() => setParts(p => !p)}>
            <Svg>{Icon.list}</Svg>
            Parts list
          </button>
          <div className="dd-desk">
            <Playback w={w} />
          </div>
          <button className="dd-btn dd-mob" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
            <Svg>{menu ? Icon.close : Icon.list}</Svg>
            {menu ? 'Close' : 'Sheet'}
          </button>
        </div>
      </div>
      {parts && (
        <div className="dd-panel dd-parts-pop dd-desk">
          <PartsList w={w} onPick={() => setParts(false)} />
        </div>
      )}

      <header className="dd-hero">
        <h1>An AI grant office that keeps every lab purchase inside its grant’s rules.</h1>
        <p className="dd-lede">Researchers send requests. Three AI agents check each one against the spending rules and the money truly available, then buy, reroute, block, or hold it for the grant manager, the one person who approves.</p>
        <div className="dd-cta">
          <button className="dd-btn-primary" aria-expanded={u.requestOpen} onClick={() => ui.set({ requestOpen: !u.requestOpen, selected: null })}>
            Send a request
          </button>
          <a className="dd-link" href={APP_URL}>
            Open the grant office
          </a>
        </div>
        {openCount > 0 && !u.selected && (
          <button className="dd-btn dd-mob dd-tray-chip" onClick={() => ui.set({ selected: 'p:grant_manager' })}>
            {openCount} waiting for the grant manager
          </button>
        )}
      </header>

      {u.requestOpen && <RequestPanel w={w} />}

      <div className="dd-side">
        {!u.selected && !u.requestOpen && (
          <div className="dd-desk">
            <InTray w={w} />
          </div>
        )}
        {u.selected && <Detail id={u.selected} w={w} />}
      </div>

      {menu && (
        <div className="dd-panel dd-drawer dd-mob">
          <Playback w={w} />
          <PartsList w={w} onPick={() => setMenu(false)} />
          <SheetInfo w={w} />
        </div>
      )}

      <Narration w={w} />
      <div className="dd-desk">
        <SheetInfo w={w} />
      </div>
    </div>
  )
}
