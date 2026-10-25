// The grant office's side of Invoice: a review queue where each invoice sits
// beside its purchase order, the grant checks and the budget effect, with
// approve / reject decisions (a reason is required; a rejection's reason is what
// the researcher reads before they edit and resubmit) and a
// full audit trail. The bills the bookkeeping agent already checks are below.
import { useState } from 'react'
import type { Db } from '../data/types'
import { grantHeading } from '../plain'
import { Badge, Empty, money } from '../ui'
import { demoSubmissions } from './demo'
import { AuditTrail, BudgetCard, FindingList, OpenInvoice, StatusBadge } from './Findings'
import { ledgerEntry, parseAmount, purchaseOrders, type Status, type Submission } from './model'
import { useSubmissionActions, useSubmissions } from './store'

type Choice = 'approve' | 'reject'
const OFFICE = 'Grant manager'

const RESULT: Record<Choice, { status: Status; what: string }> = {
  approve: { status: 'approved', what: 'approved the invoice. Payment may proceed; an accounting entry is prepared for posting.' },
  reject: { status: 'rejected', what: 'rejected the invoice.' },
}

function Decision({ s, blocks, today }: { s: Submission; blocks: number; today: string }) {
  const stored = useSubmissions()
  const { record, saveSubmission } = useSubmissionActions()
  const [reason, setReason] = useState('')
  const decided = s.status === 'approved' || s.status === 'rejected'
  if (decided) return null
  const ok = reason.trim().length >= 8
  const go = (c: Choice) => {
    if (!ok) return
    const r = RESULT[c]
    const entry = { day: today, who: OFFICE, what: r.what, why: reason.trim() }
    if (stored.some(x => x.id === s.id)) record(s.id, entry, r.status)
    else saveSubmission({ ...s, status: r.status, audit: [...s.audit, entry] }) // a sample invoice: keep it from now on
    setReason('')
  }
  return (
    <div className="iv-decide">
      <h3 className="iv-h3">Your decision</h3>
      <p className="iv-note">Requested by {s.researcher}; you decide as the grant manager, so the person who submitted it can never approve it. Payment stays paused until a decision is recorded.</p>
      {blocks > 0 && <p className="iv-warnbox">{blocks} open {blocks === 1 ? 'problem' : 'problems'}. Approving needs a reason that explains why it is acceptable, for example an approved revision.</p>}
      <label className="iv-field"><span>Reason (required, goes in the audit trail; on a rejection the researcher sees it and can edit and resubmit)</span><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="iv-actions">
        <button type="button" className="primary" disabled={!ok} onClick={() => go('approve')}>Approve</button>
        <button type="button" disabled={!ok} onClick={() => go('reject')}>Reject</button>
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

type View = 'sent' | 'rejected' | 'approved'
const MIN = 2 // a list is topped up with sample invoices to this many, and shows at most MAX
const MAX = 3

/** The one line that says why an invoice is where it is. */
function why(s: Submission): string {
  const decision = [...s.audit].reverse().find(a => a.who === OFFICE)
  if (decision?.why) return decision.why
  const f = s.findings.find(x => x.level === 'block') ?? s.findings.find(x => x.level === 'warn')
  return f ? f.title : 'Documents and records are consistent.'
}

export default function Office({ db }: { db: Db }) {
  const stored = useSubmissions()
  const [view, setView] = useState<View>('sent')
  const demo = demoSubmissions(db, 'Sofia Alvarez')
  const have = new Set(stored.map(s => s.id))
  const top = (real: number, samples: Submission[]) => samples.filter(s => !have.has(s.id)).slice(0, Math.max(0, MIN - real))

  // Sent: waiting on a decision (new, paused by the invoice agent, or with a higher approver). Rejected:
  // rejected, sent back with a question, or held by the bookkeeping agent; the researcher can revise any of them.
  const sentReal = stored.filter(s => s.status === 'ready' || s.status === 'exception' || s.status === 'escalated')
  const rejectedReal = stored.filter(s => s.status === 'rejected' || s.status === 'clarification')
  const approvedReal = stored.filter(s => s.status === 'approved')
  const bills = (...states: Db['invoices'][number]['state'][]) => db.invoices.filter(i => states.includes(i.state))
  const rejectedBills = bills('held', 'rejected'), approvedBills = bills('matched', 'paid')

  const lists: Record<View, { subs: Submission[]; bills: Db['invoices'] }> = {
    sent: { subs: [...sentReal, ...top(sentReal.length, demo.action.filter(s => s.status === 'exception'))], bills: [] },
    rejected: { subs: [...rejectedReal, ...top(rejectedReal.length + rejectedBills.length, demo.denied)], bills: rejectedBills },
    approved: { subs: [...approvedReal, ...top(approvedReal.length + approvedBills.length, demo.approved)], bills: approvedBills },
  }
  const count = (v: View) => Math.min(MAX, lists[v].subs.length + lists[v].bills.length)

  const row = (s: Submission) => {
    const g = db.grants.find(x => x.id === s.grantId)
    return (
      <li key={s.id} className="iv-card" data-status={s.status}>
        <header>
          <strong>{s.vendor}</strong><span className="iv-amt">{money(parseAmount(s.amount))}</span><StatusBadge status={s.status} />
          <OpenInvoice id={s.id} vendor={s.vendor} />
        </header>
        <p className="iv-note">{s.researcher} · {g ? grantHeading(g) : s.grantId} · submitted {s.submittedOn}</p>
        <p className="iv-next">{why(s)}</p>
      </li>
    )
  }
  const billRow = (i: Db['invoices'][number]) => (
    <li key={i.id} className="iv-card" data-status={i.state === 'held' ? 'exception' : i.state === 'rejected' ? 'rejected' : 'approved'}>
      <header>
        <strong>{i.vendor}</strong><span className="iv-amt">{money(i.amount)}</span>
        <Badge tone={i.state === 'held' || i.state === 'rejected' ? 'bad' : 'good'}>{i.state === 'held' ? 'Held for review' : i.state === 'rejected' ? 'Rejected' : i.state === 'paid' ? 'Paid' : 'Matched, ready to pay'}</Badge>
        <OpenInvoice id={i.id} vendor={i.vendor} />
      </header>
      <p className="iv-note">Bookkeeping agent · received {i.received}</p>
      {i.mismatch && <p className="iv-next">{i.mismatch}</p>}
    </li>
  )

  const tab = (v: View, label: string) => (
    <button type="button" className={`iv-tab${view === v ? ' on' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>
      {label} <span className="iv-count">{count(v)}</span>
    </button>
  )
  const shown = [...lists[view].subs.map(row), ...lists[view].bills.map(billRow)].slice(0, MAX)
  const empty: Record<View, string> = { sent: 'Nothing is waiting for approval.', rejected: 'Nothing rejected.', approved: 'Nothing approved yet.' }

  return (
    <div className="iv">
      <div className="iv-tabs" role="group" aria-label="Invoice requests">
        {tab('sent', 'Waiting for approval')}
        {tab('rejected', 'Rejected')}
        {tab('approved', 'Approved')}
      </div>
      {shown.length === 0 ? <Empty>{empty[view]}</Empty> : <ul className="iv-list">{shown}</ul>}
    </div>
  )
}
