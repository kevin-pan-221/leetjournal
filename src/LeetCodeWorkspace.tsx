import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { PhysicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Webview } from '@tauri-apps/api/webview'
import { ExternalLink, LoaderCircle } from 'lucide-react'

const LEETCODE_HOSTS = new Set(['leetcode.com', 'www.leetcode.com'])
const LEETCODE_DATA_STORE = [76, 101, 101, 116, 74, 111, 117, 114, 110, 97, 108, 45, 87, 101, 98, 49]
interface CachedWorkspace {
  url: string
  label: string
  view: Webview
  ready: boolean
}

let cachedWorkspace: CachedWorkspace | null = null
let workspaceConsumers = 0

export async function hideLeetCodeWorkspace() {
  await cachedWorkspace?.view.hide().catch(() => {})
}

export async function closeLeetCodeWorkspace() {
  const cached = cachedWorkspace
  cachedWorkspace = null
  if (cached) await cached.view.close().catch(() => {})
}

interface WorkspaceBounds {
  x: number
  y: number
  width: number
  height: number
}

interface LeetCodeWorkspaceProps {
  url: string
  hidden?: boolean
  onReadyLabel?: (label: string) => void
}

export function LeetCodeWorkspace({
  url,
  hidden = false,
  onReadyLabel,
}: LeetCodeWorkspaceProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<Webview | null>(null)
  const reposition = useRef<() => void>(() => {})
  const hiddenRef = useRef(hidden)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    hiddenRef.current = hidden
  }, [hidden])

  useEffect(() => {
    workspaceConsumers++
    let disposed = false
    let frame = 0
    let layoutFrame = 0
    let positioning = false
    let pendingBounds: WorkspaceBounds | null = null
    let observer: ResizeObserver | undefined
    let unlistenResize: (() => void) | undefined
    let unlistenScale: (() => void) | undefined
    const settleTimers: number[] = []
    let resizeSettleTimers: number[] = []

    const position = async () => {
      if (disposed || !host.current || !view.current) return
      const bounds = host.current.getBoundingClientRect()
      pendingBounds = {
        x: bounds.left,
        y: bounds.top,
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height),
      }
      if (positioning) return

      positioning = true
      try {
        while (!disposed && pendingBounds && view.current) {
          const next = pendingBounds
          pendingBounds = null
          await invoke("set_leetcode_webview_bounds", {
            webviewLabel: view.current.label,
            ...next,
          })
        }
      } catch {
        // The window may be closing while a final resize callback is queued.
      } finally {
        positioning = false
        if (!disposed && pendingBounds) void position()
      }
    }

    const schedulePosition = () => {
      cancelAnimationFrame(layoutFrame)
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = requestAnimationFrame(position)
      })
    }

    const settlePosition = () => {
      schedulePosition()
      resizeSettleTimers.forEach(window.clearTimeout)
      resizeSettleTimers = [60, 180, 420, 800].map((delay) =>
        window.setTimeout(schedulePosition, delay),
      )
    }

    reposition.current = settlePosition

    frame = requestAnimationFrame(async () => {
      if (disposed || !host.current) return
      try {
        const safeUrl = new URL(url)
        if (safeUrl.protocol !== 'https:' || !LEETCODE_HOSTS.has(safeUrl.hostname)) {
          throw new Error('Only secure LeetCode pages can open in the workspace.')
        }

        const bounds = host.current.getBoundingClientRect()
        const appWindow = getCurrentWindow()
        if (cachedWorkspace?.url === safeUrl.toString()) {
          const cached = cachedWorkspace
          view.current = cached.view
          const activate = () => {
            if (disposed) return
            setState('ready')
            onReadyLabel?.(cached.label)
            ;(hiddenRef.current ? cached.view.hide() : cached.view.show())
              .catch(() => {})
              .finally(settlePosition)
          }
          if (cached.ready) activate()
          else cached.view.once('tauri://created', activate)
          observer = new ResizeObserver(schedulePosition)
          observer.observe(host.current)
          window.addEventListener('resize', settlePosition)
          unlistenResize = await appWindow.onResized(settlePosition)
          unlistenScale = await appWindow.onScaleChanged(settlePosition)
          return
        }

        await closeLeetCodeWorkspace()
        const label = `leetcode-workspace-${crypto.randomUUID().replaceAll('-', '')}`
        const embedded = new Webview(appWindow, label, {
          url: safeUrl.toString(),
          x: Math.round(bounds.left),
          y: Math.round(bounds.top),
          width: Math.max(1, Math.round(bounds.width)),
          height: Math.max(1, Math.round(bounds.height)),
          focus: false,
          devtools: false,
          allowLinkPreview: false,
          dataStoreIdentifier: LEETCODE_DATA_STORE,
        })
        view.current = embedded
        cachedWorkspace = { url: safeUrl.toString(), label, view: embedded, ready: false }

        // WKWebView creation can remain deferred on macOS until its parent gets
        // a resize notification. A one-physical-pixel nudge is imperceptible and
        // makes the cold-start path deterministic; the original size is restored
        // on the next frame.
        const wakeTimer = window.setTimeout(async () => {
          if (disposed) return
          try {
            const size = await appWindow.innerSize()
            await appWindow.setSize(new PhysicalSize(size.width, Math.max(1, size.height - 1)))
            requestAnimationFrame(() => appWindow.setSize(size).catch(() => {}))
          } catch {
            // The app may be closing before the child webview is registered.
          }
        }, 80)
        settleTimers.push(wakeTimer)

        embedded.once('tauri://created', () => {
          if (cachedWorkspace?.view === embedded) cachedWorkspace.ready = true
          if (disposed) {
            embedded.hide().catch(() => {})
            return
          }
          setState('ready')
          onReadyLabel?.(label)
          ;(hiddenRef.current ? embedded.hide() : embedded.show())
            .catch(() => {})
            .finally(settlePosition)
        })
        embedded.once('tauri://error', (event) => {
          if (!disposed) {
            setMessage(String(event.payload))
            setState('error')
          }
        })

        observer = new ResizeObserver(schedulePosition)
        observer.observe(host.current)
        window.addEventListener('resize', settlePosition)
        unlistenResize = await appWindow.onResized(settlePosition)
        unlistenScale = await appWindow.onScaleChanged(settlePosition)
      } catch (error) {
        setMessage(String(error))
        setState('error')
      }
    })

    return () => {
      disposed = true
      pendingBounds = null
      onReadyLabel?.('')
      cancelAnimationFrame(frame)
      cancelAnimationFrame(layoutFrame)
      settleTimers.forEach(window.clearTimeout)
      resizeSettleTimers.forEach(window.clearTimeout)
      reposition.current = () => {}
      observer?.disconnect()
      unlistenResize?.()
      unlistenScale?.()
      window.removeEventListener('resize', settlePosition)
      const current = view.current
      view.current = null
      workspaceConsumers--
      window.setTimeout(() => {
        if (workspaceConsumers === 0 && cachedWorkspace?.view === current) current?.hide().catch(() => {})
      })
    }
  }, [url, onReadyLabel])

  useEffect(() => {
    const current = view.current
    if (!current) return
    ;(hidden ? current.hide() : current.show())
      .catch(() => {})
      .finally(() => { if (!hidden) reposition.current() })
  }, [hidden, state])

  return (
    <section className="browser-frame" aria-label="Embedded LeetCode workspace">
      <div className="leetcode-host" ref={host}>
        {state === 'loading' && (
          <div className="browser-state">
            <LoaderCircle />
            <b>Opening LeetCode…</b>
            <span>Your login stays in this private app browser.</span>
          </div>
        )}
        {state === 'error' && (
          <div className="browser-state error">
            <b>LeetCode couldn’t open here</b>
            <span>{message}</span>
            <a href={url} target="_blank" rel="noreferrer">
              Open in your browser <ExternalLink size={14} />
            </a>
          </div>
        )}
      </div>
    </section>
  )
}
