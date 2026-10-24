// Restarting mid-story must replay the story from the top, not fire every beat already due.
import { Feed } from '../src/feed/engine'
const f = new Feed()
f.restart()
f.advance(100_000)
f.restart()
f.advance(64_000)
const w = f.getWorld()
const r01 = w.grants.find(g => g.id === 'R01GM000001')!
console.log(`after restart at t=100s, +64s: beat="${w.beat?.title}" R01 frozen=${r01.frozen} holds=${w.holds.length}`)
if (w.beat?.title !== 'The money lands' || w.holds.length) process.exit(1)
