import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { errorMessage } from '../utils/errors'
import type { OfflineProblem } from './types'
import { readSavedProblem } from './drafts'

export function useOfflineProblem(problemId: string) {
  const [saved, setSaved] = useState<OfflineProblem | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const revision = useRef(0)
  useEffect(() => {
    const request = ++revision.current
    setSaved(null); setLoading(true); setError(''); setDownloading(false)
    void readSavedProblem(problemId).then(value => {
      if (revision.current === request) setSaved(value)
    }).catch(error => { if (revision.current === request) setError(errorMessage(error)) })
      .finally(() => { if (revision.current === request) setLoading(false) })
    return () => { revision.current++ }
  }, [problemId])
  const download = useCallback(async () => {
    const request = revision.current
    setDownloading(true); setError('')
    try {
      await api.downloadOfflineProblem(problemId)
      // Include edits made while the download was in flight, including failed-save recovery.
      const value = await readSavedProblem(problemId)
      if (request === revision.current) setSaved(value)
      return value
    } catch (error) {
      if (request === revision.current) setError(errorMessage(error))
      return null
    } finally { if (request === revision.current) setDownloading(false) }
  }, [problemId])
  const updateDraft = useCallback((code: string, tests: string) => setSaved(value => value ? { ...value, code, tests } : value), [])
  return { saved, loading, downloading, error, download, updateDraft }
}
