// The sidebar's sections, read like a calm timetable: what is waiting on
// you, the grants' line status, requests with time, item, from, to and
// status, the agents as stations, the activity log, and the story's stops.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EDGES, PRESETS, feed, kindOf, usd } from '../../feed'
import type { Grant, Hold, LogRow, Outcome, Packet, Request, World } from '../../feed'
import { ACTOR, fmtDay } from './bits'
import { IconCheck, IconCross, IconLock, IconPlus, ItemIcon, StationMark, TokenIcon, outcomeWord } from './icons'
import { LINES, linesAt } from './lines'
import { act, reducedMotion, selectNode, ui, useFeed, useUi } from './store'

// ── Small helpers ────────────────────────────────────────────────────────

export const firstName = (name: string) => name.replace(/^Dr\. /, '').split(' ')[0]
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const grantName = (grants: Grant[], id: string) => grants.find(g => g.id === id)?.name ?? 'Another grant'
const shortGrant = (grants: Grant[], id: string) => grantName(grants, id).replace(/ grant$/, '')

/** Hovering or focusing a row lights the same thing in the scene. */
export function hoverProps(id: string) {
  return {
    onMouseEnter: () => ui.get().hovered !== id && ui.set({ hovered: id }),
    onMouseLeave: () => ui.get().hovered === id && ui.set({ hovered: null }),
    onFocus: () => ui.get().hovered !== id && ui.set({ hovered: id }),
    onBlur: () => ui.get().hovered === id && ui.set({ hovered: null }),
  }
}

/** Scrolls a row into view when it becomes the selection. */
function useReveal<T extends HTMLElement>(on: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (on) ref.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [on])
  return ref
}

export function grantStatus(g: Grant, today: string) {
  if (g.status === 'ended' || today > g.end) return 'Ended'
  if (g.status === 'canceled') return 'Canceled, spending frozen'
  if (g.status === 'restored_by_court' && g.frozen) return 'Restored by court, still frozen'
  if (g.frozen) return 'Spending frozen'
  return 'Active'
}

/** What a request's status reads as in the timetable right now. */
export function statusOf(r: Request, packets: Packet[]): { word: string; tone: Outcome | 'pending' } {
  if (!r.outcome) {
    const coming = packets.some(p => p.refId === r.id && (p.kind === 'request' || p.kind === 'pushback'))
    return { word: coming || !r.verdicts.length ? 'On its way' : 'Checking', tone: 'pending' }
  }
  if (r.outcome === 'hold' && r.holdFor === 'grant_manager') return { word: 'Waiting on you', tone: 'hold' }
  return { word: outcomeWord(r), tone: r.outcome }
}

/** Agent text carries ISO dates (2026-03-10); show them the way the rest of the page does. */
export const dated = (t: string) => t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, d => fmtDay(d))

function Empty({ children }: { children: ReactNode }) {
  return <p className="a-empty">{children}</p>
}

// ── Waiting on you ───────────────────────────────────────────────────────

function HoldItem({ h }: { h: Hold }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const decide = (choice: 'approve' | 'reject') => {
    const e = act(() => feed.decide(h.id, choice, reason))
    setErr(e ?? null)
  }
  const fieldId = `a-reason-${h.id}`
  return (
    <li className="a-hold">
      <p className="a-hold-from">
        <time dateTime={h.day}>{shortDay(h.day)}</time> · from the {ACTOR[h.raisedBy].toLowerCase()}
      </p>
      <h3>{h.title}</h3>
      <p className="a-hold-why">{dated(h.why)}</p>
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
        onChange={e => {
          setReason(e.target.value)
          if (err) setErr(null)
        }}
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
    </li>
  )
}

