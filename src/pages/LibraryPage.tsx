import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronRight, Pencil, Play, Search, Sprout, X } from 'lucide-react'
import { api } from '../api'
import { errorMessage } from '../utils/errors'
import { readBookView, saveBookView, readOpenBook, saveOpenBook } from '../utils/libraryView'
import type { JournalEntry, Problem, ProblemBook, ProblemOverview } from '../domain'
import { BookEditor } from '../components/BookEditor'
import { Card, Chip, PageHeader } from '../components/ui'
import { SaveOfflineButton } from '../offline/SaveOfflineButton'
import { SaveBookOffline } from '../offline/SaveBookOffline'
import '../offline/offline.css'

interface LibraryPageProps {
  books: ProblemBook[]
  entries: JournalEntry[]
  onStart: (problem: Problem) => void
  onSetToday: (kind: 'Warm-up' | 'Main problem', problem: Problem) => void
  onReload: () => Promise<void>
}

interface ProblemListProps {
  book: ProblemBook
  books: ProblemBook[]
  items: ProblemOverview[]
  entries: JournalEntry[]
  onStart: (problem: Problem) => void
  onSetToday: (kind: 'Warm-up' | 'Main problem', problem: Problem) => void
}

/** Where a problem appears. It is one shared problem, so adding it to a book copies nothing. */
function ProblemShelves({ problem, books, current }: { problem: Problem; books: ProblemBook[]; current: string }) {
  const [ids, setIds] = useState<string[] | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => { let alive = true; void api.problemBooks(problem.id).then(next => { if (alive) setIds(next) }).catch(() => {}); return () => { alive = false } }, [problem.id])
  if (!ids) return null
  const others = books.filter(b => ids.includes(b.id) && b.id !== current)
  const personal = books.filter(b => !b.builtIn && !ids.includes(b.id))
  const add = async (bookId: string) => {
    try {
      await api.importBookProblems(bookId, { urls: [problem.leetcodeUrl], category: problem.category, difficulty: problem.difficulty as 'Easy' | 'Medium' | 'Hard' })
      setIds(current => [...(current ?? []), bookId])
      setMessage(`Added to ${books.find(b => b.id === bookId)?.title}`)
    } catch (error) { setMessage(errorMessage(error)) }
  }
  return <div className="problem-shelves">
    <span>{others.length ? <>Also in {others.map(b => b.title).join(', ')}</> : 'Only in this book'}</span>
    {personal.length > 0 && <select aria-label="Add to a personal book" value="" onChange={event => { if (event.target.value) void add(event.target.value) }}><option value="">Add to a book…</option>{personal.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select>}
    {message && <small role="status">{message}</small>}
  </div>
}

