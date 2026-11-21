import { useEffect, useState } from 'react'
import { Download, Check } from 'lucide-react'
import { useOfflineProblem } from './useOfflineProblem'
import { parseMetadata } from './tests'
import { judgeSlug, loadJudgeIndex, type JudgeIndexEntry } from './judge'

export function SaveOfflineButton({ problemId, leetcodeUrl, onSaved }: { problemId: string; leetcodeUrl: string; onSaved?: () => void }) {
  const { saved, loading, downloading, error, download } = useOfflineProblem(problemId)
  const [judge, setJudge] = useState<JudgeIndexEntry | null>(null)
  useEffect(() => {
    const slug = judgeSlug(leetcodeUrl)
    let current = true
    void loadJudgeIndex().then(index => { if (current) setJudge(slug ? index[slug] ?? null : null) })
    return () => { current = false }
  }, [leetcodeUrl])
  return <section className="offline-download">
    <button disabled={loading || downloading} onClick={() => void download().then(value => { if (value) onSaved?.() })}>
      {saved ? <Check size={15} /> : <Download size={15} />}
      {loading ? 'Checking offline copy…' : downloading ? 'Saving problem…' : saved ? 'Saved offline · refresh' : 'Make available offline'}
    </button>
    <small>{judge
      ? `Statement, Python starter and examples, plus an offline judge with ${judge.tests} hidden tests.${judge.bundled ? ' This Premium problem uses LeetJournal’s own statement and works without a connection.' : ''}`
      : 'Statement, available diagrams, Python starter and examples. Official submissions require internet.'}</small>
    {saved && !judge && !parseMetadata(saved.snapshot.metaData) && <small>Read and edit offline. This problem’s design or custom judge is not yet supported for local runs.</small>}
    {error && <p role="alert">{error}</p>}
  </section>
}
