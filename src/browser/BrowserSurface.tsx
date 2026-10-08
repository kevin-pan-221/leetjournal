import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { geometryError, measureSurface } from './geometry'
import type { SurfaceController } from './SurfaceController'

interface Props {
  label?: string
  surface: SurfaceController | null
  hidden: boolean
  children: ReactNode
  onError: (message: string) => void
}

export function BrowserSurface({ surface, hidden, children, onError, label = 'Embedded browser' }: Props) {
  const slot = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const element = slot.current
    if (!element || !surface) return
    const lease = surface.attach()
    let disposed = false
    let frame = 0
    let queued = false
    let forceNext = false
    const stops: (() => void)[] = []
    const ancestors: HTMLElement[] = []
    for (let node: HTMLElement | null = element; node; node = node.parentElement) ancestors.push(node)
    // WKWebView may throttle animation frames while a native sibling covers it.
    // Geometry events must still commit; only animation tracking depends on rAF.
    const schedule = () => {
      if (disposed || queued) return
      queued = true
      queueMicrotask(() => { queued = false; measure() })
    }
    const measure = () => {
      if (disposed) return
      try {
        // A covered/background WKWebView can report hidden independently of
        // its native siblings. Only the owning UI decides surface visibility.
        const layout = hidden ? null : measureSurface(element)
        const force = forceNext
        forceNext = false
        void surface.publish(lease, layout, force).then(() => {
          if (disposed) return
          const report = surface.report
          // Diagnostic only: never render another corrective offset on top.
          if (layout && report?.actual) element.dataset.nativeGeometryError = geometryError(layout.rect, report.actual).toFixed(3)
        }).catch(error => { if (!disposed) onError(String(error)) })
      } catch (error) { onError(String(error)) }
      // Follow an actual layout animation, not a fixed series of delayed retries.
      if (!frame && ancestors.some(node => node.getAnimations().some(animation => animation.playState === 'running'))) {
        frame = requestAnimationFrame(() => { frame = 0; schedule() })
      }
    }
    const resize = new ResizeObserver(schedule)
    const mutations = new MutationObserver(schedule)
    for (const ancestor of ancestors) {
      resize.observe(ancestor)
      // Sibling size changes can move the slot without changing its own size.
      for (const sibling of ancestor.parentElement?.children ?? []) resize.observe(sibling)
      mutations.observe(ancestor, { attributes: true, attributeFilter: ['class', 'style', 'hidden'], childList: true })
    }
    const events = ['resize', 'scroll', 'transitionrun', 'transitionend', 'animationstart', 'animationend']
    for (const event of events) window.addEventListener(event, schedule, true)
    document.addEventListener('visibilitychange', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    const keep = (stop: () => void) => { if (disposed) stop(); else stops.push(stop) }
    const nativeChange = () => {
      // The native parent may have changed while the CSS rectangle stayed equal.
      if (!disposed) { forceNext = true; schedule() }
    }
    const appWindow = getCurrentWindow()
    void appWindow.onResized(nativeChange).then(keep).catch(() => {})
    void appWindow.onScaleChanged(nativeChange).then(keep).catch(() => {})
    schedule()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      resize.disconnect(); mutations.disconnect(); stops.forEach(stop => stop())
      for (const event of events) window.removeEventListener(event, schedule, true)
      document.removeEventListener('visibilitychange', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
      void surface.detach(lease).catch(() => {})
    }
  }, [surface, hidden, onError])

  return <section className="browser-frame" ref={slot} aria-label={label}>{children}</section>
}