function ProblemList({ book, books, items, entries, onStart, onSetToday }: ProblemListProps) {
  const [view, setView] = useState(() => readBookView(book.id))
  const { query, difficulty, status } = view
  const category = view.category === 'All' || items.some((item) => item.problem.category === view.category) ? view.category : 'All'
  const setQuery = (query: string) => setView((current) => ({ ...current, query }))
  const setDifficulty = (difficulty: string) => setView((current) => ({ ...current, difficulty }))
  const setStatus = (status: string) => setView((current) => ({ ...current, status }))
  const setCategory = (category: string) => setView((current) => ({ ...current, category }))

  useEffect(() => saveBookView(book.id, { ...view, category }), [book.id, view, category])
  const [selected, setSelected] = useState<ProblemOverview | null>(null)
  const [visibleCount, setVisibleCount] = useState(100)
  const [offlineIds, setOfflineIds] = useState<string[]>([])
  const onOfflineSaved = useCallback((ids: string[]) => setOfflineIds(current => [...new Set([...current, ...ids])]), [])
  useEffect(() => { let alive = true; void api.offlineProblems().then(ids => { if (alive) onOfflineSaved(ids) }).catch(() => {}); return () => { alive = false } }, [onOfflineSaved])
  const [acceptedIds, setAcceptedIds] = useState<string[]>([])
  useEffect(() => { let alive = true; void api.offlineAccepted().then(ids => { if (alive) setAcceptedIds(ids) }).catch(() => {}); return () => { alive = false } }, [])
  const categories = [...new Set(items.map((item) => item.problem.category))]
  const visible = items.filter((item) =>
    (category === 'All' || item.problem.category === category)
    && (difficulty === 'All' || item.problem.difficulty === difficulty)
    && (status === 'All' || (status === 'Saved offline' ? offlineIds.includes(item.problem.id) : status === 'Accepted offline' ? acceptedIds.includes(item.problem.id) : item.status === status))
    && item.problem.title.toLowerCase().includes(query.toLowerCase()))
  const rendered = visible.slice(0, visibleCount)
  const history = selected ? entries.filter((entry) => entry.problem.id === selected.problem.id) : []

  useEffect(() => setVisibleCount(100), [book.id, query, difficulty, status, category])

  return (
    <div className="page problems-page">
      <PageHeader title={book.title} subtitle={book.description || book.subtitle || 'Browse this collection and choose what’s next.'} />
      <div className="curriculum-stats">
        <b>{items.filter((item) => item.attemptCount > 0).length}</b><span>practiced</span>
        <b>{items.filter((item) => item.status === 'Solved').length}</b><span>solved</span>
        <b>{items.length}</b><span>total</span>
      </div>
      <SaveBookOffline bookId={book.id} problemIds={items.map(item => item.problem.id)} savedIds={offlineIds} onSaved={onOfflineSaved} />
      <div className="problem-filters">
        <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${items.length} problems…`} /></label>
        <select value={category} onChange={(event) => setCategory(event.target.value)}><option>All</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>All</option><option>Easy</option><option>Medium</option><option>Hard</option></select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>Unseen</option><option>Attempted</option><option>Solved</option><option>Saved offline</option><option>Accepted offline</option></select>
      </div>
      <div className="curriculum-layout">
        <aside className="topic-list">
          <button className={category === 'All' ? 'active' : ''} onClick={() => setCategory('All')}>All topics <span>{items.length}</span></button>
          {categories.map((value) => <button className={category === value ? 'active' : ''} onClick={() => setCategory(value)} key={value}>{value}<span>{items.filter((item) => item.problem.category === value).length}</span></button>)}
        </aside>
        <Card className="problem-table">
          <div className="problem-table-head"><span>Problem</span><span>Difficulty</span><span>Status</span><span /></div>
          {rendered.map((item) => <button className="problem-row" key={item.problem.id} onClick={() => setSelected(item)}><span><i>{item.problem.orderIndex}</i><span><b>{item.problem.title}</b><small>{item.problem.category}{acceptedIds.includes(item.problem.id) ? <em className="offline-accepted" title="Accepted by the offline judge"> · ✓ Accepted offline</em> : offlineIds.includes(item.problem.id) && ' · Saved offline'}</small></span></span><Chip tone={item.problem.difficulty.toLowerCase()}>{item.problem.difficulty}</Chip><span className={`status status-${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</span><ChevronRight size={16} /></button>)}
          {!visible.length && <div className="no-results">No problems match these filters.</div>}
          {rendered.length < visible.length && <button className="problem-load-more" onClick={() => setVisibleCount((count) => count + 100)}>Show 100 more <span>{visible.length - rendered.length} remaining</span></button>}
        </Card>
      </div>
      {selected && <div className="modal-backdrop"><div className="problem-modal"><button className="modal-close" onClick={() => setSelected(null)}><X /></button><span className="eyebrow">#{selected.problem.orderIndex} · {selected.problem.category}</span><h2>{selected.problem.title}</h2><div className="problem-meta"><Chip tone={selected.problem.difficulty.toLowerCase()}>{selected.problem.difficulty}</Chip><span className={`status status-${selected.status.toLowerCase().replace(' ', '-')}`}>{selected.status}</span><span>{selected.attemptCount} {selected.attemptCount === 1 ? 'attempt' : 'attempts'}</span></div><div className="problem-actions"><button className="primary" onClick={() => onStart(selected.problem)}><Play size={16} />Start focus</button><button onClick={() => onSetToday('Warm-up', selected.problem)}>Use as warm-up</button><button onClick={() => onSetToday('Main problem', selected.problem)}>Use as main</button><a href={selected.problem.leetcodeUrl} target="_blank" rel="noreferrer">Open LeetCode</a></div><ProblemShelves key={`books-${selected.problem.id}`} problem={selected.problem} books={books} current={book.id} /><SaveOfflineButton key={selected.problem.id} problemId={selected.problem.id} leetcodeUrl={selected.problem.leetcodeUrl} onSaved={() => setOfflineIds(ids => [...new Set([...ids, selected.problem.id])])} /><h3>Attempt history</h3>{history.length ? history.map((entry) => <div className="history-row" key={entry.id}><span><b>{entry.outcome}</b><small>{new Date(entry.completedAt).toLocaleDateString()}</small></span><span>{Math.max(1, Math.round(entry.durationSeconds / 60))} min</span><span>Confidence {entry.confidence}/5</span></div>) : <p className="muted-copy">No attempts yet. Start this problem when you’re ready.</p>}</div></div>}
    </div>
  )
}

