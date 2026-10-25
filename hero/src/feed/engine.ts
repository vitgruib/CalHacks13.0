// The scripted feed: a world that plays the GrantGuard story on a virtual
// clock and emits FlowEvents for scenes to animate. Spending, freeze,
// invoice and paper decisions come from server/src/rules.ts, the same
// functions the database module runs, so every verdict here is the one the
// backend would give. A SpacetimeDB source can implement the same surface
// (getWorld, subscribeWorld, on, submit, decide) later.

import {
  canBuyAlone,
  checkInvoice,
  checkPaper,
  daysBetween,
  freezeState,
  rerouteTarget,
  spendingVerdicts,
  trulyAvailable,
} from '../../../server/src/rules'
import { CARD_LIMIT } from '../../../server/src/vocab'
import type {
  AgentRole,
  Beat,
  FlowEvent,
  Grant,
  Hold,
  HoldKind,
  LogRow,
  Outcome,
  Packet,
  PacketKind,
  Request,
  RequestInput,
  Source,
  StatusEvent,
  StatusEventKind,
  Verdict,
  World,
} from './types'
import { kindOf } from './items'
import { AGENTS, CANCELED_ORDER_INVOICE, NODES, PAPERS, ROUTINE, SEED_REQUESTS as SEED, SOURCE_NODE, startGrants, startResearchers } from './world'

/** Feed-time durations at 1x speed (ms). Scenes can read these to size their animations. */
export const PACE = {
  travel: 2400, // researcher ↔ purchasing agent
  hop: 1100, // between two finance nodes
  source: 1500, // a government source → bookkeeping
  rule: 480, // one rule check flashing at the purchasing agent
  think: 500, // pause between the last rule and the decision
  revise: 2600, // a researcher fixing a request sent back to refine
  autoDecide: 12000, // the scripted grant manager decides if the viewer doesn't
}

export const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const short = (item: string) => item.split(',')[0]
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10)

interface Job {
  at: number
  seq: number
  fn: () => void
}

type Listener = (e: FlowEvent) => void

export class Feed {
  private t = 0
  private lastReal = 0
  private jobs: Job[] = []
  private seq = 0
  private epoch = 0 // bumps on restart so stale callbacks drop
  private storyStart = 0 // feed time of the last restart
  private storyLength = 0 // feed ms from restart to the last scripted beat
  private listeners = new Set<Listener>()
  private worldListeners = new Set<() => void>()
  private dirty = false
  private w: World
  private n = { rq: 200, hold: 1, se: 1, log: 1, pk: 1 }
  private parked = new Set<string>() // request ids waiting for money to land
  private rand = mulberry32(7)

  constructor() {
    this.w = this.freshWorld()
  }

  // ── Public surface ──────────────────────────────────────────────────────

  /** Feed time in ms. Packet progress = (now() − sentAt) / ms. */
  now = () => this.t
  /** How far through the scripted story we are, 0 to 1 (1 once it goes live). */
  storyProgress = () => (this.storyLength ? Math.min(1, (this.t - this.storyStart) / this.storyLength) : 0)
  getWorld = () => this.w
  subscribeWorld = (fn: () => void) => {
    this.worldListeners.add(fn)
    this.start()
    return () => this.worldListeners.delete(fn)
  }
  on = (fn: Listener) => {
    this.listeners.add(fn)
    this.start()
    return () => {
      this.listeners.delete(fn)
    }
  }

  play() {
    this.patch({ playing: true })
  }
  pause() {
    this.patch({ playing: false })
  }
  setSpeed(speed: number) {
    this.patch({ speed: Math.max(0.25, Math.min(4, speed)) })
  }

  /** Start the story from the top. The gallery calls this when a demo mounts. */
  restart() {
    this.epoch++
    this.jobs = []
    this.parked.clear()
    this.rand = mulberry32(7)
    this.w = { ...this.freshWorld(), playing: this.w.playing, speed: this.w.speed }
    this.dirty = true
    this.storyStart = this.t
    this.emit({ type: 'reset' })
    this.story()
    this.ambientTasks()
    this.flush()
  }

  /** Send a request from a lab member through the real spending rules. Returns its id. */
  submit(input: RequestInput, opts: { id?: string; revisionOf?: string } = {}): string {
    const id = opts.id ?? `rq-${this.n.rq++}`
    const r = this.researcher(input.researcherId)
    const req: Request = {
      id,
      day: this.w.today,
      researcherId: input.researcherId,
      item: input.item,
      kind: kindOf(input.item, input.category),
      category: input.category,
      price: input.price,
      grantId: input.grantId,
      sharedWith: input.sharedWith ?? [],
      split: input.split ?? [],
      purpose: input.purpose ?? '',
      state: 'submitted',
      verdicts: [],
      explanation: 'Waiting for the purchasing agent.',
      revisionOf: opts.revisionOf,
    }
    this.upsert(req)
    this.log('scientist', 'submit_request', `${r.name} asked for ${req.item} (${usd(req.price)}) on ${req.grantId}.`, id)
    this.send('request', `r:${r.id}`, 'a:purchasing', `${short(req.item)} · ${usd(req.price)}`, PACE.travel, { refId: id, amount: req.price }, () =>
      this.evaluate(id),
    )
    return id
  }

