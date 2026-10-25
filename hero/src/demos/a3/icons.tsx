// Drawn SVG icons. Token icons mirror the 3D verdict forms; item icons
// mirror the thing a researcher sends (one per ItemKind, drawn to read like
// the 3D object at parcel size); the rest are plain line glyphs.

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

// ── Item icons ─────────────────────────────────────────────────────────────

const EDGE = '#3A4451'
const ITEM: Record<ItemKind, ReactNode> = {
  gloves: (
    <>
      <path d="M8.6 10.6V6.9a1.15 1.15 0 0 1 2.3 0V5.4a1.15 1.15 0 0 1 2.3 0v1a1.15 1.15 0 0 1 2.3 0v4.2" fill="#BCD6F0" stroke={EDGE} strokeWidth="1" />
      <rect x="3.5" y="10" width="17" height="10.5" rx="2" fill="#3E7CC4" stroke={EDGE} strokeWidth="1" />
      <rect x="7.2" y="10" width="9.6" height="2.2" rx="1.1" fill="#1F4E86" />
      <rect x="6" y="15" width="7" height="2.4" rx="0.6" fill="#F3F5F7" />
    </>
  ),
  plates: (
    <>
      <rect x="4" y="15.4" width="16" height="4.2" rx="1.4" fill="#D9A441" stroke="#7E8B98" strokeWidth="1" />
      <rect x="4" y="10.8" width="16" height="4.2" rx="1.4" fill="#D9A441" stroke="#7E8B98" strokeWidth="1" />
      <rect x="4" y="6.2" width="16" height="4.2" rx="1.4" fill="#E2B65C" stroke="#7E8B98" strokeWidth="1" />
      <path d="M6 7.4h7M6 12h7M6 16.6h7" stroke="#FFF6E0" strokeWidth="0.9" strokeLinecap="round" />
    </>
  ),
  tips: (
    <>
      <rect x="4" y="10" width="16" height="10" rx="1.6" fill="#EEF1F4" stroke={EDGE} strokeWidth="1" />
      <rect x="3.5" y="6.5" width="17" height="4" rx="1.4" fill="#3D9C8F" stroke={EDGE} strokeWidth="1" />
      {[6.5, 9.5, 12.5, 15.5].map(x => (
        <g key={x}>
          <circle cx={x + 1} cy="13.3" r="1" fill="#E2B13C" />
          <circle cx={x + 1} cy="16.6" r="1" fill="#E2B13C" />
        </g>
      ))}
    </>
  ),
  bottle: (
    <>
      <rect x="9" y="2.5" width="6" height="3.4" rx="0.9" fill="#1C232C" />
      <path d="M10 5.8h4v1.6l2.6 2.2V20a1.5 1.5 0 0 1-1.5 1.5H8.9A1.5 1.5 0 0 1 7.4 20V9.6L10 7.4z" fill="#A8641E" stroke={EDGE} strokeWidth="1" />
      <rect x="8.6" y="12" width="6.8" height="5.4" rx="0.6" fill="#FBFAF7" />
      <path d="M9.8 14h4.4M9.8 15.6h3" stroke="#8C99A6" strokeWidth="0.8" strokeLinecap="round" />
    </>
  ),
  kit: (
    <>
      <rect x="3.5" y="11.5" width="17" height="9" rx="1.4" fill="#F7F5F0" stroke={EDGE} strokeWidth="1" />
      <rect x="5.2" y="10" width="13.6" height="3.2" rx="0.7" fill="#DCE3EA" stroke={EDGE} strokeWidth="0.8" />
      {[7, 9, 11, 13, 15, 17].map(x => (
        <circle key={x} cx={x} cy="11.6" r="0.65" fill="#5E6B7A" />
      ))}
      <path d="M3 9.6 17.8 4.4l1.2 2.1L4.2 11.5z" fill="#FBFAF7" stroke={EDGE} strokeWidth="1" strokeLinejoin="round" />
      <rect x="7" y="15" width="6" height="2.2" rx="0.5" fill="#4F9C80" />
    </>
  ),
  dishes: (
    <>
      <rect x="2.5" y="7.5" width="19" height="10" rx="2.4" fill="#DCE6EE" stroke={EDGE} strokeWidth="1" />
      {[6.6, 12, 17.4].map(x => (
        <g key={x}>
          <circle cx={x} cy="12.5" r="3.1" fill="#F7FAFC" stroke="#5E6B7A" strokeWidth="1" />
          <circle cx={x} cy="12.5" r="1.5" fill="#6FA3C4" />
        </g>
      ))}
    </>
  ),
  pump: (
    <>
      <rect x="3" y="9" width="18" height="11" rx="1.8" fill="#5E6B7A" stroke={EDGE} strokeWidth="1" />
      <path d="M5.6 13.2C5.6 6.4 12.4 6.4 12.4 13.2" fill="none" stroke="#E0BD7A" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="14.4" r="3.4" fill="#26303B" />
      <circle cx="9" cy="14.4" r="1.1" fill="#C9D3DE" />
      <rect x="14.2" y="11.6" width="4.8" height="2.8" rx="0.6" fill="#9FD4C4" />
      <circle cx="16.6" cy="17.2" r="1" fill="#C9D3DE" />
    </>
  ),
  rotor: (
    <>
      <path d="M3 12.5v3.6c0 3 4 5.2 9 5.2s9-2.2 9-5.2v-3.6" fill="#8C949D" stroke={EDGE} strokeWidth="1" />
      <ellipse cx="12" cy="12.5" rx="9" ry="5.2" fill="#B8BFC7" stroke={EDGE} strokeWidth="1" />
      {[
        [7, 11.2],
        [12, 9.4],
        [17, 11.2],
        [17, 13.8],
        [12, 15.6],
        [7, 13.8],
      ].map(([x, y]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="1.5" ry="0.95" fill="#4A535E" />
      ))}
      <ellipse cx="12" cy="12.5" rx="1.6" ry="1" fill="#E3E7EB" />
    </>
  ),
  espresso: (
    <>
      <rect x="5" y="3.5" width="14" height="16" rx="2" fill="#B9C0C7" stroke={EDGE} strokeWidth="1" />
      <rect x="5" y="3.5" width="14" height="4" rx="2" fill="#E3E7EB" stroke={EDGE} strokeWidth="1" />
      <rect x="8.6" y="9.6" width="6.8" height="2" rx="0.8" fill="#3A4451" />
      <rect x="10.2" y="14.2" width="3.6" height="3" rx="0.6" fill="#FBFAF7" />
      <rect x="4" y="19.2" width="16" height="2.2" rx="0.8" fill="#3A4451" />
    </>
  ),
  service: (
    <>
      <rect x="5" y="4" width="12.5" height="17" rx="1.4" fill="#F7F4EF" stroke={EDGE} strokeWidth="1" />
      <rect x="8.4" y="2.6" width="5.6" height="3" rx="0.8" fill="#5E6B7A" />
      <path d="M7.4 9h7.6M7.4 11.6h7.6M7.4 14.2h4" stroke="#8C99A6" strokeWidth="0.9" strokeLinecap="round" />
      <path d="m13.4 19.6 4.4-4.4m0 0a2.2 2.2 0 1 0 2.4-2.9l-1.2 1.2-1.1-.3-.3-1.1 1.2-1.2a2.2 2.2 0 0 0-2.9 2.4" fill="none" stroke="#2E5BA6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  food: (
    <>
      <path d="M2.8 13.2 7 8.6h14.2l-4.2 4.6z" fill="#D7B48A" stroke={EDGE} strokeWidth="1" strokeLinejoin="round" />
      <path d="M2.8 13.2h14.2v4.4H2.8z" fill="#B88A55" stroke={EDGE} strokeWidth="1" strokeLinejoin="round" />
      <path d="m17 13.2 4.2-4.6v4.4L17 17.6z" fill="#A47744" stroke={EDGE} strokeWidth="1" strokeLinejoin="round" />
      <ellipse cx="12" cy="10.9" rx="3" ry="1.2" fill="#9C2E2A" opacity="0.75" />
    </>
  ),
  chair: (
    <>
      <rect x="7" y="3" width="10" height="8.4" rx="2.6" fill="#5E6B7A" stroke={EDGE} strokeWidth="1" />
      <rect x="5.6" y="12" width="12.8" height="3" rx="1.4" fill="#4E5967" stroke={EDGE} strokeWidth="1" />
      <path d="M12 15v3.4M6.5 20.4 12 18.4l5.5 2" fill="none" stroke={EDGE} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6.4" cy="20.8" r="1.1" fill="#26303B" />
      <circle cx="17.6" cy="20.8" r="1.1" fill="#26303B" />
    </>
  ),
  carton: (
    <>
      <path d="M3.5 9 7.4 5.4h13.1L16.6 9z" fill="#D7B48A" stroke={EDGE} strokeWidth="1" strokeLinejoin="round" />
      <path d="M3.5 9h13.1v11H3.5z" fill="#C49A6C" stroke={EDGE} strokeWidth="1" strokeLinejoin="round" />
      <path d="M16.6 9l3.9-3.6v11L16.6 20z" fill="#A98157" stroke={EDGE} strokeWidth="1" strokeLinejoin="round" />
      <path d="M8.2 9V13M5.3 7.3l6.2-1.9" stroke="#EADBC0" strokeWidth="1.6" />
    </>
  ),
}

