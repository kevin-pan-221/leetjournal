import {
  BookOpen,
  CalendarDays,
  Clock3,
  Home,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sprout,
} from 'lucide-react'
import type { Page } from '../app/page'

const navigation = [
  ['today', Home, 'Today'],
  ['focus', Clock3, 'Focus'],
  ['problems', ListChecks, 'Library'],
  ['journal', BookOpen, 'Journal'],
  ['reviews', CalendarDays, 'Reviews'],
  ['garden', Sprout, 'Garden'],
  ['settings', Settings, 'Settings'],
] as const

interface SidebarProps {
  page: Page
  name: string
  collapsed: boolean
  hidden: boolean
  onNavigate: (page: Page) => void
  onToggle: () => void
}

export function Sidebar({ page, name, collapsed, hidden, onNavigate, onToggle }: SidebarProps) {
  return (
    <aside className="sidebar" aria-hidden={hidden} inert={hidden}>
      <div className="logo">
        <span>LeetJournal</span>
        <button
          className="sidebar-toggle"
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <nav>
        {navigation.map(([id, Icon, label]) => (
          <button
            key={id}
            className={page === id ? 'active' : ''}
            onClick={() => onNavigate(id)}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="profile">
        <span className="avatar">🌱</span>
        <div><strong>{name}</strong><small>Keep growing</small></div>
      </div>
    </aside>
  )
}
