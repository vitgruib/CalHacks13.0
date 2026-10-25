// Picks the store's backend (T17). VITE_BACKEND=local uses the in-memory
// seed; anything else (default) connects to SpacetimeDB and falls back to the
// local seed, with a visible "offline demo data" badge, if that fails.
import { useState, type ReactNode } from 'react'
import { LiveStoreProvider, STDB_DB, type LiveInfo } from './live'
import { LocalStoreProvider } from './store'
import './backend.css'

const wantLocal = import.meta.env.VITE_BACKEND === 'local'

export function StoreProvider({ children }: { children: ReactNode }) {
  const [offline, setOffline] = useState<string | null>(wantLocal ? 'VITE_BACKEND=local' : null)
  if (offline !== null) {
    return (
      <LocalStoreProvider>
        {children}
        <div className="backend-status" role="status">
          <span className="badge warn" title={offline}>Offline demo data</span>
          <span className="backend-detail">
            {wantLocal ? 'Local mode: changes stay in this tab.' : `Server unreachable: ${offline}. Changes stay in this tab and other browsers won't see them.`}
            {!wantLocal && <> <button type="button" onClick={() => setOffline(null)}>Reconnect</button></>}
          </span>
        </div>
      </LocalStoreProvider>
    )
  }
  return <LiveStoreProvider onFail={setOffline} renderStatus={info => <LiveStatus info={info} />}>{children}</LiveStoreProvider>
}

function LiveStatus({ info }: { info: LiveInfo }) {
  return (
    <div className="backend-status" role="status">
      {info.notices.map(n => (
        <div key={n.id} className="backend-notice" role="alert">
          <span>{n.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => info.dismiss(n.id)}>×</button>
        </div>
      ))}
      <div className="backend-row">
        {info.status === 'live'
          ? <span className="badge good">Live · {STDB_DB}</span>
          : <span className="badge bad">Disconnected: reload to reconnect</span>}
      </div>
    </div>
  )
}
