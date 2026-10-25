// The landing (T75): what a tab shows until someone picks who they are (T81).
// The 3D hero fills the first screen; below it, T81's Entry is the "Who are
// you?" section, and picking there opens that portal.
import { useLayoutEffect, useRef } from 'react'
import type { HeroRole } from '@hero/embed'
import Entry from '../Entry'
import HeroSlot from './HeroSlot'
import './Landing.css'

export default function Landing({ onPick }: { onPick: (portal: string) => void }) {
  const who = useRef<HTMLDivElement>(null)
  // Start at the top, and leave the portal at the top too.
  useLayoutEffect(() => {
    scrollTo(0, 0)
    return () => scrollTo(0, 0)
  }, [])
  // To "Who are you?"; with `researchers`, to its researcher list (T90).
  const toPicker = (researchers = false) => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const list = researchers ? who.current?.querySelector<HTMLElement>('.entry h2') : null
    ;(list ?? who.current)?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
    const first = researchers ? who.current?.querySelector<HTMLElement>('.entry-people button') : null
    ;(first ?? who.current)?.focus({ preventScroll: true })
  }
  // The hero's calls to action: the grant office opens directly; a researcher must be picked.
  const enter = (role?: HeroRole) => (role === 'grant_office' ? onPick('grant_office') : toPicker(role === 'researcher'))
  const jump = (e: { preventDefault: () => void }) => { e.preventDefault(); toPicker() }

  return (
    <div className="landing">
      <section className="landing-hero">
        <header className="landing-bar">
          <span className="landing-mark">GrantGuard</span>
          <a href="#who" className="landing-jump" onClick={jump}>Choose a portal</a>
        </header>
        <div className="landing-stage">
          <div className="landing-embed"><HeroSlot onEnter={enter} /></div>
        </div>
        {/* A pointer-only cue; keyboard and screen reader users have the link above. */}
        <a href="#who" className="landing-cue" aria-hidden="true" tabIndex={-1} onClick={jump}>
          Scroll
          <svg viewBox="0 0 16 16" width="14" height="14" focusable="false"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      </section>

      {/* The second screen: the picker, centered, with the footer under it. */}
      <div className="landing-rest">
        <div className="landing-who" id="who" ref={who} tabIndex={-1}>
          <Entry onPick={onPick} />
        </div>
        <footer className="landing-foot">
          A simulated lab on real NIH grant IDs and the public cancellation list. Built at Cal Hacks 13.0.
        </footer>
      </div>
    </div>
  )
}
