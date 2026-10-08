import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

const time = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const seekKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])

export function SpotifySeekBar({ position, duration, disabled, onSeek }: {
  position: number; duration: number; disabled: boolean; onSeek: (position: number) => Promise<boolean>
}) {
  const [preview, setPreview] = useState<number | null>(null)
  const draft = useRef<number | null>(null)
  const pointer = useRef<number | null>(null)
  const revision = useRef(0)
  const setDraft = (value: number) => {
    draft.current = value
    setPreview(value)
  }
  const fromPointer = (event: PointerEvent<HTMLInputElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    // Match the 12px thumb's usable rail, including exact start/end positions.
    const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left - 6) / Math.max(1, rect.width - 12)))
    return Math.round(fraction * duration)
  }
  const commit = () => {
    const value = draft.current
    if (value === null) return
    draft.current = null
    const request = ++revision.current
    // Keep the preview until the command has completed. A newer gesture wins.
    void onSeek(value).finally(() => {
      if (request === revision.current) setPreview(null)
    })
  }
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (seekKeys.has(event.key)) ++revision.current
    if (event.key.startsWith('Arrow')) {
      event.preventDefault()
      const direction = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1
      setDraft(Math.max(0, Math.min(duration, (draft.current ?? preview ?? position) + direction * 1000)))
    }
  }
  const value = preview ?? position
  return <div className="spotify-progress">
    <input aria-label="Track position" aria-valuetext={`${time(value)} of ${time(duration)}`} type="range" min="0" max={duration} step="1" value={value} disabled={disabled}
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary || disabled) return
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        event.currentTarget.setPointerCapture(event.pointerId)
        pointer.current = event.pointerId
        ++revision.current
        setDraft(fromPointer(event))
      }}
      onPointerMove={event => { if (pointer.current === event.pointerId) setDraft(fromPointer(event)) }}
      onPointerUp={event => {
        if (pointer.current !== event.pointerId) return
        setDraft(fromPointer(event))
        pointer.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
        commit()
      }}
      onPointerCancel={() => { pointer.current = null; draft.current = null; ++revision.current; setPreview(null) }}
      onLostPointerCapture={() => {
        if (pointer.current !== null) { pointer.current = null; draft.current = null; ++revision.current; setPreview(null) }
      }}
      onChange={event => setDraft(event.currentTarget.valueAsNumber)}
      onKeyDown={keyDown}
      onKeyUp={event => { if (seekKeys.has(event.key)) commit() }}
      onBlur={() => { if (pointer.current === null) commit() }}
    />
    <div className="spotify-times"><span data-testid="spotify-elapsed">{time(value)}</span><span>{time(duration)}</span></div>
  </div>
}
