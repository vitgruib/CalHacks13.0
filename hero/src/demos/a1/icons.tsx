// Drawn SVG icons. Item icons draw what each request physically is, in the
// colours of the 3D parcels (items.ts ITEM_LOOKS). Token icons mirror the
// round 1 outcome forms and are still read by the scene.

import type { ReactNode } from 'react'
import type { ItemKind, Outcome, Request } from '../../feed'

export function TokenIcon({ outcome, size = 16 }: { outcome?: Outcome; size?: number }) {
  const cls = `a-ico a-ico--${outcome ?? 'pending'}`
  return (
    <svg className={cls} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {outcome === 'accept' && <rect x="3" y="3" width="10" height="10" rx="2.5" />}
      {outcome === 'refine' && <circle cx="8" cy="8" r="4.6" fill="none" strokeWidth="2.8" />}
      {outcome === 'reject' && <rect x="2" y="6" width="12" height="4.5" rx="1.2" />}
      {outcome === 'hold' && <rect x="5.2" y="2" width="5.6" height="12" rx="2.8" />}
      {!outcome && <ellipse cx="8" cy="8" rx="5.5" ry="3.4" />}
    </svg>
  )
}

export function outcomeWord(r: Pick<Request, 'outcome' | 'state' | 'holdFor' | 'chargedGrantId'>) {
  if (!r.outcome) return 'Checking'
  if (r.outcome === 'accept') return 'Bought'
  if (r.outcome === 'refine') return r.state === 'rerouted' || r.chargedGrantId ? 'Rerouted' : 'Sent back'
  if (r.outcome === 'reject') return r.state === 'rejected' ? 'Rejected' : 'Blocked'
  return r.holdFor === 'grant_manager' ? 'Waiting on you' : 'Held until money lands'
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  accept: 'Bought',
  refine: 'Rerouted or sent back',
  reject: 'Blocked',
  hold: 'Held',
}

// ── Items ─────────────────────────────────────────────────────────────────