  /** What the rules would say right now, without sending anything. */
  preview(input: RequestInput): Outcome {
    const g = this.grant(input.grantId)
    const facts = { category: input.category, price: input.price, sharedWith: input.sharedWith ?? [], split: input.split ?? [] }
    return this.judge(facts, g, spendingVerdicts(facts, g, this.w.today)).outcome
  }

  /** The researcher argues with a hold; the agent re-runs the rules and answers. */
  pushback(requestId: string, message: string) {
    const req = this.req(requestId)
    if (!req) return
    this.log('scientist', 'push_back', message, requestId)
    this.send('pushback', `r:${req.researcherId}`, 'a:purchasing', `“${message}”`, PACE.travel, { refId: requestId }, () => this.evaluate(requestId, true))
  }

  /** The grant manager (the viewer, or the script) decides an open hold. A reason is required. */
  decide(holdId: string, choice: 'approve' | 'reject', reason: string, by: 'viewer' | 'grant_manager' = 'viewer'): string | undefined {
    const hold = this.w.holds.find(h => h.id === holdId)
    if (!hold || !hold.open) return 'That item is no longer waiting for a decision.'
    if (!reason.trim()) return 'Give a reason. Every decision goes in the log with one.'
    reason = this.plain(reason)
    const closed: Hold = { ...hold, open: false, decision: { choice, reason: reason.trim(), by, day: this.w.today } }
    this.patch({ holds: this.w.holds.map(h => (h.id === holdId ? closed : h)) })
    this.emit({ type: 'hold', hold: closed })
    this.log('grant_manager', `decide_hold: ${choice}`, reason.trim(), hold.refId)
    this.send('decision', 'p:grant_manager', `a:${hold.raisedBy}`, choice === 'approve' ? 'Approved' : 'Rejected', PACE.hop, {
      refId: hold.refId,
      outcome: choice === 'approve' ? 'accept' : 'reject',
    }, () => {
      if (hold.kind !== 'purchase') return
      const req = this.req(hold.refId)
      if (!req) return
      if (choice === 'approve') this.recheckThenBuy(req.id, req.grantId, 'accept', `The grant manager approved it: ${reason.trim()}`)
      else this.reply(req.id, 'rejected', 'reject', `The grant manager rejected it: ${reason.trim()}`)
    })
    return undefined
  }

  /** Test-lab style: drop a status event on a grant. */
  inject(kind: 'canceled' | 'court_order' | 'payment_received', grantId: string) {
    if (kind === 'canceled') this.statusEvent(grantId, 'canceled', 'Cancellation list (Apify)', 'Grant appears on the terminated-grants list.')
    else if (kind === 'court_order') this.statusEvent(grantId, 'court_order', 'Court notice', `A court order restores ${grantId}. No payment schedule is set.`)
    else this.statusEvent(grantId, 'payment_received', 'Payment system', 'Payment of $12,000 received.', 12000)
  }

  // ── The story ───────────────────────────────────────────────────────────

