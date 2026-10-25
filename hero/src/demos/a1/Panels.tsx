// The sidebar's sections: waiting on you (pinned), grants, requests (and
// sending one), agents and sources, the lab, activity, and the chapters.
// Every row that points at something in the scene hovers and selects it.

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { PRESETS, feed, kindOf, usd } from '../../feed'
import type { Grant, Hold, Outcome, Request, World } from '../../feed'
import { IconCheck, IconChevron, IconCross, IconPlus, ItemIcon, NodeGlyph, outcomeWord } from './icons'
import { act, jumpTo, reducedMotion, rowLink, selectNode, ui, useFeed, useUi, type Section } from './ui'
import { ACTOR, GRANT_COLOR, actionWord, daysLeft, firstName, fmtDay, fmtShort, grantStatus, nodeNow, shortItem, type Now } from './words'

const LIKELY: Record<Outcome, string> = {
  accept: 'Likely bought',
  refine: 'Likely rerouted or sent back',
  reject: 'Likely blocked',
  hold: 'Likely held',
}

const grantName = (w: World, id: string | undefined) => w.grants.find(g => g.id === id)?.name ?? 'a grant'

/** Brings a row into view when it becomes selected (e.g. from a click in the scene). */
function useReveal(on: boolean) {
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (on) ref.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [on])
  return ref
}

/** A row for a node in the scene: hover marks it, a click selects it and shows its detail. */
function NodeRow({ id, className, head, children }: { id: string; className?: string; head: ReactNode; children?: ReactNode }) {
  const selected = useUi(s => s.selected === id)
  const hovered = useUi(s => s.hovered === id)
  const ref = useReveal(selected)
  return (
    <li ref={ref} className={`a-row${className ? ` ${className}` : ''}${selected ? ' is-selected' : ''}${hovered ? ' is-hovered' : ''}`}>
      <button type="button" className="a-row-main" aria-expanded={selected} onClick={() => selectNode(selected ? null : id)} {...rowLink(id)}>
        {head}
      </button>
      {selected && children && <div className="a-row-detail">{children}</div>}
    </li>
  )
}

// ── Waiting on you (pinned above the sections while anything is open) ────

