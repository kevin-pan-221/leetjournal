import { useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { LoaderCircle } from 'lucide-react'
import { api } from './api'
import type { FinishAttemptInput, Problem } from './domain'
import type { Page } from './app/page'
import { GardenFocus, GardenPage, gardenStageName } from './Garden'
import { closeLeetCodeWorkspace, LeetCodeWorkspace } from './LeetCodeWorkspace'
import { ConfirmLeave } from './components/ConfirmLeave'
import { ReflectionDialog } from './components/ReflectionDialog'
import { Sidebar } from './components/Sidebar'
import { useAppData } from './hooks/useAppData'
import { FocusPage } from './pages/FocusPage'
import { JournalPage } from './pages/JournalPage'
import { LibraryPage } from './pages/LibraryPage'
import { ReviewsPage } from './pages/ReviewsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TodayPage } from './pages/TodayPage'

export default function App() {
  const { dashboard, garden, focus, entries, reviews, books, settings, loading, error,
    reload, setFocus, setGarden, setSettings } = useAppData()
  const [page, setPage] = useState<Page>('today')
  const [logging, setLogging] = useState(false)
  const [reflectionNotes, setReflectionNotes] = useState('')
  const [toast, setToast] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [focusReturn, setFocusReturn] = useState<Page>('today')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('leetjournal.sidebar.collapsed') === 'true',
  )

  useEffect(() => {
    const enabled = Boolean(focus && ['focus', 'garden-focus'].includes(page) && !logging)
    api.setFocusShortcutEnabled(enabled).catch(() => {})
  }, [focus, page, logging])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    listen('focus-escape', () => {
      if (logging || !focus || !['focus', 'garden-focus'].includes(page)) return
      setConfirmLeave((open) => !open)
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [focus, page, logging])

  const reportActionError = (actionError: unknown) =>
    setToast(String(actionError).replace(/^Error:\s*/, ''))

  const pause = async () => {
    if (!focus) return
    try {
      await api.pause(focus.attempt.id)
      setFocus(await api.focusContext())
    } catch (actionError) { reportActionError(actionError) }
  }

  const pauseAndExit = async () => {
    if (!focus) return
    try {
      await api.pauseOnly(focus.attempt.id)
      setFocus(await api.focusContext())
      setConfirmLeave(false)
      setPage(focusReturn)
    } catch (actionError) { reportActionError(actionError) }
  }

  const endSession = async () => {
    if (!focus) return
    try {
      await api.abandon(focus.attempt.id)
      await closeLeetCodeWorkspace()
      setConfirmLeave(false)
      setFocus(null)
      setToast('Session ended')
      await reload()
      setPage(focusReturn)
    } catch (actionError) { reportActionError(actionError) }
  }

  const start = async (problem: Problem, isReview = false, fromGarden = false) => {
    const returnPage: Page = fromGarden ? 'garden'
      : page === 'reviews' ? 'reviews'
        : page === 'problems' ? 'problems'
          : page === 'journal' ? 'journal' : 'today'
    setFocusReturn(returnPage)
    try {
      const active = focus ?? await api.focusContext()
      if (active) {
        setFocus(active)
        if (active.attempt.problem.id !== problem.id) {
          setToast(`${active.attempt.problem.title} is still active · resume or end it before starting another problem`)
        }
        setPage(fromGarden ? 'garden-focus' : 'focus')
        return
      }
      await api.start(problem.id, isReview)
      setFocus(await api.focusContext())
      setPage(fromGarden ? 'garden-focus' : 'focus')
    } catch (actionError) { reportActionError(actionError) }
  }

  const beginReflection = async (notes?: string) => {
    if (!focus) return
    if (notes !== undefined) {
      setReflectionNotes(notes)
      setLogging(true)
      return
    }
    try {
      const current = await api.focusContext()
      if (!current) return
      setFocus(current)
      setReflectionNotes(current.attempt.notes)
      setLogging(true)
    } catch (actionError) { reportActionError(actionError) }
  }

  const finish = async (input: Omit<FinishAttemptInput, 'attemptId'>) => {
    if (!focus) return
    try {
      const previousStage = garden?.currentStage
      await api.finish({ attemptId: focus.attempt.id, ...input })
      await closeLeetCodeWorkspace()
      const nextGarden = await api.garden()
      setGarden(nextGarden)
      setLogging(false)
      setReflectionNotes('')
      await reload()
      if (previousStage && previousStage !== nextGarden.currentStage) {
        setPage('garden')
        setToast(`The ${gardenStageName(previousStage)} has grown into a ${gardenStageName(nextGarden.currentStage)}.`)
      } else {
        setPage('journal')
        setToast('Journal entry saved · the garden feels a little livelier')
      }
    } catch (actionError) {
      reportActionError(actionError)
      throw actionError
    }
  }

  const content = useMemo(() => {
    if (loading) return <div className="loading"><LoaderCircle /><p>Opening your journal…</p></div>
    if (error || !dashboard || !garden || !settings) {
      return <div className="error-state"><h2>LeetJournal couldn’t open</h2><p>{error}</p><button className="primary" onClick={reload}>Try again</button></div>
    }
    if (page === 'today') return <TodayPage data={dashboard} settings={settings} active={focus} onStart={(problem, isReview) => start(problem, isReview)} onResume={() => { setFocusReturn('today'); setPage('focus') }} onReviews={() => setPage('reviews')} />
    if (page === 'garden') return <GardenPage state={garden} active={focus} animate={settings.plantAnimations} onStart={(problem) => start(problem, false, true)} onReturn={() => setPage('garden-focus')} onReviews={() => setPage('reviews')} />
    if (page === 'garden-focus') return <GardenFocus context={focus} garden={garden} animate={settings.plantAnimations} onPause={pause} onWorkspace={() => setPage('focus')} onFinish={() => void beginReflection()} />
    if (page === 'focus') return <FocusPage context={focus} settings={settings} obscured={logging || confirmLeave} onPause={pause} onFinish={(notes) => void beginReflection(notes)} onBack={() => setPage('today')} />
    if (page === 'problems') return <LibraryPage books={books} entries={entries} onStart={(problem) => start(problem)} onReload={reload} onSetToday={async (kind, problem) => { await api.setTodayItem(kind, problem.id); await reload(); setToast(`${problem.title} set as today’s ${kind.toLowerCase()}`) }} />
    if (page === 'journal') return <JournalPage entries={entries} onStart={(problem) => start(problem)} />
    if (page === 'reviews') return <ReviewsPage reviews={reviews} onStart={(problem) => start(problem, true)} />
    return <SettingsPage settings={settings} onSave={async (nextSettings) => { setSettings(await api.saveSettings(nextSettings)); await reload(); setToast('Settings saved') }} />
  }, [page, dashboard, garden, focus, entries, reviews, books, settings, loading, error, logging, confirmLeave])

  const toggleSidebar = () => setSidebarCollapsed((current) => {
    const next = !current
    localStorage.setItem('leetjournal.sidebar.collapsed', String(next))
    return next
  })
  const focusMode = page === 'focus' || page === 'garden-focus'

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${focusMode ? 'focus-mode' : ''} ${page === 'garden' ? 'garden-shell' : ''} theme-${settings?.theme ?? 'warm-garden'}`}>
      <Sidebar page={page} name={settings?.displayName ?? 'Coder'} onNavigate={setPage} collapsed={sidebarCollapsed} onToggle={toggleSidebar} hidden={focusMode} />
      <main>{content}</main>
      {focus && page !== 'focus' && <div className="leetcode-prewarm" aria-hidden="true"><LeetCodeWorkspace url={focus.attempt.problem.leetcodeUrl} hidden /></div>}
      {confirmLeave && focus && <ConfirmLeave problem={focus.attempt.problem.title} onStay={() => setConfirmLeave(false)} onPauseExit={pauseAndExit} onEnd={endSession} />}
      {logging && focus && <ReflectionDialog context={focus} initialNotes={reflectionNotes} onSave={finish} onCancel={() => { setLogging(false); setReflectionNotes('') }} />}
      {toast && <button className="toast" onClick={() => setToast('')}>{toast}</button>}
    </div>
  )
}
