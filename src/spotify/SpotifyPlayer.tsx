import { useEffect, useState } from 'react'
import { Music2, Pause, Play, RefreshCw, SkipBack, SkipForward } from 'lucide-react'
import { useSpotify } from './SpotifyProvider'
import { playbackPosition, spotifyLink } from './api'
import { SpotifySeekBar } from './SpotifySeekBar'

export function SpotifyPlayer({ visible }: { visible: boolean }) {
  const { connection, playback, receivedAt, busy, connecting, error, setVisible, connect, refresh, control, loadConnection } = useSpotify()
  const [now, setNow] = useState(Date.now())
  const [failedArt, setFailedArt] = useState('')
  useEffect(() => { setVisible(visible); return () => setVisible(false) }, [visible, setVisible])
  useEffect(() => {
    if (!visible || !connection?.enabled) return
    // A local display clock; IPC is independently paced by the provider.
    const timer = setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()) }, playback?.is_playing ? 100 : 1000)
    return () => clearInterval(timer)
  }, [visible, connection?.enabled, playback?.is_playing])
  useEffect(() => { setNow(Date.now()) }, [receivedAt])

  if (connection?.supported === false) return null
  if (!connection?.enabled) return <section className="spotify-player" aria-label="Spotify player">
    <div className="spotify-disconnected"><Music2 size={18} /><div><b>Music for your focus</b><small>Your Spotify, right here.</small></div></div>
    <button className="spotify-enable" disabled={busy || (!connection && !error)} onClick={() => { if (!connection) void loadConnection(); else void connect() }}>{connecting ? 'Allow access in macOS…' : !connection ? (error ? 'Retry Spotify' : 'Loading Spotify…') : 'Enable Spotify'}</button>
    {error && <p className="spotify-error" role="status">{error}</p>}
  </section>

  const track = playback?.item
  const stale = Boolean(playback && now - receivedAt > 8_000)
  const restricted = !playback?.running || Boolean(error) || (stale && !busy)
  const playing = Boolean(playback?.is_playing && !error && !stale)
  const artwork = track?.artwork_url
  const safeArt = artwork?.startsWith('https://i.scdn.co/') && artwork !== failedArt ? artwork : undefined
  const position = playbackPosition(playback, receivedAt, now)
  const status = error ? 'Sync unavailable' : stale ? 'Reconnecting…' : !playback ? 'Connecting…'
    : !playback.running ? 'Spotify is closed' : !track ? 'Nothing playing' : playing ? 'Now playing' : 'Paused'

  return <section className={`spotify-player${playing ? ' is-playing' : ''}`} aria-label="Spotify player">
    <header className="spotify-widget-header">
      <span className="spotify-state"><span className="spotify-equalizer" aria-hidden="true"><i /><i /><i /></span>{status}</span>
    </header>
    <div className="spotify-now-playing">
      <a className="spotify-artwork" href={spotifyLink(track?.url)} target="_blank" rel="noreferrer" aria-label={track ? `Open ${track.name} in Spotify` : 'Spotify'}>
        {safeArt ? <img src={safeArt} alt="Album artwork" referrerPolicy="no-referrer" onError={() => setFailedArt(artwork ?? '')} /> : <span className="spotify-art"><Music2 size={25} /></span>}
      </a>
      <div className="spotify-track-text">
        <a className="spotify-title" href={spotifyLink(track?.url)} target="_blank" rel="noreferrer" title={track?.name}>{track?.name ?? 'Your focus soundtrack'}</a>
        <span className="spotify-artist" title={track?.artist}>{track?.artist || 'Choose music in Spotify'}</span>
      </div>
    </div>
    {track && <SpotifySeekBar key={`${track.url}:${track.name}`} position={position} duration={track.duration_ms} disabled={restricted} onSeek={position => control({ type: 'seek', position })} />}
    <div className="spotify-transport">
      <button className="spotify-icon" aria-label="Previous track" disabled={restricted || busy || !track} onClick={() => void control({ type: 'previous' })}><SkipBack size={18} /></button>
      <button className="spotify-icon spotify-play" aria-label={playback?.is_playing ? 'Pause music' : 'Play music'} disabled={restricted || !track} onClick={() => void control({ type: playback?.is_playing ? 'pause' : 'play' })}>{playback?.is_playing ? <Pause size={19} /> : <Play size={19} />}</button>
      <button className="spotify-icon" aria-label="Next track" disabled={restricted || busy || !track} onClick={() => void control({ type: 'next' })}><SkipForward size={18} /></button>
    </div>
    {error && <div className="spotify-error" role="status">{error}</div>}
    {(error || stale) && <button className="spotify-retry" disabled={busy} onClick={() => void refresh(true)}><RefreshCw size={12} /> Sync again</button>}
  </section>
}
