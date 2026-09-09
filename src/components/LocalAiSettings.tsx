import { useEffect, useState } from 'react'
import { Download, ExternalLink, RefreshCw } from 'lucide-react'
import { api, type ModelDownloadStatus } from '../api'
import { Card } from './ui'
import { errorMessage } from '../utils/errors'

export function LocalAiSettings({ value, disabled, onChange }: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [models, setModels] = useState<Awaited<ReturnType<typeof api.localModels>>>([])
  const [refreshing, setRefreshing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [error, setError] = useState('')
  const [download, setDownload] = useState<ModelDownloadStatus | null>(null)
  const downloading = download?.status === 'downloading'
  const ready = models.some((model) => model.isDefault)
    || download?.status === 'completed' || download?.status === 'already_downloaded'

  const refresh = async () => {
    setRefreshing(true)
    setError('')
    try {
      setModels(await api.localModels())
      setScanned(true)
      setDownload(await api.modelDownloadStatus())
    } catch (e) { setError(errorMessage(e)) }
    finally { setRefreshing(false) }
  }

  // Reattach to our download on returning to Settings; this doesn't start LM Studio.
  useEffect(() => {
    let active = true
    api.modelDownloadStatus().then((state) => { if (active) setDownload(state) }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!downloading) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const state = await api.modelDownloadStatus()
        if (!active) return
        setDownload(state)
        if (state?.status === 'downloading') timer = setTimeout(poll, 1500)
      } catch {
        if (active) {
          setDownload(null)
          setError('Progress unavailable. Refresh to reconnect.')
        }
      }
    }
    timer = setTimeout(poll, 1500)
    return () => { active = false; clearTimeout(timer) }
  }, [downloading])

  const startDownload = async () => {
    setStarting(true)
    setError('')
    try { setDownload(await api.downloadDefaultModel()) }
    catch (e) { setError(errorMessage(e)) }
    finally { setStarting(false) }
  }

  const total = download?.total_size_bytes
  const received = download?.downloaded_bytes
  const percent = total && received != null ? Math.min(100, Math.round(received / total * 100)) : undefined

  return (
    <Card className="local-ai-settings">
      <h3>Local AI</h3>
      <label>
        <span>Model<small>For @qwen and @big-qwen</small></span>
        <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          <option value="">Qwen 3.5 4B (default)</option>
          {value && !models.some((model) => model.key === value) &&
            <option value={value}>{value}{scanned ? ' (unavailable)' : ''}</option>}
          {models.map((model) => <option key={model.key} value={model.key}>{model.label}</option>)}
        </select>
      </label>
      <div className="local-ai-actions">
        {!ready && <button className="primary" disabled={starting || downloading || download?.status === 'paused'} onClick={startDownload}>
          <Download size={14} />{starting ? 'Starting…' : downloading ? 'Downloading…' : 'Download default'}
        </button>}
        <button className="outline" disabled={refreshing || starting} onClick={refresh}>
          <RefreshCw size={14} />{refreshing ? 'Refreshing…' : 'Refresh models'}
        </button>
        <a href="https://lmstudio.ai/docs/developer/core/headless" target="_blank" rel="noreferrer">Set up LM Studio <ExternalLink size={12} /></a>
      </div>
      {downloading && <div className="local-ai-progress" role="status">
        <progress max={100} value={percent} aria-label="Model download" />
        <span>{percent == null ? 'Downloading Qwen 3.5 4B…' : `${percent}% downloaded`}</span>
      </div>}
      {ready && <p className="local-ai-status" role="status">Qwen 3.5 4B is ready.</p>}
      {scanned && !models.length && !ready && !downloading && !error && <p className="local-ai-status">No models yet. Set up LM Studio, then download the default.</p>}
      {download?.status === 'paused' && <p className="local-ai-status">Download paused in LM Studio. Resume it there, then refresh.</p>}
      {download?.status === 'failed' && <p className="local-ai-status" role="alert">Download failed. Try again.</p>}
      {error && <p className="local-ai-status" role="alert">{error}</p>}
    </Card>
  )
}
