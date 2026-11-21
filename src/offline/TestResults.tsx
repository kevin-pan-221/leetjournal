import { useState } from 'react'
import type { LocalTest, MethodMetadata, TestResult } from './types'
import { firstResultToInspect, summarizeResults } from './results'

export function TestResults({ results, cases, metadata, running, status, error }: { results: TestResult[]; cases: LocalTest[]; metadata: MethodMetadata | null; running: boolean; status: string; error: string }) {
  const [chosen, setChosen] = useState<{ rows: TestResult[]; index: number } | null>(null)
  if (running) return <div className="offline-result-empty" role="status"><span className="offline-running-dot" />{status}</div>
  if (error) return <pre className="offline-run-error" role="alert">{error}</pre>
  if (!results.length) return <div className="offline-result-empty">{status || 'Run your code to see results here.'}</div>
  const selection = chosen?.rows === results ? Math.min(chosen.index, results.length - 1) : firstResultToInspect(results)
  const row = results[selection]
  const input = cases[row.index]
  return <>
    <div className="offline-result-summary" role="status"><b>{summarizeResults(results)}</b><span>Local cases · {results.reduce((sum, r) => sum + (r.durationMs ?? 0), 0).toFixed(1)} ms</span></div>
    <nav className="offline-case-tabs" aria-label="Result cases">{results.map((r, i) => <button key={r.index} aria-pressed={i === selection} className={`result-${r.status}`} onClick={() => setChosen({ rows: results, index: i })}>{r.status === 'passed' ? '✓' : r.status === 'output' ? '·' : '!'} Case {r.index + 1}</button>)}</nav>
    <article className={`offline-result ${row.status}`}>
      <b>{row.status === 'passed' ? 'Matches expected' : row.status === 'different' ? 'Output differs' : row.status === 'output' ? 'Output only — no expected value set' : 'Runtime error'}</b>
      {input && <><h4>Input</h4><pre>{input.args.map((value, i) => `${metadata?.params[i]?.name ?? `arg${i + 1}`} = ${JSON.stringify(value)}`).join('\n')}</pre></>}
      {row.error ? <pre className="offline-run-error">{row.error}</pre> : <><h4>{input?.observe !== undefined ? `${metadata?.params[input.observe]?.name} after execution` : 'Output'}</h4><pre>{JSON.stringify(row.actual)}</pre>{'expected' in row && <><h4>Expected</h4><pre>{JSON.stringify(row.expected)}</pre></>}</>}
      {row.stdout && <><h4>Console</h4><pre>{row.stdout}</pre></>}
    </article>
  </>
}
