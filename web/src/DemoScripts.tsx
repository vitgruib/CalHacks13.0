// Cut scripts (T65, T74): grants cut on the real cancellation list (Grant
// Witness, scraped by Apify), each with its researcher. A step asks the
// bookkeeping agent to check that one grant with the list read as it stood on
// a real day (a "check now" for just that grant), so judges watch the agent
// meet the cut as it happened, or drops in a dated court order or payment
// the list doesn't show (real USAspending amounts unless marked simulated).
// Steps go in order and only forward: a check can't take back what the agent
// posted. Start over (Demo controls) runs them again.
import { useState } from 'react'
import { useStore } from './data/store'
import { RESEARCHERS } from './people'
import { Badge } from './ui'
import './DemoScripts.css'

type Event = { kind: 'court_order' | 'payment_received'; source: 'Court notice' | 'Payment system'; summary: string; amount?: number; day?: string }
type Step = { label: string; asOf: string; watch: string } | { label: string; event: Event; watch: string }

interface Script {
  grantId: string
  researcher: string // id in RESEARCHERS
  kind: 'headache' | 'error'
  title: string
  story: string
  steps: Step[]
}

export const SCRIPTS: Script[] = [
  {
    grantId: 'R01AI178875', researcher: 'amara', kind: 'headache', title: 'Terminated for good',
    story: 'NIH terminated this award on 2025-04-17 and no court has restored it. $394,729 of it will never arrive.',
    steps: [
      { label: 'Before the cut', asOf: '2025-04-16', watch: 'Not on the list yet. Nothing changes.' },
      { label: 'The cut', asOf: '2025-04-17', watch: 'The agent posts the cancellation, dated the day NIH terminated it, and spending freezes. No one did anything wrong; the lab has to plan around the gap.' },
    ],
  },
  {
    grantId: 'R01GM155497', researcher: 'kenji', kind: 'error', title: 'Bought after the cut',
    story: 'Terminated 2025-06-04. Five days later a $1,240 card charge (rq-060) was placed on it outside GrantGuard.',
    steps: [
      { label: 'Before the cut', asOf: '2025-06-03', watch: 'Not on the list yet. The card charge looks fine.' },
      { label: 'The cut', asOf: '2025-06-04', watch: 'The cancellation lands dated 2025-06-04, so the agent marks the 2025-06-09 charge: money spent 5 days after the grant was canceled.' },
    ],
  },
  {
    grantId: 'R01HL176691', researcher: 'elena', kind: 'headache', title: 'Court restored, no cash',
    story: 'Terminated 2025-07-31; a court reinstated it on 2026-02-23 (Thakur v. Trump). A court order is not money.',
    steps: [
      { label: 'Before the cut', asOf: '2025-07-30', watch: 'Not on the list yet. Nothing changes.' },
      { label: 'The cut', asOf: '2025-07-31', watch: 'Canceled, dated 2025-07-31. Spending freezes.' },
      { label: 'The court', asOf: '2026-02-23', watch: 'Restored by a court, but the agent keeps spending frozen and raises a flag: no payment has arrived since the cut.' },
      { label: 'Payment arrives', event: { kind: 'payment_received', source: 'Payment system', summary: 'Payment of $64,300 received (simulated).', amount: 64_300 }, watch: 'Simulated payment of $64,300. Money landed after the court order, so spending unfreezes.' },
    ],
  },
  {
    grantId: 'R01GM105672', researcher: 'rahul', kind: 'error', title: 'Only a supplement was cut',
    story: "The list's row is 3R01GM105672-12S1, a $47,738 supplement filed under the award's number. Freezing the whole award would be the mistake.",
    steps: [
      { label: 'Before the cut', asOf: '2025-06-16', watch: 'Not on the list yet. Nothing changes.' },
      { label: 'Listed', asOf: '2025-06-17', watch: 'The agent notes that only supplement S1 was cut and leaves the award running: no freeze, no false alarm.' },
    ],
  },
  {
    grantId: 'K01DK133670', researcher: 'jordan', kind: 'headache', title: 'Paid while terminated',
    story: 'NIH terminated this award on 2025-06-30 and the list still says terminated, yet USAspending shows $34,026 paid on it by November 2025. Is the grant back, or is that closeout money?',
    steps: [
      { label: 'Before the cut', asOf: '2025-06-29', watch: 'Not on the list yet. Nothing changes.' },
      { label: 'The cut', asOf: '2025-06-30', watch: 'Canceled, dated 2025-06-30. Spending freezes.' },
      {
        label: 'Money arrives', event: { kind: 'payment_received', source: 'Payment system', summary: 'Payment of $34,026 received (USAspending outlays, October to November 2025).', amount: 34_026, day: '2025-11-30' },
        watch: 'Money landed, but nothing on record restored the grant. After a termination, money still comes in for costs incurred before it (2 CFR 200.343), so spending stays frozen and the grant manager decides in the Inbox.',
      },
    ],
  },
  {
    grantId: 'F31DC022138', researcher: 'noah', kind: 'headache', title: 'Restored, then cut again',
    story: 'Terminated 2025-05-06; a court restored it on 2025-09-18 (Harvard v. HHS) and money came back. The list now says terminated again, and USAspending ended the award early, on 2025-12-31.',
    steps: [
      { label: 'Before the cut', asOf: '2025-05-05', watch: 'Not on the list yet. Nothing changes.' },
      { label: 'The cut', asOf: '2025-05-06', watch: 'Canceled, dated 2025-05-06. Spending freezes.' },
      {
        label: 'The court', event: { kind: 'court_order', source: 'Court notice', summary: "Harvard v. HHS: a federal court set aside the termination of Harvard's grants, including F31DC022138.", day: '2025-09-18' },
        watch: 'Restored by a court, but spending stays frozen and the agent raises a flag: a court order is not cash.',
      },
      {
        label: 'Money arrives', event: { kind: 'payment_received', source: 'Payment system', summary: 'Payment of $5,116 received (USAspending outlays, October to December 2025).', amount: 5_116, day: '2025-12-31' },
        watch: 'Money landed after the court order, so spending unfreezes.',
      },
      { label: 'Listed again', asOf: '2026-01-31', watch: 'The list still says terminated after the restoration it recorded, so the agent counts the grant as cut again and freezes spending. USAspending agrees: it moved the end to 2025-12-31 and took back $7,739 in January 2026.' },
    ],
  },
]

