import { useEffect, useState } from 'react'
import { useStore } from './data/store'
import { windows } from './windows/registry'

const fromHash = () => windows.find(w => `#${w.id}` === location.hash) ?? windows[0]

export default function App() {
  const { db } = useStore()
  const [current, setCurrent] = useState(fromHash)
  useEffect(() => {
    const on = () => setCurrent(fromHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const openHolds = db.holds.filter(h => !h.decision).length

  return (
    <div className="app">
      <nav>
        <div className="brand">GrantGuard</div>
        <div className="today">Today: {db.today}</div>
        {windows.map(w => (
          <a key={w.id} href={`#${w.id}`} className={w === current ? 'active' : ''}>
            {w.label}
            {w.id === 'inbox' && openHolds > 0 && <span className="count">{openHolds}</span>}
          </a>
        ))}
      </nav>
      <main>
        <h1>{current.label}</h1>
        <p className="job">{current.job}</p>
        <current.Component />
      </main>
    </div>
  )
}
