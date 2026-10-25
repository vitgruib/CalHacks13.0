// "Who are you?" (T81): the first screen of every new visit. Picks the grant
// office or one researcher's portal; after that, only the floating Demo
// controls can switch.
import { RESEARCHERS } from './people'
import './Entry.css'

export const portals: { id: string; label: string; sub: string }[] = [
  { id: 'grant_office', label: 'Grant office', sub: 'Grant manager' },
  ...RESEARCHERS.map(r => ({ id: r.id, label: r.name, sub: r.title })),
]

export default function Entry({ onPick }: { onPick: (portal: string) => void }) {
  const [office, ...people] = portals
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
        <ul className="entry-people">
          {people.map(p => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p.id)}><strong>{p.label}</strong><small>{p.sub}</small></button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
