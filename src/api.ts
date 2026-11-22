import { Channel, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { StudyState } from './study/types'
import type { OfflineProblem, OfflineSubmission } from './offline/types'
import type { OfflineBookProgress } from './offline/bookProgress'
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
  TodayPlan,
} from './domain'

export type * from './domain'

const isTauri = () => '__TAURI_INTERNALS__' in window

export interface ModelDownloadStatus {
  status: 'downloading' | 'paused' | 'completed' | 'failed' | 'already_downloaded'
  job_id: string | null
  total_size_bytes: number | null
  downloaded_bytes: number | null
}

export const api = {
  isTauri,
  leetcodeReachable: () => invoke<boolean>('leetcode_reachable'),
  offlineProblem: (problemId: string) => invoke<OfflineProblem | null>('get_offline_problem', { problemId }),
  offlineProblems: () => invoke<string[]>('list_offline_problems'),
  offlineBookStatus: () => invoke<OfflineBookProgress | null>('offline_book_status'),
  onOfflineBookProgress: (receive: (progress: OfflineBookProgress) => void) => listen<OfflineBookProgress>('offline-book-progress', event => receive(event.payload)),
  saveOfflineBook: (bookId: string) => invoke<OfflineBookProgress>('save_offline_book', { bookId }),
  pauseOfflineBook: (bookId: string) => invoke<void>('pause_offline_book', { bookId }),
  downloadOfflineProblem: (problemId: string) => invoke<OfflineProblem>('download_offline_problem', { problemId }),
  saveOfflineDraft: (problemId: string, code: string, tests: string) => invoke<void>('save_offline_draft', { problemId, code, tests }),
  recordOfflineSubmission: (problemId: string, submission: Omit<OfflineSubmission, 'id' | 'submittedAt'>) => invoke<OfflineSubmission>('record_offline_submission', { problemId, submission }),
  offlineSubmissions: (problemId: string) => invoke<OfflineSubmission[]>('list_offline_submissions', { problemId }),
  offlineAccepted: () => invoke<string[]>('list_offline_accepted'),
  localModels: () => invoke<{ key: string; label: string; isDefault: boolean }[]>('list_local_models'),
  downloadDefaultModel: () => invoke<ModelDownloadStatus>('download_default_model'),
  modelDownloadStatus: () => invoke<ModelDownloadStatus | null>('default_model_download_status'),
  dashboard: () => invoke<Dashboard>('get_dashboard'),
  garden: () => invoke<GardenState>('get_garden_state'),
  study: () => invoke<StudyState>('get_study'),
  enchantStudy: (itemId: number, slot: number, revision: number) => invoke<StudyState>('enchant_study_item', { itemId, slot, revision }),
  equipStudy: (itemId: number) => invoke<StudyState>('equip_study_item', { itemId }),
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
  settings: () => invoke<AppSettings>('get_settings'),
  saveSettings: (settings: AppSettings) => invoke<AppSettings>('save_settings', { settings }),
  focusContext: (isReview = false) => invoke<FocusContext | null>('get_focus_context', { isReview }),
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