const kindBadge = { headache: { tone: 'warn', label: 'Financial headache' }, error: { tone: 'bad', label: 'Marked error' } } as const

export default function DemoScripts() {
  const { db, sourceCheck, checkNow, injectStatusEvent } = useStore()
  const [error, setError] = useState<string | null>(null)
  const scripts = SCRIPTS.filter(s => db.grants.some(g => g.id === s.grantId))
  if (scripts.length === 0) return null
  const checking = sourceCheck.pendingSince !== null

  return (
    <div className="demo-scripts">
      <p className="demo-scripts-intro">Each grant below was cut on the real cancellation list. A step checks that one grant with the list as it stood on that day, or drops in a court order or payment the list doesn't show. Start over to run them again.</p>
      {error && <p className="demo-scripts-error">{error}</p>}
      <div className="demo-scripts-grid">
        {scripts.map(s => {
          const day = sourceCheck.grantAsOf[s.grantId] ?? sourceCheck.asOf
          const done = (step: Step) => 'asOf' in step
            ? !!day && day >= step.asOf
            : db.statusEvents.some(e => e.grantId === s.grantId && e.kind === step.event.kind && (!step.event.day || e.day === step.event.day))
          const at = s.steps.reduce((last, step, i) => (done(step) ? i : last), -1)
          const r = RESEARCHERS.find(x => x.id === s.researcher)
          const grant = db.grants.find(g => g.id === s.grantId)!
          const run = (step: Step) => {
            setError(null)
            if ('event' in step) {
              injectStatusEvent({ grantId: s.grantId, ...step.event })
              return
            }
            checkNow(step.asOf, s.grantId).catch(e => setError(`Check failed: ${e instanceof Error ? e.message : String(e)}`))
          }
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
                    <button type="button" disabled={checking || i <= at || i > at + 1} onClick={() => run(step)}
                      title={'asOf' in step ? `Check ${s.grantId} with the real list as it stood on ${step.asOf}` : `Drop in: ${step.event.summary}`}>
                      {step.label}{'asOf' in step ? <small>{step.asOf}</small> : step.event.day && <small>{step.event.day}</small>}
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
