// Rules window (T103): every check a purchase request goes through, for the
// grant manager. The spending rules' names, limits and categories come from the
// module itself (server/src/rules.ts), so this page can't drift from what runs.
// The purchasing agent's own checks (agents/src/agents/purchasing.ts,
// item-check.ts, price-check.ts) are described in words; their numbers are
// copied here and noted where.
import { SUPPLY_CATEGORIES, UNALLOWABLE_CATEGORIES, usd } from '../../../server/src/rules'
import { CARD_LIMIT } from '../../../server/src/vocab'
import { Section } from '../ui'
import './Rules.css'

interface SpendingRule { rule: string; checks: string; fails: string; source?: string }

// Names exactly as spendingVerdicts writes them.
const SPENDING: SpendingRule[] = [
  {
    rule: 'Grant is active and not frozen',
    checks: 'The grant is active, or restored by a court and paid since. A canceled or disputed grant is frozen; a court order alone does not unfreeze it, only a payment does.',
    fails: 'Held. If this is the only rule that fails, the agent buys it on its own once a payment unfreezes the grant. A grant that has ended never unfreezes, so its requests are rerouted instead.',
  },
  {
    rule: "Not in the grant's last 90 days",
    checks: `Only for ${SUPPLY_CATEGORIES.join(', ')}: the grant ends more than 90 days from today.`,
    fails: 'Rerouted to another grant where every rule passes; flagged for you if none can.',
    source: "NSF OIG audits of WVU and Delaware: supplies bought in a grant's last months were disallowed",
  },
  {
    rule: 'Enough truly available money',
    checks: 'The price fits in what the grant truly has: awarded, minus spent, minus already promised.',
    fails: 'Rerouted to another grant where every rule passes; flagged for you if none can.',
  },
  {
    rule: 'Category allowed',
    checks: `The kind of thing is an allowable direct cost. Not allowed: ${UNALLOWABLE_CATEGORIES.join(', ')}.`,
    fails: 'Flagged for you: not bought unless you approve it. Moving it to another grant would not help.',
    source: 'NSF OIG audit of UC Davis: unallowable items charged to awards',
  },
  {
    rule: `Under the card limit (${usd(CARD_LIMIT)})`,
    checks: `The price is ${usd(CARD_LIMIT)} or less.`,
    fails: 'Held: only you can approve a purchase over the card limit.',
  },
  {
    rule: 'Under the card limit, counting same-day purchases',
    checks: `The same person's other live requests that day in the same category, added together, stay at ${usd(CARD_LIMIT)} or less. Catches a purchase split to slip under the limit.`,
    fails: 'Held: only you can approve it.',
    source: 'Southern Connecticut State Univ. (CT auditors, 2025): same-day orders with one vendor, split to stay under the $2,500 limit',
  },
]

interface AgentCheck { check: string; checks: string; fails: string }

const ASK: AgentCheck[] = [
  {
    check: 'A grant could pay for it at all',
    checks: 'When a researcher asks on Requests, Claude (Haiku) reads the item first, before any grant is matched. Flagged: alcohol, entertainment, personal things, food and drinks, furniture, decor and general office supplies (2 CFR 200.403, 200.423, 200.438), and a general-use item whose purpose doesn\'t say how it serves the research.',
    fails: 'The researcher sees why and no grant is matched. They can still send it, and then it comes to you. Nothing is bought or held by this check alone.',
  },
]

