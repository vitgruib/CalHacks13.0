import { useEffect, useState } from 'react'
import { useStore } from './data/store'
import { RoleContext, roles, windows, type Role } from './windows/registry'
import { RESEARCHERS, ResearcherContext } from './people'
import DetailPage from './DetailPage'
import Notices from './Notices'
import './scientist.css'

// Two kinds of portal, kept apart (T39): the grant office (the grant manager's
// windows, the only decision buttons) and one portal per researcher, who sees
// only their own requests. A portal is 'grant_office' or a researcher id.
type Portal = 'grant_office' | string
const PORTAL_KEY = 'grantguard.portal'
const OLD_ROLE_KEY = 'grantguard.role'
const savedPortal = (): Portal => {
  try {
    const p = localStorage.getItem(PORTAL_KEY)
    if (p && (p === 'grant_office' || RESEARCHERS.some(r => r.id === p))) return p
    return localStorage.getItem(OLD_ROLE_KEY) === 'scientist' ? RESEARCHERS[0].id : 'grant_office'
  } catch { return 'grant_office' }
}
const roleOf = (p: Portal): Role => (p === 'grant_office' ? 'grant_manager' : 'scientist')
const portals: { id: Portal; label: string; sub: string }[] = [
  { id: 'grant_office', label: 'Grant office', sub: 'Grant manager' },
  ...RESEARCHERS.map(r => ({ id: r.id, label: r.name, sub: r.title })),
]

const menu = (role: Role) => windows.filter(w => w.roles.includes(role))
const home = (role: Role) => menu(role).find(w => w.id === roles.find(r => r.id === role)?.home) ?? menu(role)[0]
// `#grants/R01GM061721` opens the grants window on one grant.
const fromHash = (role: Role) => menu(role).find(w => `#${w.id}` === location.hash.split('/')[0]) ?? home(role)

export default function App() {
  const { db } = useStore()
  const [portal, setPortal] = useState(savedPortal)
  const role = roleOf(portal)
  const researcher = RESEARCHERS.find(r => r.id === portal) ?? null
  const [current, setCurrent] = useState(() => fromHash(role))
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => { setCurrent(fromHash(role)); setHash(location.hash) }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [role])
  const switchPortal = (next: Portal) => {
    try { localStorage.setItem(PORTAL_KEY, next) } catch { /* the choice just won't survive a reload */ }
    setPortal(next)
    const w = fromHash(roleOf(next))
    setCurrent(w)
    if (location.hash.split('/')[0] !== `#${w.id}`) location.hash = w.id
  }
  const openHolds = db.holds.filter(h => !h.decision).length

  // A donut color or the forecast, opened on its own page in a new tab.
  if (hash.startsWith('#detail/')) return <DetailPage role={role} />

  if (researcher) {
    return (
      <div className="sci">
        <header className="sci-top">
          <div className="sci-bar">
            <span className="sci-brand">GrantGuard <span className="sci-portal">Researcher portal</span></span>
            <nav className="sci-nav" aria-label="Main">
              {menu(role).map(w => (
                <a key={w.id} href={`#${w.id}`} className={w === current ? 'active' : ''} aria-current={w === current ? 'page' : undefined}>
                  {w.id === 'requests' ? 'My requests' : w.label}
                </a>
              ))}
            </nav>
            <div className="sci-role">
              <span className="sci-me">{researcher.name}<small>{researcher.title}</small></span>
              <label className="sci-switch">
                <span className="sr-only">Switch portal</span>
                <select value={portal} onChange={e => switchPortal(e.target.value)}>
                  {portals.map(p => <option key={p.id} value={p.id}>{p.id === 'grant_office' ? 'Switch to the grant office' : p.id === portal ? `${p.label} (you)` : `Switch to ${p.label}`}</option>)}
                </select>
              </label>
            </div>
          </div>
        </header>
        <main className="sci-main">
          <p className="sci-today">Today: {db.today}</p>
          {current.id === 'requests' && <h1 style={{ marginBottom: 20 }}>My requests</h1>}
          <RoleContext.Provider value={role}>
            {/* keyed by researcher so drafts and notices never carry over to another portal */}
            <ResearcherContext.Provider value={researcher}><current.Component key={researcher.id} /></ResearcherContext.Provider>
          </RoleContext.Provider>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <nav>
        <div className="brand">GrantGuard</div>
        <div className="portal-name">Grant office portal</div>
        <div className="today">Today: {db.today}</div>
        <div className="portals" role="group" aria-label="Portal">
          {portals.map(p => (
            <button key={p.id} type="button" className={p.id === portal ? 'active' : ''} aria-pressed={p.id === portal} onClick={() => switchPortal(p.id)}>
              {p.label}<small>{p.sub}</small>
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
