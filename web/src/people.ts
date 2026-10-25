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
  failure?: string // edge-case users: shown in place of the name (the failure case's title)
}

export const RESEARCHERS: Researcher[] = [
  { id: 'priya', name: 'Dr. Priya Nair', title: 'Postdoctoral researcher', grantId: 'R01GM061721' },
  { id: 'sofia', name: 'Sofia Alvarez', title: 'Graduate researcher', grantId: 'R21AI182745' },
  // Edge cases: one per real failure case (T65, FailureCases.tsx), each on a grant cut on
  // the real list. Pickers file them in an Edge cases folder, labeled by failure.
  { id: 'amara', name: 'Dr. Amara Osei', title: 'Postdoctoral researcher', grantId: 'R01AI178875', failure: 'Terminated for good' },
  { id: 'kenji', name: 'Kenji Watanabe', title: 'Graduate researcher', grantId: 'R01GM155497', failure: 'Bought after the cut' },
  { id: 'elena', name: 'Dr. Elena Petrova', title: 'Research scientist', grantId: 'R01HL176691', failure: 'Court restored, no cash' },
  { id: 'rahul', name: 'Rahul Mehta', title: 'Graduate researcher', grantId: 'R01GM105672', failure: 'Only a supplement was cut' },
  { id: 'jordan', name: 'Jordan Kim', title: 'Research associate', grantId: 'K01DK133670', failure: 'Paid while terminated' },
  { id: 'noah', name: 'Noah Bennett', title: 'Graduate fellow', grantId: 'F31DC022138', failure: 'Restored, then cut again' },
]

/** The demo's main researchers, then the edge cases. */
export const MAIN_RESEARCHERS = RESEARCHERS.filter(r => !r.failure)
export const EDGE_CASES = RESEARCHERS.filter(r => r.failure)

/** What the app calls a researcher: the failure for an edge case, else the name. */
export const displayName = (r: Researcher) => r.failure ?? r.name

const EDGE_GRANTS = new Set(EDGE_CASES.map(r => r.grantId))
/** A grant that only backs an edge-case user (a failure case's grant), not the lab's own. */
export const isEdgeGrant = (g: { id: string }) => EDGE_GRANTS.has(g.id)
/** The edge case a grant backs ("Bought after the cut"); undefined for the lab's own. */
export const edgeCaseOf = (g: { id: string }) => EDGE_CASES.find(r => r.grantId === g.id)?.failure
/** The grants a researcher works with: an edge-case user only their own; everyone else the lab's. */
export const grantsOf = <G extends { id: string }>(r: Researcher, grants: G[]) =>
  grants.filter(g => (r.failure ? g.id === r.grantId : !isEdgeGrant(g)))
/** The world as a researcher's portal sees it: only their grants. */
export const forResearcher = <D extends { grants: { id: string }[] }>(db: D, r: Researcher): D => ({ ...db, grants: grantsOf(r, db.grants) })

export const researcherNamed = (name: string | undefined) => RESEARCHERS.find(r => r.name === name)

/** "Dr. Priya Nair, Postdoctoral researcher"; "a researcher" when unknown. */
export const requesterLabel = (name: string | undefined) => {
  const r = researcherNamed(name)
  return r ? (r.failure ? `Edge case: ${r.failure}` : `${r.name}, ${r.title}`) : name || 'a researcher'
}

export const firstNameOf = (r: Researcher) => r.name.replace(/^Dr\.?\s*/, '').split(' ')[0]

/** The researcher whose portal is open; null in the grant office portal. */
export const ResearcherContext = createContext<Researcher | null>(null)

export function useResearcher(): Researcher {
  const r = useContext(ResearcherContext)
  if (!r) throw new Error('useResearcher outside a researcher portal')
  return r
}
