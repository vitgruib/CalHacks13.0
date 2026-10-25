// Drawn SVG icons. Item icons follow ITEM_LOOKS (items.ts), the same brief the
// 3D parcels are modelled from, so a row in the sidebar reads like the object
// that crossed the scene. Token icons mirror the outcome forms.

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
  return r.holdFor === 'grant_manager' ? 'Held for the grant manager' : 'Held until money lands'
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  accept: 'Bought',
  refine: 'Rerouted or sent back',
  reject: 'Blocked',
  hold: 'Held',
}

// ── Items, one per ItemKind ─────────────────────────────────────────────

const ITEM: Record<ItemKind, ReactNode> = {
  gloves: (
    <>
      <path d="M9.4 10.6c-.2-2.6.1-5 .9-6 .5-.6 1.2-.3 1.3.4l.2-1.3c.1-.8 1.2-.8 1.3 0l.2 1.6c.2-.7 1.1-.6 1.2.1l.2 5.2z" fill="#cfe4ff" />
      <rect x="3" y="9.6" width="18" height="10.8" rx="1.6" fill="#3d76cc" />
      <rect x="3" y="9.6" width="18" height="2.6" rx="1.2" fill="#5b93e6" />
      <rect x="8.2" y="10.3" width="7.6" height="1.3" rx=".65" fill="#173563" />
      <path d="M9.6 11c0-.3.2-.6.5-.6h3.9c.3 0 .5.3.5.6" fill="#cfe4ff" />
      <path d="M6 15.5h12" stroke="#9cc0f2" strokeWidth=".9" strokeLinecap="round" />
    </>
  ),
  plates: (
    <>
      {[17, 13, 9].map(y => (
        <g key={y}>
          <path d={`M3.4 ${y}v1.6c0 1.6 3.9 2.9 8.6 2.9s8.6-1.3 8.6-2.9V${y}`} fill="#9fb0bf" />
          <ellipse cx="12" cy={y} rx="8.6" ry="2.9" fill="#dce6ee" />
          <ellipse cx="12" cy={y + 0.15} rx="7.1" ry="2.2" fill="#e3a447" />
        </g>
      ))}
    </>
  ),
  tips: (
    <>
      <rect x="3" y="5" width="18" height="15" rx="1.8" fill="#4d5c6c" />
      <rect x="3" y="5" width="18" height="15" rx="1.8" fill="none" stroke="#a9d5ec" strokeWidth="1.1" />
      {[0, 1, 2, 3].map(c =>
        [0, 1, 2].map(r => <circle key={`${c}${r}`} cx={6.6 + c * 3.6} cy={9 + r * 3.6} r="1.25" fill="#f2d36b" />),
      )}
    </>
  ),
  bottle: (
    <>
      <rect x="9" y="2.4" width="6" height="3.6" rx=".9" fill="#1a1c1f" stroke="#8a929c" strokeWidth=".8" />
      <path d="M9.2 6h5.6l1.9 2.6c.4.5.6 1.1.6 1.7v8.9c0 1-.8 1.8-1.8 1.8H8.5c-1 0-1.8-.8-1.8-1.8v-8.9c0-.6.2-1.2.6-1.7z" fill="#b8661c" />
      <rect x="7.6" y="11.4" width="8.8" height="5.6" rx=".6" fill="#f3efe6" />
      <path d="M9.2 13.3h5.6M9.2 15.2h3.6" stroke="#8a929c" strokeWidth=".9" strokeLinecap="round" />
    </>
  ),
  kit: (
    <>
      <path d="M4 9.6 6.6 3.6h13.6L19.6 9.6z" fill="#d7dde3" />
      <rect x="5" y="8.2" width="14" height="4.4" rx=".6" fill="#8fa3b6" />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <circle key={i} cx={6.9 + i * 2.05} cy="10.4" r=".75" fill="#e9eef3" />
      ))}
      <rect x="3" y="11.6" width="18" height="8.8" rx="1.4" fill="#f1f3f5" />
      <rect x="3" y="14.6" width="18" height="1.6" fill="#4fb3cc" />
    </>
  ),
  dishes: (
    <>
      <rect x="6.6" y="3" width="10.8" height="18" rx="2.2" fill="#2c3f4c" stroke="#a9cde0" strokeWidth="1" />
      {[6.4, 10.2, 14, 17.8].map(y => (
        <g key={y}>
          <rect x="7.8" y={y - 1.3} width="8.4" height="2.6" rx="1.3" fill="#dceaf2" />
          <rect x="10" y={y - 0.5} width="4" height="1" rx=".5" fill="#8fb7cc" />
        </g>
      ))}
    </>
  ),
  pump: (
    <>
      <rect x="2.6" y="8.6" width="13.4" height="11.8" rx="1.6" fill="#d9dee4" />
      <rect x="4.4" y="10.6" width="6" height="3" rx=".6" fill="#253545" />
      <circle cx="6" cy="17" r="1" fill="#8a96a3" />
      <circle cx="9" cy="17" r="1" fill="#8a96a3" />
      <path d="M12.6 16.6c-1.8 4.6 9.4 5 8.2-3" fill="none" stroke="#f0a36a" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="16.4" cy="11.4" r="4.6" fill="#7d8894" />
      <circle cx="16.4" cy="11.4" r="3.1" fill="#aab3bd" />
      <circle cx="16.4" cy="11.4" r="1.2" fill="#4d5966" />
    </>
  ),
  rotor: (
    <>
      <path d="M2.5 11.4v2.6c0 3 4.3 5.6 9.5 5.6s9.5-2.6 9.5-5.6v-2.6" fill="#7c8590" />
      <ellipse cx="12" cy="11.4" rx="9.5" ry="5.4" fill="#c2c9d0" />
      {[0, 1, 2, 3, 4, 5].map(i => {
        const a = (i / 6) * Math.PI * 2 + 0.5
        return <ellipse key={i} cx={12 + Math.cos(a) * 6.1} cy={11.4 + Math.sin(a) * 3.3} rx="1.7" ry="1" fill="#454d56" />
      })}
      <ellipse cx="12" cy="11.4" rx="2" ry="1.15" fill="#8f98a2" />
    </>
  ),
  espresso: (
    <>
      <rect x="4.6" y="2.8" width="14.8" height="4.6" rx="1.3" fill="#d3d9df" />
      <rect x="5.8" y="7.4" width="12.4" height="9.4" fill="#9aa4ae" />
      <rect x="9.2" y="7.4" width="5.6" height="2.2" rx=".4" fill="#262b31" />
      <path d="M10.3 12.4h3.4v3c0 .6-.5 1.1-1.1 1.1h-1.2c-.6 0-1.1-.5-1.1-1.1z" fill="#f3efe6" />
      <rect x="4.6" y="16.8" width="14.8" height="3.6" rx="1.1" fill="#d3d9df" />
      <path d="M7 18.6h10" stroke="#8a939d" strokeWidth=".9" strokeLinecap="round" />
    </>
  ),
  service: (
    <>
      <rect x="4.6" y="3.8" width="13" height="17.2" rx="1.4" fill="#eef1f4" />
      <rect x="8.1" y="2.4" width="6" height="3" rx="1" fill="#7d8894" />
      <path d="M7.2 9h7.8M7.2 11.6h7.8M7.2 14.2h4.6" stroke="#9aa3ae" strokeWidth="1" strokeLinecap="round" />
      <path d="M13.2 19.6 18.6 14.2" stroke="#e2a54c" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="19.4" cy="13.4" r="2.6" fill="#e2a54c" />
      <circle cx="20.3" cy="12.5" r="1.05" fill="#14161a" />
    </>
  ),
  food: (
    <>
      <path d="M2.4 12.2 12 8.2l9.6 4-9.6 4z" fill="#dcbc8c" />
      <path d="M2.4 12.2v2.2l9.6 4v-2.2z" fill="#b8925c" />
      <path d="M21.6 12.2v2.2l-9.6 4v-2.2z" fill="#9f7b48" />
      <ellipse cx="12" cy="12.2" rx="3.4" ry="1.4" fill="#c4473a" />
    </>
  ),
  chair: (
    <>
      <rect x="7" y="2.4" width="10" height="8.4" rx="2.6" fill="#7a8592" />
      <rect x="5.4" y="11.4" width="13.2" height="3.2" rx="1.6" fill="#97a2ae" />
      <rect x="11.2" y="14.6" width="1.6" height="3.8" fill="#b5bec7" />
      <path d="M6.2 20.6 12 18.2l5.8 2.4" fill="none" stroke="#b5bec7" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6" cy="21.2" r="1.05" fill="#b5bec7" />
      <circle cx="18" cy="21.2" r="1.05" fill="#b5bec7" />
    </>
  ),
  carton: (
    <>
      <path d="M3 8 12 4.4 21 8l-9 3.6z" fill="#d8aa6c" />
      <path d="M3 8v9.6l9 3.6v-9.6z" fill="#b98a4f" />
      <path d="M21 8v9.6l-9 3.6v-9.6z" fill="#a27744" />
      <path d="M7.4 6.2 16.6 9.8" stroke="#ecd3a3" strokeWidth="1.5" />
    </>
  ),
}

/** The thing being bought, drawn the way the 3D parcel looks. */
export function ItemIcon({ kind, size = 24 }: { kind: ItemKind; size?: number }) {
  return (
    <svg className="a-item" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {ITEM[kind] ?? ITEM.carton}
    </svg>
  )
}

// ── Interface icons ─────────────────────────────────────────────────────

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
    <path d="M4.5 6.2 8 9.7l3.5-3.5" />
  </S>
)
export const IconLock = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.4" />
    <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
  </S>
)
export const IconPlus = (p: P) => (
  <S {...p}>
    <path d="M8 3.5v9M3.5 8h9" strokeWidth="1.8" />
  </S>
)
export const IconBack = (p: P) => (
  <S {...p}>
    <path d="M12.5 8H3.5M7 4.5 3.5 8 7 11.5" />
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
