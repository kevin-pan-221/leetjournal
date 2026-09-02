import { useState } from 'react'
import { BookOpen, ChevronRight, Pencil, Play, Search, Sprout, X } from 'lucide-react'
import { api } from '../api'
import type { JournalEntry, Problem, ProblemBook, ProblemOverview } from '../domain'
import { BookEditor } from '../components/BookEditor'
import { Card, Chip, PageHeader } from '../components/ui'

interface LibraryPageProps {
  books: ProblemBook[]
  entries: JournalEntry[]
  onStart: (problem: Problem) => void
  onSetToday: (kind: 'Warm-up' | 'Main problem', problem: Problem) => void
  onReload: () => Promise<void>
}

interface ProblemListProps {
  book: ProblemBook
  items: ProblemOverview[]
  entries: JournalEntry[]
  onStart: (problem: Problem) => void
  onSetToday: (kind: 'Warm-up' | 'Main problem', problem: Problem) => void
}

function ProblemList({ book, items, entries, onStart, onSetToday }: ProblemListProps) {
  const [query, setQuery] = useState('')
  const [difficulty, setDifficulty] = useState('All')
  const [status, setStatus] = useState('All')
  const [category, setCategory] = useState('All')
  const [selected, setSelected] = useState<ProblemOverview | null>(null)
  const categories = [...new Set(items.map((item) => item.problem.category))]
  const visible = items.filter((item) =>
    (category === 'All' || item.problem.category === category)
    && (difficulty === 'All' || item.problem.difficulty === difficulty)
    && (status === 'All' || item.status === status)
    && item.problem.title.toLowerCase().includes(query.toLowerCase()))
  const history = selected ? entries.filter((entry) => entry.problem.id === selected.problem.id) : []

  return (
    <div className="page problems-page">
      <PageHeader title={book.title} subtitle={book.description || book.subtitle || 'Browse this collection and choose what’s next.'} />
      <div className="curriculum-stats">
        <b>{items.filter((item) => item.attemptCount > 0).length}</b><span>practiced</span>
        <b>{items.filter((item) => item.status === 'Solved').length}</b><span>solved</span>
        <b>{items.filter((item) => item.status === 'Review Due').length}</b><span>due</span>
        <b>{items.length}</b><span>total</span>
      </div>
      <div className="problem-filters">
        <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${items.length} problems…`} /></label>
        <select value={category} onChange={(event) => setCategory(event.target.value)}><option>All</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
        <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>All</option><option>Easy</option><option>Medium</option><option>Hard</option></select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>Unseen</option><option>Attempted</option><option>Solved</option><option>Review Due</option></select>
      </div>
      <div className="curriculum-layout">
        <aside className="topic-list">
          <button className={category === 'All' ? 'active' : ''} onClick={() => setCategory('All')}>All topics <span>{items.length}</span></button>
          {categories.map((value) => <button className={category === value ? 'active' : ''} onClick={() => setCategory(value)} key={value}>{value}<span>{items.filter((item) => item.problem.category === value).length}</span></button>)}
        </aside>
        <Card className="problem-table">
          <div className="problem-table-head"><span>Problem</span><span>Difficulty</span><span>Status</span><span /></div>
          {visible.map((item) => <button className="problem-row" key={item.problem.id} onClick={() => setSelected(item)}><span><i>{item.problem.orderIndex}</i><span><b>{item.problem.title}</b><small>{item.problem.category}</small></span></span><Chip tone={item.problem.difficulty.toLowerCase()}>{item.problem.difficulty}</Chip><span className={`status status-${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</span><ChevronRight size={16} /></button>)}
          {!visible.length && <div className="no-results">No problems match these filters.</div>}
        </Card>
      </div>
      {selected && <div className="modal-backdrop"><div className="problem-modal"><button className="modal-close" onClick={() => setSelected(null)}><X /></button><span className="eyebrow">#{selected.problem.orderIndex} · {selected.problem.category}</span><h2>{selected.problem.title}</h2><div className="problem-meta"><Chip tone={selected.problem.difficulty.toLowerCase()}>{selected.problem.difficulty}</Chip><span className={`status status-${selected.status.toLowerCase().replace(' ', '-')}`}>{selected.status}</span><span>{selected.attemptCount} {selected.attemptCount === 1 ? 'attempt' : 'attempts'}</span></div><div className="problem-actions"><button className="primary" onClick={() => onStart(selected.problem)}><Play size={16} />Start focus</button><button onClick={() => onSetToday('Warm-up', selected.problem)}>Use as warm-up</button><button onClick={() => onSetToday('Main problem', selected.problem)}>Use as main</button><a href={selected.problem.leetcodeUrl} target="_blank" rel="noreferrer">Open LeetCode</a></div><h3>Attempt history</h3>{history.length ? history.map((entry) => <div className="history-row" key={entry.id}><span><b>{entry.outcome}</b><small>{new Date(entry.completedAt).toLocaleDateString()}</small></span><span>{Math.max(1, Math.round(entry.durationSeconds / 60))} min</span><span>Confidence {entry.confidence}/5</span></div>) : <p className="muted-copy">No attempts yet. Start this problem when you’re ready.</p>}</div></div>}
    </div>
  )
}

export function LibraryPage({ books, entries, onStart, onSetToday, onReload }: LibraryPageProps) {
  const [openBook, setOpenBook] = useState<ProblemBook | null>(null)
  const [items, setItems] = useState<ProblemOverview[]>([])
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [description, setDescription] = useState('')
  const [accent, setAccent] = useState('sage')
  const [error, setError] = useState('')

  const loadItems = async (book: ProblemBook) => setItems(await api.bookProblems(book.id))
  const open = async (book: ProblemBook) => {
    setError('')
    setOpenBook(book)
    setItems([])
    try { await loadItems(book) } catch (loadError) {
      setError(String(loadError).replace(/^Error:\s*/, ''))
    }
  }

  if (openBook) {
    return (
      <div className="book-reader-shell">
        <button className="back shelf-back" onClick={() => setOpenBook(null)}>‹ <span>Back to library</span></button>
        {!openBook.builtIn && <button className="book-edit-trigger" onClick={() => setEditing(true)}><Pencil size={14} /> Edit collection</button>}
        {error ? <div className="page empty-book"><h1>Couldn’t open this book</h1><p>{error}</p><button className="primary" onClick={() => void loadItems(openBook)}>Try again</button></div>
          : items.length ? <ProblemList book={openBook} items={items} entries={entries} onStart={onStart} onSetToday={onSetToday} />
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
    } catch (createError) { setError(String(createError).replace(/^Error:\s*/, '')) }
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
