import { useEffect, useState } from 'react'
import type { AppSettings } from '../domain'
import { Card, PageHeader } from '../components/ui'
import { LocalAiSettings } from '../components/LocalAiSettings'
import { errorMessage } from '../utils/errors'

interface SettingsPageProps {
  settings: AppSettings
  onSave: (settings: AppSettings) => Promise<void>
}

function Toggle({ label, detail, checked, onChange }: {
  label: string
  detail: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label>
      <span>{label}<small>{detail}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

export function SettingsPage({ settings, onSave }: SettingsPageProps) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const save = async () => {
    setSaving(true)
    setSaveError('')
    try { await onSave(draft) }
    catch (error) { setSaveError(errorMessage(error)) }
    finally { setSaving(false) }
  }
  useEffect(() => setDraft(settings), [settings])
  const patch = <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  return (
    <div className="page settings-page">
      <PageHeader title="Settings" subtitle="Shape LeetJournal around your practice." />
      <Card>
        <h3>Profile</h3>
        <label><span>Display name<small>Used in your daily greeting</small></span><input value={draft.displayName} onChange={(event) => patch('displayName', event.target.value)} /></label>
      </Card>
      <Card>
        <h3>Practice goals</h3>
        <label><span>Daily focus goal<small>Minutes of focused practice each day</small></span><input type="number" min="5" max="240" value={draft.dailyFocusMinutes} onChange={(event) => patch('dailyFocusMinutes', +event.target.value)} /></label>
        <label><span>Weekly goal<small>Days you’d like to practice</small></span><select value={draft.weeklyGoalDays} onChange={(event) => patch('weeklyGoalDays', +event.target.value)}>{[3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value} days</option>)}</select></label>
      </Card>
      <Card>
        <h3>Focus sessions</h3>
        <label><span>Default duration<small>Length of a focus session</small></span><input type="number" min="5" max="180" value={draft.focusDurationMinutes} onChange={(event) => patch('focusDurationMinutes', +event.target.value)} /></label>
        <label><span>First hint delay<small>When the first hint becomes timely</small></span><input type="number" min="1" max="60" value={draft.hintDelayMinutes} onChange={(event) => patch('hintDelayMinutes', +event.target.value)} /></label>
        <Toggle label="Progressive hints" detail="Reveal hints one at a time" checked={draft.progressiveHints} onChange={(value) => patch('progressiveHints', value)} />
      </Card>
      <Card>
        <h3>Appearance</h3>
        <Toggle label="Plant animations" detail="Gentle movement while focusing" checked={draft.plantAnimations} onChange={(value) => patch('plantAnimations', value)} />
        <label><span>Theme<small>Keep things calm and comfortable</small></span><select value={draft.theme} onChange={(event) => patch('theme', event.target.value)}><option value="warm-garden">Warm garden</option><option value="system">System</option></select></label>
      </Card>
      <LocalAiSettings value={draft.localModel} disabled={saving} onChange={(value) => patch('localModel', value)} />
      {saveError && <p role="alert">{saveError}</p>}
      <button className="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</button>
    </div>
  )
}
