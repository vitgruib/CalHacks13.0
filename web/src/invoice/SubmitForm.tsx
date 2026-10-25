// The researcher's invoice form: upload (or try the sample), confirm the
// fields, pick the grant and purchase order, submit. A "?" beside each field
// says what it needs. Reading a file is a stand-in: text files are parsed,
// anything else needs the fields typed in.
import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import type { Db } from '../data/types'
import { grantHeading } from '../plain'
import { money } from '../ui'
import { blankDraft, check, purchaseOrders, readInvoiceText, sampleDraft, type Draft, type Submission } from './model'

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
  const [d, setD] = useState<Draft>(initial ?? blankDraft(db.grants[0]?.id ?? ''))
  const set = (patch: Partial<Draft>) => setD(x => ({ ...x, ...patch }))
  const pos = useMemo(() => purchaseOrders(db).filter(p => p.state === 'open' || p.id === d.poId), [db, d.poId])
  const result = useMemo(() => check(d, db, others), [d, db, others])
  const grant = db.grants.find(g => g.id === d.grantId)

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!files.length) return
    const textual = files.find(f => /\.(txt|csv|md)$/i.test(f.name) || f.type.startsWith('text/'))
    const names = files.map(f => f.name)
    set({
      files: [...d.files, ...names],
      receipt: d.receipt || d.files.length + names.length > 1 || files.some(f => /receipt|packing/i.test(f.name)),
      ...(textual ? readInvoiceText(await textual.text()) : {}),
    })
  }

  return (
    <div className="iv-form">
      <div className="iv-bar">
        <h2>{initial ? 'Revise invoice' : 'Submit an invoice'}</h2>
        <button type="button" className="iv-link" onClick={onCancel}>Cancel</button>
      </div>

      <div className="iv-drop">
        <Field label="Invoice and receipt" hint="Upload the vendor invoice and, if you have it, the receipt. Text files are read automatically in this demo; for other files, type the details below.">
          <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.md" onChange={upload} />
        </Field>
        {d.files.map(n => <span key={n} className="iv-chip">{n}<button type="button" aria-label={`Remove ${n}`} onClick={() => set({ files: d.files.filter(x => x !== n) })}>×</button></span>)}
        <button type="button" className="iv-link" onClick={() => setD(sampleDraft())}>Try the sample invoice</button>
      </div>

      <div className="iv-row">
        <Field label="Vendor" hint="Who is billing you, as written on the invoice."><input value={d.vendor} onChange={e => set({ vendor: e.target.value })} /></Field>
        <Field label="Invoice number" hint="The reference number printed on the invoice. It is used to catch duplicates."><input value={d.invoiceNo} onChange={e => set({ invoiceNo: e.target.value })} /></Field>
        <Field label="Date" hint="The date on the invoice."><input type="date" value={d.invoiceDate} onChange={e => set({ invoiceDate: e.target.value })} /></Field>
        <Field label="Total (USD)" hint="The total due. It is compared with the approved purchase order."><input inputMode="decimal" value={d.amount} onChange={e => set({ amount: e.target.value })} /></Field>
      </div>

      <div className="iv-row">
        <Field label="Grant" hint="The grant that should pay. It is checked against the purchase order and the budget." grow>
          <select value={d.grantId} onChange={e => set({ grantId: e.target.value })}>
            {db.grants.map(g => <option key={g.id} value={g.id}>{grantHeading(g)} ({g.id})</option>)}
          </select>
        </Field>
        <Field label="Purchase order" hint="The approved order this bill is for. Leave blank if you don't have one; the grants office will then confirm it was authorized." grow>
          <select value={d.poId} onChange={e => { const po = pos.find(p => p.id === e.target.value); set({ poId: e.target.value, ...(po?.grantId ? { grantId: po.grantId } : {}) }) }}>
            <option value="">None</option>
            {pos.map(p => <option key={p.id} value={p.id}>{p.id}: {p.vendor}, {money(p.amount)}</option>)}
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

      <label className="iv-check">
        <input type="checkbox" checked={d.receipt} onChange={e => set({ receipt: e.target.checked })} /> Receipt attached
        <span className="iv-hint" tabIndex={0} role="img" aria-label="A receipt or packing slip proves the goods or service arrived.">?<span className="iv-tip" role="tooltip">A receipt or packing slip proves the goods or service arrived.</span></span>
      </label>

      {result.effect && grant && (
        <p className="iv-after">After this is paid, <strong>{money(result.effect.after)}</strong> is left on {grant.id}.</p>
      )}

      <div className="iv-actions">
        <button type="button" className="primary" onClick={() => onSubmit(d, result)}>Submit invoice</button>
      </div>
    </div>
  )
}
