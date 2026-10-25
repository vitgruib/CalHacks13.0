import { useEffect, useState } from 'react'
import { useStore } from './data/store'
import { RoleContext, roles, windows, type Role } from './windows/registry'
import { RESEARCHERS, ResearcherContext } from './people'
import DetailPage from './DetailPage'
import Notices from './Notices'
import DemoDock from './DemoDock'
import UserSwitch from './UserSwitch'
import Landing from './landing/Landing'
import BrandLink from './landing/BrandLink'
import './scientist.css'

// Two kinds of portal, kept apart (T39): the grant office (the grant manager's
// windows, the only decision buttons) and one portal per researcher, who sees
// only their own requests. A portal is 'grant_office' or a researcher id.
type Portal = 'grant_office' | string
// The URL is the state (T90): a reload stays put and back/forward work.
// - no hash: the landing (T75), always;
// - `#<window>` (`#funds`, `#inbox`, `#grants/R01GM061721`): the grant office;
// - `?researcher=<id>#<window>`: that researcher's portal. The id sits in the query,
//   not the hash, so the windows' own links (`#grants/<id>`, `#requests`) keep it;
// - `#detail/…`: a details page (new tab, keeps the query); anything else: the landing.
// Switching afterwards is the same UserSwitch in both portals (T81).
const AS = 'researcher'
const head = (hash: string) => hash.slice(1).split('/')[0]
const portalOf = (url: URL): Portal | null => {
  if (!url.hash.slice(1)) return null
  const id = url.searchParams.get(AS)
  if (id && RESEARCHERS.some(r => r.id === id)) return id
  return windows.some(w => w.id === head(url.hash)) ? 'grant_office' : null
}
const urlFor = (p: Portal, hash: string) => {
  const q = new URLSearchParams(location.search)
  if (p === 'grant_office') q.delete(AS)
  else q.set(AS, p)
  const query = q.toString()
  return `${location.pathname}${query ? `?${query}` : ''}${hash}`
}
const roleOf = (p: Portal | null): Role => (p === 'grant_office' || !p ? 'grant_manager' : 'scientist')

// Every window a role may open. Soft-deleted windows (`hidden: true` in
// registry.ts) are left out of the side menu only; their URLs still open them.
const allowed = (role: Role) => windows.filter(w => w.roles.includes(role))
const menu = (role: Role) => allowed(role).filter(w => !w.hidden)
const home = (role: Role) => menu(role).find(w => w.id === roles.find(r => r.id === role)?.home) ?? menu(role)[0]
// `#grants/R01GM061721` opens the grants window on one grant.
const fromHash = (role: Role, hash: string) => allowed(role).find(w => w.id === head(hash)) ?? home(role)

export default function App() {
  const store = useStore()
  const { db } = store
  const [href, setHref] = useState(() => location.href)
  useEffect(() => {
    const on = () => setHref(location.href)
    addEventListener('hashchange', on)
    addEventListener('popstate', on)
    return () => { removeEventListener('hashchange', on); removeEventListener('popstate', on) }
  }, [])
  // pushState, not a page load: the local demo data lives in this tab's memory.
  const go = (to: string) => { history.pushState(null, '', to); setHref(location.href) }
  const url = new URL(href)
  const hash = url.hash
  const portal = portalOf(url)
  const role = roleOf(portal)
  const researcher = RESEARCHERS.find(r => r.id === portal) ?? null
  const current = fromHash(role, hash)
  const switchPortal = (next: Portal) => {
    const w = fromHash(roleOf(next), hash)
    go(urlFor(next, head(hash) === w.id ? hash : `#${w.id}`))
  }
  const toLanding = () => go(location.pathname)

  // A donut color or the forecast, opened on its own page in a new tab.
  if (hash.startsWith('#detail/')) return <DetailPage role={role} />

  if (!portal) return <Landing onPick={switchPortal} />
  const dock = <DemoDock />

  if (researcher) {
    return (
      <div className="sci">
        <header className="sci-top">
          <div className="sci-bar">
            <span className="sci-brand"><BrandLink onHome={toLanding} /> <span className="sci-portal">Researcher portal</span></span>
            <nav className="sci-nav" aria-label="Main">
              {menu(role).map(w => (
                <a key={w.id} href={`#${w.id}`} className={w === current ? 'active' : ''} aria-current={w === current ? 'page' : undefined}>
                  {w.label}
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
        <BrandLink className="brand" onHome={toLanding} />
        <div className="portal-name">Grant office portal</div>
        <div className="today">Today: {db.today}</div>
        <div className="nav-user"><UserSwitch portal={portal} onSwitch={switchPortal} /></div>
        {menu(role).map(w => (
          <a key={w.id} href={`#${w.id}`} className={w === current ? 'active' : ''}>
            {w.label}
            {!!w.badge?.(store) && <span className="count">{w.badge(store)}</span>}
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