const EDGE = '#6b7682'
const ITEMS: Record<ItemKind, ReactNode> = {
  gloves: (
    <>
      <path d="M9.4 9.4C9.2 5.8 10.6 3.4 12.3 3.4s3 2.4 2.6 6z" fill="#a9c6ec" stroke="#2f5590" strokeWidth="0.8" />
      <rect x="3" y="9" width="18" height="11.5" rx="1.6" fill="#4a7fc1" />
      <rect x="7.8" y="8.4" width="8.6" height="2.2" rx="1.1" fill="#24467a" />
      <rect x="5" y="14.2" width="8" height="2.4" rx="0.6" fill="#f7f5f0" />
    </>
  ),
  plates: (
    <>
      {[16, 11.6, 7.2].map(y => (
        <g key={y}>
          <rect x="3.5" y={y} width="17" height="4.4" rx="2.2" fill="#e9eef2" stroke={EDGE} strokeWidth="0.8" />
          <rect x="5" y={y + 1.2} width="14" height="2.2" rx="1.1" fill="#d9a441" />
        </g>
      ))}
    </>
  ),
  tips: (
    <>
      <rect x="3" y="12.5" width="18" height="8" rx="1.2" fill="#4e5967" />
      <rect x="3" y="5.5" width="18" height="7.5" rx="1.2" fill="#9dbbe0" stroke="#2f5590" strokeWidth="0.8" />
      {[6, 9, 12, 15, 18].map(x =>
        [8, 10.8].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.95" fill="#f2efe8" />),
      )}
    </>
  ),
  bottle: (
    <>
      <rect x="9" y="2.4" width="6" height="3.6" rx="0.8" fill="#1c232c" />
      <rect x="10" y="5.6" width="4" height="2.4" fill="#7c4512" />
      <rect x="6" y="7.4" width="12" height="14.2" rx="3" fill="#a8641e" />
      <rect x="7.4" y="11.6" width="9.2" height="5.8" rx="0.6" fill="#f7f5f0" />
      <rect x="9" y="13.6" width="6" height="0.9" fill="#8d99a6" />
    </>
  ),
  kit: (
    <>
      <rect x="3" y="11" width="18" height="9.5" rx="1.2" fill="#f4f2ee" stroke={EDGE} strokeWidth="0.8" />
      <rect x="5" y="9.4" width="14" height="4.2" rx="0.6" fill="#c9d1da" />
      {[7, 9.5, 12, 14.5, 17].map(x => (
        <circle key={x} cx={x} cy="11.5" r="0.75" fill="#5e6b7a" />
      ))}
      <path d="M3.4 9.6 19.8 4.4l.8 2.3L4.2 11.9z" fill="#ffffff" stroke={EDGE} strokeWidth="0.8" strokeLinejoin="round" />
      <rect x="5" y="16" width="6" height="1.6" rx="0.4" fill="#2e5ba6" />
    </>
  ),
  dishes: (
    <>
      <rect x="2.5" y="8" width="19" height="8.4" rx="4.2" fill="#e7eef3" stroke={EDGE} strokeWidth="0.8" />
      {[6.2, 9.4, 12.6, 15.8].map(x => (
        <rect key={x} x={x} y="9.4" width="1.8" height="5.6" rx="0.9" fill="#a9c2d3" />
      ))}
    </>
  ),
  pump: (
    <>
      <path d="M14.6 7.6c4-2.2 7.6 1.2 6.8 4.8-.6 3-3.4 4.5-6.2 4" fill="none" stroke="#c98b2e" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="2.6" y="9" width="13.4" height="11.4" rx="1.6" fill="#b9c0c8" stroke={EDGE} strokeWidth="0.8" />
      <rect x="4.6" y="11" width="6" height="3.2" rx="0.5" fill="#26303b" />
      <circle cx="16.6" cy="12.2" r="3.8" fill="#4e5967" />
      <circle cx="16.6" cy="12.2" r="1.3" fill="#c9d1da" />
      <circle cx="5.6" cy="17.4" r="0.9" fill="#5e6b7a" />
      <circle cx="8.4" cy="17.4" r="0.9" fill="#5e6b7a" />
    </>
  ),
  rotor: (
    <>
      <ellipse cx="12" cy="15" rx="9.6" ry="6" fill="#7f8a96" />
      <ellipse cx="12" cy="12.8" rx="9.6" ry="6" fill="#b3bbc4" stroke={EDGE} strokeWidth="0.8" />
      {[
        [12, 8.4],
        [17.6, 10.2],
        [18.4, 14],
        [12, 17.2],
        [6.4, 15.4],
        [5.6, 11.6],
      ].map(([x, y]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="1.5" ry="0.95" fill="#3a4451" />
      ))}
      <ellipse cx="12" cy="12.8" rx="2.2" ry="1.4" fill="#5e6b7a" />
    </>
  ),
  espresso: (
    <>
      <rect x="5" y="3.6" width="14" height="17" rx="2" fill="#c7ced6" stroke={EDGE} strokeWidth="0.8" />
      <rect x="5.4" y="4" width="13.2" height="3.4" rx="1.6" fill="#8d99a6" />
      <rect x="8.6" y="9" width="6.8" height="2.2" rx="0.6" fill="#26303b" />
      <rect x="11.2" y="11" width="1.6" height="1.6" fill="#26303b" />
      <rect x="9.6" y="13.8" width="4.8" height="3.8" rx="0.8" fill="#ffffff" stroke={EDGE} strokeWidth="0.6" />
      <rect x="6.4" y="18.2" width="11.2" height="1.4" rx="0.4" fill="#6b7682" />
    </>
  ),
  service: (
    <>
      <rect x="4.6" y="4" width="13" height="17" rx="1.2" fill="#f7f5f0" stroke={EDGE} strokeWidth="0.8" />
      <rect x="8.6" y="2.4" width="5" height="3.2" rx="0.8" fill="#4e5967" />
      <rect x="7" y="8.6" width="8.2" height="1" rx="0.5" fill="#a3aebb" />
      <rect x="7" y="11" width="6" height="1" rx="0.5" fill="#a3aebb" />
      <path d="M12.6 19.6 17.4 14.8" stroke="#2e5ba6" strokeWidth="2" strokeLinecap="round" />
      <circle cx="18.6" cy="13.6" r="2.4" fill="none" stroke="#2e5ba6" strokeWidth="1.6" />
    </>
  ),
  food: (
    <>
      <rect x="2.4" y="6.4" width="19.2" height="6.6" rx="1" fill="#e2c491" stroke="#9b7a45" strokeWidth="0.8" />
      <rect x="2.4" y="12.6" width="19.2" height="4.4" rx="0.8" fill="#c49a5c" stroke="#9b7a45" strokeWidth="0.8" />
      <ellipse cx="12" cy="9.7" rx="3.2" ry="1.7" fill="#9c2e2a" />
    </>
  ),
  chair: (
    <>
      <rect x="7" y="3.4" width="10" height="7.4" rx="2.4" fill="#4e5967" />
      <rect x="5.6" y="11" width="12.8" height="3.2" rx="1.6" fill="#3a4451" />
      <rect x="11.2" y="14" width="1.6" height="4.4" fill="#5e6b7a" />
      <path d="M5.8 20.4 12 18l6.2 2.4" fill="none" stroke="#5e6b7a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5.8" cy="20.8" r="1" fill="#26303b" />
      <circle cx="18.2" cy="20.8" r="1" fill="#26303b" />
    </>
  ),
  carton: (
    <>
      <path d="M3 9.2 8 6.6h13l-5 2.6z" fill="#d8b384" stroke="#8a6539" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M16 9.2 21 6.6v11l-5 2.6z" fill="#a97e50" stroke="#8a6539" strokeWidth="0.8" strokeLinejoin="round" />
      <rect x="3" y="9.2" width="13" height="11" fill="#c49a6c" stroke="#8a6539" strokeWidth="0.8" />
      <rect x="8.5" y="9.2" width="2" height="11" fill="#e3cfae" />
    </>
  ),
}

