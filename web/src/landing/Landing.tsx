// The landing (T75, T96): one screen that never scrolls. The 3D hero fills the
// whole viewport (its title is GrantGuard), and its two big choices open a portal.
// "Who are you?" (Entry.tsx) is no longer shown here; the UserSwitch inside
// each portal changes who you are.
import { useLayoutEffect } from 'react'
import type { HeroRole } from '@hero/embed'
import HeroSlot from './HeroSlot'
import './Landing.css'

// The demo path's researcher: "Research portal" opens as her.
const DEMO_RESEARCHER = 'priya'

export default function Landing({ onPick }: { onPick: (portal: string) => void }) {
  // The page is locked to the viewport only while the landing shows; the
  // portals scroll as usual, and open at the top.
  useLayoutEffect(() => {
    const root = document.documentElement
    scrollTo(0, 0)
    root.classList.add('landing-lock')
    return () => {
      root.classList.remove('landing-lock')
      scrollTo(0, 0)
    }
  }, [])
  // No role (an older call to action) falls back to the grant office.
  const enter = (role?: HeroRole) => onPick(role === 'researcher' ? DEMO_RESEARCHER : 'grant_office')

  return (
    <div className="landing">
      <div className="landing-embed"><HeroSlot onEnter={enter} /></div>
    </div>
  )
}
