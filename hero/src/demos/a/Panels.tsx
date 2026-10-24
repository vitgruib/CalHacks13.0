// One panel at a time on the right (a bottom sheet on a phone): send a
// request, the grant manager's inbox, the scene index, the ledger, or the
// detail of whatever was clicked.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PRESETS, feed, usd } from '../../feed'
import type { Hold, Outcome, Request } from '../../feed'
import { LedgerRows, fmtDay } from './bits'
import { IconClose, TokenIcon, outcomeWord } from './icons'
import { act, selectNode, ui, useFeed, useUi } from './store'

const LIKELY: Record<Outcome, string> = {
  accept: 'Likely bought',
  refine: 'Likely rerouted or sent back',
  reject: 'Likely blocked',
  hold: 'Likely held',
}

function Shell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const head = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    head.current?.focus({ preventScroll: true })
  }, [title])
  return (
    <aside className="a-panel" aria-label={title}>
      <header className="a-panel-head">
        <div>
          <h2 ref={head} tabIndex={-1}>
            {title}
          </h2>
          {sub && <p>{sub}</p>}
        </div>
        <button type="button" className="a-iconbtn" aria-label="Close" onClick={() => selectNode(null)}>
          <IconClose />
        </button>
      </header>
      <div className="a-panel-body">{children}</div>
    </aside>
  )
}

// ── Send a request ───────────────────────────────────────────────────────

function Composer() {
  const researchers = useFeed(w => w.researchers)
  useFeed(w => w.grants) // previews change when a grant freezes or thaws
  useFeed(w => w.today)
  const preset0 = useUi(s => s.composeFor)
  const [pick, setPick] = useState(() => Math.max(0, PRESETS.findIndex(p => p.researcherId === preset0)))
  const [who, setWho] = useState(() => preset0 ?? PRESETS[0].researcherId)
  const p = PRESETS[pick]
  const send = () => {
    const id = act(() => feed.submit({ ...p, researcherId: who }))
    ui.set({ mine: [id, ...ui.get().mine].slice(0, 6), panel: null, selected: null, composeFor: null })
  }
  return (
    <Shell title="Send a request" sub="It runs through the same spending rules as every other request.">
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
                <span className="a-preset-name">{x.label}</span>
                <span className="a-preset-meta">
                  <span className="a-num">{usd(x.price)}</span> on {x.grantId} · {x.category}
                </span>
                <span className={`a-word a-word--${likely}`}>
                  <TokenIcon outcome={likely} size={14} />
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
      <button type="button" className="a-btn a-btn--primary a-btn--wide" onClick={send}>
        Send it to the purchasing agent
      </button>
    </Shell>
  )
}

// ── Grant manager ────────────────────────────────────────────────────────

