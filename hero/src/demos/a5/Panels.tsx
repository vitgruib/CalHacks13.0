// The sidebar's sections: grants, what is waiting on you, requests, the
// agents, the lab, the activity log and the story's scenes. Rows link to the
// scene through ui.ts: hovering or focusing a row sets `hovered`, clicking
// selects. Everything persistent here reads the World snapshot.

import { useEffect, useRef, useState } from 'react'
import { PRESETS, R01, R21, feed, kindOf, usd, useFlow } from '../../feed'
import type { AgentRole, Grant, Hold, LogRow, Outcome, Request, World } from '../../feed'
import { IconCheck, IconCross, IconLock, IconPlus, ItemIcon, outcomeWord } from './icons'
import { act, reducedMotion, selectNode, ui, useFeed, useUi } from './store'
import {
  ACTOR,
  BEATS,
  actionWord,
  agentNow,
  dayOrText,
  daysLeft,
  firstName,
  fmtDay,
  fmtShort,
  grantName,
  grantStatus,
  managerNow,
  nodeNow,
  plainDates,
  plainName,
  researcherNow,
  type Activity,
} from './words'

export const GRANT_TONE: Record<string, string> = { [R01]: 'mito', [R21]: 'anti' }

/** Hovering or focusing a row lights the same thing in the scene. */
export const hoverProps = (id: string) => ({
  onMouseEnter: () => ui.get().hovered !== id && ui.set({ hovered: id }),
  onMouseLeave: () => ui.get().hovered === id && ui.set({ hovered: null }),
  onFocus: () => ui.get().hovered !== id && ui.set({ hovered: id }),
  onBlur: () => ui.get().hovered === id && ui.set({ hovered: null }),
})

const useHot = (id: string) => useUi(s => s.hovered === id)
const usePicked = (id: string) => useUi(s => s.selected === id)

/** Keeps a freshly selected row in view inside its scroller. */
function useReveal(on: boolean) {
  const el = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (on) el.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [on])
  return el
}

function StateMark({ state }: { state: Activity }) {
  return <span className={`a-state a-state--${state}`} aria-hidden="true" />
}

const STATE_WORD: Record<Activity, string> = { idle: 'Idle', working: 'Working', waiting: 'Waiting on a person' }

// ── Grants ──────────────────────────────────────────────────────────────

function Bar({ g }: { g: Grant }) {
  const total = Math.max(1, g.spent + g.promised + Math.max(0, g.available))
  const pct = (n: number) => `${(Math.max(0, n) / total) * 100}%`
  return (
    <span className="a-bar" aria-hidden="true">
      <i className="a-bar-spent" style={{ width: pct(g.spent) }} />
      <i className="a-bar-promised" style={{ width: pct(g.promised) }} />
      <i className="a-bar-free" style={{ width: pct(g.available) }} />
    </span>
  )
}

