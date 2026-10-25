// The web landing's hero (T76): Lab floor, round 2's a1, as the landing's first
// screen. web/src/landing/HeroSlot.tsx lazy-loads this file; the contract is
// web/src/landing/hero-embed.d.ts. The scene is a1 as the gallery shows it, in
// its embed mode (demos/a1/embed.ts):
// - fills its parent; every style is scoped (.hero-embed here, .demo-a1 in a1);
// - page scroll passes through: no wheel zoom, vertical swipes pan the page;
// - its listeners sit on its own root, except the tab's visibilitychange;
// - off screen or in a hidden tab, the canvas and the story's clock stop;
// - with no WebGL, a scene error, or reduced motion, a still of the lab offers
//   the same two named ways in.

import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import Demo from './demos/a1'
import { StageStill } from './demos/a1/EmbedBar'
import { embed, type Role } from './demos/a1/embed'
import './demos/a1/zones.css' // the names over the plinths, for the still too (the scene that also loads it comes later)
import './embed.css'
import { feed } from './feed'

export interface HeroEmbedProps {
  /** The landing's way in: a role goes to that side (no role: the landing's own choice). */
  onEnter?: (role?: Role) => void
}

const hasWebGL = () => {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Anything the live demo throws shows the still, never an empty box. */
class OrStill extends Component<{ still: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.still : this.props.children
  }
}

export default function HeroEmbed({ onEnter }: HeroEmbedProps) {
  const [still] = useState(() => !hasWebGL() || calm())
  const enter = useRef(onEnter)
  useEffect(() => {
    enter.current = onEnter
  }, [onEnter])
  const go = (role?: Role) => enter.current?.(role)
  const stillView = <Still go={go} />
  return still ? stillView : (
    <OrStill still={stillView}>
      <Live go={go} />
    </OrStill>
  )
}

/** The live demo's layout (demo-a1.css, loaded with it): the scene's picture filling the box, the copy over its empty side. */
function Still({ go }: { go: (role?: Role) => void }) {
  return (
    <div className="hero-embed">
      <div className="demo-a1 is-embed">
        <div className="a-stage">
          <StageStill />
          {/* The live view's names over the plinths (zones.tsx ZoneLabels), where they sit on the still (CSS sets them per still). */}
          <div className="a1-zone-pins a-still-pins" data-on="">
            <button type="button" className="a1-zone-pin a-still-pin-lab" aria-label="Research lab: open the research portal" onClick={() => go('researcher')}>
              Research lab
            </button>
            <button type="button" className="a1-zone-pin a-still-pin-net" aria-label="Grant manager network: open the grant manager portal" onClick={() => go('grant_office')}>
              Grant manager network
            </button>
          </div>
        </div>
        <div className="a-embed-copy">
          <header className="a-embed-head">
            <h1>Grant Test Auto</h1>
            <p className="a-embed-sub">An AI grant office that keeps a lab’s spending inside its grants’ rules.</p>
            <p className="a-lede">A still of the simulated lab; the spending rules are the real ones.</p>
          </header>
        </div>
      </div>
    </div>
  )
}

function Live({ go }: { go: (role?: Role) => void }) {
  const box = useRef<HTMLDivElement>(null)
  // a1 reads this as it mounts, so it's set before the first render, not in an effect.
  useState(() => embed.set({ on: true, awake: true, onEnter: go }))
  useEffect(() => {
    const el = box.current
    if (!el) return
    embed.set({ on: true, onEnter: go }) // again, after a StrictMode remount's cleanup
    let seen = true
    const apply = () => {
      const awake = seen && document.visibilityState === 'visible'
      if (embed.get().awake !== awake) embed.set({ awake })
      feed.setAwake(awake)
    }
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting
      apply()
    })
    io.observe(el)
    document.addEventListener('visibilitychange', apply)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', apply)
      // Leaving the landing (a portal opened): the story's clock stops with it.
      feed.setAwake(false)
      embed.set({ on: false, awake: true, onEnter: undefined })
    }
  }, [])
  return (
    <div className="hero-embed" ref={box}>
      <Demo />
    </div>
  )
}
