// The contract of hero/src/embed.tsx (T76), which the hero session owns.
// tsconfig maps `@hero/embed` here, so web's type check never reaches into
// hero's sources (hero has its own check). Keep in step with T76 in TASKS.md.
import type { ComponentType } from 'react'

/** Which side of the demo a hero click opens (T90). */
export type HeroRole = 'researcher' | 'grant_office'

export interface HeroEmbedProps {
  /**
   * Called by the hero's ways in (T96): 'researcher' opens the researcher
   * portal as Dr. Priya Nair, the demo path's researcher; 'grant_office', or no
   * role, opens the grant office. The landing has no picker and doesn't scroll.
   */
  onEnter?: (role?: HeroRole) => void
}

/**
 * Fills its parent and adds no global CSS; lets wheel and touch scrolling
 * reach the page; scopes its listeners to itself; pauses when out of view or
 * the tab is hidden; shows a still on WebGL failure or reduced motion; says
 * it is a simulated replay.
 */
declare const HeroEmbed: ComponentType<HeroEmbedProps>
export default HeroEmbed
