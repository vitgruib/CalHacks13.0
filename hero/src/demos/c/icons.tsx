// Drawn glyphs. The four answer glyphs echo the trail forms in the scene:
// a straight lit line (bought), a dashed detour (rerouted or sent back),
// falling hops (blocked), a hanging lantern (held).

import type { ReactNode } from 'react'

const PATHS: Record<string, ReactNode> = {
  accept: (
    <>
      <path d="M2 13 C6 13 8 4 13 4" />
      <circle cx="13" cy="4" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  refine: (
    <>
      <path d="M2 13 C1 7 9 10 8 4 L13.5 4" strokeDasharray="2.2 1.8" />
      <path d="M11.5 2 L13.8 4 L11.5 6" />
    </>
  ),
  reject: <path d="M1 5 Q3 1 5 8 Q7 4.5 9 11 Q10.5 8.5 12 13 L15 13" />,
  hold: (
    <>
      <path d="M8 1.5 V4" />
      <rect x="5" y="4" width="6" height="8" rx="1.5" />
      <path d="M6.5 14.5 H9.5" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  pass: <path d="M3 8.5 L6.5 12 L13 4.5" />,
  fail: <path d="M4 4 L12 12 M12 4 L4 12" />,
  idle: <circle cx="8" cy="8" r="2.2" />,
  play: <path d="M5 3 L13 8 L5 13 Z" fill="currentColor" />,
  pause: <path d="M5 3 V13 M11 3 V13" strokeWidth="2.4" />,
  replay: (
    <>
      <path d="M3.5 8 A4.5 4.5 0 1 0 5 4.6" />
      <path d="M2.6 2.4 L5 4.6 L2.4 6.4" />
    </>
  ),
  close: <path d="M4 4 L12 12 M12 4 L4 12" />,
  send: <path d="M2 8 L13 8 M9 4 L13 8 L9 12" />,
  out: <path d="M6 3 H13 V10 M13 3 L4 12" />,
  back: <path d="M10 3 L5 8 L10 13" />,
  house: <path d="M2.5 13.5 V7 L8 2.5 L13.5 7 V13.5 Z M6.5 13.5 V9.5 H9.5 V13.5" />,
  observatory: (
    <>
      <path d="M3 13.5 V9 H13 V13.5 Z" />
      <path d="M3.5 9 A4.5 4.5 0 0 1 12.5 9" />
      <path d="M8 4.5 V7" />
    </>
  ),
  lodge: (
    <>
      <path d="M1.5 13.5 L8 2.5 L14.5 13.5 Z" />
      <path d="M6 13.5 L8 10 L10 13.5" />
    </>
  ),
  mesa: (
    <>
      <ellipse cx="8" cy="9" rx="6.5" ry="4.5" />
      <ellipse cx="8" cy="8.6" rx="4.2" ry="2.8" />
      <ellipse cx="8" cy="8.3" rx="1.8" ry="1.2" />
    </>
  ),
  station: (
    <>
      <path d="M8 2 V14 M5 14 H11" />
      <path d="M5 4.5 A4 4 0 0 1 11 4.5" />
    </>
  ),
  depot: (
    <>
      <path d="M1.5 13.5 V6.5 L8 3 L14.5 6.5 V13.5 Z" />
      <path d="M5 13.5 V9 H11 V13.5" />
    </>
  ),
  ledger: <path d="M3 3.5 H13 M3 8 H13 M3 12.5 H9" />,
}

export function Glyph({ name, size = 16, label }: { name: string; size?: number; label?: string }) {
  return (
    <svg
      className={`c-glyph c-glyph--${name}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name] ?? PATHS.idle}
    </svg>
  )
}
