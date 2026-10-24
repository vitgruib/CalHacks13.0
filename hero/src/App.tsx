import { Suspense, useEffect, useState } from 'react'
import { demos, type Demo } from './demos/registry'
import { feed } from './feed'

const fromHash = (): Demo => demos.find(d => `#${d.id}` === location.hash) ?? demos[0]
const bare = new URLSearchParams(location.search).has('bare')

export default function App() {
  const [current, setCurrent] = useState(fromHash)

  useEffect(() => {
    const onHash = () => setCurrent(fromHash())
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')) return
      const d = demos[Number(e.key) - 1]
      if (d) location.hash = d.id
    }
    addEventListener('hashchange', onHash)
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('hashchange', onHash)
      removeEventListener('keydown', onKey)
    }
  }, [])

  // Every mockup starts the story from the top.
  useEffect(() => feed.restart(), [current])

  return (
    <>
      <Suspense fallback={<div className="gallery-loading">Loading {current.name}…</div>}>
        <current.Component key={current.id} />
      </Suspense>
      {!bare && (
        <nav className="gallery" aria-label="Hero mockups">
          {demos.map((d, i) => (
            <a key={d.id} href={`#${d.id}`} aria-current={d === current ? 'page' : undefined} title={d.thesis}>
              <kbd>{i + 1}</kbd>
              {d.name}
            </a>
          ))}
        </nav>
      )}
    </>
  )
}
