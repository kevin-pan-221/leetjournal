import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Webview } from '@tauri-apps/api/webview'
import { ExternalLink, LoaderCircle } from 'lucide-react'
import { BrowserSurface } from './browser/BrowserSurface'
import { SurfaceController } from './browser/SurfaceController'
import type { SurfaceReport } from './browser/geometry'

const LEETCODE_HOSTS = new Set(['leetcode.com', 'www.leetcode.com'])
const LEETCODE_DATA_STORE = [76, 101, 101, 116, 74, 111, 117, 114, 110, 97, 108, 45, 87, 101, 98, 49]
interface CachedWorkspace { url: string; view: Webview; surface: SurfaceController; ready: Promise<void> }
let cached: CachedWorkspace | null = null
let lifecycle: Promise<unknown> = Promise.resolve()

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = lifecycle.then(operation)
  lifecycle = result.catch(() => {})
  return result
}

export async function hideLeetCodeWorkspace() { await cached?.surface.hide() }

async function closeCached() {
  const previous = cached
  cached = null
  if (!previous) return
  await previous.ready.catch(() => {})
  await previous.surface.hide().catch(() => {})
  await previous.view.close().catch(() => {})
  await invoke('dispose_browser_surface', { webviewLabel: previous.view.label })
}
export function closeLeetCodeWorkspace() { return serialize(closeCached) }

function acquire(url: string) {
  return serialize(async () => {
    const safe = new URL(url)
    if (safe.protocol !== 'https:' || !LEETCODE_HOSTS.has(safe.hostname)) throw new Error('Only secure LeetCode pages can open in the workspace.')
    if (cached?.url === safe.toString()) { await cached.ready; return cached }
    await closeCached()
    const label = `browser-surface-${crypto.randomUUID().replaceAll('-', '')}`
    // Creation cannot flash over the app: the native view starts offscreen and
    // is only revealed by BrowserSurface's first completed geometry transaction.
    const view = new Webview(getCurrentWindow(), label, {
      url: safe.toString(), x: -10000, y: -10000, width: 1, height: 1,
      focus: false, devtools: false, allowLinkPreview: false, dataStoreIdentifier: LEETCODE_DATA_STORE,
    })
    const ready = new Promise<void>((resolve, reject) => {
      void view.once('tauri://created', () => resolve()).catch(reject)
      void view.once('tauri://error', event => reject(new Error(String(event.payload)))).catch(reject)
    })
    const workspace = { url: safe.toString(), view, ready,
      surface: new SurfaceController((sequence, layout) => invoke<SurfaceReport>('sync_browser_surface', { webviewLabel: label, sequence, layout })) }
    cached = workspace
    await ready
    return workspace
  })
}

interface Props { url: string; hidden?: boolean; onReadyLabel?: (label: string) => void }
export function LeetCodeWorkspace({ url, hidden = false, onReadyLabel }: Props) {
  const [workspace, setWorkspace] = useState<CachedWorkspace | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let disposed = false
    setWorkspace(null); setMessage('')
    void acquire(url).then(value => {
      if (!disposed) { setWorkspace(value); onReadyLabel?.(value.view.label) }
    }).catch(error => { if (!disposed) setMessage(String(error)) })
    return () => { disposed = true; onReadyLabel?.('') }
  }, [url, onReadyLabel])

  const current = workspace?.url === url ? workspace : null
  return <BrowserSurface label="Embedded LeetCode workspace" surface={current?.surface ?? null} hidden={hidden || Boolean(message)} onError={setMessage}>
    {!workspace && !message && <div className="browser-state"><LoaderCircle /><b>Opening LeetCode…</b><span>Your login stays in this private app browser.</span></div>}
    {message && <div className="browser-state error"><b>LeetCode couldn’t open here</b><span>{message}</span><a href={url} target="_blank" rel="noreferrer">Open in your browser <ExternalLink size={14} /></a></div>}
  </BrowserSurface>
}
