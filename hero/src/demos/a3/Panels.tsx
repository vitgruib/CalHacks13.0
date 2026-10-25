// The sidebar's four sections (Overview, Requests, Decisions, Activity) and
// the detail of whatever is selected. Every row that points at something in
// the scene lights it on hover or focus and selects it on click.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PRESETS, feed, kindOf as kindFor, usd } from '../../feed'
import type { Grant, Hold, LogRow, Request, World } from '../../feed'
import { IconBack, IconCheck, IconChevron, IconCross, IconPlus, ItemIcon, NodeGlyph, TokenIcon } from './icons'
import { act, hoverFromDashboard, openTab, selectNode, ui, useFeed, useUi } from './ui'
import { ACTOR, GRANT_TONE, actionWord, agentNow, daysLeft, firstName, fmtDay, fmtShort, grantName, grantStatus, outcomeText, personName, prose, shortItem } from './words'

const useW = () => useFeed(w => w)

const link = (id: string) => ({
  onMouseEnter: () => hoverFromDashboard(id),
  onMouseLeave: () => hoverFromDashboard(null),
  onFocus: () => hoverFromDashboard(id),
  onBlur: () => hoverFromDashboard(null),
})

/** `is-hot` while the scene (or another row) points at this id; `is-on` while it is selected. */
function useMark(id: string) {
  const hot = useUi(s => s.hovered === id)
  const on = useUi(s => s.selected === id)
  return `${hot ? ' is-hot' : ''}${on ? ' is-on' : ''}`
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="a-sec">
      <h2 className="a-sec-title">{title}</h2>
      {note && <p className="a-sec-note">{note}</p>}
      {children}
    </section>
  )
}