  private story() {
    const R01 = 'R01GM061721'
    const R21 = 'R21AI182745'
    // Captions name grants plainly; award numbers never reach the screen.
    const steps: [number, () => void][] = [
      [400, () => this.beat('A normal week in the Ortiz Lab', 'Five researchers, two NIH grants, three AI agents keeping the books. Every request runs through the same spending rules the database enforces.')],
      [1200, () => this.dailyReading()],
      [1800, () => this.submit(ROUTINE[0])],
      [3200, () => this.submit(ROUTINE[2])],
      [13000, () => {
        this.setToday('2026-03-10')
        this.beat('The grant is canceled', 'The mitochondria grant shows up on the terminated-grants list. The bookkeeping agent freezes its spending the moment it reads it.')
        this.statusEvent(R01, 'canceled', 'Cancellation list (Apify)', 'Grant appears on the terminated-grants list.')
      }],
      [5000, () => {
        this.setToday('2026-03-11')
        this.statusEvent(R01, 'canceled', 'NIH RePORTER', 'RePORTER shows the project as terminated.')
      }],
      [6000, () => {
        this.setToday('2026-04-20')
        this.beat('A court restores it', 'A preliminary injunction restores the grant on paper. A court order isn’t cash, so spending stays frozen until money actually arrives.')
        this.statusEvent(R01, 'court_order', 'Court notice', 'Preliminary injunction restores the terminated grants in this class, including the mitochondria grant. No payment schedule is set.')
      }],
      [8000, () => {
        this.setToday('2026-06-15')
        this.beat('The scientist pushes to buy', 'Sam asks for gloves on the restored grant. The purchasing agent holds the order and says why.')
        this.submit(SEED.gloves, { id: SEED.gloves.id })
      }],
      [9500, () => {
        this.beat('It defends the decision', 'Pushed, the agent re-runs the rules and holds its ground. It will buy the moment a payment lands.')
        this.pushback(SEED.gloves.id, 'The court restored it. We need these for tomorrow’s prep.')
      }],
      [10500, () => {
        this.setToday('2026-06-17')
        this.beat('The money lands', `NIH pays $18,600 into the mitochondria grant. The freeze lifts, the agent checks the sources once more, and the gloves go through on their own.`)
        this.statusEvent(R01, 'payment_received', 'Payment system', 'Payment of $18,600 received.', 18600)
      }],
      [12500, () => {
        this.beat('Rerouted to a grant with time left', `Priya’s agar plates are supplies on a grant that ends in ${daysBetween(this.w.today, this.grantMap().get(R21)?.end ?? this.w.today)} days. Auditors disallowed exactly that at WVU and Delaware, so the agent charges the mitochondria grant instead.`)
        this.submit(SEED.agar, { id: SEED.agar.id })
      }],
      [10500, () => {
        this.beat('Not allowed on a federal grant', 'An espresso machine is general office spending. The agent blocks it and cites the UC Davis audit.')
        this.submit(SEED.espresso, { id: SEED.espresso.id })
      }],
      [9500, () => {
        this.beat('Sent back to refine', 'The confocal service contract serves both grants but is charged to one. The agent sends it back, Mateo splits it, and it goes through.')
        this.submit(SEED.confocal, { id: SEED.confocal.id })
      }],
      [21000, () => {
        this.beat('Exactly at the limit', 'A $5,000 kit is at the card limit, not over it, so the agent buys it alone. Decoys like this must not be flagged.')
        this.submit(SEED.detergent, { id: SEED.detergent.id })
      }],
      [11500, () => {
        this.beat('Over the limit: your call', 'A $6,850 pump is over the $5,000 card limit, so the agent asks the grant manager. That’s you: approve or reject it, with a reason.')
        this.submit(SEED.pump, { id: SEED.pump.id })
      }],
      [21000, () => {
        this.beat('A paper credits the wrong grant', 'The payment & report agent checks every paper in the progress report. Priya’s paper is listed under the antibiotic grant, but its acknowledgments name the mitochondria grant.')
        this.sendPaper(PAPERS[0])
      }],
      [1600, () => this.sendPaper(PAPERS[2])],
      [11000, () => {
        this.beat('A bill for a canceled order', 'BioReagents bills $2,400 for an order canceled on March 2. The bookkeeping agent holds the invoice with its timeline.')
        this.sendInvoice()
      }],
      [11000, () => {
        this.beat('Payment request, drafted and defended', `The payment & report agent drafts the mitochondria grant’s payment request from exact purchases, leaves out anything on hold, and answers NIH’s follow-up with the receipts.`)
        this.draftPaymentRequest(R01)
      }],
      [22000, () => {
        this.beat('Live', 'The lab keeps working. Send a request of your own, or step in as the grant manager.')
        this.patch({ storyDone: true })
        this.ambientRequests()
      }],
    ]
    let at = 0
    for (const [wait, fn] of steps) {
      at += wait
      this.after(at, fn)
    }
    this.storyLength = at
  }

  private ambientTasks() {
    for (const r of this.w.researchers) {
      const next = () => {
        const cur = this.researcher(r.id)
        const i = (cur.tasks.indexOf(cur.task) + 1) % cur.tasks.length
        this.patch({ researchers: this.w.researchers.map(x => (x.id === r.id ? { ...x, task: x.tasks[i] } : x)) })
        this.emit({ type: 'task', researcherId: r.id, task: cur.tasks[i] })
        this.after(7000 + this.rand() * 5000, next)
      }
      this.after(2500 + this.rand() * 6000, next)
    }
  }

  private ambientRequests() {
    let i = 0
    const tick = () => {
      if (i % 3 === 2) this.dailyReading()
      else {
        this.setToday(addDays(this.w.today, 1))
        this.submit(ROUTINE[Math.floor(this.rand() * ROUTINE.length)])
      }
      i++
      this.after(8000 + this.rand() * 4000, tick)
    }
    this.after(3000, tick)
  }

