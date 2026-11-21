import type { LocalTest } from './types.ts'
export interface CaseDraft { args: string[]; expected: string; unordered: boolean; observe?: number }
export function duplicateCaseDraft(cases: CaseDraft[], index: number): CaseDraft[] {
  if (cases.length >= 20 || !cases[index]) return cases
  const copy = { ...cases[index], args: [...cases[index].args] }
  return [...cases.slice(0, index + 1), copy, ...cases.slice(index + 1)]
}
export function caseDraft(value: LocalTest): CaseDraft {
  return { args: value.args.map(v => JSON.stringify(v)), expected: 'expected' in value ? JSON.stringify(value.expected) : '', unordered: Boolean(value.unordered), observe: value.observe }
}
export function readCaseDrafts(raw: string): CaseDraft[] | null {
  try {
    const value = JSON.parse(raw)
    if (Array.isArray(value) && value.length <= 20 && value.every(c => c && Array.isArray(c.args))) return value.map(caseDraft)
    if (value?.version === 1 && Array.isArray(value.cases) && value.cases.length <= 20
      && value.cases.every((c: CaseDraft) => c && Array.isArray(c.args) && c.args.every(v => typeof v === 'string') && typeof c.expected === 'string' && typeof c.unordered === 'boolean')) return value.cases
  } catch { /* Preserve malformed legacy JSON for manual repair. */ }
  return null
}
export const writeCaseDrafts = (cases: CaseDraft[]) => JSON.stringify({ version: 1, cases })
export function compileCaseDrafts(cases: CaseDraft[]): LocalTest[] {
  const parse = (text: string, location: string) => {
    try { return JSON.parse(text) } catch { throw new Error(`${location}: enter a JSON value (strings need double quotes).`) }
  }
  return cases.map((c, index) => {
    const prefix = `Case ${index + 1}`
    const value: LocalTest = { args: c.args.map((s, i) => parse(s, `${prefix}, argument ${i + 1}`)), unordered: c.unordered, observe: c.observe }
    if (c.expected.trim()) value.expected = parse(c.expected, `${prefix}, expected output`)
    return value
  })
}
