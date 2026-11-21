// Isolated design fixture. No native IPC, user database, or models are touched.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GardenPage } from '../src/garden/GardenPage'
import { gardenGrowth } from '../src/garden/growth'
import { Sidebar } from '../src/components/Sidebar'
import '../src/styles.css'
import '../src/extras.css'
import '../src/sidebar.css'
import '../src/garden/garden.css'

function Preview() {
  const [scenario, setScenario] = useState('History')
  const [message, setMessage] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const count = scenario === 'Empty' ? 0 : scenario === 'Long history' ? 40 : 4
  const state = { focusedSeconds: count * 4500 + (scenario === 'Empty' ? 0 : 3200),
    plants: Array.from({ length: count }, (_, id) => ({ id, grownAt: `2026-10-${String(id % 7 + 1).padStart(2, '0')}T12:00:00Z`, problems: ['Two Sum', 'Valid Anagram'] })) }
  const growth = gardenGrowth(state, [], Date.now())
  if (scenario === 'Bloom') { growth.stage = 3; growth.blooming = true; growth.percent = 100 }
  return <><nav style={{ padding: 12, display: 'flex', gap: 12 }} aria-label="Test scenarios">{['Empty', 'History', 'Long history', 'Bloom', 'Still'].map(name => <button key={name} onClick={() => setScenario(name)}>{name}</button>)}<span role="status">{message}</span></nav>
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}><Sidebar page="garden" name="Preview" collapsed={collapsed} hidden={false} onToggle={() => setCollapsed(value => !value)} onNavigate={page => setMessage(page)} /><main><GardenPage state={state} growth={growth} active={null} animate={scenario !== 'Still'} onStart={() => setMessage('Choose a problem')} onReturn={() => setMessage('Return to focus')} /></main></div></>
}
createRoot(document.getElementById('root')!).render(<Preview />)
