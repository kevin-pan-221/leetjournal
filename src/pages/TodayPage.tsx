import { useEffect, useState } from 'react'
import { ChevronRight, Flame, Play } from 'lucide-react'
import type { AppSettings, Dashboard, FocusContext, Problem } from '../domain'
import { Plant } from '../components/Plant'
import { Card, Chip } from '../components/ui'

interface TodayPageProps {
  data: Dashboard
  settings: AppSettings
  active: FocusContext | null
  onStart: (problem: Problem, isReview: boolean) => void
  onResume: () => void
  onReviews: () => void
}

const planKey = (kind: string, problemId: string) => `${kind}:${problemId}`

export function TodayPage({ data, settings, active, onStart, onResume, onReviews }: TodayPageProps) {
  const { plan } = data
  const main = plan.items.find((item) => item.kind === 'Main problem') ?? plan.items[0]
  const [selectedKey, setSelectedKey] = useState(main ? planKey(main.kind, main.problem.id) : '')
  const selected = plan.items.find((item) => planKey(item.kind, item.problem.id) === selectedKey) ?? main
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const progress = (plan.xp - data.levelFloorXp) / Math.max(1, data.nextLevelXp - data.levelFloorXp) * 100

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
          <div className="card-title"><h3>Today’s Plan</h3><small>Select a problem</small></div>
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
                  onDoubleClick={() => onStart(item.problem, item.kind === 'Review')}
                  key={itemKey}
                >
                  <span className="dot" />
                  <div>
                    <small>{item.kind}</small>
                    <strong>{item.problem.title}</strong>
                    <p>{item.problem.category} · ~ {item.estimatedMinutes} min</p>
                  </div>
                  <Chip tone={item.problem.difficulty.toLowerCase()}>{item.problem.difficulty}</Chip>
                  {index < plan.items.length - 1 && <span className="line" />}
                </button>
              )
            })}
          </div>
        </Card>
        <Card className="garden">
          <div>
            <h3>Your Garden</h3>
            <p>Level {data.levelNumber} · {plan.level}</p>
            <div className="xp"><span style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} /></div>
            <small>{plan.xp} / {data.nextLevelXp} XP</small>
            <em>{data.practicedCount} of {data.problemCount} curriculum problems practiced</em>
          </div>
          <Plant large animate={settings.plantAnimations} />
        </Card>
        <Card className="review-card">
          <div className="card-title"><h3>Review Due ({plan.reviewsDue})</h3><button onClick={onReviews}>See all</button></div>
          {data.dueReviews.length ? data.dueReviews.map((review) => (
            <div className="mini-problem" key={review.problem.id}>
              <span>{review.problem.title}</span>
              <Chip tone={review.problem.difficulty.toLowerCase()}>{review.problem.difficulty}</Chip>
            </div>
          )) : <p className="muted-copy">Nothing due today. Your next reviews will appear here.</p>}
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
              onClick={() => selected && onStart(selected.problem, selected.kind === 'Review')}
            >
              <Play size={18} fill="currentColor" /> Start focus session
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
