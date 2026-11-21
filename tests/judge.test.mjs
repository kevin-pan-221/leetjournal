import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'
import { loadPyodide } from 'pyodide'
import { judgeSlug, validPack, validSubmission } from '../src/offline/judge.ts'
import { parseMetadata } from '../src/offline/tests.ts'

const pack = slug => readFile(new URL(`../public/offline-judge/${slug}.json`, import.meta.url), 'utf8').then(JSON.parse)

test('judge pack covers NeetCode 150 with valid, parseable packs', async () => {
  const expected = (await readFile(new URL('../scripts/judge/neetcode150.txt', import.meta.url), 'utf8')).split('\n').filter(Boolean)
  const index = JSON.parse(await readFile(new URL('../public/offline-judge/index.json', import.meta.url), 'utf8'))
  assert.equal(expected.length, 150)
  assert.deepEqual(Object.keys(index.problems).sort(), [...expected].sort())
  const files = (await readdir(new URL('../public/offline-judge/', import.meta.url))).filter(f => f !== 'index.json')
  assert.equal(files.length, 150)
  let bundled = 0
  for (const slug of expected) {
    const value = await pack(slug)
    assert.ok(validPack(value, slug), slug)
    assert.ok(parseMetadata(JSON.stringify(value.metadata)), `${slug} metadata`)
    assert.equal(index.problems[slug].tests, value.tests.length)
    assert.ok(value.tests.length >= 8, `${slug} has too few hidden tests`)
    assert.ok(value.examples.length >= 1 && value.examples.every(e => 'expected' in e), `${slug} examples`)
    if (value.bundled) { bundled++; assert.match(value.bundled.content, /Example 1/) }
  }
  assert.equal(bundled, 7)
})

test('judge slugs come only from canonical LeetCode problem URLs', () => {
  assert.equal(judgeSlug('https://leetcode.com/problems/two-sum/'), 'two-sum')
  assert.equal(judgeSlug('https://www.leetcode.com/problems/3sum/description/'), '3sum')
  assert.equal(judgeSlug('https://leetcode.com.evil.test/problems/two-sum/'), null)
  assert.equal(judgeSlug('http://leetcode.com/problems/two-sum/'), null)
  assert.equal(judgeSlug('https://leetcode.com/problems/../'), null)
})

test('submission results must be internally consistent', () => {
  assert.ok(validSubmission({ verdict: 'accepted', passed: 3, total: 3, runtimeMs: 1 }, 3))
  assert.ok(!validSubmission({ verdict: 'accepted', passed: 2, total: 3, runtimeMs: 1 }, 3))
  assert.ok(!validSubmission({ verdict: 'wrong-answer', passed: 3, total: 3, runtimeMs: 1 }, 3))
  assert.ok(!validSubmission({ verdict: 'accepted', passed: 4, total: 4, runtimeMs: 1 }, 3))
  assert.ok(!validSubmission({ verdict: 'hacked', passed: 3, total: 3, runtimeMs: 1 }, 3))
  assert.ok(validSubmission({ verdict: 'wrong-answer', passed: 1, total: 3, runtimeMs: 1, failure: { index: 1, args: [], stdout: '' } }, 3))
})

