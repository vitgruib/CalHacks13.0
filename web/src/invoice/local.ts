// Offline demo data only: invoice submissions saved in this browser
// (localStorage), so the researcher's and grant office's portals of the same
// browser share them. Live, they're the module's invoiceSubmission table (T112).
import { useSyncExternalStore } from 'react'
import type { Submission } from './model'

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

export const useLocalSubmissions = () => useSyncExternalStore(subscribe, read)

export function saveLocalSubmission(s: Submission) {
  const all = read()
  write(all.some(x => x.id === s.id) ? all.map(x => (x.id === s.id ? s : x)) : [s, ...all])
}
export const clearLocalSubmissions = () => write([])
