// Validates sim/seed.json against sim/answer-key.json (T8). No dependencies.
// Run: node sim/validate.mjs [seed.json] [answer-key.json]
// Exits 1 with every problem listed, or prints a summary table.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const seedPath = process.argv[2] ?? join(HERE, 'seed.json')
const keyPath = process.argv[3] ?? join(HERE, 'answer-key.json')
const db = JSON.parse(readFileSync(seedPath, 'utf8'))
const key = JSON.parse(readFileSync(keyPath, 'utf8'))

const CARD_LIMIT = key.assumptions?.cardLimit ?? 5000
const SUPPLIES = new Set(key.assumptions?.last90DaysCategories ?? ['lab supplies', 'reagents'])
const UNALLOWABLE = new Set(key.assumptions?.unallowableCategories ?? ['general office'])
const DAY = 86_400_000
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

// Every planted mistake and decoy in docs/MASTER-PLAN.md §3, in its wording.
const REQUIRED = [
  ['fund_tracker', 'mistake', 'a grant active in one source and canceled in another'],
  ['fund_tracker', 'mistake', 'a purchase while canceled'],
  ['fund_tracker', 'mistake', 'a court order with no payment yet'],
  ['purchases', 'mistake', 'supplies bought in the last 90 days'],
  ['purchases', 'mistake', 'an unallowable item'],
  ['purchases', 'mistake', 'a shared cost charged 100% to one grant'],
  ['purchases', 'mistake', 'a buy over the card limit'],
  ['purchases', 'decoy', 'a buy exactly at the limit'],
  ['purchases', 'decoy', 'a correct shared-cost split'],
  ['invoices', 'mistake', 'an invoice for a canceled order'],
  ['invoices', 'mistake', 'an approval for a different amount'],
  ['invoices', 'decoy', 'an invoice matching an approved change to the order'],
  ['payment_requests', 'mistake', 'a held purchase that must be left out of the request'],
  ['reports', 'mistake', 'a paper crediting the wrong grant'],
  ['reports', 'mistake', 'a paper missing its PubMed Central ID'],
  ['reports', 'mistake', 'a corrected paper listed without disclosure'],
  ['reports', 'decoy', 'an author-affiliation correction'],
  ['reports', 'decoy', 'a retracted paper cited in order to discuss the retraction'],
]
const FEATURES = ['fund_tracker', 'purchases', 'invoices', 'payment_requests', 'reports']
const EXPECTED = new Set(['hold', 'block', 'reroute', 'exclude', 'flag', 'note', 'pass'])

const errors = []
const fail = msg => errors.push(msg)

// ---- tables and ids --------------------------------------------------------
const TABLES = ['grants', 'statusEvents', 'sourceReadings', 'flags', 'requests', 'orders', 'approvals', 'invoices', 'payroll', 'paymentRequests', 'papers', 'holds', 'log']
for (const t of TABLES) if (!Array.isArray(db[t])) fail(`seed is missing table "${t}"`)
if (errors.length) report()

const byId = new Map()
const index = (table, rows) => {
  for (const r of rows) {
    if (!r.id) fail(`${table}: a row has no id`)
    else if (byId.has(r.id)) fail(`duplicate id "${r.id}" (${table} and ${byId.get(r.id).table})`)
    else byId.set(r.id, { table, row: r })
  }
}
for (const t of TABLES) index(t, db[t])
index('followUps', db.paymentRequests.flatMap(p => p.followUps ?? []))
const get = (table, id) => { const e = byId.get(id); return e && e.table === table ? e.row : undefined }
const grant = id => get('grants', id)

// ---- cross-references ------------------------------------------------------
const needGrant = (where, id) => { if (!grant(id)) fail(`${where}: grant "${id}" does not exist`) }
for (const t of ['statusEvents', 'sourceReadings', 'flags', 'requests', 'payroll', 'paymentRequests', 'papers', 'holds']) {
  for (const r of db[t]) needGrant(`${t} ${r.id}`, r.grantId)
}
for (const r of db.requests) {
  if (r.chargedGrantId) needGrant(`request ${r.id} chargedGrantId`, r.chargedGrantId)
  if (r.split) {
    for (const s of r.split) needGrant(`request ${r.id} split`, s.grantId)
    const sum = r.split.reduce((s, x) => s + x.share, 0)
    if (Math.abs(sum - 1) > 1e-9) fail(`request ${r.id}: split shares sum to ${sum}, not 1`)
  }
}
for (const o of db.orders) if (!get('requests', o.requestId)) fail(`order ${o.id}: request "${o.requestId}" does not exist`)
for (const i of db.invoices) if (!get('orders', i.orderId)) fail(`invoice ${i.id}: order "${i.orderId}" does not exist`)
for (const a of db.approvals) if (!get('orders', a.orderId)) fail(`approval ${a.id}: order "${a.orderId}" does not exist`)
for (const p of db.papers) {
  needGrant(`paper ${p.id} creditsGrantId`, p.creditsGrantId)
  for (const id of p.costRequestIds ?? []) if (!get('requests', id)) fail(`paper ${p.id}: cost request "${id}" does not exist`)
}
for (const h of db.holds) if (!byId.has(h.refId)) fail(`hold ${h.id}: refId "${h.refId}" does not exist`)
for (const l of db.log) if (l.refId && !byId.has(l.refId)) fail(`log ${l.id}: refId "${l.refId}" does not exist`)

