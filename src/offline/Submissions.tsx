import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Copy, FlaskConical, History, RotateCcw } from 'lucide-react'
import { api } from '../api'
import { verdictLabel } from './judge'
import type { MethodMetadata, OfflineSubmission, SubmissionResult } from './types'

/** Harness previews stop at 4 KB and come back as a string ending in "…". */
export function formatValue(value: unknown) {
  return typeof value === 'string' && value.endsWith('…') && value.length > 4000 ? value : JSON.stringify(value)
}

export function formatInput(args: unknown[], metadata: MethodMetadata | null) {
  return args.map((value, i) => `${metadata?.params[i]?.name ?? `arg${i + 1}`} =\n${formatValue(value)}`).join('\n')
}

export function useSubmissions(problemId: string) {
  const [items, setItems] = useState<OfflineSubmission[]>([])
  const [error, setError] = useState('')
  const refresh = useCallback(() => {
    void api.offlineSubmissions(problemId).then(rows => { setItems(rows); setError('') })
      .catch(() => setError('Submission history is unavailable.'))
  }, [problemId])
  useEffect(refresh, [refresh])
  const record = useCallback(async (result: SubmissionResult, code: string) => {
    const { verdict, passed, total, runtimeMs } = result
    let detail = JSON.stringify(result)
    if (detail.length > 60_000) detail = JSON.stringify({ verdict, passed, total, runtimeMs, error: result.error?.slice(0, 4000) })
    const saved = await api.recordOfflineSubmission(problemId, { verdict, passed, total, runtimeMs, code, detail })
    setItems(rows => [saved, ...rows.filter(row => row.id !== saved.id)])
    return saved
  }, [problemId])
  return { items, error, record }
}

export function readDetail(submission: OfflineSubmission): SubmissionResult {
  try {
    const value = JSON.parse(submission.detail)
    if (value && value.verdict === submission.verdict) return value
  } catch { /* Older or damaged rows still show their summary. */ }
  return { verdict: submission.verdict, passed: submission.passed, total: submission.total, runtimeMs: submission.runtimeMs }
}

const ago = (iso: string) => {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`
  return new Date(iso).toLocaleDateString()
}

interface ResultProps {
  result: SubmissionResult | null
  pending: { done: number; total: number; status: string } | null
  error: string
  code: string
  submittedAt?: string
  metadata: MethodMetadata | null
  canAddCase: boolean
  onAddCase?: () => void
  onRestore?: () => void
  onBack: () => void
}

export function SubmissionResultView({ result, pending, error, code, submittedAt, metadata, canAddCase, onAddCase, onRestore, onBack }: ResultProps) {
  const [copied, setCopied] = useState(false)
  if (pending) return <div className="offline-submission">
    <button className="offline-link" onClick={onBack}><ArrowLeft size={13} />Description</button>
    <div className="offline-judging" role="status"><span className="offline-running-dot" /><b>{pending.status}</b>
      {pending.total > 0 && <><progress value={pending.done} max={pending.total} /><small>{pending.done} / {pending.total} testcases</small></>}</div>
  </div>
  if (error || !result) return <div className="offline-submission">
    <button className="offline-link" onClick={onBack}><ArrowLeft size={13} />Description</button>
    <h3 className="verdict bad">Submission failed</h3><pre className="offline-run-error">{error || 'No result.'}</pre>
  </div>
  const accepted = result.verdict === 'accepted'
  const failure = result.failure
  return <div className="offline-submission">
    <button className="offline-link" onClick={onBack}><ArrowLeft size={13} />Description</button>
    <header>
      <h3 className={`verdict ${accepted ? 'good' : 'bad'}`}>{verdictLabel[result.verdict]}</h3>
      <span>{result.passed} / {result.total} testcases passed</span>
      {submittedAt && <small>Submitted {ago(submittedAt)}</small>}
    </header>
    {accepted && <div className="offline-stat-cards">
      <div><small>Runtime</small><b>{Math.max(1, Math.round(result.runtimeMs))} <span>ms</span></b><em>Total for all hidden tests, measured locally</em></div>
      <div><small>Tests</small><b>{result.total}</b><em>Edge cases, random cases and large inputs</em></div>
    </div>}
    {result.error && <pre className="offline-run-error">{result.error}</pre>}
    {failure && <section className="offline-failure">
      <h4>{result.verdict === 'wrong-answer' ? 'Input' : 'Last Executed Input'} <small>hidden test {failure.index + 1}</small></h4>
      <pre>{formatInput(failure.args, metadata)}</pre>
      {'actual' in failure && <><h4>Output</h4><pre className="mismatch">{formatValue(failure.actual)}</pre></>}
      {'expected' in failure && <><h4>Expected</h4><pre>{formatValue(failure.expected)}</pre></>}
      {failure.stdout && <><h4>Stdout</h4><pre>{failure.stdout}</pre></>}
      {onAddCase && <button disabled={!canAddCase} title={canAddCase ? 'Add this input to your test cases' : 'Test cases are limited to 20'} onClick={onAddCase}><FlaskConical size={13} />Use as testcase</button>}
    </section>}
    <section className="offline-submitted-code">
      <h4>Code <small>Python 3</small>
        <span>
          <button title="Copy code" onClick={() => void navigator.clipboard.writeText(code).then(() => setCopied(true), () => {})}><Copy size={13} />{copied ? 'Copied' : 'Copy'}</button>
          {onRestore && <button title="Replace the editor with this submission" onClick={onRestore}><RotateCcw size={13} />Restore</button>}
        </span>
      </h4>
      <pre>{code}</pre>
    </section>
  </div>
}

export function SubmissionsList({ items, error, onOpen }: { items: OfflineSubmission[]; error: string; onOpen: (item: OfflineSubmission) => void }) {
  if (error) return <p className="offline-submissions-empty">{error}</p>
  if (!items.length) return <div className="offline-submissions-empty"><History size={18} /><p>No submissions yet. Submit runs your code against this problem’s hidden tests on this device.</p></div>
  return <table className="offline-submissions">
    <thead><tr><th>Status</th><th>Runtime</th><th>Tests</th><th>When</th></tr></thead>
    <tbody>{items.map(item => <tr key={item.id} tabIndex={0} onClick={() => onOpen(item)} onKeyDown={e => { if (e.key === 'Enter') onOpen(item) }}>
      <td className={item.verdict === 'accepted' ? 'good' : 'bad'}>{verdictLabel[item.verdict]}</td>
      <td>{item.verdict === 'accepted' ? `${Math.max(1, Math.round(item.runtimeMs))} ms` : '—'}</td>
      <td>{item.passed} / {item.total}</td>
      <td>{ago(item.submittedAt)}</td>
    </tr>)}</tbody>
  </table>
}
