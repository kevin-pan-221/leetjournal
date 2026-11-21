import { useCallback, useEffect, useRef, useState } from 'react'
import { saveDraft, stageDraft } from './drafts'
import type { OfflineProblem } from './types'

export function useOfflineDraft(saved: OfflineProblem, initialTests: string, onDraft?: (code: string, tests: string) => void) {
  const [draft, setDraft] = useState(() => ({ code: saved.code, tests: initialTests }))
  const [status, setStatus] = useState(saved.draftRecovered ? 'Recovered draft · saving…' : 'Saved on this device')
  const latest = useRef(draft)
  const dirty = useRef(Boolean(saved.draftRecovered))
  const mounted = useRef(false)
  const notify = useRef(onDraft)
  notify.current = onDraft
  const persist = useCallback(async () => {
    const value = latest.current
    try {
      await saveDraft(saved.problemId, value.code, value.tests)
      if (latest.current === value) {
        dirty.current = false
        if (mounted.current) setStatus('Saved on this device')
      }
      return true
    } catch {
      if (mounted.current) setStatus('Save failed · retry')
      return false
    }
  }, [saved.problemId])
  const edit = useCallback((field: 'code' | 'tests', value: string) => {
    const next = { ...latest.current, [field]: value }
    latest.current = next
    dirty.current = true
    const protectedDraft = stageDraft(saved.problemId, next)
    setStatus(protectedDraft ? 'Saving…' : 'Saving… recovery storage unavailable')
    notify.current?.(next.code, next.tests)
    setDraft(next)
  }, [saved.problemId])
  useEffect(() => {
    if (!dirty.current) return
    const timer = setTimeout(() => void persist(), 400)
    return () => clearTimeout(timer)
  }, [draft, persist])
  useEffect(() => {
    mounted.current = true
    const flush = () => { if (dirty.current) void persist() }
    window.addEventListener('pagehide', flush)
    return () => { mounted.current = false; window.removeEventListener('pagehide', flush); flush() }
  }, [persist])
  return { ...draft, edit, persist, status }
}
