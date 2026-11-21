export interface OfflineProblem {
  problemId: string
  savedAt: string
  code: string
  tests: string
  draftRecovered?: boolean
  snapshot: {
    title: string
    content: string
    exampleTestcases: string
    metaData: string
    codeSnippets: { langSlug: string; code: string }[]
    images?: Record<string, string>
  }
}
export interface MethodMetadata {
  name: string
  params: { name: string; type: string }[]
  return: { type: string }
}
export interface LocalTest { args: unknown[]; expected?: unknown; unordered?: boolean; observe?: number }
export interface TestResult { index: number; status: 'passed' | 'different' | 'output' | 'error'; actual?: unknown; expected?: unknown; error?: string; stdout: string; durationMs?: number }
/** How the local judge executes and compares a problem (see public/offline-harness.py). */
export interface JudgeSpec { mode: string; checker: string }
export interface JudgePack extends JudgeSpec {
  version: 1
  slug: string
  metadata: MethodMetadata
  examples: LocalTest[]
  tests: LocalTest[]
}
export type Verdict = 'accepted' | 'wrong-answer' | 'runtime-error' | 'time-limit' | 'compile-error'
export interface SubmissionFailure { index: number; args: unknown[]; actual?: unknown; expected?: unknown; stdout: string }
export interface SubmissionResult { verdict: Verdict; passed: number; total: number; runtimeMs: number; error?: string; failure?: SubmissionFailure }
export interface OfflineSubmission { id: number; submittedAt: string; verdict: Verdict; passed: number; total: number; runtimeMs: number; code: string; detail: string }
