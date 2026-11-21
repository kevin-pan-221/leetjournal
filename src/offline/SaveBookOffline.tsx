import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Download, Pause } from 'lucide-react'
import { api } from '../api'
import { errorMessage } from '../utils/errors'
import { latestBookProgress, type OfflineBookProgress } from './bookProgress'

interface Props {
  bookId: string
  problemIds: string[]
  savedIds: string[]
  onSaved: (ids: string[]) => void
}

export function SaveBookOffline({ bookId, problemIds, savedIds, onSaved }: Props) {
  const [progress, setProgress] = useState<OfflineBookProgress | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pausing, setPausing] = useState(false)
  const mounted = useRef(false)
  const receive = useCallback((next: OfflineBookProgress | null) => {
    if (!mounted.current) return
    setProgress(current => latestBookProgress(current, next))
    if (next) onSaved(next.savedIds)
  }, [onSaved])

  useEffect(() => {
    mounted.current = true
    let disposed = false
    let unlisten: (() => void) | undefined
    // Subscribe before fetching the snapshot, so navigation cannot lose updates.
    void (async () => {
      try {
        const stop = await api.onOfflineBookProgress(next => {
          if (!disposed) receive(next)
        })
        if (disposed) { stop(); return }
        unlisten = stop
        const current = await api.offlineBookStatus()
        if (!disposed) receive(current)
      } catch (e) { if (!disposed) setError(errorMessage(e)) }
    })()
    return () => { disposed = true; mounted.current = false; unlisten?.() }
  }, [receive])

  const own = progress?.bookId === bookId ? progress : null
  const running = own?.status === 'running'
  const otherRunning = progress?.status === 'running' && !own
  const saved = problemIds.filter(id => savedIds.includes(id)).length
  const complete = problemIds.length > 0 && saved === problemIds.length

  useEffect(() => { if (!running) setPausing(false) }, [running])

  async function start() {
    setBusy(true); setError('')
    try { receive(await api.saveOfflineBook(bookId)) }
    catch (e) { if (mounted.current) setError(errorMessage(e)) }
    finally { if (mounted.current) setBusy(false) }
  }

  async function pause() {
    setPausing(true); setError('')
    try { await api.pauseOfflineBook(bookId) }
    catch (e) { if (mounted.current) { setError(errorMessage(e)); setPausing(false) } }
  }

  return <section className="offline-book" aria-label="Offline access">
    <div className="offline-book-heading">
      <div><b>Offline access</b><span>{saved} / {problemIds.length} problems saved</span></div>
      {running
        ? <button disabled={pausing} onClick={() => void pause()}><Pause size={15} />{pausing ? 'Pausing…' : 'Pause download'}</button>
        : <button disabled={busy || Boolean(otherRunning) || complete || !problemIds.length} onClick={() => void start()}>
          {complete ? <Check size={15} /> : <Download size={15} />}
          {busy ? 'Starting…' : complete ? 'Saved offline' : saved ? 'Save remaining' : 'Save book offline'}
        </button>}
    </div>
    <progress value={saved} max={Math.max(1, problemIds.length)} aria-label="Problems saved offline" />
    <p>{bookId === 'neetcode-150' ? 'Statements, diagrams, Python starters and examples, plus an offline judge: Submit runs hidden tests locally for every NeetCode 150 problem, including Premium ones.' : 'Public statements, diagrams, Python starters and examples. Official submissions and hidden tests stay online.'}</p>
    <p className="offline-book-status" role="status">{running
      ? pausing ? 'Finishing the current download before pausing…' : `${own.current ? `Saving ${own.current}… ` : ''}You can browse other pages while this continues.`
      : otherRunning ? `Saving ${progress.bookTitle}. Finish or pause that download first.`
      : own?.message || (own?.status === 'completed' && own.issues.length ? 'Finished with unavailable problems. Saved copies are ready to use.' : 'Existing code and tests are kept. Reopen this book to resume after quitting the app.')}</p>
    {own && own.issues.length > 0 && <details><summary>{own.issues.length} {own.issues.length === 1 ? 'problem needs' : 'problems need'} attention</summary><ul>{own.issues.map(issue => <li key={issue.problemId}><b>{issue.title}</b> — {issue.message}</li>)}</ul></details>}
    {error && <p className="offline-book-error" role="alert">{error}</p>}
  </section>
}
