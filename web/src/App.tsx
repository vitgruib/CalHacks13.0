import { useEffect, useState } from 'react'
import { useStore } from './data/store'
import { roles, windows, type Role } from './windows/registry'
import Notices from './Notices'
import './scientist.css'

const ROLE_KEY = 'grantguard.role'
const savedRole = (): Role => {
  try { return localStorage.getItem(ROLE_KEY) === 'scientist' ? 'scientist' : 'grant_manager' } catch { return 'grant_manager' }
}
const menu = (role: Role) => windows.filter(w => w.roles.includes(role))
const home = (role: Role) => menu(role).find(w => w.id === roles.find(r => r.id === role)?.home) ?? menu(role)[0]
// `#grants/R01GM000001` opens the grants window on one grant.
const fromHash = (role: Role) => menu(role).find(w => `#${w.id}` === location.hash.split('/')[0]) ?? home(role)

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
    if (location.hash.split('/')[0] !== `#${w.id}`) location.hash = w.id
  }
  const openHolds = db.holds.filter(h => !h.decision).length
  const other = roles.find(r => r.id !== role)!

  if (role === 'scientist') {
    return (
      <div className="sci">
        <header className="sci-top">
          <div className="sci-bar">
            <span className="sci-brand">GrantGuard</span>
            <nav className="sci-nav" aria-label="Main">
              {menu(role).map(w => (
                <a key={w.id} href={`#${w.id}`} className={w === current ? 'active' : ''} aria-current={w === current ? 'page' : undefined}>
                  {w.id === 'requests' ? 'My requests' : w.label}
                </a>
              ))}
            </nav>
            <div className="sci-role">
              <span>Today: {db.today}</span>
              <button type="button" onClick={() => switchRole(other.id)}>Switch to {other.label.toLowerCase()}</button>
            </div>
          </div>
        </header>
        <main className="sci-main">
          {current.id === 'requests' && <h1 style={{ marginBottom: 20 }}>My requests</h1>}
          <current.Component />
        </main>
      </div>
    )
  }

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
