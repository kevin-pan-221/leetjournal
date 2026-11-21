import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { OfflineEditor } from '../src/offline/OfflineEditor'
import { api } from '../src/api'
import '../src/styles.css'
import '../src/workspace.css'
import '../src/offline/offline.css'
import { readSavedProblem } from '../src/offline/drafts'
import { loadJudgePack } from '../src/offline/judge'
import type { JudgePack, OfflineProblem, OfflineSubmission } from '../src/offline/types'

// Isolated fixture: never touches a user's database, sessions or progress.
// Open /tests/offline-preview.html?slug=lru-cache to preview any judged problem.
const slug = new URLSearchParams(location.search).get('slug') || 'two-sum'
const key = (name: string) => `offline-preview.${slug}.${name}`
let failSaves = false
api.saveOfflineDraft = async (_id, code, tests) => { if (failSaves) throw new Error('Simulated disk error'); localStorage.setItem(key('draft'), JSON.stringify({ code, tests })) }
const history = (): OfflineSubmission[] => JSON.parse(localStorage.getItem(key('submissions')) || '[]')
api.offlineSubmissions = async () => history()
api.recordOfflineSubmission = async (_id, submission) => {
  const row = { ...submission, id: Date.now(), submittedAt: new Date().toISOString() }
  localStorage.setItem(key('submissions'), JSON.stringify([row, ...history()].slice(0, 50)))
  return row
}

function starter(pack: JudgePack) {
  const m = pack.metadata
  if (pack.mode === 'design') return `class ${m.name}:\n\n    def __init__(self):\n        pass\n`
  if (pack.mode === 'codec') return 'class Codec:\n\n    def serialize(self, root):\n        pass\n\n    def deserialize(self, data):\n        pass\n'
  return `class Solution:\n    def ${m.name}(self, ${m.params.map(p => p.name).join(', ')}):\n        pass\n`
}

function snapshot(pack: JudgePack | null): OfflineProblem['snapshot'] {
  const bundled = (pack as unknown as { bundled?: OfflineProblem['snapshot'] } | null)?.bundled
  if (bundled) return bundled
  return { title: slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '), content: '<p>Preview statement. The real app shows the saved LeetCode statement here.</p>',
    exampleTestcases: '', metaData: JSON.stringify(pack?.metadata ?? {}), codeSnippets: pack ? [{ langSlug: 'python3', code: starter(pack) }] : [] }
}

const ignore = () => {}
function Fixture() {
  const [active, setActive] = useState(true)
  const [pack, setPack] = useState<JudgePack | null | undefined>(undefined)
  const [value, setValue] = useState<OfflineProblem | null>(null)
  const [failure, setFailure] = useState(false)
  useEffect(() => { void loadJudgePack(slug).then(setPack) }, [])
  useEffect(() => {
    if (pack === undefined) return
    const snap = snapshot(pack)
    const code = snap.codeSnippets.find(c => c.langSlug === 'python3')?.code ?? ''
    api.offlineProblem = async () => ({ problemId: slug, savedAt: new Date().toISOString(), code, tests: '', snapshot: snap, ...JSON.parse(localStorage.getItem(key('draft')) || '{}') })
    let alive = true
    if (active) void readSavedProblem(slug).then(v => { if (alive) setValue(v) }); else setValue(null)
    return () => { alive = false }
  }, [active, pack])
  return <div className="focus-workspace problem-workspace" style={{ padding: 20, height: '100vh', display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box' }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12 }}><b>Offline · {slug}</b>
      <button onClick={() => setActive(!active)}>{active ? 'Leave editor' : 'Reopen editor'}</button>
      <label><input type="checkbox" checked={failure} onChange={e => { setFailure(e.target.checked); failSaves = e.target.checked }} />Simulate save failure</label>
      <button onClick={() => { localStorage.removeItem(key('draft')); localStorage.removeItem(key('submissions')); location.reload() }}>Reset fixture</button></div>
    {active && value && pack !== undefined && <OfflineEditor saved={value} pack={pack} onCode={ignore} hidden={false} />}
  </div>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture /></React.StrictMode>)
