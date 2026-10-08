import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PlaybackIntent } from '../src/spotify/playbackIntent.ts'

const playback = (playing = true) => ({ running: true, is_playing: playing, progress_ms: 10000,
  item: { url: 'spotify:track:abc', name: 'Song', artist: 'Artist' } })

test('stale reads cannot reverse pause before it is confirmed', () => {
  const intent = new PlaybackIntent()
  intent.begin(1, playback(), false)
  intent.acknowledge(1, 100)
  assert.equal(intent.shouldDefer(playback(), 200), true)
  assert.equal(intent.shouldDefer(playback(), 1000), true)
  assert.equal(intent.shouldDefer(playback(false), 1100), false)
  // Once confirmed, a genuine external play is accepted immediately.
  assert.equal(intent.shouldDefer(playback(), 1200), false)
})

test('latest play/pause wins over older acknowledgements and failures', () => {
  const intent = new PlaybackIntent()
  intent.begin(1, playback(), false)
  intent.begin(2, playback(false), true)
  intent.acknowledge(1, 0)
  intent.clear(1)
  intent.acknowledge(2, 5000)
  assert.equal(intent.shouldDefer(playback(false), 6000), true)
  assert.equal(intent.shouldDefer(playback(), 6100), false)
})

test('failed or unconfirmed commands cannot hide real state indefinitely', () => {
  const intent = new PlaybackIntent()
  intent.begin(1, playback(), false)
  intent.acknowledge(1, 100)
  assert.equal(intent.shouldDefer(playback(), 2100), false)
  intent.begin(2, playback(), false)
  intent.clear(2)
  assert.equal(intent.shouldDefer(playback(), 2200), false)
})

test('track changes and Spotify closing override pending intent', () => {
  const intent = new PlaybackIntent()
  intent.begin(1, playback(), false)
  const nextTrack = playback()
  nextTrack.item.url = 'spotify:track:def'
  assert.equal(intent.shouldDefer(nextTrack, 0), false)
  intent.begin(2, playback(), false)
  assert.equal(intent.shouldDefer({ ...playback(), running: false, item: null }, 0), false)
})
