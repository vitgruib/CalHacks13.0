// SpendGuard's funding-readiness assessment. Three separate questions, each
// answered on its own, because passing one doesn't pass the others:
//   scientifically aligned?  potentially allowable?  affordable?
// Plain rules over the plan, the award text and the grant's real numbers; no
// model call, so the same plan always gives the same report. Every concern
// cites the award passage it comes from.
import { trulyAvailable, type Grant } from '../data/types'
import { awardFor, MODEL_KINDS, type Passage } from './awards'

export const CATEGORIES = ['Lab supplies & reagents', 'External services', 'Equipment', 'Travel', 'Personnel'] as const
export type Category = (typeof CATEGORIES)[number]

export interface Item {
  id: string
  category: Category
  description: string
  cost: string // USD, as typed
  quote: string // vendor quote or comparable price, USD, as typed; '' = none
  vendor: string
  tripType: 'domestic' | 'international' // travel
  destination: string
  purpose: string
  role: string // personnel
  effort: string // percent of time, as typed
}

export interface Plan {
  experiment: string
  grantId: string
  completion: string // planned completion date, '' = not given
  items: Item[]
  uploaded: { name: string; text: string }[] // award documents the researcher added
}

export type Check = 'yes' | 'clarify' | 'no'
export type Overall = 'aligned' | 'clarify' | 'outside'
export type Who = 'Principal investigator' | 'Grants administrator' | 'Sponsor (funding agency)'

export interface Cited { passage: Passage; note?: string }
export interface LineFeedback {
  itemId: string
  label: string
  cost: number
  allowable: Check
  reasonable: 'ok' | 'needs_quote' | 'mismatch'
  /** What was found, in plain words, most important first. */
  notes: string[]
  missing: string[]
  evidence: Cited[]
}
export interface FollowUp { to: Who; question: string }

export interface Report {
  grantId: string
  today: string
  overall: Overall
  aligned: { check: Check; summary: string; evidence: Cited[] }
  allowable: { check: Check; summary: string }
  affordable: { check: Check; summary: string }
  lines: LineFeedback[]
  budget: { total: number; available: number; remaining: number; verified: boolean; note: string; crossesAt?: string }
  timing: string[]
  followUps: FollowUp[]
}

export const OVERALL_LABEL: Record<Overall, string> = {
  aligned: 'Appears aligned',
  clarify: 'Needs clarification',
  outside: 'Potentially outside scope',
}

const DAY_MS = 86_400_000
const num = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}
export const planTotal = (items: Item[]) => items.reduce((s, i) => s + num(i.cost), 0)
export const blankItem = (category: Category = 'Lab supplies & reagents'): Item => ({
  id: Math.random().toString(36).slice(2, 9), category, description: '', cost: '', quote: '', vendor: '',
  tripType: 'domestic', destination: '', purpose: '', role: '', effort: '',
})

const has = (text: string, words: string[]) => words.some(w => text.includes(w))
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** The sentence of an uploaded document that mentions any of `words`. */
function sentenceWith(text: string, words: string[]): string | undefined {
  return text.split(/(?<=[.!?])\s+|\n+/).find(s => has(s.toLowerCase(), words))?.trim()
}