// ---- payment request sums --------------------------------------------------
const finalAmount = o => o.changedAmount ?? o.amount
const shareOf = (r, g) => (r.split ? (r.split.find(s => s.grantId === g)?.share ?? 0) : (r.chargedGrantId ?? r.grantId) === g ? 1 : 0)
const charged = (r, g) => db.orders.filter(o => o.requestId === r.id && o.state !== 'canceled').reduce((s, o) => s + finalAmount(o) * shareOf(r, g), 0)
for (const pr of db.paymentRequests) {
  let sum = 0
  for (const id of pr.includedRequestIds) {
    const r = get('requests', id)
    if (!r) { fail(`payment request ${pr.id}: included request "${id}" does not exist`); continue }
    if (shareOf(r, pr.grantId) === 0) fail(`payment request ${pr.id}: included request ${id} is not charged to ${pr.grantId}`)
    sum += charged(r, pr.grantId)
  }
  for (const id of pr.includedPayrollIds ?? []) {
    const p = get('payroll', id)
    if (!p) { fail(`payment request ${pr.id}: included payroll "${id}" does not exist`); continue }
    if (p.grantId !== pr.grantId) fail(`payment request ${pr.id}: payroll ${id} is on ${p.grantId}`)
    sum += p.amount
  }
  for (const x of pr.excluded) if (!get('requests', x.requestId)) fail(`payment request ${pr.id}: excluded request "${x.requestId}" does not exist`)
  if (Math.abs(sum - pr.amount) > 0.005) fail(`payment request ${pr.id}: included items add up to ${sum}, but amount is ${pr.amount}`)
  if (pr.explanation.length > 1000) fail(`payment request ${pr.id}: explanation is ${pr.explanation.length} characters (limit 1,000)`)
}

// ---- grant totals match the records ---------------------------------------
for (const g of db.grants) {
  const orders = state => db.requests.reduce((s, r) => s + db.orders.filter(o => o.requestId === r.id && state(o.state)).reduce((t, o) => t + finalAmount(o) * shareOf(r, g.id), 0), 0)
  const spent = orders(s => s === 'paid') + db.payroll.filter(p => p.grantId === g.id && p.period.to <= db.today).reduce((s, p) => s + p.amount, 0)
  const promised = orders(s => s === 'open' || s === 'changed')
  const received = db.statusEvents.filter(e => e.grantId === g.id && e.kind === 'payment_received').reduce((s, e) => s + (e.amount ?? 0), 0)
  if (g.spent !== spent) fail(`grant ${g.id}: spent is ${g.spent}, records add up to ${spent}`)
  if (g.promised !== promised) fail(`grant ${g.id}: promised is ${g.promised}, open orders add up to ${promised}`)
  if (g.received !== received) fail(`grant ${g.id}: received is ${g.received}, payments add up to ${received}`)
}

// ---- answer key shape and coverage ----------------------------------------
const caseIds = new Set()
for (const c of key.cases) {
  if (caseIds.has(c.id)) fail(`answer key: duplicate case id "${c.id}"`)
  caseIds.add(c.id)
  if (!FEATURES.includes(c.feature)) fail(`answer key ${c.id}: unknown feature "${c.feature}"`)
  if (c.kind !== 'mistake' && c.kind !== 'decoy') fail(`answer key ${c.id}: kind must be mistake or decoy`)
  if (!EXPECTED.has(c.expected)) fail(`answer key ${c.id}: unknown expected "${c.expected}"`)
  if (c.kind === 'decoy' && ['hold', 'block', 'flag', 'reroute', 'exclude'].includes(c.expected)) fail(`answer key ${c.id}: a decoy cannot expect "${c.expected}"`)
  if (!byId.has(c.refId)) fail(`answer key ${c.id}: refId "${c.refId}" does not exist in the seed`)
  for (const id of c.relatedIds ?? []) if (!byId.has(id)) fail(`answer key ${c.id}: related id "${id}" does not exist in the seed`)
  if (!c.why || !c.source || !c.rule) fail(`answer key ${c.id}: needs why, source and rule`)
}
for (const [feature, kind, wording] of REQUIRED) {
  if (!key.cases.some(c => c.feature === feature && c.kind === kind && c.case === wording)) fail(`missing planted case: ${feature} ${kind} "${wording}" (MASTER-PLAN §3)`)
}

