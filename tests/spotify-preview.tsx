// Browser-test fixture. Spotify IPC is mocked by the test runner before loading.
// This module is not imported by the application or included in release builds.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpotifyProvider } from '../src/spotify/SpotifyProvider'
import { SpotifyPlayer } from '../src/spotify/SpotifyPlayer'
import { SpotifySettings } from '../src/spotify/SpotifySettings'
import '../src/spotify/spotify.css'
import '../src/styles.css'
import '../src/extras.css'
import '../src/workspace.css'
import '../src/workflow.css'

function Preview() {
  const [settings, setSettings] = useState(false)
  return settings ? <div className="page settings-page"><SpotifySettings /></div> :
    <aside className="workspace-side" style={{ width: 252, height: 680, margin: 20 }}>
      <div className="session-dock">FOCUS 12:48</div>
      <div className="tool-panel"><textarea aria-label="Session notes" defaultValue="My notes stay available" style={{ width: '100%', minHeight: 120 }} /></div>
      <SpotifyPlayer visible />
      <button className="primary finish">Finish &amp; reflect</button>
      <button onClick={() => setSettings(true)}>Test: settings page</button>
    </aside>
}

createRoot(document.getElementById('root')!).render(<SpotifyProvider><Preview /></SpotifyProvider>)
