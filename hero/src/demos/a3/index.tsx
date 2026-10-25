// Clay lab round 2, version 3, "Roundtable": the lab on one plinth, the
// grant office as a round table around the one shared record, and a
// sidebar that holds every word. The stage is exactly the area the sidebar
// leaves free. The root never re-renders, so the Canvas tree only changes from inside.

import { useEffect, useRef } from 'react'
import { bare } from '../../chrome'
import './demo-a3.css'
import { Hud } from './Hud'
import Scene from './Scene'
import { ui } from './store'

const gallery = !bare

export default function Demo() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ui.reset()
    return () => ui.reset()
  }, [])
  return (
    <div className="demo-a3" ref={root} data-gallery={gallery ? '' : undefined}>
      <div className="a-stage">
        <Scene />
      </div>
      <Hud root={root} />
    </div>
  )
}
