// Optional browser regression: start npm run dev, then run this file with
// Playwright installed, or set PLAYWRIGHT_MODULE and CHROMIUM_PATH externally.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.spotifyEnabled = false
    window.spotifyRunning = true
    window.spotifyPlaying = true
    window.spotifyTrack = 'A very long quiet piano track for focused practice'
    window.spotifyPosition = 84000
    window.calls = []
    const callbacks = new Map()
    const listeners = new Map()
    let callbackId = 0
    window.spotifyEvent = () => {
      for (const [id, handler] of listeners) callbacks.get(handler)?.({ event: 'spotify-playback-changed', id, payload: null })
    }
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_, id) => listeners.delete(id) }
    const playback = () => ({ running: window.spotifyRunning, is_playing: Date.now() < window.spotifyStaleUntil ? window.spotifyStalePlaying : window.spotifyPlaying,
      progress_ms: window.spotifyPosition, volume_percent: 35, item: window.spotifyRunning ? {
        name: window.spotifyTrack, artist: 'Quiet Hours', duration_ms: 210000,
        artwork_url: '', url: 'spotify:track:abc123',
      } : null })
    window.__TAURI_INTERNALS__ = { transformCallback: callback => { callbacks.set(++callbackId, callback); return callbackId }, invoke: async (cmd, args) => {
      window.calls.push({ cmd, args })
      if (cmd === 'plugin:event|listen') { listeners.set(args.handler, args.handler); return args.handler }
      if (cmd === 'plugin:event|unlisten') { callbacks.delete(args.eventId); return null }
      if (cmd === 'spotify_status') return { enabled: window.spotifyEnabled, supported: true }
      if (cmd === 'spotify_connect') {
        if (window.spotifyDenied) throw Error('Allow LeetJournal in macOS Automation, then retry.')
        window.spotifyEnabled = true
        return { enabled: true, supported: true }
      }
      if (cmd === 'spotify_disconnect') { window.spotifyEnabled = false; return null }
      if (cmd === 'spotify_playback') {
        const snapshot = playback()
        if (window.spotifyReadDelay) await new Promise(resolve => setTimeout(resolve, window.spotifyReadDelay))
        return window.spotifySkipRead ? null : snapshot
      }
      if (cmd === 'spotify_control') {
        if (window.spotifyFail) throw Error('Spotify could not complete that action. Open Spotify and try again.')
        if (window.spotifyDelay) await new Promise(resolve => setTimeout(resolve, window.spotifyDelay))
        if (args.action.type === 'pause') window.spotifyPlaying = false
        if (args.action.type === 'play') window.spotifyPlaying = true
        if (args.action.type === 'open') window.spotifyRunning = true
        if (args.action.type === 'seek') window.spotifyPosition = args.action.position
        return null
      }
      throw Error('Unexpected command: ' + cmd)
    } }
  })
  await page.route('**/spotify-ui-test', route => route.fulfill({ contentType: 'text/html', body:
    `<script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><div id="root"></div><script type="module">import '/tests/spotify-preview.tsx';</script>` }))
  await page.goto('http://127.0.0.1:1420/spotify-ui-test')
  await page.getByRole('button', { name: 'Enable Spotify', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.calls.some(c => c.cmd === 'spotify_playback')), false)
  await page.evaluate(() => { window.spotifyDenied = true })
  await page.getByRole('button', { name: 'Enable Spotify', exact: true }).click()
  await page.getByRole('status').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Finish & reflect' }).isEnabled(), true)
  await page.evaluate(() => { window.spotifyDenied = false })
  await page.getByRole('button', { name: 'Enable Spotify', exact: true }).click()
  await page.getByText('Now playing', { exact: true }).waitFor()
  // Progress advances locally without waiting for a native poll.
  await page.getByLabel('Track position').waitFor()
  const elapsed = await page.getByTestId('spotify-elapsed').innerText()
  await page.waitForFunction(value => document.querySelector('[data-testid="spotify-elapsed"]').textContent !== value, elapsed)
  // Spotify may acknowledge pause before its read API stops reporting playing.
  await page.evaluate(() => { window.spotifyStalePlaying = true; window.spotifyStaleUntil = Date.now() + 900 })
  await page.getByRole('button', { name: 'Pause music', exact: true }).click()
  // A command acknowledges without returning a playback snapshot.
  await page.getByRole('button', { name: 'Play music', exact: true }).waitFor()
  await page.getByText('Paused', { exact: true }).waitFor()
  await page.evaluate(() => {
    window.pauseLabels = []
    const state = document.querySelector('.spotify-state')
    window.pauseObserver = new MutationObserver(() => window.pauseLabels.push(state.textContent))
    window.pauseObserver.observe(state, { childList: true, characterData: true, subtree: true })
  })
  await page.waitForTimeout(1200)
  assert.equal(await page.evaluate(() => window.pauseLabels.includes('Now playing')), false, 'stale playback must not undo the pause UI')
  await page.evaluate(() => window.pauseObserver.disconnect())
  // External play/pause/track notifications bypass the two-second fallback.
  await page.waitForTimeout(250)
  await page.evaluate(() => { window.spotifyPlaying = true; window.spotifyTrack = 'Started in Spotify'; window.spotifyEvent() })
  await page.getByText('Started in Spotify', { exact: true }).waitFor({ timeout: 1000 })
  await page.getByText('Now playing', { exact: true }).waitFor({ timeout: 1000 })
  // A change during a slow read must trigger a second read, not be dropped.
  await page.evaluate(() => { window.spotifyReadDelay = 350; window.dispatchEvent(new Event('focus')) })
  await page.waitForTimeout(100)
  const beforeBurst = await page.evaluate(() => window.calls.filter(c => c.cmd === 'spotify_playback').length)
  await page.evaluate(() => { window.spotifyPlaying = false; window.spotifyTrack = 'Changed during sync'; for (let i = 0; i < 20; i++) window.spotifyEvent() })
  await page.getByText('Changed during sync', { exact: true }).waitFor({ timeout: 1200 })
  await page.getByText('Paused', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.cmd === 'spotify_playback').length), beforeBurst + 1)
  await page.evaluate(() => { window.spotifyReadDelay = 0 })
  await page.evaluate(() => { window.spotifyTrack = 'A new song from Spotify'; window.spotifyPosition = 10000 })
  await page.getByText('A new song from Spotify', { exact: true }).waitFor()
  assert.equal(await page.getByTestId('spotify-elapsed').innerText(), '0:10')
  // A return-to-app event should refresh immediately, not wait for a poll.
  await page.evaluate(() => { window.spotifyTrack = 'Back in focus'; window.dispatchEvent(new Event('focus')) })
  await page.getByText('Back in focus', { exact: true }).waitFor()
  // An interrupted native read returns null, not an error or empty playback.
  await page.evaluate(() => { window.spotifySkipRead = true; window.dispatchEvent(new Event('focus')) })
  await page.waitForTimeout(100)
  assert.equal(await page.getByText('Back in focus', { exact: true }).count(), 1)
  assert.equal(await page.getByRole('status').count(), 0)
  await page.evaluate(() => { window.spotifySkipRead = false })
  // Slow native calls must not disable scrubbing or pull the thumb backwards.
  await page.evaluate(() => { window.spotifyDelay = 700 })
  const slider = page.getByLabel('Track position')
  const box = await slider.boundingBox()
  const point = ratio => ({ x: box.x + 6 + (box.width - 12) * ratio, y: box.y + box.height / 2 })
  const clickAt = async ratio => { const p = point(ratio); await page.mouse.click(p.x, p.y) }
  const seekCount = await page.evaluate(() => window.calls.filter(c => c.args?.action?.type === 'seek').length)
  await clickAt(0.3)
  assert.ok(Math.abs(Number(await slider.inputValue()) - 63000) <= 1000)
  assert.equal(await slider.isEnabled(), true)
  await clickAt(0.5)
  await clickAt(0.7)
  assert.ok(Math.abs(Number(await slider.inputValue()) - 147000) <= 1000)
  await page.waitForTimeout(900)
  assert.ok(Math.abs(Number(await slider.inputValue()) - 147000) <= 1000)
  await page.waitForFunction(() => Math.abs(window.spotifyPosition - 147000) < 1000)
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.args?.action?.type === 'seek').length), seekCount + 2)
  await page.waitForTimeout(600)
  assert.ok(Math.abs(Number(await slider.inputValue()) - 147000) <= 1000)
  // Pointer capture commits a drag released outside the original hit area once.
  const start = point(0.2)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width + 40, box.y - 30, { steps: 5 })
  assert.equal(Number(await slider.inputValue()), 210000)
  await page.mouse.up()
  await page.waitForFunction(() => window.spotifyPosition === 210000)
  await page.evaluate(() => { window.spotifyDelay = 0 })
  // Keyboard seeking and blur must not send duplicate commands.
  await slider.focus()
  const keyCount = await page.evaluate(() => window.calls.filter(c => c.args?.action?.type === 'seek').length)
  await page.keyboard.press('Home')
  await page.getByLabel('Session notes').click()
  await page.waitForFunction(() => window.spotifyPosition === 0)
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.args?.action?.type === 'seek').length), keyCount + 1)
  // A read started before a seek must not overwrite the user's new position.
  await page.evaluate(() => { window.spotifyReadDelay = 700; window.dispatchEvent(new Event('focus')) })
  await page.waitForTimeout(100)
  await clickAt(0.3)
  await page.waitForTimeout(800)
  assert.ok(Math.abs(Number(await slider.inputValue()) - 63000) <= 1000)
  await page.evaluate(() => { window.spotifyReadDelay = 0; window.dispatchEvent(new Event('focus')) })
  await page.screenshot({ path: '/private/tmp/leetjournal-spotify-widget.png' })
  assert.equal(await page.getByRole('button', { name: 'Expand Spotify controls' }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Settings', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Open Spotify', exact: true }).count(), 0)
  assert.ok(await page.locator('.spotify-player').evaluate(el => el.getBoundingClientRect().height < 160))
  assert.equal(await page.locator('.spotify-logo').count(), 0)
  assert.equal(await page.locator('.spotify-player').evaluate(el => el.scrollWidth <= el.clientWidth), true)
  assert.equal(await page.getByLabel('Session notes').inputValue(), 'My notes stay available')
  assert.equal(await page.getByRole('combobox').count(), 0)
  await page.screenshot({ path: '/private/tmp/leetjournal-spotify-local-player.png' })
  await page.evaluate(() => { window.spotifyFail = true })
  await page.getByRole('button', { name: 'Next track', exact: true }).click()
  await page.getByRole('status').waitFor()
  await page.evaluate(() => { window.spotifyFail = false; window.spotifyRunning = false })
  await page.getByRole('button', { name: 'Sync again', exact: true }).click()
  await page.getByText('Spotify is closed', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Play music', exact: true }).isEnabled(), false)
  assert.equal(await page.getByRole('button', { name: 'Open Spotify', exact: true }).count(), 0)
  await page.evaluate(() => { window.spotifyRunning = true; window.spotifyEvent() })
  await page.getByRole('button', { name: 'Play music', exact: true }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Test: settings page', exact: true }).click()
  await page.getByRole('button', { name: 'Disable', exact: true }).click()
  await page.getByRole('button', { name: 'Enable Spotify', exact: true }).waitFor()
  assert.equal(await page.getByRole('textbox').count(), 0)
  await page.screenshot({ path: '/private/tmp/leetjournal-spotify-local-settings.png' })
  const polls = await page.evaluate(() => window.calls.filter(c => c.cmd === 'spotify_playback').length)
  await page.evaluate(() => window.spotifyEvent())
  await page.waitForTimeout(5500)
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.cmd === 'spotify_playback').length), polls)
  assert.deepEqual(errors, [])
  console.log('PASS: click/drag/keyboard seek, release outside, no snapback with slow native calls, latest-seek queue, immediate playback feedback, sync, narrow layout, notes, closed/open Spotify, disable, no hidden polling')
} finally { await browser.close() }