  // ── Purchases ───────────────────────────────────────────────────────────

  private evaluate(id: string, pushedBack = false) {
    const req = this.req(id)
    if (!req) return
    const g = this.grant(req.grantId)
    const facts = { category: req.category, price: req.price, sharedWith: req.sharedWith, split: req.split }
    const verdicts = spendingVerdicts(facts, g, this.w.today).map(v => ({ ...v, rule: this.plain(v.rule), detail: this.plain(v.detail) }))
    this.upsert({ ...req, verdicts, outcome: undefined, holdFor: undefined, explanation: 'Checking the spending rules.' })
    verdicts.forEach((v, i) =>
      this.after(PACE.rule * (i + 1), () => this.emit({ type: 'rule', requestId: id, index: i, total: verdicts.length, verdict: v })),
    )
    this.after(PACE.rule * (verdicts.length + 1) + PACE.think, () => this.act(id, verdicts, pushedBack))
  }

  /** The purchasing agent's choice for a set of verdicts (no side effects). */
  private judge(facts: { category: string; price: number; sharedWith: string[]; split: { grantId: string; share: number }[] }, g: Grant, verdicts: Verdict[]) {
    const failed = verdicts.filter(v => !v.pass)
    const is = (prefix: string) => failed.some(v => v.rule.startsWith(prefix))
    if (canBuyAlone(verdicts)) return { outcome: 'accept' as const }
    const target = rerouteTarget(facts, g, this.w.today, this.w.grants)
    if (target) return { outcome: 'refine' as const, reroute: target }
    if (is('Grant is active and not frozen') && g.frozen && !is('Category allowed')) return { outcome: 'hold' as const, holdFor: 'payment' as const }
    if (is('Category allowed')) return { outcome: 'reject' as const }
    if (is('Shared cost split')) return { outcome: 'refine' as const, needsSplit: true }
    if (failed.every(v => v.rule.startsWith('Under the card limit'))) return { outcome: 'hold' as const, holdFor: 'grant_manager' as const }
    return { outcome: 'reject' as const }
  }

  private act(id: string, verdicts: Verdict[], pushedBack: boolean) {
    const req = this.req(id)
    if (!req) return
    const g = this.grant(req.grantId)
    const facts = { category: req.category, price: req.price, sharedWith: req.sharedWith, split: req.split }
    const j = this.judge(facts, g, verdicts)
    const failed = verdicts.filter(v => !v.pass)
    this.parked.delete(id)

    if (j.outcome === 'accept') {
      const how = req.revisionOf ? 'The split is right and every rule passed, so I bought it.' : `Every rule passed and it is ${req.price === CARD_LIMIT ? 'exactly at' : 'under'} the card limit, so I bought it.`
      this.recheckThenBuy(id, req.grantId, 'accept', how)
    } else if (j.outcome === 'refine' && j.reroute) {
      const why = failed[0]
      this.log('purchasing', 'act_on_request: reroute', `${why.rule} failed on ${req.grantId} (${why.detail}) Charging ${j.reroute} instead.`, id)
      this.recheckThenBuy(id, j.reroute, 'refine', `${why.detail} ${why.auditCase ? `(${why.auditCase}.) ` : ''}I charged ${j.reroute} instead, which has time and money left.`)
    } else if (j.outcome === 'hold' && j.holdFor === 'payment') {
      this.parked.add(id)
      const why = g.frozenReason ?? `${g.id} is frozen.`
      const text = pushedBack
        ? `I re-ran every rule. A court order restores the grant on paper, but no payment has arrived since the cancellation, so spending stays frozen. I will buy this the moment money lands.`
        : `Holding this. ${why} I will buy it on my own once a payment arrives.`
      this.log('purchasing', 'act_on_request: hold', text, id)
      this.reply(id, 'submitted', 'hold', text, 'payment')
    } else if (j.outcome === 'hold') {
      const card = failed[0]
      const text = `${usd(req.price)} is over the ${usd(CARD_LIMIT)} card limit, so I asked the grant manager.`
      this.log('purchasing', 'raise_hold', text, id)
      const hold = this.raiseHold('purchase', id, req.grantId, 'purchasing', `${short(req.item)} (${usd(req.price)}) is over the card limit`, card.detail, [
        { label: 'Requested by', value: this.researcher(req.researcherId).name },
        { label: 'Grant', value: g.name },
        { label: 'Truly available', value: usd(g.available) },
        { label: 'Rules', value: `${verdicts.length - failed.length} of ${verdicts.length} passed` },
      ])
      this.reply(id, 'waiting_on_manager', 'hold', text, 'grant_manager')
      this.after(PACE.autoDecide, () => {
        if (this.w.holds.find(h => h.id === hold.id)?.open) this.decide(hold.id, 'approve', 'In the approved budget for aim 3; the quote is on file.', 'grant_manager')
      })
    } else if (j.outcome === 'refine' && j.needsSplit) {
      const why = failed.find(v => v.rule.startsWith('Shared cost split'))!
      const text = `${why.detail} Split it across the grants it serves and send it again. (${why.auditCase}.)`
      this.log('purchasing', 'act_on_request: block', text, id)
      this.reply(id, 'blocked', 'refine', text)
      // The researcher fixes it and sends it again.
      const share = 1 / req.sharedWith.length
      this.after(PACE.travel + PACE.revise, () =>
        this.submit(
          {
            researcherId: req.researcherId,
            item: req.item,
            category: req.category,
            price: req.price,
            grantId: req.grantId,
            purpose: `${req.purpose} (split evenly: ${req.sharedWith.map(gid => this.grant(gid).name.toLowerCase()).join(' and ')})`,
            sharedWith: req.sharedWith,
            split: req.sharedWith.map(gid => ({ grantId: gid, share })),
          },
          { id: `${id}b`, revisionOf: id },
        ),
      )
    } else {
      const why = failed.find(v => v.rule === 'Category allowed') ?? failed[0]
      const text = `${why.detail}${why.auditCase ? ` (${why.auditCase}.)` : ''} I blocked it.`
      this.log('purchasing', 'act_on_request: block', text, id, why.rule)
      this.reply(id, 'blocked', 'reject', text)
    }
  }

