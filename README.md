<p align="center">
  <img src="public/branding/leetjournal-icon.png" width="104" alt="LeetJournal icon" />
</p>

<h1 align="center">LeetJournal</h1>

<p align="center">
  A calm, local-first desktop companion for consistent LeetCode practice.
</p>

<p align="center">
  <a href="https://github.com/kevin-pan-221/leetjournal/releases">Download for macOS</a>
  · <a href="#build-from-source-contributors">Build from source</a>
</p>

<p align="center">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8D8?logo=tauri&logoColor=white" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-native-000000?logo=rust&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-TypeScript-3178C6?logo=react&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/data-SQLite-003B57?logo=sqlite&logoColor=white" />
  <img alt="macOS" src="https://img.shields.io/badge/platform-macOS-111111?logo=apple&logoColor=white" />
</p>

<p align="center">
  <img src="public/garden/countryside.png" width="1100" alt="LeetJournal garden countryside" />
</p>

LeetJournal brings planning, focused problem solving, reflection, and spaced review into one native workspace. Work on LeetCode inside the app, keep notes beside the editor, and grow a lightly animated garden as your practice compounds.

> [!NOTE]
> LeetJournal is currently developed and tested on macOS. The Tauri foundation is portable, but Windows and Linux builds have not yet been validated.

## Why LeetJournal?

- **Stay in one workspace.** LeetCode opens in a persistent embedded browser, including your signed-in session and editor state.
- **Know what to practice.** A daily warm-up and main problem are selected from your curriculum and review queue.
- **Build durable recall.** Reflections feed a mastery-level spaced-review schedule rather than a fixed reminder interval.
- **Keep a real learning record.** Attempts, notes, confidence, mistakes, streaks, and reviews live in a local SQLite database.
- **Organize problems like books.** Browse NeetCode 150 and curated company-tagged collections, or create personal books and import LeetCode problem URLs in bulk.
- **Ask a private local coach.** Optional `@qwen` commands stream from LM Studio; `@big-qwen` includes the active problem title and live editor code, without replaying notebook history.
- **Make progress visible.** Solved problems and consistent practice gradually bring the garden world to life.

## Download and install

