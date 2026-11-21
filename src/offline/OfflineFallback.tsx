import { useEffect, useRef, useState } from 'react'
import type { Problem } from '../domain'
import { api } from '../api'
import { errorMessage } from '../utils/errors'
import { useOfflineProblem } from './useOfflineProblem'
import { stageDraft, saveDraft } from './drafts'
import { OfflineEditor } from './OfflineEditor'
import { judgeSlug, loadJudgeIndex, loadJudgePack } from './judge'
import type { JudgePack } from './types'

interface Props {
  problem: Problem
  connected: boolean
  hidden: boolean
  onlineLabel: string
  onCode: (code: string | null) => void
  onReturnOnline: (copied?: boolean) => void
  onCheckConnection: () => void
}

export default function OfflineFallback({ problem, connected, hidden, onlineLabel, onCode, onReturnOnline, onCheckConnection }: Props) {
  const { saved, loading, downloading, error, download, updateDraft } = useOfflineProblem(problem.id)
  const [editorRevision, setEditorRevision] = useState(0)
  const [importing, setImporting] = useState(false)
  const [pendingImport, setPendingImport] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [pack, setPack] = useState<JudgePack | null | undefined>(undefined)
  const [bundled, setBundled] = useState(false)
  const autoSaved = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const slug = judgeSlug(problem.leetcodeUrl)
    let current = true
    setPack(undefined)
    void loadJudgeIndex().then(index => { if (current) setBundled(Boolean(slug && index[slug]?.bundled)) })
    void loadJudgePack(slug).then(value => { if (current) setPack(value) })
    return () => { current = false }
  }, [problem.leetcodeUrl])
  // Premium-only statements ship with the app, so they can be stored without a connection.
  useEffect(() => {
    if (bundled && !loading && !saved && !downloading && !autoSaved.current) { autoSaved.current = true; void download() }
  }, [bundled, loading, saved, downloading, download])
  const importCode = async () => {
    if (!onlineLabel || importing) return
    setImporting(true); setMessage('')
    try {
      const code = await api.leetcodeEditorCode(onlineLabel)
      if (!code.trim()) throw new Error('Could not read the online editor. Its code has not been changed.')
      if (code.length > 200_000) throw new Error('Code is too large (200 KB limit).')
      if (alive.current) setPendingImport(code)
    } catch (error) { if (alive.current) setMessage(errorMessage(error)) }
    finally { if (alive.current) setImporting(false) }
  }
  const confirmImport = async () => {
    if (pendingImport === null || !saved || importing) return
    setImporting(true)
    const code = pendingImport
    stageDraft(problem.id, { code, tests: saved.tests })
    updateDraft(code, saved.tests)
    setEditorRevision(value => value + 1)
    try { await saveDraft(problem.id, code, saved.tests) }
    catch { if (alive.current) setMessage('Could not save imported code. Your recovery copy is kept; retry when storage is available.'); return }
    finally { if (alive.current) setImporting(false) }
    if (alive.current) { setPendingImport(null); setMessage('') }
  }
  return <>
    <div className="offline-connection" role="status">
      <span>{bundled ? 'LeetCode Premium problem · practicing LeetJournal’s bundled version.' : connected ? 'Offline workspace · Your draft is saved on this device.' : 'Connection unavailable · Using your saved Python workspace.'}</span>
      <button onClick={() => onReturnOnline()}>{connected ? 'Open on LeetCode' : 'Try LeetCode'}</button>
      {!connected && <button onClick={onCheckConnection}>Check connection</button>}
      {saved && onlineLabel && <details><summary>Code options</summary><button disabled={importing} onClick={() => void importCode()}>{importing ? 'Reading editor…' : 'Bring code from LeetCode'}</button></details>}
    </div>
    {error && <p className="offline-toolbar-error" role="alert">{error}</p>}
    {message && <div className="offline-transfer-message" role="status">{message}<button aria-label="Dismiss message" onClick={() => setMessage('')}>×</button></div>}
    {pendingImport !== null && <div className="offline-import-confirm" role="alertdialog" aria-label="Replace offline Python draft"><h3>Bring this code offline?</h3><p>This replaces the saved offline code for {problem.title}. Make sure the LeetCode editor is set to Python3. Online code is left unchanged.</p><button autoFocus disabled={importing} onClick={() => setPendingImport(null)}>Cancel</button><button disabled={importing} className="primary" onClick={() => void confirmImport()}>{importing ? 'Saving…' : 'Replace offline draft'}</button></div>}
    {(loading || (saved && pack === undefined) || (bundled && !saved && !error)) && <div className="offline-empty">Opening saved problem…</div>}
    {!loading && saved && pack !== undefined && <OfflineEditor key={`${problem.id}:${editorRevision}`} saved={saved} pack={pack} onCode={onCode} onDraft={updateDraft} hidden={hidden || pendingImport !== null} onSubmitOnline={() => onReturnOnline(true)} />}
    {!loading && !saved && !(bundled && !error) && <div className="offline-empty"><h2>No offline copy yet</h2><p>This problem hasn’t been saved on this device. Once connected, save it from Library for next time.</p>{connected && <button className="primary" disabled={downloading} onClick={() => void download()}>{downloading ? 'Saving…' : 'Save this problem'}</button>}</div>}
  </>
}
