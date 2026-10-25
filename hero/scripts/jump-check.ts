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

if (failed) process.exit(1)
