// Grant facts in plain words for the researcher's screens (Ask, My grants).
// The spending rules are the module's own (server/src/rules.ts), so what Ask
// tells a researcher matches what the purchasing agent will do.
import { canBuyAlone, daysBetween, spendingVerdicts, trulyAvailable, type Verdict } from '../../server/src/rules'
import { CARD_LIMIT } from '../../server/src/vocab'
import type { Db, Grant } from './data/types'
import { money } from './ui'

export { CARD_LIMIT, trulyAvailable }

/**
 * Plain headings for the demo, so judges aren't put off by NIH titles. Display
 * only: the grant's real title stays in the data. Two more are ready for the
 * climate researcher personas:
 *   "BP - Developing Sustainable Biofuels for Clean Energy Transition"
 *   "Stereolithographic Micro-Manufacturing of Crystalline Frameworks for Carbon Capture"
 */
const HEADINGS: Record<string, { title: string; short: string }> = {
  R01GM061721: { title: "Alzheimer's imaging", short: "Alzheimer's imaging" },
  R21AI182745: { title: 'RNA therapeutics', short: 'RNA therapeutics' },
  // The edge-case grants (real failure cases): a few words for each real title.
  R01AI178875: { title: 'Drug-resistant bacteria', short: 'Drug-resistant bacteria' },
  R01GM155497: { title: 'Cell cycle control', short: 'Cell cycle control' },
  R01HL176691: { title: 'Heart muscle metabolism', short: 'Heart muscle metabolism' },
  R01GM105672: { title: 'Nuclear envelope repair', short: 'Nuclear envelope repair' },
  K01DK133670: { title: 'Gut microbes and obesity', short: 'Gut microbes and obesity' },
  F31DC022138: { title: 'Smell circuits', short: 'Smell circuits' },
}

/** The heading shown for a grant. */
export const grantHeading = (g: Grant) => HEADINGS[g.id]?.title ?? g.title

