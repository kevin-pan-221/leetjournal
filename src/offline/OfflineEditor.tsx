import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Copy, RotateCcw, Play, Square, Code2, FileText, Maximize2, Minimize2, ChevronDown, ChevronUp, CloudUpload, History } from 'lucide-react'
import { errorMessage } from '../utils/errors'
import { examplesFromText, parseMetadata, parseTests } from './tests'
import { caseDraft, initialTests, readCaseDrafts, writeCaseDrafts } from './cases'
import { runPython, submitPython } from './runner'
import { Statement, statementText } from './Statement'
import { PythonEditor } from './PythonEditor'
import { TestCases } from './TestCases'
import { TestResults } from './TestResults'
import { SubmissionResultView, SubmissionsList, readDetail, useSubmissions } from './Submissions'
import { useOfflineDraft } from './useOfflineDraft'
import { SplitHandle } from './SplitHandle'
import { readSplit } from './layout'
import { verdictLabel } from './judge'
import type { JudgePack, LocalTest, OfflineProblem, OfflineSubmission, SubmissionResult, TestResult } from './types'

type LeftTab = 'description' | 'submissions' | 'result'
interface Shown { result: SubmissionResult | null; code: string; submittedAt?: string; error: string }
interface Props { saved: OfflineProblem; pack: JudgePack | null; onCode: (code: string | null) => void; onDraft?: (code: string, tests: string) => void; hidden: boolean; onSubmitOnline?: () => void; onImportOnline?: () => void; importing?: boolean }

