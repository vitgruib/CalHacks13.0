// Cut scripts (T65, T74): the three in the 3-minute demo, grants cut on the real cancellation list (Grant
// Witness, scraped by Apify), each with its researcher. Each step changes the
// grant directly: it drops in the cancellation, court order or payment that
// really happened, dated the day it happened (real USAspending amounts unless
// marked simulated), and the agents react to it. No step moves the clock or
// reads the list as of another day. Steps go in order and only forward: the
// agent can't take back what it posted. Start over (Demo controls) runs them again.
import { useStore } from './data/store'
import { RESEARCHERS } from './people'
import { Badge } from './ui'
import './DemoScripts.css'

type Event = { kind: 'canceled' | 'court_order' | 'payment_received'; source: 'Cancellation list (Apify)' | 'Court notice' | 'Payment system'; summary: string; amount?: number; day?: string }
type Step = { label: string; event: Event; watch: string }

interface Script {
  grantId: string
  researcher: string // id in RESEARCHERS
  kind: 'headache' | 'error'
  title: string
  story: string
  steps: Step[]
}

const LIST = 'Cancellation list (Apify)' as const
const cut = (grantId: string, day: string, by = 'NIH'): Event => ({ kind: 'canceled', source: LIST, summary: `${by} terminated ${grantId}; it appears on the cancellation list.`, day })

export const SCRIPTS: Script[] = [
  {
    grantId: 'R01GM155497', researcher: 'kenji', kind: 'error', title: 'Bought after the cut',
    story: 'Terminated 2025-06-04. Five days later a $1,240 card charge (rq-060) was placed on it outside GrantGuard.',
    steps: [
      { label: 'The cut', event: cut('R01GM155497', '2025-06-04'), watch: 'The cancellation lands dated 2025-06-04, so the agent marks the 2025-06-09 charge: money spent 5 days after the grant was canceled.' },
    ],
  },
  {
    grantId: 'R01HL176691', researcher: 'elena', kind: 'headache', title: 'Court restored, no cash',
    story: 'Terminated 2025-07-31; a court reinstated it on 2026-02-23 (Thakur v. Trump). A court order is not money.',
    steps: [
      { label: 'The cut', event: cut('R01HL176691', '2025-07-31'), watch: 'Canceled, dated 2025-07-31. Spending freezes.' },
      {
        label: 'The court', event: { kind: 'court_order', source: 'Court notice', summary: 'Thakur v. Trump: a federal court reinstated R01HL176691.', day: '2026-02-23' },
        watch: 'Restored by a court, but the agent keeps spending frozen and raises a flag: no payment has arrived since the cut.',
      },
      { label: 'Payment arrives', event: { kind: 'payment_received', source: 'Payment system', summary: 'Payment of $64,300 received (simulated).', amount: 64_300 }, watch: 'Simulated payment of $64,300. Money landed after the court order, so spending unfreezes.' },
    ],
  },
  {
    grantId: 'K01DK133670', researcher: 'jordan', kind: 'headache', title: 'Paid while terminated',
    story: 'NIH terminated this award on 2025-06-30 and the list still says terminated, yet USAspending shows $34,026 paid on it by November 2025. Is the grant back, or is that closeout money?',
    steps: [
      { label: 'The cut', event: cut('K01DK133670', '2025-06-30'), watch: 'Canceled, dated 2025-06-30. Spending freezes.' },
      {
        label: 'Money arrives', event: { kind: 'payment_received', source: 'Payment system', summary: 'Payment of $34,026 received (USAspending outlays, October to November 2025).', amount: 34_026, day: '2025-11-30' },
        watch: 'Money landed, but nothing on record restored the grant. After a termination, money still comes in for costs incurred before it (2 CFR 200.343), so spending stays frozen and the grant manager decides in the Inbox.',
      },
    ],
  },
]

const kindBadge = { headache: { tone: 'warn', label: 'Financial headache' }, error: { tone: 'bad', label: 'Marked error' } } as const

export default function DemoScripts() {
  const { db, injectStatusEvent } = useStore()
  const scripts = SCRIPTS.filter(s => db.grants.some(g => g.id === s.grantId))
  if (scripts.length === 0) return null

  return (
    <div className="demo-scripts">
      <p className="demo-scripts-intro">Each grant below was cut on the real cancellation list. A step changes the grant directly: it cancels it, restores it by court order or lands a payment, dated the day that really happened. Start over to run them again.</p>
      <div className="demo-scripts-grid">
        {scripts.map(s => {
          const done = (step: Step) => db.statusEvents.some(e => e.grantId === s.grantId && e.kind === step.event.kind && (!step.event.day || e.day === step.event.day))
          const at = s.steps.reduce((last, step, i) => (done(step) ? i : last), -1)
          const r = RESEARCHERS.find(x => x.id === s.researcher)
          const grant = db.grants.find(g => g.id === s.grantId)!
          return (
            <article key={s.grantId} className={`demo-script ${s.kind}`}>
              <div className="demo-script-head">
                <Badge tone={kindBadge[s.kind].tone}>{kindBadge[s.kind].label}</Badge>
                <h3>{s.title}</h3>
              </div>
              <p className="demo-script-who">{r?.title ?? ''} · {grant.pi} · <b>{s.grantId}</b></p>
              <p>{s.story}</p>
              <ol className="demo-script-steps">
                {s.steps.map((step, i) => (
                  <li key={step.label} className={i <= at ? 'done' : ''}>
                    <button type="button" disabled={i <= at || i > at + 1} onClick={() => injectStatusEvent({ grantId: s.grantId, ...step.event })} title={step.event.summary}>
                      {step.label}{step.event.day && <small>{step.event.day}</small>}
                    </button>
                    {i === at && <p className="demo-script-watch">{step.watch}</p>}
                  </li>
                ))}
              </ol>
            </article>
          )
        })}
      </div>
    </div>
  )
}
