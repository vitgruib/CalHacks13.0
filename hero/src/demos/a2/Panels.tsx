// What the sidebar's tabs and its "Waiting on you" banner hold: the grants,
// the agents and the lab (Overview), the request list and the composer
// (Requests), and the log (Activity). Rows link both ways with the scene
// through ui.ts: hovering a row lights its node, clicking one moves the camera.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { PRESETS, feed, kindOf, usd } from '../../feed'
import type { Grant, Hold, LogRow, Outcome, Request, World } from '../../feed'
import { IconCheck, IconChevron, IconClose, IconCross, IconPlus, ItemIcon, outcomeWord } from './icons'
import { daysLeft, firstName, fmtDay, fmtShortDay, grantName, grantStatus, grantTint, nodeLine, say, shortItem, type Busy } from './now'
import { act, hover, pick, reducedMotion, ui, unhover, useFeed, useUi } from './ui'

const LIKELY: Record<Outcome, string> = {
  accept: 'Likely bought',
  refine: 'Likely rerouted or sent back',
  reject: 'Likely blocked',
  hold: 'Likely held',
}

const ACTOR: Record<LogRow['actor'], string> = {
  purchasing: 'Purchasing agent',
  bookkeeping: 'Bookkeeping agent',
  payment_report: 'Payment & report agent',
  grant_manager: 'Grant manager',
  scientist: 'Lab',
  system: 'System',
}

const RULES = [
  'The grant is active and not frozen',
  'Supplies are not bought in a grant’s last 90 days',
  'There is enough truly available money',
  'The category is allowed on a federal grant',
  'It is under the $5,000 card limit',
  'Shared costs are split across the grants they serve',
]

/** Hover and focus on a row light the matching node in the scene. */
const linked = (id: string) => ({
  onMouseEnter: () => hover(id),
  onMouseLeave: () => unhover(id),
  onFocus: () => hover(id),
  onBlur: () => unhover(id),
})

/** Scroll a row into view when the scene picks it. */
function useReveal(id: string) {
  const el = useRef<HTMLLIElement>(null)
  const reveal = useUi(s => s.reveal)
  useEffect(() => {
    if (!reveal || ui.get().selected !== id) return
    const t = setTimeout(() => el.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }), 40)
    return () => clearTimeout(t)
  }, [reveal, id])
  return el
}

// Collapsed sections keep their state while the viewer switches tabs.
const sticky = new Map<string, boolean>()
function useSticky(key: string, initial: boolean) {
  const [open, setOpen] = useState(() => sticky.get(key) ?? initial)
  const set = (v: boolean) => {
    sticky.set(key, v)
    setOpen(v)
  }
  return [open, set] as const
}

function Section({ name, title, aside, initial, has, children }: { name: string; title: string; aside?: ReactNode; initial: boolean; has: (id: string) => boolean; children: ReactNode }) {
  const [open, setOpen] = useSticky(name, initial)
  const body = useId()
  const selected = useUi(s => s.selected)
  const reveal = useUi(s => s.reveal)
  useEffect(() => {
    if (reveal && selected && has(selected)) setOpen(true)
  }, [reveal])
  return (
    <section className="a-sec">
      <h3 className="a-sec-head">
        <button type="button" aria-expanded={open} aria-controls={body} onClick={() => setOpen(!open)}>
          <span>{title}</span>
          {aside && <span className="a-sec-aside">{aside}</span>}
          <IconChevron />
        </button>
      </h3>
      {open && (
        <ul id={body} className="a-rows">
          {children}
        </ul>
      )}
    </section>
  )
}

function BusyDot({ busy }: { busy: Busy }) {
  return <span className={`a-busy a-busy--${busy}`} aria-hidden="true" />
}
const BUSY_WORD: Record<Busy, string> = { idle: 'Idle', working: 'Working', waiting: 'Waiting on a person' }

