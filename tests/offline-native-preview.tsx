import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ProblemWorkspace } from '../src/offline/ProblemWorkspace'
import { api } from '../src/api'
import '../src/styles.css'
import '../src/workspace.css'

// Run ONLY with com.leetjournal.offline-qa: real cache/IPC in a separate database.
// ?slug=alien-dictionary opens another NeetCode problem (its id must exist in the QA database).
const slug = new URLSearchParams(location.search).get('slug') || 'invert-binary-tree'
const problem = {id:slug,title:slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),category:'QA',difficulty:'Medium',leetcodeUrl:`https://leetcode.com/problems/${slug}/`,orderIndex:0}
const qaProblems = ['invert-binary-tree','alien-dictionary','lru-cache','two-sum']
const ignore = () => {}
let cacheReads = 0
const readOffline = api.offlineProblem
api.offlineProblem = async id => {
  cacheReads++
  window.dispatchEvent(new Event('qa-cache-read'))
  return readOffline(id)
}
function Fixture() {
  const [reads, setReads] = useState(cacheReads)
  const [label, setLabel] = useState('')
  useEffect(() => {
    const changed = () => setReads(cacheReads)
    window.addEventListener('qa-cache-read', changed)
    return () => window.removeEventListener('qa-cache-read', changed)
  }, [])
  return <div className="focus-workspace" style={{padding:12,height:'100vh',display:'flex',flexDirection:'column',gap:8}}>
    <div style={{display:'flex',gap:12,fontSize:12}}><span>Offline cache reads: {reads}</span><span>{label ? 'Native browser ready' : 'Native browser hidden'}</span><button onClick={() => window.dispatchEvent(new Event('offline'))}>Simulate connection loss</button><button onClick={() => window.dispatchEvent(new Event('online'))}>Check reconnection</button>{qaProblems.map(id => <a key={id} href={`?slug=${id}`}>{id}</a>)}</div>
    <ProblemWorkspace problem={problem} hidden={false} onCode={ignore} onReadyLabel={setLabel} />
  </div>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture /></React.StrictMode>)
