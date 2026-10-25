import { useEffect, useState } from 'react'
import { useStore } from './data/store'
import { RoleContext, roles, windows, type Role } from './windows/registry'
import { RESEARCHERS, ResearcherContext } from './people'
import DetailPage from './DetailPage'
import Notices from './Notices'
import DemoDock from './DemoDock'
import UserSwitch from './UserSwitch'
import Landing from './landing/Landing'
import './scientist.css'

// Two kinds of portal, kept apart (T39): the grant office (the grant manager's
// windows, the only decision buttons) and one portal per researcher, who sees
// only their own requests. A portal is 'grant_office' or a researcher id.
type Portal = 'grant_office' | string
// Asked on entry (T81): a new tab starts at "Who are you?"; a reload keeps the
// answer. Switching afterwards is the same UserSwitch in both portals.
const PORTAL_KEY = 'grantguard.portal'
const savedPortal = (): Portal | null => {
  try {
    const p = sessionStorage.getItem(PORTAL_KEY)
    return p && (p === 'grant_office' || RESEARCHERS.some(r => r.id === p)) ? p : null
  } catch { return null }
}
const roleOf = (p: Portal | null): Role => (p === 'grant_office' || !p ? 'grant_manager' : 'scientist')

// Every window a role may open. Soft-deleted windows (`hidden: true` in
// registry.ts) are left out of the side menu only; their URLs still open them.
const allowed = (role: Role) => windows.filter(w => w.roles.includes(role))
const menu = (role: Role) => allowed(role).filter(w => !w.hidden)
const home = (role: Role) => menu(role).find(w => w.id === roles.find(r => r.id === role)?.home) ?? menu(role)[0]
// `#grants/R01GM061721` opens the grants window on one grant.
const fromHash = (role: Role) => allowed(role).find(w => `#${w.id}` === location.hash.split('/')[0]) ?? home(role)

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
    try { sessionStorage.setItem(PORTAL_KEY, next) } catch { /* the choice just won't survive a reload */ }
    setPortal(next)
    const w = fromHash(roleOf(next))
    setCurrent(w)
    if (location.hash.split('/')[0] !== `#${w.id}`) location.hash = w.id
  }
  const openHolds = db.holds.filter(h => !h.decision).length

  // A donut color or the forecast, opened on its own page in a new tab.
  if (hash.startsWith('#detail/')) return <DetailPage role={role} />

  if (!portal) return <Landing onPick={switchPortal} />
  const dock = <DemoDock />

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
              <UserSwitch portal={portal} onSwitch={switchPortal} align="right" />
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
        {dock}
      </div>
    )
  }

  return (
    <div className="app">
      <nav>
        <div className="brand">GrantGuard</div>
        <div className="portal-name">Grant office portal</div>
        <div className="today">Today: {db.today}</div>
        <div className="nav-user"><UserSwitch portal={portal} onSwitch={switchPortal} /></div>
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
      {dock}
    </div>
  )
}
