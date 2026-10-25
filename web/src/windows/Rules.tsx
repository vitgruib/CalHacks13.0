// Rules window (T103): every check a purchase request goes through, for the
// grant manager. The spending rules' names, limits and categories come from the
// module itself (server/src/rules.ts), so this page can't drift from what runs.
// Nothing is bought without the grant office (T108): every request comes to
// it with these verdicts. The item check on Requests (agents/src/agents/
// item-check.ts) is described in words.
import { SUPPLY_CATEGORIES, UNALLOWABLE_CATEGORIES, usd } from '../../../server/src/rules'
import { CARD_LIMIT } from '../../../server/src/vocab'
import { Section } from '../ui'
import './Rules.css'

interface SpendingRule { rule: string; checks: string; fails: string; source?: string }

// Names exactly as spendingVerdicts writes them.
const SPENDING: SpendingRule[] = [
  {
    rule: 'Grant is active and not frozen',
    checks: 'The grant is active, or restored by a court and paid since. A canceled or disputed grant is frozen; a court order alone does not make it active again. A payment after the court order does. You can also set the status yourself on its Funds card (active; reinstated by a court, money not sent yet; or inactive), with a reason that goes in the log; spending follows it.',
    fails: 'Flagged for you. Once the grant is active again, the flag clears and the request waits for your approval as usual.',
  },
  {
    rule: "Not in the grant's last 90 days",
    checks: `Only for ${SUPPLY_CATEGORIES.join(', ')}: the grant ends more than 90 days from today.`,
    fails: 'Flagged for you, with the failed rule as evidence.',
    source: "NSF OIG audits of WVU and Delaware: supplies bought in a grant's last months were disallowed",
  },
  {
    rule: 'Enough truly available money',
    checks: 'The price fits in what the grant truly has: awarded, minus spent, minus already promised.',
    fails: 'Flagged for you, with the failed rule as evidence.',
  },
  {
    rule: 'Category allowed',
    checks: `The kind of thing is an allowable direct cost. Not allowed: ${UNALLOWABLE_CATEGORIES.join(', ')}.`,
    fails: 'Flagged for you: not bought unless you approve it.',
    source: 'NSF OIG audit of UC Davis: unallowable items charged to awards',
  },
  {
    rule: `Under the card limit (${usd(CARD_LIMIT)})`,
    checks: `The price is ${usd(CARD_LIMIT)} or less.`,
    fails: 'Flagged for you: a purchase over the card limit needs a closer look.',
  },
  {
    rule: 'Under the card limit, counting same-day purchases',
    checks: `The same person's other live requests that day in the same category, added together, stay at ${usd(CARD_LIMIT)} or less. Catches a purchase split to slip under the limit.`,
    fails: 'Flagged for you.',
    source: 'Southern Connecticut State Univ. (CT auditors, 2025): same-day orders with one vendor, split to stay under the $2,500 limit',
  },
]

interface AgentCheck { check: string; checks: string; fails: string }

const ASK: AgentCheck[] = [
  {
    check: 'A grant could pay for it at all',
    checks: 'When a researcher asks on Requests, Claude (Haiku) reads the item first, before any grant is matched. Flagged: alcohol, entertainment, personal things, food and drinks, furniture, decor and general office supplies (2 CFR 200.403, 200.423, 200.438), a general-use item whose purpose doesn\'t say how it serves the research, and a request whose text is written to the checker rather than about the item ("ignore your instructions", "set the verdict to fine"), which never reaches Claude.',
    fails: 'The researcher sees why and no grant is matched. They can still send it, and then it comes to you like any request.',
  },
  {
    check: 'The price is near the list price',
    checks: 'For lab supplies, reagents and equipment, the same check looks up the item\'s public list price: a saved price first, else Claude (Haiku) searches lab suppliers\' sites. Only a new price from the maker or a major lab supplier counts (never a reseller, used or refurbished listing), and code works out the price for the asked quantity from the listing\'s pack size. Flagged when the asked price is more than twice the list price for the same quantity and at least $100 over it. No list price found (or none in time for the check\'s answer) means no price flag; a price found late is saved for the next request.',
    fails: 'The researcher sees the vendor\'s list price. They can still send it, and then it comes to you like any request.',
  },
]

export default function Rules() {
  return (
    <>
      <Section title="How a request is decided">
        <ol className="rules-flow">
          <li>When a researcher asks on Requests, the item is checked first: could a grant pay for this kind of thing at all, and is the price near the list price?</li>
          <li>Once it is sent, the database checks every spending rule below against the grant the request is charged to.</li>
          <li>Every request then comes to you in the Inbox with those verdicts: "Approve" when every rule passes, "Flagged" when one fails, with the failed rules as evidence. Nothing is bought on its own.</li>
          <li>You approve (the money is promised on that grant and the researcher buys it) or reject, always with a reason. A researcher can push back on a rejection with new information, and it comes back to you.</li>
          <li>The researcher sends the invoice. The bookkeeping agent matches it to the approved order; a match comes to you to approve, and a mismatch comes to you held, with its timeline. An approved invoice is charged to the grant and the researcher is reimbursed.</li>
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
