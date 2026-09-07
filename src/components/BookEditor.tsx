import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { api } from '../api'
import { errorMessage } from '../utils/errors'
import type { CreateBookInput, ProblemBook, ProblemOverview } from '../domain'

interface BookEditorProps {
  book: ProblemBook
  items: ProblemOverview[]
  onClose: () => void
  onUpdated: (book: ProblemBook) => Promise<void>
  onItemsChanged: () => Promise<void>
  onDeleted: () => Promise<void>
}

export function BookEditor({ book, items, onClose, onUpdated, onItemsChanged, onDeleted }: BookEditorProps) {
  const [details, setDetails] = useState<CreateBookInput>({
    title: book.title,
    subtitle: book.subtitle,
    description: book.description,
    accent: book.accent,
  })
  const [urls, setUrls] = useState('')
  const [category, setCategory] = useState('Custom')
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const patch = <Key extends keyof CreateBookInput>(key: Key, value: CreateBookInput[Key]) =>
    setDetails((current) => ({ ...current, [key]: value }))

  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError('')
    try { await action() } catch (actionError) {
      setError(errorMessage(actionError))
    } finally { setBusy(false) }
  }

  const saveDetails = () => run(async () => {
    await api.updateBook(book.id, details)
    await onUpdated({ ...book, ...details })
    setMessage('Collection details saved.')
  })

  const importProblems = () => run(async () => {
    const parsedUrls = urls.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean)
    const result = await api.importBookProblems(book.id, { urls: parsedUrls, category, difficulty })
    setUrls('')
    await onItemsChanged()
    setMessage(`${result.added} added${result.alreadyPresent ? ` · ${result.alreadyPresent} already in this book` : ''}.`)
  })

  const removeProblem = (problemId: string) => run(async () => {
    await api.removeBookProblem(book.id, problemId)
    await onItemsChanged()
    setMessage('Problem removed from this book. Its journal history was kept.')
  })

  const deleteBook = () => {
    if (!window.confirm(`Delete “${book.title}”? Problem history will be kept.`)) return
    void run(async () => {
      await api.deleteBook(book.id)
      await onDeleted()
    })
  }

  return (
    <div className="modal-backdrop">
      <section className="book-editor" role="dialog" aria-modal="true" aria-labelledby="book-editor-title">
        <button className="modal-close" onClick={onClose} disabled={busy} aria-label="Close collection editor"><X /></button>
        <span className="eyebrow">Personal collection</span>
        <h2 id="book-editor-title">Edit {book.title}</h2>
        {error && <p className="book-editor-error">{error}</p>}
        {message && <p className="book-editor-message">{message}</p>}

        <div className="book-editor-section">
          <h3>Book details</h3>
          <div className="book-editor-fields">
            <label>Title<input value={details.title} onChange={(event) => patch('title', event.target.value)} /></label>
            <label>Subtitle<input value={details.subtitle} onChange={(event) => patch('subtitle', event.target.value)} /></label>
            <label className="wide">About<textarea value={details.description} onChange={(event) => patch('description', event.target.value)} /></label>
          </div>
          <div className="cover-picker"><span>Cover</span>{['sage', 'clay', 'navy', 'plum'].map((accent) => <button type="button" aria-label={`${accent} cover`} className={`${accent} ${details.accent === accent ? 'selected' : ''}`} onClick={() => patch('accent', accent)} key={accent} />)}</div>
          <button className="outline book-editor-save" disabled={busy || !details.title.trim()} onClick={saveDetails}>Save details</button>
        </div>

        <div className="book-editor-section">
          <h3>Import LeetCode problems</h3>
          <p>Paste one or many LeetCode problem URLs. New problems use the topic and difficulty below; known problems retain their existing metadata.</p>
          <textarea className="book-import-urls" value={urls} onChange={(event) => setUrls(event.target.value)} placeholder={'https://leetcode.com/problems/two-sum/\nhttps://leetcode.com/problems/valid-parentheses/'} />
          <div className="book-import-options">
            <label>Topic<input value={category} onChange={(event) => setCategory(event.target.value)} /></label>
            <label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}><option>Easy</option><option>Medium</option><option>Hard</option></select></label>
            <button className="primary" disabled={busy || !urls.trim()} onClick={importProblems}>{busy ? 'Working…' : 'Import problems'}</button>
          </div>
        </div>

        <div className="book-editor-section">
          <h3>Problems in this book <small>{items.length}</small></h3>
          <div className="book-editor-items">
            {items.length ? items.map(({ problem }) => (
              <div key={problem.id}>
                <span><b>{problem.title}</b><small>{problem.category} · {problem.difficulty}</small></span>
                <button disabled={busy} onClick={() => removeProblem(problem.id)} aria-label={`Remove ${problem.title}`}><Trash2 size={14} /></button>
              </div>
            )) : <p>No problems yet. Import your first list above.</p>}
          </div>
        </div>
        <button className="book-delete" disabled={busy} onClick={deleteBook}>Delete this personal book</button>
      </section>
    </div>
  )
}
