// Small shared pieces for every window. Add here only what two or more windows use.
import type { ReactNode } from 'react'
import type { Grant, GrantStatus } from './data/types'

export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <header><h2>{title}</h2>{aside}</header>
      {children}
    </section>
  )
}

export type Tone = 'good' | 'bad' | 'warn' | 'neutral'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

const statusLabels: Record<GrantStatus, string> = { active: 'Active', canceled: 'Canceled', restored_by_court: 'Restored by court', ended: 'Ended' }
const statusTones: Record<GrantStatus, Tone> = { active: 'good', canceled: 'bad', restored_by_court: 'warn', ended: 'neutral' }

/** A grant's status for display: once money arrives after a court order, it is active again. */
export function grantStatus(g: Pick<Grant, 'status' | 'frozen'>): { label: string; tone: Tone } {
  if (g.status === 'restored_by_court' && !g.frozen) return { label: 'Active (Restored by court)', tone: 'good' }
  return { label: statusLabels[g.status], tone: statusTones[g.status] }
}
