import { useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { LoaderCircle } from 'lucide-react'
import { api } from './api'
import { errorMessage } from './utils/errors'
import type { FinishAttemptInput, Problem } from './domain'
import type { Page } from './app/page'
import { GardenFocus, GardenPage, gardenStageName } from './Garden'
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
  const { dashboard, garden, focus, entries, reviews, books, settings, loading, error,
    reload, setFocus, setGarden, setSettings, setEntries } = useAppData()
  const [page, setPage] = useState<Page>('today')
  const [logging, setLogging] = useState(false)
  const [reflectionNotes, setReflectionNotes] = useState('')
  const [toast, setToast] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [focusReturn, setFocusReturn] = useState<Page>('today')
  const [gardenMounted, setGardenMounted] = useState(false)
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
    setToast(errorMessage(actionError))

  const releaseQwen = async () => {
    try { await api.unloadQwen() } catch (actionError) { reportActionError(actionError) }
  }

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
      await releaseQwen()
      setFocus(await api.focusContext())
      setConfirmLeave(false)
      setPage(focusReturn)
    } catch (actionError) { reportActionError(actionError) }
  }

  const endSession = async () => {
    if (!focus) return
    try {
      await api.abandon(focus.attempt.id)
      await releaseQwen()
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
    const previousStage = garden?.currentStage
    const entry = await api.finish({ attemptId: focus.attempt.id, ...input })
    // The write is committed: leave the form immediately. Model cleanup is not
    // part of saving and must never leave a saved attempt stuck on this screen.
    setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)])
    setFocus(null)
    setLogging(false)
    setReflectionNotes('')
    setPage('journal')
    setToast('Journal entry saved · the garden feels a little livelier')
    void releaseQwen()
    void closeLeetCodeWorkspace()
    void reload()
    void api.garden().then((nextGarden) => {
      setGarden(nextGarden)
      if (previousStage && previousStage !== nextGarden.currentStage) {
        setGardenMounted(true)
        setPage((current) => current === 'journal' ? 'garden' : current)
        setToast(`The ${gardenStageName(previousStage)} has grown into a ${gardenStageName(nextGarden.currentStage)}.`)
      }
    }).catch(reportActionError)
  }

  const editReflection = async (input: FinishAttemptInput) => {
    await api.updateJournal(input)
    setEntries((current) => current.map((entry) => entry.id === input.attemptId
      ? { ...entry, outcome: input.outcome, confidence: input.confidence,
        notes: input.notes, mistakes: input.mistakes }
      : entry))
    setToast('Reflection updated')
  }

  const content = useMemo(() => {
    if (loading) return <div className="loading"><LoaderCircle /><p>Opening your journal…</p></div>
    if (error || !dashboard || !garden || !settings) {
      return <div className="error-state"><h2>LeetJournal couldn’t open</h2><p>{error}</p><button className="primary" onClick={reload}>Try again</button></div>
    }
    if (page === 'today') return <TodayPage data={dashboard} settings={settings} active={focus} onStart={(problem, isReview) => start(problem, isReview)} onResume={() => { setFocusReturn('today'); setPage('focus') }} onReviews={() => setPage('reviews')} />
    if (page === 'garden') return null
    if (page === 'garden-focus') return <GardenFocus context={focus} garden={garden} animate={settings.plantAnimations} onPause={pause} onWorkspace={() => setPage('focus')} onFinish={() => void beginReflection()} />
    if (page === 'focus') return <FocusPage context={focus} settings={settings} obscured={logging || confirmLeave} onPause={pause} onFinish={(notes) => void beginReflection(notes)} onBack={() => setPage('today')} />
    if (page === 'problems') return <LibraryPage books={books} entries={entries} onStart={(problem) => start(problem)} onReload={reload} onSetToday={async (kind, problem) => { await api.setTodayItem(kind, problem.id); await reload(); setToast(`${problem.title} set as today’s ${kind.toLowerCase()}`) }} />
    if (page === 'journal') return <JournalPage entries={entries} onEdit={editReflection} onStart={(problem) => start(problem)} />
    if (page === 'reviews') return <ReviewsPage reviews={reviews} onStart={(problem) => start(problem, true)} />
    return <SettingsPage settings={settings} onSave={async (nextSettings) => { setSettings(await api.saveSettings(nextSettings)); await reload(); setToast('Settings saved') }} />
  }, [page, dashboard, garden, focus, entries, reviews, books, settings, loading, error, logging, confirmLeave])

  const toggleSidebar = () => setSidebarCollapsed((current) => {
    const next = !current
    localStorage.setItem('leetjournal.sidebar.collapsed', String(next))
    return next
  })
  const focusMode = page === 'focus' || page === 'garden-focus'
  const navigate = async (next: Page) => {
    if (next === 'garden') setGardenMounted(true)
    if (next === 'settings') await closeLeetCodeWorkspace()
    else if (next !== 'focus') await hideLeetCodeWorkspace()
    setPage(next)
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${focusMode ? 'focus-mode' : ''} ${page === 'garden' ? 'garden-shell' : ''} theme-${settings?.theme ?? 'warm-garden'}`}>
      <Sidebar page={page} name={settings?.displayName ?? 'Coder'} onNavigate={(next) => void navigate(next)} collapsed={sidebarCollapsed} onToggle={toggleSidebar} hidden={focusMode} />
      <main>
        {gardenMounted && garden && settings && (
          <div className={`garden-route ${page === "garden" ? "active" : ""}`} aria-hidden={page !== "garden"}>
            <GardenPage state={garden} active={focus} animate={settings.plantAnimations && page === "garden"} onStart={(problem) => start(problem, false, true)} onReturn={() => setPage("garden-focus")} onReviews={() => setPage("reviews")} />
          </div>
        )}
        {page !== "garden" && content}
      </main>
      {focus && page === 'today' && <div className="leetcode-prewarm" aria-hidden="true"><LeetCodeWorkspace url={focus.attempt.problem.leetcodeUrl} hidden /></div>}
      {confirmLeave && focus && <ConfirmLeave problem={focus.attempt.problem.title} onStay={() => setConfirmLeave(false)} onPauseExit={pauseAndExit} onEnd={endSession} />}
      {logging && focus && <ReflectionDialog problemTitle={focus.attempt.problem.title} initialNotes={reflectionNotes} onSave={finish} onCancel={() => { setLogging(false); setReflectionNotes('') }} />}
      {toast && <button className="toast" onClick={() => setToast('')}>{toast}</button>}
    </div>
  )
}
