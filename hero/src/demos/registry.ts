// The five mockups. Each lives in its own folder and owns only that folder.

import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export interface Demo {
  id: 'a' | 'b' | 'c' | 'd' | 'e'
  name: string
  thesis: string
  Component: LazyExoticComponent<ComponentType>
}

export const demos: Demo[] = [
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
