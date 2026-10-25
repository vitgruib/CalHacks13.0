// Only inside another page (embed.ts). On a phone the sidebar gives the stage
// all the room, so this strip carries what the sidebar's head would: that the
// lab is simulated, and the way in. StageStill stands in for a scene that fails.

import stillTall from '../../stills/lab-floor-tall.webp'
import stillWide from '../../stills/lab-floor-wide.webp'
import { embed } from './embed'

export function EmbedBar() {
  return (
    <div className="a-embed-bar" data-float="embed-bar">
      <p>Simulated lab, scripted replay. The spending rules are the real ones.</p>
      <button type="button" className="a-btn a-btn--primary" onClick={() => embed.get().onEnter?.()}>
        Choose a portal
      </button>
    </div>
  )
}

export function StageStill() {
  return (
    <picture className="a-stage-still">
      <source media="(max-width: 759px)" srcSet={stillTall} />
      <img src={stillWide} alt="" decoding="async" />
    </picture>
  )
}
