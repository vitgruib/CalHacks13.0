// Round 3 network mock n2 "Robots": the three finance agents as small clay
// robots carrying the work around a deck, driven by the same story feed as a1.
// The only DOM besides the canvas is one caption line with the current beat.

import { Suspense, lazy } from 'react'
import { useWorld } from '../../feed'
import { LabelLayer } from './Labels'
import './demo-n2.css'

const Scene = lazy(() => import('./Scene'))

function Caption() {
  const title = useWorld().beat?.title
  return title ? <p className="n2-caption">{title}</p> : null
}

export default function Demo() {
  return (
    <div className="demo-n2">
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      <LabelLayer />
      <Caption />
    </div>
  )
}
