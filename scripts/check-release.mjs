import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const signingSecrets = [
  'APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_SIGNING_IDENTITY',
  'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID',
]

export function checkRelease(env, versions) {
  const version = versions.package
  if (!version || Object.values(versions).some(value => value !== version)) {
    throw new Error('Package, lockfile, Tauri, and Cargo versions must match.')
  }
  if (env.GITHUB_REF_TYPE !== 'tag' || env.GITHUB_REF_NAME !== `v${version}`) {
    throw new Error('Run the release workflow on the tag matching the app version, not a branch.')
  }
  const missing = signingSecrets.filter(name => !env[name]?.trim())
  if (missing.length) {
    // Only names are reported: never log credentials, even on validation errors.
    throw new Error(`Missing GitHub Actions secrets: ${missing.join(', ')}. See docs/RELEASING.md.`)
  }
  if (!env.APPLE_SIGNING_IDENTITY.startsWith('Developer ID Application:')) {
    throw new Error('A Developer ID Application signing identity is required; ad-hoc releases are disabled.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const json = path => JSON.parse(readFileSync(path, 'utf8'))
  try {
    checkRelease(process.env, {
      package: json('package.json').version,
      lock: json('package-lock.json').version,
      lockPackage: json('package-lock.json').packages[''].version,
      tauri: json('src-tauri/tauri.conf.json').version,
      cargo: readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version = "([^"]+)"/m)?.[1],
      cargoLock: readFileSync('src-tauri/Cargo.lock', 'utf8').match(/\[\[package\]\]\nname = "leetjournal"\nversion = "([^"]+)"/)?.[1],
    })
    console.log('Release tag, versions, and signing configuration are present. Apple credentials are verified during the build.')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
