import { useEffect, useState } from 'react'
import { ChevronRight, Flame, Play, Sparkles } from 'lucide-react'
import type { AppSettings, Dashboard, FocusContext, Problem } from '../domain'
import type { StudyState } from '../study/types'
import { api } from '../api'
import { Card, Chip } from '../components/ui'

interface TodayPageProps {
  data: Dashboard
  settings: AppSettings
  study: StudyState
  onStudy: () => void
  active: FocusContext | null
  onStart: (problem: Problem) => void
  onResume: () => void
}

const planKey = (kind: string, problemId: string) => `${kind}:${problemId}`

export function TodayPage({ data, settings, study, active, onStart, onResume, onStudy }: TodayPageProps) {
  const { plan } = data
  const main = plan.items.find((item) => item.kind === 'Main problem') ?? plan.items[0]
  const [selectedKey, setSelectedKey] = useState(main ? planKey(main.kind, main.problem.id) : '')
  const selected = plan.items.find((item) => planKey(item.kind, item.problem.id) === selectedKey) ?? main
  const [acceptedIds, setAcceptedIds] = useState<string[]>([])
  useEffect(() => { let alive = true; void api.offlineAccepted().then(ids => { if (alive) setAcceptedIds(ids) }).catch(() => {}); return () => { alive = false } }, [])
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    if (selectedKey && !plan.items.some((item) => planKey(item.kind, item.problem.id) === selectedKey)) {
      setSelectedKey(main ? planKey(main.kind, main.problem.id) : '')
    }
  }, [plan.items, selectedKey, main?.kind, main?.problem.id])

  return (
    <div className="page">
      <header className="greeting">
        <div>
          <h1>{greeting}, {settings.displayName} <span>{hour < 18 ? '☀' : '☾'}</span></h1>
          <p>Let’s make today a focused step forward.</p>
        </div>
        <Card className="streak-card">
          <Flame />
          <div><b>{plan.streak}</b><small>day streak</small></div>
          <div className="week">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
              <span key={index}><small>{day}</small><i className={data.week[index] ? 'done' : ''} /></span>
            ))}
          </div>
        </Card>
      </header>
      <div className="today-grid">
        <Card className="plan-card">
          <div className="card-title"><h3>Today’s Plan</h3>{plan.items.length > 0 && <small>Select a problem</small>}</div>
          {!plan.items.length && <p className="muted-copy">You’ve solved your curriculum. Explore another book in Library, or revisit a problem whenever you want.</p>}
          <div className="timeline">
            {plan.items.map((item, index) => {
              const itemKey = planKey(item.kind, item.problem.id)
              const isSelected = selectedKey === itemKey
              return (
                <button
                  type="button"
                  className={`plan-row ${isSelected ? 'selected' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedKey(itemKey)}
                  onDoubleClick={() => onStart(item.problem)}
                  key={itemKey}
                >
                  <span className="dot" />
                  <div>
                    <small>{item.kind}</small>
                    <strong>{item.problem.title}</strong>
                    <p>{item.problem.category} · ~ {item.estimatedMinutes} min{acceptedIds.includes(item.problem.id) && <em className="offline-accepted" title="Accepted by the offline judge"> · ✓ Accepted offline</em>}</p>
                  </div>
                  <Chip tone={item.problem.difficulty.toLowerCase()}>{item.problem.difficulty}</Chip>
                  {index < plan.items.length - 1 && <span className="line" />}
                </button>
              )
            })}
          </div>
        </Card>
        <Card className="study-today-card">
          <div>
            <h3>Your Study</h3>
            <p>Level {study.level} · {study.crystals} lapis</p>
            <p>{study.shelves} bookshelves · {study.items.length} equipment pieces</p>
            <button onClick={onStudy}>Visit your study →</button>
          </div>
          <Sparkles size={48} strokeWidth={1} />
        </Card>
        <div className={`start-row ${active ? 'active-session' : ''}`}>
          {active ? (
            <button className="primary" onClick={onResume}>
              <Play className="start-play" size={18} fill="currentColor" />
              <span>
                <b>{active.attempt.pausedAt ? 'Resume focus session' : 'Return to focus session'}</b>
                <small>{active.attempt.problem.title}</small>
              </span>
              <ChevronRight className="start-arrow" size={18} />
            </button>
          ) : (
            <button
              className="primary"
              disabled={!selected}
              onClick={() => selected && onStart(selected.problem)}
            >
              <Play size={18} fill="currentColor" /> Start focus session
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
