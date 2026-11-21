import { useRef } from 'react'
import { clampSplit, saveSplit, splitLimits } from './layout'
import type { SplitPanel } from './layout'

/** Pointer capture keeps resizing reliable outside the handle without global listeners. */
export function SplitHandle({ panel, value, onChange }: { panel: SplitPanel; value: number; onChange: (value: number) => void }) {
  const drag = useRef<{ pointer: number; start: number; value: number; size: number } | null>(null)
  const current = useRef(value)
  current.current = value
  const horizontal = panel === 'description'
  const update = (next: number) => { current.current = clampSplit(panel, next); onChange(current.current) }
  const commit = () => { if (drag.current) { saveSplit(panel, current.current); drag.current = null } }
  return <div className={`offline-split-handle ${horizontal ? 'columns' : 'rows'}`} role="separator" tabIndex={0}
    aria-label={horizontal ? 'Resize description panel' : 'Resize test panel'} aria-orientation={horizontal ? 'vertical' : 'horizontal'}
    aria-valuemin={splitLimits[panel].min} aria-valuemax={splitLimits[panel].max} aria-valuenow={Math.round(value)}
    aria-valuetext={`${Math.round(value)} percent`} title="Drag to resize · arrow keys to adjust · double-click to reset"
    onDoubleClick={() => { update(splitLimits[panel].initial); saveSplit(panel, current.current) }}
    onPointerDown={event => {
      if (event.button !== 0) return
      const bounds = event.currentTarget.parentElement!.getBoundingClientRect()
      const size = horizontal ? bounds.width : bounds.height
      if (size <= 0) return
      event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { pointer: event.pointerId, start: horizontal ? event.clientX : event.clientY, value, size }
    }}
    onPointerMove={event => {
      const active = drag.current
      if (!active || active.pointer !== event.pointerId) return
      const distance = (horizontal ? event.clientX : event.clientY) - active.start
      update(active.value + (horizontal ? 1 : -1) * distance / active.size * 100)
    }}
    onPointerUp={event => { if (drag.current?.pointer === event.pointerId) { commit(); event.currentTarget.releasePointerCapture(event.pointerId) } }}
    onPointerCancel={commit} onLostPointerCapture={commit}
    onKeyDown={event => {
      let next = value
      if (event.key === 'Home') next = splitLimits[panel].min
      else if (event.key === 'End') next = splitLimits[panel].max
      else if (event.key === (horizontal ? 'ArrowRight' : 'ArrowUp')) next += 2
      else if (event.key === (horizontal ? 'ArrowLeft' : 'ArrowDown')) next -= 2
      else return
      event.preventDefault(); update(next); saveSplit(panel, current.current)
    }}><span /></div>
}
