// Round 3 network mock n4, "Plumbing": money is the hero. The grants are
// closed clay vaults, the agents are valves, a meter and a pump on the pipes
// between them, and a request is a glowing capsule of money drawn toward the
// purchasing valve. Only the canvas and one caption line are on screen.

import { Suspense, lazy } from 'react'
import { useWorld } from '../../feed'
import './n4.css'

const Scene = lazy(() => import('./Scene'))

function Caption() {
  const w = useWorld()
  return <p className="n4-caption">{w.beat?.title ?? ''}</p>
}

export default function Demo() {
  return (
    <div className="demo-n4">
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      <Caption />
    </div>
  )
}
