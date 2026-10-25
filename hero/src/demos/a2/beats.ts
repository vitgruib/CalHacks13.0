// The story's chapters and when each starts (feed ms after a restart), so the
// sidebar can list them and jump. A jump restarts the story and fast-forwards,
// the same way ?at does, so whatever is on screen lands in the right state.

import { feed } from '../../feed'
import { act, ui } from './ui'

export const BEATS: { at: number; title: string }[] = [
  { at: 400, title: 'A normal week in the Ortiz Lab' },
  { at: 19600, title: 'The grant is canceled' },
  { at: 30600, title: 'A court restores it' },
  { at: 38600, title: 'The scientist pushes to buy' },
  { at: 48100, title: 'It defends the decision' },
  { at: 58600, title: 'The money lands' },
  { at: 71100, title: 'Rerouted to a grant with time left' },
  { at: 81600, title: 'Not allowed on a federal grant' },
  { at: 91100, title: 'Sent back to refine' },
  { at: 112100, title: 'Exactly at the limit' },
  { at: 123600, title: 'Over the limit: your call' },
  { at: 144600, title: 'A paper credits the wrong grant' },
  { at: 157200, title: 'A bill for a canceled order' },
  { at: 168200, title: 'Payment request, drafted and defended' },
  { at: 190200, title: 'Live' },
]

export const beatIndex = (title: string | undefined) => BEATS.findIndex(b => b.title === title)

/** Clear the viewer's picks and replay the story from the top, or from a chapter. */
export function jumpTo(ms: number) {
  const { tab, sheet } = ui.get()
  ui.reset()
  ui.set({ tab, sheet })
  act(() => {
    feed.restart()
    if (ms > 0) feed.advance(ms)
  })
}
