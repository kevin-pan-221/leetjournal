export interface BookView {
  query: string
  difficulty: string
  status: string
  category: string
}

export const defaultBookView: BookView = {
  query: '', difficulty: 'All', status: 'All', category: 'All',
}

const prefix = 'leetjournal.library.v1.'

function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(prefix + key) ?? 'null') }
  catch { return null }
}

function write(key: string, value: unknown): void {
  // Preferences must never prevent the library from working if storage is full
  // or unavailable. The current in-memory view still works normally.
  try { localStorage.setItem(prefix + key, JSON.stringify(value)) } catch { /* optional persistence */ }
}

export function readOpenBook(): string | null {
  const value = read('openBook')
  return typeof value === 'string' ? value : null
}

export const saveOpenBook = (id: string | null): void => write('openBook', id)

export function readBookView(id: string): BookView {
  const value = read('book.' + id)
  if (!value || typeof value !== 'object') return { ...defaultBookView }
  const saved = value as Record<string, unknown>
  return {
    query: typeof saved.query === 'string' ? saved.query : '',
    category: typeof saved.category === 'string' ? saved.category : 'All',
    difficulty: ['All', 'Easy', 'Medium', 'Hard'].includes(String(saved.difficulty)) ? String(saved.difficulty) : 'All',
    status: ['All', 'Unseen', 'Attempted', 'Solved', 'Review Due'].includes(String(saved.status)) ? String(saved.status) : 'All',
  }
}

export const saveBookView = (id: string, view: BookView): void => write('book.' + id, view)
