import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ProblemWorkspace } from '../src/offline/ProblemWorkspace'
import { api } from '../src/api'
import '../src/styles.css'
import '../src/workspace.css'

// Run ONLY with com.leetjournal.offline-qa (separate database). Drives the real offline UI in the
// native WebKit view: real Rust IPC, real Pyodide worker. The log is saved as the "tests" draft of
// invert-binary-tree in the QA database so it can be read without screen access.
const correctAlien = "class Solution:\n    def alienOrder(self, words: List[str]) -> str:\n        adj = {c: set() for w in words for c in w}\n        for a, b in zip(words, words[1:]):\n            for x, y in zip(a, b):\n                if x != y:\n                    adj[x].add(y)\n                    break\n            else:\n                if len(a) > len(b):\n                    return ''\n        state, out = {}, []\n        def dfs(c):\n            if c in state:\n                return state[c]\n            state[c] = True\n            for d in sorted(adj[c], reverse=True):\n                if dfs(d):\n                    return True\n            state[c] = False\n            out.append(c)\n        for c in sorted(adj, reverse=True):\n            if dfs(c):\n                return ''\n        return ''.join(reversed(out))\n"
const lru = "class LRUCache:\n    def __init__(self, capacity: int):\n        self.cap = capacity\n        self.d = OrderedDict()\n    def get(self, key: int) -> int:\n        if key not in self.d:\n            return -1\n        self.d.move_to_end(key)\n        return self.d[key]\n    def put(self, key: int, value: int) -> None:\n        self.d[key] = value\n        self.d.move_to_end(key)\n        if len(self.d) > self.cap:\n            self.d.popitem(last=False)\n"
// warm: wait for the background worker first (the timing should then be well under a second).
const steps: { slug: string; code: string; expect: string; warm?: boolean }[] = [
  { slug: 'alien-dictionary', code: correctAlien, expect: 'Accepted' },
  { slug: 'two-sum', warm: true, expect: 'Time Limit Exceeded', code: "class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        for i in range(len(nums)):\n            for j in range(i + 1, len(nums)):\n                if nums[i] + nums[j] == target:\n                    return [i, j]\n" },
  { slug: 'two-sum', warm: true, expect: 'Accepted', code: "class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        seen = {}\n        for i, v in enumerate(nums):\n            if target - v in seen:\n                return [seen[target - v], i]\n            seen[v] = i\n" },
  { slug: 'lru-cache', warm: true, expect: 'Wrong Answer', code: lru.replace('        self.d.move_to_end(key)\n        return self.d[key]', '        return self.d[key]') },
  { slug: 'lru-cache', warm: true, expect: 'Accepted', code: lru },
  { slug: 'reverse-linked-list', warm: true, expect: 'Accepted', code: "class Solution:\n    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:\n        if not head or not head.next:\n            return head\n        new = self.reverseList(head.next)\n        head.next.next = head\n        head.next = None\n        return new\n" },
  { slug: 'serialize-and-deserialize-binary-tree', warm: true, expect: 'Accepted', code: "class Codec:\n    def serialize(self, root):\n        out = []\n        def go(n):\n            if not n:\n                out.append('#'); return\n            out.append(str(n.val)); go(n.left); go(n.right)\n        go(root)\n        return ','.join(out)\n    def deserialize(self, data):\n        vals = iter(data.split(','))\n        def go():\n            v = next(vals)\n            if v == '#': return None\n            n = TreeNode(int(v)); n.left = go(); n.right = go(); return n\n        return go()\n" },
]
const log: string[] = []
let started = false
window.addEventListener('error', e => note(`window error: ${e.message}`))
window.addEventListener('unhandledrejection', e => note(`unhandled rejection: ${String(e.reason)}`))
const only: string | null = null // StrictMode runs effects twice in development
const note = (line: string) => { log.push(`${new Date().toISOString().slice(11, 19)} ${line}`); void api.saveOfflineDraft('invert-binary-tree', 'autotest', log.join('\n')).catch(() => {}) }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
async function waitFor<T>(find: () => T | null | undefined, ms: number): Promise<T | null> {
  const end = Date.now() + ms
  while (Date.now() < end) { const value = find(); if (value) return value; await sleep(200) }
  return null
}
const button = (selector: string, text: string) => [...document.querySelectorAll<HTMLButtonElement>(selector)].find(b => b.textContent?.trim().startsWith(text) && !b.disabled)

