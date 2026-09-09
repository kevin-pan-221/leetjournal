# Releasing LeetJournal

The release workflow builds an Apple Silicon macOS DMG on GitHub. End users
do not need Rust, Node.js, Xcode, or Git. Intel Mac, Windows, and Linux releases
are not yet supported by this workflow.

## Test without publishing

After the workflow is pushed, open **Actions → Build macOS release → Run workflow**.
This runs the quality checks and builds a DMG available in the run's artifacts.
A manual branch run does not create a release. Download and extract the artifact
ZIP, then test the DMG on an Apple Silicon Mac.

## Create a release

1. Set the same version in `package.json`, `package-lock.json` (root and root
   package), `src-tauri/tauri.conf.json`, and the package version in
   `src-tauri/Cargo.toml`. Refresh `src-tauri/Cargo.lock` with Cargo.
2. Run `npm ci` and `npm run check:all`, then commit the release changes.
3. Push the commit and a matching version tag, for example:

   ```bash
   git tag -a v0.1.0 -m "LeetJournal v0.1.0"
   git push origin main
   git push origin v0.1.0
   ```

4. Wait for **Build macOS release** to finish. It creates a **draft**, not a
   public release. Do not reuse or move a published version tag.
5. Download the DMG from the draft and test installing into Applications,
   opening without developer tools, embedded LeetCode login, focus/reflection,
   journal editing, and operation without LM Studio installed.
6. Test optional Qwen with the server running and stopped. Confirm model release
   after inactivity and leaving focus. Check upgrade behavior with existing data.
7. Add release notes and publish the draft. The README download link then exposes
   the installer to users.

The workflow uses GitHub's built-in token with release-write permission; no
personal access token is needed. Checks must pass before packaging.

## Signing

Current builds use an **ad-hoc** signing identity. This is not Developer ID
signing or notarization, so Gatekeeper may prompt users. Never instruct users to
disable Gatekeeper globally.

For smoother public distribution, configure an Apple Developer ID certificate
and notarization credentials as repository secrets following
[Tauri's macOS signing guide](https://v2.tauri.app/distribute/sign/macos/), and
replace the ad-hoc identity in the workflow. Do not commit certificates,
passwords, or private keys. Verify notarization before advertising a signed release.
