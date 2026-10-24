// The Design menu: switches between the looks in designs.css by setting
// <html data-design>. Remembered per browser; `?design=<id>` picks one from a link.
import { useEffect, useState } from 'react'
import './designs.css'

export const designs = [
  { id: 'original', label: 'Original' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'form', label: 'Federal form' },
  { id: 'paper', label: 'Newspaper' },
  { id: 'terminal', label: 'Terminal' },
] as const
type DesignId = (typeof designs)[number]['id']

const KEY = 'grantguard.design'
const known = (v: string | null): v is DesignId => designs.some(d => d.id === v)
const initial = (): DesignId => {
  const fromUrl = new URLSearchParams(location.search).get('design')
  if (known(fromUrl)) return fromUrl
  try { const saved = localStorage.getItem(KEY); if (known(saved)) return saved } catch { /* no storage */ }
  return 'original'
}

export default function DesignPicker() {
  const [design, setDesign] = useState(initial)
  useEffect(() => {
    if (design === 'original') delete document.documentElement.dataset.design
    else document.documentElement.dataset.design = design
    try { localStorage.setItem(KEY, design) } catch { /* the choice just won't survive a reload */ }
  }, [design])
  return (
    <label className="design-pick">
      Design
      <select value={design} onChange={e => setDesign(e.target.value as DesignId)}>
        {designs.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
      </select>
    </label>
  )
}