export function assess(plan: Plan, g: Grant, today: string): Report {
  const award = awardFor(g)
  const byId = (id: string) => award.passages.find(p => p.id === id)!
  const cite = (id: string, note?: string): Cited => ({ passage: byId(id), note })
  const exp = plan.experiment.toLowerCase()
  const followUps: FollowUp[] = []
  const ask = (to: Who, question: string) => { if (!followUps.some(f => f.question === question)) followUps.push({ to, question }) }

  // ── 1. Scientific alignment ────────────────────────────────────────────
  const aimHits = award.aimTerms.filter(t => exp.includes(t))
  const mentioned = Object.keys(MODEL_KINDS).filter(k => has(exp, MODEL_KINDS[k].words))
  const approvedByUpload = new Map<string, Passage>() // a model the researcher's uploaded document describes
  for (const k of mentioned) {
    for (const [i, u] of plan.uploaded.entries()) {
      const s = sentenceWith(u.text, MODEL_KINDS[k].words)
      if (s) { approvedByUpload.set(k, { id: `u-${i}`, ref: `Uploaded: ${u.name}`, text: s.slice(0, 280) }); break }
    }
  }
  const unapproved = mentioned.filter(k => !award.approvedModels[k] && !approvedByUpload.has(k))
  const diseaseNamed = has(exp, award.diseaseTerms)
  const evidence: Cited[] = [cite('a-1'), cite('a-2'), cite('m-models')]
  for (const [k, p] of approvedByUpload) evidence.push({ passage: p, note: `Describes ${MODEL_KINDS[k].label}.` })

  let aligned: Check
  let alignedSummary: string
  if (aimHits.length === 0) {
    aligned = 'no'
    alignedSummary = 'Nothing in the plan clearly connects to the funded aims. It may be a different line of research than this award supports.'
    ask('Principal investigator', 'Which of the award\'s specific aims does this experiment advance?')
    ask('Grants administrator', 'Is work outside the approved aims chargeable to this award, or does it need a different source?')
  } else if (unapproved.length > 0) {
    aligned = 'clarify'
    const names = unapproved.map(k => MODEL_KINDS[k].label).join(' and ')
    alignedSummary = `The experiment appears related to the funded objective, but ${names} ${unapproved.length > 1 ? 'are' : 'is'} not clearly described in the approved plan.${diseaseNamed ? '' : ' The plan also does not say which disease it targets.'} Human review needed.`
    ask('Grants administrator', `Does the approved research plan cover ${names}, or is a plan amendment or prior approval needed?`)
    ask('Principal investigator', 'Which aim does this model serve, and is it a change from the approved plan?')
  } else if (!diseaseNamed) {
    aligned = 'clarify'
    alignedSummary = 'The plan overlaps with the funded aims, but it does not say which disease or target it applies to, so alignment cannot be confirmed.'
    ask('Principal investigator', 'Name the disease or target this experiment addresses, so it can be matched to the aims.')
  } else {
    aligned = 'yes'
    alignedSummary = 'The experiment matches the funded aims and uses models the approved plan describes.'
  }

  // ── 2. Line items: allowability and reasonableness ─────────────────────
  const daysLeft = Math.round((Date.parse(g.end) - Date.parse(today)) / DAY_MS)
  const lines: LineFeedback[] = plan.items.map((it, n) => {
    const cost = num(it.cost)
    const quote = num(it.quote)
    const label = it.description.trim() || `${it.category} (item ${n + 1})`
    const f: LineFeedback = { itemId: it.id, label, cost, allowable: 'yes', reasonable: 'ok', notes: [], missing: [], evidence: [] }
    const worse = (c: Check) => { if (c === 'no' || (c === 'clarify' && f.allowable === 'yes')) f.allowable = c }

    if (cost === 0) { f.missing.push('Add an estimated cost.'); worse('clarify') }

    if (it.category === 'Lab supplies & reagents') {
      f.notes.push('Lab supplies are normally an allowable direct cost.')
      if (daysLeft >= 0 && daysLeft <= 90) {
        f.notes.push(`The award ends in ${daysLeft} days. Supplies bought this close to the end are often refused unless they are needed to finish the funded work.`)
        f.evidence.push(cite('t-end90')); worse('clarify')
        ask('Grants administrator', `This award ends in ${daysLeft} days. Can the supplies for this plan be charged, and what justification is needed?`)
      }
      if (unapproved.length > 0 && has(`${it.description} ${exp}`.toLowerCase(), unapproved.flatMap(k => MODEL_KINDS[k].words))) {
        f.notes.push('These supplies support a model that is not clearly in the approved plan; confirm scope before buying.')
        f.evidence.push(cite('m-models')); worse('clarify')
      }
    } else if (it.category === 'External services') {
      f.notes.push('The service may support the research aim, but confirm that this type of service is allowable under the award.')
      f.evidence.push(cite('t-service')); worse('clarify')
      ask('Grants administrator', `Is "${label}" an allowable external service under this award?`)
      if (cost > 3500 && quote === 0) { f.missing.push('A written quote is required for any single service over $3,500.') }
    } else if (it.category === 'Equipment') {
      f.evidence.push(cite('t-equip'))
      if (cost >= 5000) {
        f.notes.push('Equipment of $5,000 or more needs prior written approval from the agency.')
        worse('clarify'); ask('Sponsor (funding agency)', `Prior approval is needed to buy "${label}" (${money(cost)}).`)
      } else f.notes.push('Under the $5,000 prior-approval threshold.')
    } else if (it.category === 'Travel') {
      f.evidence.push(cite('t-travel'))
      if (!it.destination.trim() || !it.purpose.trim()) { f.missing.push('Add the destination and the purpose of the trip.'); worse('clarify') }
      if (it.tripType === 'international') {
        f.notes.push('International travel requires prior approval.')
        worse('clarify'); ask('Sponsor (funding agency)', `Prior approval is needed for international travel to ${it.destination.trim() || 'the proposed destination'}.`)
      }
      f.notes.push('Confirm the trip presents award-funded work or meets an approved collaborator.')
      ask('Principal investigator', 'Confirm the travel purpose, who is going, and how it relates to the award.')
      worse('clarify')
    } else {
      f.evidence.push(cite('t-people'))
      const effort = num(it.effort)
      if (!it.role.trim() || effort === 0) { f.missing.push('Add the role and the percent of effort on this award.'); worse('clarify') }
      f.notes.push('Confirm the hire\'s responsibilities, effort and cost are consistent with the award terms and institutional pay policy.')
      worse('clarify')
      ask('Grants administrator', `Are the responsibilities, effort and cost for "${label}" consistent with the award terms and pay policy?`)
    }

    // Reasonableness: needs a comparable price; with one, it must be close.
    const needsQuote = (it.category === 'Equipment' && cost > 1000) || (it.category === 'External services' && cost > 3500)
    if (quote > 0 && cost > 0) {
      if (Math.abs(quote - cost) / quote > 0.1) {
        f.reasonable = 'mismatch'
        f.notes.push(`The estimate (${money(cost)}) differs from the quote (${money(quote)}) by more than 10%.`)
        worse('clarify'); ask('Principal investigator', `Reconcile the estimate for "${label}" (${money(cost)}) with the quote (${money(quote)}).`)
      }
    } else if (needsQuote) {
      f.reasonable = 'needs_quote'
      f.missing.push(`Add a vendor quote or comparable price so the grants office can assess whether ${money(cost)} is reasonable.`)
      ask('Principal investigator', `Provide a vendor quote or comparable price for "${label}".`)
    }
    return f
  })

  // ── 3. Timing ──────────────────────────────────────────────────────────
  const timing: string[] = []
  let timingCheck: Check = 'yes'
  if (daysLeft < 0) {
    timing.push(`The award ended on ${g.end}. New costs cannot be charged without an approved extension.`)
    timingCheck = 'no'; ask('Sponsor (funding agency)', 'Has a no-cost extension been approved for this award?')
  } else if (daysLeft <= 90) {
    timing.push(`The award ends on ${g.end} (${daysLeft} days away). Check the performance period and any approvals needed.`)
    timingCheck = 'clarify'
  }
  if (plan.completion && plan.completion > g.end) {
    timing.push(`The plan finishes on ${plan.completion}, after the award ends on ${g.end}. Costs after that date are not chargeable.`)
    timingCheck = 'no'; ask('Sponsor (funding agency)', 'Would a no-cost extension or a different source cover work after the award ends?')
  }

  const lineWorst: Check = lines.some(l => l.allowable === 'no') ? 'no' : lines.some(l => l.allowable === 'clarify') ? 'clarify' : 'yes'
  const allowable: Check = lineWorst === 'no' || timingCheck === 'no' ? 'no' : lineWorst === 'clarify' || timingCheck === 'clarify' ? 'clarify' : 'yes'
  const flagged = lines.filter(l => l.allowable !== 'yes').length
  const allowableSummary = allowable === 'yes'
    ? 'Every item looks like a normal allowable cost for this award.'
    : allowable === 'no'
      ? 'At least one cost or date falls outside what the award allows as planned.'
      : `${flagged} of ${lines.length} planned costs may support the research but need confirmation before they are charged.`

  // ── 4. Budget: the plan as a whole against the balance ────────────────
  const total = planTotal(plan.items)
  const available = trulyAvailable(g)
  const verified = !g.frozen
  let run = 0
  let crossesAt: string | undefined
  for (const l of lines) { run += l.cost; if (!crossesAt && run > available) crossesAt = l.label }
  let affordable: Check
  let affordableSummary: string
  let note: string
  if (g.frozen) {
    affordable = 'clarify'
    affordableSummary = `The plan totals ${money(total)}. This grant is paused until its money arrives, so its balance of ${money(available)} is on paper only and cannot be counted on yet.`
    note = 'The grant\'s spending is paused, so the balance is not confirmed.'
    ask('Grants administrator', 'When is the next payment expected on this grant, and can planned spending start before it arrives?')
  } else if (total > available) {
    affordable = 'no'
    affordableSummary = `The plan totals ${money(total)}, but only ${money(available)} is available (after spending and orders already placed). Together the items go over the balance${crossesAt ? ` at "${crossesAt}"` : ''}.`
    note = `Short by ${money(total - available)}.`
    ask('Principal investigator', `Reduce the plan by ${money(total - available)} or name a second funding source.`)
  } else {
    affordable = 'yes'
    affordableSummary = `The plan totals ${money(total)} and ${money(available)} is available, leaving ${money(available - total)} after it.`
    note = `Available balance per Grant Test Auto's records, after spending and orders already placed.`
  }
  if (total === 0) { affordable = 'clarify'; affordableSummary = 'Add estimated costs to check the plan against the balance.'; note = 'No costs entered yet.' }

  const overall: Overall = aligned === 'no' || allowable === 'no'
    ? 'outside'
    : aligned === 'clarify' || allowable === 'clarify' || affordable !== 'yes' ? 'clarify' : 'aligned'

  return {
    grantId: g.id, today, overall,
    aligned: { check: aligned, summary: alignedSummary, evidence },
    allowable: { check: allowable, summary: allowableSummary },
    affordable: { check: affordable, summary: affordableSummary },
    lines,
    budget: { total, available, remaining: available - total, verified, note, crossesAt },
    timing,
    followUps,
  }
}
