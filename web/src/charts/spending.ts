// Spending pace and runway for one grant, from the records the windows already
// have: payroll rows and bought purchases charged to it. The money bar and the
// runway chart (Funds and My grants) both read from here.
import { trulyAvailable, type Db, type Grant } from '../data/types'

const DAY_MS = 86_400_000
const MONTH_DAYS = 30.44
/** How far back the spending pace looks. */
export const PACE_DAYS = 90

export const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
export const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const monthsBetween = (fromMs: number, untilMs: number) => (untilMs - fromMs) / DAY_MS / MONTH_DAYS
export const addMonths = (ms: number, months: number) => ms + months * MONTH_DAYS * DAY_MS

export interface Spend { day: string; amount: number }

/** Every dollar charged to `g`: payroll (on its period's last day) and bought purchases (its share when split). */
export function spendingRows(db: Db, g: Grant): Spend[] {
  const rows: Spend[] = db.payroll.filter(p => p.grantId === g.id).map(p => ({ day: p.period.to, amount: p.amount }))
  for (const r of db.requests) {
    if (r.state !== 'bought') continue
    if (r.split?.length) {
      const share = r.split.find(s => s.grantId === g.id)?.share ?? 0
      if (share > 0) rows.push({ day: r.day, amount: r.price * share })
    } else if ((r.chargedGrantId ?? r.grantId) === g.id) {
      rows.push({ day: r.day, amount: r.price })
    }
  }
  return rows.filter(r => r.day <= db.today).sort((a, b) => a.day.localeCompare(b.day))
}

export interface Runway {
  awarded: number
  spent: number
  promised: number
  /** Awarded − spent − promised; can go negative. */
  left: number
  /** Share of the award left, 0–1 (0 when overspent). */
  leftShare: number
  /** Dollars a month, over the PACE_DAYS up to `paceAsOf` (the last recorded spending). */
  pace: number
  /** recent = the last PACE_DAYS of records; lifetime = spent ÷ months since start (no recent records). */
  paceBasis: 'recent' | 'lifetime' | 'none'
  paceAsOf: string
  todayMs: number
  startMs: number
  endMs: number
  /** Months from today to the grant's end (0 once ended). */
  monthsToEnd: number
  /** When the money left hits $0 at this pace; undefined when the pace is 0. */
  runOutMs?: number
  /** Money still unspent on the end date at this pace (0 if it runs out first). */
  leftAtEnd: number
  /** Monthly pace that spends exactly down to $0 on the end date. */
  evenPace: number
  /** Money left at each past point, oldest first, ending today at `left`. */
  history: { ms: number; left: number }[]
}

export function runway(db: Db, g: Grant): Runway {
  const todayMs = toMs(db.today)
  const startMs = toMs(g.start)
  const endMs = toMs(g.end)
  const left = trulyAvailable(g)
  const rows = spendingRows(db, g)

  // Pace: the PACE_DAYS up to the last recorded spending, so a stretch where
  // nothing could be spent doesn't read as a slow pace.
  const paceAsOf = rows.at(-1)?.day ?? db.today
  const asOfMs = toMs(paceAsOf)
  const fromMs = Math.max(startMs, asOfMs - PACE_DAYS * DAY_MS)
  const recent = rows.filter(r => toMs(r.day) > fromMs && toMs(r.day) <= asOfMs).reduce((s, r) => s + r.amount, 0)
  const lifetimeMonths = monthsBetween(startMs, asOfMs)
  let pace = 0
  let paceBasis: Runway['paceBasis'] = 'none'
  if (recent > 0 && asOfMs > fromMs) { pace = recent / monthsBetween(fromMs, asOfMs); paceBasis = 'recent' }
  else if (g.spent > 0 && lifetimeMonths > 0) { pace = g.spent / lifetimeMonths; paceBasis = 'lifetime' }

  const monthsToEnd = Math.max(0, monthsBetween(todayMs, endMs))
  const runOutMs = pace > 0 ? addMonths(todayMs, Math.max(0, left) / pace) : undefined
  const leftAtEnd = Math.max(0, left - pace * monthsToEnd)
  const evenPace = monthsToEnd > 0 ? Math.max(0, left) / monthsToEnd : 0

  // History: the records rarely add up to `spent + promised` to the dollar, so
  // scale them to it; the line then starts at the award and ends at `left` today.
  const used = g.awarded - left
  const recorded = rows.reduce((s, r) => s + r.amount, 0)
  const history: Runway['history'] = [{ ms: startMs, left: g.awarded }]
  if (recorded > 0) {
    const k = used / recorded
    let sum = 0
    for (const r of rows) {
      sum += r.amount
      const ms = Math.max(startMs, toMs(r.day))
      const point = { ms, left: g.awarded - sum * k }
      if (history[history.length - 1].ms === ms) history[history.length - 1] = point
      else history.push(point)
    }
  }
  if (history[history.length - 1].ms < todayMs) history.push({ ms: todayMs, left })
  else history[history.length - 1] = { ms: todayMs, left }

  return {
    awarded: g.awarded, spent: g.spent, promised: g.promised, left,
    leftShare: g.awarded > 0 ? Math.min(1, Math.max(0, left / g.awarded)) : 0,
    pace, paceBasis, paceAsOf,
    todayMs, startMs, endMs, monthsToEnd, runOutMs, leftAtEnd, evenPace, history,
  }
}

/** "8 months", "1 year", "1 year 4 months", "2 weeks". */
export function duration(months: number) {
  if (months < 1) {
    const weeks = Math.max(1, Math.round(months * MONTH_DAYS / 7))
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`
  }
  const total = Math.round(months)
  const y = Math.floor(total / 12)
  const m = total % 12
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (!y) return part(m, 'month')
  return m ? `${part(y, 'year')} ${part(m, 'month')}` : part(y, 'year')
}
