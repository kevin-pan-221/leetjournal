import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { errorMessage } from '../utils/errors'
import type {
  AppSettings,
  Dashboard,
  FocusContext,
  GardenState,
  JournalEntry,
  ProblemBook,
  Review,
} from '../domain'

export function useAppData() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [garden, setGarden] = useState<GardenState | null>(null)
  const [focus, setFocus] = useState<FocusContext | null>(null)
  const [reviewFocus, setReviewFocus] = useState<FocusContext | null>(null)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
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
      const [nextDashboard, nextGarden, nextFocus, nextEntries, nextReviews, nextSettings, nextBooks, nextReviewFocus] =
        await Promise.all([
          api.dashboard(),
          api.garden(),
          api.focusContext(),
          api.journal(),
          api.reviews(),
          api.settings(),
          api.library(),
          api.focusContext(true),
        ])
      if (currentRequest !== requestId.current) return
      setDashboard(nextDashboard)
      setGarden(nextGarden)
      setFocus(nextFocus)
      setReviewFocus(nextReviewFocus)
      setEntries(nextEntries)
      setReviews(nextReviews)
      setSettings(nextSettings)
      setBooks(nextBooks)
      setError('')
      return nextGarden
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
    garden,
    focus,
    reviewFocus,
    setReviewFocus,
    entries,
    reviews,
    books,
    settings,
    loading,
    error,
    reload,
    setFocus,
    setGarden,
    setSettings,
    setEntries,
  }
}
