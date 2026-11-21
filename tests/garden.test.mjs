import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gardenGrowth, elapsedFocus, BLOOM_SECONDS } from '../src/garden/growth.ts'

const now = Date.parse('2026-10-08T12:00:00Z')
const attempt = { id: 1, startedAt: new Date(now - 1800_000).toISOString(), pausedAt: null, pausedSeconds: 300 }
const state = seconds => ({ focusedSeconds: seconds, plants: [] })

test('growth boundaries: three 25-minute steps per bloom, deterministic varieties', () => {
  for (const [seconds, stage] of [[0, 0], [1499, 0], [1500, 1], [2999, 1], [3000, 2], [4499, 2]]) {
    assert.equal(gardenGrowth(state(seconds), [], now).stage, stage)
  }
  const next = gardenGrowth(state(BLOOM_SECONDS), [], now)
  assert.equal(next.stage, 0)
  assert.equal(next.name, 'Cosmos')
  assert.equal(gardenGrowth(state(BLOOM_SECONDS * 3), [], now).name, 'Daisy')
})

test('paused time stops growth and prior pauses are subtracted', () => {
  assert.equal(elapsedFocus(attempt, now), 1500)
  const paused = { ...attempt, pausedAt: new Date(now - 600_000).toISOString() }
  assert.equal(elapsedFocus(paused, now), 900)
  assert.equal(elapsedFocus(paused, now + 86400_000), 900)
  assert.equal(elapsedFocus({ ...attempt, startedAt: 'invalid' }, now), 0)
})

test('focus and review contributions accumulate once without losing small remainders', () => {
  const result = gardenGrowth(state(31), [attempt, attempt, { ...attempt, id: 2 }], now)
  assert.equal(result.totalSeconds, 3031)
  assert.equal(result.stage, 2)
})

test('live bloom stays on desk until saved and surplus carries into next plant', () => {
  const growing = gardenGrowth(state(3200), [attempt], now)
  assert.equal(growing.stage, 3)
  assert.equal(growing.percent, 100)
  assert.equal(growing.plantIndex, 0)
  const saved = gardenGrowth(state(growing.totalSeconds), [], now)
  assert.equal(saved.plantIndex, 1)
  assert.equal(saved.stage, 0)
  assert.equal(saved.totalSeconds, growing.totalSeconds)
  assert.equal(saved.minutesToNext, 22)
})

test('no decay after time away and no dependence on solved count or outcome', () => {
  assert.deepEqual(gardenGrowth(state(3700), [], now), gardenGrowth(state(3700), [], now + 365 * 86400_000))
})
