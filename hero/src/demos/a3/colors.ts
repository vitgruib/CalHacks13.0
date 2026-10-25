// The colour each kind of packet lights its spoke and trail with. One
// palette: warm white for things people send, the outcome glazes for
// answers, cobalt for anything waiting on a person, the money blue for
// money, and amber for a source that changed.

import { Color } from 'three'
import type { Packet } from '../../feed'
import { GLAZE, PAL } from './layout'

const lit = (hex: string, l = 0.14) => new Color(hex).offsetHSL(0, 0, l)
export const TINT = {
  sent: lit('#F3EEE6', 0),
  paper: lit('#F4F0E9', 0),
  accept: lit(GLAZE.accept),
  refine: lit(GLAZE.refine),
  reject: lit('#C2403A', 0.06),
  hold: lit(GLAZE.hold, 0.2),
  money: lit(PAL.money, 0.1),
  alarm: new Color('#F2C46A'),
  quiet: new Color('#9AA6B3'),
}

export function trailColor(p: Packet): Color {
  switch (p.kind) {
    case 'request':
    case 'pushback':
      return TINT.sent
    case 'verdict':
      return p.outcome ? TINT[p.outcome] : TINT.sent
    case 'hold':
      return TINT.hold
    case 'decision':
      return p.outcome === 'reject' ? TINT.reject : TINT.accept
    case 'reading':
      return /no change/.test(p.label) ? TINT.quiet : TINT.alarm
    case 'recheck':
      return TINT.quiet
    case 'charge':
    case 'payment':
      return TINT.money
    default:
      return TINT.paper
  }
}
