import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { Problem } from '../domain'
import { LeetCodeWorkspace } from '../LeetCodeWorkspace'
import { useConnectivity } from './useConnectivity'
import { judgeSlug, loadJudgeIndex, type JudgeIndexEntry } from './judge'
import { FlaskConical } from 'lucide-react'
import './offline.css'

// The entire offline path (cache reads, recovery, editor and tests) is on demand.
const OfflineFallback = lazy(() => import('./OfflineFallback'))

export function ProblemWorkspace({ problem, hidden, onReadyLabel, onCode }: {
  problem: Problem; hidden: boolean; onReadyLabel: (label: string) => void; onCode: (code: string | null) => void
}) {
  const { connected, check } = useConnectivity()
  const [offline, setOffline] = useState(() => !connected)
  const [openedOffline, setOpenedOffline] = useState(offline)
  const [message, setMessage] = useState('')
  const [judge, setJudge] = useState<JudgeIndexEntry | null>(null)
  const lastLabel = useRef('')
  useEffect(() => {
    const slug = judgeSlug(problem.leetcodeUrl)
    let current = true
    void loadJudgeIndex().then(index => {
      const entry = slug ? index[slug] ?? null : null
      if (!current) return
      setJudge(entry)
      // LeetCode only shows a paywall for these; start in the bundled offline version.
      if (entry?.bundled) { setOffline(true); setOpenedOffline(true) }
    })
    return () => { current = false }
  }, [problem.leetcodeUrl])
  const openOffline = useCallback(() => { setMessage(''); setOffline(true); setOpenedOffline(true) }, [])
  const readyLabel = useCallback((value: string) => {
    if (value) lastLabel.current = value
    onReadyLabel(value)
  }, [onReadyLabel])
  useEffect(() => {
    if (!connected) { setOffline(true); setOpenedOffline(true) }
    // Reconnection must not replace an editor the user is actively working in.
  }, [connected])
  const returnOnline = useCallback((copied = false) => {
    setMessage(copied ? 'Code copied. Paste into LeetCode’s Python3 editor to run or submit.' : '')
    setOffline(false)
  }, [])

  return <div className="problem-workspace">
    {!offline && message && <div className="offline-transfer-message" role="status">{message}<button aria-label="Dismiss message" onClick={() => setMessage('')}>×</button></div>}
    {!offline && judge && <div className="offline-judge-switch"><span>Offline judge available · {judge.tests} hidden tests</span><button onClick={openOffline}><FlaskConical size={13} />Practice offline</button></div>}
    {openedOffline && <div className="offline-view" hidden={!offline}>
      <Suspense fallback={<div className="offline-empty">Opening saved problem…</div>}>
        <OfflineFallback problem={problem} connected={connected} hidden={hidden || !offline} onlineLabel={lastLabel.current} onCode={onCode} onReturnOnline={returnOnline} onCheckConnection={check} />
      </Suspense>
    </div>}
    {/* Never gate online mounting on cache reads, recovery writes or offline imports. */}
    {!offline && <LeetCodeWorkspace url={problem.leetcodeUrl} hidden={hidden} onReadyLabel={readyLabel} />}
  </div>
}
