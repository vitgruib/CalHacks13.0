// The researcher's side of Invoice: every approved request, with a button to
// send its invoice; then the invoices sent, rejected for revision, rejected
// and approved, each with what you need to do next.
import { useState } from 'react'
import type { Db } from '../data/types'
import { grantHeading } from '../plain'
import { Badge, Empty, money } from '../ui'
import { OpenInvoice, StatusBadge } from './Findings'
import { check, parseAmount, type Draft, type Submission } from './model'
import { demoSubmissions } from './demo'
import { approvedRequests, draftForRequest, type ApprovedRequest } from './requests'
import SubmitForm from './SubmitForm'
import { newSubmissionId, saveSubmission, useSubmissions } from './store'

const draftOf = (s: Submission): Draft => ({ vendor: s.vendor, invoiceNo: s.invoiceNo, invoiceDate: s.invoiceDate, amount: s.amount, lines: s.lines, files: s.files, receiptFiles: s.receiptFiles ?? [], receipt: s.receipt, grantId: s.grantId, poId: s.poId, note: s.note })

const NEXT: Record<Submission['status'], string> = {
  ready: 'The grant office is reviewing it. Nothing for you to do.',
  exception: 'The invoice agent paused payment. The grant office will review it or ask you for something.',
  clarification: 'The grant office asked you a question. Edit and resubmit.',
  escalated: 'It went to a higher approver. Nothing for you to do yet.',
  approved: 'Approved. Payment can go ahead.',
  rejected: 'Rejected. See the reason below; submit a corrected invoice if needed.',
}

