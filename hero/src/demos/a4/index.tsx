// Clay lab round 2, version 4, "Transit map": a tilt-shift miniature of the
// lab beside a raised transit map of the grant office, with a compact
// timetable sidebar on the left. The stage holds only the canvas and sits
// beside the sidebar (above the sheet's peek on a phone).
// The root never re-renders, so the Canvas tree only changes from inside.

import { useLayoutEffect, useRef } from 'react'
import { feed } from '../../feed'
import './demo-a4.css'
import { RootSync, Sidebar } from './Hud'
import Scene from './Scene'
import { ui } from './store'

export default function Demo() {
  const root = useRef<HTMLDivElement>(null)
  // Before any child effect runs, so the sidebar's first effects see a fresh state.
  useLayoutEffect(() => {
    ui.reset()
    // Arriving mid-story (?at) with a decision already waiting: show it first.
    if (feed.getWorld().holds.some(h => h.open)) ui.set({ section: 'waiting' })
    return () => ui.reset()
  }, [])
  return (
    <div className="demo-a4" ref={root}>
      <Sidebar />
      <div className="a-stage">
        <Scene />
      </div>
      <RootSync root={root} />
    </div>
  )
}