function GrantRow({ g }: { g: Grant }) {
  const id = `g:${g.id}`
  const today = useFeed(w => w.today)
  const events = useFeed(w => w.statusEvents)
  const hot = useHot(id)
  const picked = usePicked(id)
  const li = useReveal(picked)
  const st = grantStatus(g)
  const left = daysLeft(today, g.end)
  const evs = events.filter(e => e.grantId === g.id).slice(0, 3)
  return (
    <li ref={li} className={`a-grant${hot ? ' is-hot' : ''}${picked ? ' is-picked' : ''}`} data-tone={GRANT_TONE[g.id]} data-state={st.tone}>
      <button type="button" className="a-row a-grant-row" aria-expanded={picked} onClick={() => selectNode(id)} {...hoverProps(id)}>
        <span className="a-grant-name">
          <span className="a-swatch" aria-hidden="true" />
          {g.name}
        </span>
        <span className="a-grant-money a-num">{usd(g.available)}</span>
        <span className="a-grant-status">
          {g.frozen && <IconLock size={13} />}
          {st.word}
        </span>
        <span className="a-grant-avail">truly available</span>
        <Bar g={g} />
        <span className="a-grant-meta">
          <span className="a-key a-key--spent" aria-hidden="true" />
          <span className="a-num">{usd(g.spent)}</span> spent
          <span className="a-key a-key--promised" aria-hidden="true" />
          <span className="a-num">{usd(g.promised)}</span> promised
          <span className="a-grant-days">{left > 0 ? `${left} days left` : 'Ended'}</span>
        </span>
      </button>
      {picked && (
        <div className="a-more">
          {g.frozen && g.frozenReason && <p className="a-note">{plainDates(g.frozenReason)}</p>}
          <dl className="a-facts a-facts--money">
            <div>
              <dt>Awarded</dt>
              <dd className="a-num">{usd(g.awarded)}</dd>
            </div>
            <div>
              <dt>Received from NIH</dt>
              <dd className="a-num">{usd(g.received)}</dd>
            </div>
            <div>
              <dt>Spent</dt>
              <dd className="a-num">{usd(g.spent)}</dd>
            </div>
            <div>
              <dt>Promised to open orders</dt>
              <dd className="a-num">{usd(g.promised)}</dd>
            </div>
          </dl>
          <p className="a-muted">
            {g.agency}. Runs {fmtDay(g.start)} to {fmtDay(g.end)}. Truly available is awarded minus spent minus promised.
          </p>
          {evs.length > 0 && (
            <ol className="a-events">
              {evs.map(e => (
                <li key={e.id}>
                  <span className="a-muted">
                    {fmtShort(e.day)} · {e.source}
                  </span>
                  <span>{e.summary}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  )
}

export function Grants() {
  const grants = useFeed(w => w.grants)
  return (
    <ul className="a-list a-grants">
      {grants.map(g => (
        <GrantRow key={g.id} g={g} />
      ))}
    </ul>
  )
}

// ── Waiting on you ──────────────────────────────────────────────────────

function HoldCard({ h }: { h: Hold }) {
  const grants = useFeed(w => w.grants)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const decide = (choice: 'approve' | 'reject') => {
    const e = act(() => feed.decide(h.id, choice, reason))
    setErr(e ?? null)
  }
  const fieldId = `a5-reason-${h.id}`
  return (
    <article className="a-hold" aria-labelledby={`${fieldId}-t`}>
      <h3 id={`${fieldId}-t`}>{h.title}</h3>
      <p className="a-hold-from">
        From the {ACTOR[h.raisedBy].toLowerCase()}
        {h.grantId ? ` · ${grantName(h.grantId, grants)}` : ''}
      </p>
      <p className="a-hold-why">{plainDates(h.why)}</p>
      {h.evidence.length > 0 && (
        <dl className="a-facts">
          {h.evidence.map(ev => (
            <div key={ev.label + ev.value}>
              <dt>{dayOrText(ev.label)}</dt>
              <dd>{plainDates(ev.value)}</dd>
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
        placeholder="For example: the quote is on file and it is in the aim 3 budget"
        onChange={e => setReason(e.target.value)}
        aria-invalid={!!err}
        aria-describedby={err ? `${fieldId}-err` : undefined}
      />
      {err && (
        <p className="a-err" id={`${fieldId}-err`} role="alert">
          {err}
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
  const closed = holds.filter(h => !h.open).slice(0, 4)
  return (
    <div className="a-waiting">
      {open.length === 0 && (
        <p className="a-empty">Nothing is waiting. An agent asks you here when it needs a person: a purchase over the card limit, a bill that doesn’t match, a paper on the wrong grant.</p>
      )}
      {open.map(h => (
        <HoldCard key={h.id} h={h} />
      ))}
      {closed.length > 0 && (
        <>
          <h3 className="a-sub">Decided</h3>
          <ul className="a-decided">
            {closed.map(h => (
              <li key={h.id}>
                <span className={`a-word a-word--${h.decision?.choice === 'approve' ? 'accept' : 'reject'}`}>{h.decision?.choice === 'approve' ? 'Approved' : 'Rejected'}</span>
                <span className="a-decided-title">{h.title}</span>
                <span className="a-muted">
                  {h.decision?.by === 'viewer' ? 'You' : 'Grant manager'}: {h.decision?.reason}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// ── Requests ────────────────────────────────────────────────────────────

const LIKELY: Record<Outcome, string> = {
  accept: 'Likely bought',
  refine: 'Likely rerouted or sent back',
  reject: 'Likely blocked',
  hold: 'Likely held',
}

function Composer() {
  const researchers = useFeed(w => w.researchers)
  const grants = useFeed(w => w.grants) // previews change when a grant freezes or thaws
  useFeed(w => w.today)
  const preset0 = useUi(s => s.composeFor)
  const [pick, setPick] = useState(() => Math.max(0, PRESETS.findIndex(p => p.researcherId === preset0)))
  const [who, setWho] = useState(() => preset0 ?? PRESETS[0].researcherId)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    first.current?.focus({ preventScroll: false })
  }, [])
  const p = PRESETS[pick]
  const send = () => {
    const id = act(() => feed.submit({ ...p, researcherId: who }))
    ui.set({ mine: [id, ...ui.get().mine].slice(0, 6), composing: false, composeFor: null, openRequest: id, chosen: true })
  }
  return (
    <form
      className="a-compose"
      aria-label="Send a request"
      onSubmit={e => {
        e.preventDefault()
        send()
      }}
    >
      <fieldset>
        <legend className="a-field-label">What to buy</legend>
        <div className="a-presets">
          {PRESETS.map((x, i) => {
            const likely = feed.preview({ ...x, researcherId: who })
            return (
              <label key={x.label} className={`a-preset${i === pick ? ' is-on' : ''}`}>
                <input
                  ref={i === pick ? first : undefined}
                  type="radio"
                  name="a5-preset"
                  checked={i === pick}
                  onChange={() => {
                    setPick(i)
                    setWho(x.researcherId)
                  }}
                />
                <ItemIcon kind={kindOf(x.item, x.category)} size={26} />
                <span className="a-preset-name">{x.label}</span>
                <span className="a-preset-meta">
                  <span className="a-num">{usd(x.price)}</span> on the {grantName(x.grantId, grants).toLowerCase()}
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
              {r.name}, {r.role.toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <div className="a-compose-actions">
        <button type="submit" className="a-btn a-btn--primary">
          Send to the purchasing agent
        </button>
        <button type="button" className="a-btn a-btn--quiet" onClick={() => ui.set({ composing: false, composeFor: null })}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function Checks({ r }: { r: Request }) {
  // Rule events only drive the reveal; the verdicts themselves come from the World.
  const seen = useRef(r.outcome ? r.verdicts.length : -1)
  const [, bump] = useState(0)
  useFlow(e => {
    if (e.type === 'rule' && e.requestId === r.id) {
      seen.current = e.index
      bump(n => n + 1)
    }
  })
  const shown = r.outcome || seen.current < 0 ? r.verdicts.length : seen.current + 1
  return (
    <ol className="a-checks" aria-label="Spending rules">
      {r.verdicts.map((v, i) => {
        const done = i < shown
        return (
          <li key={i} className={done ? (v.pass ? 'is-pass' : 'is-fail') : 'is-wait'}>
            <span className="a-check-mark" aria-hidden="true">
              {done ? v.pass ? <IconCheck size={11} /> : <IconCross size={11} /> : null}
            </span>
            <span className="a-check-rule">
              {v.rule}
              <span className="a-sr">{done ? (v.pass ? ': passed' : ': failed') : ': checking'}</span>
            </span>
            {done && (
              <span className="a-check-detail">
                {plainDates(v.detail)}
                {v.auditCase ? ` (${v.auditCase})` : ''}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function RequestRow({ r, who, mine }: { r: Request; who: string; mine: boolean }) {
  const grants = useFeed(w => w.grants)
  const open = useUi(s => s.openRequest === r.id)
  const hot = useUi(s => s.hovered === r.id || s.hovered === `r:${r.researcherId}`)
  const li = useReveal(open)
  const tone = r.outcome ?? 'pending'
  const where = [
    `Asked on the ${grantName(r.grantId, grants).toLowerCase()}`,
    r.chargedGrantId && r.chargedGrantId !== r.grantId ? `charged to the ${grantName(r.chargedGrantId, grants).toLowerCase()}` : '',
    r.split.length ? `split ${r.split.map(s => `${Math.round(s.share * 100)}% ${grantName(s.grantId, grants).replace(/ grant$/, '').toLowerCase()}`).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <li ref={li} className={`a-req${hot ? ' is-hot' : ''}${open ? ' is-open' : ''}`} data-outcome={tone}>
      <button
        type="button"
        className="a-row a-req-row"
        aria-expanded={open}
        onClick={() => ui.set({ openRequest: open ? null : r.id })}
        {...hoverProps(r.id)}
      >
        <span className="a-req-icon">
          <ItemIcon kind={r.kind} size={28} />
          <span className="a-req-dot" aria-hidden="true" />
        </span>
        <span className="a-req-item">{r.item}</span>
        <span className="a-req-price a-num">{usd(r.price)}</span>
        <span className="a-req-meta">
          {who}
          {mine && <span className="a-tag">Yours</span>}
          <span className={`a-word a-word--${tone}`}>{outcomeWord(r)}</span>
        </span>
        <span className="a-req-why">{plainDates(r.explanation)}</span>
      </button>
      {open && (
        <div className="a-more">
          {r.purpose && <p>“{r.purpose}”</p>}
          <p className="a-muted">
            {fmtDay(r.day)}. {where}.
          </p>
          {r.verdicts.length > 0 ? <Checks r={r} /> : <p className="a-muted">On its way to the purchasing agent.</p>}
        </div>
      )}
    </li>
  )
}

export function Requests() {
  const requests = useFeed(w => w.requests)
  const researchers = useFeed(w => w.researchers)
  const composing = useUi(s => s.composing)
  const mine = useUi(s => s.mine)
  const name = (id: string) => plainName(researchers.find(x => x.id === id)?.name ?? '')
  return (
    <div className="a-requests">
      {composing ? (
        <Composer />
      ) : (
        <button type="button" className="a-btn a-btn--wide a-send" onClick={() => ui.set({ composing: true, chosen: true })}>
          <IconPlus size={14} />
          Send a request
        </button>
      )}
      {requests.length === 0 ? (
        <p className="a-empty">No requests yet.</p>
      ) : (
        <ul className="a-list">
          {requests.slice(0, 30).map(r => (
            <RequestRow key={r.id} r={r} who={name(r.researcherId)} mine={mine.includes(r.id)} />
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Agents and the grant manager ────────────────────────────────────────

const RULES = [
  'Grant active and not frozen',
  'Not in the grant’s last 90 days, for supplies',
  'Enough truly available money',
  'Category allowed on a federal grant',
  'Under the $5,000 card limit',
  'Shared costs split across the grants they serve',
]

function LogMini({ rows }: { rows: LogRow[] }) {
  if (!rows.length) return <p className="a-empty">Nothing yet.</p>
  return (
    <ol className="a-log a-log--mini">
      {rows.map(l => (
        <li key={l.id}>
          <span className="a-log-what">
            {actionWord(l.action)} <span className="a-muted">· {fmtShort(l.day)}</span>
          </span>
          <span className="a-log-why">{plainDates(l.reason)}</span>
        </li>
      ))}
    </ol>
  )
}

function AgentRow({ role }: { role: AgentRole }) {
  const id = `a:${role}`
  const a = useFeed(w => w.agents.find(x => x.role === role))
  const w = useFeed(w => w)
  const hot = useHot(id)
  const picked = usePicked(id)
  const li = useReveal(picked)
  if (!a) return null
  const now = agentNow(role, w)
  const last = w.requests.find(r => r.verdicts.length > 0)
  return (
    <li ref={li} className={`a-agent${hot ? ' is-hot' : ''}${picked ? ' is-picked' : ''}`} data-state={now.state}>
      <button type="button" className="a-row a-agent-row" aria-expanded={picked} onClick={() => selectNode(id)} {...hoverProps(id)}>
        <StateMark state={now.state} />
        <span className="a-agent-name">{a.name}</span>
        <span className="a-agent-state">{STATE_WORD[now.state]}</span>
        <span className="a-agent-now">{now.line}</span>
      </button>
      {picked && (
        <div className="a-more">
          <p>{a.job}</p>
          {role === 'purchasing' && (
            <>
              <h4 className="a-sub">The six spending rules{last ? `, last run on ${last.item.split(',')[0].toLowerCase()}` : ''}</h4>
              {last ? <Checks key={last.id} r={last} /> : <ol className="a-rules6">{RULES.map(x => <li key={x}>{x}</li>)}</ol>}
            </>
          )}
          <h4 className="a-sub">Recent</h4>
          <LogMini rows={w.log.filter(l => l.actor === role).slice(0, 4)} />
        </div>
      )}
    </li>
  )
}

function ManagerRow() {
  const id = 'p:grant_manager'
  const w = useFeed(w => w)
  const hot = useHot(id)
  const picked = usePicked(id)
  const li = useReveal(picked)
  const now = managerNow(w)
  return (
    <li ref={li} className={`a-agent a-agent--person${hot ? ' is-hot' : ''}${picked ? ' is-picked' : ''}`} data-state={now.state}>
      <button type="button" className="a-row a-agent-row" aria-expanded={picked} onClick={() => selectNode(id)} {...hoverProps(id)}>
        <StateMark state={now.state} />
        <span className="a-agent-name">Grant manager</span>
        <span className="a-agent-state">{now.state === 'waiting' ? 'Your turn' : 'A person'}</span>
        <span className="a-agent-now">{now.line}</span>
      </button>
      {picked && (
        <div className="a-more">
          <p>The only person who approves, rejects or overrides. In this demo, that’s you. Every decision needs a reason and goes in the log.</p>
          <button type="button" className="a-btn" onClick={() => ui.set({ section: 'waiting', selected: null, chosen: true })}>
            Open what is waiting on you
          </button>
          <h4 className="a-sub">Recent</h4>
          <LogMini rows={w.log.filter(l => l.actor === 'grant_manager').slice(0, 3)} />
        </div>
      )}
    </li>
  )
}

function OutsideRow({ id }: { id: string }) {
  const w = useFeed(w => w)
  const n = w.nodes.find(x => x.id === id)
  const hot = useHot(id)
  const picked = usePicked(id)
  const li = useReveal(picked)
  if (!n) return null
  const now = nodeNow(id, w)
  const word = n.label.split(' ')[0]
  const rows = w.log.filter(l => l.reason.includes(word)).slice(0, 3)
  return (
    <li ref={li} className={`a-agent a-agent--outside${hot ? ' is-hot' : ''}${picked ? ' is-picked' : ''}`} data-state={now.state}>
      <button type="button" className="a-row a-agent-row" aria-expanded={picked} onClick={() => selectNode(id)} {...hoverProps(id)}>
        <StateMark state={now.state} />
        <span className="a-agent-name">{n.label}</span>
        <span className="a-agent-now">{now.line}</span>
      </button>
      {picked && (
        <div className="a-more">
          <h4 className="a-sub">In the log</h4>
          <LogMini rows={rows} />
        </div>
      )}
    </li>
  )
}

const OUTSIDE = ['s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments', 'v:vendors', 'p:funder']

export function Agents() {
  return (
    <div className="a-agents">
      <ul className="a-list">
        <AgentRow role="purchasing" />
        <AgentRow role="bookkeeping" />
        <AgentRow role="payment_report" />
        <ManagerRow />
      </ul>
      <h3 className="a-sub">Outside the office</h3>
      <ul className="a-list a-list--quiet">
        {OUTSIDE.map(id => (
          <OutsideRow key={id} id={id} />
        ))}
      </ul>
    </div>
  )
}

// ── The lab ─────────────────────────────────────────────────────────────

function ResearcherRow({ id }: { id: string }) {
  const nid = `r:${id}`
  const w = useFeed(w => w)
  const r = w.researchers.find(x => x.id === id)
  const hot = useHot(nid)
  const picked = usePicked(nid)
  const li = useReveal(picked)
  if (!r) return null
  const now = researcherNow(id, w)
  const theirs = w.requests.filter(q => q.researcherId === id).slice(0, 3)
  const initials = plainName(r.name)
    .split(' ')
    .map(s => s[0])
    .join('')
  return (
    <li ref={li} className={`a-person${hot ? ' is-hot' : ''}${picked ? ' is-picked' : ''}`} data-state={now.state}>
      <button type="button" className="a-row a-person-row" aria-expanded={picked} onClick={() => selectNode(nid)} {...hoverProps(nid)}>
        <span className="a-initials" aria-hidden="true">
          {initials}
        </span>
        <span className="a-person-name">{r.name}</span>
        <span className="a-person-role">{r.role}</span>
        <span className="a-person-now">{now.line}</span>
      </button>
      {picked && (
        <div className="a-more">
          <p className="a-muted">
            Works at the {r.station.charAt(0).toLowerCase() + r.station.slice(1)}. Paid from the {r.grantIds.map(g => grantName(g, w.grants).toLowerCase()).join(' and the ')}.
          </p>
          {theirs.length > 0 && (
            <ul className="a-mini-reqs">
              {theirs.map(q => (
                <li key={q.id}>
                  <ItemIcon kind={q.kind} size={20} />
                  <span>{q.item.split(',')[0]}</span>
                  <span className={`a-word a-word--${q.outcome ?? 'pending'}`}>{outcomeWord(q)}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="a-btn" onClick={() => ui.set({ section: 'requests', composing: true, composeFor: id, selected: null, chosen: true })}>
            Send a request as {firstName(r.name)}
          </button>
        </div>
      )}
    </li>
  )
}

export function Lab() {
  const ids = useFeed(w => w.researchers.map(r => r.id).join(' '))
  return (
    <ul className="a-list">
      {ids.split(' ').map(id => (
        <ResearcherRow key={id} id={id} />
      ))}
    </ul>
  )
}

// ── Activity ────────────────────────────────────────────────────────────

export function ActivityLog() {
  const log = useFeed(w => w.log)
  if (!log.length) return <p className="a-empty">Nothing yet.</p>
  return (
    <ol className="a-log">
      {log.slice(0, 40).map(l => (
        <li key={l.id}>
          <span className="a-log-who">{ACTOR[l.actor]}</span>
          <span className="a-log-what">
            {actionWord(l.action)} <span className="a-muted">· {fmtShort(l.day)}</span>
          </span>
          <span className="a-log-why">{plainDates(l.reason)}</span>
        </li>
      ))}
    </ol>
  )
}

// ── The story's scenes ──────────────────────────────────────────────────

/** Start the story over and run it straight to a beat, the way `?at` does. */
export function jumpTo(at: number) {
  act(() => {
    ui.set({ selected: null, hovered: null, openRequest: null, mine: [], composing: false, chosen: false })
    feed.restart()
    feed.advance(at + 1)
  })
}

export function Scenes() {
  const beat = useFeed(w => w.beat?.id)
  const cur = BEATS.findIndex(b => b.id === beat)
  const list = useRef<HTMLOListElement>(null)
  // On opening, bring the current scene into view inside the section (never the page).
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-current="step"]')
    const box = list.current?.closest<HTMLElement>('.a-sec-body')
    if (el && box) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 2
  }, [])
  return (
    <ol className="a-scenes" ref={list}>
      {BEATS.map((b, i) => (
        <li key={b.id}>
          <button type="button" className={`a-scene${i < cur ? ' is-done' : ''}`} aria-current={i === cur ? 'step' : undefined} onClick={() => jumpTo(b.at)}>
            <span className="a-scene-n a-num">
              {i < cur ? <IconCheck size={12} /> : i + 1}
              {i < cur && <span className="a-sr">Done: </span>}
            </span>
            <span className="a-scene-title">{b.title}</span>
            {i === cur && <span className="a-scene-now">Now</span>}
          </button>
        </li>
      ))}
    </ol>
  )
}

// ── One-line summaries for the collapsed section headers ────────────────

export function summaryOf(section: string, w: World): string {
  switch (section) {
    case 'grants': {
      const frozen = w.grants.filter(g => g.frozen)
      return frozen.length ? `${frozen.map(g => g.name.replace(/ grant$/, '')).join(' and ')} frozen` : 'Both active'
    }
    case 'waiting': {
      const n = w.holds.filter(h => h.open).length
      return n ? `${n} decision${n === 1 ? '' : 's'}` : 'Nothing waiting'
    }
    case 'requests': {
      const r = w.requests[0]
      return r ? `${r.item.split(',')[0]} · ${outcomeWord(r)}` : 'None yet'
    }
    case 'agents': {
      const busy = (['purchasing', 'bookkeeping', 'payment_report'] as const).map(role => agentNow(role, w)).filter(n => n.state !== 'idle').length
      return busy ? `${busy} working` : 'All idle'
    }
    case 'lab':
      return `${w.researchers.length} researchers`
    case 'activity': {
      const l = w.log[0]
      return l ? `${ACTOR[l.actor]}: ${actionWord(l.action).toLowerCase()}` : 'Nothing yet'
    }
    default:
      return ''
  }
}
