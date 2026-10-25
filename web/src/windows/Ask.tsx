// The researcher's home. It does two things, and says so: ask to buy
// something (a plain answer from the module's spending rules, sent to the
// purchasing agent in one click), or one of four questions about the grants.
// Their requests and plans are tracked underneath (My requests, merged in T100).
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useStore } from '../data/store'
import type { Db, PurchaseRequest } from '../data/types'
import {
  CARD_LIMIT, CATEGORIES, NOT_ALLOWED, allChecks, checkAsk, daysLeft, guessCategory, inTime, longDate, paused,
  plainReasons, shortName, spendable, type Outcome,
} from '../plain'
import { money } from '../ui'
import { firstNameOf, forResearcher, useResearcher, type Researcher } from '../people'
import { MyRequests } from './Requests'
import './Ask.css'

type Topic = 'left' | 'end' | 'order' | 'paused'
/** Scrolls to the researcher's requests further down this page. */
const toMine = (e: { preventDefault(): void }) => { e.preventDefault(); document.getElementById('ask-mine')?.scrollIntoView({ behavior: 'smooth' }) }

const TOPICS: { id: Topic; label: string }[] = [
  { id: 'left', label: 'How much money is left?' },
  { id: 'end', label: 'When do my grants end?' },
  { id: 'order', label: 'Where is my latest order?' },
  { id: 'paused', label: 'Why is a grant paused?' },
]

const requestState: Record<PurchaseRequest['state'], string> = {
  submitted: 'sent, waiting for the purchasing agent',
  bought: 'bought',
  blocked: 'not bought',
  rerouted: 'moved to another grant',
  waiting_on_manager: 'waiting for your grant manager',
  rejected: 'turned down',
  canceled: 'not bought: its order was canceled',
}

function Check({ ok }: { ok: boolean }) {
  return ok
    ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-label="Passes" role="img" className="ask-ok"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-label="Fails" role="img" className="ask-no"><path d="M6 6l12 12M18 6L6 18" /></svg>
}

function TopicAnswer({ db, topic, me }: { db: Db; topic: Topic; me: Researcher }) {
  if (topic === 'left' || topic === 'end') {
    return (
      <ul className="ask-lines">
        {db.grants.map(g => (
          <li key={g.id}>
            <strong>{shortName(g)}:</strong>{' '}
            {topic === 'left'
              ? paused(g) ? <>paused, $0 to spend for now. <a href={`#grants/${g.id}`}>Where's my money?</a></> : <>{money(spendable(g))} you can spend, until {longDate(g.end)}.</>
              : <>ends {longDate(g.end)}, {inTime(daysLeft(db, g))}.{daysLeft(db, g) <= 90 && ' Supplies can no longer go on it; equipment and services still can.'}</>}
          </li>
        ))}
      </ul>
    )
  }
  if (topic === 'order') {
    // Latest by day; for the same day, the one added last.
    const r = db.requests.filter(x => x.requesterName === me.name).reduce<PurchaseRequest | undefined>((best, x) => !best || x.day >= best.day ? x : best, undefined)
    if (!r) return <p>You haven't asked for anything yet.</p>
    return <p><strong>{r.item}</strong> ({money(r.price)}, asked {longDate(r.day)}) is {requestState[r.state]}. {r.state !== 'submitted' && r.explanation} <a href="#ask" onClick={toMine}>See all your requests</a></p>
  }
  const p = db.grants.filter(paused)
  if (p.length === 0) return <p>None of your grants are paused. You can buy on all of them.</p>
  return (
    <ul className="ask-lines">
      {p.map(g => <li key={g.id}><strong>{shortName(g)}</strong> is paused: no money has arrived since it was stopped. <a href={`#grants/${g.id}`}>See where the money is</a></li>)}
    </ul>
  )
}

const headline: Record<Outcome['kind'], string> = {
  yes: 'Yes, you can buy this.',
  manager: 'Yes, with your grant manager\'s OK.',
  wait: 'Not today, but it can wait.',
  not_allowed: 'No, a grant can\'t pay for this.',
  not_now: 'Not right now.',
}

// grantId: the grant the researcher chose to pay from; '' lets us pick.
// flag: why the purchasing agent's item check (Haiku, T103) thinks no grant can pay for it.
type BuyAsk = { item: string; price: number; purpose: string; category: string; grantId: string; flag?: string }

/** The grants a request is checked on: the chosen one, or all of them. */
const pool = (db: Db, grantId: string): Db => grantId ? { ...db, grants: db.grants.filter(g => g.id === grantId) } : db

