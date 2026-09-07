import { useEffect, useState } from 'react'
import {
  Check,
  ExternalLink,
  FileText,
  Leaf,
  Lightbulb,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
} from 'lucide-react'
import { useFocusNotebook } from '../hooks/useFocusNotebook'
import type { AppSettings, FocusContext } from '../domain'
import { LeetCodeWorkspace } from '../LeetCodeWorkspace'
import { Plant } from '../components/Plant'

interface FocusPageProps {
  context: FocusContext | null
  settings: AppSettings
  obscured?: boolean
  onPause: () => void
  onFinish: (notes: string) => void
  onBack: () => void
}

function EmptyFocus({ onBack }: { onBack: () => void }) {
  return (
    <div className="empty">
      <Plant large />
      <h2>No active session</h2>
      <p>Choose a problem from Today or Reviews to begin.</p>
      <button className="primary" onClick={onBack}>Go to Today</button>
    </div>
  )
}

export function FocusPage({ context, settings, onPause, onFinish, onBack, obscured = false }: FocusPageProps) {
  const [now, setNow] = useState(Date.now())
  const [revealed, setRevealed] = useState(0)
  const [toolsOpen, setToolsOpen] = useState(() => localStorage.getItem('leetjournal.focus.tools') !== 'closed')
  const [activeTool, setActiveTool] = useState<'notes' | 'hints'>('notes')
  const [webviewLabel, setWebviewLabel] = useState('')
  const {
    notes, notesInputRef, qwenRunning, qwenStatus, noteSaveFailed, canClearQwen,
    stopQwen, clearQwenOutput, retrySave, onNotesChange, onNotesScroll, onNotesKeyDown,
  } = useFocusNotebook(context, webviewLabel, obscured)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  if (!context) return <EmptyFocus onBack={onBack} />

  const { attempt } = context
  const started = new Date(attempt.startedAt).getTime()
  const pauseExtra = attempt.pausedAt ? now - new Date(attempt.pausedAt).getTime() : 0
  const seconds = Math.max(0, Math.floor((now - started - pauseExtra) / 1000) - attempt.pausedSeconds)
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const percent = Math.min(Math.round(seconds / (context.targetMinutes * 60) * 100), 100)

  const toggleTools = () => setToolsOpen((current) => {
    const next = !current
    localStorage.setItem('leetjournal.focus.tools', next ? 'open' : 'closed')
    return next
  })

  return (
    <div className="focus-workspace">
      <div className={`workspace-body ${toolsOpen ? '' : 'tools-collapsed'}`}>
        <LeetCodeWorkspace url={attempt.problem.leetcodeUrl} hidden={obscured} onReadyLabel={setWebviewLabel} />
        <aside className="workspace-side">
          <div className="session-dock">
            <div className="workspace-clock">
              <span className={attempt.pausedAt ? 'paused' : ''}>{attempt.pausedAt ? 'Paused' : 'Focus'}</span>
              <b>{time}</b>
              <button onClick={onPause} aria-label={attempt.pausedAt ? 'Resume timer' : 'Pause timer'}>
                {attempt.pausedAt ? <Play size={15} /> : <Pause size={15} />}
              </button>
            </div>
            <button className="tools-toggle" onClick={toggleTools} title={toolsOpen ? 'Hide study tools' : 'Show study tools'} aria-label={toolsOpen ? 'Hide study tools' : 'Show study tools'}>
              {toolsOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
            <a className="external-link" href={attempt.problem.leetcodeUrl} target="_blank" rel="noreferrer" title="Open in external browser">
              <ExternalLink size={16} />
            </a>
          </div>
          <section className="focus-progress">
            <div><span><Leaf size={13} />Focus goal</span><b>{percent}%</b></div>
            <div className="focus-progress-track"><i style={{ width: `${percent}%` }} /></div>
            <small>{Math.max(0, context.targetMinutes - Math.floor(seconds / 60))} minutes remaining</small>
          </section>
          <nav className="tool-tabs two" aria-label="Study tools">
            <button className={activeTool === 'notes' ? 'active' : ''} onClick={() => setActiveTool('notes')}><FileText size={14} />Notes</button>
            <button className={activeTool === 'hints' ? 'active' : ''} onClick={() => setActiveTool('hints')}><Lightbulb size={14} />Hints{revealed > 0 && <i>{revealed}</i>}</button>
          </nav>
          <div className="tool-panel">
            {activeTool === 'notes' && (
              <section className="focus-notes">
                <div className="notes-head">
                  <h3>Session notes</h3>
                  <div className="notes-actions">
                    {qwenRunning && <><span role="status"><LoaderCircle size={11} />{qwenStatus}</span><button type="button" onClick={() => void stopQwen()}>Stop</button></>}
                    {noteSaveFailed && <button type="button" onClick={retrySave}>Retry save</button>}
                    {!qwenRunning && canClearQwen && <button type="button" onClick={clearQwenOutput}>Clear response</button>}
                  </div>
                </div>
                <textarea
                  ref={notesInputRef}
                  aria-label="Session notes"
                  value={notes}
                  readOnly={qwenRunning}
                  onChange={onNotesChange}
                  onScroll={onNotesScroll}
                  onKeyDown={onNotesKeyDown}
                  placeholder="Write notes, ask @qwen, or use @big-qwen with problem + code context…"
                />
                <div className="qwen-commands"><span><b>@qwen</b> general question</span><span><b>@big-qwen</b> problem + notes + live code</span></div>
              </section>
            )}
            {activeTool === 'hints' && (
              <section className="hints-panel">
                <header>
                  <h3>{settings.progressiveHints ? 'Progressive hints' : 'Hints'}</h3>
                  <p>{settings.progressiveHints ? 'Reveal only what you need.' : 'Reveal the full hint set when you need it.'} The first hint is suggested after {settings.hintDelayMinutes} minutes.</p>
                </header>
                {context.hints.slice(0, revealed).map((hint, index) => <div className="revealed-hint" key={hint}><b>{index + 1}</b><span>{hint}</span></div>)}
                {revealed < context.hints.length
                  ? <button className="hint-button" onClick={() => setRevealed((current) => settings.progressiveHints ? current + 1 : context.hints.length)}>{settings.progressiveHints ? `Reveal hint ${revealed + 1}` : 'Reveal all hints'}</button>
                  : <p className="all-hints">All hints revealed.</p>}
              </section>
            )}
          </div>
          <button className="primary finish" disabled={qwenRunning} title={qwenRunning ? 'Stop the response or wait for it to finish before reflecting' : undefined} onClick={() => onFinish(notes)}><Check size={17} />Finish &amp; reflect</button>
        </aside>
      </div>
    </div>
  )
}
