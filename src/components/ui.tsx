import type { ReactNode } from 'react'
import { Sprout } from 'lucide-react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>
}

export function Chip({ children, tone = 'green' }: { children: ReactNode; tone?: string }) {
  return <span className={`chip ${tone}`}>{children}</span>
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="header-plant" aria-hidden="true">🪴</div>
    </header>
  )
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <Card className="empty-inline">
      <Sprout />
      <h2>{title}</h2>
      <p>{text}</p>
    </Card>
  )
}
