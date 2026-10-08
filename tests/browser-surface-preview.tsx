import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Webview } from '@tauri-apps/api/webview'
import { BrowserSurface } from '../src/browser/BrowserSurface'
import { SurfaceController } from '../src/browser/SurfaceController'
import { geometryError, measureSurface } from '../src/browser/geometry'
import type { SurfaceReport } from '../src/browser/geometry'
import '../src/styles.css'
import '../src/workspace.css'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const report = (message: string) => invoke('probe_report', { message })
const label = 'browser-surface-probe'
const surface = new SurfaceController((sequence, layout) => invoke<SurfaceReport>('sync_browser_surface', { webviewLabel: label, sequence, layout }))

function Probe() {
  const [ready, setReady] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    async function check(name: string, expectedWidth?: number) {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const slot = document.querySelector<HTMLElement>('.browser-frame')
        const layout = slot && measureSurface(slot)
        if ((!expectedWidth || Math.abs(innerWidth - expectedWidth) <= 1) && layout && surface.report?.visible && surface.report.actual && geometryError(layout.rect, surface.report.actual) <= 1) {
          const panel = document.querySelector<HTMLElement>('.workspace-side')!.getBoundingClientRect()
          if (panel.right > innerWidth + 1 || panel.left < layout.rect.x + layout.rect.width - 1) throw Error(`${name}: tools panel overlaps or escapes viewport`)
          if (layout.rect.y + layout.rect.height > innerHeight + 1) throw Error(`${name}: browser escapes viewport`)
          await report(`${name}: PASS ${JSON.stringify({ requested: layout.rect, actual: surface.report.actual, dpr:devicePixelRatio })}`)
          return
        }
        await sleep(50)
      }
      throw Error(`${name}: geometry mismatch ${JSON.stringify(surface.report)} viewport ${innerWidth}x${innerHeight} DPR ${devicePixelRatio}`)
    }
    void (async () => {
      const view = new Webview(getCurrentWindow(), label, { url: `${location.origin}/tests/browser-surface-content.html`, x:-10000,y:-10000,width:1,height:1,focus:false })
      await Promise.race([new Promise<void>((resolve,reject) => {
        void view.once('tauri://created', () => resolve())
        void view.once('tauri://error', e => reject(Error(String(e.payload))))
      }), sleep(8000).then(()=>{throw Error('Native creation timed out')})])
      setReady(true)
      await check('cold create')
      if (location.search.includes('inspect')) return
      for (const [width,height] of [[960,680],[1280,820],[700,600],[1013,717]]) {
        await invoke('probe_configure',{width,height,fullscreen:false,zoom:1})
        await sleep(150)
        await check(`window ${width}x${height}`)
      }
      setCollapsed(true); await sleep(100); await check('collapsed sidebar')
      setCollapsed(false); await sleep(100); await check('expanded sidebar')
      setHidden(true); await sleep(150)
      if (surface.report?.visible) throw Error('Modal did not hide native surface')
      await report('modal hide: PASS')
      setHidden(false); await sleep(100); await check('modal dismiss')
      setMounted(false); await sleep(150)
      if (surface.report?.visible) throw Error('Unmount did not hide native surface')
      setMounted(true); await sleep(100); await check('cached remount')
      for (const zoom of [1.25,0.8,1.75,1]) {
        await invoke('probe_configure',{width:1280,height:820,fullscreen:false,zoom})
        await sleep(200); await check(`app zoom ${zoom}`)
      }
      const fullWidth = await invoke<number>('probe_configure',{width:1280,height:820,fullscreen:true,zoom:1})
      await sleep(1200); await check('fullscreen', fullWidth)
      await invoke('probe_configure',{width:1013,height:717,fullscreen:false,zoom:1})
      await sleep(1200); await check('exit fullscreen', 1013)
      await report('ALL NATIVE SURFACE CHECKS PASSED')
      if (!location.search.includes('inspect')) {
        await surface.hide(); await view.close()
        await invoke('dispose_browser_surface',{webviewLabel:label})
        await invoke('probe_quit',{success:true})
      }
    })().catch(async error => { setError(String(error)); await report(String(error)); await invoke('probe_quit',{success:false}) })
  }, [])
  return <main className="focus-workspace"><div className={`workspace-body${collapsed?' tools-collapsed':''}`}>
    {mounted && <BrowserSurface surface={ready?surface:null} hidden={hidden} onError={setError}><span>{error || 'Waiting for native surface…'}</span></BrowserSurface>}
    <aside className="workspace-side"><b>Isolated native test</b><p>{error || 'Checking live native geometry.'}</p></aside>
  </div></main>
}
createRoot(document.getElementById('root')!).render(<Probe />)
