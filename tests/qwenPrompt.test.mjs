import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildContextualPrompt, parseQwenCommand } from '../src/utils/qwen.ts'

const problem = { title: 'Two Sum', category: 'Arrays', difficulty: 'Easy', leetcodeUrl: 'https://leetcode.com/problems/two-sum/' }

test('general Qwen gets only the current question', () => {
  assert.deepEqual(parseQwenCommand('Private note\nQwen: previous response\n@qwen What is a heap?'), {
    question: 'What is a heap?', includeContext: false,
  })
})

test('contextual prompt includes code without replaying notebook history or metadata', () => {
  const command = parseQwenCommand('Old notes\nQwen: old answer\n@big-qwen Why does this fail?')
  const prompt = buildContextualPrompt(command, problem, '  return []\n')
  assert.equal(prompt, 'Be concise. Give hints, not a full solution, unless asked.\n\nProblem: Two Sum\n\nCode:\nreturn []\n\nQuestion: Why does this fail?')
  assert.equal(command.includeContext, true)
})

test('large code is bounded and truncation is explicit without dropping the question', () => {
  const command = parseQwenCommand('@big-qwen Explain the complexity')
  const prompt = buildContextualPrompt(command, problem, 'x'.repeat(30_000))
  assert.ok(prompt.includes('x'.repeat(24_000) + '\n[Code truncated]'))
  assert.ok(prompt.endsWith('Question: Explain the complexity'))
  assert.ok(prompt.length < 25_000)
})
