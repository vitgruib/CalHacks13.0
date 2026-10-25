// The GrantGuard name in both portal headers (T90): a real link to the landing.
// A plain click stays in this tab's app (onHome pushes the URL, so the local
// demo data survives); a modified click opens the landing in a new tab.
import type { MouseEvent } from 'react'
import './BrandLink.css'

export default function BrandLink({ className = '', onHome }: { className?: string; onHome: () => void }) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onHome()
  }
  return (
    <a href={import.meta.env.BASE_URL} className={`brand-link ${className}`.trim()} aria-label="GrantGuard, back to the start page" onClick={click}>
      GrantGuard
    </a>
  )
}
