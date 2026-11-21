export interface OfflineBookProgress {
  bookId: string
  bookTitle: string
  status: 'running' | 'completed' | 'paused'
  total: number
  savedIds: string[]
  current: string | null
  issues: { problemId: string; title: string; message: string }[]
  message: string | null
  revision: number
}

// Events can arrive before an older command response; never rewind the UI.
export function latestBookProgress(current: OfflineBookProgress | null, next: OfflineBookProgress | null): OfflineBookProgress | null {
  if (!next || (current && current.revision >= next.revision)) return current
  return next
}
