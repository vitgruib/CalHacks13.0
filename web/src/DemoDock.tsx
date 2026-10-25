// Demo controls as a floating corner menu (T81), over every portal. It holds
// the only user switcher, plus everything that was the Demo controls window.
// The panel stays mounted while closed so its notes and picks survive.
import { useState } from 'react'
import TestLab from './windows/TestLab'
import { portals } from './Entry'
import './DemoDock.css'

export default function DemoDock({ portal, onSwitch }: { portal: string; onSwitch: (portal: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="demo-dock">
      <div className="demo-dock-panel" id="demo-dock-panel" role="dialog" aria-label="Demo controls" hidden={!open}>
        <header className="demo-dock-head">
          <strong>Demo controls</strong>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close demo controls">×</button>
        </header>
        <label className="demo-dock-user">Switch user
          <select value={portal} onChange={e => onSwitch(e.target.value)}>
            {portals.map(p => <option key={p.id} value={p.id}>{p.label} · {p.sub}</option>)}
          </select>
        </label>
        <TestLab />
      </div>
      <button type="button" className="demo-dock-toggle" aria-expanded={open} aria-controls="demo-dock-panel" onClick={() => setOpen(o => !o)}>
        {open ? 'Close demo controls' : 'Demo controls'}
      </button>
    </div>
  )
}
