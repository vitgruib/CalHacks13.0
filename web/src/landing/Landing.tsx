// The landing (T75): the 3D hero first, then "Who are you?", which opens a
// portal. App shows it for an empty hash or #start; every other hash skips it,
// so deep links like #inbox open the portal directly.
import { useLayoutEffect, useRef } from 'react'
import { EDGE_CASES, MAIN_RESEARCHERS, displayName, type Researcher } from '../people'
import HeroSlot from './HeroSlot'
import './Landing.css'

const Arrow = () => (
  <svg className="landing-arrow" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export default function Landing({ onPick }: { onPick: (portal: string) => void }) {
  const who = useRef<HTMLHeadingElement>(null)
  // Start at the top, and leave the portal at the top too.
  useLayoutEffect(() => {
    scrollTo(0, 0)
    return () => scrollTo(0, 0)
  }, [])
  const toPicker = () => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    who.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
    who.current?.focus({ preventScroll: true })
  }

  return (
    <div className="landing">
      <section className="landing-hero">
        <header className="landing-bar">
          <span className="landing-mark">GrantGuard</span>
          <a href="#start" className="landing-jump" onClick={e => { e.preventDefault(); toPicker() }}>Choose a portal</a>
        </header>
        <div className="landing-stage">
          <div className="landing-embed"><HeroSlot onEnter={toPicker} /></div>
        </div>
        {/* A pointer-only cue; keyboard and screen reader users have the link above. */}
        <a href="#start" className="landing-cue" aria-hidden="true" tabIndex={-1} onClick={e => { e.preventDefault(); toPicker() }}>
          Scroll
          <svg viewBox="0 0 16 16" width="14" height="14" focusable="false"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      </section>

      <main className="landing-who" aria-labelledby="who">
        <h2 id="who" ref={who} tabIndex={-1}>Who are you?</h2>
        <p className="landing-lede">Pick a portal to open. Either one can switch to the other from its header.</p>
        <div className="landing-seats">
          <section className="landing-seat" aria-labelledby="seat-office">
            <h3 id="seat-office">Grant office</h3>
            <p>Every grant’s real balance and status in one place. Anything the agents hold, unclear or over a limit, waits in your Inbox for your decision.</p>
            <button type="button" className="landing-go" onClick={() => onPick('grant_office')}>
              Open the grant office <Arrow />
            </button>
          </section>
          <section className="landing-seat" aria-labelledby="seat-researcher">
            <h3 id="seat-researcher">Researcher</h3>
            <p>Ask for what you need, then follow your grants and your requests. Pick your name to open your portal.</p>
            <People list={MAIN_RESEARCHERS} onPick={onPick} />
            <details className="landing-edge">
              <summary>Edge cases ({EDGE_CASES.length})</summary>
              <People list={EDGE_CASES} onPick={onPick} />
            </details>
          </section>
        </div>
      </main>

      <footer className="landing-foot">
        A simulated lab on real NIH grant IDs and the public cancellation list. Built at Cal Hacks 13.0.
      </footer>
    </div>
  )
}

function People({ list, onPick }: { list: Researcher[]; onPick: (portal: string) => void }) {
  return (
    <ul className="landing-people">
      {list.map(r => (
        <li key={r.id}>
          <button type="button" onClick={() => onPick(r.id)}>
            <span className="landing-name">{displayName(r)}</span>
            <span className="landing-meta">{r.title} on {r.grantId}</span>
            <Arrow />
          </button>
        </li>
      ))}
    </ul>
  )
}
