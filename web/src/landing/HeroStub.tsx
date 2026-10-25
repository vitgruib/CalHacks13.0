// Stands in for the 3D hero (T76) when hero/src/embed.tsx fails to load, and
// shows while its chunk loads. Same contract as the embed: fills its parent,
// adds no global listeners, and its two labels call onEnter with a role, where
// the embed shows them. The still is the very file the embed's own
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
        <p className="hero-stub-problem">Researchers spend 44% of their federally funded research time on administration.</p>
        <p>AI agents do the grant office’s checking: status, balance, rules and invoices. Researchers do science, and the grant manager decides only the exceptions.</p>
      </div>
      {/* The two ways in sit over their plinths, where the embed puts them (hero 9925fa6). */}
      <button type="button" className="hero-stub-way lab" aria-label="Research lab: open the research portal" onClick={() => onEnter?.('researcher')}>Research lab</button>
      <button type="button" className="hero-stub-way net" aria-label="Grant manager network: open the grant manager portal" onClick={() => onEnter?.('grant_office')}>Grant manager network</button>
    </div>
  )
}