export function OfflineEditor({ saved, pack, onCode, onDraft, hidden, onSubmitOnline, onImportOnline, importing = false }: Props) {
  // The bundled judge knows signatures LeetCode marks as custom (design classes, linked-list cycles…).
  const metadata = useMemo(() => parseMetadata(pack ? JSON.stringify(pack.metadata) : saved.snapshot.metaData), [pack, saved.snapshot.metaData])
  const judge = useMemo(() => pack ? { mode: pack.mode, checker: pack.checker } : null, [pack])
  const examples = useMemo(() => writeCaseDrafts((pack ? pack.examples
    : examplesFromText(saved.snapshot.exampleTestcases ?? '', statementText(saved.snapshot.content), metadata?.params.length ?? 0)
      .map(c => metadata?.return.type === 'void' ? { ...c, observe: 0 } : c)).map(caseDraft)), [pack, saved.snapshot, metadata])
  const draft = useOfflineDraft(saved, initialTests(saved.tests, examples), onDraft)
  const submissions = useSubmissions(saved.problemId)
  const [running, setRunning] = useState<'run' | 'submit' | null>(null)
  const [runStatus, setRunStatus] = useState('')
  const [results, setResults] = useState<TestResult[]>([])
  const [runCases, setRunCases] = useState<LocalTest[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [testTab, setTestTab] = useState<'tests' | 'results'>('tests')
  const [leftTab, setLeftTab] = useState<LeftTab>('description')
  const [shown, setShown] = useState<Shown | null>(null)
  const [judging, setJudging] = useState<{ done: number; total: number; status: string } | null>(null)
  const [mobileTab, setMobileTab] = useState<'description' | 'code'>('code')
  const [reset, setReset] = useState<{ field: 'code' | 'tests'; value: string; label: string } | null>(null)
  const [descriptionSize, setDescriptionSize] = useState(() => readSplit('description'))
  const [testSize, setTestSize] = useState(() => readSplit('tests'))
  const [expanded, setExpanded] = useState(false)
  const [testsCollapsed, setTestsCollapsed] = useState(false)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const cancel = useRef<(() => void) | null>(null)
  const runLock = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { onCode(hidden ? null : draft.code); return () => onCode(null) }, [draft.code, hidden, onCode])
  useEffect(() => () => { cancel.current?.() }, [])
  const finish = () => { cancel.current = null; runLock.current = false; setRunning(null) }
  const stop = () => {
    if (!runLock.current) return
    const wasSubmit = running === 'submit'
    cancel.current?.(); finish(); setRunStatus('Run stopped')
    if (wasSubmit) { setJudging(null); setShown(value => value && { ...value, error: 'Submission stopped.' }) }
  }
  useEffect(() => { if (hidden) stop() }, [hidden])
  const edit = (field: 'code' | 'tests', value: string) => { draft.edit(field, value); setResults([]); setError(''); setRunStatus(''); setNotice('') }
  const run = () => {
    if (!metadata || runLock.current || hidden) return
    setError(''); setResults([]); setTestTab('results'); setReset(null); setTestsCollapsed(false); setMobileTab('code')
    try {
      const cases = parseTests(draft.tests, metadata.params.length)
      setRunCases(cases); runLock.current = true; setRunning('run'); setRunStatus('Starting local Python…')
      cancel.current = runPython(draft.code, cases, metadata, judge,
        () => setRunStatus('Running local tests…'),
        (rows, message) => { finish(); setResults(rows ?? []); setError(message ?? ''); setRunStatus('') })
    } catch (error) { runLock.current = false; setRunning(null); setError(errorMessage(error)) }
  }
  const submit = () => {
    if (!pack || runLock.current || hidden) return
    const code = draft.code
    runLock.current = true; setRunning('submit'); setReset(null)
    setLeftTab('result'); setMobileTab('description')
    setShown({ result: null, code, error: '' })
    setJudging({ done: 0, total: pack.tests.length, status: 'Starting local Python…' })
    void draft.persist()
    cancel.current = submitPython(code, pack,
      () => setJudging(value => value && { ...value, status: 'Judging…' }),
      index => setJudging(value => value && { ...value, done: index }),
      (result, message) => {
        finish(); setJudging(null)
        setShown({ result, code, error: message ?? '' })
        if (!result) return
        setNotice(verdictLabel[result.verdict])
        void submissions.record(result, code).then(row => {
          if (alive.current) setShown(value => value?.result === result ? { ...value, submittedAt: row.submittedAt } : value)
        }).catch(() => { if (alive.current) setNotice(`${verdictLabel[result.verdict]} · history not saved`) })
      })
  }
  const openSubmission = (item: OfflineSubmission) => {
    if (running === 'submit') return
    setShown({ result: readDetail(item), code: item.code, submittedAt: item.submittedAt, error: '' })
    setLeftTab('result')
  }
  const addFailingCase = () => {
    const failure = shown?.result?.failure
    const cases = readCaseDrafts(draft.tests)
    if (!failure || !cases || cases.length >= 20 || !pack) return
    const source = pack.tests[failure.index]
    if (!source) return
    edit('tests', writeCaseDrafts([...cases, caseDraft(source)]))
    setTestTab('tests'); setTestsCollapsed(false); setMobileTab('code')
    setNotice(`Added hidden test ${failure.index + 1} as Case ${cases.length + 1}`)
  }
  const copy = async (submitOnline = false) => {
    try { await navigator.clipboard.writeText(draft.code); setNotice('Code copied'); if (submitOnline) onSubmitOnline?.() }
    catch { setNotice('Couldn’t copy. Select your code and copy it manually.') }
  }
  const starter = Array.isArray(saved.snapshot.codeSnippets) ? saved.snapshot.codeSnippets.find(c => c?.langSlug === 'python3' && typeof c.code === 'string')?.code : undefined
  const caseCount = readCaseDrafts(draft.tests)?.length ?? 20
  const last = submissions.items[0]
  return <div className={`offline-editor show-${mobileTab}${expanded ? ' code-expanded' : ''}`} style={{ '--description-size': `${descriptionSize}%`, '--test-size': `${testSize}%` } as CSSProperties}>
    <header className="offline-workbench-toolbar">
      <span className="offline-mode-label" title={pack ? `Submit runs ${pack.tests.length} hidden tests locally with Python 3. Results are a practice log and don’t mark the problem solved.` : 'Saved statement and local Python. This problem has no offline judge; submit on LeetCode.'}>
        {pack ? <>Offline judge · {pack.tests.length} hidden tests{last ? <> · last: <b className={last.verdict === 'accepted' ? 'good' : 'bad'}>{verdictLabel[last.verdict]}</b></> : null}</> : 'Offline workspace'}
      </span>
      <div className="offline-workbench-actions">
        {running
          ? <button onClick={stop}><Square size={14} />Stop</button>
          : <><button disabled={!metadata || hidden} title="Run your test cases (⌘/Ctrl Enter)" onClick={run}><Play size={14} />Run</button>
            {pack && <button className="primary" disabled={hidden} title="Judge against hidden tests (⌘/Ctrl ')" onClick={submit}><CloudUpload size={14} />Submit</button>}</>}
        {onSubmitOnline && <button disabled={Boolean(running)} title="Copy your code and open LeetCode’s Python3 editor to submit online." onClick={() => void copy(true)}>Copy to LeetCode</button>}
        {onImportOnline && <button disabled={Boolean(running) || importing} title="Read the code in LeetCode’s editor; asks before replacing your offline draft." onClick={onImportOnline}>{importing ? 'Reading…' : 'From LeetCode'}</button>}
      </div>
      <span className="offline-workbench-notice" role="status">{notice}</span>
    </header>
    <nav className="offline-mobile-tabs" aria-label="Workspace panels"><button aria-pressed={mobileTab === 'description'} onClick={() => setMobileTab('description')}><FileText size={14} />Description</button><button aria-pressed={mobileTab === 'code'} onClick={() => setMobileTab('code')}><Code2 size={14} />Code</button></nav>
    <section className="offline-description" aria-label="Problem">
      <header role="tablist">
        <button role="tab" aria-selected={leftTab === 'description'} onClick={() => setLeftTab('description')}><FileText size={14} />Description</button>
        {pack && <button role="tab" aria-selected={leftTab === 'submissions'} onClick={() => setLeftTab('submissions')}><History size={14} />Submissions</button>}
        {shown && <button role="tab" aria-selected={leftTab === 'result'} className={shown.result ? (shown.result.verdict === 'accepted' ? 'good' : 'bad') : ''} onClick={() => setLeftTab('result')}>{judging ? 'Judging…' : shown.result ? verdictLabel[shown.result.verdict] : 'Result'}</button>}
        <small>Saved {new Date(saved.savedAt).toLocaleDateString()}</small>
      </header>
      <div className="offline-description-scroll">
        {leftTab === 'description' && <><h2>{saved.snapshot.title}</h2><Statement html={saved.snapshot.content} images={saved.snapshot.images} /></>}
        {leftTab === 'submissions' && <SubmissionsList items={submissions.items} error={submissions.error} onOpen={openSubmission} />}
        {leftTab === 'result' && shown && <SubmissionResultView result={shown.result} pending={judging} error={shown.error} code={shown.code} submittedAt={shown.submittedAt}
          metadata={metadata} canAddCase={caseCount < 20} onAddCase={shown.result?.failure && metadata ? addFailingCase : undefined}
          onRestore={shown.code !== draft.code && !running ? () => { setReset({ field: 'code', value: shown.code, label: 'your code with this submission' }); setMobileTab('code') } : undefined}
          onBack={() => setLeftTab('description')} />}
      </div>
    </section>
    <SplitHandle panel="description" value={descriptionSize} onChange={setDescriptionSize} />
    <section className="offline-code-panel" aria-label="Local Python workspace">
      <header><b><Code2 size={15} />Code <small>Python 3</small></b><div><button aria-label="Reset Python code" title="Reset to starter" disabled={Boolean(running) || !starter} onClick={() => setReset({ field: 'code', value: starter!, label: 'your code with the starter' })}><RotateCcw size={14} /></button><button aria-label="Copy Python code" title="Copy code" onClick={() => void copy()}><Copy size={14} /></button><button aria-label={expanded ? 'Restore split view' : 'Expand code editor'} aria-pressed={expanded} title={expanded ? 'Restore split view' : 'Expand code editor'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button></div></header>
      {reset && <div className="offline-confirm" role="alert"><span>Replace {reset.label}?</span><button onClick={() => setReset(null)}>Cancel</button><button onClick={() => { edit(reset.field, reset.value); setReset(null) }}>Replace</button></div>}
      <PythonEditor value={draft.code} readOnly={Boolean(running)} onChange={code => edit('code', code)} onRun={run} onSubmit={submit} onCursor={(line, column) => setCursor({ line, column })} />
      <div className="offline-editor-status"><button className={draft.status.includes('failed') ? 'save-error' : ''} onClick={() => void draft.persist()}>{draft.status}</button><span id="offline-editor-shortcuts" title="Tab indents. Shift-Alt-M on Mac (Ctrl-M elsewhere) toggles Tab navigation.">⌘/Ctrl Enter to run{pack ? ' · ⌘/Ctrl \' to submit' : ''}</span><span className="offline-cursor">Ln {cursor.line}, Col {cursor.column}</span></div>
      {!metadata && <p className="offline-warning">This problem needs a custom judge. Edit and save here; run design or interactive problems on LeetCode.</p>}
      {!testsCollapsed && <SplitHandle panel="tests" value={testSize} onChange={setTestSize} />}
      <nav className="offline-test-tabs" aria-label="Local test panels"><button aria-pressed={testTab === 'tests' && !testsCollapsed} onClick={() => { setTestTab('tests'); setTestsCollapsed(false) }}>Testcase</button><button aria-pressed={testTab === 'results' && !testsCollapsed} onClick={() => { setTestTab('results'); setTestsCollapsed(false) }}>Test Result{results.length > 0 ? ` · ${results.length} case${results.length === 1 ? '' : 's'}` : ''}</button>{testTab === 'tests' && metadata && !testsCollapsed && <button className="offline-reset-cases" disabled={Boolean(running)} onClick={() => setReset({ field: 'tests', value: examples, label: 'your test cases with the examples' })}>Restore examples</button>}<button className="offline-test-toggle" aria-label={testsCollapsed ? 'Show test panel' : 'Collapse test panel'} aria-expanded={!testsCollapsed} onClick={() => setTestsCollapsed(!testsCollapsed)}>{testsCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button></nav>
      <div className="offline-test-panel" hidden={testsCollapsed}>
        <div hidden={testTab !== 'tests'}>{metadata ? <TestCases value={draft.tests} metadata={metadata} judged={Boolean(pack)} customCompare={!pack || pack.mode === 'function'} disabled={Boolean(running)} onChange={value => edit('tests', value)} /> : <p>Local test execution is unavailable for this problem type.</p>}</div>
        <div hidden={testTab !== 'results'}><TestResults results={results} cases={runCases} metadata={metadata} running={running === 'run'} status={runStatus} error={error} /></div>
      </div>
      <footer title="Hidden tests are generated for LeetJournal from reference solutions, not LeetCode’s own judge data. Submitting never marks a problem solved. Python uses a disposable worker, not an operating-system security sandbox.">{pack ? 'Local judge · Python 3 · Run only code you trust' : 'Local tests · Run only code you trust'}</footer>
    </section>
  </div>
}
