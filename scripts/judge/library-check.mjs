// Checks every NeetCode problem in a LeetJournal library the way the offline editor loads it.
//   node --experimental-strip-types scripts/judge/library-check.mjs <library.json> <payload dir>
// library.json: sqlite3 -json export of {id, url, code, tests, snapshot} rows (read-only).
// payload dir: output of `python3 scripts/judge/selfcheck.py --emit DIR` (known-correct solutions).
import { readFile } from 'node:fs/promises'
import fs from 'node:fs'
import { loadPyodide } from 'pyodide'
import { caseDraft, initialTests, writeCaseDrafts, compileCaseDrafts, readCaseDrafts } from '../../src/offline/cases.ts'
import { parseMetadata, parseTests } from '../../src/offline/tests.ts'
import { judgeSlug, validPack, validSubmission } from '../../src/offline/judge.ts'
import { validResults } from '../../src/offline/results.ts'

const [libraryPath, payloadDir] = process.argv.slice(2)
const root = new URL('../../', import.meta.url).pathname
const rows = JSON.parse(await readFile(libraryPath, 'utf8'))
const python = await loadPyodide({ indexURL: root + 'node_modules/pyodide/' })
const judgeDir = root + 'scripts/judge'
python.FS.mkdirTree(judgeDir)
for (const f of fs.readdirSync(judgeDir)) if (/\.(py|json|txt)$/.test(f)) python.FS.writeFile(`${judgeDir}/${f}`, fs.readFileSync(`${judgeDir}/${f}`))
const harness = await readFile(root + 'public/offline-harness.py', 'utf8')
const execute = async payload => {
  python.globals.set('_offline_payload', JSON.stringify(payload))
  await python.runPythonAsync(harness)
  return JSON.parse(python.globals.get('_offline_result'))
}

let failures = 0
for (const row of rows) {
  const problems = []
  const slug = judgeSlug(row.url)
  const pack = JSON.parse(await readFile(`${root}public/offline-judge/${slug}.json`, 'utf8'))
  if (!validPack(pack, slug)) problems.push('invalid judge pack')
  const snapshot = row.snapshot ? JSON.parse(row.snapshot) : null
  if (!snapshot?.content?.trim()) problems.push('no saved statement')
  const metadata = parseMetadata(JSON.stringify(pack.metadata))
  if (!metadata) problems.push('judge metadata does not parse')
  // 1. Starter code defines what the judge calls.
  const starter = snapshot?.codeSnippets?.find(c => c.langSlug === 'python3')?.code ?? ''
  const entry = pack.mode === 'design' ? `class ${pack.metadata.name}` : pack.mode === 'codec' ? 'class Codec'
    : pack.mode === 'encode-decode' ? 'def encode' : `def ${pack.metadata.name}`
  if (!starter.includes(entry)) problems.push(`starter lacks "${entry}"`)
  if (pack.mode === 'encode-decode' && !starter.includes('def decode')) problems.push('starter lacks "def decode"')
  // 2. The cases the editor shows: saved tests, or the judge's examples.
  const examples = writeCaseDrafts(pack.examples.map(caseDraft))
  const shown = initialTests(row.tests ?? '', examples)
  const source = shown === examples ? 'examples' : 'saved'
  let cases = []
  try { cases = parseTests(shown, metadata.params.length) } catch (e) { problems.push(`${source} cases do not parse: ${e.message}`) }
  if (!cases.length && !problems.length) problems.push('no cases')
  const correct = JSON.parse(await readFile(`${payloadDir}/${slug}.json`, 'utf8')).code
  const judge = { mode: pack.mode, checker: pack.checker }
  // 3. Run on those cases with a correct solution.
  if (cases.length) {
    const results = await execute({ code: correct, tests: cases, metadata: pack.metadata, judge })
    if (!validResults(results, cases.length)) problems.push('Run returned invalid results')
    else {
      const bad = results.filter(r => r.status === 'error' || r.status === 'different')
      if (bad.length) problems.push(`Run: ${bad.map(r => `case ${r.index + 1} ${r.status}${r.error ? ` ${r.error.split('\n').at(-1)}` : ` got ${JSON.stringify(r.actual).slice(0, 80)} want ${JSON.stringify(r.expected).slice(0, 80)}`}`).join('; ')}`)
    }
  }
  // Starter itself must at least be reported as a readable error, not crash the harness.
  const starterRun = await execute({ code: starter, tests: cases.slice(0, 1).length ? cases.slice(0, 1) : pack.examples.slice(0, 1), metadata: pack.metadata, judge })
  if (!validResults(starterRun, 1)) problems.push('starter run returned invalid results')
  // 4. Submit with a correct solution.
  const submitted = await execute({ code: correct, tests: pack.tests, metadata: pack.metadata, judge, submit: true })
  if (!validSubmission(submitted, pack.tests.length) || submitted.verdict !== 'accepted') problems.push(`Submit: ${submitted.verdict} ${submitted.passed}/${submitted.total} ${(submitted.error ?? '').split('\n').at(-1)}`)
  failures += problems.length > 0
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${slug.padEnd(56)} ${String(cases.length).padStart(2)} ${source.padEnd(8)} ${pack.tests.length} hidden${problems.length ? '\n     - ' + problems.join('\n     - ') : ''}`)
}
console.log(`\n${rows.length - failures}/${rows.length} problems pass`)
process.exit(failures ? 1 : 0)
