import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { Problem } from '../domain'
import { LeetCodeWorkspace } from '../LeetCodeWorkspace'
import { useConnectivity } from './useConnectivity'
import { judgeSlug, loadJudgeIndex, type JudgeIndexEntry } from './judge'
import './offline.css'

// The entire offline path (cache reads, recovery, editor and tests) is on demand.
const OfflineFallback = lazy(() => import('./OfflineFallback'))

interface Props {
  problem: Problem; hidden: boolean; onReadyLabel: (label: string) => void; onCode: (code: string | null) => void
  /** Optional control from the surrounding page (the focus side panel's LeetCode / Offline switch). */
  offline?: boolean; onOfflineChange?: (offline: boolean) => void; onJudge?: (judge: JudgeIndexEntry | null) => void
}

export function ProblemWorkspace({ problem, hidden, onReadyLabel, onCode, offline: requested, onOfflineChange, onJudge }: Props) {
  const { connected, check } = useConnectivity()
  const [own, setOwn] = useState(() => !connected)
  const offline = requested ?? own
  const [openedOffline, setOpenedOffline] = useState(offline)
  const [message, setMessage] = useState('')
  const lastLabel = useRef('')
  const notify = useRef({ onOfflineChange, onJudge })
  notify.current = { onOfflineChange, onJudge }
  const setOffline = useCallback((value: boolean) => {
    if (notify.current.onOfflineChange) notify.current.onOfflineChange(value)
    else setOwn(value)
  }, [])
  // The offline editor stays mounted once opened, so switching back keeps cursor, undo and results.
  useEffect(() => { if (offline) setOpenedOffline(true) }, [offline])
  useEffect(() => {
    const slug = judgeSlug(problem.leetcodeUrl)
    let current = true
    void loadJudgeIndex().then(index => {
      const entry = slug ? index[slug] ?? null : null
      if (!current) return
      notify.current.onJudge?.(entry)
      // LeetCode only shows a paywall for these; start in the bundled offline version.
      if (entry?.bundled) setOffline(true)
    })
    return () => { current = false }
  }, [problem.leetcodeUrl, setOffline])
  const readyLabel = useCallback((value: string) => {
    if (value) lastLabel.current = value
    onReadyLabel(value)
  }, [onReadyLabel])
  useEffect(() => {
    if (!connected) setOffline(true)
    // Reconnection must not replace an editor the user is actively working in.
  }, [connected, setOffline])
  const returnOnline = useCallback((copied = false) => {
    setMessage(copied ? 'Code copied. Paste into LeetCode’s Python3 editor to run or submit.' : '')
    setOffline(false)
  }, [setOffline])

  return <div className="problem-workspace">
    {!offline && message && <div className="offline-transfer-message" role="status">{message}<button aria-label="Dismiss message" onClick={() => setMessage('')}>×</button></div>}
    {openedOffline && <div className="offline-view" hidden={!offline}>
      <Suspense fallback={<div className="offline-empty">Opening saved problem…</div>}>
        <OfflineFallback problem={problem} connected={connected} hidden={hidden || !offline} onlineLabel={lastLabel.current} onCode={onCode} onReturnOnline={returnOnline} onCheckConnection={check} switchElsewhere={Boolean(onOfflineChange)} />
      </Suspense>
    </div>}
    {/* Never gate online mounting on cache reads, recovery writes or offline imports. */}
    {!offline && <LeetCodeWorkspace url={problem.leetcodeUrl} hidden={hidden} onReadyLabel={readyLabel} />}
  </div>
}