// ---- each case really is what it claims (and is still raw) ----------------
const latestBySource = grantId => {
  const m = new Map()
  for (const r of db.sourceReadings.filter(x => x.grantId === grantId).sort((a, b) => a.day.localeCompare(b.day))) m.set(r.source, r)
  return [...m.values()]
}
const ordersOf = rid => db.orders.filter(o => o.requestId === rid)
const approvalOf = oid => db.approvals.filter(a => a.orderId === oid).sort((a, b) => a.day.localeCompare(b.day)).at(-1)
const undecidedHoldOn = id => db.holds.find(h => !h.decision && h.refId === id)
const isRawRequest = r => r.state === 'submitted' && r.verdicts.length === 0
const isRawInvoice = i => i.checked === false && !i.mismatch && !undecidedHoldOn(i.id)
const isRawPaper = p => p.checked === false && p.checks.length === 0 && !undecidedHoldOn(p.id)
const mentionsAllGrants = text => db.grants.every(g => text.includes(g.id))

const CHECKS = {
  'a grant active in one source and canceled in another': (r) => {
    const latest = latestBySource(r.grantId)
    return latest.some(x => x.id === r.id) && latest.some(x => x.status === 'active') && latest.some(x => x.status === 'canceled')
      && !db.flags.some(f => f.grantId === r.grantId && f.kind === 'sources_disagree')
      || 'the latest readings for the grant must include this one and disagree (active vs canceled), with no sources_disagree flag yet'
  },
  'a purchase while canceled': (r) => {
    const placed = ordersOf(r.id)[0]?.placed
    const cancel = db.statusEvents.filter(e => e.grantId === r.grantId && e.kind === 'canceled' && e.day <= placed).at(-1)
    const paidSince = cancel && db.statusEvents.some(e => e.grantId === r.grantId && e.kind === 'payment_received' && e.day >= cancel.day && e.day <= placed)
    return (!!cancel && !paidSince && !db.flags.some(f => f.grantId === r.grantId && f.kind === 'spend_while_canceled'))
      || 'its order must be placed after a cancellation with no payment in between, with no spend_while_canceled flag yet'
  },
  'a court order with no payment yet': (e) => {
    const cancel = db.statusEvents.find(x => x.grantId === e.grantId && x.kind === 'canceled' && x.day <= e.day)
    const paid = cancel && db.statusEvents.some(x => x.grantId === e.grantId && x.kind === 'payment_received' && x.day >= cancel.day)
    return (e.kind === 'court_order' && !!cancel && !paid && grant(e.grantId)?.frozen === true && !db.flags.some(f => f.grantId === e.grantId && f.kind === 'court_order_no_payment'))
      || 'must be a court_order after a cancellation, no payment since, grant still frozen, no court_order_no_payment flag yet'
  },
  'supplies bought in the last 90 days': (r) => {
    const g = grant(r.grantId)
    const other = db.grants.some(x => x.id !== g.id && daysBetween(db.today, x.end) > 90)
    return (isRawRequest(r) && SUPPLIES.has(r.category) && daysBetween(db.today, g.end) <= 90 && other)
      || 'must be a raw supplies request on a grant ending within 90 days, with another grant to reroute to'
  },
  'an unallowable item': (r) => (isRawRequest(r) && UNALLOWABLE.has(r.category)) || 'must be a raw request in an unallowable category',
  'a shared cost charged 100% to one grant': (r) => (isRawRequest(r) && !r.split && mentionsAllGrants(r.purpose)) || 'must be a raw request with no split whose purpose names every grant',
  'a buy over the card limit': (r) => (isRawRequest(r) && r.price > CARD_LIMIT) || `must be a raw request over $${CARD_LIMIT}`,
  'a buy exactly at the limit': (r) => (isRawRequest(r) && r.price === CARD_LIMIT) || `must be a raw request of exactly $${CARD_LIMIT}`,
  'a correct shared-cost split': (r) => (isRawRequest(r) && (r.split?.length ?? 0) >= 2 && mentionsAllGrants(r.purpose)) || 'must be a raw request split across the grants it names',
  'an invoice for a canceled order': (i) => {
    const o = get('orders', i.orderId)
    return (isRawInvoice(i) && o.state === 'canceled' && !!o.canceledOn && o.canceledOn < i.received) || 'must be an unchecked invoice for an order canceled before it arrived'
  },
  'an approval for a different amount': (i) => {
    const a = approvalOf(i.orderId)
    return (isRawInvoice(i) && !!a && a.amount !== i.amount && get('orders', i.orderId).state !== 'canceled') || 'must be an unchecked invoice whose approval is for a different amount'
  },
  'an invoice matching an approved change to the order': (i) => {
    const o = get('orders', i.orderId), a = approvalOf(i.orderId)
    return (isRawInvoice(i) && o.state === 'changed' && o.changedAmount === i.amount && a?.amount === o.changedAmount && a.day >= o.placed) || 'must be an unchecked invoice equal to an approved order change'
  },
  'a held purchase that must be left out of the request': (r) => {
    const held = undecidedHoldOn(r.id) || ordersOf(r.id).some(o => db.invoices.some(i => i.orderId === o.id && undecidedHoldOn(i.id)))
    const included = db.paymentRequests.some(p => p.includedRequestIds.includes(r.id))
    return (!!held && !included) || 'must be a purchase (or its invoice) with an undecided hold, not yet in any payment request'
  },
  'a paper crediting the wrong grant': (p) => {
    const costs = (p.costRequestIds ?? []).map(id => get('requests', id))
    return (isRawPaper(p) && p.creditsGrantId !== p.grantId && costs.length > 0 && costs.every(r => shareOf(r, p.grantId) === 1)) || "must be an unchecked paper crediting another grant, with costs charged to the report's grant"
  },
  'a paper missing its PubMed Central ID': (p) => (isRawPaper(p) && !p.pmcid) || 'must be an unchecked paper with no pmcid',
  'a corrected paper listed without disclosure': (p) => (isRawPaper(p) && p.correction?.kind === 'material' && !p.correction.disclosed) || 'must be an unchecked paper with an undisclosed material correction',
  'an author-affiliation correction': (p) => (isRawPaper(p) && p.correction?.kind === 'minor' && /affiliation/i.test(p.correction.note)) || 'must be an unchecked paper with a minor affiliation correction',
  'a retracted paper cited in order to discuss the retraction': (p) => (isRawPaper(p) && p.correction?.kind === 'retraction' && p.correction.disclosed) || 'must be an unchecked paper with a disclosed retraction',
}
// A payment request leaves out purchases (requests) and salary (payroll rows).
const TABLE_FOR = { fund_tracker: null, purchases: ['requests'], invoices: ['invoices'], payment_requests: ['requests', 'payroll'], reports: ['papers'] }
for (const c of key.cases) {
  const entry = byId.get(c.refId)
  if (!entry) continue
  const want = TABLE_FOR[c.feature]
  if (want && !want.includes(entry.table)) { fail(`answer key ${c.id}: refId ${c.refId} is in ${entry.table}, expected ${want.join(' or ')}`); continue }
  if (c.grantId && entry.row.grantId && entry.row.grantId !== c.grantId && c.feature !== 'invoices') fail(`answer key ${c.id}: grantId ${c.grantId} but ${c.refId} is on ${entry.row.grantId}`)
  const check = CHECKS[c.case]
  if (check) {
    const ok = check(entry.row)
    if (ok !== true) fail(`answer key ${c.id} ("${c.case}"): seed record ${c.refId} ${ok}`)
  }
  if (c.feature === 'purchases' && entry.table === 'requests' && !isRawRequest(entry.row)) fail(`answer key ${c.id}: ${c.refId} should be raw (state submitted, no verdicts)`)
  if (c.feature !== 'payment_requests' && undecidedHoldOn(c.refId)) fail(`answer key ${c.id}: ${c.refId} already has an open hold; the seed should be raw`)
}

report()

function report() {
  if (errors.length) {
    console.error(`sim/validate: ${errors.length} problem${errors.length > 1 ? 's' : ''} in ${seedPath}\n`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  const rows = FEATURES.map(f => [f, key.cases.filter(c => c.feature === f && c.kind === 'mistake').length, key.cases.filter(c => c.feature === f && c.kind === 'decoy').length])
  console.log('sim/validate: OK\n')
  console.log('feature            mistakes  decoys')
  for (const [f, m, d] of rows) console.log(`${f.padEnd(18)} ${String(m).padStart(8)} ${String(d).padStart(7)}`)
  console.log(`${'total'.padEnd(18)} ${String(rows.reduce((s, r) => s + r[1], 0)).padStart(8)} ${String(rows.reduce((s, r) => s + r[2], 0)).padStart(7)}`)
  console.log(`\nseed (today ${db.today}): ` + TABLES.filter(t => t !== 'grants').map(t => `${db[t].length} ${t}`).join(', ') + `, ${db.grants.length} grants`)
  process.exit(0)
}
