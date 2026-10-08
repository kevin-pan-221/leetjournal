import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// Each test runs the real Bash entry point with fake tools. No installs/network.
const stub = `#!/bin/bash
name="$(basename "$0")"
printf '%s %s\\n' "$name" "$*" >> "$SETUP_TEST_ROOT/calls"
case "$name" in
  uname) echo "$SETUP_TEST_OS" ;;
  xcode-select|xcrun)
    if [[ "$SETUP_TEST_MISSING" == apple ]]; then exit 1; fi
    echo /mock/SDK ;;
  node)
    if [[ "$SETUP_TEST_MISSING" == node && ! -f "$SETUP_TEST_ROOT/node-installed" ]]; then exit 127; fi
    if [[ "$1" == --version ]]; then printf v; fi
    echo "$SETUP_TEST_NODE" ;;
  npm)
    if [[ "$1" == --version ]]; then echo 11.0.0
    elif [[ "$1" == ci && "$SETUP_TEST_FAIL" == npm ]]; then exit 9; fi ;;
  cargo|rustc)
    if [[ "$SETUP_TEST_MISSING" == rust && ! -f "$SETUP_TEST_ROOT/rust-installed" ]]; then exit 127; fi
    if [[ "$1" == --version ]]; then echo "$name 1.98.1"; fi
    if [[ "$1" == -vV ]]; then echo 'host: aarch64-apple-darwin'; fi
    if [[ "$1" == fetch && "$SETUP_TEST_FAIL" == cargo ]]; then exit 9; fi ;;
  brew)
    if [[ "$1" == --prefix ]]; then echo "$SETUP_TEST_ROOT/brew-node"
    elif [[ "$1 $2" == 'install node@24' ]]; then touch "$SETUP_TEST_ROOT/node-installed"; fi ;;
  rustup) touch "$SETUP_TEST_ROOT/rust-installed" ;;
  curl)
    if [[ "$SETUP_TEST_CURL_ALLOW" != yes ]]; then echo 'Unexpected network request' >&2; exit 99; fi
    for destination in "$@"; do :; done
    printf '%s\\n' '#!/bin/sh' 'touch "$SETUP_TEST_ROOT/rust-installed"' > "$destination" ;;
esac
`

function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'leetjournal setup test '))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const project = join(root, 'project with spaces')
  const bin = join(root, 'bin')
  mkdirSync(join(project, 'src-tauri'), { recursive: true })
  mkdirSync(bin)
  mkdirSync(join(root, 'brew-node', 'bin'), { recursive: true })
  copyFileSync(new URL('../setup.sh', import.meta.url), join(project, 'setup.sh'))
  writeFileSync(join(project, 'package-lock.json'), '{}')
  writeFileSync(join(project, 'src-tauri', 'Cargo.lock'), '# fixture')
  writeFileSync(join(root, 'calls'), '')
  for (const name of ['uname', 'xcode-select', 'xcrun', 'node', 'npm', 'cargo', 'rustc', 'brew', 'rustup', 'curl']) {
    if (name === 'rustup' && options.SETUP_TEST_NO_RUSTUP) continue
    writeFileSync(join(bin, name), stub, { mode: 0o755 })
  }
  for (const name of ['node', 'npm']) writeFileSync(join(root, 'brew-node', 'bin', name), stub, { mode: 0o755 })
  const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, TMPDIR: root, CARGO_HOME: join(root, 'cargo'),
    SETUP_TEST_ROOT: root, SETUP_TEST_OS: 'Darwin', SETUP_TEST_NODE: '24.0.0', SETUP_TEST_MISSING: '', SETUP_TEST_FAIL: '', ...options }
  return {
    run: (...args) => spawnSync('/bin/bash', [join(project, 'setup.sh'), ...args], { cwd: root, env, encoding: 'utf8', timeout: 10000 }),
    calls: () => readFileSync(join(root, 'calls'), 'utf8'),
    hasInstaller: () => readdirSync(root).some(name => name.startsWith('leetjournal-setup.')),
  }
}

