import React, { useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { api } from '../src/api'
import { SaveBookOffline } from '../src/offline/SaveBookOffline'
import type { OfflineBookProgress } from '../src/offline/bookProgress'
import '../src/styles.css'
import '../src/offline/offline.css'

// Isolated UI fixture: no database writes or network requests.
let progress: OfflineBookProgress | null = null
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<(p: OfflineBookProgress) => void>()
const publish = () => { if (progress) { progress = {...progress,revision:progress.revision+1}; for (const receive of listeners) receive(progress) } }
api.onOfflineBookProgress = async receive => { listeners.add(receive); return () => { listeners.delete(receive) } }
api.offlineBookStatus = async () => progress
api.saveOfflineBook = async bookId => {
  progress = {bookId,bookTitle:'NeetCode 150',status:'running',total:150,savedIds:progress?.savedIds ?? [],current:'Contains Duplicate',issues:[],message:null,revision:(progress?.revision ?? 0)+1}
  timer = setInterval(() => {
    if (!progress || progress.status !== 'running') return
    progress = {...progress,savedIds:[...progress.savedIds,`problem-${progress.savedIds.length}`],current:'Next problem'}
    if (progress.savedIds.length === 150) { progress.status = 'completed'; progress.current = null; clearInterval(timer) }
    publish()
  },800)
  publish()
  return progress!
}
api.pauseOfflineBook = async () => {
  clearInterval(timer)
  if (progress) { progress = {...progress,status:'paused',current:null,message:'Download paused. Saved copies are ready to use.'}; publish() }
}
function Fixture() {
  const [visible,setVisible] = useState(true)
  const [saved,setSaved] = useState<string[]>([])
  const onSaved = useCallback((ids: string[]) => setSaved(current => [...new Set([...current,...ids])]),[])
  return <main style={{padding:28,maxWidth:1000,margin:'auto'}}><h1>NeetCode 150</h1><button onClick={() => setVisible(!visible)}>{visible ? 'Leave Library' : 'Return to Library'}</button><div style={{marginTop:24}}>{visible && <SaveBookOffline bookId="neetcode-150" problemIds={Array.from({length:150},(_,i)=>`problem-${i}`)} savedIds={saved} onSaved={onSaved} />}</div></main>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture /></React.StrictMode>)
