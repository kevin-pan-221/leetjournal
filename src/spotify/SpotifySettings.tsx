import { Music2 } from 'lucide-react'
import { Card } from '../components/ui'
import { useSpotify } from './SpotifyProvider'

export function SpotifySettings() {
  const { connection, connecting, busy, error, connect, disconnect, control, loadConnection } = useSpotify()
  return <Card className="spotify-settings">
    <h3><Music2 size={17} /> Spotify</h3>
    <p className="spotify-copy">See what’s playing and control music from your focus sidebar.</p>
    {connection?.supported === false ? <p className="spotify-copy">Local Spotify controls are available on macOS.</p> : <>
      <div className="spotify-settings-actions">
        {connection?.enabled ? <><span className="spotify-connected">Enabled on this Mac</span><button disabled={busy} onClick={() => void control({ type: 'open' })}>Open Spotify</button><button disabled={busy} onClick={() => void disconnect()}>Disable</button></>
          : <button className="primary" disabled={busy || !connection} onClick={() => void connect()}>{connecting ? 'Allow access in macOS…' : 'Enable Spotify'}</button>}
      </div>
      <p className="spotify-caption">{connection?.enabled ? 'Music stays independent of your timer. Choose playlists and devices in Spotify.' : 'Requires the Spotify app. macOS will ask you to allow control—no developer account or keys needed.'}</p>
    </>}
    {error && <p className="spotify-error" role="alert">{error}{!connection && <button onClick={() => void loadConnection()}>Retry</button>}</p>}
  </Card>
}
