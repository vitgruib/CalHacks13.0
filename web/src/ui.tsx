// Small shared pieces for every window. Add here only what two or more windows use.
import type { ReactNode } from 'react'

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
