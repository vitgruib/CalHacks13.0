// The grant office's side of Invoice: a review queue where each invoice sits
// beside its purchase order, the grant checks and the budget effect, with
// approve / reject / ask / escalate decisions (a reason is required) and a
// full audit trail. The bills the bookkeeping agent already checks are below.
import { useState } from 'react'
import type { Db } from '../data/types'
import { grantHeading } from '../plain'
import Bills from '../windows/Invoices'
import { Empty, money } from '../ui'
import { AuditTrail, BudgetCard, FindingList, StatusBadge } from './Findings'
import { ledgerEntry, parseAmount, purchaseOrders, type Status, type Submission } from './model'
import { record, useSubmissions } from './store'

type Choice = 'approve' | 'reject' | 'clarify' | 'escalate'
const OFFICE = 'Grant manager'

const RESULT: Record<Choice, { status: Status; what: string }> = {
  approve: { status: 'approved', what: 'approved the invoice. Payment may proceed; an accounting entry is prepared for posting.' },
  reject: { status: 'rejected', what: 'rejected the invoice.' },
  clarify: { status: 'clarification', what: 'asked the researcher for clarification.' },
  escalate: { status: 'escalated', what: 'escalated the invoice' },
}

function Decision({ s, blocks, today }: { s: Submission; blocks: number; today: string }) {
  const [reason, setReason] = useState('')
  const [to, setTo] = useState('Principal investigator')
  const decided = s.status === 'approved' || s.status === 'rejected'
  if (decided) return null
  const ok = reason.trim().length >= 8
  const go = (c: Choice) => {
    if (!ok) return
    const r = RESULT[c]
    record(s.id, { day: today, who: OFFICE, what: c === 'escalate' ? `${r.what} to the ${to.toLowerCase()}.` : r.what, why: reason.trim() }, r.status)
    setReason('')
  }
  return (
    <div className="iv-decide">
      <h3 className="iv-h3">Your decision</h3>
      <p className="iv-note">Requested by {s.researcher}; you decide as the grant manager, so the person who submitted it can never approve it. Payment stays paused until a decision is recorded.</p>
      {blocks > 0 && <p className="iv-warnbox">{blocks} open {blocks === 1 ? 'problem' : 'problems'}. Approving needs a reason that explains why it is acceptable, for example an approved revision.</p>}
      <label className="iv-field"><span>Reason (required, goes in the audit trail)</span><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="iv-actions">
        <button type="button" className="primary" disabled={!ok} onClick={() => go('approve')}>Approve</button>
        <button type="button" disabled={!ok} onClick={() => go('clarify')}>Request clarification</button>
        <button type="button" disabled={!ok} onClick={() => go('reject')}>Reject</button>
        <span className="iv-esc">
          <select value={to} onChange={e => setTo(e.target.value)} aria-label="Escalate to">
            <option>Principal investigator</option><option>Sponsor (funding agency)</option><option>Institutional finance office</option>
          </select>
          <button type="button" disabled={!ok} onClick={() => go('escalate')}>Escalate</button>
        </span>
        {!ok && <span className="iv-note">Type a reason to enable the buttons.</span>}
      </div>
    </div>
  )
}

