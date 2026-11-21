import { useEffect, useState } from 'react'
import type { FocusContext, GardenState } from '../domain'
import { gardenGrowth } from './growth'

export function useGardenGrowth(state: GardenState | null, focus: FocusContext | null, review: FocusContext | null) {
  const [now, setNow] = useState(Date.now())
  const running = Boolean((focus && !focus.attempt.pausedAt) || (review && !review.attempt.pausedAt))
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const sync = () => {
      clearInterval(timer)
      setNow(Date.now())
      if (running && !document.hidden) timer = setInterval(() => setNow(Date.now()), 1000)
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', sync) }
  }, [running, focus?.attempt.id, focus?.attempt.pausedAt, review?.attempt.id, review?.attempt.pausedAt])
  return gardenGrowth(state ?? { focusedSeconds: 0, plants: [] },
    [focus?.attempt, review?.attempt].filter(attempt => attempt !== undefined), now)
}
