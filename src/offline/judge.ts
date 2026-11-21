import type { JudgePack, LocalTest, SubmissionResult, Verdict } from './types.ts'

export interface JudgeIndexEntry { tests: number; mode: string; bundled: boolean }
const base = () => (import.meta.env?.BASE_URL ?? '/') + 'offline-judge/'
let index: Promise<Record<string, JudgeIndexEntry>> | null = null
const packs = new Map<string, Promise<JudgePack | null>>()

/** The judge pack is keyed by LeetCode slug, taken from the problem's canonical URL. */
export function judgeSlug(url: string): string | null {
  const match = /^https:\/\/(?:www\.)?leetcode\.com\/problems\/([a-z0-9-]+)(?:\/|$)/.exec(url)
  return match ? match[1] : null
}

export function loadJudgeIndex(): Promise<Record<string, JudgeIndexEntry>> {
  index ??= fetch(base() + 'index.json').then(r => r.ok ? r.json() : null).then(value =>
    value && value.version === 1 && value.problems && typeof value.problems === 'object' ? value.problems : {})
    .catch(() => { index = null; return {} })
  return index
}

const validTest = (t: unknown): t is LocalTest => Boolean(t && typeof t === 'object' && Array.isArray((t as LocalTest).args))

export function validPack(value: unknown, slug: string): value is JudgePack {
  const pack = value as JudgePack
  return Boolean(pack && pack.version === 1 && pack.slug === slug && typeof pack.mode === 'string' && typeof pack.checker === 'string'
    && pack.metadata && Array.isArray(pack.metadata.params) && Array.isArray(pack.tests) && pack.tests.length > 0
    && pack.tests.every(validTest) && Array.isArray(pack.examples) && pack.examples.every(validTest))
}

/** Resolves to null when this problem has no bundled judge (only the index is consulted first,
 * so a dev server's HTML fallback is never mistaken for a pack). */
export function loadJudgePack(slug: string | null): Promise<JudgePack | null> {
  if (!slug) return Promise.resolve(null)
  let pending = packs.get(slug)
  if (!pending) {
    pending = loadJudgeIndex().then(problems => problems[slug]
      ? fetch(base() + slug + '.json').then(r => r.ok ? r.json() : null).then(v => validPack(v, slug) ? v : null)
      : null).catch(() => { packs.delete(slug); return null })
    packs.set(slug, pending)
  }
  return pending
}

export const verdictLabel: Record<Verdict, string> = {
  'accepted': 'Accepted',
  'wrong-answer': 'Wrong Answer',
  'runtime-error': 'Runtime Error',
  'time-limit': 'Time Limit Exceeded',
  'compile-error': 'Compile Error',
}

const verdicts = Object.keys(verdictLabel)
export function validSubmission(value: unknown, total: number): value is SubmissionResult {
  const r = value as SubmissionResult
  return Boolean(r && verdicts.includes(r.verdict) && r.total === total && Number.isInteger(r.passed) && r.passed >= 0 && r.passed <= total
    && Number.isFinite(r.runtimeMs) && r.runtimeMs >= 0 && (r.error === undefined || typeof r.error === 'string')
    && (r.verdict === 'accepted') === (r.passed === total)
    && (r.failure === undefined || (Number.isInteger(r.failure.index) && Array.isArray(r.failure.args) && typeof r.failure.stdout === 'string')))
}