  /** Right before money moves: ask bookkeeping to read the sources again, then buy. */
  private recheckThenBuy(id: string, chargeTo: string, outcome: 'accept' | 'refine', explanation: string) {
    this.log('purchasing', 'request_check: before_money_moves', `Checking ${chargeTo} once more before buying.`, id)
    this.send('recheck', 'a:purchasing', 'a:bookkeeping', 'Check again before money moves', PACE.hop, { refId: id }, () => {
      let waiting = 2
      const done = () => {
        if (--waiting > 0) return
        const g = this.grant(chargeTo)
        if (g.frozen) {
          this.parked.add(id)
          this.reply(id, 'submitted', 'hold', `Holding this. ${g.frozenReason ?? `${g.id} is frozen.`}`, 'payment')
          return
        }
        this.send('recheck', 'a:bookkeeping', 'a:purchasing', `${chargeTo}: still good`, PACE.hop, { refId: id }, () => this.buy(id, chargeTo, outcome, explanation))
      }
      this.send('reading', 's:reporter', 'a:bookkeeping', `${chargeTo}: no change`, PACE.source, { refId: id }, done)
      this.send('reading', 's:usaspending', 'a:bookkeeping', `${chargeTo}: no change`, PACE.source, { refId: id }, done)
    })
  }

  private buy(id: string, chargeTo: string, outcome: 'accept' | 'refine', explanation: string) {
    const req = this.req(id)
    if (!req) return
    const charges = req.split.length ? req.split : [{ grantId: chargeTo, share: 1 }]
    for (const c of charges) {
      const amount = Math.round(req.price * c.share)
      this.bump(c.grantId, { promised: amount })
      this.send('charge', `g:${c.grantId}`, 'v:vendors', `${usd(amount)} order`, PACE.hop, { refId: id, amount })
    }
    this.log('purchasing', outcome === 'refine' ? 'act_on_request: reroute' : 'act_on_request: buy', explanation, id)
    const state = outcome === 'refine' ? 'rerouted' : 'bought'
    this.reply(id, state, outcome, explanation, undefined, chargeTo !== req.grantId ? chargeTo : undefined)
  }

  /** Update the request and send the answer back to the researcher who asked. */
  private reply(id: string, state: Request['state'], outcome: Outcome, explanation: string, holdFor?: Request['holdFor'], chargedGrantId?: string) {
    const req = this.req(id)
    if (!req) return
    explanation = this.plain(explanation.charAt(0).toUpperCase() + explanation.slice(1))
    const next: Request = { ...req, state, outcome, explanation, holdFor, chargedGrantId: chargedGrantId ?? req.chargedGrantId }
    this.upsert(next)
    const word = { accept: 'Bought', refine: chargedGrantId ? `Rerouted to ${chargedGrantId}` : 'Sent back: split it', reject: 'Blocked', hold: holdFor === 'grant_manager' ? 'Waiting on the grant manager' : 'Held until money lands' }[outcome]
    this.send('verdict', 'a:purchasing', `r:${req.researcherId}`, `${word} · ${short(req.item)}`, PACE.travel, { refId: id, outcome, holdFor })
  }

  // ── Fund tracker ────────────────────────────────────────────────────────

