import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { createConnectivityMonitor } from './connectivity'

export function useConnectivity() {
  const [connected, setConnected] = useState(() => navigator.onLine !== false)
  const monitor = useRef<ReturnType<typeof createConnectivityMonitor> | null>(null)
  useEffect(() => {
    const watcher = createConnectivityMonitor({ probe: api.leetcodeReachable, publish: setConnected })
    monitor.current = watcher
    const offline = () => watcher.disconnected()
    const online = () => watcher.check()
    const visible = () => { if (document.visibilityState === 'visible') watcher.check(1000) }
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', visible)
    // Let the native browser start immediately. navigator.onLine can be true
    // for Wi-Fi without internet, so confirm reachability after startup settles.
    if (navigator.onLine === false) offline()
    else watcher.check(5000)
    return () => {
      watcher.dispose(); monitor.current = null
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])
  return { connected, check: () => monitor.current?.check() }
}
