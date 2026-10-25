// The researcher's invoice form: upload (or try the sample), confirm the
// fields, pick the grant and purchase order, submit. A "?" beside each field
// says what it needs. Reading a file is a stand-in: text files are parsed,
// anything else needs the fields typed in.
import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import type { Db } from '../data/types'
import { grantHeading } from '../plain'
import { money } from '../ui'
import { check, sampleDraft, type Draft, type Submission } from './model'

/** A field label with a "?" that explains what to enter. */
function Field({ label, hint, grow, children }: { label: string; hint: string; grow?: boolean; children: ReactNode }) {
  return (
    <label className={`iv-field${grow ? ' iv-grow' : ''}`}>
      <span className="iv-label">{label}<span className="iv-hint" tabIndex={0} role="img" aria-label={hint}>?<span className="iv-tip" role="tooltip">{hint}</span></span></span>
      {children}
    </label>
  )
}

export default function SubmitForm({ db, others, initial, onSubmit, onCancel }: {
  db: Db; others: Submission[]; initial?: Draft; onSubmit: (d: Draft, r: ReturnType<typeof check>) => void; onCancel: () => void
}) {
  const [d, setD] = useState<Draft>(initial ?? sampleDraft())
  const set = (patch: Partial<Draft>) => setD(x => ({ ...x, ...patch }))
  const result = useMemo(() => check(d, db, others), [d, db, others])
  const grant = db.grants.find(g => g.id === d.grantId)

  const addReceipt = (e: ChangeEvent<HTMLInputElement>) => {
    const names = [...(e.target.files ?? [])].map(f => f.name)
    e.target.value = ''
    if (names.length) set({ receiptFiles: [...d.receiptFiles, ...names], receipt: true })
  }
  const removeReceipt = (n: string) => { const left = d.receiptFiles.filter(x => x !== n); set({ receiptFiles: left, receipt: left.length > 0 }) }

  return (
    <div className="iv-form">
      <div className="iv-bar">
        <h2>{initial ? 'Revise invoice' : 'Invoice for unexpected expenses or overhead'}</h2>
        <button type="button" className="iv-link" onClick={onCancel}>Cancel</button>
      </div>

      <div className="iv-row">
        <Field label="Vendor" hint="Who is billing you, as written on the invoice."><input value={d.vendor} onChange={e => set({ vendor: e.target.value })} /></Field>
        <Field label="Date" hint="The date on the invoice."><input type="date" value={d.invoiceDate} onChange={e => set({ invoiceDate: e.target.value })} /></Field>
        <Field label="Total (USD)" hint="The total due. It is compared with the approved purchase order."><input inputMode="decimal" value={d.amount} onChange={e => set({ amount: e.target.value })} /></Field>
      </div>

      <div className="iv-row">
        <Field label="Grant" hint="The grant that should pay. We find the matching purchase order and check it against the budget." grow>
          <select value={d.grantId} onChange={e => set({ grantId: e.target.value })}>
            {db.grants.map(g => <option key={g.id} value={g.id}>{grantHeading(g)} ({g.id})</option>)}
          </select>
        </Field>
      </div>

      <div className="iv-field">
        <span className="iv-label">Line items<span className="iv-hint" tabIndex={0} role="img" aria-label="What was bought. The lines should add up to the total.">?<span className="iv-tip" role="tooltip">What was bought. The lines should add up to the total.</span></span></span>
        {d.lines.map((l, i) => (
          <div key={i} className="iv-row iv-line">
            <input aria-label="Description" placeholder="Description" className="iv-grow" value={l.description} onChange={e => set({ lines: d.lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
            <input aria-label="Amount" placeholder="Amount" inputMode="decimal" value={l.amount} onChange={e => set({ lines: d.lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} />
          </div>
        ))}
        <button type="button" className="iv-link" onClick={() => set({ lines: [...d.lines, { description: '', amount: '' }] })}>+ Add a line</button>
      </div>

      <div className="iv-field">
        <span className="iv-label">Receipt / proof of purchase <span className="iv-req">required</span><span className="iv-hint" tabIndex={0} role="img" aria-label="A receipt, packing slip or delivery note that proves the goods or service arrived. It is required before you can submit.">?<span className="iv-tip" role="tooltip">A receipt, packing slip or delivery note that proves the goods or service arrived. It is required before you can submit.</span></span></span>
        <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt" onChange={addReceipt} />
        {d.receiptFiles.map(n => <span key={n} className="iv-chip">{n}<button type="button" aria-label={`Remove ${n}`} onClick={() => removeReceipt(n)}>×</button></span>)}
      </div>

      {result.effect && grant && (
        <p className="iv-after">After this is paid, <strong>{money(result.effect.after)}</strong> is left of this grant ({Math.round((result.effect.after / (grant.awarded || 1)) * 100)}% of its total budget).</p>
      )}

      <div className="iv-actions">
        <button type="button" className="primary" disabled={!d.receipt} onClick={() => onSubmit(d, result)}>Submit invoice</button>
        {!d.receipt && <span className="iv-note">Add a receipt to submit.</span>}
      </div>
    </div>
  )
}
