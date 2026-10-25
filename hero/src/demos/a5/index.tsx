// Clay lab round 2, version 5, "Night shift": the lab after dark under bench
// lamps, the finance network a mesh of light, and a dark sidebar dashboard on
// the right (a bottom sheet on a phone). The stage covers only what the
// sidebar leaves free. The root never re-renders, so the Canvas tree only changes from inside.

import { Component, Suspense, lazy, useEffect, useRef, type ReactNode } from 'react'
import './demo-a5.css'
import { Hud } from './Hud'
import { ui } from './store'

const Scene = lazy(() => import('./Scene'))

/** If the 3D can't load (no WebGL, a broken build), the dashboard still works. */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
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
    <div className="demo-a5" ref={root}>
      <div className="a-stage">
        <Guard>
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Guard>
      </div>
      <Hud root={root} />
    </div>
  )
}
