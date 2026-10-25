// Clay lab round 2, version 1 "Lab floor": round 1's two clay plinths grown
// into a full wet lab and an inlaid finance network, with a sidebar dashboard
// on the right. The stage holds only the canvas; the sidebar never covers it.
// The root never re-renders, so the Canvas tree only changes from inside.

import { Component, Suspense, lazy, useEffect, useRef, type ReactNode } from 'react'
import './demo-a1.css'
import { Hud } from './Hud'
import { ui } from './store'

const Scene = lazy(() => import('./Scene'))

/** If the 3D scene fails, the dashboard keeps working beside an empty stage. */
class SceneGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export default function Demo() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ui.reset()
    return () => ui.reset()
  }, [])
  return (
    <div className="demo-a1" ref={root}>
      <div className="a-stage">
        <SceneGuard>
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </SceneGuard>
      </div>
      <Hud root={root} />
    </div>
  )
}
