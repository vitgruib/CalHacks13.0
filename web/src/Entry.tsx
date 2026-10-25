// "Who are you?" (T81): the first screen of every new visit. Picks the grant
// office or one researcher's portal; after that, the UserSwitch in each
// portal's header switches.
import { EDGE_CASES, MAIN_RESEARCHERS, displayName, type Researcher } from './people'
import './Entry.css'

type PortalOption = { id: string; label: string; sub: string }
const asPortal = (r: Researcher): PortalOption => ({ id: r.id, label: displayName(r), sub: r.title })
export const office: PortalOption = { id: 'grant_office', label: 'Grant office', sub: 'Grant manager' }
export const people = MAIN_RESEARCHERS.map(asPortal)
// Edge-case users, labeled by the failure their grant runs into.
export const edgeCases = EDGE_CASES.map(asPortal)
export const portals: PortalOption[] = [office, ...people, ...edgeCases]

export default function Entry({ onPick }: { onPick: (portal: string) => void }) {
  return (
    <div className="entry">
      <div className="entry-card">
        <div className="entry-brand">GrantGuard</div>
        <h1>Who are you?</h1>
        <p className="entry-sub">Pick a user to open their portal.</p>
        <button type="button" className="entry-office" onClick={() => onPick(office.id)}>
          <strong>{office.label}</strong><small>{office.sub}: grants, holds and every decision</small>
        </button>
        <h2>Researchers</h2>
        <PeopleList list={people} onPick={onPick} />
        <details className="entry-edge">
          <summary>Edge cases ({edgeCases.length})</summary>
          <PeopleList list={edgeCases} onPick={onPick} />
        </details>
      </div>
    </div>
  )
}

function PeopleList({ list, onPick }: { list: PortalOption[]; onPick: (portal: string) => void }) {
  return (
    <ul className="entry-people">
      {list.map(p => (
        <li key={p.id}>
          <button type="button" onClick={() => onPick(p.id)}><strong>{p.label}</strong><small>{p.sub}</small></button>
        </li>
      ))}
    </ul>
  )
}