  private statusEvent(grantId: string, kind: StatusEventKind, source: Source, summary: string, amount?: number) {
    const from = SOURCE_NODE[source]
    const pk: PacketKind = kind === 'payment_received' ? 'payment' : 'reading'
    const label = kind === 'payment_received' ? `${usd(amount ?? 0)} arrives` : kind === 'canceled' ? `${grantId}: terminated` : kind === 'court_order' ? `${grantId}: restored by court` : `${grantId}: changed`
    this.send(pk, from, 'a:bookkeeping', label, PACE.source, { amount }, () => {
      const ev: StatusEvent = { id: `se-${this.n.se++}`, grantId, day: this.w.today, kind, source, summary: this.plain(summary), amount }
      this.patch({ statusEvents: [ev, ...this.w.statusEvents].slice(0, 30) })
      const before = this.grant(grantId)
      if (kind === 'payment_received' && amount) this.bump(grantId, { received: amount })
      this.recompute(grantId)
      const after = this.grant(grantId)
      this.log('bookkeeping', 'post_status_event', `${source}: ${summary}`, grantId)
      this.emit({ type: 'grant', grant: after, event: ev })
      if (kind === 'court_order' && after.frozen) {
        this.log('bookkeeping', 'raise_flag: court_order_no_payment', `A court restored ${grantId}, but no payment has arrived since the cancellation. Spending stays frozen.`, grantId)
      }
      if (before.frozen && !after.frozen) {
        // Money landed: everything parked on this grant goes again.
        let k = 0
        for (const id of [...this.parked]) {
          if (this.req(id)?.grantId !== grantId) continue
          this.after(900 + 1200 * k++, () => this.evaluate(id))
        }
      }
    })
  }

  private recompute(grantId: string) {
    const g = this.grant(grantId)
    const events = this.w.statusEvents.filter(e => e.grantId === grantId).slice().reverse()
    const f = freezeState(g.status === 'ended' ? 'ended' : 'active', events, false)
    this.setGrant({ ...g, status: f.status as Grant['status'], frozen: f.frozen, frozenReason: f.frozenReason && this.plain(f.frozenReason) })
  }

  private dailyReading() {
    for (const g of this.w.grants) {
      this.send('reading', 's:reporter', 'a:bookkeeping', `${g.id}: no change`, PACE.source)
      this.send('reading', 's:usaspending', 'a:bookkeeping', `${g.id}: no change`, PACE.source)
    }
    this.log('bookkeeping', 'daily check', 'Read NIH RePORTER and USAspending for both grants. No changes.')
  }

  // ── Invoices, papers, payment requests ─────────────────────────────────

  private sendInvoice() {
    const { invoice, order, approvals } = CANCELED_ORDER_INVOICE
    this.send('invoice', 'v:vendors', 'a:bookkeeping', `${invoice.vendor} · ${usd(invoice.amount)}`, PACE.source, { refId: invoice.id, amount: invoice.amount }, () => {
      const v = checkInvoice(invoice, order, approvals)
      this.emit({ type: 'invoice', invoiceId: invoice.id, vendor: invoice.vendor, amount: invoice.amount, matched: v.matched, mismatch: v.mismatch })
      this.log('bookkeeping', v.matched ? 'check_invoice: matched' : 'check_invoice: held', v.mismatch ?? 'Matches the order and approval.', invoice.id)
      if (!v.matched) {
        const hold = this.raiseHold('invoice', invoice.id, undefined, 'bookkeeping', `${invoice.vendor} bill for a canceled order`, v.mismatch ?? '', v.timeline.map(t => ({ label: t.day, value: t.what })))
        this.after(PACE.autoDecide, () => {
          if (this.w.holds.find(h => h.id === hold.id)?.open) this.decide(hold.id, 'reject', 'The order was canceled before it shipped. Asked the vendor for a credit memo.', 'grant_manager')
        })
      }
    })
  }

  private sendPaper(p: (typeof PAPERS)[number]) {
    this.send('paper', `r:${p.researcherId}`, 'a:payment_report', short(p.title), PACE.travel, { refId: p.id }, () => {
      const c = checkPaper(p)
      const result = c.result as 'ok' | 'note' | 'held'
      const checks = c.checks.map(x => ({ ...x, detail: this.plain(x.detail) }))
      this.emit({ type: 'paper', researcherId: p.researcherId, paperId: p.id, title: p.title, result, checks })
      const failed = checks.find(x => !x.pass)
      this.log('payment_report', `check_paper: ${result}`, failed?.detail ?? 'Credits the right grant and has a PMCID.', p.id)
      if (result === 'held') {
        const hold = this.raiseHold('report', p.id, p.grantId, 'payment_report', `Paper credits the wrong grant: ${short(p.title)}`, failed?.detail ?? '', checks.map(x => ({ label: x.check, value: x.detail })))
        this.after(PACE.autoDecide, () => {
          if (this.w.holds.find(h => h.id === hold.id)?.open) this.decide(hold.id, 'approve', `Moved the paper to the ${p.creditsGrantId} report, where its acknowledgments point.`, 'grant_manager')
        })
      }
    })
  }

