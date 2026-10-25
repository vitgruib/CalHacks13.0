// The mockups. Each lives in its own folder and owns only that folder.
// Round 2 (a1 to a5) refines Clay lab, the humans' pick from round 1 (a to e).

import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export interface Demo {
  id: string
  name: string
  thesis: string
  Component: LazyExoticComponent<ComponentType>
}

/** Round 2: five versions of Clay lab. These are the gallery's keys 1 to 5. */
export const demos: Demo[] = [
  {
    id: 'a1',
    name: 'Lab floor',
    thesis: 'Clay lab grown into a full wet lab, with the finance network inlaid in the office plinth as raised nodes joined by grooves that light as work travels them.',
    Component: lazy(() => import('./a1')),
  },
  {
    id: 'a2',
    name: 'Mobile',
    thesis: 'The finance network hangs over its plinth like a balanced mobile; each agent sways when work reaches it.',
    Component: lazy(() => import('./a2')),
  },
  {
    id: 'a3',
    name: 'Roundtable',
    thesis: 'The agents sit around the one shared record they all read and write, the way the real system works, with the grants inside the ring.',
    Component: lazy(() => import('./a3')),
  },
  {
    id: 'a4',
    name: 'Transit map',
    thesis: 'A tilt-shift miniature: the finance network is a raised transit map whose stations are agents, grants and sources, and requests ride its lines.',
    Component: lazy(() => import('./a4')),
  },
  {
    id: 'a5',
    name: 'Night shift',
    thesis: 'The same lab after dark under bench lamps, the finance network a glowing mesh that pulses as work moves through it.',
    Component: lazy(() => import('./a5')),
  },
]

/** Round 1: the five first directions. Still reachable at #a to #e; Clay lab (#a) is key 6. */
export const earlier: Demo[] = [
  {
    id: 'a',
    name: 'Clay lab',
    thesis: 'The brief taken literally, rendered like a product shot: a matte clay lab on one plinth, the finance network on another, requests arcing between.',
    Component: lazy(() => import('./a')),
  },
  {
    id: 'b',
    name: 'Cutaway',
    thesis: 'An architect’s section model of the science building: lab floors on one side, the grant office wing on the other, pneumatic tubes between.',
    Component: lazy(() => import('./b')),
  },
  {
    id: 'c',
    name: 'Money terrain',
    thesis: 'Each grant is a landform whose height is its truly available money. A cancellation ices it over; a payment thaws it.',
    Component: lazy(() => import('./c')),
  },
  {
    id: 'd',
    name: 'Cyanotype',
    thesis: 'A living technical drawing on Prussian-blue paper. Lines draw themselves as work happens; verdicts land as rubber stamps.',
    Component: lazy(() => import('./d')),
  },
  {
    id: 'e',
    name: 'Rule machine',
    thesis: 'A kinetic sculpture: every request is a ball that rolls through six physical rule gates and drops into bought, rerouted, blocked, or held.',
    Component: lazy(() => import('./e')),
  },
]