test('setup works outside the repo cwd and with spaces; downloads are locked', t => {
  const f = fixture(t), result = f.run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(f.calls(), /npm ci\n/)
  assert.match(f.calls(), /cargo fetch --locked --target aarch64-apple-darwin --manifest-path src-tauri\/Cargo.toml/)
  assert.doesNotMatch(f.calls(), /npm run desktop|brew install|rustup |curl /)
})
test('doctor never downloads, installs, or launches', t => {
  const f = fixture(t), result = f.run('--check')
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(f.calls(), /npm ci|cargo fetch|install|rustup |curl |npm run/)
})
for (const missing of ['apple', 'node', 'rust']) {
  test(`missing ${missing} gets actionable instructions without installing anything`, t => {
    const f = fixture(t, { SETUP_TEST_MISSING: missing }), result = f.run()
    assert.equal(result.status, 1)
    assert.match(result.stderr, /--install-tools/)
    assert.doesNotMatch(f.calls(), /npm ci|cargo fetch|brew install|rustup |curl |xcode-select --install/)
  })
}
for (const version of ['20.19.0', '22.17.0', '23.0.0']) {
  test(`unsupported Node ${version} fails before npm ci`, t => {
    const f = fixture(t, { SETUP_TEST_NODE: version }), result = f.run()
    assert.equal(result.status, 1)
    assert.doesNotMatch(f.calls(), /npm ci/)
  })
}
test('Node 22.18 is supported and --run launches only after successful setup', t => {
  const f = fixture(t, { SETUP_TEST_NODE: '22.18.0' }), result = f.run('--run')
  assert.equal(result.status, 0, result.stderr)
  assert.ok(f.calls().indexOf('cargo fetch') < f.calls().indexOf('npm run desktop'))
})
test('opt-in Node install uses existing Homebrew without installing it', t => {
  const f = fixture(t, { SETUP_TEST_MISSING: 'node' }), result = f.run('--install-tools')
  assert.equal(result.status, 0, result.stderr)
  assert.match(f.calls(), /brew install node@24/)
  assert.doesNotMatch(f.calls(), /curl /)
})
test('opt-in Apple installer stops with rerun instructions', t => {
  const f = fixture(t, { SETUP_TEST_MISSING: 'apple' }), result = f.run('--install-tools')
  assert.equal(result.status, 1)
  assert.match(f.calls(), /xcode-select --install/)
  assert.match(result.stderr, /Finish the Apple installer/)
  assert.doesNotMatch(f.calls(), /npm ci/)
})
test('opt-in Rust repair uses an existing rustup without downloading another installer', t => {
  const f = fixture(t, { SETUP_TEST_MISSING: 'rust' }), result = f.run('--install-tools')
  assert.equal(result.status, 0, result.stderr)
  assert.match(f.calls(), /rustup toolchain install stable --profile default/)
  assert.doesNotMatch(f.calls(), /curl /)
})
test('fresh Rust bootstrap uses HTTPS, leaves shell profiles alone, and cleans its installer before launch', t => {
  const f = fixture(t, { SETUP_TEST_MISSING: 'rust', SETUP_TEST_NO_RUSTUP: '1', SETUP_TEST_CURL_ALLOW: 'yes' })
  const result = f.run('--install-tools', '--run')
  assert.equal(result.status, 0, result.stderr)
  assert.match(f.calls(), /curl --proto =https --tlsv1.2 .*https:\/\/sh.rustup.rs/)
  assert.match(f.calls(), /npm run desktop/)
  assert.equal(f.hasInstaller(), false)
  const source = readFileSync(new URL('../setup.sh', import.meta.url), 'utf8')
  assert.match(source, /--no-modify-path/)
})
test('failed installer download stops cleanly and removes its temporary directory', t => {
  const f = fixture(t, { SETUP_TEST_MISSING: 'rust', SETUP_TEST_NO_RUSTUP: '1' })
  assert.notEqual(f.run('--install-tools').status, 0)
  assert.equal(f.hasInstaller(), false)
  assert.doesNotMatch(f.calls(), /npm ci|cargo fetch|npm run desktop/)
})
for (const failure of ['npm', 'cargo']) {
  test(`${failure} failure does not report success or launch the app`, t => {
    const f = fixture(t, { SETUP_TEST_FAIL: failure }), result = f.run('--run')
    assert.equal(result.status, 1)
    assert.doesNotMatch(result.stdout, /Setup complete/)
    assert.doesNotMatch(f.calls(), /npm run desktop/)
  })
}
test('non-macOS and invalid flag combinations fail safely', t => {
  const f = fixture(t, { SETUP_TEST_OS: 'Linux' })
  assert.equal(f.run().status, 1)
  assert.equal(f.run('--check', '--run').status, 2)
  assert.equal(f.run('--unknown').status, 2)
  assert.equal(f.run('--help').status, 0)
  assert.doesNotMatch(f.calls(), /npm ci|cargo fetch|install/)
})
