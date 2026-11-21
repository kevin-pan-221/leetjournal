import type { JudgePack, JudgeSpec, LocalTest, MethodMetadata, SubmissionResult, TestResult } from './types'
import { validResults } from './results'
import { validSubmission } from './judge'

/** Wall-clock budget once Python has started. Optimal NeetCode solutions finish well under a second. */
export const RUN_LIMIT_MS = 8_000
export const SUBMIT_LIMIT_MS = 6_000

interface WorkerEvents {
  ready: () => void
  progress?: (index: number) => void
  result: (value: unknown) => void
  failure: (message: string, kind: 'start' | 'timeout' | 'overflow' | 'error') => void
}

// Development-only event trace for native QA (WebKit workers cannot be inspected headlessly).
const trace = (event: string) => { if (import.meta.env.DEV) ((globalThis as { __judgeTrace?: string[] }).__judgeTrace ??= []).push(`${Math.round(performance.now())} ${event}`) }

function startWorker(payload: unknown, limitMs: number, on: WorkerEvents) {
  trace('create worker')
  const worker = new Worker(new URL(`${import.meta.env.BASE_URL}offline-runner.js`, document.baseURI), { type: 'module' })
  let stopped = false
  let ready = false
  let timer: ReturnType<typeof setTimeout>
  const stop = () => { stopped = true; clearTimeout(timer); worker.terminate() }
  const fail = (message: string, kind: Parameters<WorkerEvents['failure']>[1]) => { trace(`fail ${kind} stopped=${stopped}`); if (!stopped) { stop(); on.failure(message, kind) } }
  timer = setTimeout(() => fail('Python could not start within 30 seconds. Try again.', 'start'), 30_000)
  worker.onmessage = ({ data }) => {
    if (data?.type !== 'progress') trace(`message ${data?.type} stopped=${stopped}`)
    if (stopped || !data || typeof data !== 'object') return
    if (data.type === 'ready' && !ready) {
      ready = true
      clearTimeout(timer)
      timer = setTimeout(() => fail(`Stopped: the local run exceeded ${limitMs / 1000} seconds.`, 'timeout'), limitMs)
      on.ready()
    } else if (data.type === 'progress' && Number.isInteger(data.index)) on.progress?.(data.index)
    else if (data.type === 'result') { stop(); on.result(data.results) }
    else if (data.type === 'error') fail(typeof data.error === 'string' ? data.error.slice(0, 4000) : 'Python execution failed.', data.overflow ? 'overflow' : 'error')
  }
  worker.onerror = event => fail(event.message || 'Python could not start. Try reopening LeetJournal.', 'start')
  try { worker.postMessage(payload); trace('posted payload') } catch (error) { trace(`post failed ${String(error)}`); stop(); throw error }
  return stop
}

export function runPython(code: string, tests: LocalTest[], metadata: MethodMetadata, judge: JudgeSpec | null,
  onReady: () => void, onDone: (results: TestResult[] | null, error?: string) => void) {
  return startWorker({ code, tests, metadata, judge }, RUN_LIMIT_MS, {
    ready: onReady,
    result: rows => validResults(rows, tests.length) ? onDone(rows) : onDone(null, 'Python returned an invalid test result.'),
    failure: message => onDone(null, message),
  })
}

/** Runs every hidden test in order and stops at the first failure, like LeetCode's Submit. */
export function submitPython(code: string, pack: JudgePack, onReady: () => void, onProgress: (index: number) => void,
  onDone: (result: SubmissionResult | null, error?: string) => void) {
  let current = 0
  const total = pack.tests.length
  // Same 4 KB preview the harness uses, so huge inputs never bloat the stored result.
  const preview = (value: unknown) => { const text = JSON.stringify(value) ?? 'null'; return text.length <= 4000 ? value : `${text.slice(0, 4000)}…` }
  const lastInput = () => ({ index: current, args: (pack.tests[current]?.args ?? []).map(preview), stdout: '' })
  return startWorker({ code, tests: pack.tests, metadata: pack.metadata, judge: { mode: pack.mode, checker: pack.checker }, submit: true }, SUBMIT_LIMIT_MS, {
    ready: onReady,
    progress: index => { current = index; onProgress(index) },
    result: value => validSubmission(value, total) ? onDone(value) : onDone(null, 'Python returned an invalid submission result.'),
    failure: (message, kind) => {
      if (kind === 'timeout') onDone({ verdict: 'time-limit', passed: current, total, runtimeMs: SUBMIT_LIMIT_MS, failure: lastInput() })
      else if (kind === 'overflow') onDone({ verdict: 'runtime-error', passed: current, total, runtimeMs: 0, error: message, failure: lastInput() })
      else onDone(null, message)
    },
  })
}