  private draftPaymentRequest(grantId: string) {
    const included = this.w.requests.filter(r => (r.chargedGrantId ?? r.grantId) === grantId && (r.state === 'bought' || r.state === 'rerouted') && !r.split.length)
    const heldOut = this.w.requests.filter(r => r.grantId === grantId && (r.state === 'waiting_on_manager' || r.state === 'submitted'))
    const amount = included.reduce((s, r) => s + r.price, 0)
    const id = 'pr-016'
    const hold = this.raiseHold('payment_request', id, grantId, 'payment_report', `Payment request: ${usd(amount)} for ${grantId}`, `Drafted from ${included.length} exact purchase records. ${heldOut.length ? `Left out ${heldOut.length} item(s) still on hold.` : 'Nothing on hold was included.'}`, included.slice(0, 5).map(r => ({ label: short(r.item), value: `${usd(r.price)} · ${r.day}` })))
    this.log('payment_report', 'draft_payment_request', `Drafted a payment request for ${usd(amount)} from ${included.length} purchases.`, id)
    this.after(5000, () => {
      if (this.w.holds.find(h => h.id === hold.id)?.open) this.decide(hold.id, 'approve', 'Totals match the purchase records.', 'grant_manager')
      if (this.w.holds.find(h => h.id === hold.id)?.decision?.choice !== 'approve') return
      this.after(PACE.hop + 400, () =>
        this.send('payment_request', 'a:payment_report', 'p:funder', `Payment request · ${usd(amount)}`, PACE.source, { refId: id, amount }, () => {
          this.send('follow_up', 'p:funder', 'a:payment_report', 'What were the reagent costs?', PACE.source, { refId: id }, () => {
            const reagents = included.filter(r => r.category === 'reagents' || r.category === 'lab supplies')
            const answer = reagents.map(r => `${short(r.item)} ${usd(r.price)} (${r.day})`).join('; ') || 'No reagent purchases in this period.'
            this.log('payment_report', 'answer_follow_up', answer, id)
            this.send('payment_request', 'a:payment_report', 'p:funder', 'Answer: exact purchases', PACE.source, { refId: id })
          })
        }),
      )
    })
  }

  // ── Holds, log, beats ──────────────────────────────────────────────────

  private raiseHold(kind: HoldKind, refId: string, grantId: string | undefined, raisedBy: AgentRole, title: string, why: string, evidence: Hold['evidence']): Hold {
    title = this.plain(title)
    why = this.plain(why)
    evidence = evidence.map(e => ({ label: this.plain(e.label), value: this.plain(e.value) }))
    const hold: Hold = { id: `h-${this.n.hold++}`, kind, refId, grantId, raisedBy, day: this.w.today, title, why, evidence, options: ['approve', 'reject'], open: true }
    // It reaches the grant manager's Inbox when the packet lands.
    this.send('hold', `a:${raisedBy}`, 'p:grant_manager', title, PACE.hop, { refId }, () => {
      this.patch({ holds: [hold, ...this.w.holds].slice(0, 30) })
      this.emit({ type: 'hold', hold })
    })
    return hold
  }

  private log(actor: LogRow['actor'], action: string, reason: string, refId?: string, rule?: string) {
    const row: LogRow = { id: `l-${this.n.log++}`, day: this.w.today, actor, action, reason: this.plain(reason), refId, rule: rule && this.plain(rule) }
    this.patch({ log: [row, ...this.w.log].slice(0, 80) })
    this.emit({ type: 'log', row })
  }

  /** Award numbers never reach the screen: each becomes "the <plain name>", capitalised where a sentence starts. */
  private plain(text: string) {
    for (const g of this.w.grants) {
      const name = g.name.toLowerCase()
      text = text.replace(new RegExp(`([.!?:]\\s+)?(?:the )?${g.id}`, 'g'), (_m, stop: string | undefined, at: number) =>
        stop !== undefined || at === 0 ? `${stop ?? ''}The ${name}` : `the ${name}`,
      )
    }
    return text
  }

  private beat(title: string, caption: string) {
    const beat: Beat = { id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title, caption: this.plain(caption) }
    this.patch({ beat })
    this.emit({ type: 'beat', beat })
  }

  private setToday(today: string) {
    this.patch({ today })
  }

  // ── Plumbing ───────────────────────────────────────────────────────────