function HoldItem({ h, onDone }: { h: Hold; onDone: (text: string) => void }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const grant = useFeed(w => (h.grantId ? grantName(w, h.grantId) : null))
  const decide = (choice: 'approve' | 'reject') => {
    const e = act(() => feed.decide(h.id, choice, reason))
    setErr(e ?? null)
    if (!e) onDone(`${choice === 'approve' ? 'Approved' : 'Rejected'}: ${h.title}. Your reason is in the log.`)
  }
  const fieldId = `a-reason-${h.id}`
  return (
    <article className="a-hold" aria-labelledby={`${fieldId}-t`}>
      <h3 id={`${fieldId}-t`}>{h.title}</h3>
      <p className="a-muted">
        Asked by the {ACTOR[h.raisedBy].toLowerCase()}
        {grant ? ` · ${grant}` : ''}
      </p>
      <p className="a-hold-why">{h.why}</p>
      {h.evidence.length > 0 && (
        <dl className="a-facts">
          {h.evidence.map(ev => (
            <div key={ev.label + ev.value}>
              <dt>{ev.label}</dt>
              <dd>{ev.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <label className="a-field-label" htmlFor={fieldId}>
        Your reason (required)
      </label>
      <textarea
        id={fieldId}
        rows={2}
        value={reason}
        onChange={e => setReason(e.target.value)}
        aria-invalid={!!err}
        aria-describedby={err ? `${fieldId}-err` : `${fieldId}-note`}
      />
      {err ? (
        <p className="a-err" id={`${fieldId}-err`} role="alert">
          {err}
        </p>
      ) : (
        <p className="a-muted" id={`${fieldId}-note`}>
          If you don’t decide, the scripted grant manager will in a few seconds.
        </p>
      )}
      <div className="a-hold-actions">
        <button type="button" className="a-btn a-btn--primary" onClick={() => decide('approve')}>
          <IconCheck size={14} />
          Approve
        </button>
        <button type="button" className="a-btn" onClick={() => decide('reject')}>
          <IconCross size={14} />
          Reject
        </button>
      </div>
    </article>
  )
}

export function Waiting() {
  const holds = useFeed(w => w.holds)
  const open = holds.filter(h => h.open)
  const [shut, setShut] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const doneRef = useRef<HTMLParagraphElement>(null)
  const n = open.length
  // A new hold opens the section again and comes into view, unless the viewer is busy in the sidebar.
  const seen = useRef(n)
  useEffect(() => {
    if (n > seen.current) {
      setShut(false)
      const busy = document.activeElement?.closest('.demo-a1 .a-side') && document.activeElement?.matches('input, textarea, select')
      if (!busy) requestAnimationFrame(() => body.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }))
    }
    seen.current = n
  }, [n])
  useEffect(() => {
    if (!done) return
    doneRef.current?.focus({ preventScroll: true })
    const t = setTimeout(() => {
      if (body.current?.contains(document.activeElement)) document.querySelector<HTMLElement>('.demo-a1 .a-sec-h button')?.focus()
      setDone(null)
    }, 8000)
    return () => clearTimeout(t)
  }, [done])
  if (!n && !done) return null
  // The heading and body are siblings in the scroll area, so the heading stays pinned while it scrolls.
  return (
    <>
      <h2 className="a-wait-h" id="a-wait-h">
        <button type="button" aria-expanded={!shut} aria-controls="a-wait-body" onClick={() => setShut(s => !s)}>
          <span>Waiting on you</span>
          {n > 0 && (
            <span className="a-badge">
              {n}
              <span className="a-sr"> open</span>
            </span>
          )}
          <IconChevron />
        </button>
      </h2>
      <div ref={body} className="a-wait-body" id="a-wait-body" role="region" aria-labelledby="a-wait-h" hidden={shut}>
        {done && (
          <p ref={doneRef} className="a-done" role="status" tabIndex={-1}>
            <IconCheck size={14} />
            {done}
          </p>
        )}
        {open.map(h => (
          <HoldItem key={h.id} h={h} onDone={setDone} />
        ))}
      </div>
    </>
  )
}

// ── Grants ────────────────────────────────────────────────────────────────

function MoneyBar({ g }: { g: Grant }) {
  const total = Math.max(1, g.awarded)
  const pct = (v: number) => `${Math.max(0, (v / total) * 100)}%`
  return (
    <span className={`a-bar${g.frozen ? ' is-frozen' : ''}`} aria-hidden="true">
      <span className="a-bar-spent" style={{ width: pct(g.spent) }} />
      <span className="a-bar-promised" style={{ width: pct(g.promised) }} />
      <span className="a-bar-free" style={{ width: pct(g.available) }} />
    </span>
  )
}

function GrantRow({ g }: { g: Grant }) {
  const today = useFeed(w => w.today)
  const events = useFeed(w => w.statusEvents)
  const st = grantStatus(g)
  const left = daysLeft(today, g.end)
  const evs = events.filter(e => e.grantId === g.id).slice(0, 4)
  return (
    <NodeRow
      id={`g:${g.id}`}
      className="a-grant"
      head={
        <>
          <span className="a-grant-top">
            <span className="a-row-title">
              <i className="a-swatch" style={{ background: GRANT_COLOR[g.id] }} aria-hidden="true" />
              {g.name}
            </span>
            <span className={`a-status a-status--${st.tone}`}>{st.word}</span>
          </span>
          <span className="a-grant-money">
            <span className="a-big a-num">{usd(g.available)}</span>
            <span className="a-muted">truly available</span>
            <span className="a-grant-days a-num">{st.tone === 'ended' ? 'Ended' : `${left} days left`}</span>
          </span>
          <MoneyBar g={g} />
          <span className="a-grant-foot">
            <span>
              <i className="a-key a-key--spent" aria-hidden="true" />
              Spent <span className="a-num">{usd(g.spent)}</span>
            </span>
            <span>
              <i className="a-key a-key--promised" aria-hidden="true" />
              Promised <span className="a-num">{usd(g.promised)}</span>
            </span>
            <span>
              <i className={`a-key a-key--free${g.frozen ? ' is-frozen' : ''}`} aria-hidden="true" />
              {g.frozen ? 'Available, frozen' : 'Available'}
            </span>
          </span>
        </>
      }
    >
      {g.frozen && g.frozenReason && <p className="a-note">{g.frozenReason}</p>}
      <dl className="a-money">
        {(
          [
            ['Awarded', g.awarded],
            ['Received from NIH', g.received],
            ['Spent', g.spent],
            ['Promised to open orders', g.promised],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="a-num">{usd(v)}</dd>
          </div>
        ))}
        <div className="a-money-total">
          <dt>Truly available</dt>
          <dd className="a-num">{usd(g.available)}</dd>
        </div>
      </dl>
      <p className="a-muted">
        {g.title}. {g.agency}, runs {fmtDay(g.start)} to {fmtDay(g.end)}. Truly available is awarded minus spent minus promised.
      </p>
      {evs.length > 0 && (
        <>
          <h4 className="a-sub">Status changes</h4>
          <ul className="a-events">
            {evs.map(e => (
              <li key={e.id}>
                <span className="a-muted">
                  {fmtDay(e.day)} · {e.source.replace(/ \(Apify\)$/, '')}
                </span>
                <span>{e.summary}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </NodeRow>
  )
}

function GrantsBody() {
  const grants = useFeed(w => w.grants)
  return (
    <ul className="a-rows">
      {grants.map(g => (
        <GrantRow key={g.id} g={g} />
      ))}
    </ul>
  )
}

function GrantsSummary() {
  const grants = useFeed(w => w.grants)
  const frozen = grants.filter(g => g.frozen)
  if (frozen.length) return <>{frozen.map(g => g.name).join(' and ')} frozen</>
  return <>{grants.every(g => grantStatus(g).tone === 'ok') ? 'Both active' : 'One has ended'}</>
}

// ── Requests ──────────────────────────────────────────────────────────────

function Composer() {
  const researchers = useFeed(w => w.researchers)
  const grants = useFeed(w => w.grants) // previews change when a grant freezes or thaws
  useFeed(w => w.today)
  const preset0 = useUi(s => s.composeFor)
  const [pick, setPick] = useState(() => Math.max(0, PRESETS.findIndex(p => p.researcherId === preset0)))
  const [who, setWho] = useState(() => preset0 ?? PRESETS[0].researcherId)
  const box = useRef<HTMLFormElement>(null)
  const p = PRESETS[pick]
  useEffect(() => {
    const first = box.current?.querySelector<HTMLInputElement>('input:checked')
    first?.focus({ preventScroll: true })
    box.current?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [])
  const send = () => {
    const id = act(() => feed.submit({ ...p, researcherId: who }))
    ui.set({ mine: [id, ...ui.get().mine].slice(0, 6), composing: false, composeFor: null, openRequest: id })
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.demo-a1 .a-compose-toggle')?.focus())
  }
  return (
    <form
      ref={box}
      className="a-compose"
      aria-label="Send a request"
      onSubmit={e => {
        e.preventDefault()
        send()
      }}
    >
      <fieldset className="a-field">
        <legend>What to buy</legend>
        <div className="a-presets">
          {PRESETS.map((x, i) => {
            const likely = feed.preview({ ...x, researcherId: who })
            return (
              <label key={x.label} className={`a-preset${i === pick ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="a-preset"
                  checked={i === pick}
                  onChange={() => {
                    setPick(i)
                    setWho(x.researcherId)
                  }}
                />
                <span className="a-tile a-tile--sm">
                  <ItemIcon kind={kindOf(x.item, x.category)} size={20} />
                </span>
                <span className="a-preset-text">
                  <span className="a-preset-name">{x.label}</span>
                  <span className="a-preset-meta">
                    <span className="a-num">{usd(x.price)}</span> · <i className="a-swatch" style={{ background: GRANT_COLOR[x.grantId] }} aria-hidden="true" />
                    {grants.find(g => g.id === x.grantId)?.name}
                  </span>
                </span>
                <span className={`a-word a-word--${likely}`}>{LIKELY[likely]}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
      <label className="a-field">
        <span className="a-field-label">Who is asking</span>
        <select value={who} onChange={e => setWho(e.target.value)}>
          {researchers.map(r => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.role})
            </option>
          ))}
        </select>
      </label>
      <div className="a-compose-actions">
        <button type="submit" className="a-btn a-btn--primary">
          Send to the purchasing agent
        </button>
        <button type="button" className="a-btn" onClick={() => ui.set({ composing: false, composeFor: null })}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function RequestRow({ r }: { r: Request }) {
  const open = useUi(s => s.openRequest === r.id)
  const hovered = useUi(s => s.hovered === r.id)
  const mine = useUi(s => s.mine.includes(r.id) || (!!r.revisionOf && s.mine.includes(r.revisionOf)))
  const asker = useFeed(w => w.researchers.find(x => x.id === r.researcherId)?.name ?? '')
  const grants = useFeed(w => w.grants)
  const ref = useReveal(open)
  const name = (id: string) => grants.find(g => g.id === id)?.name ?? 'a grant'
  const tone = r.outcome ?? 'pending'
  const toggle = () => {
    if (open) ui.set({ openRequest: null, selected: ui.get().selected === r.id ? null : ui.get().selected })
    else selectNode(r.id)
  }
  return (
    <li ref={ref} className={`a-req${open ? ' is-selected' : ''}${hovered ? ' is-hovered' : ''}`}>
      <button type="button" className="a-req-main" aria-expanded={open} onClick={toggle} {...rowLink(r.id)}>
        <span className="a-tile">
          <ItemIcon kind={r.kind} size={26} />
        </span>
        <span className="a-req-text">
          <span className="a-req-line">
            <span className="a-row-title">{shortItem(r.item)}</span>
            <span className="a-num a-req-price">{usd(r.price)}</span>
          </span>
          <span className="a-req-sub">
            <span className={`a-word a-word--${tone}`}>{outcomeWord(r)}</span>
            <span className="a-req-meta">
              {firstName(asker)} · {fmtShort(r.day)}
              {mine && <span className="a-you"> · You sent this</span>}
            </span>
          </span>
          <span className="a-req-why">{r.explanation}</span>
        </span>
      </button>
      {open && (
        <div className="a-row-detail">
          <p className="a-muted">
            {r.item}. Asked by {asker} on {fmtDay(r.day)}, on the {name(r.grantId).toLowerCase()}
            {r.chargedGrantId ? `; charged to the ${name(r.chargedGrantId).toLowerCase()}` : ''}
            {r.split.length ? `; split ${r.split.map(s => `${Math.round(s.share * 100)}% ${name(s.grantId).toLowerCase()}`).join(', ')}` : ''}.
          </p>
          {r.purpose && <p className="a-muted">For: {r.purpose}</p>}
          {r.verdicts.length > 0 ? (
            <>
              <h4 className="a-sub">Spending rules</h4>
              <ul className="a-checks">
                {r.verdicts.map((v, i) => (
                  <li key={i} className={v.pass ? 'is-pass' : 'is-fail'}>
                    <span className="a-check-mark">{v.pass ? <IconCheck size={11} /> : <IconCross size={11} />}</span>
                    <span>
                      <span className="a-check-rule">
                        {v.rule}
                        <span className="a-sr">{v.pass ? ', passed' : ', failed'}</span>
                      </span>
                      <span className="a-muted">
                        {v.detail}
                        {v.auditCase ? ` (${v.auditCase})` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </li>
  )
}

function RequestsBody() {
  const requests = useFeed(w => w.requests)
  const composing = useUi(s => s.composing)
  const shown = requests.slice(0, 24)
  return (
    <>
      <button
        type="button"
        className="a-btn a-btn--wide a-compose-toggle"
        aria-expanded={composing}
        onClick={() => ui.set({ composing: !composing, composeFor: composing ? null : ui.get().composeFor })}
      >
        <IconPlus size={14} />
        Send a request
      </button>
      {composing && <Composer />}
      {shown.length === 0 ? (
        <p className="a-empty">No requests yet. The lab’s first ones land in a moment.</p>
      ) : (
        <ul className="a-reqs">
          {shown.map(r => (
            <RequestRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </>
  )
}

function RequestsSummary() {
  const r = useFeed(w => w.requests[0])
  if (!r) return <>None yet</>
  return (
    <>
      {shortItem(r.item)} · {outcomeWord(r).toLowerCase()}
    </>
  )
}

// ── Agents and sources ────────────────────────────────────────────────────

const AGENT_IDS = ['a:purchasing', 'a:bookkeeping', 'a:payment_report', 'p:grant_manager']
const OUTSIDE_IDS = ['s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments', 'v:vendors', 'p:funder']
const STATE_WORD: Record<Now['state'], string> = { idle: 'Idle', working: 'Working', waiting: 'Waiting on you' }
const RULES = [
  'Grant is active and not frozen',
  'Not in the grant’s last 90 days, for supplies',
  'Enough truly available money',
  'Category allowed on a federal grant',
  'Under the $5,000 card limit',
  'Shared costs split across the grants they serve',
]

function AgentDetail({ id, w }: { id: string; w: World }) {
  if (id === 'p:grant_manager') {
    const decided = w.holds.filter(h => !h.open).slice(0, 3)
    return (
      <>
        <p>You are the grant manager: the only one who approves, rejects or overrides. Every decision needs a reason.</p>
        {decided.length > 0 && (
          <>
            <h4 className="a-sub">Decided</h4>
            <ul className="a-decided">
              {decided.map(h => (
                <li key={h.id}>
                  <span className={`a-word a-word--${h.decision?.choice === 'approve' ? 'accept' : 'reject'}`}>{h.decision?.choice === 'approve' ? 'Approved' : 'Rejected'}</span>
                  <span>{h.title}</span>
                  <span className="a-muted">
                    {h.decision?.by === 'viewer' ? 'You' : 'Scripted grant manager'}: {h.decision?.reason}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    )
  }
  const a = w.agents.find(x => `a:${x.role}` === id)
  if (!a) return null
  const rows = w.log.filter(l => l.actor === a.role).slice(0, 4)
  const current = a.role === 'purchasing' ? w.requests.find(r => r.verdicts.length) : undefined
  return (
    <>
      <p>{a.job}</p>
      {a.role === 'purchasing' && (
        <>
          <h4 className="a-sub">{current ? `The six rules on ${shortItem(current.item).toLowerCase()}` : 'The six rules'}</h4>
          <ul className="a-checks">
            {RULES.map((rule, i) => {
              const v = current?.verdicts[i]
              return (
                <li key={rule} className={v ? (v.pass ? 'is-pass' : 'is-fail') : 'is-wait'}>
                  <span className="a-check-mark">{v ? v.pass ? <IconCheck size={11} /> : <IconCross size={11} /> : null}</span>
                  <span className="a-check-rule">
                    {v?.rule ?? rule}
                    {v && <span className="a-sr">{v.pass ? ', passed' : ', failed'}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {rows.length > 0 && (
        <>
          <h4 className="a-sub">Recently</h4>
          <LogList rows={rows} className="a-agent-log" />
        </>
      )}
    </>
  )
}

function AgentRow({ id }: { id: string }) {
  const w = useFeed(x => x)
  const n = w.nodes.find(x => x.id === id)
  const now = nodeNow(id, w)
  if (!n) return null
  return (
    <NodeRow
      id={id}
      className={`a-node a-node--${now.state}`}
      head={
        <>
          <NodeGlyph kind={n.kind === 'person' ? 'person' : 'agent'} />
          <span className="a-node-text">
            <span className="a-node-top">
              <span className="a-row-title">{n.label}</span>
              <span className={`a-state a-state--${now.state}`}>{STATE_WORD[now.state]}</span>
            </span>
            <span className="a-node-now">{now.line}</span>
          </span>
        </>
      }
    >
      <AgentDetail id={id} w={w} />
    </NodeRow>
  )
}

function OutsideRow({ id }: { id: string }) {
  const w = useFeed(x => x)
  const n = w.nodes.find(x => x.id === id)
  if (!n) return null
  const now = nodeNow(id, w)
  const word = n.label.split(' ')[0]
  const rows = w.log.filter(l => l.reason.includes(word)).slice(0, 3)
  return (
    <NodeRow
      id={id}
      className={`a-node a-node--sm a-node--${now.state}`}
      head={
        <>
          <NodeGlyph kind={n.kind === 'person' ? 'person' : n.kind === 'vendor' ? 'vendor' : 'source'} size={16} />
          <span className="a-node-text">
            <span className="a-row-title">{n.label}</span>
            <span className="a-node-now">{now.line}</span>
          </span>
        </>
      }
    >
      {n.sub && <p className="a-muted">{n.sub}</p>}
      {rows.length ? <LogList rows={rows} /> : <p className="a-muted">Nothing in the log yet.</p>}
    </NodeRow>
  )
}

function AgentsBody() {
  return (
    <>
      <ul className="a-rows">
        {AGENT_IDS.map(id => (
          <AgentRow key={id} id={id} />
        ))}
      </ul>
      <h3 className="a-sub">Sources and outside</h3>
      <ul className="a-rows a-rows--tight">
        {OUTSIDE_IDS.map(id => (
          <OutsideRow key={id} id={id} />
        ))}
      </ul>
    </>
  )
}

function AgentsSummary() {
  const w = useFeed(x => x)
  const states = AGENT_IDS.map(id => [id, nodeNow(id, w).state] as const)
  if (states.some(([, s]) => s === 'waiting')) return <>Waiting on you</>
  const busy = states.filter(([, s]) => s === 'working').map(([id]) => w.nodes.find(n => n.id === id)?.label ?? '')
  if (!busy.length) return <>All idle</>
  return <>{busy.length === 1 ? `${busy[0]} working` : `${busy.length} working`}</>
}

// ── The lab ───────────────────────────────────────────────────────────────

function ResearcherRow({ rid }: { rid: string }) {
  const w = useFeed(x => x)
  const r = w.researchers.find(x => x.id === rid)
  if (!r) return null
  const id = `r:${rid}`
  const now = nodeNow(id, w)
  const mine = w.requests.filter(q => q.researcherId === rid).slice(0, 4)
  return (
    <NodeRow
      id={id}
      className={`a-node a-node--${now.state}`}
      head={
        <>
          <NodeGlyph kind="researcher" />
          <span className="a-node-text">
            <span className="a-node-top">
              <span className="a-row-title">{r.name}</span>
              <span className="a-muted">{r.role}</span>
            </span>
            <span className="a-node-now">{now.line}</span>
          </span>
        </>
      }
    >
      <p className="a-muted">
        {r.station.replace('-80', '−80')}. Paid from the {r.grantIds.map(g => grantName(w, g).toLowerCase()).join(' and the ')}.
      </p>
      {mine.length > 0 && (
        <ul className="a-mini">
          {mine.map(q => (
            <li key={q.id}>
              <ItemIcon kind={q.kind} size={18} />
              <span>{shortItem(q.item)}</span>
              <span className={`a-word a-word--${q.outcome ?? 'pending'}`}>{outcomeWord(q)}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="a-btn a-btn--wide" onClick={() => ui.set({ section: 'requests', composing: true, composeFor: rid })}>
        Send a request as {firstName(r.name)}
      </button>
    </NodeRow>
  )
}

function LabBody() {
  const ids = useFeed(w => w.researchers.map(r => r.id).join(' '))
  return (
    <ul className="a-rows">
      {ids.split(' ').map(rid => (
        <ResearcherRow key={rid} rid={rid} />
      ))}
    </ul>
  )
}

function LabSummary() {
  const w = useFeed(x => x)
  const sending = w.packets.find(p => p.from.startsWith('r:') && (p.kind === 'request' || p.kind === 'pushback' || p.kind === 'paper'))
  if (sending) return <>{firstName(w.researchers.find(r => `r:${r.id}` === sending.from)?.name ?? '')} is sending {sending.kind === 'paper' ? 'a paper' : 'a request'}</>
  return <>Five researchers at work</>
}

// ── Activity ──────────────────────────────────────────────────────────────

function LogList({ rows, className }: { rows: World['log']; className?: string }) {
  return (
    <ol className={className ? `a-log ${className}` : 'a-log'}>
      {rows.map(r => (
        <li key={r.id}>
          <span className="a-log-head">
            <span className="a-log-who">{ACTOR[r.actor]}</span>
            <span className="a-log-what">{actionWord(r.action)}</span>
            <time className="a-log-day" dateTime={r.day}>
              {fmtShort(r.day)}
            </time>
          </span>
          <span className="a-log-why">{r.reason}</span>
        </li>
      ))}
    </ol>
  )
}

function ActivityBody() {
  const log = useFeed(w => w.log)
  return log.length ? <LogList rows={log.slice(0, 30)} /> : <p className="a-empty">Nothing yet.</p>
}

function ActivitySummary() {
  const r = useFeed(w => w.log[0])
  if (!r) return <>Nothing yet</>
  return (
    <>
      {ACTOR[r.actor]} · {actionWord(r.action).toLowerCase()}
    </>
  )
}

// ── Chapters (the story's scene index) ────────────────────────────────────

/** Feed ms when each beat starts (engine.ts story()). */
export const CHAPTERS: [number, string][] = [
  [400, 'A normal week in the Ortiz Lab'],
  [19600, 'The grant is canceled'],
  [30600, 'A court restores it'],
  [38600, 'The scientist pushes to buy'],
  [48100, 'It defends the decision'],
  [58600, 'The money lands'],
  [71100, 'Rerouted to a grant with time left'],
  [81600, 'Not allowed on a federal grant'],
  [91100, 'Sent back to refine'],
  [112100, 'Exactly at the limit'],
  [123600, 'Over the limit: your call'],
  [144600, 'A paper credits the wrong grant'],
  [157200, 'A bill for a canceled order'],
  [168200, 'Payment request, drafted and defended'],
  [190200, 'Live'],
]
export const STORY_MS = CHAPTERS[CHAPTERS.length - 1][0]

export function useChapter() {
  const title = useFeed(w => w.beat?.title)
  return CHAPTERS.findIndex(([, t]) => t === title)
}

function ChaptersBody() {
  const at = useChapter()
  return (
    <ol className="a-chapters">
      {CHAPTERS.map(([ms, title], i) => (
        <li key={title}>
          <button type="button" aria-current={i === at ? 'step' : undefined} className={i < at ? 'is-past' : undefined} onClick={() => jumpTo(ms + 20)}>
            <span className="a-chapter-n a-num" aria-hidden="true">
              {i + 1}
            </span>
            <span>{title}</span>
            <span className="a-sr">{i === at ? ', playing now' : ', jump here'}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

function ChaptersSummary() {
  const at = useChapter()
  if (at < 0) return <>Starting</>
  return (
    <>
      {at + 1} of {CHAPTERS.length} · {CHAPTERS[at][1]}
    </>
  )
}

export const SECTIONS: { id: Section; title: string; Summary: ComponentType; Body: ComponentType }[] = [
  { id: 'grants', title: 'Grants', Summary: GrantsSummary, Body: GrantsBody },
  { id: 'requests', title: 'Requests', Summary: RequestsSummary, Body: RequestsBody },
  { id: 'agents', title: 'Agents', Summary: AgentsSummary, Body: AgentsBody },
  { id: 'lab', title: 'Lab', Summary: LabSummary, Body: LabBody },
  { id: 'activity', title: 'Activity', Summary: ActivitySummary, Body: ActivityBody },
  { id: 'chapters', title: 'Chapters', Summary: ChaptersSummary, Body: ChaptersBody },
]
