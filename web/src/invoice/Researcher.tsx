// The researcher's side of Invoice: submit an invoice, see where each one is,
// who has to review it, and what you need to do next.
import { useState } from 'react'
import type { Db } from '../data/types'
import { grantHeading } from '../plain'
import { Badge, Empty, money } from '../ui'
import { AuditTrail, FindingList, OpenInvoice, StatusBadge } from './Findings'
import { check, parseAmount, type Draft, type Submission } from './model'
import { demoSubmissions } from './demo'
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

/** A held bill as a draft: the researcher corrects the amount or adds the missing proof and sends it for review. */
function draftFromBill(db: Db, i: Db['invoices'][number]): Draft {
  const order = db.orders.find(o => o.id === i.orderId)
  const req = order && db.requests.find(r => r.id === order.requestId)
  return {
    vendor: i.vendor, invoiceNo: '', invoiceDate: i.received, amount: String(i.amount),
    lines: [{ description: req?.item ?? 'Invoice total', amount: String(i.amount) }],
    files: [`${i.id}.pdf`], receiptFiles: [], receipt: false,
    grantId: req?.chargedGrantId ?? req?.grantId ?? db.grants[0]?.id ?? '', poId: '',
    note: `Responding to the held bill ${i.id}: ${i.mismatch ?? 'please review.'}`,
  }
}

export default function Researcher({ db, name }: { db: Db; name: string }) {
  const all = useSubmissions()
  const mine = all.filter(s => s.researcher === name)
  const [form, setForm] = useState<{ edit?: Submission; seed?: Draft; seedKey?: string } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [view, setView] = useState<'approved' | 'action' | 'submit' | null>(null)

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
    setView('action')
  }

  const mineOrders = new Set(db.orders.filter(o => db.requests.find(r => r.id === o.requestId)?.requesterName === name).map(o => o.id))
  const agentBills = db.invoices.filter(i => mineOrders.has(i.orderId))

  // Approved: approved submissions and bills paid or ready to pay. Need your action: anything you can fix,
  // plus bills on hold. What only waits on the grants office is listed under that heading in the same view.
  const approvedSubs = mine.filter(s => s.status === 'approved')
  const approvedBills = agentBills.filter(i => i.state === 'paid' || i.state === 'matched')
  const actionSubs = mine.filter(s => s.status === 'exception' || s.status === 'clarification' || s.status === 'rejected')
  const actionBills = agentBills.filter(i => i.state === 'held')
  const waitingSubs = mine.filter(s => s.status === 'ready' || s.status === 'escalated')
  // A short list is topped up with sample invoices (up to MIN items) so each button has something to open.
  const MIN = 2
  const demo = demoSubmissions(db, name)
  const have = new Set(all.map(s => s.id))
  const fill = (real: number, samples: Submission[]) => samples.filter(s => !have.has(s.id)).slice(0, Math.max(0, MIN - real))
  const approvedDemo = fill(approvedSubs.length + approvedBills.length, demo.approved)
  const actionDemo = fill(actionSubs.length + actionBills.length + waitingSubs.length, demo.action)
  const MAX = 3 // each list shows at most this many, so the demo stays easy to read
  const nApproved = Math.min(MAX, approvedSubs.length + approvedBills.length + approvedDemo.length)
  const nAction = Math.min(MAX, actionSubs.length + actionBills.length + actionDemo.length) + waitingSubs.length

  const card = (s: Submission) => {
    const g = db.grants.find(x => x.id === s.grantId)
    const decision = [...s.audit].reverse().find(a => a.who === 'Grant manager')
    return (
      <li key={s.id} className="iv-card">
        <header>
          <strong>{s.vendor || 'Invoice'}</strong>
          <span className="iv-amt">{money(parseAmount(s.amount))}</span>
          <StatusBadge status={s.status} />
          <OpenInvoice id={s.id} vendor={s.vendor} />
        </header>
        <p className="iv-note">{g ? grantHeading(g) : s.grantId} · submitted {s.submittedOn}</p>
        <p className="iv-next"><strong>Next:</strong> {NEXT[s.status]}{(s.status === 'clarification' || s.status === 'rejected') && decision?.why && <> “{decision.why}”</>}</p>
        <div className="iv-actions">
          <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Hide details' : 'Details and history'}</button>
          {(s.status === 'clarification' || s.status === 'rejected' || s.status === 'exception') && <button type="button" onClick={() => { setForm({ edit: s }); setView('submit') }}>Revise and resubmit</button>}
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
  }
  const bill = (i: Db['invoices'][number]) => (
    <li key={i.id} className="iv-card">
      <header>
        <strong>{i.vendor}</strong>
        <span className="iv-amt">{money(i.amount)}</span>
        <Badge tone={i.state === 'held' ? 'bad' : 'good'}>{i.state === 'held' ? 'Held for review' : i.state === 'paid' ? 'Paid' : i.state === 'matched' ? 'Matched, ready to pay' : 'Rejected'}</Badge>
        <OpenInvoice id={i.id} vendor={i.vendor} />
      </header>
      <p className="iv-note">Received {i.received}</p>
      {i.mismatch && <p className="iv-next"><strong>Why:</strong> {i.mismatch}</p>}
      {i.state === 'held' && (
        <div className="iv-actions">
          <button type="button" className="primary" onClick={() => { setForm({ seed: draftFromBill(db, i), seedKey: i.id }); setView('submit') }}>Fix and resubmit</button>
        </div>
      )}
    </li>
  )

  const pick = (v: 'approved' | 'action') => { setForm(null); setView(x => (x === v ? null : v)) }
  return (
    <div className="iv">
      <div className="iv-tabs" role="group" aria-label="Invoices">
        <button type="button" className={`iv-tab iv-tab-blue${view === 'submit' ? ' on' : ''}`} aria-pressed={view === 'submit'} onClick={() => { setForm({}); setView(v => (v === 'submit' ? null : 'submit')) }}>Submit an invoice</button>
        <button type="button" className={`iv-tab iv-tab-orange${view === 'action' ? ' on' : ''}`} aria-pressed={view === 'action'} onClick={() => pick('action')}>
          Need your action <span className="iv-count">{nAction}</span>
        </button>
        <button type="button" className={`iv-tab iv-tab-green${view === 'approved' ? ' on' : ''}`} aria-pressed={view === 'approved'} onClick={() => pick('approved')}>
          Approved <span className="iv-count">{nApproved}</span>
        </button>
      </div>

      {view === 'submit' && <SubmitForm key={form?.edit?.id ?? form?.seedKey ?? 'new'} db={db} others={all} initial={form?.edit ? draftOf(form.edit) : form?.seed} onSubmit={submit} onCancel={() => { setForm(null); setView(null) }} />}
      {view === 'approved' && (nApproved === 0 ? <Empty>Nothing approved yet.</Empty> : <ul className="iv-list">{[...approvedSubs.map(card), ...approvedBills.map(bill), ...approvedDemo.map(card)].slice(0, MAX)}</ul>)}
      {view === 'action' && (nAction === 0 ? <Empty>Nothing needs your action.</Empty> : (
        <>
          <ul className="iv-list">{[...actionSubs.map(card), ...actionBills.map(bill), ...actionDemo.map(card)].slice(0, MAX)}</ul>
          {waitingSubs.length > 0 && <><h2 className="iv-h2">With the grants office</h2><ul className="iv-list">{waitingSubs.map(card)}</ul></>}
        </>
      ))}
    </div>
  )
}
