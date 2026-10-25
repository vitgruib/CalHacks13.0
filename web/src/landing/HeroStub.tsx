// Stands in for the 3D hero (T76) when hero/src/embed.tsx fails to load, and
// shows while its chunk loads. Same contract as the embed: fills its parent,
// adds no global listeners, and its two choices call onEnter with a role, in
// the same prompt the embed shows. The stills are the hero session's own
// (hero/src/stills), at the hero's phone breakpoint; if they are missing the
// stage's background shows instead.
import type { HeroEmbedProps } from '@hero/embed'

const stills = import.meta.glob<string>('../../../hero/src/stills/*.webp', { eager: true, query: '?url', import: 'default' })
const pick = (suffix: string) => Object.entries(stills).find(([path]) => path.endsWith(suffix))?.[1]
const wide = pick('-wide.webp')
const tall = pick('-tall.webp') ?? wide

/** The lab as a still image, nothing else. */
export function HeroStill() {
  if (!wide) return null
  return (
    <picture className="hero-still">
      {tall && <source media="(max-width: 759px)" srcSet={tall} />}
      <img src={wide} alt="" decoding="async" />
    </picture>
  )
}

export function HeroStub({ onEnter }: HeroEmbedProps) {
  return (
    <div className="hero-stub">
      <HeroStill />
      <div className="hero-stub-copy">
        <h1>An AI grant office that keeps a lab’s spending inside its grants’ rules.</h1>
        <p>Three AI agents check every request against the spending rules. The grant manager decides the exceptions.</p>
        <p className="hero-stub-prompt">
          Click the{' '}
          <button type="button" aria-label="Research lab: open the research portal" onClick={() => onEnter?.('researcher')}>research lab</button>
          {' '}or the{' '}
          <button type="button" aria-label="Grant manager network: open the grant manager portal" onClick={() => onEnter?.('grant_office')}>grant manager network</button>.
        </p>
      </div>
      <p className="hero-stub-note">Still of the simulated lab</p>
    </div>
  )
}
