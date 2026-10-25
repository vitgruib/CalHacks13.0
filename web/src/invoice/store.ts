// Invoice submissions saved in this browser (localStorage), so a researcher's
// submission appears in the grant office portal of the same browser and every
// decision stays in its audit trail. Not shared between computers: that needs
// a table in the database module (Track A).
import { useSyncExternalStore } from 'react'
import type { AuditEntry, Status, Submission } from './model'

const KEY = 'invoice.submissions'
const listeners = new Set<() => void>()
let cache: Submission[] | null = null

function read(): Submission[] {
  if (cache) return cache
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Submission[] } catch { cache = [] }
  return cache
}
function write(next: Submission[]) {
  cache = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* kept in memory for this tab only */ }
  listeners.forEach(l => l())
}
addEventListener('storage', e => { if (e.key === KEY) { cache = null; listeners.forEach(l => l()) } })
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export const useSubmissions = () => useSyncExternalStore(subscribe, read)
export const newSubmissionId = () => `sub-${Date.now().toString(36)}`

export function saveSubmission(s: Submission) {
  const all = read()
  write(all.some(x => x.id === s.id) ? all.map(x => (x.id === s.id ? s : x)) : [s, ...all])
}

/** Add an audit entry and optionally move the status. */
export function record(id: string, entry: AuditEntry, status?: Status) {
  write(read().map(s => (s.id === id ? { ...s, status: status ?? s.status, audit: [...s.audit, entry] } : s)))
}
export const clearSubmissions = () => write([])
