import type { LocalTest, MethodMetadata } from './types.ts'
import { readCaseDrafts, compileCaseDrafts } from './cases.ts'

function normalizeType(type: unknown, depth = 0): string | null {
  if (typeof type !== 'string' || depth > 8) return null
  if (/^(integer|long|double|float|boolean|bool|character|char|string|ListNode|TreeNode|json)$/.test(type)) return type
  const inner = type.endsWith('[]') ? type.slice(0, -2)
    : type.startsWith('list<') && type.endsWith('>') ? type.slice(5, -1) : null
  const normalized = inner === null ? null : normalizeType(inner, depth + 1)
  return normalized ? `${normalized}[]` : null
}

export function parseMetadata(raw: string): MethodMetadata | null {
  try {
    const value = JSON.parse(raw)
    // Manual judges can advertise ordinary types while constructing cycles,
    // graphs or object identities that do not match the Solution signature.
    if (!value.systemdesign && !value.manual && typeof value.name === 'string' && /^[A-Za-z_]\w*$/.test(value.name)
      && Array.isArray(value.params) && value.params.length <= 32
      && value.params.every((p: { name?: string; type?: string }) => typeof p?.name === 'string' && /^[A-Za-z_]\w*$/.test(p.name) && normalizeType(p.type))
      && (normalizeType(value.return?.type) || value.return?.type === 'void')) return {
        ...value,
        params: value.params.map((p: { name: string; type: string }) => ({ ...p, type: normalizeType(p.type)! })),
        return: { ...value.return, type: value.return.type === 'void' ? 'void' : normalizeType(value.return.type)! },
      }
  } catch { /* Missing metadata is a readable unsupported state, never guessed. */ }
  return null
}

export function parseTests(raw: string, arity: number): LocalTest[] {
  if (raw.length > 200_000) throw new Error('Keep tests below 200 KB.')
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error('Tests must be valid JSON: [{"args": [[2,7,11,15], 9], "expected": [0,1]}]') }
  if (!Array.isArray(value)) {
    const drafts = readCaseDrafts(raw)
    if (drafts) value = compileCaseDrafts(drafts)
  }
  if (!Array.isArray(value) || !value.length || value.length > 20) throw new Error('Provide between 1 and 20 test cases.')
  if (!value.every(t => t && Array.isArray(t.args) && t.args.length === arity && (t.unordered === undefined || typeof t.unordered === 'boolean')
    && (t.observe === undefined || (Number.isInteger(t.observe) && t.observe >= 0 && t.observe < arity)))) {
    throw new Error(`Each test needs an "args" array with ${arity} argument${arity === 1 ? '' : 's'}.`)
  }
  const validateJson = (item: unknown, depth = 0): void => {
    if (depth > 40) throw new Error('Test input nesting is limited to 40 levels.')
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Tests cannot contain infinite numbers.')
    if (item && typeof item === 'object') for (const child of Object.values(item)) validateJson(child, depth + 1)
  }
  validateJson(value)
  return value
}

export function examplesFromText(inputs: string, statement: string, arity: number): LocalTest[] {
  if (!arity) return []
  const lines = inputs.trim().split(/\r?\n/).filter(line => line.trim())
  if (lines.length % arity) return []
  const outputs = statement.split(/Output:\s*/).slice(1).map(section => section.split(/Explanation:|Example\s+\d|Constraints:/)[0].trim())
  const tests: LocalTest[] = []
  try {
    for (let i = 0; i < lines.length && tests.length < 20; i += arity) {
      const test: LocalTest = { args: lines.slice(i, i + arity).map(line => JSON.parse(line)) }
      // Never infer an answer when the visible output isn't a JSON value.
      const outputLines = (outputs[tests.length] ?? '').split('\n').slice(0, 100)
      for (let count = 1; count <= outputLines.length; count++) {
        try { test.expected = JSON.parse(outputLines.slice(0, count).join('\n')); break } catch { /* Output-only when no complete JSON value is visible. */ }
      }
      tests.push(test)
    }
  } catch { return [] }
  return tests
}
