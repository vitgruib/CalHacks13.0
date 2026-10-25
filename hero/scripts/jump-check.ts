// Restart and fast-forward rules the gallery depends on. Runs in `npm run check`.
import { Feed } from '../src/feed/engine'

// Let start() run as it does in a browser, minus the frame loop.
Object.assign(globalThis, { window: globalThis, requestAnimationFrame: () => 0 })

let failed = false
const expect = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`)
  if (!ok) failed = true
}

// Replay or switching mockups restarts mid-story; the story must replay from the top, not fire every beat already due.
const f = new Feed()
f.restart()
f.advance(100_000)
f.restart()
f.advance(64_000)
const w = f.getWorld()
expect('restart mid-story', w.beat?.title === 'The money lands' && w.holds.length === 0, `beat="${w.beat?.title}" holds=${w.holds.length}`)

// The gallery restarts and fast-forwards (?at=) before a lazy mockup subscribes; subscribing must not restart it.
const g = new Feed()
g.restart()
g.advance(64_000)
g.on(() => {})
expect('first subscriber keeps the fast-forward', g.getWorld().beat?.title === 'The money lands', `beat="${g.getWorld().beat?.title}"`)

// The story progress bar must restart with the story, not keep the feed's running clock.
const h = new Feed()
h.restart()
h.advance(150_000)
h.restart()
h.advance(95_100)
const k = h.storyProgress()
expect('story progress restarts', Math.abs(k - 0.5) < 0.01, `progress=${k.toFixed(3)} at 95.1s of 190.2s`)

// No award number or internal id reaches the screen: play the whole story and read every text a scene can show.
const CODE = /R01GM|R21AI|\bR0?1\b|\bR21\b|\b(?:rq|inv|pr|pk|se|h|l|o)-\d/
const n = new Feed()
const shown: string[] = []
n.on(e => {
  if (e.type === 'packet') shown.push(e.packet.label)
  if (e.type === 'beat') shown.push(e.beat.title, e.beat.caption)
  if (e.type === 'rule') shown.push(e.verdict.rule, e.verdict.detail)
  if (e.type === 'paper') shown.push(e.title, ...e.checks.map(c => c.detail))
  if (e.type === 'invoice') shown.push(e.mismatch ?? '')
})
n.restart()
for (let t = 0; t < 230_000; t += 500) {
  n.advance(500)
  const w = n.getWorld()
  for (const g of w.grants) shown.push(g.name, g.frozenReason ?? '')
  for (const r of w.requests) shown.push(r.item, r.purpose, r.explanation, ...r.verdicts.flatMap(v => [v.rule, v.detail]))
  for (const h of w.holds) shown.push(h.title, h.why, h.decision?.reason ?? '', ...h.evidence.flatMap(e => [e.label, e.value]))
  for (const l of w.log) shown.push(l.reason, l.rule ?? '')
  for (const se of w.statusEvents) shown.push(se.summary)
  for (const r of w.researchers) shown.push(r.task)
  for (const node of w.nodes) shown.push(node.label, node.sub ?? '')
}
const leaks = [...new Set(shown.filter(t => CODE.test(t)))]
expect('no award numbers or internal ids on screen', leaks.length === 0, leaks.length ? leaks.slice(0, 4).join(' | ') : `${shown.length} texts checked`)

if (failed) process.exit(1)
