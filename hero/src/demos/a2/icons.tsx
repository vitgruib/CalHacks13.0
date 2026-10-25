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
export const IconBack = (p: P) => (
  <S {...p}>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </S>
)
export const IconChapters = (p: P) => (
  <S {...p}>
    <circle cx="3.6" cy="4.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="3.6" cy="8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="3.6" cy="11.5" r="1.1" fill="currentColor" stroke="none" />
    <path d="M6.5 4.5h6.5M6.5 8h6.5M6.5 11.5h4.5" />
  </S>
)

// ── What a request is for, drawn as the clay object the scene sends ─────
// A light oblique box language (front, top, side faces) so each reads like
// the 3D parcel at 24 to 32 px.

const box = (x: number, y: number, w: number, h: number, front: string, top: string, side: string, dx = 3, dy = -4, line?: string) => (
  <>
    <path d={`M${x} ${y}l${dx} ${dy}h${w}l${-dx} ${-dy}z`} fill={top} stroke={line} strokeWidth={line ? 0.8 : 0} strokeLinejoin="round" />
    <path d={`M${x + w} ${y}l${dx} ${dy}v${h}l${-dx} ${-dy}z`} fill={side} stroke={line} strokeWidth={line ? 0.8 : 0} strokeLinejoin="round" />
    <rect x={x} y={y} width={w} height={h} rx="1.2" fill={front} stroke={line} strokeWidth={line ? 0.8 : 0} />
  </>
)

