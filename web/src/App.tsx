import { useEffect, useState } from 'react'
import { useStore } from './data/store'
import { roles, windows, type Role } from './windows/registry'
import Notices from './Notices'

const ROLE_KEY = 'grantguard.role'
const savedRole = (): Role => {
  try { return localStorage.getItem(ROLE_KEY) === 'scientist' ? 'scientist' : 'grant_manager' } catch { return 'grant_manager' }
}
const menu = (role: Role) => windows.filter(w => w.roles.includes(role))
const home = (role: Role) => menu(role).find(w => w.id === roles.find(r => r.id === role)?.home) ?? menu(role)[0]
const fromHash = (role: Role) => menu(role).find(w => `#${w.id}` === location.hash) ?? home(role)

export default function App() {
  const { db } = useStore()
  const [role, setRole] = useState(savedRole)
  const [current, setCurrent] = useState(() => fromHash(role))
  useEffect(() => {
    const on = () => setCurrent(fromHash(role))
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [role])
  const switchRole = (next: Role) => {
    try { localStorage.setItem(ROLE_KEY, next) } catch { /* the choice just won't survive a reload */ }
    setRole(next)
    const w = fromHash(next)
    setCurrent(w)
    if (location.hash !== `#${w.id}`) location.hash = w.id
  }
  const openHolds = db.holds.filter(h => !h.decision).length

  return (
    <div className="app">
      <nav>
        <div className="brand">GrantGuard</div>
        <div className="today">Today: {db.today}</div>
        <div className="roles" role="group" aria-label="View as">
          {roles.map(r => (
            <button key={r.id} type="button" className={r.id === role ? 'active' : ''} aria-pressed={r.id === role} onClick={() => switchRole(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        {menu(role).map(w => (
          <a key={w.id} href={`#${w.id}`} className={w === current ? 'active' : ''}>
            {w.label}
            {w.id === 'inbox' && openHolds > 0 && <span className="count">{openHolds}</span>}
          </a>
        ))}
      </nav>
      <main>
        <Notices />
        <h1>{current.label}</h1>
        <p className="job">{current.job}</p>
        <current.Component />
      </main>
    </div>
  )
}