function Verdict({ db, ask, onSent }: { db: Db; ask: BuyAsk; onSent: (msg: string) => void }) {
  const { submitRequest } = useStore()
  const me = useResearcher()
  const [why, setWhy] = useState(false)
  // An item the item check flagged isn't matched to a grant at all.
  const out: Outcome = ask.flag ? { kind: 'not_allowed' } : checkAsk(pool(db, ask.grantId), ask)
  const checks = allChecks(pool(db, ask.grantId), ask)
  // A chosen grant that can't take it, when another one could.
  const auto = ask.grantId && out.kind !== 'yes' && out.kind !== 'manager' ? checkAsk(db, ask) : undefined
  const better = auto && (auto.kind === 'yes' || auto.kind === 'manager') ? auto.grant : undefined
  // Sent anyway, a request not allowed goes on the grant with the most money; the grant manager decides.
  const g = 'grant' in out ? out.grant : checks[0]?.g
  const after = g ? spendable(g) - ask.price : 0

  let body: ReactNode
  let send: string | undefined
  if (out.kind === 'yes') {
    body = <p className="ask-big">Put it on your <strong>{shortName(out.grant)}</strong> grant. After this you'll still have <strong>{money(after)}</strong> to spend there.</p>
    send = 'Send the order'
  } else if (out.kind === 'manager') {
    body = <p className="ask-big">It can go on your <strong>{shortName(out.grant)}</strong> grant, but anything over {money(CARD_LIMIT)} needs your grant manager to say yes. We'll ask them for you.</p>
    send = 'Send it to my grant manager'
  } else if (out.kind === 'wait') {
    const others = checks.filter(c => c.g.id !== out.grant.id).flatMap(c => plainReasons(db, c.g, c.verdicts))
    body = <>
      {out.needsManager
        ? <p className="ask-big">Your <strong>{shortName(out.grant)}</strong> grant can pay, but it's paused until its money arrives. And anything over {money(CARD_LIMIT)} needs your grant manager to say yes, so once the money comes in it goes to them; it isn't bought on its own.</p>
        : <p className="ask-big">Your <strong>{shortName(out.grant)}</strong> grant can pay, but it's paused until its money arrives. Send it now and it's bought the day the money comes in.</p>}
      {others.map(r => <p key={r} className="ask-sub">{r}</p>)}
      <p className="ask-sub"><a href={`#grants/${out.grant.id}`}>Where's my money?</a></p>
    </>
    send = out.needsManager ? 'Send it, ask my grant manager when the money arrives' : 'Send it, buy when the money arrives'
  } else if (out.kind === 'not_allowed') {
    const no = NOT_ALLOWED[ask.category]
    body = <>
      <p className="ask-big">{ask.flag || `Federal grants can't pay for ${no?.what ?? `${ask.category} things`}. ${no?.why ?? ''}`}</p>
      <p className="ask-sub">So we didn't check your grants. If it's really for your research, you can still send it: your grant manager will see it and decide.</p>
    </>
    send = 'Send it anyway'
  } else {
    body = <>
      <ul className="ask-lines">{[...new Set(checks.flatMap(c => plainReasons(db, c.g, c.verdicts)))].map(r => <li key={r}>{r}</li>)}</ul>
      <p className="ask-sub">You can still send it: your grant manager will see it and decide.</p>
    </>
    send = 'Send it anyway'
  }

  const onSend = () => {
    if (!g) return
    submitRequest({ item: ask.item, category: ask.category, price: ask.price, grantId: g.id, purpose: ask.purpose }, me)
    onSent(`Sent: ${ask.item}. The purchasing agent has it now.`)
  }

  return (
    <section aria-label="Answer" className={`ask-answer ask-${out.kind}`}>
      <div className="ask-head">
        <Check ok={out.kind === 'yes' || out.kind === 'manager'} />
        <h2>{headline[out.kind]}</h2>
      </div>
      {body}
      {better && <p className="ask-sub">Your <strong>{shortName(better)}</strong> grant could pay for it. Choose it below, or let us pick.</p>}
      <div className="ask-buttons">
        {send && <button type="button" className="ask-primary" onClick={onSend}>{send}</button>}
        <button type="button" className="ask-secondary" aria-expanded={why} onClick={() => setWhy(w => !w)}>{why ? 'Hide the checks' : 'See the checks'}</button>
      </div>
      {why && out.kind === 'not_allowed' && (
        <div className="ask-checks">
          <h3>The thing itself</h3>
          <ul>
            {ask.flag && <li><Check ok={false} /><span><strong>Item check by the purchasing agent.</strong> {ask.flag}</span></li>}
            {checks[0]?.verdicts.filter(v => v.rule === 'Category allowed').map(v => <li key={v.rule}><Check ok={v.pass} /><span><strong>{v.rule}.</strong> {v.detail}</span></li>)}
          </ul>
        </div>
      )}
      {why && out.kind !== 'not_allowed' && checks.map(c => (
        <div key={c.g.id} className="ask-checks">
          <h3>Your {shortName(c.g)} grant</h3>
          <ul>
            {c.verdicts.map(v => <li key={v.rule}><Check ok={v.pass} /><span><strong>{v.rule}.</strong> {v.detail}</span></li>)}
          </ul>
        </div>
      ))}
    </section>
  )
}

