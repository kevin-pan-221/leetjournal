import { useState } from 'react'
import type { LocalTest, MethodMetadata, TestResult } from './types'
import { firstResultToInspect, formatDuration, runVerdict, summarizeResults } from './results'
import { DiffView } from './DiffView'

const mark = { passed: '✓', different: '✗', error: '!', output: '·' }

interface Props { results: TestResult[]; cases: LocalTest[]; metadata: MethodMetadata | null; running: boolean; status: string; error: string; checker?: string }

export function TestResults({ results, cases, metadata, running, status, error, checker = 'exact' }: Props) {
  const [chosen, setChosen] = useState<{ rows: TestResult[]; index: number } | null>(null)
  if (running) return <div className="offline-result-empty" role="status"><span className="offline-running-dot" />{status}</div>
  if (error) return <pre className="offline-run-error" role="alert">{error}</pre>
  if (!results.length) return <div className="offline-result-empty">{status || 'Run your code to see results here.'}</div>
  const selection = chosen?.rows === results ? Math.min(chosen.index, results.length - 1) : firstResultToInspect(results)
  const row = results[selection]
  const input = cases[row.index]
  const verdict = runVerdict(results)
  const total = results.reduce((sum, r) => sum + (r.durationMs ?? 0), 0)
  return <>
    <div className="offline-result-summary" role="status">
      <b className={`run-verdict ${verdict.tone}`}>{verdict.label}</b>
      <span>Runtime: {formatDuration(total)}</span>
      <small>{summarizeResults(results)}</small>
    </div>
    <nav className="offline-case-tabs" aria-label="Result cases">{results.map((r, i) => <button key={r.index} aria-pressed={i === selection} className={`result-${r.status}`} title={`${r.status === 'passed' ? 'Passed' : r.status === 'different' ? 'Wrong answer' : r.status === 'error' ? 'Runtime error' : 'No expected value'} · ${formatDuration(r.durationMs)}`} onClick={() => setChosen({ rows: results, index: i })}>{mark[r.status]} Case {r.index + 1}</button>)}</nav>
    <article className={`offline-result ${row.status}`}>
      <header><b>{row.status === 'passed' ? 'Matches expected' : row.status === 'different' ? 'Output differs' : row.status === 'output' ? 'Output only — no expected value set' : 'Runtime error'}</b><small>{formatDuration(row.durationMs)}</small></header>
      {input && <><h4>Input</h4><pre>{input.args.map((value, i) => `${metadata?.params[i]?.name ?? `arg${i + 1}`} = ${JSON.stringify(value)}`).join('\n')}</pre></>}
      {row.error ? <pre className="offline-run-error">{row.error}</pre> : <>
        <h4>{input?.observe !== undefined ? `${metadata?.params[input.observe]?.name} after execution` : 'Output'}</h4>
        {row.status === 'different' ? <DiffView actual={row.actual} expected={row.expected} ordered={checker === 'exact' && !input?.unordered} /> : <pre>{JSON.stringify(row.actual)}</pre>}
        {'expected' in row && <><h4>Expected</h4><pre>{JSON.stringify(row.expected)}</pre></>}
      </>}
      {row.stdout && <><h4>Stdout</h4><pre>{row.stdout}</pre></>}
    </article>
  </>
}
