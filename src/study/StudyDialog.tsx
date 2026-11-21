import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Native modal keeps keyboard focus inside and makes the room behind it inert. */
export function StudyDialog({
  title,
  busy,
  onClose,
  children,
  variant,
  motion = true,
}: {
  title: string
  busy: boolean
  onClose: () => void
  children: ReactNode
  variant?: 'table' | 'stand' | 'shelves'
  motion?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`study-dialog study-dialog-${variant ?? 'default'}`}
      aria-labelledby="study-dialog-title"
      aria-busy={busy}
      data-motion={motion ? 'on' : 'off'}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return
        const r = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          onClose()
      }}
    >
      <header>
        <div>
          <small>Your study</small>
          <h2 id="study-dialog-title">{title}</h2>
        </div>
        <button
          type="button"
          disabled={busy}
          aria-label="Return to room"
          onClick={onClose}
          autoFocus
        >
          <X size={20} />
        </button>
      </header>
      <div className="study-dialog-content">{children}</div>
      <footer>Esc to return to your room</footer>
    </dialog>
  )
}