export function LibraryPage({ books, entries, onStart, onSetToday, onReload }: LibraryPageProps) {
  const [openBook, setOpenBook] = useState<ProblemBook | null>(() => books.find((book) => book.id === readOpenBook()) ?? null)
  const [items, setItems] = useState<ProblemOverview[]>([])
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [description, setDescription] = useState('')
  const [accent, setAccent] = useState('sage')
  const [error, setError] = useState('')

  const [loadingItems, setLoadingItems] = useState(Boolean(openBook))
  const loadRequest = useRef(0)
  const loadItems = useCallback(async (book: ProblemBook) => {
    const request = ++loadRequest.current
    setLoadingItems(true)
    setError('')
    try {
      const nextItems = await api.bookProblems(book.id)
      if (request === loadRequest.current) setItems(nextItems)
    } catch (loadError) {
      if (request === loadRequest.current) setError(errorMessage(loadError))
    } finally {
      if (request === loadRequest.current) setLoadingItems(false)
    }
  }, [])

  useEffect(() => {
    saveOpenBook(openBook?.id ?? null)
    setItems([])
    if (openBook) void loadItems(openBook)
    return () => { ++loadRequest.current }
  }, [openBook, loadItems])

  const open = (book: ProblemBook) => {
    setError('')
    setLoadingItems(true)
    setOpenBook(book)
  }

  if (openBook) {
    return (
      <div className="book-reader-shell">
        <button className="back shelf-back" onClick={() => setOpenBook(null)}>‹ <span>Back to library</span></button>
        {!openBook.builtIn && <button className="book-edit-trigger" onClick={() => setEditing(true)}><Pencil size={14} /> Edit collection</button>}
        {loadingItems ? <div className="page empty-book" role="status">Loading problems…</div>
          : error ? <div className="page empty-book"><h1>Couldn’t open this book</h1><p>{error}</p><button className="primary" onClick={() => void loadItems(openBook)}>Try again</button></div>
          : items.length ? <ProblemList key={openBook.id} book={openBook} books={books} items={items} entries={entries} onStart={onStart} onSetToday={onSetToday} />
            : <div className="page empty-book"><div className={`empty-book-cover ${openBook.accent}`}><BookOpen /></div><h1>{openBook.title}</h1><p>This book is waiting for its first problem list.</p>{openBook.builtIn ? <button className="primary" onClick={() => setOpenBook(null)}>Return to library</button> : <button className="primary" onClick={() => setEditing(true)}>Import problems</button>}</div>}
        {editing && <BookEditor book={openBook} items={items} onClose={() => setEditing(false)} onUpdated={async (book) => { setOpenBook(book); await onReload() }} onItemsChanged={async () => { await loadItems(openBook); await onReload() }} onDeleted={async () => { setEditing(false); setOpenBook(null); await onReload() }} />}
      </div>
    )
  }

  const practiced = books.reduce((count, book) => count + book.practicedCount, 0)
  const total = books.reduce((count, book) => count + book.problemCount, 0)
  const create = async () => {
    try {
      const created = await api.createBook({ title, subtitle, description, accent })
      setAdding(false)
      setTitle(''); setSubtitle(''); setDescription(''); setError('')
      await onReload()
      await open(created)
      setEditing(true)
    } catch (createError) { setError(errorMessage(createError)) }
  }

  return (
    <div className="page library-page">
      <header className="library-hero"><div><span className="eyebrow">Your study library</span><h1>Problem Books</h1><p>Curated paths through the problems worth remembering.</p></div><div className="library-totals"><b>{books.length}</b><span>books</span><b>{practiced}</b><span>practiced</span><b>{total}</b><span>problems</span></div></header>
      <div className="shelf-label"><h2>My Library</h2><button onClick={() => setAdding(true)}>+ Add book</button></div>
      <div className="book-shelf">{books.map((book) => <button className="book-card" key={book.id} onClick={() => void open(book)}><div className={`book-cover ${book.accent}`}><div className="book-spine" /><Sprout /><small>{book.builtIn ? 'CURATED COLLECTION' : 'PERSONAL COLLECTION'}</small><h3>{book.title}</h3><p>{book.subtitle}</p><span>LeetJournal</span></div><div className="book-info"><h3>{book.title}</h3><p>{book.description}</p><div><span>{book.problemCount} problems</span><span>{book.practicedCount} practiced</span></div><div className="xp"><span style={{ width: `${book.problemCount ? book.practicedCount / book.problemCount * 100 : 0}%` }} /></div></div></button>)}<button className="add-book-card" onClick={() => setAdding(true)}><span>+</span><b>Add another book</b><small>Create a home for a new problem list</small></button></div>
      <div className="shelf-edge" />
      {adding && <div className="modal-backdrop"><div className="add-book-modal"><button className="modal-close" onClick={() => setAdding(false)}><X /></button><span className="eyebrow">New problem book</span><h2>Add to your library</h2>{error && <p className="book-editor-error">{error}</p>}<label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Blind 75" /></label><label>Subtitle<input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="A short description for the cover" /></label><label>About this collection<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What belongs in this book?" /></label><div className="cover-picker"><span>Cover</span>{['sage', 'clay', 'navy', 'plum'].map((value) => <button aria-label={`${value} cover`} className={`${value} ${accent === value ? 'selected' : ''}`} onClick={() => setAccent(value)} key={value} />)}</div><button className="primary" disabled={!title.trim()} onClick={() => void create()}>Create &amp; add problems</button></div></div>}
    </div>
  )
}
