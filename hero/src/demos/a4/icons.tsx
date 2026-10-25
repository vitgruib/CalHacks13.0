// Drawn SVG icons. Token icons mirror the 3D forms: a parcel for bought, a
// ring for rerouted or sent back, a flat tile for blocked, an upright pawn
// for held, and a plain coin for a request still in flight.

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
export const IconMore = (p: P) => (
  <S {...p}>
    <circle cx="3.5" cy="8" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="8" r="1.3" fill="currentColor" stroke="none" />
  </S>
)
export const IconList = (p: P) => (
  <S {...p}>
    <path d="M3 4.5h10M3 8h10M3 11.5h10" />
  </S>
)
export const IconInbox = (p: P) => (
  <S {...p}>
    <path d="M2.5 9.5 4.2 3.5h7.6l1.7 6v3h-11z" />
    <path d="M2.5 9.5h3.2l.8 1.5h3l.8-1.5h3.2" />
  </S>
)
export const IconLedger = (p: P) => (
  <S {...p}>
    <rect x="3" y="2.5" width="10" height="11" rx="1.5" />
    <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" />
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
export const IconChevron = (p: P) => (
  <S {...p}>
    <path d="M5 6.5 8 9.5l3-3" />
  </S>
)
export const IconPlus = (p: P) => (
  <S {...p}>
    <path d="M8 3.5v9M3.5 8h9" strokeWidth="1.8" />
  </S>
)
export const IconLock = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="currentColor" stroke="none" />
    <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
  </S>
)

// ── Item icons: what each request physically is, drawn like its 3D parcel ──

const EDGE = 'rgb(28 35 44 / 0.62)'

/** One drawn icon per ItemKind; colours follow the 3D objects (see ITEM_LOOKS in the feed). */
export function ItemIcon({ kind, size = 20 }: { kind: ItemKind; size?: number }) {
  return (
    <svg className="a-item-ico" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <g stroke={EDGE} strokeWidth="0.8" strokeLinejoin="round" strokeLinecap="round">
        {ITEM_ART[kind]}
      </g>
    </svg>
  )
}