export function ItemIcon({ kind, size = 24 }: { kind: ItemKind; size?: number }) {
  return (
    <svg className="a-item" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {ITEMS[kind] ?? ITEMS.carton}
    </svg>
  )
}

// ── Network nodes (match the clay pods, the person and the posts) ─────────

export function NodeGlyph({ kind, size = 20 }: { kind: 'agent' | 'person' | 'source' | 'grant' | 'vendor' | 'researcher'; size?: number }) {
  return (
    <svg className={`a-glyph a-glyph--${kind}`} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      {kind === 'agent' && (
        <>
          <rect x="8.2" y="11" width="3.6" height="6" rx="0.8" className="a-glyph-col" />
          <ellipse cx="10" cy="17.4" rx="5" ry="1.4" className="a-glyph-col" />
          <ellipse cx="10" cy="8" rx="5.6" ry="4.8" className="a-glyph-pod" />
        </>
      )}
      {(kind === 'person' || kind === 'researcher') && (
        <>
          <circle cx="10" cy="6.4" r="3.4" className="a-glyph-pod" />
          <path d="M3.6 18c.6-4.4 3.2-6.6 6.4-6.6s5.8 2.2 6.4 6.6z" className="a-glyph-pod" />
        </>
      )}
      {kind === 'source' && (
        <>
          <rect x="6.4" y="4" width="7.2" height="12.4" rx="1.4" className="a-glyph-pod" />
          <ellipse cx="10" cy="16.8" rx="5" ry="1.4" className="a-glyph-col" />
        </>
      )}
      {kind === 'vendor' && <path d="M3.5 7.5 10 4l6.5 3.5v8L10 19l-6.5-3.5z" className="a-glyph-pod" />}
      {kind === 'grant' && (
        <>
          <rect x="4.4" y="3.4" width="11.2" height="14" rx="3" className="a-glyph-col" />
          <rect x="5.6" y="9" width="8.8" height="7.2" rx="2" className="a-glyph-pod" />
        </>
      )}
    </svg>
  )
}

// ── Controls ──────────────────────────────────────────────────────────────

type P = { size?: number }
const S = ({ size = 16, children }: P & { children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export const IconPlay = (p: P) => (
  <S {...p}>
    <path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" />
  </S>
)
export const IconPause = (p: P) => (
  <S {...p}>
    <path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth="2.2" />
  </S>
)
export const IconReplay = (p: P) => (
  <S {...p}>
    <path d="M3.5 8a4.5 4.5 0 1 0 1.4-3.3" />
    <path d="M3.2 2.6v2.6h2.6" />
  </S>
)
export const IconClose = (p: P) => (
  <S {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </S>
)
export const IconArrow = (p: P) => (
  <S {...p}>
    <path d="M3 8h9.5M9 4.5 12.5 8 9 11.5" />
  </S>
)
export const IconCheck = (p: P) => (
  <S {...p}>
    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeWidth="2" />
  </S>
)
export const IconCross = (p: P) => (
  <S {...p}>
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" strokeWidth="2" />
  </S>
)
export const IconChevron = (p: P) => (
  <S {...p}>
    <path d="M4.5 6.5 8 10l3.5-3.5" />
  </S>
)
export const IconPlus = (p: P) => (
  <S {...p}>
    <path d="M8 3.5v9M3.5 8h9" />
  </S>
)

/** The mark: two plinths and the arc between them. */
export const Mark = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="1.5" y="14" width="8" height="6" rx="1.6" fill="currentColor" opacity="0.55" />
    <rect x="14.5" y="14" width="8" height="6" rx="1.6" fill="currentColor" />
    <path d="M5.5 13C7 5.5 17 5.5 18.5 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="7.4" r="2" fill="currentColor" />
  </svg>
)
