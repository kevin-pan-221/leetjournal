/** Splits a wrong output into highlighted pieces showing where it departs from the expected value. */
export interface DiffPart { text: string; changed: boolean }
export interface OutputDiff { parts: DiffPart[]; note: string }

const TOLERANCE = 1e-5 // the judge accepts floats within this distance

/** Harness previews stop at 4 KB and come back as a string ending in "…". */
export const isPreview = (value: unknown) => typeof value === 'string' && value.length > 4000 && value.endsWith('…')
export const formatValue = (value: unknown) => isPreview(value) ? value as string : JSON.stringify(value) ?? 'null'

export function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b || Math.abs(a - b) <= TOLERANCE
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => sameValue(item, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every(key => sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
  }
  return a === b
}

/**
 * ordered: false when the problem accepts any order (or the case ignores order); position-by-position
 * highlights would then be misleading, so the whole output is marked instead.
 */
export function diffOutput(actual: unknown, expected: unknown, ordered: boolean): OutputDiff {
  const text = formatValue(actual)
  const whole = { parts: [{ text, changed: true }], note: '' }
  if (!ordered || isPreview(actual) || isPreview(expected)) return whole
  if (Array.isArray(actual) && Array.isArray(expected)) {
    const parts: DiffPart[] = [{ text: '[', changed: false }]
    let first = -1
    actual.forEach((item, i) => {
      const changed = i >= expected.length || !sameValue(item, expected[i])
      if (changed && first < 0) first = i
      if (i) parts.push({ text: ',', changed: false })
      parts.push({ text: JSON.stringify(item) ?? 'null', changed })
    })
    // Too short: the missing tail is the difference, marked on the closing bracket.
    const short = actual.length < expected.length
    if (short && first < 0) first = actual.length
    parts.push({ text: ']', changed: short })
    const length = actual.length === expected.length ? '' : ` · ${actual.length} item${actual.length === 1 ? '' : 's'}, expected ${expected.length}`
    return { parts: merge(parts), note: first < 0 ? '' : `First difference at index ${first}${length}` }
  }
  if (typeof actual === 'string' && typeof expected === 'string') {
    let i = 0
    while (i < actual.length && i < expected.length && actual[i] === expected[i]) i++
    const head = JSON.stringify(actual.slice(0, i)).slice(0, -1)
    const tail = JSON.stringify(actual.slice(i)).slice(1)
    const changedTail = tail.slice(0, -1)
    const parts = [{ text: head, changed: false }, { text: changedTail, changed: true }, { text: '"', changed: i < expected.length && i === actual.length }]
    return { parts: merge(parts.filter(p => p.text)), note: `First difference at character ${i}` }
  }
  return whole
}

function merge(parts: DiffPart[]) {
  const out: DiffPart[] = []
  for (const part of parts) {
    const last = out.at(-1)
    if (last && last.changed === part.changed) last.text += part.text
    else out.push({ ...part })
  }
  return out
}
