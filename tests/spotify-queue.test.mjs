import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SpotifyCommandQueue } from '../src/spotify/commandQueue.ts'

function fixture() {
  const calls = []
  const pending = []
  const queue = new SpotifyCommandQueue(action => {
    calls.push(action)
    return new Promise((resolve, reject) => pending.push({ resolve, reject }))
  })
  return { queue, calls, pending }
}
test('waiting seeks coalesce to the latest target without dropping the in-flight seek', async () => {
  const f = fixture()
  const a = f.queue.enqueue({ type: 'seek', position: 1000 })
  const b = f.queue.enqueue({ type: 'seek', position: 2000 })
  const c = f.queue.enqueue({ type: 'seek', position: 3000 })
  assert.equal(await b, false)
  assert.equal(f.calls.length, 1)
  f.pending[0].resolve({ progress_ms: 1000 })
  await a
  assert.deepEqual(f.calls.map(c => c.position), [1000, 3000])
  f.pending[1].resolve({ progress_ms: 3000 })
  assert.equal(await c, true)
  assert.equal(f.queue.busy, false)
})
test('transport commands keep ordering and are never repeated after errors', async () => {
  const f = fixture()
  const a = f.queue.enqueue({ type: 'next' })
  const b = f.queue.enqueue({ type: 'seek', position: 2000 })
  const c = f.queue.enqueue({ type: 'previous' })
  const d = f.queue.enqueue({ type: 'seek', position: 3000 })
  const rejection = assert.rejects(a, /unavailable/)
  f.pending[0].reject(new Error('unavailable'))
  await rejection
  f.pending[1].resolve({})
  await b
  f.pending[2].resolve({})
  await c
  f.pending[3].resolve({})
  await d
  assert.deepEqual(f.calls.map(c => c.type), ['next', 'seek', 'previous', 'seek'])
  assert.equal(f.queue.busy, false)
})
