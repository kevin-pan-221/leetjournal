<p align="center">
  <img src="public/branding/leetjournal-icon.png" width="104" alt="LeetJournal icon" />
</p>

<h1 align="center">LeetJournal</h1>

<p align="center">
  A calm, local-first desktop companion for consistent LeetCode practice.
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
- **Organize problems like books.** NeetCode 150 is included, and personal books can import LeetCode problem URLs in bulk.
- **Ask a private local coach.** Optional `@qwen` commands stream from LM Studio; `@big-qwen` can include the active problem, notes, and live editor code.
- **Make progress visible.** Solved problems and consistent practice gradually bring the garden world to life.

## Garden progression

<table>
  <tr>
    <td align="center"><img src="public/garden/open-field.png" alt="Open Field" /><br /><strong>Open Field</strong></td>
    <td align="center"><img src="public/garden/meadow.png" alt="Meadow" /><br /><strong>Meadow</strong></td>
    <td align="center"><img src="public/garden/countryside.png" alt="Countryside" /><br /><strong>Countryside</strong></td>
  </tr>
</table>

## Quick start

### Prerequisites

- macOS
- [Node.js](https://nodejs.org/) 20.19 or newer (or 22.12 or newer)
- The [stable Rust toolchain](https://www.rust-lang.org/tools/install)
- Xcode Command Line Tools: `xcode-select --install`

### Run the desktop app

```bash
git clone https://github.com/kevin-pan-221/leetjournal.git
cd leetjournal
npm ci
npm run desktop
```

The first Rust build takes longer because Cargo compiles the native dependencies. Subsequent launches are much faster.

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

1. Install [LM Studio](https://lmstudio.ai/).
2. Download and load a **Qwen 3.5 4B** quantization suitable for your Mac.
3. In LM Studio's Developer tab, start the local server on port `1234`.
4. Open a LeetJournal focus session and enter one of these commands on the last line of Notes:

```text
@qwen explain when a heap is useful
@big-qwen check my approach without revealing the solution
```

Press <kbd>Enter</kbd> to stream the response into the notebook. Use <kbd>Shift</kbd> + <kbd>Enter</kbd> for a normal line break.

| Command | Context sent to the local model |
| --- | --- |
| `@qwen` | Only the text after the command |
| `@big-qwen` | Current problem, notebook, request, and live LeetCode editor code |

LeetJournal requires a loaded model whose LM Studio identifier contains Qwen 3.5 and 4B. It does not silently fall back to another model. Inference uses the local LM Studio server with reasoning disabled by default.

## Everyday workflow

1. Pick the warm-up or main problem from **Today's Plan**.
2. Start or resume the focus session; only one attempt stays active at a time.
3. Solve inside the embedded LeetCode workspace and capture notes alongside it.
4. Press <kbd>Esc</kbd> to pause and leave safely, or choose **Finish & reflect** when done.
5. Record the outcome, confidence, and mistakes. LeetJournal schedules the next review and updates garden progress.
6. Revisit completed work in **Journal** and due problems in **Reviews**.

## Local data and privacy

LeetJournal does not require a LeetJournal account, cloud database, or API key. Practice data is stored locally at:

```text
~/Library/Application Support/com.leetjournal.app/leetjournal.sqlite3
```

The embedded LeetCode webview uses a persistent macOS web-data store so your LeetCode login can survive app restarts. Network access is needed for LeetCode itself. Qwen prompts are sent only to LM Studio at `127.0.0.1:1234`.

Back up the SQLite file before resetting or moving application data. The `-wal` and `-shm` companion files may be present while LeetJournal is running.

## Development

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
| `npm run desktop` | Start Vite and the native Tauri development app |
| `npm run dev` | Start only the Vite frontend |
| `npm run check` | Run the strict TypeScript build check |
| `npm run check:all` | Run the complete project quality gate |
| `npm test` | Run the Rust test suite |
| `npm run build` | Build production frontend assets |

## Architecture

```text
src/
├── app/             navigation and page-level application types
├── components/      reusable presentation and dialogs
├── hooks/           app data, timer, and keyboard behavior
├── pages/           Today, Focus, Library, Journal, Reviews, and Settings
├── api.ts           the single frontend ↔ Tauri IPC boundary
└── domain.ts        shared frontend domain contracts

src-tauri/src/
├── commands.rs      validated application operations
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

Please keep data migrations backward-compatible, preserve the single-active-attempt invariant, and include tests for changes to scheduling, persistence, or curriculum data.
