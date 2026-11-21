import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { errorMessage } from '../utils/errors'
import type {
  AppSettings,
  Dashboard,
  FocusContext,
  JournalEntry,
  ProblemBook,
} from '../domain'
import type { StudyState } from '../study/types'

export function useAppData() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [study, setStudy] = useState<StudyState | null>(null)
  const [focus, setFocus] = useState<FocusContext | null>(null)
  const [reviewFocus, setReviewFocus] = useState<FocusContext | null>(null)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [books, setBooks] = useState<ProblemBook[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current
    if (!api.isTauri()) {
      setError('LeetJournal must run through its native desktop application.')
      setLoading(false)
      return
    }

    try {
      const [nextDashboard, nextStudy, nextFocus, nextEntries, nextSettings, nextBooks, nextReviewFocus] =
        await Promise.all([
          api.dashboard(),
          api.study(),
          api.focusContext(),
          api.journal(),
          api.settings(),
          api.library(),
          api.focusContext(true),
        ])
      if (currentRequest !== requestId.current) return
      setDashboard(nextDashboard)
      setStudy(nextStudy)
      setFocus(nextFocus)
      setReviewFocus(nextReviewFocus)
      setEntries(nextEntries)
      setSettings(nextSettings)
      setBooks(nextBooks)
      setError('')
      return nextStudy
    } catch (loadError) {
      if (currentRequest !== requestId.current) return
      setError(errorMessage(loadError))
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return {
    dashboard,
    study,
    focus,
    reviewFocus,
    setReviewFocus,
    entries,
    books,
    settings,
    loading,
    error,
    reload,
    setFocus,
    setStudy,
    setSettings,
    setEntries,
  }
}
