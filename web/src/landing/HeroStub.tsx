// Stands in for the 3D hero (T76) when hero/src/embed.tsx fails to load, and
// shows while its chunk loads. Same contract as the embed: fills its parent,
// adds no global listeners, and its two choices call onEnter with a role, in
// the same prompt the embed shows. The still is the very file the embed's own
// still imports (hero/src/demos/a1/EmbedBar.tsx), so it is one cached image at
// the same framing and the embed mounts over it without a jump; regenerated
// stills show up here by themselves. If they are missing, the stage's
// background shows instead.
import type { HeroEmbedProps } from '@hero/embed'

const stills = import.meta.glob<string>('../../../hero/src/stills/*.webp', { eager: true, query: '?url', import: 'default' })
const pick = (name: string, suffix: string) =>
  Object.entries(stills).find(([path]) => path.endsWith(`/${name}`))?.[1] ??
  Object.entries(stills).find(([path]) => path.endsWith(suffix))?.[1]
const wide = pick('lab-floor-wide.webp', '-wide.webp')
const tall = pick('lab-floor-tall.webp', '-tall.webp') ?? wide

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
        <h1>Grant Test Auto</h1>
        <p>An AI grant office that keeps a lab’s spending inside its grants’ rules. Three AI agents check every request; the grant manager decides the exceptions.</p>
        <p className="hero-stub-prompt">
          Select the{' '}
          <button type="button" aria-label="Research lab: open the research portal" onClick={() => onEnter?.('researcher')}>research lab</button>
          {' '}or the{' '}
          <button type="button" aria-label="Grant manager network: open the grant manager portal" onClick={() => onEnter?.('grant_office')}>grant manager network</button>.
        </p>
      </div>
      <p className="hero-stub-note">Still of the simulated lab</p>
    </div>
  )
}
