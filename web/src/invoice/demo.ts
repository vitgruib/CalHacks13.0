// Sample invoices for the researcher's Invoice landing, so "Need your action"
// and "Approved" always have something to open in a demo. They are built from
// the app's own records (the same checks run on them), shown only to fill a
// short list, and never saved unless the researcher revises one.
import type { Db } from '../data/types'
import { check, sampleDraft, blankDraft, type AuditEntry, type Draft, type Status, type Submission } from './model'

const daysAgo = (today: string, n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)

function build(db: Db, researcher: string, id: string, draft: Draft, ago: number, finish: (checked: ReturnType<typeof check>) => { status: Status; audit: AuditEntry[] }): Submission {
  const checked = check(draft, db, [], id)
  const { status, audit } = finish(checked)
  return { ...draft, id, researcher, submittedOn: daysAgo(db.today, ago), status, findings: checked.findings, effect: checked.effect, poId: checked.poId, audit }
}

const flagged = (c: ReturnType<typeof check>) => c.findings.filter(f => f.level !== 'ok' && f.area !== 'Authorization').length

export function demoSubmissions(db: Db, researcher: string): { action: Submission[]; approved: Submission[] } {
  const day = (n: number) => daysAgo(db.today, n)
  const grantId = db.grants.find(g => g.id === 'R21AI182745')?.id ?? db.grants[0]?.id ?? ''
  const base = (over: Partial<Draft>): Draft => ({ ...blankDraft(grantId), receipt: true, receiptFiles: ['receipt.pdf'], files: ['invoice.pdf'], ...over })

  const asked = (n: number, what: string): AuditEntry[] => [
    { day: day(n), who: researcher, what: 'submitted an invoice' },
  ].concat(what ? [{ day: day(n), who: 'Invoice agent', what }] : [])

  // Needs the researcher: the standout $800 overrun, a question from the grant office, a likely duplicate.
  const action = [
    build(db, researcher, 'demo-seq', { ...sampleDraft() }, 1, c => ({ status: c.status, audit: asked(1, `checked the invoice: ${flagged(c)} ${flagged(c) === 1 ? 'thing needs' : 'things need'} review. Payment paused until a decision is recorded.`) })),
    build(db, researcher, 'demo-vertex', base({
      vendor: 'Vertex Lab Supply', invoiceDate: day(6), amount: '1150',
      lines: [{ description: 'Pipette tips, 10 racks', amount: '760' }, { description: 'Sterile culture plates, 6 packs', amount: '390' }],
    }), 4, c => ({
      status: 'clarification',
      audit: [
        ...asked(4, `checked the invoice: ${flagged(c)} ${flagged(c) === 1 ? 'thing needs' : 'things need'} review.`),
        { day: day(2), who: 'Grant manager', what: 'asked the researcher for clarification.', why: 'The receipt lists a different delivery address. Please attach the delivery note for this order.' },
      ],
    })),
    build(db, researcher, 'demo-dup', base({
      vendor: 'BioReagents Inc', invoiceDate: day(3), amount: '2400',
      lines: [{ description: 'Ceftazidime-avibactam reference powder', amount: '2400' }],
    }), 2, c => ({ status: c.status, audit: asked(2, `checked the invoice: possible duplicate found. Payment paused until a decision is recorded.`) })),
  ]

  // Done: approved with a reason on the record.
  const approvedOf = (id: string, d: Draft, ago: number, why: string) => build(db, researcher, id, d, ago, c => ({
    status: 'approved',
    audit: [
      ...asked(ago, flagged(c) === 0 ? 'checked the invoice: no problems found. Ready for the grant office.' : `checked the invoice: ${flagged(c)} ${flagged(c) === 1 ? 'thing needs' : 'things need'} review.`),
      { day: day(Math.max(0, ago - 1)), who: 'Grant manager', what: 'approved the invoice. Payment may proceed; an accounting entry is prepared for posting.', why },
    ],
  }))
  const approved = [
    approvedOf('demo-spin', base({ vendor: 'SpinWorks', invoiceDate: day(20), amount: '6200', lines: [{ description: 'Orbital plate shaker', amount: '6200' }] }), 18, 'Matches the approved order and its approval; within the grant budget.'),
    approvedOf('demo-media', base({ vendor: 'MicroMedia', invoiceDate: day(33), amount: '1180', lines: [{ description: 'Agar plates, 40 packs', amount: '1180' }] }), 31, 'Matches the purchase order. Receipt on file.'),
  ]
  return { action, approved }
}