type InvoiceMenu = 'sent' | 'revision' | 'rejected' | 'approved'
type Menu = 'requests' | InvoiceMenu
const MENUS: [InvoiceMenu, string, string][] = [
  ['sent', 'Sent', 'No invoices waiting on a decision.'],
  ['revision', 'Rejected for revision', 'Nothing to revise.'],
  ['rejected', 'Rejected', 'Nothing rejected.'],
  ['approved', 'Approved', 'Nothing approved yet.'],
]

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
  const [form, setForm] = useState<{ edit?: Submission; seed?: Draft; seedKey?: string; title?: string } | null>(null)
  const [view, setView] = useState<Menu | 'submit'>('requests')

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
    setView('sent')
  }

  const mineOrders = new Set(db.orders.filter(o => db.requests.find(r => r.id === o.requestId)?.requesterName === name).map(o => o.id))
  const agentBills = db.invoices.filter(i => mineOrders.has(i.orderId))

  // Sent: waiting on the invoice agent, the grant office or a higher approver. Rejected for revision: the grant
  // office asked a question or a bill was held, so you fix and resubmit. Approved: paid or ready to pay.
  const subs: Record<InvoiceMenu, Submission[]> = {
    sent: mine.filter(s => s.status === 'ready' || s.status === 'exception' || s.status === 'escalated'),
    revision: mine.filter(s => s.status === 'clarification'),
    rejected: mine.filter(s => s.status === 'rejected'),
    approved: mine.filter(s => s.status === 'approved'),
  }
  const bills: Record<InvoiceMenu, Db['invoices']> = {
    sent: [],
    revision: agentBills.filter(i => i.state === 'held'),
    rejected: agentBills.filter(i => i.state === 'rejected'),
    approved: agentBills.filter(i => i.state === 'paid' || i.state === 'matched'),
  }
  // A short list is topped up with sample invoices (up to MIN items) so each menu has something to open.
  const MIN = 2
  const demo = demoSubmissions(db, name)
  const have = new Set(all.map(s => s.id))
  const samples: Record<InvoiceMenu, Submission[]> = {
    sent: [...demo.action.filter(s => s.status !== 'clarification'), ...demo.escalated],
    revision: demo.action.filter(s => s.status === 'clarification'),
    rejected: demo.denied,
    approved: demo.approved,
  }
  const fill = (m: InvoiceMenu) => samples[m].filter(s => !have.has(s.id)).slice(0, Math.max(0, MIN - subs[m].length - bills[m].length))
  const approvedReqs = approvedRequests(db, name, all)

  const card = (s: Submission) => {
    const g = db.grants.find(x => x.id === s.grantId)
    const decision = [...s.audit].reverse().find(a => a.who === 'Grant manager')
    return (
      <li key={s.id} className="iv-card" data-status={s.status}>
        <header>
          <strong>{s.vendor || 'Invoice'}</strong>
          <span className="iv-amt">{money(parseAmount(s.amount))}</span>
          <StatusBadge status={s.status} />
          <OpenInvoice id={s.id} vendor={s.vendor} />
        </header>
        <p className="iv-note">{g ? grantHeading(g) : s.grantId} · submitted {s.submittedOn}</p>
        <p className="iv-next"><strong>Next:</strong> {NEXT[s.status]}{(s.status === 'clarification' || s.status === 'rejected') && decision?.why && <> “{decision.why}”</>}</p>
        {(s.status === 'clarification' || s.status === 'rejected' || s.status === 'exception') && (
          <div className="iv-actions"><button type="button" className="iv-edit" onClick={() => { setForm({ edit: s }); setView('submit') }}>Edit and resubmit</button></div>
        )}
      </li>
    )
  }
  const reqCard = (r: ApprovedRequest) => {
    const g = db.grants.find(x => x.id === r.grantId)
    return (
      <li key={r.orderId} className="iv-card" data-status="approved">
        <header>
          <strong>{r.item}</strong><span className="iv-amt">{money(r.amount)}</span>
          <Badge tone={r.invoice ? 'neutral' : 'good'}>{r.invoice ? 'Invoice sent' : 'Approved'}</Badge>
          {r.invoice && <OpenInvoice id={r.invoice} vendor={r.vendor} />}
        </header>
        <p className="iv-note">{r.vendor} · {g ? grantHeading(g) : r.grantId} · approved {r.approvedOn} by {r.by}</p>
        {!r.invoice && (
          <div className="iv-actions"><button type="button" className="iv-add" onClick={() => { setForm({ seed: draftForRequest(db, r), seedKey: r.orderId, title: `Invoice for ${r.item}` }); setView('submit') }}>Submit invoice</button></div>
        )}
      </li>
    )
  }
  const bill = (i: Db['invoices'][number]) => (
    <li key={i.id} className="iv-card" data-status={i.state === 'held' ? 'exception' : 'approved'}>
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
          <button type="button" className="iv-edit" onClick={() => { setForm({ seed: draftFromBill(db, i), seedKey: i.id }); setView('submit') }}>Edit and resubmit</button>
        </div>
      )}
    </li>
  )

  const tab = (v: Menu, label: string, n: number) => (
    <button type="button" className={`iv-tab${view === v ? ' on' : ''}`} aria-pressed={view === v} onClick={() => { setForm(null); setView(v) }}>
      {label} <span className="iv-count">{n}</span>
    </button>
  )
  return (
    <div className="iv">
      <div className="iv-intro">
        <h1>Invoices</h1>
        <p className="iv-lede">Send the invoice for anything you were approved to buy, then follow it until it's paid.</p>
      </div>
      <div className="iv-tabs" role="group" aria-label="Invoices">
        {tab('requests', 'Approved requests', approvedReqs.length)}
        {MENUS.map(([m, label]) => tab(m, label, subs[m].length + bills[m].length + fill(m).length))}
      </div>

      {view === 'submit' && <SubmitForm key={form?.edit?.id ?? form?.seedKey ?? 'new'} db={db} others={all} initial={form?.edit ? draftOf(form.edit) : form?.seed} title={form?.title} onSubmit={submit} onCancel={() => { setForm(null); setView('requests') }} />}
      {view === 'requests' && (
        <>
          {approvedReqs.length === 0 ? <Empty>You have no approved requests yet.</Empty> : <ul className="iv-list">{approvedReqs.map(reqCard)}</ul>}
          <p className="iv-other">Something that wasn't a request?{' '}
            <button type="button" className="iv-link" onClick={() => { setForm({}); setView('submit') }}>Invoice an unexpected expense or overhead</button>
          </p>
        </>
      )}
      {MENUS.map(([m, , empty]) => view === m && (
        subs[m].length + bills[m].length + fill(m).length === 0
          ? <Empty key={m}>{empty}</Empty>
          : <ul key={m} className="iv-list">{[...subs[m].map(card), ...bills[m].map(bill), ...fill(m).map(card)]}</ul>
      ))}
    </div>
  )
}
