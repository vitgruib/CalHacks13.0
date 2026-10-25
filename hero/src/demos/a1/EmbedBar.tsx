// Only inside another page (embed.ts): a still of the scene, under the canvas
// until it fades in, in place of a scene that fails, and behind the landing's
// own still view (hero/src/embed.tsx).

import stillTall from '../../stills/lab-floor-tall.webp'
import stillWide from '../../stills/lab-floor-wide.webp'

export function StageStill() {
  return (
    <picture className="a-stage-still">
      <source media="(max-width: 759px)" srcSet={stillTall} />
      <img src={stillWide} alt="" decoding="async" />
    </picture>
  )
}
