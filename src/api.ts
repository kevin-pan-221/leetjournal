import { Channel, invoke } from '@tauri-apps/api/core'
import type {
  AppSettings,
  Attempt,
  CreateBookInput,
  Dashboard,
  FinishAttemptInput,
  FocusContext,
  GardenState,
  ImportBookProblemsInput,
  ImportBookProblemsResult,
  JournalEntry,
  ProblemBook,
  ProblemOverview,
  Review,
  TodayPlan,
} from './domain'

export type * from './domain'

const isTauri = () => '__TAURI_INTERNALS__' in window

export const api = {
  isTauri,
  dashboard: () => invoke<Dashboard>('get_dashboard'),
  garden: () => invoke<GardenState>('get_garden_state'),
  start: (problemId: string, isReview = false) =>
    invoke<Attempt>('start_attempt', { problemId, isReview }),
  pause: (attemptId: number) => invoke<void>('toggle_pause', { attemptId }),
  pauseOnly: (attemptId: number) => invoke<void>('pause_attempt', { attemptId }),
  notes: (attemptId: number, notes: string) =>
    invoke<void>('save_attempt_notes', { attemptId, notes }),
  abandon: (attemptId: number) => invoke<void>('abandon_attempt', { attemptId }),
  finish: (input: FinishAttemptInput) => invoke<JournalEntry>('finish_attempt', { input }),
  journal: () => invoke<JournalEntry[]>('get_journal'),
  updateJournal: (input: FinishAttemptInput) => invoke<void>('update_journal_entry', { input }),
  reviews: () => invoke<Review[]>('get_review_queue'),
  settings: () => invoke<AppSettings>('get_settings'),
  saveSettings: (settings: AppSettings) => invoke<AppSettings>('save_settings', { settings }),
  focusContext: () => invoke<FocusContext | null>('get_focus_context'),
  setTodayItem: (kind: 'Warm-up' | 'Main problem', problemId: string) =>
    invoke<TodayPlan>('set_today_plan_item', { kind, problemId }),
  library: () => invoke<ProblemBook[]>('get_problem_library'),
  createBook: (input: CreateBookInput) => invoke<ProblemBook>('create_problem_book', { input }),
  updateBook: (bookId: string, input: CreateBookInput) =>
    invoke<void>('update_problem_book', { bookId, input }),
  importBookProblems: (bookId: string, input: ImportBookProblemsInput) =>
    invoke<ImportBookProblemsResult>('import_book_problems', { bookId, input }),
  removeBookProblem: (bookId: string, problemId: string) =>
    invoke<void>('remove_book_problem', { bookId, problemId }),
  deleteBook: (bookId: string) => invoke<void>('delete_problem_book', { bookId }),
  bookProblems: (bookId: string) => invoke<ProblemOverview[]>('get_book_problems', { bookId }),
  askQwen: async (prompt: string, onToken: (token: string) => void): Promise<void> => {
    const onTokenChannel = new Channel<string>()
    onTokenChannel.onmessage = onToken
    await invoke<void>('ask_qwen', { prompt, onToken: onTokenChannel })
  },
  unloadQwen: () => invoke<void>('unload_qwen'),
  stopQwen: () => invoke<void>('stop_qwen'),
  leetcodeEditorCode: (webviewLabel: string) =>
    invoke<string>('get_leetcode_editor_code', { webviewLabel }),
  setFocusShortcutEnabled: (enabled: boolean) =>
    invoke<void>('set_focus_shortcut_enabled', { enabled }),
}