/** A section that starts closed, so the overview stays short. */
function Fold({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = `a-fold-${title.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <section className="a-sec a-fold">
      <h2 className="a-sec-title">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
          <span>{title}</span>
          <span className="a-fold-n">{count}</span>
          <IconChevron />
        </button>
      </h2>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </section>
  )
}

const outcomeTone = (r: Request) => r.outcome ?? 'pending'

// ── Overview ───────────────────────────────────────────────────────────────

function Now() {
  const w = useW()
  const mine = useUi(s => s.mine)
  const beat = w.beat
  const id = mine[0]
  const r = id ? (w.requests.find(q => q.revisionOf === id) ?? w.requests.find(q => q.id === id)) : undefined
  return (
    <section className="a-now" aria-live="polite">
      {beat && (
        <div key={beat.id}>
          <h2 className="a-now-title">{beat.title}</h2>
          <p className="a-now-text">{beat.caption}</p>
        </div>
      )}
      {r && (
        <button type="button" className="a-mine" onClick={() => ui.set({ tab: 'requests', selected: null, openRequest: r.id })} {...link(r.id)}>
          <ItemIcon kind={r.kind} size={22} />
          <span>
            Your {shortItem(r.item).toLowerCase()}: <span className={`a-word a-word--${outcomeTone(r)}`}>{outcomeText(r, w).toLowerCase()}</span>
          </span>
        </button>
      )}
    </section>
  )
}

function WaitingRow() {
  const holds = useFeed(w => w.holds)
  const open = holds.filter(h => h.open)
  if (!open.length) return null
  return (
    <button type="button" className="a-waiting" onClick={() => openTab('decisions')}>
      <span className="a-waiting-n a-num">{open.length}</span>
      <span className="a-waiting-text">
        <span className="a-waiting-head">Waiting on you</span>
        <span>{open[0].title}</span>
      </span>
      <span className="a-waiting-go">Decide</span>
    </button>
  )
}

function GrantRow({ g, tone }: { g: Grant; tone: 'a' | 'b' }) {
  const today = useFeed(w => w.today)
  const id = `g:${g.id}`
  const mark = useMark(id)
  const st = grantStatus(g, today)
  const days = daysLeft(today, g.end)
  const pct = (n: number) => `${Math.max(0, (n / g.awarded) * 100).toFixed(2)}%`
  return (
    <li>
      <button type="button" className={`a-grant a-row${mark}${g.frozen ? ' is-frozen' : ''}`} data-tone={tone} onClick={() => selectNode(id)} {...link(id)}>
        <span className="a-grant-head">
          <span className="a-swatch" aria-hidden="true" />
          <span className="a-grant-name">{g.name}</span>
          <span className={`a-state a-state--${st.tone}`}>{st.word}</span>
        </span>
        <span className="a-grant-money">
          <span className="a-big a-num">{usd(g.available)}</span>
          <span className="a-muted">truly available</span>
        </span>
        <span className="a-bar" aria-hidden="true">
          <span className="a-bar-spent" style={{ width: pct(g.spent) }} />
          <span className="a-bar-promised" style={{ width: pct(g.promised) }} />
          <span className="a-bar-free" style={{ width: pct(g.available) }} />
        </span>
        <span className="a-grant-foot">
          <span className="a-num">
            {usd(g.spent)} spent · {usd(g.promised)} promised
          </span>
          <span className="a-num">{days > 0 ? `${days} days left` : 'Ended'}</span>
        </span>
      </button>
    </li>
  )
}

function Grants() {
  const grants = useFeed(w => w.grants)
  return (
    <Section title="Grants">
      <ul className="a-list">
        {grants.map((g, i) => (
          <GrantRow key={g.id} g={g} tone={i === 1 ? 'b' : 'a'} />
        ))}
      </ul>
    </Section>
  )
}

const AGENT_ROWS: [string, string, 'agent' | 'person'][] = [
  ['a:purchasing', 'Purchasing agent', 'agent'],
  ['a:bookkeeping', 'Bookkeeping agent', 'agent'],
  ['a:payment_report', 'Payment & report agent', 'agent'],
  ['p:grant_manager', 'Grant manager (you)', 'person'],
]

function AgentRow({ id, name, kind, w }: { id: string; name: string; kind: 'agent' | 'person'; w: World }) {
  const mark = useMark(id)
  const now = agentNow(w, id)
  return (
    <li>
      <button type="button" className={`a-agent a-row${mark}`} data-state={now.state} onClick={() => selectNode(id)} {...link(id)}>
        <NodeGlyph kind={kind} />
        <span className="a-agent-main">
          <span className="a-agent-head">
            <span className="a-agent-name">{name}</span>
            <span className="a-agent-state">
              <span className="a-dot" aria-hidden="true" />
              {now.word}
            </span>
          </span>
          <span className="a-agent-line">{now.line}</span>
        </span>
      </button>
    </li>
  )
}

function Agents() {
  const w = useW()
  return (
    <Section title="Agents" note="They never message each other. Each one reads and writes the shared record at the centre of the table.">
      <ul className="a-list">
        {AGENT_ROWS.map(([id, name, kind]) => (
          <AgentRow key={id} id={id} name={name} kind={kind} w={w} />
        ))}
      </ul>
    </Section>
  )
}

function NodeRow({ id, glyph, title, line }: { id: string; glyph: 'researcher' | 'source' | 'vendor' | 'person'; title: string; line?: string }) {
  const mark = useMark(id)
  return (
    <li>
      <button type="button" className={`a-node a-row${mark}`} onClick={() => selectNode(id)} {...link(id)}>
        <NodeGlyph kind={glyph} size={18} />
        <span className="a-node-main">
          <span className="a-node-name">{title}</span>
          {line && <span className="a-node-line">{line}</span>}
        </span>
      </button>
    </li>
  )
}

function Lab() {
  const researchers = useFeed(w => w.researchers)
  return (
    <Fold title="The lab" count={researchers.length}>
      <ul className="a-list a-list--tight">
        {researchers.map(r => (
          <NodeRow key={r.id} id={`r:${r.id}`} glyph="researcher" title={`${r.name}, ${r.role.toLowerCase()}`} line={r.task} />
        ))}
      </ul>
    </Fold>
  )
}

function Outside() {
  const nodes = useFeed(w => w.nodes)
  const out = nodes.filter(n => n.side === 'outside')
  return (
    <Fold title="Sources, vendors and the funder" count={out.length}>
      <ul className="a-list a-list--tight">
        {out.map(n => (
          <NodeRow key={n.id} id={n.id} glyph={n.kind === 'vendor' ? 'vendor' : n.kind === 'person' ? 'person' : 'source'} title={n.label} line={n.sub ?? (n.kind === 'source' ? 'A source the bookkeeping agent reads' : undefined)} />
        ))}
      </ul>
    </Fold>
  )
}

export function Overview() {
  return (
    <>
      <Now />
      <WaitingRow />
      <Grants />
      <Agents />
      <Lab />
      <Outside />
    </>
  )
}

// ── Requests ───────────────────────────────────────────────────────────────

const LIKELY = { accept: 'Likely bought', refine: 'Likely rerouted or sent back', reject: 'Likely blocked', hold: 'Likely held' } as const

function Composer() {
  const w = useW()
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
    ui.set({ mine: [id, ...ui.get().mine].slice(0, 6), composing: false, composeFor: null, openRequest: null })
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
      <div className="a-compose-head">
        <h2 className="a-sec-title">Send a request</h2>
        <button type="button" className="a-link" onClick={() => ui.set({ composing: false, composeFor: null })}>
          Cancel
        </button>
      </div>
      <p className="a-sec-note">It runs through the same six spending rules as every other request.</p>
      <fieldset className="a-presets">
        <legend className="a-sr">What to buy</legend>
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
              <ItemIcon kind={kindFor(x.item, x.category)} size={26} />
              <span className="a-preset-main">
                <span className="a-preset-name">{x.label}</span>
                <span className="a-preset-meta">
                  <span className="a-num">{usd(x.price)}</span> on the {grantName(w, x.grantId).toLowerCase()}
                </span>
                <span className={`a-word a-word--${likely}`}>
                  <TokenIcon outcome={likely} size={12} />
                  {LIKELY[likely]}
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>
      <label className="a-field">
        <span className="a-field-label">Who is asking</span>
        <select value={who} onChange={e => setWho(e.target.value)}>
          {w.researchers.map(r => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.role})
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="a-btn a-btn--primary a-btn--wide">
        Send it to the purchasing agent
      </button>
    </form>
  )
}

function Verdicts({ r }: { r: Request }) {
  if (!r.verdicts.length) return <p className="a-muted">The rules run when it reaches the purchasing agent.</p>
  return (
    <ol className="a-checks" aria-label="Rule checks">
      {r.verdicts.map((v, i) => (
        <li key={i} className={v.pass ? 'is-pass' : 'is-fail'}>
          <span className="a-check-mark">{v.pass ? <IconCheck size={12} /> : <IconCross size={12} />}</span>
          <span className="a-check-rule">{v.rule}</span>
          <span className="a-check-detail">
            {prose(v.detail)}
            {v.auditCase ? ` (${v.auditCase})` : ''}
          </span>
        </li>
      ))}
    </ol>
  )
}

function RequestFacts({ r, w }: { r: Request; w: World }) {
  return (
    <p className="a-muted">
      {r.item}. Asked {fmtDay(r.day)} on the {grantName(w, r.grantId).toLowerCase()}
      {r.chargedGrantId ? `, charged to the ${grantName(w, r.chargedGrantId).toLowerCase()}` : ''}
      {r.split.length ? `, split ${r.split.map(s => `${Math.round(s.share * 100)}% ${grantName(w, s.grantId).replace(' grant', '').toLowerCase()}`).join(', ')}` : ''}
      {r.revisionOf ? '. Resent after a fix' : ''}.
    </p>
  )
}

function RequestRow({ r, w, mine }: { r: Request; w: World; mine: boolean }) {
  const open = useUi(s => s.openRequest === r.id)
  const mark = useMark(r.id)
  const panel = `a-req-${r.id}`
  const charged = r.chargedGrantId
  return (
    <li className={`a-req${mark}${mine ? ' is-mine' : ''}`}>
      <button type="button" className="a-row" aria-expanded={open} aria-controls={panel} onClick={() => ui.set({ openRequest: open ? null : r.id })} {...link(r.id)}>
        <span className="a-req-ico">
          <ItemIcon kind={r.kind} size={30} />
          {charged && <span className="a-tag" data-tone={GRANT_TONE(w, charged)} aria-hidden="true" />}
        </span>
        <span className="a-req-main">
          <span className="a-req-top">
            <span className="a-req-item">{shortItem(r.item)}</span>
            <span className="a-num a-req-price">{usd(r.price)}</span>
          </span>
          <span className="a-req-mid">
            <span className="a-req-who">
              {firstName(personName(w, r.researcherId))}
              {mine ? ' · sent by you' : ''}
            </span>
            <span className={`a-word a-word--${outcomeTone(r)}`}>{outcomeText(r, w)}</span>
          </span>
          <span className="a-req-why">{prose(r.explanation)}</span>
        </span>
        <IconChevron />
      </button>
      {open && (
        <div className="a-req-more" id={panel}>
          <RequestFacts r={r} w={w} />
          <Verdicts r={r} />
        </div>
      )}
    </li>
  )
}

export function Requests() {
  const w = useW()
  const composing = useUi(s => s.composing)
  const mine = useUi(s => s.mine)
  const list = w.requests.slice(0, 30)
  return (
    <>
      {composing ? (
        <Composer />
      ) : (
        <button type="button" className="a-btn a-btn--primary a-btn--wide a-btn--icon" onClick={() => ui.set({ composing: true })}>
          <IconPlus />
          Send a request
        </button>
      )}
      <Section title="Every request, newest first">
        {list.length === 0 ? (
          <p className="a-empty">No requests yet this week.</p>
        ) : (
          <ul className="a-reqs">
            {list.map(r => (
              <RequestRow key={r.id} r={r} w={w} mine={mine.includes(r.id) || (!!r.revisionOf && mine.includes(r.revisionOf))} />
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}

// ── Decisions ──────────────────────────────────────────────────────────────

const RAISED: Record<Hold['raisedBy'], string> = { purchasing: 'the purchasing agent', bookkeeping: 'the bookkeeping agent', payment_report: 'the payment & report agent' }

function HoldCard({ h }: { h: Hold }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const decide = (choice: 'approve' | 'reject') => {
    const e = act(() => feed.decide(h.id, choice, reason))
    setErr(e ?? null)
  }
  const fieldId = `a-reason-${h.id}`
  return (
    <article className="a-hold" aria-labelledby={`${fieldId}-t`}>
      <h3 id={`${fieldId}-t`}>{h.title}</h3>
      <p className="a-muted">
        Asked by {RAISED[h.raisedBy]} on {fmtDay(h.day)}
      </p>
      <p className="a-hold-why">{prose(h.why)}</p>
      {h.evidence.length > 0 && (
        <dl className="a-facts">
          {h.evidence.map(ev => (
            <div key={ev.label + ev.value}>
              <dt>{/^\d{4}-\d\d-\d\d$/.test(ev.label) ? fmtDay(ev.label) : ev.label}</dt>
              <dd>{prose(ev.value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <label className="a-field" htmlFor={fieldId}>
        <span className="a-field-label">Your reason (required)</span>
      </label>
      <textarea
        id={fieldId}
        rows={2}
        value={reason}
        placeholder="For example: the quote is on file and it is in the aim 3 budget."
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
          Approve
        </button>
        <button type="button" className="a-btn" onClick={() => decide('reject')}>
          Reject
        </button>
      </div>
    </article>
  )
}

export function Decisions() {
  const holds = useFeed(w => w.holds)
  const open = holds.filter(h => h.open)
  const closed = holds.filter(h => !h.open).slice(0, 5)
  return (
    <>
      <p className="a-sec-note a-lead">You are the grant manager: the only one who approves or rejects. Every decision needs a reason. If you wait, the scripted manager decides after a few seconds.</p>
      {open.length === 0 ? (
        <p className="a-empty">Nothing is waiting. Holds land here when an agent needs a person: over the card limit, a bill that doesn’t match, a paper on the wrong grant.</p>
      ) : (
        <div className="a-holds">
          {open.map(h => (
            <HoldCard key={h.id} h={h} />
          ))}
        </div>
      )}
      {closed.length > 0 && (
        <Section title="Decided">
          <ul className="a-decided">
            {closed.map(h => (
              <li key={h.id}>
                <span className={`a-word a-word--${h.decision?.choice === 'approve' ? 'accept' : 'reject'}`}>{h.decision?.choice === 'approve' ? 'Approved' : 'Rejected'}</span>
                <span className="a-decided-title">{h.title}</span>
                <span className="a-muted">
                  {h.decision?.by === 'viewer' ? 'You' : 'The grant manager'}: {prose(h.decision?.reason ?? '')}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

// ── Activity ───────────────────────────────────────────────────────────────

function LogList({ rows }: { rows: LogRow[] }) {
  return (
    <ol className="a-log">
      {rows.map(r => (
        <li key={r.id} data-actor={r.actor}>
          <span className="a-log-head">
            <span className="a-log-who">{ACTOR[r.actor]}</span>
            <span className="a-log-what">{actionWord(r)}</span>
            <time className="a-log-day" dateTime={r.day}>
              {fmtShort(r.day)}
            </time>
          </span>
          <span className="a-log-why">{prose(r.reason)}</span>
        </li>
      ))}
    </ol>
  )
}

export function Activity() {
  const log = useFeed(w => w.log)
  return log.length === 0 ? <p className="a-empty">Nothing has happened yet.</p> : <LogList rows={log.slice(0, 40)} />
}

// ── Detail of whatever is selected ─────────────────────────────────────────

function DetailShell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const head = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const a = document.activeElement
    if (!a || a === document.body || a.closest('.a-side')) head.current?.focus({ preventScroll: true })
  }, [])
  return (
    <div className="a-detail">
      <button type="button" className="a-link a-back" onClick={() => selectNode(null)}>
        <IconBack />
        Back
      </button>
      <h2 ref={head} tabIndex={-1} className="a-detail-title">
        {title}
      </h2>
      {sub && <p className="a-detail-sub">{sub}</p>}
      {children}
    </div>
  )
}

function ResearcherDetail({ id, w }: { id: string; w: World }) {
  const r = w.researchers.find(x => x.id === id)
  const mine = useUi(s => s.mine)
  if (!r) return null
  const asks = w.requests.filter(q => q.researcherId === id).slice(0, 8)
  return (
    <DetailShell title={r.name} sub={`${r.role} · ${r.station}`}>
      <p className="a-nowline">
        <span className="a-field-label">Right now</span>
        {r.task}
      </p>
      <p className="a-muted">Paid from the {r.grantIds.map(g => grantName(w, g).toLowerCase()).join(' and the ')}.</p>
      <Section title="Requests">
        {asks.length === 0 ? (
          <p className="a-empty">No requests yet.</p>
        ) : (
          <ul className="a-reqs">
            {asks.map(q => (
              <RequestRow key={q.id} r={q} w={w} mine={mine.includes(q.id)} />
            ))}
          </ul>
        )}
      </Section>
      <button type="button" className="a-btn a-btn--wide" onClick={() => ui.set({ composeFor: id, composing: true, tab: 'requests', selected: null })}>
        Send a request as {firstName(r.name)}
      </button>
    </DetailShell>
  )
}

const RULES = [
  'The grant is active and not frozen',
  'Not in the grant’s last 90 days, for supplies',
  'Enough truly available money',
  'The category is allowed',
  'Under the $5,000 card limit',
  'Shared costs split across the grants they serve',
]

function AgentDetail({ id, w }: { id: string; w: World }) {
  const role = id.slice(2)
  const a = w.agents.find(x => x.role === role)
  if (!a) return null
  const now = agentNow(w, id)
  const rows = w.log.filter(l => l.actor === role).slice(0, 8)
  return (
    <DetailShell title={a.name} sub={`Does the job of: ${a.seat}`}>
      <p className="a-nowline" data-state={now.state}>
        <span className="a-field-label">{now.word}</span>
        {now.line}
      </p>
      <p>{a.job}</p>
      {role === 'purchasing' && (
        <Section title="The six spending rules">
          <ol className="a-rule-list">
            {RULES.map(r => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </Section>
      )}
      <Section title="Recent work">{rows.length === 0 ? <p className="a-empty">Nothing yet.</p> : <LogList rows={rows} />}</Section>
    </DetailShell>
  )
}

function GrantDetail({ gid, w }: { gid: string; w: World }) {
  const g = w.grants.find(x => x.id === gid)
  if (!g) return null
  const st = grantStatus(g, w.today)
  const evs = w.statusEvents.filter(e => e.grantId === gid).slice(0, 6)
  const days = daysLeft(w.today, g.end)
  return (
    <DetailShell title={g.name} sub={`${g.title} · ${g.agency}`}>
      <p className={`a-state a-state--${st.tone} a-state--lg`}>{st.word}</p>
      {g.frozen && g.frozenReason && <p className="a-muted">{prose(g.frozenReason)}</p>}
      <dl className="a-money">
        {(
          [
            ['Awarded', g.awarded],
            ['Received', g.received],
            ['Spent', g.spent],
            ['Promised', g.promised],
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
        Runs {fmtDay(g.start)} to {fmtDay(g.end)}
        {days > 0 ? `, ${days} days left` : ', ended'}. Truly available is awarded minus spent minus promised.
      </p>
      <Section title="Status changes">
        {evs.length === 0 ? (
          <p className="a-empty">No status changes yet.</p>
        ) : (
          <ul className="a-events">
            {evs.map(e => (
              <li key={e.id}>
                <span className="a-muted">
                  {fmtDay(e.day)} · {e.source}
                </span>
                <span>{prose(e.summary)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </DetailShell>
  )
}

function OtherDetail({ id, w }: { id: string; w: World }) {
  const n = w.nodes.find(x => x.id === id)
  if (!n) return null
  const key = n.label.split(' ')[0]
  const rows = w.log.filter(l => l.reason.includes(key)).slice(0, 6)
  return (
    <DetailShell title={n.label} sub={n.sub ?? (id.startsWith('s:') ? 'A source the bookkeeping agent reads' : undefined)}>
      <Section title="In the log">{rows.length === 0 ? <p className="a-empty">Nothing yet.</p> : <LogList rows={rows} />}</Section>
    </DetailShell>
  )
}

function RequestDetail({ r, w }: { r: Request; w: World }) {
  return (
    <DetailShell title={shortItem(r.item)} sub={`${personName(w, r.researcherId)} · ${usd(r.price)}`}>
      <p className={`a-word a-word--${outcomeTone(r)} a-word--lg`}>{outcomeText(r, w)}</p>
      <p>{prose(r.explanation)}</p>
      <RequestFacts r={r} w={w} />
      <Section title="Rule checks">
        <Verdicts r={r} />
      </Section>
    </DetailShell>
  )
}

export function Detail({ id }: { id: string }) {
  const w = useW()
  if (id.startsWith('r:')) return <ResearcherDetail id={id.slice(2)} w={w} />
  if (id.startsWith('a:')) return <AgentDetail id={id} w={w} />
  if (id.startsWith('g:')) return <GrantDetail gid={id.slice(2)} w={w} />
  if (id === 'p:grant_manager')
    return (
      <DetailShell title="Grant manager" sub="The only person who approves. In this demo, that’s you.">
        <Decisions />
      </DetailShell>
    )
  const req = w.requests.find(r => r.id === id)
  if (req) return <RequestDetail r={req} w={w} />
  return <OtherDetail id={id} w={w} />
}

