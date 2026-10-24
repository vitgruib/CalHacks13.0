// The researchers who each get their own portal (T39). Names match the lab's
// simulated staff in sim/build-seed.mjs; each researcher is a separate
// identity on the server, so a request names who asked and only they can push
// back on it.
import { createContext, useContext } from 'react'

export interface Researcher {
  id: string // stable key: portal id, stored token, offline requestedBy
  name: string // as stored on each request (requesterName)
  title: string
  grantId: string // the grant their work is on; the request form starts there
}

export const RESEARCHERS: Researcher[] = [
  { id: 'priya', name: 'Dr. Priya Nair', title: 'Postdoctoral researcher', grantId: 'R01GM061721' },
  { id: 'sofia', name: 'Sofia Alvarez', title: 'Graduate researcher', grantId: 'R21AI182745' },
]

export const researcherNamed = (name: string | undefined) => RESEARCHERS.find(r => r.name === name)

/** "Dr. Priya Nair, Postdoctoral researcher"; "a researcher" when unknown. */
export const requesterLabel = (name: string | undefined) => {
  const r = researcherNamed(name)
  return r ? `${r.name}, ${r.title}` : name || 'a researcher'
}

export const firstNameOf = (r: Researcher) => r.name.replace(/^Dr\.?\s*/, '').split(' ')[0]

/** The researcher whose portal is open; null in the grant office portal. */
export const ResearcherContext = createContext<Researcher | null>(null)

export function useResearcher(): Researcher {
  const r = useContext(ResearcherContext)
  if (!r) throw new Error('useResearcher outside a researcher portal')
  return r
}
