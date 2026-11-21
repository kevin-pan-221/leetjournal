import type { Attempt, GardenState } from '../domain'

export const STEP_SECONDS = 25 * 60
export const BLOOM_SECONDS = STEP_SECONDS * 3
export const PLANT_NAMES = ['Daisy', 'Cosmos', 'Clover'] as const
export const STAGE_NAMES = ['Seed', 'Sprout', 'Leafy', 'Bloom'] as const

export function elapsedFocus(attempt: Attempt, now: number): number {
  const end = attempt.pausedAt ? Math.min(Date.parse(attempt.pausedAt), now) : now
  const seconds = Math.floor((end - Date.parse(attempt.startedAt)) / 1000) - attempt.pausedSeconds
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0
}

export function gardenGrowth(state: GardenState, attempts: Attempt[], now: number) {
  // Both independent session slots contribute, but each attempt is counted once.
  const unique = new Map(attempts.map(attempt => [attempt.id, attempt]))
  const liveSeconds = [...unique.values()].reduce((total, attempt) => total + elapsedFocus(attempt, now), 0)
  const savedSeconds = Math.max(0, state.focusedSeconds)
  const plantIndex = Math.floor(savedSeconds / BLOOM_SECONDS)
  const plantSeconds = savedSeconds % BLOOM_SECONDS + liveSeconds
  // Keep a live bloom on the desk until the attempt is saved/ended. Any surplus
  // carries to the next pot once committed, without losing partial minutes.
  const stage = Math.min(3, Math.floor(plantSeconds / STEP_SECONDS))
  return {
    plantIndex, stage, name: PLANT_NAMES[plantIndex % PLANT_NAMES.length],
    totalSeconds: savedSeconds + liveSeconds,
    percent: Math.min(100, plantSeconds / BLOOM_SECONDS * 100),
    minutesToNext: Math.max(0, Math.ceil(((stage + 1) * STEP_SECONDS - plantSeconds) / 60)),
    blooming: stage === 3,
  }
}

export type GardenGrowth = ReturnType<typeof gardenGrowth>
