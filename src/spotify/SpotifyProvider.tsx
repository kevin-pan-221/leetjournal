import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { listen } from '@tauri-apps/api/event'
import { errorMessage } from '../utils/errors'
import { playbackPosition, spotifyApi } from './api'
import type { ConnectionStatus, Playback, PlayerAction } from './api'
import { SpotifyCommandQueue } from './commandQueue'
import { PlaybackIntent } from './playbackIntent'

function useSpotifyState() {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [playback, setPlayback] = useState<Playback | null>(null)
  const [receivedAt, setReceivedAt] = useState(0)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [visible, setVisible] = useState(false)
  const version = useRef(0)
  const refreshing = useRef(false)
  const refreshPending = useRef(false)
  const active = useRef(false)
  active.current = visible && Boolean(connection?.enabled)
  const acting = useRef(false)
  const retryAt = useRef(0)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const queue = useRef(new SpotifyCommandQueue(spotifyApi.control))
  const displayed = useRef<{ playback: Playback | null; at: number }>({ playback: null, at: 0 })
  const confirmed = useRef<Playback | null>(null)
  const intent = useRef(new PlaybackIntent())
  useEffect(() => {
    return () => clearTimeout(settleTimer.current)
  }, [visible])

  const loadConnection = useCallback(async () => {
    const request = version.current
    try {
      const next = await spotifyApi.status()
      if (request === version.current) { setConnection(next); setError('') }
    } catch (e) { if (request === version.current) setError(errorMessage(e)) }
  }, [])
  useEffect(() => { void loadConnection() }, [loadConnection])

  const updatePlayback = (next: Playback) => {
    const at = Date.now()
    confirmed.current = next
    displayed.current = { playback: next, at }
    setPlayback(next); setReceivedAt(at); setError(''); retryAt.current = 0
  }
  const refresh = useCallback(async function readPlayback(manual = false) {
    if (!connection?.enabled || (!manual && Date.now() < retryAt.current)) return
    if (refreshing.current || acting.current) {
      if (manual) {
        refreshPending.current = true
        // An external change during a read invalidates its older snapshot.
        // Never invalidate an in-flight user command.
        if (!acting.current) ++version.current
      }
      return
    }
    refreshPending.current = false
    const request = version.current
    refreshing.current = true
    try {
      const next = await spotifyApi.playback()
      if (next && request === version.current) {
        if (intent.current.shouldDefer(next, Date.now())) {
          // Keep the optimistic label/icon/clock together while the native
          // state settles. This retries only the read, never the command.
          clearTimeout(settleTimer.current)
          settleTimer.current = setTimeout(() => {
            if (request === version.current && active.current && document.visibilityState === 'visible') void readPlayback(true)
          }, 200)
        } else {
          updatePlayback(next)
        }
      }
    } catch (e) {
      if (request === version.current) { setError(errorMessage(e)); retryAt.current = Date.now() + 30_000 }
    } finally {
      refreshing.current = false
      if (refreshPending.current && !acting.current && active.current && document.visibilityState === 'visible') {
        void readPlayback(true)
      }
    }
  }, [connection?.enabled])

  useEffect(() => {
    if (!visible || !connection?.enabled) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let changeTimer: ReturnType<typeof setTimeout> | undefined
    let unlisten: (() => void) | undefined
    const poll = async () => {
      if (document.visibilityState === 'visible') await refresh()
      if (!disposed) timer = setTimeout(poll, 2_000)
    }
    const wake = () => { if (document.visibilityState === 'visible') void refresh(true) }
    // Coalesce notification bursts without adding another polling loop.
    void listen('spotify-playback-changed', () => {
      if (disposed || document.visibilityState !== 'visible' || changeTimer) return
      changeTimer = setTimeout(() => { changeTimer = undefined; wake() }, 50)
    }).then(stop => { if (disposed) stop(); else unlisten = stop }).catch(() => {
      // Older hosts or failed subscriptions still have the periodic fallback.
    })
    void poll()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    return () => {
      disposed = true; refreshPending.current = false
      clearTimeout(timer); clearTimeout(changeTimer); unlisten?.()
      document.removeEventListener('visibilitychange', wake); window.removeEventListener('focus', wake)
    }
  }, [visible, connection?.enabled, refresh])

  const connect = async () => {
    if (acting.current) return
    acting.current = true; setConnecting(true); setBusy(true); setError('')
    intent.current.clear()
    const request = ++version.current
    try {
      const next = await spotifyApi.connect()
      if (request === version.current) { setConnection(next); setPlayback(null); retryAt.current = 0 }
    } catch (e) { if (request === version.current) setError(errorMessage(e)) }
    finally { acting.current = false; setConnecting(false); setBusy(false) }
  }

  const disconnect = async () => {
    if (acting.current) return
    acting.current = true; ++version.current; setBusy(true)
    intent.current.clear()
    try {
      await spotifyApi.disconnect()
      setConnection({ enabled: false, supported: true }); setPlayback(null); setError(''); retryAt.current = 0
      displayed.current = { playback: null, at: 0 }; confirmed.current = null
    } catch (e) { setError(errorMessage(e)) }
    finally { acting.current = false; setBusy(false) }
  }

  const control = async (action: PlayerAction) => {
    if (!connection?.enabled || (acting.current && !queue.current.busy)) return false
    acting.current = true; setBusy(true)
    const request = ++version.current
    clearTimeout(settleTimer.current)
    const before = displayed.current
    if (before.playback && (action.type === 'play' || action.type === 'pause')) {
      intent.current.begin(request, before.playback, action.type === 'play')
    } else if (['next', 'previous', 'open'].includes(action.type)) {
      intent.current.clear()
    }
    if (before.playback && ['seek', 'play', 'pause'].includes(action.type)) {
      const at = Date.now()
      const optimistic = { ...before.playback,
        progress_ms: action.type === 'seek' ? action.position : playbackPosition(before.playback, before.at, at),
        is_playing: action.type === 'play' ? true : action.type === 'pause' ? false : before.playback.is_playing }
      displayed.current = { playback: optimistic, at }
      setPlayback(optimistic); setReceivedAt(at)
    }
    try {
      const accepted = await queue.current.enqueue(action)
      if (accepted) intent.current.acknowledge(request, Date.now())
      if (accepted && request === version.current) {
        // The desktop app can acknowledge a command before playback settles.
        // Re-read once shortly afterwards, without repeating the command.
        clearTimeout(settleTimer.current)
        settleTimer.current = setTimeout(() => {
          if (request === version.current && active.current && document.visibilityState === 'visible') void refresh(true)
        }, ['next', 'previous', 'open'].includes(action.type) ? 0 : 150)
      }
      return accepted
    } catch (e) {
      intent.current.clear(request)
      if (request === version.current) {
        if (confirmed.current) updatePlayback(confirmed.current)
        setError(errorMessage(e)); retryAt.current = Date.now() + 30_000
      }
      return false
    } finally { acting.current = queue.current.busy; setBusy(queue.current.busy) }
  }

  return { connection, playback, receivedAt, error, connecting, busy, setVisible, connect, disconnect, refresh, control, loadConnection }
}

const SpotifyContext = createContext<ReturnType<typeof useSpotifyState> | null>(null)
export function SpotifyProvider({ children }: { children: ReactNode }) {
  const state = useSpotifyState()
  return <SpotifyContext.Provider value={state}>{children}</SpotifyContext.Provider>
}
export function useSpotify() {
  const state = useContext(SpotifyContext)
  if (!state) throw new Error('SpotifyProvider is missing')
  return state
}