/** A row that selects a node: the camera glides to it and the row opens. */
function NodeRow({ id, title, sub, line, busy, children }: { id: string; title: string; sub?: string; line: string; busy?: Busy; children?: ReactNode }) {
  const on = useUi(s => s.selected === id)
  const lit = useUi(s => s.hovered === id)
  const el = useReveal(id)
  const more = useId()
  return (
    <li ref={el} className={`a-row${on ? ' is-on' : ''}${lit ? ' is-lit' : ''}`}>
      <button type="button" className="a-row-btn" aria-expanded={on} aria-controls={on ? more : undefined} onClick={() => pick(on ? null : id)} {...linked(id)}>
        {busy && <BusyDot busy={busy} />}
        <span className="a-row-title">
          {title}
          {sub && <span className="a-row-sub"> · {sub}</span>}
        </span>
        <span className="a-row-line">
          {busy && <span className="a-sr">{BUSY_WORD[busy]}: </span>}
          {line}
        </span>
      </button>
      {on && children && (
        <div id={more} className="a-row-more">
          {children}
        </div>
      )}
    </li>
  )
}

// ── Grants ───────────────────────────────────────────────────────────────

function Bar({ g }: { g: Grant }) {
  const k = (n: number) => `${Math.max(0, (n / g.awarded) * 100).toFixed(2)}%`
  return (
    <span className={`a-bar${g.frozen ? ' is-frozen' : ''}`} aria-hidden="true">
      <i className="a-bar-spent" style={{ width: k(g.spent) }} />
      <i className="a-bar-promised" style={{ width: k(g.promised) }} />
      <i className="a-bar-free" style={{ width: k(g.available) }} />
    </span>
  )
}

const Tint = ({ color }: { color: string }) => <i className="a-tint" style={{ background: color }} aria-hidden="true" />