export default function Ask() {
  const me = useResearcher()
  const { db: all, checkItem } = useStore()
  const db = forResearcher(all, me)
  const [item, setItem] = useState('')
  const [price, setPrice] = useState('')
  const [purpose, setPurpose] = useState('')
  const [grantId, setGrantId] = useState('')
  const [ask, setAsk] = useState<BuyAsk | null>(null)
  const [topic, setTopic] = useState<Topic | null>(null)
  const [sent, setSent] = useState('')
  const [checking, setChecking] = useState(false)
  const latest = useRef(0)

  // The item is checked first (Haiku, on the worker), and only then matched to a grant.
  const onCheck = async (e: FormEvent) => {
    e.preventDefault()
    const n = Math.round(Number(price))
    if (!item.trim() || !purpose.trim() || !(n > 0)) return
    const what = item.trim()
    const asked = { item: what.charAt(0).toUpperCase() + what.slice(1), price: n, purpose: purpose.trim() }
    const turn = ++latest.current
    setAsk(null)
    setTopic(null)
    setSent('')
    setChecking(true)
    const check = await checkItem(asked, me)
    if (turn !== latest.current) return
    setChecking(false)
    const category = CATEGORIES.includes(check.category) ? check.category : guessCategory(`${what} ${purpose}`)
    setAsk({ ...asked, category, grantId, flag: check.verdict === 'flag' ? check.why || 'This doesn\'t look like a cost of the research.' : undefined })
  }
  const pausedGrants = db.grants.filter(paused)
  const autoOut = ask && checkAsk(db, ask)
  const autoPick = autoOut && 'grant' in autoOut ? autoOut.grant : undefined

  return (
    <div className="ask">
      <div>
        <h1>Hi {firstNameOf(me)}. What would you like to do?</h1>
        <p className="ask-lede">Here you can ask to buy something for your research, or check on your grants. For anything else, ask your grant manager.</p>
      </div>
      {pausedGrants.length > 0 && (
        <p className="ask-banner">
          Your {pausedGrants.map(shortName).join(' and ')} grant {pausedGrants.length > 1 ? 'are' : 'is'} paused right now.{' '}
          <a href={`#grants/${pausedGrants[0].id}`}>Where's my money?</a>
        </p>
      )}

      <section aria-labelledby="ask-buy">
        <h2 id="ask-buy" className="ask-also">Buy something</h2>
        <form className="ask-buy" onSubmit={onCheck}>
          <label>What do you want to buy?
            <input value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. Nitrile gloves, 10 cases" autoComplete="off" required />
          </label>
          <label>About how much?
            <span className="ask-dollar"><span aria-hidden="true">$</span>
              <input type="number" inputMode="numeric" min={1} value={price} onChange={e => setPrice(e.target.value)} placeholder="640" required />
            </span>
          </label>
          <label className="ask-wide">What is it for?
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Membrane prep for aim 2" autoComplete="off" required />
          </label>
          {db.grants.length > 1 && (
            <label className="ask-wide">Pay it from
              <select value={grantId} onChange={e => { setGrantId(e.target.value); if (ask) setAsk({ ...ask, grantId: e.target.value }) }}>
                <option value="">{autoPick ? `Whichever grant fits best (now ${shortName(autoPick)})` : 'Whichever grant fits best'}</option>
                {db.grants.map(g => <option key={g.id} value={g.id}>Your {shortName(g)} grant</option>)}
              </select>
            </label>
          )}
          <button type="submit" className="ask-primary" disabled={checking}>{checking ? 'Checking…' : 'Check'}</button>
        </form>
      </section>

      {sent && <p role="status" className="ask-sent">{sent} <a href="#ask" onClick={toMine}>See my requests</a></p>}

      {checking && <p role="status" className="ask-sub">The purchasing agent is checking whether a grant can pay for this kind of thing at all…</p>}

      {ask && !sent && (
        <>
          <Verdict key={`${ask.item}|${ask.price}|${ask.purpose}|${ask.category}|${ask.grantId}`} db={db} ask={ask} onSent={m => { setSent(m); setAsk(null); setItem(''); setPrice(''); setPurpose(''); setGrantId('') }} />
          <p className="ask-read">
            We read the kind of thing as{' '}
            <label className="ask-sr" htmlFor="ask-cat">Kind of thing</label>
            <select id="ask-cat" value={ask.category} onChange={e => setAsk({ ...ask, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </p>
        </>
      )}

      <section aria-labelledby="ask-questions">
        <h2 id="ask-questions" className="ask-also">Check on your grants</h2>
        <div className="ask-chips">
          {TOPICS.map(t => (
            <button key={t.id} type="button" aria-pressed={topic === t.id && !ask} onClick={() => { latest.current++; setChecking(false); setTopic(t.id); setAsk(null); setSent('') }}>{t.label}</button>
          ))}
        </div>
      </section>

      {topic && !ask && (
        <section aria-label="Answer" className="ask-answer">
          <h2>{TOPICS.find(t => t.id === topic)!.label}</h2>
          <TopicAnswer db={db} topic={topic} me={me} />
        </section>
      )}

      <div id="ask-mine"><MyRequests /></div>
    </div>
  )
}
