// Mockup A, Clay lab: the lab and the grant office as two matte clay
// dioramas on floating plinths, requests crossing the gap as glazed tokens.
// The root never re-renders, so the Canvas tree only changes from inside.

import { useEffect, useRef } from 'react'
import './demo-a.css'
import { Hud } from './Hud'
import Scene from './Scene'
import { ui } from './store'

export default function Demo() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ui.reset()
    return () => ui.reset()
  }, [])
  return (
    <div className="demo-a" ref={root}>
      <div className="a-stage">
        <Scene />
      </div>
      <Hud root={root} />
    </div>
  )
}