const ITEM_ART: Record<ItemKind, ReactNode> = {
  gloves: (
    <>
      {box(5, 14, 20, 12, '#5B8FD6', '#8DB3E6', '#3F6DB0')}
      <ellipse cx="16.5" cy="12" rx="5.2" ry="1.1" fill="#2E4F86" />
      <path d="M12.6 12c-.3-4.2 1.4-6.8 3.9-6.8s4.2 2.6 3.9 6.8" fill="#E4EEFA" stroke="#3F6DB0" strokeWidth="1" />
      <path d="M14.6 7.4v3.4M16.5 6.6v4.2M18.4 7.4v3.4" stroke="#9DBBE6" strokeWidth="0.9" strokeLinecap="round" />
    </>
  ),
  plates: (
    <>
      {[22, 17, 12].map(y => (
        <g key={y}>
          <path d={`M5 ${y}v3a11 3.2 0 0 0 22 0v-3`} fill="#E3B866" stroke="#8D99A6" strokeWidth="0.8" />
          <ellipse cx="16" cy={y} rx="11" ry="3.2" fill="#EEF2F5" stroke="#8D99A6" strokeWidth="0.8" />
          <ellipse cx="16" cy={y + 0.2} rx="8.6" ry="2.2" fill="#D9A441" />
        </g>
      ))}
    </>
  ),
  tips: (
    <>
      {box(5, 15, 20, 11, '#2E5BA6', '#4F79BF', '#22468A')}
      <rect x="5" y="15" width="20" height="4.5" rx="1.2" fill="#DCE6F2" opacity="0.92" />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <path key={i} d={`M${7.4 + i * 3.1} 16v2.6`} stroke="#C99A2E" strokeWidth="1.3" strokeLinecap="round" />
      ))}
      {[0, 1, 2, 3, 4].map(i => (
        <circle key={`t${i}`} cx={9.6 + i * 3.4} cy="13" r="0.95" fill="#F2D36B" />
      ))}
    </>
  ),
  bottle: (
    <>
      <rect x="12.5" y="3.5" width="7" height="4.2" rx="1" fill="#1C232C" />
      <rect x="13.5" y="7.4" width="5" height="3" fill="#7C4812" />
      <path d="M10 14.6c0-2.6 1.8-4.4 3.5-4.4h5c1.7 0 3.5 1.8 3.5 4.4V27a1.6 1.6 0 0 1-1.6 1.6H11.6A1.6 1.6 0 0 1 10 27z" fill="#A8641C" />
      <rect x="11" y="16" width="10" height="7.5" rx="0.8" fill="#F7F4EF" />
      <path d="M13 18.6h6M13 21h4" stroke="#9AA6B3" strokeWidth="1" strokeLinecap="round" />
      <path d="M11.6 13.8v10" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  kit: (
    <>
      <path d="M8 11.2 7.4 4.2h18l.6 7z" fill="#FBF9F5" stroke="#8D99A6" strokeWidth="0.8" strokeLinejoin="round" />
      {box(5, 15, 20, 11, '#F5F1EB', '#E3E8EE', '#DCD5CA', 3, -4, '#8D99A6')}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <g key={i}>
          <circle cx={9.2 + i * 3} cy="13.6" r="0.75" fill="#8D99A6" />
          <circle cx={10.4 + i * 3} cy="12" r="0.75" fill="#8D99A6" />
        </g>
      ))}
      <path d="M8.5 20h8" stroke="#2E5BA6" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  dishes: (
    <>
      <path d="M6.5 10.8h18.5v11.4H6.5z" fill="#E6ECF1" />
      <ellipse cx="6.5" cy="16.5" rx="2.4" ry="5.7" fill="#D3DCE4" stroke="#8D99A6" strokeWidth="0.8" />
      <path d="M6.5 10.8h18.5M6.5 22.2h18.5" stroke="#8D99A6" strokeWidth="0.8" />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <path key={i} d={`M${9.6 + i * 2.6} 11.2v10.6`} stroke="#AEBBC8" strokeWidth="0.9" />
      ))}
      <ellipse cx="25" cy="16.5" rx="2.6" ry="5.7" fill="#F3F6F8" stroke="#8D99A6" strokeWidth="0.8" />
      <ellipse cx="25" cy="16.5" rx="1.2" ry="2.7" fill="#BFD9E6" />
    </>
  ),
  pump: (
    <>
      {box(4, 13, 21, 13, '#E9E5DD', '#F5F2EC', '#CFC8BD', 3, -4, '#9A9184')}
      <rect x="6.5" y="15.5" width="5.5" height="3.2" rx="0.6" fill="#3A4451" />
      <circle cx="18" cy="19.5" r="4.6" fill="#5E6B7A" />
      {[0, 1, 2].map(i => (
        <circle key={i} cx={18 + 2.6 * Math.cos((i * 2 * Math.PI) / 3)} cy={19.5 + 2.6 * Math.sin((i * 2 * Math.PI) / 3)} r="1.05" fill="#C9D1DA" />
      ))}
      <path d="M13.6 20.6c-4 .4-6.2 3.2-4.6 5.6s7.6 3.2 12.4 1.6 3.2-4.2 1-5.8" fill="none" stroke="#C98B2E" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  rotor: (
    <>
      <path d="M5 13v5.5a11 5.4 0 0 0 22 0V13" fill="#8F969F" />
      <ellipse cx="16" cy="13" rx="11" ry="5.4" fill="#BAC0C7" />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <ellipse key={i} cx={16 + 7 * Math.cos((i * Math.PI) / 3)} cy={13 + 3.3 * Math.sin((i * Math.PI) / 3)} rx="1.7" ry="0.95" fill="#4E5967" />
      ))}
      <ellipse cx="16" cy="13" rx="2.3" ry="1.2" fill="#6B737D" />
      <path d="M7.5 10.6c2.6-1.6 6-2.1 9.5-1.9" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round" />
    </>
  ),
  espresso: (
    <>
      <rect x="7" y="5" width="18" height="21.5" rx="2.4" fill="#AEB6BF" />
      <rect x="7" y="5" width="18" height="4" rx="2" fill="#C9D0D7" />
      <rect x="9.6" y="12.4" width="12.8" height="10.8" rx="1" fill="#3A4451" />
      <rect x="13" y="12.4" width="6" height="2.8" rx="0.6" fill="#7A8592" />
      <path d="M13 13.8H7.8" stroke="#1C232C" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 18.6h4v2.6a1.2 1.2 0 0 1-1.2 1.2h-1.6a1.2 1.2 0 0 1-1.2-1.2z" fill="#F5F1EB" />
      <rect x="8.2" y="24.2" width="15.6" height="2.4" rx="0.8" fill="#5E6B7A" />
    </>
  ),
  service: (
    <>
      <rect x="7.5" y="5" width="15.5" height="22" rx="1.6" fill="#F7F4EF" stroke="#8D99A6" strokeWidth="0.8" />
      <rect x="12" y="3.2" width="6.5" height="4" rx="1" fill="#5E6B7A" />
      <path d="M10.5 11.5h9.5M10.5 14.5h9.5M10.5 17.5h6" stroke="#B6C0CB" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M19.4 21.4l5.2 5.2" stroke="#2E5BA6" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M21.2 18.2a3.4 3.4 0 1 1-4.4 4.4l1.9-.4.4-1.9z" fill="#2E5BA6" />
    </>
  ),
  food: (
    <>
      {box(4, 17, 22, 7, '#C9A36E', '#DDBD8A', '#B08A55')}
      <ellipse cx="16.5" cy="15" rx="4.2" ry="1.3" fill="#9C2E2A" />
      <path d="M6.5 20.5h17" stroke="#B08A55" strokeWidth="0.9" strokeLinecap="round" />
    </>
  ),
  chair: (
    <>
      <rect x="10" y="4" width="12" height="10.5" rx="3" fill="#4E5967" />
      <rect x="15.1" y="14" width="1.8" height="3" fill="#5E6B7A" />
      <rect x="7.5" y="16.5" width="17" height="4" rx="2" fill="#3A4451" />
      <rect x="15.1" y="20.5" width="1.8" height="4.4" fill="#5E6B7A" />
      <path d="M8.5 27.2 16 24.6l7.5 2.6M16 24.6v3.2" stroke="#5E6B7A" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="8.5" cy="27.6" r="1.2" fill="#1C232C" />
      <circle cx="23.5" cy="27.6" r="1.2" fill="#1C232C" />
      <circle cx="16" cy="28.4" r="1.2" fill="#1C232C" />
    </>
  ),
  carton: (
    <>
      {box(5, 13, 20, 13, '#C9A36E', '#DDBD8A', '#A9844F')}
      <path d="M13.2 13l3-4h3.2l-3 4z" fill="#EAD7AC" />
      <rect x="13.2" y="13" width="3.2" height="5" fill="#EAD7AC" />
    </>
  ),
}

/** The thing being bought, as an icon that matches its 3D parcel. */
export function ItemIcon({ kind, size = 28 }: { kind: ItemKind; size?: number }) {
  return (
    <svg className="a-item" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {ITEM_ART[kind] ?? ITEM_ART.carton}
    </svg>
  )
}

/** The mark: two plinths and the arc between them. */
export const Mark = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="1.5" y="14" width="8" height="6" rx="1.6" fill="currentColor" opacity="0.55" />
    <rect x="14.5" y="14" width="8" height="6" rx="1.6" fill="currentColor" />
    <path d="M5.5 13C7 5.5 17 5.5 18.5 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="7.4" r="2" fill="currentColor" />
  </svg>
)
