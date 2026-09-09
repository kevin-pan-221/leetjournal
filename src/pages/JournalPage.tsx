import { useMemo, useState } from 'react'
import { ChevronRight, ExternalLink, RefreshCw, Search, X } from 'lucide-react'
import type { FinishAttemptInput, JournalEntry, Problem } from '../domain'
import { ReflectionDialog } from '../components/ReflectionDialog'
import { Chip, EmptyState, PageHeader } from '../components/ui'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { formatEntryDate } from '../utils/dates'

type JournalFilter = 'All' | 'Solved' | 'Reviews' | 'Struggled'
const FILTERS: JournalFilter[] = ['All', 'Solved', 'Reviews', 'Struggled']

interface JournalPageProps {
  entries: JournalEntry[]
  onStart: (problem: Problem) => void
  onEdit: (input: FinishAttemptInput) => Promise<void>
}

function matchesFilter(entry: JournalEntry, filter: JournalFilter) {
  if (filter === 'All') return true
  if (filter === 'Reviews') return entry.isReview
  if (filter === 'Solved') return entry.outcome === 'Solved' || entry.outcome === 'Easy'
  return entry.outcome === filter
}

function JournalEntryCard({ entry, onOpen }: { entry: JournalEntry; onOpen: () => void }) {
  const completed = new Date(entry.completedAt)
  return (
    <button
      type="button"
      className="card journal-entry"
      onClick={onOpen}
      aria-label={`Open journal entry for ${entry.problem.title}`}
    >
      <div className="date-block">
        <small>{completed.toLocaleString('en', { month: 'short' }).toUpperCase()}</small>
        <strong>{completed.getDate()}</strong>
      </div>
      <div className="entry-main">
        <div>
          <h3>{entry.problem.title}</h3>
          <Chip tone={entry.problem.difficulty.toLowerCase()}>{entry.problem.difficulty}</Chip>
          <Chip>{entry.problem.category}</Chip>
          {entry.isReview && <Chip>Review</Chip>}
        </div>
        <p>{entry.notes || 'No takeaway recorded.'}</p>
        <small>
          {entry.outcome} · {Math.max(1, Math.round(entry.durationSeconds / 60))} min · Confidence{' '}
          {entry.confidence}/5
        </small>
      </div>
      <ChevronRight />
    </button>
  )
}

function JournalDetail({
  entry,
  onClose,
  onPractice,
  onEdit,
}: {
  entry: JournalEntry
  onClose: () => void
  onPractice: () => void
  onEdit: () => void
}) {
  useEscapeKey(true, onClose)

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="journal-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-detail-title"
      >
        <button className="modal-close" onClick={onClose} aria-label="Close journal entry">
          <X />
        </button>
        <span className="eyebrow">
          {entry.isReview ? 'Review reflection' : 'Focus reflection'} ·{' '}
          {formatEntryDate(entry.completedAt)}
        </span>
        <h2 id="journal-detail-title">{entry.problem.title}</h2>
        <div className="journal-detail-chips">
          <Chip tone={entry.problem.difficulty.toLowerCase()}>{entry.problem.difficulty}</Chip>
          <Chip>{entry.problem.category}</Chip>
        </div>
        <div className="journal-detail-stats">
          <span><small>Outcome</small><b>{entry.outcome}</b></span>
          <span><small>Confidence</small><b>{entry.confidence}/5</b></span>
          <span><small>Focused</small><b>{Math.max(1, Math.round(entry.durationSeconds / 60))} min</b></span>
        </div>
        <div className="journal-detail-copy">
          <h3>Takeaway</h3>
          <p>{entry.notes || 'No takeaway was recorded for this session.'}</p>
        </div>
        <div className="journal-detail-copy">
          <h3>What tripped me up</h3>
          {entry.mistakes.length ? (
            <div className="journal-mistakes">
              {entry.mistakes.map((mistake) => <span key={mistake}>{mistake}</span>)}
            </div>
          ) : <p>Nothing was tagged.</p>}
        </div>
        <div className="journal-detail-actions">
          <button className="outline" onClick={onEdit}>Edit reflection</button>
          <a className="outline" href={entry.problem.leetcodeUrl} target="_blank" rel="noreferrer">
            Open on LeetCode <ExternalLink size={14} />
          </a>
          <button className="primary" onClick={onPractice}>
            <RefreshCw size={15} /> Practice again
          </button>
        </div>
      </section>
    </div>
  )
}

export function JournalPage({ entries, onStart, onEdit }: JournalPageProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<JournalFilter>('All')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const selected = entries.find((entry) => entry.id === selectedId)
  const normalizedQuery = query.trim().toLowerCase()
  const visible = useMemo(
    () => entries.filter((entry) =>
      matchesFilter(entry, filter)
      && entry.problem.title.toLowerCase().includes(normalizedQuery)),
    [entries, filter, normalizedQuery],
  )

  return (
    <div className="page">
      <PageHeader title="Journal" subtitle="Your journey, one problem at a time." />
      <div className="toolbar">
        <div>
          {FILTERS.map((value) => (
            <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>
              {value}
            </button>
          ))}
        </div>
        <label>
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search problems…" />
        </label>
      </div>
      <div className="journal-list">
        {visible.length ? visible.map((entry) => (
          <JournalEntryCard key={entry.id} entry={entry} onOpen={() => setSelectedId(entry.id)} />
        )) : (
          <EmptyState
            title="No matching entries"
            text={entries.length
              ? 'Try another filter or search.'
              : 'Complete a focus session and your reflection will appear here.'}
          />
        )}
      </div>
      {selected && editing && <ReflectionDialog
        key={selected.id}
        problemTitle={selected.problem.title}
        initialNotes={selected.notes}
        initialValues={selected}
        onCancel={() => setEditing(false)}
        onSave={async (input) => {
          await onEdit({ attemptId: selected.id, ...input })
          setEditing(false)
        }}
      />}
      {selected && !editing && (
        <JournalDetail
          entry={selected}
          onClose={() => setSelectedId(null)}
          onEdit={() => setEditing(true)}
          onPractice={() => {
            const problem = selected.problem
            setSelectedId(null)
            onStart(problem)
          }}
        />
      )}
    </div>
  )
}