function Fixture() {
  const [run, setRun] = useState(-1)
  const step = steps[run]
  useEffect(() => {
    if (started) return
    started = true
    void (async () => {
      Object.keys(localStorage).filter(k => k.startsWith('leetjournal.offline.draft')).forEach(k => localStorage.removeItem(k))
      note(`autotest start · ${navigator.userAgent}`)
      const order = only ? only.split(',').map(Number) : steps.map((_, i) => i)
      for (const i of order) {
        const s = steps[i]
        try {
          if (!await api.offlineProblem(s.slug)) await api.downloadOfflineProblem(s.slug)
          await api.saveOfflineDraft(s.slug, s.code, '')
        } catch (e) { note(`${s.slug}: setup failed ${String(e)}`); continue }
        setRun(-1); await sleep(300); setRun(i)
        // Give the background Python worker time to warm, as a person reading the problem would.
        await sleep(s.warm ? 4000 : 0)
        const submit = await waitFor(() => button('.offline-workbench-actions button', 'Submit'), 20000)
        if (!submit) { note(`${s.slug}: FAIL no Submit button (${document.querySelector('.offline-view')?.textContent?.slice(0, 200)})`); continue }
        const started = Date.now()
        submit.click()
        const verdict = await waitFor(() => {
          const tab = [...document.querySelectorAll('.offline-description>header>button')].map(b => b.textContent ?? '').find(t => /Accepted|Wrong Answer|Runtime Error|Time Limit|Compile Error|Result/.test(t))
          const failed = document.querySelector('.offline-submission h3')?.textContent
          return failed === 'Submission failed' ? `Submission failed: ${document.querySelector('.offline-submission pre')?.textContent}` : tab
        }, 60000)
        const detail = document.querySelector('.offline-submission>header span')?.textContent
        if (!verdict) note(`${s.slug}: trace ${((window as { __judgeTrace?: string[] }).__judgeTrace ?? []).slice(-12).join(' | ')} now=${Math.round(performance.now())}`)
        ;(window as { __judgeTrace?: string[] }).__judgeTrace = []
        if (!verdict) note(`${s.slug}: panel = ${document.querySelector('.offline-description')?.textContent?.slice(0, 300)} | notice = ${document.querySelector('.offline-workbench-notice')?.textContent}`)
        note(`${s.slug}: ${verdict === s.expect ? 'PASS' : 'FAIL'} got ${verdict} (${detail}) expected ${s.expect} in ${Date.now() - started}ms`)
        await sleep(1500) // let the submission history write land
      }
      const bundled = await api.offlineProblem('meeting-rooms').catch(() => null)
      note(`bundled meeting-rooms stored: ${Boolean(bundled)}`)
      if (!bundled) { await api.downloadOfflineProblem('meeting-rooms').then(() => note('meeting-rooms saved offline without LeetCode'), e => note(`meeting-rooms FAIL ${String(e)}`)) }
      note('autotest done')
    })()
  }, [])
  return <div className="focus-workspace" style={{ padding: 12, height: '100vh', display: 'flex', flexDirection: 'column', gap: 8 }}>
    <b style={{ fontSize: 12 }}>Offline judge autotest · {step ? `${run + 1}/${steps.length} ${step.slug}` : 'preparing'}</b>
    {step && <ProblemWorkspace key={`${run}`} problem={{ id: step.slug, title: step.slug, category: 'QA', difficulty: 'Medium', leetcodeUrl: `https://leetcode.com/problems/${step.slug}/`, orderIndex: 0 } as never} hidden={false} onCode={() => {}} onReadyLabel={() => {}} offline onOfflineChange={() => {}} />}
  </div>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture /></React.StrictMode>)