const SMALL = new Set(['a', 'an', 'and', 'as', 'by', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with'])

/**
 * A grant's title cut to its subject, at most 3 words:
 * "Biogenesis of the mitochondrial inner membrane" → "Mitochondrial inner membrane",
 * "Investigating ploidy modulation as a strategy to …" → "Ploidy modulation".
 */
export function shortName(g: Grant) {
  const named = HEADINGS[g.id]
  if (named) return named.short
  let words = g.title.split(/\s+/).filter(Boolean)
  if (words.length > 1 && /ing$/i.test(words[0])) words = words.slice(1) // "Investigating …"
  if (words.length > 2 && words[1].toLowerCase() === 'of') words = words.slice(words[2].toLowerCase() === 'the' ? 3 : 2) // "Biogenesis of the …"
  const cut = words.findIndex(w => SMALL.has(w.toLowerCase()))
  const short = words.slice(0, Math.min(3, cut < 1 ? words.length : cut)).join(' ').toLowerCase() || g.title
  return short[0].toUpperCase() + short.slice(1)
}

/** Shown wherever grants are described: the IDs are real, the lab is not. */
export const SIM_NOTE = 'Grant IDs, institutes and end dates are real NIH records (R01GM061721, UCLA; R21AI182745, Princeton); the headings shown are simplified stand-ins for their titles. The lab, people, purchases, invoices, papers, amounts and the cancel, court and payment timeline are simulated (today in the sim is June 15, 2026).'

export const firstName = (db: Db) => (db.grants[0]?.pi ?? '').replace(/^Dr\.?\s*/, '').split(' ')[0]

const fmt = (day: string, o: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' })
export const longDate = (day: string) => fmt(day, { month: 'short', day: 'numeric', year: 'numeric' })
export const monthYear = (day: string) => fmt(day, { month: 'short', year: 'numeric' })

export const daysLeft = (db: Db, g: Grant) => daysBetween(db.today, g.end)

/** "in 47 days", "in 7 weeks", "in 18 months". */
export function inTime(days: number) {
  if (days < 0) return `${-days} days ago`
  if (days <= 60) return `in ${days} days`
  if (days <= 180) return `in ${Math.round(days / 7)} weeks`
  return `in ${Math.round(days / 30)} months`
}

/** Paused: stopped by a cancellation (or sources disagreeing) and no money since. */
export const paused = (g: Grant) => g.frozen && g.status !== 'ended'

export const spendable = (g: Grant) => (g.frozen ? 0 : Math.max(0, trulyAvailable(g)))

export const CATEGORIES = [
  'lab supplies', 'reagents', 'equipment', 'equipment service', 'core facility services',
  'publication costs', 'shipping', 'software', 'travel', 'general office',
  'food', 'alcohol', 'entertainment', 'personal', 'furniture', 'other',
]

/** The kinds a federal grant never pays for: words for "Federal grants can't pay for …", and why in one line. */
export const NOT_ALLOWED: Record<string, { what: string; why: string }> = {
  'general office': { what: 'general office things', why: "Office supplies are the university's overhead, which the grant already pays through its indirect costs." },
  food: { what: 'food or drinks', why: "Meals and snacks don't do the funded research work, so auditors disallow them." },
  alcohol: { what: 'alcohol', why: 'Federal cost rules bar alcohol outright (2 CFR 200.423).' },
  entertainment: { what: 'entertainment', why: 'Federal cost rules bar entertainment and amusement (2 CFR 200.438).' },
  personal: { what: 'personal things', why: "It benefits you, not the funded research, so it isn't a cost of the project (2 CFR 200.403)." },
  furniture: { what: 'furniture or decor', why: "Furniture and decor are the university's overhead, not a cost of the research." },
}

// A fallback only, for when the item check (Haiku, T103) has no answer: the
// kind of research cost an item most looks like. Whether a grant can pay for
// it at all is the item check's call, never these words.
const GUESSES: [string, RegExp][] = [
  ['equipment service', /service contract|repair|maintenance|calibrat/i],
  ['core facility services', /\bcore\b|hours of|sequencing run|mass spec/i],
  ['publication costs', /publication|open access|page charge|article fee/i],
  ['shipping', /shipping|courier|fedex|ups\b|dry ice/i],
  ['travel', /flight|hotel|conference|trip|travel/i],
  ['software', /software|license|subscription/i],
  ['equipment', /centrifuge|microscope|pump|incubator|freezer|fridge|refrigerator|shaker|laptop|computer|spectrometer|thermocycler|balance|sonicator/i],
  ['reagents', /reagent|antibod|enzyme|buffer|detergent|\bkit\b|cells|primer|dye|serum|broth|media\b/i],
]
export const guessCategory = (text: string) => GUESSES.find(([, re]) => re.test(text))?.[0] ?? 'lab supplies'

/** "10 cases of nitrile gloves, about $640" → item and price (price undefined when none is given). */
export function parseAsk(text: string): { item: string; price?: number } {
  const m = text.match(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/i) ?? text.match(/(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:dollars|usd|bucks)\b/i)
  const price = m ? Math.round(parseFloat(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1)) : undefined
  const rest = (m ? text.replace(m[0], ' ') : text)
    .replace(/[\s,;:.\-–—(]*(?:(?:about|around|roughly|approximately|approx\.?|for|at|costing|costs?|~)\s*)*[\s,;:.\-–—)]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return { item: rest.charAt(0).toUpperCase() + rest.slice(1), price: price && price > 0 ? price : undefined }
}

export type Outcome =
  | { kind: 'yes'; grant: Grant } // every rule passes on this grant
  | { kind: 'manager'; grant: Grant } // only the card limit fails
  // The pause stops it. needsManager: it is also over the card limit, so once
  // the money arrives it still goes to the grant manager, not bought on its own.
  | { kind: 'wait'; grant: Grant; needsManager: boolean }
  | { kind: 'not_allowed' } // a federal grant can't pay for this kind of thing
  | { kind: 'not_now'; grant: Grant }

const isCardLimit = (v: Verdict) => v.rule.startsWith('Under the card limit')
const isPause = (v: Verdict) => v.rule.startsWith('Grant is active and not frozen')

/** What the researcher asked for. */
export interface AskFacts { category: string; price: number }

/** Every rule's verdict on every grant, the grant with the most money first. */
export function allChecks(db: Db, req: AskFacts) {
  const facts = { category: req.category, price: req.price }
  return [...db.grants]
    .sort((a, b) => trulyAvailable(b) - trulyAvailable(a))
    .map(g => ({ g, verdicts: spendingVerdicts(facts, g, db.today) }))
}

/** Why a grant can't pay, in a sentence a researcher can act on. */
export function plainReasons(db: Db, g: Grant, verdicts: Verdict[]): string[] {
  return verdicts.filter(v => !v.pass && !isCardLimit(v)).map(v => {
    if (isPause(v)) return `Your ${shortName(g)} grant is paused until its money arrives.`
    if (v.rule.startsWith("Not in the grant's last 90 days")) return `Your ${shortName(g)} grant ends ${inTime(daysLeft(db, g))}, and supplies bought this close to the end are often refused by auditors.`
    if (v.rule.startsWith('Enough truly available money')) return `Your ${shortName(g)} grant has only ${money(spendable(g))} left.`
    return v.detail
  })
}

/** What the purchasing agent will do with this request, by the module's rules. */
export function checkAsk(db: Db, req: AskFacts): Outcome {
  const rows = allChecks(db, req)
  const fails = (r: (typeof rows)[number]) => r.verdicts.filter(v => !v.pass)
  if (rows[0]?.verdicts.some(v => v.rule === 'Category allowed' && !v.pass)) return { kind: 'not_allowed' }
  const yes = rows.find(r => canBuyAlone(r.verdicts))
  if (yes) return { kind: 'yes', grant: yes.g }
  const mgr = rows.find(r => fails(r).every(isCardLimit))
  if (mgr) return { kind: 'manager', grant: mgr.g }
  const wait = rows.find(r => paused(r.g) && fails(r).every(v => isPause(v) || isCardLimit(v)))
  if (wait) return { kind: 'wait', grant: wait.g, needsManager: fails(wait).some(isCardLimit) }
  return { kind: 'not_now', grant: rows[0].g }
}
