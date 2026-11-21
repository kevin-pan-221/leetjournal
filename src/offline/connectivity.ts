/** Event-driven connectivity hints plus a deferred, bounded reachability check.
 * Nothing here reads saved problems, imports an editor, or blocks the browser.
 */
export function createConnectivityMonitor({ probe, publish, schedule = (fn, ms) => {
  const timer = setTimeout(fn, ms)
  return () => clearTimeout(timer)
} }: {
  probe: () => Promise<boolean>
  publish: (connected: boolean) => void
  schedule?: (fn: () => void, ms: number) => () => void
}) {
  let revision = 0
  let disposed = false
  let cancel: (() => void) | undefined
  const invalidate = () => { revision++; cancel?.(); cancel = undefined }
  const check = (delay = 0) => {
    if (disposed) return
    invalidate()
    const request = revision
    cancel = schedule(() => {
      cancel = undefined
      void (async () => {
        try {
          const reachable = await probe()
          if (disposed || request !== revision) return
          if (reachable) { publish(true); return }
          // One failed request may just be a transient stall. Confirm it once;
          // there is deliberately no recurring timer or background polling.
          cancel = schedule(() => {
            cancel = undefined
            void probe().then(confirmed => {
              if (!disposed && request === revision) publish(confirmed)
            }).catch(() => { /* An IPC failure is not evidence of lost internet. */ })
          }, 1000)
        } catch { /* Keep the current hint if the native check is unavailable. */ }
      })()
    }, delay)
  }
  return {
    check,
    disconnected() { invalidate(); if (!disposed) publish(false) },
    dispose() { disposed = true; invalidate() },
  }
}
