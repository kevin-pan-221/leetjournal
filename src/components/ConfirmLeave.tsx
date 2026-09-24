import { Leaf, Pause } from 'lucide-react'

interface ConfirmLeaveProps {
  problem: string
  isReview?: boolean
  onStay: () => void
  onPauseExit: () => void
  onEnd: () => void
}

export function ConfirmLeave({ problem, isReview = false, onStay, onPauseExit, onEnd }: ConfirmLeaveProps) {
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
        <small>{isReview ? 'Review in progress' : 'Focus session in progress'}</small>
        <h2 id="leave-session-title">{isReview ? 'Leave this review?' : 'Leave focus mode?'}</h2>
        <p>
          Pause <b>{problem}</b> and return to {isReview ? 'Reviews' : 'your practice'}. Your timer, notes, and editor will be
          ready when you resume.
        </p>
        <div className="leave-actions">
          <button className="leave-stay" autoFocus onClick={onStay}>{isReview ? 'Keep reviewing' : 'Keep focusing'}</button>
          <button className="leave-confirm" onClick={onPauseExit}>
            <Pause size={15} /> Pause &amp; exit
          </button>
        </div>
        <button className="leave-end" onClick={onEnd}>End this attempt instead</button>
        <em>Press Esc to keep {isReview ? 'reviewing' : 'focusing'}</em>
      </section>
    </div>
  )
}