const ITEM_ART: Record<ItemKind, ReactNode> = {
  gloves: (
    <>
      <path d="M8 7.4C7.6 4.6 8.6 2.4 10.3 2.4s2.5 2 2 5" fill="#9CC3EC" />
      <rect x="2.6" y="7" width="14.8" height="10.2" rx="1.6" fill="#3F7FC4" />
      <rect x="6.6" y="6.4" width="6.8" height="1.6" rx="0.8" fill="#1F3F66" />
      <rect x="5" y="11" width="10" height="3.4" rx="0.7" fill="#F5F7FA" stroke="none" />
    </>
  ),
  plates: (
    <>
      {[12.8, 9.2, 5.6].map(y => (
        <g key={y}>
          <rect x="2.6" y={y} width="14.8" height="3.2" rx="1.4" fill="#EEF3F6" />
          <rect x="3.9" y={y + 1.1} width="12.2" height="1.3" rx="0.6" fill="#D99A2B" stroke="none" />
        </g>
      ))}
    </>
  ),
  tips: (
    <>
      <rect x="2.4" y="9.6" width="15.2" height="7.6" rx="1.2" fill="#5868B0" />
      <rect x="2.4" y="4.2" width="15.2" height="5.6" rx="1.2" fill="#E3ECF2" />
      {[5, 8.3, 11.7, 15].map(x => (
        <g key={x} stroke="none" fill="#E2B33C">
          <circle cx={x} cy="5.9" r="0.95" />
          <circle cx={x} cy="8.2" r="0.95" />
        </g>
      ))}
    </>
  ),
  bottle: (
    <>
      <path d="M8 4.4h4v2.2c1.4.4 2.4 1.6 2.4 3.1v6.4c0 .9-.7 1.6-1.6 1.6H7.2c-.9 0-1.6-.7-1.6-1.6V9.7c0-1.5 1-2.7 2.4-3.1z" fill="#9C5B22" />
      <rect x="7.3" y="1.8" width="5.4" height="3" rx="0.7" fill="#1E2328" />
      <rect x="6.6" y="10" width="6.8" height="4.6" rx="0.6" fill="#FFFFFF" />
    </>
  ),
  kit: (
    <>
      <rect x="2.4" y="8.6" width="15.2" height="8.6" rx="1.2" fill="#F7F7F4" />
      <rect x="3.8" y="9.8" width="12.4" height="4.2" rx="0.6" fill="#DCE6EE" />
      {[5.4, 7.5, 9.6, 11.7, 13.8].map(x => (
        <g key={x} stroke="none" fill="#7F97AE">
          <circle cx={x + 0.4} cy="11.1" r="0.7" />
          <circle cx={x + 0.4} cy="12.9" r="0.7" />
        </g>
      ))}
      <path d="M4.6 7.6 5.6 3.2l12.2 1.3-.9 3.9z" fill="#FFFFFF" />
    </>
  ),
  dishes: (
    <>
      <rect x="5.4" y="2.4" width="9.2" height="15.2" rx="2.2" fill="#E6EFF5" />
      {[5.4, 8.6, 11.8, 15].map(y => (
        <g key={y}>
          <ellipse cx="10" cy={y} rx="3.3" ry="1.15" fill="#F8FBFD" />
          <ellipse cx="10" cy={y} rx="1.5" ry="0.5" fill="#9FC7E2" stroke="none" />
        </g>
      ))}
    </>
  ),
  pump: (
    <>
      <path d="M5.8 10.6C3.4 5.4 12.4 3 11.6 9.6" fill="none" stroke="#D0843A" strokeWidth="1.6" />
      <rect x="2.4" y="8.2" width="15.2" height="9" rx="1.4" fill="#E2E6EA" />
      <circle cx="8" cy="12.7" r="3" fill="#A3AEB9" />
      <circle cx="8" cy="12.7" r="1" fill="#5E6873" stroke="none" />
      <rect x="12.4" y="11" width="3.6" height="2.2" rx="0.4" fill="#2B3440" stroke="none" />
    </>
  ),
  rotor: (
    <>
      <circle cx="10" cy="10" r="7.6" fill="#BCC3CA" />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <circle key={i} cx={10 + 4.6 * Math.cos((i * Math.PI) / 3)} cy={10 + 4.6 * Math.sin((i * Math.PI) / 3)} r="1.45" fill="#56606B" />
      ))}
      <circle cx="10" cy="10" r="1.6" fill="#8A939D" />
    </>
  ),
  espresso: (
    <>
      <path d="M3.8 2.8h12.4v4.6h-8.4v7.4h8.4v2.6H3.8z" fill="#D3D9DF" />
      <rect x="8.2" y="7.4" width="5.2" height="1.6" rx="0.4" fill="#4B5560" />
      <path d="M13.4 8.2h3.4" stroke="#1E2328" strokeWidth="1.4" />
      <rect x="9" y="11.4" width="3.6" height="3" rx="0.6" fill="#FFFFFF" />
    </>
  ),
  service: (
    <>
      <rect x="3.6" y="3" width="11" height="14.6" rx="1.2" fill="#FFFFFF" />
      <rect x="7" y="1.8" width="4.2" height="2.6" rx="0.6" fill="#7D8794" />
      <path d="M6 7.6h6.2M6 10h6.2M6 12.4h3.4" stroke="#A3AEB9" strokeWidth="1" />
      <path d="M11 17.6 15.6 13" stroke="#4E5967" strokeWidth="2" />
      <path d="M15 10.6a2.3 2.3 0 1 0 2.6 2.6l-1.5.2-.9-.9z" fill="#4E5967" />
    </>
  ),
  food: (
    <>
      <path d="M2 11.6v1.8l8 4v-1.8z" fill="#B8955F" />
      <path d="M18 11.6v1.8l-8 4v-1.8z" fill="#C9A56E" />
      <path d="M2 11.6 10 7.6l8 4-8 4z" fill="#DDC08F" />
      <ellipse cx="10" cy="11.6" rx="2.8" ry="1.3" fill="#B0423A" stroke="none" />
    </>
  ),
  chair: (
    <>
      <rect x="11.8" y="2.8" width="2.8" height="8.4" rx="1.3" fill="#3A4451" />
      <rect x="4.6" y="9.8" width="9.6" height="2.4" rx="1.1" fill="#3A4451" />
      <path d="M9.4 12.2v3.6M4.8 17l4.6-1.2 4.6 1.2" fill="none" stroke="#3A4451" strokeWidth="1.3" />
      <circle cx="4.8" cy="17.4" r="1" fill="#1E2328" />
      <circle cx="14" cy="17.4" r="1" fill="#1E2328" />
    </>
  ),
  carton: (
    <>
      <path d="M3 7 10 3.8 17 7 10 10.2z" fill="#DDBB86" />
      <path d="M3 7v8l7 3.2v-8z" fill="#C79D63" />
      <path d="M17 7v8l-7 3.2v-8z" fill="#B48850" />
      <path d="M6.4 5.4 13.5 8.6" stroke="#F1E3C4" strokeWidth="1.4" />
    </>
  ),
}

/** A station on the map: a ring for a stop, a capsule where several lines meet. */
export function StationMark({ colors, size = 14 }: { colors: string[]; size?: number }) {
  const n = Math.max(1, colors.length)
  const w = 10 + (n - 1) * 6
  return (
    <svg className="a-station" width={(size * w) / 10} height={size} viewBox={`0 0 ${w} 10`} aria-hidden="true">
      <rect x="1" y="1" width={w - 2} height="8" rx="4" fill="#FFFFFF" stroke="#1C232C" strokeWidth="1.6" />
      {colors.map((c, i) => (
        <circle key={c} cx={5 + i * 6} cy="5" r="2" fill={c} />
      ))}
    </svg>
  )
}