  private freshWorld(): World {
    return {
      today: '2026-03-09',
      grants: startGrants(),
      researchers: startResearchers(),
      agents: AGENTS,
      nodes: NODES,
      requests: [],
      holds: [],
      statusEvents: [],
      log: [],
      packets: [],
      storyDone: false,
      playing: true,
      speed: 4,
    }
  }

  private send(kind: PacketKind, from: string, to: string, label: string, ms: number, extra: Partial<Packet> = {}, onArrive?: () => void) {
    const packet: Packet = { id: `pk-${this.n.pk++}`, kind, from, to, label: this.plain(label), ms, sentAt: this.t, ...extra }
    this.patch({ packets: [...this.w.packets, packet] })
    this.emit({ type: 'packet', packet })
    this.after(ms, () => {
      this.patch({ packets: this.w.packets.filter(p => p.id !== packet.id) })
      this.emit({ type: 'arrive', packet })
      onArrive?.()
    })
  }

  private upsert(req: Request) {
    const exists = this.w.requests.some(r => r.id === req.id)
    this.patch({ requests: exists ? this.w.requests.map(r => (r.id === req.id ? req : r)) : [req, ...this.w.requests].slice(0, 60) })
    this.emit({ type: 'request', request: req })
  }

  private bump(grantId: string, d: { promised?: number; received?: number; spent?: number }) {
    const g = this.grant(grantId)
    const next = { ...g, promised: g.promised + (d.promised ?? 0), received: g.received + (d.received ?? 0), spent: g.spent + (d.spent ?? 0) }
    this.setGrant({ ...next, available: trulyAvailable(next) })
    this.emit({ type: 'grant', grant: this.grant(grantId) })
  }

  private setGrant(g: Grant) {
    this.patch({ grants: this.w.grants.map(x => (x.id === g.id ? g : x)) })
  }

  private grant = (id: string) => this.w.grants.find(g => g.id === id) ?? this.w.grants[0]
  private grantMap = () => new Map(this.w.grants.map(g => [g.id, g]))
  private req = (id: string) => this.w.requests.find(r => r.id === id)
  private researcher = (id: string) => this.w.researchers.find(r => r.id === id) ?? this.w.researchers[0]

  private patch(p: Partial<World>) {
    this.w = { ...this.w, ...p }
    this.dirty = true
  }

  private emit(e: FlowEvent) {
    for (const fn of this.listeners) fn(e)
  }

  private at(t: number, fn: () => void) {
    const epoch = this.epoch
    this.jobs.push({ at: t, seq: this.seq++, fn: () => epoch === this.epoch && fn() })
  }

  private after(ms: number, fn: () => void) {
    this.at(this.t + ms, fn)
  }

  /** Advance feed time by `ms` and run whatever came due. Exposed for tests. */
  advance(ms: number) {
    const end = this.t + ms
    for (;;) {
      let next = -1
      for (let i = 0; i < this.jobs.length; i++) {
        const j = this.jobs[i]
        if (j.at <= end && (next < 0 || j.at < this.jobs[next].at || (j.at === this.jobs[next].at && j.seq < this.jobs[next].seq))) next = i
      }
      if (next < 0) break
      const [job] = this.jobs.splice(next, 1)
      this.t = Math.max(this.t, job.at)
      job.fn()
    }
    this.t = end
    this.flush()
  }

  private flush() {
    if (!this.dirty) return
    this.dirty = false
    for (const fn of this.worldListeners) fn()
  }

  /**
   * Stop the clock's frame loop while nobody can see the story (an embed scrolled
   * out of view, or a hidden tab); it picks up where it was. Unlike pause(), the
   * player still reads as playing.
   */
  setAwake(awake: boolean) {
    if (this.asleep === !awake) return
    this.asleep = !awake
    if (!this.started) return
    cancelAnimationFrame(this.raf)
    if (awake) {
      this.lastReal = performance.now()
      this.raf = requestAnimationFrame(this.loop)
    }
  }

  private started = false
  private asleep = false
  private raf = 0
  private loop = (now: number) => {
    const dt = Math.min(100, now - this.lastReal) // a hidden tab doesn't fast-forward on return
    this.lastReal = now
    if (this.w.playing) this.advance(dt * this.w.speed)
    else this.flush() // decisions, requests and speed changes made while paused still reach the screen
    this.raf = requestAnimationFrame(this.loop)
  }
  private start() {
    if (this.started || typeof window === 'undefined') return
    this.started = true
    if (this.epoch === 0) this.restart() // the gallery may already have started (and fast-forwarded) the story
    this.lastReal = performance.now()
    if (!this.asleep) this.raf = requestAnimationFrame(this.loop)
  }
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
