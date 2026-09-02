# LeetJournal

A calm, local desktop journal for consistent LeetCode practice. LeetJournal combines a daily NeetCode curriculum, a persistent focus timer, lightweight reflection, spaced reviews, and plant-based accountability.

The complete NeetCode 150 curriculum is bundled locally with its canonical category order, difficulty, LeetCode URL, and optional NeetCode lesson URL. No problem descriptions or solutions are copied.

## Stack

- Tauri 2 desktop shell
- React + TypeScript UI
- Rust application core
- SQLite via `rusqlite`

## Run locally

Prerequisites: Node.js 20+ and the stable Rust toolchain.

```bash
npm install
npm run desktop
```

The SQLite database is created in the operating system's application data directory on first launch. The app works without an account, API key, or network connection.

## Architecture

The application keeps presentation, orchestration, and persistence separate:

- `src/domain.ts` is the frontend domain contract.
- `src/api.ts` is the only Tauri IPC boundary.
- `src/hooks/useAppData.ts` owns application data loading and refreshes.
- `src/pages/` contains feature-level screens; reusable presentation lives in `src/components/`.
- `src-tauri/src/commands.rs` owns validated application operations.
- `src-tauri/src/db.rs` owns schema migration and curriculum seeding.

Rust is authoritative for problem selection, active-attempt recovery, duration accounting, review scheduling, daily activity, streaks, and XP. Completing an attempt is validated and committed once in a SQLite transaction, so retries cannot duplicate progress.

## Verification

```bash
npm run check:all
npm run build
```

`check:all` runs strict TypeScript checks, Rust formatting, Clippy with warnings denied, and the Rust test suite.