export function WaitingSection() {
  const holds = useFeed(w => w.holds)
  const open = holds.filter(h => h.open)
  const closed = holds.filter(h => !h.open).slice(0, 4)
  return (
    <>
      {open.length === 0 ? (
        <Empty>Nothing is waiting. An agent asks you here when it needs a person: a buy over the card limit, a bill that doesn’t match, a paper on the wrong grant.</Empty>
      ) : (
        <ul className="a-holds">
          {open.map(h => (
            <HoldItem key={h.id} h={h} />
          ))}
        </ul>
      )}
      {closed.length > 0 && (
        <>
          <h3 className="a-sub">Decided</h3>
          <ol className="a-table a-decided">
            {closed.map(h => (
              <li key={h.id}>
                <time className="a-t" dateTime={h.decision?.day}>
                  {h.decision ? shortDay(h.decision.day) : ''}
                </time>
                <div>
                  <p className="a-row-main">
                    <span className="a-row-title">{h.title}</span>
                    <span className={`a-word a-word--${h.decision?.choice === 'approve' ? 'accept' : 'reject'}`}>{h.decision?.choice === 'approve' ? 'Approved' : 'Rejected'}</span>
                  </p>
                  <p className="a-row-why">
                    {h.decision?.by === 'viewer' ? 'You' : 'The grant manager'}: {dated(h.decision?.reason ?? '')}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  )
}

// ── Grants: a line-status board ──────────────────────────────────────────

function GrantRow({ g }: { g: Grant }) {
  const id = `g:${g.id}`
  const today = useFeed(w => w.today)
  const events = useFeed(w => w.statusEvents)
  const lit = useUi(s => s.hovered === id)
  const on = useUi(s => s.selected === id)
  const ref = useReveal<HTMLLIElement>(on)
  const status = grantStatus(g, today)
  const left = Math.max(0, daysBetween(today, g.end))
  const tone = status === 'Active' ? 'ok' : status === 'Ended' ? 'off' : 'frozen'
  const total = Math.max(1, g.awarded)
  const evs = events.filter(e => e.grantId === g.id).slice(0, 4)
  return (
    <li ref={ref} className={`a-grant${lit ? ' is-lit' : ''}${on ? ' is-on' : ''}${g.frozen ? ' is-frozen' : ''}`}>
      <button type="button" aria-expanded={on} onClick={() => selectNode(on ? null : id)} {...hoverProps(id)}>
        <span className="a-grant-head">
          <span className="a-grant-name">{g.name}</span>
          <span className={`a-state a-state--${tone}`}>
            {g.frozen && <IconLock size={12} />}
            {status}
          </span>
        </span>
        <span className="a-grant-money">
          <span className="a-big a-num">{usd(g.available)}</span>
          <span className="a-muted">truly available</span>
        </span>
        <span className="a-bar" aria-hidden="true">
          <span className="a-bar-spent" style={{ flexGrow: g.spent / total }} />
          <span className="a-bar-promised" style={{ flexGrow: g.promised / total }} />
          <span className="a-bar-free" style={{ flexGrow: Math.max(0, g.available) / total }} />
        </span>
        <span className="a-grant-meta">
          <span className="a-num">
            {usd(g.spent)} spent · {usd(g.promised)} promised
          </span>
          <span className={`a-num${left <= 90 && tone !== 'off' ? ' is-late' : ''}`}>{tone === 'off' ? 'Ended' : `${left} days left`}</span>
        </span>
      </button>
      {on && (
        <div className="a-more">
          {g.frozen && g.frozenReason && <p>{dated(g.frozenReason)}</p>}
          {left <= 90 && tone !== 'off' && <p>In its last 90 days, so the purchasing agent won’t charge supplies to it.</p>}
          <dl className="a-money">
            {(
              [
                ['Awarded', g.awarded],
                ['Received', g.received],
                ['Spent', g.spent],
                ['Promised', g.promised],
                ['Truly available', g.available],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className="a-num">{usd(v)}</dd>
              </div>
            ))}
          </dl>
          <p className="a-muted">
            {g.agency} · runs {fmtDay(g.start)} to {fmtDay(g.end)}
          </p>
          {evs.length > 0 && (
            <ol className="a-table">
              {evs.map(e => (
                <li key={e.id}>
                  <time className="a-t" dateTime={e.day}>
                    {shortDay(e.day)}
                  </time>
                  <div>
                    <p className="a-row-title">{e.source}</p>
                    <p className="a-row-why">{e.summary}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  )
}

export function GrantsSection() {
  const grants = useFeed(w => w.grants)
  return (
    <>
      <ul className="a-grants">
        {grants.map(g => (
          <GrantRow key={g.id} g={g} />
        ))}
      </ul>
      <p className="a-key" aria-hidden="true">
        <span className="a-key-spent" /> spent <span className="a-key-promised" /> promised <span className="a-key-free" /> truly available
      </p>
    </>
  )
}

// ── Requests: the timetable ──────────────────────────────────────────────

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
    first.current?.focus({ preventScroll: true })
    first.current?.closest('form')?.scrollIntoView({ block: 'nearest' })
  }, [])
  const p = PRESETS[pick]
  const send = () => {
    const id = act(() => feed.submit({ ...p, researcherId: who }))
    ui.set({ mine: [id, ...ui.get().mine].slice(0, 6), composing: false, composeFor: null })
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
      <fieldset className="a-field">
        <legend className="a-field-label">What to buy</legend>
        <div className="a-presets">
          {PRESETS.map((x, i) => {
            const likely = feed.preview({ ...x, researcherId: who })
            return (
              <label key={x.label} className={`a-preset${i === pick ? ' is-on' : ''}`}>
                <input
                  ref={i === pick ? first : undefined}
                  type="radio"
                  name="a-preset"
                  checked={i === pick}
                  onChange={() => {
                    setPick(i)
                    setWho(x.researcherId)
                  }}
                />
                <ItemIcon kind={kindOf(x.item, x.category)} />
                <span className="a-preset-text">
                  <span className="a-preset-name">{x.label}</span>
                  <span className="a-preset-meta">
                    <span className="a-num">{usd(x.price)}</span> on the {shortGrant(grants, x.grantId).toLowerCase()} grant
                  </span>
                </span>
                <span className={`a-word a-word--${likely}`}>
                  <TokenIcon outcome={likely} size={12} />
                  {LIKELY[likely]}
                </span>
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
          Send request
        </button>
        <button type="button" className="a-btn" onClick={() => ui.set({ composing: false, composeFor: null })}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function RequestRow({ r }: { r: Request }) {
  const grants = useFeed(w => w.grants)
  const packets = useFeed(w => w.packets)
  const who = useFeed(w => w.researchers.find(x => x.id === r.researcherId)?.name ?? 'Someone')
  const open = useUi(s => s.openRequest === r.id)
  const lit = useUi(s => s.hovered === r.id || s.hovered === `r:${r.researcherId}`)
  const mine = useUi(s => s.mine.includes(r.id) || (!!r.revisionOf && s.mine.includes(r.revisionOf)))
  const ref = useReveal<HTMLLIElement>(open)
  const st = statusOf(r, packets)
  const to = r.split.length > 1 ? 'Both grants' : shortGrant(grants, r.split[0]?.grantId ?? r.chargedGrantId ?? r.grantId)
  return (
    <li ref={ref} className={`a-req${lit ? ' is-lit' : ''}${open ? ' is-on' : ''}${mine ? ' is-mine' : ''}`}>
      <button type="button" aria-expanded={open} onClick={() => ui.set({ openRequest: open ? null : r.id })} {...hoverProps(r.id)}>
        <time className="a-t" dateTime={r.day}>
          {shortDay(r.day)}
        </time>
        <ItemIcon kind={r.kind} />
        <span className="a-req-body">
          <span className="a-row-main">
            <span className="a-row-title">{r.item}</span>
            <span className="a-num a-req-price">{usd(r.price)}</span>
          </span>
          <span className="a-row-main">
            <span className="a-req-route">
              {firstName(who)}
              <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden="true">
                <path d="M1 4h11M9 1l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="a-sr">to</span>
              {to}
              {mine && <span className="a-yours">Yours</span>}
            </span>
            <span className={`a-word a-word--${st.tone}`}>{st.word}</span>
          </span>
          <span className="a-row-why">{dated(r.explanation)}</span>
        </span>
      </button>
      {open && (
        <div className="a-more">
          <p>
            Asked by {who} on {fmtDay(r.day)}, on the {grantName(grants, r.grantId).toLowerCase()}
            {r.chargedGrantId && r.chargedGrantId !== r.grantId ? `; charged to the ${grantName(grants, r.chargedGrantId).toLowerCase()}` : ''}
            {r.split.length ? `; split ${r.split.map(s => `${Math.round(s.share * 100)}% ${shortGrant(grants, s.grantId).toLowerCase()}`).join(', ')}` : ''}.
          </p>
          {r.purpose && <p className="a-muted">For: {r.purpose}</p>}
          {r.verdicts.length > 0 ? (
            <ol className="a-checks" aria-label="Spending rule checks">
              {r.verdicts.map((v, i) => (
                <li key={i} className={v.pass ? 'is-pass' : 'is-fail'}>
                  <span className="a-check-mark" aria-label={v.pass ? 'Passed' : 'Failed'}>
                    {v.pass ? <IconCheck size={11} /> : <IconCross size={11} />}
                  </span>
                  <span>
                    <span className="a-check-rule">{v.rule}</span>
                    <span className="a-muted">
                      {dated(v.detail)}
                      {v.auditCase ? ` (${v.auditCase})` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>The rule checks start when it reaches the purchasing agent.</Empty>
          )}
        </div>
      )}
    </li>
  )
}

function Person({ id }: { id: string }) {
  const r = useFeed(w => w.researchers.find(x => x.id === id))
  const grants = useFeed(w => w.grants)
  if (!r) return null
  return (
    <div className="a-person">
      <p className="a-row-main">
        <span className="a-row-title">{r.name}</span>
        <span className="a-muted">{r.role}</span>
      </p>
      <p className="a-muted">{r.station}</p>
      <p className="a-person-now">
        <span className="a-dot-live" aria-hidden="true" />
        {r.task}
      </p>
      <p className="a-muted">Paid from the {r.grantIds.map(g => shortGrant(grants, g).toLowerCase()).join(' and ')} grant{r.grantIds.length > 1 ? 's' : ''}</p>
      <button type="button" className="a-btn a-btn--small" onClick={() => ui.set({ composing: true, composeFor: r.id })}>
        <IconPlus size={14} />
        Send a request as {firstName(r.name)}
      </button>
    </div>
  )
}

export function RequestsSection() {
  const requests = useFeed(w => w.requests)
  const researchers = useFeed(w => w.researchers)
  const composing = useUi(s => s.composing)
  const composeFor = useUi(s => s.composeFor)
  const selected = useUi(s => s.selected)
  const hovered = useUi(s => s.hovered)
  const [more, setMore] = useState(false)
  const who = selected?.startsWith('r:') ? selected.slice(2) : null
  const rows = who ? requests.filter(r => r.researcherId === who) : requests
  const shown = more ? rows : rows.slice(0, 10)
  return (
    <>
      <div className="a-filter" role="group" aria-label="Whose requests">
        <button type="button" aria-pressed={!who} onClick={() => selectNode(null)}>
          All
        </button>
        {researchers.map(r => {
          const id = `r:${r.id}`
          return (
            <button key={r.id} type="button" aria-pressed={who === r.id} className={hovered === id ? 'is-lit' : undefined} onClick={() => selectNode(who === r.id ? null : id)} {...hoverProps(id)}>
              {firstName(r.name)}
            </button>
          )
        })}
      </div>
      {who && <Person id={who} />}
      {composing ? (
        <Composer key={composeFor ?? 'any'} />
      ) : (
        !who && (
          <button type="button" className="a-btn a-btn--small" onClick={() => ui.set({ composing: true })}>
            <IconPlus size={14} />
            Send a request
          </button>
        )
      )}
      {rows.length === 0 ? (
        <Empty>{who ? 'No requests from them yet.' : 'No requests yet.'}</Empty>
      ) : (
        <>
          <ol className="a-table a-reqs" aria-label="Requests, newest first">
            {shown.map(r => (
              <RequestRow key={r.id} r={r} />
            ))}
          </ol>
          {rows.length > shown.length && (
            <button type="button" className="a-link" onClick={() => setMore(true)}>
              Show all {rows.length}
            </button>
          )}
        </>
      )}
    </>
  )
}

// ── Agents: stations on the map ──────────────────────────────────────────

const nodeName = (w: World, id: string) => w.nodes.find(n => n.id === id)?.label ?? 'someone'

/** What a station is doing now, from the packets in flight, the open holds and the log. */
export function nowAt(w: World, id: string): { text: string; state: 'idle' | 'working' | 'waiting' } {
  if (id === 'p:grant_manager') {
    const n = w.holds.filter(h => h.open).length
    if (n) return { text: `${n} decision${n === 1 ? '' : 's'} waiting on you`, state: 'waiting' }
  } else if (id.startsWith('a:')) {
    const h = w.holds.find(x => x.open && `a:${x.raisedBy}` === id)
    if (h) return { text: `Waiting on you: ${h.title}`, state: 'waiting' }
  }
  let p: Packet | undefined
  for (const q of w.packets) if ((q.to === id || q.from === id) && (!p || q.sentAt > p.sentAt)) p = q
  if (p) {
    const from = nodeName(w, p.from)
    const to = nodeName(w, p.to)
    const amount = p.amount ? usd(p.amount) : ''
    const incoming: Partial<Record<Packet['kind'], string>> = {
      request: `New request: ${p.label}`,
      pushback: `${firstName(from)} pushes back: ${p.label}`,
      recheck: `Rechecking: ${p.label}`,
      reading: `Reading ${from}`,
      payment: `Recording a payment of ${amount}`,
      invoice: `Checking an invoice: ${p.label}`,
      paper: `Checking a paper: ${p.label}`,
      decision: `Taking the decision: ${p.label}`,
      follow_up: `The funder asks: ${p.label}`,
      hold: `A question is coming in: ${p.label}`,
    }
    const outgoing: Partial<Record<Packet['kind'], string>> = {
      verdict: `Answering ${firstName(to)}: ${p.label}`,
      recheck: `Asking for a recheck: ${p.label}`,
      hold: `Asking the grant manager: ${p.label}`,
      decision: `Sending the decision: ${p.label}`,
      payment_request: `Sending the funder: ${p.label}`,
      charge: `Paying the vendor: ${p.label}`,
      reading: `Sending a reading to bookkeeping`,
      invoice: `Sending an invoice: ${p.label}`,
      payment: `Paying ${amount} in`,
      follow_up: `Asking a follow-up: ${p.label}`,
    }
    const text = (p.to === id ? incoming : outgoing)[p.kind]
    if (text) return { text, state: 'working' }
  }
  if (id === 'a:purchasing') {
    const r = w.requests.find(x => !x.outcome && x.verdicts.length)
    if (r) return { text: `Running the spending rules on ${r.item.split(',')[0].toLowerCase()}`, state: 'working' }
  }
  const actor = id === 'p:grant_manager' ? 'grant_manager' : id.startsWith('a:') ? id.slice(2) : null
  const last = actor ? w.log.find(l => l.actor === actor) : undefined
  if (last) return { text: `Last: ${dated(last.reason)}`, state: 'idle' }
  const what = EDGES.find(e => e.from === id || e.to === id)?.what
  return { text: id === 'p:grant_manager' ? 'Nothing to decide' : !id.startsWith('a:') && what ? what : 'Idle', state: 'idle' }
}

const RULES = [
  'Grant is active and not frozen',
  'Not in the grant’s last 90 days, for supplies',
  'Enough truly available money',
  'Category allowed on a federal grant',
  'Under the $5,000 card limit',
  'Shared costs split across the grants they serve',
]

function StationRow({ id }: { id: string }) {
  const node = useFeed(w => w.nodes.find(n => n.id === id))
  const now = useFeed(w => nowAt(w, id).text)
  const state = useFeed(w => nowAt(w, id).state)
  const agent = useFeed(w => (id.startsWith('a:') ? w.agents.find(a => `a:${a.role}` === id) : undefined))
  const log = useFeed(w => w.log)
  const lit = useUi(s => s.hovered === id)
  const on = useUi(s => s.selected === id)
  const ref = useReveal<HTMLLIElement>(on)
  if (!node) return null
  const actor = id === 'p:grant_manager' ? 'grant_manager' : id.startsWith('a:') ? id.slice(2) : null
  const word = MENTIONS[id]
  const rows: LogRow[] = actor ? log.filter(l => l.actor === actor).slice(0, 5) : word ? log.filter(l => word.test(l.reason)).slice(0, 4) : []
  const colors = linesAt(id).map(l => LINES[l].color)
  return (
    <li ref={ref} className={`a-stop is-${state}${lit ? ' is-lit' : ''}${on ? ' is-on' : ''}`}>
      <button type="button" aria-expanded={on} onClick={() => selectNode(on ? null : id)} {...hoverProps(id)}>
        <StationMark colors={colors} />
        <span className="a-stop-body">
          <span className="a-row-main">
            <span className="a-row-title">{node.label}</span>
            {state !== 'idle' && <span className={`a-word a-word--${state === 'waiting' ? 'hold' : 'pending'}`}>{state === 'waiting' ? 'Needs you' : 'Working'}</span>}
          </span>
          <span className="a-row-why">{now}</span>
        </span>
      </button>
      {on && (
        <div className="a-more">
          {agent ? <p>{agent.job}</p> : node.sub && <p>{node.sub}</p>}
          {id === 'p:grant_manager' && <p>The only person who approves, rejects or overrides. In this demo, that’s you; open holds are under Waiting on you.</p>}
          {id === 'a:purchasing' && (
            <>
              <h3 className="a-sub">The six spending rules</h3>
              <ol className="a-rule-list">
                {RULES.map(r => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            </>
          )}
          {colors.length > 0 && (
            <p className="a-muted">
              Lines that stop here:{' '}
              {linesAt(id)
                .map(l => LINES[l].name.toLowerCase())
                .join(', ')}
            </p>
          )}
          <h3 className="a-sub">{actor ? 'Recent' : 'In the activity log'}</h3>
          {rows.length === 0 ? <Empty>Nothing yet.</Empty> : <LogTable rows={rows} />}
        </div>
      )}
    </li>
  )
}

/** How the log names each outside station. */
const MENTIONS: Record<string, RegExp> = {
  's:reporter': /RePORTER/,
  's:usaspending': /USAspending/,
  's:cancellations': /Cancellation list|terminated-grants/i,
  's:court': /court/i,
  's:payments': /Payment system|payment of/i,
  'v:vendors': /BioReagents|vendor/i,
  'p:funder': /follow-up|funder|payment request/i,
}

const OFFICE = ['a:purchasing', 'a:bookkeeping', 'a:payment_report', 'p:grant_manager']
const OUTSIDE = ['s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments', 'v:vendors', 'p:funder']

export function AgentsSection() {
  return (
    <>
      <ul className="a-stops">
        {OFFICE.map(id => (
          <StationRow key={id} id={id} />
        ))}
      </ul>
      <h3 className="a-sub">Outside the office</h3>
      <ul className="a-stops a-stops--outside">
        {OUTSIDE.map(id => (
          <StationRow key={id} id={id} />
        ))}
      </ul>
      <p className="a-key">
        {Object.values(LINES).map(l => (
          <span key={l.name}>
            <span className="a-key-line" style={{ background: l.color }} />
            {l.name}
          </span>
        ))}
      </p>
    </>
  )
}

// ── Activity ─────────────────────────────────────────────────────────────

const ACTOR_NODE: Partial<Record<LogRow['actor'], string>> = {
  purchasing: 'a:purchasing',
  bookkeeping: 'a:bookkeeping',
  payment_report: 'a:payment_report',
  grant_manager: 'p:grant_manager',
}

function LogTable({ rows }: { rows: LogRow[] }) {
  return (
    <ol className="a-table a-log">
      {rows.map(r => (
        <li key={r.id}>
          <time className="a-t" dateTime={r.day}>
            {shortDay(r.day)}
          </time>
          <div>
            <p className="a-row-title">{ACTOR[r.actor]}</p>
            <p className="a-row-why">{dated(r.reason)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function ActivitySection() {
  const log = useFeed(w => w.log)
  const [n, setN] = useState(16)
  if (!log.length) return <Empty>Nothing has happened yet.</Empty>
  return (
    <>
      <ol className="a-table a-log" aria-label="Activity, newest first">
        {log.slice(0, n).map(r => {
          const node = ACTOR_NODE[r.actor]
          return (
            <li key={r.id} {...(node ? { onMouseEnter: () => ui.set({ hovered: node }), onMouseLeave: () => ui.get().hovered === node && ui.set({ hovered: null }) } : {})}>
              <time className="a-t" dateTime={r.day}>
                {shortDay(r.day)}
              </time>
              <div>
                <p className="a-row-title">{ACTOR[r.actor]}</p>
                <p className="a-row-why">{dated(r.reason)}</p>
              </div>
            </li>
          )
        })}
      </ol>
      {log.length > n && (
        <button type="button" className="a-link" onClick={() => setN(k => k + 20)}>
          Show older
        </button>
      )}
    </>
  )
}

// ── Story: the route, one stop per beat ──────────────────────────────────

/** Each beat's feed time after a restart (engine.ts story()). */
export const BEATS: [number, string][] = [
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
const STORY_MS = 190200
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-')
export const beatIndex = (id: string | undefined) => (id ? BEATS.findIndex(([, t]) => slug(t) === id) : -1)
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

/** Restart the story and play it forward to a beat, keeping the sidebar where it is. */
export function jumpTo(ms: number) {
  const { section, sheet } = ui.get()
  act(() => {
    ui.reset()
    ui.set({ section, sheet })
    feed.restart()
    feed.advance(ms)
  })
}

export function StorySection() {
  const beat = useFeed(w => w.beat)
  const at = beatIndex(beat?.id)
  const line = useRef<HTMLOListElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const t = feed.storyProgress() * STORY_MS
      let i = 0
      while (i < BEATS.length - 1 && BEATS[i + 1][0] <= t) i++
      const next = BEATS[i + 1]?.[0] ?? BEATS[i][0]
      const k = next > BEATS[i][0] ? Math.min(1, (t - BEATS[i][0]) / (next - BEATS[i][0])) : 0
      line.current?.style.setProperty('--fill', String((i + (t < BEATS[0][0] ? 0 : k)) / (BEATS.length - 1)))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <ol ref={line} className="a-route" aria-label="The story, stop by stop">
      {BEATS.map(([ms, title], i) => (
        <li key={title} className={i < at ? 'is-past' : i === at ? 'is-here' : undefined}>
          <button type="button" aria-current={i === at ? 'step' : undefined} onClick={() => jumpTo(ms)}>
            <span className="a-route-dot" aria-hidden="true" />
            <time className="a-t">{clock(ms)}</time>
            <span className="a-route-title">{title}</span>
            <span className="a-sr">{i === at ? ', now playing' : ', jump here'}</span>
          </button>
          {i === at && beat && <p className="a-route-caption">{beat.caption}</p>}
        </li>
      ))}
    </ol>
  )
}
