// What still holds a frozen grant, read from the data (status events, open
// holds and flags), so the Test lab never says "unfrozen" while it isn't.
import type { Db, Grant } from './data/types'
import { money } from './ui'

export interface FreezeCause {
  kind: 'payment' | 'source' | 'ended' | 'other'
  text: string
}

/** Why `g` is frozen right now; empty when it isn't. */
export function whyFrozen(db: Db, g: Grant): FreezeCause[] {
  if (!g.frozen) return []
  if (g.status === 'ended' || db.today > g.end) return [{ kind: 'ended', text: 'the grant has ended' }]
  const out: FreezeCause[] = []

  // A cancellation with no payment (or manager unfreeze) after it.
  const events = db.statusEvents
    .map((e, i) => ({ e, i }))
    .filter(x => x.e.grantId === g.id)
    .sort((a, b) => a.e.day.localeCompare(b.e.day) || a.i - b.i)
    .map(x => x.e.kind)
  const canceledAt = events.lastIndexOf('canceled')
  const after = events.slice(canceledAt + 1)
  const paidUnrestored = canceledAt >= 0 && g.status === 'canceled' && after.includes('payment_received') && !after.includes('unfrozen')
  if (paidUnrestored) {
    out.push({ kind: 'other', text: 'money arrived, but nothing has restored the grant (it may be closeout money); the grant manager decides in the Inbox' })
  } else if (canceledAt >= 0 && !after.some(k => k === 'payment_received' || k === 'unfrozen')) {
    out.push({
      kind: 'payment',
      text: events.slice(canceledAt + 1).includes('court_order')
        ? 'a court order is not cash, and no payment has arrived since the cancellation'
        : 'no payment has arrived since the cancellation',
    })
  }

  const holds = db.holds.filter(h => h.grantId === g.id && h.kind === 'source_disagreement' && !h.decision)
  for (const h of holds) out.push({ kind: 'source', text: `pick a source in the Inbox (${h.title})` })
  if (holds.length === 0 && db.flags.some(f => f.grantId === g.id && f.open && f.kind === 'sources_disagree')) {
    out.push({ kind: 'source', text: 'the sources disagree, and the grant manager has to decide' })
  }

  if (out.length === 0) out.push({ kind: 'other', text: g.frozenReason ?? 'no reason recorded' })
  return out
}

const list = (c: FreezeCause[]) => c.map(x => x.text).join('; ')

/** The next step of the demo story for this grant (MASTER-PLAN §5). */
export function nextStep(db: Db, g: Grant): string {
  if (!g.frozen) return 'Spending is open. Cancel the grant to freeze it.'
  const causes = whyFrozen(db, g)
  const others = causes.filter(c => c.kind !== 'payment')
  if (!causes.some(c => c.kind === 'payment')) return `Frozen: ${list(others)}. A payment won't unfreeze it.`
  const base = g.status === 'restored_by_court'
    ? 'Restored by court but still frozen: a court order is not cash.'
    : g.status === 'canceled'
      ? 'Frozen after a cancellation. A court order will restore the status but not the money.'
      : 'Frozen.'
  if (g.status === 'canceled') return `${base} A payment before then goes to the grant manager: it may be closeout money.${others.length ? ` Also ${list(others)}.` : ''}`
  return others.length ? `${base} A payment alone won't unfreeze it: also ${list(others)}.` : `${base} A payment unfreezes it.`
}

/** What a payment did, read from the state after it landed. */
export function paymentNote(db: Db, grantId: string, amount: number, wasFrozen: boolean): string {
  const g = db.grants.find(x => x.id === grantId)
  const head = `${money(amount)} arrived for ${grantId}.`
  if (!g) return head
  if (!g.frozen) return head + (wasFrozen ? ' Spending is unfrozen.' : ' Spending was already open.')
  return `${head} Still frozen: ${list(whyFrozen(db, g))}.`
}
