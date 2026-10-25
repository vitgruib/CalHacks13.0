// Testing events (was Demo controls) as a floating corner menu (T81), over every
// portal: everything that was the Demo controls window, minus the evals (Evals.tsx). Switching user is in each portal's header.
// The panel stays mounted while closed so its notes and picks survive.
import { useEffect, useState } from 'react'
import TestLab from './windows/TestLab'
import './DemoDock.css'

export default function DemoDock() {
  const [open, setOpen] = useState(false)
  // Its own links ("Decide it in Funds") open another window: get out of the way
  // so the card they point at shows (at 390 px the panel covers the screen).
  useEffect(() => {
    const close = () => setOpen(false)
    addEventListener('hashchange', close)
    return () => removeEventListener('hashchange', close)
  }, [])
  return (
    <div className="demo-dock">
      <div className="demo-dock-panel" id="demo-dock-panel" role="dialog" aria-label="Testing events" hidden={!open}>
        <header className="demo-dock-head">
          <strong>Testing events</strong>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close testing events">×</button>
        </header>
        <TestLab />
      </div>
      <button type="button" className="demo-dock-toggle" aria-expanded={open} aria-controls="demo-dock-panel" onClick={() => setOpen(o => !o)}>
        {open ? 'Close testing events' : 'Testing events'}
      </button>
    </div>
  )
}
