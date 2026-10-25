// What the page around a mockup shows. A deploy build pins one mockup with
// VITE_HERO_VARIANT=<id> (say a1): no gallery strip, no number keys, no overview.
// VITE_APP_URL is where "open the app" links go.

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)

export const pinnedId: string | undefined = import.meta.env.VITE_HERO_VARIANT || undefined

/** True when the gallery strip is off: ?bare, or a deploy build. Mockups then use the whole window. */
export const bare = params.has('bare') || !!pinnedId

export const APP_URL: string = import.meta.env.VITE_APP_URL || 'https://calhacks130.vercel.app'
