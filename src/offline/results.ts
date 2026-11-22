import type { TestResult } from './types.ts'

export function summarizeResults(results: TestResult[]) {
  const passed = results.filter(row => row.status === 'passed').length
  const compared = results.filter(row => row.status === 'passed' || row.status === 'different').length
  const errors = results.filter(row => row.status === 'error').length
  const outputOnly = results.filter(row => row.status === 'output').length
  return [
    compared ? `${passed} / ${compared} match expected` : '',
    errors ? `${errors} runtime error${errors === 1 ? '' : 's'}` : '',
    outputOnly ? `${outputOnly} output-only case${outputOnly === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ')
}

export function firstResultToInspect(results: TestResult[]) {
  const failed = results.findIndex(row => row.status === 'different' || row.status === 'error')
  return Math.max(0, failed)
}

/** Missing, repeated or malformed rows must never look like a complete successful run. */
export function validResults(value: unknown, count: number): value is TestResult[] {
  // Python limits Unicode code points; JS string.length counts UTF-16 code units.
  const boundedText = (text: unknown) => typeof text === 'string' && text.length <= 8000 && [...text].length <= 4000
  return Array.isArray(value) && value.length === count && count <= 20
    && new Set(value.map(row => row?.index)).size === count
    && value.every(row => row && Number.isInteger(row.index) && row.index >= 0 && row.index < count
      && ['passed', 'different', 'output', 'error'].includes(row.status)
      && boundedText(row.stdout)
      && (row.status !== 'error' || typeof row.error === 'string')
      && (row.error === undefined || boundedText(row.error))
      && (row.durationMs === undefined || (Number.isFinite(row.durationMs) && row.durationMs >= 0)))
}

/** LeetCode-style headline for a Run: any error, then any mismatch, decides it. */
export function runVerdict(results: TestResult[]): { label: string; tone: 'good' | 'bad' | 'neutral' } {
  if (results.some(row => row.status === 'error')) return { label: 'Runtime Error', tone: 'bad' }
  if (results.some(row => row.status === 'different')) return { label: 'Wrong Answer', tone: 'bad' }
  if (results.some(row => row.status === 'passed')) return { label: 'Accepted', tone: 'good' }
  return { label: 'Finished', tone: 'neutral' }
}

export const formatDuration = (ms = 0) => ms < 1 ? `${ms.toFixed(2)} ms` : ms < 100 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`
