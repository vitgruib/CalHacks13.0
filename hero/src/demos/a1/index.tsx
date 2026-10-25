// Clay lab round 2, version 1 "Lab floor": round 1's two clay plinths grown
// into a full wet lab and an inlaid finance network, with a sidebar dashboard
// on the right. The stage holds only the canvas; the sidebar never covers it.
// Inside another page (embed.ts) there is no sidebar: the scene fills the box
// and a few lines of copy sit over its empty side (EmbedHud).
// The root never re-renders, so the Canvas tree only changes from inside.

import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import './demo-a1.css'
import { StageStill } from './EmbedBar'
import { EmbedHud, Hud } from './Hud'
import { embed } from './embed'
import { ui } from './store'

const Scene = lazy(() => import('./Scene'))

/** If the 3D scene fails, the dashboard keeps working beside an empty stage (inside another page, over a still of it). */
class SceneGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return embed.get().on ? <StageStill /> : null
  }
}

export default function Demo() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ui.reset()
    return () => ui.reset()
  }, [])
  const embedded = embed.get().on
  // A tab's first landing opens with the crane from a close-up, so the still (the end framing) would show the lab wide, close, then wide: the copy waits over the bare stage instead.
  const [under] = useState(() => embedded && embed.get().craned)
  return (
    <div className={embedded ? 'demo-a1 is-embed' : 'demo-a1'} ref={root}>
      <div className="a-stage">
        {/* Embedded and coming back, the landing's still stays under the canvas until the scene fades in over it. */}
        {under && <StageStill />}
        <SceneGuard>
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </SceneGuard>
      </div>
      {embedded ? <EmbedHud root={root} /> : <Hud root={root} />}
    </div>
  )
}
