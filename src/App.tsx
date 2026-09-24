import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { LoaderCircle } from 'lucide-react'
import { api } from './api'
import { errorMessage } from './utils/errors'
import type { FinishAttemptInput, Problem } from './domain'
import { isFocusPage, type Page } from './app/page'
import { GardenFocus, GardenPage } from './Garden'
import { closeLeetCodeWorkspace, hideLeetCodeWorkspace, LeetCodeWorkspace } from './LeetCodeWorkspace'
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
  const { dashboard, garden, focus: practiceFocus, reviewFocus, setReviewFocus, entries, reviews, books, settings, loading, error,
    reload, setFocus: setPracticeFocus, setSettings, setEntries } = useAppData()
  const [page, setPage] = useState<Page>('today')
  const [logging, setLogging] = useState(false)
  const [reflectionNotes, setReflectionNotes] = useState('')
  const [actionError, setActionError] = useState('')
  const isReviewMode = page === 'review-focus'
  const focusMode = isFocusPage(page)
  const focus = isReviewMode ? reviewFocus : practiceFocus
  const setFocus = isReviewMode ? setReviewFocus : setPracticeFocus
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [focusReturn, setFocusReturn] = useState<Page>('today')
  const [gardenMounted, setGardenMounted] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('leetjournal.sidebar.collapsed') === 'true',
  )

  useEffect(() => {
    const enabled = Boolean(focus && focusMode && !logging)
    api.setFocusShortcutEnabled(enabled).catch(() => {})
  }, [focus, focusMode, logging])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    listen('focus-escape', () => {
      if (actionError) { setActionError(''); return }
      if (logging || !focus || !focusMode) return
      setConfirmLeave((open) => !open)
    }).then((stop) => {
      if (disposed) stop()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [focus, focusMode, logging, actionError])

  const reportActionError = (error: unknown) => {
    setActionError(errorMessage(error))
    void hideLeetCodeWorkspace().then(() => getCurrentWebview().setFocus()).catch(() => {})
  }

  const releaseQwen = async () => {
    try { await api.unloadQwen() } catch (actionError) { reportActionError(actionError) }
  }

  const pause = async () => {
    if (!focus) return
    try {
      await api.pause(focus.attempt.id)
      setFocus(await api.focusContext(isReviewMode))
    } catch (actionError) { reportActionError(actionError) }
  }

  const pauseAndExit = async () => {
    if (!focus) return
    try {
      await api.pauseOnly(focus.attempt.id)
      void releaseQwen()
      setFocus(await api.focusContext(isReviewMode))
      setConfirmLeave(false)
      setPage(focusReturn)
    } catch (actionError) { reportActionError(actionError) }
  }

  const endSession = async () => {
    if (!focus) return
    try {
      await api.abandon(focus.attempt.id)
      void releaseQwen()
      void closeLeetCodeWorkspace().catch(reportActionError)
      setConfirmLeave(false)
      setFocus(null)
      setPage(focusReturn)
      void reload()
    } catch (actionError) { reportActionError(actionError) }
  }

  const start = async (problem: Problem, isReview = false, fromGarden = false) => {
    const returnPage: Page = isReview ? 'reviews' : fromGarden ? 'garden'
      : page === 'reviews' ? 'reviews'
        : page === 'problems' ? 'problems'
          : page === 'journal' ? 'journal' : 'today'
    try {
      await api.start(problem.id, isReview)
      const [nextPractice, nextReview] = await Promise.all([api.focusContext(), api.focusContext(true)])
      setPracticeFocus(nextPractice)
      setReviewFocus(nextReview)
      setFocusReturn(returnPage)
      setPage(isReview ? 'review-focus' : fromGarden ? 'garden-focus' : 'focus')
    } catch (actionError) { reportActionError(actionError) }
  }

  const beginReflection = async (notes?: string) => {
    if (!focus) return
    // Native child webviews sit above HTML dialogs. Hide before opening the form
    // and return input focus to the app instead of leaving it in the editor.
    setReflectionNotes(notes ?? focus.attempt.notes)
    setLogging(true)
    try {
      await hideLeetCodeWorkspace()
      await getCurrentWebview().setFocus()
    } catch (actionError) { reportActionError(actionError) }
  }

  const finish = async (input: Omit<FinishAttemptInput, 'attemptId'>) => {
    if (!focus) throw new Error('This focus session is no longer active.')
    const entry = await api.finish({ attemptId: focus.attempt.id, ...input })
    // The write is committed: leave the form immediately. Model cleanup is not
    // part of saving and must never leave a saved attempt stuck on this screen.
    setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)])
    setFocus(null)
    setLogging(false)
    setReflectionNotes('')
    // Return to the next problem, preserving the Library's saved book/filters.
    // Reviews return to their own queue without disturbing the focus session.
    setPage(isReviewMode ? 'reviews' : 'problems')
    void releaseQwen()
    void closeLeetCodeWorkspace().catch(reportActionError)
    void reload()
  }

  const editReflection = async (input: FinishAttemptInput) => {
    await api.updateJournal(input)
    setEntries((current) => current.map((entry) => entry.id === input.attemptId
      ? { ...entry, outcome: input.outcome, confidence: input.confidence,
        notes: input.notes, mistakes: input.mistakes }
      : entry))
  }

  const renderContent = () => {
    if (loading) return <div className="loading"><LoaderCircle /><p>Opening your journal…</p></div>
    if (error || !dashboard || !garden || !settings) {
      return <div className="error-state"><h2>LeetJournal couldn’t open</h2><p>{error}</p><button className="primary" onClick={reload}>Try again</button></div>
    }
    if (page === 'today') return <TodayPage data={dashboard} settings={settings} active={focus} onStart={(problem, isReview) => start(problem, isReview)} onResume={() => { if (practiceFocus) void start(practiceFocus.attempt.problem) }} onReviews={() => setPage('reviews')} />
    if (page === 'garden') return null
    if (page === 'garden-focus') return <GardenFocus context={focus} garden={garden} animate={settings.plantAnimations} onPause={pause} onWorkspace={() => setPage('focus')} onFinish={() => void beginReflection()} />
    if (page === 'focus' || page === 'review-focus') return <FocusPage key={focus?.attempt.id} context={focus} settings={settings} obscured={logging || confirmLeave || Boolean(actionError)} onPause={pause} onFinish={(notes) => void beginReflection(notes)} onBack={() => setPage(isReviewMode ? 'reviews' : 'today')} />
    if (page === 'problems') return <LibraryPage books={books} entries={entries} onStart={(problem) => start(problem)} onReload={async () => { await reload() }} onSetToday={async (kind, problem) => { await api.setTodayItem(kind, problem.id); await reload() }} />
    if (page === 'journal') return <JournalPage entries={entries} onEdit={editReflection} onStart={(problem) => start(problem)} />
    if (page === 'reviews') return <ReviewsPage reviews={reviews} active={reviewFocus} onStart={(problem) => start(problem, true)} />
    return <SettingsPage settings={settings} onSave={async (nextSettings) => { setSettings(await api.saveSettings(nextSettings)); await reload() }} />
  }
  const content = renderContent()

  const toggleSidebar = () => setSidebarCollapsed((current) => {
    const next = !current
    localStorage.setItem('leetjournal.sidebar.collapsed', String(next))
    return next
  })
  const navigate = async (next: Page) => {
    if (next === 'garden') setGardenMounted(true)
    if (next === 'settings') await closeLeetCodeWorkspace()
    else if (next !== 'focus') await hideLeetCodeWorkspace()
    setPage(next)
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${focusMode ? 'focus-mode' : ''} ${page === 'garden' ? 'garden-shell' : ''} theme-${settings?.theme ?? 'warm-garden'}`}>
      <Sidebar page={page} name={settings?.displayName ?? 'Coder'} onNavigate={(next) => void navigate(next).catch(reportActionError)} collapsed={sidebarCollapsed} onToggle={toggleSidebar} hidden={focusMode} />
      <main>
        {gardenMounted && garden && settings && (
          <div className={`garden-route ${page === "garden" ? "active" : ""}`} aria-hidden={page !== "garden"}>
            <GardenPage state={garden} active={practiceFocus} animate={settings.plantAnimations && page === "garden"} onStart={(problem) => start(problem, false, true)} onReturn={() => { if (practiceFocus) void start(practiceFocus.attempt.problem, false, true) }} onReviews={() => setPage("reviews")} />
          </div>
        )}
        {page !== "garden" && content}
      </main>
      {focus && page === 'today' && <div className="leetcode-prewarm" aria-hidden="true"><LeetCodeWorkspace url={focus.attempt.problem.leetcodeUrl} hidden /></div>}
      {confirmLeave && focus && <ConfirmLeave isReview={isReviewMode} problem={focus.attempt.problem.title} onStay={() => setConfirmLeave(false)} onPauseExit={pauseAndExit} onEnd={endSession} />}
      {logging && focus && <ReflectionDialog problemTitle={focus.attempt.problem.title} initialNotes={reflectionNotes} onSave={finish} onCancel={() => { setLogging(false); setReflectionNotes('') }} />}
      {actionError && <div className="leave-session-backdrop">
        <section className="leave-session-dialog" role="alertdialog" aria-modal="true" aria-labelledby="action-error-title">
          <h2 id="action-error-title">Couldn't complete that action</h2>
          <p>{actionError}</p>
          <button className="primary" autoFocus onClick={() => setActionError('')}>Close</button>
        </section>
      </div>}
    </div>
  )
}
