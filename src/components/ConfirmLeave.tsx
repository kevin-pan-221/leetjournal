import { Leaf, Pause } from 'lucide-react'

interface ConfirmLeaveProps {
  problem: string
  onStay: () => void
  onPauseExit: () => void
  onEnd: () => void
}

export function ConfirmLeave({ problem, onStay, onPauseExit, onEnd }: ConfirmLeaveProps) {
  return (
    <div
      className="leave-session-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onStay()}
    >
      <section
        className="leave-session-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-session-title"
      >
        <span className="leave-session-icon"><Leaf size={20} /></span>
        <small>Focus session in progress</small>
        <h2 id="leave-session-title">Leave focus mode?</h2>
        <p>
          Pause <b>{problem}</b> and return to your journal. Your timer, notes, and editor will be
          ready when you resume.
        </p>
        <div className="leave-actions">
          <button className="leave-stay" autoFocus onClick={onStay}>Keep focusing</button>
          <button className="leave-confirm" onClick={onPauseExit}>
            <Pause size={15} /> Pause &amp; exit
          </button>
        </div>
        <button className="leave-end" onClick={onEnd}>End this attempt instead</button>
        <em>Press Esc to keep focusing</em>
      </section>
    </div>
  )
}
