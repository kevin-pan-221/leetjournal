import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkRelease, signingSecrets } from '../scripts/check-release.mjs'

const versions = { package: '0.1.1', lock: '0.1.1', lockPackage: '0.1.1', cargo: '0.1.1', cargoLock: '0.1.1', tauri: '0.1.1' }
const env = { ...Object.fromEntries(signingSecrets.map(name => [name, 'sensitive-value'])),
  APPLE_SIGNING_IDENTITY: 'Developer ID Application: Example (TEAM)',
  GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.1' }

test('release accepts a matching tag and complete signing configuration', () => {
  assert.doesNotThrow(() => checkRelease(env, versions))
})
for (const name of signingSecrets) {
  test(`release requires ${name} without disclosing other secrets`, () => {
    assert.throws(() => checkRelease({ ...env, [name]: ' ' }, versions), error => {
      assert.match(error.message, new RegExp(name))
      assert.ok(!error.message.includes('sensitive-value'))
      return true
    })
  })
}
test('release rejects branches, mismatched tags, and version drift', () => {
  assert.throws(() => checkRelease({ ...env, GITHUB_REF_TYPE: 'branch' }, versions))
  assert.throws(() => checkRelease({ ...env, GITHUB_REF_NAME: 'v0.1.0' }, versions))
  for (const key of Object.keys(versions)) {
    assert.throws(() => checkRelease(env, { ...versions, [key]: undefined }))
  }
})
test('release rejects ad-hoc and development identities', () => {
  for (const identity of ['-', 'Apple Development: Example (TEAM)']) {
    assert.throws(() => checkRelease({ ...env, APPLE_SIGNING_IDENTITY: identity }, versions))
  }
})
test('workflow only creates a draft after native verification and includes checksums', () => {
  const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
  const publish = workflow.indexOf('gh release create')
  for (const check of ['codesign --verify', 'stapler validate', 'spctl --assess', 'hdiutil verify']) {
    assert.ok(workflow.indexOf(check) > 0 && workflow.indexOf(check) < publish)
  }
  assert.match(workflow, /--verify-tag --draft/)
  assert.match(workflow, /SHA256SUMS.txt/)
  assert.doesNotMatch(workflow, /tagName:|APPLE_SIGNING_IDENTITY: '-'/)
})
