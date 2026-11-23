// Browser-only preview of the real Library with the desktop backend stubbed (no database, no IPC).
// Shows the All LeetCode Problems book built from the bundled catalog and the shared-problem panel.
import catalog from '../src-tauri/data/leetcode_catalog.json'

const free = catalog.problems.filter(p => !p.paidOnly)
const problem = (p: (typeof free)[number]) => ({ id: p.id, title: p.title, category: p.category, difficulty: p.difficulty, leetcodeUrl: `https://leetcode.com/problems/${p.id}/`, neetcodeUrl: null, orderIndex: p.number, categoryOrder: 0 })
const books = [
  { id: 'neetcode-150', title: 'NeetCode 150', subtitle: 'The interview essentials', description: 'A structured path through 18 core patterns.', accent: 'forest', builtIn: true, problemCount: 150, practicedCount: 12, solvedCount: 9 },
  { id: 'leetcode-all', title: 'All LeetCode Problems', subtitle: 'Every free problem, in one place', description: 'Every free LeetCode problem by number. A problem keeps one history, notes and offline copy, whichever book you open it from.', accent: 'navy', builtIn: true, problemCount: free.length, practicedCount: 12, solvedCount: 9 },
  { id: 'custom-1', title: 'Weak spots', subtitle: 'Mine', description: 'Problems to redo.', accent: 'plum', builtIn: false, problemCount: 2, practicedCount: 0, solvedCount: 0 },
]
const memberships: Record<string, string[]> = { 'course-schedule-iii': ['company-microsoft', 'leetcode-all'], 'two-sum': ['neetcode-150', 'leetcode-all'] }
const stubs: Record<string, (args: Record<string, string>) => unknown> = {
  get_book_problems: ({ bookId }) => (bookId === 'leetcode-all' ? free : free.slice(0, 2)).map(p => ({ problem: problem(p), status: p.id === 'two-sum' ? 'Solved' : 'Unseen', attemptCount: p.id === 'two-sum' ? 2 : 0, lastOutcome: null, lastPracticedAt: null })),
  get_problem_books: ({ problemId }) => memberships[problemId] ?? ['leetcode-all'],
  import_book_problems: () => ({ added: 1, alreadyPresent: 0 }),
  list_offline_problems: () => ['two-sum'],
  list_offline_accepted: () => ['course-schedule-iii'],
}
;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
  invoke: async (cmd: string, args: Record<string, string>) => stubs[cmd]?.(args) ?? null,
  transformCallback: () => 0,
  unregisterCallback: () => {},
  metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
}
localStorage.setItem('leetjournal.library.v1.openBook', JSON.stringify('leetcode-all'))
const [{ default: React }, { createRoot }, { LibraryPage }] = await Promise.all([import('react'), import('react-dom/client'), import('../src/pages/LibraryPage')])
await Promise.all(['styles.css', 'extras.css', 'curriculum.css', 'library.css'].map(f => import(`../src/${f}`)))
const ignore = () => {}
createRoot(document.getElementById('root')!).render(<div className="app-shell sidebar-collapsed theme-warm-garden"><aside /><main><LibraryPage books={books as never} entries={[]} onStart={ignore} onSetToday={ignore} onReload={async () => {}} /></main></div>)
