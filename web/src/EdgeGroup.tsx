// The edge-case grants (people.ts) folded away below the lab's own, so the
// grant office sees the lab's two grants first.
import type { ReactNode } from 'react'
import './EdgeGroup.css'

export default function EdgeGroup({ count, children }: { count: number; children: ReactNode }) {
  if (count === 0) return null
  return (
    <details className="edge-group">
      <summary>Edge cases ({count})</summary>
      {children}
    </details>
  )
}