test('submit judges hidden tests in order with LeetCode verdicts, modes and checkers', async () => {
  const python = await loadPyodide({ indexURL: new URL('../node_modules/pyodide/', import.meta.url).pathname })
  const harness = await readFile(new URL('../public/offline-harness.py', import.meta.url), 'utf8')
  const submit = async (slug, code) => {
    const p = await pack(slug)
    python.globals.set('_offline_payload', JSON.stringify({ code, tests: p.tests, metadata: p.metadata, judge: { mode: p.mode, checker: p.checker }, submit: true }))
    await python.runPythonAsync(harness)
    const result = JSON.parse(python.globals.get('_offline_result'))
    assert.ok(validSubmission(result, p.tests.length), JSON.stringify(result).slice(0, 300))
    return result
  }
  const twoSum = 'class Solution:\n    def twoSum(self, nums, target):\n        seen = {}\n        for i, v in enumerate(nums):\n            if target - v in seen:\n                return [i, seen[target - v]]\n            seen[v] = i\n'
  assert.equal((await submit('two-sum', twoSum)).verdict, 'accepted') // any order is accepted
  const wrong = await submit('two-sum', 'class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n')
  assert.equal(wrong.verdict, 'wrong-answer'); assert.ok(wrong.passed < wrong.total)
  assert.deepEqual(Object.keys(wrong.failure).sort(), ['actual', 'args', 'expected', 'index', 'stdout'])
  assert.equal(wrong.failure.index, wrong.passed)
  const crash = await submit('two-sum', 'class Solution:\n    def twoSum(self, nums, target):\n        return nums[99999]\n')
  assert.equal(crash.verdict, 'runtime-error'); assert.match(crash.error, /IndexError/)
  assert.equal((await submit('two-sum', 'class Solution:\n    def twoSum(self\n')).verdict, 'compile-error')
  const deep = await submit('climbing-stairs', 'class Solution:\n    def climbStairs(self, n):\n        return self.climbStairs(n)\n')
  assert.equal(deep.verdict, 'runtime-error'); assert.match(deep.error, /RecursionError/); assert.match(deep.error, /1000 nested calls/)

  const minStack = 'class MinStack:\n    def __init__(self):\n        self.s = []\n    def push(self, v):\n        self.s.append((v, min(v, self.s[-1][1]) if self.s else v))\n    def pop(self):\n        self.s.pop()\n    def top(self):\n        return self.s[-1][0]\n    def getMin(self):\n        return self.s[-1][1]\n'
  assert.equal((await submit('min-stack', minStack)).verdict, 'accepted')
  assert.equal((await submit('min-stack', minStack.replace('min(v, self.s[-1][1])', 'v'))).verdict, 'wrong-answer')

  const cycle = 'class Solution:\n    def hasCycle(self, head):\n        slow = fast = head\n        while fast and fast.next:\n            slow, fast = slow.next, fast.next.next\n            if slow is fast:\n                return True\n        return False\n'
  assert.equal((await submit('linked-list-cycle', cycle)).verdict, 'accepted')
  const shallow = 'class Solution:\n    def cloneGraph(self, node):\n        return node\n'
  const reused = await submit('clone-graph', shallow)
  assert.equal(reused.verdict, 'runtime-error'); assert.match(reused.error, /deep copy/)

  const order = 'class Solution:\n    def findOrder(self, n, pre):\n        indeg = [0] * n\n        adj = defaultdict(list)\n        for a, b in pre:\n            adj[b].append(a); indeg[a] += 1\n        stack = [i for i in range(n) if not indeg[i]]\n        out = []\n        while stack:\n            v = stack.pop(); out.append(v)\n            for w in adj[v]:\n                indeg[w] -= 1\n                if not indeg[w]: stack.append(w)\n        return out if len(out) == n else []\n'
  assert.equal((await submit('course-schedule-ii', order)).verdict, 'accepted') // a different valid topological order
  const subsets = 'class Solution:\n    def subsets(self, nums):\n        out = [[]]\n        for v in reversed(nums):\n            out += [[v] + s for s in out]\n        return out[::-1]\n'
  assert.equal((await submit('subsets', subsets)).verdict, 'accepted') // order-insensitive at both levels
  const brute = 'class Solution:\n    def countSubstrings(self, s):\n        return sum(1 for i in range(len(s)) for j in range(i + 1, len(s) + 1) if s[i:j] == s[i:j][::-1])\n'
  const slow = await submit('palindromic-substrings', brute)
  assert.equal(slow.verdict, 'accepted'); assert.ok(slow.runtimeMs > 50) // large inputs make brute force measurably slower
})
