import { test } from 'node:test'
import assert from 'node:assert/strict'
import { playbackPosition, spotifyLink } from '../src/spotify/api.ts'

test('progress is local, stops when paused, and stays inside track bounds', () => {
  const playback = { is_playing: true, progress_ms: 1000, item: { duration_ms: 5000 } }
  assert.equal(playbackPosition(playback, 10000, 12000), 3000)
  assert.equal(playbackPosition(playback, 10000, 9000), 1000)
  assert.equal(playbackPosition(playback, 10000, 20000), 5000)
  assert.equal(playbackPosition({ ...playback, is_playing: false }, 10000, 20000), 1000)
  assert.equal(playbackPosition(null, 0, 20000), 0)
  assert.equal(playbackPosition({ ...playback, item: { duration_ms: 300000 } }, 10000, 120000), 6000)
})

test('external track links stay on Spotify', () => {
  assert.equal(spotifyLink('spotify:track:abc123'), 'https://open.spotify.com/track/abc123')
  assert.equal(spotifyLink('spotify:episode:abc123'), 'https://open.spotify.com/episode/abc123')
  assert.equal(spotifyLink('https://open.spotify.com/track/example'), 'https://open.spotify.com/track/example')
  for (const url of ['javascript:alert(1)', 'http://open.spotify.com/', 'https://open.spotify.com.evil.test/', undefined]) {
    assert.equal(spotifyLink(url), 'https://open.spotify.com/')
  }
})
