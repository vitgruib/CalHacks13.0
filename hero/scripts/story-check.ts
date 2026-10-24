// Headless run of the scripted story: prints beats, verdicts and holds.
import { Feed } from '../src/feed/engine'
const f = new Feed()
const seen: string[] = []
f.on(e => {
  if (e.type === 'beat') seen.push(`\n== ${e.beat.title}`)
  if (e.type === 'request' && e.request.outcome) seen.push(`  ${e.request.id} ${e.request.item} -> ${e.request.state}/${e.request.outcome}${e.request.chargedGrantId ? ' on ' + e.request.chargedGrantId : ''}${e.request.holdFor ? ' (' + e.request.holdFor + ')' : ''} | ${e.request.explanation}`)
  if (e.type === 'grant' && e.event) seen.push(`  GRANT ${e.grant.id} ${e.grant.status} frozen=${e.grant.frozen}`)
  if (e.type === 'hold') seen.push(`  HOLD ${e.hold.id} ${e.hold.kind} open=${e.hold.open} ${e.hold.title}${e.hold.decision ? ' -> ' + e.hold.decision.choice + ': ' + e.hold.decision.reason : ''}`)
  if (e.type === 'paper') seen.push(`  PAPER ${e.paperId} ${e.result}`)
  if (e.type === 'invoice') seen.push(`  INVOICE ${e.invoiceId} matched=${e.matched} ${e.mismatch ?? ''}`)
})
f.restart()
for (let i = 0; i < 260; i++) f.advance(1000)
console.log(seen.join('\n'))
const w = f.getWorld()
console.log('\ntoday', w.today, 'storyDone', w.storyDone, 'packets in flight', w.packets.length, 'log rows', w.log.length)
console.log(w.grants.map(g => `${g.id} ${g.status} frozen=${g.frozen} avail=${g.available} promised=${g.promised}`).join('\n'))
