// The first screen. A visit that starts on the landing shows it at once: the
// landing never reads the store, so it doesn't wait for SpacetimeDB to connect
// (about 2 s on Vercel, behind "Loading the grant office…"). Picking a portal
// starts the store, whose loading screen then fits what was clicked. Every
// other URL, and everything after the first pick (the brand link back, back
// and forward), goes through App inside the store as before.
import { useEffect, useState } from 'react'
import App, { entryUrl, opensLanding } from './App'
import { StoreProvider } from './data/backend'
import Landing from './landing/Landing'

const landingNow = () => opensLanding(new URL(location.href))

export default function Boot() {
  const [entered, setEntered] = useState(() => !landingNow())
  // A hash typed into the address bar leaves the landing too.
  useEffect(() => {
    if (entered) return
    const on = () => { if (!landingNow()) setEntered(true) }
    addEventListener('hashchange', on)
    addEventListener('popstate', on)
    return () => { removeEventListener('hashchange', on); removeEventListener('popstate', on) }
  }, [entered])

  if (!entered) return <Landing onPick={p => { history.pushState(null, '', entryUrl(p)); setEntered(true) }} />
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  )
}
