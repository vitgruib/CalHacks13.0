// The one user switcher (T81), the same control in both portals: who you are,
// and a menu of everyone else. Grant office sidebar and researcher top bar.
import { useEffect, useRef, useState } from 'react'
import { edgeCases, office, people } from './Entry'
import './UserSwitch.css'

const groups = [{ title: 'Grant office', list: [office] }, { title: 'Researchers', list: people }, { title: 'Edge cases', list: edgeCases }]
const everyone = groups.flatMap(g => g.list)
const initials = (label: string) => label.replace(/^Dr\.?\s*/, '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

export default function UserSwitch({ portal, onSwitch, align = 'left' }: { portal: string; onSwitch: (portal: string) => void; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const me = everyone.find(p => p.id === portal) ?? office
  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('pointerdown', out)
    addEventListener('keydown', esc)
    return () => { removeEventListener('pointerdown', out); removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className={`user-switch ${align}`} ref={box}>
      <button type="button" className="us-trigger" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="us-avatar" aria-hidden="true">{initials(me.label)}</span>
        <span className="us-who"><strong>{me.label}</strong><small>{me.sub}</small></span>
        <span className="us-chev" aria-hidden="true">▾</span>
        <span className="sr-only">Switch user</span>
      </button>
      {open && (
        <div className="us-menu" role="menu" aria-label="Switch user">
          {groups.filter(g => g.list.length).map(g => [
            <div key={g.title} className="us-head">{g.title}</div>,
            ...g.list.map(p => (
            <button key={p.id} type="button" role="menuitemradio" aria-checked={p.id === portal} className={p.id === portal ? 'current' : ''}
              onClick={() => { setOpen(false); if (p.id !== portal) onSwitch(p.id) }}>
              <span className="us-avatar" aria-hidden="true">{initials(p.label)}</span>
              <span className="us-who"><strong>{p.label}</strong><small>{p.sub}</small></span>
              {p.id === portal && <span className="us-tick" aria-hidden="true">✓</span>}
            </button>
          )),
          ])}
        </div>
      )}
    </div>
  )
}