**[Download LeetJournal for macOS](https://github.com/kevin-pan-221/leetjournal/releases)**

For Apple Silicon Macs (M1 or newer): open a release, download its `.dmg` from
**Assets**, open it, and drag **LeetJournal** into **Applications**. No cloning,
Rust, Node.js, or developer tools are needed. If no release has been published
yet, there is not yet a public installer; use the source instructions below.

The public download is awaiting Apple signing setup; the old `v0.1.0` draft is
not a public installer. New releases must pass Developer ID signature and Apple
notarization checks before a release draft is created. Before publishing, each
draft must pass the download → drag to Applications → open test. macOS may
still ask you to confirm the first launch of an app downloaded from the internet.
Do not disable system-wide security protections.

Maintainers: see [the release checklist](docs/RELEASING.md) for the one-time
Apple setup, build verification, installation testing, and publishing steps.

LM Studio is **optional**. Planning, focus, notes, journal, reviews, and the
garden work without it. LeetCode itself needs an internet connection.

## Build from source (contributors)

### Clone, set up, run

```bash
git clone https://github.com/kevin-pan-221/leetjournal.git
cd leetjournal
./setup.sh --run
```

The setup command checks your tools, installs the locked project dependencies,
and launches the desktop app. The first Rust build takes several minutes;
subsequent launches are faster. Keep the terminal open and press **Ctrl+C** to
stop development. On later launches, use `npm run desktop`.

**Missing tools?** The script lists exactly what you need. To let it install
missing tools, explicitly opt in:

```bash
./setup.sh --install-tools --run
```

This uses an existing Homebrew installation for Node 24 and official rustup for
stable Rust. If Apple build tools are missing, it opens Apple's installer and
asks you to finish it before rerunning setup. Without Homebrew, install Node
from the [official download page](https://nodejs.org/en/download) first.
The script does not install Homebrew, run sudo, edit your shell profile, start
LM Studio/Spotify, download AI models, or touch your journal data.

Supported source environment: macOS, **Node 24 recommended** (Node 22.x from
22.18 also supported; `.nvmrc` selects 24), stable Rust, and Xcode Command Line Tools.
See [Tauri's macOS prerequisites](https://v2.tauri.app/start/prerequisites/#macos)
for manual installation. Building from source needs these tools; installing a
published `.dmg` does not.

### Setup and troubleshooting

```bash
./setup.sh          # Install project dependencies without opening the app
./setup.sh --check  # Read-only prerequisite diagnosis; no downloads
```

Already have Node? `npm run setup` and `npm run doctor` are equivalent shortcuts.
Setup can be rerun after pulling updates or after a failed download. It uses
`npm ci` (recreates `node_modules`) and `cargo fetch --locked` for your Mac's
native architecture, avoiding unnecessary cross-platform downloads. It does not
regenerate lockfiles. If Homebrew/Rust tools aren't on your terminal's PATH,
`./setup.sh --run` can discover their standard installation paths for that run.

- **Apple tool or license error:** finish `xcode-select --install`, or open Xcode
  to review its license, then rerun setup.
- **Dependency download failed:** check your connection and the error printed
  above the setup message, then rerun. No clean/reset is needed.
- **Rust too old:** update your installed stable toolchain with `rustup update stable`.
- **App doesn't launch:** use `npm run desktop`, not `npm run dev` (frontend only).
- **Optional AI setup:** see the LM Studio section below; it is not a prerequisite.

### Build a macOS app

```bash
npm run tauri -- build --bundles app
open src-tauri/target/release/bundle/macos/LeetJournal.app
```

The finished bundle is written to:

```text
src-tauri/target/release/bundle/macos/LeetJournal.app
```

## Optional: local Qwen through LM Studio

LeetJournal's notes work without AI. To enable the local Qwen commands:

1. Install [LM Studio’s headless llmster service and CLI](https://lmstudio.ai/docs/developer/core/headless). The desktop window is not required.
2. Open **Settings → Local AI**. **Qwen 3.5 4B** is the default; use **Download default** if you don't have it yet. Or refresh the model list, choose another downloaded language model, and save settings.
3. No manual server startup is needed: the first `@qwen` request starts the installed headless service on localhost port `1234`.
4. Open a LeetJournal focus session and enter one of these commands on the last line of Notes:

```text
@qwen explain when a heap is useful
@big-qwen check my approach without revealing the solution
```

Press <kbd>Enter</kbd> to stream the response into the notebook. Use <kbd>Shift</kbd> + <kbd>Enter</kbd> for a normal line break.

| Command | Context sent to the local model |
| --- | --- |
| `@qwen` | Only the text after the command |
| `@big-qwen` | Problem title, current request, and live LeetCode editor code (no notebook history) |

LeetJournal uses Qwen 3.5 4B by default and supports choosing other downloaded language models. It loads the selected model on the first request, keeps it available for quick follow-ups, and unloads after 60 seconds of inactivity following a response. Leaving or finishing focus, or quitting LeetJournal normally, starts releasing it. No model is loaded at app startup. Reasoning is disabled where the selected model supports it.

Notes show **Preparing Qwen…** during the first request, then **Responding** as text arrives. Use **Stop** to keep a partial answer, or **Clear response** to remove the latest answer. Output follows along as it streams; scroll upward to read without being pulled back down. If you stop or leave during model loading, LeetJournal waits for the load to settle before cancelling inference and, when leaving, releasing the model.

### Can I close the LM Studio window?

Yes. **Headless is the default:** when the local server is stopped, the first
`@qwen` or `@big-qwen` request starts the installed llmster daemon and local
server, then loads Qwen and answers. LeetJournal never opens the desktop GUI.
An already-running server is reused. No service or model starts at app launch.

One-time setup: install the official **llmster** service and its `lms` CLI using
[LM Studio's headless setup guide](https://lmstudio.ai/docs/developer/core/headless).
The CLI must be available at `~/.lmstudio/bin/lms` on macOS. LeetJournal does not
silently install software; model downloads start only when you click **Download default**. Missing installations and startup
failures are shown in Notes; fix the setup and resubmit your command.

For troubleshooting, the equivalent commands are:

```bash
lms daemon up
lms server start --port 1234 --bind 127.0.0.1
```

Download Qwen 3.5 4B into that service's model library first. Keep the server
local-only; LeetJournal connects to `127.0.0.1:1234`. It will load the model on
demand and release it after use; it does not shut down the shared LM Studio
service. A running service and a model loaded in memory are separate things.

Alternatively, LM Studio's **run server on login** setting supports background
operation after closing its desktop UI. See the guide above for the behavior of
your installed version. Neither option requires keeping a model loaded.

## Optional: Spotify remote (macOS)

The focus sidebar can control Spotify playback without embedding another browser
or audio engine. Music continues independently when you pause or finish a session.
The compact widget shows the current song with seeking and playback controls.
Spotify preferences remain in the main Settings page; Escape still offers to leave focus.

Setup in **Settings → Spotify**:

1. Install the Spotify desktop app and sign in there.
2. Choose **Enable Spotify** in LeetJournal (also available from the focus sidebar).
3. Allow LeetJournal to control Spotify when macOS asks.
4. Choose music in Spotify; LeetJournal shows the song, artist, artwork and playback controls.

No Client ID, developer account, browser authorization or stored Spotify tokens.
LeetJournal uses Spotify's local macOS scripting interface. Playlist browsing and
device switching stay in Spotify. Account-specific playback restrictions still apply.
If access is denied, allow **LeetJournal → Spotify** under **System Settings →
Privacy & Security → Automation**, then retry. Test permission prompts from the
packaged `.app`; a development terminal may be identified differently by macOS.

Only an enabled/disabled preference is stored locally. Disabling the integration
stops updates without stopping music; revoke macOS Automation permission separately
if desired. Ending a focus session or quitting never sends a playback command.
The widget keeps artwork, song/artist, playing/paused state and a seekable progress
bar visible. Adjust volume in Spotify. While the player and app document
are visible, Spotify's desktop playback-change notifications trigger a fresh read.
Two-second checks, returning to the app, and post-control refreshes provide a fallback.
Changes arriving during a read are checked again, rather than dropped. Errors use
slower retries and are shown explicitly instead of letting the progress clock drift.
Closing Spotify does not relaunch it in the background; reopen it yourself when ready.
The idle widget has no launch prompt. Music metadata is never sent to Qwen.

## Everyday workflow

1. Pick the warm-up or main problem from **Today's Plan**.
2. Start or resume the focus session; only one attempt stays active at a time.
3. Solve inside the embedded LeetCode workspace and capture notes alongside it.
4. Press <kbd>Esc</kbd> to pause and leave safely, or choose **Finish & reflect** when done.
5. Record the outcome, confidence, and mistakes. LeetJournal schedules the next review and updates garden progress.
6. Revisit completed work in **Journal** and due problems in **Reviews**.

## Curated problem sources

The built-in company books use the frequency-ordered “All” snapshots from [liquidslr/leetcode-company-wise-problems](https://github.com/liquidslr/leetcode-company-wise-problems), captured from commit `03850eb` (dataset dated June 20, 2025). Company tags are historical preparation signals, not guarantees about current interview loops.

## Local data and privacy

LeetJournal does not require a LeetJournal account, cloud database, or API key. Practice data is stored locally at:

```text
~/Library/Application Support/com.leetjournal.app/leetjournal.sqlite3
```

The embedded LeetCode webview uses a persistent macOS web-data store so your LeetCode login can survive app restarts. Network access is needed for LeetCode itself. Qwen prompts are sent only to LM Studio at `127.0.0.1:1234`.

Back up the SQLite file before resetting or moving application data. The `-wal` and `-shm` companion files may be present while LeetJournal is running.

## Development

Maintainers: see [Releasing LeetJournal](docs/RELEASING.md) for automated DMG
builds, draft releases, and signing setup.

The [browser surface guide](docs/BROWSER_SURFACE.md) explains native framing and
includes an isolated window/fullscreen regression test.

```bash
# Frontend type-check
npm run check

# TypeScript, Rust formatting, Clippy, and Rust tests
npm run check:all

# Production frontend build
npm run build

# Rust tests only
npm test
```

| Script | Purpose |
| --- | --- |
| `./setup.sh --run` | Check prerequisites, install dependencies, and start the app |
| `npm run doctor` | Check prerequisites without installing anything |
| `npm run desktop` | Start Vite and the native Tauri development app |
| `npm run dev` | Start only the Vite frontend |
| `npm run check` | Run the strict TypeScript build check |
| `npm run check:all` | Run the complete project quality gate |
| `npm test` | Run the Rust test suite |
| `npm run test:unit` | Run JavaScript/TypeScript and setup-script regression tests |
| `npm run build` | Build production frontend assets |

## Architecture

```text
src/
├── app/             navigation and page-level application types
├── components/      reusable presentation and dialogs
├── hooks/           app data, notebook persistence/inference, and keyboard behavior
├── pages/           Today, Focus, Library, Journal, Reviews, and Settings
├── utils/           dates, errors, and Qwen command/prompt helpers
├── api.ts           the single frontend ↔ Tauri IPC boundary
└── domain.ts        shared frontend domain contracts

src-tauri/src/
├── commands.rs      validated SQLite-backed application operations
├── qwen/            LM Studio lifecycle, inference, and stream decoding
├── browser_surface.rs native browser framing and clipping
├── workspace.rs     LeetCode editor access and shortcut commands
├── db.rs            SQLite schema, migrations, and curriculum seeding
├── models.rs        serialized native domain models
├── error.rs         typed command errors
└── lib.rs           Tauri setup and native macOS integration
```

Rust is authoritative for problem selection, active-attempt recovery, duration accounting, review scheduling, daily activity, streaks, and XP. Completing an attempt is validated and committed once in a SQLite transaction, so retries cannot duplicate progress.

## Curriculum and content

The complete NeetCode 150 index is bundled locally with its canonical category order, difficulty, LeetCode URL, and optional NeetCode lesson URL. LeetJournal does not copy problem descriptions, editorials, or solutions. LeetCode and NeetCode are trademarks of their respective owners; this project is not affiliated with either service.

## Contributing

Issues and focused pull requests are welcome. Before opening a pull request:

```bash
npm ci
npm run check:all
npm run build
```

Please keep data migrations backward-compatible, preserve independent focus/review attempts with only one running timer, and include tests for changes to scheduling, persistence, or curriculum data.
