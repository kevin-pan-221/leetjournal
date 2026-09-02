import { useState } from 'react'
import { X } from 'lucide-react'
import type { FinishAttemptInput, FocusContext } from '../domain'

const outcomes = ['Easy', 'Solved', 'Struggled', 'Needed hint', "Couldn't solve"]
const outcomeIcons = ['😊', '😌', '😓', '🤔', '😵']
const mistakes = [
  'Pattern recognition',
  'Implementation',
  'Edge case',
  'Overcomplicated',
  'Off-by-one',
  'Complexity',
  'Data structure',
  'Other',
]

interface ReflectionDialogProps {
  context: FocusContext
  initialNotes: string
  onSave: (input: Omit<FinishAttemptInput, 'attemptId'>) => Promise<void>
  onCancel: () => void
}

export function ReflectionDialog({ context, initialNotes, onSave, onCancel }: ReflectionDialogProps) {
  const [outcome, setOutcome] = useState('Solved')
  const [confidence, setConfidence] = useState(4)
  const [notes, setNotes] = useState(initialNotes)
  const [selectedMistakes, setSelectedMistakes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave({ outcome, confidence, notes, mistakes: selectedMistakes })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="log-modal">
        <button className="modal-close" disabled={saving} onClick={onCancel} aria-label="Close reflection">
          <X />
        </button>
        <span className="eyebrow">Log entry · {context.attempt.problem.title}</span>
        <h2>How did it go?</h2>
        <div className="outcomes">
          {outcomes.map((value, index) => (
            <button disabled={saving} className={outcome === value ? 'selected' : ''} onClick={() => setOutcome(value)} key={value}>
              <span>{outcomeIcons[index]}</span>{value}
            </button>
          ))}
        </div>
        <h3>What tripped you up? <small>(Select all that apply)</small></h3>
        <div className="tags">
          {mistakes.map((value) => (
            <button
              disabled={saving}
              className={selectedMistakes.includes(value) ? 'selected' : ''}
              onClick={() => setSelectedMistakes((current) => current.includes(value)
                ? current.filter((item) => item !== value)
                : [...current, value])}
              key={value}
            >
              {value}
            </button>
          ))}
        </div>
        <h3>Confidence</h3>
        <div className="confidence">
          {[1, 2, 3, 4, 5].map((value) => (
            <button disabled={saving} className={confidence === value ? 'selected' : ''} onClick={() => setConfidence(value)} key={value}>
              {value}
            </button>
          ))}
        </div>
        <h3>What did I learn?</h3>
        <textarea
          disabled={saving}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Write your key takeaways, patterns, or anything you want to remember…"
        />
        <button className="primary save" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save entry'}
        </button>
      </div>
    </div>
  )
}
