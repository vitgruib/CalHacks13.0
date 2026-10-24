import { Suspense, lazy, useEffect, useState } from 'react'
import { demos, type Demo } from './demos/registry'
import { feed } from './feed'

const Overview = lazy(() => import('./Overview'))

const fromHash = (): Demo | undefined => demos.find(d => `#${d.id}` === location.hash)
const params = new URLSearchParams(location.search)
const bare = params.has('bare')
// ?at=<feed ms> starts the story partway in, for checking later beats (`npm run story` prints their times).
const startAt = Math.max(0, Number(params.get('at')) || 0)

export default function App() {
  const [current, setCurrent] = useState(fromHash)

  useEffect(() => {
    const onHash = () => setCurrent(fromHash())
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === '0') location.hash = 'overview'
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
  useEffect(() => {
    feed.restart()
    if (startAt) feed.advance(startAt)
  }, [current])

  return (
    <>
      <Suspense fallback={<div className="gallery-loading">Loading {current?.name ?? 'overview'}…</div>}>
        {current ? <current.Component key={current.id} /> : <Overview />}
      </Suspense>
      {!bare && (
        <nav className="gallery" aria-label="Hero mockups">
          <a href="#overview" aria-current={current ? undefined : 'page'}>
            <kbd>0</kbd>
            All five
          </a>
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
