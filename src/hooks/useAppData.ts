import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
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
      const [nextDashboard, nextGarden, nextFocus, nextEntries, nextReviews, nextSettings, nextBooks] =
        await Promise.all([
          api.dashboard(),
          api.garden(),
          api.focusContext(),
          api.journal(),
          api.reviews(),
          api.settings(),
          api.library(),
        ])
      if (currentRequest !== requestId.current) return
      setDashboard(nextDashboard)
      setGarden(nextGarden)
      setFocus(nextFocus)
      setEntries(nextEntries)
      setReviews(nextReviews)
      setSettings(nextSettings)
      setBooks(nextBooks)
      setError('')
    } catch (loadError) {
      if (currentRequest !== requestId.current) return
      setError(String(loadError))
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
