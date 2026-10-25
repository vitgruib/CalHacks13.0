// Round 3 network mock n5, "Card board": the finance agents as a clay kanban
// board. Requests are cards that slide in from the lab, take a stamp at each
// of the six rules, and land in an outcome tray; invoices and papers work
// through the other two lanes; the grants are coin stacks at the head.

import { Suspense, lazy } from 'react'
import { useWorld } from '../../feed'
import './demo-n5.css'

const Scene = lazy(() => import('./Scene'))

/** The one line of DOM: the story beat now playing. */
function Caption() {
  const w = useWorld()
  return w.beat ? <p className="n5-caption">{w.beat.title}</p> : null
}

export default function Demo() {
  return (
    <div className="demo-n5">
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      <Caption />
    </div>
  )
}