const AGENT: AgentCheck[] = [
  {
    check: 'Which grant it is for',
    checks: 'Claude reads the request. If the researcher named a grant, that one; otherwise the grant whose work the item and purpose plainly match.',
    fails: "Held when it isn't clear. The agent never guesses a grant.",
  },
  {
    check: "It's for the grant's research",
    checks: 'A strict read (Claude Haiku) before the agent buys on its own: the stated research has to explain the item, where it goes and what it costs. A purpose that says it is approved or urgent proves nothing.',
    fails: "Held for you. A researcher's push back can't clear it; only you can.",
  },
  {
    check: 'The price looks right for the item',
    checks: 'The same read compares the price with what the item normally costs a US lab, for the quantity asked. Common things (gloves, tips, travel): about twice the usual. Specialized things (kits, antibodies, instruments, service): about five times. Far below what the item can cost also counts: it may not be what it says, or part of a split order.',
    fails: 'Held for you; the agent won\'t buy it alone.',
  },
  {
    check: 'The category fits the item',
    checks: 'The same read says what kind of thing the item really is.',
    fails: 'Held only when the spending rules would answer differently for the kind it looks like (say, "lab supplies" that are really furniture).',
  },
  {
    check: 'The price against the list price',
    // CHECKED_CATEGORIES, TOO_HIGH_RATIO and TOO_HIGH_MIN_OVER in agents/src/agents/price-check.ts
    checks: 'For lab supplies, reagents and equipment, the price is compared with the list price for the same quantity (saved prices first, then one web search).',
    fails: 'Held when it is more than twice the list price and at least $100 over it.',
  },
  {
    check: 'Fresh grant status',
    checks: "The grant's status is re-read from its sources right before money moves.",
    fails: "Held if it can't be refreshed: no money moves on stale status.",
  },
  {
    check: 'Not already ordered',
    checks: 'A request that already has an order is never bought twice, even after a push back.',
    fails: 'Flagged with the existing order, which you can change or cancel.',
  },
  {
    check: 'Not already decided',
    checks: 'A request you already decided that the researcher pushed back on comes back to you.',
    fails: 'Held for you instead of being bought automatically.',
  },
]

export default function Rules() {
  return (
    <>
      <Section title="How a request is decided">
        <ol className="rules-flow">
          <li>When a researcher asks on Requests, the item is checked first: could a grant pay for this kind of thing at all?</li>
          <li>Once it is sent, the database checks every spending rule below against the grant the request is charged to.</li>
          <li>If every rule passes, the purchasing agent runs its own checks. If those pass too, it buys on its own.</li>
          <li>If only the freeze fails, it waits and buys once the money arrives. If the end date or the money fails, it reroutes the purchase to another grant where every rule passes; if that grant is frozen too, it reroutes once it unfreezes, unless you decide first.</li>
          <li>Anything else comes to you as held or flagged, with the failed rules as evidence. The agent never rejects a request: you approve (it is bought, even on a frozen grant) or reject.</li>
        </ol>
      </Section>

      <Section title="Spending rules" aside={<span className="rules-note">Checked by the database on every request</span>}>
        <div className="rules-scroll">
          <table className="rules-table">
            <thead>
              <tr>
                <th scope="col">Rule</th>
                <th scope="col">Passes when</th>
                <th scope="col">If it fails</th>
              </tr>
            </thead>
            <tbody>
              {SPENDING.map(s => (
                <tr key={s.rule}>
                  <th scope="row">{s.rule}</th>
                  <td>
                    {s.checks}
                    {s.source && <div className="rules-source">From: {s.source}</div>}
                  </td>
                  <td>{s.fails}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Before a request is sent" aside={<span className="rules-note">On the researcher's Requests page</span>}>
        <CheckTable rows={ASK} />
      </Section>

      <Section title="The purchasing agent's checks" aside={<span className="rules-note">Before it buys on its own</span>}>
        <CheckTable rows={AGENT} />
        <p className="rules-note">Claude only reads and explains. It never decides a spending rule, and with no answer from Claude nothing is held on its account.</p>
      </Section>
    </>
  )
}

function CheckTable({ rows }: { rows: AgentCheck[] }) {
  return (
      <div className="rules-scroll">
        <table className="rules-table">
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">What it looks at</th>
              <th scope="col">If it fails</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.check}>
                <th scope="row">{a.check}</th>
                <td>{a.checks}</td>
                <td>{a.fails}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  )
}