export function ItemIcon({ kind, size = 24 }: { kind: ItemKind; size?: number }) {
  return (
    <svg className="a-item-ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {ITEM[kind] ?? ITEM.carton}
    </svg>
  )
}

// ── Line glyphs ────────────────────────────────────────────────────────────

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
export const IconBack = (p: P) => (
  <S {...p}>
    <path d="M13 8H3.5M7 4.5 3.5 8 7 11.5" />
  </S>
)
export const IconChevron = (p: P) => (
  <S {...p}>
    <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
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
export const IconPlus = (p: P) => (
  <S {...p}>
    <path d="M8 3.5v9M3.5 8h9" strokeWidth="1.8" />
  </S>
)
export const IconScenes = (p: P) => (
  <S {...p}>
    <path d="M3 4.5h10M3 8h10M3 11.5h6" />
  </S>
)

/** Node glyphs for the sidebar's rows: an agent seat, the person who decides, a grant vessel, a lab member, an outside post. */
export function NodeGlyph({ kind, size = 20 }: { kind: 'agent' | 'person' | 'grant' | 'researcher' | 'source' | 'vendor'; size?: number }) {
  return (
    <svg className="a-node-ico" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      {kind === 'agent' && (
        <>
          <circle cx="10" cy="10" r="7" fill="currentColor" opacity="0.16" />
          <circle cx="10" cy="10" r="4.2" fill="currentColor" />
        </>
      )}
      {kind === 'person' && (
        <>
          <circle cx="10" cy="6.6" r="3" fill="currentColor" />
          <path d="M4.2 17c.6-3.6 3-5.4 5.8-5.4s5.2 1.8 5.8 5.4z" fill="currentColor" />
        </>
      )}
      {kind === 'researcher' && (
        <>
          <circle cx="10" cy="6.6" r="3" fill="currentColor" opacity="0.85" />
          <path d="M4.6 17.4c.4-3.8 2.6-5.8 5.4-5.8s5 2 5.4 5.8z" fill="currentColor" opacity="0.55" />
        </>
      )}
      {kind === 'grant' && (
        <>
          <path d="M5 4h10v10.5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M5.8 10h8.4v4.5a2.2 2.2 0 0 1-2.2 2.2H8a2.2 2.2 0 0 1-2.2-2.2z" fill="currentColor" />
        </>
      )}
      {(kind === 'source' || kind === 'vendor') && (
        <>
          <rect x="8.2" y="5" width="3.6" height="11" rx="1.2" fill="currentColor" opacity="0.7" />
          <circle cx="10" cy="4.6" r="2.4" fill="currentColor" />
        </>
      )}
    </svg>
  )
}

/** The mark: the round table, with the shared record at its centre. */
export const Mark = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <rect x="9.2" y="8.6" width="5.6" height="6.8" rx="1.4" fill="currentColor" />
    <circle cx="12" cy="2.9" r="1.9" fill="currentColor" />
    <circle cx="4.1" cy="16.6" r="1.9" fill="currentColor" />
    <circle cx="19.9" cy="16.6" r="1.9" fill="currentColor" />
  </svg>
)
