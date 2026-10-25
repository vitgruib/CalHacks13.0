import { demos } from './demos/registry'
import './overview.css'

// Side-by-side comparison so the team can pick one to port into web/.
export default function Overview() {
  return (
    <main className="overview">
      <header>
        <h1>Grant Test Auto hero: Clay lab, round 2</h1>
        <p>
          Five versions of the round 1 pick, each playing the same scripted story through the database module's real
          spending rules. Open one, or press 1 to 5; press 6 for round 1's Clay lab.
        </p>
      </header>
      <ol>
        {demos.map((d, i) => (
          <li key={d.id}>
            <a href={`#${d.id}`}>
              <img src={`${import.meta.env.BASE_URL}thumbs/${d.id}.jpg`} alt="" loading="lazy" width={1440} height={900} />
              <span className="overview-name">
                <kbd>{i + 1}</kbd>
                {d.name}
              </span>
            </a>
            <p>{d.thesis}</p>
          </li>
        ))}
      </ol>
    </main>
  )
}