function GrantRow({ g }: { g: Grant }) {
  const id = `g:${g.id}`
  const tint = useFeed(w => grantTint(w, g.id))
  const on = useUi(s => s.selected === id)
  const lit = useUi(s => s.hovered === id)
  const today = useFeed(w => w.today)
  const events = useFeed(w => w.statusEvents)
  const el = useReveal(id)
  const more = useId()
  const left = daysLeft(today, g.end)
  const status = grantStatus(g)
  const evs = events.filter(e => e.grantId === g.id).slice(0, 3)
  return (
    <li ref={el} className={`a-row a-grant${on ? ' is-on' : ''}${lit ? ' is-lit' : ''}`}>
      <button type="button" className="a-row-btn" aria-expanded={on} aria-controls={on ? more : undefined} onClick={() => pick(on ? null : id)} {...linked(id)}>
        <span className="a-grant-top">
          <span className="a-row-title">
            <Tint color={tint} />
            {g.name}
          </span>
          <span className="a-grant-left">{left > 0 ? `${left} days left` : 'Ended'}</span>
        </span>
        <span className="a-grant-money">
          <span className="a-big a-num">{usd(g.available)}</span>
          <span className="a-big-note">truly available</span>
        </span>
        <Bar g={g} />
        <span className={`a-state a-state--${g.frozen ? 'frozen' : g.status === 'ended' ? 'ended' : 'active'}`}>
          <span>{status}</span>
          <span className="a-state-agency">· {g.agency}</span>
        </span>
      </button>
      {on && (
        <div id={more} className="a-row-more">
          <dl className="a-money">
            <div>
              <dt>
                <i className="a-key a-key--spent" aria-hidden="true" />
                Spent
              </dt>
              <dd className="a-num">{usd(g.spent)}</dd>
            </div>
            <div>
              <dt>
                <i className="a-key a-key--promised" aria-hidden="true" />
                Promised
              </dt>
              <dd className="a-num">{usd(g.promised)}</dd>
            </div>
            <div>
              <dt>
                <i className={`a-key a-key--free${g.frozen ? ' is-frozen' : ''}`} aria-hidden="true" />
                Truly available
              </dt>
              <dd className="a-num">{usd(g.available)}</dd>
            </div>
            <div className="a-money-sum">
              <dt>Awarded</dt>
              <dd className="a-num">{usd(g.awarded)}</dd>
            </div>
            <div className="a-money-sum">
              <dt>Received so far</dt>
              <dd className="a-num">{usd(g.received)}</dd>
            </div>
          </dl>
          {g.frozen && g.frozenReason && <p className="a-note">{say(g.frozenReason)}</p>}
          <p className="a-muted">
            {g.title}. Runs {fmtDay(g.start)} to {fmtDay(g.end)}.
          </p>
          {evs.length > 0 && (
            <ul className="a-events">
              {evs.map(e => (
                <li key={e.id}>
                  <span className="a-muted">
                    {fmtShortDay(e.day)} · {e.source}
                  </span>
                  <span>{say(e.summary)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

// ── Agents, the lab, and the outside ─────────────────────────────────────

function RecentLog({ rows }: { rows: LogRow[] }) {
  if (!rows.length) return <p className="a-muted">Nothing yet.</p>
  return (
    <ol className="a-mini-log">
      {rows.map(r => (
        <li key={r.id}>
          <span className="a-muted">{fmtShortDay(r.day)}</span> {say(r.reason)}
        </li>
      ))}
    </ol>
  )
}

function Agents({ w }: { w: World }) {
  const decided = w.holds.filter(h => !h.open).slice(0, 3)
  return (
    <>
      {w.agents.map(a => {
        const id = `a:${a.role}`
        const l = nodeLine(w, id)
        return (
          <NodeRow key={id} id={id} title={a.name} line={l.text} busy={l.busy}>
            <p>{a.job}</p>
            {a.role === 'purchasing' && (
              <ol className="a-rule-list">
                {RULES.map(r => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            )}
            <RecentLog rows={w.log.filter(r => r.actor === a.role).slice(0, 3)} />
          </NodeRow>
        )
      })}
      <NodeRow id="p:grant_manager" title="Grant manager" sub="you" line={nodeLine(w, 'p:grant_manager').text} busy={nodeLine(w, 'p:grant_manager').busy}>
        <p>The only person who approves, rejects or overrides. In this demo, that is you. Every decision needs a reason.</p>
        {decided.length > 0 && (
          <ul className="a-decided">
            {decided.map(h => (
              <li key={h.id}>
                <span className={`a-word a-word--${h.decision?.choice === 'approve' ? 'accept' : 'reject'}`}>{h.decision?.choice === 'approve' ? 'Approved' : 'Rejected'}</span>
                <span>{h.title}</span>
                <span className="a-muted">
                  {h.decision?.by === 'viewer' ? 'You' : 'Grant manager'}: {h.decision?.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
      </NodeRow>
    </>
  )
}

function Lab({ w }: { w: World }) {
  return (
    <>
      {w.researchers.map(r => {
        const id = `r:${r.id}`
        const l = nodeLine(w, id)
        const mine = w.requests.filter(q => q.researcherId === r.id).slice(0, 3)
        return (
          <NodeRow key={id} id={id} title={r.name} sub={r.role} line={l.text} busy={l.busy}>
            <p className="a-muted">
              {r.station}. Paid from the {r.grantIds.map(g => grantName(w, g).toLowerCase()).join(' and the ')}.
            </p>
            {mine.length > 0 && (
              <ul className="a-mini-reqs">
                {mine.map(q => (
                  <li key={q.id}>
                    <ItemIcon kind={q.kind} size={20} />
                    <span>{shortItem(q.item)}</span>
                    <span className={`a-word a-word--${q.outcome ?? 'pending'}`}>{outcomeWord(q)}</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="a-btn a-btn--small" onClick={() => ui.set({ tab: 'requests', composing: true, composeFor: r.id })}>
              <IconPlus size={14} />
              Send a request as {firstName(r.name)}
            </button>
          </NodeRow>
        )
      })}
    </>
  )
}

function Outside({ w }: { w: World }) {
  const ids = w.nodes.filter(n => n.side === 'outside')
  return (
    <>
      {ids.map(n => {
        const l = nodeLine(w, n.id)
        return (
          <NodeRow key={n.id} id={n.id} title={n.label} line={l.text} busy={l.busy}>
            <RecentLog rows={w.log.filter(r => r.reason.includes(n.label.split(' ').slice(0, 2).join(' '))).slice(0, 3)} />
          </NodeRow>
        )
      })}
    </>
  )
}

export function Overview() {
  const w = useFeed(x => x)
  const working = w.agents.filter(a => nodeLine(w, `a:${a.role}`).busy === 'working').length
  return (
    <div className="a-overview">
      <Section name="grants" title="Grants" initial has={id => id.startsWith('g:')}>
        {w.grants.map(g => (
          <GrantRow key={g.id} g={g} />
        ))}
      </Section>
      <Section name="agents" title="Agents" aside={working ? `${working} working` : undefined} initial has={id => id.startsWith('a:') || id === 'p:grant_manager'}>
        <Agents w={w} />
      </Section>
      <Section name="lab" title="The lab" aside="5 people" initial={false} has={id => id.startsWith('r:')}>
        <Lab w={w} />
      </Section>
      <Section name="outside" title="Sources and outside" initial={false} has={id => id.startsWith('s:') || id === 'p:funder' || id === 'v:vendors'}>
        <Outside w={w} />
      </Section>
    </div>
  )
}

// ── Waiting on you ───────────────────────────────────────────────────────

function HoldForm({ h }: { h: Hold }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const decide = (choice: 'approve' | 'reject') => setErr(act(() => feed.decide(h.id, choice, reason)) ?? null)
  const field = useId()
  return (
    <article className="a-hold" aria-labelledby={`${field}-t`}>
      <h3 id={`${field}-t`}>{h.title}</h3>
      <p>{say(h.why)}</p>
      {h.evidence.length > 0 && (
        <dl className="a-facts">
          {h.evidence.slice(0, 5).map(ev => (
            <div key={ev.label + ev.value}>
              <dt>{ev.label}</dt>
              <dd>{ev.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <label className="a-field-label" htmlFor={field}>
        Your reason (required)
      </label>
      <textarea
        id={field}
        rows={2}
        value={reason}
        placeholder="For example: in the approved budget, quote on file"
        onChange={e => {
          setReason(e.target.value)
          if (err) setErr(null)
        }}
        aria-invalid={!!err}
        aria-describedby={err ? `${field}-err` : undefined}
      />
      {err && (
        <p className="a-err" id={`${field}-err`} role="alert">
          {err}
        </p>
      )}
      <div className="a-hold-actions">
        <button type="button" className="a-btn a-btn--primary" onClick={() => decide('approve')}>
          Approve
        </button>
        <button type="button" className="a-btn" onClick={() => decide('reject')}>
          Reject
        </button>
      </div>
    </article>
  )
}

export function Waiting() {
  const holds = useFeed(w => w.holds)
  const open = holds.filter(h => h.open)
  const newest = open[0]?.id
  const [shown, setShown] = useState(true)
  const seen = useRef<string | undefined>(undefined)
  // A new decision opens the banner; the viewer can fold it away again.
  useEffect(() => {
    if (newest && newest !== seen.current) setShown(true)
    seen.current = newest
  }, [newest])
  const body = useId()
  if (!open.length) return null
  return (
    <section className="a-wait" aria-label="Waiting on you">
      <button type="button" className="a-wait-head" aria-expanded={shown} aria-controls={body} onClick={() => setShown(!shown)}>
        <span className="a-badge a-num" aria-label={`${open.length} waiting`}>
          {open.length}
        </span>
        <span className="a-wait-text">
          <span className="a-wait-title">Waiting on you</span>
          {!shown && <span className="a-wait-line">{open[0].title}</span>}
        </span>
        <IconChevron />
      </button>
      {shown && (
        <div id={body} className="a-wait-body">
          {open.map(h => (
            <HoldForm key={h.id} h={h} />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Requests ─────────────────────────────────────────────────────────────

function Composer() {
  const researchers = useFeed(w => w.researchers)
  const grants = useFeed(w => w.grants) // previews change when a grant freezes or thaws
  useFeed(w => w.today)
  const preset0 = useUi(s => s.composeFor)
  const [pickIx, setPick] = useState(() => Math.max(0, PRESETS.findIndex(p => p.researcherId === preset0)))
  const [who, setWho] = useState(() => preset0 ?? PRESETS[0].researcherId)
  const head = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    head.current?.focus({ preventScroll: true })
    head.current?.closest('.a-compose')?.scrollIntoView({ block: 'start' })
  }, [])
  const p = PRESETS[pickIx]
  const name = (gid: string) => grants.find(g => g.id === gid)?.name.toLowerCase() ?? 'grant'
  const close = () => ui.set({ composing: false, composeFor: null })
  const send = () => {
    const id = act(() => feed.submit({ ...p, researcherId: who }))
    // The camera follows the request from the person who asked.
    ui.set({ mine: [id, ...ui.get().mine].slice(0, 6), composing: false, composeFor: null, openRequest: id, sheet: false, selected: `r:${who}` })
  }
  return (
    <section
      className="a-compose"
      aria-labelledby="a2-compose-h"
      onKeyDown={e => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        close()
      }}
    >
      <div className="a-compose-head">
        <h3 id="a2-compose-h" ref={head} tabIndex={-1}>
          Send a request
        </h3>
        <button type="button" className="a-iconbtn" aria-label="Close" onClick={close}>
          <IconClose />
        </button>
      </div>
      <p className="a-muted">It runs through the same six spending rules as every other request.</p>
      <fieldset className="a-field">
        <legend className="a-field-label">What to buy</legend>
        <div className="a-presets">
          {PRESETS.map((x, i) => {
            const likely = feed.preview({ ...x, researcherId: who })
            return (
              <label key={x.label} className={`a-preset${i === pickIx ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="a2-preset"
                  checked={i === pickIx}
                  onChange={() => {
                    setPick(i)
                    setWho(x.researcherId)
                  }}
                />
                <ItemIcon kind={kindOf(x.item, x.category)} size={26} />
                <span className="a-preset-name">{x.label}</span>
                <span className="a-preset-meta">
                  <span className="a-num">{usd(x.price)}</span> on the {name(x.grantId)}
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
        <button type="button" className="a-btn a-btn--primary" onClick={send}>
          Send to the purchasing agent
        </button>
        <button type="button" className="a-btn" onClick={close}>
          Cancel
        </button>
      </div>
    </section>
  )
}

function RequestRow({ r, w, mine }: { r: Request; w: World; mine: boolean }) {
  const open = useUi(s => s.openRequest === r.id)
  const lit = useUi(s => s.hovered === r.id || s.hovered === `r:${r.researcherId}`)
  const el = useReveal(r.id)
  const more = useId()
  const who = w.researchers.find(x => x.id === r.researcherId)
  const traveling = w.packets.some(p => p.refId === r.id && (p.kind === 'request' || p.kind === 'verdict'))
  const word = !r.outcome ? (r.verdicts.length ? 'Checking the rules' : 'On its way') : outcomeWord(r)
  const charged = r.chargedGrantId && r.chargedGrantId !== r.grantId ? grantName(w, r.chargedGrantId) : null
  return (
    <li ref={el} className={`a-req${open ? ' is-open' : ''}${lit ? ' is-lit' : ''}`}>
      <button
        type="button"
        className="a-req-btn"
        aria-expanded={open}
        aria-controls={open ? more : undefined}
        onClick={() => {
          ui.set({ openRequest: open ? null : r.id })
          pick(open ? null : `r:${r.researcherId}`)
        }}
        {...linked(r.id)}
      >
        <ItemIcon kind={r.kind} />
        <span className="a-req-item">{r.item}</span>
        <span className="a-req-price a-num">{usd(r.price)}</span>
        <span className="a-req-meta">
          {who ? firstName(who.name) : 'Lab'} · <Tint color={grantTint(w, r.chargedGrantId ?? r.grantId)} />
          {charged ?? grantName(w, r.grantId)}
          {r.revisionOf ? ' · resent, split' : ''}
          {mine && <span className="a-yours"> · yours</span>}
        </span>
        <span className={`a-word a-word--${r.outcome ?? 'pending'}${traveling ? ' is-moving' : ''}`}>{word}</span>
        <span className="a-req-why">{say(r.explanation)}</span>
      </button>
      {open && (
        <div id={more} className="a-req-more">
          {r.purpose && <p className="a-muted">For: {r.purpose}</p>}
          <p className="a-muted">
            Asked {fmtDay(r.day)} on the {grantName(w, r.grantId).toLowerCase()}
            {charged ? `, charged to the ${charged.toLowerCase()}` : ''}
            {r.split.length ? `, split ${r.split.map(s => `${Math.round(s.share * 100)}% ${grantName(w, s.grantId).toLowerCase()}`).join(' and ')}` : ''}.
          </p>
          {r.verdicts.length > 0 ? (
            <ol className="a-checks" aria-label="Rule checks">
              {r.verdicts.map((v, i) => (
                <li key={i} className={v.pass ? 'is-pass' : 'is-fail'}>
                  <span className="a-check-mark" aria-hidden="true">
                    {v.pass ? <IconCheck size={11} /> : <IconCross size={11} />}
                  </span>
                  <span className="a-sr">{v.pass ? 'Passed: ' : 'Failed: '}</span>
                  <span className="a-check-rule">{v.rule}</span>
                  <span className="a-check-detail">
                    {say(v.detail)}
                    {v.auditCase ? ` (${v.auditCase})` : ''}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="a-muted">The rule checks show here once the purchasing agent has it.</p>
          )}
        </div>
      )}
    </li>
  )
}

export function Requests() {
  const w = useFeed(x => x)
  const composing = useUi(s => s.composing)
  const mine = useUi(s => s.mine)
  return (
    <div className="a-requests">
      {composing ? (
        <Composer />
      ) : (
        <button type="button" className="a-btn a-btn--primary a-btn--wide" onClick={() => ui.set({ composing: true, composeFor: null })}>
          <IconPlus size={15} />
          Send a request
        </button>
      )}
      {w.requests.length === 0 ? (
        <p className="a-empty">No requests yet. They land here, newest first, as the lab sends them.</p>
      ) : (
        <ul className="a-reqs" aria-label="Requests, newest first">
          {w.requests.map(r => (
            <RequestRow key={r.id} r={r} w={w} mine={mine.includes(r.id) || (!!r.revisionOf && mine.includes(r.revisionOf))} />
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Activity ─────────────────────────────────────────────────────────────

export function Activity() {
  const log = useFeed(w => w.log)
  if (!log.length) return <p className="a-empty">Nothing has happened yet.</p>
  const rows: ReactNode[] = []
  let day = ''
  for (const r of log.slice(0, 60)) {
    if (r.day !== day) {
      day = r.day
      rows.push(
        <li key={`d-${r.id}`} className="a-log-day">
          {fmtDay(r.day)}
        </li>,
      )
    }
    rows.push(
      <li key={r.id} className={`a-log-row a-log-row--${r.actor}`}>
        <span className="a-log-who">{ACTOR[r.actor]}</span>
        <span className="a-log-why">{say(r.reason)}</span>
      </li>,
    )
  }
  return (
    <ol className="a-log" aria-label="Activity, newest first">
      {rows}
    </ol>
  )
}
