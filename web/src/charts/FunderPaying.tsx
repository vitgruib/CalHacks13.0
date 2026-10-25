// The award is the budget (T119): we treat the whole award as the money the
// lab can spend, and the funder's payments only as a signal of whether it is
// paying on this grant: paying, no payment since a cut, or paying again since
// a date. Real funders pay as costs come in, one budget year at a time; the
// app leaves that out. Shown on each grant's Funds card above the tracker.
import type { Db, Grant } from '../data/types'
import { Badge, money, type Tone } from '../ui'
import './charts.css'

interface Paying { tone: Tone; label: string; note: string }

/** Whether the funder is paying on `g`, read from its status events. */
export function funderPaying(db: Db, g: Grant): Paying {
  const events = db.statusEvents.filter(e => e.grantId === g.id).sort((a, b) => a.day.localeCompare(b.day))
  const cut = events.filter(e => e.kind === 'canceled').at(-1)
  const payments = events.filter(e => e.kind === 'payment_received')
  const last = payments.at(-1)
  const lastNote = last ? `Last payment ${last.day}${last.amount ? `, ${money(last.amount)}` : ''}.` : ''
  if (!cut) return { tone: 'good', label: 'Funder paying', note: last ? lastNote : 'The funder pays as costs come in.' }
  const again = payments.find(e => e.day >= cut.day)
  if (!again) return { tone: 'bad', label: 'No payment since the cut', note: `Canceled ${cut.day}; nothing paid since.` }
  return { tone: 'good', label: `Funder paying again since ${again.day}`, note: lastNote }
}

export default function FunderPaying({ db, g }: { db: Db; g: Grant }) {
  const p = funderPaying(db, g)
  return (
    <p className="rc">
      <span>Budget: the award, <strong>{money(g.awarded)}</strong></span>
      <Badge tone={p.tone}>{p.label}</Badge>
      {p.note && <span className="rc-note">{p.note}</span>}
    </p>
  )
}
