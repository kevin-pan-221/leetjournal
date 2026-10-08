import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../src-tauri/src/spotify/player.js', import.meta.url), 'utf8')
function fixture({ running = true, state = 'playing', denied = false, missing = false } = {}) {
  const calls = []
  let position = 12.5
  let volume = 40
  const app = {
    running: () => running,
    activate: () => { calls.push('open'); running = true },
    playerState: () => { if (denied) throw { errorNumber: -1743 }; return state },
    soundVolume: () => 40,
    playerPosition: () => 12.5,
    currentTrack: { name: () => 'A "quoted" song\nwith unicode 🌱', artist: () => 'Artist', duration: () => 180000,
      artworkUrl: () => 'https://i.scdn.co/image/test', spotifyUrl: () => 'spotify:track:abc123' },
    play: () => { calls.push('play'); state = 'playing' },
    pause: () => { calls.push('pause'); state = 'paused' },
    nextTrack: () => { calls.push('next') },
    previousTrack: () => { calls.push('previous') },
  }
  Object.defineProperty(app, 'playerPosition', { get: () => () => position, set: value => { position = value } })
  Object.defineProperty(app, 'soundVolume', { get: () => () => volume, set: value => { volume = value } })
  const run = runInNewContext(`${source}; run`, { Application: id => {
    assert.equal(id, 'com.spotify.client')
    if (missing) throw new Error('Application cannot be found')
    return app
  } })
  return { app, calls, run: (...args) => JSON.parse(run(args)) }
}

test('reading playback and controls never relaunch a closed Spotify', () => {
  const f = fixture({ running: false })
  assert.equal(f.run('playback').running, false)
  assert.equal(f.run('play').error, 'closed')
  assert.deepEqual(f.calls, [])
})
test('only explicit enable/open launches Spotify without starting playback', () => {
  for (const action of ['enable', 'open']) {
    const f = fixture({ running: false, state: 'stopped' })
    assert.equal(f.run(action), null)
    assert.equal(f.run('playback').running, true)
    assert.deepEqual(f.calls, ['open'])
  }
})
test('permission denial and missing installation produce specific errors', () => {
  assert.equal(fixture({ denied: true }).run('enable').error, 'permission')
  assert.equal(fixture({ missing: true }).run('enable').error, 'missing')
})
test('track metadata is JSON escaped and position uses milliseconds', () => {
  const p = fixture().run('playback')
  assert.equal(p.item.name, 'A "quoted" song\nwith unicode 🌱')
  assert.equal(p.progress_ms, 12500)
  assert.equal(p.item.duration_ms, 180000)
  assert.equal(p.volume_percent, 40)
})
test('playback controls execute once and reflect pause state', () => {
  const f = fixture()
  assert.equal(f.run('pause'), null)
  assert.equal(f.run('playback').is_playing, false)
  assert.equal(f.run('play'), null)
  assert.equal(f.run('playback').is_playing, true)
  f.run('next'); f.run('previous')
  assert.deepEqual(f.calls, ['pause', 'play', 'next', 'previous'])
})
test('seek converts milliseconds to seconds and clamps to track length', () => {
  const f = fixture()
  assert.equal(f.run('seek', '999999'), null)
  assert.equal(f.run('playback').progress_ms, 180000)
  const g = fixture()
  g.run('seek', '2500')
  assert.equal(g.run('playback').progress_ms, 2500)
})
test('volume updates are reflected in the returned playback snapshot', () => {
  const f = fixture()
  assert.equal(f.run('volume', '80'), null)
  assert.equal(f.run('playback').volume_percent, 80)
})
test('missing artwork does not break basic playback', () => {
  const f = fixture()
  f.app.currentTrack.artworkUrl = () => { throw new Error('No artwork') }
  assert.equal(f.run('playback').item.artwork_url, '')
})
test('controls acknowledge without reading playback state or song metadata', () => {
  const f = fixture()
  const unexpected = () => { throw new Error('Unexpected playback read') }
  f.app.playerState = unexpected
  for (const key of ['name', 'artist', 'artworkUrl', 'spotifyUrl']) f.app.currentTrack[key] = unexpected
  for (const action of ['play', 'pause', 'next', 'previous', 'open']) assert.equal(f.run(action), null)
  assert.equal(f.run('seek', '2500'), null)
  assert.deepEqual(f.calls, ['play', 'pause', 'next', 'previous', 'open'])
})
