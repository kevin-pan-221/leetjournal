// Browser-only preview of the real FocusPage with the desktop backend stubbed (no database, no IPC).
// Open /tests/focus-preview.html?slug=two-sum (or alien-dictionary for a Premium problem).
const slugParam = new URLSearchParams(location.search).get('slug') || 'two-sum'
const stubs: Record<string, unknown> = { get_offline_problem: { problemId: slugParam, savedAt: new Date().toISOString(), code: 'class Solution:\n    def isAnagram(self, s: str, t: str) -> bool:\n        return sorted(s) == sorted(t)\n', tests: '', snapshot: { title: 'Valid Anagram', content: '<p>Given two strings <code>s</code> and <code>t</code>, return <code>true</code> if <code>t</code> is an anagram of <code>s</code>, and <code>false</code> otherwise.</p>', exampleTestcases: '', metaData: '{}', codeSnippets: [] } }, list_offline_submissions: [], leetcode_reachable: true }
;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
  invoke: async (cmd: string) => stubs[cmd] ?? null,
  transformCallback: () => 0,
  unregisterCallback: () => {},
  metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
}
const [{ default: React }, { createRoot }, { FocusPage }, { SpotifyProvider }] = await Promise.all([import('react'), import('react-dom/client'), import('../src/pages/FocusPage'), import('../src/spotify/SpotifyProvider')])
await Promise.all(['spotify/spotify.css', 'styles.css', 'extras.css', 'workspace.css', 'sidebar.css', 'workflow.css'].map(f => import(`../src/${f}`)))
const slug = new URLSearchParams(location.search).get('slug') || 'two-sum'
const problem = { id: slug, title: slug, category: 'Arrays & Hashing', difficulty: 'Easy', leetcodeUrl: `https://leetcode.com/problems/${slug}/`, orderIndex: 1 }
const context = { attempt: { id: 1, problem, startedAt: new Date(Date.now() - 754000).toISOString(), pausedAt: null, pausedSeconds: 0, notes: '', isReview: false }, hints: [], targetMinutes: 45 }
const settings = { localModel: '', displayName: '', dailyFocusMinutes: 60, weeklyGoalDays: 5, focusDurationMinutes: 45, hintDelayMinutes: 10, progressiveHints: true, plantAnimations: false, theme: 'light' }
const ignore = () => {}
createRoot(document.getElementById('root')!).render(<SpotifyProvider><div className="app-shell" style={{ height: '100vh' }}><FocusPage context={context as never} settings={settings as never} onPause={ignore} onFinish={ignore} onBack={ignore} /></div></SpotifyProvider>)
