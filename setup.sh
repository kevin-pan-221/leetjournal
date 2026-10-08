#!/bin/bash
# macOS ships Bash 3.2; keep this entry point usable before Node is installed.
set -euo pipefail

usage() {
  printf '%s\n' 'LeetJournal source setup (macOS)' '' \
    './setup.sh                  Check tools and install project dependencies' \
    './setup.sh --run            Set up, then launch the desktop app' \
    './setup.sh --check          Diagnose prerequisites only; no downloads' \
    './setup.sh --install-tools  Also install missing tools (explicit opt-in)' '' \
    'Options --install-tools and --run can be combined.' \
    'Tool installation uses existing Homebrew for Node 24 and official rustup for Rust.' \
    'No Homebrew installation, sudo, shell-profile edits, models, or services are added.'
}

check_only=false
install_tools=false
launch=false
for argument in "$@"; do
  case "$argument" in
    --check) check_only=true ;;
    --install-tools) install_tools=true ;;
    --run) launch=true ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$argument" >&2; usage >&2; exit 2 ;;
  esac
done
if $check_only && { $install_tools || $launch; }; then
  printf '%s\n' '--check cannot be combined with installation or launch options.' >&2
  exit 2
fi

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_dir"
fail() { printf '\n%s\n' "$1" >&2; exit 1; }
[[ "$(uname -s)" == Darwin ]] || fail 'Source setup currently supports macOS only. Windows/Linux builds are not yet validated.'
[[ -f package-lock.json && -f src-tauri/Cargo.lock ]] || fail 'Missing lockfiles. Run setup from a complete LeetJournal checkout.'

brew_cmd="$(command -v brew || true)"
if [[ -z "$brew_cmd" ]]; then
  for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [[ -x "$candidate" ]]; then brew_cmd="$candidate"; break; fi
  done
fi
export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"

node_ready() {
  local version major minor patch
  version="$(node -p 'process.versions.node' 2>/dev/null)" || return 1
  IFS=. read -r major minor patch <<< "$version"
  [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]] || return 1
  (( major >= 24 || (major == 22 && minor >= 18) )) || return 1
  npm --version >/dev/null 2>&1
}
use_brew_node() {
  [[ -n "$brew_cmd" ]] || return 0
  local prefix
  prefix="$("$brew_cmd" --prefix node@24 2>/dev/null)" || return 0
  if [[ -x "$prefix/bin/node" ]]; then export PATH="$prefix/bin:$PATH"; fi
}
node_ready || use_brew_node
xcode_ready() { xcode-select -p >/dev/null 2>&1 && xcrun --find clang >/dev/null 2>&1 && xcrun --sdk macosx --show-sdk-path >/dev/null 2>&1; }
rust_ready() { rustc --version >/dev/null 2>&1 && cargo --version >/dev/null 2>&1; }

printf '\n%s\n' 'LeetJournal · source setup'
if $install_tools; then
  if ! xcode_ready; then
    printf '%s\n' 'Opening Apple’s Command Line Tools installer…'
    xcode-select --install || true
    fail 'Finish the Apple installer, then rerun this command. If Xcode asks for a license, open Xcode to review it yourself.'
  fi
  if ! node_ready; then
    [[ -n "$brew_cmd" ]] || fail 'Install Node 24 from https://nodejs.org/en/download, then rerun setup. Homebrew is optional and is not installed automatically.'
    printf '%s\n' 'Installing Node 24 with your existing Homebrew…'
    "$brew_cmd" install node@24
    use_brew_node
  fi
  if ! rust_ready; then
    printf '%s\n' 'Installing the stable Rust toolchain (rustc, Cargo, rustfmt, Clippy)…'
    if command -v rustup >/dev/null 2>&1; then
      rustup toolchain install stable --profile default
      rustup default stable
    else
      installer_dir="$(mktemp -d "${TMPDIR:-/tmp}/leetjournal-setup.XXXXXX")"
      # Remove only this script's two temporary installer artifacts.
      trap 'rm -f "$installer_dir/rustup-init.sh"; rmdir "$installer_dir" 2>/dev/null || true' EXIT
      curl --proto '=https' --tlsv1.2 --fail --show-error --location \
        https://sh.rustup.rs --output "$installer_dir/rustup-init.sh"
      sh "$installer_dir/rustup-init.sh" -y --profile default --default-toolchain stable --no-modify-path
      rm -f "$installer_dir/rustup-init.sh"
      rmdir "$installer_dir"
      trap - EXIT
    fi
  fi
fi

missing=0
if xcode_ready; then printf '  ✓ Apple build tools\n'; else
  printf '%s\n' '  ✗ Apple build tools: run xcode-select --install, finish installation, and rerun setup.'
  missing=1
fi
if node_ready; then printf '  ✓ Node %s / npm %s\n' "$(node --version)" "$(npm --version)"; else
  printf '%s\n' '  ✗ Node: install Node 24 (recommended) or 22.18+ from https://nodejs.org/en/download.'
  missing=1
fi
if rust_ready; then printf '  ✓ %s / %s\n' "$(rustc --version)" "$(cargo --version)"; else
  printf '%s\n' '  ✗ Rust: install the stable toolchain from https://rustup.rs.'
  missing=1
fi
if (( missing )); then
  fail 'No project dependencies were installed. Follow the steps above, or rerun ./setup.sh --install-tools to opt into tool installation.'
fi
if $check_only; then
  printf '\n%s\n' 'Prerequisites ready. No downloads or project changes were made.'
  exit 0
fi

printf '\n%s\n' 'Installing JavaScript dependencies from package-lock.json…'
npm ci || fail 'Dependency installation failed. Check the npm error above and your connection, then rerun ./setup.sh. Lockfiles were not regenerated.'
printf '\n%s\n' 'Downloading locked Rust dependencies (the first build can take several minutes)…'
native_target="$(rustc -vV | sed -n 's/^host: //p')"
[[ "$native_target" == *-apple-darwin ]] || fail 'Expected a native macOS Rust toolchain. Check rustup show, then select a macOS toolchain.'
cargo fetch --locked --target "$native_target" --manifest-path src-tauri/Cargo.toml || fail 'Rust dependency download failed. Check the Cargo error above and your connection, then rerun setup.'
printf '\n%s\n' 'Setup complete. LM Studio and Spotify are optional; neither was started or installed.'
if $launch; then
  printf '%s\n' 'Launching LeetJournal. Stop development with Ctrl+C in this terminal.'
  exec npm run desktop
fi
printf '%s\n' 'Next: npm run desktop' 'Or: ./setup.sh --run (also finds locally installed toolchains not on your shell PATH).'