export function Review({ db, s, decide = true }: { db: Db; s: Submission; decide?: boolean }) {
  const g = db.grants.find(x => x.id === s.grantId)
  const po = purchaseOrders(db).find(p => p.id === s.poId)
  const blocks = s.findings.filter(f => f.level === 'block').length
  const amt = parseAmount(s.amount)
  return (
    <div className="iv-review">
      <div className="iv-sbs">
        <div className="iv-panel">
          <h3 className="iv-h3">Invoice</h3>
          <dl className="iv-facts">
            <dt>Vendor</dt><dd>{s.vendor}</dd><dt>Date</dt><dd>{s.invoiceDate}</dd>
            <dt>Total</dt><dd><strong>{money(amt)}</strong></dd><dt>Files</dt><dd>{[...s.files, ...(s.receiptFiles ?? [])].join(', ') || 'none'}{!s.receipt && ' (no receipt)'}</dd>
          </dl>
          <ul className="iv-lines">{s.lines.filter(l => l.description || l.amount).map((l, i) => <li key={i}><span>{l.description}</span><span>{money(parseAmount(l.amount))}</span></li>)}</ul>
        </div>
        <div className="iv-panel">
          <h3 className="iv-h3">Purchase order</h3>
          {po ? (
            <dl className="iv-facts">
              <dt>Order</dt><dd>{po.id}{po.demo && ' (demo order)'}</dd><dt>Vendor</dt><dd>{po.vendor}</dd><dt>Item</dt><dd>{po.item}</dd>
              <dt>Approved</dt><dd><strong>{money(po.amount)}</strong> on {po.approvedOn}</dd><dt>Asked by</dt><dd>{po.by}</dd><dt>Grant</dt><dd>{po.grantId}</dd>
              <dt>Difference</dt><dd className={amt > po.amount ? 'iv-neg' : ''}>{amt === po.amount ? 'None' : `${amt > po.amount ? '+' : '−'} ${money(Math.abs(amt - po.amount))}`}</dd>
            </dl>
          ) : <p className="iv-note">No purchase order was chosen for this invoice.</p>}
        </div>
      </div>
      {g && s.effect && <><h3 className="iv-h3">Budget effect on {grantHeading(g)}</h3><BudgetCard effect={s.effect} grantLabel={g.id} /></>}
      <h3 className="iv-h3">What the invoice agent found</h3>
      <FindingList findings={s.findings} />
      {decide && <Decision s={s} blocks={blocks} today={db.today} />}
      {s.status === 'approved' && (
        <>
          <h3 className="iv-h3">Accounting entry (prepared, not posted)</h3>
          <table className="iv-table">
            <thead><tr><th>Account</th><th className="iv-num">Debit</th><th className="iv-num">Credit</th></tr></thead>
            <tbody>{ledgerEntry(s).map(l => <tr key={l.account}><td>{l.account}</td><td className="iv-num">{l.debit ? money(l.debit) : ''}</td><td className="iv-num">{l.credit ? money(l.credit) : ''}</td></tr>)}</tbody>
          </table>
          <p className="iv-note">Posting to the ledger needs an authorized person and a connected accounting system; neither is part of this demo.</p>
        </>
      )}
      <h3 className="iv-h3">Audit trail</h3>
      <AuditTrail audit={s.audit} />
    </div>
  )
}

const order: Status[] = ['exception', 'ready', 'escalated', 'clarification', 'approved', 'rejected']

export default function Office({ db }: { db: Db }) {
  const subs = [...useSubmissions()].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
  const [open, setOpen] = useState<string | null>(null)
  const count = (...st: Status[]) => subs.filter(s => st.includes(s.status)).length
  return (
    <div className="iv">
      <p className="iv-lede">Invoices researchers submitted, each checked against its purchase order and the grant. Exceptions pause payment until you record a decision.</p>
      <div className="iv-stats">
        <div className={count('exception') ? 'iv-hot' : ''}><strong>{count('exception')}</strong><span>Exceptions</span></div>
        <div><strong>{count('ready')}</strong><span>Ready for review</span></div>
        <div><strong>{count('clarification', 'escalated')}</strong><span>Waiting on others</span></div>
        <div><strong>{count('approved')}</strong><span>Approved</span></div>
      </div>
      <h2 className="iv-h2">Review queue</h2>
      {subs.length === 0 ? <Empty>No submitted invoices yet. When a researcher submits one it appears here.</Empty> : (
        <ul className="iv-list">
          {subs.map(s => (
            <li key={s.id} className="iv-card">
              <header>
                <strong>{s.vendor}</strong><span className="iv-amt">{money(parseAmount(s.amount))}</span><StatusBadge status={s.status} />
                <a className="iv-go" href={`#invoices/${s.id}`} aria-label={`Open the full invoice from ${s.vendor}`} title="Open the full invoice">→</a>
              </header>
              <p className="iv-note">{s.researcher} · {s.grantId}{s.poId && ` · ${s.poId}`} · submitted {s.submittedOn}{s.findings.some(f => f.level === 'block') && ` · ${s.findings.filter(f => f.level === 'block').length} problems`}</p>
              <div className="iv-actions"><button type="button" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Close review' : 'Review'}</button></div>
              {open === s.id && <Review db={db} s={s} />}
            </li>
          ))}
        </ul>
      )}
      <h2 className="iv-h2">Bills the bookkeeping agent checked</h2>
      <Bills />
    </div>
  )
}
