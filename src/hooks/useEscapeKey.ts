import { useEffect, useRef } from 'react'

export function useEscapeKey(enabled: boolean, onEscape: () => void) {
  const callback = useRef(onEscape)
  useEffect(() => {
    callback.current = onEscape
  }, [onEscape])

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') callback.current()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled])
}
