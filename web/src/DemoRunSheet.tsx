// The 3-minute demo as a run sheet (T79): one beat per row, with the window
// to open, what to click, and one line to say. The long version, with the
// backup video and judge scenarios, is docs/submission/DEMO-SCRIPT.md.

const BEATS: { at: string; window?: { id: string; label: string }; click: string; say: string }[] = [
  { at: '0:00', window: { id: 'funds', label: 'Funds' }, click: 'Point at the grants and their truly available money.', say: 'GrantGuard is an AI grant office: three agents do the purchasing, the accounting and the payment requests. You are the grant manager.' },
  { at: '0:15', click: 'Cut scripts › Court restored, no cash: The cut, then The court.', say: 'NIH cut this real grant; a court restored it. A court order is not money, so spending stays frozen.' },
  { at: '0:35', click: 'Same card: Payment arrives.', say: 'Only when cash lands does it unfreeze.' },
  { at: '0:45', click: 'Cut scripts › Paid while terminated: The cut, then Money arrives.', say: 'Money on a grant nothing restored may be closeout money, so the agent asks instead of spending it.' },
  { at: '1:00', window: { id: 'inbox', label: 'Inbox' }, click: 'Hand the judge the laptop: decide "Money arrived on canceled K01DK133670" with a reason.', say: 'You decide. It won’t let you skip the reason.' },
  { at: '1:20', click: 'Cut scripts › Bought after the cut: The cut.', say: 'The cut is dated the real day, so a card charge five days later is marked.' },
  { at: '1:35', window: { id: 'invoices', label: 'Invoices' }, click: 'Open the held invoice for the canceled order.', say: 'Each record looks fine alone; the timeline shows it bills an order we canceled.' },
  { at: '1:55', window: { id: 'payment-requests', label: 'Payment requests' }, click: 'Open the drafted request and its follow-up answer.', say: 'It drafts the justification from purchase records and leaves out what’s on hold.' },
  { at: '2:15', window: { id: 'reports', label: 'Reports' }, click: 'Open the flagged paper.', say: 'This paper credits the wrong grant, with the days left to fix the charge.' },
  { at: '2:35', click: 'Scroll down to the scorecard; read the numbers off the screen.', say: 'Planted mistakes from real audits, plus decoys: caught, missed, false alarms.' },
]

export default function DemoRunSheet() {
  return (
    <ol className="run-sheet">
      {BEATS.map(b => (
        <li key={b.at}>
          <span className="run-sheet-at">{b.at}</span>
          <span>
            {b.window && <><a href={`#${b.window.id}`}>{b.window.label}</a>: </>}
            {b.click}
            <q>{b.say}</q>
          </span>
        </li>
      ))}
    </ol>
  )
}
