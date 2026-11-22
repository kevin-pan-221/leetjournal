import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffOutput, sameValue } from '../src/offline/diff.ts'
import { runVerdict } from '../src/offline/results.ts'
import { pickSessionSubmission } from '../src/offline/judge.ts'

const changed = diff => diff.parts.filter(p => p.changed).map(p => p.text)

test('array diff highlights the differing positions and names the first', () => {
  const diff = diffOutput([1, 2, 3, 4], [1, 2, 5, 6], true)
  assert.equal(diff.parts.map(p => p.text).join(''), '[1,2,3,4]')
  assert.deepEqual(changed(diff), ['3', '4'])
  assert.equal(diff.note, 'First difference at index 2')
})

test('array diff reports a missing tail and extra items', () => {
  const short = diffOutput([1, 2], [1, 2, 3], true)
  assert.deepEqual(changed(short), [']'])
  assert.match(short.note, /index 2 · 2 items, expected 3/)
  const long = diffOutput([1, 2, 9], [1, 2], true)
  assert.deepEqual(changed(long), ['9'])
})

test('nested rows and floats compare like the judge', () => {
  const diff = diffOutput([[1, 2], [3, 4]], [[1, 2], [3, 5]], true)
  assert.deepEqual(changed(diff), ['[3,4]'])
  assert.ok(sameValue([0.30000000000000004], [0.3]))
})

test('string diff marks from the first different character', () => {
  const diff = diffOutput('abcx"y', 'abcd', true)
  assert.equal(diff.parts.map(p => p.text).join(''), JSON.stringify('abcx"y'))
  assert.deepEqual(changed(diff), ['x\\"y'])
  assert.equal(diff.note, 'First difference at character 3')
})

test('unordered problems and previews mark the whole output', () => {
  assert.deepEqual(changed(diffOutput([2, 1, 3], [1, 2, 4], false)), ['[2,1,3]'])
  const preview = 'x'.repeat(4001) + '…'
  assert.deepEqual(changed(diffOutput(preview, [1], true)), [preview])
  assert.equal(diffOutput(7, 8, true).note, '')
})

test('run verdict follows LeetCode precedence', () => {
  const row = status => ({ index: 0, status, stdout: '' })
  assert.equal(runVerdict([row('passed'), row('error'), row('different')]).label, 'Runtime Error')
  assert.equal(runVerdict([row('passed'), row('different')]).label, 'Wrong Answer')
  assert.equal(runVerdict([row('passed'), row('output')]).label, 'Accepted')
  assert.equal(runVerdict([row('output')]).label, 'Finished')
})

test('session submission prefers an Accepted made during the session', () => {
  const at = (verdict, submittedAt) => ({ verdict, submittedAt })
  const rows = [at('wrong-answer', '2026-11-22T10:30:00Z'), at('accepted', '2026-11-22T10:20:00Z'), at('accepted', '2026-11-21T09:00:00Z')]
  assert.equal(pickSessionSubmission(rows, '2026-11-22T10:00:00Z'), rows[1])
  assert.equal(pickSessionSubmission(rows.slice(0, 1), '2026-11-22T10:00:00Z'), rows[0])
  assert.equal(pickSessionSubmission(rows.slice(2), '2026-11-22T10:00:00Z'), null)
})
