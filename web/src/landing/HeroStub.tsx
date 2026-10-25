// Stands in for the 3D hero (T76) until hero/src/embed.tsx lands, and shows
// while its chunk loads. Same contract as the embed: fills its parent, adds no
// global listeners, and its calls to action call onEnter with a role. The stills are
// screenshots of hero a1 with its labels hidden, so no award numbers show.
import type { HeroEmbedProps } from '@hero/embed'

const still = (name: string) => `${import.meta.env.BASE_URL}landing/${name}`

/** The lab as a still image, nothing else. */
export function HeroStill() {
  return (
    <picture className="hero-still">
      <source media="(max-width: 640px)" srcSet={still('lab-tall.webp')} />
      <img src={still('lab-wide.webp')} alt="" decoding="async" />
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
        <div className="hero-stub-actions">
          <button type="button" onClick={() => onEnter?.('grant_office')}>Open the grant office</button>
          <button type="button" className="hero-stub-alt" onClick={() => onEnter?.('researcher')}>Pick a researcher</button>
        </div>
      </div>
      <p className="hero-stub-note">Still of the simulated lab</p>
    </div>
  )
}
