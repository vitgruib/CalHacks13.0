// Clay lab round 2, version 2, "Mobile": the lab plinth front left, the
// finance network hanging above it like a balanced mobile, and a warm
// sidebar dashboard on the left (a bottom sheet on a phone).
// The root never re-renders, so the Canvas tree only changes from inside.

import { Component, Suspense, lazy, useEffect, useRef, type ReactNode } from 'react'
import { bare } from '../../chrome'
import './demo-a2.css'
import { Hud } from './Hud'
import { ui } from './ui'

// The scene loads on its own, so the dashboard still works if the 3D cannot start.
const Scene = lazy(() => import('./Scene'))

class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

// The gallery strip sits at the bottom of the window unless the page is bare (?bare, or a deploy build); the sidebar keeps clear of it.
const gallery = !bare

export default function Demo() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ui.reset()
    return () => ui.reset()
  }, [])
  return (
    <div className="demo-a2" ref={root} data-gallery={gallery ? '' : undefined}>
      <div className="a-stage">
        <Quiet>
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Quiet>
      </div>
      <Hud root={root} />
    </div>
  )
}
