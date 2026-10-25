// The researcher's side of Invoice: submit an invoice, see where each one is,
// who has to review it, and what you need to do next.
import { useState } from 'react'
import type { Db } from '../data/types'
import { grantHeading } from '../plain'
import { Badge, Empty, money } from '../ui'
import { AuditTrail, FindingList, StatusBadge } from './Findings'
import { check, parseAmount, type Draft, type Submission } from './model'
import SubmitForm from './SubmitForm'
import { newSubmissionId, saveSubmission, useSubmissions } from './store'

const draftOf = (s: Submission): Draft => ({ vendor: s.vendor, invoiceNo: s.invoiceNo, invoiceDate: s.invoiceDate, amount: s.amount, lines: s.lines, files: s.files, receiptFiles: s.receiptFiles ?? [], receipt: s.receipt, grantId: s.grantId, poId: s.poId, note: s.note })

const NEXT: Record<Submission['status'], string> = {
  ready: 'The grant office is reviewing it. Nothing for you to do.',
  exception: 'The invoice agent paused payment. The grant office will review it or ask you for something.',
  clarification: 'The grant office asked you a question. Revise and resubmit.',
  escalated: 'It went to a higher approver. Nothing for you to do yet.',
  approved: 'Approved. Payment can go ahead.',
  rejected: 'Rejected. See the reason below; submit a corrected invoice if needed.',
}

export default function Researcher({ db, name }: { db: Db; name: string }) {
  const all = useSubmissions()
  const mine = all.filter(s => s.researcher === name)
  const [form, setForm] = useState<{ edit?: Submission } | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const submit = (d: Draft, r: ReturnType<typeof check>) => {
    const prior = form?.edit
    const flagged = r.findings.filter(f => f.level !== 'ok' && f.area !== 'Authorization').length
    const base: Submission = {
      ...d, poId: r.poId, id: prior?.id ?? newSubmissionId(), researcher: name, submittedOn: db.today, status: r.status, findings: r.findings, effect: r.effect,
      audit: prior?.audit ?? [],
    }
    base.audit = [
      ...base.audit,
      { day: db.today, who: name, what: prior ? 'resubmitted the invoice with changes' : `submitted an invoice from ${d.vendor || 'a vendor'} for ${money(parseAmount(d.amount))}`, why: d.note || undefined },
      { day: db.today, who: 'Invoice agent', what: flagged === 0 ? 'checked the invoice: no problems found. Ready for the grant office.' : `checked the invoice: ${flagged} ${flagged === 1 ? 'thing needs' : 'things need'} review. Payment paused until a decision is recorded.` },
    ]
    saveSubmission(base)
    setForm(null)
    setOpen(base.id)
  }

  if (form) {
    return <SubmitForm db={db} others={all} initial={form.edit ? draftOf(form.edit) : undefined} onSubmit={submit} onCancel={() => setForm(null)} />
  }

  const mineOrders = new Set(db.orders.filter(o => db.requests.find(r => r.id === o.requestId)?.requesterName === name).map(o => o.id))
  const agentBills = db.invoices.filter(i => mineOrders.has(i.orderId))
  const waiting = mine.filter(s => s.status === 'ready' || s.status === 'exception' || s.status === 'escalated').length
  const needsYou = mine.filter(s => s.status === 'clarification').length
  const approved = mine.filter(s => s.status === 'approved').length

  return (
    <div className="iv">
      <p className="iv-lede">Submit an invoice and see where it stands. It is checked against the purchase order and the grant before anyone pays.</p>
      <div className="iv-stats">
        <div><strong>{waiting}</strong><span>Waiting for review</span></div>
        <div className={needsYou ? 'iv-hot' : ''}><strong>{needsYou}</strong><span>Need your action</span></div>
        <div><strong>{approved}</strong><span>Approved</span></div>
      </div>
      <div className="iv-actions"><button type="button" className="primary" onClick={() => setForm({})}>Submit an invoice</button></div>

      <h2 className="iv-h2">Your invoices</h2>
      {mine.length === 0 && agentBills.length === 0 ? <Empty>No invoices yet.</Empty> : (
        <ul className="iv-list">
          {mine.map(s => {
            const g = db.grants.find(x => x.id === s.grantId)
            const decision = [...s.audit].reverse().find(a => a.who === 'Grant manager')
            return (
              <li key={s.id} className="iv-card">
                <header>
                  <strong>{s.vendor || 'Invoice'}</strong>
                  <span className="iv-amt">{money(parseAmount(s.amount))}</span>
                  <StatusBadge status={s.status} />
                </header>
                <p className="iv-note">{g ? grantHeading(g) : s.grantId} · submitted {s.submittedOn}</p>
                <p className="iv-next"><strong>Next:</strong> {NEXT[s.status]}{(s.status === 'clarification' || s.status === 'rejected') && decision?.why && <> “{decision.why}”</>}</p>
                <div className="iv-actions">
                  <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Hide details' : 'Details and history'}</button>
                  {(s.status === 'clarification' || s.status === 'rejected' || s.status === 'exception') && <button type="button" onClick={() => setForm({ edit: s })}>Revise and resubmit</button>}
                </div>
                {open === s.id && (
                  <>
                    <h3 className="iv-h3">What the invoice agent found</h3>
                    <FindingList findings={s.findings} />
                    <h3 className="iv-h3">History</h3>
                    <AuditTrail audit={s.audit} />
                  </>
                )}
              </li>
            )
          })}
          {agentBills.map(i => (
            <li key={i.id} className="iv-card">
              <header>
                <strong>{i.vendor}</strong>
                <span className="iv-amt">{money(i.amount)}</span>
                <Badge tone={i.state === 'held' ? 'bad' : 'good'}>{i.state === 'held' ? 'Held for review' : i.state === 'paid' ? 'Paid' : i.state === 'matched' ? 'Matched, ready to pay' : 'Rejected'}</Badge>
              </header>
              <p className="iv-note">Invoice {i.id} · received {i.received} · checked by the bookkeeping agent</p>
              {i.mismatch && <p className="iv-next"><strong>Why:</strong> {i.mismatch}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
