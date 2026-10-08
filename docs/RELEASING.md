# Shipping LeetJournal for Mac

Users download a `.dmg`, drag LeetJournal into Applications, and open it. They
do not need Git, Node, Rust, or our source setup script. AI and Spotify remain
optional, separately installed integrations. The current release target is
Apple Silicon only; do not advertise Intel, Windows, or Linux binaries.

## One-time Apple setup (account owner)

You need an enrolled Apple Developer Program account for Developer ID signing
and notarization. An App Store listing is not needed.

1. Create a **Developer ID Application** certificate in
   [Apple Certificates](https://developer.apple.com/account/resources/certificates/list),
   install it with its private key in Keychain Access, and export it as a
   password-protected `.p12`. A certificate without its private key cannot sign.
2. Add the following repository secrets under
   [Settings → Secrets and variables → Actions](https://github.com/kevin-pan-221/leetjournal/settings/secrets/actions).
   Never paste their values in an issue, chat, source file, workflow, or log.

   | Secret | Value |
   | --- | --- |
   | `APPLE_CERTIFICATE` | Base64-encoded exported `.p12`, including private key |
   | `APPLE_CERTIFICATE_PASSWORD` | Export password for that `.p12` |
   | `APPLE_SIGNING_IDENTITY` | Full `Developer ID Application: Name (TEAMID)` identity |
   | `APPLE_ID` | Apple account email used for notarization |
   | `APPLE_PASSWORD` | **App-specific password**, never the account's normal password |
   | `APPLE_TEAM_ID` | Apple Developer membership Team ID |

   To upload the exported certificate without printing it or creating a base64
   file in the repository, use the GitHub CLI from a trusted machine:

   ```bash
   openssl base64 -A -in /absolute/path/to/certificate.p12 | gh secret set APPLE_CERTIFICATE --repo kevin-pan-221/leetjournal
   ```

   Keep the export in a secure location outside the repository. Use GitHub's
   secret-entry UI for the other values. Create an
   [app-specific password](https://support.apple.com/en-us/102654) in your Apple
   account. Revoke and rotate credentials if exposed.

The workflow passes these credentials to Tauri's signing/notarization support.
It never falls back to ad-hoc signing when a credential is missing. Configuration
validation only checks presence and identity type; Apple validates the actual
certificate, account, and password during the build.

Reference: [Tauri macOS signing and notarization](https://v2.tauri.app/distribute/sign/macos/).

## Prepare a fresh release

The historical `v0.1.0` draft is an old ad-hoc build. Do not publish it as the
signed release or move its tag. Use a fresh version (for example, `0.1.1`).

1. Update the version in `package.json`, both root version fields in
   `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and
   the `leetjournal` package entry in `src-tauri/Cargo.lock`.
2. Run `npm ci`, `npm run check:all`, and `npm run build`. Commit and push.
3. Create and push an annotated tag matching the version:

   ```bash
   git tag -a v0.1.1 -m 'LeetJournal 0.1.1'
   git push origin v0.1.1
   ```

   Use the chosen new version consistently; the command above is an example,
   not permission to reuse an existing tag.
4. Watch **Build macOS release** in Actions. It builds the signed app and DMG,
   notarizes through Apple, validates the app's signature and stapled ticket,
   checks Gatekeeper acceptance and disk-image integrity, and adds SHA-256
   checksums. Only then does it create a **draft** release.

Manual workflow runs must also target a matching version tag, not `main`.
Reruns never overwrite an existing release. If draft creation succeeded but a
later artifact-upload step failed, inspect the existing draft instead of
deleting/recreating it automatically. If a credential fails, fix the secret and
rerun the failed workflow; do not bypass the signing checks.

## Test the actual download before publishing

On a separate Mac or clean macOS user account, download the draft DMG through
the browser (preserving macOS quarantine), then:

- Open it, drag the app to Applications, eject the disk image, and launch the
  installed copy. No terminal commands or security bypass should be needed.
  The normal first-open downloaded-app confirmation is expected.
- Start focus, resize and enter/leave full screen, sign in to LeetCode, use
  Escape, finish and reflect, and confirm journal/review persistence on relaunch.
- Verify the core app works with no LM Studio installed. Separately test Local
  AI onboarding and optional Spotify Automation permission from the signed app.
  Test AI with the server running and stopped, and confirm model release after
  inactivity and leaving focus.
- Test upgrading an existing installation without deleting its user data.

Do not label a release ready based only on CI: signing credentials and the
downloaded installation experience require real end-to-end verification.

## Publish

After the installation smoke test passes, add user-facing release notes and
click **Publish release** in GitHub. Confirm the public DMG is available from
the README's download link. A normal push to `main` only runs checks; it neither
creates an installer nor publishes a release. Tags create drafts, not public
releases. No automatic in-app updater is implemented yet.

GitHub's built-in workflow token handles release uploads; no personal access
token is needed for CI.