function HoldCard({ h }: { h: Hold }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const decide = (choice: 'approve' | 'reject') => {
    const e = act(() => feed.decide(h.id, choice, reason))
    setErr(e ?? null)
  }
  const fieldId = `a-reason-${h.id}`
  return (
    <article className="a-hold">
      <h3>{h.title}</h3>
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
      <label className="a-field" htmlFor={fieldId}>
        <span className="a-field-label">Your reason (required)</span>
      </label>
      <textarea id={fieldId} rows={2} value={reason} onChange={e => setReason(e.target.value)} aria-invalid={!!err} aria-describedby={err ? `${fieldId}-err` : undefined} />
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

function Holds() {
  const holds = useFeed(w => w.holds)
  const open = holds.filter(h => h.open)
  const closed = holds.filter(h => !h.open).slice(0, 3)
  return (
    <>
      {open.length === 0 && <p className="a-empty">Nothing is waiting. Holds land here when an agent needs a human: over the card limit, a bill that doesn’t match, a paper on the wrong grant.</p>}
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
                <span>{h.title}</span>
                <span className="a-muted">
                  {h.decision?.by === 'viewer' ? 'You' : 'Grant manager'}: {h.decision?.reason}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function Inbox() {
  return (
    <Shell title="Grant manager" sub="You are the grant manager: the only one who approves, rejects or overrides. Every decision needs a reason.">
      <Holds />
    </Shell>
  )
}

// ── Scene index (keyboard route to every detail) ─────────────────────────

function Index() {
  const nodes = useFeed(w => w.nodes)
  const groups: [string, (id: string) => boolean][] = [
    ['The lab', id => id.startsWith('r:')],
    ['The grant office', id => id.startsWith('a:') || id.startsWith('g:') || id === 'p:grant_manager'],
    ['Outside', id => id.startsWith('s:') || id === 'p:funder' || id === 'v:vendors'],
  ]
  return (
    <Shell title="Everything in the scene" sub="Pick anything to see its detail.">
      {groups.map(([name, test]) => (
        <section key={name} className="a-index">
          <h3 className="a-sub">{name}</h3>
          <ul>
            {nodes
              .filter(n => test(n.id))
              .map(n => (
                <li key={n.id}>
                  <button type="button" onClick={() => selectNode(n.id)}>
                    <span>{n.label}</span>
                    {n.sub && <span className="a-muted">{n.sub}</span>}
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </Shell>
  )
}

// ── Details ──────────────────────────────────────────────────────────────

function RequestRow({ r }: { r: Request }) {
  const open = useUi(s => s.openRequest === r.id)
  return (
    <li className="a-req">
      <button type="button" aria-expanded={open} onClick={() => ui.set({ openRequest: open ? null : r.id })}>
        <TokenIcon outcome={r.outcome} />
        <span className="a-req-item">{r.item}</span>
        <span className="a-num">{usd(r.price)}</span>
        <span className={`a-word a-word--${r.outcome ?? 'pending'}`}>{outcomeWord(r)}</span>
      </button>
      {open && (
        <div className="a-req-why">
          <p>{r.explanation}</p>
          <p className="a-muted">
            Asked {fmtDay(r.day)} on {r.grantId}
            {r.chargedGrantId ? `, charged to ${r.chargedGrantId}` : ''}
            {r.split.length ? `, split ${r.split.map(s => `${Math.round(s.share * 100)}% ${s.grantId}`).join(' / ')}` : ''}
          </p>
          {r.verdicts.length > 0 && (
            <ul className="a-verdicts">
              {r.verdicts.map((v, i) => (
                <li key={i} className={v.pass ? 'is-pass' : 'is-fail'}>
                  <span>{v.rule}</span>
                  <span className="a-muted">
                    {v.detail}
                    {v.auditCase ? ` (${v.auditCase})` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

function ResearcherDetail({ id }: { id: string }) {
  const r = useFeed(w => w.researchers.find(x => x.id === id))
  const requests = useFeed(w => w.requests)
  if (!r) return null
  const mine = requests.filter(q => q.researcherId === id)
  return (
    <Shell title={r.name} sub={`${r.role} · ${r.station}`}>
      <p className="a-now">
        <span className="a-field-label">Right now</span>
        {r.task}
      </p>
      <p className="a-muted">Paid from {r.grantIds.join(' and ')}</p>
      <h3 className="a-sub">Requests</h3>
      {mine.length === 0 ? <p className="a-empty">No requests yet.</p> : <ul className="a-reqs">{mine.map(q => <RequestRow key={q.id} r={q} />)}</ul>}
      <button
        type="button"
        className="a-btn a-btn--wide"
        onClick={() => {
          ui.set({ composeFor: id, panel: 'request', selected: null })
        }}
      >
        Send a request as {r.name.replace('Dr. ', '').split(' ')[0]}
      </button>
    </Shell>
  )
}

function AgentDetail({ role }: { role: string }) {
  const a = useFeed(w => w.agents.find(x => x.role === role))
  const log = useFeed(w => w.log)
  if (!a) return null
  const rows = log.filter(l => l.actor === role).slice(0, 8)
  return (
    <Shell title={a.name} sub={`Does the job of: ${a.seat}`}>
      <p>{a.job}</p>
      {role === 'purchasing' && (
        <p className="a-muted">
          Rules: grant active and not frozen; not in the grant’s last 90 days, for supplies; enough truly available money; category allowed; under the $5,000 card
          limit; shared costs split across the grants they serve.
        </p>
      )}
      <h3 className="a-sub">Recent log</h3>
      {rows.length === 0 ? <p className="a-empty">Nothing yet.</p> : <LedgerRows rows={rows} />}
    </Shell>
  )
}

function GrantDetail({ gid }: { gid: string }) {
  const g = useFeed(w => w.grants.find(x => x.id === gid))
  const events = useFeed(w => w.statusEvents)
  if (!g) return null
  const evs = events.filter(e => e.grantId === gid).slice(0, 6)
  const status = g.frozen ? (g.status === 'restored_by_court' ? 'Restored by court, still frozen' : 'Canceled, spending frozen') : g.status === 'active' ? 'Active' : g.status
  return (
    <Shell title={g.id} sub={`${g.title} · ${g.agency}`}>
      <p className={`a-status${g.frozen ? ' is-frozen' : ''}`}>{status}</p>
      {g.frozenReason && g.frozen && <p className="a-muted">{g.frozenReason}</p>}
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
        Runs {fmtDay(g.start)} to {fmtDay(g.end)}. Truly available is awarded minus spent minus promised.
      </p>
      <h3 className="a-sub">Status events</h3>
      {evs.length === 0 ? (
        <p className="a-empty">No status changes yet.</p>
      ) : (
        <ul className="a-events">
          {evs.map(e => (
            <li key={e.id}>
              <span className="a-muted">
                {fmtDay(e.day)} · {e.source}
              </span>
              <span>{e.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}

function OtherDetail({ id }: { id: string }) {
  const n = useFeed(w => w.nodes.find(x => x.id === id))
  const log = useFeed(w => w.log)
  if (!n) return null
  const rows = log.filter(l => l.reason.includes(n.label.split(' ')[0])).slice(0, 5)
  return (
    <Shell title={n.label} sub={n.sub ?? (id.startsWith('s:') ? 'A source the bookkeeping agent reads' : undefined)}>
      <h3 className="a-sub">Mentioned in the log</h3>
      {rows.length === 0 ? <p className="a-empty">Nothing yet.</p> : <LedgerRows rows={rows} />}
    </Shell>
  )
}

function Detail({ id }: { id: string }) {
  if (id.startsWith('r:')) return <ResearcherDetail id={id.slice(2)} />
  if (id.startsWith('a:')) return <AgentDetail role={id.slice(2)} />
  if (id.startsWith('g:')) return <GrantDetail gid={id.slice(2)} />
  if (id === 'p:grant_manager')
    return (
      <Shell title="Grant manager" sub="The only human who approves. In this demo, that’s you.">
        <Holds />
      </Shell>
    )
  return <OtherDetail id={id} />
}

function LedgerPanel() {
  const log = useFeed(w => w.log)
  return (
    <Shell title="Ledger" sub="Every action, with its actor and its reason.">
      <LedgerRows rows={log.slice(0, 14)} />
    </Shell>
  )
}

export function PanelHost() {
  const panel = useUi(s => s.panel)
  const selected = useUi(s => s.selected)
  if (panel === 'request') return <Composer />
  if (panel === 'inbox') return <Inbox />
  if (panel === 'index') return <Index />
  if (panel === 'ledger') return <LedgerPanel />
  if (panel === 'detail' && selected) return <Detail key={selected} id={selected} />
  return null
}

